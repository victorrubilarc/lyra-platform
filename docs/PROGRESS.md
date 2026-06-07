# Progreso — Lyra WatchLog

Última actualización: 2026-06-07 (Fase 1 — backend ✅; **UI: Login + cimientos ✅**; **Recuperación de contraseña ✅**; **MFA self-service ✅**; **App Shell / Workspace premium ✅**; **UI Estructura organizacional ✅** — layout master-detail premium; falta UI de Seguridad).

## Estado por fase

| Fase | Módulo | Estado |
|---|---|---|
| 0 | **Cimientos** (monorepo, Docker, Design System tokens, contratos, API health) | ✅ Hecho |
| 1 | Seguridad (auth + RBAC/ABAC) + Estructura organizacional + AuditLog | 🟦 Backend ✅ · UI: Login ✅ · **Estructura ✅** · Seguridad ⬜ |
| 2 | Plantillas / Form Builder + Bitácoras | ⬜ Pendiente |
| 3 | Orígenes de datos | ⬜ Pendiente |
| 4 | Motor de incidencias | ⬜ Pendiente |
| 5 | Cambio de turno + IA (resumen) | ⬜ Pendiente |
| 6 | Base de conocimiento + Dashboard + Asistente IA | ⬜ Pendiente |
| 7 | Endurecimiento (backups, observabilidad, exportación, rate-limit, adjuntos, i18n, offline) | ⬜ Pendiente |

## Detalle pantalla por pantalla (mapeo al prototipo)

| Pantalla del prototipo | Fase | Estado |
|---|---|---|
| Login (+ MFA TOTP + cambio forzado) | 1 | ✅ API + UI |
| Recuperación de contraseña (self-service) | 1 | ✅ API + UI |
| MFA self-service (perfil) + gate de enrolamiento forzado | 1 | ✅ API + UI |
| App Shell / Workspace premium (sidebar, topbar, pestañas, ⌘K, i18n) | 1 | ✅ UI |
| Estructura organizacional | 1 | ✅ API + UI |
| Seguridad / roles / permisos (nueva) | 1 | 🟦 API ✅ · UI ⬜ (incluye reset MFA de admin: API ✅, UI ⬜) |
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

## Hecho en Fase 1 (UI — Login + cimientos del frontend)
- **`@lyra/permissions`** (paquete nuevo, TS puro): `can`/`canAll`/`canAny`/`createPermissionChecker`
  tipados con `PermissionKey`. 5 tests. La UI solo oculta/deshabilita; el backend decide.
- **`@lyra/ui`** (antes solo tokens): componentes premium con **CSS Modules sobre tokens** —
  `Button` (primary/secondary/danger/icon + loading), `Input` (con slot derecho/mono), `FormField`
  (label+error+aria), `Card` (glass + glow), `Spinner`, `Toast` (`ToastProvider`/`useToast`).
  Área táctil 44px, dark-mode, Lucide. `cx` helper.
- **Cimientos web** (`apps/watchlog-web`):
  - `lib/session-token.ts` — access token **en memoria** (+ expiración); handler de expiración.
  - `lib/api-client.ts` — fetch central (Bearer + `credentials`), **refresh transparente en 401**
    (coalescido) + CSRF de doble envío; `ApiError` con `issues` de Zod.
  - `auth/` — `auth-store` (Zustand), `auth-api` (`/auth/*`), `AuthProvider` (bootstrap por refresh
    al arrancar + refresh proactivo ~30 s antes de expirar), `ProtectedRoute` (auth + desvío a
    cambio forzado), `useAuth`, `usePermissions`, `<Can>`.
  - `routes/` — router (react-router 7) + `AppLayout` (sidebar Lyra; ítems de módulo ocultos por
    permiso, módulos no construidos con badge "Pronto").
- **Pantallas**: `LoginPage` (paso 1 credenciales → paso 2 **MFA TOTP**, con mostrar/ocultar
  contraseña y manejo del `LoginResponse` discriminado), `ForcePasswordChangePage` (cambio forzado
  en primer ingreso), `HomePage` (landing autenticada con mapa de módulos). RHF + Zod del contrato.

