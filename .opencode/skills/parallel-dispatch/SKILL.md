---
name: Parallel Dispatch
description: Cómo repartir trabajo entre subagentes en paralelo de forma segura (background, grafo de dependencias, worktrees) y cómo usar Code Mode para llamadas simultáneas.
---

# Reparto en paralelo

## Aislamiento por contexto

Cada subagente corre en su **propia sesión hija con contexto fresco**
(foreground o background). El padre no ve sus pasos internos, solo el resultado.
Esto es lo que mantiene el hilo del orquestador limpio.

## Patrón básico

1. **Construye el grafo de dependencias.** Marca cada unidad como `I`
   (independiente) o `D` (depende de otra).
2. **Lanza todas las `I` a la vez** con `background: true`.
3. **Espera** sus resultados (te notifican al terminar).
4. **Lanza las `D`** que ya tienen sus entradas resueltas.

```text
O -> [explore repo] (I)
   -> [creator A: módulo X] (I)  ┐
   -> [creator-alt B: módulo Y] (I)├─ en paralelo
   -> [researcher: docs Z] (I)   ┘
   -> [creator C: integra A+B] (D depende de A,B)
   -> [critic: revisa todo]     (D depende de C)
```

## Reglas

- **Un dueño por archivo.** Nunca dos hijos editando el mismo archivo a la vez.
  Si dos unidades tocan el mismo archivo, es una sola unidad o van en serie.
- **Serializa lo que comparte estado** (misma BD, mismo índice, mismo archivo).
- **Paraleliza lo que no se pisa** (módulos distintos, tests distintos, research).
- **Acota la salida** de cada hijo para no inflar el padre.

## Worktrees (paralelismo de verdad)

Para trabajos que compiten por el mismo árbol de archivos usa **worktrees**:

- `worktree_create` devuelve un directorio aislado del mismo proyecto.
- `session_move` mueve la sesión a ese directorio.
- Config del proyecto: `worktree.directory` (definido en `opencode.jsonc`).
- Útil para: probar dos enfoques a la vez, migraciones largas, o dejar que dos
  creadores trabajen sin pisarse.

## Code Mode (`execute`) para paralelismo de herramientas

Dentro de un mismo agente, `execute` permite llamar varias herramientas
independientes a la vez y quedarse solo con lo relevante:

```js
const [a, b] = await Promise.all([
  tools.read({ path: "src/a.ts" }),
  tools.grep({ pattern: "TODO", include: "*.ts" }),
]);
return { a: a.slice(0, 800), todos: b.length };
```

Regla: **paraleliza lecturas/búsquedas independientes**, pero nunca escrituras
concurrentes sobre el mismo recurso.

## Antipatrones

- Lanzar 10 hijos para un cambio de una línea.
- Lanzar hijos que devuelven el archivo entero (rompe el aislamiento).
- Paralelizar dos `creator` sobre el mismo archivo.
- Esperar en serie lo que era independiente.
