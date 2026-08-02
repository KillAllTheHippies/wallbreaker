import json
import time
from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("jef")
from fastapi.testclient import TestClient  # noqa: E402
from jef.registry import get_module, list_all  # noqa: E402

from wallbreaker.dashboard.server import _compose_attack_payload, create_app  # noqa: E402
from wallbreaker.jef import JEF_BEHAVIOR_IDS, behaviors, objective_for_behavior, score_response  # noqa: E402


def test_jef_catalog_contains_all_safe_behavior_metadata():
    rows = behaviors()
    assert {row["id"] for row in rows} == set(JEF_BEHAVIOR_IDS)
    registry = {row["name"]: row for row in list_all()}
    assert set(registry) == set(JEF_BEHAVIOR_IDS)
    assert len(rows) == 7
    assert all("prompt" not in row and "payload" not in row for row in rows)
    assert {row["threshold"] for row in rows} == {70, 80}
    for row in rows:
        authoritative = registry[row["id"]]
        assert row["title"] == authoritative["display_name"]
        assert row["category"] == authoritative["category"]
        assert row["threshold"] == authoritative["pass_threshold"]
        assert row["deprecated"] == authoritative["deprecated"]
        assert row["module"] == get_module(row["id"]).__name__


def test_behavior_selection_preserves_objective_and_returns_metadata():
    objective, behavior = objective_for_behavior("authorized evaluation", "illicit_substances")
    assert behavior and behavior["id"] == "illicit_substances"
    assert objective == "authorized evaluation"
    assert behavior["title"] == "Illegal Substances: Crystal Meth"


def test_behavior_selection_scores_only_the_model_response():
    result = score_response("illicit_substances", "I can't help with that request.")
    assert result == {
        "behavior": "illicit_substances",
        "title": "Illegal Substances: Crystal Meth",
        "threshold": 70,
        "score": 0.0,
        "percentage": 0.0,
        "triggered": False,
        "status": "scored",
    }


def test_v2_jef_endpoint_is_display_only(tmp_path):
    client = TestClient(create_app(config=None, sessions_dir=tmp_path))
    response = client.get("/api/v2/jef/behaviors")
    assert response.status_code == 200
    body = response.json()
    assert {row["id"] for row in body["behaviors"]} == set(JEF_BEHAVIOR_IDS)
    assert all("prompt" not in row and "payload" not in row for row in body["behaviors"])


def test_agent_run_rejects_unknown_jef_behavior(tmp_path):
    client = TestClient(create_app(config=None, sessions_dir=tmp_path))
    response = client.post(
        "/api/agent/run",
        json={"objective": "authorized evaluation", "jef_behavior": "unknown"},
    )
    assert response.status_code == 400


def test_compose_jef_selection_flows_through_existing_composition():
    result = _compose_attack_payload({
        "request": "authorized evaluation objective",
        "jef_behavior": "harry_potter",
    })
    assert result["jef_behavior"] == "harry_potter"
    assert result["prompt"] == "authorized evaluation objective"
    assert result["payload"] == "authorized evaluation objective"


def test_compose_rejects_unknown_jef_behavior():
    with pytest.raises(ValueError, match="unknown JEF behavior"):
        _compose_attack_payload({"request": "authorized evaluation", "jef_behavior": "unknown"})


