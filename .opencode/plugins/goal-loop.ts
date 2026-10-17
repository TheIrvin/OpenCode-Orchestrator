/**
 * goal-loop — modo "goal" autónomo, al estilo de `/goal` de Codex.
 *
 * Declaras un objetivo y el agente itera SOLO, sin esperar tus mensajes de
 * confirmación, hasta cumplirlo (o agotar el tope). OpenCode no trae esto de
 * fábrica: cada turno acaba y devuelve el control al usuario. Este plugin
 * reinyecta una continuación cuando detecta que el turno terminó.
 *
 * API de plugins V2 que usa:
 *
 *   - `ctx.event.subscribe()` → stream de eventos del servidor. Nombres reales
 *     (descubiertos del SSE): `session.execution.started`, `session.text.delta`,
 *     `session.execution.succeeded` (fin de turno), `session.execution.failed`,
 *     `session.execution.interrupted`, `session.inbox.enqueued`.
 *   - `ctx.session.prompt({ sessionID, text, delivery })` → inyecta la
 *     continuación (o el arranque del goal).
 *   - `ctx.session.switchAgent({ sessionID, agent })` → entra/sale del agente.
 *   - `ctx.session.interrupt({ sessionID })` → corta el turno en curso (al parar).
 *   - `ctx.session.synthetic({ sessionID, text })` → avisos de estado (no
 *     disparan un turno ni el bucle).
 *   - `ctx.storage` → estado durable por sesión.
 *   - `ctx.command.transform()` → registra /goal, /goal-resume, /goal-stop y
 *     /goal-status.
 *
 * EL PROBLEMA DIFÍCIL: el stream de eventos es GLOBAL y este plugin se carga
 * una vez por *location* (una por directorio). Sin un dueño único, cada
 * instancia reinyectaría la misma continuación. Dos filtros lo evitan:
 *
 *   1. `isOwner`: el evento no trae location, así que consultamos la sesión
 *      (`ctx.session.get`) y solo actúa la instancia cuyo directorio coincide
 *      con el de la sesión.
 *   2. `isLive`: si hay dos instancias para el mismo directorio (p. ej. la copia
 *      global y la del proyecto, o un recargado en caliente), solo la última
 *      registrada actúa. El registro vive en `globalThis` (mismo proceso del
 *      servidor), no en `ctx.storage`, cuyo alcance por plugin no garantiza que
 *      dos instancias compartan la clave.
 *
 * Protecciones para no acabar en un bucle infinito (el bug "3994 remain paused"
 * de Codex):
 *   - Tope de continuaciones (`--max`, 40 por defecto; tope duro 500).
 *   - El agente cierra con una línea `GOAL_COMPLETE` o `GOAL_BLOCKED: <motivo>`
 *     (se busca al FINAL del mensaje, tolerando énfasis markdown y texto extra).
 *   - Cualquier mensaje TUYO pausa el goal (no se reinicia solo).
 *   - Un fallo/interrupción de ejecución pausa el goal.
 *   - Si un turno no termina en 15 min, el goal se pausa y avisa.
 *
 * Nunca lanza: si algo falla, la sesión sigue como estaba.
 */

const TAG_START = "[[goal:start]]"
const TAG_CONT = "[[goal:continue]]"
const MARK_COMPLETE = "GOAL_COMPLETE"
const MARK_BLOCKED = "GOAL_BLOCKED"
const DEFAULT_MAX = 40
const HARD_MAX = 500
const TURN_TIMEOUT_MS = 15 * 60 * 1000

// (Los ayudantes y el registro de instancias viven dentro de `setup`: el
// chequeo de sintaxis de Node no limpia los tipos TS de nivel superior.)

