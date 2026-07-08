#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lyra WatchLog — make-bundle · genera el PAQUETE OFFLINE de instalación (E2).
#
#   scripts/make-bundle.sh v0.1.17
#   SRC_PREFIX=ghcr.io/victorrubilarc/ OUTPUT_DIR=dist scripts/make-bundle.sh v0.1.17
#
# Produce UN solo `lyra-watchlog-<tag>.tar.gz` autocontenido que el SOCIO de canal
# descarga UNA vez (con internet) y copia por USB a la planta AIR-GAPPED. Contiene:
#   · images/    → las 3 imágenes de la app (NOMBRE NEUTRO, sin owner GHCR) + las
#                  4 imágenes de infra (postgres/redis/minio/caddy) como .tar
#                  (docker save) ⇒ `docker load` sin internet, cero `pull`.
#   · compose/   → el stack standalone de H1 (base + modos a/b + borde) SIN cambios
#   · install.sh → instalador idempotente OFFLINE (deploy/standalone/install.sh)
#   · .env.example, INSTALL_OFFLINE.md, SECURITY/trivy-report.* (si existe)
#   · SHA256SUMS → hash de TODO lo anterior (el instalador lo verifica antes de load)
#
# CERO fuente TypeScript: las imágenes ya vienen con el bundle L5 sellado y el
# `src/` borrado (docker/Dockerfile.api runtime); este script NO agrega fuente.
# NO mete la clave privada de emisión (solo la pública va horneada en la imagen).
#
# En CI (release.yml) corre con las imágenes ya publicadas (pull por tag) y adjunta
# el .tar.gz al GitHub Release. En local corre igual sobre lo que haya en el daemon.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "uso: scripts/make-bundle.sh <tag>   (ej: v0.1.17)" >&2
  exit 2
fi

# De dónde SALEN las imágenes de la app para retaguearlas a nombre neutro.
SRC_PREFIX="${SRC_PREFIX:-ghcr.io/victorrubilarc/}"
OUTPUT_DIR="${OUTPUT_DIR:-dist}"
PULL="${PULL:-true}"                 # false en CI si ya se construyeron/pullearon
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STANDALONE="$REPO_ROOT/deploy/standalone"

APP_IMAGES="api web migrate"
# Imágenes de infra que el compose levanta en runtime → deben viajar en el paquete
# (sin ellas, `up` en una planta sin internet fallaría al pullear). PIN por DIGEST
# (H2): se PULLEA el digest exacto y se RETAGUEA al tag que el compose standalone
# espera antes de `docker save`. Así el tar del bundle es reproducible (digest fijo,
# sellado en SHA256SUMS) pero el compose referencia un TAG — `docker load` NO
# preserva RepoDigests, así que un `image: …@digest` en el compose forzaría un
# `pull` inexistente en la planta. minio salió de `latest` al RELEASE inmutable.
# Formato: "tag|digest". Mantener en paridad con deploy/standalone/docker-compose.yml.
INFRA_PINS="
postgres:16-alpine|sha256:7a396fd264a2067788b6551122b50f162bf6136312c7fc9d74381cb92c648382
redis:7-alpine|sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7
minio/minio:RELEASE.2025-09-07T16-13-09Z|sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f
caddy:2-alpine|sha256:98eb57d882ccd5213d1688764db10c1ca2c58a1ca3a6717a3411ad798f7a423a
"

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STAGE="$OUTPUT_DIR/lyra-watchlog-$TAG"
TARBALL="$OUTPUT_DIR/lyra-watchlog-$TAG.tar.gz"

echo "▶ make-bundle $TAG  (src=$SRC_PREFIX  pull=$PULL)"
rm -rf "$STAGE"
mkdir -p "$STAGE/images" "$STAGE/compose/edge" "$STAGE/SECURITY"

