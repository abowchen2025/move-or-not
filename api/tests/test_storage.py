"""§5.2～§5.4：種子、稽核紀錄、原子寫入、寫入鎖、損毀檔處理。"""

import json
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import storage as storage_module
from app.days import TAIPEI
from app.records import SeasonData
from app.seasons import load_seasons_config
from app.settings import API_ROOT, SEASONS_CONFIG_PATH
from app.storage import DataFileError, SeedError, Storage
from tests.conftest import AppFactory, FakeClock, taipei, write_config

STATE = "/api/seasons/season-1/state"
NOW = datetime(2026, 10, 30, 10, 0, tzinfo=TAIPEI)


def season_file(data_dir: Path, season_id: str = "season-1") -> Path:
    return data_dir / "seasons" / f"{season_id}.json"


def read_audit(data_dir: Path) -> list[dict[str, Any]]:
    path = data_dir / "audit.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def make_storage(data_dir: Path) -> Storage:
    config = load_seasons_config(SEASONS_CONFIG_PATH)
    store = Storage(data_dir, config, SEASONS_CONFIG_PATH.parent)
    store.initialize()
    return store


# ---- §5.2 種子 ----


def test_seed_creates_season_file_with_seed_records(
    client: TestClient, clock: FakeClock, data_dir: Path
) -> None:
    """AC-07（自動化部分）：第一次啟動後有三筆種子記錄，updatedAt 原樣保留（PLAN C-10）。"""
    seed = json.loads((API_ROOT / "seed" / "season-1.seed.json").read_text(encoding="utf-8"))
    stored = json.loads(season_file(data_dir).read_text(encoding="utf-8"))
    assert stored == seed

    clock.set(taipei("2026-10-30T10:15:30"))
    body = client.get(STATE).json()
    assert [record["date"] for record in body["records"]] == [
        "2026-10-28",
        "2026-10-23",
        "2026-10-13",
    ]
    assert body["stats"] == {"proposedCount": 3, "executedCount": 0, "successRate": 0}
    assert body["lastUpdatedAt"] == "2026-10-28T18:00:00+08:00"
    # 種子寫入不是 API 寫入，不記 audit
    assert read_audit(data_dir) == []


def test_ac07_restart_does_not_overwrite_existing_data(
    make_client: AppFactory, clock: FakeClock, data_dir: Path, auth: dict[str, str]
) -> None:
    """AC-07：已有資料時重新啟動，種子不會覆蓋。"""
    client = make_client()
    clock.set(taipei("2026-10-30T10:00:00"))
    assert (
        client.delete("/api/seasons/season-1/records/2026-10-13", headers=auth).status_code == 204
    )
    put = client.put(
        "/api/seasons/season-1/records/2026-10-30",
        json={"proposed": True, "executed": False, "note": "x"},
        headers=auth,
    )
    assert put.status_code == 200
    before = season_file(data_dir).read_bytes()

    restarted = make_client()  # 模擬重新部署：重新讀設定、重新跑種子流程
    assert season_file(data_dir).read_bytes() == before
    dates = [record["date"] for record in restarted.get(STATE).json()["records"]]
    assert dates == ["2026-10-30", "2026-10-28", "2026-10-23"]


def test_seed_does_not_overwrite_even_an_empty_records_file(data_dir: Path) -> None:
    path = season_file(data_dir)
    path.parent.mkdir(parents=True)
    content = b'{"schemaVersion": 1, "seasonId": "season-1", "records": []}'
    path.write_bytes(content)
    make_storage(data_dir)
    assert path.read_bytes() == content


def test_season_without_seed_file_starts_empty(
    make_client: AppFactory, tmp_path: Path, data_dir: Path
) -> None:
    config = write_config(
        tmp_path, [{"id": "blank", "startDate": "2026-10-13", "countInclusive": False}]
    )
    client = make_client(config_path=config)
    assert json.loads(season_file(data_dir, "blank").read_text(encoding="utf-8")) == {
        "schemaVersion": 1,
        "seasonId": "blank",
        "records": [],
    }
    assert client.get("/api/seasons/blank/state").json()["records"] == []


