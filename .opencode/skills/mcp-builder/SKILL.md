---
name: MCP Builder
description: How to use existing MCP servers (Context7, memory) and how to add or create your own, with Code Mode, permissions, and secure credentials.
---

# MCP: using and creating servers

## What this is

MCP (Model Context Protocol) gives agents external tools and resources:
documentation (Context7), memory (knowledge graph), browser, GitHub, etc.

## Context rule

> MCP tools consume context. Add **only** the servers you
> use. Each extra server makes every model step more expensive.

## Add a server (preferred: CLI)

Preserves the rest of the project configuration:

```sh
# Remote (OAuth by default)
opencode mcp add context7 --url https://mcp.context7.com/mcp

# Global (for all your projects)
opencode mcp add context7 --global --url https://mcp.context7.com/mcp

# Local (stdio command)
opencode mcp add everything -- npx -y @modelcontextprotocol/server-everything

opencode mcp list
```

If a remote server asks for authentication: in OpenCode run `/mcps`, choose the
server, and **sign in in the browser**. Don't put keys in the JSON if it supports OAuth.

## Add by hand (JSON)

With `$schema` and, for secrets, environment substitution:

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

- **Windows + npx**: use `["cmd", "/c", "npx", ...]` (npx.ps1 is blocked
  by the execution policy).
- `codemode` is `true` by default: tools are exposed grouped as
  `tools.<server>.<tool>` inside `execute`. Set `codemode: false` so they
  appear in the provider's native tool list.
- `disabled: true` configures without connecting.

## Permissions

Tools can be hidden without disconnecting the server: the action name
is `<server>_<tool>` (with `_` normalized).

```jsonc
{
  "permissions": [
    { "action": "memory_*", "resource": "*", "effect": "allow" },
    { "action": "context7_*", "resource": "*", "effect": "allow" }
  ]
}
```

MCP resources: actions `opencode_list_mcp_resources` and
`opencode_read_mcp_resource` (resource `<server>:<uri>`).

## Create your own MCP

A local MCP is a process that speaks MCP over **stdio**. Minimal template in
Node (`mcp/notes-server/index.mjs` in this repo):

- Declare tools with an input JSON Schema.
- Read/send JSON-RPC over stdin/stdout (one line per message).
- Respond to `initialize`, `tools/list`, and `tools/call`.

To connect your server:

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

Best practices when creating one:

1. **Few tools, very clear.** The model pays for each one.
2. **Compact output** by default (pagination/`limit`).
3. **No secrets** in the responses.
4. **No destructive effects** without confirmation.
5. Use the official SDK (`@modelcontextprotocol/sdk`) if it grows; `npx` to run it.

## Debug

- `opencode mcp list` shows the connection status.
- Startup errors are usually about command/path/environment: check that `npx`/`node`
  exist and that `cwd` is correct.
- A server that does not respond to `initialize` fails on the `startup` timeout
  (30s by default); increase it per server with `timeout.startup`.
