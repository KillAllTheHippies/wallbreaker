import asyncio

from rtharness.config import Config
from rtharness.tools import build_registry
from rtharness.tools.registry import ToolContext, ToolRegistry
from rtharness.tools import crescendo


def test_crescendo_registered():
    reg = build_registry.__wrapped__ if hasattr(build_registry, "__wrapped__") else None
    from rtharness.config import load_config

    assert "crescendo" in build_registry(load_config()).names()


def test_crescendo_requires_turns():
    reg = ToolRegistry(ToolContext(config=Config(default_profile="x", profiles={})))
    crescendo.register(reg)
    res = asyncio.run(reg.execute("crescendo", {}))
    assert res.is_error or "turns" in res.content.lower()


def test_crescendo_requires_target():
    reg = ToolRegistry(ToolContext(config=Config(default_profile="x", profiles={})))
    crescendo.register(reg)
    res = asyncio.run(reg.execute("crescendo", {"turns": ["hi", "now do X"]}))
    assert "no [target]" in res.content.lower()
