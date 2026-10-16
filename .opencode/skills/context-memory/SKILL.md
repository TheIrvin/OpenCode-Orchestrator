---
name: Context & Memory
description: Cómo persistir y reutilizar contexto para no re-leer archivos ya revisados ni re-descubrir el repo entre sesiones. Cárgala al inicio de cualquier tarea no trivial.
---

# Contexto y memoria (no volver a revisar lo ya revisado)

El contexto de una sesión es caro y se pierde al cerrarla. Este taller combina
los mecanismos nativos de OpenCode con una **memoria persistente** propia.

## 1. Mecanismos nativos (grátis, ya configurados)

| Mecanismo | Qué hace | Cómo se aprovecha |
| --- | --- | --- |
| **Subagentes con contexto fresco** | El trabajo pesado de lectura ocurre en un hijo; el padre solo recibe el resumen | Manda a `explore`/`researcher` a leer; no leas 40 archivos en el hilo principal |
| **Compactación** | Resume automáticamente lo viejo y conserva el final (`compaction.keep.tokens`) | Ajustada a 24k en `opencode.jsonc` |
| **Sesiones persistentes** | La conversación vive en la base local; se retoma | Continúa la sesión en vez de rehacer |
| **Caché de prompt + warming** | El proveedor reutiliza el prefijo estable | Mantén instrucciones estables; activa `warming` si pausas mucho |
| **Skills** | Instrucciones cargadas bajo demanda | No inflan el prompt hasta que hacen falta |
| **AGENTS.md / instructions** | Prefijo estable y barato | Reglas del proyecto, no descubrimientos |
| **Referencias** | Directorios externos con caché (refresh cada 24h) | Otros repos/docs sin clonar de nuevo |
| **Snapshots** | Undo de archivos + conversación | Revertir experimentos sin ensuciar git |

### Regla de oro de aislamiento
> Lee en el subagente, **resume en el padre**. El hilo del orquestador debe
> contener conclusiones, no volcados de archivos.

## 2. Memoria persistente del proyecto (`.orquestador/memory/`)

Directorio versionable, legible por humanos y por agentes:

```text
.orquestador/memory/
├── INDEX.md       # hub mínimo: se lee primero, siempre
├── map.md         # mapa de módulos y archivos clave → propósito
├── files.md       # archivo → hash git + resumen de una línea + fecha
├── decisions.md   # decisiones y por qué (ADR corto)
└── glossary.md    # términos del dominio
```

### Protocolo (obligatorio)

1. **Antes de explorar**: lee `INDEX.md` (~1 pantalla). Si el mapa cubre lo que
   necesitas, **no vuelvas a escanear**.
2. **Antes de leer un archivo**: busca su entrada en `files.md`. Compara el hash
   registrado con el actual:
   ```sh
   git hash-object <archivo>
   ```
   Si coincide, **confía en el resumen** y no lo reabras. Si difiere, el archivo
   cambió: léelo y actualiza la entrada.
3. **Después de explorar/implementar**: actualiza `map.md`, `files.md` y
   `decisions.md` con lo aprendido. Un resumen de una línea por archivo basta.
4. Mantén `files.md` ordenado por ruta y **no** guardes contenido completo: solo
   ruta · hash · resumen · fecha.

### Formato de `files.md`

```md
| Archivo | Hash (git) | Resumen | Revisado |
| --- | --- | --- | --- |
| src/api.ts | a1b2c3d | Endpoints REST; valida con zod | 2026-10-16 |
```

## 3. Memoria MCP (grafo compartido entre sesiones)

Para hechos que deben sobrevivir entre proyectos y agentes, usa el servidor
**memory** (grafo de conocimiento, JSONL persistente). Está configurado como
MCP local `memory`:

- Guarda **hechos atómicos** y relaciones, no código (el código va en `files.md`).
- Úsalo para: preferencias del usuario, decisiones de arquitectura globales,
  convenciones, "cómo se hace X aquí".
- Herramientas: `create_entities`, `add_observations`, `create_relations`,
  `search_nodes`, `read_graph`.

Regla: **¿lo necesitaré en otro proyecto o sesión?** → MCP memory.
**¿Es sobre este repo y su código?** → `.orquestador/memory/`.

## 4. Memoria de errores (global, sin archivos en el proyecto)

El plugin `error-memory` (`.opencode/plugins/error-memory.ts`) escucha cada fallo
de herramienta y lo guarda **fuera del repositorio**, en un almacén global:

```text
~/.config/opencode/orquestador/
├── rules.md      # reglas curadas · se cargan como `instructions` (caché)
├── auto.md       # digest de errores recurrentes · también en `instructions`
└── errors.jsonl  # registro crudo (append-only, con el proyecto de origen)
```

**Claves del diseño:**

- **Nada se escribe dentro del proyecto**, así que no puedes commitear basura por
  accidente.
- `rules.md` y `auto.md` están declarados en `instructions`, o sea que van en el
  **prefijo cacheado del prompt**: el modelo ya los tiene, **no gasta llamadas ni
  razonamiento en "leer reglas"**.
- Un fallo de shell con salida `exit != 0` llega como `status: "completed"` (no
  como `status: "error"`); el plugin detecta ambos casos.
- Errores equivalentes comparten **firma** (mensaje normalizado), así que el
  mismo tipo de fallo no se duplica: se cuenta.

**Protocolo:**

1. **No leas `rules.md`/`auto.md` "por si acaso"**: ya están en tu contexto. Actúa.
2. **Antes de reintentar** algo que falló, revisa `auto.md` (ya lo tienes) y, si
   necesitas el detalle, busca la firma en `errors.jsonl`. Si ya falló igual,
   cambia de enfoque.
3. **Al aprender una lección**, añádela como regla corta a `rules.md` (o usa
   `/errores`, que promueve los recurrentes de `auto.md`/`errors.jsonl`).

## 5. Optimización de recursos (gastar menos tiempo y razonamiento)

Orden de lo más barato a lo más caro. Usa siempre lo más barato que funcione.

| Coste | Mecanismo | Cuándo |
| --- | --- | --- |
| **0** | `rules.md`/`auto.md` vía `instructions` (prefijo cacheado) | Siempre: ya está en contexto |
| **0** | `AGENTS.md` y skills | Reglas estables; se cachean |
| **Bajo** | Una llamada a `execute` que devuelve un **digest** | Resumen de memoria/multi-read en 1 paso |
| **Medio** | Subagente con contexto fresco | Trabajo pesado de lectura; el padre recibe solo el resumen |
| **Alto** | Leer muchos archivos en el hilo principal | Evítalo |

Reglas prácticas:

1. **No "revisar reglas"**: están en el prompt. Leerlas otra vez es gastar por
   duplicado.
2. **Una intención, una llamada**: usa `execute` para agrupar lecturas/búsquedas
   independientes y quedarte solo con lo relevante.
3. **No reabras archivos con el mismo hash** (`files.md`).
4. **Delega la lectura masiva** a `explore`/`researcher` y pide salidas acotadas.
5. **Sube de tier solo si hace falta** (skill `model-router`): razonar de más en
   algo trivial es el desperdicio más común.
6. **Precargar (`warming`) solo en sesiones largas con pausas.**

## 6. Higiene de contexto

- Un objetivo por sesión; abre sesión nueva para un tema nuevo (evita arrastrar
  contexto muerto).
- Pide a los subagentes respuestas **acotadas** (máx. N líneas / solo lo pedido).
- Descarta lo obsoleto: mejor una entrada borrada que una mentira en la memoria.
- Si un subagente va a leer mucho y devolver poco, ese es el diseño correcto.
