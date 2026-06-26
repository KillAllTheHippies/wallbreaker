import asyncio

from rtharness.config import Config
from rtharness.tools import barcode_tool, mutate
from rtharness.tools.registry import ToolContext, ToolRegistry
from rtharness.transforms.structural import payload_split


def _reg(tool_module):
    reg = ToolRegistry(ToolContext(config=Config(default_profile="x", profiles={})))
    tool_module.register(reg)
    return reg


def test_mutate_requires_text():
    reg = _reg(mutate)
    res = asyncio.run(reg.execute("mutate", {}))
    assert "required" in res.content.lower()


def test_mutate_no_endpoint_reports_cleanly():
    reg = _reg(mutate)
    res = asyncio.run(reg.execute("mutate", {"text": "x"}))
    assert "no model endpoint" in res.content.lower()


def test_barcode_kind_guard():
    reg = _reg(barcode_tool)
    res = asyncio.run(reg.execute("barcode", {"text": "x", "kind": "bogus"}))
    assert "kind must be one of" in res.content


def test_barcode_qr_or_missing_dep(tmp_path):
    reg = _reg(barcode_tool)
    reg.ctx.cwd = str(tmp_path)
    res = asyncio.run(reg.execute("barcode", {"text": "hello", "kind": "qr"}))
    assert "saved to" in res.content or "pip install" in res.content


def test_split_modes():
    assert 'p0 = "alpha"' in payload_split("alpha beta gamma", mode="word")
    assert 'p0 = "line one"' in payload_split("line one\nline two", mode="line")
    sent = payload_split("First sentence. Second one.", mode="sentence")
    assert "First sentence." in sent and "Second one." in sent
