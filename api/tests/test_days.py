"""§4 的純函式：台灣日期、天數公式、完結日（共用案例表 testdata/days-cases.json）。"""

import json
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

import pytest

from app.clock import system_clock
from app.days import days_elapsed, ended_date, taipei_now, taipei_today
from tests.conftest import TESTDATA_DIR

CASES: list[dict[str, Any]] = json.loads(
    (TESTDATA_DIR / "days-cases.json").read_text(encoding="utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_shared_days_cases(case: dict[str, Any]) -> None:
    instant = datetime.fromisoformat(case["nowUtc"].replace("Z", "+00:00"))
    today = taipei_today(instant)
    assert today.isoformat() == case["taipeiToday"]
    ended = date.fromisoformat(case["endedDate"]) if case["endedDate"] else None
    days = days_elapsed(
        date.fromisoformat(case["startDate"]),
        today,
        count_inclusive=case["countInclusive"],
        ended=ended,
    )
    assert days == case["expectedDays"]


@pytest.mark.parametrize(
    "offset_hours",
    [-10, -8, -7, 0, 9, 14],
    ids=["UTC-10", "UTC-8", "UTC-7", "UTC", "UTC+9", "UTC+14"],
)
def test_taipei_today_ignores_input_timezone(offset_hours: int) -> None:
    """§4.1-1：同一個瞬間不論用哪個時區表示，台灣日期都一樣。"""
    instant = datetime(2026, 10, 30, 16, 0, tzinfo=UTC)  # 台灣 10-31 00:00:00
    shown = instant.astimezone(timezone(timedelta(hours=offset_hours)))
    assert taipei_today(shown) == date(2026, 10, 31)
    assert taipei_now(shown).isoformat() == "2026-10-31T00:00:00+08:00"


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValueError):
        taipei_now(datetime(2026, 10, 30, 12, 0))


def test_taipei_now_drops_microseconds() -> None:
    instant = datetime(2026, 10, 30, 2, 15, 30, 999_999, tzinfo=UTC)
    assert taipei_now(instant).isoformat() == "2026-10-30T10:15:30+08:00"


def test_system_clock_is_timezone_aware() -> None:
    now = system_clock()
    assert now.utcoffset() == timedelta(0)


def test_ended_date_is_earliest() -> None:
    """§4.4：多筆「執行＝是」以最早的那天為完結日。"""
    dates = [date(2026, 11, 5), date(2026, 11, 3), date(2026, 11, 4)]
    assert ended_date(dates) == date(2026, 11, 3)
    assert ended_date([]) is None


def test_days_use_calendar_days_not_elapsed_seconds() -> None:
    """§4.2：只看日期部分；起始日 23:59:59 到隔天 00:00:00 只差 1 秒也算 1 天。"""
    start = date(2026, 10, 13)
    before = taipei_today(datetime.fromisoformat("2026-10-13T23:59:59+08:00"))
    after = taipei_today(datetime.fromisoformat("2026-10-14T00:00:00+08:00"))
    assert days_elapsed(start, before, count_inclusive=False, ended=None) == 0
    assert days_elapsed(start, after, count_inclusive=False, ended=None) == 1


def test_ended_before_start_is_clamped_to_zero() -> None:
    # 起始日日後調整時，舊的完結日可能早於起始日（D-26 的情境）；天數不得為負
    start = date(2026, 10, 13)
    assert (
        days_elapsed(start, date(2026, 11, 1), count_inclusive=False, ended=date(2026, 10, 1)) == 0
    )
