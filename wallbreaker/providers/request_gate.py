from __future__ import annotations

import asyncio
import hashlib
import random
import time
import weakref
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from ..config import Endpoint
from ..agent.messages import StreamEvent
from .base import ProviderError

_GATES: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, "_RequestGate"]] = (
    weakref.WeakKeyDictionary()
)
_MAX_ATTEMPTS = 6
_MAX_DELAY_SECONDS = 15.0
_MAX_CONCURRENCY = 3
_REQUEST_DELAY_MS = 250


class _RequestGate:
    def __init__(self) -> None:
        self.condition = asyncio.Condition()
        self.active = 0
        self.last_started = 0.0

    async def acquire(self) -> None:
        async with self.condition:
            while self.active >= _MAX_CONCURRENCY:
                await self.condition.wait()
            delay_seconds = _REQUEST_DELAY_MS / 1000.0
            remaining = delay_seconds - (time.monotonic() - self.last_started)
            if remaining > 0:
                # Holding the condition while waiting preserves start order and
                # guarantees the configured spacing between request starts.
                await asyncio.sleep(remaining)
            self.active += 1
            self.last_started = time.monotonic()

    async def release(self) -> None:
        async with self.condition:
            self.active = max(0, self.active - 1)
            self.condition.notify_all()


def configure_request_gate(concurrency: int = 3, delay_ms: int = 250) -> dict[str, int]:
    """Set process-wide inference pacing used by every provider protocol."""
    global _MAX_CONCURRENCY, _REQUEST_DELAY_MS
    _MAX_CONCURRENCY = max(1, min(int(concurrency), 32))
    _REQUEST_DELAY_MS = max(0, min(int(delay_ms), 60_000))
    return request_gate_settings()


def request_gate_settings() -> dict[str, int]:
    return {"concurrency": _MAX_CONCURRENCY, "request_delay_ms": _REQUEST_DELAY_MS}


def _credential_id(endpoint: Endpoint) -> str:
    # Hash the resolved credential so profiles that use different environment
    # variable names for the same key still share one supplier-side slot.  The
    # key itself is never retained in the scheduler key or logs.
    secret = endpoint.resolved_key() or "keyless"
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()[:16]


def provider_gate_key(endpoint: Endpoint) -> str:
    parsed = urlsplit(endpoint.base_url)
    origin = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    return f"{origin}|{_credential_id(endpoint)}"


def _gate_for(endpoint: Endpoint) -> _RequestGate:
    loop = asyncio.get_running_loop()
    gates = _GATES.setdefault(loop, {})
    return gates.setdefault(provider_gate_key(endpoint), _RequestGate())


@asynccontextmanager
async def provider_request_slot(endpoint: Endpoint):
    """Apply concurrency and request-start pacing to one provider credential."""
    gate = _gate_for(endpoint)
    await gate.acquire()
    try:
        yield
    finally:
        await gate.release()


def is_concurrency_limit(exc: BaseException) -> bool:
    message = str(exc).lower()
    if "429" not in message or "insufficient_quota" in message:
        return False
    return "concurrent" in message or "rate limit exceeded" in message


def _retry_delay(attempt: int) -> float:
    base = min(_MAX_DELAY_SECONDS, float(2**attempt))
    return base + random.uniform(0.0, min(0.5, base * 0.1))


async def gated_stream(
    endpoint: Endpoint,
    stream_factory: Callable[[], AsyncIterator[StreamEvent]],
) -> AsyncIterator[StreamEvent]:
    """Run a stream under the provider gate and absorb transient concurrency 429s."""
    async with provider_request_slot(endpoint):
        for attempt in range(_MAX_ATTEMPTS):
            yielded = False
            try:
                async for event in stream_factory():
                    yielded = True
                    yield event
                return
            except ProviderError as exc:
                if yielded or not is_concurrency_limit(exc) or attempt == _MAX_ATTEMPTS - 1:
                    raise
                await asyncio.sleep(_retry_delay(attempt))


async def gated_request(endpoint: Endpoint, request_factory: Callable[[], Awaitable[object]]):
    """Run a non-streaming inference under the same provider request gate."""
    async with provider_request_slot(endpoint):
        for attempt in range(_MAX_ATTEMPTS):
            try:
                return await request_factory()
            except ProviderError as exc:
                if not is_concurrency_limit(exc) or attempt == _MAX_ATTEMPTS - 1:
                    raise
                await asyncio.sleep(_retry_delay(attempt))
    raise AssertionError("provider request retry loop exited unexpectedly")
