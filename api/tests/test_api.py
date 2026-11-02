"""SRS §7 各端點、錯誤格式（§7.8、D-15）、備註規則（D-09、D-28）、DELETE 日期（D-26）。"""

import json
import re
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.errors import MESSAGES, ErrorCode
from app.routes import success_rate
from tests.conftest import ORIGIN, TESTDATA_DIR, AppFactory, FakeClock, taipei, write_config

STATE = "/api/seasons/season-1/state"
TODAY = "2026-10-30"
NOTE_CASES: list[dict[str, Any]] = json.loads(
    (TESTDATA_DIR / "note-cases.json").read_text(encoding="utf-8")
)["cases"]


def url(day: str = TODAY, season: str = "season-1") -> str:
    return f"/api/seasons/{season}/records/{day}"


@pytest.fixture(autouse=True)
def _fixed_time(clock: FakeClock) -> None:
    clock.set(taipei("2026-10-30T10:15:30"))


def assert_error(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    # 415 的 message 另外說明要用 JSON 格式，其餘都用代碼對應的固定文字
    if status != 415:
        assert body["error"]["message"] == MESSAGES[ErrorCode(code)]


# ---- §7.1、§7.2、§7.3 ----


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert (response.status_code, response.json()) == (200, {"ok": True})


def test_api_docs_are_disabled(client: TestClient) -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_state_matches_spec_example(client: TestClient) -> None:
    body = client.get(STATE).json()
    assert body == {
        "seasonId": "season-1",
        "serverNow": "2026-10-30T10:15:30+08:00",
        "timezone": "Asia/Taipei",
        "today": "2026-10-30",
        "startDate": "2026-10-13",
        "daysElapsed": 17,
        "ended": False,
        "endedDate": None,
        "todayRecord": None,
        "records": [
            {
                "date": "2026-10-28",
                "proposed": True,
                "executed": False,
                "note": body["records"][0]["note"],
                "updatedAt": "2026-10-28T18:00:00+08:00",
            },
            {
                "date": "2026-10-23",
                "proposed": True,
                "executed": False,
                "note": body["records"][1]["note"],
                "updatedAt": "2026-10-23T18:00:00+08:00",
            },
            {
                "date": "2026-10-13",
                "proposed": True,
                "executed": False,
                "note": body["records"][2]["note"],
                "updatedAt": "2026-10-13T18:00:00+08:00",
            },
        ],
        "stats": {"proposedCount": 3, "executedCount": 0, "successRate": 0},
        "lastUpdatedAt": "2026-10-28T18:00:00+08:00",
    }


def test_state_of_unknown_season_is_404(client: TestClient) -> None:
    for season in ("season-9", "SEASON-1", "season-1.json", "season%2D1x"):
        assert_error(client.get(f"/api/seasons/{season}/state"), 404, "SEASON_NOT_FOUND")


def test_today_record_and_last_updated(client: TestClient, auth: dict[str, str]) -> None:
    client.put(url(), json={"proposed": True, "executed": False, "note": "n"}, headers=auth)
    body = client.get(STATE).json()
    assert body["todayRecord"] == {
        "date": TODAY,
        "proposed": True,
        "executed": False,
        "note": "n",
        "updatedAt": "2026-10-30T10:15:30+08:00",
    }
    assert body["records"][0] == body["todayRecord"]
    assert body["lastUpdatedAt"] == "2026-10-30T10:15:30+08:00"


def test_last_updated_moves_back_after_deleting_newest(
    client: TestClient, auth: dict[str, str]
) -> None:
    """D-22-c：刪除最新一筆後，「最後更新」取剩餘記錄最新的 updatedAt。"""
    client.put(url(), json={"proposed": True, "executed": False}, headers=auth)
    client.delete(url(), headers=auth)
    assert client.get(STATE).json()["lastUpdatedAt"] == "2026-10-28T18:00:00+08:00"


def test_empty_season_has_null_last_updated(make_client: AppFactory, tmp_path: Path) -> None:
    config = write_config(
        tmp_path, [{"id": "blank", "startDate": "2026-10-13", "countInclusive": False}]
    )
    body = make_client(config_path=config).get("/api/seasons/blank/state").json()
    assert body["lastUpdatedAt"] is None
    assert body["stats"] == {"proposedCount": 0, "executedCount": 0, "successRate": 0}


@pytest.mark.parametrize(
    ("proposed", "executed", "rate"),
    [
        (0, 0, 0),
        (3, 0, 0),
        (3, 1, 33),
        (3, 2, 67),
        (8, 1, 13),  # 12.5 → 13（D-22-b：.5 進位，不是銀行家捨入的 12）
        (8, 3, 38),  # 37.5 → 38
        (200, 1, 1),  # 0.5 → 1
        (1, 1, 100),
    ],
)
def test_success_rate_rounds_half_up(proposed: int, executed: int, rate: int) -> None:
    assert success_rate(proposed, executed) == rate


def test_stats_count_records(client: TestClient, auth: dict[str, str]) -> None:
    client.put(url("2026-10-29"), json={"proposed": False, "executed": False}, headers=auth)
    client.put(url("2026-10-30"), json={"proposed": True, "executed": True}, headers=auth)
    assert client.get(STATE).json()["stats"] == {
        "proposedCount": 4,
        "executedCount": 1,
        "successRate": 25,
    }


# ---- §7.4 驗證 ----


def test_auth_check(client: TestClient, auth: dict[str, str], passphrase: str) -> None:
    assert client.post("/api/auth/check", headers=auth).status_code == 204
    assert (
        client.post(
            "/api/auth/check", headers={"Authorization": f"bearer {passphrase}"}
        ).status_code
        == 204
    )
    response = client.post("/api/auth/check", headers={"Authorization": "Bearer wrong"})
    assert_error(response, 401, "UNAUTHORIZED")
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Bearer",
        "Bearer ",
        "Basic {p}",
        "{p}",
        "Bearer {p}x",
        "Bearer x{p}",
    ],
)
def test_auth_rejects_missing_or_wrong(
    client: TestClient, passphrase: str, header: str | None
) -> None:
    headers = {} if header is None else {"Authorization": header.format(p=passphrase)}
    assert_error(client.post("/api/auth/check", headers=headers), 401, "UNAUTHORIZED")


