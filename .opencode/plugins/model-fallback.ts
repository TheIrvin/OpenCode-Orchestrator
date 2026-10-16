/**
 * model-fallback — rotación automática de modelos cuando uno deja de estar
 * disponible (cuota agotada, 429, 404, 5xx, "unavailable"...).
 *
 * OpenCode NO tiene fallback nativo en el config (un agente acepta un solo
 * `model`). Este plugin lo implementa con dos piezas del API de plugins:
 *
 *   - hook `session("retry")` → ve el fallo con { sessionID, agent, model,
 *     error: { type, message, status }, attempt }.
 *   - `ctx.session.switchModel({ sessionID, model })` → cambia el modelo de la
 *     sesión para los siguientes intentos.
 *
 * Estrategia:
 *   1. Si el fallo indica que el modelo/proveedor no está disponible, marca ese
 *      modelo en "cooldown" (con caducidad).
 *   2. Elige el siguiente modelo de la CADENA del rol (event.agent) en
 *      `orchestrator/models.json`, prefiriendo una FAMILIA distinta a la que
 *      falló (una cuota suele agotarse por familia, p. ej. los NVIDIA).
 *   3. Cambia el modelo de la sesión y deja que OpenCode reintente.
 *
 * Todo se guarda en el almacén global (~/.config/opencode/orchestrator/), nunca
 * dentro del proyecto. Nunca lanza: si algo falla, la sesión sigue como estaba.
 *
 * Nota: `switchModel` aplica al siguiente dispatch. Si el reintento inmediato
 * aún usa el modelo viejo, el fallo se cuenta de nuevo y el plugin vuelve a
 * rotar; en pocos intentos la sesión queda en un modelo sano.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const STORE =
  process.env.ORCHESTRATOR_STORE || path.join(homedir(), ".config", "opencode", "orchestrator")
const MANIFEST = path.join(STORE, "models.json")
const COOLDOWN = path.join(STORE, "model-cooldown.json")
const COOLDOWN_MD = path.join(STORE, "model-cooldown.md")

type Chain = string[]

interface Manifest {
  provider?: string
  cooldownSeconds?: number
  families?: Record<string, string[]>
  roles?: Record<string, Chain>
}

async function loadManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest
  } catch {
    return null
  }
}

async function loadCooldown(): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(COOLDOWN, "utf8"))
  } catch {
    return {}
  }
}

function familyOf(manifest: Manifest, id: string): string {
  for (const [family, ids] of Object.entries(manifest.families ?? {})) {
    if (ids.includes(id)) return family
  }
  return "other"
}

function parseSpec(spec: string): { id: string; variant?: string } {
  const [id, variant] = String(spec).split("#")
  return { id, variant: variant || undefined }
}

function isCooling(map: Record<string, any>, id: string): boolean {
  const entry = map[id]
  return Boolean(entry && typeof entry.until === "number" && Date.now() < entry.until)
}

/** ¿El fallo significa "este modelo no sirve ahora mismo"? */
function isUnavailable(error: any): boolean {
  const status = error?.status
  if (status === 429 || status === 404) return true
  if (typeof status === "number" && status >= 500 && status < 600) return true

  const message = String(error?.message ?? "").toLowerCase()
  if (
    /unavailable|not.?found|no.?such|deprecat|quota|rate.?limit|too many|overload|capacity|exhaust|model_not_found|invalid.?model|does not exist/.test(
      message,
    )
  ) {
    return true
  }

  const type = String(error?.type ?? "")
  if (/provider\.(invalid|unavailable|error)|model\.(not|unavailable)/i.test(type)) return true

  return false
}

function pickNext(manifest: Manifest, id: string, agent: string | undefined, map: Record<string, any>) {
  const chain = manifest.roles?.[String(agent)] ?? manifest.roles?.general ?? []
  const candidates = chain.map(parseSpec)
  if (!candidates.length) return undefined

  const failedFamily = familyOf(manifest, id)
  const index = candidates.findIndex((candidate) => candidate.id === id)
  const ordered = index >= 0
    ? [...candidates.slice(index + 1), ...candidates.slice(0, index)]
    : candidates

  return (
    ordered.find((candidate) => candidate.id !== id && !isCooling(map, candidate.id) && familyOf(manifest, candidate.id) !== failedFamily) ??
    ordered.find((candidate) => candidate.id !== id && !isCooling(map, candidate.id)) ??
    ordered.find((candidate) => candidate.id !== id)
  )
}

async function writeCooldownMd(map: Record<string, any>): Promise<void> {
  const now = Date.now()
  const rows = Object.entries(map)
    .filter(([, entry]) => entry && typeof entry.until === "number" && entry.until > now)
    .sort((a, b) => b[1].until - a[1].until)
    .map(([id, entry]) => `- \`${id}\` · ${Math.ceil((entry.until - now) / 1000)}s · x${entry.count ?? 1} · ${entry.error ?? ""}`)

  const body =
    "<!-- Generado por model-fallback. No editar a mano. -->\n" +
    "# Modelos en cooldown (no disponibles)\n\n" +
    (rows.length ? rows.join("\n") : "- (ninguno)") +
    "\n"
  await writeFile(COOLDOWN_MD, body, "utf8")
}

export default {
  id: "orchestrator.model-fallback",

  async setup(ctx: any) {
    if (typeof ctx?.session?.hook !== "function") return
    if (typeof ctx?.session?.switchModel !== "function") return

    const manifest = await loadManifest()
    if (!manifest?.roles) return

    const ttl = (manifest.cooldownSeconds ?? 300) * 1000
    const provider = manifest.provider || "opencode"

    let queue: Promise<unknown> = Promise.resolve()
    const enqueue = (task: () => Promise<void>) => {
      queue = queue.then(task).catch(() => {})
      return queue
    }

    await ctx.session.hook("retry", (event: any) => {
      try {
        const error = event?.error
        const id = event?.model?.id
        if (!id || !isUnavailable(error)) return

        void enqueue(async () => {
          try {
            await mkdir(STORE, { recursive: true })

            const map = await loadCooldown()
            map[id] = {
              until: Date.now() + ttl,
              count: (map[id]?.count ?? 0) + 1,
              at: new Date().toISOString(),
              error: String(error?.message ?? error?.type ?? "").slice(0, 160),
            }
            await writeFile(COOLDOWN, JSON.stringify(map, null, 2), "utf8")
            await writeCooldownMd(map)

            const pick = pickNext(manifest, id, event?.agent, map)
            if (pick && pick.id !== id) {
              await ctx.session.switchModel({
                sessionID: event.sessionID,
                model: { providerID: provider, id: pick.id, ...(pick.variant ? { variant: pick.variant } : {}) },
              })
            }
          } catch {
            /* nunca romper la sesión por el fallback */
          }
        })
      } catch {
        /* ignora */
      }
    })
  },
}
