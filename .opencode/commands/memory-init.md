---
description: Create the project's persistent memory in .orquestador/memory/
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Initialize the project's persistent memory. Create, if missing, these files with exactly this initial structure (fill in what you already know about the repo; do not invent):

`.orquestador/memory/INDEX.md`
```md
# Project memory — index

- Module map: `map.md`
- Reviewed files: `files.md`
- Decisions: `decisions.md`
- Glossary: `glossary.md`
- Last updated: <date>
```

`.orquestador/memory/map.md` → "Modules" and "Main entry points" sections.
`.orquestador/memory/files.md` → table `| File | Hash (git) | Summary | Reviewed |`.
`.orquestador/memory/decisions.md` → decisions with date and reason.
`.orquestador/memory/glossary.md` → domain terms.

If the directory already exists, do not overwrite it: report its status.