def test_passphrase_is_never_echoed(client: TestClient, passphrase: str) -> None:
    almost = passphrase[:-1]
    response = client.post("/api/auth/check", headers={"Authorization": f"Bearer {almost}"})
    assert almost not in response.text


# ---- §7.5 PUT ----


def test_ac08_write_requires_passphrase(client: TestClient) -> None:
    body = {"proposed": True, "executed": False}
    assert_error(client.put(url(), json=body), 401, "UNAUTHORIZED")
    assert_error(
        client.put(url(), json=body, headers={"Authorization": "Bearer nope"}), 401, "UNAUTHORIZED"
    )
    assert client.get(STATE).json()["todayRecord"] is None


def test_put_creates_record(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        url(), json={"proposed": True, "executed": False, "note": "  hello  "}, headers=auth
    )
    assert response.status_code == 200
    assert response.json() == {
        "date": TODAY,
        "proposed": True,
        "executed": False,
        "note": "hello",
        "updatedAt": "2026-10-30T10:15:30+08:00",
    }


@pytest.mark.parametrize(
    ("sent", "existing_note", "expected"),
    [
        pytest.param({}, None, "", id="new-omitted"),
        pytest.param({"note": None}, None, "", id="new-null"),
        pytest.param({}, "keep", "keep", id="overwrite-omitted-keeps"),
        pytest.param({"note": None}, "keep", "keep", id="overwrite-null-keeps"),
        pytest.param({"note": ""}, "keep", "", id="overwrite-empty-clears"),
        pytest.param({"note": "new"}, "keep", "new", id="overwrite-string-replaces"),
    ],
)
def test_ac22_note_three_ways(
    client: TestClient,
    auth: dict[str, str],
    sent: dict[str, Any],
    existing_note: str | None,
    expected: str,
) -> None:
    """§7.5 note 的三種寫法；AC-22 的 API 端：備註留空（不帶 note）時保留原備註。"""
    if existing_note is not None:
        client.put(
            url(), json={"proposed": True, "executed": False, "note": existing_note}, headers=auth
        )
    response = client.put(url(), json={"proposed": True, "executed": True, **sent}, headers=auth)
    assert response.status_code == 200
    assert response.json()["note"] == expected
    assert response.json()["executed"] is True


