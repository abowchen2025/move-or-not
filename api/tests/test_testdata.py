"""檢查前後端共用的測試案例表本身是否正確（演算法測試在後續階段）。"""

import json
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from tests.conftest import TESTDATA_DIR

TAIPEI = ZoneInfo("Asia/Taipei")


def load(name: str) -> list[dict[str, Any]]:
    return json.loads((TESTDATA_DIR / name).read_text(encoding="utf-8"))["cases"]


def test_days_cases_taipei_today_matches_instant() -> None:
    cases = load("days-cases.json")
    assert cases
    for case in cases:
        instant = datetime.fromisoformat(case["nowUtc"].replace("Z", "+00:00"))
        assert instant.utcoffset() == timedelta(0), case["name"]
        assert instant.astimezone(TAIPEI).date().isoformat() == case["taipeiToday"], case["name"]
        assert isinstance(case["expectedDays"], int) and case["expectedDays"] >= 0


def test_note_cases_are_consistent() -> None:
    cases = load("note-cases.json")
    assert cases
    for case in cases:
        assert case["expected"] in {"OK", "NOTE_TOO_LONG", "INVALID_REQUEST"}, case["name"]
        if case["expected"] == "OK":
            assert case["normalized"] == case["input"].strip(), case["name"]
            assert len(case["normalized"]) == case["codePoints"], case["name"]
