"""環境變數與路徑設定。必要的環境變數缺少或不合法時，啟動即失敗（D-29）。"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent
SEASONS_CONFIG_PATH = API_ROOT / "seasons.config.json"
LOCAL_DATA_DIR = API_ROOT / "data"

# DATA_DIR 的判斷順序（SRS §8.5）：DATA_DIR → RAILWAY_VOLUME_MOUNT_PATH → 本機 api/data
DATA_DIR_ENV_KEYS = ("DATA_DIR", "RAILWAY_VOLUME_MOUNT_PATH")

PASSPHRASE_ENV_KEY = "ADMIN_PASSPHRASE"
PASSPHRASE_MIN_LENGTH = 16  # NFR-S1
# 密語放在 HTTP 標頭傳送，瀏覽器的 fetch 只接受 ASCII，因此限定可見 ASCII 與空白
PASSPHRASE_RE = re.compile(r"^[\x20-\x7e]+$")

ALLOWED_ORIGINS_ENV_KEY = "ALLOWED_ORIGINS"
# origin 只有 scheme://host[:port]，不含路徑與結尾斜線（NFR-S4）
ORIGIN_RE = re.compile(r"^https?://[^/\s?#]+$")

# 來源 IP 讀取的標頭（D-24）；沒有這個標頭時改用連線 IP
CLIENT_IP_HEADER = "X-Real-IP"

# 驗證失敗的次數限制（NFR-S3、D-25）：滑動視窗內失敗達此次數後，一律回 429
AUTH_MAX_FAILURES = 5
AUTH_FAILURE_WINDOW = timedelta(minutes=10)


class StartupError(ValueError):
    """設定不合法，服務不應啟動。訊息會寫進 log，不得包含密語的值。"""


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


def passphrase_problem(passphrase: str) -> str | None:
    """回傳密語不合法的原因；訊息只描述規則，不帶出值。"""
    if not passphrase:
        return f"缺少環境變數 {PASSPHRASE_ENV_KEY}"
    if len(passphrase) < PASSPHRASE_MIN_LENGTH:
        return f"{PASSPHRASE_ENV_KEY} 至少需要 {PASSPHRASE_MIN_LENGTH} 個字元"
    if not PASSPHRASE_RE.match(passphrase):
        return f"{PASSPHRASE_ENV_KEY} 只能使用英數字、符號與空白（ASCII）"
    return None


def origins_problem(origins: tuple[str, ...]) -> str | None:
    if not origins:
        return f"缺少環境變數 {ALLOWED_ORIGINS_ENV_KEY}（多個來源用逗號分隔）"
    invalid = [origin for origin in origins if not ORIGIN_RE.match(origin)]
    if invalid:
        return (
            f"{ALLOWED_ORIGINS_ENV_KEY} 格式錯誤：{', '.join(invalid)}"
            "（只能是 https://主機名稱 或 http://主機名稱:埠號，不含路徑與結尾斜線）"
        )
    return None


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    seasons_config_path: Path
    allowed_origins: tuple[str, ...]
    admin_passphrase: str = field(repr=False)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        passphrase = _get(env, PASSPHRASE_ENV_KEY)
        origins = parse_allowed_origins(_get(env, ALLOWED_ORIGINS_ENV_KEY))
        problems = [p for p in (passphrase_problem(passphrase), origins_problem(origins)) if p]
        if problems:
            raise StartupError("；".join(problems))
        return cls(
            data_dir=resolve_data_dir(env),
            seasons_config_path=SEASONS_CONFIG_PATH,
            allowed_origins=origins,
            admin_passphrase=passphrase,
        )
