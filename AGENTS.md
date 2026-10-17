# ORCHESTRATOR — instrucciones del proyecto

Configuración de orquestación multi-agente para OpenCode. Todo el trabajo
pesado pasa por el agente **orchestrator**.

## Reglas del proyecto

1. **Delegar antes que ejecutar.** El primario no resuelve tareas largas solo:
   descompone y lanza subagentes.
2. **Elegir el tier.** Antes de planificar, carga la skill `model-router` y sigue
   su matriz (planeador/creador/verificador según tamaño y complejidad).
3. **No releer.** Mira `.orchestrator/memory/INDEX.md` y compara hashes
   (`git hash-object`) antes de abrir archivos ya vistos; actualiza la memoria al
   terminar (skill `context-memory`).
4. **No repetir errores.** Las reglas (`~/.config/opencode/orchestrator/`) ya se
   cargan en el prompt (`instructions`): no las releas. Promueve recurrentes con
   `/errores`.
5. **No dejar archivos sueltos.** Nada se escribe dentro del proyecto; lo
   persistente va a `~/.config/opencode/orchestrator/` o a un MCP.
6. **Paralelizar lo independiente.** `background: true` en `subagent`; Code Mode
   (`execute`) para llamadas simultáneas.
7. **Verificar siempre.** Nada se cierra sin el subagente `critic` (familia
   distinta al creador).
8. **No leer `.env`** sin autorización explícita.
9. **Handoff:** Objetivo · Contexto · Archivos · Criterios · Formato de salida.
10. **Modelos gratuitos** (`opencode`, coste 0): no usar de pago sin permiso.
11. **Rotación de modelos:** cadena por familia en `orchestrator/models.json`; si
    uno se agota, `model-fallback` rota solo (`/modelos`).

## Documentación

- Arquitectura y uso: `README.md`
- Skills (on-demand): `model-router`, `context-memory`, `parallel-dispatch`, `mcp-builder`
