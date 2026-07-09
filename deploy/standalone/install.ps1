# =============================================================================
#  Lyra WatchLog - instalador OFFLINE, IDEMPOTENTE y AUTOREPARABLE para WINDOWS
#  (Docker Desktop / WSL2 con contenedores LINUX). Espejo NATIVO de install.sh
#  (DECISIONS 2026-07-08 - track Windows). Mantener EN PARIDAD con install.sh.
#
#    .\install.ps1            # instala / reejecuta (idempotente)
#    .\install.ps1 -Check     # DOCTOR: diagnostico PASA/FALLA (no toca nada)
#
#  Refleja el install.sh ya afinado: verifica el paquete (cosign best-effort +
#  SHA256SUMS), carga las imagenes (docker load, cero pull), crea .env con
#  SECRETOS de openssl (nunca los rota), levanta el stack del MODO elegido y
#  espera el healthcheck. NO crea usuarios ni imprime secretos (el 1er admin lo
#  crea /setup con su token). En modo b GENERA edge\Caddyfile.edge desde
#  APP_PUBLIC_URL (default_sni SOLO si el host es IP) y AUTOGENERA un cert
#  self-signed si no hay uno corporativo.
#
#  ESPECIFICO DE WINDOWS (ver DECISIONS 2026-07-08):
#   - Huella L1: /etc/machine-id NO es fiable bajo Docker Desktop (el distro
#     docker-desktop no lo tiene; el valor de la VM interna se regenera al
#     actualizar/reset de DD). Se ancla al MachineGuid del host Windows, escrito
#     en license\machine-id (re-derivado en cada corrida) y leido por el API via
#     LICENSE_MACHINE_ID_FILE=/app/license/machine-id. Cero cambios al compose.
#   - Permisos: el chown uid 1000 de Linux no aplica; un PROBE (docker run
#     -u 1000:1000) valida que el api pueda escribir ./license antes de arrancar.
#   - Prerrequisitos: Docker Desktop en modo CONTENEDORES LINUX (amd64) + docker
#     compose v2 + openssl en el PATH (Git for Windows / portable).
# =============================================================================
[CmdletBinding()]
param(
  [switch]$Check,
  [Parameter(Position = 0)][string]$Mode
)

$ErrorActionPreference = 'Stop'
if ($Mode -eq 'doctor' -or $Mode -eq '--check') { $Check = $true }

$HERE = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $HERE

# Layout tolerante: paquete (compose\, images\, .env.example) o repo (deploy\standalone).
$ComposeDir = Join-Path $HERE 'compose'
if (-not (Test-Path -LiteralPath $ComposeDir)) { $ComposeDir = $HERE }
$EnvTemplate = Join-Path $HERE '.env.example'
if (-not (Test-Path -LiteralPath $EnvTemplate)) { $EnvTemplate = Join-Path $HERE '.env.standalone.example' }
$ImagesDir = Join-Path $HERE 'images'
$EnvFile = Join-Path $HERE '.env'

# --- Salida con color (ASCII: consola Windows en terreno, sin mojibake) -------
function Say  ($m) { Write-Host ('  - ' + $m) }
function Ok   ($m) { Write-Host ('[OK]   ' + $m) -ForegroundColor Green }
function Warn ($m) { Write-Host ('[WARN] ' + $m) -ForegroundColor Yellow }
function Step ($m) { Write-Host ''; Write-Host ('>> ' + $m) -ForegroundColor Cyan }
function Die  ($m) { Write-Host ('[X] ' + $m) -ForegroundColor Red; exit 1 }
# Reporte del doctor (no fatal): PASA / FALLA (marca $script:DoctorFail) / AVISO.
$script:DoctorFail = 0
function Pass ($m) { Write-Host ('  [PASA]  ' + $m) -ForegroundColor Green }
function Fail ($m) { Write-Host ('  [FALLA] ' + $m) -ForegroundColor Red; $script:DoctorFail = 1 }
function Note ($m) { Write-Host ('  [AVISO] ' + $m) -ForegroundColor Yellow }

# --- Escritura de archivos: UTF-8 SIN BOM y saltos LF ------------------------
# .env / Caddyfile con CRLF rompen (--env-file deja \r en los valores; bug
# clasico). Se fuerza LF y sin BOM, igual que los archivos que genera install.sh.
function Write-TextFile ($path, $text) {
  $lf = ($text -replace "`r`n", "`n")
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $lf, $enc)
}

