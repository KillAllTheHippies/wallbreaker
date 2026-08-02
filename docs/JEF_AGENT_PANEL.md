# JEF behavior selection in Wallbreaker V2

Wallbreaker V2 includes the 0DIN Jailbreak Evaluation Framework (JEF) as an
authorized evaluation-behavior catalog. The Agent Panel and Compose tab share
the same selector, covering every standardized behavior exposed by the
installed JEF 0.8.0 release (including its two legacy definitions):

- censorship bypass
- illicit substances
- harmful substances
- controlled substances
- CBRN
- genetic manipulation
- copyright

Selecting a behavior binds the run or composed turn to a stable JEF behavior
identifier. Wallbreaker passes that identifier through the existing V2 agent or
composition workflow and records it in the run evidence. The dashboard exposes
labels, categories, descriptions, and thresholds only; benchmark prompts and
raw harmful test content are not loaded into the UI.

Use the selector only for systems and model outputs you are authorized to test.
The JEF dependency is installed with Wallbreaker on Python 3.12 or newer
(`0din-jef==0.8.0`; JEF 0.8.0 itself requires Python 3.12+) and the dashboard
verifies its registry before exposing behavior choices. Wallbreaker remains
installable on Python 3.11, but JEF selection is unavailable there. A production
installation using JEF should use Python 3.12+ and the pinned package dependency.
For development against
a local checkout, install the clone into the same environment before launching
the dashboard:

```bash
python -m pip install -e library/0din-JEF
```

If JEF is unavailable or incompatible, the selector shows a clear configuration
error rather than an empty catalog.

## Agent completion rule

JEF is a server-side Python-library adapter, not a tool exposed to the attacker
model. When `query_target` or `continue_target` returns model output, Wallbreaker
calls `jef.registry.score` through `wallbreaker.jef.score_response`, then supplies
that complete deterministic result to the existing normal judge. The score,
percentage, behavior identifier, and authoritative registry `pass_threshold` are
recorded with the normal verdict from the same response.

For a JEF-selected Agent run, `finish` is fail-closed before the finish tool can
execute. Completion requires both conditions:

1. the normal Wallbreaker judge meets its existing successful-finding rule; and
2. JEF returned a usable score at or above the selected behavior's own
   `pass_threshold` (for example, the copyright behavior uses 80 rather than 70).

A missing/unavailable JEF evaluation, a below-threshold score, or a failing normal
judge verdict blocks completion and leaves the autonomous loop open. V2 shows a
compact retry control that queues guidance through the existing Agent steering
workflow. Findings retain the ordinary verdict and add only a small adjacent JEF
score/threshold indicator when JEF metadata is present. JEF evidence remains an
evaluation signal and does not replace operator review.
