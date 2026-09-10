import os
import time
import urllib.parse
import urllib.request
from typing import Any, Callable
from explorer.kosis.parser import parse_kosis_response
from explorer.kosis.types import KosisApiError, KosisResponse

KOSIS_BASE_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
MIN_REQUEST_INTERVAL_SECONDS = 0.35


def sanitize_params(params: dict[str, Any]) -> dict[str, str]:
    """Removes apiKey/apiKey variations case-insensitively."""
    sanitized: dict[str, str] = {}
    for key, value in params.items():
        if key.lower() == "apikey":
            continue
        sanitized[str(key)] = str(value)
    return sanitized


class KosisClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = KOSIS_BASE_URL,
        min_interval: float = MIN_REQUEST_INTERVAL_SECONDS,
        clock_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        opener: urllib.request.OpenerDirector | None = None,
    ):
        self.api_key = api_key or os.environ.get("KOSIS_API_KEY", "")
        self.base_url = base_url
        self.min_interval = min_interval
        self.clock = clock_fn or time.monotonic
        self.sleep = sleep_fn or time.sleep
        self.opener = opener or urllib.request.build_opener()
        self.last_request_time: float | None = None

    def _apply_rate_limit(self) -> None:
        now = self.clock()
        if self.last_request_time is not None:
            elapsed = now - self.last_request_time
            if elapsed < self.min_interval:
                delay = self.min_interval - elapsed
                self.sleep(delay)
                self.last_request_time = now + delay
                return
        self.last_request_time = now

    def _fetch_raw(self, full_params: dict[str, str]) -> tuple[str, bytes]:
        query_string = urllib.parse.urlencode(full_params)
        url = f"{self.base_url}?{query_string}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "RegionalDataExplorer/0.1.0",
                "Accept": "application/json, application/xml, text/xml",
            },
        )
        try:
            with self.opener.open(req, timeout=30) as resp:
                content_type = resp.headers.get("Content-Type", "application/json")
                body = resp.read()
                return content_type, body
        except Exception as exc:
            # Strip apiKey from error message if present
            safe_msg = str(exc)
            if self.api_key and self.api_key in safe_msg:
                safe_msg = safe_msg.replace(self.api_key, "[REDACTED]")
            raise KosisApiError(code="HTTP_ERROR", message=f"Failed to connect to KOSIS: {safe_msg}", retryable=True) from exc

    def fetch(self, params: dict[str, Any]) -> KosisResponse:
        self._apply_rate_limit()

        full_params = dict(params)
        if "method" not in full_params:
            full_params["method"] = "getList"
        if "format" not in full_params:
            full_params["format"] = "json"
        if "jsonVD" not in full_params:
            full_params["jsonVD"] = "Y"
        if self.api_key and "apiKey" not in full_params:
            full_params["apiKey"] = self.api_key

        content_type, body = self._fetch_raw(full_params)
        return parse_kosis_response(content_type, body)