## Pulido de la entrada (Login) — branding + estándar
- **Co-branding configurable por instalación** (`src/branding.ts` + `VITE_LICENSEE_*`, `envDir` al
  `.env` raíz): producto Lyra WatchLog + empresa licenciataria (nombre/rubro/logo), con monograma de
  iniciales como fallback. Logo sobre placa clara. Cliente real configurado: **Eagon Lautaro Ltda.**
  (logo en `apps/watchlog-web/public/branding/eagon.svg`).
- **Entrada premium**: layout split-screen, tarjeta estilizada (radio 24px, sombra en capas, barra de
  acento), **gráfico vectorial animado** propio (`BrandScene.tsx`: constelación Lyra + telemetría) y
  animaciones de entrada (respetando `prefers-reduced-motion`). Favicon de marca + `<title>`.
- **Fix de tokens**: se agregaron `--space-*`, `--text-*`, `--transition-*` que faltaban en
  `@lyra/ui/tokens` (mejora el espaciado/tipografía de toda la app).
- **Login estándar**: recordar correo, ¿olvidaste tu contraseña?, y en MFA opción de **código de
  recuperación**. Pantalla `/recuperar-contrasena` **asistida por administrador** (el reset
  self-service por correo queda pendiente de backend; ver Próximo paso).

## Verificación de la Fase 1 (UI — Login)
- `pnpm typecheck` (6 paquetes) · `pnpm lint` (0 errores, 0 warnings) · `pnpm build`
  (web: 1695 módulos, CSS 17 KB / JS 435 KB) → OK.
- `pnpm test` → **+5 tests** de `@lyra/permissions` (total: API 32 · permissions 5 · contracts).
- **Smoke en vivo** (infra + seed + API): login del admin de arranque ⇒ `authenticated` con
  `forcePasswordChange=true`, sin MFA, **19 permisos**, `scope.orgNodeIds=null`, cookies
  `wl_refresh`+`wl_csrf`; `/auth/me` con Bearer OK; **401** sin token; refresh **403** sin CSRF /
  **200** con CSRF; login con contraseña errónea ⇒ **401** "Credenciales inválidas". Es la cadena
  exacta que consume el Login. (No se mutó la contraseña del admin documentado.)

## Hecho en Fase 1 (Auth — Recuperación de contraseña self-service)
- **Backend** (NIST 800-63B / OWASP ASVS §2.5):
  - **`@lyra/contracts`**: `forgotPasswordRequest/Response`, `resetPasswordRequest`.
  - **Prisma**: modelo `PasswordResetToken` (hash SHA-256, `usedAt` single-use, `expiresAt`),
    migración `20260606021713_add_password_reset_token`.
  - **`EmailService`** (clase abstracta = token DI, patrón tipo `LlmProvider`) + **`SmtpEmailService`**
    (nodemailer; Mailpit en dev) + plantillas (enlace de reset y notificación de cambio). `EmailModule`
    global. Variables SMTP/`APP_PUBLIC_URL`/`PASSWORD_RESET_TTL` en `env.schema` y `.env.example`.
  - **`PasswordResetService`**: `requestReset` (respuesta neutra, envío en 2.º plano anti-*timing*,
    rate-limit por correo+IP en `CacheService`, invalida pendientes) y `resetPassword` (token
    hasheado/single-use/TTL, política, **revoca todas las sesiones**, limpia lockout/`forcePasswordChange`,
    notificación; **no toca MFA**, no auto-loguea, mensaje genérico). Endpoints públicos
    `POST /auth/forgot-password` (200 neutro) y `POST /auth/reset-password` (204).
  - `TokenService.revokeAllForUser`; `AuthService.changePassword` invalida tokens de reset pendientes.
  - Auditoría: `auth.password.reset_requested|completed|failed|throttled`.
- **Frontend**: `/recuperar-contrasena` (pedir correo + confirmación neutra) y nueva
  `/restablecer-contrasena?token=…` (`ResetPasswordPage`), reusando `@lyra/ui`, RHF+Zod del contrato y
  el api-client. **Endurecimiento del token en URL**: se borra de la URL al montar (`history.replaceState`)
  y `<meta name="referrer">` en `index.html`. `auth-api`: `forgotPassword`/`resetPassword`.
