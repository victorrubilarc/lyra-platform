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
   - **Por NODO** (`Scope`): ata usuario/rol a `OrgNode` con herencia a descendientes (ruta materializada). `ScopeService.getAccessibleNodeIds`/`getAccessibleNodes` (null = sin restricción). **Multi-nodo de plantilla (Fase 2.8.0):** la plantilla declara en qué nodos vive vía `TemplateNodeAssignment` (N:M + `includeDescendants`; 0 filas = GLOBAL, permisivo). Es visible si **alguna** asignación intersecta el alcance de nodo del usuario (`isTemplateVisibleByNode`). Al CREAR una entrada, el nodo se valida en backend contra `expand(asignaciones) ∩ accesibles` (`assertNodeAllowedForTemplate` en `create`/`previewNew`); el front solo ofrece los elegibles (`GET /log-entries/templates/:id/nodes`, autoselección si 1, obliga si >1). El histórico no se reescribe: las entradas estampan su `orgNodeId`.
   - **Por PLANTILLA** (`TemplateScope`, Fase 2.8): ata usuario/rol a `Template` (set plano). `ScopeService.getAccessibleTemplateIds` (null = sin restricción, semántica PERMISIVA = ve todas). Filtra el **picker** de llenado y la **grilla/stats/export** de bitácoras + `assertTemplateInScope` en lectura/llenado de entrada; NO el módulo admin de plantillas (otra responsabilidad). Asignable por usuario (`user:assign-scope`) y por rol (`role:manage`), auditado. Es eje de **visibilidad/uso**, distinto de los roles por sección (que limitan QUÉ se edita dentro de una plantilla).

### Aplicación (regla de oro)
- **El backend SIEMPRE decide.** `PermissionsGuard` (NestJS) + decorador `@RequirePermission(...)` cubren dimensiones 1–3; el `ScopeService` aplica la dimensión 4 filtrando filas por `OrgNode` **y** `Template` (AND de los dos ejes).
- **Cómputos derivados sobre el listado reusan el MISMO `where`+ABAC.** Tanto la búsqueda por contenido (`pg_trgm`) como el filtro/KPI/faceta **"Retrasadas"** (Workflow SLA) resuelven un set de ids candidatos con SQL crudo y lo **intersectan en AND** con el `where` del listado (que ya incluye los dos ejes ABAC) — nunca se confía en el set crudo ⇒ filtrar por atraso/contenido jamás amplía lo que el usuario puede ver. **Sin permisos nuevos** (catálogo **59**): el SLA es config del flujo, el atraso es una propiedad calculada del dato ya autorizado.
- **La UI solo oculta** (mejor UX), nunca es la fuente de verdad.
- El **catálogo de permisos** vive en `@lyra/contracts` (enum tipado), compartido por UI y backend.

### Excepciones operacionales (Fase 4.1) — triage gobernado + corrección GxP
- 4 permisos nuevos (catálogo **77→81**, grupo `incidents`): **`exception:triage`** (reconocer/asociar/agrupar/convertir —
  convertir exige además `incident:create`, AND), **`exception:dismiss`** (descartar una advertencia con motivo), **`exception:dismiss-critical`**
  (descartar una excepción CRÍTICA — permiso SUPERIOR; el endpoint admite cualquiera de los dos con `@RequireAnyPermission`, y el
  servicio exige el específico según `thresholdType`), **`exception:correct`** (corregir el valor de origen). **Ver** excepciones usa
  `module:incidents:view` (son parte del módulo). ABAC por nodo (`canAccessNode`/`getAccessibleNodeIds`) en todas las operaciones.
- **Corrección de valor = GxP/ALCOA+:** el `originalValue` es INMUTABLE; corregir escribe el nuevo valor en `LogEntryValue` + un
  `LogEntryFieldChange` con motivo (huella por campo) + re-estampa la banda, y marca la excepción `CORRECTED` preservando el original.
  El registro criptográfico Part 11 de la corrección queda como deuda 4.2 (igual que las transiciones de incidencia 4.0). Toda acción
  de triage (acknowledge/dismiss/correct/convert/associate/manual) se **audita** (`AuditLog`).

