# Lyra WatchLog — Instalación OFFLINE (planta air-gapped)

Guía para el **socio de canal** y el **equipo de la planta**. Describe cómo
instalar Lyra WatchLog desde el **paquete offline** (un único `.tar.gz`) en un
host **sin internet saliente**, sin `git clone` y **sin exponer código fuente**.

> El paquete lo genera ITESICWS con `scripts/make-bundle.sh` y lo adjunta al
> GitHub Release del tag. El socio lo descarga UNA vez (con internet), lo copia
> por USB a la planta y corre `install.sh`. La planta nunca contacta a GHCR.

---

## 1. Qué contiene el paquete

`lyra-watchlog-<versión>.tar.gz` →

| Ruta | Qué es |
|---|---|
| `images/` | Las imágenes de la app (`lyra-watchlog-{api,web,migrate}`, **nombre neutro**) + infra (`postgres`, `redis`, `minio`, `caddy`) como `.tar` (`docker save`). |
| `compose/` | El stack standalone (base sin puertos + modos de borde a/b + config del borde). |
| `install.sh` | Instalador **idempotente offline**. |
| `.env.example` | Plantilla de configuración (los secretos los genera el instalador). |
| `INSTALL_OFFLINE.md` | Esta guía. |
| `SECURITY/` | Reporte de vulnerabilidades (Trivy) + **`sbom/`** (inventario CycloneDX por imagen, para tu auditor). |
| `onprem/` | `backup.sh` + `restore.sh` (respaldo/restauración, con **cifrado age** opcional). |
| `tools/` | `age` + `age-keygen` (cifrado de respaldos, estáticos; sin dependencia de red). |
| `SHA256SUMS` | Hash de **todo** el contenido (el instalador lo verifica). |
| `cosign.pub` + `SHA256SUMS.cosign.bundle` | Clave pública + **firma cosign** del manifiesto (autenticidad; presentes si la versión viene firmada). |
| `VERSION` | Versión y fecha de build. |

**Sin código fuente:** las imágenes vienen con el bundle sellado (anti-tamper L5)
y el `src/` TypeScript borrado. El paquete **no** incluye el repositorio.

---

## 2. Requisitos del host (planta)

- **SO:** Linux de servidor (Ubuntu 22.04+/RHEL 8+/Debian 12+/SLES — cualquiera con `bash`).
- **Docker Engine ≥ 20.10** con el plugin **`docker compose` v2** (`docker compose version`).
- **`openssl`** y **`sha256sum`** (coreutils) disponibles.
- **RAM:** 4 GB mínimo (8 GB recomendado). **Disco:** ~10 GB libres.
- **Reloj** en hora (NTP interno) — importante para TLS y auditoría.
- Puertos según el **modo de borde** (ver §5 y la matriz en `docs/DEPLOYMENT.md`).

El host puede estar **totalmente air-gapped**: la instalación no necesita internet.

---

## 3. Obtener y verificar el paquete (socio, con internet)

1. Descarga `lyra-watchlog-<versión>.tar.gz` desde el GitHub Release del tag.
2. **Verifica la descarga** (el Release publica el SHA256 del `.tar.gz`):
   ```bash
   sha256sum lyra-watchlog-<versión>.tar.gz     # compara con el valor del Release
   ```
3. Cópialo a un medio extraíble (USB) para llevarlo a la planta.

---

## 4. Copiar e instalar en la planta (offline)

```bash
tar -xzf lyra-watchlog-<versión>.tar.gz
cd lyra-watchlog-<versión>
./install.sh
```

La **primera** ejecución:
- verifica `SHA256SUMS` (aborta si algo fue alterado),
- carga las imágenes (`docker load`, sin internet),
- crea `.env` con **secretos generados por openssl** (`chmod 600`),
- y **se detiene** pidiéndote completar lo específico del sitio en `.env`:
  - `APP_PUBLIC_URL=https://<tu-dominio-interno>`
  - `EDGE_MODE=a` (detrás de tu proxy) **o** `b` (borde propio con certificado).

Edita `.env`, y **vuelve a ejecutar** `./install.sh`. Esta vez levanta el stack y
espera el healthcheck. Es **idempotente**: puedes reejecutarlo sin romper nada
(nunca rota los secretos ya generados).

> El instalador **no** crea usuarios ni imprime secretos. El primer administrador
> se crea en el asistente web `/setup` (§7).

---

## 5. Elegir el modo de borde

El compose base **no publica ningún puerto**; el borde termina el TLS. Elige
según lo que la planta tenga (detalle y matriz de puertos en `docs/DEPLOYMENT.md`
y `deploy/standalone/README.md`):

- **`EDGE_MODE=a` — detrás del proxy del cliente** (preferido si hay F5/NetScaler/
  NGINX/IIS). La app queda en `127.0.0.1:${EDGE_LOCAL_PORT:-8080}` (loopback); el
  appliance del cliente termina TLS y reenvía. Debe mandar `X-Forwarded-For` y no
  bufferizar SSE.
- **`EDGE_MODE=b` — borde propio con certificado corporativo.** Coloca
  `certs/cert.pem` (cadena completa) y `certs/key.pem` (emitidos por la CA
  corporativa; **sin ACME**) antes de reejecutar. Queda `443/tcp` LISTEN. Ajusta
  el dominio en `compose/edge/Caddyfile.edge`.

