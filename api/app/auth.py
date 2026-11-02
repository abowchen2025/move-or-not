"""管理密語驗證與失敗次數限制（NFR-S1～S3、D-22-e、D-24、D-25）。"""

from __future__ import annotations

import hmac
import logging
import math
import threading
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta
from enum import Enum

from fastapi import Request

from app.clock import Clock
from app.errors import ApiError, ErrorCode
from app.settings import AUTH_FAILURE_WINDOW, AUTH_MAX_FAILURES, CLIENT_IP_HEADER

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """先讀 X-Real-IP（D-24），沒有時用連線 IP。"""
    forwarded = request.headers.get(CLIENT_IP_HEADER, "").strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


class Outcome(Enum):
    OK = "ok"
    DENIED = "denied"
    BLOCKED = "blocked"


class AttemptLimiter:
    """每個來源在滑動視窗內的失敗次數；只存在記憶體（NFR-S3）。"""

    def __init__(
        self,
        max_failures: int = AUTH_MAX_FAILURES,
        window: timedelta = AUTH_FAILURE_WINDOW,
    ) -> None:
        self._max_failures = max_failures
        self._window = window
        self._failures: dict[str, deque[datetime]] = {}
        self._lock = threading.Lock()

    def _prune(self, now: datetime) -> None:
        for key in list(self._failures):
            failures = self._failures[key]
            while failures and now - failures[0] >= self._window:
                failures.popleft()
            if not failures:
                del self._failures[key]

    def attempt(self, key: str, now: datetime, verify: Callable[[], bool]) -> tuple[Outcome, int]:
        """封鎖中時不呼叫 verify，回傳 (BLOCKED, 還要等幾秒)；否則驗證並在失敗時記一次。

        檢查、驗證、記錄在同一把鎖內完成，同一來源同時送出多個請求也不會多猜一次。
        """
        with self._lock:
            self._prune(now)
            failures = self._failures.get(key)
            if failures is not None and len(failures) >= self._max_failures:
                # 視窗內最早的幾筆過期後，失敗次數才會降到上限以下
                expires = failures[len(failures) - self._max_failures] + self._window
                return Outcome.BLOCKED, max(1, math.ceil((expires - now).total_seconds()))
            if verify():
                return Outcome.OK, 0
            self._failures.setdefault(key, deque()).append(now)
            return Outcome.DENIED, 0


class Authenticator:
    def __init__(self, passphrase: str, limiter: AttemptLimiter, clock: Clock) -> None:
        self._passphrase = passphrase.encode("utf-8")
        self._limiter = limiter
        self._clock = clock

    def _matches(self, token: str | None) -> bool:
        # 常數時間比較（NFR-S2）
        return token is not None and hmac.compare_digest(token.encode("utf-8"), self._passphrase)

    def require(self, request: Request) -> None:
        """驗證失敗時拋出 ApiError。

        封鎖中一律回 429，不比對密語（D-25）；驗證成功不清除失敗計數（D-22-e）。
        """
        token = bearer_token(request)
        outcome, retry_after = self._limiter.attempt(
            client_ip(request), self._clock(), lambda: self._matches(token)
        )
        if outcome is Outcome.BLOCKED:
            logger.warning("驗證失敗次數過多，暫時拒絕驗證請求")
            raise ApiError(
                429, ErrorCode.TOO_MANY_ATTEMPTS, headers={"Retry-After": str(retry_after)}
            )
        if outcome is Outcome.DENIED:
            raise ApiError(401, ErrorCode.UNAUTHORIZED, headers={"WWW-Authenticate": "Bearer"})
