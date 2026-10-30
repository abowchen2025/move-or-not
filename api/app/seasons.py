"""季別設定檔 seasons.config.json 的讀取與格式驗證（SRS §5.0）。"""

from __future__ import annotations

from datetime import date
from pathlib import Path, PurePosixPath
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationError,
    field_validator,
)

SEASON_ID_PATTERN = r"^[a-z0-9-]+$"
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


class SeasonsConfigError(ValueError):
    """設定檔不存在、格式錯誤或內容不合規則。"""


class SeasonConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: Annotated[str, StringConstraints(pattern=SEASON_ID_PATTERN)]
    start_date: Annotated[str, StringConstraints(pattern=DATE_PATTERN)] = Field(alias="startDate")
    count_inclusive: bool = Field(alias="countInclusive")
    seed_file: str | None = Field(default=None, alias="seedFile")

    @field_validator("start_date")
    @classmethod
    def _valid_calendar_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value

    @field_validator("seed_file")
    @classmethod
    def _relative_path(cls, value: str | None) -> str | None:
        if value is None:
            return value
        path = PurePosixPath(value)
        if not value or path.is_absolute() or "\\" in value or ".." in path.parts:
            raise ValueError("seedFile 必須是 api/ 底下的相對路徑")
        return value

    @property
    def start(self) -> date:
        return date.fromisoformat(self.start_date)


class SeasonsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    seasons: list[SeasonConfig] = Field(min_length=1)

    @field_validator("seasons")
    @classmethod
    def _unique_ids(cls, seasons: list[SeasonConfig]) -> list[SeasonConfig]:
        ids = [season.id for season in seasons]
        if len(ids) != len(set(ids)):
            raise ValueError("季別 id 不可重複")
        return seasons

    @property
    def latest(self) -> SeasonConfig:
        """清單最後一筆為最新一季。"""
        return self.seasons[-1]

    def get(self, season_id: str) -> SeasonConfig | None:
        return next((season for season in self.seasons if season.id == season_id), None)


def load_seasons_config(path: Path) -> SeasonsConfig:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise SeasonsConfigError(f"無法讀取季別設定檔：{path}") from exc
    try:
        config = SeasonsConfig.model_validate_json(raw, strict=True)
    except ValidationError as exc:
        raise SeasonsConfigError(f"季別設定檔格式錯誤：{path}\n{exc}") from exc

    for season in config.seasons:
        if season.seed_file is not None and not (path.parent / season.seed_file).is_file():
            raise SeasonsConfigError(f"季別 {season.id} 的 seedFile 不存在：{season.seed_file}")
    return config
