# ORQUESTADOR

Taller de agentes **multi-modelo y en paralelo** para [OpenCode V2](https://opencode.ai/v2/docs/),
construido **solo con modelos gratuitos**. Un agente **orquestador** clasifica
el problema, elige el **planeador** adecuado según su tamaño, reparte el trabajo
entre subagentes en paralelo, verifica con un crítico independiente y guarda el
contexto en una **memoria persistente** para no volver a revisar lo ya visto.

---

## 1. Modelos gratuitos disponibles (verificado)

Todos del proveedor `opencode`, coste **0**. `#variant` = esfuerzo de
razonamiento.

| Modelo | Contexto | Salida | Visión | Variantes | Rol en el taller |
| --- | ---: | ---: | --- | --- | --- |
| **Beam** | 1.05M | 131k | — | low…**max** | Orquestador + general |
| **Space Bunny** | 1.05M | 524k | img, vídeo | low…**max** | Planeador medio/profundo |
| **Nemotron 3 Ultra** | 1M | 128k | — | — | Planeador de horizonte largo |
| **LongCat 2.5 Preview** | 1M | 131k | img | — | Investigador |
| **Muse Spark 1.3** | 1.05M | 131k | img, vídeo, PDF, audio | minimal…**xhigh** | Crítico + docs |
| **Nemotron 3.5 Super VL** | 1.05M | 131k | img | none…**xhigh** | Analista visual |
| **DeepSeek V4.1 Flash** | 200k | 32k | img | low, high, **max** | Creador principal |
| **GLM-5.3-Flash** | 200k | 32k | img, vídeo, PDF | low, high, **max** | Creador alterno |
| **Nemotron 3.5 Lightning** | 262k | 262k | — | — | Búsqueda/exploración rápida |
| **MiMo-V2.6-Flash** | 200k | 32k | img, audio, vídeo | — | Multimodal (audio/vídeo) |
| **Big Pickle** | 200k | 32k | — | — | Planeador rápido / tareas pequeñas |

> Detalle completo y matriz de decisión en
> `.opencode/skills/model-router/SKILL.md`.

---

## 2. Arquitectura

```text
                        ┌───────────────────────────────┐
                        │        ORCHESTRATOR           │  beam-free #xhigh
                        │  clasifica · reparte · cierra │
                        └───────────────┬───────────────┘
          ┌───────────────┬─────────────┼─────────────┬───────────────┐
          ▼               ▼             ▼             ▼               ▼
   planner-*        explore      researcher      creator/        vision
   (tiers)          (mapa repo)  (web/docs)      creator-alt     (multimodal)
          │                                           │
          └──────────────► critic (verifica) ◄─────────┘
                                   │
                          .orquestador/memory/  +  MCP memory
```

### Agentes

| Agente | Modo | Modelo | Función |
| --- | --- | --- | --- |
| `orchestrator` | primary | beam-free#xhigh | Dirección del flujo |
| `planner-fast` | subagent | big-pickle | Plan de tareas pequeñas |
| `planner` | all | space-bunny-free#high | Plan de módulo |
| `planner-deep` | subagent | space-bunny-free#max | Plan complejo con tradeoffs |
| `planner-long` | subagent | nemotron-3-ultra-free | Plan extenso por fases |
| `creator` | subagent | deepseek-v4.1-flash-free#high | Implementación |
| `creator-alt` | subagent | glm-5.3-flash-free#high | Implementación alterna/paralela |
| `critic` | subagent | muse-spark-1.3-contributor-free#high | Verificación independiente |
| `researcher` | subagent | longcat-2.5-preview-free | Investigación + síntesis |
| `vision` | subagent | nemotron-3.5-super-vl-free#high | Imágenes/PDF/audio |
| `docs` | subagent | muse-spark-1.3-contributor-free#medium | Documentación |
| `explore` (integrado) | subagent | nemotron-3.5-lightning-free | Búsqueda veloz |

---

## 3. Cambio automático de modelo y razonamiento

El «cambio automático» es el **tier del planeador**: el orquestador clasifica el
tamaño (S/M/L/XL) y lanza el hijo cuyo modelo ya está calibrado para ese tamaño.

| Señal | Tier | Modelo |
| --- | --- | --- |
| 1–2 archivos, sin ambigüedad | `planner-fast` | big-pickle |
| Un módulo / refactor acotado | `planner` | space-bunny#high |
| Muchas restricciones, tradeoffs, riesgo | `planner-deep` | space-bunny#max |
| Migración, arquitectura, muchos archivos | `planner-long` | nemotron-3-ultra |

Además, todo trabajo largo **sube de tier** por estas señales: >3 archivos,
decisiones de diseño, riesgo de regresión, requisitos ambiguos o >1 pasada.

Para fijar variante en la **sesión primaria** (el `model` raíz no conserva
variante) usa `/models` o los comandos con `model:` (`/orq`, `/plan-deep`, …).

### 3.1 Rotación y respaldo de modelos (si uno se agota)

Los modelos gratuitos se agotan **por familia** (p. ej. los NVIDIA pueden caer
juntos). OpenCode **no** tiene fallback nativo, así que el taller lo implementa:

- **Manifiesto** `orquestador/models.json`: familias de modelos + **cadena
  ordenada por rol**. Al instalar se copia a
  `~/.config/opencode/orquestador/models.json`.
- **Plugin** `model-fallback`: en el hook `retry` detecta fallos de proveedor
  (`429`, `404`, `5xx`, "unavailable"/"quota"...), marca el modelo en *cooldown*
  y cambia la sesión al **siguiente modelo de otra familia** con
  `session.switchModel`.
- **`/modelos`**: muestra familias, cooldowns y el modelo sano por rol.

Ejemplo de cadena: `creator` → `deepseek#high` → `glm#high` → `space-bunny#high`
→ `mimo` → `longcat` → `nemotron-ultra`. Si DeepSeek se agota, salta a GLM
(otra familia), nunca a otro DeepSeek.

> La rotación es **solo ante fallo**: rotar en cada llamada rompería la caché de
> prompt y la coherencia. Las cadenas completas están en la skill `model-router`.

---

## 4. Paralelismo

- **Subagentes en background**: `subagent` con `background: true`; el padre
  sigue trabajando y recibe el resultado al terminar.
- **Code Mode** (`execute`): varias herramientas independientes a la vez.
- **Worktrees**: `worktree_create` + `session_move` para que dos creadores
  trabajen sin pisarse (destino configurado: `worktree.directory`).
- **Regla**: un dueño por archivo; paraleliza lo independiente, serializa lo que
  comparte estado. Detalle en `.opencode/skills/parallel-dispatch/SKILL.md`.

---

## 5. Contexto y memoria (optimización)

El problema: el contexto es caro y se pierde al cerrar la sesión; releyendo
archivos se pierde tiempo. Solución en **capas**:

### 5.1 Mecanismos nativos de OpenCode
| Mecanismo | Uso aquí |
| --- | --- |
| Subagentes con contexto fresco | El trabajo pesado de lectura ocurre en el hijo; el padre recibe solo el resumen |
| Compactación | `compaction.keep.tokens: 24000` (conserva más detalle reciente) |
| Sesiones persistentes | Retomar en vez de rehacer |
| Caché de prompt + `warming` | Prefijo estable; activa `warming` si pausas mucho |
| Skills bajo demanda | No inflan el prompt hasta que se usan |
| `AGENTS.md` / instructions | Prefijo estable y barato |
| Referencias | Directorios externos con caché (refresh 24h) |
| Snapshots | Undo de archivos + conversación (`/undo`) |

### 5.2 Memoria persistente del proyecto (`.orquestador/memory/`)
| Archivo | Contenido |
| --- | --- |
| `INDEX.md` | Hub mínimo (se lee primero) |
| `map.md` | Módulos → propósito |
| `files.md` | `archivo · hash git · resumen · fecha` |
| `decisions.md` | Decisiones y por qué |
| `glossary.md` | Términos del dominio |

**Regla anti-relectura**: antes de abrir un archivo, comparar su
`git hash-object` con `files.md`. Si coincide, se confía en el resumen.

### 5.3 Memoria MCP (cross-proyecto)
Servidor `memory` (grafo de conocimiento, JSONL) para hechos que sirven en
varios repos/proyectos: preferencias, convenciones, arquitectura global.

> Decisión: **¿lo necesito en otro proyecto?** → MCP `memory`.
> **¿Es sobre este repo?** → `.orquestador/memory/`.
> Detalle en `.opencode/skills/context-memory/SKILL.md`.

### 5.4 Memoria de errores (global, sin archivos en el proyecto)

Un plugin (`error-memory`) escucha el final de cada herramienta y, **si falló**,
lo guarda **fuera del repositorio**, en un almacén global:

```text
~/.config/opencode/orquestador/
├── rules.md      # reglas curadas · cargadas como `instructions` (prompt cacheado)
├── auto.md       # digest de errores recurrentes · también en `instructions`
└── errors.jsonl  # registro crudo (append-only, con el proyecto de origen)
```

Detecta las dos formas de fallo: `status: "error"` y un comando de shell con
`exit != 0` (que llega como `status: "completed"`). Errores equivalentes
comparten **firma** (mensaje normalizado) y se cuentan, en vez de duplicarse.

**Nada se escribe dentro del proyecto**, así que no puedes commitear archivos
sueltos por accidente. Un error nuevo se convierte en regla con `/errores`.

### 5.5 Optimización de recursos (menos tiempo y razonamiento)

De lo más barato a lo más caro; usa siempre lo más barato que funcione:

| Coste | Mecanismo | Uso |
| --- | --- | --- |
| **0** | `rules.md`/`auto.md` vía `instructions` | Ya están en el prompt (cacheadas): **no se "leen"** |
| **0** | `AGENTS.md` y descripciones de skills | Reglas estables; prefijo cacheado |
| **Bajo** | Una llamada a `execute` que devuelve un digest | Agrupa lecturas/búsquedas en 1 paso |
| **Medio** | Subagente con contexto fresco | Lectura pesada; el padre recibe solo el resumen |
| **Alto** | Leer muchos archivos en el hilo principal | Evítalo |

Claves aplicadas en este taller:

- **Reglas en caché, no en bucle**: lo crítico vive en el prompt (`instructions`),
  no en un archivo que el agente deba abrir cada turno.
- **Una intención, una llamada**: `execute` para varias lecturas independientes.
- **No reabrir** archivos con el mismo hash (`files.md`).
- **Delegar** la lectura masiva a `explore`/`researcher` con salidas acotadas.
- **Subir de tier solo si hace falta** (razonar de más en lo trivial es el mayor
  desperdicio).
- **`warming` desactivado** por defecto (solo útil en sesiones largas con pausas).

---

## 6. MCP

- **context7** (remoto/OAuth): documentación actualizada de librerías.
- **memory** (local): grafo de conocimiento persistente.
- **notes-server** (`mcp/notes-server/`): MCP propio de ejemplo, sin
  dependencias, expone la memoria del proyecto.
- Ejemplos listos (comentados): `sequential-thinking`, `playwright`, `github`.

Guía completa en `.opencode/skills/mcp-builder/SKILL.md`. En Windows, los MCP
locales con npx se lanzan como `["cmd", "/c", "npx", ...]`.

---

## 7. Instalación

### En este proyecto (ya funciona aquí)
Basta con tener este directorio como workspace: OpenCode descubre
`.opencode/` y `opencode.jsonc`.

### Global (para todos los proyectos)
```powershell
pwsh -File .\install.ps1
```
Copia agentes/comandos/skills a `~/.config/opencode/`, genera la config global
ajustando la ruta de memoria y respalda cualquier `opencode.jsonc` previo.

Después, en OpenCode:
- El agente primario por defecto es **orchestrator**.
- Ejecuta **`/mcps`** y firma en **context7**.
- El servidor **memory** debería aparecer conectado.

---

## 8. Uso rápido

| Comando | Qué hace |
| --- | --- |
| `/orq <tarea>` | Flujo completo (clasificar → planear → ejecutar → verificar) |
| `/plan-quick` `/plan-deep` `/plan-long` | Forzar un tier de planeador |
| `/build <tarea>` | Implementar con el creador principal |
| `/review` | Revisión crítica independiente |
| `/research <tema>` | Investigación + síntesis |
| `/catalogo` | Ver modelos y roles |
| `/memory-init` | Crear la memoria del proyecto |
| `/errores` | Convertir los errores registrados en reglas |
| `/modelos` | Ver familias, cooldowns y respaldo por rol |

También puedes hablar normal: el orquestador decide solo.

---

## 9. Estructura

```text
ORQUESTADOR/
├── opencode.jsonc            # modelo, permisos, MCP, compactación, worktree
├── AGENTS.md                 # reglas del proyecto
├── install.ps1               # instalación global
├── global/AGENTS.md          # instrucciones globales
├── .opencode/
│   ├── agents/               # 11 agentes
│   ├── commands/             # 11 comandos
│   ├── skills/               # model-router, context-memory, parallel-dispatch, mcp-builder
│   └── plugins/              # error-memory (errores) + model-fallback (rotación)
├── orquestador/             # rules.md (reglas) + models.json (familias y cadenas)
├── .orquestador/memory/      # memoria del proyecto (INDEX, map, files, decisions, glossary)
├── tools/                    # memory-digest.mjs, models-status.mjs (una llamada cada uno)
└── mcp/notes-server/         # MCP propio de ejemplo (sin dependencias)
```

Al instalar (global) se crea además el almacén
`~/.config/opencode/orquestador/` (`rules.md`, `auto.md`, `errors.jsonl`,
`models.json`, `model-cooldown.json`), que **no vive dentro de ningún proyecto**.

---

## 10. Avisos y límites

- El `model` raíz de OpenCode **no conserva la variante**; fíjala con el agente,
  un comando o `/models`.
- DeepSeek/GLM/MiMo son de **200k** de contexto: para volcar muchas lecturas usa
  los de 1M (longcat, nemotron-ultra, space-bunny, muse-spark).
- Los modelos gratuitos pueden tener **límites de uso/velocidad** y cambiar sin
  avisar.
- En Windows, `npx.ps1` está bloqueado por la política de ejecución: los MCP
  locales deben usar `cmd /c npx`.
- `warming` está desactivado por defecto (consume peticiones).
- La memoria del proyecto es tan buena como su disciplina: si no se actualiza,
  miente. Bórrala antes que arrastrarla.

## 11. Alcance: global vs. proyecto (y qué pasa en una carpeta en blanco)

Hay **dos capas** y conviene no confundirlas:

| Capa | Dónde vive | Se aplica a |
| --- | --- | --- |
| **Global** | `~/.config/opencode/` (`opencode.jsonc`, `AGENTS.md`, `agents/`, `commands/`, `skills/`, `plugins/`, `orquestador/`) | **Todas** las carpetas donde abras OpenCode |
| **Proyecto** | `<proyecto>/opencode.jsonc` y `<proyecto>/.opencode/` | Solo ese proyecto (pisa a la global) |
| **Datos** | `~/.config/opencode/orquestador/` (errores, cooldown, reglas) y `~/.config/opencode/memory/graph.jsonl` | Global, compartido entre proyectos |

**Si abres una carpeta en blanco** (sin `opencode.jsonc` propio) ya tienes todo:
orquestador, subagentes, comandos (`/orq`, `/modelos`…), skills, los dos plugins
(errores y rotación de modelos), las reglas en el prompt y los MCP
(`context7`, `memory`). Lo único que **no** existe es la memoria local del
proyecto (`.orquestador/memory/`), que es opcional y se crea con `/memory-init`.

El repo `ORQUESTADOR/` es solo la **fuente + instalador**: una vez instalado en
global, no necesitas trabajar dentro de él. Nada se escribe en tus proyectos
salvo:
- lo que tú decidas (p. ej. `/memory-init` crea `.orquestador/memory/` con un
  `.gitignore` que lo auto-ignora), y
- los worktrees, si los usas (`worktree.directory` es relativo al proyecto).

## 12. Cómo compartirlo con otras personas

El repo (o un zip del mismo) es autocontenido y **no lleva secretos**:
`service.json` y las credenciales se quedan en la máquina de cada quien.

Pasos para otra persona:

1. Tener **OpenCode V2** y **Node** (para los MCP locales y los scripts).
2. Copiar/clonar la carpeta `ORQUESTADOR/`.
3. Ejecutar el instalador (adapta las rutas absolutas a *su* `$env:USERPROFILE`):

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```

   Instala agentes, comandos, skills, plugins, el manifiesto de modelos y las
   reglas; y genera su config global (respaldando la que tuviera).
4. Firmar Context7 la primera vez (`/mcps` o `/mcp`), porque es un MCP remoto
   con autenticación.

Notas de convivencia:

- Si la otra persona **ya tenía** un `AGENTS.md` global, el instalador **no lo
  pisa**: debe fusionar a mano las líneas de `global/AGENTS.md`.
- Re-ejecutar el instalador **actualiza** agentes/comandos/skills/plugins y
  `models.json`, pero **conserva** tus reglas (`orquestador/rules.md`) y tu
  `AGENTS.md` global. Para “actualizarse” basta volver a correrlo tras un `pull`.
- El instalador es **PowerShell (Windows)**. En macOS/Linux hay que replicar los
  mismos pasos (copiar a `~/.config/opencode/` y ajustar `MEMORY_FILE_PATH`);
  considera ese port un `install.sh` pendiente.
- Para personalizar: añade tus reglas a
  `~/.config/opencode/orquestador/rules.md`, tus propias cadenas a
  `models.json`, y tus hechos cross-proyecto a la memoria MCP.

## 13. Próximos pasos posibles

- Añadir `playwright`/`github` (MCP) según necesidad.
- Automatizar `map.md`/`files.md` con un `git hook` o plugin.
- Probar `warming` para sesiones largas con pausas.
- Explorar worktrees para paralelismo de escritura real.
