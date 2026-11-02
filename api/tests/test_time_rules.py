"""SRS §4 伺服器端的時間規則：以注入的固定時鐘（時間凍結）呼叫 API 驗證。

測試名稱以條文編號開頭（例如 test_s4_2_...），方便對照 PR 中的條文 → 測試表。
"""

import os
import re
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AppFactory, FakeClock, taipei, write_config

STATE = "/api/seasons/season-1/state"


def record_url(day: str, season: str = "season-1") -> str:
    return f"/api/seasons/{season}/records/{day}"


def state_at(client: TestClient, clock: FakeClock, instant: datetime, url: str = STATE) -> dict:
    clock.set(instant)
    response = client.get(url)
    assert response.status_code == 200, response.text
    return response.json()


# ---- §4.1 時間來源 ----


@pytest.mark.parametrize(
    ("instant", "today"),
    [
        # UTC 還是前一天，台灣已經是隔天
        (datetime(2026, 10, 30, 16, 0, 0, tzinfo=UTC), "2026-10-31"),
        # UTC 與台灣同一天的最後一刻
        (datetime(2026, 10, 30, 15, 59, 59, tzinfo=UTC), "2026-10-30"),
        # 洛杉磯時間 10-30 09:00（夏令時間 UTC-7）＝台灣 10-31 00:00
        (datetime.fromisoformat("2026-10-30T09:00:00-07:00"), "2026-10-31"),
    ],
)
def test_s4_1_1_today_is_taipei_date(
    client: TestClient, clock: FakeClock, instant: datetime, today: str
) -> None:
    assert state_at(client, clock, instant)["today"] == today


@pytest.mark.skipif(not hasattr(time, "tzset"), reason="time.tzset 只在 POSIX 提供")
@pytest.mark.parametrize("host_tz", ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])
def test_s4_1_1_host_timezone_does_not_matter(
    client: TestClient, clock: FakeClock, host_tz: str
) -> None:
    original = os.environ.get("TZ")
    os.environ["TZ"] = host_tz
    time.tzset()
    try:
        body = state_at(client, clock, taipei("2026-10-31T00:00:00"))
    finally:
        if original is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = original
        time.tzset()
    assert body["today"] == "2026-10-31"
    assert body["daysElapsed"] == 18


def test_s4_1_2_state_has_server_now_with_taipei_offset(
    client: TestClient, clock: FakeClock
) -> None:
    body = state_at(client, clock, datetime(2026, 10, 30, 2, 15, 30, tzinfo=UTC))
    assert body["serverNow"] == "2026-10-30T10:15:30+08:00"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00", body["serverNow"])
    assert body["today"] == "2026-10-30"
    assert body["timezone"] == "Asia/Taipei"


def test_s4_1_3_server_now_is_the_server_instant(client: TestClient, clock: FakeClock) -> None:
    """前端以 Date.parse(serverNow) − Date.now() 算 offset：serverNow 必須精確對應伺服器時鐘。"""
    instant = datetime(2026, 10, 30, 2, 15, 30, tzinfo=UTC)
    body = state_at(client, clock, instant)
    assert datetime.fromisoformat(body["serverNow"]) == instant


def test_s4_1_4_state_is_not_cached_and_follows_server_time(
    client: TestClient, clock: FakeClock
) -> None:
    """前端定期重抓 state 校正 offset：回應不可被快取，且每次都反映當下的伺服器時間。"""
    clock.set(taipei("2026-10-30T10:00:00"))
    first = client.get(STATE)
    assert first.headers["Cache-Control"] == "no-store"
    assert client.get("/api/seasons").headers["Cache-Control"] == "no-store"
    clock.advance(timedelta(minutes=10))
    second = client.get(STATE).json()
    assert second["serverNow"] == "2026-10-30T10:10:00+08:00"


# ---- §4.2 天數公式 ----


@pytest.mark.parametrize(
    ("local", "expected"),
    [
        ("2026-10-13T00:00:00", 0),
        ("2026-10-13T23:59:59", 0),
        ("2026-10-30T23:59:59", 17),  # AC-01
        ("2026-10-31T00:00:00", 18),  # AC-01
    ],
)
def test_s4_2_formula_table_and_ac01(
    client: TestClient, clock: FakeClock, local: str, expected: int
) -> None:
    assert state_at(client, clock, taipei(local))["daysElapsed"] == expected


def test_s4_2_start_date_and_inclusive_come_from_config(
    make_client: AppFactory, clock: FakeClock, tmp_path: Path
) -> None:
    """startDate 與 countInclusive 只存在 seasons.config.json，API 依設定計算。"""
    config = write_config(
        tmp_path,
        [{"id": "inclusive", "startDate": "2026-10-13", "countInclusive": True}],
    )
    client = make_client(config_path=config)
    body = state_at(client, clock, taipei("2026-10-30T10:00:00"), "/api/seasons/inclusive/state")
    assert body["startDate"] == "2026-10-13"
    assert body["daysElapsed"] == 18


