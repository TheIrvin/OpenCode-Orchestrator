#!/usr/bin/env node
/**
 * notes-server — minimal local MCP (stdio transport, line-delimited JSON-RPC).
 *
 * Exposes the project memory (Markdown files in NOTES_DIR) as
 * MCP tools, so any agent can query it without spending context
 * re-reading everything.
 *
 * Only uses Node built-in modules. No dependencies.
 *
 * Environment variables:
 *   NOTES_DIR  Notes directory (default: ./.orquestador/memory)
 *
 * Tools:
 *   notes_list    → lists the memory files
 *   notes_search  → searches text in the notes (with a result limit)
 *   notes_read    → reads a memory file (with pagination)
 *   notes_append  → appends a line/section to a memory file
 */

import { createInterface } from "node:readline";
import { promises as fs } from "node:fs";
import path from "node:path";

const NOTES_DIR = path.resolve(process.env.NOTES_DIR || path.join(process.cwd(), ".orquestador", "memory"));
const ALLOWED_EXT = new Set([".md", ".jsonl", ".txt"]);
const MAX_RESULTS = 50;

/** Resolves a relative path inside NOTES_DIR (prevents escaping the directory). */
function safeJoin(relative) {
  const target = path.resolve(NOTES_DIR, relative);
  const base = NOTES_DIR.endsWith(path.sep) ? NOTES_DIR : NOTES_DIR + path.sep;
  if (target !== NOTES_DIR && !target.startsWith(base)) {
    throw new Error(`Path outside the memory directory: ${relative}`);
  }
  if (!ALLOWED_EXT.has(path.extname(target).toLowerCase())) {
    throw new Error(`Extension not allowed: ${path.extname(target)}`);
  }
  return target;
}

async function listNotes() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  const entries = await fs.readdir(NOTES_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!ALLOWED_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = await fs.stat(path.join(NOTES_DIR, entry.name));
    files.push({ file: entry.name, bytes: stat.size, modified: stat.mtime.toISOString() });
  }
  return { directory: NOTES_DIR, files };
}

async function searchNotes(query) {
  const needle = String(query || "").toLowerCase();
  if (!needle) throw new Error("`query` is required");
  const { files } = await listNotes();
  const hits = [];
  for (const { file } of files) {
    if (file === "graph.jsonl") continue; // the MCP graph has its own access
    const content = await fs.readFile(path.join(NOTES_DIR, file), "utf8");
    content.split(/\r?\n/).forEach((line, index) => {
      if (line.toLowerCase().includes(needle)) {
        hits.push({ file, line: index + 1, text: line.trim().slice(0, 300) });
      }
    });
    if (hits.length >= MAX_RESULTS) break;
  }
  return { query, count: hits.length, truncated: hits.length >= MAX_RESULTS, hits };
}

async function readNote(file, offset = 1, limit = 200) {
  const target = safeJoin(file);
  const raw = await fs.readFile(target, "utf8");
  const lines = raw.split(/\r?\n/);
  const start = Math.max(1, Number(offset) || 1);
  const end = Math.min(lines.length, start + (Number(limit) || 200) - 1);
  const slice = lines.slice(start - 1, end).map((text, i) => `${start + i}: ${text}`);
  return { file, total_lines: lines.length, from: start, to: end, content: slice.join("\n") };
}

async function appendNote(file, text) {
  const target = safeJoin(file);
  const block = String(text ?? "").trimEnd();
  if (!block) throw new Error("`text` is required");
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.appendFile(target, `\n${block}\n`, "utf8");
  return { file, appended: block.length };
}

const TOOLS = [
  {
    name: "notes_list",
    description: "Lists the project memory files and their size/date.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "notes_search",
    description: "Searches for text in the memory notes and returns matches (file:line).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "notes_read",
    description: "Reads a memory file with line-based pagination.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File name inside the memory directory" },
        offset: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["file"],
      additionalProperties: false,
    },
  },
  {
    name: "notes_append",
    description: "Appends a line or section to the end of a memory file.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        text: { type: "string" },
      },
      required: ["file", "text"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "notes_list":
      return listNotes();
    case "notes_search":
      return searchNotes(args.query);
    case "notes_read":
      return readNote(args.file, args.offset, args.limit);
    case "notes_append":
      return appendNote(args.file, args.text);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  try {
    let result;
    switch (method) {
      case "initialize":
        result = {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "notes-server", version: "1.0.0" },
        };
        break;
      case "notifications/initialized":
      case "notifications/cancelled":
        return; // notifications: no response
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call": {
        const data = await callTool(params?.name, params?.arguments || {});
        result = { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        break;
      }
      default:
        if (!isRequest) return;
        throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
    }
    if (isRequest) send({ jsonrpc: "2.0", id, result });
  } catch (error) {
    if (!isRequest) return;
    send({
      jsonrpc: "2.0",
      id,
      error: { code: error.code ?? -32603, message: error.message || String(error) },
    });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return; // ignore lines that are not JSON
  }
  void handle(message);
});
