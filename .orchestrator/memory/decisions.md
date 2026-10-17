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
- 2026-10-17 · Autonomous **goal mode** (`/goal`, Codex-style) · a plugin
  (`goal-loop`) re-injects a continuation prompt when a turn ends
  (`session.execution.succeeded`), so the agent iterates without confirmations ·
  the loop is bounded (40 continuations, `--max=N`), ends on `GOAL_COMPLETE` /
  `GOAL_BLOCKED`, pauses on any human message, and the `goal` agent hard-denies
  the irreversible ops (a "full auto" that allows `rm -rf`/force-push was
  discarded as too destructive).
- 2026-10-17 · Goal-loop **single-owner** rule · the server event stream is
  global but the plugin loads once per location, so every instance saw every
  event and each re-injected the same continuation (5× in testing). Fixed with a
  two-part filter: act only if the instance's directory matches the session's
  (`session.get`) **and** it is the latest instance registered for that directory
  (liveness kept in `globalThis`, which also covers global+project config copies).
  Found by hitting it live and reading the server log; kept `durable.seq`
  de-duplication.
- 2026-10-17 · Goal-loop **hardening after review** · the marker is now detected
  only at the *end* of the message (tolerating a trailing newline, bold, a code
  fence or a trailing comment) so a mention in prose no longer ends the goal and a
  real finish no longer burns the whole cap · the session's previous agent is
  restored when the goal ends (and inherited if `/goal` is reissued while active) ·
  invalid `--max` is rejected with a notice · a 15-min watchdog pauses a hung turn ·
  `/goal-stop` and user pauses interrupt the running turn · `question` is denied
  and the usual tools auto-approved so the loop never falls into an `ask`. The
  `.env` claim was corrected: only `read`/`edit`/`glob` can be path-filtered;
  `grep` matches the pattern and the shell stays open, so those are documented as
  best-effort. Tests moved into the repo (`tests/goal-loop.test.mjs`, 67 checks).
- 2026-10-17 · Goal-loop **restart/interrupt race** · interrupting a session to
  "reset" a running goal made the server emit `session.execution.interrupted`,
  which the plugin itself read as a genuine pause and killed the freshly restarted
  goal; `/goal-stop` also raced its own `interrupted` event. Fixed with a
  per-session `suppress` set that marks an *intentional* interrupt (stop/pause/
  timeout) so its event is consumed and ignored. A first attempt also suppressed
  the stale turn after a restart, but that stalled the loop (with `delivery:
  "steer"` the new objective merges into the running turn, whose `succeeded` is
  the one that keeps the loop alive) — caught by the live E2E, not the mock. A
  leftover `suppress` from an `interrupt()` with no running turn could also leak
  into the next goal and stall it, so `start()` and `/goal-resume` now clear it.
