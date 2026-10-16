# notes-server (sample self-built MCP)

Local MCP server, dependency-free, that exposes the project memory
(`.orquestador/memory/`) as tools for agents.

## Tools

| Tool | What for |
| --- | --- |
| `notes_list` | See which memory files exist |
| `notes_search` | Search before re-reading ("did we already review X?") |
| `notes_read` | Read a file with pagination |
| `notes_append` | Log a finding/decision |

## Try it by hand

```sh
# Windows
set NOTES_DIR=.orquestador\memory && echo {"jsonrpc":"2.0","id":1,"method":"tools/list"} | node mcp/notes-server/index.mjs
```

You should see one JSON line with the tool list.

## Connect it to OpenCode

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

Remember: with Code Mode (default) the tools show up as
`tools.notes.notes_search(...)` inside `execute`.

## Create your own

1. Copy this folder and change the tools in `TOOLS` and the `switch` of
   `callTool`.
2. Keep outputs compact and with limits.
3. Don't return secrets; don't run destructive actions without confirmation.
4. If the server grows, migrate to the official SDK `@modelcontextprotocol/sdk`.
