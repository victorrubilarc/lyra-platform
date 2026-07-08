#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — restauración de un backup de Postgres (descifra age si aplica, E3).
#
#   ./onprem/restore.sh [--test|--live] [--identity RUTA] [DUMP]
#
#   · --test  (DEFECTO, seguro): restaura el dump COMPLETO a una BD DESCARTABLE
#             (watchlog_restore_test), cuenta tablas y la BORRA. Prueba el ciclo
#             sin tocar los datos vivos. Es la verificación que exige DEPLOYMENT.
#   · --live  (DESTRUCTIVO): restaura sobre la BD viva (--clean --if-exists). Pide
#             confirmación EXPLÍCITA escrita. Úsalo solo en recuperación real.
#
# DUMP: ruta al archivo. Si termina en `.age`, se descifra con la identidad PRIVADA
# del cliente (custodiada FUERA del host, modelo L3):
#   BACKUP_AGE_IDENTITY=/ruta/identity.txt  ó  --identity /ruta/identity.txt
# Sin DUMP explícito toma el backup más reciente de ./backups (o ../backups).
#
# Reutiliza la MISMA autodetección de stack que backup.sh (demo/prod ↔ standalone).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="test"
IDENTITY="${BACKUP_AGE_IDENTITY:-}"
DUMP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --test) MODE="test";;
    --live) MODE="live";;
    --identity) IDENTITY="${2:-}"; shift;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    -*) echo "opción desconocida: $1" >&2; exit 2;;
    *) DUMP="$1";;
  esac
  shift
done

# ── Detección del stack (idéntica a backup.sh) ───────────────────────────────
if [ -z "${COMPOSE:-}" ]; then
  if [ -f docker-compose.prod.yml ]; then
    COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
  elif [ -f compose/docker-compose.yml ]; then
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

# ── Elegir dump (el más nuevo si no se pasó) ─────────────────────────────────
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t backups/watchlog_*.dump backups/watchlog_*.dump.age 2>/dev/null | head -1 || true)"
  [ -n "$DUMP" ] || { echo "❌ No hay backups en ./backups y no pasaste un DUMP." >&2; exit 1; }
  echo "  · dump (más reciente): $DUMP"
fi
[ -f "$DUMP" ] || { echo "❌ No existe el dump: $DUMP" >&2; exit 1; }

# ── ¿Cifrado? preparar el descifrado con age ─────────────────────────────────
find_age() {
  if [ -n "${AGE_BIN:-}" ] && [ -x "${AGE_BIN}" ]; then echo "$AGE_BIN"; return 0; fi
  if command -v age >/dev/null 2>&1; then command -v age; return 0; fi
  for c in ./tools/age ../tools/age "$(dirname "$0")/../tools/age"; do
    [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}
# `src_stream` escribe el dump CUSTOM (descifrado si aplica) a stdout, para
# canalizarlo a pg_restore. Con age, el claro nunca toca el disco del host.
case "$DUMP" in
  *.age)
    AGE="$(find_age)" || { echo "❌ Dump cifrado pero falta 'age' (o AGE_BIN / tools/age)." >&2; exit 1; }
    [ -n "$IDENTITY" ] || { echo "❌ Dump cifrado: falta la identidad privada. Usa --identity RUTA o BACKUP_AGE_IDENTITY." >&2; exit 1; }
    [ -f "$IDENTITY" ] || { echo "❌ La identidad no existe: $IDENTITY" >&2; exit 1; }
    src_stream() { "$AGE" -d -i "$IDENTITY" "$DUMP"; }
    echo "  · descifrando con identidad age: $IDENTITY";;
  *)
    src_stream() { cat "$DUMP"; };;
esac

pg() { $COMPOSE exec -T postgres sh -c "$1"; }

if [ "$MODE" = "test" ]; then
  # ── Verificación segura: restaura COMPLETO a una BD descartable y la borra ──
  TESTDB="watchlog_restore_test"
  echo "▶ Verificación (BD descartable '$TESTDB'; los datos vivos NO se tocan)…"
  pg 'dropdb -U "$POSTGRES_USER" --if-exists '"$TESTDB"'' >/dev/null 2>&1 || true
  pg 'createdb -U "$POSTGRES_USER" '"$TESTDB"''
  # --no-owner/--no-acl: la BD de prueba no tiene los roles del origen. Los errores
  # benignos de objetos ya presentes no deben abortar (|| true), pero el pipe de
  # descifrado sí (set -o pipefail): un age que falla ⇒ restauración vacía detectada.
  src_stream | pg 'pg_restore -U "$POSTGRES_USER" -d '"$TESTDB"' --no-owner --no-acl' || true
  tables="$(pg 'psql -U "$POSTGRES_USER" -d '"$TESTDB"' -tAc "select count(*) from information_schema.tables where table_schema='"'"'public'"'"'"' | tr -d "[:space:]")"
  pg 'dropdb -U "$POSTGRES_USER" --if-exists '"$TESTDB"'' >/dev/null 2>&1 || true
  if [ "${tables:-0}" -ge 1 ] 2>/dev/null; then
    echo "✅ Restauración VERIFICADA: $tables tablas en public. Backup íntegro y restaurable."
  else
    echo "❌ La restauración de prueba quedó vacía (0 tablas) — backup corrupto, mal cifrado o identidad equivocada." >&2
    exit 1
  fi
else
  # ── Restauración REAL sobre la BD viva (DESTRUCTIVO) ────────────────────────
  echo "‼  RESTAURACIÓN EN VIVO: esto REEMPLAZA los datos actuales con el backup."
  printf "   Escribe exactamente  RESTAURAR  para continuar: "
  read -r ans
  [ "$ans" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
  src_stream | pg 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl'
  echo "✅ Restauración en vivo completada. Reinicia el stack si corresponde."
fi
