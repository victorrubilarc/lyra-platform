#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — instalador OFFLINE e IDEMPOTENTE para el host de la planta (E2).
#
#   ./install.sh
#
# Diseñado para correr DENTRO del paquete offline (make-bundle) en una planta
# AIR-GAPPED. Es re-ejecutable: verifica el paquete (SHA256), carga las imágenes
# (`docker load`, cero `pull`), crea un `.env` con SECRETOS generados por openssl
# (nunca los rota en re-ejecuciones), levanta el stack por el MODO de borde
# elegido y espera el healthcheck. NO crea usuarios ni imprime secretos: el primer
# administrador lo crea el asistente web /setup con su token (OOBE).
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

say()  { printf '  · %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

# ── 1) Preflight ─────────────────────────────────────────────────────────────
step "Preflight del host"
command -v docker >/dev/null   || die "Docker no está instalado."
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (v2)."
command -v openssl >/dev/null  || die "Falta openssl (generación de secretos)."
command -v sha256sum >/dev/null|| die "Falta sha256sum (verificación de integridad)."
say "docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?')  ·  $(docker compose version --short 2>/dev/null || echo compose)"
# Avisos no bloqueantes (RAM/disco): la planta puede tener límites, informamos.
if command -v free >/dev/null; then
  memmb="$(free -m | awk '/^Mem:/{print $2}')"; [ "${memmb:-9999}" -lt 3500 ] && warn "RAM ${memmb}MB (<4GB recomendado)."
fi
avail="$(df -Pm "$HERE" | awk 'NR==2{print $4}')"; [ "${avail:-99999}" -lt 8000 ] && warn "Espacio libre ${avail}MB (<8GB recomendado)."

# ── 2) Verificar integridad del paquete ──────────────────────────────────────
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
  echo "     · APP_PUBLIC_URL  = https://<tu-dominio-interno>"
  echo "     · EDGE_MODE       = a (detrás de tu proxy)  |  b (borde propio con cert)"
  echo "     (modo b: coloca certs/cert.pem y certs/key.pem antes de reejecutar)"
  exit 2
fi
# .env ya existe: JAMÁS regenerar secretos (idempotencia). Validar que esté completo.
# Se ignoran las líneas de comentario (la plantilla documenta los tokens __GEN_*__).
if grep -vE '^[[:space:]]*#' "$ENV" | grep -qE '__GEN_|__SET_ME_|__WL_VERSION__'; then
  die "El .env tiene marcadores sin completar (__GEN_/__SET_ME_/__WL_VERSION__). Edítalo y reejecuta."
fi
ok ".env presente y completo (secretos intactos)."

# ── 6) Modo de borde → archivos de compose ───────────────────────────────────
step "Modo de borde"
EDGE_MODE="$(grep -E '^EDGE_MODE=' "$ENV" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
DC=(docker compose --project-directory "$HERE" --env-file "$ENV" -f "$COMPOSE_DIR/docker-compose.yml")
case "$EDGE_MODE" in
  a) DC+=(-f "$COMPOSE_DIR/mode-a.behind-proxy.yml"); say "modo (a): detrás del proxy del cliente (loopback)";;
  b) DC+=(-f "$COMPOSE_DIR/mode-b.own-edge.yml")
     { [ -f "$HERE/certs/cert.pem" ] && [ -f "$HERE/certs/key.pem" ]; } \
       || die "Modo (b) requiere certs/cert.pem y certs/key.pem (CA corporativa). Colócalos y reejecuta."
     say "modo (b): borde propio con certificado corporativo (443/tcp)";;
  c) die "EDGE_MODE=c (borde compartido del demo) no aplica en planta. Usa a o b.";;
  *) die "EDGE_MODE inválido ('$EDGE_MODE'). Usa a o b en $ENV.";;
esac

# ── 7) Directorios de estado (licencia / certs) ──────────────────────────────
mkdir -p "$HERE/license" "$HERE/certs"
# CIS 5.12 (H2): el api corre NON-ROOT (uid 1000) y ESCRIBE ./license
# (solicitud.lreq / renovacion.lreq / setup-token / license.lic importada). El
# bind-mount conserva el dueño del host, así que se cede a uid 1000. Best-effort:
# si el instalador ya corre como ese uid (o sin privilegios de chown) no falla —
# solo avisa cómo corregirlo si el api no pudiera escribir la licencia.
if ! chown -R 1000:1000 "$HERE/license" "$HERE/certs" 2>/dev/null; then
  warn "No pude ceder ./license a uid 1000 (¿sin root?). Si el API no escribe la licencia,"
  echo "     ejecuta:  sudo chown -R 1000:1000 \"$HERE/license\" \"$HERE/certs\""
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
[ "$status" = healthy ] || die "El API no quedó sano (estado: $status). Revisa: docker compose logs api"
ok "API saludable."

# ── 10) Próximos pasos ───────────────────────────────────────────────────────
step "Instalación OK — próximos pasos"
APP_URL="$(grep -E '^APP_PUBLIC_URL=' "$ENV" | head -1 | cut -d= -f2)"
cat <<EOF

  1) LICENCIA (ceremonia air-gapped, ver INSTALL_OFFLINE.md):
     · El arranque dejó la solicitud en   ./license/solicitud.lreq
     · Envíala a tu proveedor; te devuelven  license.lic  → cópialo a ./license/
       (o impórtalo desde el asistente /setup).

  2) PRIMER ARRANQUE (crea el administrador):
     · Abre  ${APP_URL:-https://<tu-dominio>}/setup
     · Token de un solo uso en                ./license/setup-token

  3) Verificación:  ${APP_URL:-https://<tu-dominio>}   →  login del administrador creado.

  Actualizar a un paquete nuevo:  desempaca el nuevo bundle y vuelve a ejecutar
  ./install.sh (respalda la BD antes de migrar; ver INSTALL_OFFLINE.md).
EOF
