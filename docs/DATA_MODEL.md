# Modelo de datos — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 1 — esquema de identidad, RBAC/ABAC, estructura y auditoría **implementado** en Prisma; el resto sigue siendo diseño de alto nivel).

> **Estado Fase 1 (implementado):** ver `apps/watchlog-api/prisma/schema.prisma` y migraciones `20260605211220_init_security_structure` + `20260605211546_add_failed_login_count`. Modelos vivos: `User` (con `failedLoginCount`/`lockedUntil`/`forcePasswordChange` y, para el throttle del 2.º factor, `mfaFailedCount`/`mfaLockedUntil`), `PasswordHistory`, `Role` (con `requireMfa`), `Permission` (dims. MODULE/ACTION/WORKFLOW), `UserRole`, `RolePermission`, `Scope` (sujeto polimórfico user|role, *check constraint*), `Session`, `RefreshToken` (hash + familia + rotación), `MfaSecret`, `MfaRecoveryCode`, `PasswordResetToken` (hash SHA-256 + single-use + TTL, migración `20260606021713_add_password_reset_token`), `PasswordPolicy` (singleton, con `mfaMode`: enum `MfaMode`; migración `20260606041921_add_mfa_policy_requirement`), `OrgLevel`, `OrgNode` (ruta materializada `path`), **`Equipment`/`EquipmentCategory`/`ExternalReference`** (migración `20260608195838_add_equipment_and_external_reference`, con check constraints de criticidad 1–5 y de dueño polimórfico exclusivo en `ExternalReference`), `AuditLog` (trigger de inmutabilidad). El resto de entidades de abajo es diseño pendiente para fases posteriores.

> Single-tenant: **no** hay `tenant_id`. Cada instalación es de un cliente. Convenciones generales: PK `id` (cuid/uuid), `createdAt`/`updatedAt`, autor (`createdById`/`updatedById`) donde aplique, borrado lógico (`deletedAt`) en entidades de negocio.

## Entidades principales y relaciones

### Identidad y seguridad
- **User** — credenciales (hash Argon2id), estado, MFA. `User` *N—N* `Role` (vía **UserRole**).
- **Role** *N—N* **Permission** (vía **RolePermission**). Permisos atómicos de 4 dimensiones (ver `SECURITY.md`).
- **Scope** *(implementado)* — alcance de datos por NODO (1.er eje ABAC): liga `User` **o** `Role` (XOR, check constraint) a un `OrgNode` con `includeDescendants` (herencia por ruta materializada). Ausencia total ⇒ sin restricción.
- **TemplateScope** *(implementado — Fase 2.8)* — alcance de datos por PLANTILLA (2.º eje ABAC): liga `User` **o** `Role` (XOR, check constraint) a un `Template`. Set plano (sin descendientes). Eje ORTOGONAL al de nodo: el alcance efectivo combina ambos en **AND**. **Semántica permisiva**: ausencia total de filas (propias + de roles) ⇒ sin restricción de plantilla (ve todas). Únicos `[userId,templateId]`/`[roleId,templateId]`. Filtra el picker de llenado y la grilla/stats/export de bitácoras; NO el módulo admin de plantillas.
- **Session / RefreshToken** — sesiones y refresh tokens rotativos. **MfaSecret** (TOTP).
- **PasswordResetToken** — recuperación self-service: se guarda solo el hash del token; single-use y con TTL corto (ver `SECURITY.md` §6).
- **PasswordPolicy** — política configurable (longitud, expiración, etc.).
- **AuthIdentity** (Fase futura) — vínculo a proveedor externo OIDC/LDAP cuando se active.

### Estructura organizacional
- **OrgLevel** — nombres de nivel configurables (Área/Proceso/Equipo…).
- **OrgNode** — auto-referencial (`parentId`, `level`); jerarquía configurable y opcional.
- **Equipment** *(implementado, migración `20260608195838`)* — equipo industrial anclado a un `OrgNode` (patrón SAP PM: Functional Location 1:N Equipment). Identidad (`name`, `code?`, `tag?` único = assetTag estable), `categoryId?` (FK), `manufacturer/model/serialNumber`, `criticality?` (1–5, check constraint), `active` (estado operacional) + `deletedAt` (borrado lógico), `reportOrder`. **No** es el 4.º nivel de OrgNode (ver DECISIONS 2026-06-07/08).
- **EquipmentCategory** *(implementado)* — catálogo configurable de clases de equipo (`name`, `code?`, `isoRef?` opcional ISO 14224, `reportOrder`, `active`). No enum, no texto libre.
- **ExternalReference** *(implementado — solo modelo; UI/motor en Fase 3)* — mapeo polimórfico de un `OrgNode` **o** un `Equipment` (XOR, check constraint, patrón Scope) hacia un sistema externo (historiador/MES/EAM). `systemType` (String configurable), `externalId` (WebID/NodeId/Equipment Number), `externalPath`, `endpoint`, `metadata jsonb`, `enabled`. Integration-ready: un equipo mapea a varios sistemas a la vez.

