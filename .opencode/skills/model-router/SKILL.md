---
name: Model Router
description: Matriz para elegir el subagente y el nivel de razonamiento correcto según el tamaño y la naturaleza del problema. Cárgala antes de planificar o repartir trabajo.
---

# Router de modelos (catálogo gratuito de OpenCode)

Proveedor: `opencode` (todos los modelos son **gratis**, coste 0). El
`#variant` es el **esfuerzo de razonamiento**; más esfuerzo = más lento y más
profundo. No todos los modelos exponen todas las variantes.

## Catálogo real (verificado)

| Modelo (ID) | Contexto | Salida | Visión | Variantes |
| --- | ---: | ---: | --- | --- |
| `opencode/nemotron-3.5-super-vl-free` | 1.05M | 131k | imagen | none, minimal, low, medium, high, xhigh |
| `opencode/beam-free` | 1.05M | 131k | — | low, medium, high, xhigh, max |
| `opencode/longcat-2.5-preview-free` | 1M | 131k | imagen | (ninguna) |
| `opencode/space-bunny-free` | 1.05M | 524k | imagen, vídeo | low, medium, high, xhigh, max |
| `opencode/mimo-v2.6-flash-free` | 200k | 32k | imagen, audio, vídeo | (ninguna) |
| `opencode/deepseek-v4.1-flash-free` | 200k | 32k | imagen | low, high, max |
| `opencode/muse-spark-1.3-contributor-free` | 1.05M | 131k | imagen, vídeo, PDF, audio | minimal, low, medium, high, xhigh |
| `opencode/glm-5.3-flash-free` | 200k | 32k | imagen, vídeo, PDF | low, high, max |
| `opencode/nemotron-3.5-lightning-free` | 262k | 262k | — | (ninguna) |
| `opencode/nemotron-3-ultra-free` | 1M | 128k | — | (ninguna) |
| `opencode/big-pickle` | 200k | 32k | — | (ninguna) |

## Cómo se aplica el cambio de modelo

Cada subagente ya trae su modelo y variante fijados en su definición. **Elegir
el tier correcto ES el cambio automático de modelo.** El orchestrator no cambia
el modelo de un hijo a mitad de vuelo: elige el hijo adecuado desde el inicio.

| Necesidad | Subagente | Modelo resultante |
| --- | --- | --- |
| Coordinar, decidir, consolidar | `orchestrator` | `beam-free#xhigh` |
| Plan pequeño (1–2 archivos) | `planner-fast` | `big-pickle` |
| Plan medio (un módulo) | `planner` | `space-bunny-free#high` |
| Plan complejo (tradeoffs, riesgo) | `planner-deep` | `space-bunny-free#max` |
| Plan extenso (migración, arquitectura) | `planner-long` | `nemotron-3-ultra-free` |
| Mapear/buscar rápido en el repo | `explore` | `nemotron-3.5-lightning-free` |
| Investigar web/docs/síntesis | `researcher` | `longcat-2.5-preview-free` |
| Escribir código | `creator` | `deepseek-v4.1-flash-free#high` |
| Código paralelo / segunda versión | `creator-alt` | `glm-5.3-flash-free#high` |
| Verificar (otra familia) | `critic` | `muse-spark-1.3-contributor-free#high` |
| Ver imágenes/PDF | `vision` | `nemotron-3.5-super-vl-free#high` |
| Documentar | `docs` | `muse-spark-1.3-contributor-free#medium` |

## Cadenas de respaldo (rotación cuando un modelo se agota)

Los modelos gratuitos se agotan **por familia** (a veces caen todos los de una
misma procedencia, p. ej. los NVIDIA). Por eso cada rol tiene una **cadena
ordenada** que salta a otra familia. Fuente única:
`~/.config/opencode/orchestrator/models.json` (en el repo: `orchestrator/models.json`).

| Rol | 1.º (preferido) | 2.º | 3.º | 4.º |
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

**Automático:** el plugin `model-fallback` detecta un fallo de proveedor
(`429`, `404`, `5xx`, "unavailable"/"quota"...), marca ese modelo en *cooldown*
y cambia la sesión al siguiente modelo de la cadena, **prefiriendo otra
familia**. Así, si se agota NVIDIA, la sesión sigue con DeepSeek/Zhipu/etc.

**Manual:** con `/modelos` ves qué está en cooldown y cuál es el modelo sano por
rol. Si el orchestrator lanza un subagente y su modelo está caído, elige el tier
de la misma cadena que esté disponible.

> No rotes modelos "por gusto" en cada llamada: eso rompe la caché de prompt y
> la coherencia. **Rota solo cuando el actual falla.**

## Matriz de decisión (tamaño → tier de planeador)

Clasifica primero el trabajo:

- **S** — 1–2 archivos, sin ambigüedad, cambio obvio → `planner-fast`. Salta
  `explore` si el archivo es conocido (usa la memoria).
- **M** — un módulo, un refactor acotado, decisiones menores → `planner`.
- **L** — varios módulos, hay que coordinar → `planner-deep`.
- **XL** — migración, arquitectura, muchos archivos, fases → `planner-long`.

Señales que **suben** de tier (escala siempre que aparezcan):

- Más de ~3 archivos afectados.
- Decisiones de diseño con tradeoffs reales.
- Riesgo de regresión alto o datos/seguridad de por medio.
- Requisitos ambiguos o contradictorios.
- Trabajo que no cabe en una sola pasada.

Señales que **bajan** de tier:

- Cambio trivial, mecánico, repetitivo.
- Ya existe un plan previo en la memoria del proyecto.

## Reglas de oro

1. **Nunca uses el planeador caro para lo trivial** (ni viceversa).
2. **El creador nunca es el mismo modelo que el crítico** (familias distintas).
3. **DeepSeek/GLM/MiMo son de 200k** de contexto: para volcar muchas lecturas,
   usa `longcat`/`nemotron-ultra`/`space-bunny`/`muse-spark` (1M).
4. **Visión**: imágenes→`nemotron-super-vl`; audio/vídeo→`mimo` o `muse-spark`;
   PDF→`muse-spark` o `glm`.
5. Si un tier se queda corto, **reasigna al siguiente tier superior**, no
   repitas el mismo intento.
6. Para fijar variante en la sesión primaria usa `/models` o un comando con
   `model:` (p. ej. `/plan-deep`); el `model` raíz no conserva la variante.
