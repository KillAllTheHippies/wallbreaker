from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from ..agent.messages import Message, StreamEvent
from ..config import Endpoint


class ProviderError(Exception):
    pass


DEFAULT_TIMEOUT = 120.0


class Provider(ABC):
    def __init__(self, endpoint: Endpoint, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.endpoint = endpoint
        self.timeout = timeout

    @property
    def model(self) -> str:
        return self.endpoint.model

    @abstractmethod
    def stream(
        self,
        messages: list[Message],
        tools: list[dict] | None = None,
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float | None = None,
    ) -> AsyncIterator[StreamEvent]:
        raise NotImplementedError

    async def complete(
        self,
        messages: list[Message],
        system: str | None = None,
        max_tokens: int = 1024,
    ) -> str:
        chunks: list[str] = []
        from ..agent.messages import TextDelta

        async for event in self.stream(
            messages, tools=None, system=system, max_tokens=max_tokens
        ):
            if isinstance(event, TextDelta):
                chunks.append(event.text)
        return "".join(chunks)
