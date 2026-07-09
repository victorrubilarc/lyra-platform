# =============================================================================
#  build-smoke-pdf.ps1 - genera el PDF EDITORIAL de docs/SMOKE_VISUAL_GLOBAL.md
#  con Pandoc + LuaLaTeX + plantilla Eisvogel. Cuerpo en EB Garamond (imprenta),
#  con cadena de respaldo de fuente (Segoe UI Symbol) para simbolos/flechas.
#
#    powershell -ExecutionPolicy Bypass -File scripts\build-smoke-pdf.ps1
#    ... -In docs\OTRO.md -Out docs\OTRO.pdf
#
#  Prerrequisitos (una vez):
#    winget install --id JohnMacFarlane.Pandoc
#    winget install --id MiKTeX.MiKTeX        (aporta lualatex + ebgaramond)
#  Fuente EB Garamond via paquete MiKTeX 'ebgaramond'; mono Consolas (sistema).
#  Plantilla/meta/header viven versionados en scripts/pdf/, build reproducible/OFFLINE.
#
#  Nota: LaTeX no renderiza emoji; este script los mapea a simbolos limpios
#  (check verde / cruz roja / aviso ambar). Los simbolos de texto (->, >=, ., etc.)
#  los cubre la fuente de respaldo, NO el preprocesado. Script ASCII-only a proposito
#  (PowerShell 5.1 sin BOM mojibakea el no-ASCII); los acentos van en meta.yaml UTF-8.
# =============================================================================
[CmdletBinding()]
param(
  [string]$In,
  [string]$Out
)
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $In)  { $In  = Join-Path $repo 'docs\SMOKE_VISUAL_GLOBAL.md' }
if (-not $Out) { $Out = Join-Path $repo 'docs\SMOKE_VISUAL_GLOBAL.pdf' }
$pdfdir = Join-Path $repo 'scripts\pdf'

# -- localizar pandoc + lualatex (MiKTeX/TeX Live) ----------------------------
function Find-Exe($name, $extra) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $extra) { if (Test-Path $p) { return $p } }
  return $null
}
$pandoc  = Find-Exe 'pandoc'   @("$env:LOCALAPPDATA\Pandoc\pandoc.exe", "$env:ProgramFiles\Pandoc\pandoc.exe")
$lualatex = Find-Exe 'lualatex' @("$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64\lualatex.exe", "$env:ProgramFiles\MiKTeX\miktex\bin\x64\lualatex.exe")
if (-not $pandoc)   { Write-Host "[X] Falta pandoc. Instala: winget install --id JohnMacFarlane.Pandoc" -ForegroundColor Red; exit 1 }
if (-not $lualatex) { Write-Host "[X] Falta lualatex. Instala: winget install --id MiKTeX.MiKTeX" -ForegroundColor Red; exit 1 }
$mikbin = Split-Path $lualatex
$env:PATH = "$mikbin;" + (Split-Path $pandoc) + ";$env:PATH"
# MiKTeX: auto-instalar paquetes que falten sin preguntar (idempotente).
$initexmf = Join-Path $mikbin 'initexmf.exe'
if (Test-Path $initexmf) { & $initexmf --set-config-value "[MPM]AutoInstall=1" 2>&1 | Out-Null }

# -- preprocesar el Markdown (emoji -> simbolos LaTeX) ------------------------
$md = [System.IO.File]::ReadAllText((Resolve-Path $In), [System.Text.Encoding]::UTF8)
$md = $md.Replace([string][char]0x2705, '\ok{} ')                                  # emoji check verde
$md = $md.Replace([string][char]0x274C, '\nope{} ')                               # emoji cruz roja
$md = $md.Replace(([string]([char]0x26A0) + [string]([char]0xFE0F)), '\warn{} ')  # aviso (+VS16)
$md = $md.Replace([string][char]0x26A0, '\warn{} ')                               # aviso
$md = $md.Replace([string][char]0xFE0F, '')                                        # selector de variacion VS16
$md = $md.Replace([string][char]0x200D, '')                                        # zero-width joiner
$md = [regex]::Replace($md, '[\uD800-\uDBFF][\uDC00-\uDFFF]', '')                  # emoji astral (pares subrogados)
$pre = Join-Path ([System.IO.Path]::GetTempPath()) ("smoke-pre-" + $PID + ".md")
[System.IO.File]::WriteAllText($pre, $md, (New-Object System.Text.UTF8Encoding($false)))

# -- pandoc -> PDF ------------------------------------------------------------
$tpl  = Join-Path $pdfdir 'eisvogel.latex'
$hdr  = Join-Path $pdfdir 'header-smoke.tex'
$meta = Join-Path $pdfdir 'meta-smoke.yaml'
& $pandoc $pre -o $Out `
  --template=$tpl `
  --pdf-engine=lualatex `
  --toc --toc-depth=2 `
  -H $hdr `
  --metadata-file=$meta
$code = $LASTEXITCODE
Remove-Item $pre -ErrorAction SilentlyContinue

if ($code -eq 0 -and (Test-Path $Out)) {
  Write-Host ("[OK] PDF generado: $Out  (" + [int]((Get-Item $Out).Length / 1kb) + " KB)") -ForegroundColor Green
} else {
  Write-Host "[X] Fallo la generacion del PDF (pandoc exit $code)" -ForegroundColor Red
  exit 1
}