### Plantillas y registros
> **Fase 2.1 (implementado — lado DEFINICIÓN):** ver migración `20260609133247_add_template_definition`.
> Un formulario es un **proceso de SECCIONES**, no una lista plana (ver DECISIONS 2026-06-09). El lado
> EJECUCIÓN (LogEntry…) se diseña en contratos y se migra en 2.4.
- **Template** *(implementado)* — contenedor lógico mutable: `name`, `description?`, `orgNodeId?` (**nodo PRIMARIO
  DERIVADO**, deprecado tras 2.8.0 — la visibilidad por nodo la gobierna `TemplateNodeAssignment`; null = global/varios/
  rama), `status` (DRAFT/PUBLISHED/ARCHIVED), `currentVersionId?` (versión publicada viva), `createdById/updatedById`
  (referencia blanda), `deletedAt` (borrado lógico).
- **TemplateNodeAssignment** *(implementado — Fase 2.8.0)* — asignación N:M **plantilla × nodo** = **fuente de verdad
  única del eje de NODO** de la visibilidad de plantilla: `templateId`, `orgNodeId`, `includeDescendants` (si true cubre
  el subárbol, incl. nodos futuros). Único `[templateId,orgNodeId]`. **CERO filas = GLOBAL** (visible en todo nodo,
  semántica permisiva). Los 3 modos se componen de filas: un nodo · varios · "todos los hijos de X". `Template.orgNodeId`
  se deriva de aquí (= el nodo si hay 1 asignación simple; null en otro caso). La plantilla es visible para un usuario si
  alguna asignación intersecta `ScopeService.getAccessibleNodes` (ids + rutas; el caso `includeDescendants` testea prefijo
  de ruta). Al crear una entrada el nodo elegible = `expand(asignaciones) ∩ accesibles`; el backend valida la membresía.
- **Template** *1—N* **TemplateVersion** *(implementado)* — versión **INMUTABLE al publicar** (patrón MMR de
  21 CFR Part 11): `versionNumber`, `status` (DRAFT/PUBLISHED), `name/description` (snapshot), `publishedAt/By`.
  **Flujo congelado (Fase 2.2):** `workflowDefinitionId?` → `WorkflowDefinition` y `workflowDefinitionVersionId?`
  → `WorkflowDefinitionVersion`, ambos **FK `onDelete: Restrict`** (la versión publicada congela qué versión de
  flujo usa; integridad histórica). Además `requireSignature` (Part 11 opt-in) y `recurrenceKind`/`recurrenceConfig`
  (rondas/turnos, editor 2.3).
- **TemplateSection** *(implementado)* — unidad atómica de permiso/llenado/firma: `key` (estable), `title`,
  `description?`, `order`, `requireSignature` (opt-in), `editableInStateKey?` (estado del flujo que la
  habilita; null = siempre). *N—N* `Role` vía **TemplateSectionRole** (permiso de llenado por sección).
- **TemplateField** *(implementado — modelo de 3 capas desde 2.1.1, migración `20260609155007_add_field_layers`)* —
  un campo son **3 capas separadas** (ver DECISIONS 2026-06-09):
  - **Capa 1 — presentación/widget:** `type` (enum `FieldType`: 8 núcleo + SEVERITY/SIGNATURE). Cómo se ve.
  - **Capa 2 — tipo de dato:** `dataType` (enum `FieldDataType`: STRING/NUMBER/BOOLEAN/DATE/DATETIME/TIME/
    **CODE**/**CODE_ARRAY**/**REFERENCE**/FILE/GEO/COMPUTED). Cómo se almacena/valida/reporta. Es **derivado del
    `type`** en backend (fuente única `deriveDataType` en `@lyra/contracts`); la UI no lo edita. Mapeo: NUMBER→NUMBER,
    TEXT/TEXTAREA→STRING, SELECT→CODE, MULTISELECT→CODE_ARRAY, BOOLEAN→BOOLEAN, DATE→DATE, DATETIME→DATETIME,
    SEVERITY→CODE (escala cerrada {1..5}), SIGNATURE→REFERENCE.
  - **Capa 3 — rol semántico:** `semanticRole?` (enum `FieldSemanticRole?`: EFFECTIVE_DATE/TITLE/PRIMARY_EQUIPMENT/
    SEVERITY_DRIVER; null = ninguno). Qué significa para la plataforma. En 2.1.1 solo `EFFECTIVE_DATE` actúa
    (promueve `LogEntry.effectiveAt`, 2.4); **a lo sumo uno por versión** (validado en contrato + backend).
  - Además: `key`, `label`, `help?`, `required`, `order`, `config` (JSONB validado por unión Zod), `visibleWhen?`
    (condicional). *N—N* `Role` vía **TemplateFieldRole** (override por campo).
  - **`config` de SELECT/MULTISELECT = `optionSource` discriminado** (desde 2.1.1, reemplaza `options[]`):
    `inline` (`items:[{code,label}]`) · `referenceList` (`listKey` → **Lista de Referencia gobernada**, REAL desde
    2.x: validado en `saveDraft`, resuelto en el preview) · `external` (`sourceKey` → Orígenes de Datos, Fase 3). El
    shape `options[]` legacy se **sube** a `inline` al leer/escribir (helper `upgradeFieldConfig`; configs son JSONB ⇒ sin migración SQL).
  - **Regla de reportabilidad:** el valor que se persiste al llenar (2.4) para una referencia es el **`code` estable,
    NO el label** (patrón dimensión de DW / FHIR Coding). Labels cambian sin romper histórico.
