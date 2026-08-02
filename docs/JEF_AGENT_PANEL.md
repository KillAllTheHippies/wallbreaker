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
The JEF dependency is installed with Wallbreaker (`0din-jef==0.8.0`). JEF
behavior selection is a scope label and audit aid; it does not by itself prove a
finding or replace human review of evidence.