### Notificaciones avanzadas (Fase A) — destinatarios por transición + externos
- La config de aviso de una transición se **CONGELA en la versión del flujo** (`WorkflowTransition.notifyConfig`) y se gobierna con
  **`workflow:manage`** (es parte del flujo, igual que roles/firma); las plantillas por bitácora con **`notiftemplate:manage`**.
  **Sin permisos nuevos** (no hay segregación que lo justifique).
- **Destinatarios INTERNOS** (roles→usuarios en vivo, usuarios explícitos, autor, ejecutor, roles del estado destino) pasan **SIEMPRE
  por ABAC** (`canAccessNode` ∩ `canAccessTemplate`): nunca se avisa a alguien lo que no podría ver.
- **Destinatarios EXTERNOS** (`externalEmails`) **SALTAN ABAC por diseño** (un contratista/autoridad no es usuario del sistema). Es una
  decisión de gobernanza explícita: la lista es **visible y editable** solo por quien administra el flujo (`workflow:manage`), viaja
  congelada en la versión (auditable: "qué correos externos avisaba la v3"), y **cada envío se audita** (`notification.email.sent`).
  Mitiga el riesgo de fuga: el correo lleva solo lo que la plantilla declara (placeholders whitelisteados), no datos arbitrarios.
- **Comodines `{{campo.<key>}}`** se resuelven desde la versión CONGELADA de la entrada; un campo ausente queda en "" (sin fuga de
  estructura). El render es seguro (sin eval, whitelist por evento + campos de la bitácora).

### Notificaciones avanzadas (Fase B) — canal in-app (campanita) por OWNERSHIP + auth del stream SSE
- **Ver/leer MIS notificaciones in-app = ownership** (sin permiso de catálogo, patrón `SavedView`): toda consulta/mutación del inbox
  filtra por `recipientUserId === session.user.id` (`channel=INAPP`); marcar leída una notificación ajena devuelve **404** (no se
  filtra la existencia de notificaciones de otro). La in-app reusa el mismo render whitelisteado y los mismos destinatarios resueltos
  por ABAC del correo: nunca llega a la campanita algo que el usuario no podría ver.
- **Auth del stream SSE (`GET /notifications/inbox/stream`):** `EventSource` no puede enviar el header `Authorization`, así que el
  access token viaja por **query param `?access_token=`** y se **verifica con el mismo `JwtService`** en el handler. La ruta es
  `@Public` SOLO para saltar el guard global (que exige Bearer en header); la autenticación **se hace dentro del endpoint** y queda
  CONFINADA a esa ruta — el guard global no se relaja para el resto de la API. **Mitigaciones del riesgo de token en URL:** el stream
  empuja un **payload mínimo** (`{type:"inbox", unread}`, sin contenido sensible — el cliente refetchea por el endpoint con Bearer en
  header); el access token es de **vida corta** (rotación por refresh httpOnly+CSRF, ver AUTH_FLOW); on-prem el tráfico va por TLS del
  reverse proxy. (Deuda menor anotada: a futuro se puede emitir un token efímero dedicado al stream.)
- **La in-app no audita** entrega ni lectura (la fila de `NotificationOutbox` es el registro inmutable; la lectura es dato propio del
  dueño). El correo conserva su auditoría `notification.email.sent`.

### Incidencias — SLA / avisos de plazo / escalamiento (Fase 4.4)
- **Sin permisos nuevos** (catálogo se queda en **83**): la config SLA del tipo (`resolutionDueMinutes`/`escalationAfterMinutes`/
  `escalationRoleId`) se gobierna con **`incidentcatalog:manage`**; editar el `dueAt` de una incidencia con **`incident:edit`** (deja
  timeline `DUE_CHANGED` + auditoría `incident.updated`); los avisos por **ownership/preferencias** del destinatario.
