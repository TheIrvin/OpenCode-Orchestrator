---
description: See model families, which are in cooldown, and per-role fallback
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Show the free-model status and compute a fallback chain.
Everything is in the global store (`~/.config/opencode/orquestador/`):

1. Run `node tools/models-status.mjs` (a single call) and read its output.
   If the script is not in the project, read
   `~/.config/opencode/orquestador/models.json` and `model-cooldown.json` directly.
2. Present a table: **model · family · status** (available / in cooldown
   with remaining seconds).
3. For each role, indicate the current **healthy model** (first model in its chain that
   is not in cooldown), avoiding repeating the failed family.
4. Remember the `model-fallback` plugin rotates on its own: this is visibility only.
5. If the quota has already reset and you want to reactivate all models, delete
   `~/.config/opencode/orquestador/model-cooldown.json` (or edit it to empty it).

Nuance to detail if the user asks for it: $ARGUMENTS