- **Seed**: usuario de prueba `demo@watchlog.local` / `Demo!Pass2026` (solo fuera de producción).
- **Verificación**: `typecheck`/`lint`/`build` OK (6 paquetes). `pnpm test` → **53** (API **43**, con
  **11 nuevos** de `PasswordResetService`; permissions 5; contracts). **Smoke en vivo con Mailpit**:
  respuesta neutra (un solo correo al usuario real), token single-use (reuso ⇒ 400), política aplicada
  (débil ⇒ 400), login con nueva contraseña ⇒ 200 y con la vieja ⇒ 401, notificación de cambio enviada.

## Hecho en Fase 1 (Auth — MFA self-service: política por rol + enrolamiento forzado)
- **Política de requerimiento** (NIST 800-63B / OWASP ASVS §2): `Role.requireMfa` + modo global
  `PasswordPolicy.mfaMode` (`OPTIONAL`/`REQUIRED_BY_ROLE`/`REQUIRED_FOR_ALL`; piso = OPCIONAL, sin modo
  "deshabilitado"). `MfaRequirementService` deriva `required`/`enrollmentPending`. Migración
  `20260606041921_add_mfa_policy_requirement` (+ `User.mfaFailedCount`/`mfaLockedUntil`).
- **Enrolamiento forzado con enforcement en backend**: claim **`mfaPending`** en el access token
  (recalculado en cada emisión/rotación) + **`MfaEnrollmentGuard`** global → **403
  `MFA_ENROLLMENT_REQUIRED`** salvo `@AllowPendingEnrollment` (me, logout, setup/verify, change-password).
  No degrada AAL. `SessionInfo.user` gana `mfaRequired` y `mfaEnrollmentRequired`.
- **Throttle del 2.º factor** (faltaba): contador propio en BD, separado del de contraseña; bloqueo tras
  `maxFailedAttempts`. Ventana TOTP ±1 (RFC 6238).
- **Reset de admin** `POST /security/users/:id/mfa/reset` (permiso nuevo `user:reset-mfa`): borra el
  factor y **revoca todas las sesiones** del objetivo. Un factor exigido **no** se auto-desactiva (403).
  **Regenerar recovery codes** (`/auth/mfa/recovery-codes/regenerate`, reconfirma contraseña).
  `requireMfa` editable en el CRUD de roles; `mfaRequired` en el detalle de usuario.
- **Frontend**: `MfaEnrollFlow` reutilizable (setup → QR con `qrcode.react` → verify → recovery codes
  copiar/descargar), página **`/perfil/seguridad`** (activar/regenerar/desactivar) y gate full-screen
  **`/activar-mfa`**. `ProtectedRoute` prioriza cambio de contraseña y luego enrolamiento de MFA. Enlace
  "Mi seguridad" en el sidebar.
- **Verificación**: `typecheck`/`lint`/`build` OK (6 paquetes). `pnpm test` → API **58** (+15:
  `MfaRequirementService` 7, `MfaEnrollmentGuard` 5, throttle 3) + permissions 5 + contracts.
  **Smoke en vivo** (demo, admin): gate (403 `MFA_ENROLLMENT_REQUIRED` → enrolar con TOTP real → 200),
  throttle (bloqueo al 5.º intento, mensaje al 6.º, código correcto rechazado estando bloqueado), admin
  reset (revoca sesiones: refresh post-reset = 401). Estado del demo restaurado (mfaMode OPTIONAL, sin MFA).
- **Pendiente (registrado, no en esta sesión)**: la **UI de admin** (ver estado / resetear MFA en el CRUD
  de usuarios) llega con la pantalla de Seguridad; igualar `forcePasswordChange` con enforcement de
  backend; anti-replay de OTP.

## Hecho en Fase 1 (UI — App Shell / Workspace premium)
Marco donde viven todos los módulos (ver DECISIONS 2026-06-06). Reemplaza el `AppLayout` básico.
- **`@lyra/ui` (+9 primitivos)**: `Toggle`, `Tooltip`, `Menu`/`MenuItem`/`MenuSeparator`/`MenuLabel`,
  `Modal`, `Drawer`, `Skeleton`, `Breadcrumb`, `EmptyState` — CSS Modules sobre tokens, a11y, área 44px,
  `prefers-reduced-motion`. (`Table` queda para Estructura.)
