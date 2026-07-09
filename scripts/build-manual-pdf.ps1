# =============================================================================
#  build-manual-pdf.ps1 - genera el PDF EDITORIAL de docs/MANUAL_INSTALACION.md
#  con Pandoc + XeLaTeX + plantilla Eisvogel (portada, indice, encabezado/pie).
#
#    powershell -ExecutionPolicy Bypass -File scripts\build-manual-pdf.ps1
#    ... -In docs\OTRO.md -Out docs\OTRO.pdf
#
#  Prerrequisitos (una vez):
#    winget install --id JohnMacFarlane.Pandoc
#    winget install --id MiKTeX.MiKTeX        (o TeX Live; aporta xelatex)
#  La plantilla Eisvogel (MIT) y el header/meta viven versionados en scripts/pdf/,
#  asi que el build es reproducible y OFFLINE (no descarga nada).
#
#  Nota: LaTeX no renderiza emoji; este script los mapea a simbolos limpios
#  (check verde / cruz roja / aviso ambar) y elimina los decorativos. Script
#  ASCII-only a proposito (PowerShell 5.1 sin BOM mojibakea el no-ASCII); los
#  textos con acentos van en scripts/pdf/meta.yaml, que lee pandoc en UTF-8.
# =============================================================================
[CmdletBinding()]
param(
  [string]$In,
  [string]$Out
)
$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $In)  { $In  = Join-Path $repo 'docs\MANUAL_INSTALACION.md' }
if (-not $Out) { $Out = Join-Path $repo 'docs\MANUAL_INSTALACION.pdf' }
$pdfdir = Join-Path $repo 'scripts\pdf'

# -- localizar pandoc + xelatex (MiKTeX/TeX Live) -----------------------------
function Find-Exe($name, $extra) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $extra) { if (Test-Path $p) { return $p } }
  return $null
}
$pandoc = Find-Exe 'pandoc' @("$env:LOCALAPPDATA\Pandoc\pandoc.exe", "$env:ProgramFiles\Pandoc\pandoc.exe")
$xelatex = Find-Exe 'xelatex' @("$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64\xelatex.exe", "$env:ProgramFiles\MiKTeX\miktex\bin\x64\xelatex.exe")
if (-not $pandoc)  { Write-Host "[X] Falta pandoc. Instala: winget install --id JohnMacFarlane.Pandoc" -ForegroundColor Red; exit 1 }
if (-not $xelatex) { Write-Host "[X] Falta xelatex. Instala: winget install --id MiKTeX.MiKTeX" -ForegroundColor Red; exit 1 }
$mikbin = Split-Path $xelatex
$env:PATH = "$mikbin;" + (Split-Path $pandoc) + ";$env:PATH"
# MiKTeX: auto-instalar paquetes que falten sin preguntar (idempotente).
$initexmf = Join-Path $mikbin 'initexmf.exe'
if (Test-Path $initexmf) { & $initexmf --set-config-value "[MPM]AutoInstall=1" 2>&1 | Out-Null }

# -- preprocesar el Markdown (emoji -> simbolos LaTeX) ------------------------
$md = [System.IO.File]::ReadAllText((Resolve-Path $In), [System.Text.Encoding]::UTF8)
$md = $md.Replace([string][char]0x2705, '\ok{} ')                                  # OK  -> check verde
$md = $md.Replace([string][char]0x274C, '\nope{} ')                               # X   -> cruz roja
$md = $md.Replace(([string]([char]0x26A0) + [string]([char]0xFE0F)), '\warn{} ')  # aviso (+VS16)
$md = $md.Replace([string][char]0x26A0, '\warn{} ')                               # aviso
$md = $md -replace '[️‍]', ''                                            # selectores/ZWJ
$md = [regex]::Replace($md, '[\uD800-\uDBFF][\uDC00-\uDFFF]', '')                  # emoji astral
$md = [regex]::Replace($md, '\p{So}', '')                                          # simbolos BMP restantes
$md = $md -replace '(?m)^#\s+Manual de instalaci.n.*\r?\n', ''                     # el titulo va en la portada
# Anchors estilo GitHub (doble guion por el em-dash) -> slug de pandoc
$md = $md.Replace('#parte-a--instalar-en-linux', '#parte-a-instalar-en-linux')
$md = $md.Replace('#parte-b--instalar-en-windows', '#parte-b-instalar-en-windows')
$pre = Join-Path ([System.IO.Path]::GetTempPath()) ("manual-pre-" + $PID + ".md")
[System.IO.File]::WriteAllText($pre, $md, (New-Object System.Text.UTF8Encoding($false)))

# -- pandoc -> PDF ------------------------------------------------------------
# (rutas en variables: `--opt=(Join-Path ...)` NO evalua el parentesis en el token)
$tpl = Join-Path $pdfdir 'eisvogel.latex'
$hdr = Join-Path $pdfdir 'header.tex'
$meta = Join-Path $pdfdir 'meta.yaml'
& $pandoc $pre -o $Out `
  --template=$tpl `
  --pdf-engine=xelatex `
  --toc --toc-depth=3 `
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
