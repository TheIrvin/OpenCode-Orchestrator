# ORQUESTADOR — project instructions

This repository contains a multi-agent orchestration setup for
OpenCode. All heavy work must go through the **orchestrator** agent.

## Project rules

1. **Delegate before executing.** The primary agent does not solve long tasks
   by itself: it breaks them down and launches subagents.
2. **Pick the right tier.** Before planning, load the
   `model-router` skill and follow its decision matrix to choose the planner, creator
   and verifier based on the size/complexity of the problem.
2b. **Don't re-read unnecessarily.** Read `.orquestador/memory/INDEX.md` first and
   compare hashes (`git hash-object`) before opening already-reviewed files.
   Update the memory when done (`context-memory` skill).
2c. **Don't repeat failures.** The rules live in
   `~/.config/opencode/orquestador/` and load on their own into the prompt
   (`instructions`): **don't read them again**. Each failure is logged on its own
   (`error-memory` plugin, outside the project). Promote recurring ones to rules
   with `/errores`.
2d. **Don't leave stray files.** The system writes nothing inside the
   projects being worked on. If something must persist, it goes to a global directory
   (`~/.config/opencode/orquestador/`) or to an MCP; never drop files into the
   user's repo.
3. **Parallelize the independent.** Use `background: true` in the
   `subagent` tool to launch several children at once, and Code Mode (`execute`) for
   independent tool calls.
4. **Always verify.** No task is declared done without going through the
   `critic` subagent (a model from a different family than the creator).
5. **Don't read `.env`** without explicit authorization.
6. **Handoff convention** between agents: Objective · Context ·
   Files · Acceptance criteria · Output format.
7. **Free models.** All agents use the `opencode` provider
   (free models, cost 0). Don't introduce paid models without permission.
8. **Model rotation.** Each role has a fallback chain by families
   (`orquestador/models.json`). If a model is exhausted, the `model-fallback` plugin
   rotates on its own; see `/modelos`. Don't insist on a dead model.

## Documentation

- Plan and architecture: `README.md`
- Model matrix and automatic switching: `.opencode/skills/model-router/SKILL.md`
- Context, memory and anti-re-reading: `.opencode/skills/context-memory/SKILL.md`
- Parallelism and worktrees: `.opencode/skills/parallel-dispatch/SKILL.md`
- MCP (use and create): `.opencode/skills/mcp-builder/SKILL.md`
