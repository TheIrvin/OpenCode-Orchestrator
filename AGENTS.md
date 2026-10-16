# ORQUESTADOR — instrucciones del proyecto

Este repositorio contiene una configuración de orquestación multi-agente para
OpenCode. Todo el trabajo pesado debe pasar por el agente **orchestrator**.

## Reglas del proyecto

1. **Delegar antes que ejecutar.** El agente primario no resuelve tareas largas
   por sí mismo: descompone y lanza subagentes.
2. **Elegir el tier correcto.** Antes de planificar, carga la skill
   `model-router` y sigue su matriz de decisión para elegir planeador, creador
   y verificador según el tamaño/complejidad del problema.
2b. **No releer sin necesidad.** Lee primero `.orquestador/memory/INDEX.md` y
   compara hashes (`git hash-object`) antes de abrir archivos ya revisados.
   Actualiza la memoria al terminar (skill `context-memory`).
2c. **No repetir errores.** Las reglas viven en
   `~/.config/opencode/orquestador/` y se cargan solas en el prompt
   (`instructions`): **no las leas otra vez**. Cada fallo se registra solo
   (plugin `error-memory`, fuera del proyecto). Promueve recurrentes a reglas
   con `/errores`.
2d. **No dejar archivos libres.** El sistema no escribe nada dentro de los
   proyectos trabajados. Si algo debe persistir, va a un directorio global
   (`~/.config/opencode/orquestador/`) o a un MCP; nunca sueltes archivos en el
   repo del usuario.
3. **Paralelizar lo independiente.** Usa `background: true` en el tool
   `subagent` para lanzar varios hijos a la vez, y Code Mode (`execute`) para
   llamadas de herramientas independientes.
4. **Verificar siempre.** Ninguna tarea se declara terminada sin pasar por el
   subagente `critic` (modelo de familia distinta al creador).
5. **No leer `.env`** salvo autorización explícita.
6. **Convención de traspaso (handoff)** entre agentes: Objetivo · Contexto ·
   Archivos · Criterios de aceptación · Formato de salida.
7. **Modelos gratuitos.** Todos los agentes usan el proveedor `opencode`
   (modelos free, coste 0). No introduzcas modelos de pago sin permiso.
8. **Rotación de modelos.** Cada rol tiene una cadena de respaldo por familias
   (`orquestador/models.json`). Si un modelo se agota, el plugin `model-fallback`
   rota solo; consulta `/modelos`. No insistas con un modelo caído.

## Documentación

- Plan y arquitectura: `README.md`
- Matriz de modelos y cambio automático: `.opencode/skills/model-router/SKILL.md`
- Contexto, memoria y anti-relectura: `.opencode/skills/context-memory/SKILL.md`
- Paralelismo y worktrees: `.opencode/skills/parallel-dispatch/SKILL.md`
- MCP (usar y crear): `.opencode/skills/mcp-builder/SKILL.md`
