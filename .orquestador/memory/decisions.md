# Decisiones

Formato: fecha · decisión · motivo · alternativas descartadas.

- 2026-10-16 · Orquestador = `beam-free#xhigh` · 1M de contexto y razonamiento
  máximo para coordinar · se descartó Space Bunny como primario para reservarlo
  al planeador profundo.
- 2026-10-16 · Planeador en tiers (fast/medio/deep/long) · el coste de
  razonamiento se ajusta al tamaño del problema · se descartó un único planeador.
- 2026-10-16 · Crítico con `muse-spark` (familia distinta) · evitar el sesgo
  compartido con el creador (`deepseek`/`glm`).
- 2026-10-16 · Memoria en dos capas · `.orquestador/memory/` para el repo y MCP
  `memory` para hechos cross-proyecto.
