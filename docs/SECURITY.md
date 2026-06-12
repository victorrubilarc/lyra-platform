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
4. **Datos (ABAC)** — DOS ejes ortogonales que combinan en **AND** ("gana la más estricta"), ambos **implementados**:
   - **Por NODO** (`Scope`): ata usuario/rol a `OrgNode` con herencia a descendientes (ruta materializada). `ScopeService.getAccessibleNodeIds` (null = sin restricción).
   - **Por PLANTILLA** (`TemplateScope`, Fase 2.8): ata usuario/rol a `Template` (set plano). `ScopeService.getAccessibleTemplateIds` (null = sin restricción, semántica PERMISIVA = ve todas). Filtra el **picker** de llenado y la **grilla/stats/export** de bitácoras + `assertTemplateInScope` en lectura/llenado de entrada; NO el módulo admin de plantillas (otra responsabilidad). Asignable por usuario (`user:assign-scope`) y por rol (`role:manage`), auditado. Es eje de **visibilidad/uso**, distinto de los roles por sección (que limitan QUÉ se edita dentro de una plantilla).

### Aplicación (regla de oro)
- **El backend SIEMPRE decide.** `PermissionsGuard` (NestJS) + decorador `@RequirePermission(...)` cubren dimensiones 1–3; el `ScopeService` aplica la dimensión 4 filtrando filas por `OrgNode` **y** `Template` (AND de los dos ejes).
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

## 8. Firmas electrónicas — estilo 21 CFR Part 11 (Fase 2.5)

Ejecución de flujo + firmas sobre bitácoras, alineadas a **21 CFR Part 11** (§11.50/11.70/11.200),
**ALCOA+** y step-up de **NIST 800-63B**. La maquinaria es **opt-in**: una plantilla sin flujo/sin firma
se comporta como un form simple (degradación elegante).

- **Autorización de transición (decidida 100% en backend)**: `executeTransition` valida, en orden,
  (a) la transición existe y sale de `currentStateKey`, (b) el usuario tiene un **rol-dato** autorizado
  (`WorkflowTransitionRole`, nunca clave hardcodeada), (c) **ABAC** sobre `orgNodeId`, (d) **completitud**
  de las secciones del estado de origen. El permiso base es `logentry:transition`; el QUIÉN concreto es dato.
  La lista `availableTransitions` que ve el cliente es solo cosmética (oculta botones); el backend re-decide.
- **Firma electrónica (§11.50 manifestación)**: captura **nombre impreso** del firmante, **fecha/hora UTC**,
  **significado** (`signatureMeaning`) y `method`. Opt-in por **transición** (`requireSignature`) y por
  **completitud de sección** (`TemplateSection.requireSignature`).
- **Record–signature linking (§11.70 / no repudio)**: se firma el **SHA-256 de un snapshot canónico**
  (`canonicalSignaturePayload`, serialización determinista con claves ordenadas) que liga la firma a un
  contenido exacto (entrada + versión + estado origen/destino + valores). Se almacena **solo el hash**; el
  snapshot es reconstruíble desde `LogEntryValue`/`LogEntryFieldChange`. **Sin contraseña ni secreto en
  reposo** en `LogEntrySignature`. PKI/sello de tiempo cualificado **diferidos a Fase 7**.
- **Re-autenticación (§11.200 componentes)**: `ReauthService.verifyForSignature` exige **contraseña**
  (Argon2id `verify`, constante en tiempo) como 2.º componente; **MFA step-up** (TOTP/recovery, ±1 ventana)
  **solo si la transición lo pide** (`requireMfa`). El firmante es siempre el sujeto del JWT (`signerId =
  userId`): no hay impersonación. Las credenciales viajan en el cuerpo, se re-verifican en backend y **no se
  registran** en auditoría/logs.
- **Inmutabilidad / trazabilidad**: `LogEntryTransition` y `LogEntrySignature` son **append-only**; el
  cambio de estado, el recomputo de secciones (`LOCKED`/reapertura), el sellado de `effectiveAt`+dimensiones
  (1ª salida del estado inicial) y la firma ocurren en **una transacción**. Auditoría
  `logentry.transition.executed`. Estados finales reconcilian `status=SUBMITTED` (registro cerrado).
- **Residual (honestidad técnica):** la re-auth de firma **no tiene throttle propio** (defensa en
  profundidad; el actor re-autentica su PROPIA contraseña en una sesión ya autenticada, sin ganancia de
  fuerza bruta práctica); un recovery code usado en el step-up se consume aunque la tx falle después
  (operacional). **Reversa/anulación de transición** (corrección GxP con su firma y motivo) **diferida**.
  Ver BACKLOG §2/§3.