@pytest.mark.parametrize(
    "seed",
    [
        pytest.param({"schemaVersion": 1, "seasonId": "other", "records": []}, id="season-id"),
        pytest.param({"schemaVersion": 2, "seasonId": "s", "records": []}, id="schema-version"),
        pytest.param(
            {
                "schemaVersion": 1,
                "seasonId": "s",
                "records": [
                    {
                        "date": "2026-10-13",
                        "proposed": False,
                        "executed": True,
                        "note": "",
                        "updatedAt": "2026-10-13T18:00:00+08:00",
                    }
                ],
            },
            id="executed-without-proposed",
        ),
        pytest.param(
            {
                "schemaVersion": 1,
                "seasonId": "s",
                "records": [
                    {
                        "date": "2026-10-13",
                        "proposed": True,
                        "executed": False,
                        "note": "a\nb",
                        "updatedAt": "2026-10-13T18:00:00+08:00",
                    }
                ],
            },
            id="note-with-newline",
        ),
    ],
)
def test_invalid_seed_fails_startup(tmp_path: Path, data_dir: Path, seed: dict[str, Any]) -> None:
    config_path = write_config(
        tmp_path,
        [
            {
                "id": "s",
                "startDate": "2026-10-13",
                "countInclusive": False,
                "seedFile": "seed/s.json",
            }
        ],
    )
    (config_path.parent / "seed" / "s.json").write_text(json.dumps(seed), encoding="utf-8")
    store = Storage(data_dir, load_seasons_config(config_path), config_path.parent)
    with pytest.raises(SeedError):
        store.initialize()
    assert not season_file(data_dir, "s").exists()


def test_seed_creation_never_replaces_a_file_created_concurrently(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """檢查「不存在」之後、建立之前，若檔案剛好出現（例如另一個程序），也不覆蓋。"""
    path = season_file(data_dir)
    path.parent.mkdir(parents=True)
    existing = b'{"schemaVersion": 1, "seasonId": "season-1", "records": []}'
    real_lexists = os.path.lexists

    def lexists_then_appear(target: Any) -> bool:
        result = real_lexists(target)
        if Path(target) == path and not result:
            path.write_bytes(existing)
        return result

    monkeypatch.setattr(storage_module.os.path, "lexists", lexists_then_appear)
    make_storage(data_dir)
    assert path.read_bytes() == existing
    assert list(path.parent.glob("*.tmp")) == []


# ---- §5.3 稽核紀錄 ----


def test_audit_appends_one_line_per_write(
    client: TestClient, clock: FakeClock, data_dir: Path, auth: dict[str, str]
) -> None:
    clock.set(taipei("2026-10-30T10:00:00"))
    url = "/api/seasons/season-1/records/2026-10-30"
    client.put(url, json={"proposed": True, "executed": False, "note": "a"}, headers=auth)
    clock.advance(timedelta(minutes=1))
    client.put(url, json={"proposed": True, "executed": False}, headers=auth)
    clock.advance(timedelta(minutes=1))
    client.delete(url, headers=auth)
    # 驗證失敗與讀取不記 audit
    client.put(url, json={"proposed": True, "executed": False}, headers={"Authorization": "x"})
    client.get(STATE)

    entries = read_audit(data_dir)
    assert [entry["action"] for entry in entries] == ["upsert", "upsert", "delete"]
    first, second, third = entries
    assert first["at"] == "2026-10-30T10:00:00+08:00"
    assert first["seasonId"] == "season-1"
    assert first["date"] == "2026-10-30"
    assert first["before"] is None
    assert first["after"]["note"] == "a"
    assert second["before"] == first["after"]
    assert second["after"]["note"] == "a"  # note 省略時保留原備註
    assert second["after"]["updatedAt"] == "2026-10-30T10:01:00+08:00"
    assert third["before"] == second["after"]
    assert third["after"] is None
    for entry in entries:
        assert set(entry) == {"at", "seasonId", "action", "date", "before", "after"}


def test_audit_never_contains_ip_or_passphrase(
    client: TestClient, clock: FakeClock, data_dir: Path, auth: dict[str, str], passphrase: str
) -> None:
    clock.set(taipei("2026-10-30T10:00:00"))
    client.put(
        "/api/seasons/season-1/records/2026-10-30",
        json={"proposed": True, "executed": False},
        headers={**auth, "X-Real-IP": "203.0.113.9"},
    )
    raw = (data_dir / "audit.jsonl").read_text(encoding="utf-8")
    assert "203.0.113.9" not in raw
    assert "testclient" not in raw
    assert passphrase not in raw


# ---- §5.4 原子寫入、寫入鎖、損毀檔 ----


def test_write_is_atomic_and_leaves_no_temp_files(data_dir: Path) -> None:
    store = make_storage(data_dir)
    store.upsert("season-1", date(2026, 10, 30), proposed=True, executed=False, note="", now=NOW)
    folder = season_file(data_dir).parent
    assert sorted(path.name for path in folder.iterdir()) == ["season-1.json"]
    data = SeasonData.model_validate_json(season_file(data_dir).read_bytes())
    assert [record.date for record in data.records] == [
        "2026-10-13",
        "2026-10-23",
        "2026-10-28",
        "2026-10-30",
    ]


def test_failed_write_keeps_original_file(data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """os.replace 之前失敗時，正式檔維持原樣，暫存檔被清掉。"""
    store = make_storage(data_dir)
    original = season_file(data_dir).read_bytes()

    def broken_replace(*_: Any) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(storage_module.os, "replace", broken_replace)
    with pytest.raises(OSError):
        store.upsert(
            "season-1", date(2026, 10, 30), proposed=True, executed=False, note="", now=NOW
        )
    assert season_file(data_dir).read_bytes() == original
    assert list(season_file(data_dir).parent.glob("*.tmp")) == []
    assert read_audit(data_dir) == []


def _slow_writes(monkeypatch: pytest.MonkeyPatch) -> None:
    """拉長「讀 → 改 → 寫」之間的時間，沒有鎖的話幾乎必定互相覆蓋。"""
    real_write = storage_module.write_atomic

    def slow_write(path: Path, content: bytes) -> None:
        time.sleep(0.05)
        real_write(path, content)

    monkeypatch.setattr(storage_module, "write_atomic", slow_write)


def _concurrent_upserts(store: Storage, days: list[date]) -> list[BaseException]:
    barrier = threading.Barrier(len(days))
    errors: list[BaseException] = []

    def worker(day: date) -> None:
        try:
            barrier.wait(timeout=5)
            store.upsert("season-1", day, proposed=True, executed=False, note=None, now=NOW)
        except BaseException as exc:  # 收集起來交給呼叫端判斷
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(day,)) for day in days]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return errors


