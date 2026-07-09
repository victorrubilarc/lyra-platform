# =============================================================================
#  Lyra WatchLog - SMOKE de instalacion del paquete OFFLINE en WINDOWS
#  (Docker Desktop / WSL2 con contenedores LINUX). Espejo del smoke-install.sh
#  de Linux, para el install.ps1 nativo (DECISIONS 2026-07-08 - track Windows).
#
#    powershell -ExecutionPolicy Bypass -File scripts\smoke-install-windows.ps1 -Tag v0.1.20
#    # subset de modos / puerto de modo a (si 8080 esta ocupado en tu host):
#    ... -Modes a -EdgeLocalPort 18080
#    ... -Modes a,b-host,b-ip -Pull false -SrcPrefix ghcr.io/victorrubilarc/
#
#  POR QUE MANUAL/SELF-HOSTED (no CI): los runners `windows-latest` de GitHub
#  Actions NO ejecutan contenedores Linux de forma fiable (Docker Desktop + WSL2
#  no esta disponible). Este smoke se corre en un host Windows real con Docker
#  Desktop en modo "Linux containers". La logica del install.sh (compartida) ya
#  la cubre el smoke Linux en CI; aqui se valida la CAPA Windows del install.ps1:
#   - preflight (arch/os del daemon, openssl), docker load, .env + secretos,
#   - HUELLA anclada al MachineGuid -> license\machine-id + LICENSE_MACHINE_ID_FILE,
#   - probe de permisos uid 1000 sobre ./license,
#   - modo a (loopback) + modo b hostname (SNI, sin default_sni, prueba NEGATIVA
#     por IP) + modo b IP (default_sni), y el doctor (-Check) en cada uno.
#
#  Requisitos del host: Docker Desktop (Linux containers, amd64) + docker compose
#  v2 + openssl en el PATH + curl.exe + Git for Windows (bash, para make-bundle) +
#  internet (pull de imagenes si -Pull true).
# =============================================================================
[CmdletBinding()]
param(
  [string]$Tag = 'stable',
  [string]$SrcPrefix = 'ghcr.io/victorrubilarc/',
  [ValidateSet('true', 'false')][string]$Pull = 'true',
  [string[]]$Modes = @('a', 'b-host', 'b-ip'),
  [int]$EdgeLocalPort = 8080,
  [string]$Hostn = 'watchlog.smoke.local'
)

# 'Continue' (no 'Stop'): los comandos docker escriben progreso a stderr y en PS 5.1
# eso se promueve a error terminante bajo 'Stop' (aborta el teardown). El control de
# flujo se hace con `throw` explicito + chequeo de $LASTEXITCODE, no por auto-throw.
$ErrorActionPreference = 'Continue'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Work = Join-Path ([System.IO.Path]::GetTempPath()) ("wl-smoke-" + [System.Guid]::NewGuid().ToString('N').Substring(0, 8))
$BashGit = 'C:\Program Files\Git\bin\bash.exe'
$script:Failed = 0

function Say ($m) { Write-Host ''; Write-Host (">> " + $m) -ForegroundColor Cyan }
function Ok  ($m) { Write-Host ("  [OK] " + $m) -ForegroundColor Green }
function Bad ($m) { Write-Host ("  [X]  " + $m) -ForegroundColor Red; $script:Failed = 1 }

