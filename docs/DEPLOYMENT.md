# Despliegue en AWS (máquina compartida) — Lyra WatchLog

> Cómo publicar WatchLog en `https://lyra.watchlog.itesicws.com` en el **mismo EC2**
> donde ya corre **ruta-bus** (Lyra Pass), sin que peleen por los puertos 80/443.
> Patrón: **GitHub Actions** (tag `v*`) → imágenes a **GHCR** → **SSH al EC2** →
> `update.sh`. Esto adelanta parte de la **Fase 7** (producción).

## ✅ ESTADO: EN VIVO (desde 2026-06-22)

- **WatchLog:** `https://lyra.watchlog.itesicws.com` (admin de arranque `admin@itesicws.cl`).
- **Lyra Pass** (misma máquina): `lyrapass.itesicws.com/pos` + `admin.lyrapass.itesicws.com`.
- **Host EC2** (São Paulo, sa-east-1): repo WatchLog en `/opt/watchlog`, Lyra Pass en `/opt/lyrapass`.
  Borde = `lyrapass-caddy-1` (Caddy de Lyra Pass) en la red docker **`edge`**. 3.7 GB RAM + **2 GB swap**, disco gp3 (~28 GB).
- **Versión desplegada inicial:** `v0.1.5` (los fixes de empaquetado se resolvieron entre v0.1.0 y v0.1.5).

### Lecciones del primer despliegue (ya resueltas en el repo)
El primer deploy destapó 7 problemas reales de empaquetado de producción, todos arreglados en `docker/Dockerfile.api` + `deploy/`:
1. `@lyra/llm` faltaba en el stage `deps` del Dockerfile.api (el api lo importa).
2. `@nestjs/schedule` era **dep fantasma** (sin declarar) → declarada en `apps/watchlog-api/package.json`.
3. Faltaba **`.dockerignore`** → `COPY . .` metía `node_modules`/`.env` en la imagen (inseguro + rompía el build).
4. `pnpm deploy` (v10+): requiere **`--legacy`** + **`--config.dangerouslyAllowAllBuilds=true`** (builds nativos argon2/prisma) + **openssl** en la base (motor de Prisma).
5. El init `migrate` con `pnpm exec` purgaba node_modules sin TTY → invoca los **binarios directo** (`node_modules/.bin/prisma`/`tsx`).
6. Healthcheck con `wget` (no existe en la imagen slim) → **`node`**.
7. `@prisma/client did not initialize` → **`prisma generate` en el stage `runtime`** final (el del deploy queda en otra ubicación).

### Lección de coexistencia (CRÍTICA)
Ambas apps tenían un servicio `web`. Al compartir la red `edge`, el `reverse_proxy web:3000` del Caddy de borde resolvía ambiguo → **rompió el POS de Lyra Pass**. **Regla: en la red `edge` NUNCA dos servicios con el mismo nombre.** El servicio web de WatchLog se llama **`watchlog-web`** (único). Y la red `edge` se dejó **persistente** en el compose de Lyra Pass (su Caddy vuelve solo a `edge` en cada redeploy).

### 🔐 Licenciamiento L1 (desde 2026-07-05) — el stack REQUIERE licencia
El compose de prod (`deploy/docker-compose.prod.yml`) monta en el servicio `api`: **`/etc/machine-id` del host (ro)**
(señal dominante de la huella node-lock — sin este mount la huella sería la del contenedor y cambiaría en cada
`down/up`, matando la licencia) y **`./license:/app/license` (rw)** con `LICENSE_FILE=/app/license/license.lic`.
Sin `license.lic`, la API arranca en **PENDIENTE_ACTIVACION** (solo lectura + login; escribe `solicitud.lreq` en esa
carpeta) — **no crashea**, pero no se puede operar.

**✅ EC2 demo LICENCIADO (L3, 2026-07-05):** `/opt/watchlog/deploy/license/license.lic` contiene la licencia
`lic_2026_demo_ec2_001` firmada con el **par PROD** (huella real `e271ce4b…` derivada ejecutando la misma imagen del
api con `/etc/machine-id` montado; `lyra-license inspect` = VALIDA; registrada en el ledger del emisor). El compose
con los mounts de licencia ya está APLICADO en el host (`git pull` del clon `/opt/watchlog` + `up -d api`, health
200). **OJO — el compose del host es un clon git y `update.sh` NO hace `git pull`:** cuando cambie
`deploy/docker-compose.prod.yml` en el repo hay que jalar manualmente en el host.

