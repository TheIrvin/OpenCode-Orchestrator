---
description: Start the full orchestration flow for a task
agent: orchestrator
model: opencode/beam-free#xhigh
subagent: false
---

Assume the **orchestrator** role and solve this task end to end:

$ARGUMENTS

Follow your mandatory flow: classify the size (S/M/L/XL), load the `model-router` skill to choose the planner tier, review the project memory (`.orquestador/memory/INDEX.md`), launch the needed subagents (in parallel when independent), verify with `critic`, and deliver the final result with touched files and next steps.
