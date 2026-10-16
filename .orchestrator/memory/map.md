# Project map

## Modules

| Module | Path | Purpose |
| --- | --- | --- |
| Configuration | `opencode.jsonc` | Default model, permissions, MCP, compaction |
| Agents | `.opencode/agents/` | Orchestrator, planners, creators, critic, etc. |
| Commands | `.opencode/commands/` | Shortcuts `/orq`, `/plan-*`, `/build`, `/review`, … |
| Skills | `.opencode/skills/` | Model router, memory, parallelism, MCP |
| Memory | `.orchestrator/memory/` | Persistent project context |
| Errors (global) | `~/.config/opencode/orchestrator/` | Rules, digest, and log; outside the repo |
| Error plugin | `.opencode/plugins/error-memory.ts` | Automatic failure capture (writes to the global store) |
| Model catalog | `orchestrator/models.json` | Families + per-role fallback chains |
| Fallback plugin | `.opencode/plugins/model-fallback.ts` | Rotates model on provider failure |
| Utilities | `tools/` | `memory-digest.mjs`, `models-status.mjs` (one call each) |

## Main entry points

- `AGENTS.md` — project rules.
- `README.md` — architecture and usage.
- `install.ps1` — installs the system into `~/.config/opencode`.

> Fill this in with the real structure of the project you work on.
