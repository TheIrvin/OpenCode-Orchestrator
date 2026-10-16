---
name: Model Router
description: Matrix for choosing the right subagent and reasoning level based on the size and nature of the problem. Load it before planning or dispatching work.
---

# Model router (OpenCode free catalog)

Provider: `opencode` (all models are **free**, cost 0). The
`#variant` is the **reasoning effort**; more effort = slower and
deeper. Not all models expose all variants.

## Real catalog (verified)

| Model (ID) | Context | Output | Vision | Variants |
| --- | ---: | ---: | --- | --- |
| `opencode/nemotron-3.5-super-vl-free` | 1.05M | 131k | imagen | none, minimal, low, medium, high, xhigh |
| `opencode/beam-free` | 1.05M | 131k | — | low, medium, high, xhigh, max |
| `opencode/longcat-2.5-preview-free` | 1M | 131k | image | (none) |
| `opencode/space-bunny-free` | 1.05M | 524k | image, video | low, medium, high, xhigh, max |
| `opencode/mimo-v2.6-flash-free` | 200k | 32k | image, audio, video | (none) |
| `opencode/deepseek-v4.1-flash-free` | 200k | 32k | image | low, high, max |
| `opencode/muse-spark-1.3-contributor-free` | 1.05M | 131k | image, video, PDF, audio | minimal, low, medium, high, xhigh |
| `opencode/glm-5.3-flash-free` | 200k | 32k | image, video, PDF | low, high, max |
| `opencode/nemotron-3.5-lightning-free` | 262k | 262k | — | (none) |
| `opencode/nemotron-3-ultra-free` | 1M | 128k | — | (none) |
| `opencode/big-pickle` | 200k | 32k | — | (none) |

## How model switching applies

Each subagent already comes with its model and variant pinned in its definition. **Choosing the right tier IS the automatic model switch.** The orchestrator does not change a child's model mid-flight: it picks the right child from the start.

| Need | Subagent | Resulting model |
| --- | --- | --- |
| Coordinate, decide, consolidate | `orchestrator` | `beam-free#xhigh` |
| Small plan (1–2 files) | `planner-fast` | `big-pickle` |
| Medium plan (one module) | `planner` | `space-bunny-free#high` |
| Complex plan (tradeoffs, risk) | `planner-deep` | `space-bunny-free#max` |
| Large plan (migration, architecture) | `planner-long` | `nemotron-3-ultra-free` |
| Map/search the repo quickly | `explore` | `nemotron-3.5-lightning-free` |
| Research web/docs/synthesis | `researcher` | `longcat-2.5-preview-free` |
| Write code | `creator` | `deepseek-v4.1-flash-free#high` |
| Parallel code / second version | `creator-alt` | `glm-5.3-flash-free#high` |
| Verify (different family) | `critic` | `muse-spark-1.3-contributor-free#high` |
| View images/PDF | `vision` | `nemotron-3.5-super-vl-free#high` |
| Document | `docs` | `muse-spark-1.3-contributor-free#medium` |

## Fallback chains (rotation when a model is exhausted)

Free models get exhausted **by family** (sometimes all models from the same origin go down, e.g. NVIDIA ones). That is why each role has an **ordered chain** that jumps to another family. Single source:
`~/.config/opencode/orquestador/models.json` (in the repo: `orquestador/models.json`).

| Role | 1st (preferred) | 2nd | 3rd | 4th |
| --- | --- | --- | --- | --- |
| `orchestrator` | `beam-free#xhigh` | `space-bunny-free#high` | `muse-spark…#high` | `longcat-2.5` |
| `creator` | `deepseek-v4.1#high` | `glm-5.3#high` | `space-bunny#high` | `mimo-v2.6` |
| `creator-alt` | `glm-5.3#high` | `deepseek-v4.1#high` | `mimo-v2.6` | `space-bunny#high` |
| `critic` | `muse-spark#high` | `space-bunny#high` | `longcat-2.5` | `glm-5.3#high` |
| `planner-fast` | `big-pickle` | `nemotron-lightning` | `deepseek-v4.1#low` | `mimo-v2.6` |
| `planner` | `space-bunny#high` | `muse-spark#high` | `glm-5.3#high` | `longcat-2.5` |
| `planner-deep` | `space-bunny#max` | `muse-spark#xhigh` | `glm-5.3#max` | `nemotron-ultra` |
| `planner-long` | `nemotron-ultra` | `longcat-2.5` | `space-bunny#xhigh` | `muse-spark#high` |
| `explore` | `nemotron-lightning` | `big-pickle` | `mimo-v2.6` | `deepseek-v4.1#low` |
| `researcher` | `longcat-2.5` | `muse-spark#high` | `space-bunny#high` | `nemotron-ultra` |
| `vision` | `nemotron-super-vl#high` | `muse-spark#high` | `mimo-v2.6` | `glm-5.3#high` |
| `docs` | `muse-spark#medium` | `longcat-2.5` | `space-bunny#medium` | `glm-5.3#high` |

**Automatic:** the `model-fallback` plugin detects a provider failure
(`429`, `404`, `5xx`, "unavailable"/"quota"...), marks that model as *cooldown*
and switches the session to the next model in the chain, **preferring a
different family**. So if NVIDIA runs out, the session continues with
DeepSeek/Zhipu/etc.

**Manual:** with `/modelos` you see what is in cooldown and which model is
healthy per role. If the orchestrator launches a subagent and its model is
down, pick the available tier from the same chain.

> Do not rotate models "just because" on every call: that breaks prompt caching
> and coherence. **Rotate only when the current one fails.**

## Decision matrix (size → planner tier)

Classify the work first:

- **S** — 1–2 files, no ambiguity, obvious change → `planner-fast`. Skip
  `explore` if the file is known (use memory).
- **M** — one module, a scoped refactor, minor decisions → `planner`.
- **L** — several modules, coordination needed → `planner-deep`.
- **XL** — migration, architecture, many files, phases → `planner-long`.

Signals that move **up** a tier (always escalate when they appear):

- More than ~3 files affected.
- Design decisions with real tradeoffs.
- High regression risk or data/security involved.
- Ambiguous or contradictory requirements.
- Work that does not fit in a single pass.

Signals that move **down** a tier:

- Trivial, mechanical, repetitive change.
- A prior plan already exists in the project memory.

## Golden rules

1. **Never use the expensive planner for the trivial** (nor vice versa).
2. **The creator is never the same model as the critic** (different families).
3. **DeepSeek/GLM/MiMo have 200k** of context: to dump many reads,
   use `longcat`/`nemotron-ultra`/`space-bunny`/`muse-spark` (1M).
4. **Vision**: images→`nemotron-super-vl`; audio/video→`mimo` or `muse-spark`;
   PDF→`muse-spark` or `glm`.
5. If a tier falls short, **reassign to the next higher tier**, do not
   repeat the same attempt.
6. To pin a variant in the primary session use `/models` or a command with
   `model:` (e.g. `/plan-deep`); the root `model` does not preserve the variant.
