"""台灣時間、天數與完結日的純函式（SRS §4、D-27）。"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from zoneinfo import ZoneInfo

TIMEZONE_NAME = "Asia/Taipei"
TAIPEI = ZoneInfo(TIMEZONE_NAME)


def taipei_now(instant: datetime) -> datetime:
    """把任意時區的瞬間換成台灣時間，秒以下捨去。"""
    if instant.tzinfo is None:
        raise ValueError("instant 必須帶時區")
    return instant.astimezone(TAIPEI).replace(microsecond=0)


def taipei_today(instant: datetime) -> date:
    return taipei_now(instant).date()


def ended_date(executed_dates: Iterable[date]) -> date | None:
    """有多筆「執行＝是」時以最早的那天為完結日（§4.4）。"""
    return min(executed_dates, default=None)


def days_elapsed(start: date, today: date, *, count_inclusive: bool, ended: date | None) -> int:
    """以日曆日相減（§4.2）；已完結時凍結在完結日（§4.4）；最小為 0（D-27）。"""
    until = ended if ended is not None else today
    if until < start:
        return 0
    return (until - start).days + (1 if count_inclusive else 0)
