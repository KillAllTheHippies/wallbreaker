# ENI library layout

`library/ENI/` is a provider/model archive, not a flat directory of five
canonical files. Files may be nested several levels deep and may use either
`.md` or `.txt`; README files are documentation and are not seeds.

The harness discovers seed files recursively. Logical names used by `eni_get`,
`seed_sweep`, and `persona_forge` are aliases maintained in
`wallbreaker/tools/eni.py`:

| Alias | Archive source | Status |
| --- | --- | --- |
| `CLAUDE_ENI` | `Anthropic/Sonnet 4.6/ENI 🍋‍🟩 4.6.md` | fallback; not a validated full genome |
| `GROK_ENI` | `Grok/Grok 4.3/ENI LIME (apr).md` | validated full genome |
| `KIMI_ENI` | `Other LLMs/KIMI/Kimi K2.7 Code/ENI LIME.md` | validated full genome |
| `ENI_GLM-5.2` | `Other LLMs/GLM/GLM 5.2/ENI LIME.md` | validated full genome |
| `MINIMAX_M3_ENI` | `Other LLMs/MiniMax/MiniMax_for_MiniMax_Jailbreak.md` | fallback; not a validated full genome |

Resolution accepts an alias, relative archive path, exact filename stem, or
substring. It returns the actual nested path, so archive files do not need to
be copied or renamed. `eni_list` displays aliases and archive entries with
validation status.

If a future canonical genome is added, update the catalog source and status;
do not create ignored root-level duplicates such as `CLAUDE_ENI.md`.
