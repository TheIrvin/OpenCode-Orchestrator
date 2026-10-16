---
name: Context & Memory
description: How to persist and reuse context so you don't re-read already reviewed files or re-discover the repo between sessions. Load it at the start of any non-trivial task.
---

# Context and memory (don't re-review what was already reviewed)

A session's context is expensive and is lost when it closes. This workshop combines
OpenCode's native mechanisms with its own **persistent memory**.

## 1. Native mechanisms (free, already configured)

| Mechanism | What it does | How to leverage it |
| --- | --- | --- |
| **Subagents with fresh context** | The heavy reading happens in a child; the parent only receives the summary | Send `explore`/`researcher` to read; don't read 40 files in the main thread |
| **Compaction** | Automatically summarizes the old and keeps the end (`compaction.keep.tokens`) | Tuned to 24k in `opencode.jsonc` |
| **Persistent sessions** | The conversation lives in the local database; it resumes | Continue the session instead of redoing it |
| **Prompt cache + warming** | The provider reuses the stable prefix | Keep instructions stable; enable `warming` if you pause a lot |
| **Skills** | Instructions loaded on demand | They don't inflate the prompt until needed |
| **AGENTS.md / instructions** | Stable and cheap prefix | Project rules, not discoveries |
| **References** | External directories with cache (refresh every 24h) | Other repos/docs without cloning again |
| **Snapshots** | File + conversation undo | Revert experiments without dirtying git |

### Golden rule of isolation
> Read in the subagent, **summarize in the parent**. The orchestrator's thread must
> contain conclusions, not file dumps.

## 2. Project persistent memory (`.orquestador/memory/`)

Versionable directory, readable by humans and agents:

```text
.orquestador/memory/
├── INDEX.md       # minimal hub: always read first
├── map.md         # module and key-file map → purpose
├── files.md       # file → git hash + one-line summary + date
├── decisions.md   # decisions and why (short ADR)
└── glossary.md    # domain terms
```

### Protocol (mandatory)

1. **Before exploring**: read `INDEX.md` (~1 screen). If the map covers what
   you need, **don't scan again**.
2. **Before reading a file**: look up its entry in `files.md`. Compare the
   recorded hash with the current one:
   ```sh
   git hash-object <file>
   ```
   If it matches, **trust the summary** and don't reopen it. If it differs, the file
   changed: read it and update the entry.
3. **After exploring/implementing**: update `map.md`, `files.md` and
   `decisions.md` with what you learned. A one-line summary per file is enough.
4. Keep `files.md` sorted by path and **don't** store full content: only
   path · hash · summary · date.

### `files.md` format

```md
| File | Hash (git) | Summary | Reviewed |
| --- | --- | --- | --- |
| src/api.ts | a1b2c3d | REST endpoints; validates with zod | 2026-10-16 |
```

## 3. MCP memory (graph shared across sessions)

For facts that must survive across projects and agents, use the
**memory** server (knowledge graph, persistent JSONL). It is configured as
local MCP `memory`:

- Store **atomic facts** and relations, not code (code goes in `files.md`).
- Use it for: user preferences, global architecture decisions,
  conventions, "how X is done here".
- Tools: `create_entities`, `add_observations`, `create_relations`,
  `search_nodes`, `read_graph`.

Rule: **Will I need it in another project or session?** → MCP memory.
**Is it about this repo and its code?** → `.orquestador/memory/`.

## 4. Error memory (global, no files in the project)

The `error-memory` plugin (`.opencode/plugins/error-memory.ts`) listens for every
tool failure and stores it **outside the repository**, in a global store:

```text
~/.config/opencode/orquestador/
├── rules.md      # curated rules · loaded as `instructions` (cache)
├── auto.md       # digest of recurring errors · also in `instructions`
└── errors.jsonl  # raw log (append-only, with the project of origin)
```

**Key design points:**

- **Nothing is written inside the project**, so you can't commit junk by
  accident.
- `rules.md` and `auto.md` are declared in `instructions`, meaning they go in the
  **cached prompt prefix**: the model already has them, and **spends no calls or
  reasoning "reading rules"**.
- A shell failure with output `exit != 0` arrives as `status: "completed"` (not
  as `status: "error"`); the plugin detects both cases.
- Equivalent errors share a **signature** (normalized message), so the same kind
  of failure is not duplicated: it is counted.

**Protocol:**

1. **Don't read `rules.md`/`auto.md` "just in case"**: they are already in your
   context. Act.
2. **Before retrying** something that failed, review `auto.md` (you already have
   it) and, if you need the detail, look up the signature in `errors.jsonl`. If it
   already failed the same way, change your approach.
3. **When you learn a lesson**, add it as a short rule to `rules.md` (or use
   `/errores`, which promotes the recurring ones from `auto.md`/`errors.jsonl`).

## 5. Resource optimization (spend less time and reasoning)

Ordered from cheapest to most expensive. Always use the cheapest that works.

| Cost | Mechanism | When |
| --- | --- | --- |
| **0** | `rules.md`/`auto.md` via `instructions` (cached prefix) | Always: it is already in context |
| **0** | `AGENTS.md` and skills | Stable rules; they get cached |
| **Low** | One `execute` call that returns a **digest** | Summarize memory/multi-read in 1 step |
| **Medium** | Subagent with fresh context | Heavy reading work; the parent receives only the summary |
| **High** | Reading many files in the main thread | Avoid it |

Practical rules:

1. **Don't "review the rules"**: they are in the prompt. Reading them again
   spends twice.
2. **One intention, one call**: use `execute` to group independent
   reads/searches and keep only what is relevant.
3. **Don't reopen files with the same hash** (`files.md`).
4. **Delegate bulk reading** to `explore`/`researcher` and ask for bounded
   output.
5. **Only go up a tier if needed** (`model-router` skill): over-reasoning on
   something trivial is the most common waste.
6. **Pre-warm (`warming`) only in long sessions with pauses.**

## 6. Context hygiene

- One objective per session; open a new session for a new topic (avoid dragging
  dead context).
- Ask subagents for **bounded** replies (max N lines / only what was asked).
- Discard what is obsolete: a deleted entry is better than a lie in memory.
- If a subagent will read a lot and return little, that is the right design.
