// Arnés de pruebas del plugin `goal-loop` (mimo del API de plugins de OpenCode).
// No necesita dependencias ni package.json: usa `module.stripTypeScriptTypes`
// para cargar el .ts directamente.
//
//   node tests/goal-loop.test.mjs
//
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginPath = path.join(here, "..", ".opencode", "plugins", "goal-loop.ts")
const source = readFileSync(pluginPath, "utf8")
const js = stripTypeScriptTypes(source, { mode: "strip" })
const plugin = (await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"))).default

let failures = 0
let checks = 0
function eq(actual, expected, msg) {
  checks++
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++
    console.log(`FAIL: ${msg} => ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
  } else {
    console.log(`ok:   ${msg}`)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (type, data, extra = {}) => ({ type, data, ...extra })

function makeCtx(options = {}) {
  const store = options.store ?? new Map()
  const location = options.location ?? undefined
  const emitOnInterrupt = options.emitOnInterrupt ?? true
  const sessionGet =
    options.sessionGet ??
    (location?.directory
      ? async () => ({ agent: "orchestrator", projectID: "proj", location: { directory: location.directory } })
      : undefined)

  const prompts = []
  const synthetics = []
  const switches = []
  const interrupts = []
  const commands = new Map()
  const queue = []
  let resolveNext = null
  let emitEvent = null // se define tras crear `push`

  const ctx = {
    location,
    storage: {
      async get(k) { return store.get(k) },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))) },
      async remove(k) { store.delete(k) },
    },
    session: {
      async prompt(i) { prompts.push(i); return {} },
      async synthetic(i) { synthetics.push(i); return {} },
      async switchAgent(i) { switches.push(i); return {} },
      async interrupt(i) {
        interrupts.push(i)
        // El servidor real emite `session.execution.interrupted` al interrumpir
        // (salvo si no había turno en curso: `emitOnInterrupt: false`).
        if (emitOnInterrupt && emitEvent) emitEvent(ev("session.execution.interrupted", { sessionID: i.sessionID }))
        return {}
      },
      ...(sessionGet ? { async get(i) { return sessionGet(i) } } : {}),
    },
    event: {
      subscribe() {
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                if (queue.length) return Promise.resolve({ value: queue.shift(), done: false })
                return new Promise((res) => { resolveNext = (v) => res({ value: v, done: false }) })
              },
              return() { return Promise.resolve({ done: true }) },
            }
          },
        }
      },
    },
    command: { async transform(cb) { cb({ add: (d) => commands.set(d.name, d) }) } },
  }
  const push = (e) => { if (resolveNext) { const r = resolveNext; resolveNext = null; r(e) } else queue.push(e) }
  emitEvent = push
  return { ctx, push, prompts, synthetics, switches, interrupts, commands, store }
}

// Simula un turno completo: arranque, texto y fin.
function turn(h, sessionID, text, seq) {
  h.push(ev("session.execution.started", { sessionID }))
  if (text) h.push(ev("session.text.delta", { sessionID, delta: text }))
  h.push(ev("session.execution.succeeded", { sessionID }, { durable: { seq } }))
}

async function main() {
  /* ------------------------- 1. comandos y parseo ------------------------- */
  const h = makeCtx({ location: { directory: "C:/p", project: { id: "p" } } })
  await plugin.setup(h.ctx)
  await sleep(20)
  for (const name of ["goal", "goal-resume", "goal-stop", "goal-status"]) {
    eq(typeof h.commands.get(name)?.execute, "function", `comando /${name} registrado`)
  }

  await h.commands.get("goal").execute({ sessionID: "s1", prompt: { text: "arregla el bug --max=5" } })
  const st1 = h.store.get("goal/s1")
  eq(st1.status, "active", "estado activo")
  eq(st1.max, 5, "--max parseado")
  eq(st1.text, "arregla el bug", "texto sin el flag")
  eq(h.prompts.length, 1, "inyecta el prompt de arranque")
  eq(h.prompts[0].text.includes("[[goal:start]]"), true, "tag de arranque")

  /* --------------------------- 2. continuación --------------------------- */
  turn(h, "s1", "haciendo el paso 1", 2)
  await sleep(30)
  eq(h.prompts.length, 2, "reinyecta UNA continuación")
  eq(h.prompts[1].text.includes("[[goal:continue]]"), true, "tag de continuación")
  eq(h.store.get("goal/s1").iterations, 1, "iteraciones=1")

  h.push(ev("session.execution.succeeded", { sessionID: "s1" }, { durable: { seq: 2 } }))
  await sleep(30)
  eq(h.prompts.length, 2, "evento duplicado (mismo seq) ignorado")

  /* ------------------- 3. marcador anclado al final ---------------------- */
  turn(h, "s1", "voy a escribir GOAL_COMPLETE cuando termine", 3)
  await sleep(30)
  eq(h.prompts.length, 3, "mención en prosa NO cierra el goal")
  eq(h.store.get("goal/s1").status, "active", "sigue activo")

  turn(h, "s1", "listo\nGOAL_COMPLETE", 4)
  await sleep(30)
  eq(h.store.get("goal/s1").status, "done", "marcador final cierra el goal")
  eq(h.switches.some((s) => s.agent === "orchestrator"), true, "restaura el agente previo")

  /* ------------------ 3b. marcador tolerante (ALTO #2) ------------------- */
  const variants = [
    ["salto de línea final", "trabajo\nGOAL_COMPLETE\n"],
    ["comentario tras el marcador", "hecho\n**GOAL_COMPLETE** (criterio verificado)"],
    ["dentro de valla de código", "listo\n```\nGOAL_COMPLETE\n```"],
    ["con negritas", "fin\n**GOAL_COMPLETE**"],
  ]
  for (const [name, text] of variants) {
    const sid = "sd" + Math.random().toString(36).slice(2, 7)
    await h.commands.get("goal").execute({ sessionID: sid, prompt: { text: "obj" } })
    turn(h, sid, text, 99)
    await sleep(30)
    eq(h.store.get("goal/" + sid)?.status, "done", "cierra el goal: " + name)
  }

  /* --------------------- 3c. --max inválido (BAJO 12) -------------------- */
  await h.commands.get("goal").execute({ sessionID: "sBad", prompt: { text: "obj --max=abc" } })
  eq(h.store.get("goal/sBad").max, 40, "--max no numérico → default")
  eq(h.store.get("goal/sBad").text, "obj", "el flag inválido no queda en el objetivo")
  eq(h.synthetics.some((s) => String(s.text).includes("inválido")), true, "avisa del --max inválido")

  await h.commands.get("goal").execute({ sessionID: "sNeg", prompt: { text: "obj --max=-3" } })
  eq(h.store.get("goal/sNeg").max, 40, "--max negativo → default")
  eq(h.store.get("goal/sNeg").text, "obj", "flag negativo fuera del objetivo")

  /* ------------------------------- 4. tope ------------------------------- */
  const h2 = makeCtx()
  await plugin.setup(h2.ctx)
  await sleep(20)
  await h2.commands.get("goal").execute({ sessionID: "s2", prompt: { text: "algo --max=2" } })
  const before = h2.prompts.length
  for (const seq of [1, 2, 3, 4]) {
    turn(h2, "s2", `turno ${seq}`, seq)
    await sleep(30)
  }
  eq(h2.store.get("goal/s2").status, "stopped", "para al llegar al tope")
  eq(h2.store.get("goal/s2").iterations, 2, "conta 2 continuaciones")
  eq(h2.prompts.length - before, 2, "inyecta exactamente 2 continuaciones")

  /* ------------------------- 5. --max=0 (una vez) ------------------------ */
  await h2.commands.get("goal").execute({ sessionID: "s2b", prompt: { text: "una vez --max=0" } })
  const b2 = h2.prompts.length
  turn(h2, "s2b", "algo", 1)
  await sleep(30)
  eq(h2.prompts.length - b2, 0, "con --max=0 no hay continuación")
  eq(h2.store.get("goal/s2b").status, "stopped", "cierra en la primera pasada")

  /* --------------------- 6. sin `started` sigue el bucle ----------------- */
  await h2.commands.get("goal").execute({ sessionID: "s2c", prompt: { text: "sin started --max=3" } })
  const b3 = h2.prompts.length
  h2.push(ev("session.execution.succeeded", { sessionID: "s2c" }, { durable: { seq: 1 } }))
  await sleep(30)
  eq(h2.prompts.length - b3, 1, "si falta started, no se estanca: continúa")

  /* -------------------- 7. pausa por mensaje del usuario ----------------- */
  await h2.commands.get("goal").execute({ sessionID: "s3", prompt: { text: "objetivo" } })
  h2.push(ev("session.inbox.enqueued", { sessionID: "s3", item: { type: "user", payload: { text: "hola" } } }))
  await sleep(30)
  eq(h2.store.get("goal/s3").status, "paused", "mensaje del usuario pausa")

  await h2.commands.get("goal").execute({ sessionID: "s3b", prompt: { text: "objetivo" } })
  h2.push(ev("session.inbox.enqueued", { sessionID: "s3b", item: { type: "user", payload: { text: "[[goal:continue]] x" } } }))
  await sleep(30)
  eq(h2.store.get("goal/s3b").status, "active", "la continuación interna NO pausa")

  /* --------------------------- 8. GOAL_BLOCKED --------------------------- */
  await h2.commands.get("goal").execute({ sessionID: "s4", prompt: { text: "imposible" } })
  turn(h2, "s4", "no se puede\nGOAL_BLOCKED: falta red", 1)
  await sleep(30)
  eq(h2.store.get("goal/s4").status, "blocked", "estado blocked")

  /* ----------------------- 9. fallo de ejecución ------------------------- */
  await h2.commands.get("goal").execute({ sessionID: "s6", prompt: { text: "objetivo" } })
  h2.push(ev("session.execution.started", { sessionID: "s6" }))
  h2.push(ev("session.execution.failed", { sessionID: "s6" }))
  await sleep(30)
  eq(h2.store.get("goal/s6").status, "paused", "fallo de ejecución pausa")

  /* --------------------- 10. /goal sin objetivo y resume ----------------- */
  const b4 = h2.prompts.length
  await h2.commands.get("goal").execute({ sessionID: "s7", prompt: { text: "   " } })
  eq(h2.prompts.length, b4, "sin objetivo no inyecta prompt")
  eq(h2.store.get("goal/s7"), undefined, "sin objetivo no crea estado")

  await h2.commands.get("goal-resume").execute({ sessionID: "s3" })
  eq(h2.store.get("goal/s3").status, "active", "/goal-resume reactiva")
  eq(h2.prompts[h2.prompts.length - 1].text.includes("[[goal:continue]]"), true, "resume inyecta continuación")

  await h2.commands.get("goal-stop").execute({ sessionID: "s3b" })
  eq(h2.store.get("goal/s3b").status, "stopped", "/goal-stop detiene")

  /* -------- 10b. reinicio sobre goal activo: NO debe auto-pausarse -------- */
  let ncall = 0
  const hg = makeCtx({
    location: { directory: "C:/g", project: { id: "g" } },
    sessionGet: async () => ({ agent: ncall++ === 0 ? "orchestrator" : "goal", projectID: "g", location: { directory: "C:/g" } }),
  })
  await plugin.setup(hg.ctx)
  await sleep(20)
  await hg.commands.get("goal").execute({ sessionID: "g1", prompt: { text: "uno" } })
  eq(hg.store.get("goal/g1").prevAgent, "orchestrator", "guarda el agente previo")
  await hg.commands.get("goal").execute({ sessionID: "g1", prompt: { text: "dos" } })
  eq(hg.store.get("goal/g1").prevAgent, "orchestrator", "hereda prevAgent al reiniciar sobre goal")
  eq(hg.synthetics.some((s) => String(s.text).includes("reiniciado")), true, "avisa del reinicio")
  eq(hg.interrupts.length, 0, "el reinicio NO interrumpe (regresión ALTO 1)")
  // El turno en curso termina: el bucle DEBE continuar (ni cerrarse ni estancarse).
  hg.push(ev("session.execution.succeeded", { sessionID: "g1" }, { durable: { seq: 40 } }))
  await sleep(30)
  eq(hg.store.get("goal/g1").status, "active", "sigue activo tras el fin del turno en curso")
  eq(hg.store.get("goal/g1").iterations, 1, "el fin del turno en curso inyecta 1 continuación")
  // El turno nuevo cuenta igual.
  turn(hg, "g1", "trabajando", 41)
  await sleep(30)
  eq(hg.store.get("goal/g1").status, "active", "sigue activo tras un turno nuevo")
  eq(hg.store.get("goal/g1").iterations, 2, "cuenta la continuación del turno nuevo")
  turn(hg, "g1", "x\nGOAL_COMPLETE", 42)
  await sleep(30)
  eq(hg.store.get("goal/g1").status, "done", "cierra tras el reinicio")
  eq(hg.switches.some((s) => s.agent === "orchestrator"), true, "restaura aunque el reinicio fuese sobre goal")

  /* ----------------- /goal-stop sin goal no crea estado (BAJO 8) --------- */
  const hStop = makeCtx()
  await plugin.setup(hStop.ctx)
  await sleep(20)
  await hStop.commands.get("goal-stop").execute({ sessionID: "none" })
  eq(hStop.store.get("goal/none"), undefined, "/goal-stop sin goal no crea estado fantasma")
  eq(hStop.synthetics.some((s) => String(s.text).includes("No hay ningún goal")), true, "avisa que no había goal")

  /* -------------- 10c. /goal-resume no reabre done/blocked (BAJO 5) ------- */
  const hRes = makeCtx()
  await plugin.setup(hRes.ctx)
  await sleep(20)
  await hRes.commands.get("goal").execute({ sessionID: "r1", prompt: { text: "obj --max=1" } })
  turn(hRes, "r1", "listo\nGOAL_COMPLETE", 1)
  await sleep(30)
  eq(hRes.store.get("goal/r1").status, "done", "goal cerrado")
  const pr = hRes.prompts.length
  await hRes.commands.get("goal-resume").execute({ sessionID: "r1" })
  eq(hRes.store.get("goal/r1").status, "done", "/goal-resume no reabre un goal done")
  eq(hRes.prompts.length, pr, "no inyecta continuación sobre un goal done")

  /* ------------------- 10d. --max recortado avisa (BAJO 6) ---------------- */
  await hRes.commands.get("goal").execute({ sessionID: "r2", prompt: { text: "obj --max=9999" } })
  eq(hRes.store.get("goal/r2").max, 500, "--max se recorta al tope duro")
  eq(hRes.synthetics.some((s) => String(s.text).includes("recortado")), true, "avisa del recorte del --max")

  /* ---- 10e. `suppress` de un interrupt sin turno no estanca el siguiente --- */
  const hSup = makeCtx({ emitOnInterrupt: false })
  await plugin.setup(hSup.ctx)
  await sleep(20)
  await hSup.commands.get("goal").execute({ sessionID: "q1", prompt: { text: "uno" } })
  // stop sin turno en curso: el interrupt no emite `interrupted`, así que el
  // `suppress` quedaría pendiente si `start()` no lo limpiara.
  await hSup.commands.get("goal-stop").execute({ sessionID: "q1" })
  await hSup.commands.get("goal").execute({ sessionID: "q1", prompt: { text: "dos" } })
  const bq = hSup.prompts.length
  hSup.push(ev("session.execution.succeeded", { sessionID: "q1" }, { durable: { seq: 1 } }))
  await sleep(30)
  eq(hSup.store.get("goal/q1").status, "active", "el goal nuevo sigue activo")
  eq(hSup.prompts.length - bq, 1, "sin `started`, el goal nuevo inyecta continuación (no se estanca)")

  /* ------------------------- 11. propiedad / instancias ------------------ */
  const sharedStore = new Map()
  sharedStore.set("goal/sZ", { status: "active", max: 5, iterations: 0, text: "x" })
  const other = makeCtx({ store: sharedStore, location: { directory: "C:/proj/a", project: { id: "pA" } }, sessionGet: async () => ({ projectID: "pB", location: { directory: "C:/proj/b" } }) })
  await plugin.setup(other.ctx)
  await sleep(20)
  turn(other, "sZ", "algo", 1)
  await sleep(30)
  eq(other.prompts.length, 0, "instancia no dueña: no inyecta")

  const owner = makeCtx({ store: sharedStore, location: { directory: "C:/proj/b", project: { id: "pB" } }, sessionGet: async () => ({ projectID: "pB", location: { directory: "C:/proj/b" } }) })
  await plugin.setup(owner.ctx)
  await sleep(20)
  turn(owner, "sZ", "algo", 1)
  await sleep(30)
  eq(owner.prompts.length, 1, "instancia dueña: inyecta 1")

  /* --------------------- 12. dos instancias, mismo dir ------------------- */
  const shared2 = new Map()
  shared2.set("goal/sW", { status: "active", max: 5, iterations: 0, text: "x" })
  const cfg = { store: shared2, location: { directory: "C:/proj/c", project: { id: "pC" } }, sessionGet: async () => ({ projectID: "pC", location: { directory: "C:/proj/c" } }) }
  const first = makeCtx(cfg)
  const second = makeCtx(cfg)
  await plugin.setup(first.ctx)
  await sleep(10)
  await plugin.setup(second.ctx) // la última registrada es la "viva"
  await sleep(20)
  turn(first, "sW", "algo", 1)
  await sleep(30)
  eq(first.prompts.length, 0, "instancia vieja (mismo dir): muda")
  turn(second, "sW", "algo", 2)
  await sleep(30)
  eq(second.prompts.length, 1, "instancia nueva (mismo dir): actúa")

  /* ------------------- 13. frontmatter de goal.md (BAJO 14b) ------------- */
  const goalMd = readFileSync(path.join(here, "..", ".opencode", "agents", "goal.md"), "utf8")
  const block = goalMd.split("permissions:")[1].split(/\n---/)[0]
  const firstAllow = block.indexOf('resource: "*"')
  const envDeny = block.indexOf('resource: "*.env"')
  const envExample = block.indexOf('resource: "*.env.example"')
  eq(envDeny > firstAllow, true, "el deny de .env va después de las allow base")
  eq(envExample > envDeny, true, "el allow de .env.example va tras el deny de .env")
  eq((block.match(/action: question/g) || []).length, 1, "question declarada una vez")
  eq(/action: question[\s\S]*?effect: deny/.test(block), true, "question denegada")
  eq((block.match(/action: grep/g) || []).length, 1, "una sola regla grep (sin denies engañosos)")

  console.log(`\n${failures === 0 ? "TODO OK" : failures + " FALLOS"} (${checks} comprobaciones)`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