- **LogEntry** *(implementado — Fase 2.4, migración `20260610011231_add_log_entry`)* — EJECUCIÓN auditada de una
  versión de plantilla. **Campos de SISTEMA intrínsecos** (columnas indexadas, inmutables/auditadas, capturados
  SIEMPRE): `recordedAt` (commit, inmutable), `createdById`/`updatedById` (referencia blanda), `orgNodeId` (FK
  `Restrict`), `equipmentId?` (FK `SetNull`), `templateId`/`templateVersionId` (FK `Restrict`, integridad histórica),
  `currentStateKey?` (estado del flujo; null = sin flujo), `status` (`DRAFT`/`SUBMITTED`/`VOID`), `sealedAt?`,
  `deletedAt?`. La trazabilidad temporal es **estructural**, no un campo que se agrega.
  - **`entryNumber`** *(Fase 2.6, migración `20260610051359_add_logbook_review_columns`)* — **folio humano
    correlativo** único (secuencia BD; backfill ordenado por `recordedAt`). Referencia estable de auditoría/terreno
    (`BIT-000123` vía `formatEntryFolio`). Índices 2.6 añadidos: `createdById`, `currentStateKey`.
  - **`workflowDefinitionVersionId` DENORMALIZADO** (+ `workflowDefinitionId`): al crear la entrada se **copia** la
    versión de flujo que congeló su `TemplateVersion`. La entrada vive TODO su ciclo bajo **esa** versión aunque el
    flujo publique v(n+1) después. Re-basar = operación explícita y auditada (por defecto NO; estilo GxP).
  - **`effectiveAt`** (columna indexada) = fecha efectiva de negocio. Se promueve con la **cadena de prioridad** de
    `resolveEffectiveAt` en `@lyra/contracts`: valor del campo con `semanticRole = EFFECTIVE_DATE` → **fecha declarada
    a nivel de entrada** (`declaredEffectiveAt`, registro diferido 2.7.0) → `recordedAt`. Se **recalcula en cada
    guardado mientras la entrada es DRAFT** y se **CONGELA al enviar** (`sealedAt`).
  - **Registro diferido** *(Fase 2.7.0, migración `20260611183427_add_log_entry_origin`)* — la entrada tardía es
    legítima si queda IDENTIFICADA (GxP/ALCOA+ *contemporaneous*; lo fraudulento es ocultarla):
    - **`entryOrigin`** (enum `ONLINE`|`DEFERRED`, default `ONLINE`, indexado) — origen **DECLARADO por el operador**
      (atestación; nunca inferido por diferencia de relojes). Filtro de grilla/export; las guardas de período (2.7.1)
      y ventana de edición (2.7.2) se le suman sin migrar.
    - **`declaredEffectiveAt?`** — fecha/hora REAL del evento declarada a nivel de entrada. Si la versión tiene campo
      `EFFECTIVE_DATE`, el gesto **escribe ese campo** (con las MISMAS guardas de sección/rol que `saveSection`,
      `FieldChange` auditado con el motivo y bump de `version` de la sección) y el campo sigue mandando; si no existe,
      la declarada alimenta `effectiveAt` como fallback intermedio. Una sola fuente resuelta por entrada.
    - **`deferredReason?`** — motivo del diferimiento, **obligatorio al declarar** (práctica GxP de late entry).
    - **`deferredDeclaredById?` / `deferredDeclaredAt?`** — quién y cuándo declaró (evento `DEFERRED_DECLARED` en la
      timeline ALCOA+; correcciones previas quedan en AuditLog `logentry.deferral.declared|cleared` y en los
      `FieldChange`). Declarar/corregir/quitar solo en DRAFT sin sellar (`PUT /log-entries/:id/deferral`,
      permiso `logentry:fill` + ABAC); el sellado congela el origen.
  - **Dimensiones de turno/periodo estampadas:** `shiftCode?`, `operationalDate?`, `periodKey?` (columnas indexadas,
    nullable) se derivan vía **`ShiftResolver`** (a partir de `effectiveAt`, con el calendario que aplica al
    `orgNodeId`). Sin calendario → null (degradación elegante). Reportabilidad por turno/periodo sin recalcular.
- **LogEntrySection** *(implementado)* — sección INSTANCIADA: porta el estado de ejecución que no se deriva de la
  plantilla. `sectionKey` (clave estable), `state` (`PENDING`/`IN_PROGRESS`/`COMPLETED`/`LOCKED`), `filledById?`/
  `filledAt?`, `signatureId?` (Part 11, se llena en 2.5), **`version` Int** (concurrencia optimista por sección,
  check-and-bump). FK `onDelete: Cascade`, `@@unique([logEntryId, sectionKey])`.
  - **`requiresSignature`** *(Fase 2.6)* — estampado de la definición congelada al instanciar (+backfill): "firmas
    pendientes" = `requiresSignature AND signatureId IS NULL` en SQL, sin join a la definición.