def test_ac11_executed_requires_proposed(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(url(), json={"proposed": False, "executed": True}, headers=auth)
    assert_error(response, 422, "EXECUTED_REQUIRES_PROPOSED")
    assert client.get(STATE).json()["todayRecord"] is None


@pytest.mark.parametrize(
    "day",
    [
        "2026-10-12",  # 起始日前一天
        "2026-10-31",  # 台灣明天
        "2027-01-01",
        "2026-02-30",
        "2026-10-3",
        "20261030",
        "2026-10-30T00:00:00",
        "2026-W44-5",
        "today",
    ],
)
def test_ac21_put_rejects_out_of_range_or_bad_date(
    client: TestClient, auth: dict[str, str], day: str
) -> None:
    response = client.put(url(day), json={"proposed": True, "executed": False}, headers=auth)
    assert_error(response, 422, "INVALID_DATE")


@pytest.mark.parametrize("day", ["2026-10-13", "2026-10-30"])
def test_ac21_put_accepts_range_edges(client: TestClient, auth: dict[str, str], day: str) -> None:
    response = client.put(url(day), json={"proposed": True, "executed": False}, headers=auth)
    assert response.status_code == 200


@pytest.mark.parametrize("case", NOTE_CASES, ids=[case["name"] for case in NOTE_CASES])
def test_note_shared_cases(client: TestClient, auth: dict[str, str], case: dict[str, Any]) -> None:
    """D-09（code point）與 D-28（換行、控制字元不論位置一律 422）。"""
    response = client.put(
        url(), json={"proposed": True, "executed": False, "note": case["input"]}, headers=auth
    )
    if case["expected"] == "OK":
        assert response.status_code == 200, response.text
        assert response.json()["note"] == case["normalized"]
    else:
        assert_error(response, 422, case["expected"])
        assert client.get(STATE).json()["todayRecord"] is None


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(b"", id="empty"),
        pytest.param(b"{not json", id="malformed"),
        pytest.param(b"[]", id="array"),
        pytest.param(b"null", id="null"),
        pytest.param(b'{"executed": false}', id="missing-proposed"),
        pytest.param(b'{"proposed": true}', id="missing-executed"),
        pytest.param(b'{"proposed": "true", "executed": false}', id="string-bool"),
        pytest.param(b'{"proposed": 1, "executed": 0}', id="int-bool"),
        pytest.param(b'{"proposed": true, "executed": false, "note": 5}', id="note-number"),
        pytest.param(b'{"proposed": true, "executed": false, "extra": 1}', id="unknown-field"),
    ],
)
def test_put_rejects_malformed_body(client: TestClient, auth: dict[str, str], body: bytes) -> None:
    response = client.put(url(), content=body, headers={**auth, "Content-Type": "application/json"})
    assert_error(response, 422, "INVALID_REQUEST")


@pytest.mark.parametrize(
    "content_type",
    [None, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"],
)
def test_put_requires_json_content_type(
    client: TestClient, auth: dict[str, str], content_type: str | None
) -> None:
    """NFR-S5、D-15：非 JSON 回 415 INVALID_REQUEST。"""
    headers = dict(auth)
    if content_type:
        headers["Content-Type"] = content_type
    response = client.put(url(), content=b'{"proposed": true, "executed": false}', headers=headers)
    assert_error(response, 415, "INVALID_REQUEST")


def test_put_accepts_json_with_charset(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        url(),
        content=b'{"proposed": true, "executed": false}',
        headers={**auth, "Content-Type": "application/json; charset=utf-8"},
    )
    assert response.status_code == 200


def test_put_unknown_season(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        url(season="season-9"), json={"proposed": True, "executed": False}, headers=auth
    )
    assert_error(response, 404, "SEASON_NOT_FOUND")


def test_auth_is_checked_before_anything_else(client: TestClient) -> None:
    """D-22-g：未驗證時一律 401，不洩漏季別是否存在、日期或 body 是否合法。"""
    bad = {"Authorization": "Bearer wrong"}
    assert_error(client.put(url(season="nope"), content=b"x", headers=bad), 401, "UNAUTHORIZED")
    assert_error(client.put(url("bad-date"), json={}, headers=bad), 401, "UNAUTHORIZED")
    assert_error(client.delete(url(season="nope"), headers=bad), 401, "UNAUTHORIZED")
    assert_error(client.get("/api/seasons/nope/export", headers=bad), 401, "UNAUTHORIZED")


# ---- §7.6 DELETE（D-26） ----


def test_delete_existing_record(client: TestClient, auth: dict[str, str]) -> None:
    assert client.delete(url("2026-10-23"), headers=auth).status_code == 204
    dates = [record["date"] for record in client.get(STATE).json()["records"]]
    assert dates == ["2026-10-28", "2026-10-13"]


def test_delete_missing_record_is_404(client: TestClient, auth: dict[str, str]) -> None:
    assert_error(client.delete(url("2026-10-29"), headers=auth), 404, "RECORD_NOT_FOUND")


@pytest.mark.parametrize("day", ["2026-10-3", "20261030", "2026-02-30", "x"])
def test_delete_bad_date_format_is_422(client: TestClient, auth: dict[str, str], day: str) -> None:
    assert_error(client.delete(url(day), headers=auth), 422, "INVALID_DATE")


@pytest.mark.parametrize("day", ["2026-10-01", "2026-12-31"])
def test_delete_out_of_range_but_existing_record(
    client: TestClient, auth: dict[str, str], data_dir: Path, day: str
) -> None:
    """D-26：格式正確就不檢查範圍；起始日調整後留下的範圍外記錄也刪得掉。"""
    path = data_dir / "seasons" / "season-1.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["records"].append(
        {
            "date": day,
            "proposed": True,
            "executed": False,
            "note": "",
            "updatedAt": "2026-10-01T18:00:00+08:00",
        }
    )
    path.write_text(json.dumps(data), encoding="utf-8")
    assert client.delete(url(day), headers=auth).status_code == 204
    assert day not in [record["date"] for record in client.get(STATE).json()["records"]]


