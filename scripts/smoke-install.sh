#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — SMOKE de instalación del paquete OFFLINE en un host LIMPIO.
#
#   SRC_PREFIX=ghcr.io/victorrubilarc/ scripts/smoke-install.sh v0.1.20
#
# Reproduce EXACTAMENTE el camino del socio/cliente (que hasta la 1ª prueba piloto
# nunca se había ejercido de punta a punta en una máquina limpia):
#   make-bundle → extraer en dir virgen → install.sh (MODO a + MODO b hostname +
#   MODO b IP) → verificar health del API + HTTPS del borde + `./install.sh --check`.
#
# Ejerce la AUTOREPARACIÓN (2026-07-08): el smoke YA NO crea el cert con openssl ni
# edita el Caddyfile con sed — install.sh debe GENERAR ambos desde APP_PUBLIC_URL.
#   · MODO b HOSTNAME → cert self-signed DNS + SIN default_sni ⇒ SNI 200 y por IP
#     (sin SNI) DEBE ser rechazado (prueba negativa: default_sni es condicional).
#   · MODO b IP       → cert self-signed IP + CON default_sni  ⇒ por IP (sin SNI) 200.
#
# Habría atrapado los 4 bugs del 2026-07-08:
#   (1) edge/ mal ubicado bajo compose/   → install modo b no encontraba el Caddyfile
#   (2) EDGE_MODE con comentario inline    → "EDGE_MODE inválido"
#   (3) MinIO en arm64 (pin equivocado)    → platform mismatch (ahora: assert_arch en make-bundle)
#   (4) acceso por IP sin default_sni       → TLS internal error (ahora AUTO por install.sh)
#
# Requisitos del host: docker + compose v2 + openssl + curl + sudo. Con internet
# (pull de imágenes de app desde GHCR e infra desde Docker Hub). Solo Linux x86-64.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:-stable}"
SRC_PREFIX="${SRC_PREFIX:-ghcr.io/victorrubilarc/}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
HOSTN="watchlog.smoke.local"
FAILED=0

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
bad() { printf '\033[31m  ✗ %s\033[0m\n' "$*"; FAILED=1; }

