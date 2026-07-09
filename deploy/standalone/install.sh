#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — instalador OFFLINE, IDEMPOTENTE y AUTOREPARABLE para el host de
# la planta (E2).
#
#   ./install.sh            # instala / reejecuta (idempotente)
#   ./install.sh --check    # DOCTOR: diagnóstico PASA/FALLA (no toca nada)
#
# Diseñado para correr DENTRO del paquete offline (make-bundle) en una planta
# AIR-GAPPED. Es re-ejecutable: verifica el paquete (SHA256), carga las imágenes
# (`docker load`, cero `pull`), crea un `.env` con SECRETOS generados por openssl
# (nunca los rota en re-ejecuciones), levanta el stack por el MODO de borde
# elegido y espera el healthcheck. NO crea usuarios ni imprime secretos: el primer
# administrador lo crea el asistente web /setup con su token (OOBE).
#
# AUTOREPARABLE (2026-07-08): en modo (b) el instalador GENERA `edge/Caddyfile.edge`
# desde `APP_PUBLIC_URL` (el operador NUNCA lo edita a mano) — poniendo `default_sni`
# SOLO cuando el host es una IP — y AUTOGENERA un certificado self-signed (SAN por
# IP o DNS) si no hay uno corporativo. Preflight DURO: arquitectura del host,
# puertos del modo libres, `.env` completo, y (modo b) cert↔llave coinciden.
#
# Reusa el compose standalone de H1 (no duplica stack). Guía al operador por la
# ceremonia de licencia (solicitud.lreq) y el primer arranque (/setup).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# Layout tolerante: paquete (compose/, images/, .env.example) o repo (deploy/standalone).
COMPOSE_DIR="$HERE/compose"; [ -d "$COMPOSE_DIR" ] || COMPOSE_DIR="$HERE"
ENV_TEMPLATE="$HERE/.env.example"; [ -f "$ENV_TEMPLATE" ] || ENV_TEMPLATE="$HERE/.env.standalone.example"
IMAGES_DIR="$HERE/images"
ENV="$HERE/.env"

# Modo diagnóstico (doctor): no muta nada, reporta PASA/FALLA y sale con 0/1.
CHECK=false
[ "${1:-}" = "--check" ] || [ "${1:-}" = "doctor" ] && CHECK=true

say()  { printf '  · %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
# Reporte del doctor (no fatal): PASA verde / FALLA roja (marca DOCTOR_FAIL) / AVISO.
DOCTOR_FAIL=0
pass() { printf '  \033[32m✓ PASA \033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ FALLA\033[0m %s\n' "$*"; DOCTOR_FAIL=1; }
note() { printf '  \033[33m• AVISO\033[0m %s\n' "$*"; }

# ── Helpers puros (parsing de host, arquitectura, certificados, puertos) ──────
# Lee un valor de .env DESCARTANDO el comentario inline que la plantilla documenta
# en la misma línea (bug del piloto 2026-07-08): el pipe garantiza exit 0 aun sin match.
envval() { grep -E "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/[[:space:]]#.*//' | tr -d '[:space:]'; }

# Host desnudo de una URL (sin esquema, sin puerto, sin path). IPv4/hostname (la
# matriz soportada; IPv6 literal queda fuera de alcance, ver SUPPORTED_PLATFORMS.md).
url_host() { local h="${1#*://}"; h="${h%%/*}"; h="${h%%:*}"; printf '%s' "$h"; }

# ¿Es una IPv4? (POSIX, sin bashisms de regex para portabilidad del parseo.)
is_ipv4() {
  case "$1" in *[!0-9.]*) return 1;; esac
  local o; local IFS=.; set -- $1; [ "$#" -eq 4 ] || return 1
  for o in "$@"; do case "$o" in ''|*[!0-9]*) return 1;; esac; [ "$o" -le 255 ] 2>/dev/null || return 1; done
  return 0
}

