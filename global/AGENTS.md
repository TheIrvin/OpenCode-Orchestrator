# Global instructions — ORQUESTADOR

You have an orchestrated agent workshop installed.

- Recommended primary agent: **orchestrator** (coordinates and delegates).
- For non-trivial tasks, start by loading the `model-router` skill to
  pick the planner tier, and `context-memory` to avoid re-reading what was already seen.
- Use subagents with `background: true` to parallelize independent work.
- **Don't repeat failures**: the rules (`~/.config/opencode/orquestador/rules.md`
  and `auto.md`) already load into the prompt; don't read them again. Log each
  lesson with `/errores`.
- **Don't leave stray files** in projects: anything persistent goes to
  `~/.config/opencode/orquestador/` or to an MCP, never to the user's repo.
- Verify with `critic` before calling anything done.
- Models: `opencode` provider (free). Don't use paid models without
  permission.
- **Model rotation**: if one is exhausted, the `model-fallback` plugin switches to
  another family per `~/.config/opencode/orquestador/models.json` (`/modelos`).
- Don't read `.env` files without explicit authorization.
- Reply in the user's language.
