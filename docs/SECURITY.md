# Seguridad — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 0 — diseño; implementación en Fase 1).

Objetivo: pasar auditorías de ciberseguridad. Referencia: **OWASP ASVS**.

## 1. Autenticación

Construida **detrás de una abstracción con métodos enchufables**, para que cada instalación on-premise active lo que el cliente necesite **sin reescribir código**:

- **Local** (MVP, por defecto): email + contraseña.
  - Hash **Argon2id**.
  - **Access token** JWT de vida corta (~15 min) + **refresh token rotativo** en cookie `httpOnly` / `SameSite` / `Secure`. Revocación y detección de reuso.
  - **Protección contra fuerza bruta** + **bloqueo de cuenta** (Redis).
  - **MFA TOTP opcional** (el admin decide si lo exige).
  - **Política de contraseñas configurable** (longitud, complejidad, expiración).
  - **Recuperación self-service** por correo (token hasheado, single-use, TTL corto; respuesta
    neutra anti-enumeración; revoca todas las sesiones al cambiar). Ver §6.
  - **Expiración de sesión** configurable.
- **OIDC** (ranura lista; se activa por configuración): Azure AD / Entra ID, Google, Okta, Auth0, cualquier IdP OIDC.
- **LDAP / Active Directory** (fase posterior, solo si un cliente lo requiere).

Keycloak **descartado** para el MVP (complejidad operacional); si un cliente lo pide, entra como "otro proveedor OIDC" sin cambios en la app.

## 2. Autorización — RBAC + ABAC, 4 dimensiones

100% en base de datos y **administrable desde la UI** (nada hardcodeado). Permisos atómicos agrupados en roles + alcance de datos:

1. **Pantallas/módulos** — ej. `module:dashboard:view`, `module:security:manage`.
2. **Funcionalidades/acciones** — ej. `entry:create`, `entry:edit`, `incident:assign`, `template:publish`, `data:export`.
3. **Workflows** — permiso por transición: ej. `incident:transition:open->assigned`, `handover:deliver`, `handover:ack`.
4. **Datos (ABAC)** — `UserScope` ata usuario/rol a **nodos** de la estructura (con herencia a descendientes) y/o a **plantillas** específicas.

### Aplicación (regla de oro)
- **El backend SIEMPRE decide.** `PermissionsGuard` (NestJS) + decorador `@RequirePermission(...)` cubren dimensiones 1–3; un `ScopeService` aplica la dimensión 4 filtrando filas por `OrgNode`/template.
- **La UI solo oculta** (mejor UX), nunca es la fuente de verdad.
- El **catálogo de permisos** vive en `@lyra/contracts` (enum tipado), compartido por UI y backend.

## 3. Auditoría
- **AuditLog append-only / inmutable**: quién, qué, cuándo, valores antes/después. Cubre entradas, incidencias y configuración de seguridad.
- Edición de bitácoras: log de cambios con motivo obligatorio.

## 4. Secretos y datos sensibles
- Ningún secreto en el frontend.
- Credenciales de **orígenes de datos cifradas en reposo** (clave `DATA_SOURCE_ENC_KEY`); se usan solo en el servidor.
- Toda configuración por variables de entorno; `.env` fuera del repo (`.env.example` versionado).

## 5. Endurecimiento (transversal)
- Cabeceras de seguridad (Helmet ya activo), CSP/HSTS en producción (Caddy).
- Rate limiting (Redis), validación de entrada en backend con Zod (no se confía en el cliente).
- CSRF para flujos basados en cookies.
- Logs redactan `authorization`, `cookie`, `set-cookie`.

## 6. Recuperación de contraseña (self-service)

Implementada en Fase 1 según **NIST 800-63B** y **OWASP ASVS §2.5 / Forgot Password Cheat Sheet**:

- **`POST /auth/forgot-password`** (público): respuesta **neutra siempre** (`{ok:true}`) — no revela
  si el correo existe. El envío del correo se hace en **segundo plano** (no filtra por *timing*).
  **Rate-limit** por correo y por IP (best-effort en `CacheService`).
- **`POST /auth/reset-password`** (público): token de **un solo uso**, **hasheado** (SHA-256) y con
  **TTL corto** (`PASSWORD_RESET_TTL`, def. 30 min). Aplica la **política de contraseñas**, **revoca
  todas las sesiones** del usuario, limpia lockout y `forcePasswordChange`. Mensaje de fallo
  **genérico**; **no auto-loguea**; **no modifica el MFA** (el correo no degrada el 2.º factor).
- **Correo** tras la interfaz abstracta **`EmailService`** (impl. SMTP con nodemailer; Mailpit en dev).
  Se envía una **notificación de seguridad** tras el cambio. El token solo viaja por correo y **nunca
  se registra** en logs.
- **Frontend**: el token se **borra de la URL** al abrir la pantalla (`history.replaceState`) y se fija
  `Referrer-Policy` para no filtrarlo por *referer*.
- **Auditoría**: `auth.password.reset_requested|completed|failed|throttled` (append-only).
- **Pendiente (transversal, no en esta sesión):** rechazo de contraseñas comprometidas
  (NIST §5.1.1.2); se hará pluggable y apagado por defecto (on-premise).

## Estado
- **Fase 0:** cabeceras (Helmet) y validación de entorno activas.
- **Fase 1 (backend, ✅):** auth local Argon2id; access JWT (15 min) + refresh rotativo httpOnly con detección de reuso por familia; CSRF de doble envío en refresh/logout; lockout por fuerza bruta (contador en BD); **MFA TOTP** completo (enrolamiento + recovery codes, secreto cifrado en reposo); `PermissionsGuard` + `@RequirePermission` (dims. 1–3) globales; `ScopeService` (dim. 4) con ruta materializada; catálogo de permisos en `@lyra/contracts`; `AuditLog` append-only con **trigger Postgres** que rechaza UPDATE/DELETE; política de contraseñas configurable + historial; seed idempotente con admin de arranque (forzado a cambiar contraseña).
  - Endpoints: `/auth/{login,mfa/challenge,refresh,logout,me,change-password,forgot-password,reset-password,mfa/setup,mfa/verify,mfa/disable}`, `/security/{users,roles,permissions,password-policy,audit}`, `/structure/{levels,nodes}`.
  - **Recuperación self-service** (forgot/reset) completa: token hasheado single-use + TTL, respuesta
    neutra, rate-limit, revocación de sesiones, `EmailService` SMTP (Mailpit en dev). Ver §6. Tests +
    smoke en vivo con Mailpit.
  - Tests: crypto (Argon2/AES), guard de permisos, scope ABAC, rotación/reuso de refresh, login/lockout/MFA. Verificado en vivo (login → /me → CSRF → estructura).
- **Pendiente Fase 1:** UI (pantalla de Login, administración de usuarios/roles/permisos, estructura). El backend ya expone todo lo necesario.
