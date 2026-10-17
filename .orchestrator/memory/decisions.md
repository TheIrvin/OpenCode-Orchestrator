# Decisions

Format: date · decision · reason · discarded alternatives.

- 2026-10-16 · Orchestrator = `beam-free#high` (was `#xhigh`) · 1M of context;
  high reasoning is enough to coordinate and responds faster than maximum ·
  deep work is delegated to `planner-deep`/`planner-long`.
- 2026-10-16 · Planner in tiers (fast/medium/deep/long) · the reasoning cost
  matches the size of the problem · a single planner was discarded.
- 2026-10-16 · Critic with `muse-spark` (a different family) · avoid the bias
  shared with the creator (`deepseek`/`glm`).
- 2026-10-16 · Two-layer memory · `.orchestrator/memory/` for the repo and MCP
  `memory` for cross-project facts.
- 2026-10-16 · Language policy · documentation (README + project memory) in
  English for sharing; agents, commands, skills, plugins, tools, rules and code
  comments stay in the owner's language (Spanish here) · a fully English repo
  was rejected.
- 2026-10-16 · Fast path for trivial requests · added a "Camino rápido" rule to
  `orchestrator.md` so simple questions skip the 9-step task flow (no memory
  load, no planner, no subagents, no critic) · avoids over-orchestrating Q&A.
