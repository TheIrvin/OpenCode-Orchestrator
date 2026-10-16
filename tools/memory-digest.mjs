#!/usr/bin/env node
/**
 * memory-digest — resumen compacto de la memoria en UNA sola llamada.
 *
 * Evita que los agentes lean varios archivos por separado: imprime un digest
 * corto de la memoria del proyecto y de los errores globales.
 *
 *   node tools/memory-digest.mjs [directorio-proyecto]
 *
 * Sin dependencias. Salida acotada (<= 25 líneas).
 */

import { readFile, readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const project = process.argv[2] || process.cwd()
const memDir = path.join(project, ".orchestrator", "memory")
const store =
  process.env.ORCHESTRATOR_STORE || path.join(homedir(), ".config", "opencode", "orchestrator")
const jsonl = path.join(store, "errors.jsonl")

async function localMemory() {
  try {
    const entries = await readdir(memDir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const info = await stat(path.join(memDir, entry.name))
      files.push(`${entry.name} (${info.size}B)`)
    }
    return files.length ? files.join(", ") : "(vacía)"
  } catch {
    return "(no existe)"
  }
}

async function globalErrors(limit = 5) {
  try {
    const raw = await readFile(jsonl, "utf8")
    const lines = raw.split(/\r?\n/).filter(Boolean)
    const bySig = new Map()
    for (const line of lines) {
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (!record?.signature) continue
      const current = bySig.get(record.signature) ?? { n: 0, tool: record.tool, error: record.error }
      current.n += 1
      current.tool = record.tool ?? current.tool
      current.error = record.error ?? current.error
      bySig.set(record.signature, current)
    }
    const top = [...bySig.values()].sort((a, b) => b.n - a.n).slice(0, limit)
    return { total: lines.length, top }
  } catch {
    return { total: 0, top: [] }
  }
}

const [mem, errs] = await Promise.all([localMemory(), globalErrors()])

const out = [
  `proyecto: ${project}`,
  `memoria local: ${mem}`,
  `errores globales: ${errs.total} (${errs.top.length} tipos frecuentes)`,
]
for (const e of errs.top) out.push(`  x${e.n} · ${e.tool} · ${e.error}`)
if (!errs.top.length) out.push("  (sin errores registrados)")

console.log(out.slice(0, 25).join("\n"))
