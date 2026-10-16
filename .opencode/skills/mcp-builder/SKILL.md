---
name: MCP Builder
description: Cómo usar servidores MCP existentes (Context7, memoria) y cómo añadir o crear uno propio, con Code Mode, permisos y credenciales seguras.
---

# MCP: usar y crear servidores

## Qué es esto

MCP (Model Context Protocol) da a los agentes herramientas y recursos externos:
documentación (Context7), memoria (knowledge graph), navegador, GitHub, etc.

## Regla de contexto

> Las herramientas MCP consumen contexto. Añade **solo** los servidores que
> uses. Cada servidor extra encarece cada paso del modelo.

## Añadir un servidor (preferido: CLI)

Preserva el resto de la configuración del proyecto:

```sh
# Remoto (OAuth por defecto)
opencode mcp add context7 --url https://mcp.context7.com/mcp

# Global (para todos tus proyectos)
opencode mcp add context7 --global --url https://mcp.context7.com/mcp

# Local (comando stdio)
opencode mcp add everything -- npx -y @modelcontextprotocol/server-everything

opencode mcp list
```

Si un servidor remoto pide autenticación: en OpenCode ejecuta `/mcps`, elige el
servidor y **firma en el navegador**. No metas claves en el JSON si admite OAuth.

## Añadir a mano (JSON)

Con `$schema` y, para secretos, sustitución de entorno:

```jsonc
{
  "mcp": {
    "servers": {
      "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },
      "memory": {
        "type": "local",
        "command": ["cmd", "/c", "npx", "-y", "@modelcontextprotocol/server-memory"],
        "environment": { "MEMORY_FILE_PATH": "{env:OPENCODE_MEMORY_FILE}" }
      }
    }
  }
}
```

- **Windows + npx**: usa `["cmd", "/c", "npx", ...]` (npx.ps1 está bloqueado
  por la política de ejecución).
- `codemode` es `true` por defecto: las herramientas se exponen agrupadas en
  `tools.<servidor>.<tool>` dentro de `execute`. Pon `codemode: false` para que
  aparezcan en la lista nativa del proveedor.
- `disabled: true` configura sin conectar.

## Permisos

Se pueden ocultar herramientas sin desconectar el servidor: el nombre de acción
es `<servidor>_<tool>` (con `_` normalizado).

```jsonc
{
  "permissions": [
    { "action": "memory_*", "resource": "*", "effect": "allow" },
    { "action": "context7_*", "resource": "*", "effect": "allow" }
  ]
}
```

Recursos MCP: acciones `opencode_list_mcp_resources` y
`opencode_read_mcp_resource` (recurso `<servidor>:<uri>`).

## Crear un MCP propio

Un MCP local es un proceso que habla MCP por **stdio**. Plantilla mínima en
Node (`mcp/notes-server/index.mjs` en este repo):

- Declara herramientas con JSON Schema de entrada.
- Lee/envía JSON-RPC por stdin/stdout (una línea por mensaje).
- Responde `initialize`, `tools/list` y `tools/call`.

Para conectar tu servidor:

```jsonc
{
  "mcp": {
    "servers": {
      "notes": {
        "type": "local",
        "command": ["node", "mcp/notes-server/index.mjs"],
        "cwd": ".",
        "environment": { "NOTES_DIR": ".orquestador/memory" }
      }
    }
  }
}
```

Buenas prácticas al crear uno:

1. **Pocas herramientas, muy claras.** El modelo paga por cada una.
2. **Salidas compactas** por defecto (paginación/`limit`).
3. **Sin secretos** en las respuestas.
4. **Sin efectos destructivos** sin confirmación.
5. Usa el SDK oficial (`@modelcontextprotocol/sdk`) si crece; `npx` para correr.

## Depurar

- `opencode mcp list` muestra el estado de conexión.
- Errores de arranque suelen ser de comando/ruta/entorno: revisa que `npx`/`node`
  existan y que `cwd` sea correcto.
- Un servidor que no responde al `initialize` cae por timeout de `startup`
  (30s por defecto); auméntalo por servidor con `timeout.startup`.
