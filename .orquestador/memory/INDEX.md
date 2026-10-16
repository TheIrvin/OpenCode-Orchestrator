# Memoria del proyecto — índice

Lee este archivo **primero**. Si el mapa cubre lo que necesitas, no vuelvas a
escanear el repositorio.

- Mapa de módulos y archivos clave: `map.md`
- Archivos revisados (hash git + resumen): `files.md`
- Decisiones y por qué: `decisions.md`
- Glosario del dominio: `glossary.md`
- Errores y reglas: **globales**, en `~/.config/opencode/orquestador/`
  (`rules.md`, `auto.md`, `errors.jsonl`) — nunca dentro del proyecto
- Familias y cadenas de modelos (respaldo/rotación): `models.json` (mismo dir)
- Grafo de memoria MCP (hechos cross-proyecto): `graph.jsonl`
- Última actualización: 2026-10-16

## Cómo usar esta memoria

1. Antes de leer un archivo, comprueba su hash: `git hash-object <archivo>`.
   Si coincide con `files.md`, confía en el resumen.
2. Después de aprender algo nuevo, actualiza `map.md`/`files.md`/`decisions.md`.
3. Hechos que sirven en otros proyectos → MCP `memory` (no aquí).