- **LogEntryValue** *(implementado)* — valor actual, **1 fila por campo**: `sectionKey`, `fieldKey`, `dataType`
  (copiado para reporte), `value` jsonb (null = vacío). El valor de un campo de referencia se persiste como **`code`
  estable, NO label**. `@@unique([logEntryId, fieldKey])`.
  - **`thresholdBand?`** *(Fase 2.6, enum `WARN`|`CRIT`)* — banda ISA-18.2 ESTAMPADA al guardar contra la versión
    congelada (fuente única `thresholdBandFor` en contracts; backfill `db:backfill-threshold-bands`). Habilita
    review-by-exception (filtros/KPIs de "fuera de umbral") sin re-evaluar configs. Indexada.
- **LogEntryFieldChange** *(implementado)* — historial **append-only por campo** (antes/después): `fieldKey`,
  `before`/`after` jsonb, `changedById`, `changedAt`, `reason?`. Auditoría fina del llenado; complementa el AuditLog
  de eventos de alto nivel (`logentry.created`/`logentry.section.saved`/`logentry.submitted`). Desde 2.6 `changedAt`
  se estampa con el MISMO reloj que la firma del guardado (la verificación de integridad rebobina con `> signedAt`).
- **LogEntryTransition** *(implementado — Fase 2.5, migración `20260610035255_add_log_entry_execution`)* — historial
  **append-only** de transiciones EJECUTADAS: `workflowDefinitionVersionId` (versión congelada), `transitionKey`,
  `fromStateKey`/`toStateKey`, `actorId`+`actorEmail` (snapshot), `reason?`, `signatureId?` (ref. blanda a la firma),
  `occurredAt`. Índice `(logEntryId, occurredAt)`. Trazabilidad ALCOA+ de cómo avanzó el registro entre estados.
- **LogEntrySignature** *(implementado — Fase 2.5)* — firma electrónica estilo **21 CFR Part 11** (§11.50/11.70/11.200),
  entidad de primer orden **polimórfica** por `context` (`TRANSITION` | `SECTION_COMPLETION`): `transitionKey?`/
  `sectionKey?` (check XOR según contexto, patrón Scope/ExternalReference), `signerId?`+`signerName` (nombre impreso),
  `meaning` (significado), `method` (`PASSWORD`|`PASSWORD_MFA`), `payloadHash` (SHA-256 del snapshot canónico firmado),
  `signedAt` UTC. El snapshot NO se almacena (es reconstruíble desde `LogEntryValue`/`LogEntryFieldChange`); el hash da
  integridad/no repudio (record–signature linking). PKI/sello de tiempo cualificado **diferidos a Fase 7**.
- **AutoIncidentRule** — reglas que disparan incidencias desde campos (umbral, severidad ≥ N). **Fase 4.** El gancho
  `LogEntriesService.onTransitionExecuted` (no-op hoy) es el punto de enganche del evento `logentry.transition.executed`.

> **Autorización del llenado (2.4):** los guards aplican `logentry:view/create/fill`; la editabilidad por SECCIÓN la
> decide el backend = `(sección editable en `currentStateKey`) × (rol con permiso de sección, dato `TemplateSectionRole`
> + override por campo `TemplateFieldRole`) × (ABAC sobre `orgNodeId`)`. La validación de valores es 100% en servidor
> (`validateFieldValue` en `@lyra/contracts`, fuente única reusada por el cliente para feedback inmediato): tipo/rango/
> umbral ISA-18.2/regex/`optionSource` resuelto contra Listas vivas/`visibleWhen`.
>
> **Ejecución de flujo (2.5 — implementado):** `executeTransition` (`POST /log-entries/:id/transitions`, permiso
> `logentry:transition`) valida en backend (a) la transición sale de `currentStateKey`, (b) rol-dato autorizado
> (`WorkflowTransitionRole`), (c) ABAC sobre el nodo, (d) completitud de las secciones del estado de origen; aplica el
> cambio de estado, recomputa secciones (`LOCKED`/reapertura), **sella** `effectiveAt`+dimensiones en la 1ª salida del
> estado inicial y reconcilia `status` (terminal ⇒ `SUBMITTED`). `submit` queda SOLO para forms sin flujo (con flujo se
> rechaza) y desde el Afinamiento #4 (2026-06-11) su validación es **OBJETIVA**: exige TODAS las secciones con campos
> en `COMPLETED` (no solo las del que envía) — espejo del guard (d) de `executeTransition`; garantiza que la firma de
> completitud de sección no se pueda eludir. El DTO de sección expone además `blockedReason`/`assignedRoleNames`/
> `readOnlyFieldKeys` para que la UI comunique el motivo real del bloqueo. Firma opt-in por transición (`requireSignature`/`requireMfa`) y por completitud de sección
> (`TemplateSection.requireSignature`), capturada con `ReauthService` (contraseña + MFA step-up condicional).
>
> **Lectura / módulo de Bitácoras (2.6 — implementado):** `LogbookQueryService` (CQRS-lite, mismo módulo) sirve
> `GET /log-entries` (filtros completos en SQL + ABAC + keyset cursor + indicadores batched), `/stats` (KPIs con el
> mismo `where`), `/export` (CSV server-side), `:id/timeline` (audit trail unificado fusionado en backend),
> `:id/changes` (paginado), `:id/related` (mismo nodo+periodo / mismo turno) y
> `POST :id/signatures/:sigId/verify` (recomputa el hash canónico; rebobina `LogEntryFieldChange` a `signedAt`;
> veredicto `VALID` / `VALID_RECORD_CHANGED_AFTER` / `INVALID`, auditado).