# Arquitectura del daemon Docker (amd64 esperado; el bundle es amd64).
docker_arch() { docker version -f '{{.Server.Arch}}' 2>/dev/null || echo '?'; }

# ¿la clave privada es legible por el usuario actual? Tras el chown a uid 1000
# (paso 7) queda en 600/uid1000: un instalador/doctor no-root no la lee (esperado).
key_readable() { [ -r "$HERE/certs/key.pem" ]; }
# ¿cert.pem y key.pem corresponden? Compara la clave pública (robusto RSA/EC).
cert_key_match() {
  local a b
  a="$(openssl x509 -in "$HERE/certs/cert.pem" -noout -pubkey 2>/dev/null | openssl md5 2>/dev/null)"
  b="$(openssl pkey -in "$HERE/certs/key.pem"  -pubout       2>/dev/null | openssl md5 2>/dev/null)"
  [ -n "$a" ] && [ "$a" = "$b" ]
}
# ¿El SAN del certificado menciona el host/IP? (best-effort — un wildcard/CA
# corporativa legítimo puede no contenerlo literalmente ⇒ aviso, no error.)
cert_covers_host() {
  local san
  san="$(openssl x509 -in "$HERE/certs/cert.pem" -noout -ext subjectAltName 2>/dev/null || true)"
  [ -n "$san" ] || san="$(openssl x509 -in "$HERE/certs/cert.pem" -noout -text 2>/dev/null | grep -A1 'Subject Alternative Name' || true)"
  printf '%s' "$san" | grep -qF "$1"
}
# Genera un certificado self-signed para el host (SAN por IP o DNS según corresponda).
gen_self_signed() {  # $1=host  $2=is_ip(true/false)
  local host="$1" ip="$2" san
  if [ "$ip" = true ]; then san="IP:$host"; else san="DNS:$host"; fi
  mkdir -p "$HERE/certs"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout "$HERE/certs/key.pem" -out "$HERE/certs/cert.pem" \
    -subj "/CN=$host" -addext "subjectAltName=$san" >/dev/null 2>&1 \
    || die "No pude generar el certificado self-signed (¿openssl <1.1.1?). Coloca certs/cert.pem y certs/key.pem a mano y reejecuta."
  chmod 600 "$HERE/certs/key.pem"
}

# GENERA edge/Caddyfile.edge desde el host (el operador jamás lo edita a mano).
# default_sni SOLO cuando el host es IP: por IP el cliente no manda SNI y sin
# default_sni Caddy no matchea el sitio (bug del piloto 2026-07-08); por hostname
# el SNI viaja y el matching estricto es lo deseable.
render_caddyfile() {  # $1=host  $2=is_ip(true/false)
  local host="$1" ip="$2" sni=""
  [ "$ip" = true ] && sni=$'\n\tdefault_sni '"$host"
  mkdir -p "$HERE/edge"
  cat > "$HERE/edge/Caddyfile.edge" <<EOF
# Borde de Lyra WatchLog (modo b) — GENERADO por install.sh desde APP_PUBLIC_URL.
# ⚠ NO editar a mano: se regenera en cada ./install.sh. Para cambiar el dominio,
#   edita APP_PUBLIC_URL en .env y reejecuta. Sin ACME (air-gap): el TLS lo pone
#   certs/cert.pem + certs/key.pem (self-signed autogenerado o el de tu CA).
{
	auto_https off
	admin off${sni}
}

# Redirect 80 → 443.
http://${host} {
	redir https://{host}{uri} permanent
}

https://${host} {
	tls /certs/cert.pem /certs/key.pem
	encode gzip zstd
	# X-Forwarded-For lo agrega Caddy (rate limit por IP real + auditoría).
	reverse_proxy watchlog-web:80
}
EOF
}

