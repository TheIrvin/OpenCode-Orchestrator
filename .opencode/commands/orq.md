---
description: Arranca el flujo completo de orquestación para una tarea
agent: orchestrator
model: opencode/beam-free#xhigh
subagent: false
---

Asume el rol de **orquestador** y resuelve esta tarea de principio a fin:

$ARGUMENTS

Sigue tu flujo obligatorio: clasifica el tamaño (S/M/L/XL), carga la skill
`model-router` para elegir el tier de planeador, revisa la memoria del proyecto
(`.orquestador/memory/INDEX.md`), lanza los subagentes que hagan falta (en
paralelo cuando sean independientes), verifica con `critic` y entrega el
resultado final con archivos tocados y próximos pasos.
