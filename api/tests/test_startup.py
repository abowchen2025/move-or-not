"""啟動檢查（D-29）：必要的環境變數缺少或不合法時，服務在啟動時就失敗，log 說明原因但不印出密語。

以子程序實際匯入 app.main（等同 `uvicorn app.main:app` 的匯入步驟），確認結束代碼與輸出。
"""

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from tests.conftest import API_ROOT


def run_import(env_overrides: dict[str, str], data_dir: Path) -> subprocess.CompletedProcess[str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in {"ADMIN_PASSPHRASE", "ALLOWED_ORIGINS", "DATA_DIR"}
    }
    env.update({"DATA_DIR": str(data_dir), "PYTHONIOENCODING": "utf-8"})
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )


def test_starts_with_valid_env(tmp_path: Path) -> None:
    result = run_import(
        {"ADMIN_PASSPHRASE": secrets.token_urlsafe(24), "ALLOWED_ORIGINS": "http://localhost:5173"},
        tmp_path,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "seasons" / "season-1.json").is_file()


def test_missing_passphrase_fails_startup(tmp_path: Path) -> None:
    result = run_import({"ALLOWED_ORIGINS": "http://localhost:5173"}, tmp_path)
    assert result.returncode == 1
    assert "ADMIN_PASSPHRASE" in result.stderr
    assert "Traceback" not in result.stderr
    # 啟動失敗時不應建立任何資料檔
    assert not (tmp_path / "seasons").exists()


def test_short_passphrase_fails_without_printing_value(tmp_path: Path) -> None:
    short = secrets.token_hex(7)  # 14 字元
    result = run_import(
        {"ADMIN_PASSPHRASE": short, "ALLOWED_ORIGINS": "http://localhost:5173"}, tmp_path
    )
    assert result.returncode == 1
    assert "ADMIN_PASSPHRASE" in result.stderr
    assert short not in result.stderr
    assert short not in result.stdout


def test_missing_allowed_origins_fails_startup(tmp_path: Path) -> None:
    passphrase = secrets.token_urlsafe(24)
    result = run_import({"ADMIN_PASSPHRASE": passphrase}, tmp_path)
    assert result.returncode == 1
    assert "ALLOWED_ORIGINS" in result.stderr
    assert passphrase not in result.stderr


@pytest.mark.skipif(os.name == "nt", reason="Windows 無法以權限位元讓目錄不可寫")
def test_unwritable_data_dir_fails_startup(tmp_path: Path) -> None:
    if os.geteuid() == 0:
        pytest.skip("root 不受目錄權限限制")
    locked = tmp_path / "locked"
    locked.mkdir()
    locked.chmod(0o500)
    try:
        result = run_import(
            {
                "ADMIN_PASSPHRASE": secrets.token_urlsafe(24),
                "ALLOWED_ORIGINS": "http://localhost:5173",
            },
            locked / "data",
        )
    finally:
        locked.chmod(0o700)
    assert result.returncode == 1
    assert "服務無法啟動" in result.stderr
