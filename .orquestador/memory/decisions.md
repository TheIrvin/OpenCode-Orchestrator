# Decisions

Format: date · decision · reason · discarded alternatives.

- 2026-10-16 · Orchestrator = `beam-free#xhigh` · 1M of context and maximum
  reasoning to coordinate · Space Bunny was discarded as primary to keep it for
  the deep planner.
- 2026-10-16 · Planner in tiers (fast/medium/deep/long) · the reasoning cost
  matches the size of the problem · a single planner was discarded.
- 2026-10-16 · Critic with `muse-spark` (a different family) · avoid the bias
  shared with the creator (`deepseek`/`glm`).
- 2026-10-16 · Two-layer memory · `.orquestador/memory/` for the repo and MCP
  `memory` for cross-project facts.
- 2026-10-16 · Language policy · documentation (README + project memory) in
  English for sharing; agents, commands, skills, plugins, tools, rules and code
  comments stay in the owner's language (Spanish here) · a fully English repo
  was rejected.
