#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — SMOKE de instalación del paquete OFFLINE en un host LIMPIO.
#
#   SRC_PREFIX=ghcr.io/victorrubilarc/ scripts/smoke-install.sh v0.1.20
#
# Reproduce EXACTAMENTE el camino del socio/cliente (que hasta la 1ª prueba piloto
# nunca se había ejercido de punta a punta en una máquina limpia):
#   make-bundle → extraer en dir virgen → install.sh (MODO a Y MODO b) →
#   verificar health del API + HTTPS del borde (por HOSTNAME con SNI y por IP sin SNI).
#
# Habría atrapado los 4 bugs del 2026-07-08:
#   (1) edge/ mal ubicado bajo compose/   → install modo b no encontraba el Caddyfile
#   (2) EDGE_MODE con comentario inline    → "EDGE_MODE inválido"
#   (3) MinIO en arm64 (pin equivocado)    → platform mismatch (ahora: assert_arch en make-bundle)
#   (4) acceso por IP sin default_sni       → TLS internal error
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
cleanup() {
  [ -d "$WORK/inst-a" ] && down "$WORK/inst-a" mode-a.behind-proxy.yml
  [ -d "$WORK/inst-b" ] && down "$WORK/inst-b" mode-b.own-edge.yml
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
sudo chown -R 1000:1000 "$A/license" 2>/dev/null || true
if install2 "$A" mode-a.behind-proxy.yml; then
  if curl -sf -o /dev/null --max-time 15 http://127.0.0.1:8080/api/health; then
    ok "MODO A: /api/health responde 200"
  else
    bad "MODO A: /api/health NO respondió"; dump_logs "$A" mode-a.behind-proxy.yml
  fi
fi
down "$A" mode-a.behind-proxy.yml

# ── 3) MODO B — borde propio TLS (por HOSTNAME con SNI y por IP sin SNI) ──────
say "MODO B — borde propio TLS (:443)"
B="$WORK/inst-b"
first_pass "$B"
# Certificado self-signed que cubre el hostname Y la IP loopback.
openssl req -x509 -newkey rsa:2048 -nodes -days 3 \
  -keyout "$B/certs/key.pem" -out "$B/certs/cert.pem" \
  -subj "/CN=$HOSTN" -addext "subjectAltName=DNS:$HOSTN,IP:127.0.0.1" 2>/dev/null
sed -i "s/watchlog\.planta\.cliente\.local/$HOSTN/g" "$B/edge/Caddyfile.edge"
# default_sni: sirve el cert también cuando el cliente entra por IP (no manda SNI).
sed -i "/auto_https off/a default_sni $HOSTN"        "$B/edge/Caddyfile.edge"
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=b/'                "$B/.env"
sed -i "s#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=https://$HOSTN#" "$B/.env"
sudo chown -R 1000:1000 "$B/license" "$B/certs" "$B/edge" 2>/dev/null || true
if ! install2 "$B" mode-b.own-edge.yml; then
  down "$B" mode-b.own-edge.yml
  say "RESULTADO DEL SMOKE"; printf '\033[31m✗ SMOKE: falló la instalación modo b\033[0m\n'; exit 1
fi
# (a) por HOSTNAME → el cliente manda SNI → Caddy matchea el sitio.
if curl -sk -o /dev/null --max-time 15 --resolve "$HOSTN:443:127.0.0.1" "https://$HOSTN/api/health"; then
  ok "MODO B: HTTPS por hostname (con SNI) responde 200"
else
  bad "MODO B: HTTPS por hostname FALLÓ"
fi
# (b) por IP → sin SNI → depende de default_sni (el bug del piloto).
if curl -sk -o /dev/null --max-time 15 "https://127.0.0.1/api/health"; then
  ok "MODO B: HTTPS por IP (sin SNI, default_sni) responde 200"
else
  bad "MODO B: HTTPS por IP FALLÓ (¿default_sni?)"
fi
down "$B" mode-b.own-edge.yml

# ── Resultado ────────────────────────────────────────────────────────────────
say "RESULTADO DEL SMOKE"
if [ "$FAILED" = 0 ]; then
  printf '\033[32m✓ SMOKE DE INSTALACIÓN: TODO VERDE (modo a + modo b, hostname + IP)\033[0m\n'
  exit 0
else
  printf '\033[31m✗ SMOKE DE INSTALACIÓN: HUBO FALLAS (ver arriba)\033[0m\n'
  exit 1
fi
