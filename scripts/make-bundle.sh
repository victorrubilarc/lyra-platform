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
ONPREM="$REPO_ROOT/deploy/onprem"

# Herramienta `age` (cifrado de backups, E3) embarcada para la planta AIR-GAPPED:
# el host de terreno cifra sus respaldos con la clave PÚBLICA del cliente y no
# puede depender de internet para instalar age. Se descarga en tiempo de bundle
# (el SOCIO tiene internet) y se PINEA por sha256 (cadena de suministro auditable).
AGE_VERSION="${AGE_VERSION:-v1.3.1}"
AGE_LINUX_SHA256="bdc69c09cbdd6cf8b1f333d372a1f58247b3a33146406333e30c0f26e8f51377"
AGE_URL="https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-amd64.tar.gz"

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
minio/minio:RELEASE.2025-09-07T16-13-09Z|sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2
caddy:2-alpine|sha256:98eb57d882ccd5213d1688764db10c1ca2c58a1ca3a6717a3411ad798f7a423a
"

BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STAGE="$OUTPUT_DIR/lyra-watchlog-$TAG"
TARBALL="$OUTPUT_DIR/lyra-watchlog-$TAG.tar.gz"

echo "▶ make-bundle $TAG  (src=$SRC_PREFIX  pull=$PULL)"
rm -rf "$STAGE"
mkdir -p "$STAGE/images" "$STAGE/compose" "$STAGE/edge" "$STAGE/SECURITY" "$STAGE/onprem" "$STAGE/tools"

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
# Los .yml van bajo compose/ (se referencian con -f compose/…). El directorio
# edge/ va en la RAÍZ del paquete (NO bajo compose/): las rutas de bind del
# compose son `./edge/Caddyfile.edge` y `./certs`, relativas al PROJECT-DIRECTORY
# que install.sh fija en la raíz del paquete (igual que ./license y ./certs). Si
# edge/ quedara bajo compose/, el modo (b) montaría una ruta inexistente y Caddy
# no cargaría su config (bug corregido 2026-07-08).
cp "$STANDALONE/docker-compose.yml"        "$STAGE/compose/"
cp "$STANDALONE/mode-a.behind-proxy.yml"   "$STAGE/compose/"
cp "$STANDALONE/mode-b.own-edge.yml"       "$STAGE/compose/"
cp "$STANDALONE/edge/Caddyfile.edge"                "$STAGE/edge/"
cp "$STANDALONE/edge/nginx-watchlog.conf.example"   "$STAGE/edge/"

# ── 4) Instalador + plantilla de entorno + guía ─────────────────────────────
cp "$STANDALONE/install.sh"                "$STAGE/install.sh"
chmod +x "$STAGE/install.sh"
cp "$STANDALONE/.env.standalone.example"   "$STAGE/.env.example"
if [ -f "$REPO_ROOT/docs/INSTALL_OFFLINE.md" ]; then
  cp "$REPO_ROOT/docs/INSTALL_OFFLINE.md"  "$STAGE/INSTALL_OFFLINE.md"
fi

# ── 4-bis) Respaldo/restauración CIFRADOS + binario age (E3) ─────────────────
# Scripts de backup/restore (detectan el compose standalone por sí solos) + el
# binario `age` pineado, para que la planta pueda cifrar sus respaldos con la
# clave PÚBLICA del cliente sin depender de internet ni de host tooling.
cp "$ONPREM/backup.sh"  "$STAGE/onprem/backup.sh"
cp "$ONPREM/restore.sh" "$STAGE/onprem/restore.sh"
chmod +x "$STAGE/onprem/backup.sh" "$STAGE/onprem/restore.sh"
echo "  · age $AGE_VERSION (pin sha256) → tools/age"
AGE_TGZ="$OUTPUT_DIR/age-${AGE_VERSION}-linux-amd64.tar.gz"
curl -fsSL -o "$AGE_TGZ" "$AGE_URL"
echo "${AGE_LINUX_SHA256}  ${AGE_TGZ}" | sha256sum -c - \
  || { echo "❌ sha256 de age NO coincide — descarga corrupta/alterada. Aborto." >&2; exit 1; }