### Flujos reutilizables (máquina de estados)
> **Fase 2.2 (implementado — lado DEFINICIÓN):** migración `20260609163822_add_workflow_definition`. Máquina de
> estados configurable (estados + transiciones), **NO BPMN**, integrada al RBAC dim. 3. Catálogo reutilizable por
> varias plantillas. La EJECUCIÓN (transiciones en vivo, firmas, step-up MFA) es 2.5.
- **WorkflowDefinition** *(implementado)* — contenedor lógico mutable: `key` (estable, único), `name`,
  `description?`, `status` (DRAFT/PUBLISHED/ARCHIVED), `currentVersionId?`, `createdById/updatedById`, `deletedAt`
  (borrado lógico). Espejo de `Template`.
- **WorkflowDefinition** *1—N* **WorkflowDefinitionVersion** *(implementado)* — versión **INMUTABLE al publicar**:
  `versionNumber`, `status`, `name/description` (snapshot), `publishedAt/By`. Referenciada/congelada por
  `TemplateVersion`. Editar publicada **clona** un borrador nuevo.
- **WorkflowState** *(implementado)* — estado de la máquina: `key` (estable en la versión), `name`, `description?`,
  `order`, `isInitial` (exactamente uno), `isFinal` (≥1), `color?` (token DS). `TemplateSection.editableInStateKey`
  referencia un estado por **clave** dentro de la versión de flujo congelada (no FK; ver DECISIONS 2026-06-09).
- **WorkflowTransition** *(implementado)* — transición dirigida: `key`, `label`, `fromStateId`/`toStateId` (FK a
  `WorkflowState` de la misma versión), `order`, `requireSignature`+`signatureMeaning?` (Part 11 opt-in),
  `requireMfa` (step-up AAL). *N—N* `Role` vía **WorkflowTransitionRole** (roles autorizados a ejecutar la
  transición = **dato**, no clave de catálogo; se honra en ejecución 2.5).
- **Validación de la máquina** (`validateWorkflowMachine` en `@lyra/contracts`, fuente única contrato+backend+UI):
  1 inicial exacto, ≥1 final, claves únicas, transiciones con estados existentes, alcanzabilidad desde el inicial,
  sin trampas (todo estado llega a un final). Se exige válida para **publicar**.

### Datos de referencia / Listas
> **Fase 2.x (implementado):** migración `20260609205303_add_reference_data`. Catálogo **gobernado** (NO
> versionado-inmutable como Template/Workflow): listas de valores reutilizables y reportables. El valor que se
> persiste al llenar (2.4) es el **`code` estable, NO el label** (dimensión de DW / FHIR Coding).
- **ReferenceList** *(implementado)* — `key` (estable, único; la referencia `optionSource.referenceList.listKey`),
  `name`, `description?`, `source` (MANUAL | EXTERNAL — EXTERNAL solo modelado; el sync es Fase 3), `active`,
  `sortOrder`, `deletedAt` (borrado lógico). *1—N* **ReferenceItem**.
- **ReferenceItem** *(implementado)* — `code` (estable, **`@@unique([listId, code])`**), `label`, `active`,
  `sortOrder`, **`metadata` jsonb** (atributos enriquecidos freeform: falla→{isoCategory}, contratista→{rut}…).
  FK a la lista `onDelete: Cascade`. Un code en uso **se desactiva, no se borra**; el guard de "code en uso" real
  (valores de `LogEntry`) llega en 2.4.
- **Binding** — `listKey` por **clave** (no FK; vive en el `config` JSONB del campo, coherente con
  `editableInStateKey`). Validado en `TemplatesService.saveDraft` (la lista debe existir y estar viva). Una lista
  referenciada por una plantilla **no se borra** (guard en `ReferenceListsService.remove`, consulta JSONB de
  `TemplateField.config`). Endpoint `GET /reference-lists/:idOrKey/resolve` devuelve ítems **activos** ordenados
  (code/label/metadata) para el preview del Form Builder y el llenado (2.4).

