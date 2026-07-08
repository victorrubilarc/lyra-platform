#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — backup de Postgres con retención y CIFRADO OPCIONAL (age, E3).
# Red de seguridad ANTES de cualquier migración/upgrade (el deploy corre
# `prisma migrate deploy`, forward-only: el rollback de update.sh revierte
# IMÁGENES, no el ESQUEMA).
#
#   ./onprem/backup.sh            → deploy/backups/watchlog_YYYYMMDD_HHMM.dump[.age]
#   RETENTION_DAYS=30 ./onprem/backup.sh          (override de retención)
#   COMPOSE="docker compose …" ./onprem/backup.sh (override del stack; ver detección)
#
# Cron diario en el host (ver docs/DEPLOYMENT.md):
#   30 3 * * *  /opt/watchlog/deploy/onprem/backup.sh >> …/backups/backup.log 2>&1
#
# Formato: pg_dump CUSTOM (-Fc). Comprimido, restauración SELECTIVA, inspeccionable
# SIN aplicarlo (`pg_restore --list`). Postgres de WatchLog es DEDICADO (servicio
# `postgres`, volumen pgdata).
#
# ── CIFRADO (E3, cadena de suministro) ──────────────────────────────────────
# El software corre en infra AJENA (canal marca blanca). Un `.dump` en claro es
# la base de datos del cliente legible con solo copiar el archivo/robar el disco.
# Si se define un DESTINATARIO age, el dump se cifra en tránsito (pipe, nunca toca
# el disco en claro) con criptografía ASIMÉTRICA X25519:
#   · el host solo necesita la clave PÚBLICA (destinatario) para cifrar;
#   · descifrar exige la identidad PRIVADA, que el CLIENTE custodia FUERA del host
#     (modelo L3: gestor de contraseñas / medio offline). Robar el host NO basta.
# Config (en el .env):  BACKUP_AGE_RECIPIENT=age1…   ó   BACKUP_AGE_RECIPIENTS_FILE=ruta
# Sin destinatario ⇒ dump en CLARO + aviso (retrocompatible: demo/dev/EC2 intactos).
# Restaurar:  ./onprem/restore.sh   (descifra con la identidad del cliente).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Detección del stack (reutilizable demo/prod ↔ planta standalone) ─────────
# El script sirve a los DOS despliegues sin duplicarse. `COMPOSE` se puede forzar
# por env; si no, se autodetecta por los archivos presentes:
#   · demo/prod  →  deploy/docker-compose.prod.yml   (layout del repo/EC2)
#   · standalone →  compose/docker-compose.yml + modo de borde (layout del bundle)
if [ -z "${COMPOSE:-}" ]; then
  if [ -f docker-compose.prod.yml ]; then
    COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
  elif [ -f compose/docker-compose.yml ]; then
    # Bundle/planta: el proyecto vive en el dir del instalador (.env al lado).
    EDGE_MODE="$(grep -E '^EDGE_MODE=' .env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
    COMPOSE="docker compose --project-directory . --env-file .env -f compose/docker-compose.yml"
    case "$EDGE_MODE" in
      a) COMPOSE="$COMPOSE -f compose/mode-a.behind-proxy.yml";;
      b) COMPOSE="$COMPOSE -f compose/mode-b.own-edge.yml";;
    esac
  else
    echo "❌ No encuentro el compose (ni docker-compose.prod.yml ni compose/). Define COMPOSE=." >&2
    exit 1
  fi
fi

RETENTION_DAYS="${RETENTION_DAYS:-14}"          # borra dumps más viejos que esto…
RETENTION_MIN_KEEP="${RETENTION_MIN_KEEP:-10}"  # …pero conserva SIEMPRE los últimos N
OUT="backups"; mkdir -p "$OUT"
FILE="$OUT/watchlog_$(date +%Y%m%d_%H%M).dump"

