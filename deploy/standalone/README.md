# Lyra WatchLog — despliegue standalone (planta / cliente)

Stack de producción **auto-contenido** para una instalación on-premise en red
restrictiva (OT/IT segmentada, sin internet saliente, PKI corporativa). El
compose base **no publica ningún puerto**; el borde se elige con un override
según lo que la planta ya tenga. El compose del demo
(`deploy/docker-compose.prod.yml`, borde compartido) es un despliegue distinto
y no se toca desde aquí.

## Preparación (una vez)

```bash
cp ../.env.prod.example .env      # y completar TODOS los __GENERAR__
mkdir -p license                  # aquí se importa license.lic / sale solicitud.lreq
# modo (b): además
mkdir -p certs                    # cert.pem + key.pem emitidos por la CA corporativa
```

`COOKIE_SECURE=true` y `APP_PUBLIC_URL=https://…` van en los TRES modos: el
usuario siempre llega por HTTPS (lo termina el borde del modo elegido).

## Modos de borde

### (a) Detrás del proxy del cliente — preferido si la planta tiene appliance

```bash
docker compose -f docker-compose.yml -f mode-a.behind-proxy.yml up -d
```

`watchlog-web` queda en `127.0.0.1:${EDGE_LOCAL_PORT:-8080}` (loopback). El
F5/NetScaler/NGINX/IIS del cliente termina TLS con su certificado y reenvía al
loopback. Debe mandar `X-Forwarded-For` (rate limit + IP real de auditoría) y
no bufferizar SSE (ver `edge/nginx-watchlog.conf.example` como referencia).

### (b) Borde propio con certificado corporativo — si no hay appliance

```bash
docker compose -f docker-compose.yml -f mode-b.own-edge.yml up -d
```

Caddy de borde con `tls /certs/cert.pem /certs/key.pem` (SIN ACME — imposible
air-gapped). Ajustar el dominio en `edge/Caddyfile.edge`. Variante NGINX
equivalente documentada en `edge/nginx-watchlog.conf.example`.

### (c) Borde compartido del demo

Es el despliegue del EC2 demo (`deploy/docker-compose.prod.yml` + red externa
`edge` de ruta-bus). No usa esta carpeta.

## Matriz de puertos por modo (para el equipo de redes)

Qué queda `LISTEN` **en el host** según el modo. Todo lo demás (Postgres 5432,
Redis 6379, MinIO 9000/9001, API 3000, Caddy interno 80) vive SOLO en la red
Docker `internal` **sin `ports:`** ⇒ para un escaneo de red esos servicios
**no existen** (no es que estén "cerrados": no hay socket en el host).

| Puerto host | Modo (a) detrás de proxy | Modo (b) borde propio | Modo (c) demo compartido |
|---|---|---|---|
| `127.0.0.1:${EDGE_LOCAL_PORT}` (def. 8080) | ✅ loopback (solo el proxy local lo ve) | — | — |
| `443/tcp` | — (lo tiene el appliance del cliente) | ✅ caddy-edge (cert corporativo) | ✅ pero del Caddy de ruta-bus (host demo) |
| `80/tcp` | — | ✅ solo redirect→443 (opcional, quitable) | ✅ ídem (ruta-bus) |
| 5432 / 6379 / 9000-9001 / 3000 | ❌ inexistentes | ❌ inexistentes | ❌ inexistentes |

Notas para el cuestionario de redes:

- **MinIO no necesita exposición alguna** (desde H1 la subida Y la descarga de
  adjuntos van proxied por la API): no hay URL presigned que el navegador deba
  alcanzar. Superficie de entrada = **1 solo flujo HTTP(S)**.
- En **dev** (`docker-compose.dev.yml`) sí se publican 5432/6379/9000-9001/
  1025-8025 **a propósito** (herramientas locales). Ese compose jamás va a planta.
- Docker + firewall del host (Linux): publicar un puerto con `"8080:80"` abre
  `0.0.0.0` e inserta reglas iptables en la cadena `DOCKER` que **saltan
  ufw/firewalld** (el cliente cree estar protegido y no lo está — hallazgo
  típico de auditoría). Este stack lo mitiga por diseño (nada publicado salvo el
  borde elegido; el modo (a) usa `127.0.0.1:` = loopback, no `0.0.0.0`), pero si
  el cliente gestiona su propio firewall de host debe conocerlo. Mitigaciones y
  la opción `iptables=false` de Docker: **`docs/DEPLOYMENT.md` §"Endurecimiento
  del host (CIS · para el equipo de redes)"** (H2 2026-07-07).

## Operación

- **Actualización**: mismo procedimiento que `deploy/onprem/update.sh` (backup →
  pull → migrate → up → healthcheck), usando `-f` con los archivos del modo
  elegido o `COMPOSE_FILE` en `.env` (p. ej.
  `COMPOSE_FILE=docker-compose.yml:mode-a.behind-proxy.yml`).
- **Licencia**: ceremonia air-gapped por archivos en `./license/` (ver
  `docs/LICENSING.md`); el primer arranque genera `solicitud.lreq`.
- **Primer arranque**: wizard `/setup` con el token one-shot de
  `./license/setup-token` (ver `docs/DEPLOYMENT.md`).
