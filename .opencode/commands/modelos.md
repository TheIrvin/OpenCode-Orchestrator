---
description: Ver familias de modelos, cuáles están en cooldown y el respaldo por rol
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Muestra el estado de los modelos gratuitos y calcula una cadena de respaldo.
Todo está en el almacén global (`~/.config/opencode/orquestador/`):

1. Ejecuta `node tools/models-status.mjs` (una sola llamada) y lee su salida.
   Si el script no está en el proyecto, lee directamente
   `~/.config/opencode/orquestador/models.json` y `model-cooldown.json`.
2. Presenta en una tabla: **modelo · familia · estado** (disponible / en cooldown
   con segundos restantes).
3. Para cada rol, indica el **modelo sano** actual (primer modelo de su cadena que
   no está en cooldown), evitando repetir la familia que falló.
4. Recuerda que el plugin `model-fallback` rota solo: esto es solo visibilidad.
5. Si la cuota ya se restableció y quieres reactivar todos los modelos, borra
   `~/.config/opencode/orquestador/model-cooldown.json` (o edítalo para vaciarlo).

Matiz a detallar si el usuario lo pide: $ARGUMENTS
