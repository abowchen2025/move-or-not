"""環境變數與路徑設定。"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent
SEASONS_CONFIG_PATH = API_ROOT / "seasons.config.json"
LOCAL_DATA_DIR = API_ROOT / "data"

# DATA_DIR 的判斷順序（SRS §8.5）：DATA_DIR → RAILWAY_VOLUME_MOUNT_PATH → 本機 api/data
DATA_DIR_ENV_KEYS = ("DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH")


def _get(env: Mapping[str, str], key: str) -> str:
    return env.get(key, "").strip()


def resolve_data_dir(env: Mapping[str, str]) -> Path:
    for key in DATA_DIR_ENV_KEYS:
        value = _get(env, key)
        if value:
            path = Path(value)
            return path if path.is_absolute() else (API_ROOT / path).resolve()
    return LOCAL_DATA_DIR


def parse_allowed_origins(raw: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    seasons_config_path: Path
    allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        return cls(
            data_dir=resolve_data_dir(env),
            seasons_config_path=SEASONS_CONFIG_PATH,
            allowed_origins=parse_allowed_origins(_get(env, "ALLOWED_ORIGINS")),
        )
