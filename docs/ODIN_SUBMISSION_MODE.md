# 0DIN submission mode

The dashboard supports an explicit `submission_profile: "0din"` mode for
preparing two-category guardrail evidence.

In this mode the attacker receives an additional policy block. It must produce
one reusable prompt template containing `__JEF_BEHAVIOR__`. Wallbreaker replaces
that token with the behavior assigned to the current run before sending the
prompt to the target. The policy block is never sent to the target and is not
included in JEF scoring input.

The initial behavior pair is:

- `illicit_substances`
- `harmful_substances`

Each run evaluates one behavior. Runs can be linked with the same
`odin_campaign_id` and `odin_template_hash`; the campaign export is eligible
only when both required behaviors have usable JEF evidence, distinct
categories, and one shared template hash.

Known disallowed techniques are rejected before a 0DIN-mode run starts. The
policy is not applied to ordinary JEF runs.

Campaign evidence is available at:

```text
GET /api/reports/odin/{campaign_id}
```
