# Progreso — Lyra WatchLog

Última actualización: 2026-06-08 (Fase 1 — backend ✅; **UI: Login + cimientos ✅**; **Recuperación de contraseña ✅**; **MFA self-service ✅**; **App Shell / Workspace premium ✅**; **UI Estructura organizacional ✅** — layout master-detail premium + UX responsivo + `description`/`reportOrder`; **Módulo Equipos ✅** (CRUD + categorías configurables + `ExternalReference` integration-ready a nivel de modelo) → **Estructura CERRADA**; **UI de Seguridad ✅** (usuarios/roles/política/auditoría + reset MFA de admin) → **Fase 1 funcionalmente completa**; **siguiente: Fase 2 — Plantillas / Form Builder**).

## Estado por fase

| Fase | Módulo | Estado |
|---|---|---|
| 0 | **Cimientos** (monorepo, Docker, Design System tokens, contratos, API health) | ✅ Hecho |
| 1 | Seguridad (auth + RBAC/ABAC) + Estructura organizacional + AuditLog | ✅ Backend ✅ · UI: Login ✅ · **Estructura ✅ (+ Equipos ✅)** · **Seguridad ✅** |
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
| Equipos (CRUD + categorías + refs externas modelo) | 1 | ✅ API + UI |
| Seguridad / roles / permisos (nueva) | 1 | ✅ API + UI (usuarios/roles/política/auditoría + reset MFA de admin) |
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

## Hecho en Fase 1 (Estructura — UX: layout responsivo, splitter, description, reportOrder)

Sesión de pulido de UX del mantenedor de Estructura (ver DECISIONS 2026-06-08). 4 commits en `origin/main`.

- **Workspace full-width y responsivo (token-first):** se eliminaron `max-width` (1320/1400px) +
  `margin:0 auto` + doble padding. Tokens de layout nuevos en `@lyra/ui` (`--layout-content-pad-x/y`,
  `--layout-tree-width`) + breakpoints mobile <768 / tablet-desktop / wide >1920. El árbol crece
  260→300→320px y el detalle usa todo el resto.
- **`ResizableSplit` en `@lyra/ui`** (reemplaza `react-resizable-panels`, que recortaba el contenido y
  ponía topes): split horizontal propio sin dependencia — ancho izq. en px (contenido con ellipsis, no
  recorte), divisor con mouse/teclado/táctil, doble clic resetea, persistencia en `localStorage`,
  re-clamp con `ResizeObserver`. Bundle −32 KB. Reutilizable en cualquier pantalla de dos paneles.
- **`description` en `OrgNode` (full-stack):** migración `…_add_orgnode_description`, contratos,
  service (create/update/buildTree), `NodeDrawer` (textarea), segunda línea en árbol y grilla, y en el
  header del detalle. Descripciones de demo (remanufactura de madera) en `prisma/structure-descriptions.ts`
  (fuente única) + backfill no destructivo (`db:backfill-descriptions`, 49 nodos).
- **`reportOrder` en `OrgNode` (orden en informes, relativo a hermanos):** migración
  `…_add_orgnode_report_order` (`Int @default(0)`), contratos, service; `getTree` ordena por
  `(reportOrder asc, name asc)` (árbol + grilla). `NodeDrawer` campo numérico; **edición inline** en la
  grilla (persiste con `useUpdateNode` en blur/Enter). Orden inicial escalonado (10,20,30…) por hermanos
  vía helper único `prisma/report-order.ts` (seed + backfill `db:backfill-report-order`, 49 nodos).
- **Grilla de hijos ordenable:** `NodeDetail` mantiene estado de sort y ordena hijos localmente
  (nombre/orden/código/cód. externo); el `Table` ya era controlado. Densidad de tabla reducida
  (padding 14→10, th 10→8) con `min-height:44px` por fila (área táctil).
- **Dev server fijado a 5173:** `strictPort:true` + `predev` `scripts/free-port.mjs` (libera el puerto
  antes de arrancar, cross-platform).
- **i18n:** claves `structure.node.description*` y `structure.node.reportOrder*`.
- **Fix responsivo del header del detalle** (post smoke visual): en paneles angostos (tablet / splitter
  arrastrado) los botones Editar/Mover/Eliminar aplastaban la columna de info y la descripción caía
  "una palabra por línea". `.nodeInfo` con `min-width:220px` + `.nodeHeader` con `flex-wrap`: las
  acciones bajan a su propia fila cuando no caben (flexbox, sin breakpoint mágico).
