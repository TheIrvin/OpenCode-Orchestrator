# Reglas de trabajo (no repetir errores)

> Este archivo se carga como `instructions` en el **prefijo cacheado** del
> prompt, así que **no hace falta "leerlo" con herramientas**: ya está en
> contexto. Añade aquí solo reglas cortas y accionables. Los errores recurrentes
> se resumen automáticamente en `auto.md`.

## Entorno

- **Windows/PowerShell**: no uses `node -e` con comillas anidadas; escribe un
  `.mjs` y ejecútalo. Rutas con espacios, entre comillas dobles.
- **`npx`**: en Windows usa `cmd /c npx ...` (`npx.ps1` está bloqueado).
- **JSON/JSONC**: escribe **sin BOM** (un BOM rompe `JSON.parse`). Al limpiar
  comentarios, respeta las cadenas (`//` dentro de una URL no es comentario).

## Edición

- Usa `edit` con `oldString` único y suficiente contexto; si falla, amplía el
  contexto o usa `replaceAll`. No reescribas el archivo entero a ciegas.
- Un cambio = el mínimo que cumple el criterio de aceptación. Sin dependencias
  nuevas sin justificar.

## Proceso

- Antes de leer un archivo: si está en la memoria con el mismo hash, no lo releas.
- Antes de ejecutar o reintentar algo que falló: revisa `auto.md`/la memoria.
- Cierra con: cambios, verificación real (comando + resultado) y pendientes.