✅ **Verificado END-TO-END con `v0.1.13` (2026-07-05):** el primer release post-L3 (imagen con la **pública de PROD
embebida** vía `scripts/license/embed-public-key.mjs` en `release.yml`) se desplegó automáticamente y el api arrancó
**`estado=VALIDA · lic_2026_demo_ec2_001 · huella=e271ce4b…`** (health 200 interno y público). Desde `v0.1.13` las
imágenes publicadas son **vendibles** (solo aceptan licencias firmadas por la privada de PROD bajo custodia). Si en
un host nuevo la huella no calzara: borrar el `license.lic`, dejar que la app escriba su `solicitud.lreq` real y
reemitir con `pnpm license issue`.

**Emitir la licencia de una instalación on-premise (runbook corto):** el cliente/socio manda el `solicitud.lreq`
que la app dejó junto a la ruta de la licencia → en la máquina del emisor: `pnpm license issue --request
solicitud.lreq --customer … --channel-partner … --edition … --modules … --max-nodes … --max-named-users …
--expires …` (pide la passphrase de la custodia) → devolver `license.lic` → montarlo en `./license/` del stack →
la app lo toma en el próximo arranque/recheck. Detalle completo en `LICENSING_PROCEDURE.md §2` y custodia en
`§5-bis`.

### ✅ Checklist post-deploy (cada vez que se despliega WatchLog)
1. **Verificar Lyra Pass** después (POS + admin) — comparten EC2.
2. Cambios de **`deploy/`** (compose/update.sh/Caddyfile) **NO** son automáticos → `git pull` en `/opt/watchlog` antes/junto al deploy. Solo el **código de app** (imágenes) sube solo con el tag.
3. Cada varios deploys: **`docker system prune -af`** (que el disco no se llene; **no** usar `--volumes`).

### Blindaje de deploys continuos (2026-06-23) ✅ #2, #3 y #4 — COMPLETO
Ambas apps comparten EC2 + borde Caddy, ambas en deploy continuo. Blindado para que un deploy/fuga de una NUNCA tumbe a la otra:
- **#2 Límites de memoria por servicio ✅** (`mem_limit` por servicio en AMBOS compose). Aislamiento por cgroup: una fuga OOM-mata SOLO su contenedor (que se reinicia solo), no a la vecina. Topes HOLGADOS sobre el uso real (`docker stats`) — son **techos, no reservas**; su suma puede exceder la RAM física (correcto). WatchLog: postgres 512m · redis **384m** (su `--maxmemory` interno es 256mb; 256m lo mataría con el fork del bgsave) · minio 384m · api 512m (+`NODE_OPTIONS=--max-old-space-size=384`, GC antes del SIGKILL del cgroup) · watchlog-web 128m · migrate 512m. Lyra Pass: postgres **768m** (por su `shm_size: 256mb`, que cuenta contra el cgroup) · redis 384m · api 512m (+NODE_OPTIONS) · web/admin 256m · worker 384m · migrate 512m · **caddy 192m** (borde/SPOF, margen extra).
- **#3 Auto-prune tras deploy EXITOSO ✅** (`prune_old` en ambos `update.sh`, después del healthcheck OK, nunca en rollback). `docker image prune -f` solo borra **dangling**; las versiones viejas quedan **con tag** ⇒ no se reclaman. Por eso además se borran **dirigidamente** las imágenes de la versión anterior de la PROPIA app (`lyra-watchlog-{api,web,migrate}:$PREV` / `lyra-pass-{api,web,admin,worker,migrate}:$PREV`). App-scoped: nunca toca imágenes en uso ni de la app vecina; respeta el rollback (la versión actual queda; GHCR conserva el tag). `|| true` para no romper un deploy ya exitoso (`set -e`). Se ejercita solo en el próximo deploy con tag.
- **#4 Backup de Postgres pre-deploy + cron ✅** (`deploy/onprem/backup.sh`, llamado por `backup()` en `update.sh` ANTES de migrar). **Por qué es la red de seguridad clave:** el deploy corre `prisma migrate deploy` contra la BD de prod en cada release, y `migrate deploy` es **forward-only** — el rollback de `update.sh` revierte **imágenes**, NO el **esquema**; sin backup, una migración que corrompa datos es pérdida irreversible. **Formato `pg_dump -Fc`** (CUSTOM: comprimido, restauración selectiva e **inspeccionable sin aplicarlo** con `pg_restore --list`/`--schema-only` — por eso se prefirió sobre el SQL plano del de Lyra Pass), corrido dentro del contenedor `postgres:16-alpine`. **Escritura a `.tmp` + `mv`-atómico** (nunca un dump parcial con nombre válido). **Retención por días (`RETENTION_DAYS=14`) con piso mínimo (`RETENTION_MIN_KEEP=10`)**: borra dumps > 14 días pero **siempre conserva los últimos 10** (evita el bug del `-mtime +14` puro de Lyra Pass, que tras un mes inactivo borra TODO). Almacén `deploy/backups/` (gitignored). **BLOQUEA el deploy por defecto** si el backup falla (decisión 2026-06-23); válvula de escape `BACKUP_REQUIRED=false` en el `.env`. Se salta solo si Postgres no existe aún (bootstrap). **Cron diario 03:30** en el host (`crontab` de `ubuntu`, log en `backups/backup.log`). **Verificado en vivo** (BD de prod intacta, `pg_dump` solo-lectura): dump 286 KB CUSTOM, `pg_restore --list` OK, restauración schema-only a BD descartable = 74 tablas, rotación al piso de 10. **Cron instalado:** `30 3 * * * /opt/watchlog/deploy/onprem/backup.sh >> /opt/watchlog/deploy/backups/backup.log 2>&1`.

