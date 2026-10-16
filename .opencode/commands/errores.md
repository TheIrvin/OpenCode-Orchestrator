---
description: Convierte los errores registrados (global) en reglas para no repetirlos
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Revisa la memoria **global** de errores y conviértela en reglas accionables.
Todo vive en `~/.config/opencode/orchestrator/` (nunca dentro de un proyecto):

1. Lee `errors.jsonl` (registro crudo) y `auto.md` (digest de recurrentes).
2. Agrupa por `signature` y detecta los que más se repiten.
3. Escribe una **regla corta y accionable** por cada error real en `rules.md`
   (que ya se carga en el prompt): qué NO hacer y qué hacer en su lugar. No
   dupliques reglas existentes.
4. Mantén `rules.md` breve (≈20 líneas); si crece, fusiona o elimina lo obsoleto.
5. Si el error sirve en otros proyectos, guárdalo en la memoria MCP (`memory`).

Tema a priorizar si el usuario lo indica: $ARGUMENTS
