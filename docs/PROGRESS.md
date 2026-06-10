# Progreso — Lyra WatchLog

Última actualización: 2026-06-09 (**Fase 1 completa**; **Fase 2.1 ✅** + **Fase 2.1.1 ✅** + **Fase 2.2 ✅** +
**Fase 2.x ✅** + **Fase 2.3.0 ✅** — Plantillas: modelo de DEFINICIÓN + campo en 3 capas + `optionSource` + Form
Builder; **Flujos reutilizables `WorkflowDefinition`**; **Datos de referencia `ReferenceList`/`ReferenceItem`**:
catálogo gobernado + mantenedor `/datos-referencia` + binding real; **Calendario operacional `OperationalCalendar`**:
turnos + día operacional + periodo contable + `ShiftResolver` + mantenedor `/calendario-operacional`).
**Siguiente: Fase 2.4 — Llenado (Nueva entrada)**, que estampará las dimensiones derivadas vía `ShiftResolver`.

## Estado por fase

| Fase | Módulo | Estado |
|---|---|---|
| 0 | **Cimientos** (monorepo, Docker, Design System tokens, contratos, API health) | ✅ Hecho |
| 1 | Seguridad (auth + RBAC/ABAC) + Estructura organizacional + AuditLog | ✅ Backend ✅ · UI: Login ✅ · **Estructura ✅ (+ Equipos ✅)** · **Seguridad ✅** |
| 2 | Plantillas / Form Builder + Bitácoras | 🔄 **2.1 ✅** + **2.1.1 ✅** + **2.2 ✅** + **2.x ✅** + **2.3.0 ✅** (Form Builder + Flujos + Datos de referencia + Calendario operacional) · 2.4–2.7 pendientes |
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
| Plantillas (Form Builder) | 2 | ✅ **2.1** API + UI (definición: secciones/campos/umbrales/permiso por sección/borrador-publicar) |
| Nueva entrada / Llenado | 2 | ⬜ (2.4) |
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
- **Pulido UX post-revisión**: `ScopeTreePicker` con **buscador** (poda el árbol a coincidencias + ancestros,
  auto-expande, sin acentos/mayúsculas) + **resumen de seleccionados** (chips removibles + limpiar), para
  árboles extensos. Pestaña *Alcance* preparada como **multi-dimensión** (encabezado "Estructura
  organizacional"; las plantillas se sumarán como sección hermana en Fase 2). **Buscador** en la pestaña de
  *Roles* (filtra por nombre/clave/descripción) y **buscador en la matriz de permisos** del editor de rol
  (`PermissionMatrix`: filtra por clave/descripción/grupo, sin acentos; el "seleccionar grupo" opera sobre lo
  visible filtrado).
- **Auditoría filtrable (para auditores)**: backend `GET /security/audit` extendido con filtros **rango de
  fechas** (`from`/`to`), **acción**, **actor** y **tipo de entidad** (coincidencia parcial insensible a
  mayúsculas, vía `where` de Prisma). UI con barra de filtros (fechas + texto + select de entidad), **atajos
  de rango** (24 h / 7 d / 30 d), conteo de resultados y debounce; la query de TanStack se rekeyea por
  filtros. Contrato `AuditFilters`. Smoke en vivo: `action=login` → todos con "login"; `entityType=Role` →
  todos Role; `from=hoy` acota; rango futuro → 0.
- **Exportación CSV** (transversal, anticipada): **Auditoría** exporta **server-side el set completo filtrado**
  (`GET /security/audit/export`, gateado por `audit:read`) — `AuditService.findForExport` itera por cursor en
  lotes (tope `EXPORT_MAX_ROWS=100k`, header `X-Export-Truncated`), CSV RFC 4180 + BOM UTF-8 (helper
  `common/csv.ts`), `Content-Disposition` con nombre fechado. **Usuarios** y **Roles** exportan el listado
  cargado (CSV cliente, `lib/download.ts` + `lib/api-client.apiBlob`). i18n `common.export`. Smoke en vivo:
  CSV con cabeceras, JSON escapado y filtros respetados (`entityType=Role` → 3 filas). PDF y export del resto
  de módulos quedan para Fase 7.
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

## Hecho en Fase 2.1 (Plantillas: modelo de definición + contratos + Form Builder)

Primer slice de la Fase 2. SOLO el lado **definición** (sin llenado/flujos/rondas). Arquitectura en
DECISIONS 2026-06-09; 4 forks resueltos con la opción recomendada. 3 commits (modelo+contratos+permisos /
backend / UI).

- **Prisma** (migración `20260609133247_add_template_definition`): `Template` (contenedor mutable) 1—N
  `TemplateVersion` (inmutable al publicar, patrón MMR Part 11) → `TemplateSection` (unidad atómica de
  permiso/llenado/firma) → `TemplateField`; joins `TemplateSectionRole` + `TemplateFieldRole` (override).
  Enums `TemplateStatus`/`TemplateVersionStatus`/`FieldType` (8 núcleo + SEVERITY/SIGNATURE)/`RecurrenceKind`.
  Referencias a flujo/firma/recurrencia como **columnas** (editores 2.2/2.3, sin re-migrar). Ejecución → 2.4.
- **Contratos** (`@lyra/contracts/templates`): unión de `config` por tipo (`fieldConfigSchemaFor`),
  **NÚMERO con bandas de umbral ISA-18.2** (`warn*`/`crit*`), `visibleWhen`, DTOs y requests
  (create/patch/**saveDraft** bulk/publish/list). **+7 specs** (config por tipo, min>max, claves duplicadas).
- **Permisos** (catálogo **26→33**): `module:templates:view/manage` + `template:view/create/edit/publish/delete`.
  Seed re-sincroniza y los asigna al rol admin (demo los tiene).
- **Backend** `TemplatesModule`: `GET/POST /templates`, `GET /templates/:id`, `PATCH :id`, `PUT :id/draft`
  (save bulk validado por contrato), `POST :id/publish` (congela + fija `currentVersionId`), `DELETE :id`
  (lógico). Gateado por permiso, **auditado**, **validación de config contra el tipo en backend**, alcance
  **ABAC** al listar (`ScopeService`). Inmutabilidad: editar publicada **clona** un borrador nuevo. **+7 tests**.
- **`@lyra/ui`**: primitivo **`Textarea`** (dual-theme sobre tokens). El resto de componentes se reusó.
- **Web** (`features/templates/`, anclado al prototipo): **TemplatesPage** (grilla de cards con nodo/estado/
  conteos/versión, buscador, filtro de estado, estados vacíos/carga/error, alta por modal, borrado) y
  **TemplateBuilder** (3 columnas: paleta de objetos / lienzo de secciones+campos con reordenar / panel de
  config; editores núcleo + umbrales + opciones + condicional + roles por sección + firma opt-in; **vista
  previa** que refleja `FieldRender`; **Guardar borrador** y **Publicar** con confirmación). Navegación
  (`/plantillas`, `/plantillas/:id`) + i18n namespace `templates` (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web **1901
  módulos**)/`test` (**contracts 15** +7 · permissions 5 · **API 77** +7) en verde. **Smoke en vivo** (demo):
  crear→guardar borrador (1 sección, 2 campos)→**config inválida para el tipo ⇒ 400**→publicar (PUBLISHED +
  `currentVersionId` + v1)→listar (conteos + publishedV)→editar publicada ⇒ **clona borrador v2**→borrar 204→
  ausente del listado. DB de demo limpia tras el smoke.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/plantillas`, crear, builder (agregar
  sección/campos, umbrales, reordenar, roles por sección, condicional), vista previa, publicar, modo claro.

## Hecho en Fase 2.1.1 (Endurecimiento de modelo — ADITIVO, antes del llenado)

Refina el modelo de campo a **3 capas** y los datos de referencia, ANTES de 2.4 y sin datos de ejecución.
Todo aditivo/no destructivo. Ver DECISIONS 2026-06-09 (entrada "2.1.1 implementado"). Rama `feat/plantillas-2.1.1`.

- **Contratos** (`@lyra/contracts/templates`): enums `FieldDataType` (12 valores) y `FieldSemanticRole` (4, nullable);
  `deriveDataType(type)` (mapeo único `FieldType→FieldDataType`); **`optionSource`** discriminado
  (`inline`/`referenceList`/`external`) con `preprocess` que **sube el `options[]` legacy** a `inline`;
  `upgradeFieldConfig(type,config)` reutilizable; `templateFieldSchema` gana `dataType`+`semanticRole`,
  `draftFieldInputSchema` gana `semanticRole?`; validación **≤1 `EFFECTIVE_DATE` por versión**. **+8 specs**.
- **Prisma** (migración `20260609155007_add_field_layers`): enums + `TemplateField.dataType`/`semanticRole`,
  backfill de `dataType` desde `type`, `SET NOT NULL`. Aplicada con `migrate deploy` (esquiva el EPERM del DLL
  con el watch vivo); cliente regenerado (los `.d.ts`, suficiente para typecheck).
- **Backend** (`TemplatesService`): `saveDraft` **deriva `dataType`** y persiste `semanticRole`; `mapVersion`
  **normaliza el config al leer** (`upgradeFieldConfig`); `ensureDraft` clona ambos + normaliza. **+1 test**
  (deriva capas 2/3). El valor de referencia se documenta como **`code` estable, no label**.
- **Web** (Form Builder): editor de opciones inline ahora escribe `optionSource.inline.items` (`code`/`label`);
  **toggle "Fecha efectiva del registro"** en DATE/DATETIME (único por versión: marca una, desmarca las demás);
  `dataType` oculto/derivado; `FieldPreview`/`builder-model` migrados a `optionSource`. i18n es-CL nuevas claves.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores, 1 warning preexistente en OrgTree) · `build`
  (web **1901** módulos; API NO se buildea por el watch) · `test` (**contracts 23** +8 · permissions 5 · **API 78** +1)
  en verde. **Smoke en vivo** (demo): crear → guardar (DATE effectiveDate + SELECT optionSource inline + NÚMERO) →
  leer (`dataType` DATE/CODE/NUMBER derivado, `semanticRole=EFFECTIVE_DATE`, `optionSource` normalizado) → escribir
  shape legacy `options[]` ⇒ se sube a `inline` al leer → **2× EFFECTIVE_DATE ⇒ 400** → borrar 204. Datos de prueba
  limpiados.
- **Pendiente**: smoke **VISUAL** en navegador (toggle fecha efectiva, editor de opciones inline) — ver BACKLOG §4.

## Hecho en Fase 2.2 (Flujos reutilizables — `WorkflowDefinition`)

Máquina de estados configurable (estados + transiciones), NO BPMN, integrada al RBAC dim. 3. Solo lado
DEFINICIÓN (la ejecución sigue diferida a 2.4/2.5). Ver DECISIONS 2026-06-09 ("Fase 2.2 implementado"). Rama
`feat/workflows`, 5 commits (contratos+permisos / migración / backend+binding / web mantenedor / web form builder).

- **Contratos** (`@lyra/contracts/workflows`): `WorkflowDefinition` 1—N `WorkflowDefinitionVersion` (inmutable) →
  estados + transiciones (con `roleIds` por transición, firma+significado, MFA step-up). **`validateWorkflowMachine`**
  = fuente única de validación FSM (1 inicial, ≥1 final, claves únicas, refs válidas, alcanzabilidad, sin trampas),
  usada por contrato + backend + builder web. DTOs y requests create/update/saveDraft(bulk)/publish/list. **+13 specs**.
- **Permisos** (catálogo **33→37**): `module:workflows:view/manage` + `workflow:view/manage`. La autorización por
  transición es DATO (`WorkflowTransitionRole`), no clave. Seed los asigna al rol admin.
- **Prisma** (migración aditiva `20260609163822_add_workflow_definition`): modelos Workflow* + enums + **FK desde
  `TemplateVersion`** (reemplaza las columnas string de 2.1, `onDelete: Restrict`). 100% aditiva (CREATE + ADD
  CONSTRAINT sobre columnas en null). Aplicada con `migrate deploy` (esquiva el EPERM del DLL con el watch vivo).
- **Backend** `WorkflowsModule`: CRUD gateado/auditado con patrón clonar-borrador-al-editar e inmutabilidad al
  publicar (espejo de `TemplatesService`); valida la máquina en backend (al guardar y al publicar); `remove`
  bloquea flujos en uso. **`TemplatesService.saveDraft`** resuelve/valida el binding del flujo (existe, publicado,
  versión vigente) y que cada `editableInStateKey` de sección sea un estado de esa versión; preserva el binding al
  clonar. Contrato `saveTemplateDraft` gana `workflowDefinitionId/VersionId`. **+10 tests** (WorkflowsService).
- **Web** `features/workflows`: **WorkflowsPage** (grilla de cards estilo Plantillas) + **WorkflowBuilder** (editor
  declarativo de estados [inicial único/final/color] y transiciones [from→to, firma, MFA, roles permitidos] con
  **validación FSM en vivo**; publicar deshabilitado si es inválida; borrador/publicar). Navegación `/flujos` gateada
  por `module:workflows:view`, i18n namespace `workflows`. **Form Builder** ampliado: selector de flujo publicado +
  mapeo sección→estado (`editableInStateKey`) + **editor de override de rol por campo** (`TemplateFieldRole`).
- **Degradación elegante:** una plantilla sin flujo (`workflowDefinitionId = null`) se comporta como form simple
  (ninguna sección declara estado; todas siempre editables).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web **1911** módulos;
  API NO se buildea por el watch)/`test` (**contracts 36** +13 · permissions 5 · **API 88** +10) en verde. **Smoke en
  vivo** (demo): flujo crear→borrador→máquina inválida 400→publicar (congela)→listar→borrar 204; binding
  plantilla↔flujo (estado válido persiste; estado inexistente / versión no vigente / flujo EN USO → 400). Datos de
  prueba limpiados (hard-delete).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/flujos` (grilla, crear, builder con estados/
  transiciones/roles/firma/MFA, validación en vivo, publicar), y en el Form Builder asignar flujo + mapear
  secciones→estados + override de rol por campo; modo claro.

## Hecho en Fase 2.x (Datos de referencia / Listas — `ReferenceList`/`ReferenceItem`)

Hace REAL el `optionSource.referenceList` de 2.1.1. Catálogo **gobernado** (NO versionado-inmutable como
Plantillas/Flujos): valor = **code estable, no label** (patrón dimensión DW / FHIR Coding). Ver DECISIONS
2026-06-09 ("Fase 2.x implementado"). Rama `feat/datos-referencia`, 5 commits.

- **Contratos** (`@lyra/contracts/reference-data`): `ReferenceList`/`ReferenceListDetail`/`ReferenceItem` +
  `ReferenceSource` (MANUAL|EXTERNAL) + `key` slug estable + `metadata` jsonb freeform + DTOs/requests CRUD +
  **`ResolvedOption`** (code/label/metadata) para el preview/llenado. **+5 specs**.
- **Permisos** (catálogo **37→41**): `module:referencedata:view/manage` + `referencelist:view/manage`. El seed los
  asigna al rol admin (itera el catálogo, sin código nuevo).
- **Prisma** (migración aditiva `20260609205303_add_reference_data`): `ReferenceList` (key único + active + sortOrder
  + `deletedAt` lógico) 1—N `ReferenceItem` (`@@unique([listId, code])` + metadata jsonb, FK `onDelete: Cascade`).
  Aplicada con `migrate deploy` (esquiva el EPERM del DLL con el watch).
- **Backend** `ReferenceListsModule` (`/reference-lists`): CRUD de listas e ítems gateado/auditado (molde
  `EquipmentService`, NO Template); `GET :idOrKey/resolve` (ítems activos ordenados); **guard "en uso"** al borrar
  lista (consulta JSONB de `TemplateField.config`); P2002 → 400 (key/code duplicado). `TemplatesService.saveDraft`
  **valida el binding** (cada `optionSource.referenceList.listKey` apunta a una lista viva), espejo del binding de
  flujo. **+8 tests** (`ReferenceListsService`).
- **Web** `features/reference-data`: capa de datos TanStack Query + **mantenedor master-detail** (`ResizableSplit`):
  lista de Listas + panel de detalle con grilla de ítems (activar/desactivar, **orden inline**, editar, eliminar);
  **drawers** de lista e ítem (con **editor de metadata key-value** que infiere número/booleano/texto). Navegación
  `/datos-referencia` gateada por `module:referencedata:view`, i18n namespace `referenceData`. **Form Builder**
  ampliado: SELECT/MULTISELECT con selector de **fuente** (inline ↔ Lista de Referencia); la **vista previa resuelve**
  opciones desde la lista (muestra label, guarda code). **Degradación elegante:** un SELECT inline sigue idéntico.
- **Seed demo** (dev): `failure-modes` (8 modos ISO 14224 con metadata `isoCategory`) + `shifts` (3 turnos),
  idempotente. Fuente única `prisma/reference-data-seed.ts`.
- **Verificación**: typecheck (6 paquetes)/lint (0 errores; 1 warning preexistente en OrgTree)/build web (**1921**
  módulos; API NO se buildea por el watch)/test (**contracts 44** +5 · permissions 5 · **API 97** +8) en verde.
  **Smoke en vivo** (demo): CRUD lista/ítem; key duplicada 400; code duplicado por lista 400; resolve excluye
  inactivos y conserva metadata; binding en `saveDraft` (listKey inexistente 400 / válido 200); lista EN USO no se
  borra 400; seed resuelve (failure-modes 8 ítems + metadata, shifts 3). Datos ad-hoc limpiados; listas del seed
  quedan como demo dev-only.
- **Endurecimiento UX (mismo día, pedido del usuario):** grilla de ítems **enterprise** (buscador code/label/
  metadata + filtro de estado + columnas ordenables + paginación + conteo + metadata en chips; orden inline remonta
  con el valor del servidor). Nuevo primitivo **`@lyra/ui` `Combobox`** (single-select buscable con portal + teclado
  + clearable + reposición en scroll). El selector de Lista del Form Builder y la vista previa (SELECT→`Combobox`,
  MULTISELECT→`MultiSelect`) pasan a objetos premium que **escalan a listas largas**. Ver DECISIONS 2026-06-09
  ("endurecimiento UX"). Verificado: typecheck/lint (0 errores)/build web (**1923** módulos)/test (contracts 44 ·
  permissions 5 · API 97) + resolve en vivo OK.
- **Fix + LookupPicker (mismo día, hallazgo del smoke visual del usuario):** los paneles de `Combobox`/`MultiSelect`
  se **cortaban** al borde del viewport (siempre abrían hacia abajo) → `panelPlacement` compartido con **flip-up**
  + clamp de altura. Nuevo primitivo **`@lyra/ui` `LookupPicker`** (patrón **SAP Value Help / Salesforce Lookup**):
  diálogo con búsqueda + **tabla paginada/sortable** (código/etiqueta/detalle) + selección borrador con checkbox
  aplicada al confirmar + **tokens removibles con ×** bajo el campo. La vista previa de un MULTISELECT ligado a una
  Lista usa `LookupPicker` (metadata como columna detalle); inline corto mantiene `MultiSelect`. Además, **análisis
  crítico industrial** del módulo (ISO 14224 / RDM / FHIR ConceptMap): base correcta, gaps aditivos registrados como
  **roadmap priorizado** en BACKLOG §2 (CSV import/export = primer quick-win; jerarquía; metadata tipada; cascada y
  resolve paginado con 2.4; crosswalks con Fase 3). Ver DECISIONS 2026-06-09 (2 entradas nuevas).
- **Import/Export CSV de ítems (sesión 2026-06-09, quick-win 1 del roadmap industrial):** export server-side
  (BOM UTF-8, **`;` para Excel es-CL**, metadata **aplanada** `metadata.<clave>`, nombre fechado) + import en
  **2 fases dry-run→commit** (patrón SAP LSMW / Salesforce Data Loader): upsert por `code`, validación por fila con
  nº de línea (longitudes, duplicados, active/sortOrder, metadata con inferencia de tipos), `deactivateMissing`
  opt-in (desactiva ausentes, nunca borra), tope `REFERENCE_IMPORT_MAX_ROWS` (env, 5000), commit **transaccional
  re-validado** (con errores no aplica) y **auditado** con el resumen. Parser RFC 4180 propio (`csv-parse.ts`) con
  auto-detección de delimitador; `toCsv` ganó parámetro de delimitador (Auditoría intacta). Web: botones
  Exportar/Importar + modal con preview del diff (chips de summary + tabla paginada). Tests: **contracts 46** ·
  **API 110** (+13). Smoke en vivo completo (export con metadata; dry-run con error → BD intacta; commit;
  re-import → unchanged; deactivateMissing). Ver DECISIONS 2026-06-09.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/datos-referencia` (crear lista, ítems con
  metadata, **buscar/ordenar/paginar** la grilla, filtro de estado, activar/desactivar, orden inline, eliminar) y en
  el Form Builder elegir una Lista en un SELECT (selector buscable) y ver la **vista previa resolver** (SELECT
  `Combobox` con flip-up cerca del borde; MULTISELECT con **`LookupPicker`**: diálogo, tabla, confirmación, tokens
  con ×); **CSV**: Exportar (abre en Excel es-CL en columnas), Importar (elegir archivo → analizar → reporte →
  aplicar); modo claro.

## Hecho en Fase 2.3.0 (Calendario operacional — turnos + periodo contable)

Configuración de primera clase, **pura config sin ejecución**, aditiva. Turno/día operacional/periodo son
**dimensiones DERIVADAS** del timestamp (patrón Shift Calendar de MES / SAP / ISA-95 / dimensión Fecha+Turno de
DW). Ver DECISIONS 2026-06-09 ("Fase 2.3.0 — IMPLEMENTADO"). Rama `feat/calendario-operacional`, 5 commits.

- **Contratos** (`@lyra/contracts/operational-calendar`): `OperationalCalendar` 1—N `OperationalShift` +
  `PeriodKind` (MONTH/WEEK/CUSTOM) + DTOs create/update/asignación/preview. **`validateOperationalCalendar`** =
  fuente única (contrato `superRefine` + backend + builder web en vivo): TZ IANA, turnos **sin solapes** (huecos
  permitidos), turno ancla del día, config de periodo. **`resolveShift`** = **función PURA** (solo `Intl`)
  `timestamp → (operationalDate, shiftCode, periodKey)`: día operacional ≠ día civil, cruce de medianoche por
  duración, periodo derivado. **30 specs** (DST Santiago invierno/verano, borde de mes con día-ancla, ciclo
  CUSTOM, WEEK configurable, huecos).
- **Permisos** (catálogo **41→45**): `module:opscalendar:view/manage` + `opscalendar:view/manage`. El seed los
  asigna al rol admin iterando el catálogo.
- **Prisma** (migración aditiva `20260609233155_add_operational_calendar`): enum `PeriodKind` + modelos +
  `OrgNode.operationalCalendarId` (FK `onDelete: SetNull`). Aplicada con `migrate deploy` (esquiva el EPERM del DLL).
- **Backend** `OperationalCalendarModule`: CRUD gateado/auditado (molde `ReferenceLists`); guardado reemplaza
  turnos en bloque; `isDefault` único en tx; **no se borra el default**; `assignNodes` (reemplaza set, valida
  existencia, limpia al borrar); `preview(id, at)`. **`ShiftResolver`** (clase abstracta = token DI, patrón
  `EmailService`) + `ShiftResolverService`: elige el calendario por nodo (path-walk → ancestro → default) y delega
  en `resolveShift`. **Exportado** para que 2.4 (estampa `LogEntry`), 2.3 Rondas y Fase 5 lo inyecten. **9 tests**.
- **Web** `features/operational-calendar`: `/calendario-operacional` master-detail (estilo Listas/Flujos);
  `CalendarDrawer` (alta key/nombre/TZ); `CalendarDetailPanel` (editor de turnos en filas + **timeline 24 h** con
  marcador del ancla + **banner de validación en vivo** + selector de turno ancla + definición de periodo
  MONTH/WEEK/CUSTOM + **PROBADOR** que resuelve fecha-hora→turno/día operacional/periodo en vivo con la función
  pura + asignación de nodos por modal sobre el árbol de Estructura). Navegación + Home + i18n namespace
  `opsCalendar` (es-CL), dual theme, tokens, 44px.
- **Seed demo** (dev): `mina-rajo` (America/Santiago, 3 turnos A/B/C de 8 h, día op. 07:00, periodo mensual día 1,
  default). Idempotente por `key`.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente en OrgTree) · `build` web
  (1,482 KB JS; API NO se buildea por el watch) · `test` (**contracts 76** +30 · permissions 5 · **API 119** +9) en
  verde. **Smoke en vivo** (demo, 45 permisos tras invalidar la caché Redis): listar (seed `mina-rajo`); **preview
  02:00 Santiago invierno (UTC-4) ⇒ día op. 2026-06-14 + turno C + periodo 2026-06** (DST + medianoche + mes
  correctos); 09:00 ⇒ turno A mismo día; **crear con solape ⇒ 400**; **borrar default ⇒ 400**; ciclo
  crear/preview-hueco(shiftCode null + CUSTOM key)/setDefault+restaurar/assign-nodos/borrar(204). Datos de prueba
  hard-deleted; `mina-rajo` queda como demo dev-only.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4).

## Próximo paso
**Fase 2.1 + 2.1.1 + 2.2 + 2.x + 2.3.0 completas.** **Sesión siguiente = Fase 2.4 · Llenado (Nueva entrada)
multi-actor**: secciones editables por estado+rol; guarda codes/refs + campos de sistema; **estampa las dimensiones
derivadas** (`recordedAt`, `effectiveAt` y, vía `ShiftResolver` ya disponible, `shiftCode`/`operationalDate`/
`periodKey`) como columnas indexadas inmutables en `LogEntry` (nullable si no hay calendario → degradación elegante).
Luego 2.3 Rondas (`LogPeriod`, se apoya en los turnos ya definidos), 2.5 ejecución de flujo + firmas, 2.6 bitácoras.
Ver BACKLOG §2.

**Mejora futura registrada (BACKLOG §2):** seguridad a nivel de nodo en el mantenedor de Estructura (ABAC
enterprise: asignar usuarios/roles a nodos desde el propio árbol, "quién accede a este nodo"). El modelo ya
existe; falta la UI node-centric, complementaria a la asignación de scope por usuario ya entregada.

**Puntos B/C/D de integración pendientes de análisis** (ver memoria `integration-pending.md`):
- B: CSV import/export de estructura
- C: API Keys (m2m para sistemas externos)
- D: Webhooks en cambios de estructura
