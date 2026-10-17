/**
 * error-memory — persistencia de errores SIN dejar archivos en el proyecto.
 *
 * Escribe TODO en un almacén global (
 *   ~/.config/opencode/orchestrator/ ), nunca dentro del repositorio del usuario:
 *
 *   errors.jsonl  → registro completo (append-only, con el proyecto de origen)
 *   auto.md       → digest de errores recurrentes (≤15 líneas), leído
 *                   ON-DEMAND (ya no va siempre en el prompt: ahorra tokens)
 *
 * El objetivo es doble:
 *   1. Que un error no se repita (queda registrado y, los recurrentes, en
 *      `auto.md`, que el modelo lee on-demand antes de reintentar).
 *   2. No ensuciar ningún proyecto con archivos que puedan acabar en un commit.
 *
 * `auto.md` solo se reescribe cuando cambia su contenido (no lo reescribe por
 * gusto; se lee on-demand antes de reintentar un fallo).
 *
 * Un fallo llega de dos formas:
 *   - `status: "error"` (error duro de la herramienta).
 *   - `status: "completed"` con `result.output.exit !== 0` (comando de shell
 *     que terminó con código distinto de cero: el caso típico de comillas/rutas).
 *
 * No importa `@opencode/plugin`: el cargador V2 lee el `id` y `setup()` del
 * export por defecto. Nunca lanza: si algo falla, se ignora.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"

const STORE =
  process.env.ORCHESTRATOR_STORE || path.join(homedir(), ".config", "opencode", "orchestrator")
const JSONL = path.join(STORE, "errors.jsonl")
const AUTO = path.join(STORE, "auto.md")
const MAX_AUTO = 15

function oneLine(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
}

/** Primeras líneas útiles de una salida, sin ruido de "Exited with code". */
function firstMeaningful(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Exited with code \d+$/i.test(line))
    .slice(0, 3)
    .join(" | ")
}

/** Normaliza un mensaje para que errores equivalentes compartan firma. */
function normalize(text: unknown): string {
  return String(text)
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "0x_")
    .replace(/[a-f0-9]{8,}/g, "hex_")
    .replace(/\d+/g, "#")
    .replace(/["'`]{1}[^"'`]{0,200}["'`]{1}/g, "'_'")
    .replace(/[a-z]:\\[^\s"']+/gi, "path_")
    .replace(/\/[^\s"']+/g, "/path_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

function signature(tool: string, message: unknown): string {
  return createHash("sha1")
    .update(`${tool}|${normalize(message)}`)
    .digest("hex")
    .slice(0, 10)
}

function safeInput(input: unknown): string {
  try {
    const text = typeof input === "string" ? input : JSON.stringify(input)
    return oneLine(text)
  } catch {
    return ""
  }
}

/** Extrae el fallo del evento, venga como error duro o como exit code. */
function detectFailure(event: any): { message: string; exit: number | null } | null {
  if (event?.status === "error") {
    const message = event?.error?.message ?? event?.error?.type ?? "error desconocido"
    return { message: String(message), exit: null }
  }

  if (event?.status !== "completed") return null

  const result = event?.result
  const exit = result?.output?.exit ?? result?.metadata?.exit
  if (typeof exit !== "number" || exit === 0) return null

  const texts = Array.isArray(result?.content)
    ? result.content.map((part: any) => part?.text).filter((text: any) => typeof text === "string")
    : []
  const body = `${result?.output?.output ?? ""}\n${texts.join("\n")}`
  const message = firstMeaningful(body) || `salida con código ${exit}`
  return { message, exit }
}

/** Reconstruye el digest de errores recurrentes en auto.md (solo si cambia). */
async function regenerateAuto(): Promise<void> {
  let raw = ""
  try {
    raw = await readFile(JSONL, "utf8")
  } catch {
    return
  }

  const bySig = new Map<
    string,
    { tool: string; error: string; count: number; last: string; project: string }
  >()

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue
    let record: any
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (!record?.signature) continue
    const current = bySig.get(record.signature) ?? {
      tool: record.tool ?? "?",
      error: record.error ?? "",
      count: 0,
      last: "",
      project: "",
    }
    current.count += 1
    if ((record.ts ?? "") >= current.last) {
      current.last = record.ts ?? ""
      current.tool = record.tool ?? "?"
      current.error = record.error ?? ""
      current.project = record.project ?? ""
    }
    bySig.set(record.signature, current)
  }

  const top = [...bySig.values()]
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, MAX_AUTO)

  const body =
    "<!-- Generado por error-memory. No editar a mano. -->\n" +
    "# Errores recurrentes (auto)\n\n" +
    (top.length
      ? top.map((e) => `- x${e.count} - \`${e.tool}\` - ${e.error}`).join("\n")
      : "- (sin errores registrados)") +
    "\n"

  let previous = ""
  try {
    previous = await readFile(AUTO, "utf8")
  } catch {
    /* no existía */
  }
  if (previous !== body) await writeFile(AUTO, body, "utf8")
}

export default {
  id: "orchestrator.error-memory",

  async setup(ctx: any) {
    if (typeof ctx?.tool?.hook !== "function") return

    const project: string = ctx?.location?.directory ?? process.cwd()
    const projectName = path.basename(project)
    const lastInput = new Map<string, unknown>()

    let queue: Promise<unknown> = Promise.resolve()
    const enqueue = (task: () => Promise<void>) => {
      queue = queue.then(task).catch(() => {})
      return queue
    }

    await ctx.tool.hook("execute.before", (event: any) => {
      try {
        if (event?.tool) lastInput.set(event.tool, event.input)
      } catch {
        /* ignora */
      }
    })

    await ctx.tool.hook("execute.after", (event: any) => {
      const failure = detectFailure(event)
      if (!failure) return

      const tool: string = event?.tool ?? "?"
      const input = event?.input ?? lastInput.get(tool)

      void enqueue(async () => {
        try {
          await mkdir(STORE, { recursive: true })

          const record = {
            ts: new Date().toISOString(),
            project,
            projectName,
            tool,
            agent: event?.agent ?? null,
            sessionID: event?.sessionID ?? null,
            exit: failure.exit,
            signature: signature(tool, failure.message),
            input: safeInput(input),
            error: oneLine(failure.message),
          }
          await appendFile(JSONL, JSON.stringify(record) + "\n", "utf8")
          await regenerateAuto()
        } catch {
          /* nunca romper la sesión por la memoria */
        }
      })
    })
  },
}
