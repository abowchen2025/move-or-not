"""驗證失敗次數限制：NFR-S3、AC-09、D-22-e、D-24、D-25。"""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AppFactory, FakeClock, taipei

CHECK = "/api/auth/check"
WRONG = {"Authorization": "Bearer wrong-passphrase"}


def ip(address: str) -> dict[str, str]:
    return {"X-Real-IP": address}


def fail(client: TestClient, times: int, address: str = "198.51.100.1") -> None:
    for _ in range(times):
        assert client.post(CHECK, headers={**WRONG, **ip(address)}).status_code == 401


@pytest.fixture(autouse=True)
def _fixed_time(clock: FakeClock) -> None:
    clock.set(taipei("2026-10-30T10:00:00"))


def test_ac09_sixth_attempt_is_429_even_with_correct_passphrase(
    client: TestClient, auth: dict[str, str]
) -> None:
    """D-25：第 1～5 次失敗回 401；之後一律 429，不比對密語，正確密語也一樣。"""
    fail(client, 5)
    response = client.post(CHECK, headers={**auth, **ip("198.51.100.1")})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"
    assert int(response.headers["Retry-After"]) == 600
    assert client.post(CHECK, headers={**WRONG, **ip("198.51.100.1")}).status_code == 429


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", "/api/seasons/season-1/records/2026-10-30"),
        ("DELETE", "/api/seasons/season-1/records/2026-10-13"),
        ("GET", "/api/seasons/season-1/export"),
        ("POST", CHECK),
    ],
)
def test_block_applies_to_every_authenticated_endpoint(
    client: TestClient, auth: dict[str, str], method: str, path: str
) -> None:
    fail(client, 5)
    response = client.request(
        method,
        path,
        json={"proposed": True, "executed": False} if method == "PUT" else None,
        headers={**auth, **ip("198.51.100.1")},
    )
    assert response.status_code == 429
    # 封鎖中不得寫入
    state = client.get("/api/seasons/season-1/state").json()
    assert state["todayRecord"] is None
    assert len(state["records"]) == 3


def test_failures_on_any_endpoint_count_together(client: TestClient) -> None:
    headers = {**WRONG, **ip("198.51.100.1")}
    client.post(CHECK, headers=headers)
    client.put("/api/seasons/season-1/records/2026-10-30", json={}, headers=headers)
    client.delete("/api/seasons/season-1/records/2026-10-13", headers=headers)
    client.get("/api/seasons/season-1/export", headers=headers)
    client.post(CHECK, headers=ip("198.51.100.1"))  # 缺少密語也算失敗
    assert client.post(CHECK, headers=headers).status_code == 429


def test_public_endpoints_are_not_limited(client: TestClient) -> None:
    fail(client, 5)
    headers = ip("198.51.100.1")
    assert client.get("/api/seasons/season-1/state", headers=headers).status_code == 200
    assert client.get("/api/seasons", headers=headers).status_code == 200
    assert client.get("/api/health", headers=headers).status_code == 200


def test_d24_sources_are_counted_separately_by_x_real_ip(
    client: TestClient, auth: dict[str, str]
) -> None:
    fail(client, 5, "198.51.100.1")
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.2")}).status_code == 204
    fail(client, 4, "198.51.100.2")
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.2")}).status_code == 204


def test_d24_falls_back_to_connection_ip_without_header(
    client: TestClient, auth: dict[str, str]
) -> None:
    for _ in range(5):
        assert client.post(CHECK, headers=WRONG).status_code == 401
    # 沒有 X-Real-IP 時以連線 IP（TestClient 為 testclient）計數
    assert client.post(CHECK, headers=auth).status_code == 429
    # 帶標頭的其他來源不受影響
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.3")}).status_code == 204


def test_d22e_success_does_not_reset_failures(client: TestClient, auth: dict[str, str]) -> None:
    fail(client, 4)
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 204
    fail(client, 1)
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 429


def test_window_is_sliding(client: TestClient, clock: FakeClock, auth: dict[str, str]) -> None:
    """10 分鐘滑動視窗：每次失敗各自在 10 分鐘後過期。"""
    for _ in range(5):
        fail(client, 1)
        clock.advance(timedelta(minutes=1))
    # 現在是第一次失敗後 5 分鐘：還在封鎖，最早一筆在 5 分鐘後過期
    blocked = client.post(CHECK, headers={**auth, **ip("198.51.100.1")})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) == 300

    clock.advance(timedelta(minutes=4, seconds=59))  # 第一次失敗後 9:59
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 429
    clock.advance(timedelta(seconds=1))  # 第一次失敗後剛好 10 分鐘 → 過期，剩 4 次
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 204
    # 再失敗 1 次又回到 5 次
    fail(client, 1)
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 429


def test_blocked_requests_do_not_extend_the_block(
    client: TestClient, clock: FakeClock, auth: dict[str, str]
) -> None:
    """封鎖期間的請求不比對密語，也不記成新的失敗；10 分鐘後即可恢復。"""
    fail(client, 5)
    for _ in range(20):
        clock.advance(timedelta(seconds=20))
        assert client.post(CHECK, headers={**WRONG, **ip("198.51.100.1")}).status_code == 429
    clock.set(taipei("2026-10-30T10:10:00"))
    assert client.post(CHECK, headers={**auth, **ip("198.51.100.1")}).status_code == 204


def test_limit_is_in_memory_only(make_client: AppFactory, data_dir: Path) -> None:
    """計數只存在記憶體，不寫檔（NFR-S3）：重新啟動後歸零，資料目錄也沒有多出檔案。"""
    client = make_client()
    before = sorted(path.relative_to(data_dir) for path in data_dir.rglob("*"))
    fail(client, 5)
    assert client.post(CHECK, headers={**WRONG, **ip("198.51.100.1")}).status_code == 429
    after = sorted(path.relative_to(data_dir) for path in data_dir.rglob("*"))
    assert after == before
    restarted = make_client()
    assert restarted.post(CHECK, headers={**WRONG, **ip("198.51.100.1")}).status_code == 401
