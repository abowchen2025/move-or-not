"""FastAPI 應用程式進入點：uvicorn app.main:app。

必要的環境變數缺少或不合法時，匯入本模組就會結束程序（exit 1），log 說明原因但不印出密語（D-29）。
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.auth import AttemptLimiter, Authenticator
from app.clock import Clock, system_clock
from app.errors import ApiError, ErrorCode, error_response
from app.routes import build_router
from app.seasons import load_seasons_config
from app.settings import Settings, StartupError
from app.storage import DataFileError, Storage

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logger = logging.getLogger("app")


async def _api_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc)


async def _data_file_error_handler(_: Request, exc: Exception) -> JSONResponse:
    # 詳細原因已由 storage 寫進 log
    return error_response(ApiError(500, ErrorCode.DATA_FILE_ERROR))


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return error_response(ApiError(422, ErrorCode.INVALID_REQUEST))


async def _unexpected_error_middleware(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    # 放在 CORS 內側，前端才讀得到 500 的錯誤格式
    try:
        return await call_next(request)
    except Exception:
        logger.exception("未預期的錯誤：%s %s", request.method, request.url.path)
        return error_response(ApiError(500, ErrorCode.INTERNAL_ERROR))


def create_app(settings: Settings | None = None, clock: Clock = system_clock) -> FastAPI:
    settings = settings or Settings.from_env()
    config = load_seasons_config(settings.seasons_config_path)
    storage = Storage(settings.data_dir, config, settings.seasons_config_path.parent)
    storage.initialize()
    authenticator = Authenticator(settings.admin_passphrase, AttemptLimiter(), clock)

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(build_router(config, storage, authenticator, clock))
    app.add_exception_handler(ApiError, _api_error_handler)
    app.add_exception_handler(DataFileError, _data_file_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    # 後加的 middleware 在外側：CORS → 未預期錯誤 → 路由
    app.add_middleware(BaseHTTPMiddleware, dispatch=_unexpected_error_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition", "Retry-After"],
        max_age=600,
    )
    return app


def _create_app_or_exit() -> FastAPI:
    try:
        return create_app()
    except StartupError as exc:
        logger.critical("服務無法啟動：%s", exc)
        raise SystemExit(1) from None


app = _create_app_or_exit()