## Arquitectura

```
                Internet (443)
                     │
                     ▼
   ┌─────────────────────────────────────────────┐   EC2 (una sola máquina)
   │  Caddy de BORDE (el de ruta-bus) — dueño 80/443│
   │  TLS automático (Let's Encrypt) por subdominio │
   └───────┬───────────────────────┬───────────────┘
           │ rutabus/admin…        │ lyra.watchlog.itesicws.com
           ▼                       ▼  (red docker `edge`)
   [ stack ruta-bus ]      ┌───────────────────────────────┐
                           │  stack lyra-watchlog          │
                           │  web(Caddy interno) → api:3000 │
                           │  postgres · redis · minio      │  (red `internal`)
                           └───────────────────────────────┘
```

- El **único** que escucha 80/443 es el Caddy de ruta-bus (= "borde"). WatchLog **no** publica puertos.
- El borde alcanza a WatchLog por la red docker externa **`edge`** (alias `watchlog-web`).
- Postgres/Redis/MinIO de WatchLog son **dedicados** (aislados de ruta-bus).

## Piezas en el repo (ya creadas en esta rama)

| Archivo | Qué hace |
|---|---|
| `.github/workflows/release.yml` | tag `v*` → build `lyra-watchlog-{api,web,migrate}` → GHCR → SSH `update.sh` |
| `.github/workflows/ci.yml` | typecheck + lint + test en push a main / PR |
| `docker/Dockerfile.api` (target `migrate`) | imagen init con Prisma CLI + migraciones + seed |
| `deploy/docker-compose.prod.yml` | stack prod (imágenes GHCR, sin 80/443, red `edge`) |
| `deploy/onprem/update.sh` | backup → pull → migrate deploy → up -d → healthcheck + rollback + auto-prune |
| `deploy/onprem/backup.sh` | `pg_dump -Fc` del Postgres dedicado a `deploy/backups/`, retención 14d/piso 10; pre-deploy (bloqueante) + cron diario |
| `deploy/.env.prod.example` | plantilla del `.env` de producción |

---

## Puesta en marcha (una sola vez)

### 1) DNS
Crea un registro **A** `lyra.watchlog.itesicws.com → <IP pública del EC2>` (el mismo
EC2 de ruta-bus). El TLS lo emitirá el Caddy de borde en el primer acceso.

### 2) Secrets en el repo de WatchLog (GitHub → Settings → Secrets → Actions)
Los **mismos** que ruta-bus (misma máquina), con un `DEPLOY_DIR` propio:

| Secret | Valor |
|---|---|
| `DEPLOY_SSH_HOST` | IP pública del EC2 |
| `DEPLOY_SSH_USER` | usuario SSH (ej. `ubuntu`) |
| `DEPLOY_SSH_KEY` | clave privada SSH (PEM) con acceso al EC2 |
| `DEPLOY_DIR` | `/opt/watchlog/deploy` |

> GHCR usa el `GITHUB_TOKEN` automático para **publicar**; para que el EC2 pueda
> **descargar** las imágenes, ver el paso 5.

### 3) Red compartida + Caddy de borde (en el EC2, por SSH)
```bash
# Red que comparten el Caddy de ruta-bus y WatchLog (idempotente):
docker network create edge 2>/dev/null || true
```

