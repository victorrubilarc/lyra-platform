#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — escaneo de vulnerabilidades de las imágenes con Trivy (E2 + H2).
#
#   scripts/scan-images.sh v0.1.19                    # reporte (no bloquea)
#   GATE=critical scripts/scan-images.sh v0.1.19      # GATE: sale 1 si hay CRÍTICO
#   SRC_PREFIX=ghcr.io/victorrubilarc/ scripts/scan-images.sh v0.1.19
#
# Corre Trivy (imagen oficial aquasec/trivy vía Docker; no requiere instalarlo)
# sobre las 3 imágenes de la app + las 4 de infra y deja el reporte en dist/trivy/.
#
# Dos modos:
#   · REPORTE (por defecto): mide y escribe SUMMARY.md + tablas/JSON. Se adjunta al
#     paquete offline (make-bundle copia dist/trivy/ → SECURITY/). Nunca falla.
#   · GATE=critical (H2 2026-07-07): tras el reporte, re-escanea cada imagen con
#     `--exit-code 1 --severity CRITICAL --ignorefile .trivyignore`. Si queda algún
#     CRÍTICO NO exceptuado, sale con código 1 (bloquea el release). Las excepciones
#     (CVE de imagen base sin fix / MinIO interno no alcanzable) viven justificadas
#     en .trivyignore. release.yml lo invoca en modo gate antes de bundle/deploy.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:-v0.1.19}"
# Single-dash: un SRC_PREFIX EXPLÍCITAMENTE vacío (imágenes de nombre neutro,
# p.ej. tras `docker load` del bundle o build local) se respeta; solo si NO se
# define cae al prefijo GHCR. Paridad con `${WL_IMAGE_PREFIX-}` del compose.
SRC_PREFIX="${SRC_PREFIX-ghcr.io/victorrubilarc/}"
OUT="${OUT:-dist/trivy}"
GATE="${GATE:-}"                     # "critical" ⇒ gatea; vacío ⇒ solo reporta
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p "$OUT"

# Imágenes de infra pineadas por DIGEST (H2): se escanea EXACTAMENTE lo que el
# compose levanta (deploy/standalone/docker-compose.yml), no un tag mutable.
PG_IMG="postgres:16-alpine@sha256:7a396fd264a2067788b6551122b50f162bf6136312c7fc9d74381cb92c648382"
REDIS_IMG="redis:7-alpine@sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7"
MINIO_IMG="minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f"
CADDY_IMG="caddy:2-alpine@sha256:98eb57d882ccd5213d1688764db10c1ca2c58a1ca3a6717a3411ad798f7a423a"

IMAGES="
${SRC_PREFIX}lyra-watchlog-api:${TAG}
${SRC_PREFIX}lyra-watchlog-web:${TAG}
${SRC_PREFIX}lyra-watchlog-migrate:${TAG}
${PG_IMG}
${REDIS_IMG}
${MINIO_IMG}
${CADDY_IMG}
"

# Trivy corre en contenedor: monta el socket de Docker (escanea imágenes locales)
# + un volumen de caché para la DB de vulnerabilidades + el .trivyignore del repo
# (excepciones justificadas para el gate). En Git Bash: MSYS_NO_PATHCONV evita que
# se reescriban las rutas del contenedor.
IGNORE_MOUNT=()
[ -f "$REPO_ROOT/.trivyignore" ] && IGNORE_MOUNT=(-v "$REPO_ROOT/.trivyignore:/.trivyignore:ro")
trivy() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v //var/run/docker.sock:/var/run/docker.sock \
    -v trivy-cache:/root/.cache/ \
    -v "$(pwd)/$OUT":/out \
    "${IGNORE_MOUNT[@]}" \
    aquasec/trivy:latest "$@"
}

# SBOM CycloneDX por imagen (E3): inventario de dependencias entregable al AUDITOR
# del cliente. Reusa Trivy (ya montado), formato estándar CycloneDX JSON. Se generan
# en dist/trivy/sbom/ y viajan al paquete offline (make-bundle → SECURITY/sbom/) y al
# GitHub Release. SBOM=false los omite (p.ej. un gate rápido que solo mide criticales).
SBOM="${SBOM:-true}"
SBOM_DIR="$OUT/sbom"
[ "$SBOM" = true ] && mkdir -p "$SBOM_DIR"

SUMMARY="$OUT/SUMMARY.md"
{
  echo "# Reporte Trivy — Lyra WatchLog $TAG"
  echo
  echo "Escaneo de vulnerabilidades (SO + librerías) de las imágenes del paquete."
  echo "Severidades CRITICAL/HIGH/MEDIUM. Generado con \`aquasec/trivy\`."
  [ "$SBOM" = true ] && echo "SBOM CycloneDX por imagen en \`sbom/\` (inventario para auditoría)."
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
  # SBOM CycloneDX (inventario COMPLETO de componentes, no solo lo vulnerable).
  if [ "$SBOM" = true ]; then
    trivy image --format cyclonedx --no-progress \
      --output "/out/sbom/${safe}.cdx.json" "$img" || true
  fi
  # Conteo por severidad desde el JSON. El `|| true` evita que grep (exit 1 cuando
  # hay CERO coincidencias) mate el script bajo `set -o pipefail`.
  count() { { grep -o "\"Severity\": *\"$2\"" "$1" 2>/dev/null || true; } | wc -l | tr -d ' '; }
  crit=$(count "$OUT/trivy-${safe}.json" CRITICAL)
  high=$(count "$OUT/trivy-${safe}.json" HIGH)
  med=$(count  "$OUT/trivy-${safe}.json" MEDIUM)
  echo "| \`$img\` | $crit | $high | $med |" >> "$SUMMARY"
done

echo >> "$SUMMARY"
if [ "$GATE" = "critical" ]; then
  echo "_Regenerar: \`scripts/scan-images.sh $TAG\`. **GATE activo** (CRÍTICO bloquea el release; excepciones en \`.trivyignore\`)._" >> "$SUMMARY"
else
  echo "_Regenerar: \`scripts/scan-images.sh $TAG\`. Gate CRÍTICO: \`GATE=critical scripts/scan-images.sh $TAG\` (lo corre release.yml)._" >> "$SUMMARY"
fi
echo "✅ Reporte en $OUT/ (ver SUMMARY.md)"

# ── GATE (H2): falla si queda algún CRÍTICO NO exceptuado ────────────────────
# Se corre DESPUÉS del reporte para que, aun cuando bloquee, quede la evidencia.
# `--ignorefile /.trivyignore` (montado arriba) aplica las excepciones justificadas.
if [ "$GATE" = "critical" ]; then
  echo "▶ GATE CRÍTICO (excepciones: .trivyignore)"
  failed=""
  for img in $IMAGES; do
    [ -n "$img" ] || continue
    echo "  · gate $img"
    if ! trivy image --scanners vuln --severity CRITICAL --no-progress \
           --ignorefile /.trivyignore --exit-code 1 --quiet "$img"; then
      failed="$failed $img"
    fi
  done
  if [ -n "$failed" ]; then
    echo "❌ GATE FALLÓ — CRÍTICO(s) sin excepción en:$failed" >&2
    echo "   Bumpéa la base/pin que lo cierra, o agrega el CVE a .trivyignore con" >&2
    echo "   su justificación (por qué no es explotable en esta arquitectura)." >&2
    exit 1
  fi
  echo "✅ GATE OK — sin CRÍTICOS fuera de .trivyignore."
fi
