"""API 錯誤代碼與中性 message（SRS §7.8、D-15）。message 不得含任何主題字詞。"""

from __future__ import annotations

from enum import StrEnum

from fastapi.responses import JSONResponse


class ErrorCode(StrEnum):
    UNAUTHORIZED = "UNAUTHORIZED"
    TOO_MANY_ATTEMPTS = "TOO_MANY_ATTEMPTS"
    SEASON_NOT_FOUND = "SEASON_NOT_FOUND"
    RECORD_NOT_FOUND = "RECORD_NOT_FOUND"
    INVALID_DATE = "INVALID_DATE"
    EXECUTED_REQUIRES_PROPOSED = "EXECUTED_REQUIRES_PROPOSED"
    NOTE_TOO_LONG = "NOTE_TOO_LONG"
    DATA_FILE_ERROR = "DATA_FILE_ERROR"
    INVALID_REQUEST = "INVALID_REQUEST"
    INTERNAL_ERROR = "INTERNAL_ERROR"


MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.UNAUTHORIZED: "密語錯誤或未提供",
    ErrorCode.TOO_MANY_ATTEMPTS: "驗證失敗次數過多，請稍後再試",
    ErrorCode.SEASON_NOT_FOUND: "找不到指定的季別",
    ErrorCode.RECORD_NOT_FOUND: "找不到指定日期的記錄",
    ErrorCode.INVALID_DATE: "日期格式錯誤或超出可記錄的範圍",
    ErrorCode.EXECUTED_REQUIRES_PROPOSED: "執行為「是」時，提出必須為「是」",
    ErrorCode.NOTE_TOO_LONG: "備註不可超過 100 字",
    ErrorCode.DATA_FILE_ERROR: "資料檔讀取失敗",
    ErrorCode.INVALID_REQUEST: "請求格式錯誤",
    ErrorCode.INTERNAL_ERROR: "伺服器發生未預期的錯誤",
}


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        message: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.message = message or MESSAGES[code]
        self.headers = headers


def error_response(error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": error.code.value, "message": error.message}},
        headers=error.headers,
    )