def test_concurrent_writes_do_not_lose_data(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _slow_writes(monkeypatch)
    store = make_storage(data_dir)
    days = [date(2026, 10, 14) + timedelta(days=i) for i in range(8)]
    assert _concurrent_upserts(store, days) == []
    stored = {record.date for record in store.read("season-1").records}
    assert {day.isoformat() for day in days} <= stored
    assert len(stored) == 3 + len(days)
    assert len(read_audit(data_dir)) == len(days)


def test_without_the_lock_concurrent_writes_would_lose_data(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """對照組：把鎖換成不鎖，同一組併發寫入會遺失資料，證明上一個測試確實在驗證鎖。"""
    _slow_writes(monkeypatch)
    store = make_storage(data_dir)

    class NoLock:
        def __enter__(self) -> None:
            return None

        def __exit__(self, *_: object) -> None:
            return None

    store._lock = NoLock()  # type: ignore[assignment]
    days = [date(2026, 10, 14) + timedelta(days=i) for i in range(8)]
    # 沒有鎖時，Windows 的 os.replace 也可能互相衝突而失敗；不論哪種，都會少寫入資料
    _concurrent_upserts(store, days)
    stored = {record.date for record in store.read("season-1").records}
    assert len(stored) < 3 + len(days)


@pytest.mark.parametrize(
    "content",
    [
        pytest.param(b"{not json", id="malformed-json"),
        pytest.param(b"", id="empty-file"),
        pytest.param(b'{"schemaVersion": 1, "seasonId": "season-1"}', id="missing-records"),
        pytest.param(b'{"schemaVersion": 1, "seasonId": "season-9", "records": []}', id="wrong-id"),
        pytest.param(
            b'{"schemaVersion": 1, "seasonId": "season-1", "records": [{"date": "x"}]}',
            id="bad-record",
        ),
    ],
)
def test_corrupt_file_returns_500_and_is_never_overwritten(
    make_client: AppFactory,
    clock: FakeClock,
    data_dir: Path,
    auth: dict[str, str],
    caplog: pytest.LogCaptureFixture,
    content: bytes,
) -> None:
    make_client()
    path = season_file(data_dir)
    path.write_bytes(content)

    restarted = make_client()  # 重新啟動時也不得用種子覆蓋
    assert path.read_bytes() == content

    clock.set(taipei("2026-10-30T10:00:00"))
    with caplog.at_level(logging.ERROR, logger="app.storage"):
        responses = [
            restarted.get(STATE),
            restarted.get("/api/seasons"),
            restarted.put(
                "/api/seasons/season-1/records/2026-10-30",
                json={"proposed": True, "executed": False},
                headers=auth,
            ),
            restarted.delete("/api/seasons/season-1/records/2026-10-13", headers=auth),
            restarted.get("/api/seasons/season-1/export", headers=auth),
        ]
    for response in responses:
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "DATA_FILE_ERROR"
    assert path.read_bytes() == content
    assert any("season-1.json" in record.getMessage() for record in caplog.records)
    assert read_audit(data_dir) == []


def test_missing_file_after_startup_is_a_data_file_error(data_dir: Path) -> None:
    store = make_storage(data_dir)
    season_file(data_dir).unlink()
    with pytest.raises(DataFileError):
        store.read("season-1")
