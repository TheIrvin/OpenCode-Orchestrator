#!/usr/bin/env node
/**
 * notes-server — MCP local mínimo (transporte stdio, JSON-RPC por líneas).
 *
 * Expone la memoria del proyecto (archivos Markdown en NOTES_DIR) como
 * herramientas MCP, para que cualquier agente la consulte sin gastar contexto
 * releyendo todo.
 *
 * Solo usa módulos nativos de Node. Sin dependencias.
 *
 * Variables de entorno:
 *   NOTES_DIR  Directorio de notas (por defecto: ./.orchestrator/memory)
 *
 * Herramientas:
 *   notes_list    → lista los archivos de memoria
 *   notes_search  → busca texto en las notas (con límite de resultados)
 *   notes_read    → lee un archivo de memoria (con paginación)
 *   notes_append  → añade una línea/sección a un archivo de memoria
 */

import { createInterface } from "node:readline";
import { promises as fs } from "node:fs";
import path from "node:path";

const NOTES_DIR = path.resolve(process.env.NOTES_DIR || path.join(process.cwd(), ".orchestrator", "memory"));
const ALLOWED_EXT = new Set([".md", ".jsonl", ".txt"]);
const MAX_RESULTS = 50;

/** Resuelve una ruta relativa dentro de NOTES_DIR (evita salir del directorio). */
function safeJoin(relative) {
  const target = path.resolve(NOTES_DIR, relative);
  const base = NOTES_DIR.endsWith(path.sep) ? NOTES_DIR : NOTES_DIR + path.sep;
  if (target !== NOTES_DIR && !target.startsWith(base)) {
    throw new Error(`Ruta fuera del directorio de memoria: ${relative}`);
  }
  if (!ALLOWED_EXT.has(path.extname(target).toLowerCase())) {
    throw new Error(`Extensión no permitida: ${path.extname(target)}`);
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
  if (!needle) throw new Error("`query` es obligatorio");
  const { files } = await listNotes();
  const hits = [];
  for (const { file } of files) {
    if (file === "graph.jsonl") continue; // el grafo MCP tiene su propio acceso
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
  if (!block) throw new Error("`text` es obligatorio");
  await fs.mkdir(NOTES_DIR, { recursive: true });
  await fs.appendFile(target, `\n${block}\n`, "utf8");
  return { file, appended: block.length };
}

const TOOLS = [
  {
    name: "notes_list",
    description: "Lista los archivos de memoria del proyecto y su tamaño/fecha.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "notes_search",
    description: "Busca un texto en las notas de memoria y devuelve coincidencias (archivo:línea).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Texto a buscar" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "notes_read",
    description: "Lee un archivo de memoria con paginación por líneas.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Nombre del archivo dentro del directorio de memoria" },
        offset: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["file"],
      additionalProperties: false,
    },
  },
  {
    name: "notes_append",
    description: "Añade una línea o sección al final de un archivo de memoria.",
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
      throw new Error(`Herramienta desconocida: ${name}`);
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
        return; // notificaciones: sin respuesta
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
        throw Object.assign(new Error(`Método no soportado: ${method}`), { code: -32601 });
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
    return; // ignora líneas que no son JSON
  }
  void handle(message);
});