# Compose invocation según EDGE_MODE (fija DC[] y EDGE_MODE globales).
build_dc() {
  EDGE_MODE="$(envval EDGE_MODE)"
  DC=(docker compose --project-directory "$HERE" --env-file "$ENV" -f "$COMPOSE_DIR/docker-compose.yml")
  case "$EDGE_MODE" in
    a) DC+=(-f "$COMPOSE_DIR/mode-a.behind-proxy.yml");;
    b) DC+=(-f "$COMPOSE_DIR/mode-b.own-edge.yml");;
    *) return 1;;
  esac
}
stack_running() { [ -n "$("${DC[@]}" ps -q 2>/dev/null | tr -d '[:space:]')" ]; }
# ¿Algo escucha en el puerto? 0=ocupado · 1=libre · 2=no pude verificar.
port_busy() {  # $1=port
  if command -v ss >/dev/null 2>&1; then
    ss -Htln 2>/dev/null | awk '{print $4}' | grep -qE ":$1\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  else
    return 2
  fi
}
ports_for_mode() {  # imprime los puertos que el modo actual dejará LISTEN
  if [ "$EDGE_MODE" = b ]; then echo "80 443"; else
    local lp; lp="$(envval EDGE_LOCAL_PORT)"; [ -n "$lp" ] || lp=8080; echo "$lp"
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# DOCTOR (--check): diagnóstico PASA/FALLA sin mutar nada.
# ═════════════════════════════════════════════════════════════════════════════
run_doctor() {
  step "Lyra WatchLog · doctor — diagnóstico (no modifica nada)"

  # 1) Arquitectura del daemon
  local da; da="$(docker_arch)"
  case "$da" in
    amd64) pass "Arquitectura Docker: amd64 (coincide con el paquete)";;
    '?')   fail "No pude leer la arquitectura del daemon Docker (¿docker corriendo?)";;
    *)     fail "Arquitectura Docker: '$da' — el paquete es amd64 (matriz soportada: Linux x86-64)";;
  esac

  # 2) Docker + compose + utilidades
  command -v docker >/dev/null 2>&1 && pass "docker presente ($(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?'))" || fail "docker no está instalado"
  docker compose version >/dev/null 2>&1 && pass "docker compose v2 presente" || fail "falta el plugin 'docker compose' (v2)"
  command -v openssl   >/dev/null 2>&1 && pass "openssl presente"   || fail "falta openssl"
  command -v sha256sum >/dev/null 2>&1 && pass "sha256sum presente" || fail "falta sha256sum"

  # 3) .env completo
  if [ -f "$ENV" ]; then
    if grep -vE '^[[:space:]]*#' "$ENV" | grep -qE '__GEN_|__SET_ME_|__WL_VERSION__'; then
      fail ".env tiene marcadores sin completar (__GEN_/__SET_ME_/__WL_VERSION__) — corre ./install.sh"
    else
      pass ".env presente y completo"
    fi
  else
    fail ".env no existe todavía — corre ./install.sh (1ª pasada)"
    warn "Sin .env no puedo diagnosticar borde/puertos/certificado."
    [ "$DOCTOR_FAIL" = 0 ] && ok "doctor: sin fallas" || warn "doctor: hay FALLAS (ver arriba)"
    exit "$DOCTOR_FAIL"
  fi

  # 4) Modo de borde + APP_PUBLIC_URL
  if build_dc; then pass "EDGE_MODE=$EDGE_MODE"; else fail "EDGE_MODE inválido/ausente (usa a o b en .env)"; fi
  local url host is_ip=false; url="$(envval APP_PUBLIC_URL)"; host="$(url_host "$url")"
  if [ -n "$host" ]; then
    is_ipv4 "$host" && is_ip=true
    pass "APP_PUBLIC_URL=$url  (host: $host$( [ "$is_ip" = true ] && echo ', IP' || echo ', hostname'))"
  else
    fail "APP_PUBLIC_URL vacío o sin host"
  fi

  # 5) Puertos del modo (libres, o tomados por nuestro propio stack)
  local p rc up=false; stack_running && up=true
  for p in $(ports_for_mode); do
    rc=0; port_busy "$p" || rc=$?
    case "$rc" in
      0) if [ "$up" = true ]; then pass "puerto $p ocupado por el propio stack (idempotente)"; else fail "puerto $p ocupado por OTRO proceso (libéralo: ss -ltnp | grep :$p)"; fi;;
      2) note "no pude verificar el puerto $p (sin ss/netstat)";;
      *) pass "puerto $p libre";;
    esac
  done

  # 6) Certificado (modo b)
  if [ "$EDGE_MODE" = b ]; then
    if [ -f "$HERE/certs/cert.pem" ] && [ -f "$HERE/certs/key.pem" ]; then
      if key_readable; then
        cert_key_match && pass "cert.pem ↔ key.pem coinciden" || fail "cert.pem y key.pem NO corresponden"
      else
        note "key.pem no legible por el usuario actual (600/uid 1000) — omito cert↔llave (normal; corre el doctor con sudo para incluirlo)"
      fi
      if [ -n "$host" ]; then
        cert_covers_host "$host" && pass "el SAN del cert cubre '$host'" || note "el SAN del cert no menciona '$host' (¿wildcard/CA corporativa?)"
      fi
      openssl x509 -in "$HERE/certs/cert.pem" -noout -checkend 0        >/dev/null 2>&1 && pass "certificado vigente" || fail "certificado VENCIDO"
      openssl x509 -in "$HERE/certs/cert.pem" -noout -checkend 2592000  >/dev/null 2>&1 || note "el certificado vence en <30 días"
    else
      fail "faltan certs/cert.pem y/o certs/key.pem (modo b) — reejecuta ./install.sh para autogenerarlos"
    fi
    # Coherencia default_sni ↔ IP/hostname
    if [ -f "$HERE/edge/Caddyfile.edge" ]; then
      if grep -q '^[[:space:]]*default_sni' "$HERE/edge/Caddyfile.edge"; then
        [ "$is_ip" = true ] && pass "edge: default_sni presente (acceso por IP)" || note "edge: default_sni presente pese a ser hostname (SNI menos estricto)"
      else
        [ "$is_ip" = true ] && fail "edge: FALTA default_sni y el host es IP ⇒ TLS fallará sin SNI (reejecuta ./install.sh)" || pass "edge: sin default_sni (correcto para hostname)"
      fi
    else
      fail "edge/Caddyfile.edge no existe (modo b) — reejecuta ./install.sh"
    fi
  fi

  # 7) Estado de contenedores
  local svc cid st svcs="postgres redis minio api watchlog-web"
  [ "$EDGE_MODE" = b ] && svcs="$svcs caddy-edge"
  for svc in $svcs; do
    cid="$("${DC[@]}" ps -q "$svc" 2>/dev/null || true)"
    if [ -z "$cid" ]; then note "contenedor '$svc' no está creado (¿stack abajo?)"; continue; fi
    if [ "$svc" = api ]; then
      st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$cid" 2>/dev/null || echo '?')"
      [ "$st" = healthy ] && pass "api: healthy" || fail "api: $st (ver: docker compose logs api)"
    else
      [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)" = true ] && pass "$svc: en ejecución" || fail "$svc: NO está corriendo"
    fi
  done

  # 8) Alcance HTTP/S (best-effort; solo si el stack está arriba)
  if [ "$up" = true ]; then
    if [ "$EDGE_MODE" = a ]; then
      local lp; lp="$(envval EDGE_LOCAL_PORT)"; [ -n "$lp" ] || lp=8080
      curl -sf -o /dev/null --max-time 10 "http://127.0.0.1:$lp/api/health" && pass "health por loopback :$lp responde 200" || fail "health por loopback :$lp NO responde"
    elif [ -n "$host" ]; then
      if [ "$is_ip" = true ]; then
        curl -sk -o /dev/null --max-time 10 "https://$host/api/health" && pass "HTTPS por IP (sin SNI) responde 200" || fail "HTTPS por IP NO responde (¿firewall/443?)"
      else
        curl -sk -o /dev/null --max-time 10 --resolve "$host:443:127.0.0.1" "https://$host/api/health" && pass "HTTPS por hostname (con SNI) responde 200 (resuelto a loopback)" || note "HTTPS por hostname no respondió resolviendo a loopback (normal si el borde escucha en otra IP)"
      fi
    fi
  fi

  echo
  [ "$DOCTOR_FAIL" = 0 ] && ok "doctor: TODO EN VERDE" || warn "doctor: hay FALLAS (revisa las líneas ✗ de arriba)"
  exit "$DOCTOR_FAIL"
}