---

## 6. Ceremonia de licencia (air-gapped)

Al primer arranque la app deja una **solicitud** de licencia en
`./license/solicitud.lreq` (ligada a la huella del host). Procedimiento:

1. Copia `./license/solicitud.lreq` a un medio y envíala a tu proveedor.
2. Recibes `license.lic` firmado. Cópialo a `./license/license.lic`
   **o** impórtalo desde el asistente `/setup`.
3. La app verifica firma + linaje + huella **antes** de activar. La licencia
   **nunca** secuestra datos: el peor estado es *solo lectura + exportación*.

Detalle completo en `docs/LICENSING.md`.

---

## 7. Primer arranque (`/setup`)

1. Abre `https://<tu-dominio>/setup`.
2. Ingresa el **token de un solo uso** que quedó en `./license/setup-token`.
3. El asistente crea el **administrador**, aplica identidad/tema y (opcional)
   importa la licencia. Al terminar, el token y el archivo se invalidan.

---

## 8. Verificación

- `https://<tu-dominio>` responde y permite iniciar sesión con el admin creado.
- Salud interna: `docker compose ... ps` muestra `api` como `healthy`.
- Para un escaneo de red del host: **solo** el puerto del borde elegido está
  LISTEN; Postgres/Redis/MinIO/API **no existen** como socket del host.

---

## 9. Actualización offline

1. Lleva el **nuevo** paquete a la planta y desempácalo.
2. **Respalda la BD** antes de migrar (red de seguridad — la migración es
   forward-only):
   ```bash
   docker compose --project-directory <dir-actual> --env-file <dir-actual>/.env \
     -f compose/docker-compose.yml exec -T postgres \
     sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup_$(date +%Y%m%d).dump
   ```
3. Copia tu `.env` (y `license/`, `certs/`) al directorio del paquete nuevo y
   corre `./install.sh`. El init `migrate` aplica las migraciones nuevas
   (idempotentes) y el seed de catálogo (permisos nuevos de la versión).

---

## 10. Respaldo y restauración (con cifrado age)

**Respaldos CIFRADOS (recomendado en producción).** Tus respaldos contienen TODA la
base de datos. Cífralos con **age asimétrico**: el servidor solo tiene la clave PÚBLICA;
descifrar exige la identidad PRIVADA que **tú custodias fuera del host**.

```bash
# Ceremonia (una sola vez):
./tools/age-keygen -o backup-identity.txt      # identidad PRIVADA + destinatario público
grep 'public key' backup-identity.txt          # copia el  age1...  →  BACKUP_AGE_RECIPIENT del .env
#  ⚠ GUARDA backup-identity.txt fuera del host (gestor/USB). SIN ella, tus respaldos
#     son IRRECUPERABLES. Bórrala del host tras custodiarla.

# Respaldar (programar en cron del host):
bash onprem/backup.sh                           # → backups/watchlog_*.dump.age (cifrado)

# Restaurar — VERIFICACIÓN SEGURA (no toca los datos vivos):
BACKUP_AGE_IDENTITY=/ruta/backup-identity.txt bash onprem/restore.sh --test backups/watchlog_*.dump.age
# Restauración REAL sobre la BD viva (destructiva; confirma con 'RESTAURAR'):
# BACKUP_AGE_IDENTITY=/ruta/backup-identity.txt bash onprem/restore.sh --live backups/watchlog_*.dump.age
```

- Sin `BACKUP_AGE_RECIPIENT`, `backup.sh` genera el dump **en claro** y avisa (válido en
  laboratorio; **no** en producción con datos reales). Guarda también `miniodata`
  (evidencias) si tu política lo exige.
- El **branding** (logo) y la configuración viven en Postgres → un restore reconstituye
  la identidad de la instalación.
- **Cifrado at-rest del host** (LUKS/dm-crypt para los volúmenes) es del host; ver la
  guía de hardening en `docs/DEPLOYMENT.md`.

---

## 11. Seguridad del paquete

- **Integridad:** `SHA256SUMS` cubre todo el contenido; `install.sh` lo verifica
  antes de cargar imágenes. Verifica el `.tar.gz` contra el hash del Release.
- **Sin fuga de fuente:** las imágenes no contienen TypeScript (bundle sellado L5,
  `src/` borrado). El paquete no trae el repositorio.
- **Vulnerabilidades conocidas:** el reporte Trivy de las imágenes va en
  `SECURITY/` (regenerable con `scripts/scan-images.sh`). El **SBOM CycloneDX**
  por imagen (`SECURITY/sbom/`) es el inventario para tu auditor.
- **Firma criptográfica del paquete (cosign — E3):** si el paquete trae `cosign.pub`
  y `SHA256SUMS.cosign.bundle`, `install.sh` verifica la **autenticidad** (que vino de
  ITESICWS y no fue alterado) antes de cargar las imágenes. Si este host no tiene el
  binario `cosign`, la verificación se omite con aviso: verifícala en tu estación:
  ```bash
  cosign verify-blob --key cosign.pub --bundle SHA256SUMS.cosign.bundle \
    --insecure-ignore-tlog=true SHA256SUMS       # cosign v2.x
  ```