- **Shell** (`apps/watchlog-web/src/shell/`): `AppShell` (sidebar colapsable completo↔riel + top bar +
  pestañas + Outlet), `Sidebar` (gated por permiso, favoritos, tooltips en riel), `Topbar` (breadcrumbs,
  búsqueda ⌘K, densidad, idioma, notificaciones, **menú de perfil** con Mi seguridad/MFA + logout),
  `WorkspaceTabs` (**pestañas acotadas** tope 6, fijables, cada una = ruta), `CommandPalette` (cmdk).
- **Estado de UI persistido** (`localStorage`, nunca secretos): `ui-store` (sidebar/densidad),
  `workspace-store` (pestañas), `favorites-store` (favoritos/recientes). `navigation.ts` = registro único
  de rutas (label i18n + ícono + permiso).
- **i18n-ready** (`react-i18next`): `es-CL` por defecto, **strings como claves**, selector de idioma
  (inglés marcado "Próximamente"); preferencia persistida. Catálogos extra → Fase 7.
- **Tema claro / oscuro / auto** (revierte "dark-only v1"): token-first vía `data-theme`, paleta clara
  completa + tokens `--color-hover`/`--color-chrome`, `theme-store` (auto = sistema), selector en topbar
  y ⌘K. La entrada/login queda SIEMPRE oscura. **Pestañas** con acento de marca + animación sobria.
- **Caché compartida** (TanStack Query, `staleTime` 30s): las pestañas preservan estado sin refrescos.
- **Verificación**: `typecheck`/`lint`/`build` (web 1829 módulos) verdes · `pnpm test` 58 (API) ·
  dev sirve y transforma el shell + optimiza `cmdk`/`i18next`. **Pendiente: smoke VISUAL en navegador**
  (colapsar, pestañas, ⌘K, idioma, densidad) — ver BACKLOG §4.

## Fuera de alcance de la Fase 0/1 (planificado para más adelante)
- Build de imágenes de producción (`docker-compose.prod.yml`) — Fase 7 (endurecimiento).
- Ranura OIDC/LDAP: diseñada y con el `AuthProvider` listo para enchufar; se activa cuando un
  cliente lo pida.

## Hecho en Fase 1 (UI — Estructura organizacional)
Pantalla `/estructura` completamente funcional dentro del shell premium.
- **`@lyra/ui` (+3 componentes):** `Chip` (badge semántico, 6 variantes, dual theme), `Table`
  (sortable, skeleton rows, slot vacío, dual theme, CSS Modules), `Select` (mismo patrón que Input).
- **Backend**: `DELETE /structure/levels/:id` añadido (bloquea si hay nodos activos con ese nivel;
  auditoría append-only).
- **Capa de datos** (`structure-api.ts` + `structure-queries.ts`): 7 llamadas tipadas contra
  `@lyra/contracts` + hooks TanStack Query para niveles y árbol, con mutaciones e invalidación de caché.
- **StructurePage**: gateada por `module:structure:view`; header con acciones gateadas por permiso;
  skeleton de carga; EmptyState para árbol vacío; aviso si no hay niveles configurados.
- **OrgTree**: árbol recursivo expandible/colapsable (estado local), `Chip` de nivel, menú `⋮`
  por nodo con acciones gateadas por permiso (`orgnode:create/edit/delete`).
- **NodeDrawer**: crear nodo raíz / hijo / editar — RHF + Zod del contrato; select de niveles; campo
  código opcional.
- **LevelsDrawer**: tabla de niveles con edición inline + crear + eliminar (gateado por
  `orglevel:manage`).
- **DeleteNodeModal**: confirmación con aviso si el nodo tiene hijos.
- **MoveNodeModal**: árbol compacto para reparentar; pre-deshabilita el propio nodo y sus
  descendientes usando `path.startsWith()` (misma lógica que el backend).