### Gobernanza temporal — Período contable (Fase 2.7.1 → 2.7.1.1)
Cierre de la ESCRITURA por ventana de tiempo (refs SAP OB52 / NetSuite Open/Closed/Locked / Maximo). En **2.7.1.1** el
período se desacopló al **calendario FISCAL** (transversal) y se endureció al estándar industrial.
- **Guarda 100% en backend**: `OperationalPeriodService.assertWritable(effectiveAt, orgNodeId, perms)` se invoca
  en TODAS las mutaciones de bitácora (`create`/`saveSection`/`setDeferral`/`submit`/`executeTransition`) sobre la
  `effectiveAt` que el write persistiría. Resuelve el período vía `ShiftResolver` (→ operationalDate) + `FiscalResolver`
  (→ `periodKey` + fila). Decisión (fuente única `blockMessage`):
  - **LOCKED** ⇒ bloquea a **TODOS, incluido el bypass** (hard lock; reabrir exige `opsperiod:unlock`).
  - **CLOSED** ⇒ bloquea salvo **`opsperiod:write-closed`**.
  - **`requirePeriod`** (opt-in del fiscal) sin fila generada ⇒ bloquea salvo el bypass.
  Lanza 403 `blockedReason = PERIOD_CLOSED`. Se evalúa **antes** de la completitud/validación y del re-auth (gate duro;
  no consume recovery codes). **Lecturas y verificación de firma nunca se bloquean.**
- **Permisos (catálogo 54→56)**: `opsperiod:view`, `opsperiod:close` (OPEN→CLOSED), `opsperiod:reopen` (CLOSED→OPEN),
  **`opsperiod:lock`** (CLOSED→LOCKED), **`opsperiod:unlock`** (LOCKED→CLOSED, permiso superior), `opsperiod:write-closed`
  (**bypass** de escritura en CLOSED; **no** aplica a LOCKED). El "rol privilegiado" es **DATO RBAC** (clave asignable,
  patrón authorization group SAP OB52), **nunca hardcodeado**. La generación de períodos usa `opscalendar:manage`.
- **Cierre SECUENCIAL + secuencialidad inversa**: no se cierra un período si hay uno anterior abierto; reabrir un CLOSED
  se bloquea si hay un posterior LOCKED y exige acuse si hay un posterior CLOSED (consistencia del prefijo cerrado).
- **Motivo obligatorio (≥5) + auditoría** en cada transición (`opsperiod.generated|closed|locked|unlocked|reopened`,
  before/after en `AuditLog` inmutable). **Degradación elegante**: sin día operacional/calendario fiscal = ungobernado.
- **Re-autenticación MFA POR ACCIÓN (configurable)** — `SystemSettings` (singleton) tiene 4 flags
  `requireMfaPeriod{Close,Reopen,Lock,Unlock}`. Si la acción está activa, `OperationalPeriodService` exige step-up MFA vía
  **`ReauthService`** (mismo motor de las firmas Part 11) ANTES de ejecutar; sin segundo factor enrolado ⇒ 400. El listado de
  períodos expone `requireReauth` como mapa para que la UI pida credenciales solo donde aplica. La huella de **si se usó MFA**
  queda ESTAMPADA en el AuditLog (`metadata.mfaVerified`) — el registro es auto-descriptivo aunque el ajuste cambie después.
  Pantalla `/configuracion` (permisos nuevos **`module:settings:view`** + **`settings:manage`**, catálogo **56→58**).
- **Historial de período** — `GET /operational-periods/history` (gateado `opsperiod:view`) reconstruye el rastro de gobernanza
  de un período desde el AuditLog inmutable (quién/cuándo/motivo/MFA). Solo lectura.

### Gobernanza temporal — Ventana de edición (Fase 2.7.2)
Plazo configurable para CORREGIR un registro (eje complementario al período: gobierna datos, no fechas contables). Ref
GxP: MHRA Data Integrity 2018 / FDA DI Q&A (corrección tardía justificada + atribuida); SAP OB52 / Odoo lock dates (config viva).
- **Guarda 100% en backend**: `LogEntriesService.assertEditWindowWritable(entry, userId, dto)` en `saveSection`/`setDeferral`/
  `submit` (NO `create` ni `executeTransition` — la ventana NO frena el avance del flujo). Config en `Template` (gobernanza viva,
  sin republicar) con fallback `SystemSettings`; resolución por fuente única `resolveEditWindow`/`editWindowDeadline`/
  `isEditWindowExpired` (borde no inclusivo). Ancla **RECORDED** (default) o **EFFECTIVE** (usa la `effectiveAt` persistida).
- **Override**: vencida ⇒ exige **`logentry:write-expired`** (catálogo **58→59**, DATO RBAC, espejo de `opsperiod:write-closed`)
  **+ motivo `overrideReason` ≥5 OBLIGATORIO** (a diferencia del bypass de período, silencioso) **+ MFA** si
  `SystemSettings.requireMfaEditWindowOverride` (vía `ReauthService`; sin 2.º factor enrolado ⇒ 400). Sin motivo ⇒ 400 aunque
  se tenga el permiso. Auditoría: evento DEDICADO **`logentry.editwindow.override`** (operation/reason/mfaVerified/windowExpiredAt)
  + `overrideReason` en `LogEntryFieldChange.reason`.
- **Composición con período = AND ("gana la más estricta"), cada guarda con su bypass**. Precedencia del `blockedReason`:
  `ENTRY_CLOSED` → `PERIOD_CLOSED` → **`EDIT_WINDOW_EXPIRED`** → `WRONG_STATE`/`MISSING_ROLE`. `getDetail` expone `editWindow`
  (huella proactiva "Editable hasta X"); quien tiene el override no queda bloqueado (la UI le pide motivo al guardar).
- **Residual**: matriz rol×sección×tiempo (#7) llega en 2.7.3.

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
