import pytest

pytest.importorskip("fastapi")
pytest.importorskip("jef")
from fastapi.testclient import TestClient  # noqa: E402

from wallbreaker.dashboard.server import _compose_attack_payload, create_app  # noqa: E402
from wallbreaker.jef import JEF_BEHAVIOR_IDS, behaviors, objective_for_behavior  # noqa: E402


def test_jef_catalog_contains_all_safe_behavior_metadata():
    rows = behaviors()
    assert {row["id"] for row in rows} == set(JEF_BEHAVIOR_IDS)
    assert len(rows) == 7
    assert all("prompt" not in row and "payload" not in row for row in rows)
    assert {row["threshold"] for row in rows} == {70, 80}


def test_behavior_selection_binds_objective_without_benchmark_content():
    objective, behavior = objective_for_behavior("authorized evaluation", "illicit_substances")
    assert behavior and behavior["id"] == "illicit_substances"
    assert "Selected JEF behavior" in objective
    assert "benchmark prompts" in objective
    assert "synthesis" not in objective.lower()


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
    assert result["payload"].startswith("[Authorized JEF behavior:")


def test_compose_rejects_unknown_jef_behavior():
    with pytest.raises(ValueError, match="unknown JEF behavior"):
        _compose_attack_payload({"request": "authorized evaluation", "jef_behavior": "unknown"})
