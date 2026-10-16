<#
.SYNOPSIS
  Instala el sistema ORQUESTADOR en la configuración global de OpenCode.

.DESCRIPTION
  Copia agentes, comandos, skills y plugins a ~/.config/opencode/ y genera una
  configuración global a partir de opencode.jsonc. Además:

    - Ajusta la ruta del archivo de memoria MCP a una ubicación absoluta.
    - Crea el almacén global de errores (~/.config/opencode/orquestador/) y
      registra sus reglas en `instructions` para que se carguen en el prefijo
      cacheado del prompt (sin gastar tool calls ni razonamiento).
    - Instala el manifiesto de modelos (`models.json`) con familias y cadenas de
      respaldo, que usa el plugin `model-fallback` para rotar cuando un modelo
      se agota.

  No toca service.json ni destruye configuración previa: si ya existe un
  opencode.json(c) global, lo respalda antes de escribir.

.EXAMPLE
  pwsh -File install.ps1
#>

[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE ".config\opencode")
)

$ErrorActionPreference = "Stop"
$Source = $PSScriptRoot

Write-Host "ORQUESTADOR -> $Destination" -ForegroundColor Cyan

# 1. Directorios
$store = Join-Path $Destination "orquestador"
$dirs = @(
  $Destination,
  (Join-Path $Destination "agents"),
  (Join-Path $Destination "commands"),
  (Join-Path $Destination "skills"),
  (Join-Path $Destination "plugins"),
  (Join-Path $Destination "memory"),
  $store
)
foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# 2. Agentes, comandos, skills y plugins
foreach ($sub in @("agents", "commands", "skills", "plugins")) {
  $from = Join-Path $Source ".opencode\$sub"
  if (Test-Path $from) {
    Copy-Item -Path (Join-Path $from "*") -Destination (Join-Path $Destination $sub) -Recurse -Force
    Write-Host "  [ok] .opencode\$sub" -ForegroundColor Green
  }
}

# 3. Almacén global de errores (reglas + digest)
$rules = Join-Path $store "rules.md"
if (-not (Test-Path $rules)) {
  Copy-Item (Join-Path $Source "orquestador\rules.md") $rules
  Write-Host "  [ok] orquestador\rules.md" -ForegroundColor Green
} else {
  Write-Host "  [i] orquestador\rules.md ya existe, se conservan tus reglas" -ForegroundColor Yellow
}
$auto = Join-Path $store "auto.md"
$jsonl = Join-Path $store "errors.jsonl"
if (-not (Test-Path $auto))  { [System.IO.File]::WriteAllText($auto,  "<!-- Generado por error-memory. No editar a mano. -->`n# Errores recurrentes (auto)`n`n- (sin errores registrados)`n", (New-Object System.Text.UTF8Encoding($false))) }
if (-not (Test-Path $jsonl)) { [System.IO.File]::WriteAllText($jsonl, "", (New-Object System.Text.UTF8Encoding($false))) }

# 3b. Manifiesto de modelos + cadenas de respaldo (fuente única del fallback)
Copy-Item (Join-Path $Source "orquestador\models.json") (Join-Path $store "models.json") -Force
Write-Host "  [ok] orquestador\models.json (familias + cadenas por rol)" -ForegroundColor Green
$cooldown = Join-Path $store "model-cooldown.json"
if (-not (Test-Path $cooldown)) { [System.IO.File]::WriteAllText($cooldown, "{}`n", (New-Object System.Text.UTF8Encoding($false))) }

# 4. Configuración global (rutas absolutas + instrucciones cacheadas)
$globalConfig = Join-Path $Destination "opencode.jsonc"
if (Test-Path $globalConfig) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item $globalConfig "$globalConfig.bak-$stamp"
  Write-Host "  [i] respaldo: opencode.jsonc.bak-$stamp" -ForegroundColor Yellow
}
$memoryFile = (Join-Path $Destination "memory\graph.jsonl") -replace "\\", "\\"
$rulesJson = $rules -replace "\\", "\\"
$autoJson = $auto -replace "\\", "\\"
$content = Get-Content (Join-Path $Source "opencode.jsonc") -Raw
$content = $content.Replace(".orquestador/memory/graph.jsonl", $memoryFile)
$anchor = '"$schema": "https://opencode.ai/config.json",'
$instructions = $anchor + "`n  `"instructions`": [`"$rulesJson`", `"$autoJson`"],"
if ($content.Contains($anchor)) {
  $content = $content.Replace($anchor, $instructions)
  Write-Host "  [ok] instructions (reglas en prompt cacheado)" -ForegroundColor Green
} else {
  Write-Host "  [!] no encontre el ancla del `$schema; revisa instructions manualmente" -ForegroundColor Yellow
}
# UTF-8 SIN BOM (Set-Content -Encoding UTF8 de PS 5.1 añade BOM, que rompe el JSON)
[System.IO.File]::WriteAllText($globalConfig, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  [ok] opencode.jsonc (global)" -ForegroundColor Green

# 5. Instrucciones globales (solo si no existen)
$globalAgents = Join-Path $Destination "AGENTS.md"
if (-not (Test-Path $globalAgents)) {
  Copy-Item (Join-Path $Source "global\AGENTS.md") $globalAgents
  Write-Host "  [ok] AGENTS.md (global)" -ForegroundColor Green
} else {
  Write-Host "  [i] AGENTS.md global ya existe, no se toca" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Listo. En OpenCode:" -ForegroundColor Cyan
Write-Host "  - Agente primario por defecto: orchestrator"
Write-Host "  - Comandos: /orq /plan-quick /plan-deep /plan-long /build /review /research /catalogo /memory-init /errores /modelos"
Write-Host "  - Los errores se registran en $store (nunca dentro de tus proyectos)"
Write-Host "  - Las reglas se cargan solas en el prompt; no hace falta leerlas"
Write-Host "  - Si un modelo se agota, el plugin model-fallback rota a la siguiente familia"
Write-Host "  - Ejecuta /mcps para firmar en context7 y comprobar la memoria MCP"
