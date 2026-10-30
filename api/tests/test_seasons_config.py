import json
from pathlib import Path
from typing import Any

import pytest

from app.seasons import SeasonsConfigError, load_seasons_config
from app.settings import SEASONS_CONFIG_PATH

VALID_SEASON: dict[str, Any] = {
    "id": "season-1",
    "startDate": "2026-10-13",
    "countInclusive": False,
    "seedFile": "seed/s.json",
}


def write_config(tmp_path: Path, document: Any) -> Path:
    (tmp_path / "seed").mkdir(exist_ok=True)
    (tmp_path / "seed" / "s.json").write_text("{}", encoding="utf-8")
    path = tmp_path / "seasons.config.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def season(**overrides: Any) -> dict[str, Any]:
    """產生一筆季別設定；值為 ... 的欄位會被移除。"""
    result = {**VALID_SEASON, **overrides}
    return {k: v for k, v in result.items() if v is not ...}


def test_repo_config_is_valid() -> None:
    config = load_seasons_config(SEASONS_CONFIG_PATH)
    first = config.seasons[0]
    assert first.id == "season-1"
    assert first.start_date == "2026-10-13"
    assert first.count_inclusive is False
    assert first.seed_file == "seed/season-1.seed.json"
    assert config.latest.id == config.seasons[-1].id


def test_valid_minimal_config_without_seed_file(tmp_path: Path) -> None:
    config = load_seasons_config(write_config(tmp_path, {"seasons": [season(seedFile=...)]}))
    assert config.seasons[0].seed_file is None


def test_latest_is_last_entry(tmp_path: Path) -> None:
    document = {"seasons": [season(), season(id="season-2", seedFile=...)]}
    config = load_seasons_config(write_config(tmp_path, document))
    assert config.latest.id == "season-2"
    assert config.get("season-1") is not None
    assert config.get("missing") is None


@pytest.mark.parametrize(
    "document",
    [
        pytest.param({"seasons": []}, id="empty-list"),
        pytest.param({}, id="missing-seasons"),
        pytest.param({"seasons": {}}, id="seasons-not-list"),
        pytest.param({"seasons": [season(id="Season-1")]}, id="id-uppercase"),
        pytest.param({"seasons": [season(id="season_1")]}, id="id-underscore"),
        pytest.param({"seasons": [season(id="")]}, id="id-empty"),
        pytest.param({"seasons": [season(id=1)]}, id="id-not-string"),
        pytest.param({"seasons": [season(), season()]}, id="id-duplicate"),
        pytest.param({"seasons": [season(startDate="2026/10/13")]}, id="date-slashes"),
        pytest.param({"seasons": [season(startDate="2026-02-30")]}, id="date-impossible"),
        pytest.param({"seasons": [season(startDate="2026-10-13T00:00:00")]}, id="date-with-time"),
        pytest.param({"seasons": [season(startDate="2026-1-3")]}, id="date-not-padded"),
        pytest.param({"seasons": [season(startDate=...)]}, id="date-missing"),
        pytest.param({"seasons": [season(countInclusive="false")]}, id="inclusive-string"),
        pytest.param({"seasons": [season(countInclusive=0)]}, id="inclusive-int"),
        pytest.param({"seasons": [season(countInclusive=...)]}, id="inclusive-missing"),
        pytest.param({"seasons": [season(extra=True)]}, id="unknown-field"),
        pytest.param({"seasons": [season(seedFile="seed/none.json")]}, id="seed-not-found"),
        pytest.param({"seasons": [season(seedFile="/etc/passwd")]}, id="seed-absolute"),
        pytest.param({"seasons": [season(seedFile="../seed/s.json")]}, id="seed-parent-dir"),
        pytest.param({"seasons": [season(seedFile="")]}, id="seed-empty"),
    ],
)
def test_invalid_config_is_rejected(tmp_path: Path, document: Any) -> None:
    with pytest.raises(SeasonsConfigError):
        load_seasons_config(write_config(tmp_path, document))


def test_malformed_json_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "seasons.config.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(SeasonsConfigError):
        load_seasons_config(path)


def test_missing_file_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(SeasonsConfigError):
        load_seasons_config(tmp_path / "nope.json")
