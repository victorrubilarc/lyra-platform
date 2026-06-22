# Despliegue en AWS (máquina compartida) — Lyra WatchLog

> Cómo publicar WatchLog en `https://lyra.watchlog.itesicws.com` en el **mismo EC2**
> donde ya corre **ruta-bus**, sin que peleen por los puertos 80/443. Mismo patrón
> que ruta-bus: **GitHub Actions** construye imágenes → **GHCR** → **SSH al EC2** →
> `update.sh`. Esto adelanta parte de la **Fase 7** (producción).

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
| `deploy/onprem/update.sh` | pull → migrate deploy → up -d → healthcheck + rollback |
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
- **Datos persistentes:** volúmenes `pgdata`, `redisdata`, `miniodata` (de WatchLog, aislados). Respaldar Postgres antes de upgrades grandes (pendiente: script de backup como el de ruta-bus).
- **Aislamiento:** WatchLog y ruta-bus NO comparten BD ni red `internal`; solo comparten el Caddy de borde vía la red `edge`.
- **MinIO/SMTP:** MinIO interno (no expuesto). SMTP se administra en la app; el `.env` es solo fallback de arranque.

## Pendiente / deuda de este despliegue (Fase 7)
- Script de **backup** de Postgres + cron (espejo de `ruta-bus/deploy/onprem/backup.sh`).
- `install.sh` idempotente (hoy el bootstrap es manual, descrito arriba).
- Build de la web con **build-args VITE_** (branding por licenciatario) si se requiere.
- Healthcheck del `web`/borde y observabilidad (logs centralizados).
- Considerar `docker compose` v2 `pull_policy`/digests fijos para reproducibilidad.
