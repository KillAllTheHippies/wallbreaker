from __future__ import annotations

import asyncio
from collections.abc import Awaitable

DEFAULT_CONCURRENCY = 8


async def gather_capped(coros: list[Awaitable], limit: int = DEFAULT_CONCURRENCY) -> list:
    """asyncio.gather, but at most `limit` coroutines run at once.

    Single-key providers (coding plans, free OpenRouter) rate-limit hard; firing 40
    requests at once just makes them queue and 429-backoff. Bounding concurrency keeps a
    sweep fast and predictable. Order of results matches input order.
    """
    sem = asyncio.Semaphore(max(1, int(limit)))

    async def _run(coro):
        async with sem:
            return await coro

    return await asyncio.gather(*[_run(c) for c in coros])
