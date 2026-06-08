# Seguridad — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 0 — diseño; implementación en Fase 1).

Objetivo: pasar auditorías de ciberseguridad. Referencia: **OWASP ASVS**.

> **Flujo de autenticación y tokens (access/refresh, almacenamiento, rotación, CSRF) con diagramas:
> ver [`AUTH_FLOW.md`](./AUTH_FLOW.md).**

## 1. Autenticación

Construida **detrás de una abstracción con métodos enchufables**, para que cada instalación on-premise active lo que el cliente necesite **sin reescribir código**:

- **Local** (MVP, por defecto): email + contraseña.
  - Hash **Argon2id**.
  - **Access token** JWT de vida corta (~15 min) + **refresh token rotativo** en cookie `httpOnly` / `SameSite` / `Secure`. Revocación y detección de reuso.
  - **Protección contra fuerza bruta** + **bloqueo de cuenta** (Redis).
  - **MFA TOTP self-service** con política de requerimiento por rol y enrolamiento forzado (ver §7).
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

## 7. MFA self-service (segundo factor TOTP)

Implementado en Fase 1 según **NIST 800-63B** (AAL2) y **OWASP ASVS v4 §2.2 / §2.8**:

- **Enrolamiento self-service**: el secreto TOTP solo lo conoce el dispositivo del usuario (cifrado en
  reposo en el backend). Flujo `POST /auth/mfa/{setup,verify,disable}` + regenerar recovery codes
  (`/auth/mfa/recovery-codes/regenerate`, reconfirma contraseña). El **admin NUNCA enrola** por el
  usuario.
- **Política de requerimiento (configurable, no hardcodeada)**: `Role.requireMfa` (por rol) + modo
  global `PasswordPolicy.mfaMode` ∈ {`OPTIONAL`, `REQUIRED_BY_ROLE`, `REQUIRED_FOR_ALL`}. El piso es
  **OPCIONAL**; no hay modo que impida el enrolamiento voluntario. Requerimiento derivado
  (`MfaRequirementService`).
- **Enrolamiento forzado con enforcement en backend**: si el rol exige MFA y el usuario no lo tiene, el
  access token lleva el claim **`mfaPending`** y el **`MfaEnrollmentGuard`** responde **403
  `MFA_ENROLLMENT_REQUIRED`** en todo salvo los endpoints marcados con `@AllowPendingEnrollment`
  (ver perfil, logout, setup/verify de MFA, cambio de contraseña). Evita degradar AAL2→AAL1. El claim se
  recalcula en cada emisión/rotación; al enrolar, un `/auth/refresh` lo limpia.
- **Throttle del 2.º factor** (NIST §5.2.2 / ASVS §2.2.1): contador propio `User.mfaFailedCount` /
  `mfaLockedUntil`, **separado** del lockout de contraseña; tras `maxFailedAttempts` bloquea
  `lockoutMinutes`. Ventana TOTP **±1** (RFC 6238) para desfase de reloj.
- **Reset de admin** (dispositivo perdido): `POST /security/users/:id/mfa/reset` (permiso
  `user:reset-mfa`) borra el factor y **revoca TODAS las sesiones** del objetivo. Un factor **exigido**
  no se puede **auto-desactivar** (`disableMfa` → 403). El reset de **contraseña no toca MFA**.
- **Reset de contraseña por admin** (estilo AD, NIST 800-63B): `POST /security/users/:id/reset-password`
  (permiso `user:reset-password`, **separado** de `user:edit`) fija una **contraseña temporal** validada
  contra la política, marca `forcePasswordChange`, **revoca todas las sesiones**, invalida resets pendientes
  y audita `auth.password.admin_reset`. **No toca el MFA.** El admin nunca conoce la contraseña definitiva
  (el usuario la cambia al primer ingreso). Ver `DECISIONS.md` 2026-06-08.
- **Recovery codes**: 10, **hasheados** (SHA-256), **single-use**; regenerables (invalida los previos);
  se muestran **una sola vez**.
- **Auditoría** append-only: `auth.mfa.enabled|disabled|recovery_regenerated|admin_reset`,
  `auth.mfa.challenge_failed|locked`.
- **Residual (honestidad técnica):** sin anti-replay del mismo OTP dentro de su ventana (deuda menor).
  `forcePasswordChange` aún se hace cumplir solo en la UI (a diferencia del gate de MFA); pendiente de
  igualar con enforcement de backend.

## Estado
- **Fase 0:** cabeceras (Helmet) y validación de entorno activas.
- **Fase 1 (backend, ✅):** auth local Argon2id; access JWT (15 min) + refresh rotativo httpOnly con detección de reuso por familia; CSRF de doble envío en refresh/logout; lockout por fuerza bruta (contador en BD); **MFA TOTP** completo (enrolamiento + recovery codes, secreto cifrado en reposo); `PermissionsGuard` + `@RequirePermission` (dims. 1–3) globales; `ScopeService` (dim. 4) con ruta materializada; catálogo de permisos en `@lyra/contracts`; `AuditLog` append-only con **trigger Postgres** que rechaza UPDATE/DELETE; política de contraseñas configurable + historial; seed idempotente con admin de arranque (forzado a cambiar contraseña).
  - Endpoints: `/auth/{login,mfa/challenge,refresh,logout,me,change-password,forgot-password,reset-password,mfa/setup,mfa/verify,mfa/disable,mfa/recovery-codes/regenerate}`, `/security/{users,users/:id/mfa/reset,roles,permissions,password-policy,audit}`, `/structure/{levels,nodes}`.
  - **Recuperación self-service** (forgot/reset) completa: token hasheado single-use + TTL, respuesta
    neutra, rate-limit, revocación de sesiones, `EmailService` SMTP (Mailpit en dev). Ver §6. Tests +
    smoke en vivo con Mailpit.
  - Tests: crypto (Argon2/AES), guard de permisos, scope ABAC, rotación/reuso de refresh, login/lockout/MFA. Verificado en vivo (login → /me → CSRF → estructura).
- **Fase 1 (UI, ✅):** Login + MFA, Estructura + Equipos, y **administración de Seguridad** (usuarios,
  roles + matriz de permisos, política con `mfaMode`, auditoría, reset de MFA de admin) sobre `/security/*`.
  La UI solo oculta/deshabilita según permisos efectivos; el backend sigue siendo la única fuente de verdad.
  Contrato de auditoría (`auditLogEntrySchema`) añadido para tipar la lectura. Pendiente: smoke visual
  (BACKLOG §4) y la vista ABAC node-centric (BACKLOG §2).