# ─────────────────────────────────────────────────────────────────────────────
if [ "$CHECK" = true ]; then run_doctor; fi   # doctor sale aquí

# ── 1) Preflight ─────────────────────────────────────────────────────────────
step "Preflight del host"
command -v docker >/dev/null   || die "Docker no está instalado."
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (v2)."
command -v openssl >/dev/null  || die "Falta openssl (generación de secretos/certificado)."
command -v sha256sum >/dev/null|| die "Falta sha256sum (verificación de integridad)."
# Arquitectura del host vs imágenes: el bundle es amd64. Un host arm64 fallaría
# recién en runtime con un error críptico de 'platform mismatch' (clase del bug
# de MinIO). Lo atajamos temprano con un mensaje claro (matriz: Linux x86-64).
DARCH="$(docker_arch)"
case "$DARCH" in
  amd64) ;;
  '?')   warn "No pude leer la arquitectura del daemon Docker; continúo (se asume amd64).";;
  *)     die "Arquitectura del host Docker = '$DARCH'. El paquete es amd64 (matriz soportada: Linux x86-64; ver SUPPORTED_PLATFORMS.md). Aborto.";;
esac
say "docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?')  ·  $(docker compose version --short 2>/dev/null || echo compose)  ·  arch $DARCH"
# Avisos no bloqueantes (RAM/disco): la planta puede tener límites, informamos.
if command -v free >/dev/null; then
  memmb="$(free -m | awk '/^Mem:/{print $2}')"; [ "${memmb:-9999}" -lt 3500 ] && warn "RAM ${memmb}MB (<4GB recomendado)."