down() {  # $1 = dir, $2 = archivo de modo
  docker compose --project-directory "$1" --env-file "$1/.env" \
    -f "$1/compose/docker-compose.yml" -f "$1/compose/$2" down -v 2>/dev/null || true
}
dump_logs() {  # $1 = dir, $2 = archivo de modo — diagnóstico ante fallo
  echo "······ estado de contenedores ······"
  docker compose --project-directory "$1" --env-file "$1/.env" \
    -f "$1/compose/docker-compose.yml" -f "$1/compose/$2" ps -a 2>&1 || true
  echo "······ logs migrate ······"
  docker compose --project-directory "$1" --env-file "$1/.env" \
    -f "$1/compose/docker-compose.yml" -f "$1/compose/$2" logs --no-color --tail 60 migrate 2>&1 | tail -60 || true
  echo "······ logs api ······"
  docker compose --project-directory "$1" --env-file "$1/.env" \
    -f "$1/compose/docker-compose.yml" -f "$1/compose/$2" logs --no-color --tail 80 api 2>&1 | tail -80 || true
}
install2() {  # $1 = dir, $2 = archivo de modo — 2ª pasada; vuelca logs si falla
  local rc=0
  ( cd "$1" && ./install.sh ) || rc=$?
  [ "$rc" = 0 ] || { bad "install.sh (2ª pasada) falló (rc=$rc)"; dump_logs "$1" "$2"; }
  return "$rc"
}
doctor_ok() {  # $1 = dir — ejerce el modo diagnóstico (install.sh --check)
  local rc=0; ( cd "$1" && ./install.sh --check ) || rc=$?
  [ "$rc" = 0 ] && ok "doctor (install.sh --check): TODO VERDE" || bad "doctor reportó FALLAS (rc=$rc)"
}
cleanup() {
  [ -d "$WORK/inst-a" ]  && down "$WORK/inst-a"  mode-a.behind-proxy.yml
  [ -d "$WORK/inst-b1" ] && down "$WORK/inst-b1" mode-b.own-edge.yml
  [ -d "$WORK/inst-b2" ] && down "$WORK/inst-b2" mode-b.own-edge.yml
  [ -d "$WORK/inst-c" ]  && down "$WORK/inst-c"  mode-a.behind-proxy.yml
  rm -rf "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

# ── 1) Construir el bundle (ejerce make-bundle: assert_arch + layout de edge/) ─
say "make-bundle $TAG  (src=$SRC_PREFIX)"
OUTPUT_DIR="$WORK/dist" SRC_PREFIX="$SRC_PREFIX" bash "$REPO_ROOT/scripts/make-bundle.sh" "$TAG"
TARBALL="$WORK/dist/lyra-watchlog-$TAG.tar.gz"
[ -f "$TARBALL" ] || { bad "no se generó el tarball"; exit 1; }
ok "bundle generado"

# Extrae el bundle en un dir virgen y corre la 1ª pasada (crea .env, sale con 2).
first_pass() {  # $1 = dir de instalación
  mkdir -p "$1"
  tar -xzf "$TARBALL" -C "$1" --strip-components=1
  local rc=0; ( cd "$1" && ./install.sh ) || rc=$?
  [ "$rc" = 2 ] || { bad "install.sh (1ª pasada) debía salir con 2, salió $rc"; return 1; }
}

# ── 2) MODO A — detrás del proxy del cliente (loopback :8080, sin TLS) ────────
say "MODO A — detrás de proxy (loopback :8080)"
A="$WORK/inst-a"
first_pass "$A"
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=a/'                       "$A/.env"
sed -i 's#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=http://127.0.0.1:8080#' "$A/.env"
sed -i 's/^EDGE_LOCAL_PORT=.*/EDGE_LOCAL_PORT=8080/'        "$A/.env"
# NO hacemos chown manual: install.sh debe cederlo a uid 1000 por sí mismo
# (vía sudo -n en un host con root sin contraseña, como este runner). Así el
# smoke valida que seguir la guía tal cual (solo ./install.sh) FUNCIONA.
if install2 "$A" mode-a.behind-proxy.yml; then
  if curl -sf -o /dev/null --max-time 15 http://127.0.0.1:8080/api/health; then
    ok "MODO A: /api/health responde 200"
  else
    bad "MODO A: /api/health NO respondió"; dump_logs "$A" mode-a.behind-proxy.yml
  fi
  doctor_ok "$A"
fi
down "$A" mode-a.behind-proxy.yml

# ── 3) MODO B / HOSTNAME — borde propio TLS AUTO (cert + Caddyfile por install) ─
# NO tocamos certs/ ni edge/Caddyfile.edge: install.sh debe autogenerar el cert
# self-signed (SAN DNS) y el Caddyfile SIN default_sni (host = hostname).
say "MODO B / HOSTNAME — cert + borde AUTOGENERADOS (con SNI; sin default_sni)"
B1="$WORK/inst-b1"
first_pass "$B1"
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=b/'                        "$B1/.env"
sed -i "s#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=https://$HOSTN#" "$B1/.env"
if ! install2 "$B1" mode-b.own-edge.yml; then
  down "$B1" mode-b.own-edge.yml
  say "RESULTADO DEL SMOKE"; printf '\033[31m✗ SMOKE: falló la instalación modo b (hostname)\033[0m\n'; exit 1
fi
# install.sh generó el cert self-signed → debe existir sin que lo hayamos creado.
{ [ -s "$B1/certs/cert.pem" ] && [ -s "$B1/certs/key.pem" ]; } \
  && ok "MODO B/hostname: install.sh autogeneró certs/cert.pem + key.pem" \
  || bad "MODO B/hostname: install.sh NO autogeneró el certificado"
# El Caddyfile NO debe llevar default_sni (host = hostname).
if grep -q '^[[:space:]]*default_sni' "$B1/edge/Caddyfile.edge"; then
  bad "MODO B/hostname: default_sni NO debía estar (host es hostname)"
else
  ok "MODO B/hostname: Caddyfile sin default_sni (correcto)"
fi
# (a) por HOSTNAME → el cliente manda SNI → Caddy matchea el sitio.
if curl -sk -o /dev/null --max-time 15 --resolve "$HOSTN:443:127.0.0.1" "https://$HOSTN/api/health"; then
  ok "MODO B/hostname: HTTPS por hostname (con SNI) responde 200"
else
  bad "MODO B/hostname: HTTPS por hostname FALLÓ"; dump_logs "$B1" mode-b.own-edge.yml
fi
# (b) prueba NEGATIVA: por IP sin SNI DEBE fallar (no hay default_sni).
if curl -sk -o /dev/null --max-time 10 "https://127.0.0.1/api/health"; then
  bad "MODO B/hostname: por IP sin SNI respondió (default_sni no debía activarse)"
else
  ok "MODO B/hostname: por IP sin SNI rechazado (default_sni condicional, correcto)"
fi
doctor_ok "$B1"
down "$B1" mode-b.own-edge.yml

# ── 4) MODO B / IP — cert + default_sni AUTOGENERADOS para acceso por IP ──────
say "MODO B / IP — cert + default_sni AUTOGENERADOS (acceso por IP sin SNI)"
B2="$WORK/inst-b2"
first_pass "$B2"
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=b/'                          "$B2/.env"
sed -i "s#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=https://127.0.0.1#" "$B2/.env"
if ! install2 "$B2" mode-b.own-edge.yml; then
  down "$B2" mode-b.own-edge.yml
  say "RESULTADO DEL SMOKE"; printf '\033[31m✗ SMOKE: falló la instalación modo b (IP)\033[0m\n'; exit 1
fi
# El Caddyfile DEBE llevar default_sni (host = IP).
if grep -q '^[[:space:]]*default_sni' "$B2/edge/Caddyfile.edge"; then
  ok "MODO B/IP: Caddyfile con default_sni (correcto para acceso por IP)"
else
  bad "MODO B/IP: FALTA default_sni (host es IP)"
fi
# por IP → sin SNI → depende de default_sni (el bug del piloto, ahora AUTO).
if curl -sk -o /dev/null --max-time 15 "https://127.0.0.1/api/health"; then
  ok "MODO B/IP: HTTPS por IP (sin SNI, default_sni) responde 200"
else
  bad "MODO B/IP: HTTPS por IP FALLÓ (¿default_sni?)"; dump_logs "$B2" mode-b.own-edge.yml
fi
doctor_ok "$B2"
down "$B2" mode-b.own-edge.yml

# ── 5) MODO A + machine-id POR ARCHIVO — valida en CI la ruta que usa Windows ─
# La huella Windows (install.ps1) apunta LICENSE_MACHINE_ID_FILE a un archivo en
# ./license (anclado al MachineGuid del host Windows) EN LUGAR de /etc/machine-id,
# porque bajo Docker Desktop ese bind-mount no es fiable (DECISIONS 2026-07-08).
# Aqui se ejerce ESE mismo mecanismo en Linux/CI: el API debe leer la huella del
# archivo montado (via el ./license ya existente) y quedar HEALTHY. Es el unico
# plumbing del que depende el track Windows, cubierto asi tambien en el smoke Linux.
say "MODO A + machine-id POR ARCHIVO (simula la huella Windows)"
C="$WORK/inst-c"
first_pass "$C"
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=a/'                       "$C/.env"
sed -i 's#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=http://127.0.0.1:8080#' "$C/.env"
sed -i 's/^EDGE_LOCAL_PORT=.*/EDGE_LOCAL_PORT=8080/'        "$C/.env"
# Lo que hace install.ps1 en Windows: escribe una huella propia y apunta a ella.
mkdir -p "$C/license"
printf 'smoke-windows-fingerprint-0001\n' > "$C/license/machine-id"
echo 'LICENSE_MACHINE_ID_FILE=/app/license/machine-id' >> "$C/.env"
if install2 "$C" mode-a.behind-proxy.yml; then
  if curl -sf -o /dev/null --max-time 15 http://127.0.0.1:8080/api/health; then
    ok "MODO A/machine-id-archivo: /api/health responde 200 (colector leyo la huella montada)"
  else
    bad "MODO A/machine-id-archivo: /api/health NO respondio"; dump_logs "$C" mode-a.behind-proxy.yml
  fi
  doctor_ok "$C"
fi
down "$C" mode-a.behind-proxy.yml

# ── Resultado ────────────────────────────────────────────────────────────────
say "RESULTADO DEL SMOKE"
if [ "$FAILED" = 0 ]; then
  printf '\033[32m✓ SMOKE DE INSTALACIÓN: TODO VERDE (modo a + modo b, hostname + IP)\033[0m\n'
  exit 0
else
  printf '\033[31m✗ SMOKE DE INSTALACIÓN: HUBO FALLAS (ver arriba)\033[0m\n'
  exit 1
fi