# --- Helpers puros (parsing de host, arquitectura, certificados, puertos) -----
# Lee un valor de .env descartando el comentario inline de la plantilla.
function Get-EnvVal ($key) {
  if (-not (Test-Path -LiteralPath $EnvFile)) { return '' }
  foreach ($l in (Get-Content -LiteralPath $EnvFile)) {
    if ($l -match ('^\s*' + [regex]::Escape($key) + '=')) {
      $v = $l.Substring($l.IndexOf('=') + 1)
      $v = ($v -replace '\s#.*$', '').Trim()
      return $v
    }
  }
  return ''
}

# Fija (o agrega) una variable en el .env, descomentandola si estaba comentada.
function Set-EnvVal ($key, $val) {
  $lines = @(Get-Content -LiteralPath $EnvFile)
  $found = $false
  $out = foreach ($l in $lines) {
    if ($l -match ('^\s*#?\s*' + [regex]::Escape($key) + '=')) { $found = $true; "$key=$val" }
    else { $l }
  }
  if (-not $found) { $out = @($out) + "$key=$val" }
  Write-TextFile $EnvFile (($out -join "`n") + "`n")
}

# Host desnudo de una URL (sin esquema, sin puerto, sin path).
function Get-UrlHost ($url) {
  $h = $url -replace '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''
  $h = ($h -split '/', 2)[0]
  $h = ($h -split ':', 2)[0]
  return $h
}

# Es una IPv4? (mismos limites que install.sh; IPv6 literal fuera de alcance)
function Test-IPv4 ($s) {
  if ($s -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { return $false }
  foreach ($o in ($s -split '\.')) { if ([int]$o -gt 255) { return $false } }
  return $true
}

# Arquitectura y SO del daemon Docker (esperado: linux/amd64).
function Get-DockerArch { $a = (& docker version -f '{{.Server.Arch}}' 2>$null); if ([string]::IsNullOrWhiteSpace($a)) { '?' } else { $a.Trim() } }
function Get-DockerOs { $o = (& docker version -f '{{.Server.Os}}' 2>$null); if ([string]::IsNullOrWhiteSpace($o)) { '?' } else { $o.Trim() } }

$CertPem = Join-Path $HERE 'certs\cert.pem'
$KeyPem = Join-Path $HERE 'certs\key.pem'

# cert.pem y key.pem corresponden? (compara clave publica; robusto RSA/EC).
function Test-CertKeyMatch {
  $a = (& openssl x509 -in $CertPem -noout -pubkey 2>$null | & openssl md5 2>$null)
  $b = (& openssl pkey  -in $KeyPem  -pubout      2>$null | & openssl md5 2>$null)
  return ($a -and ($a -eq $b))
}
# El SAN del certificado menciona el host? (best-effort; wildcard/CA => aviso).
function Test-CertCoversHost ($h) {
  $san = (& openssl x509 -in $CertPem -noout -ext subjectAltName 2>$null | Out-String)
  if ([string]::IsNullOrWhiteSpace($san)) { $san = (& openssl x509 -in $CertPem -noout -text 2>$null | Out-String) }
  return ($san -match [regex]::Escape($h))
}
# Certificado self-signed para el host (SAN por IP o DNS).
function New-SelfSignedCert ($h, $isIp) {
  $san = if ($isIp) { "IP:$h" } else { "DNS:$h" }
  New-Item -ItemType Directory -Force -Path (Join-Path $HERE 'certs') | Out-Null
  & openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout $KeyPem -out $CertPem -subj "/CN=$h" -addext "subjectAltName=$san" 2>$null
  if ($LASTEXITCODE -ne 0) { Die "No pude generar el certificado self-signed (openssl en el PATH?). Coloca certs\cert.pem y certs\key.pem a mano y reejecuta." }
}

# GENERA edge\Caddyfile.edge desde el host (el operador NUNCA lo edita a mano).
# default_sni SOLO cuando el host es IP (por IP el cliente no manda SNI).
function Write-Caddyfile ($h, $isIp) {
  $sni = ''
  if ($isIp) { $sni = "`n`tdefault_sni $h" }
  New-Item -ItemType Directory -Force -Path (Join-Path $HERE 'edge') | Out-Null
  $body = @"
# Borde de Lyra WatchLog (modo b) - GENERADO por install.ps1 desde APP_PUBLIC_URL.
# NO editar a mano: se regenera en cada .\install.ps1. Para cambiar el dominio,
#   edita APP_PUBLIC_URL en .env y reejecuta. Sin ACME (air-gap): el TLS lo pone
#   certs/cert.pem + certs/key.pem (self-signed autogenerado o el de tu CA).
{
	auto_https off
	admin off$sni
}

# Redirect 80 -> 443.
http://$h {
	redir https://{host}{uri} permanent
}

https://$h {
	tls /certs/cert.pem /certs/key.pem
	encode gzip zstd
	# X-Forwarded-For lo agrega Caddy (rate limit por IP real + auditoria).
	reverse_proxy watchlog-web:80
}
"@
  Write-TextFile (Join-Path $HERE 'edge\Caddyfile.edge') $body
}

