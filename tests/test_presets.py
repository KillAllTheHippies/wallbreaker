import asyncio

from rtharness.config import Config, load_config
from rtharness.presets import PRESETS, get_preset, list_presets
from rtharness.tools import build_registry, presets_tool
from rtharness.tools.registry import ToolContext, ToolRegistry


def test_all_presets_have_placeholder():
    assert PRESETS
    for p in list_presets():
        assert "{request}" in p.template, f"{p.name} missing placeholder"
        assert p.template.format(request="X")  # formats cleanly


def test_get_preset_case_insensitive():
    assert get_preset("DAN") is not None
    assert get_preset("nope") is None


def test_preset_registered():
    assert "preset" in build_registry(load_config()).names()


def test_preset_tool_list_and_get():
    reg = ToolRegistry(ToolContext(config=Config(default_profile="x", profiles={})))
    presets_tool.register(reg)
    listed = asyncio.run(reg.execute("preset", {"action": "list"}))
    assert "dan" in listed.content
    got = asyncio.run(reg.execute("preset", {"action": "get", "name": "refusal_suppress"}))
    assert "{request}" in got.content
    miss = asyncio.run(reg.execute("preset", {"action": "get", "name": "zzz"}))
    assert "No preset" in miss.content