def test_s4_2_d27_future_start_date(
    make_client: AppFactory, clock: FakeClock, tmp_path: Path, auth: dict[str, str]
) -> None:
    """D-27：起始日在未來時 daysElapsed 最小為 0；可寫入的日期範圍為空，一律 422。"""
    config = write_config(
        tmp_path,
        [
            {"id": "future", "startDate": "2026-11-01", "countInclusive": False},
            {"id": "future-inclusive", "startDate": "2026-11-01", "countInclusive": True},
        ],
    )
    client = make_client(config_path=config)
    clock.set(taipei("2026-10-30T10:00:00"))
    for season in ("future", "future-inclusive"):
        body = client.get(f"/api/seasons/{season}/state").json()
        assert body["daysElapsed"] == 0
        assert body["records"] == []
        for day in ("2026-10-30", "2026-11-01", "2026-11-02"):
            response = client.put(
                record_url(day, season), json={"proposed": True, "executed": False}, headers=auth
            )
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "INVALID_DATE"
    # 到了起始日當天，就可以寫入起始日
    clock.set(taipei("2026-11-01T00:00:00"))
    response = client.put(
        record_url("2026-11-01", "future"), json={"proposed": True, "executed": False}, headers=auth
    )
    assert response.status_code == 200


# ---- §4.3 跨日 ----


def test_s4_3_midnight_rollover(client: TestClient, clock: FakeClock, auth: dict[str, str]) -> None:
    """跨過台灣 00:00：today 換日、天數 +1、todayRecord 重置為新的一天。"""
    clock.set(taipei("2026-10-30T23:59:58"))
    assert (
        client.put(
            record_url("2026-10-30"), json={"proposed": True, "executed": False}, headers=auth
        ).status_code
        == 200
    )
    before = client.get(STATE).json()
    assert before["today"] == "2026-10-30"
    assert before["daysElapsed"] == 17
    assert before["todayRecord"]["date"] == "2026-10-30"

    after = state_at(client, clock, taipei("2026-10-31T00:00:00"))
    assert after["today"] == "2026-10-31"
    assert after["daysElapsed"] == 18
    assert after["todayRecord"] is None


def test_s4_3_writable_range_moves_at_midnight(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    """AC-21：23:59:59 時「明天」是未來日期回 422；過了 00:00 就變成可寫的今天。"""
    body = {"proposed": True, "executed": False}
    clock.set(taipei("2026-10-30T23:59:59"))
    assert client.put(record_url("2026-10-30"), json=body, headers=auth).status_code == 200
    tomorrow = client.put(record_url("2026-10-31"), json=body, headers=auth)
    assert tomorrow.status_code == 422
    assert tomorrow.json()["error"]["code"] == "INVALID_DATE"
    clock.set(taipei("2026-10-31T00:00:00"))
    assert client.put(record_url("2026-10-31"), json=body, headers=auth).status_code == 200


# ---- §4.4 完結（凍結） ----


def put(client: TestClient, auth: dict[str, str], day: str, executed: bool) -> None:
    response = client.put(
        record_url(day), json={"proposed": True, "executed": executed}, headers=auth
    )
    assert response.status_code == 200, response.text


def test_s4_4_executed_today_freezes_days(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    clock.set(taipei("2026-11-03T10:00:00"))
    put(client, auth, "2026-11-03", executed=True)
    body = client.get(STATE).json()
    assert body["ended"] is True
    assert body["endedDate"] == "2026-11-03"
    assert body["daysElapsed"] == 21
    # 之後日子再過去，天數也不再增加
    later = state_at(client, clock, taipei("2026-12-25T10:00:00"))
    assert later["daysElapsed"] == 21
    assert later["endedDate"] == "2026-11-03"


def test_s4_4_ac23_backfilled_past_date_freezes_at_that_date(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    """11/5 才補記「11/3 執行＝是」，天數停在 11/3 的值（AC-23）。"""
    clock.set(taipei("2026-11-05T10:00:00"))
    assert client.get(STATE).json()["daysElapsed"] == 23
    put(client, auth, "2026-11-03", executed=True)
    body = client.get(STATE).json()
    assert (body["ended"], body["endedDate"], body["daysElapsed"]) == (True, "2026-11-03", 21)
    assert body["todayRecord"] is None


def test_s4_4_earliest_executed_date_wins(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    clock.set(taipei("2026-11-10T10:00:00"))
    put(client, auth, "2026-11-08", executed=True)
    put(client, auth, "2026-11-03", executed=True)
    put(client, auth, "2026-11-05", executed=True)
    body = client.get(STATE).json()
    assert body["endedDate"] == "2026-11-03"
    assert body["daysElapsed"] == 21
    seasons = client.get("/api/seasons").json()["seasons"]
    assert seasons[0]["ended"] is True
    assert seasons[0]["endedDate"] == "2026-11-03"


def test_s4_4_ac17_deleting_executed_record_unfreezes(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    clock.set(taipei("2026-11-05T10:00:00"))
    put(client, auth, "2026-11-03", executed=True)
    assert client.get(STATE).json()["daysElapsed"] == 21
    assert client.delete(record_url("2026-11-03"), headers=auth).status_code == 204
    body = client.get(STATE).json()
    assert (body["ended"], body["endedDate"], body["daysElapsed"]) == (False, None, 23)


def test_s4_4_changing_executed_back_to_false_unfreezes(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    clock.set(taipei("2026-11-05T10:00:00"))
    put(client, auth, "2026-11-03", executed=True)
    put(client, auth, "2026-11-03", executed=False)
    body = client.get(STATE).json()
    assert (body["ended"], body["daysElapsed"]) == (False, 23)


def test_s4_4_not_ended_by_default(client: TestClient, clock: FakeClock) -> None:
    body = state_at(client, clock, taipei("2026-10-30T10:00:00"))
    assert (body["ended"], body["endedDate"]) == (False, None)
    assert client.get("/api/seasons").json() == {
        "seasons": [
            {"id": "season-1", "startDate": "2026-10-13", "ended": False, "endedDate": None}
        ]
    }
