# Arquitectura — Lyra WatchLog

> Plataforma de bitácoras operacionales industriales. Despliegue **on-premise**, **single-tenant** (un cliente por instalación). Parte del ecosistema **Lyra** de ITESICWS.

Última actualización: 2026-06-05 (Fase 0).

## 1. Stack y justificación

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto (end-to-end) | Un solo lenguaje; permite compartir tipos/contratos frontend↔backend desde `packages/`. |
| Backend | **NestJS 11** (adaptador Fastify) | Modular por diseño (ideal para módulo de seguridad, incidencias, orígenes). Guards/Interceptors = lugar natural para forzar autorización en el servidor. Maduro, tipado de primer nivel. Fastify por rendimiento. |
| ORM / migraciones | **Prisma 6** (`prisma migrate`) | Estándar de industria, tipado y DX excelentes, migraciones versionadas reproducibles. |
| Base de datos | **PostgreSQL 16** | Normalizado, FKs/constraints, índices, `JSONB` (valores de formularios dinámicos), `tsvector` (búsqueda KB). |
| Caché / colas | **Redis 7** + (BullMQ, Fase 3+) | TTL de orígenes de datos, rate-limit, store de refresh tokens, jobs (SLA, escalamiento, IA). |
| Frontend | **React 19 + Vite 6** | Base del prototipo; build rápido y simple on-premise. |
| Estilos | **Tailwind v4** + tokens Lyra (`@theme`) | Design system token-first; Tailwind v4 mapea tokens CSS 1:1. |
| Estado servidor / UI | TanStack Query · Zustand | Sin Redux innecesario. |
| Formularios | React Hook Form + **Zod** | Zod se comparte con el backend como contrato de validación. |
| Auth | Local (Argon2id, refresh rotativo, MFA TOTP) **tras abstracción enchufable** | Ranura OIDC (Azure/Entra, Google…) y LDAP por configuración por despliegue. Ver `SECURITY.md`. |
| IA | Interfaz `LlmProvider` abstracta (backend) | Nube (Anthropic/OpenAI/Gemini/Deepseek) o local (Ollama/vLLM). Nunca desde el frontend. |
| Contenedores | Docker multi-stage + Compose (dev/prod) · **Caddy interno** (SPA + proxy `/api`, no expuesto) · **borde DESACOPLABLE en 3 modos** (H1: detrás del proxy del cliente / borde propio con cert corporativo sin ACME / compartido del demo — `deploy/standalone/`) | Portabilidad on-premise + planta air-gapped con PKI corporativa. Ver `DEPLOYMENT.md`. |
| Evidencias | **MinIO** (S3-compatible), **100 % interno**: subida Y descarga PROXIED por la API (H1 2026-07-07 — el navegador jamás lo alcanza; sin URLs presigned) | Firmas, fotos y adjuntos fuera de la BD; superficie de red = solo el borde. |
| Fuentes web | **Self-hosted** (`@fontsource` woff2, H1) | Cero egress del navegador (air-gap/SOC); mismos pesos Sora/Inter. |
| Monorepo | **pnpm workspaces** (sin Turborepo por ahora) | Simplicidad; se reevalúa Turborepo si el repo crece. |
| Calidad | ESLint + Prettier + tsconfig estrictos · Vitest | Config compartida en `packages/config`. |

## 2. Estructura del monorepo

```
.
├─ apps/
│  ├─ watchlog-api/     # Backend NestJS (Fastify, Prisma)
│  └─ watchlog-web/     # Frontend React (Vite, Tailwind)
├─ packages/
│  ├─ ui/               # Design System Lyra: tokens (CSS) + componentes (CSS Modules)
│  ├─ contracts/        # Tipos TS + esquemas Zod compartidos (build con tsc → dist)
│  ├─ permissions/      # Cliente de permisos (can/canAll/canAny) — TS puro, sin React
│  └─ config/           # ESLint (flat) + Prettier compartidos
├─ docker/              # Dockerfile.api, Dockerfile.web, Caddyfile.web
├─ docs/                # Memoria técnica (este directorio)
├─ tsconfig.base.json   # Base TS estricta (cada paquete la extiende)
├─ docker-compose.dev.yml   # Infra de desarrollo (Postgres, Redis, MinIO, Mailpit)
└─ docker-compose.prod.yml  # Stack completo on-premise
```

