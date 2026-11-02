"""各季資料檔與記錄的資料模型、寫入請求的驗證（SRS §5.1、§7.5、D-09、D-28）。"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.errors import ErrorCode

NOTE_MAX_CODE_POINTS = 100
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# 換行與控制字元（D-28）：Cc 為控制字元（含 Tab、LF、CR、NUL、DEL、NEL），
# Zl、Zp 為 Unicode 的行分隔與段落分隔字元
FORBIDDEN_NOTE_CATEGORIES = frozenset({"Cc", "Zl", "Zp"})


class NoteError(ValueError):
    def __init__(self, code: ErrorCode) -> None:
        super().__init__(code.value)
        self.code = code


def normalize_note(value: str) -> str:
    """先拒絕換行與控制字元，再去頭尾空白，最後以 code point 計算字數（D-09、D-28）。

    排除上述字元後，str.strip() 只會去掉一般空白字元（Unicode Zs 類別，含全形空白）。
    """
    if any(unicodedata.category(ch) in FORBIDDEN_NOTE_CATEGORIES for ch in value):
        raise NoteError(ErrorCode.INVALID_REQUEST)
    stripped = value.strip()
    if len(stripped) > NOTE_MAX_CODE_POINTS:
        raise NoteError(ErrorCode.NOTE_TOO_LONG)
    return stripped


def parse_date(value: str) -> date | None:
    """只接受 YYYY-MM-DD；date.fromisoformat 也接受 20261030 等寫法，所以先比對格式。"""
    if not DATE_RE.match(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    date: str
    proposed: bool
    executed: bool
    note: str
    updatedAt: str

    @field_validator("date")
    @classmethod
    def _valid_date(cls, value: str) -> str:
        if parse_date(value) is None:
            raise ValueError("date 必須是 YYYY-MM-DD")
        return value

    @field_validator("note")
    @classmethod
    def _valid_note(cls, value: str) -> str:
        try:
            normalized = normalize_note(value)
        except NoteError as exc:
            raise ValueError(f"note 不合規則：{exc.code.value}") from exc
        if normalized != value:
            raise ValueError("note 不可有頭尾空白")
        return value

    @field_validator("updatedAt")
    @classmethod
    def _valid_timestamp(cls, value: str) -> str:
        if datetime.fromisoformat(value).tzinfo is None:
            raise ValueError("updatedAt 必須帶時區")
        return value

    @model_validator(mode="after")
    def _executed_requires_proposed(self) -> Record:
        if self.executed and not self.proposed:
            raise ValueError("executed 為 true 時 proposed 必須為 true")
        return self

    @property
    def day(self) -> date:
        return date.fromisoformat(self.date)

    @property
    def updated_at(self) -> datetime:
        return datetime.fromisoformat(self.updatedAt)


class SeasonData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schemaVersion: Literal[1]
    seasonId: str
    records: list[Record]

    @field_validator("records")
    @classmethod
    def _unique_dates(cls, records: list[Record]) -> list[Record]:
        dates = [record.date for record in records]
        if len(dates) != len(set(dates)):
            raise ValueError("同一天只能有一筆記錄")
        return records

    def find(self, day: date) -> Record | None:
        key = day.isoformat()
        return next((record for record in self.records if record.date == key), None)


class RecordInput(BaseModel):
    """PUT 的 request body（§7.5）。note 省略或 null 時，覆蓋既有記錄會保留原備註。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    proposed: bool
    executed: bool
    note: str | None = None