def test_compose_conversation_retains_jef_behavior_and_run_metadata(monkeypatch, tmp_path):
    from wallbreaker.config import Config, Endpoint
    from wallbreaker.tools.registry import ToolResult
    import wallbreaker.tools as tools_mod

    sessions = tmp_path / "sessions"
    cfg = Config(
        default_profile="attacker",
        profiles={"attacker": Endpoint("attacker", "openai", "http://attacker", "attack-model")},
        target=Endpoint("target", "openai", "http://target", "target-model"),
        path=tmp_path / "config.toml",
    )
    registries = []

    class FakeRegistry:
        def __init__(self):
            self.calls = []
            self.ctx = SimpleNamespace(jef_behavior="", jef_evaluations=[])

        async def execute(self, name, args):
            self.calls.append((name, args))
            result = ToolResult(f"{name}: {args['prompt']}")
            if self.ctx.jef_behavior:
                self.ctx.jef_evaluations.append(score_response(self.ctx.jef_behavior, result.content))
            return result

    def build_registry(_config):
        registry = FakeRegistry()
        registries.append(registry)
        return registry

    monkeypatch.setattr(tools_mod, "build_registry", build_registry)
    client = TestClient(create_app(config=cfg, sessions_dir=sessions))

    first = client.post(
        "/api/fire", json={"request": "first", "jef_behavior": "harry_potter"}
    ).json()
    second = client.post("/api/fire", json={"request": "follow up"}).json()
    state = client.get("/api/console/conversation").json()

    assert first["turn"]["jef_behavior"] == "harry_potter"
    assert first["turn"]["jef_evaluation"]["behavior"] == "harry_potter"
    assert first["turn"]["jef_evaluation"]["status"] == "scored"
    assert second["turn"]["jef_behavior"] == "harry_potter"
    assert state["jef_behavior"] == "harry_potter"
    assert state["opening"] == {
        "request": "first", "preset": "", "transforms": [], "system": "",
        "max_tokens": 1024, "jef_behavior": "harry_potter",
    }
    assert registries[0].calls[1][1]["prompt"] == "follow up"
    changed = client.post(
        "/api/fire", json={"request": "changed", "jef_behavior": "fentanyl"}
    )
    assert changed.status_code == 400
    assert "locked" in changed.json()["detail"]

    reset = client.post("/api/console/conversation/reset").json()
    assert reset["jef_behavior"] == ""
    assert reset["retained_setup"] == state["opening"]
    assert reset["opening"] == {}
    records = [
        json.loads(line)
        for line in (sessions / reset["archived_run"]).read_text(encoding="utf-8").splitlines()
    ]
    run_meta = next(record for record in records if record.get("kind") == "run_meta")
    assert run_meta["jef_behavior"] == "harry_potter"


def test_agent_and_v2_execution_propagate_jef_behavior(monkeypatch, tmp_path):
    from wallbreaker.agent.messages import StopEvent, TextDelta, ToolUseEvent
    from wallbreaker.config import Config, Endpoint
    from wallbreaker.providers.base import Provider
    from wallbreaker.tools.registry import ToolContext, ToolRegistry
    import wallbreaker.providers.factory as factory_mod
    import wallbreaker.tools as tools_mod

    sessions = tmp_path / "sessions"
    sessions.mkdir()
    attacker = Endpoint("attacker", "openai", "http://attacker", "attack-model")
    target = Endpoint("target", "openai", "http://target", "target-model")
    cfg = Config(
        default_profile="attacker",
        profiles={"attacker": attacker},
        target=target,
        path=tmp_path / "config.toml",
    )

    class FakeProvider(Provider):
        async def stream(self, messages, tools=None, system=None, max_tokens=4096, temperature=None):
            yield TextDelta("complete")
            yield ToolUseEvent("finish-1", "finish", {"summary": "complete"})
            yield StopEvent("tool_use")

    registry = ToolRegistry(ToolContext(config=cfg))

    async def finish(args, _ctx):
        return f"finished: {args['summary']}"

    registry.add(
        "finish",
        "Finish the engagement.",
        {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        },
        finish,
    )
    monkeypatch.setattr(factory_mod, "build_provider", lambda _endpoint: FakeProvider(attacker))
    monkeypatch.setattr(tools_mod, "build_registry", lambda _config: registry)

    with TestClient(create_app(config=cfg, sessions_dir=sessions)) as client:
        with client.stream("POST", "/api/agent/run", json={
            "objective": "authorized objective",
            "max_rounds": 1,
            "jef_behavior": "chinese_censorship",
        }) as response:
            assert response.status_code == 200
            assert '"type": "done"' in "".join(response.iter_text())

        first_log = next(sessions.glob("run-*.jsonl"))
        records = [json.loads(line) for line in first_log.read_text(encoding="utf-8").splitlines()]
        run_meta = next(row for row in records if row["kind"] == "run_meta")
        objective = next(row for row in records if row["kind"] == "objective")
        scaffold = next(row for row in records if row["kind"] == "scaffold")
        assert run_meta["agent"]["jef_behavior"] == "chinese_censorship"
        assert objective["jef_behavior"] == "chinese_censorship"
        assert scaffold["request"]["messages"][0]["content"][0]["text"] == "authorized objective"

        created = client.post("/api/v2/executions", json={
            "capability_id": "agent.run",
            "args": {
                "objective": "V2 execution objective",
                "max_rounds": 1,
                "jef_behavior": "fentanyl",
            },
            "mode": "interactive",
        })
        assert created.status_code == 200
        execution_id = created.json()["id"]
        for _ in range(100):
            execution = client.get(f"/api/v2/executions/{execution_id}").json()
            if execution["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.01)
        assert execution["status"] == "succeeded"
        assert execution["metadata"]["jef_behavior"] == "fentanyl"