- **Los 4 eventos derivados** (`incident.sla.breached`/`incident.overdue`/`incident.action.overdue`/`incident.report.due`) los detecta
  `IncidentSlaService` (solo-lectura) y los emite el sweeper; los **destinatarios pasan SIEMPRE por ABAC de NODO** (`canAccessNode`):
  responsable asignado + usuarios de los roles del estado actual + rol de escalamiento (solo si `shouldEscalate`). **No hay externos**
  (los externos son para los reportes a la autoridad, que se gestionan aparte). Render whitelisteado (sin eval), como el resto del motor.
- **§21 — dos "vencidas" separadas:** la permanencia (estado) y el plazo de resolución (`dueAt`) son cómputos DERIVADOS sobre el dato ya
  autorizado; los filtros `overdueOnly`/`slaBreachedOnly` reusan el `where`+ABAC del listado (el id-set de permanencia se intersecta en
  AND, nunca amplía lo visible), igual que el patrón de "Retrasadas" del Workflow SLA.

### Cambio de turno / Shift Handover (Fase 5 · Slice 1)
- **4 permisos nuevos** (catálogo **83 → 88**), con **segregación de funciones** entre saliente y entrante:
  **`module:handover:view`** (módulo), **`shifthandover:view`** (ver/historial), **`shifthandover:compile`** (armar la entrega + baton),
  **`shifthandover:sign`** (firmar como SALIENTE — Part 11), **`shifthandover:acknowledge`** (reconocer como ENTRANTE — Part 11).
  El servicio refuerza la segregación: el acuse se RECHAZA (400) si `outgoingById === userId` (quien entregó no puede reconocer).
- **Firma electrónica Part 11** en ambos pasos (firma del saliente y acuse del entrante): re-autenticación con `ReauthService`
  (contraseña + MFA step-up si la cuenta lo trae), con **significado** y **método** registrados inline en la entrega + timeline
  append-only + auditoría (`shifthandover.signed_out` / `shifthandover.acknowledged`). El **snapshot** del cockpit se CONGELA al firmar
  (inmutable). *(Deuda registrada: hash criptográfico del payload — hoy se persiste reauth + significado + método, sin `payloadHash`.)*
- **ABAC por NODO en la compilación (regla de oro):** el cockpit junta SOLO lo que el usuario puede ver = **subárbol del nodo de la
  entrega ∩ nodos accesibles del usuario** (`getAccessibleNodeIds`). Una entrega NUNCA muestra datos fuera del alcance; el historial y
  el detalle gatean por `canAccessNode` (403). El aviso `handover.ready` resuelve destinatarios por **roles con
  `shifthandover:acknowledge` ∩ ABAC de nodo**, excluido el saliente.

### Datos PERSONALES → autorización por OWNERSHIP (no RBAC)
- Las preferencias de presentación del propio usuario **no** se gobiernan con permisos del catálogo: se autorizan por **pertenencia** (el recurso es del actor). Patrón aplicado a **`SavedView`** (vistas guardadas de Bitácoras, Fase 2.8.1b): toda consulta/mutación filtra por `userId === session.user.id` (404 si la vista es de otro); el endpoint se gatea además por acceso al módulo (`logentry:view`). No infla el catálogo (sigue en **59**). Inflar RBAC con preferencias de UI sería ruido administrativo; el límite real es la propiedad del dato.

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

### Gobernanza del objeto de referencia EAM — modo de equipo por plantilla (Fase 2.8.0.2)
- **`Template.equipmentMode`** (`NONE|OPTIONAL|SUGGESTED|REQUIRED`, config de **gobernanza viva** en el contenedor, default
  OPTIONAL) decide si la entrada se asocia a un equipo. El **backend AUTORIZA** en `create`/materialización
  (`assertEquipmentForMode`): **REQUIRED** sin equipo ⇒ 400; **NONE** con equipo ⇒ 400 (el front solo refleja el modo que
  `eligibleNodes` expone). Sin permiso nuevo: editar el modo va por `template:edit`; el cambio queda **auditado** before/after
  en `template.updated`. No se re-valida al sellar (equipo estampado = histórico intacto, ALCOA+).

