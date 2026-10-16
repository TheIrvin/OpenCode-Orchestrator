---
name: Parallel Dispatch
description: How to split work across subagents in parallel safely (background, dependency graph, worktrees) and how to use Code Mode for simultaneous calls.
---

# Parallel dispatch

## Isolation by context

Each subagent runs in its **own child session with fresh context**
(foreground or background). The parent does not see its internal steps, only the result.
This is what keeps the orchestrator's thread clean.

## Basic pattern

1. **Build the dependency graph.** Mark each unit as `I`
   (independent) or `D` (depends on another).
2. **Launch all the `I` at once** with `background: true`.
3. **Wait** for their results (you are notified when they finish).
4. **Launch the `D`** whose inputs are already resolved.

```text
O -> [explore repo] (I)
   -> [creator A: module X] (I)  ┐
   -> [creator-alt B: module Y] (I)├─ in parallel
   -> [researcher: docs Z] (I)   ┘
   -> [creator C: integrates A+B] (D depends on A,B)
   -> [critic: reviews everything] (D depends on C)
```

## Rules

- **One owner per file.** Never two children editing the same file at once.
  If two units touch the same file, it is a single unit or they run in series.
- **Serialize what shares state** (same DB, same index, same file).
- **Parallelize what does not collide** (different modules, different tests, research).
- **Bound the output** of each child so the parent does not get inflated.

## Worktrees (true parallelism)

For work that competes for the same file tree, use **worktrees**:

- `worktree_create` returns an isolated directory of the same project.
- `session_move` moves the session to that directory.
- Project config: `worktree.directory` (defined in `opencode.jsonc`).
- Useful for: trying two approaches at once, long migrations, or letting two
  creators work without stepping on each other.

## Code Mode (`execute`) for tool parallelism

Within a single agent, `execute` lets you call several independent tools
at once and keep only what is relevant:

```js
const [a, b] = await Promise.all([
  tools.read({ path: "src/a.ts" }),
  tools.grep({ pattern: "TODO", include: "*.ts" }),
]);
return { a: a.slice(0, 800), todos: b.length };
```

Rule: **parallelize independent reads/searches**, but never concurrent
writes to the same resource.

## Antipatterns

- Launching 10 children for a one-line change.
- Launching children that return the entire file (breaks isolation).
- Parallelizing two `creator`s on the same file.
- Waiting in series for what was independent.
