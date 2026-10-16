---
description: Turn logged errors (global) into rules so they are not repeated
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Review the **global** error memory and turn it into actionable rules.
Everything lives in `~/.config/opencode/orquestador/` (never inside a project):

1. Read `errors.jsonl` (raw log) and `auto.md` (recurring digest).
2. Group by `signature` and detect the most repeated ones.
3. Write one **short, actionable rule** per real error in `rules.md`
   (already loaded in the prompt): what NOT to do and what to do instead. Do
   not duplicate existing rules.
4. Keep `rules.md` short (≈20 lines); if it grows, merge or remove the obsolete.
5. If the error is useful in other projects, save it to the MCP memory (`memory`).

Topic to prioritize if the user indicates one: $ARGUMENTS
