"""API 端點（SRS §7、D-10、D-15、D-22-g、D-26、D-27）。

需驗證的端點一律先驗證密語，再檢查季別、日期與 body（D-22-g）。
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from app.auth import Authenticator
from app.clock import Clock
from app.days import TIMEZONE_NAME, days_elapsed, ended_date, taipei_now
from app.errors import ApiError, ErrorCode
from app.records import NoteError, Record, RecordInput, SeasonData, normalize_note, parse_date
from app.seasons import SeasonConfig, SeasonsConfig
from app.storage import Storage

NO_STORE = {"Cache-Control": "no-store"}


def success_rate(proposed: int, executed: int) -> int:
    """整數百分比，一般四捨五入（.5 進位，D-22-b）；分母為 0 時為 0（§5.5）。"""
    if proposed == 0:
        return 0
    return (200 * executed + proposed) // (2 * proposed)


def season_ended(data: SeasonData) -> date | None:
    return ended_date(record.day for record in data.records if record.executed)


def season_summary(season: SeasonConfig, data: SeasonData) -> dict[str, Any]:
    ended = season_ended(data)
    return {
        "id": season.id,
        "startDate": season.start_date,
        "ended": ended is not None,
        "endedDate": ended.isoformat() if ended else None,
    }


def build_state(season: SeasonConfig, data: SeasonData, instant: datetime) -> dict[str, Any]:
    now = taipei_now(instant)
    today = now.date()
    ended = season_ended(data)
    records = sorted(data.records, key=lambda record: record.date, reverse=True)
    today_record = data.find(today)
    proposed = sum(1 for record in records if record.proposed)
    executed = sum(1 for record in records if record.executed)
    last_updated = max(records, key=lambda record: record.updated_at, default=None)
    return {
        "seasonId": season.id,
        "serverNow": now.isoformat(),
        "timezone": TIMEZONE_NAME,
        "today": today.isoformat(),
        "startDate": season.start_date,
        "daysElapsed": days_elapsed(
            season.start, today, count_inclusive=season.count_inclusive, ended=ended
        ),
        "ended": ended is not None,
        "endedDate": ended.isoformat() if ended else None,
        "todayRecord": today_record.model_dump() if today_record else None,
        "records": [record.model_dump() for record in records],
        "stats": {
            "proposedCount": proposed,
            "executedCount": executed,
            "successRate": success_rate(proposed, executed),
        },
        "lastUpdatedAt": last_updated.updatedAt if last_updated else None,
    }


def writable_date(season: SeasonConfig, raw: str, instant: datetime) -> date:
    """START_DATE ≤ date ≤ 台灣今天（§5.1）；起始日在未來時範圍為空（D-27）。"""
    day = parse_date(raw)
    if day is None or not (season.start <= day <= taipei_now(instant).date()):
        raise ApiError(422, ErrorCode.INVALID_DATE)
    return day


def require_json(request: Request) -> None:
    """只接受 application/json（NFR-S5）；只套用在有 body 的 PUT（D-10）。"""
    media_type = request.headers.get("Content-Type", "").split(";")[0].strip().lower()
    if media_type != "application/json":
        raise ApiError(415, ErrorCode.INVALID_REQUEST, "請以 application/json 格式送出")


def parse_record_input(body: bytes) -> RecordInput:
    try:
        payload = RecordInput.model_validate_json(body)
    except ValidationError as exc:
        raise ApiError(422, ErrorCode.INVALID_REQUEST) from exc
    if payload.executed and not payload.proposed:
        raise ApiError(422, ErrorCode.EXECUTED_REQUIRES_PROPOSED)
    if payload.note is None:
        return payload
    try:
        return payload.model_copy(update={"note": normalize_note(payload.note)})
    except NoteError as exc:
        raise ApiError(422, exc.code) from exc


def build_router(
    config: SeasonsConfig, storage: Storage, authenticator: Authenticator, clock: Clock
) -> APIRouter:
    router = APIRouter(prefix="/api")

    def find_season(season_id: str) -> SeasonConfig:
        season = config.get(season_id)
        if season is None:
            raise ApiError(404, ErrorCode.SEASON_NOT_FOUND)
        return season

    @router.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @router.get("/seasons")
    def list_seasons(response: Response) -> dict[str, Any]:
        response.headers.update(NO_STORE)
        return {
            "seasons": [
                season_summary(season, storage.read(season.id)) for season in config.seasons
            ]
        }

    @router.get("/seasons/{season_id}/state")
    def get_state(season_id: str, response: Response) -> dict[str, Any]:
        season = find_season(season_id)
        response.headers.update(NO_STORE)
        return build_state(season, storage.read(season.id), clock())

    @router.post("/auth/check", status_code=204)
    def check_auth(request: Request) -> Response:
        authenticator.require(request)
        return Response(status_code=204)

    @router.put("/seasons/{season_id}/records/{day}")
    async def put_record(season_id: str, day: str, request: Request) -> dict[str, Any]:
        authenticator.require(request)
        season = find_season(season_id)
        require_json(request)
        now = clock()
        target = writable_date(season, day, now)
        payload = parse_record_input(await request.body())
        record: Record = await run_in_threadpool(
            lambda: storage.upsert(
                season.id,
                target,
                proposed=payload.proposed,
                executed=payload.executed,
                note=payload.note,
                now=taipei_now(now),
            )
        )
        return record.model_dump()

    @router.delete("/seasons/{season_id}/records/{day}", status_code=204)
    def delete_record(season_id: str, day: str, request: Request) -> Response:
        authenticator.require(request)
        season = find_season(season_id)
        # 只檢查格式，不檢查範圍（D-26）
        target = parse_date(day)
        if target is None:
            raise ApiError(422, ErrorCode.INVALID_DATE)
        if not storage.delete(season.id, target, now=taipei_now(clock())):
            raise ApiError(404, ErrorCode.RECORD_NOT_FOUND)
        return Response(status_code=204)

    @router.get("/seasons/{season_id}/export")
    def export_season(season_id: str, request: Request) -> Response:
        authenticator.require(request)
        season = find_season(season_id)
        return Response(
            content=storage.export(season.id),
            media_type="application/json",
            headers={
                **NO_STORE,
                "Content-Disposition": f'attachment; filename="{season.id}.json"',
            },
        )

    return router
