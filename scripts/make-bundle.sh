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
# (sin ellas, `up` en una planta sin internet fallaría al pullear). minio:latest se
# fija en H2 (deuda anotada); aquí se empaqueta la que esté resuelta.
INFRA_IMAGES="postgres:16-alpine redis:7-alpine minio/minio:latest caddy:2-alpine"

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

# ── 2) Imágenes de infra: pull (opcional) → save (nombre original) ───────────
for base in $INFRA_IMAGES; do
  if [ "$PULL" = "true" ]; then
    echo "  · pull $base"; docker pull "$base" >/dev/null
  fi
  fname="infra-$(echo "$base" | tr '/:' '--').tar"
  echo "  · save  → images/$fname"
  docker save "$base" -o "$STAGE/images/$fname"
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
images:     lyra-watchlog-{api,web,migrate}:$TAG (nombre neutro) + infra ($INFRA_IMAGES)
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
