#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — backup de Postgres con retención. Red de seguridad ANTES de
# cualquier migración/upgrade (el deploy corre `prisma migrate deploy`, que es
# forward-only: el rollback de update.sh solo revierte IMÁGENES, no el ESQUEMA).
#
#   ./onprem/backup.sh            → escribe deploy/backups/watchlog_YYYYMMDD_HHMM.dump
#   RETENTION_DAYS=30 ./onprem/backup.sh   (override de retención)
#
# Lo invoca update.sh antes de cada deploy (bloqueante por defecto) y, además, un
# cron diario en el host (ver docs/DEPLOYMENT.md):
#   30 3 * * *  /opt/watchlog/deploy/onprem/backup.sh >> /opt/watchlog/deploy/backups/backup.log 2>&1
#
# Formato: pg_dump CUSTOM (-Fc). Comprimido, restauración SELECTIVA, e inspeccionable
# SIN aplicarlo (`pg_restore --list` / `--schema-only`) — clave para verificar la copia.
# Postgres de WatchLog es DEDICADO (servicio `postgres`, red `internal`, volumen pgdata).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
RETENTION_DAYS="${RETENTION_DAYS:-14}"     # borra dumps más viejos que esto…
RETENTION_MIN_KEEP="${RETENTION_MIN_KEEP:-10}"  # …pero conserva SIEMPRE los últimos N
OUT="backups"; mkdir -p "$OUT"
FILE="$OUT/watchlog_$(date +%Y%m%d_%H%M).dump"

# ¿Postgres disponible? En el primer bootstrap aún no existe → nada que respaldar.
if ! $COMPOSE exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  echo "⏭  Postgres no disponible (¿bootstrap inicial?) — backup omitido (nada que respaldar)."
  exit 0
fi

# Dump a un .tmp y mv-atómico SOLO si pg_dump terminó OK: nunca dejar un dump parcial
# con nombre "bueno". Las credenciales se expanden DENTRO del contenedor (sh -c).
TMP="$FILE.tmp"
if $COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP"; then
  mv "$TMP" "$FILE"
  echo "✅ Backup: $FILE ($(du -h "$FILE" | cut -f1))"
else
  rm -f "$TMP"
  echo "❌ pg_dump falló — backup NO creado." >&2
  exit 1
fi

# Retención: borra dumps > RETENTION_DAYS días, pero SIEMPRE conserva los últimos
# RETENTION_MIN_KEEP (si solo se borrara por antigüedad, tras un mes sin deploys ni
# cron quedaríamos con CERO copias). `ls -1t` = más nuevos primero.
deletable="$(ls -1t "$OUT"/watchlog_*.dump 2>/dev/null | tail -n +"$((RETENTION_MIN_KEEP + 1))" || true)"
if [ -n "$deletable" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ -n "$(find "$f" -mtime +"$RETENTION_DAYS" -print 2>/dev/null)" ]; then
      rm -f "$f" && echo "   🗑  rotado (> ${RETENTION_DAYS}d): $f"
    fi
  done <<< "$deletable"
fi
echo "   Retención: > ${RETENTION_DAYS} días, conservando mínimo ${RETENTION_MIN_KEEP} copias."
