# notes-server (MCP propio de ejemplo)

Servidor MCP local, sin dependencias, que expone la memoria del proyecto
(`.orchestrator/memory/`) como herramientas para los agentes.

## Herramientas

| Herramienta | Para qué |
| --- | --- |
| `notes_list` | Ver qué archivos de memoria existen |
| `notes_search` | Buscar antes de releer ("¿ya revisamos X?") |
| `notes_read` | Leer un archivo con paginación |
| `notes_append` | Registrar un hallazgo/decisión |

## Probarlo a mano

```sh
# Windows
set NOTES_DIR=.orchestrator\memory && echo {"jsonrpc":"2.0","id":1,"method":"tools/list"} | node mcp/notes-server/index.mjs
```

Deberías ver una línea JSON con la lista de herramientas.

## Conectarlo a OpenCode

```jsonc
{
  "mcp": {
    "servers": {
      "notes": {
        "type": "local",
        "command": ["node", "mcp/notes-server/index.mjs"],
        "cwd": ".",
        "environment": { "NOTES_DIR": ".orchestrator/memory" }
      }
    }
  }
}
```

Recuerda: con Code Mode (por defecto) las herramientas aparecen como
`tools.notes.notes_search(...)` dentro de `execute`.

## Crear el tuyo

1. Copia esta carpeta y cambia las herramientas en `TOOLS` y el `switch` de
   `callTool`.
2. Mantén las salidas compactas y con límites.
3. No devuelvas secretos; no ejecutes acciones destructivas sin confirmación.
4. Si el servidor crece, migra al SDK oficial `@modelcontextprotocol/sdk`.
