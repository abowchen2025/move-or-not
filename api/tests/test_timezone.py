from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def test_taipei_zone_is_available() -> None:
    # 精簡版容器可能沒有系統時區資料，必須靠 tzdata 套件（SRS §3.1）
    instant = datetime(2026, 10, 30, 16, 0, tzinfo=UTC)
    local = instant.astimezone(ZoneInfo("Asia/Taipei"))
    assert local.isoformat() == "2026-10-31T00:00:00+08:00"
