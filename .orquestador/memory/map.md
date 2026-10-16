# Mapa del proyecto

## Módulos

| Módulo | Ruta | Propósito |
| --- | --- | --- |
| Configuración | `opencode.jsonc` | Modelo por defecto, permisos, MCP, compactación |
| Agentes | `.opencode/agents/` | Orquestador, planeadores, creadores, crítico, etc. |
| Comandos | `.opencode/commands/` | Atajos `/orq`, `/plan-*`, `/build`, `/review`, … |
| Skills | `.opencode/skills/` | Router de modelos, memoria, paralelismo, MCP |
| Memoria | `.orquestador/memory/` | Contexto persistente del proyecto |
| Errores (global) | `~/.config/opencode/orquestador/` | Reglas, digest y registro; fuera del repo |
| Plugin errores | `.opencode/plugins/error-memory.ts` | Captura automática de fallos (escribe en global) |
| Catálogo modelos | `orquestador/models.json` | Familias + cadenas de respaldo por rol |
| Plugin fallback | `.opencode/plugins/model-fallback.ts` | Rota de modelo ante fallo de proveedor |
| Utilidades | `tools/` | `memory-digest.mjs`, `models-status.mjs` (una llamada) |

## Entradas principales

- `AGENTS.md` — reglas del proyecto.
- `README.md` — arquitectura y uso.
- `install.ps1` — instala el sistema en `~/.config/opencode`.

> Rellena esto con la estructura real del proyecto en el que trabajes.
