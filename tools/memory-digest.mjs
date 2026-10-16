#!/usr/bin/env node
/**
 * memory-digest — compact memory summary in ONE single call.
 *
 * Keeps agents from reading several files separately: prints a short digest
 * of the project memory and of the global errors.
 *
 *   node tools/memory-digest.mjs [project-directory]
 *
 * No dependencies. Bounded output (<= 25 lines).
 */

import { readFile, readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const project = process.argv[2] || process.cwd()
const memDir = path.join(project, ".orquestador", "memory")
const store =
  process.env.ORQUESTADOR_STORE || path.join(homedir(), ".config", "opencode", "orquestador")
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
    return files.length ? files.join(", ") : "(empty)"
  } catch {
    return "(does not exist)"
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
  `project: ${project}`,
  `local memory: ${mem}`,
  `global errors: ${errs.total} (${errs.top.length} frequent types)`,
]
for (const e of errs.top) out.push(`  x${e.n} · ${e.tool} · ${e.error}`)
if (!errs.top.length) out.push("  (no recorded errors)")

console.log(out.slice(0, 25).join("\n"))