export default {
  id: "orchestrator.goal-loop",

  async setup(ctx: any) {
    const isFn = (obj: any, key: string) => Boolean(obj && typeof obj[key] === "function")
    if (!isFn(ctx?.event, "subscribe") || !isFn(ctx?.session, "prompt")) return

    // Registro de instancias vivas por directorio, compartido en el proceso del
    // servidor. `globalThis` se comparte entre módulos, así que dos cargas del
    // plugin (global + proyecto) o un recargado en caliente se pisan bien.
    const LIVE = (() => {
      const g: any = globalThis as any
      if (!(g.__orchestratorGoalLoopLive instanceof Map)) g.__orchestratorGoalLoopLive = new Map()
      return g.__orchestratorGoalLoopLive as Map<string, string>
    })()

    const normalizeLocation = (value: unknown) =>
      String(value ?? "").trim().replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase()

    // Quita énfasis markdown alrededor de una línea para leer el marcador.
    const normalizeLine = (line: string) =>
      line
        .replace(/^\s*[>*_`#-]+\s*/, "")
        .replace(/\s*[*_`]+\s*$/, "")
        .trim()

    // Detecta el marcador de cierre SOLO al final del mensaje (últimas 3 líneas
    // no vacías). Descarta las líneas de valla ``` (así un marcador envuelto en
    // un bloque de código sigue contando) pero conserva su contenido. Tolerante a
    // un `\n` final, a negritas y a un comentario tras el marcador; inmune a
    // mencionarlo en prosa.
    function endMarker(text: string): "done" | "blocked" | null {
      const lines = String(text ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^```/.test(l))
      const tail = lines.slice(-3)
      for (let i = tail.length - 1; i >= 0; i--) {
        const line = normalizeLine(tail[i])
        if (new RegExp("^" + MARK_COMPLETE + "\\b", "i").test(line)) return "done"
        if (new RegExp("^" + MARK_BLOCKED + "\\b", "i").test(line)) return "blocked"
      }
      return null
    }

    const key = (sessionID: string) => `goal/${sessionID}`
    const suppress = new Set<string>() // turnos cuyo fin debe ignorarse (tras reiniciar)
    const seenSeq = new Map<string, unknown>()
    const acc = new Map<string, string>() // sessionID -> último texto del asistente
    const timers = new Map<string, any>() // sessionID -> watchdog del turno

    const OWN_DIR = normalizeLocation(ctx?.location?.directory)
    const OWN_PROJECT = ctx?.location?.project?.id
    const INSTANCE_KEY = OWN_DIR || "global"
    const INSTANCE_TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36)

    // Nos registramos como la instancia viva de este directorio: la última en
    // hacerlo gana y deja mudas a las anteriores (doble carga o recargado).
    LIVE.set(INSTANCE_KEY, INSTANCE_TOKEN)

    function isLive(): boolean {
      return LIVE.get(INSTANCE_KEY) === INSTANCE_TOKEN
    }

    async function isOwner(sessionID: string): Promise<boolean> {
      if (!OWN_DIR && !OWN_PROJECT) return true
      if (!isFn(ctx.session, "get")) return true
      try {
        const info = await ctx.session.get({ sessionID })
        const dir = normalizeLocation(info?.location?.directory)
        if (OWN_DIR && dir) return dir === OWN_DIR
        if (OWN_PROJECT && info?.projectID) return info.projectID === OWN_PROJECT
      } catch {
        return false
      }
      return false
    }

    // Solo actúa la instancia viva Y dueña de la sesión.
    async function canAct(sessionID: string): Promise<boolean> {
      if (!isLive()) return false
      return isOwner(sessionID)
    }

    /* ----------------------------- estado ----------------------------- */

    async function readState(sessionID: string): Promise<any> {
      try {
        const value = await ctx.storage.get(key(sessionID))
        return value && typeof value === "object" ? value : undefined
      } catch {
        return undefined
      }
    }

    async function writeState(sessionID: string, patch: Record<string, unknown>) {
      try {
        const current = (await readState(sessionID)) ?? {}
        const next = { ...current, ...patch, updatedAt: Date.now() }
        await ctx.storage.set(key(sessionID), next)
        return next
      } catch {
        return undefined
      }
    }

    async function notify(sessionID: string, text: string) {
      if (!isFn(ctx.session, "synthetic")) return
      try {
        await ctx.session.synthetic({ sessionID, text })
      } catch {
        /* los avisos no son críticos */
      }
    }

    async function interrupt(sessionID: string) {
      if (!isFn(ctx.session, "interrupt")) return
      // El `session.execution.interrupted` que provoque esta interrupción NO debe
      // pausar el goal: ya vamos a cerrarlo nosotros (stop/pausa/timeout).
      suppress.add(sessionID)
      try {
        await ctx.session.interrupt({ sessionID })
      } catch {
        /* puede no haber turno en curso */
      }
    }

    async function restoreAgent(sessionID: string, prevAgent?: string) {
      if (!prevAgent || prevAgent === "goal" || !isFn(ctx.session, "switchAgent")) return
      try {
        await ctx.session.switchAgent({ sessionID, agent: prevAgent })
      } catch {
        /* si ya no existe el agente previo, seguimos en goal */
      }
    }

    function forget(sessionID: string) {
      acc.delete(sessionID)
      seenSeq.delete(sessionID)
    }

    /* --------------------------- watchdog ----------------------------- */

    function disarm(sessionID: string) {
      const t = timers.get(sessionID)
      if (t) clearTimeout(t)
      timers.delete(sessionID)
    }

    function arm(sessionID: string) {
      disarm(sessionID)
      const t = setTimeout(() => {
        void onTimeout(sessionID)
      }, TURN_TIMEOUT_MS)
      if (t && typeof t.unref === "function") t.unref()
      timers.set(sessionID, t)
    }

    async function onTimeout(sessionID: string) {
      const state = await readState(sessionID)
      if (!state || state.status !== "active") return
      await interrupt(sessionID)
      await endGoal(sessionID, "paused", { reason: "timeout" })
      await notify(
        sessionID,
        "⏸️ Goal pausado: el turno llevaba demasiado tiempo sin terminar. Reanúdalo con /goal-resume.",
      )
    }

    // Cierra el goal: fija estado terminal, devuelve la sesión a su agente previo
    // y limpia las cachés en memoria.
    async function endGoal(sessionID: string, status: string, patch: Record<string, unknown> = {}) {
      disarm(sessionID)
      const state = await writeState(sessionID, { status, finishedAt: Date.now(), ...patch })
      forget(sessionID)
      await restoreAgent(sessionID, state?.prevAgent)
      return state
    }

    /* --------------------------- arranque ----------------------------- */

    function parseArgs(text: unknown) {
      const raw = String(text ?? "").replace(/^\/goal\b/i, "").trim()
      let max = DEFAULT_MAX
      let invalid: string | undefined
      let clamped = false
      let body = raw
      const found = raw.match(/--max(?:=|\s+)(\S+)/i)
      if (found) {
        body = raw.replace(found[0], " ").trim()
        const n = Number.parseInt(found[1], 10)
        if (/^\d+$/.test(found[1]) && Number.isFinite(n)) {
          max = Math.min(HARD_MAX, n)
          if (n > HARD_MAX) clamped = true
        } else {
          invalid = found[1]
        }
      }
      return { body: body.replace(/\s+/g, " ").trim(), max, invalid, clamped }
    }

    function startPrompt(objetivo: string, max: number) {
      return [
        TAG_START,
        "MODO GOAL — objetivo declarado:",
        objetivo,
        "",
        "Trabaja de forma autónoma hasta cumplir el criterio de aceptación.",
        "No pidas confirmación ni preguntes al usuario: decide y sigue.",
        `Al terminar TODOS los criterios verificados, escribe como ÚLTIMA línea de tu mensaje final, y sola: ${MARK_COMPLETE}`,
        `Si es imposible cumplirlo, termina con: ${MARK_BLOCKED}: <motivo>`,
        `Tope de continuaciones: ${max}.`,
      ].join("\n")
    }

    const CONTINUE = [
      TAG_CONT,
      "Continúa el goal activo. No esperes confirmación del usuario.",
      "Haz el siguiente paso verificable, valida con evidencia real y sigue.",
      `Cuando el criterio esté cumplido escribe como última línea ${MARK_COMPLETE}; si es imposible, ${MARK_BLOCKED}: <motivo>.`,
    ].join("\n")

    async function start(sessionID: string, objetivo: string, max: number, invalid?: string, clamped?: boolean) {
      const existing = await readState(sessionID)
      // Un `suppress` pendiente (p. ej. de un `interrupt()` sin turno en curso, que
      // no emitió `interrupted`) no debe arrastrarse a este goal nuevo.
      suppress.delete(sessionID)
      // Heredamos el agente previo: si ya estábamos en `goal`, `session.get` lo
      // devolvería y no podríamos restaurarlo al terminar.
      let prevAgent: string | undefined = existing?.prevAgent
      if (isFn(ctx.session, "get")) {
        try {
          const info = await ctx.session.get({ sessionID })
          if (info?.agent && info.agent !== "goal") prevAgent = info.agent
        } catch {
          /* sin info, conservamos el prevAgent heredado */
        }
      }
      const restart = existing?.status === "active"
      await writeState(sessionID, {
        text: objetivo,
        max,
        iterations: 0,
        status: "active",
        startedAt: Date.now(),
        prevAgent,
      })
      acc.set(sessionID, "")
      arm(sessionID)
      if (isFn(ctx.session, "switchAgent")) {
        try {
          await ctx.session.switchAgent({ sessionID, agent: "goal" })
        } catch {
          /* si no existe el agente, seguimos con el actual */
        }
      }
      if (invalid) await notify(sessionID, `Valor de --max inválido ("${invalid}"): uso ${max}.`)
      if (clamped) await notify(sessionID, `--max recortado al tope de ${HARD_MAX}.`)
      if (restart) {
        // No interrumpimos: la interrupción emitía `session.execution.interrupted`
        // y el handler pausaba el goal recién reiniciado. Basta con re-sembrar el
        // estado y reinyectar el objetivo; el turno en curso (o el nuevo) sigue.
        await notify(sessionID, "🔄 Goal reiniciado.")
      }
      await ctx.session.prompt({ sessionID, text: startPrompt(objetivo, max), delivery: "steer" })
    }

    /* --------------------------- el bucle ----------------------------- */

    async function onSucceeded(sessionID: string) {
      if (suppress.delete(sessionID)) return // era el turno viejo, antes de un reinicio
      const state = await readState(sessionID)
      if (!state || state.status !== "active") {
        forget(sessionID)
        return
      }

      const text = acc.get(sessionID) ?? ""
      // NO borramos `acc`: lo dejamos vacío para seguir acumulando aunque un
      // recargado en caliente nos haya hecho perder el `session.execution.started`.
      acc.set(sessionID, "")

      const marker = endMarker(text)
      if (marker === "done") {
        await endGoal(sessionID, "done")
        await notify(sessionID, `✅ Goal completado en ${Number(state.iterations) || 0} continuaciones.`)
        return
      }

      if (marker === "blocked") {
        const motivo = (String(text).match(/GOAL_BLOCKED[^\n]*/i) || [MARK_BLOCKED])[0].trim()
        await endGoal(sessionID, "blocked", { motivo })
        await notify(sessionID, `⛔ Goal bloqueado: ${motivo}`)
        return
      }

      const iterations = Number(state.iterations) || 0
      const max = Number.isFinite(Number(state.max)) ? Number(state.max) : DEFAULT_MAX
      if (iterations >= max) {
        await endGoal(sessionID, "stopped")
        await notify(sessionID, `⏹️ Goal detenido: llegó al tope de ${max} continuaciones sin ${MARK_COMPLETE}.`)
        return
      }

      try {
        await writeState(sessionID, { iterations: iterations + 1 })
        acc.set(sessionID, "")
        arm(sessionID)
        await ctx.session.prompt({ sessionID, text: CONTINUE, delivery: "steer" })
      } catch (error: any) {
        await endGoal(sessionID, "paused", { reason: "prompt-error", error: String(error?.message ?? error) })
        await notify(sessionID, "⏸️ Goal pausado: no se pudo inyectar la continuación. Reanúdalo con /goal-resume.")
      }
    }

    async function onEvent(event: any) {
      const type = event?.type
      if (!type) return

      // Filtro barato por tipo ANTES de tocar la sesión: el stream es global y
      // llegan muchos eventos que no nos incumben.
      if (
        type !== "session.execution.started" &&
        type !== "session.text.delta" &&
        type !== "session.execution.succeeded" &&
        type !== "session.execution.failed" &&
        type !== "session.execution.interrupted" &&
        type !== "session.inbox.enqueued"
      ) {
        return
      }

      const data = event?.data ?? event
      const sessionID: string | undefined = data?.sessionID
      if (!sessionID) return

      // text.delta se filtra solo: únicamente una instancia que ya actúa tiene `acc`.
      if (type !== "session.text.delta" && !(await canAct(sessionID))) return

      if (type === "session.execution.started") {
        suppress.delete(sessionID) // arrancó el turno nuevo
        const state = await readState(sessionID)
        if (state && state.status === "active") {
          acc.set(sessionID, "")
          arm(sessionID)
        }
        return
      }

      if (type === "session.text.delta") {
        if (acc.has(sessionID)) acc.set(sessionID, (acc.get(sessionID) || "") + String(data?.delta ?? ""))
        return
      }

      if (type === "session.execution.succeeded") {
        const seq = event?.durable?.seq
        if (seq != null) {
          if (seenSeq.get(sessionID) === seq) return
          seenSeq.set(sessionID, seq)
        }
        // Aunque falte `started` (evento perdido), seguimos: mejor una iteración
        // de más (acotada) que un estancamiento silencioso.
        await onSucceeded(sessionID)
        return
      }

      if (type === "session.execution.failed" || type === "session.execution.interrupted") {
        if (suppress.delete(sessionID)) return // fallo del turno viejo, antes de un reinicio
        const state = await readState(sessionID)
        if (state && state.status === "active") {
          await endGoal(sessionID, "paused", { reason: type.replace("session.execution.", "") })
          await notify(sessionID, `⏸️ Goal pausado: la ejecución ${type.replace("session.execution.", "")}. Reanúdalo con /goal-resume.`)
        } else {
          forget(sessionID)
        }
        return
      }

      if (type === "session.inbox.enqueued") {
        const item = data?.item
        if (item?.type !== "user") return
        const text = String(item?.payload?.text ?? "")
        // Nuestras propias continuaciones empiezan por el tag; un mensaje tuyo
        // que solo lo MENCIONE no debe confundirse con una inyección interna.
        if (text.startsWith(TAG_START) || text.startsWith(TAG_CONT)) return
        if (/^\/goal\b/i.test(text.trim())) return
        const state = await readState(sessionID)
        if (state && state.status === "active") {
          await interrupt(sessionID)
          await endGoal(sessionID, "paused", { reason: "user" })
          await notify(sessionID, "⏸️ Goal pausado por tu mensaje. Reanúdalo con /goal-resume.")
        }
      }
    }

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            await onEvent(event)
          } catch {
            /* un evento malformado no debe tumbar el bucle */
          }
        }
      } catch {
        /* stream abortado al descargar el plugin */
      }
    })()

    /* --------------------------- comandos ----------------------------- */

    if (isFn(ctx.command, "transform")) {
      try {
        await ctx.command.transform((editor: any) => {
          editor.add({
            name: "goal",
            description: "Declara un objetivo autónomo: el agente itera sin pedir confirmación hasta cumplirlo. Tope opcional con --max=N.",
            execute: async ({ sessionID, prompt }: any) => {
              const { body, max, invalid, clamped } = parseArgs(prompt?.text)
              if (!body) {
                await notify(sessionID, "Uso: /goal <objetivo> [--max=N]\nEjemplo: /goal añade tests a utils y pásalos --max=25")
                return
              }
              await start(sessionID, body, max, invalid, clamped)
            },
          })

          editor.add({
            name: "goal-resume",
            description: "Reanuda el goal autónomo pausado o detenido de esta sesión.",
            execute: async ({ sessionID }: any) => {
              const state = await readState(sessionID)
              if (!state || !state.text) {
                await notify(sessionID, "No hay ningún goal declarado en esta sesión.")
                return
              }
              if (state.status === "done" || state.status === "blocked") {
                await notify(sessionID, `El goal ya terminó (${state.status}). Declara uno nuevo con /goal.`)
                return
              }
              suppress.delete(sessionID) // no arrastrar una interrupción previa
              // Si se detuvo por tope, damos un presupuesto nuevo.
              const reset = state.status === "stopped" ? { iterations: 0 } : {}
              await writeState(sessionID, { status: "active", ...reset })
              if (isFn(ctx.session, "switchAgent")) {
                try {
                  await ctx.session.switchAgent({ sessionID, agent: "goal" })
                } catch {
                  /* seguimos con el agente actual */
                }
              }
              acc.set(sessionID, "")
              arm(sessionID)
              await ctx.session.prompt({ sessionID, text: CONTINUE, delivery: "steer" })
            },
          })

          editor.add({
            name: "goal-stop",
            description: "Detiene el goal autónomo de esta sesión.",
            execute: async ({ sessionID }: any) => {
              const state = await readState(sessionID)
              if (!state || !state.text) {
                await notify(sessionID, "No hay ningún goal activo en esta sesión.")
                return
              }
              await interrupt(sessionID)
              await endGoal(sessionID, "stopped")
              await notify(sessionID, "⏹️ Goal detenido.")
            },
          })

          editor.add({
            name: "goal-status",
            description: "Muestra el estado del goal autónomo de esta sesión.",
            execute: async ({ sessionID }: any) => {
              const state = await readState(sessionID)
              if (!state || !state.text) {
                await notify(sessionID, "Sin goal en esta sesión.")
                return
              }
              const max = Number.isFinite(Number(state.max)) ? Number(state.max) : DEFAULT_MAX
              await notify(
                sessionID,
                `Goal [${state.status}] · ${Number(state.iterations) || 0}/${max} continuaciones\n${state.text}`,
              )
            },
          })
        })
      } catch {
        /* si no se pueden registrar comandos, el bucle sigue */
      }
    }

    console.log("[orchestrator] goal-loop activo: /goal, /goal-resume, /goal-stop, /goal-status")
    return () => {
      controller.abort()
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      if (LIVE.get(INSTANCE_KEY) === INSTANCE_TOKEN) LIVE.delete(INSTANCE_KEY)
    }
  },
}