### Calendario operacional (turnos + periodo contable)
> **Fase 2.3.0 (implementado):** migración `20260609233155_add_operational_calendar`. Config de **primera clase**,
> separada del formulario. Turno/día operacional/periodo son **dimensiones DERIVADAS** del timestamp (patrón Shift
> Calendar de MES / SAP / ISA-95 / dimensión Fecha+Turno de DW). Catálogo **VIVO** (no versionado-inmutable); la
> inmutabilidad histórica la dará el **estampado** en `LogEntry` (2.4). Ver DECISIONS 2026-06-09.
- **OperationalCalendar** *(implementado; el período se DESACOPLÓ en 2.7.1.1)* — `key` (estable, único), `name`,
  `description?`, `timezone` (IANA; todo se guarda en UTC), `isDefault` (exactamente uno, mantenido en tx; el default no
  se borra), `active`, `dayStartShiftCode?` (turno cuyo inicio abre el día operacional; null = día civil 00:00),
  `deletedAt` (borrado lógico). *1—N* **OperationalShift**. (La config de período —`periodKind`/ancla— se movió a
  `FiscalCalendar`; ver más abajo.)
- **OperationalShift** *(implementado)* — `code` (estable, **`@@unique([calendarId, code])`**), `label`,
  `startTime` ("HH:MM" hora de pared local), `durationMinutes` (1..1440; resuelve el cruce de medianoche),
  `sortOrder`. FK `onDelete: Cascade`. Los turnos **se reemplazan en bloque** al guardar el calendario.
- **Asignación por nodo** — **`OrgNode.operationalCalendarId`** (FK `onDelete: SetNull`). La resolución de "qué
  calendario aplica a un nodo" sube por la **ruta materializada** (nodo → ancestro más cercano con calendario →
  `isDefault`), en `ShiftResolverService`.
- **Semántica de borde** — los turnos son **intervalos semiabiertos `[inicio, fin)`** (estándar DW/historiadores):
  el instante exacto del fin pertenece al turno SIGUIENTE (A 08:00–20:00 + B 20:00–08:00 ⇒ las 20:00:00 son de B, sin
  solape ni hueco). Los turnos se definen al **minuto** (HH:MM, como SAP/ISA-95); la lectura se clasifica al **segundo**
  para que el borde sea exacto sin redondear.
- **Resolución** — **`resolveShift`** (función PURA en `@lyra/contracts`, solo `Intl`): `timestamp → {operationalDate
  (YYYY-MM-DD), shiftCode|null}` (en 2.7.1.1 **dejó de calcular el período**). **`ShiftResolver`** (clase abstracta =
  token DI, patrón `EmailService`) elige el calendario por nodo y delega; lo inyectan **2.4** (estampa `shiftCode`/
  `operationalDate`), **2.3 Rondas** y **Fase 5**. `validateOperationalCalendar` (sin solapes, huecos permitidos) =
  fuente única contrato+backend+web. Endpoint `POST /operational-calendars/:id/preview` para el probador.

### Calendario FISCAL (período contable transversal)
> **Fase 2.7.1.1 (implementado):** migración `20260611210000_add_fiscal_calendar` + script `db:migrate-fiscal` +
> `20260611211500_decouple_fiscal_period_cleanup`. El período es TRANSVERSAL (SAP company code / Maximo Organization /
> NetSuite subsidiaria), desacoplado del *shift calendar*. Ver DECISIONS 2026-06-11.
- **FiscalCalendar** *(implementado)* — `key` (estable, único), `name`, `description?`, `timezone` (para ubicar "hoy"
  al generar/marcar Actual), `isDefault` (exactamente uno, en tx; el default no se borra), `active`, **período**:
  `periodKind` (MONTH | WEEK | CUSTOM), `periodAnchorDay?` (MONTH 1..28), `periodStartWeekday?` (WEEK 1..7),
  `periodLengthDays?`/`periodAnchorDate?` (CUSTOM), **`requirePeriod`** (rigor estricto Maximo, opt-in), `deletedAt`.
  *1—N* `OperationalPeriod`. **Asignación por nodo**: `OrgNode.fiscalCalendarId` (FK `onDelete: SetNull`), misma
  resolución por ruta materializada que el shift calendar.
