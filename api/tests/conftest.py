import atexit
import json
import os
import secrets
import shutil
import tempfile
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

API_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = API_ROOT.parent
TESTDATA_DIR = REPO_ROOT / "testdata"

# app.main 在匯入時就依環境變數建立 app；測試期間改用隨機密語與暫存目錄，
# 不讀取開發者本機的 .env，也不在 api/data 留下檔案。
_IMPORT_DATA_DIR = tempfile.mkdtemp(prefix="api-test-import-")
atexit.register(shutil.rmtree, _IMPORT_DATA_DIR, True)
os.environ["ADMIN_PASSPHRASE"] = secrets.token_urlsafe(24)
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
os.environ["DATA_DIR"] = _IMPORT_DATA_DIR

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.settings import SEASONS_CONFIG_PATH, Settings  # noqa: E402

ORIGIN = "http://localhost:5173"
# 台灣 2026-10-30 10:15:30
DEFAULT_NOW = datetime(2026, 10, 30, 2, 15, 30, tzinfo=UTC)


class FakeClock:
    def __init__(self, now: datetime = DEFAULT_NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def set(self, now: datetime) -> None:
        self.now = now

    def advance(self, delta: timedelta) -> None:
        self.now += delta


def taipei(text: str) -> datetime:
    """'2026-10-30T23:59:59' → 對應的台灣時間瞬間。"""
    return datetime.fromisoformat(text + "+08:00")


@pytest.fixture
def passphrase() -> str:
    return secrets.token_urlsafe(24)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "data"


@pytest.fixture
def config_path() -> Path:
    return SEASONS_CONFIG_PATH


def write_config(tmp_path: Path, seasons: list[dict[str, Any]]) -> Path:
    """在暫存目錄建立季別設定檔（不改動 repo 內的檔案）；seedFile 指向 repo 的種子檔。"""
    config_dir = tmp_path / "config"
    shutil.copytree(API_ROOT / "seed", config_dir / "seed", dirs_exist_ok=True)
    path = config_dir / "seasons.config.json"
    path.write_text(json.dumps({"seasons": seasons}), encoding="utf-8")
    return path


AppFactory = Callable[..., TestClient]


@pytest.fixture
def make_client(
    passphrase: str, clock: FakeClock, data_dir: Path, config_path: Path
) -> Iterator[AppFactory]:
    """建立（或模擬重新啟動）app；每次呼叫都重新讀取設定與資料目錄。"""
    clients: list[TestClient] = []

    def factory(**overrides: Any) -> TestClient:
        settings = Settings(
            data_dir=overrides.pop("data_dir", data_dir),
            seasons_config_path=overrides.pop("config_path", config_path),
            allowed_origins=(ORIGIN,),
            admin_passphrase=passphrase,
        )
        client = TestClient(create_app(settings, clock=clock), **overrides)
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.close()


@pytest.fixture
def client(make_client: AppFactory) -> TestClient:
    return make_client()


@pytest.fixture
def auth(passphrase: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {passphrase}"}
