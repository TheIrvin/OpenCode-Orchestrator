# ORCHESTRATOR — instrucciones del proyecto

Configuración de orquestación multi-agente para OpenCode. El detalle
(arquitectura, porqués, tablas) está en `README.md`; esto es solo del repo.

## Específico de este proyecto

- **El repo es la fuente.** Agentes/comandos/skills/plugins viven en
  `.opencode/`; la config global la genera `install.ps1`.
- **No infles el prefijo fijo:** todo lo que se añade a un agente o a estas
  instrucciones se paga en cada llamada y en cada subagente. Mide con
  `/catalogo` antes de añadir.
- **Memoria del proyecto:** `.orchestrator/memory/` (empieza por `INDEX.md`). Lo
  volátil está en `.gitignore`.
- **Rutas globales:** `~/.config/opencode/orchestrator/` (`rules.md`,
  `auto.md`, `models.json`).
- **Idioma:** documentación en inglés; código, agentes, comandos y prosa del
  proyecto en español.

Las reglas de trabajo las trae el `AGENTS.md` global; no las repitas aquí.
