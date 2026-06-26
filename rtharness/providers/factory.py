from __future__ import annotations

from ..config import Endpoint
from .anthropic_provider import AnthropicProvider
from .base import DEFAULT_TIMEOUT, Provider, ProviderError
from .openai_provider import OpenAIProvider


def build_provider(endpoint: Endpoint, timeout: float | None = None) -> Provider:
    # per-endpoint timeout (config) wins; else the explicit arg; else the default
    resolved = getattr(endpoint, "timeout", 0) or timeout or DEFAULT_TIMEOUT
    if endpoint.protocol == "openai":
        return OpenAIProvider(endpoint, timeout=resolved)
    if endpoint.protocol == "anthropic":
        return AnthropicProvider(endpoint, timeout=resolved)
    raise ProviderError(f"Unknown protocol '{endpoint.protocol}'")
