#!/usr/bin/env node
/**
 * models-status — model status in ONE single call.
 *
 * Reads the global manifest and the cooldown, and shows:
 *   - model families (so as not to repeat an exhausted family)
 *   - models in cooldown (unavailable right now)
 *   - the "healthy" model the fallback would pick for each role
 *
 *   node tools/models-status.mjs
 *
 * No dependencies.
 */

import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const STORE =
  process.env.ORQUESTADOR_STORE || path.join(homedir(), ".config", "opencode", "orquestador")

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return fallback
  }
}

const manifest = await readJson(path.join(STORE, "models.json"), { roles: {}, families: {} })
const cooldown = await readJson(path.join(STORE, "model-cooldown.json"), {})
const now = Date.now()

const cooling = (id) => {
  const entry = cooldown[id]
  return Boolean(entry && typeof entry.until === "number" && entry.until > now)
}

const familyOf = (id) => {
  for (const [family, ids] of Object.entries(manifest.families ?? {})) {
    if (ids.includes(id)) return family
  }
  return "other"
}

const parseSpec = (spec) => {
  const [id, variant] = String(spec).split("#")
  return { id, variant: variant || undefined }
}

const out = []
out.push(`provider: ${manifest.provider ?? "opencode"}`)
out.push("")
out.push("FAMILIES")
for (const [family, ids] of Object.entries(manifest.families ?? {})) {
  out.push(`  ${family}: ${ids.join(", ")}`)
}
out.push("")

const coolingIds = Object.keys(cooldown).filter(cooling)
out.push(`IN COOLDOWN (${coolingIds.length})`)
for (const id of coolingIds) out.push(`  ${id} (${Math.ceil((cooldown[id].until - now) / 1000)}s)`)
if (!coolingIds.length) out.push("  (none)")
out.push("")

out.push("SUGGESTED FALLBACK PER ROLE")
for (const [role, chain] of Object.entries(manifest.roles ?? {})) {
  const specs = chain.map(parseSpec)
  const healthy = specs.find((s) => !cooling(s.id)) ?? specs[0]
  const suffix = healthy ? `${healthy.id}${healthy.variant ? `#${healthy.variant}` : ""}` : "(no chain)"
  out.push(`  ${role}: ${suffix}   [${familyOf(healthy?.id ?? "")}]`)
}

console.log(out.join("\n"))
