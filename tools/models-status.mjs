#!/usr/bin/env node
/**
 * models-status — estado de modelos en UNA sola llamada.
 *
 * Lee el manifiesto global y el cooldown, y muestra:
 *   - familias de modelos (para no repetir una familia agotada)
 *   - modelos en cooldown (no disponibles ahora)
 *   - el modelo "sano" que elegiría el fallback para cada rol
 *
 *   node tools/models-status.mjs
 *
 * Sin dependencias.
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
out.push(`proveedor: ${manifest.provider ?? "opencode"}`)
out.push("")
out.push("FAMILIAS")
for (const [family, ids] of Object.entries(manifest.families ?? {})) {
  out.push(`  ${family}: ${ids.join(", ")}`)
}
out.push("")

const coolingIds = Object.keys(cooldown).filter(cooling)
out.push(`EN COOLDOWN (${coolingIds.length})`)
for (const id of coolingIds) out.push(`  ${id} (${Math.ceil((cooldown[id].until - now) / 1000)}s)`)
if (!coolingIds.length) out.push("  (ninguno)")
out.push("")

out.push("RESPALDO SUGERIDO POR ROL")
for (const [role, chain] of Object.entries(manifest.roles ?? {})) {
  const specs = chain.map(parseSpec)
  const healthy = specs.find((s) => !cooling(s.id)) ?? specs[0]
  const suffix = healthy ? `${healthy.id}${healthy.variant ? `#${healthy.variant}` : ""}` : "(sin cadena)"
  out.push(`  ${role}: ${suffix}   [${familyOf(healthy?.id ?? "")}]`)
}

console.log(out.join("\n"))
