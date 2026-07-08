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

deploy() {
  sed -i "s|^WL_VERSION=.*|WL_VERSION=${1}|" .env
  $COMPOSE pull
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
