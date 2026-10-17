# ORCHESTRATOR

**A multi-model, parallel agent workshop for [OpenCode V2](https://opencode.ai/v2/docs/) — free models only.**

An **orchestrator** agent classifies the problem, picks the right **planner**
based on its size, splits the work across subagents in parallel, verifies with an
independent critic, and stores context in a **persistent memory** so it never
re-reviews what it already saw.

---

## 1. Free models available (verified)

All from the `opencode` provider, cost **0**. `#variant` = reasoning effort.

| Model | Context | Output | Vision | Variants | Role in the workshop |
| --- | ---: | ---: | --- | --- | --- |
| **Beam** | 1.05M | 131k | — | low…**max** | Orchestrator + general |
| **Space Bunny** | 1.05M | 524k | img, video | low…**max** | Medium/deep planner |
| **Nemotron 3 Ultra** | 1M | 128k | — | — | Long-horizon planner |
| **LongCat 2.5 Preview** | 1M | 131k | img | — | Researcher |
| **Muse Spark 1.3** | 1.05M | 131k | img, video, PDF, audio | minimal…**xhigh** | Critic + docs |
| **Nemotron 3.5 Super VL** | 1.05M | 131k | img | none…**xhigh** | Visual analyst |
| **DeepSeek V4.1 Flash** | 200k | 32k | img | low, high, **max** | Main creator |
| **GLM-5.3-Flash** | 200k | 32k | img, video, PDF | low, high, **max** | Alternate creator |
| **Nemotron 3.5 Lightning** | 262k | 262k | — | — | Fast search/exploration |
| **MiMo-V2.6-Flash** | 200k | 32k | img, audio, video | — | Multimodal (audio/video) |
| **Big Pickle** | 200k | 32k | — | — | Fast planner / small tasks |

> Full detail and decision matrix in
> `.opencode/skills/model-router/SKILL.md`.

---

## 2. Architecture

```text
                        ┌───────────────────────────────┐
                        │        ORCHESTRATOR           │  beam-free #high
                        │  classifies · splits · closes │
                        └───────────────┬───────────────┘
          ┌───────────────┬─────────────┼─────────────┬───────────────┐
          ▼               ▼             ▼             ▼               ▼
   planner-*        explore      researcher      creator/        vision
   (tiers)          (repo map)   (web/docs)      creator-alt     (multimodal)
          │                                           │
          └──────────────► critic (verifies) ◄─────────┘
                                   │
                          .orchestrator/memory/  +  MCP memory
```

### Agents

| Agent | Mode | Model | Function |
| --- | --- | --- | --- |
| `orchestrator` | primary | beam-free#high | Flow direction |
| `ask` | primary | big-pickle | Light Q&A, no orchestration |
| `planner-fast` | subagent | big-pickle | Plan for small tasks |
| `planner` | all | space-bunny-free#high | Module plan |
| `planner-deep` | subagent | space-bunny-free#max | Complex plan with tradeoffs |
| `planner-long` | subagent | nemotron-3-ultra-free | Extensive phased plan |
| `creator` | subagent | deepseek-v4.1-flash-free#high | Implementation |
| `creator-alt` | subagent | glm-5.3-flash-free#high | Alternate/parallel implementation |
| `critic` | subagent | space-bunny-free#high | Independent verification |
| `researcher` | subagent | longcat-2.5-preview-free | Research + synthesis |
| `vision` | subagent | nemotron-3.5-super-vl-free#high | Images/PDF/audio |
| `docs` | subagent | beam-free#medium | Documentation |
| `explore` (built-in) | subagent | nemotron-3.5-lightning-free | Fast search |

Permissions: **only the agent that edits can edit** — `planner*`, `critic`,
`researcher` and `vision` are read-only; `vision` also denies `shell` and `docs`
has no `shell`. **No worker can spawn subagents** (`subagent: deny`); only
`orchestrator` delegates. Denied tools also drop out of the prompt.

---

## 3. Automatic model and reasoning switching

The "automatic switch" is the **planner tier**: the orchestrator classifies the
size (S/M/L/XL) and launches the child whose model is already calibrated for that
size.

| Signal | Tier | Model |
| --- | --- | --- |
| 1–2 files, no ambiguity | `planner-fast` | big-pickle |
| One module / scoped refactor | `planner` | space-bunny#high |
| Many constraints, tradeoffs, risk | `planner-deep` | space-bunny#max |
| Migration, architecture, many files | `planner-long` | nemotron-3-ultra |

Also, any long work **goes up a tier** on these signals: >3 files, design
decisions, regression risk, ambiguous requirements, or >1 pass.

To pin a variant in the **primary session** (the root `model` does not keep the
variant) use `/models` or the commands with `model:` (`/orq`, `/plan-deep`, …).

### 3.1 Model rotation and fallback (if one is exhausted)

Free models get exhausted **by family** (e.g. the NVIDIA ones can go down
together). OpenCode has **no** native fallback, so the workshop implements it:

- **Manifest** `orchestrator/models.json`: model families + an **ordered chain per
  role**. On install it is copied to
  `~/.config/opencode/orchestrator/models.json`.
- **Plugin** `model-fallback`: on the `retry` hook it detects provider failures
  (`429`, `404`, `5xx`, "unavailable"/"quota"...), marks the model in *cooldown*,
  and switches the session to the **next model from another family** with
  `session.switchModel`.
- **`/modelos`**: shows families, cooldowns, and the healthy model per role.

Example chain: `creator` → `deepseek#high` → `glm#high` → `space-bunny#high`
→ `mimo` → `longcat` → `nemotron-ultra`. If DeepSeek is exhausted, it jumps to
GLM (another family), never to another DeepSeek.

> Rotation happens **only on failure**: rotating on every call would break the
> prompt cache and coherence. The full chains are in the `model-router` skill.

---

## 4. Parallelism

- **Background subagents**: `subagent` with `background: true`; the parent keeps
  working and receives the result when it finishes.
- **Code Mode** (`execute`): several independent tools at once.
- **Worktrees**: `worktree_create` + `session_move` so two creators work without
  collisions (destination configured: `worktree.directory`).
- **Rule**: one owner per file; parallelize what is independent, serialize what
  shares state. Detail in `.opencode/skills/parallel-dispatch/SKILL.md`.

---

## 5. Context and memory (optimization)

The problem: context is expensive and is lost when the session closes; re-reading
files wastes time. Solution in **layers**:

### 5.1 OpenCode native mechanisms
| Mechanism | Use here |
| --- | --- |
| Subagents with fresh context | The heavy reading happens in the child; the parent only receives the summary |
| Compaction | `compaction.keep.tokens: 24000` (keeps more recent detail) |
| Persistent sessions | Resume instead of redoing |
| Prompt cache + `warming` | Stable prefix; enable `warming` if you pause a lot |
| Skills on demand | They don't inflate the prompt until used |
| `AGENTS.md` + `rules.md` (`instructions`) | Stable, cheap, cached prefix |
| References | External directories with cache (24h refresh) |
| Snapshots | File + conversation undo (`/undo`) |

### 5.2 Project persistent memory (`.orchestrator/memory/`)
| File | Content |
| --- | --- |
| `INDEX.md` | Minimal hub (read first) |
| `map.md` | Modules → purpose |
| `files.md` | `file · git hash · summary · date` |
| `decisions.md` | Decisions and why |
| `glossary.md` | Domain terms |

**Anti-re-reading rule**: before opening a file, compare its `git hash-object`
with `files.md`. If it matches, trust the summary.

### 5.3 MCP memory (cross-project)
`memory` server (knowledge graph, JSONL) for facts that are useful across several
repos/projects: preferences, conventions, global architecture.

> Decision: **do I need it in another project?** → MCP `memory`.
> **is it about this repo?** → `.orchestrator/memory/`.
> Detail in `.opencode/skills/context-memory/SKILL.md`.

### 5.4 Error memory (global, no files in the project)

A plugin (`error-memory`) listens for the end of every tool and, **if it failed**,
stores it **outside the repository**, in a global store:

```text
~/.config/opencode/orchestrator/
├── rules.md      # curated rules · loaded as `instructions` (cached prompt)
├── auto.md       # digest of recurring errors · read ON DEMAND, not always-on
└── errors.jsonl  # raw log (append-only, with the project of origin)
```

It detects both forms of failure: `status: "error"` and a shell command with
`exit != 0` (which arrives as `status: "completed"`). Equivalent errors share a
**signature** (normalized message) and are counted instead of duplicated.

**Nothing is written inside the project**, so you can't commit stray files by
accident. A new error becomes a rule with `/errores`.

### 5.5 Resource optimization (less time and reasoning)

From cheapest to most expensive; always use the cheapest that works:

| Cost | Mechanism | Use |
| --- | --- | --- |
| **0** | `rules.md` via `instructions` | Already in the prompt (cached): it is **not "read"**. `auto.md` is read on demand |
| **0** | `AGENTS.md` and skill descriptions | Stable rules; cached prefix |
| **Low** | One `execute` call that returns a digest | Groups reads/searches in 1 step |
| **Medium** | Subagent with fresh context | Heavy reading; the parent receives only the summary |
| **High** | Reading many files in the main thread | Avoid it |

Keys applied in this workshop:

- **Rules in cache, not in a loop**: `rules.md` lives in the prompt
  (`instructions`), not in a file the agent must open every turn. The **volatile**
  digest `auto.md` is deliberately *not* always-on — it is read only when needed,
  so a simple "hello" doesn't pay for it.
- **One intention, one call**: `execute` for several independent reads.
- **Don't reopen** files with the same hash (`files.md`).
- **Delegate** bulk reading to `explore`/`researcher` with bounded output.
- **Only go up a tier if needed** (over-reasoning on something trivial is the
  biggest waste).
- **`warming` disabled** by default (only useful in long sessions with pauses).

#### Measured fixed cost (real data, from OpenCode's own store)

Every request pays a fixed prompt before doing any work. Measured by reading
the `tokens` field of each session message in `opencode.db`:

| Path | Input tokens (cold) | Note |
| --- | ---: | --- |
| `ask` agent, `hola` | **4,840** | Light primary, no orchestration |
| `orchestrator`, `hola` | **7,193** | Full flow, more tool schemas |

Where the fixed prompt goes (measured/derived):

- **Code Mode catalog ≈ 2.1k tokens** (browser 45 tools, context7, memory,
  opencode). It is **budget-limited to ~12 signatures (~8.5 KB)** and
  redistributes them across namespaces, so **disconnecting an MCP barely saves
  anything** (measured: −19 tokens for context7; only its `mcp_instructions`,
  ~170 tokens, disappear). Removing MCPs is *not* a real lever.
- **Agent system prompt**: `orchestrator.md` (~1.2k) vs `ask.md` (~0.15k).
- **Tool schemas**: denying unused tools shrinks the prompt; the `ask` agent
  denies `edit`/`subagent`, which is most of the ~2.3k gap vs `orchestrator`.
- **`AGENTS.md`** (global + project) ≈ 0.7k.
- Base system prompt + native tool schemas: the rest.

Practical rules:

- For questions/chat use the **`ask` agent** or `/ask`; it saves ~2.4k per call
  versus the orchestrator.
- **Prompt cache** makes repeat turns almost free: a warm turn shows
  `input ≈ 47` with `cache.read ≈ 50k`.
- The reasoning level (`#high` vs `#xhigh`) changes generated reasoning tokens,
  not the ~5–7k fixed input.

> Note on `instructions`: in this V2 build the config entries were **not present
> in the assembled prompt** — verified through the HTTP API
> (`/instructions/entries` was empty) and the session store (the
> `core/instructions` blob held only the two `AGENTS.md`). After this change only
> `rules.md` is declared there and `auto.md` moved to on-demand. Re-verify after
> a restart whether the `instructions` entries load at all in your build.

---

## 6. MCP

- **context7** (remote/OAuth): up-to-date library documentation.
- **memory** (local): persistent knowledge graph.
- **notes-server** (`mcp/notes-server/`): own example MCP, no dependencies,
  exposes the project memory.
- Ready examples (commented out): `sequential-thinking`, `playwright`, `github`.

Full guide in `.opencode/skills/mcp-builder/SKILL.md`. On Windows, local MCPs
that use npx are launched as `["cmd", "/c", "npx", ...]`.

---

## 7. Installation

### In this project (already works here)
Just have this directory as the workspace: OpenCode discovers `.opencode/` and
`opencode.jsonc`.

### Global (for all projects)
```powershell
pwsh -File .\install.ps1
```
Copies agents/commands/skills to `~/.config/opencode/`, generates the global
config adjusting the memory path, and backs up any previous `opencode.jsonc`.

Then, in OpenCode:
- The default primary agent is **orchestrator**.
- Run **`/mcps`** and sign in to **context7**.
- The **memory** server should appear connected.

---

## 8. Quick usage

| Command | What it does |
| --- | --- |
| `/orq <task>` | Full flow (classify → plan → execute → verify) |
| `/ask <question>` | Quick answer with the light agent (no orchestration) |
| `/plan-quick` `/plan-deep` `/plan-long` | Force a planner tier |
| `/build <task>` | Implement with the main creator |
| `/review` | Independent critical review |
| `/research <topic>` | Research + synthesis |
| `/catalogo` | See models and roles |
| `/memory-init` | Create the project memory |
| `/errores` | Turn logged errors into rules |
| `/modelos` | See families, cooldowns, and per-role fallback |

You can also just talk normally: the orchestrator decides on its own. For a
quick question that needs no orchestration, switch to the **`ask`** agent or use
`/ask`.

---

## 9. Structure

```text
ORCHESTRATOR/
├── opencode.jsonc            # model, permissions, MCP, compaction, worktree
├── AGENTS.md                 # project rules
├── install.ps1               # global install
├── global/AGENTS.md          # global instructions
├── .opencode/
│   ├── agents/               # 12 agents
│   ├── commands/             # 12 commands
│   ├── skills/               # model-router, context-memory, parallel-dispatch, mcp-builder
│   └── plugins/              # error-memory (errors) + model-fallback (rotation)
├── orchestrator/             # rules.md (rules) + models.json (families and chains)
├── .orchestrator/memory/      # project memory (INDEX, map, files, decisions, glossary)
├── tools/                    # memory-digest.mjs, models-status.mjs (one call each)
└── mcp/notes-server/         # own example MCP (no dependencies)
```

On install (global) it also creates the store
`~/.config/opencode/orchestrator/` (`rules.md`, `auto.md`, `errors.jsonl`,
`models.json`, `model-cooldown.json`), which **does not live inside any project**.

---

## 10. Notes and limits

- OpenCode's root `model` **does not keep the variant**; pin it with the agent,
  a command, or `/models`.
- DeepSeek/GLM/MiMo have **200k** of context: to dump many reads, use the 1M ones
  (longcat, nemotron-ultra, space-bunny).
- Free models may have **usage/rate limits** and change without warning — they
  also **disappear**: `muse-spark-1.3-contributor-free` was removed mid-project,
  which makes any agent pinned to it fail to start. Re-check the catalog with
  `/catalogo` (or `/modelos`) after an outage and repoint the affected agent in
  its `.md` **and** in `orchestrator/models.json`.
- On Windows, `npx.ps1` is blocked by execution policy: local MCPs must use
  `cmd /c npx`.
- `warming` is disabled by default (consumes requests).
- Project memory is as good as its discipline: if it is not updated, it lies.
  Delete it rather than drag it along.

## 11. Scope: global vs. project (and what happens in a blank folder)

There are **two layers** and it pays not to confuse them:

| Layer | Where it lives | Applies to |
| --- | --- | --- |
| **Global** | `~/.config/opencode/` (`opencode.jsonc`, `AGENTS.md`, `agents/`, `commands/`, `skills/`, `plugins/`, `orchestrator/`) | **Every** folder where you open OpenCode |
| **Project** | `<project>/opencode.jsonc` and `<project>/.opencode/` | Only that project (overrides global) |
| **Data** | `~/.config/opencode/orchestrator/` (errors, cooldown, rules) and `~/.config/opencode/memory/graph.jsonl` | Global, shared across projects |

**If you open a blank folder** (with no `opencode.jsonc` of its own) you already
have everything: orchestrator, subagents, commands (`/orq`, `/modelos`…), skills,
both plugins (errors and model rotation), the rules in the prompt, and the MCPs
(`context7`, `memory`). The only thing that does **not** exist is the project's
local memory (`.orchestrator/memory/`), which is optional and created with
`/memory-init`.

The `ORCHESTRATOR/` repo is only the **source + installer**: once installed
globally, you don't need to work inside it. Nothing is written into your projects
except:
- what you decide (e.g. `/memory-init` creates `.orchestrator/memory/` with a
  `.gitignore` that self-ignores it), and
- worktrees, if you use them (`worktree.directory` is relative to the project).

## 12. How to share it with others

The repo (or a zip of it) is self-contained and **carries no secrets**:
`service.json` and credentials stay on each person's machine.

Steps for another person:

1. Have **OpenCode V2** and **Node** (for the local MCPs and the scripts).
2. Copy/clone the `ORCHESTRATOR/` folder.
3. Run the installer (it adapts absolute paths to *their* `$env:USERPROFILE`):

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```

   It installs agents, commands, skills, plugins, the model manifest, and the
   rules; and generates their global config (backing up whatever they had).
4. Sign in to Context7 the first time (`/mcps` or `/mcp`), because it is a remote
   MCP with authentication.

Coexistence notes:

- If the other person **already had** a global `AGENTS.md`, the installer **does
  not overwrite it**: they must merge the lines from `global/AGENTS.md` by hand.
- Re-running the installer **updates** agents/commands/skills/plugins and
  `models.json`, but **preserves** your rules (`orchestrator/rules.md`) and your
  global `AGENTS.md`. To "update", just run it again after a `pull`.
- The installer is **PowerShell (Windows)**. On macOS/Linux you have to replicate
  the same steps (copy to `~/.config/opencode/` and adjust `MEMORY_FILE_PATH`);
  treat that port as a pending `install.sh`.
- To customize: add your rules to
  `~/.config/opencode/orchestrator/rules.md`, your own chains to
  `models.json`, and your cross-project facts to the MCP memory.

## 13. Design principles (borrowed from real frameworks)

The workflow and the token budget are based on evidence from working
multi-agent projects — OpenCode Swarm, OpenGiraffe, Fable Orchestrator, the
Claude Code orchestration kit — and Anthropic's context-engineering guide. Full
write-up: [`docs/research.md`](docs/research.md).

- **Slim always-on text, detail on demand.** `AGENTS.md` files hold only rules;
  the rationale lives in `docs/` (never loaded) and in skills (loaded only when
  used).
- **Everything always-on is paid by every subagent too**, so the instruction
  files stay short.
- **Only the agent that edits can edit.** Planners, `critic`, `researcher` and
  `vision` are read-only; their denied tools also drop out of the prompt.
- **Workers cannot spawn workers.** `subagent` is denied for all 10 workers;
  only `orchestrator` delegates.
- **Bounded output.** Reports are ≤40 lines; long verbatim goes to
  `.orchestrator/scratch/` (git-ignored) and the report carries the path.
- **Batch the mechanical work.** Five reads/searches are one call with a
  checklist, not five subagents.
- **State in files, not in the chat** (`.orchestrator/memory/`), so agents share
  facts without inflating the conversation.
- **Different model families for make vs. verify** (`creator` vs. `critic`).

What we deliberately do **not** copy (tmux panes, extra budget-guard plugins,
large agent rosters) is listed at the end of [`docs/research.md`](docs/research.md).

## 14. Possible next steps

- Add `playwright`/`github` (MCP) as needed.
- Automate `map.md`/`files.md` with a `git hook` or plugin.
- Try `warming` for long sessions with pauses.
- Explore worktrees for real write parallelism.