### Anulación (VOID) de borradores (Fase 2.8.2)
- **`POST /log-entries/:id/void`** descarta un borrador (status → `VOID`): anulación LÓGICA, **no** hard-delete ni
  `deletedAt`. Solo `DRAFT` no sellado; **motivo `reason` ≥5 OBLIGATORIO** y auditado (`logentry.voided`; ALCOA+/MHRA: la
  baja excepcional se justifica). No re-anula (400) y el período cerrado / la ventana vencida NO bloquean (es retiro de un
  borrador, no corrección de dato).
- **Autorización HÍBRIDA (decidida en el SERVICIO, no por decorador).** El gate del controller es GRUESO
  (`logentry:view`); el servicio AUTORIZA fino: el **AUTOR** (`createdById === userId`) anula su propio borrador por
  **ownership** (precedente `SavedView`), y anular el AJENO exige el **permiso nuevo `logentry:void`** (catálogo **59→60**;
  limpieza supervisora). En AMBOS casos rige el ABAC (nodo × plantilla). El front solo oculta el control cuando no aplica;
  el backend re-autoriza siempre.
- **Trazable, fuera de las superficies normales.** `buildWhere` **excluye `VOID` por defecto** (grilla/stats/facetas/
  export/related) y lo muestra solo con `?status=VOID` (patrón ServiceNow "Cancelled"). Huella en visor (banner) y timeline
  (evento `VOIDED`: quién/cuándo/por qué). La anulación GxP de un registro **SELLADO** (firma §11.200 + transición inversa)
  es un corte posterior.

### Almacenamiento de evidencia / adjuntos (Ola 3, infra MinIO)
- **Object storage on-prem tras interfaz abstracta.** `StorageService` (token DI) → `MinioStorageService` (SDK `minio`).
  El navegador **NUNCA** recibe credenciales del bucket ni accede directo: la API es el **choke-point**. Bucket creado de
  forma idempotente al arrancar; credenciales por env (`MINIO_*`), nada en el repo.
- **Subida PROXIED (`POST /log-entries/:id/attachments/:sectionKey/:fieldKey`, `logentry:fill`).** `@fastify/multipart`
  con tope DURO (100 MB) en el borde; el servicio valida **tamaño** (config `maxSizeMb`) y **tipo** (`accept` por kind)
  ANTES de persistir en MinIO, calcula `sha256`, y aplica las MISMAS guardas que `saveSection` (DRAFT no sellado · ABAC
  nodo×plantilla · sección editable en el estado × rol de sección × override de rol por campo). Auditado
  (`logentry.attachment.uploaded`). *Estándar:* OWASP file-upload (validación server-side, nombre saneado, sin servir el
  byte desde la API). **Antivirus (ClamAV) = diferido (BACKLOG).**
- **Descarga = presigned GET de vida corta, ABAC server-side** (`GET /log-entries/:id/attachments/:descriptorId/url`,
  `logentry:view`). El descriptor se resuelve por `id` desde los valores PERSISTIDOS (el cliente nunca presigna una key
  arbitraria); la URL caduca (`MINIO_PRESIGN_TTL`, def. 5 min) y fuerza `Content-Disposition: attachment`. Acceso auditado
  (`logentry.attachment.downloaded`: quién accedió a la evidencia = valor GxP).
- **Pertenencia del objeto (anti-fabricación).** Al guardar, cada descriptor NUEVO debe (a) tener su `key` bajo el prefijo
  `entries/{logEntryId}/{fieldKey}/` y (b) existir en el storage (`statObject`) — análogo a `allowedRefIds` pero por
  prefijo. Una key ajena/fabricada ⇒ 400. **delete-on-remove**: quitar un adjunto borra el objeto; **VOID** de un borrador
  hace `removePrefix(entries/{id}/)`.
- **Inmutabilidad GxP.** El descriptor (no una URL) se persiste con su `sha256` (ALCOA+/Part 11: evidencia íntegra +
  metadata). Una entrada **SELLADA** rechaza subir/borrar (estado ≠ DRAFT ⇒ 400); sus objetos quedan **retenidos**.
  **object-lock/WORM del bucket + retención automática + sweeper de huérfanos = diferidos (BACKLOG).**
- **Sin permisos nuevos** (catálogo **60**): `logentry:fill`/`logentry:view` + ABAC ya gobiernan llenar/leer; el alcance de
  la entrada autoriza ver su evidencia.