# Argumentos base de `docker compose` segun EDGE_MODE (fija $script:Compose + $script:EdgeMode).
function Build-Dc {
  $script:EdgeMode = Get-EnvVal 'EDGE_MODE'
  $script:Compose = @('--project-directory', $HERE, '--env-file', $EnvFile, '-f', (Join-Path $ComposeDir 'docker-compose.yml'))
  switch ($script:EdgeMode) {
    'a' { $script:Compose += @('-f', (Join-Path $ComposeDir 'mode-a.behind-proxy.yml')); return $true }
    'b' { $script:Compose += @('-f', (Join-Path $ComposeDir 'mode-b.own-edge.yml')); return $true }
    default { return $false }
  }
}
function Test-StackRunning {
  $ids = (& docker compose @script:Compose ps -q 2>$null)
  return -not [string]::IsNullOrWhiteSpace(($ids -join '').Trim())
}
# Algo escucha en el puerto? devuelve 'busy' / 'free' / 'unknown'.
function Get-PortState ($p) {
  try {
    $c = Get-NetTCPConnection -State Listen -LocalPort ([int]$p) -ErrorAction Stop
    if ($c) { return 'busy' } else { return 'free' }
  }
  catch [Microsoft.PowerShell.Cmdletization.Cim.CimJobException] { return 'free' }
  catch { if ($_.Exception.Message -match 'No matching') { return 'free' }; return 'unknown' }
}
function Get-ModePorts {
  if ($script:EdgeMode -eq 'b') { return @('80', '443') }
  $lp = Get-EnvVal 'EDGE_LOCAL_PORT'; if ([string]::IsNullOrWhiteSpace($lp)) { $lp = '8080' }
  return @($lp)
}

# Re-deriva la huella del host Windows (MachineGuid) a license\machine-id.
# Estable ante reinicios / updates de Docker Desktop / reset de WSL; el node-lock
# se preserva porque una copia reejecutada en otra maquina re-deriva su GUID.
function Write-MachineId {
  New-Item -ItemType Directory -Force -Path (Join-Path $HERE 'license') | Out-Null
  $guid = $null
  try { $guid = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid } catch {}
  if ([string]::IsNullOrWhiteSpace($guid)) {
    Warn "No pude leer MachineGuid del registro: la huella sera DEBIL (solo CPU+plataforma). Node-lock degradado."
    return
  }
  Write-TextFile (Join-Path $HERE 'license\machine-id') ($guid.Trim())
  Say "huella anclada al MachineGuid del host Windows -> license\machine-id"
}