fi
avail="$(df -Pm "$HERE" | awk 'NR==2{print $4}')"; [ "${avail:-99999}" -lt 8000 ] && warn "Espacio libre ${avail}MB (<8GB recomendado)."

# ── 2) Verificar AUTENTICIDAD (firma cosign) + INTEGRIDAD (SHA256SUMS) ────────
# Orden: primero la FIRMA sobre el SHA256SUMS (¿vino de ITESICWS?), luego el
# SHA256SUMS sobre el contenido (¿está intacto?). La firma es best-effort en el
# host (decisión E3): si la planta air-gapped no trae el binario cosign, se avisa y
# el AUDITOR la verifica en su estación (con tooling) ANTES de traer el USB.
step "Verificación de autenticidad (firma cosign)"
if [ -f "$HERE/cosign.pub" ] && [ -f "$HERE/SHA256SUMS.cosign.bundle" ]; then
  if command -v cosign >/dev/null 2>&1; then
    if cosign verify-blob --key "$HERE/cosign.pub" --bundle "$HERE/SHA256SUMS.cosign.bundle" \
         --insecure-ignore-tlog=true "$HERE/SHA256SUMS" >/dev/null 2>&1; then
      ok "Firma ITESICWS VERIFICADA (el paquete es auténtico y no fue alterado)."
    else
      die "❌ FIRMA INVÁLIDA sobre SHA256SUMS — el paquete NO es auténtico o fue manipulado. Aborto."
    fi
  else
    warn "Paquete FIRMADO pero 'cosign' no está en este host ⇒ firma NO verificada aquí (best-effort)."
    echo "     Verifícala en tu estación antes de instalar (ver INSTALL_OFFLINE.md §Verificar la firma):"
    echo "       cosign verify-blob --key cosign.pub --bundle SHA256SUMS.cosign.bundle --insecure-ignore-tlog=true SHA256SUMS"
  fi
