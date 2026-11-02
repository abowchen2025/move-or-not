import secrets
from pathlib import Path

import pytest

from app.settings import (
    API_ROOT,
    LOCAL_DATA_DIR,
    Settings,
    StartupError,
    parse_allowed_origins,
    resolve_data_dir,
)

ABSOLUTE_A = str(Path("/volume-a").resolve())
ABSOLUTE_B = str(Path("/volume-b").resolve())


def valid_env(**overrides: str) -> dict[str, str]:
    env = {
        "ADMIN_PASSPHRASE": secrets.token_urlsafe(24),
        "ALLOWED_ORIGINS": "http://localhost:5173",
        "DATA_DIR": ABSOLUTE_A,
    }
    env.update(overrides)
    return env


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
    env = valid_env()
    settings = Settings.from_env(env)
    assert settings.data_dir == Path(ABSOLUTE_A)
    assert settings.allowed_origins == ("http://localhost:5173",)
    assert settings.seasons_config_path == API_ROOT / "seasons.config.json"
    assert settings.admin_passphrase == env["ADMIN_PASSPHRASE"]


def test_passphrase_is_not_in_repr() -> None:
    env = valid_env()
    assert env["ADMIN_PASSPHRASE"] not in repr(Settings.from_env(env))


def test_passphrase_surrounding_whitespace_is_ignored() -> None:
    value = secrets.token_urlsafe(24)
    assert Settings.from_env(valid_env(ADMIN_PASSPHRASE=f"  {value}\n")).admin_passphrase == value


@pytest.mark.parametrize(
    ("overrides", "expected_in_message"),
    [
        pytest.param({"ADMIN_PASSPHRASE": ""}, "ADMIN_PASSPHRASE", id="passphrase-missing"),
        pytest.param({"ADMIN_PASSPHRASE": "   "}, "ADMIN_PASSPHRASE", id="passphrase-blank"),
        pytest.param({"ADMIN_PASSPHRASE": "x" * 15}, "16", id="passphrase-15-chars"),
        pytest.param({"ADMIN_PASSPHRASE": "密" * 20}, "ASCII", id="passphrase-non-ascii"),
        pytest.param({"ALLOWED_ORIGINS": ""}, "ALLOWED_ORIGINS", id="origins-missing"),
        pytest.param(
            {"ALLOWED_ORIGINS": "https://a.example/move-or-not"},
            "https://a.example/move-or-not",
            id="origin-with-path",
        ),
        pytest.param(
            {"ALLOWED_ORIGINS": "https://a.example/"}, "https://a.example/", id="origin-slash"
        ),
        pytest.param({"ALLOWED_ORIGINS": "*"}, "*", id="origin-wildcard"),
        pytest.param({"ALLOWED_ORIGINS": "a.example"}, "a.example", id="origin-no-scheme"),
    ],
)
def test_invalid_env_is_rejected(overrides: dict[str, str], expected_in_message: str) -> None:
    env = valid_env(**overrides)
    with pytest.raises(StartupError) as info:
        Settings.from_env(env)
    message = str(info.value)
    assert expected_in_message in message
    passphrase = env["ADMIN_PASSPHRASE"].strip()
    if passphrase:
        assert passphrase not in message


def test_all_problems_are_reported_together() -> None:
    message = str(pytest.raises(StartupError, Settings.from_env, {}).value)
    assert "ADMIN_PASSPHRASE" in message
    assert "ALLOWED_ORIGINS" in message


def test_exactly_16_chars_is_accepted() -> None:
    value = secrets.token_hex(8)
    assert len(value) == 16
    assert Settings.from_env(valid_env(ADMIN_PASSPHRASE=value)).admin_passphrase == value
