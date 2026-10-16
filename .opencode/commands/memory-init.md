---
description: Crea la memoria persistente del proyecto en .orquestador/memory/
agent: orchestrator
model: opencode/beam-free#high
subagent: false
---

Inicializa la memoria persistente del proyecto. Crea, si no existen, estos
archivos con exactamente esta estructura inicial (rellena lo que ya sepas del
repo; no inventes):

`.orquestador/memory/INDEX.md`
```md
# Memoria del proyecto — índice

- Mapa de módulos: `map.md`
- Archivos revisados: `files.md`
- Decisiones: `decisions.md`
- Glosario: `glossary.md`
- Última actualización: <fecha>
```

`.orquestador/memory/map.md` → sección "Módulos" y "Entradas principales".
`.orquestador/memory/files.md` → tabla `| Archivo | Hash (git) | Resumen | Revisado |`.
`.orquestador/memory/decisions.md` → decisiones con fecha y motivo.
`.orquestador/memory/glossary.md` → términos del dominio.

Si el directorio ya existe, no lo sobrescribas: informa de su estado.