function Compose-Args ($dir, $modeFile) {
  return @('--project-directory', $dir, '--env-file', (Join-Path $dir '.env'),
    '-f', (Join-Path $dir 'compose\docker-compose.yml'), '-f', (Join-Path $dir "compose\$modeFile"))
}
function Down ($dir, $modeFile) {
  if (-not (Test-Path -LiteralPath $dir)) { return }
  & docker compose @(Compose-Args $dir $modeFile) down -v 2>$null | Out-Null
}
function Dump-Logs ($dir, $modeFile) {
  $ca = Compose-Args $dir $modeFile
  Write-Host "------ contenedores ------"; & docker compose @ca ps -a 2>&1
  Write-Host "------ logs migrate ------"; (& docker compose @ca logs --no-color --tail 40 migrate 2>&1) | Select-Object -Last 40
  Write-Host "------ logs api ------"; (& docker compose @ca logs --no-color --tail 60 api 2>&1) | Select-Object -Last 60
}
function Set-EnvLine ($file, $key, $val) {
  $lines = @(Get-Content -LiteralPath $file)
  $found = $false
  $out = foreach ($l in $lines) { if ($l -match ('^\s*' + [regex]::Escape($key) + '=')) { $found = $true; "$key=$val" } else { $l } }
  if (-not $found) { $out = @($out) + "$key=$val" }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($file, (($out -join "`n") + "`n"), $enc)
}
function To-Posix ($p) {
  $q = $p -replace '\\', '/'
  if ($q -match '^([A-Za-z]):/(.*)$') { return '/' + $Matches[1].ToLower() + '/' + $Matches[2] }
  return $q
}
function Run-Install ($dir, [string[]]$psArgs) {
  # Proceso hijo: install.ps1 hace `exit 2`/`exit 1`; aislarlo para no matar el smoke.
  # Out-Host: su salida va a la consola y NO al pipeline, para devolver SOLO el exit code.
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'install.ps1') @psArgs | Out-Host
  return $LASTEXITCODE
}
function Http-Ok ($url, [string[]]$extra) {
  & curl.exe -sk -o NUL --max-time 15 @extra $url *> $null
  return ($LASTEXITCODE -eq 0)
}
function First-Pass ($dir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  & tar.exe -xzf $script:Tarball -C $dir --strip-components=1
  if ($LASTEXITCODE -ne 0) { Bad "tar extraccion fallo en $dir"; return $false }
  $rc = Run-Install $dir @()
  if ($rc -ne 2) { Bad "install.ps1 (1a pasada) debia salir 2, salio $rc"; return $false }
  # Validacion Windows: huella + puntero al machine-id.
  if (Test-Path -LiteralPath (Join-Path $dir 'license\machine-id')) { Ok "1a pasada: license\machine-id generado (MachineGuid)" } else { Bad "1a pasada: NO se genero license\machine-id" }
  $mif = (Get-Content -LiteralPath (Join-Path $dir '.env') | Where-Object { $_ -match '^LICENSE_MACHINE_ID_FILE=' })
  if ($mif -match '/app/license/machine-id') { Ok "1a pasada: LICENSE_MACHINE_ID_FILE=/app/license/machine-id" } else { Bad "1a pasada: LICENSE_MACHINE_ID_FILE mal seteado ('$mif')" }
  return $true
}
function Doctor-Ok ($dir) {
  $rc = Run-Install $dir @('-Check')
  if ($rc -eq 0) { Ok "doctor (install.ps1 -Check): TODO VERDE" } else { Bad "doctor reporto FALLAS (rc=$rc)" }
}

