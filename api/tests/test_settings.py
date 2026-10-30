from pathlib import Path

import pytest

from app.settings import (
    API_ROOT,
    LOCAL_DATA_DIR,
    Settings,
    parse_allowed_origins,
    resolve_data_dir,
)

ABSOLUTE_A = str(Path("/volume-a").resolve())
ABSOLUTE_B = str(Path("/volume-b").resolve())


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({"DATA_DIR": ABSOLUTE_A, "RAILWAY_VOLUME_MOUNT_PATH": ABSOLUTE_B}, Path(ABSOLUTE_A)),
        ({"RAILWAY_VOLUME_MOUNT_PATH": ABSOLUTE_B}, Path(ABSOLUTE_B)),
        ({"DATA_DIR": "  ", "RAILWAY_VOLUME_MOUNT_PATH": ABSOLUTE_B}, Path(ABSOLUTE_B)),
        ({}, LOCAL_DATA_DIR),
        ({"DATA_DIR": "", "RAILWAY_VOLUME_MOUNT_PATH": ""}, LOCAL_DATA_DIR),
    ],
)
def test_data_dir_resolution_order(env: dict[str, str], expected: Path) -> None:
    assert resolve_data_dir(env) == expected


def test_relative_data_dir_is_anchored_to_api_root() -> None:
    assert resolve_data_dir({"DATA_DIR": "./data"}) == (API_ROOT / "data").resolve()


def test_local_default_is_inside_api() -> None:
    assert LOCAL_DATA_DIR == API_ROOT / "data"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ()),
        ("http://localhost:5173", ("http://localhost:5173",)),
        (
            " https://a.example , http://localhost:5173 ,",
            ("https://a.example", "http://localhost:5173"),
        ),
    ],
)
def test_parse_allowed_origins(raw: str, expected: tuple[str, ...]) -> None:
    assert parse_allowed_origins(raw) == expected


def test_settings_from_env() -> None:
    settings = Settings.from_env(
        {"DATA_DIR": ABSOLUTE_A, "ALLOWED_ORIGINS": "http://localhost:5173"}
    )
    assert settings.data_dir == Path(ABSOLUTE_A)
    assert settings.allowed_origins == ("http://localhost:5173",)
    assert settings.seasons_config_path == API_ROOT / "seasons.config.json"
