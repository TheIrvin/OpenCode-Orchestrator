# Project memory — index

Read this file **first**. If the map covers what you need, don't scan the
repository again.

- Module and key-file map: `map.md`
- Reviewed files (git hash + summary): `files.md`
- Decisions and why: `decisions.md`
- Domain glossary: `glossary.md`
- Errors and rules: **global**, in `~/.config/opencode/orquestador/`
  (`rules.md`, `auto.md`, `errors.jsonl`) — never inside the project
- Model families and chains (fallback/rotation): `models.json` (same dir)
- MCP memory graph (cross-project facts): `graph.jsonl`
- Last update: 2026-10-16

## How to use this memory

1. Before reading a file, check its hash: `git hash-object <file>`.
   If it matches `files.md`, trust the summary.
2. After learning something new, update `map.md`/`files.md`/`decisions.md`.
3. Facts that are useful in other projects → MCP `memory` (not here).
