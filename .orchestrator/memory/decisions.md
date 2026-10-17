# Decisions

Format: date · decision · reason · discarded alternatives.

- 2026-10-16 · Orchestrator = `beam-free#high` (was `#xhigh`) · 1M of context;
  high reasoning is enough to coordinate and responds faster than maximum ·
  deep work is delegated to `planner-deep`/`planner-long`.
- 2026-10-16 · Planner in tiers (fast/medium/deep/long) · the reasoning cost
  matches the size of the problem · a single planner was discarded.
- 2026-10-16 · Critic keeps a **different family** than the creator
  (`deepseek`/`glm`) · avoid the shared bias. It started on `muse-spark`, but that
  model was **removed** from the catalog, so the critic moved to
  `space-bunny-free#high` and `docs` to `beam-free#medium`.
- 2026-10-16 · Two-layer memory · `.orchestrator/memory/` for the repo and MCP
  `memory` for cross-project facts.
- 2026-10-16 · Language policy · documentation (README + project memory) in
  English for sharing; agents, commands, skills, plugins, tools, rules and code
  comments stay in the owner's language (Spanish here) · a fully English repo
  was rejected.
- 2026-10-16 · Fast path for trivial requests · added a "Camino rápido" rule to
  `orchestrator.md` so simple questions skip the 9-step task flow (no memory
  load, no planner, no subagents, no critic) · avoids over-orchestrating Q&A.
- 2026-10-16 · Token-frugality pass, evidence in `docs/research.md` · slim the
  always-on text (the `AGENTS.md` files are rules-only; the rationale lives in
  `docs/`), make workers read-only, forbid nested subagents (`subagent: deny`
  everywhere except the orchestrator), bound reports (≤40 lines; long verbatim to
  `.orchestrator/scratch/`) and batch mechanical reads · details that every
  subagent pays for are the expensive kind.
- 2026-10-16 · Free models **expire** · a pinned-but-gone model breaks its agent
  at spawn (the runtime `model-fallback` rotation does not cover it). Check
  `/catalogo` after an outage and repoint both the agent `.md` and `models.json`.