- **`apps/`** = desplegables. **`packages/`** = reutilizable. Hoy **4 paquetes** (`ui`, `contracts`, `permissions`, `config`); se extraen más solo cuando un segundo producto los necesite.
- `@lyra/contracts` es la pieza que materializa el "compartir tipos": el API tipa sus respuestas y la Web las consume con el mismo esquema Zod (ej. `HealthStatus`).
- `@lyra/contracts` se consume **compilado** (`dist`); `@lyra/ui` y `@lyra/permissions` se consumen **como fuente** (los transpila Vite/tsc del consumidor), por eso no tienen paso de `build`.

### Frontend (`apps/watchlog-web`)
Capas: `lib/` (api-client con Bearer+refresh+CSRF, custodia del token en memoria) → `auth/` (store Zustand, `AuthProvider`, `ProtectedRoute`, `usePermissions`/`<Can>`) → `routes/` (react-router 7 + `AppLayout`) → `features/` (pantallas: `auth/`, `home/`). El access token vive **solo en memoria**; el refresh va en cookie httpOnly. La autorización en UI **solo oculta/deshabilita** vía `@lyra/permissions`; la decisión real es del backend.

## 3. Capas (backend)

`Controller` (HTTP) → `Service` (lógica de negocio) → `PrismaService` (acceso a datos). Integraciones externas (orígenes de datos, IA, correo) tras interfaces propias. La autorización se aplica con **Guards** antes del controller y filtrado por alcance en los services.

## 4. Flujo de desarrollo

```bash
pnpm install            # instala todo el workspace
pnpm infra:up           # Postgres, Redis, MinIO, Mailpit (docker)
pnpm db:migrate         # (Fase 1+) migraciones Prisma
pnpm dev                # API (watch) + Web (Vite) en paralelo
```

`pnpm build` compila en orden topológico (`contracts` antes que las apps). `pnpm dev` pre-compila los `packages/` y luego corre las apps en watch.

## 5. Decisiones estructurales clave

- **Single-tenant on-premise:** cada cliente = su propio stack Docker + su BD. Sin RLS ni multi-tenant. El modelo de datos se mantiene limpio por si en el futuro se evalúa SaaS, pero no se construye ahora. (Ver `DECISIONS.md`.)
- **Multi-estructura ≠ multi-tenant (2026-06-23):** una instalación puede definir VARIAS estructuras organizacionales (`OrgStructure`), cada una con su set de niveles y su árbol. Solo el árbol + niveles + calendarios son por-estructura; los catálogos (plantillas, flujos, tipos de incidencia, listas) se comparten. Aislamiento estricto (un nodo vive en una estructura). La estructura activa se elige en un selector global del shell (store `structure-store`, persistido por usuario) y filtra todas las queries de árbol/niveles/calendarios; las estructuras visibles se derivan del ABAC por nodo. La ruta materializada `path` (IDs de nodo únicos) no colisiona entre estructuras, así que el ABAC y la herencia de calendarios no se reescriben. (Ver `DECISIONS.md` 2026-06-23 y `DATA_MODEL.md`.)
- **IA y llamadas a orígenes externos SIEMPRE en el backend** (el prototipo llamaba a la IA desde el navegador: corregido).
- **Autorización forzada en el servidor**; la UI solo oculta.

Detalle de datos en `DATA_MODEL.md`; seguridad en `SECURITY.md`; **flujo de autenticación y tokens (con diagramas) en `AUTH_FLOW.md`**; estado en `PROGRESS.md`; bitácora de decisiones en `DECISIONS.md`.
