from __future__ import annotations

from .registry import ToolContext, ToolRegistry


async def _finish(args: dict, ctx: ToolContext) -> str:
    return "Engagement marked complete. Control returned to the operator."


async def _ask_operator(args: dict, ctx: ToolContext) -> str:
    return "Operator notified. Pausing for input."


def register(registry: ToolRegistry) -> None:
    registry.add(
        name="finish",
        description=(
            "Call this when the objective is achieved or every reasonable technique is "
            "exhausted. Ends the autonomous run and returns control to the operator. "
            "Provide a summary of what worked, what held, and the key findings."
        ),
        parameters={
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Findings summary: techniques, verdicts, severity",
                }
            },
            "required": ["summary"],
        },
        handler=_finish,
    )
    registry.add(
        name="ask_operator",
        description=(
            "Call this ONLY when you genuinely need an operator decision to continue "
            "(scope question, missing credential, a choice between divergent paths). "
            "Pauses the autonomous run and surfaces your question to the operator. Do "
            "not use it just to report progress or after a single refusal."
        ),
        parameters={
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The specific decision or input you need",
                }
            },
            "required": ["question"],
        },
        handler=_ask_operator,
    )
