from __future__ import annotations


from ..agent.messages import user
from ..judging import grade
from ._util import gather_capped
from .registry import ToolContext, ToolRegistry

MAX_SEED_CHARS = 12000


def _collect_seeds(names: list[str] | None) -> list[tuple[str, str]]:
    """Return [(label, seed_text)] from the ENI + L1B3RT4S collections."""
    from . import eni, l1b3rt4s

    sources = []
    if eni.is_present():
        sources += [(f"eni:{p.stem}", p) for p in sorted(eni.library_dir().glob("*.md"))]
    if l1b3rt4s.is_cloned():
        sources += [(f"lib:{p.stem}", p) for p in sorted(l1b3rt4s.library_dir().glob("*.mkd"))]

    if names:
        wanted = [n.strip().lower() for n in names]
        sources = [
            (lbl, p) for lbl, p in sources
            if any(w in lbl.lower() or w in p.stem.lower() for w in wanted)
        ]
    out = []
    for lbl, p in sources:
        text = p.read_text(encoding="utf-8", errors="replace")[:MAX_SEED_CHARS]
        out.append((lbl, text))
    return out


async def _seed_sweep(args: dict, ctx: ToolContext) -> str:
    request = args.get("request", "")
    if not request:
        return "Error: 'request' is required (the ask to inject into each seed)"
    if ctx.config.target is None:
        return "Error: no [target] endpoint configured."

    seeds = _collect_seeds(args.get("seeds"))
    if not seeds:
        return (
            "No seeds available. The ENI collection lives in library/ENI; run "
            "'rth lib update' to fetch L1B3RT4S. Or pass explicit 'seeds' names."
        )
    n = int(args.get("n", 6))
    seeds = seeds[:n]
    as_system = bool(args.get("as_system", True))
    max_tokens = int(args.get("max_tokens", 500))

    from ..providers.factory import build_provider

    target = build_provider(ctx.config.target, timeout=float(args.get("timeout", 75)))
    ctx.emit(
        f"seed_sweep: firing '{request[:40]}' through {len(seeds)} cross-provider seeds "
        f"vs {ctx.config.target.model}"
    )

    async def fire(label: str, seed: str):
        try:
            if as_system:
                reply = await target.complete([user(request)], system=seed, max_tokens=max_tokens)
            else:
                reply = await target.complete([user(seed + "\n\n" + request)], max_tokens=max_tokens)
        except Exception as exc:  # noqa: BLE001
            return {"label": label, "verdict": "ERROR", "score": -1, "reason": str(exc)[:60]}
        vl, score, reason, _s = await grade(ctx.judge_endpoint, reply, payload=request, objective=request)
        ctx.record_verdict(request, reply, vl, reason, f"seed:{label}")
        return {"label": label, "verdict": vl, "score": score or 0, "reason": reason}

    rows = await gather_capped(
        [fire(lbl, s) for lbl, s in seeds], int(args.get("concurrency", 8))
    )
    rows.sort(key=lambda r: -r["score"])

    lines = [
        f"SEED SWEEP vs {ctx.config.target.model} ('{request[:46]}')",
        "=" * 56,
    ]
    for r in rows:
        tag = f"{r['verdict']}({r['score']})" if r["score"] >= 0 else "ERROR"
        lines.append(f"  {tag:14} {r['label']}")
    hits = [r["label"] for r in rows if r["verdict"] in ("COMPLIED", "PARTIAL")]
    lines.append("=" * 56)
    lines.append(
        f"bypassed via: {', '.join(hits)}" if hits
        else "no seed bypassed - try more seeds (n=), as_system=false, or chain an encoding"
    )
    return "\n".join(lines)


def register(registry: ToolRegistry) -> None:
    registry.add(
        name="seed_sweep",
        description=(
            "Find which jailbreak SEED cracks the target: inject one request into multiple "
            "L1B3RT4S + ENI seeds at once (cross-provider - a GROK or ANTHROPIC seed may "
            "beat a Chinese/local target) and rank which bypassed. Each seed is applied as "
            "the target's system prompt by default (as_system=false prepends it instead). "
            "Like multi_fire, but sweeping persona/jailbreak seeds rather than encodings. "
            "'seeds' filters by name (e.g. ['grok','anthropic']); omit to sample broadly."
        ),
        parameters={
            "type": "object",
            "properties": {
                "request": {"type": "string", "description": "The ask to inject into every seed"},
                "seeds": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter seeds by name substring (default: a broad cross-provider sample)",
                },
                "n": {"type": "integer", "description": "Max seeds to try (default 6)"},
                "as_system": {"type": "boolean", "description": "Apply the seed as the target system prompt (default true)"},
                "max_tokens": {"type": "integer"},
            },
            "required": ["request"],
        },
        handler=_seed_sweep,
    )