$Registered = @()
try {
  # -- 1) Preflight del propio host de smoke -------------------------------------
  Say "Preflight del host de smoke"
  $do = (& docker version -f '{{.Server.Os}}' 2>$null)
  if ($do -ne 'linux') { Bad "Docker no esta en modo contenedores Linux (Server.Os='$do'). Cambia a 'Linux containers'."; throw "preflight" }
  Ok "Docker Desktop en modo Linux containers ($((& docker version -f '{{.Server.Arch}}' 2>$null)))"
  if (-not (Test-Path -LiteralPath $BashGit)) { Bad "No encuentro Git bash en $BashGit (make-bundle lo necesita)."; throw "preflight" }

  # -- 2) Construir el bundle (via make-bundle.sh en Git bash) -------------------
  Say "make-bundle $Tag  (src=$SrcPrefix pull=$Pull)"
  New-Item -ItemType Directory -Force -Path $Work | Out-Null
  # Rutas MSYS calculadas en PowerShell (evita cygpath/$() dentro de -lc, que se
  # mangleaba al pasar el script multilinea a bash). Se escribe un .sh (LF) simple.
  $repoPosix = To-Posix $RepoRoot
  $outPosix = (To-Posix $Work) + '/dist'
  $shPath = Join-Path $Work 'mkbundle.sh'
  $sh = "set -e`ncd '$repoPosix'`nOUTPUT_DIR='$outPosix' SRC_PREFIX='$SrcPrefix' PULL='$Pull' bash scripts/make-bundle.sh '$Tag'`n"
  [System.IO.File]::WriteAllText($shPath, $sh, (New-Object System.Text.UTF8Encoding($false)))
  & $BashGit -lc "bash '$(To-Posix $shPath)'"
  if ($LASTEXITCODE -ne 0) { Bad "make-bundle fallo"; throw "bundle" }
  $script:Tarball = Join-Path $Work "dist\lyra-watchlog-$Tag.tar.gz"
  if (-not (Test-Path -LiteralPath $script:Tarball)) { Bad "no se genero el tarball ($script:Tarball)"; throw "bundle" }
  Ok "bundle generado"

  # -- 3) MODO A - detras de proxy (loopback) -----------------------------------
  if ($Modes -contains 'a') {
    Say "MODO A - detras de proxy (loopback :$EdgeLocalPort)"
    $A = Join-Path $Work 'inst-a'; $Registered += , @($A, 'mode-a.behind-proxy.yml')
    if (First-Pass $A) {
      Set-EnvLine "$A\.env" 'EDGE_MODE' 'a'
      Set-EnvLine "$A\.env" 'APP_PUBLIC_URL' "http://127.0.0.1:$EdgeLocalPort"
      Set-EnvLine "$A\.env" 'EDGE_LOCAL_PORT' "$EdgeLocalPort"
      $rc = Run-Install $A @()
      if ($rc -ne 0) { Bad "MODO A: install.ps1 (2a pasada) fallo (rc=$rc)"; Dump-Logs $A 'mode-a.behind-proxy.yml' }
      else {
        if (Http-Ok "http://127.0.0.1:$EdgeLocalPort/api/health") { Ok "MODO A: /api/health responde 200" } else { Bad "MODO A: /api/health NO respondio"; Dump-Logs $A 'mode-a.behind-proxy.yml' }
        Doctor-Ok $A
      }
    }
    Down $A 'mode-a.behind-proxy.yml'
  }

  # -- 4) MODO B / HOSTNAME - cert + borde AUTOGENERADOS (SNI, sin default_sni) --
  if ($Modes -contains 'b-host') {
    Say "MODO B / HOSTNAME - cert + borde AUTOGENERADOS (con SNI; sin default_sni)"
    $B1 = Join-Path $Work 'inst-b1'; $Registered += , @($B1, 'mode-b.own-edge.yml')
    if (First-Pass $B1) {
      Set-EnvLine "$B1\.env" 'EDGE_MODE' 'b'
      Set-EnvLine "$B1\.env" 'APP_PUBLIC_URL' "https://$Hostn"
      $rc = Run-Install $B1 @()
      if ($rc -ne 0) { Bad "MODO B/hostname: install fallo (rc=$rc)"; Dump-Logs $B1 'mode-b.own-edge.yml' }
      else {
        if ((Test-Path "$B1\certs\cert.pem") -and (Test-Path "$B1\certs\key.pem")) { Ok "MODO B/hostname: install.ps1 autogenero certs\cert.pem + key.pem" } else { Bad "MODO B/hostname: NO autogenero el certificado" }
        if ((Get-Content "$B1\edge\Caddyfile.edge") -match '^\s*default_sni') { Bad "MODO B/hostname: default_sni NO debia estar (host es hostname)" } else { Ok "MODO B/hostname: Caddyfile sin default_sni (correcto)" }
        if (Http-Ok "https://$Hostn/api/health" @('--resolve', "${Hostn}:443:127.0.0.1")) { Ok "MODO B/hostname: HTTPS por hostname (con SNI) responde 200" } else { Bad "MODO B/hostname: HTTPS por hostname FALLO"; Dump-Logs $B1 'mode-b.own-edge.yml' }
        if (Http-Ok "https://127.0.0.1/api/health") { Bad "MODO B/hostname: por IP sin SNI respondio (default_sni no debia activarse)" } else { Ok "MODO B/hostname: por IP sin SNI rechazado (default_sni condicional, correcto)" }
        Doctor-Ok $B1
      }
    }
    Down $B1 'mode-b.own-edge.yml'
  }

  # -- 5) MODO B / IP - cert + default_sni AUTOGENERADOS (acceso por IP) ---------
  if ($Modes -contains 'b-ip') {
    Say "MODO B / IP - cert + default_sni AUTOGENERADOS (acceso por IP sin SNI)"
    $B2 = Join-Path $Work 'inst-b2'; $Registered += , @($B2, 'mode-b.own-edge.yml')
    if (First-Pass $B2) {
      Set-EnvLine "$B2\.env" 'EDGE_MODE' 'b'
      Set-EnvLine "$B2\.env" 'APP_PUBLIC_URL' 'https://127.0.0.1'
      $rc = Run-Install $B2 @()
      if ($rc -ne 0) { Bad "MODO B/IP: install fallo (rc=$rc)"; Dump-Logs $B2 'mode-b.own-edge.yml' }
      else {
        if ((Get-Content "$B2\edge\Caddyfile.edge") -match '^\s*default_sni') { Ok "MODO B/IP: Caddyfile con default_sni (correcto para acceso por IP)" } else { Bad "MODO B/IP: FALTA default_sni (host es IP)" }
        if (Http-Ok "https://127.0.0.1/api/health") { Ok "MODO B/IP: HTTPS por IP (sin SNI, default_sni) responde 200" } else { Bad "MODO B/IP: HTTPS por IP FALLO"; Dump-Logs $B2 'mode-b.own-edge.yml' }
        Doctor-Ok $B2
      }
    }
    Down $B2 'mode-b.own-edge.yml'
  }
}
catch { Write-Host ("smoke abortado: " + $_.Exception.Message) -ForegroundColor Red; $script:Failed = 1 }
finally {
  foreach ($r in $Registered) { Down $r[0] $r[1] }
  if (Test-Path -LiteralPath $Work) { Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue }
}

Say "RESULTADO DEL SMOKE"
if ($script:Failed -eq 0) { Write-Host "[OK] SMOKE DE INSTALACION WINDOWS: TODO VERDE" -ForegroundColor Green; exit 0 }
else { Write-Host "[X] SMOKE DE INSTALACION WINDOWS: HUBO FALLAS (ver arriba)" -ForegroundColor Red; exit 1 }