### Programación de rondas (Fase 2.3 → 2.3.1) — `LogSchedule` + `RoundOccurrence`
- **3 permisos** (catálogo **60→63**). PLANIFICADOR: **`schedule:view`** (ver "Programación de rondas" + ocurrencias; gatea
  `/rondas`) y **`schedule:manage`** (CRUD horarios + generar). OPERADOR (Fase 2.3.1): **`round:execute`** = ver + ejecutar
  **"Mis rondas"** (`/mis-rondas`): **iniciar/continuar/omitir** ocurrencias. *Motivo del split:* ejecutar una ronda ≠
  administrar horarios (patrón *My Maintenance Tasks*/Fiori · *Start Center*/Maximo); el operador ejecuta su worklist sin tener
  administración. La instancia es la **ronda** (`RoundOccurrence`), por eso namespace de recurso propio (como `logentry:*` vs
  `template:*`). **start/skip se MOVIERON** de `schedule:manage` a `round:execute`. **Llenar** la entrada que abre la ronda
  reusa `logentry:fill`/`logentry:view` + las guardas ABAC/EAM. El selector de rol responsable del planificador usa un endpoint
  propio `GET /schedules/role-options` (gate `schedule:manage`), **decoplado de `role:read`** (el planificador no necesita el
  módulo de seguridad).
- **ABAC del PLANIFICADOR = nodo ∩ plantilla (2.3.1 pro)**: `GET /schedules` (y generate/occurrences/stats) filtran por los
  **dos** ejes de alcance de 2.8 en **AND** (`scopeFilters` = `getAccessibleNodeIds` ∩ `getAccessibleTemplateIds`; `null` en un eje
  = sin restricción ahí). Consecuencia (importante para empresas multi-área): un planificador acotado a un **área** (scope de nodo)
  no ve los horarios de otras áreas; uno acotado a ciertas **bitácoras** (scope de plantilla) no ve los demás tipos. Sin scope =
  ve todo (rol corporativo). Ambos son **DATO** (asignables por usuario o rol en Seguridad), nunca hardcodeados. Las superficies de
  ejecución y el value-help de bitácoras del planificador heredan automáticamente este alcance.
- **ABAC por nodo + responsabilidad por ROL (worklist, 2.3.1)**: los listados se filtran por `getAccessibleNodeIds`
  (`null`=sin restricción). El worklist del operador (`GET /schedules/my-rounds`) además acota por **rol responsable**:
  `schedule.responsibleRoleId ∈ roles del usuario`, dejando pasar los horarios SIN responsable (`null` = fallback, visible a
  todos los del nodo). La responsabilidad se lee EN VIVO del horario (reasignar re-enruta las pendientes). Crear/iniciar valida
  `canAccessNode` + alcance de plantilla + equipo del nodo. **Iniciar una ronda** delega en `LogEntriesService.create`, que
  re-aplica los dos ejes ABAC (nodo + plantilla) y la gobernanza de equipo (`EquipmentMode`) en el backend — el front solo ofrece.
- **Omisión auditada**: `POST /occurrences/:id/skip` exige motivo ≥5 y registra `schedule.occurrence.skipped` (GxP: la ronda no
  realizada queda justificada). `schedule.created/updated/deleted` y `schedule.occurrence.started` también se auditan.

### Notificaciones (Bloque N — motor de avisos por correo)
- **4 permisos nuevos** (catálogo **63→67**): **`module:notifications:view`** (módulo + sidebar `/notificaciones`),
  **`notiftemplate:manage`** (administrar plantillas de mensaje), **`notification:view-outbox`** (ver/reintentar el correo
  saliente), **`notification:admin`** (suscripciones + `POST /notifications/run`). **Las preferencias PROPIAS** (`GET/PUT
  /notifications/preferences`) y el catálogo de eventos (`GET /notifications/events`) son **solo-autenticado, sin permiso de
  catálogo** (dato personal, ownership — precedente `SavedView`): cualquier usuario gestiona sus avisos desde `/mis-notificaciones`.
