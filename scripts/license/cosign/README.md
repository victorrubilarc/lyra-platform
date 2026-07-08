# Firma de imágenes con cosign (E3 · cadena de suministro)

Cierra el objetivo verificable de `docs/SECURITY.md §9.5(a)`: que un cliente/auditor
compruebe, **sin confiar a ciegas**, que la imagen/paquete que corre **vino de ITESICWS
y no fue alterado**. Modelo idéntico a la custodia de la clave de emisión de licencias
(Licenciamiento L3): **privada fuera del repo, pública distribuida**.

## Decisiones (ver `docs/DECISIONS.md` 2026-07-08 E3)
- **Key-based, NO keyless.** Keyless (Fulcio/Rekor/OIDC) exige internet ⇒ rompe el
  air-gap. Con par de llaves propio se firma con `--tlog-upload=false` y se verifica
  con `--insecure-ignore-tlog=true`, **100 % offline**.
- **cosign v2.4.x** (pin). cosign v3 cambió la API y `--tlog-upload=false` dejó de
  funcionar sin un signing-config sin Rekor; v2 es lo estable para air-gap.
- **Dos superficies de firma:**
  1. **Imágenes en GHCR por DIGEST** (camino demo/prod con registro): la firma queda
     como artefacto OCI junto a la imagen; el host la verifica antes de correrla.
  2. **`sign-blob` sobre el `SHA256SUMS` del paquete offline** (camino air-gap): como
     el `SHA256SUMS` ya sella cada `.tar` de imagen + compose + instalador, firmarlo
     equivale a firmar el paquete ENTERO con autenticidad, **sin registro**. La firma
     (`SHA256SUMS.cosign.bundle`) + la pública (`cosign.pub`) viajan DENTRO del bundle.

## Custodia (una sola vez — ceremonia del dueño)
> ⚠ La privada de firma es una **raíz de confianza**: su fuga permite falsificar
> imágenes "de ITESICWS". Trátala como la privada de emisión de licencias.

```bash
# 1) Generar el par (passphrase de ALTA ENTROPÍA → gestor de contraseñas del dueño).
mkdir -p ~/.lyra-license/cosign && cd ~/.lyra-license/cosign
COSIGN_PASSWORD='<passphrase-fuerte>' cosign generate-key-pair
#   → cosign.key (PRIVADA, cifrada con la passphrase)  ·  cosign.pub (PÚBLICA)

# 2) Publicar SOLO la pública en el repo (no es secreto; sirve para verificar).
cp cosign.pub <repo>/scripts/license/cosign/cosign.pub
git add scripts/license/cosign/cosign.pub && git commit -m "chore(cosign): clave pública de firma de PROD"

# 3) Cargar la PRIVADA + passphrase como GitHub Secrets del repo (para el pipeline):
gh secret set COSIGN_PRIVATE_KEY < cosign.key
gh secret set COSIGN_PASSWORD   --body '<passphrase-fuerte>'
```

- **`cosign.key` NUNCA** entra al repo/imagen/`.env` (el `.gitignore` lo bloquea como red).
- **`cosign.pub` SÍ** se commitea aquí y se embarca en cada paquete offline.
- Sin los secrets, el pipeline **omite la firma** (deuda registrada, igual que L1 antes
  de L3): las imágenes salen sin firmar hasta completar la ceremonia. Nada se rompe.

## Verificación (lo que hace el cliente/auditor)
- **Air-gap (host de planta):** `install.sh` verifica `cosign verify-blob` sobre el
  `SHA256SUMS` con la `cosign.pub` del paquete **antes** del `docker load` (best-effort:
  si el host no trae el binario cosign, avisa y documenta la verificación en workstation).
- **Auditor (su estación, con internet/tooling):** verifica la firma del paquete o de
  las imágenes por digest en GHCR con la `cosign.pub` publicada. Procedimiento en
  `docs/DEPLOYMENT.md §Verificación de firma`.

```bash
# Verificar el paquete offline (sin internet):
cosign verify-blob --key cosign.pub --bundle SHA256SUMS.cosign.bundle \
  --insecure-ignore-tlog=true SHA256SUMS
# Verificar una imagen publicada por digest (con acceso al registro):
cosign verify --key cosign.pub --insecure-ignore-tlog=true \
  ghcr.io/<owner>/lyra-watchlog-api@sha256:<digest>
```