# =============================================================================
# DOCTOR (-Check): diagnostico PASA/FALLA sin mutar nada.
# =============================================================================
function Invoke-Doctor {
  Step "Lyra WatchLog . doctor - diagnostico (no modifica nada)"

  # 1) Arquitectura + modo de contenedores del daemon
  $da = Get-DockerArch; $do = Get-DockerOs
  if ($do -eq 'windows') { Fail "Docker Desktop en modo CONTENEDORES WINDOWS - cambialo a 'Linux containers' (bandeja > Switch to Linux containers)" }
  elseif ($do -eq '?') { Fail "No pude leer el SO del daemon Docker (Docker Desktop corriendo?)" }
  else {
    switch ($da) {
      'amd64' { Pass "Docker: linux/amd64 (coincide con el paquete)" }
      '?' { Fail "No pude leer la arquitectura del daemon Docker" }
      default { Fail "Arquitectura Docker: '$da' - el paquete es amd64 (matriz: Windows/WSL2 amd64)" }
    }
  }

  # 2) Docker + compose + utilidades
  if (Get-Command docker -ErrorAction SilentlyContinue) { Pass ("docker presente (" + (& docker version -f '{{.Server.Version}}' 2>$null) + ")") } else { Fail "docker no esta instalado" }
  & docker compose version *> $null; if ($LASTEXITCODE -eq 0) { Pass "docker compose v2 presente" } else { Fail "falta el plugin 'docker compose' (v2)" }
  if (Get-Command openssl -ErrorAction SilentlyContinue) { Pass "openssl presente" } else { Fail "falta openssl en el PATH (Git for Windows / portable)" }

  # 3) .env completo
  if (Test-Path -LiteralPath $EnvFile) {
    $body = (Get-Content -LiteralPath $EnvFile | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
    if ($body -match '__GEN_|__SET_ME_|__WL_VERSION__') { Fail ".env tiene marcadores sin completar (__GEN_/__SET_ME_/__WL_VERSION__) - corre .\install.ps1" }
    else { Pass ".env presente y completo" }
  }
  else {
    Fail ".env no existe todavia - corre .\install.ps1 (1a pasada)"
    Warn "Sin .env no puedo diagnosticar borde/puertos/certificado."
    if ($script:DoctorFail -eq 0) { Ok "doctor: sin fallas" } else { Warn "doctor: hay FALLAS (ver arriba)" }
    exit $script:DoctorFail
  }

  # 3-bis) Huella Windows (machine-id)
  if (Test-Path -LiteralPath (Join-Path $HERE 'license\machine-id')) { Pass "huella: license\machine-id presente (MachineGuid)" }
  else { Note "license\machine-id ausente - se regenera al reejecutar .\install.ps1" }
  $mif = Get-EnvVal 'LICENSE_MACHINE_ID_FILE'
  if ($mif -eq '/app/license/machine-id') { Pass "LICENSE_MACHINE_ID_FILE apunta a la huella Windows" }
  else { Note "LICENSE_MACHINE_ID_FILE='$mif' (esperado /app/license/machine-id en Windows)" }

  # 4) Modo de borde + APP_PUBLIC_URL
  if (Build-Dc) { Pass "EDGE_MODE=$($script:EdgeMode)" } else { Fail "EDGE_MODE invalido/ausente (usa a o b en .env)" }
  $url = Get-EnvVal 'APP_PUBLIC_URL'; $apphost = Get-UrlHost $url; $isIp = $false
  if ($apphost) { $isIp = Test-IPv4 $apphost; Pass ("APP_PUBLIC_URL=$url  (host: $apphost" + $(if ($isIp) { ', IP' } else { ', hostname' }) + ")") }
  else { Fail "APP_PUBLIC_URL vacio o sin host" }

  # 5) Puertos del modo
  $up = Test-StackRunning
  foreach ($p in (Get-ModePorts)) {
    switch (Get-PortState $p) {
      'busy' { if ($up) { Pass "puerto $p ocupado por el propio stack (idempotente)" } else { Fail "puerto $p ocupado por OTRO proceso (Get-NetTCPConnection -LocalPort $p)" } }
      'unknown' { Note "no pude verificar el puerto $p" }
      default { Pass "puerto $p libre" }
    }
  }

  # 6) Certificado (modo b)
  if ($script:EdgeMode -eq 'b') {
    if ((Test-Path -LiteralPath $CertPem) -and (Test-Path -LiteralPath $KeyPem)) {
      if (Test-CertKeyMatch) { Pass "cert.pem <-> key.pem coinciden" } else { Fail "cert.pem y key.pem NO corresponden" }
      if ($apphost) { if (Test-CertCoversHost $apphost) { Pass "el SAN del cert cubre '$apphost'" } else { Note "el SAN del cert no menciona '$apphost' (wildcard/CA corporativa?)" } }
      & openssl x509 -in $CertPem -noout -checkend 0 *> $null; if ($LASTEXITCODE -eq 0) { Pass "certificado vigente" } else { Fail "certificado VENCIDO" }
      & openssl x509 -in $CertPem -noout -checkend 2592000 *> $null; if ($LASTEXITCODE -ne 0) { Note "el certificado vence en <30 dias" }
    }
    else { Fail "faltan certs\cert.pem y/o certs\key.pem (modo b) - reejecuta .\install.ps1 para autogenerarlos" }
    $cf = Join-Path $HERE 'edge\Caddyfile.edge'
    if (Test-Path -LiteralPath $cf) {
      if ((Get-Content -LiteralPath $cf) -match '^\s*default_sni') {
        if ($isIp) { Pass "edge: default_sni presente (acceso por IP)" } else { Note "edge: default_sni presente pese a ser hostname" }
      }
      else {
        if ($isIp) { Fail "edge: FALTA default_sni y el host es IP => TLS fallara sin SNI (reejecuta .\install.ps1)" } else { Pass "edge: sin default_sni (correcto para hostname)" }
      }
    }
    else { Fail "edge\Caddyfile.edge no existe (modo b) - reejecuta .\install.ps1" }
  }

  # 7) Estado de contenedores
  $svcs = @('postgres', 'redis', 'minio', 'api', 'watchlog-web')
  if ($script:EdgeMode -eq 'b') { $svcs += 'caddy-edge' }
  foreach ($svc in $svcs) {
    $cid = (& docker compose @script:Compose ps -q $svc 2>$null)
    if ([string]::IsNullOrWhiteSpace($cid)) { Note "contenedor '$svc' no esta creado (stack abajo?)"; continue }
    $cid = ($cid -split "`n")[0].Trim()
    if ($svc -eq 'api') {
      $st = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' $cid 2>$null)
      if ($st -eq 'healthy') { Pass "api: healthy" } else { Fail "api: $st (docker compose logs api)" }
    }
    else {
      $r = (& docker inspect -f '{{.State.Running}}' $cid 2>$null)
      if ($r -eq 'true') { Pass "${svc}: en ejecucion" } else { Fail "${svc}: NO esta corriendo" }
    }
  }

  # 8) Alcance HTTP/S (best-effort; solo si el stack esta arriba)
  if ($up) {
    if ($script:EdgeMode -eq 'a') {
      $lp = Get-EnvVal 'EDGE_LOCAL_PORT'; if (-not $lp) { $lp = '8080' }
      if (Test-HttpOk "http://127.0.0.1:$lp/api/health") { Pass "health por loopback :$lp responde 200" } else { Fail "health por loopback :$lp NO responde" }
    }
    elseif ($apphost) {
      if ($isIp) {
        if (Test-HttpOk "https://$apphost/api/health") { Pass "HTTPS por IP (sin SNI) responde 200" } else { Fail "HTTPS por IP NO responde (firewall/443?)" }
      }
      else {
        if (Test-HttpOk "https://$apphost/api/health") { Pass "HTTPS por hostname (con SNI) responde 200" } else { Note "HTTPS por hostname no respondio (normal si el borde escucha en otra IP / DNS no resuelve aqui)" }
      }
    }
  }

  Write-Host ''
  if ($script:DoctorFail -eq 0) { Ok "doctor: TODO EN VERDE" } else { Warn "doctor: hay FALLAS (revisa las lineas [FALLA] de arriba)" }
  exit $script:DoctorFail
}

# GET best-effort ignorando TLS self-signed (equivalente a curl -sk).
# PS 5.1 / .NET Framework: HttpWebRequest + ServicePointManager (sin APIs .NET Core).
function Test-HttpOk ($url) {
  $prev = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
  try {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Timeout = 12000
    $req.Method = 'GET'
    $resp = $req.GetResponse()
    $code = [int]([System.Net.HttpWebResponse]$resp).StatusCode
    $resp.Close()
    return ($code -eq 200)
  }
  catch { return $false }
  finally { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $prev }
}

if ($Check) { Invoke-Doctor }

# -----------------------------------------------------------------------------
# 1) Preflight del host
# -----------------------------------------------------------------------------
Step "Preflight del host (Windows / Docker Desktop)"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker no esta instalado (Docker Desktop)." }
& docker compose version *> $null; if ($LASTEXITCODE -ne 0) { Die "Falta el plugin 'docker compose' (v2)." }
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { Die "Falta openssl en el PATH (Git for Windows o build portable). Es la misma dependencia que exige install.sh en Linux." }
$dOs = Get-DockerOs; $dArch = Get-DockerArch
if ($dOs -eq 'windows') { Die "Docker Desktop esta en modo CONTENEDORES WINDOWS. Cambialo a 'Linux containers' (icono de la bandeja > Switch to Linux containers) y reejecuta. El paquete son imagenes Linux amd64." }
switch ($dArch) {
  'amd64' { }
  '?' { Warn "No pude leer la arquitectura del daemon Docker; continuo (se asume amd64)." }
  default { Die "Arquitectura del host Docker = '$dArch'. El paquete es amd64 (matriz: Windows/WSL2 amd64; ver SUPPORTED_PLATFORMS.md). Aborto." }
}
Say ("docker " + (& docker version -f '{{.Server.Version}}' 2>$null) + "  .  " + (& docker compose version --short 2>$null) + "  .  " + $dOs + "/" + $dArch)

# -----------------------------------------------------------------------------
# 2) Verificar AUTENTICIDAD (firma cosign) + INTEGRIDAD (SHA256SUMS)
# -----------------------------------------------------------------------------
Step "Verificacion de autenticidad (firma cosign)"
$cosignPub = Join-Path $HERE 'cosign.pub'
$cosignBundle = Join-Path $HERE 'SHA256SUMS.cosign.bundle'
$sha = Join-Path $HERE 'SHA256SUMS'
if ((Test-Path -LiteralPath $cosignPub) -and (Test-Path -LiteralPath $cosignBundle)) {
  if (Get-Command cosign -ErrorAction SilentlyContinue) {
    & cosign verify-blob --key $cosignPub --bundle $cosignBundle --insecure-ignore-tlog=true $sha *> $null
    if ($LASTEXITCODE -eq 0) { Ok "Firma ITESICWS VERIFICADA (el paquete es autentico y no fue alterado)." }
    else { Die "FIRMA INVALIDA sobre SHA256SUMS - el paquete NO es autentico o fue manipulado. Aborto." }
  }
  else {
    Warn "Paquete FIRMADO pero 'cosign' no esta en este host => firma NO verificada aqui (best-effort)."
    Write-Host "     Verificala en tu estacion antes de instalar (INSTALL_OFFLINE.md):"
    Write-Host "       cosign verify-blob --key cosign.pub --bundle SHA256SUMS.cosign.bundle --insecure-ignore-tlog=true SHA256SUMS"
  }
}
else { Warn "Paquete SIN firma cosign (version previa a E3?) - solo se comprobara integridad SHA256." }

Step "Verificacion de integridad (SHA256SUMS)"
if (Test-Path -LiteralPath $sha) {
  $bad = 0; $checked = 0
  foreach ($line in (Get-Content -LiteralPath $sha)) {
    if ($line -notmatch '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') { continue }
    $want = $Matches[1].ToLower()
    $rel = ($Matches[2] -replace '^\./', '') -replace '/', '\'
    $path = Join-Path $HERE $rel
    if (-not (Test-Path -LiteralPath $path)) { $bad++; Write-Host "     falta: $rel"; continue }
    $got = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
    $checked++
    if ($got -ne $want) { $bad++; Write-Host "     MISMATCH: $rel" }
  }
  if ($bad -gt 0) { Die "SHA256SUMS NO coincide ($bad archivo(s)) - paquete corrupto o alterado. Aborto." }
  Ok "Paquete integro ($checked archivos)."
}
else { Warn "Sin SHA256SUMS (ejecucion fuera del paquete?) - se omite la verificacion." }

# -----------------------------------------------------------------------------
# 3) Version del paquete
# -----------------------------------------------------------------------------
$TAG = ''
$vfile = Join-Path $HERE 'VERSION'
if (Test-Path -LiteralPath $vfile) {
  $m = (Get-Content -LiteralPath $vfile | Where-Object { $_ -match '^version:\s*(.+)$' } | Select-Object -First 1)
  if ($m -and ($m -match '^version:\s*(.+)$')) { $TAG = $Matches[1].Trim() }
}
if (-not $TAG -and (Test-Path -LiteralPath $ImagesDir)) {
  $t = Get-ChildItem -LiteralPath $ImagesDir -Filter 'lyra-watchlog-api-*.tar' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($t) { $TAG = $t.BaseName -replace '^lyra-watchlog-api-', '' }
}
if (-not $TAG) { Die "No pude determinar la version del paquete (VERSION / images\)." }
Say "version: $TAG"

# -----------------------------------------------------------------------------
# 4) Cargar imagenes (docker load; idempotente)
# -----------------------------------------------------------------------------
Step "Carga de imagenes (offline)"
if (Test-Path -LiteralPath $ImagesDir) {
  $tars = @(Get-ChildItem -LiteralPath $ImagesDir -Filter '*.tar' -ErrorAction SilentlyContinue)
  if ($tars.Count -eq 0) { Die "No hay imagenes en $ImagesDir." }
  foreach ($t in $tars) {
    Say "load $($t.Name)"
    & docker load -i $t.FullName *> $null
    if ($LASTEXITCODE -ne 0) { Die "docker load fallo en $($t.Name)." }
  }
  Ok "Imagenes cargadas."
}
else { Warn "Sin carpeta images\ - asumo imagenes ya presentes en el daemon." }

# -----------------------------------------------------------------------------
# 5) .env: generar con secretos (una sola vez) o validar el existente
# -----------------------------------------------------------------------------
Step "Configuracion (.env)"
if (-not (Test-Path -LiteralPath $EnvFile)) {
  if (-not (Test-Path -LiteralPath $EnvTemplate)) { Die "Falta la plantilla de entorno ($EnvTemplate)." }
  Say "generando secretos con openssl..."
  $content = ([System.IO.File]::ReadAllText($EnvTemplate)) -replace "`r`n", "`n"
  $repl = @{
    '__GEN_DB_PASSWORD__'          = (& openssl rand -hex 24).Trim()
    '__GEN_MINIO_PASSWORD__'       = (& openssl rand -hex 24).Trim()
    '__GEN_JWT_ACCESS__'           = (& openssl rand -base64 48).Trim()
    '__GEN_JWT_REFRESH__'          = (& openssl rand -base64 48).Trim()
    '__GEN_APP_ENC_KEY__'          = (& openssl rand -base64 32).Trim()
    '__GEN_DATA_SOURCE_ENC_KEY__'  = (& openssl rand -base64 32).Trim()
    '__WL_VERSION__'               = $TAG
  }
  foreach ($k in $repl.Keys) { $content = $content.Replace($k, $repl[$k]) }
  Write-TextFile $EnvFile $content
  # Huella L1 en Windows: apunta el colector al machine-id anclado al MachineGuid.
  Set-EnvVal 'LICENSE_MACHINE_ID_FILE' '/app/license/machine-id'
  Write-MachineId
  # ACL best-effort: solo el usuario actual lee el .env (secretos en reposo).
  try {
    & icacls $EnvFile /inheritance:r *> $null
    & icacls $EnvFile /grant:r ("$env:USERNAME" + ':F') *> $null
  }
  catch {}
  Ok ".env creado con secretos + huella Windows."
  Warn "COMPLETA lo especifico del sitio en $EnvFile y vuelve a ejecutar .\install.ps1:"
  Write-Host "     . APP_PUBLIC_URL  = https://<tu-dominio-interno>   (o https://<IP-del-servidor>)"
  Write-Host "     . EDGE_MODE       = a (detras de tu proxy)  |  b (borde propio con cert)"
  Write-Host "     (modo b: NO toques el certificado ni el Caddyfile - install.ps1 los genera)"
  exit 2
}
# .env ya existe: JAMAS regenerar secretos. Validar que este completo.
$bodyLines = (Get-Content -LiteralPath $EnvFile | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
if ($bodyLines -match '__GEN_|__SET_ME_|__WL_VERSION__') { Die "El .env tiene marcadores sin completar (__GEN_/__SET_ME_/__WL_VERSION__). Editalo y reejecuta." }
# Idempotente: asegura la huella Windows aunque el .env venga de una version previa.
if ((Get-EnvVal 'LICENSE_MACHINE_ID_FILE') -ne '/app/license/machine-id') { Set-EnvVal 'LICENSE_MACHINE_ID_FILE' '/app/license/machine-id' }
Ok ".env presente y completo (secretos intactos)."

# -----------------------------------------------------------------------------
# 6) Modo de borde -> compose + AUTOREPARACION del borde
# -----------------------------------------------------------------------------
Step "Modo de borde"
if (-not (Build-Dc)) { Die "EDGE_MODE invalido ('$(Get-EnvVal 'EDGE_MODE')'). Usa a o b en $EnvFile." }
switch ($script:EdgeMode) {
  'a' { Say "modo (a): detras del proxy del cliente (loopback)" }
  'c' { Die "EDGE_MODE=c (borde compartido del demo) no aplica en planta. Usa a o b." }
  'b' {
    $appUrl = Get-EnvVal 'APP_PUBLIC_URL'
    $apphost = Get-UrlHost $appUrl
    if (-not $apphost) { Die "APP_PUBLIC_URL vacio o sin host: no puedo configurar el borde. Fija APP_PUBLIC_URL en $EnvFile." }
    $isIp = Test-IPv4 $apphost
    Write-Caddyfile $apphost $isIp
    Say ("borde generado: edge\Caddyfile.edge (host=$apphost" + $(if ($isIp) { ', default_sni por IP' } else { ', SNI por hostname' }) + ")")
    if ((Test-Path -LiteralPath $CertPem) -and (Test-Path -LiteralPath $KeyPem)) {
      Say "certificado: usando el provisto en certs\cert.pem (CA corporativa)"
    }
    else {
      New-SelfSignedCert $apphost $isIp
      Warn "Certificado SELF-SIGNED generado para $apphost (el navegador avisara 'conexion no privada' - normal en prueba)."
      Write-Host "     Para produccion, reemplaza certs\cert.pem y certs\key.pem por el de tu CA corporativa y reejecuta."
    }
    if (-not (Test-CertKeyMatch)) { Die "certs\cert.pem y certs\key.pem NO corresponden (clave publica distinta). Corrigelos y reejecuta." }
    if (-not (Test-CertCoversHost $apphost)) { Warn "El SAN del certificado no menciona '$apphost' (wildcard/CA corporativa? verificalo)." }
    & openssl x509 -in $CertPem -noout -checkend 0 *> $null
    if ($LASTEXITCODE -ne 0) { Warn "El certificado esta VENCIDO - el borde igual arrancara, pero el navegador lo rechazara." }
    Say "modo (b): borde propio con TLS en 443/tcp (host=$apphost)"
  }
}

# -----------------------------------------------------------------------------
# 6-bis) Preflight de puertos del modo
# -----------------------------------------------------------------------------
Step "Preflight de puertos"
if (Test-StackRunning) {
  Say "stack ya en ejecucion: omito el chequeo de puertos (idempotente)."
}
else {
  foreach ($p in (Get-ModePorts)) {
    switch (Get-PortState $p) {
      'busy' { Die "Puerto $p ocupado por OTRO proceso (otro servidor web?). Libera y reejecuta. Diagnostico: Get-NetTCPConnection -LocalPort $p -State Listen" }
      'unknown' { Warn "No pude verificar el puerto $p - continuo." }
      default { Say "puerto $p libre." }
    }
  }
}

# -----------------------------------------------------------------------------
# 7) Directorios de estado (licencia / certs) + PROBE de permisos uid 1000
# -----------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path (Join-Path $HERE 'license'), (Join-Path $HERE 'certs') | Out-Null
Write-MachineId
# El api corre NON-ROOT (uid 1000) y ESCRIBE ./license (solicitud.lreq / setup-token
# / license.lic). En Linux install.sh hace chown 1000:1000; en Windows el chown no
# aplica y Docker Desktop mapea el bind de forma permisiva - pero para NO repetir el
# bug EACCES del piloto lo VALIDAMOS con un probe real antes de arrancar (CIS 5.12).
Step "Probe de permisos (uid 1000 escribe ./license)"
& docker run --rm -u 1000:1000 --entrypoint sh --mount "type=bind,source=$HERE\license,target=/probe" "redis:7-alpine" -c "touch /probe/.wtest 2>/dev/null && rm -f /probe/.wtest" *> $null
if ($LASTEXITCODE -eq 0) { Ok "uid 1000 puede escribir ./license (el API no crasheara por EACCES)." }
else {
  Warn "uid 1000 NO pudo escribir ./license via el bind de Docker Desktop."
  Write-Host "     El API (non-root) FALLARA al escribir su licencia. Revisa File Sharing en Docker"
  Write-Host "     Desktop (Settings > Resources > File Sharing) e incluye la unidad del paquete,"
  Write-Host "     o mueve el paquete al FS de WSL2 (ext4). Luego reejecuta .\install.ps1."
  Die "Permisos del bind ./license insuficientes (ver arriba)."
}

# -----------------------------------------------------------------------------
# 8) Levantar el stack
# -----------------------------------------------------------------------------
Step "Arranque del stack"
& docker compose @script:Compose up -d
if ($LASTEXITCODE -ne 0) { Die "docker compose up fallo. Diagnostica con: .\install.ps1 -Check  .  docker compose logs" }

# -----------------------------------------------------------------------------
# 9) Esperar healthcheck del API
# -----------------------------------------------------------------------------
Step "Esperando healthcheck del API..."
$status = 'unknown'
for ($i = 0; $i -lt 60; $i++) {
  $cid = (& docker compose @script:Compose ps -q api 2>$null)
  if (-not [string]::IsNullOrWhiteSpace($cid)) {
    $cid = ($cid -split "`n")[0].Trim()
    $status = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $cid 2>$null)
    if ($status -eq 'healthy') { break }
  }
  Start-Sleep -Seconds 2
}
if ($status -ne 'healthy') { Die "El API no quedo sano (estado: $status). Diagnostica con: .\install.ps1 -Check  .  docker compose logs api" }
Ok "API saludable."

# -----------------------------------------------------------------------------
# 10) Proximos pasos
# -----------------------------------------------------------------------------
Step "Instalacion OK - proximos pasos"
$appUrl = Get-EnvVal 'APP_PUBLIC_URL'; if (-not $appUrl) { $appUrl = 'https://<tu-dominio>' }
Write-Host ""
Write-Host "  1) LICENCIA (ceremonia air-gapped, ver INSTALL_OFFLINE.md):"
Write-Host "     . El arranque dejo la solicitud en   license\solicitud.lreq"
Write-Host "     . Enviala a tu proveedor; te devuelven  license.lic  -> copialo a license\"
Write-Host "       (o importalo desde el asistente /setup)."
Write-Host ""
Write-Host "  2) PRIMER ARRANQUE (crea el administrador):"
Write-Host "     . Abre  $appUrl/setup"
Write-Host "     . Token de un solo uso en                license\setup-token"
Write-Host ""
Write-Host "  3) Verificacion:  $appUrl   ->  login del administrador creado."
Write-Host "     . Diagnostico rapido en cualquier momento:  .\install.ps1 -Check   (o .\doctor.ps1)"
Write-Host ""
Write-Host "  Actualizar a un paquete nuevo: desempaca el nuevo bundle y reejecuta .\install.ps1"
Write-Host "  (respalda la BD antes de migrar; ver INSTALL_OFFLINE.md)."