- **ABAC SOBRE LOS DESTINATARIOS (principio clave)**: la resolución NUNCA notifica algo que el destinatario no podría VER. Todo
  destinatario candidato (derivado del rol responsable / responsables del estado / suscripción) pasa por **`canAccessNode` ∩
  `canAccessTemplate`** (los dos ejes ABAC de 2.8) antes de encolar el correo. La ocurrencia/entrada denormaliza `orgNodeId`+
  `templateId`, así que el filtro aplica incluso antes de que exista una `LogEntry`. Sin esto, un correo podría filtrar el folio,
  el estado o el contenido de un registro fuera del alcance del receptor.
- **Render SIN eval**: las plantillas solo sustituyen placeholders `{{var}}` **whitelisteados por el evento** (validado al guardar
  la plantilla con `unknownPlaceholders`); no hay lógica, bucles ni acceso a propiedades arbitrarias (misma postura que el AST del
  motor de reglas). Un dato ausente se reemplaza por vacío (nunca se filtra `{{...}}` crudo al correo).
- **Transactional outbox (durabilidad + atomicidad)**: el evento se inserta en la **MISMA transacción** que el cambio de dominio
  (`executeTransition`) ⇒ un crash entre commit y envío no pierde el aviso. El SMTP caído degrada con backoff (filas PENDING/FAILED
  reintentables), nunca rompe el flujo de negocio.
- **Auditoría**: cada envío registra **`notification.email.sent`** (a quién, qué evento, cuándo); la edición de plantillas
  (`notification.template.updated`), las suscripciones (`.subscription.created/deleted`) y el reintento (`.email.retried`) también
  se auditan (append-only). El cuerpo del correo se persiste como snapshot en la bandeja (no se registran tokens/credenciales).
- **Transporte**: el correo sale **solo desde el backend** (`EmailService` → SMTP/relay del cliente; Mailpit en dev), nunca desde
  el navegador. La interfaz `NotificationChannel` deja el modelo listo para in-app/SMS futuros sin tocar el motor.

### Configuración del correo saliente (Bloque N hardening) — `notification:config`
- **Permiso nuevo `notification:config`** (catálogo **67→68**, grupo `notifications`): administrar el servidor SMTP y probar el envío.
  Pantalla en `/configuracion` (tab "Correo saliente"). Dedicado (least-privilege), separable de `notiftemplate:manage`/`settings:manage`.
- **Credencial CIFRADA en reposo** (OWASP ASVS): la contraseña SMTP se guarda con `EncryptionService` (AES) en `SystemSettings.
  emailPasswordEnc` y es **write-only** — la API NUNCA la devuelve (la UI solo ve `passwordSet`). El payload vacío conserva la guardada.
- **Probar sin guardar**: `POST /settings/email/verify` (verify de nodemailer, sin enviar) y `/test` (envío con un transporter
  TRANSITORIO). Auditado (`email.config.updated` / `email.config.tested`) **sin registrar la contraseña**; los errores del SMTP se
  devuelven al admin para diagnosticar (no se filtran a usuarios sin el permiso).
- **`.env` como fallback**: si nunca se guardó en BD (`emailConfiguredAt` null), la config vigente proviene del entorno (`source=env`);
  el secreto del `.env` sigue fuera del repo. **Toggle "Correo activado"**: apagado ⇒ el worker marca los correos SUPPRESSED (no se
  envía; la recuperación de contraseña y los avisos no rompen el flujo).

### Inteligencia Artificial administrable (Fase 5 · Slice 2) — `ai:config`
- **Permiso nuevo `ai:config`** (catálogo **88→89**, grupo `ai`): ver/editar la config de IA y usar "Probar". Pantalla en
  `/configuracion` (tab "Inteligencia Artificial"). Dedicado, least-privilege. La autorización se decide en el backend (gate en
  `AiController`); el frontend solo oculta el tab.
- **API key CIFRADA en reposo + write-only** (OWASP ASVS): se guarda con `EncryptionService` (AES-256-GCM) en `AiSettings.apiKeyEnc`;
  la API **nunca** la devuelve (la UI solo ve `keySet`). Payload vacío conserva la guardada. Cambios auditados (`ai.config.updated` /
  `ai.config.tested`) **sin registrar la clave**.