else
  warn "Paquete SIN firma cosign (¿versión previa a E3?) — solo se comprobará integridad SHA256."
fi

step "Verificación de integridad (SHA256SUMS)"
if [ -f "$HERE/SHA256SUMS" ]; then
  ( cd "$HERE" && sha256sum -c SHA256SUMS --quiet ) || die "SHA256SUMS NO coincide — paquete corrupto o alterado. Aborto."
  ok "Paquete íntegro."
else
  warn "Sin SHA256SUMS (¿ejecución fuera del paquete?) — se omite la verificación."
fi

# ── 3) Versión del paquete ───────────────────────────────────────────────────
TAG=""
[ -f "$HERE/VERSION" ] && TAG="$(awk -F': *' '/^version:/{print $2; exit}' "$HERE/VERSION")"
if [ -z "$TAG" ] && [ -d "$IMAGES_DIR" ]; then
  TAG="$(ls "$IMAGES_DIR"/lyra-watchlog-api-*.tar 2>/dev/null | head -1 | sed -E 's#.*lyra-watchlog-api-(.+)\.tar#\1#')"
fi
[ -n "$TAG" ] || die "No pude determinar la versión del paquete (VERSION / images/)."
say "versión: $TAG"

# ── 4) Cargar imágenes (docker load; idempotente) ────────────────────────────
step "Carga de imágenes (offline)"
if [ -d "$IMAGES_DIR" ]; then
  for t in "$IMAGES_DIR"/*.tar; do
    [ -e "$t" ] || die "No hay imágenes en $IMAGES_DIR."
    say "load $(basename "$t")"; docker load -i "$t" >/dev/null
  done
  ok "Imágenes cargadas."
else
  warn "Sin carpeta images/ — asumo imágenes ya presentes en el daemon."
fi

# ── 5) .env: generar con secretos (una sola vez) o validar el existente ──────
step "Configuración (.env)"
if [ ! -f "$ENV" ]; then
  [ -f "$ENV_TEMPLATE" ] || die "Falta la plantilla de entorno ($ENV_TEMPLATE)."
  cp "$ENV_TEMPLATE" "$ENV"; chmod 600 "$ENV"
  say "generando secretos con openssl…"
  DB_PASS="$(openssl rand -hex 24)"
  MINIO_PASS="$(openssl rand -hex 24)"
  JWT_A="$(openssl rand -base64 48 | tr -d '\n')"
  JWT_R="$(openssl rand -base64 48 | tr -d '\n')"
  APP_ENC="$(openssl rand -base64 32 | tr -d '\n')"
  DS_ENC="$(openssl rand -base64 32 | tr -d '\n')"
  # base64/hex nunca contienen '|', así que es un delimitador de sed seguro.
  repl() { sed -i "s|$1|$2|g" "$ENV"; }
  repl __GEN_DB_PASSWORD__ "$DB_PASS"
  repl __GEN_MINIO_PASSWORD__ "$MINIO_PASS"
  repl __GEN_JWT_ACCESS__ "$JWT_A"
  repl __GEN_JWT_REFRESH__ "$JWT_R"
  repl __GEN_APP_ENC_KEY__ "$APP_ENC"
  repl __GEN_DATA_SOURCE_ENC_KEY__ "$DS_ENC"
  repl __WL_VERSION__ "$TAG"
  ok ".env creado con secretos (chmod 600)."
  warn "COMPLETA lo específico del sitio en $ENV y vuelve a ejecutar ./install.sh:"
  echo "     · APP_PUBLIC_URL  = https://<tu-dominio-interno>   (o https://<IP-del-servidor>)"
  echo "     · EDGE_MODE       = a (detrás de tu proxy)  |  b (borde propio con cert)"
  echo "     (modo b: NO necesitas tocar el certificado ni el Caddyfile — install.sh los genera"
  echo "      desde APP_PUBLIC_URL; si tienes un cert corporativo, colócalo en certs/cert.pem+key.pem)"
  exit 2
fi
# .env ya existe: JAMÁS regenerar secretos (idempotencia). Validar que esté completo.
# Se ignoran las líneas de comentario (la plantilla documenta los tokens __GEN_*__).
if grep -vE '^[[:space:]]*#' "$ENV" | grep -qE '__GEN_|__SET_ME_|__WL_VERSION__'; then
  die "El .env tiene marcadores sin completar (__GEN_/__SET_ME_/__WL_VERSION__). Edítalo y reejecuta."
fi
ok ".env presente y completo (secretos intactos)."

# ── 6) Modo de borde → archivos de compose + AUTOREPARACIÓN del borde ────────
step "Modo de borde"
if ! build_dc; then
  die "EDGE_MODE inválido ('$(envval EDGE_MODE)'). Usa a o b en $ENV."
fi
case "$EDGE_MODE" in
  a) say "modo (a): detrás del proxy del cliente (loopback)";;
  c) die "EDGE_MODE=c (borde compartido del demo) no aplica en planta. Usa a o b.";;
  b)
     APP_URL="$(envval APP_PUBLIC_URL)"
     HOST="$(url_host "$APP_URL")"
     [ -n "$HOST" ] || die "APP_PUBLIC_URL vacío o sin host: no puedo configurar el borde. Fija APP_PUBLIC_URL en $ENV."
     if is_ipv4 "$HOST"; then IS_IP=true; else IS_IP=false; fi
     # (a) Caddyfile GENERADO desde APP_PUBLIC_URL — el operador NO lo edita.
     render_caddyfile "$HOST" "$IS_IP"
     say "borde generado: edge/Caddyfile.edge (host=$HOST$( [ "$IS_IP" = true ] && echo ', default_sni por IP' || echo ', SNI por hostname'))"
     # (b) Certificado: usa el corporativo si está; si falta, self-signed del host.
     if [ -f "$HERE/certs/cert.pem" ] && [ -f "$HERE/certs/key.pem" ]; then
       say "certificado: usando el provisto en certs/cert.pem (CA corporativa)"
     else
       gen_self_signed "$HOST" "$IS_IP"
       warn "Certificado SELF-SIGNED generado para $HOST (el navegador avisará 'conexión no privada' — normal en prueba)."
       echo "     Para producción, reemplaza certs/cert.pem y certs/key.pem por el de tu CA corporativa y reejecuta."
     fi
     # (c) Preflight del certificado: cert↔llave (DURO); SAN + vigencia (aviso).
     # Solo si la llave es legible: en una reejecución la habrá cedido a uid 1000
     # (paso 7) y el instalador no-root no la lee — ya se validó al crearla.
     if key_readable; then
       cert_key_match || die "certs/cert.pem y certs/key.pem NO corresponden (clave pública distinta). Corrígelos y reejecuta."
     else
       say "cert↔llave: key.pem no legible por el usuario actual (uid 1000 de una corrida previa) — omito la comprobación (ya validada al crearla)."
     fi
     [ -n "$HOST" ] && { cert_covers_host "$HOST" || warn "El SAN del certificado no menciona '$HOST' (¿wildcard/CA corporativa? verifícalo)."; }
     openssl x509 -in "$HERE/certs/cert.pem" -noout -checkend 0 >/dev/null 2>&1 || warn "El certificado está VENCIDO — el borde igual arrancará, pero el navegador lo rechazará."
     say "modo (b): borde propio con TLS en 443/tcp (host=$HOST)";;
esac

# ── 6-bis) Preflight de puertos del modo ──────────────────────────────────────
step "Preflight de puertos"
if stack_running; then
  say "stack ya en ejecución: omito el chequeo de puertos (idempotente)."
else
  for p in $(ports_for_mode); do
    rc=0; port_busy "$p" || rc=$?
    case "$rc" in
      0) die "Puerto $p ocupado por OTRO proceso (¿otro servidor web?). Libéralo y reejecuta. Diagnóstico: ss -ltnp | grep :$p";;
      2) warn "No pude verificar el puerto $p (sin ss/netstat) — continúo.";;
      *) say "puerto $p libre.";;
    esac
  done
fi

# ── 7) Directorios de estado (licencia / certs) ──────────────────────────────
mkdir -p "$HERE/license" "$HERE/certs"
# CIS 5.12 (H2): el api corre NON-ROOT (uid 1000) y ESCRIBE ./license
# (solicitud.lreq / renovacion.lreq / setup-token / license.lic importada) — si el
# bind ./license NO es escribible por uid 1000, el API CRASHEA al arrancar con
# EACCES (setup-token) y nunca queda healthy. El bind-mount conserva el dueño del
# host, así que hay que cederlo a uid 1000. Como quien corre install.sh casi nunca
# es root (docker se usa vía el grupo `docker`), intentamos: (1) chown directo (si
# somos root); (2) `sudo -n` (root sin contraseña, típico en VMs/cloud/CI); (3) si
# ninguno, ERROR claro con el comando exacto (el instalador NO puede dejar un API
# que va a crashear). Detectado en el smoke de instalación 2026-07-08.
_own_ok=false
if chown -R 1000:1000 "$HERE/license" "$HERE/certs" 2>/dev/null; then
  _own_ok=true
elif command -v sudo >/dev/null 2>&1 && sudo -n chown -R 1000:1000 "$HERE/license" "$HERE/certs" 2>/dev/null; then
  _own_ok=true; ok "Permisos de ./license y ./certs cedidos a uid 1000 (vía sudo)."
fi
if [ "$_own_ok" != true ]; then
  warn "No pude ceder ./license y ./certs al uid 1000 del contenedor (no soy root y"
  echo "     'sudo' pide contraseña o no está). El API NO podrá escribir su licencia y"
  echo "     FALLARÁ al arrancar. Ejecuta esto y reintenta ./install.sh:"
  echo "       sudo chown -R 1000:1000 \"$HERE/license\" \"$HERE/certs\""
  die "Permisos de ./license/./certs pendientes (ver arriba)."
fi

# ── 8) Levantar el stack ─────────────────────────────────────────────────────
step "Arranque del stack"
"${DC[@]}" up -d

# ── 9) Esperar healthcheck del API ───────────────────────────────────────────
step "Esperando healthcheck del API…"
cid=""
for _ in $(seq 1 60); do
  cid="$("${DC[@]}" ps -q api 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo starting)"
    [ "$status" = healthy ] && break
  fi
  sleep 2
done
status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid:-x}" 2>/dev/null || echo unknown)"
[ "$status" = healthy ] || die "El API no quedó sano (estado: $status). Diagnostica con: ./install.sh --check  ·  docker compose logs api"
ok "API saludable."

# ── 10) Próximos pasos ───────────────────────────────────────────────────────
step "Instalación OK — próximos pasos"
APP_URL="$(envval APP_PUBLIC_URL)"
cat <<EOF

  1) LICENCIA (ceremonia air-gapped, ver INSTALL_OFFLINE.md):
     · El arranque dejó la solicitud en   ./license/solicitud.lreq
     · Envíala a tu proveedor; te devuelven  license.lic  → cópialo a ./license/
       (o impórtalo desde el asistente /setup).

  2) PRIMER ARRANQUE (crea el administrador):
     · Abre  ${APP_URL:-https://<tu-dominio>}/setup
     · Token de un solo uso en                ./license/setup-token

  3) Verificación:  ${APP_URL:-https://<tu-dominio>}   →  login del administrador creado.
     · Diagnóstico rápido en cualquier momento:  ./install.sh --check   (o ./doctor.sh)

  Actualizar a un paquete nuevo:  desempaca el nuevo bundle y vuelve a ejecutar
  ./install.sh (respalda la BD antes de migrar; ver INSTALL_OFFLINE.md).
EOF
