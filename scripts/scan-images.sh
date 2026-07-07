#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — escaneo de vulnerabilidades de las imágenes con Trivy (E2).
#
#   scripts/scan-images.sh v0.1.17
#   SRC_PREFIX=ghcr.io/victorrubilarc/ scripts/scan-images.sh v0.1.17
#
# Corre Trivy (imagen oficial aquasec/trivy vía Docker; no requiere instalarlo)
# sobre las 3 imágenes de la app + las 4 de infra y deja el reporte en dist/trivy/.
# NO es un gate: mide y reporta (el gate en CI es H2/E3). El reporte se adjunta al
# paquete offline (make-bundle copia dist/trivy/ → SECURITY/).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:-v0.1.17}"
SRC_PREFIX="${SRC_PREFIX:-ghcr.io/victorrubilarc/}"
OUT="${OUT:-dist/trivy}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p "$OUT"

IMAGES="
${SRC_PREFIX}lyra-watchlog-api:${TAG}
${SRC_PREFIX}lyra-watchlog-web:${TAG}
${SRC_PREFIX}lyra-watchlog-migrate:${TAG}
postgres:16-alpine
redis:7-alpine
minio/minio:latest
caddy:2-alpine
"

# Trivy corre en contenedor: monta el socket de Docker (escanea imágenes locales)
# + un volumen de caché para la DB de vulnerabilidades. En Git Bash: MSYS_NO_PATHCONV
# evita que se reescriban las rutas del contenedor.
trivy() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v //var/run/docker.sock:/var/run/docker.sock \
    -v trivy-cache:/root/.cache/ \
    -v "$(pwd)/$OUT":/out \
    aquasec/trivy:latest "$@"
}

SUMMARY="$OUT/SUMMARY.md"
{
  echo "# Reporte Trivy — Lyra WatchLog $TAG"
  echo
  echo "Escaneo de vulnerabilidades (SO + librerías) de las imágenes del paquete."
  echo "Severidades CRITICAL/HIGH/MEDIUM. Generado con \`aquasec/trivy\`."
  echo
  echo "| Imagen | CRÍTICO | ALTO | MEDIO |"
  echo "|---|---:|---:|---:|"
} > "$SUMMARY"

for img in $IMAGES; do
  [ -n "$img" ] || continue
  safe="$(echo "$img" | tr '/:' '--')"
  echo "▶ Trivy: $img"
  # Tabla legible para adjuntar.
  trivy image --scanners vuln --severity CRITICAL,HIGH,MEDIUM --no-progress \
    --format table --output "/out/trivy-${safe}.txt" "$img" || true
  # JSON para conteo/auditoría.
  trivy image --scanners vuln --severity CRITICAL,HIGH,MEDIUM --no-progress \
    --format json --output "/out/trivy-${safe}.json" "$img" || true
  # Conteo por severidad desde el JSON. El `|| true` evita que grep (exit 1 cuando
  # hay CERO coincidencias) mate el script bajo `set -o pipefail`.
  count() { { grep -o "\"Severity\": *\"$2\"" "$1" 2>/dev/null || true; } | wc -l | tr -d ' '; }
  crit=$(count "$OUT/trivy-${safe}.json" CRITICAL)
  high=$(count "$OUT/trivy-${safe}.json" HIGH)
  med=$(count  "$OUT/trivy-${safe}.json" MEDIUM)
  echo "| \`$img\` | $crit | $high | $med |" >> "$SUMMARY"
done

echo >> "$SUMMARY"
echo "_Regenerar: \`scripts/scan-images.sh $TAG\`. Gate en CI = H2/E3 (aún no bloquea el release)._" >> "$SUMMARY"
echo "✅ Reporte en $OUT/ (ver SUMMARY.md)"
