"""AC-32：設定檔加入測試用的第二季後，自動建立空資料檔、兩季都列出、兩季資料互不影響。

設定檔只在 tmp_path 建立，不改動 repo 內的 seasons.config.json。
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.settings import SEASONS_CONFIG_PATH
from tests.conftest import AppFactory, FakeClock, taipei, write_config


def two_season_config(tmp_path: Path) -> Path:
    seasons = json.loads(SEASONS_CONFIG_PATH.read_text(encoding="utf-8"))["seasons"]
    second = {"id": "season-test-2", "startDate": "2026-10-20", "countInclusive": False}
    return write_config(tmp_path, [*seasons, second])


def season_file(data_dir: Path, season_id: str) -> Path:
    return data_dir / "seasons" / f"{season_id}.json"


def test_ac32_adding_a_season_keeps_existing_data(
    make_client: AppFactory,
    clock: FakeClock,
    tmp_path: Path,
    data_dir: Path,
    auth: dict[str, str],
) -> None:
    clock.set(taipei("2026-10-30T10:00:00"))

    # 只有第一季時啟動，並寫入一筆
    first = make_client()
    put = first.put(
        "/api/seasons/season-1/records/2026-10-29",
        json={"proposed": True, "executed": False, "note": "first"},
        headers=auth,
    )
    assert put.status_code == 200
    season_1_bytes = season_file(data_dir, "season-1").read_bytes()
    assert not season_file(data_dir, "season-test-2").exists()

    # 加入第二季後重新啟動
    client: TestClient = make_client(config_path=two_season_config(tmp_path))
    assert json.loads(season_file(data_dir, "season-test-2").read_text(encoding="utf-8")) == {
        "schemaVersion": 1,
        "seasonId": "season-test-2",
        "records": [],
    }
    assert season_file(data_dir, "season-1").read_bytes() == season_1_bytes

    assert client.get("/api/seasons").json() == {
        "seasons": [
            {"id": "season-1", "startDate": "2026-10-13", "ended": False, "endedDate": None},
            {"id": "season-test-2", "startDate": "2026-10-20", "ended": False, "endedDate": None},
        ]
    }

    # 第二季的寫入不影響第一季
    assert (
        client.put(
            "/api/seasons/season-test-2/records/2026-10-29",
            json={"proposed": True, "executed": True},
            headers=auth,
        ).status_code
        == 200
    )
    assert season_file(data_dir, "season-1").read_bytes() == season_1_bytes
    state_1 = client.get("/api/seasons/season-1/state").json()
    state_2 = client.get("/api/seasons/season-test-2/state").json()
    assert state_1["ended"] is False
    assert state_1["daysElapsed"] == 17
    assert [r["date"] for r in state_1["records"]][:1] == ["2026-10-29"]
    assert state_1["records"][0]["note"] == "first"
    assert (state_2["ended"], state_2["endedDate"], state_2["daysElapsed"]) == (
        True,
        "2026-10-29",
        9,
    )
    assert [r["date"] for r in state_2["records"]] == ["2026-10-29"]

    # 第一季的刪除不影響第二季
    season_2_bytes = season_file(data_dir, "season-test-2").read_bytes()
    assert (
        client.delete("/api/seasons/season-1/records/2026-10-29", headers=auth).status_code == 204
    )
    assert season_file(data_dir, "season-test-2").read_bytes() == season_2_bytes
    assert (
        client.delete("/api/seasons/season-test-2/records/2026-10-28", headers=auth).status_code
        == 404
    )

    # 各季的寫入範圍依各自的起始日
    early = client.put(
        "/api/seasons/season-test-2/records/2026-10-19",
        json={"proposed": True, "executed": False},
        headers=auth,
    )
    assert early.status_code == 422

    audit = [
        json.loads(line)
        for line in (data_dir / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [(entry["seasonId"], entry["action"]) for entry in audit] == [
        ("season-1", "upsert"),
        ("season-test-2", "upsert"),
        ("season-1", "delete"),
    ]


def test_ac32_latest_season_is_last_in_list(make_client: AppFactory, tmp_path: Path) -> None:
    client = make_client(config_path=two_season_config(tmp_path))
    assert [s["id"] for s in client.get("/api/seasons").json()["seasons"]][-1] == "season-test-2"
