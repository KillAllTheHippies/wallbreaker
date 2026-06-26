from __future__ import annotations

from ..config import Endpoint
from .anthropic_provider import AnthropicProvider
from .base import Provider, ProviderError
from .openai_provider import OpenAIProvider


def build_provider(endpoint: Endpoint, timeout: float = 600.0) -> Provider:
    if endpoint.protocol == "openai":
        return OpenAIProvider(endpoint, timeout=timeout)
    if endpoint.protocol == "anthropic":
        return AnthropicProvider(endpoint, timeout=timeout)
    raise ProviderError(f"Unknown protocol '{endpoint.protocol}'")
