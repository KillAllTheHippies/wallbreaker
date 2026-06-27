from __future__ import annotations

from textual.theme import Theme

RTH_THEME = Theme(
    name="rth",
    primary="#7aa2f7",
    secondary="#bb9af7",
    accent="#f7768e",
    success="#9ece6a",
    warning="#e0af68",
    error="#f7768e",
    surface="#1a1b26",
    panel="#24283b",
    background="#16161e",
    dark=True,
    variables={
        "verdict-good": "#9ece6a",
        "verdict-partial": "#e0af68",
        "verdict-bad": "#f7768e",
        "field-label": "#565f89",
        "feedback": "#bb9af7",
    },
)

PALETTE = {
    "user": "#7aa2f7",
    "assistant": "#9ece6a",
    "tool_call": "#e0af68",
    "tool_result": "#bb9af7",
    "info": "#7aa2f7",
    "error": "#f7768e",
    "feedback": "#bb9af7",
    "label": "#565f89",
    "muted": "#565f89",
    "accent": "#f7768e",
    "secondary": "#bb9af7",
    "verdict_good": "#9ece6a",
    "verdict_partial": "#e0af68",
    "verdict_bad": "#f7768e",
}