tar -xzf "$AGE_TGZ" -C "$OUTPUT_DIR"           # extrae age/age + age/age-keygen
cp "$OUTPUT_DIR/age/age" "$OUTPUT_DIR/age/age-keygen" "$STAGE/tools/"
chmod +x "$STAGE/tools/age" "$STAGE/tools/age-keygen"
rm -rf "$OUTPUT_DIR/age" "$AGE_TGZ"

# ── 5) Reporte de vulnerabilidades (si se generó con scripts/scan-images.sh) ─
if [ -d "$REPO_ROOT/dist/trivy" ]; then
  cp -r "$REPO_ROOT/dist/trivy/." "$STAGE/SECURITY/" 2>/dev/null || true
fi

# ── 5-bis) Clave PÚBLICA de firma (E3 · cosign) ──────────────────────────────
# La pública (no-secreto) viaja en el paquete para que la planta pueda verificar
# la firma del SHA256SUMS OFFLINE. Se copia ANTES del SHA256SUMS (queda cubierta
# por él); la FIRMA se genera después (capa de autenticidad, fuera del SHA256SUMS).
COSIGN_PUB="$REPO_ROOT/scripts/license/cosign/cosign.pub"
if [ -f "$COSIGN_PUB" ]; then
  cp "$COSIGN_PUB" "$STAGE/cosign.pub"
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

# ── 6-bis) FIRMA cosign del SHA256SUMS (E3, verificable OFFLINE) ─────────────
# Como el SHA256SUMS sella TODO el contenido (imágenes + compose + instalador),
# firmarlo = firmar el paquete entero con AUTENTICIDAD, sin registro. Key-based
# (--tlog-upload=false) ⇒ la planta verifica con la pública sin internet. GUARDADA:
# sin cosign o sin COSIGN_KEY/COSIGN_KEY_FILE, se OMITE (deuda E3, no rompe). El
# bundle de firma NO entra al SHA256SUMS (es la capa que lo autentica). cosign v2.x.
if command -v cosign >/dev/null 2>&1 && { [ -n "${COSIGN_KEY:-}" ] || [ -n "${COSIGN_KEY_FILE:-}" ]; } && [ -f "$STAGE/cosign.pub" ]; then
  echo "  · firma cosign del SHA256SUMS"
  KEYFILE="${COSIGN_KEY_FILE:-}"
  CLEANUP_KEY=false
  if [ -z "$KEYFILE" ]; then KEYFILE="$OUTPUT_DIR/.cosign.key.tmp"; printf '%s' "$COSIGN_KEY" > "$KEYFILE"; CLEANUP_KEY=true; fi
  cosign sign-blob --yes --key "$KEYFILE" --tlog-upload=false \
    --bundle "$STAGE/SHA256SUMS.cosign.bundle" "$STAGE/SHA256SUMS"
  [ "$CLEANUP_KEY" = true ] && rm -f "$KEYFILE"
  echo "    ✅ SHA256SUMS.cosign.bundle (verificar: cosign verify-blob --key cosign.pub --bundle … --insecure-ignore-tlog=true SHA256SUMS)"
else
  echo "  · firma cosign OMITIDA (sin cosign/COSIGN_KEY/cosign.pub) — deuda E3, el paquete sigue con integridad SHA256."
fi

# ── 7) Empaquetar ───────────────────────────────────────────────────────────
echo "  · tar.gz → $TARBALL"
( cd "$OUTPUT_DIR" && tar -czf "lyra-watchlog-$TAG.tar.gz" "lyra-watchlog-$TAG" )

SIZE="$(du -h "$TARBALL" | cut -f1)"
echo "✅ paquete listo: $TARBALL ($SIZE)"
echo "   SHA256: $(sha256sum "$TARBALL" | cut -d' ' -f1)"