@pytest.mark.parametrize("day", ["2026-10-01", "2027-01-01"])
def test_delete_out_of_range_missing_record_is_404(
    client: TestClient, auth: dict[str, str], day: str
) -> None:
    assert_error(client.delete(url(day), headers=auth), 404, "RECORD_NOT_FOUND")


def test_delete_unknown_season(client: TestClient, auth: dict[str, str]) -> None:
    assert_error(client.delete(url(season="season-9"), headers=auth), 404, "SEASON_NOT_FOUND")


def test_delete_does_not_require_content_type(client: TestClient, auth: dict[str, str]) -> None:
    """D-10：沒有 body 的 DELETE 不檢查 Content-Type。"""
    response = client.delete(url("2026-10-13"), headers={**auth, "Content-Type": "text/plain"})
    assert response.status_code == 204


# ---- §7.7 匯出（D-08） ----


def test_export(client: TestClient, auth: dict[str, str], data_dir: Path) -> None:
    response = client.get("/api/seasons/season-1/export", headers=auth)
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("application/json")
    assert response.headers["Content-Disposition"] == 'attachment; filename="season-1.json"'
    assert response.headers["Cache-Control"] == "no-store"
    assert response.content == (data_dir / "seasons" / "season-1.json").read_bytes()


def test_export_requires_auth(client: TestClient) -> None:
    assert_error(client.get("/api/seasons/season-1/export"), 401, "UNAUTHORIZED")


def test_export_unknown_season(client: TestClient, auth: dict[str, str]) -> None:
    assert_error(client.get("/api/seasons/season-9/export", headers=auth), 404, "SEASON_NOT_FOUND")


# ---- §7.8、D-15、NFR-S4 ----


def test_unexpected_error_returns_internal_error(
    make_client: AppFactory, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    client = make_client(raise_server_exceptions=False)

    def boom(*_: Any, **__: Any) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr("app.storage.Storage.upsert", boom)
    response = client.put(
        url(), json={"proposed": True, "executed": False}, headers={**auth, "Origin": ORIGIN}
    )
    assert_error(response, 500, "INTERNAL_ERROR")
    # 錯誤回應也帶 CORS 標頭，前端才讀得到錯誤代碼
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    allowed = client.get(STATE, headers={"Origin": ORIGIN})
    assert allowed.headers["Access-Control-Allow-Origin"] == ORIGIN
    other = client.get(STATE, headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


def test_cors_preflight_for_write(client: TestClient) -> None:
    response = client.options(
        url(),
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert "PUT" in response.headers["Access-Control-Allow-Methods"]
    rejected = client.options(
        url(),
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PUT"},
    )
    assert rejected.status_code == 400


def test_messages_cover_every_code() -> None:
    assert set(MESSAGES) == set(ErrorCode)
    assert all(message.strip() for message in MESSAGES.values())


def test_error_codes_match_frontend_list() -> None:
    """前端 web/src/api/error-codes.ts 的代碼清單必須與後端一致。"""
    source = (TESTDATA_DIR.parent / "web" / "src" / "api" / "error-codes.ts").read_text(
        encoding="utf-8"
    )
    frontend = set(re.findall(r"'([A-Z_]+)'", source))
    assert frontend == {code.value for code in ErrorCode}