# ── Cifrado age: ¿configurado? ¿binario disponible? ──────────────────────────
# Prefiere `age` del PATH; si no, AGE_BIN; si no, el binario embarcado en el bundle
# (tools/age, junto al instalador de planta). Air-gap: cero dependencia de red.
RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
RECIPIENTS_FILE="${BACKUP_AGE_RECIPIENTS_FILE:-}"
find_age() {
  if [ -n "${AGE_BIN:-}" ] && [ -x "${AGE_BIN}" ]; then echo "$AGE_BIN"; return 0; fi
  if command -v age >/dev/null 2>&1; then command -v age; return 0; fi
  for c in ./tools/age ../tools/age "$(dirname "$0")/../tools/age"; do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}
ENCRYPT=false
AGE=""
AGE_RECIP_ARGS=()
if [ -n "$RECIPIENT" ] || [ -n "$RECIPIENTS_FILE" ]; then
  if AGE="$(find_age)"; then
    ENCRYPT=true
    FILE="$FILE.age"
    [ -n "$RECIPIENT" ]       && AGE_RECIP_ARGS+=(-r "$RECIPIENT")
    [ -n "$RECIPIENTS_FILE" ] && { [ -f "$RECIPIENTS_FILE" ] || { echo "❌ BACKUP_AGE_RECIPIENTS_FILE no existe: $RECIPIENTS_FILE" >&2; exit 1; }; AGE_RECIP_ARGS+=(-R "$RECIPIENTS_FILE"); }
  else
    echo "❌ Cifrado de backups solicitado (BACKUP_AGE_RECIPIENT*) pero falta el binario 'age'." >&2
    echo "   Instálalo, define AGE_BIN=/ruta/age, o usa el 'tools/age' del paquete offline." >&2
    exit 1
  fi
fi

# ¿Postgres disponible? En el primer bootstrap aún no existe → nada que respaldar.
if ! $COMPOSE exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  echo "⏭  Postgres no disponible (¿bootstrap inicial?) — backup omitido (nada que respaldar)."
  exit 0
fi

# Dump a un .tmp y mv-atómico SOLO si TODO el pipe terminó OK: nunca dejar un dump
# parcial (o un .age truncado) con nombre "bueno". Las credenciales se expanden
# DENTRO del contenedor (sh -c). Con cifrado, el claro JAMÁS toca el disco: va por
# el pipe a age. `set -o pipefail` hace que un fallo de pg_dump O de age aborte.
TMP="$FILE.tmp"
if [ "$ENCRYPT" = true ]; then
  ok=true
  $COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    | "$AGE" "${AGE_RECIP_ARGS[@]}" -o "$TMP" || ok=false
  if [ "$ok" = true ]; then
    mv "$TMP" "$FILE"; echo "✅ Backup CIFRADO (age): $FILE ($(du -h "$FILE" | cut -f1))"
  else
    rm -f "$TMP"; echo "❌ pg_dump|age falló — backup NO creado." >&2; exit 1
  fi
else
  if $COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP"; then
    mv "$TMP" "$FILE"; echo "✅ Backup: $FILE ($(du -h "$FILE" | cut -f1))"
    echo "   ⚠ SIN CIFRAR. Para infra de terceros define BACKUP_AGE_RECIPIENT en el .env (ver docs/DEPLOYMENT.md)."
  else
    rm -f "$TMP"; echo "❌ pg_dump falló — backup NO creado." >&2; exit 1
  fi
fi

# Retención: borra dumps > RETENTION_DAYS días, pero SIEMPRE conserva los últimos
# RETENTION_MIN_KEEP (si solo se borrara por antigüedad, tras un mes sin deploys ni
# cron quedaríamos con CERO copias). `ls -1t` = más nuevos primero. Cubre .dump y
# .dump.age (un cambio de política de cifrado no debe descuadrar la retención).
deletable="$(ls -1t "$OUT"/watchlog_*.dump "$OUT"/watchlog_*.dump.age 2>/dev/null | tail -n +"$((RETENTION_MIN_KEEP + 1))" || true)"
if [ -n "$deletable" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ -n "$(find "$f" -mtime +"$RETENTION_DAYS" -print 2>/dev/null)" ]; then
      rm -f "$f" && echo "   🗑  rotado (> ${RETENTION_DAYS}d): $f"
    fi
  done <<< "$deletable"
fi
echo "   Retención: > ${RETENTION_DAYS} días, conservando mínimo ${RETENTION_MIN_KEEP} copias."
