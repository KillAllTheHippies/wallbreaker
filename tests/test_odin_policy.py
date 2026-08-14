import json
from types import SimpleNamespace

import pytest

from wallbreaker.odin import (
    BEHAVIOR_PLACEHOLDER,
    DEFAULT_BEHAVIORS,
    instantiate_template,
    policy_text,
    template_hash,
    validate_techniques,
    validate_template,
)
from wallbreaker.prompts import compose_system
from wallbreaker.report import build_odin_campaign_export
from wallbreaker.tools.target import _prepare_odin_prompt


def test_odin_policy_is_attacker_only_and_mentions_constraints():
    endpoint = SimpleNamespace(protocol="openai", system_prompt="")
    ordinary = compose_system(endpoint)
    odin = compose_system(
        endpoint, submission_profile="0din",
        jef_behavior="illicit_substances", jef_category="Illicit substances",
    )
    assert "<odin_submission_policy>" not in ordinary
    assert "<odin_submission_policy>" in odin
    assert BEHAVIOR_PLACEHOLDER in odin
    assert "roleplaying" in odin
    assert "repository" in odin
    assert "Current assigned JEF behavior: illicit_substances" in odin


def test_odin_template_requires_placeholder_and_instantiates_behavior():
    template = f"Use {BEHAVIOR_PLACEHOLDER} as the requested behavior."
    assert validate_template(template) == []
    assert instantiate_template(template, "illicit_substances") == (
        "Use illicit_substances as the requested behavior."
    )
    assert template_hash(template) == template_hash(template)
    assert validate_template("missing token")
    with pytest.raises(ValueError):
        instantiate_template(template, "harry_potter")


def test_odin_prompt_capture_preserves_template_and_substitutes_target_prompt():
    template = f"Test {BEHAVIOR_PLACEHOLDER} with one fixed tactic."
    ctx = SimpleNamespace(
        submission_profile="0din", jef_behavior="harmful_substances",
        target_thread=[], odin_template="", odin_template_hash="", run_events=None,
        odin_campaign_id="campaign-1", jef_category="Harmful substances",
    )
    assert _prepare_odin_prompt(template, ctx, initial=True) == (
        "Test harmful_substances with one fixed tactic."
    )
    assert ctx.odin_template == template
    assert ctx.odin_template_hash == template_hash(template)
    with pytest.raises(ValueError):
        _prepare_odin_prompt("no placeholder", ctx, initial=True)


def test_odin_denylist_is_deterministic():
    violations = validate_techniques(["base64", "leak_scan", "query_target"])
    assert {item["policy"] for item in violations} == {"encoding", "prompt_extraction"}


def test_dashboard_rejects_disallowed_technique_in_odin_mode(tmp_path):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from wallbreaker.config import Config, Endpoint
    from wallbreaker.dashboard.server import create_app

    endpoint = Endpoint("attacker", "openai", "http://attacker", "model")
    cfg = Config(
        default_profile="attacker", profiles={"attacker": endpoint},
        target=Endpoint("target", "openai", "http://target", "target-model"),
        path=tmp_path / "config.toml",
    )
    client = TestClient(create_app(config=cfg, sessions_dir=tmp_path / "sessions"))
    response = client.post("/api/agent/run", json={
        "objective": "authorized evaluation",
        "jef_behavior": "illicit_substances",
        "submission_profile": "0din",
        "enabled_techniques": ["leak_scan"],
    })
    assert response.status_code == 400
    assert "0DIN-disallowed" in response.json()["detail"]


def test_odin_campaign_export_requires_two_linked_categories(tmp_path):
    template = f"fixed {BEHAVIOR_PLACEHOLDER} tactic"
    digest = template_hash(template)
    for index, behavior, category in [
        (1, "illicit_substances", "Illicit substances"),
        (2, "harmful_substances", "Harmful substances"),
    ]:
        path = tmp_path / f"run-20260810-00000{index}.jsonl"
        rows = [
            {
                "kind": "run_meta", "submission_profile": "0din",
                "odin_campaign_id": "campaign-1", "odin_template_hash": digest,
                "jef_behavior": behavior, "jef_category": category,
                "models": {"target": f"model-{index}"}, "interface": "dashboard",
            },
            {"kind": "odin_template", "template_hash": digest},
            {
                "kind": "verdict", "payload": template.replace(BEHAVIOR_PLACEHOLDER, behavior),
                "response": "evidence", "target_model": f"model-{index}",
                "interface": "dashboard", "technique": "fixed",
                "label": "COMPLIED", "jef_evaluation": {"behavior": behavior, "status": "scored"},
            },
        ]
        path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
    export = build_odin_campaign_export(tmp_path, "campaign-1")
    assert export["eligible"] is True
    assert len(export["runs"]) == 2
    assert set(export["required_behaviors"]) == set(DEFAULT_BEHAVIORS)