- **Verificación:** `typecheck` (web/api/contracts/ui) + build de producción OK; backfills verificados
  por consulta directa a BD (ELABORACION: reportOrder 10–90, descripciones pobladas). **Smoke VISUAL en
  navegador ✅** (el usuario confirmó: splitter, 2ª línea en árbol y grilla, orden de columnas, edición
  inline del orden, full-width y comportamiento en iPad tras el fix del header).

## Hecho en Fase 1 (Módulo Equipos — cierra Estructura)

Reemplaza el placeholder "Equipos — próximamente" del nivel final por un CRUD real. Ver DECISIONS
2026-06-08 (modelo integration-ready + alcance de integración).

- **`@lyra/contracts`**: `structure/equipment.ts` (schemas Zod + DTOs de `Equipment`,
  `EquipmentCategory` y tipos de `ExternalReference`); **5 permisos nuevos** en el catálogo
  (`equipment:view/create/edit/delete`, `equipmentcategory:manage`) → 25 claves totales.
- **Prisma** (migración `20260608195838_add_equipment_and_external_reference`): modelos `Equipment`,
  `EquipmentCategory`, `ExternalReference` + relaciones en `OrgNode`. Check constraints raw SQL:
  dueño polimórfico exclusivo en `ExternalReference` (orgNodeId XOR equipmentId) y criticidad 1–5.
- **API**: `EquipmentModule` (service + controller) → `GET/POST/PATCH/DELETE /structure/equipment`
  (filtro `?orgNodeId=`) + CRUD de categorías (`/structure/equipment/categories`), todo gateado por
  permiso y auditado. Mapeo de tag duplicado (P2002) → 400. **Guard nuevo en `deleteNode`**: bloquea
  borrar un nodo con equipos activos. **9 tests** del service.
- **Seed** (dev): catálogo de 12 categorías (madera) idempotente + 9 equipos de ejemplo en procesos
  reales, con orden escalonado. `equipment-seed-data.ts` como fuente única.
- **Web** (`features/structure/`): `equipment-api`/`equipment-queries` (TanStack Query); `EquipmentDrawer`
  (molde NodeDrawer: tag, categoría, fabricante/modelo/serie, criticidad, toggle de estado, orden,
  descripción); `CategoriesDrawer` (molde LevelsDrawer, edición inline + toggle activo); **`EquipmentSection`**
  reemplaza el placeholder en `NodeDetail` (grilla `Table` sortable + edición inline del orden + chip
  de criticidad por severidad + chip de estado + descripción 2ª línea + delete modal). i18n namespace
  `equipment` (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores)/`build` (web 1859 módulos)/`test` (**API 67**, +9;
  permissions 5; contracts) en verde. **Smoke en vivo** (API + demo): listar categorías (12) y equipos
  seed; crear/editar/borrar (lógico) equipo; **400** sin `orgNodeId`, tag duplicado, criticidad fuera de
  rango (check de BD) y nodo inexistente; **deleteNode** bloqueado con equipos activos (400); categoría
  en uso no borrable (400), CRUD de categoría OK; **check constraint polimórfico de `ExternalReference`
  verificado en BD** (ambos-nulos→falla, uno→OK, ambos→falla).
- **Pendiente:** smoke **VISUAL** en navegador (seleccionar nodo de nivel Proceso → grilla de equipos,
  alta/edición vía drawer, orden inline, gestión de categorías, modo claro) — ver BACKLOG §4.
- **Home — tarjetas navegables:** el mapa de módulos del `HomePage` ahora **enlaza** las tarjetas con
  pantalla disponible (Estructura → `/estructura`, "Disponible") o en construcción (Seguridad →
  `/seguridad`, "En construcción"), gateadas por permiso de módulo; las no iniciadas siguen como
  "Pronto" no clicables. `navigation.ts`: Estructura deja de marcarse `soon` (ya construida), así el
  sidebar tampoco la muestra como "Pronto".

## Hecho en Fase 1 (UI — Seguridad: usuarios/roles/política/auditoría)

Consume el backend de seguridad ya existente. Ver DECISIONS 2026-06-08. La UI solo oculta/deshabilita
(el backend decide), permisos desde el catálogo de `@lyra/contracts` (nunca hardcodeados), dual theme, i18n es-CL.

- **`@lyra/contracts`**: nuevo `auditLogEntrySchema` + `AuditLogEntry` (+ test de consistencia, 8 tests en
  contracts). `scopeEntrySchema.includeDescendants` pasa a explícito (sin `.default`) por correctitud de
  tipos input/output en el cliente.