- **Resolución del período** — **`FiscalResolver`** (token DI abstracto, espejo de `ShiftResolver`): toma el
  `operationalDate` (del shift calendar) y lo mapea al `periodKey` del calendario fiscal del nodo. Lógica pura en
  `@lyra/contracts`: `periodBoundsFor`/`periodKeyForOperationalDate`/**`enumeratePeriods`** (rango contiguo
  `[periodStart, periodEnd)`, `periodEnd` exclusivo = inicio del siguiente). `LogEntriesService.resolveDims` combina
  ambos ejes para estampar `shiftCode`/`operationalDate` (eje turno) + `periodKey` (eje fiscal).
- **Migración del histórico** — `db:migrate-fiscal` agrupa los `OperationalCalendar` por firma de período y crea **un
  `FiscalCalendar` por firma distinta** (default desde el calendario de turnos default); reasigna `fiscalCalendarId` a
  los nodos con firma ≠ default. Así el `periodKey` ya estampado se preserva EXACTO (no se rompe el histórico).

### Período contable gobernado
> **Fase 2.7.1 → endurecido en 2.7.1.1.** Modelo MATERIALIZADO (backbone Maximo) + tri-estado NetSuite. Gobierna el
> CIERRE de la escritura por ventana de tiempo (refs SAP OB52 / NetSuite / Maximo).
- **OperationalPeriod** *(implementado)* — fila materializada de un período de un calendario FISCAL: `fiscalCalendarId`
  (FK `onDelete: Cascade`), `periodKey`, **`periodStart`/`periodEnd`** (rango contiguo en días operacionales,
  `periodEnd` exclusivo), `status` (**PeriodStatus** OPEN | CLOSED | LOCKED; CLOSING deprecado, retenido para parseo),
  `closedBy*`/`closeReason?`, **`lockedBy*`/`lockReason?`**, `reopenedBy*`/`reopenReason?`.
  **`@@unique([fiscalCalendarId, periodKey])`** + índice `(fiscalCalendarId, status)`. Historial en **AuditLog**
  (`opsperiod.generated|closed|locked|unlocked|reopened`, inmutable).
- **Generación EXPLÍCITA** — `generate(fiscalCalendarId, year)` materializa filas contiguas vía `enumeratePeriods`,
  **idempotente** (crea las faltantes OPEN, jamás degrada CLOSED/LOCKED). Reemplaza el modelo LAZY de 2.7.1. La lista
  agrupa por año y marca el período **Actual** (`isCurrent` = hoy ∈ `[periodStart, periodEnd)` en la TZ del fiscal).
- **Estados y transiciones** — `close` OPEN→CLOSED con guarda **SECUENCIAL** (no se cierra si un anterior sigue OPEN);
  `lock` CLOSED→**LOCKED** (`opsperiod:lock`); `unlock` LOCKED→CLOSED (`opsperiod:unlock`, two-key); `reopen` CLOSED→OPEN
  (`opsperiod:reopen`) con **secuencialidad inversa**: BLOQUEA si hay posterior LOCKED, exige `acknowledgeLaterClosed`
  si hay posterior solo CLOSED.
- **Guarda de escritura** — **`OperationalPeriodService.assertWritable(at, orgNodeId, perms)`** (fuente única, usa
  `ShiftResolver` → operationalDate → `FiscalResolver` → periodKey + fila): **LOCKED** bloquea a TODOS (incl. el bypass);
  **CLOSED** bloquea salvo **`opsperiod:write-closed`**; **`requirePeriod`** sin fila generada bloquea salvo el bypass.
  Lanza 403 `blockedReason = PERIOD_CLOSED`. Invocada en `create`/`saveSection`/`setDeferral`/`submit`/`executeTransition`
  sobre la `effectiveAt`, **antes** de completitud/validación/re-auth. LECTURAS y verificación de firma nunca se bloquean.
  Sin día operacional/calendario fiscal ⇒ ungobernado ⇒ nunca bloquea.
- **Huella proactiva** — en `getDetail`, si el actor sin excepción tiene una entrada en período cerrado, todas las
  secciones reportan `PERIOD_CLOSED` (precede a las reglas de sección) y no se ofrecen transiciones.
- **Endpoints** — `GET /operational-periods?fiscalCalendarId=` (filas + `requireReauth` mapa), `POST .../generate`,
  `.../close`, `.../reopen`, `.../lock`, `.../unlock` (motivo ≥5 + creds opcionales), `GET .../history` (rastro del
  AuditLog). `periodKey`/`fiscalCalendarId` por query.

### Configuración del sistema (Fase 2.7.1.1 UX → 2.7.2)
> Migraciones `add_system_settings` + `period_mfa_per_action` + **`add_edit_window`**.
- **SystemSettings** *(implementado)* — fila **singleton** (`id="system"`): 4 flags
  `requireMfaPeriod{Close,Reopen,Lock,Unlock}` (re-autenticación MFA por acción de gobernanza de período); **ventana de
  edición global (2.7.2)**: `editWindowAnchor` (**EditWindowAnchor** RECORDED|EFFECTIVE, default RECORDED),
  `editWindowMinutes?` (null = sin ventana = comportamiento pre-2.7.2; unidad canónica = minutos, la UI permite min/horas), `requireMfaEditWindowOverride`; `updatedById?`,
  `updatedAt`. `SettingsService.requireMfaFor(action)`/`periodReauthMap()` lo consume `OperationalPeriodService`;
  `editWindowSettings()` (una lectura) lo consume `LogEntriesService`. Gate MFA vía `ReauthService`; `mfaVerified`
  estampado en el AuditLog. Pantalla `/configuracion` (`module:settings:view` + `settings:manage`), pestañas Seguridad /
  Bitácoras.

### Ventana de edición configurable (Fase 2.7.2)
> Migración aditiva **`20260612025159_add_edit_window`**. 2.º eslabón de la gobernanza temporal (corrección de DATOS).
- **`Template.editWindowAnchor?`/`editWindowMinutes?`** — config de la ventana en el **contenedor MUTABLE** (gobernanza
  VIVA, patrón SAP OB52 / Odoo lock dates: cambiarla aplica de inmediato a todas las entradas, **sin republicar la
  versión**). Unidad canónica = **MINUTOS** (la UI ingresa min/horas vía `EditWindowDurationField`; migración
  `…_edit_window_minutes` convirtió las horas previas ×60). Tri-estado: `null`=hereda `SystemSettings` · `0`=sin ventana
  (explícito) · `>0`=propia.
  Check constraint BD 0..8760 h. Auditado con before/after en `template.updated`.
- **Resolución (fuente única `@lyra/contracts`)** — `resolveEditWindow(template, global)` aplica la herencia →
  `{anchor, windowMinutes}` o null (sin ventana); `editWindowDeadline(cfg, recordedAt, effectiveAt)` = ancla (RECORDED=
  `recordedAt` inmutable / EFFECTIVE=`effectiveAt`) + horas; `isEditWindowExpired(deadline, now)` con borde **no
  inclusivo** (en el límite aún se edita).
- **Guarda de escritura** — **`LogEntriesService.assertEditWindowWritable(entry, userId, dto)`** en
  `saveSection`/`setDeferral`/`submit` (NO `create` ni `executeTransition`: la ventana gobierna corrección de datos, no
  el avance del flujo). Vencida ⇒ exige **`logentry:write-expired`** (catálogo 59) + **`overrideReason` ≥5** (GxP) +
  re-auth MFA si `requireMfaEditWindowOverride`. En **AND** con la guarda de período ("gana la más estricta", cada una
  con su bypass). Con ancla EFFECTIVE usa la `effectiveAt` **persistida** (no la prospectiva).
- **Auditoría del override** — evento **dedicado** `logentry.editwindow.override` (`metadata` = operation/reason/
  mfaVerified/windowExpiredAt) + `overrideReason` copiado a **`LogEntryFieldChange.reason`** + flag en el audit del write.
- **Huella en `getDetail`** — `editWindow {anchor, windowMinutes, expiresAt, expired, canOverride, overrideRequiresMfa}`
  (null = sin ventana). Vencida + sin override ⇒ secciones reportan **`EDIT_WINDOW_EXPIRED`** (precede a `WRONG_STATE`/
  `MISSING_ROLE`; `PERIOD_CLOSED` precede a esta). La UI muestra "Editable hasta X" antes de vencer.

### Orígenes de datos
- **DataSource** — URL base, tipo de auth, **credencial cifrada en reposo**. *1—N* **DataSourceEndpoint** (path, método, mapeo JSONPath, TTL). Caché en Redis. **Espejo ENTRANTE:** en Fase 3 un endpoint puede **alimentar/materializar** una `ReferenceList` (`source=EXTERNAL`).

### Incidencias (workflow HSE)
- **Incident** — severidad, prioridad, estado, asignado, reporter, SLA/due, protocolo, origen.
- **IncidentComment**, **IncidentActivity** (timeline append-only), **IncidentAttachment**.
- **Flujo de incidencias** — reutiliza la entidad **WorkflowDefinition** ya implementada en Fase 2.2 (estados +
  transiciones + roles por transición). En Fase 4 una incidencia instancia/avanza por un flujo configurable, igual
  patrón que los registros de bitácora; no se duplica el modelo de máquina de estados.

### Turnos
- **ShiftPattern** *1—N* **Shift** — régimen configurable.
- **ShiftHandover** — parámetros recopilados, pendientes, incidencias heredadas, resumen IA. *1—1* **HandoverAck** (recepción + firma).

### Conocimiento
- **KnowledgeArticle** — tipo (lección/procedimiento/patrón IA), `tsvector` para búsqueda; nutrido por incidencias resueltas.

### Transversal
- **AuditLog** — **append-only / inmutable**: quién, qué, cuándo, valor antes/después. Cubre entradas, incidencias y configuración de seguridad.
- **Attachment** — metadatos de archivos en MinIO (firma/foto/evidencia) + hash de integridad.

## Diagrama de relaciones (resumen)

```
User N—N Role N—N Permission
User/Role ──< UserScope >── OrgNode (self ref) / Template
OrgLevel ──< OrgNode
Template ──< TemplateVersion ──< Entry ──< EntryChangeLog
Template.field(api) ──> DataSourceEndpoint >── DataSource
Entry ──(AutoIncidentRule)──> Incident ──< {Comment, Activity, Attachment}
WorkflowDefinition ──< WorkflowTransition ──(rige)── Incident.status
ShiftPattern ──< Shift ──< Entry
ShiftHandover ──1—1── HandoverAck
Incident(resuelta) ──> KnowledgeArticle
(*) AuditLog y Attachment: transversales
```

## Notas de implementación
- **Valores de llenado en TABLA HILA relacional** (`LogEntryValue`, 1 fila por campo; fork confirmado 2026-06-09),
  no en un blob: habilita auditoría por campo (`LogEntryFieldChange`), concurrencia optimista por sección, el guard
  real de "code en uso" de Listas y reportabilidad por columna. El `value` de cada fila es `JSONB` tipado por
  `dataType`; validado contra la `TemplateVersion` (Zod en backend, `validateFieldValue`).
- Índices previstos: FKs, `OrgNode.parentId`, `Entry(templateId, createdAt)`, `Incident(status, severity)`, GIN en `tsvector` de KB y en `JSONB` consultable.
- El esquema vive en `apps/watchlog-api/prisma/schema.prisma`; migraciones versionadas con `prisma migrate`.
