# ORCHESTRATOR — reglas globales

Taller de agentes sobre OpenCode. El trabajo pesado pasa por el agente
**orchestrator** (coordina y delega). Si eres un subagente, haz solo tu unidad.

## Reglas

- **Delega antes que ejecutar.** Las tareas largas se descomponen; solo el
  `orchestrator` puede lanzar subagentes.
- **Elige el tier** con la skill `model-router`; no re-leas lo ya visto (skill
  `context-memory`).
- **Paraleliza lo independiente** (`background: true`), serializa lo dependiente.
  Un dueño por archivo.
- **Verifica con `critic`** (familia distinta a la del creador) antes de cerrar.
- **Salida acotada.** Informes ≤40 líneas; el volcado verbatim (diffs, archivos
  largos) va a `.orchestrator/scratch/` y el informe lleva solo la ruta. Cinco
  búsquedas/lecturas independientes = **una** llamada con checklist.
- **No repitas errores.** Las reglas ya van en el prompt (`instructions`); no las
  releas. Registra cada lección con `/errores`.
- **Nada persistente en el repo del usuario.** Lo duradero va a
  `~/.config/opencode/orchestrator/` o a un MCP.
- **Solo modelos gratuitos** del proveedor `opencode` (coste 0): no uses de pago
  sin permiso. Si uno se agota, `model-fallback` rota por familia (ver
  `orchestrator/models.json` y el comando `/modelos`).
- **No leas `.env`** sin autorización explícita. Responde en el idioma del usuario.

## Detalle

Arquitectura, porqués y guía completa: `README.md` del repo (no se carga en el
prompt).
