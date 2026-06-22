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
  echo "  · migrate deploy…"
  RUN_SEED=false $COMPOSE run --rm migrate
  $COMPOSE up -d
}

healthy() {
  for _ in $(seq 1 30); do
    if $COMPOSE exec -T api wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

deploy "$NEW"
if healthy; then
  echo "✅ WatchLog actualizado a ${NEW} y saludable."
else
  echo "❌ Health del API falló. Rollback a ${PREV}…"
  deploy "$PREV"
  if healthy; then echo "↩ Rollback OK (${PREV})."; else echo "‼ Rollback con problemas — revisar logs."; fi
  exit 1
fi