Engancha el **Caddy de ruta-bus** a esa red y agrégale el bloque del subdominio.
En el `docker-compose.prod.yml` de ruta-bus, al servicio `caddy`:
```yaml
  caddy:
    # …lo existente…
    networks: [lyra_net, edge]      # ← agrega `edge`
networks:
  lyra_net:
  edge:
    external: true                  # ← declara la red externa
```
Y en el **Caddyfile** de ruta-bus, agrega al final:
```caddy
lyra.watchlog.itesicws.com {
	encode gzip zstd
	reverse_proxy watchlog-web:80
}
```
Recarga ruta-bus para que tome la red y el Caddyfile:
```bash
cd /opt/lyrapass/deploy        # carpeta de ruta-bus
docker compose -f docker-compose.prod.yml up -d   # re-crea el caddy en la red `edge`
```

### 4) Carpeta de WatchLog en el host
```bash
sudo mkdir -p /opt/watchlog && sudo chown "$USER" /opt/watchlog
git clone https://github.com/<owner>/<repo-watchlog>.git /opt/watchlog/app
ln -s /opt/watchlog/app/deploy /opt/watchlog/deploy   # DEPLOY_DIR
cd /opt/watchlog/deploy
cp .env.prod.example .env
# Edita .env: genera secretos (openssl rand -base64 48 / -base64 32),
# pon WL_OWNER=<tu-usuario-github-en-minúsculas>, deja WL_VERSION=stable.
```
> Cambios futuros a `docker-compose.prod.yml` / `update.sh` se traen con
> `git pull` en `/opt/watchlog/app` (el deploy automático solo actualiza imágenes).

### 5) Que el EC2 pueda descargar de GHCR
Opción simple para demo: en GitHub, **haz públicos** los packages
`lyra-watchlog-api/-web/-migrate` (Package → Settings → Visibility → Public).
O bien autentícate en el host con un PAT (scope `read:packages`):
```bash
echo "<PAT>" | docker login ghcr.io -u <usuario-github> --password-stdin
```

---

## Primer despliegue (bootstrap con seed)

1. En `/opt/watchlog/deploy/.env`, pon **`RUN_SEED=true`** (solo esta vez) y revisa
   `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
2. Corta la primera versión y empújala:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
   El workflow construye las imágenes, las sube a GHCR y corre `update.sh` por SSH
   (migrate deploy + seed + up + healthcheck).
3. Cuando termine, **vuelve a poner `RUN_SEED=false`** en el `.env` del host (el seed
   es solo de arranque; las migraciones siguen corriendo en cada deploy).
4. Entra a `https://lyra.watchlog.itesicws.com`, inicia con el admin de arranque
   (te pedirá cambiar la contraseña).

> Si prefieres no exponer el seed en el flujo automático, puedes correr el primer
> bootstrap a mano en el host: `RUN_SEED=true docker compose -f docker-compose.prod.yml --env-file .env run --rm migrate`.

## Despliegues siguientes
```bash
git tag v1.0.0 && git push origin v1.0.0     # build → GHCR → deploy + rollback si falla
```

---

## Notas importantes
- **HTTPS / cookies:** el borde hace TLS; `COOKIE_SECURE=true` y `APP_PUBLIC_URL=https://lyra.watchlog.itesicws.com` son obligatorios. La API es same-origin (CORS off en prod).
- **Migraciones:** corren en la imagen `migrate` (init container con Prisma CLI), NO en la imagen `api` (que se arma con `pnpm deploy --prod` sin el CLI).
- **Datos persistentes:** volúmenes `pgdata`, `redisdata`, `miniodata` (de WatchLog, aislados). **Backup de Postgres ✅** (`deploy/onprem/backup.sh`): automático **antes de cada deploy** (bloqueante) + **cron diario 03:30**; restaurar con `pg_restore`. Para upgrades mayores, correrlo a mano primero (`bash onprem/backup.sh`).
- **Aislamiento:** WatchLog y ruta-bus NO comparten BD ni red `internal`; solo comparten el Caddy de borde vía la red `edge`.
- **MinIO/SMTP:** MinIO interno (no expuesto). SMTP se administra en la app; el `.env` es solo fallback de arranque.

### Restaurar desde un backup (procedimiento)
```bash
cd /opt/watchlog/deploy
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
DUMP="backups/watchlog_YYYYMMDD_HHMM.dump"            # elige el deseado (ls -lt backups/)
# Inspeccionar SIN aplicar:
$COMPOSE exec -T postgres sh -c 'pg_restore --list' < "$DUMP" | less
# Restauración REAL (DESTRUCTIVA — sobre la BD viva): detén el api primero y usa --clean.
# $COMPOSE stop api watchlog-web
# $COMPOSE exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < "$DUMP"
# $COMPOSE up -d
```
> Para validar un dump sin riesgo, restáuralo a una BD descartable (`createdb watchlog_restore_test` → `pg_restore --schema-only -d watchlog_restore_test` → `dropdb`).

