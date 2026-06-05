# Lyra WatchLog

Plataforma de **bitácoras operacionales industriales** (minería, manufactura, energía…). Reemplaza bitácoras en papel con: estructura organizacional jerárquica, plantillas de formularios dinámicas, registro por turno, cambio de turno asistido por IA, motor de incidencias con workflow, orígenes de datos externos y una base de conocimiento que se enriquece con el uso.

> Parte del ecosistema **Lyra** de ITESICWS. Despliegue **on-premise**, un cliente por instalación (single-tenant). Todo dockerizado.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | NestJS 11 (Fastify) · Prisma 6 · PostgreSQL 16 |
| Frontend | React 19 · Vite 6 · Tailwind v4 (tokens Lyra) |
| Compartido | TypeScript estricto · Zod (contratos) |
| Infra | Docker Compose · Caddy (TLS) · Redis · MinIO |
| Monorepo | pnpm workspaces |

Detalle y justificación en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estructura

```
.
├─ apps/
│  ├─ watchlog-api/     # Backend NestJS
│  └─ watchlog-web/     # Frontend React
├─ packages/
│  ├─ ui/               # Design System Lyra (tokens + componentes)
│  ├─ contracts/        # Tipos + esquemas Zod compartidos
│  └─ config/           # ESLint / Prettier / tsconfig base
├─ docker/              # Dockerfiles + Caddy
├─ docs/                # Memoria técnica del proyecto
├─ docker-compose.dev.yml
└─ docker-compose.prod.yml
```

## Requisitos

- Node.js **22+** (`.nvmrc`)
- pnpm **11+** (`corepack enable`)
- Docker + Docker Compose

## Puesta en marcha (desarrollo)

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar entorno
cp .env.example .env        # (Windows: copy .env.example .env)

# 3. Levantar infraestructura (Postgres, Redis, MinIO, Mailpit)
pnpm infra:up

# 4. (Fase 1+) Aplicar migraciones de base de datos
pnpm db:migrate

# 5. Arrancar API + Web en modo watch
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/health
- Mailpit (correos de prueba): http://localhost:8025
- MinIO (consola): http://localhost:9001

## Comandos útiles

| Comando | Acción |
|---|---|
| `pnpm dev` | API + Web en watch |
| `pnpm build` | Compila todo (orden topológico) |
| `pnpm typecheck` | Chequeo de tipos en todos los paquetes |
| `pnpm lint` | ESLint en todos los paquetes |
| `pnpm test` | Tests (Vitest) |
| `pnpm format` | Prettier |
| `pnpm infra:up` / `infra:down` | Levanta/detiene infraestructura local |

## Despliegue (producción, on-premise)

```bash
cp .env.example .env        # ajustar secretos y SITE_ADDRESS
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy gestiona TLS automáticamente si defines `SITE_ADDRESS` con tu dominio.

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack y decisiones
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — modelo de datos
- [`docs/SECURITY.md`](docs/SECURITY.md) — auth y modelo de permisos
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — estado, pantalla por pantalla
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — registro de decisiones
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — Design System Lyra
