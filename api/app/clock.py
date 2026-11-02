"""可注入的時鐘：正式環境用系統時間，測試傳入固定瞬間（PLAN §4.2）。"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

# 回傳帶時區的 datetime
Clock = Callable[[], datetime]


def system_clock() -> datetime:
    return datetime.now(UTC)
