#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — actualización en el host con migración y ROLLBACK automático.
#   ./onprem/update.sh v1.2.0   (o sin argumento → usa WL_VERSION del .env / 'stable')
#
# Lo invoca el GitHub Action (release.yml) por SSH tras publicar las imágenes a
# GHCR. Fija la versión en .env, hace `pull`, corre el init `migrate` (migrate
# deploy, idempotente), levanta el stack y verifica el healthcheck del API. Si el
# API no queda sano, vuelve a la versión anterior.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

PREV="$(grep '^WL_VERSION=' .env | cut -d= -f2)"
NEW="${1:-$PREV}"
echo "▶ Actualizando WatchLog ${PREV:-?} → ${NEW}"

# Login al registro PRIVADO (E3, control de acceso a la distribución). Best-effort:
# si el .env trae un token READ-ONLY por cliente/socio (revocable), se autentica; si
# no, se asume registro público o sesión ya iniciada (flujo actual intacto). El token
# NO tiene permiso de escritura: si se filtra, solo permite pull y se REVOCA sin tocar
# a los demás clientes. Ver docs/DEPLOYMENT.md §"Registro privado + tokens revocables".
registry_login() {
  local reg user tok
  reg="$(grep '^WL_REGISTRY=' .env | cut -d= -f2)"; reg="${reg:-ghcr.io}"
  user="$(grep '^WL_REGISTRY_USER=' .env | cut -d= -f2 || true)"
  tok="$(grep '^WL_REGISTRY_TOKEN=' .env | cut -d= -f2 || true)"
  if [ -n "$user" ] && [ -n "$tok" ]; then
    echo "  · login a registro privado ($reg) con token read-only…"
    echo "$tok" | docker login "$reg" -u "$user" --password-stdin >/dev/null \
      || { echo "❌ Login al registro falló (¿token revocado/expirado?)." >&2; exit 1; }
  fi
}
registry_login

# Verificación de firma cosign de las imágenes de APP por DIGEST (E3, camino con
# registro). Best-effort: solo si cosign y la clave pública están presentes en el
# host (no rompe el demo, que hoy no los trae). Si el toolchain SÍ está y la firma
# FALLA, aborta el deploy: una imagen que no verifica es una bandera roja. Resuelve
# el objetivo "que corra solo lo que ITESICWS firmó" sin hard-pinear @digest en el
# compose (que exigiría reescribir el digest en cada release; la verificación por
# digest da la MISMA garantía de integridad). Standalone air-gap verifica el bundle
# (install.sh), no por registro (gotcha docker save/load, SECURITY §9.7-bis).
COSIGN_PUB="${COSIGN_PUB:-../scripts/license/cosign/cosign.pub}"
verify_signatures() {
  local ver="$1" owner reg pub
  command -v cosign >/dev/null 2>&1 || { echo "  · cosign no presente — verificación de firma OMITIDA (best-effort)."; return 0; }
  [ -f "$COSIGN_PUB" ] || { echo "  · sin cosign.pub ($COSIGN_PUB) — verificación de firma OMITIDA."; return 0; }
  owner="$(grep '^WL_OWNER=' .env | cut -d= -f2)"
  reg="$(grep '^WL_REGISTRY=' .env | cut -d= -f2)"; reg="${reg:-ghcr.io}"
  [ -n "$owner" ] || { echo "  · sin WL_OWNER — verificación de firma OMITIDA."; return 0; }
  local img digest ref
  for img in api web migrate; do
    # Digest EXACTO de lo que se acaba de pullear (no un tag mutable).
    digest="$(docker inspect --format '{{index .RepoDigests 0}}' "${reg}/${owner}/lyra-watchlog-${img}:${ver}" 2>/dev/null || true)"
    [ -n "$digest" ] || { echo "  · sin RepoDigest de ${img} — omitido."; continue; }
    ref="${reg}/${owner}/lyra-watchlog-${img}@${digest##*@}"
    if cosign verify --key "$COSIGN_PUB" --insecure-ignore-tlog=true "$ref" >/dev/null 2>&1; then
      echo "  ✓ firma OK: lyra-watchlog-${img}@${digest##*@}"
    else
      echo "❌ FIRMA INVÁLIDA de lyra-watchlog-${img} (${ref}). Aborto el deploy." >&2
      exit 1
    fi
  done
}

deploy() {
  sed -i "s|^WL_VERSION=.*|WL_VERSION=${1}|" .env
  $COMPOSE pull
  verify_signatures "$1"
  # CIS 5.12 (H2): desde v0.1.19 el api corre NON-ROOT (uid 1000) y escribe
  # ./license (solicitud/renovacion/setup-token/license.lic). El bind conserva el
  # dueño del host ⇒ se cede a 1000 (idempotente; best-effort si no hay root).
  mkdir -p license && chown -R 1000:1000 license 2>/dev/null || true
  echo "  · migrate deploy + seed de catálogo…"
  $COMPOSE run --rm migrate
  $COMPOSE up -d
}

# Red de seguridad: respalda la BD ANTES de migrar. `migrate deploy` es forward-only
# (el rollback de abajo solo revierte IMÁGENES, no el ESQUEMA) ⇒ si una migración
# corrompe datos sin backup, la pérdida es irreversible. Bloquea por defecto; se puede
# forzar la continuación con BACKUP_REQUIRED=false en el .env (asumiendo el riesgo).
backup() {
  echo "  · respaldo pre-deploy de Postgres…"
  if bash onprem/backup.sh; then
    return 0
  fi
  if [ "${BACKUP_REQUIRED:-true}" = "false" ]; then
    echo "  ⚠ Backup falló pero BACKUP_REQUIRED=false → continúo bajo tu riesgo."
    return 0
  fi
  echo "❌ Backup pre-deploy falló. Abortando ANTES de migrar (red de seguridad)."
  echo "   Corrige el backup, o fuerza con BACKUP_REQUIRED=false si decides asumir el riesgo."
  exit 1
}

healthy() {
  # node (no wget): la imagen slim no trae wget/curl.
  for _ in $(seq 1 30); do
    if $COMPOSE exec -T api node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Auto-prune tras un deploy EXITOSO: con deploys continuos el disco se llena de
# versiones viejas y rompería a AMBAS apps del EC2. Borra SOLO las imágenes de la
# versión anterior de WatchLog (nunca las en uso ni las de la app vecina) + dangling.
prune_old() {
  local owner reg
  owner="$(grep '^WL_OWNER=' .env | cut -d= -f2)"
  reg="$(grep '^WL_REGISTRY=' .env | cut -d= -f2)"; reg="${reg:-ghcr.io}"
  if [ -n "${PREV:-}" ] && [ "$PREV" != "$NEW" ] && [ -n "$owner" ]; then
    local img
    for img in api web migrate; do
      docker image rm "${reg}/${owner}/lyra-watchlog-${img}:${PREV}" 2>/dev/null || true
    done
  fi
  docker image prune -f || true   # || true: no romper un deploy ya exitoso (set -e)
}

backup
deploy "$NEW"
if healthy; then
  echo "✅ WatchLog actualizado a ${NEW} y saludable."
  prune_old
  echo "  · limpieza de imágenes viejas hecha."
else
  echo "❌ Health del API falló. Rollback a ${PREV}…"
  deploy "$PREV"
  if healthy; then echo "↩ Rollback OK (${PREV})."; else echo "‼ Rollback con problemas — revisar logs."; fi
  exit 1
fi
