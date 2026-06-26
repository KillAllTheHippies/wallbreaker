from rtharness.config import load_config
from rtharness.state import apply_attacker, apply_target, load_state, save_state


def test_save_load_roundtrip(tmp_path):
    p = tmp_path / ".rth_state.json"
    save_state(p, {"profile": "glm", "auto": False, "rounds": 5})
    loaded = load_state(p)
    assert loaded["profile"] == "glm" and loaded["auto"] is False
    assert loaded["rounds"] == 5


def test_load_missing_returns_empty(tmp_path):
    assert load_state(tmp_path / "nope.json") == {}


def test_apply_attacker_profile_and_model():
    cfg = load_config("config.example.toml")
    base = cfg.profile("openrouter")
    ep = apply_attacker(cfg, base, {"profile": "zai", "attacker_model": "glm-9"})
    assert ep.protocol == "anthropic"
    assert ep.model == "glm-9"


def test_apply_target_profile_then_model():
    cfg = load_config("config.example.toml")
    apply_target(cfg, {"target_profile": "zai", "target_model": "glm-4.6-air"})
    assert cfg.target.base_url == "https://api.z.ai/api/anthropic"
    assert cfg.target.model == "glm-4.6-air"


def test_apply_empty_prefs_is_noop():
    cfg = load_config("config.example.toml")
    before = cfg.target.model
    apply_target(cfg, {})
    assert cfg.target.model == before
