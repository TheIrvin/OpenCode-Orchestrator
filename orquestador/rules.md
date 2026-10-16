# Working rules (don't repeat failures)

> This file is loaded as `instructions` into the **cached prefix** of the
> prompt, so there is **no need to "read" it** with tools: it is already in
> context. Only add short, actionable rules here. Recurring errors
> are summarized automatically in `auto.md`.

## Environment

- **Windows/PowerShell**: don't use `node -e` with nested quotes; write a
  `.mjs` file and run it. Paths with spaces go in double quotes.
- **`npx`**: on Windows use `cmd /c npx ...` (`npx.ps1` is blocked).
- **JSON/JSONC**: write **without BOM** (a BOM breaks `JSON.parse`). When stripping
  comments, respect strings (`//` inside a URL is not a comment).

## Editing

- Use `edit` with a unique `oldString` plus enough context; if it fails, widen the
  context or use `replaceAll`. Don't rewrite the whole file blindly.
- One change = the minimum that meets the acceptance criteria. No new dependencies
  without justification.

## Process

- Before reading a file: if it is in memory with the same hash, don't re-read it.
- Before running or retrying something that failed: check `auto.md`/memory.
- Close out with: changes, real verification (command + result), and pending items.
