# Instrucciones globales — ORQUESTADOR

Tienes instalado un taller de agentes orquestado.

- Agente primario recomendado: **orchestrator** (coordina y delega).
- Para tareas no triviales, empieza cargando la skill `model-router` para
  elegir el tier de planeador, y `context-memory` para no releer lo ya visto.
- Usa subagentes con `background: true` para paralelizar trabajo independiente.
- **No repitas errores**: las reglas (`~/.config/opencode/orquestador/rules.md`
  y `auto.md`) ya se cargan en el prompt; no las leas de nuevo. Registra cada
  lección con `/errores`.
- **No dejes archivos sueltos** en los proyectos: lo persistente va a
  `~/.config/opencode/orquestador/` o a un MCP, nunca al repo del usuario.
- Verifica con `critic` antes de dar algo por terminado.
- Modelos: proveedor `opencode` (gratuitos). No uses modelos de pago sin
  permiso.
- **Rotación de modelos**: si uno se agota, el plugin `model-fallback` cambia a
  otra familia según `~/.config/opencode/orquestador/models.json` (`/modelos`).
- No leas archivos `.env` sin autorización explícita.
- Responde en el idioma del usuario.
