# Research: how real orchestration frameworks save tokens

This is the evidence behind ORCHESTRATOR's design. It was gathered by reading
the code and READMEs of working multi-agent coding projects (August 2026),
plus Anthropic's official context-engineering guidance. The goal was practical:
**spend tokens only on real work, and keep the workflow professional.**

## Sources

| Project | What it is | What we learned from it |
| --- | --- | --- |
| [`ZaxbyHub/opencode-swarm`](https://github.com/ZaxbyHub/opencode-swarm) | Multi-agent plugin native to **OpenCode** | Context Budget Guard, circuit breakers, per-agent write authority, loop detection (PRM) |
| [`zclllyybb/OpenGiraffe`](https://github.com/zclllyybb/OpenGiraffe) | Daemon over **opencode** CLI | Plan → Code → Review in isolated git worktrees; N reviewers, all must approve |
| [`Rylaa/fable5-opus5.5-orchestrator`](https://github.com/Rylaa/fable5-opus5.5-orchestrator) | **Token-frugal** orchestrator | Slim core + on-demand playbook; 40-line reports; one worker per source |
| [`SirRuggie/claude-code-orchestration-kit`](https://github.com/SirRuggie/claude-code-orchestration-kit) | Agent orchestration kit | Pinned model + effort + tools; no nested spawns; cut its instructions 41% |
| [`shinpr/sub-agents-skills`](https://github.com/shinpr/sub-agents-skills) | Cross-backend sub-agents | Self-contained agents; read-only vs safe-edit permissions |
| [`josstei/maestro-orchestrate`](https://github.com/josstei/maestro-orchestrate) | Multi-runtime orchestrator | Express vs Standard workflows; session state archived outside the chat |
| [`wshobson/agents`](https://github.com/wshobson/agents) | Large plugin/agent catalog | Skills load when relevant; skill bodies split to stay under a budget |
| [Anthropic — Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Canonical guide | "Smallest set of high-signal tokens"; just-in-time retrieval; compaction |

## The techniques that actually matter

### 1. Slim core + progressive disclosure
Fable injects a ~3.3k-character core at session start and keeps the heavy
"playbook" in a **skill loaded only before the first delegation** — "sessions
that never delegate never pay for it". Anthropic calls this *just-in-time
context* + *progressive disclosure*.

**In ORCHESTRATOR:** the always-on text is `AGENTS.md` (global + project) and
`rules.md`. Detail lives in skills (`model-router`, `context-memory`,
`parallel-dispatch`, `mcp-builder`) and in this `docs/` folder, none of which is
loaded while the agent works.

### 2. Everything always-on is paid on every subagent start
The orchestration kit measured that every subagent loads all `CLAUDE.md` files,
so they trimmed theirs from 2,258 to 1,324 tokens (a 41% cut) — about 23k tokens
saved across 25 spawns. Their rule: **"add the rule, not the reason"**.

**In ORCHESTRATOR:** `global/AGENTS.md` and `AGENTS.md` are deliberately short
and free of rationale (the "why" lives here, in `docs/`, which is never loaded).

### 3. Pin the toolset per agent
A denied tool is not just blocked — its **schema leaves the prompt**. Only the
agent that edits should have `edit`/`write`.

**In ORCHESTRATOR:** planners, `critic`, `researcher` and `vision` are read-only
(`edit` denied); `vision` also denies `shell`; `docs` has no `shell`.

### 4. Workers cannot spawn workers
The kit sets `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` so a fleet can't multiply.

**In ORCHESTRATOR:** only `orchestrator` has `subagent: allow`; all 10 workers
have `subagent: deny`.

### 5. Bounded subagent output
Fable caps reports at 40 lines and sends verbatim (over 10 lines) to a scratch
file, with the report carrying only the path. Anthropic: subagents return
1–2k-token summaries even after spending tens of thousands.

**In ORCHESTRATOR:** the handoff contract requires a ≤40-line report and puts
long verbatim under `.orchestrator/scratch/<task>/` (git-ignored).

### 6. One worker per source; batch the mechanical work
Fable: fetch one source verbatim to disk, then brief from that copy; a single
synthesizer reads across briefs. "Five greps are one agent with a checklist, not
five agents."

**In ORCHESTRATOR:** the orchestrator batches independent reads/searches into one
call; `researcher` is the single synthesizer.

### 7. Context guards and circuit breakers
opencode-swarm warns at 70% of the window and goes critical at 90%, masking old
tool outputs and pruning **only the outgoing request** (history is untouched). It
also caps tool calls (200), duration (30 min), repeated tool (10×) and
consecutive errors (5), plus a Process Remediation Model that detects repetition,
ping-pong, scope drift, stuck-on-test and context thrashing.

**In ORCHESTRATOR:** OpenCode's native compaction handles the window; every agent
has a `steps` cap as a circuit breaker (12–48 by role). No extra layer is added
because it would itself cost tokens.

### 8. State in files, not in the chat
The kit keeps `STATE.md` / `FINDINGS.md` / `DECISIONS.md` per task and **every
agent reads `DECISIONS.md` before changing anything** — this is what stops round
two from undoing round one. opencode-swarm keeps `.swarm/`; OpenGiraffe uses
SQLite.

**In ORCHESTRATOR:** `.orchestrator/memory/` (`INDEX.md`, `map.md`, `files.md`,
`decisions.md`, `errors.md`) plus the MCP `memory` graph.

## Measured cost (this setup)

Reading `tokens` from OpenCode's own store (`opencode.db`):

| Path | Cold input tokens |
| --- | ---: |
| `ask` agent, `hola` | **4,840** |
| `orchestrator`, `hola` | **7,193** |

Breakdown and the finding that the Code Mode catalog is budget-limited (~8.5 KB,
so disconnecting MCPs barely helps) is in the README, §5.5.

## What we deliberately do NOT copy

- **tmux panes / process reaping** (Fable): platform-specific, not portable to
  OpenCode's model.
- **Extra budget-guard plugins** (swarm): OpenCode already compacts; a plugin
  adds its own context cost.
- **Big agent rosters** (swarm's 20 agents): each name and description is prompt
  weight; a smaller, well-scoped set routes better.