# ── 1) Imágenes de la app: pull (opcional) → retag NEUTRO → save ─────────────
for img in $APP_IMAGES; do
  src="${SRC_PREFIX}lyra-watchlog-${img}:${TAG}"
  neutral="lyra-watchlog-${img}:${TAG}"
  if [ "$PULL" = "true" ]; then
    echo "  · pull $src"; docker pull "$src" >/dev/null
  fi
  echo "  · retag → $neutral"; docker tag "$src" "$neutral"
  echo "  · save  → images/$(basename "$neutral" | tr ':' '-').tar"
  docker save "$neutral" -o "$STAGE/images/lyra-watchlog-${img}-${TAG}.tar"
done

# ── 2) Imágenes de infra: pull por DIGEST → retag al tag → save ──────────────
for pin in $INFRA_PINS; do
  [ -n "$pin" ] || continue
  tag="${pin%%|*}"; digest="${pin##*|}"
  repo="${tag%%:*}"                  # nombre sin tag (para el ref por digest)
  ref="${repo}@${digest}"
  if [ "$PULL" = "true" ]; then
    echo "  · pull $ref"; docker pull "$ref" >/dev/null
  fi
  echo "  · retag → $tag"; docker tag "$ref" "$tag"
  fname="infra-$(echo "$tag" | tr '/:' '--').tar"
  echo "  · save  → images/$fname"
  docker save "$tag" -o "$STAGE/images/$fname"
done

# ── 3) Compose standalone (H1) + borde, tal cual ────────────────────────────
cp "$STANDALONE/docker-compose.yml"        "$STAGE/compose/"
cp "$STANDALONE/mode-a.behind-proxy.yml"   "$STAGE/compose/"
cp "$STANDALONE/mode-b.own-edge.yml"       "$STAGE/compose/"
cp "$STANDALONE/edge/Caddyfile.edge"                "$STAGE/compose/edge/"
cp "$STANDALONE/edge/nginx-watchlog.conf.example"   "$STAGE/compose/edge/"

# ── 4) Instalador + plantilla de entorno + guía ─────────────────────────────
cp "$STANDALONE/install.sh"                "$STAGE/install.sh"
chmod +x "$STAGE/install.sh"
cp "$STANDALONE/.env.standalone.example"   "$STAGE/.env.example"
if [ -f "$REPO_ROOT/docs/INSTALL_OFFLINE.md" ]; then
  cp "$REPO_ROOT/docs/INSTALL_OFFLINE.md"  "$STAGE/INSTALL_OFFLINE.md"
fi

# ── 5) Reporte de vulnerabilidades (si se generó con scripts/scan-images.sh) ─
if [ -d "$REPO_ROOT/dist/trivy" ]; then
  cp -r "$REPO_ROOT/dist/trivy/." "$STAGE/SECURITY/" 2>/dev/null || true
fi

# ── 6) VERSION + SHA256SUMS de TODO ─────────────────────────────────────────
cat > "$STAGE/VERSION" <<EOF
Lyra WatchLog — paquete de instalación offline
version:    $TAG
built (UTC): $BUILD_DATE
images:     lyra-watchlog-{api,web,migrate}:$TAG (nombre neutro) + infra pineada por digest ($(echo $INFRA_PINS | tr '\n' ' '))
verify:     cd al directorio y  sha256sum -c SHA256SUMS
EOF

echo "  · SHA256SUMS"
( cd "$STAGE" && find . -type f ! -name SHA256SUMS | sort | xargs sha256sum > SHA256SUMS )

# ── 7) Empaquetar ───────────────────────────────────────────────────────────
echo "  · tar.gz → $TARBALL"
( cd "$OUTPUT_DIR" && tar -czf "lyra-watchlog-$TAG.tar.gz" "lyra-watchlog-$TAG" )

SIZE="$(du -h "$TARBALL" | cut -f1)"
echo "✅ paquete listo: $TARBALL ($SIZE)"
echo "   SHA256: $(sha256sum "$TARBALL" | cut -d' ' -f1)"
