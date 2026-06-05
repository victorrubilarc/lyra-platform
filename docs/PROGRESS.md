# Progreso — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 1 — **backend completo y verificado**; falta la UI).

## Estado por fase

| Fase | Módulo | Estado |
|---|---|---|
| 0 | **Cimientos** (monorepo, Docker, Design System tokens, contratos, API health) | ✅ Hecho |
| 1 | Seguridad (auth + RBAC/ABAC) + Estructura organizacional + AuditLog | 🟦 Backend ✅ · UI ⬜ |
| 2 | Plantillas / Form Builder + Bitácoras | ⬜ Pendiente |
| 3 | Orígenes de datos | ⬜ Pendiente |
| 4 | Motor de incidencias | ⬜ Pendiente |
| 5 | Cambio de turno + IA (resumen) | ⬜ Pendiente |
| 6 | Base de conocimiento + Dashboard + Asistente IA | ⬜ Pendiente |
| 7 | Endurecimiento (backups, observabilidad, exportación, rate-limit, adjuntos, i18n, offline) | ⬜ Pendiente |

## Detalle pantalla por pantalla (mapeo al prototipo)

| Pantalla del prototipo | Fase | Estado |
|---|---|---|
| Login | 1 | 🟦 API ✅ · UI ⬜ |
| Estructura organizacional | 1 | 🟦 API ✅ · UI ⬜ |
| Seguridad / roles / permisos (nueva) | 1 | 🟦 API ✅ · UI ⬜ |
| Plantillas (Form Builder) | 2 | ⬜ |
| Nueva entrada / Llenado | 2 | ⬜ |
| Bitácoras (listado + detalle + log de cambios) | 2 | ⬜ |
| Orígenes de datos | 3 | ⬜ |
| Incidencias (kanban + drawer workflow) | 4 | ⬜ |
| Cambio de turno | 5 | ⬜ |
| Base de conocimiento | 6 | ⬜ |
| Dashboard | 6 | ⬜ |
| Asistente IA | 6 | ⬜ |

## Hecho en Fase 0
- Monorepo pnpm con `apps/` y `packages/` (ui, contracts, config).
- TypeScript estricto, ESLint (flat) y Prettier compartidos.
- `@lyra/ui`: tokens del Design System Lyra (CSS/`@theme`).
- `@lyra/contracts`: primer contrato compartido (`HealthStatus` + Zod) con test.
- `watchlog-api`: NestJS + Fastify + Helmet + pino, validación de entorno (Zod), `PrismaService`, endpoints `/api/health` y `/api/health/ready`, test del controller.
- `watchlog-web`: React + Vite + Tailwind v4 + TanStack Query; pantalla Fase 0 que consume el health del API vía el contrato compartido.
- Docker: `compose.dev` (Postgres/Redis/MinIO/Mailpit), `compose.prod` (stack completo), Dockerfiles multi-stage, Caddy (TLS + reverse proxy).
- Docs de memoria: ARCHITECTURE, DATA_MODEL, SECURITY, PROGRESS, DECISIONS.
- Commiteado y pusheado a `origin/main` (github.com/victorrubilarc/lyra-platform), 5 commits por capa.

## Verificación de la Fase 0 (todo ✅)
- `pnpm install` (545 paquetes) + cliente Prisma generado.
- `pnpm build` → contracts (tsc) · API (nest build) · web (vite, 1640 módulos).
- `pnpm typecheck` → 4 paquetes OK.
- `pnpm test` → contracts 2/2 · API 2/2.
- `pnpm lint` → 0 errores, 0 warnings.
- **Smoke test en vivo**: `pnpm infra:up` + `pnpm dev` → la web consume `/api/health/ready`
  contra Postgres real en Docker y muestra el estado en verde. Cadena web↔API↔BD validada
  con el contrato Zod compartido. **Sin pendientes en la Fase 0.**

## Hecho en Fase 1 (backend)
- **Contratos** (`@lyra/contracts`): catálogo de permisos 4D (19 claves, extensible), esquemas
  Zod de auth (login/refresh/MFA/cambio de contraseña), DTOs de users/roles/política y de
  estructura (OrgLevel/OrgNode + árbol). Test de consistencia del catálogo.
- **Esquema** (Prisma): identidad, RBAC/ABAC, sesiones/refresh, MFA, política, estructura y
  auditoría. Dos migraciones aplicadas. Check constraint del `Scope` polimórfico + trigger de
  inmutabilidad de `AuditLog`.
- **Auth**: proveedor local enchufable (Argon2id), `TokenService` (access JWT + refresh rotativo
  con familia y **detección de reuso**), `MfaService` (TOTP + recovery codes, secreto cifrado),
  `PasswordPolicyService` (complejidad + historial), lockout por fuerza bruta en BD, CSRF de
  doble envío. Controlador `/auth/*` con cookies httpOnly.
- **Authz**: `JwtAccessGuard` + `PermissionsGuard` globales, `@RequirePermission`/`@Public`,
  `PermissionService` (permisos efectivos cacheados con invalidación), `ScopeService` (ABAC con
  ruta materializada).
- **Crypto/Audit/Cache**: Argon2id + AES-256-GCM + SHA-256; `AuditService` append-only;
  `CacheService` (Redis con fallback en memoria).
- **CRUD**: estructura (niveles + nodos con mantenimiento de `path` y reparentado seguro),
  usuarios (alta/edición/roles/scope), roles (CRUD + sync de permisos), política y lectura de
  auditoría. Todo con guards por permiso.
- **Seed** idempotente (permisos + rol admin + política + admin de arranque) y variables de
  entorno nuevas en `.env.example`.
- **Tooling**: `dotenv-cli` para Prisma en el monorepo, `otplib` fijado a v12, `fastify` directo.

## Verificación de la Fase 1 (backend)
- `pnpm typecheck` · `pnpm lint` · `pnpm build` → OK en los 5 paquetes.
- `pnpm test` → 32 tests del API + 5 de contracts (crypto, guard de permisos, scope ABAC,
  rotación/reuso de refresh, login/lockout/MFA).
- **Smoke en vivo**: `pnpm db:seed` + API arriba → login del admin de arranque, `/auth/me`
  con permisos efectivos, 401 sin token, 403 de refresh sin CSRF, 200 con CSRF, y creación de
  estructura validando la ruta materializada (`/<root>/` → `/<root>/<hijo>/`).

## Fuera de alcance de la Fase 0/1 (planificado para más adelante)
- Build de imágenes de producción (`docker-compose.prod.yml`) — Fase 7 (endurecimiento).
- Ranura OIDC/LDAP: diseñada y con el `AuthProvider` listo para enchufar; se activa cuando un
  cliente lo pida.

## Próximo paso
**Fase 1 — UI de Seguridad + Estructura** (sesión nueva). El backend ya expone todo:
1. Pantalla de **Login** (con flujo MFA y cambio de contraseña forzado) consumiendo `/auth/*`.
2. **Estructura organizacional**: árbol de nodos (CRUD) sobre `/structure/*`.
3. **Seguridad**: usuarios, roles/permisos (usando el catálogo de `/security/permissions`) y
   alcance de datos, sobre `/security/*`.
Construir el cliente de permisos en `packages/` (helpers para ocultar/deshabilitar en UI según
`SessionInfo.permissions`) y los componentes premium en `@lyra/ui`.
