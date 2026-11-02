"""各季資料檔與稽核紀錄的讀寫（SRS §5.1～§5.4）。

- 原子寫入：暫存檔 → fsync → os.replace。
- 單一程序內用一把 lock 串行化所有讀寫（audit.jsonl 跨季共用）。
- 讀檔失敗時拋出 DataFileError，絕不自動用種子覆蓋。
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from datetime import date, datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.records import Record, SeasonData
from app.seasons import SeasonConfig, SeasonsConfig
from app.settings import StartupError

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


class DataFileError(Exception):
    """資料檔不存在、無法讀取或內容不合規則。"""


class SeedError(StartupError):
    """種子檔內容不合規則，或無法建立資料檔。"""


def serialize(data: SeasonData) -> bytes:
    text = json.dumps(data.model_dump(), ensure_ascii=False, indent=2)
    return (text + "\n").encode("utf-8")


def _fsync_dir(directory: Path) -> None:
    # 讓 os.replace／os.link 的目錄項目也落盤；Windows 無法開啟目錄，略過
    if os.name == "nt":
        return
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _write_temp(directory: Path, name: str, content: bytes) -> Path:
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=f".{name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return Path(tmp)


def write_atomic(path: Path, content: bytes) -> None:
    tmp = _write_temp(path.parent, path.name, content)
    try:
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    _fsync_dir(path.parent)


def create_exclusive(path: Path, content: bytes) -> bool:
    """原子建立新檔；已存在時不動它並回傳 False（§5.2「絕不覆蓋」）。"""
    tmp = _write_temp(path.parent, path.name, content)
    try:
        os.link(tmp, path)
    except FileExistsError:
        return False
    finally:
        tmp.unlink(missing_ok=True)
    _fsync_dir(path.parent)
    return True


class Storage:
    def __init__(self, data_dir: Path, config: SeasonsConfig, config_dir: Path) -> None:
        self._seasons_dir = data_dir / "seasons"
        self._audit_path = data_dir / "audit.jsonl"
        self._config = config
        self._config_dir = config_dir
        self._lock = threading.Lock()

    def season_path(self, season_id: str) -> Path:
        return self._seasons_dir / f"{season_id}.json"

    # ---- 啟動 ----

    def initialize(self) -> None:
        """建立資料目錄，並為還沒有資料檔的季別寫入種子或空記錄（§5.2）。"""
        try:
            self._seasons_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StartupError(f"無法建立資料目錄 {self._seasons_dir}：{exc}") from exc
        for season in self._config.seasons:
            path = self.season_path(season.id)
            if os.path.lexists(path):
                continue
            content = serialize(self._initial_data(season))
            try:
                created = create_exclusive(path, content)
            except OSError as exc:
                raise SeedError(f"無法建立季別 {season.id} 的資料檔：{exc}") from exc
            if created:
                source = season.seed_file or "空記錄"
                logger.info("已建立季別 %s 的資料檔（來源：%s）", season.id, source)

    def _initial_data(self, season: SeasonConfig) -> SeasonData:
        if season.seed_file is None:
            return SeasonData(schemaVersion=SCHEMA_VERSION, seasonId=season.id, records=[])
        seed_path = self._config_dir / season.seed_file
        try:
            data = SeasonData.model_validate_json(seed_path.read_bytes())
        except (OSError, ValidationError) as exc:
            raise SeedError(
                f"季別 {season.id} 的種子檔不合規則：{season.seed_file}\n{exc}"
            ) from exc
        if data.seasonId != season.id:
            raise SeedError(f"種子檔 {season.seed_file} 的 seasonId 與季別 {season.id} 不一致")
        return data

    # ---- 讀取 ----

    def _read(self, season_id: str) -> SeasonData:
        path = self.season_path(season_id)
        try:
            data = SeasonData.model_validate_json(path.read_bytes())
        except (OSError, ValidationError) as exc:
            logger.error("資料檔讀取失敗：%s（%s）", path, type(exc).__name__)
            raise DataFileError(str(path)) from exc
        if data.seasonId != season_id:
            logger.error("資料檔的 seasonId 不符：%s", path)
            raise DataFileError(str(path))
        return data

    def read(self, season_id: str) -> SeasonData:
        with self._lock:
            return self._read(season_id)

    def export(self, season_id: str) -> bytes:
        """回傳資料檔原始內容；內容不合規則時同樣視為讀取失敗。"""
        with self._lock:
            self._read(season_id)
            try:
                return self.season_path(season_id).read_bytes()
            except OSError as exc:
                raise DataFileError(season_id) from exc

    # ---- 寫入 ----

    def upsert(
        self,
        season_id: str,
        day: date,
        *,
        proposed: bool,
        executed: bool,
        note: str | None,
        now: datetime,
    ) -> Record:
        """新增或覆蓋一筆記錄。note 為 None 時：新增為空字串，覆蓋則保留原備註（§7.5）。"""
        with self._lock:
            data = self._read(season_id)
            before = data.find(day)
            if note is None:
                note = before.note if before is not None else ""
            after = Record(
                date=day.isoformat(),
                proposed=proposed,
                executed=executed,
                note=note,
                updatedAt=now.isoformat(),
            )
            others = [record for record in data.records if record.date != after.date]
            self._save(data, [*others, after])
            self._audit(now, season_id, "upsert", after.date, before, after)
            return after

    def delete(self, season_id: str, day: date, *, now: datetime) -> bool:
        """刪除一筆記錄；記錄不存在時回傳 False。"""
        with self._lock:
            data = self._read(season_id)
            before = data.find(day)
            if before is None:
                return False
            self._save(data, [record for record in data.records if record.date != before.date])
            self._audit(now, season_id, "delete", before.date, before, None)
            return True

    def _save(self, data: SeasonData, records: list[Record]) -> None:
        records = sorted(records, key=lambda record: record.date)
        updated = data.model_copy(update={"records": records})
        write_atomic(self.season_path(data.seasonId), serialize(updated))

    def _audit(
        self,
        now: datetime,
        season_id: str,
        action: str,
        day: str,
        before: Record | None,
        after: Record | None,
    ) -> None:
        """只增不改；不記錄 IP 或任何個資（§5.3）。"""
        entry: dict[str, Any] = {
            "at": now.isoformat(),
            "seasonId": season_id,
            "action": action,
            "date": day,
            "before": before.model_dump() if before is not None else None,
            "after": after.model_dump() if after is not None else None,
        }
        line = json.dumps(entry, ensure_ascii=False) + "\n"
        with self._audit_path.open("a", encoding="utf-8", newline="\n") as file:
            file.write(line)
            file.flush()
            os.fsync(file.fileno())