- **i18n**: namespace `structure` completo (es-CL); `common` consolidado con claves `edit/delete/errorGeneric`.
- **Smoke en vivo**: API health ✅, GET tree ✅, POST node ✅, PATCH rename ✅, DELETE 204 ✅,
  DELETE level bloqueado con 400 ✅, DELETE level vacío 204 ✅.

## Verificación de la Fase 1 (UI — Estructura)
- `pnpm typecheck` · `pnpm lint` · `pnpm build` (1849 módulos) → OK en 6 paquetes.
- `pnpm test` → 63 tests (API 58, permissions 5, contracts) — sin cambios en tests.
- **Smoke via API** completo (ver arriba). **Pendiente:** smoke VISUAL en el navegador (abrir
  `/estructura`, crear nodo, abrir drawer, cambiar niveles, mover nodo, eliminar) — ver BACKLOG §4.

## Hecho en Fase 1 (UI — Estructura v2: master-detail premium + seed real)

- **@lyra/ui — Menu portal**: el panel del `Menu` se renderiza via `createPortal` en `document.body`
  con `position:fixed`. Soluciona definitivamente el recorte por `overflow:hidden` en cualquier
  contenedor padre. El detector de click-fuera usa refs separados (trigger + panel).
- **Layout master-detail de dos paneles** (patrón SAP PM / Maximo):
  - Panel izquierdo (260 px): árbol de navegación puro — selección + expandir/colapso,
    dot de color por nivel (índigo/cián/verde), badge de hijos, auto-expand del path al navegar.
  - Panel derecho: `NodeDetail` con breadcrumb clicable, header (icono de nivel + nombre + Chip
    + código), acciones de la barra (Editar / Mover / Eliminar gateados por permiso), tabla de
    hijos directos con CRUD inline, placeholder "Equipos — próximamente" para el nivel final.
  - No más menú ⋮ por nodo: las acciones están en el panel, con contexto y espacio suficiente.
- **Seed de 2 plantas reales** (REMANUFACTURE PLANT + TREATMENT PLANT): 3 niveles
  (Planta/Area/Proceso) y 49 nodos reales del sistema de referencia. Idempotente: solo crea si
  no existen nodos; limpia niveles huérfanos si el árbol está vacío.
- **i18n**: claves `structure.tree.*`, `structure.detail.*`, `common.add`.
- **Verificación**: `typecheck`/`lint`/`build` (1851 módulos) OK. Pusheado a `origin/main`.
- **Pendiente:** smoke VISUAL en el navegador (seleccionar nodo, navegar breadcrumb, CRUD inline
  desde detalle, verificar botón Equipos placeholder, modo claro y oscuro) — ver BACKLOG §4.

## Hecho en Fase 1 (Estructura — externalCode + Table fix)

- **`externalCode` en OrgNode**: campo nullable para integración con ERP/CMMS/SCADA.
  - Migración `20260607212602_add_org_node_external_code` (columna `externalCode String?`).
  - `@lyra/contracts`: campo en `orgNodeSchema`, `createOrgNodeRequestSchema`, `updateOrgNodeRequestSchema`.
  - `structure.service.ts`: pasa `externalCode` en create/update, lo incluye en `buildTree` DTO.
  - `NodeDrawer.tsx`: campo "Cód. externo" opcional (después de `code`), i18n + hint.
  - `NodeDetail.tsx`: badge "EXT + código" en el header del nodo; columna "Cód. ext." en la tabla de hijos.
  - `es-CL.ts`: claves `externalCode`, `externalCodeDesc`, `externalCodePlaceholder`.
- **`@lyra/ui — Table`**: fix TypeScript `Object is possibly 'undefined'` en `getPageNumbers`.
- **Verificación**: `typecheck`/`lint`/`build` (API + web + contracts) OK en todos los paquetes.

## Próximo paso
**Sesión siguiente = Fase 1 · UI de Seguridad** (usuarios/roles/permisos + reset MFA de admin) sobre `/security/*`.
**Sesión después = Fase 1 · Módulo Equipos** (modelo `Equipment`, migration, CRUD en NodeDetail).

**Puntos B/C/D de integración pendientes de análisis** (ver memoria `integration-pending.md`):
- B: CSV import/export de estructura
- C: API Keys (m2m para sistemas externos)
- D: Webhooks en cambios de estructura