- **ON-PREM / sin fuga (AC-IA-6):** el proveedor `none` no hace red; `openai-compatible` contra un endpoint **local** (Ollama/vLLM)
  mantiene los datos dentro de la planta; solo `anthropic` (o un endpoint OpenAI-compatible remoto) envía el contenido del resumen a la
  nube — explicitado en la UI y el contrato por proveedor. Las llamadas a la IA se ejecutan **siempre en el backend**, nunca en el
  navegador; la clave jamás llega al cliente.
- **Grounding + firma humana (AC-IA-2/3/4):** el resumen de turno se genera SOLO con el snapshot congelado pasado explícito en el prompt
  (sin tools/BD/internet); el crudo determinista queda siempre visible al lado; la firma sigue siendo del humano (Part 11 con reauth),
  la IA nunca firma. **Degradación elegante (AC-IA-5):** si la IA falla/timeout/sin clave, cae al determinista con aviso.
- **Gobernanza de costo:** cada generación se registra en `AiGenerationLog` (proveedor/modelo/tokens/latencia/estado). El registro
  NUNCA rompe la operación (se loguea si falla). **Deuda:** scrubber de PII explícito en el grounding (AC-IA-7).

### Dashboard de incidencias (Fase 4.5) — agregación con ABAC por nodo
- **La autorización y la agregación viven en el backend** (`IncidentDashboardService`, endpoint `GET /incidents/dashboard`, gate
  `incident:view`). El servicio **replica el ABAC de la lista** (`getAccessibleNodeIds(userId)` ∩ `orgNodeIds` de la query): un
  usuario con alcance limitado **NUNCA agrega incidencias de nodos ajenos** — si su alcance es vacío, el payload es vacío. Verificado
  en vivo (`smoke-incidencias-dashboard.py`: un usuario scoped a un nodo no ve el conteo del nodo ajeno; el admin sí ve ambos).
- **Solo lectura.** No expone nada que el usuario no pueda ver ya por la lista; por eso **reusa `incident:view`** (sin permiso nuevo,
  sin migración). Agrega con `groupBy`/`$queryRaw` (nunca trae filas al navegador) y **no usa `eval`** (el bucketing es `date_trunc`
  parametrizado; la TZ de planta es un valor de entorno, no entrada del usuario).
- El front solo **visualiza** y enlaza (drill-down a la lista por querystring); la verdad de permisos y de datos es del backend.

### Motor de reglas de negocio — expresión SEGURA (Req-7, primer corte)
- **Sin `eval` ni scripting libre.** Las fórmulas (campos formulados) y las reglas cruzadas se expresan como un **AST
  con LISTA BLANCA de operadores** (tipo JSONLogic) evaluado por un intérprete **PURO** y SÍNCRONO en `@lyra/contracts/
  rules` — **cero superficie de parser / inyección de código**, serializable y auditable (diffea por versión). Decisión
  on-prem/auditabilidad (DECISIONS 2026-06-14). Cotas duras de tamaño/profundidad del AST; referencias circulares y a
  campos inexistentes se **rechazan al guardar el diseño** (fallar en diseño, nunca en llenado).
- **El servidor MANDA.** Los campos formulados son **read-only**: el backend **ignora** cualquier valor que el cliente
  envíe para ellos y **recomputa** autoritativamente desde los valores persistidos antes de validar/sellar/firmar
  (`recomputeComputedValues`); la **validación CRUZADA** (`evaluateCrossRules`) corre 100% en backend (ERROR bloquea
  completar/enviar/avanzar). El cliente reusa las mismas funciones puras solo para feedback inmediato.
- **GxP / integridad.** Los valores formulados se estampan en `LogEntryValue` con su `LogEntryFieldChange` (reason
  `COMPUTED`) y se **congelan al sellar**; el estampado va **antes** de la firma para que el snapshot canónico (§11.70)
  coincida con lo persistido. **Sin permisos nuevos** (catálogo 59): editar reglas usa `template:edit`/draft/publish.

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
