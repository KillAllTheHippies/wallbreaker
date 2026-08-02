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
The JEF dependency is installed with Wallbreaker (`0din-jef==0.8.0`) and the
dashboard verifies its registry before exposing behavior choices. A production
installation should use the pinned package dependency. For development against
a local checkout, install the clone into the same environment before launching
the dashboard:

```bash
python -m pip install -e library/0din-JEF
```

If JEF is unavailable or incompatible, the selector shows a clear configuration
error rather than an empty catalog. JEF behavior selection is a scope label and
audit aid; it does not by itself prove a finding or replace human review of
evidence.