- **API (solo tipado)**: `GET /security/audit` ahora retorna `AuditLogEntry[]` tipado (mapeo `occurredAt`→ISO).
  Sin cambio de comportamiento en el cable.
- **`@lyra/ui` (+1 primitivo)**: `Checkbox` (CSS Module sobre tokens, dual theme, área 44px, **estado
  indeterminado** para selección de grupo).
- **Navegación (sub-rutas anidadas, una pestaña por módulo)**: `/seguridad` = `SecurityLayout` (sub-tabs +
  `Outlet`); sub-rutas reales `/seguridad/{usuarios,roles,politica,auditoria}` deep-linkables, cada una
  gateada por permiso; índice redirige a la 1.ª permitida. Helpers `routeForPath`/`isRouteActive` en
  `navigation.ts` + ajustes en AppShell/WorkspaceTabs/Topbar/Sidebar (match por prefijo). Seguridad deja de
  ser `soon`; Home la marca "Disponible".
- **Capa de datos** (`security-api.ts` + `security-queries.ts`): llamadas tipadas contra contracts + hooks
  TanStack Query (usuarios, roles, catálogo de permisos, política, auditoría con `useInfiniteQuery`).
- **Usuarios** (master-detail con `ResizableSplit`): `UsersPage` (lista buscable) + `UserDetail`
  (**pestañas** Datos/Roles/Alcance/Seguridad, cada una con guardado independiente: datos básicos, **roles**,
  **alcance de datos** vía `ScopeTreePicker`, **Seguridad** = reset de contraseña + estado/reset de MFA) +
  `UserDrawer` (alta con contraseña temporal + generador) + `ResetMfaModal` + `ResetPasswordModal`.
- **Reset de contraseña por admin** (post-revisión, ver DECISIONS 2026-06-08): variante A estilo AD —
  contraseña temporal + cambio forzado + revoca sesiones + audita, **sin tocar MFA**. Permiso nuevo
  `user:reset-password` (catálogo **26**), endpoint `POST /security/users/:id/reset-password`, UI en la
  pestaña *Seguridad*. **3 tests** nuevos del `AuthService`.
- **Roles**: `RolesPage` (tabla + borrado gateado, system no borrable) + `RoleDrawer` + `PermissionMatrix`
  (agrupada por `group` del catálogo, checkbox de grupo con indeterminado, `requireMfa`).
- **Política**: `PolicyPage` (RHF+Zod): contraseñas (longitud/complejidad/historial/expiración), bloqueo por
  intentos y **`mfaMode` global** con descripción por modo.
- **Auditoría**: `AuditPage` (tabla solo-lectura, chip por verbo de acción, "cargar más" por cursor, modal de
  detalle con diff `before`/`after`/`metadata`).
- **i18n**: namespace `security` completo (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web 1882
  módulos)/`test` (**contracts 8** +3 audit · permissions 5 · **API 70** +3 del reset de contraseña por admin)
  en verde. **Smoke en vivo** (usuario demo con **26** permisos): `GET users/roles/permissions(26)/password-policy`
  → 200; **auditoría con la nueva forma de contrato** (`occurredAt` ISO string, `before/after/metadata`,
  `take`/cursor); **round-trip de rol** crear→leer→borrar 204→404; **reset de contraseña por admin** end-to-end
  (reset 201 · débil 400 · `forcePasswordChange=true` · vieja 401 · temporal autentica con cambio forzado ·
  `auth.password.admin_reset` auditado). *Nota:* el reset se probó contra una instancia **fresca** del API
  (la que corría en :3000 era un build previo sin la ruta nueva).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): navegar sub-tabs, alta/edición de usuario,
  asignar roles/scope, reset MFA, CRUD de roles + matriz, editar política, leer auditoría + diff, modo claro.

## Próximo paso
**Fase 1 funcionalmente completa** (auth + RBAC/ABAC + Estructura + Equipos + UI de Seguridad).
**Sesión siguiente = Fase 2 · Plantillas / Form Builder + Bitácoras.**

**Mejora futura registrada (BACKLOG §2):** seguridad a nivel de nodo en el mantenedor de Estructura (ABAC
enterprise: asignar usuarios/roles a nodos desde el propio árbol, "quién accede a este nodo"). El modelo ya
existe; falta la UI node-centric, complementaria a la asignación de scope por usuario ya entregada.

**Puntos B/C/D de integración pendientes de análisis** (ver memoria `integration-pending.md`):
- B: CSV import/export de estructura
- C: API Keys (m2m para sistemas externos)
- D: Webhooks en cambios de estructura
