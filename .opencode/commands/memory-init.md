---
description: Crea la memoria persistente del proyecto en .orchestrator/memory/
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Inicializa la memoria persistente del proyecto. Crea, si no existen, estos
archivos con exactamente esta estructura inicial (rellena lo que ya sepas del
repo; no inventes):

`.orchestrator/memory/INDEX.md`
```md
# Memoria del proyecto — índice

- Mapa de módulos: `map.md`
- Archivos revisados: `files.md`
- Decisiones: `decisions.md`
- Glosario: `glossary.md`
- Última actualización: <fecha>
```

`.orchestrator/memory/map.md` → sección "Módulos" y "Entradas principales".
`.orchestrator/memory/files.md` → tabla `| Archivo | Hash (git) | Resumen | Revisado |`.
`.orchestrator/memory/decisions.md` → decisiones con fecha y motivo.
`.orchestrator/memory/glossary.md` → términos del dominio.

Si el directorio ya existe, no lo sobrescribas: informa de su estado.
