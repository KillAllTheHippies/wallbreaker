# rth — project notes

Red-team harness: configurable agentic LLM terminal with Parseltongue + L1B3RT4S.

## Architecture
- `providers/` normalize OpenAI and Anthropic wire formats to one event stream
  (`agent/messages.py`); `agent/loop.py` is protocol-agnostic.
- Tools register into `tools/registry.py`; specs are emitted per-protocol by the
  providers. Add a tool by writing `register(registry)` in a `tools/` module and listing
  it in `tools/__init__.py`.
- Transforms are pure functions in `transforms/`, indexed in `transforms/__init__.py`
  with `lossy` flags.

## Lessons Learned
- **[cli]**: An optional top-level positional (the one-shot prompt) collides with
  argparse subparsers — the positional swallows the subcommand token. Route subcommands
  manually by scanning argv for the first non-flag token before parsing.
- **[transforms]**: morse, nato, leet, and bijection are lossy (they fold case and/or
  spacing). Mark them `lossy=True` and test them with normalized comparison, not exact
  round-trip.
- **[textual]**: `Static` has no public `.renderable`; don't introspect widget internals
  in tests. Assert on app/agent state (history, busy flag) via `App.run_test()` pilot.
- **[providers]**: OpenAI represents tool results as separate `{role:"tool"}` messages;
  Anthropic nests `tool_result` blocks inside a user message. Keep both in
  `_messages_to_wire`.
- **[classify]**: substring refusal detection false-positives on compliant replies that
  contain "I cannot help with..." sections. Verdicts go through the LLM judge
  (`judging.grade`); the heuristic `classify` is a fallback only (no key / judge error).
- **[judge]**: judge endpoint resolves as `config.judge` -> default profile -> active
  brain. In the TUI `judge_model_override` swaps just the model (keeps base/key) and must
  re-sync `registry.ctx.judge_endpoint` so the scoring tools use the same grader.
- **[long-tools]**: any tool that makes many sequential model calls (optimize_universal)
  must stream via `ctx.emit(...)` and enforce a `max_calls` budget — never a silent
  black box. Evaluate independent items concurrently with `asyncio.gather`.
- **[settings]**: runtime prefs persist to `.rth_state.json` as references (profile/model
  names), never secrets. CLI flags override saved state for that launch only.
- **[cli]**: `python -m rtharness` runs `__main__.py`, not the `if __name__` guard in
  `cli.py`. `__main__.py` must `sys.exit(main())` or non-zero return codes (e.g. the
  `export --fail-on-finding` CI gate) are silently dropped to 0. Test CLI exit codes via
  `python -m rtharness ...; echo $?`, not just `main()` in-process.