## Distribución multi-cliente y actualización de flota (preparación de canal) 🔒
> **Diseño registrado 2026-07-01 — NO construido aún.** Hoy el pipeline actualiza **UNA** instalación (el EC2
> propio). Para el modelo de canal (varios clientes on-premise, marca blanca; ver `estrategia-canal.md`) se necesita
> una capa de orquestación de flota + distribución segura. Ítems y estimación en `BACKLOG.md §2` (Épico de
> distribución). Requisitos de seguridad de cadena de suministro en `SECURITY.md §9`. Spec de licencias en
> `LICENSING.md`.

### Qué es un "update" en este formato
Un update **no** distribuye código ni archivos: distribuye **imágenes versionadas inmutables** (`lyra-watchlog-{api,web,migrate}:vX.Y.Z`). Actualizar = la instalación **baja la etiqueta nueva y reinicia**. Se **construye una vez**
(GitHub Actions) y se **despliega N veces** (cada cliente jala del registro). El pipeline por-instalación ya existe:
`update.sh` = **backup (`backup.sh`) → pull → migrate (`prisma migrate deploy`) → restart → healthcheck → rollback si
falla → prune**.

### Cómo se actualiza a N clientes (3 escenarios)
| Escenario | Mecanismo | Cuándo |
|---|---|---|
| **A. Cliente con internet** | Baja del **registro** (GHCR/privado). Disparo: SSH manual, o **agente** que revisa la "versión aprobada" y se actualiza en ventana de mantención. | La mayoría. |
| **B. Cliente air-gapped (sin internet)** | **Bundle offline**: `docker save` (imágenes) + migración empaquetada; lo entrega el socio; en la planta `docker load` + `update.sh` local. | Faenas mineras/industriales sin salida a internet (frecuente). |
| **C. Máquina que tú/el socio operan** | SSH directo + `update.sh` (como hoy en el EC2). | Pilotos, clientes chicos. |

### Reglas de oro de la flota (para no romper una planta)
- **Despliegue por ANILLOS (canary):** actualizar **1–2 clientes conejillo** primero → verificar en vivo → recién ahí
  el resto. **Nunca** los N de golpe.
- **Inventario de versiones:** saber **quién está en qué versión** (endpoint `/version` o *heartbeat* del módulo de
  licencia con `installationId`). Sin esto, a 10 clientes pierdes el control (*version drift*).
- **Migraciones = solo hacia adelante** (`prisma migrate deploy`). El rollback de `update.sh` revierte **imágenes, NO
  el esquema** ⇒ el **backup pre-update es la red de seguridad** (ya bloquea el deploy si falla). Cada cliente respalda
  su propia BD antes de migrar.
- **Ventana de mantención** coordinada con el cliente (cambio de turno / baja actividad); el reinicio es de segundos.
- **Quién aprieta el botón:** en el canal, idealmente el **socio (soporte L2)** o el **agente con aprobación tuya** —
  tú apruebas la versión, el mecanismo la propaga. No SSH manual en 10 máquinas.

### Distribución SEGURA (cadena de suministro) 🔒 — ver `SECURITY.md §9`
Software que corre en **infra ajena** y lo despliega un **tercero** ⇒ la cadena debe ser verificable:
- **Firmar las imágenes** (cosign/Sigstore) y **verificar la firma en el host** antes de correr.
- **Pull por DIGEST fijo** (`@sha256:…`), no solo por tag mutable → integridad + reproducibilidad.
- **Registro privado** con tokens **read-only por cliente**, revocables.
- **Escaneo de vulnerabilidades** (Trivy/Grype) **antes de publicar** + **SBOM** (CycloneDX) por release para el auditor
  del cliente.
- **Backups cifrados**, **secrets por instalación cifrados**, **TLS** en todo (ya vía Caddy).
- Objetivo: que el cliente/auditor pueda **probar** que la imagen que corre vino de ITESICWS y **no fue alterada**.

---

## Pendiente / deuda de este despliegue (Fase 7)
- `install.sh` idempotente (hoy el bootstrap es manual, descrito arriba).
- ~~Build de la web con **build-args VITE_** (branding por licenciatario)~~ **SUPERADO por EST-TEMAS**
  (2026-06-24): el branding por licenciatario ahora se administra **en runtime** (paletas de marca configurables por el
  admin, sin rebuild). Ver `DECISIONS.md` 2026-06-24 · EST-TEMAS (decisión 7).
- Healthcheck del `web`/borde y observabilidad (logs centralizados).
- Considerar `docker compose` v2 `pull_policy`/digests fijos para reproducibilidad.
