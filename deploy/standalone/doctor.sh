#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — doctor: diagnóstico PASA/FALLA del host de la planta.
# Envoltorio delgado de `install.sh --check` (única fuente de verdad de los
# chequeos). No modifica nada; sale 0 si todo pasa, 1 si hay alguna FALLA.
#
#   ./doctor.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/install.sh" --check
