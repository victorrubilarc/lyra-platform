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
- **OrgStructure** *(implementado — multi-estructura, migración `20260623120000_add_org_structure`)* — una
  instalación puede definir VARIAS estructuras en paralelo, cada una con su propio set de niveles y su propio
  árbol (p. ej. minera Faena→Planta y otra TI Contrato→Dominio). `key` única (slug), `name`, `isDefault`
  (índice único parcial: exactamente UNA por defecto, la que absorbió lo legado), `active`, `reportOrder`,
  borrado lógico. **NO es multi-tenant** (sigue sin `tenant_id`): es multi-estructura dentro de una instalación.
  Los CATÁLOGOS (plantillas, flujos, tipos de incidencia, listas de referencia) siguen COMPARTIDOS; solo el
  árbol + niveles + calendarios son por-estructura. Aislamiento ESTRICTO. Ver `DECISIONS.md` 2026-06-23.
- **OrgLevel** — nombres de nivel configurables (Área/Proceso/Equipo…). Pertenece a una **OrgStructure**
  (`structureId`); el `order` es único **por estructura** (`@@unique([structureId, order])` — reemplaza el
  `@@unique([order])` global, que bloqueaba coexistir "nivel 0 = Faena" y "nivel 0 = Contrato").
- **OrgNode** — auto-referencial (`parentId`, `level`); jerarquía configurable y opcional. Lleva `structureId`
  **denormalizado en cada nodo** (== el del padre; invariante forzado en `StructureService`, no se reparenta
  entre estructuras). La ruta materializada `path` (IDs de nodo, cuid únicos) **no colisiona** entre
  estructuras, así que descendientes/ancestros/herencia de calendarios siguen funcionando sin cambios;
  `structureId` es solo filtro y guardia.
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
  (referencia blanda), `deletedAt` (borrado lógico). **`purpose`** *(fork W5, 2026-07-02)* — enum **`TemplatePurpose?`**
  (hoy `CHECKLIST`; null = general): marcador de UX en el contenedor mutable (gobernanza viva, editable en el Form Builder)
  que **filtra** el picker de reglas de checklist de OT a las plantillas pensadas como checklist/permiso. No cambia la
  mecánica del formulario (cualquier plantilla PUBLICADA sigue usable). Migr. `20260702190000_add_template_purpose`.
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
  (rondas/turnos, editor 2.3). **Reglas de negocio (Req-7, migración `20260614120000_add_business_rules`):**
  `rules` (JSONB, default `[]`) = array de reglas de **validación CRUZADA** `{key, when (AST seguro), severity
  ERROR|WARN, message}`, parte de la versión INMUTABLE (cambiar una regla = nueva versión auditada). Validadas por
  `@lyra/contracts/rules` (refs a campos existentes, cotas, sin ciclos entre formulados) al guardar el borrador.
- **TemplateSection** *(implementado)* — unidad atómica de permiso/llenado/firma: `key` (estable), `title`,
  `description?`, `order`, `requireSignature` (opt-in), `editableInStateKey?` (estado del flujo que la
  habilita; null = siempre). *N—N* `Role` vía **TemplateSectionRole** (permiso de llenado por sección).
- **TemplateField** *(implementado — modelo de 3 capas desde 2.1.1, migración `20260609155007_add_field_layers`)* —
  un campo son **3 capas separadas** (ver DECISIONS 2026-06-09):
  - **Capa 1 — presentación/widget:** `type` (enum `FieldType`: 10 base + **Ola 1** `CONFORMITY`/`RATING`/`TIME`/
    `DURATION`/`RANGE` + presentación `HEADING`/`STATIC_TEXT`/`DIVIDER`/`NOTICE`/`PROCEDURE_LINK`/`REFERENCE_IMAGE`
    + **Ola 2** `REFERENCE`/`RISK_MATRIX` + **Ola 3** `ATTACHMENT` + **Ola 4** `TABLE`/`MATRIX`; migraciones `20260615120000_add_ola1_field_types` /
    `20260615140000_add_ola2_field_types` / `20260615160000_add_ola3_field_types` / `20260615180000_add_ola4_field_types`). Cómo se ve.
  - **Capa 2 — tipo de dato:** `dataType` (enum `FieldDataType`: STRING/NUMBER/BOOLEAN/DATE/DATETIME/TIME/
    **CODE**/**CODE_ARRAY**/**REFERENCE**/FILE/**FILE_ARRAY**/GEO/COMPUTED/**RANGE**/**LAYOUT**/**RISK**/**TABLE**/**MATRIX**). Cómo se almacena/valida/reporta. Es
    **derivado del `type`** en backend (fuente única `deriveDataType` en `@lyra/contracts`); la UI no lo edita. Mapeo:
    NUMBER→NUMBER, TEXT/TEXTAREA→STRING, SELECT→CODE, MULTISELECT→CODE_ARRAY, BOOLEAN→BOOLEAN, DATE→DATE,
    DATETIME→DATETIME, SEVERITY→CODE (escala cerrada {1..5}), SIGNATURE→REFERENCE. **Ola 1:** CONFORMITY→CODE
    (catálogo cerrado {CONFORME,NO_CONFORME,NA}), RATING→NUMBER (ordinal), TIME→TIME, DURATION→NUMBER (minutos
    canónicos), RANGE→RANGE (valor estructurado `{from,to}`), y los 6 objetos de PRESENTACIÓN→**LAYOUT** (no-dato: el
    llenado los ignora — no `LogEntryValue`, no valida, fuera de reglas/resumen/obligatorios; fuente única
    `isPresentationalType`). **Ola 2:** `REFERENCE`→REFERENCE (almacena el **id** de una entidad; `config.entity` =
    equipment/user/orgNode/shift discrimina endpoint/columnas/alcance ABAC; validación server-side vía
    `opts.allowedRefIds` = ids existentes + activos + EN ALCANCE, espejo de `allowedCodes`), `RISK_MATRIX`→**RISK**
    (valor estructurado `{probability,consequence}` 1-based; nivel DERIVADO por matriz en config `cells[p-1][c-1]`→
    severidad 1..5, ISO 31000; `riskLevelFor`). **Variantes por config (no tipo):** RUT/correo/teléfono/URL = TEXT +
    `config.format`; porcentaje/moneda = NUMBER + `config.format`; radio/segmentos = SELECT + `config.displayAs`;
    casillas/modal = MULTISELECT + `config.displayAs`; **lectura con tolerancia** = NUMBER + `{expected,tolerance,
    critTolerance}` (deriva bandas warn/crit vía `deriveToleranceBands`/`effectiveNumberBands`); **contador/acumulado**
    = NUMBER + `{counter,counterNonDecreasing}` (delta vs la última lectura sellada del mismo equipo+campo;
    `LogEntryDetail.counterPreviousValues`). **Ola 3:** `ATTACHMENT`→**FILE_ARRAY** (adjuntos de evidencia en MinIO; un
    solo tipo discriminado por `config.kind` = file/photo/audio/sketch; valor = **descriptor[]**); el escáner QR/código
    es `TEXT` + `config.scan` (decode client-side que rellena el valor, NO es archivo). El **descriptor** (lo que se
    persiste en `LogEntryValue.value`, NUNCA una URL) = `{id,key,filename,size,contentType,checksum(sha256),uploadedAt,
    uploadedById}`; la `key` = `entries/{logEntryId}/{fieldKey}/{uuid}-{filename}` en el bucket `MINIO_BUCKET`. La subida
    es PROXIED por la API (choke-point de validación tamaño/tipo); la descarga = **presigned GET** de vida corta firmado
    server-side con la ABAC de `getDetail`. Pertenencia verificada por prefijo de objeto + existencia (análogo a
    `allowedRefIds`); delete-on-remove al quitar un adjunto; `voidEntry` borra el prefijo del borrador anulado. **Ola 4
    (objetos ESTRUCTURADOS / repetibles):** `TABLE`→**TABLE** (valor = `Array<Record<colKey, escalar>>`; **tabla repetible**
    `config.layout=table` o **grupo repetible** `config.layout=cards`; filas dinámicas) y `MATRIX`→**MATRIX** (valor =
    `Record<rowKey, Record<colKey, escalar>>`; filas=parámetros × columnas=turnos FIJAS configuradas + celda uniforme).
    Las **columnas/ejes** son sub-campos ESCALARES (`{key,label,type,config,required}`) definidos en `config` y CONGELADOS
    en la versión (jsonb); los tipos de celda permitidos son TEXT/TEXTAREA/NUMBER/SELECT(inline)/BOOLEAN/DATE/TIME/DURATION/
    CONFORMITY/RATING. La **validación es POR CELDA**: `validateFieldValue` (casos TABLE/MATRIX) delega en la validación del
    tipo de cada celda — un SELECT de celda resuelve su catálogo desde las opciones INLINE de la columna (sin ABAC por
    celda); las filas totalmente vacías se ignoran (placeholder); una columna `required` vacía en una fila NO vacía es
    error. La **obligatoriedad** se generaliza con `requiredFieldError` (TABLE ⇒ ≥ `max(1,minRows)` filas COMPLETAS; MATRIX
    ⇒ ≥1 celda; resto ⇒ no vacío). Son **opacos** al motor de reglas y a la línea "Resumen" de la grilla en el MVP
    (`assertGridFieldKeysExist` los rechaza como candidatos de resumen). Sin permisos nuevos.
  - **Capa 3 — rol semántico:** `semanticRole?` (enum `FieldSemanticRole?`: EFFECTIVE_DATE/TITLE/PRIMARY_EQUIPMENT/
    SEVERITY_DRIVER; null = ninguno). Qué significa para la plataforma. En 2.1.1 solo `EFFECTIVE_DATE` actúa
    (promueve `LogEntry.effectiveAt`, 2.4); **a lo sumo uno por versión** (validado en contrato + backend).
  - Además: `key`, `label`, `help?`, `required`, `order`, `config` (JSONB validado por unión Zod), `visibleWhen?`
    (condicional). *N—N* `Role` vía **TemplateFieldRole** (override por campo).
  - **Ancho en la grilla (Fase 2.1.2 → 2.1.3, `colSpan Int @default(12)`, CHECK 1..12, migración
    `20260614180000_field_colspan` que reemplazó el enum `LayoutWidth` de 2.1.2):** hint de **PRESENTACIÓN puro** del
    campo = cuántas columnas de **12** ocupa en la grilla responsiva de su sección (12=completo, 6=media, 4=tercio,
    3=cuarto…; SAP Fiori / ServiceNow / Bootstrap). Vive en la versión INMUTABLE como **columna dedicada** (paralelo a
    `visibleWhen`/`computed`/`semanticRole`, NO dentro de `config` —los config por tipo son Zod `.strict()`). No toca
    validación/datos. Default 12 ⇒ las filas existentes preservan el render de 1 columna. Se aplica desde una fuente de
    render ÚNICA (`FieldGrid`/`FieldGridCell`, web) compartida por vista previa del builder + llenado + visor (registro
    idéntico en los tres). El **editor del builder es WYSIWYG** (2.1.3): el campo se ve en su ancho real y se
    redimensiona/reordena arrastrando (DnD nativo + pointer-events, sin librería nueva).
  - **Campo FORMULADO (Req-7, `computed?` JSONB, migración `20260614120000`):** `{ expression }` (AST seguro de
    `@lyra/contracts/rules`). Presente ⇒ el campo es **READ-ONLY**: su valor lo **DERIVA el servidor** (autoritativo)
    desde otros campos/constantes y se **estampa** en `LogEntryValue` (recalcula en DRAFT, **congela al sellar** — GxP;
    ÷0/input nulo ⇒ vacío). Conserva su `type`/`dataType` real ⇒ el **umbral ISA-18.2 aplica al valor calculado** y la
    grilla/búsqueda/reporte funcionan igual. "¿Es derivado?" se sabe desde la versión (sin columna en el valor); el
    `LogEntryFieldChange` del recálculo lleva `reason: COMPUTED` (ALCOA+: el humano teclea insumos, el sistema deriva).
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
  - **`voidedAt?`/`voidReason?`/`voidedById?`** *(Fase 2.8.2, migración `20260614150000_add_logentry_void`)* — huella de
    la **anulación de un borrador**: `status` pasa a `VOID` (anulación LÓGICA, NO hard-delete y **NO** usa `deletedAt`,
    que ocultaría la fila de TODA consulta incl. el filtro VOID). La entrada queda **trazable** (recuperable con
    `?status=VOID`), fuera de las superficies normales (la grilla excluye VOID salvo filtro explícito). Quién/cuándo/por
    qué; el `AuditLog` inmutable (`logentry.voided`) conserva el rastro. Solo aplica a un `DRAFT` no sellado (la
    anulación GxP de un registro SELLADO = transición inversa + firma §11.200, corte posterior junto a la reversa de 2.5).
  - **`currentStateSince?`** *(Workflow SLA, migración `20260613140000_add_workflow_sla`)* — momento de ENTRADA al
    estado actual: seteado al crear (= `recordedAt`) y en cada transición (= `occurredAt`). Base de cómputo del ATRASO
    (`now − currentStateSince > maxStayMinutes` del estado actual). Estampado aditivo que evita la subconsulta
    `MAX(transición)`. Backfill desde la última transición o `recordedAt`. Índice `currentStateSince`.
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
  `order`, `isInitial` (exactamente uno), `isFinal` (≥1), `color?` (token DS), **`maxStayMinutes?`** *(Workflow SLA,
  migración `20260613140000_add_workflow_sla`)* = SLA de PERMANENCIA en minutos canónicos (null = sin SLA; check
  1..525600). Viaja en la versión CONGELADA ⇒ histórico fiel. `TemplateSection.editableInStateKey`
  referencia un estado por **clave** dentro de la versión de flujo congelada (no FK; ver DECISIONS 2026-06-09).
- **WorkflowTransition** *(implementado)* — transición dirigida: `key`, `label`, `fromStateId`/`toStateId` (FK a
  `WorkflowState` de la misma versión), `order`, `requireSignature`+`signatureMeaning?` (Part 11 opt-in),
  `requireMfa` (step-up AAL). *N—N* `Role` vía **WorkflowTransitionRole** (roles autorizados a ejecutar la
  transición = **dato**, no clave de catálogo; se honra en ejecución 2.5).
  **+ `notifyConfig Json?`** *(Notif. avanzadas Fase A, 2026-06-17)* — regla de NOTIFICACIÓN de la transición (validada por
  `transitionNotifyConfigSchema`: `enabled`/`templateId?`/`roleIds[]`/`userIds[]`/`includeAuthor`/`includeActor`/
  `includeDestinationRoles`/`externalEmails[]`). Se **CONGELA con la versión** (como roles/firma); el resolver la lee al despachar
  `entry.transition` (roles→usuarios EN VIVO; externos SALTAN ABAC, auditados). `null` ⇒ default de sistema
  (`SystemSettings.notifyTransitionDefaultDestinationRoles`, default = avisar a los roles del estado destino).
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
  fuente única contrato+backend+web. Endpoint `POST /operational-calendars/:id/preview` para el probador. En **2.3 Rondas**
  se le agregó **`calendarForNode(nodeId)`** (TZ + turnos del nodo, para el generador).

### Programación de rondas (Fase 2.3)
> Recurrencia que ABRE una entrada por ocurrencia (patrón SAP PM Maintenance Plan/calls · Maximo PM/WO · j5 schedules ·
> ISA-95 shift handover). El HORARIO es gobernanza VIVA separada de la versión GxP; las OCURRENCIAS se materializan hacia un
> horizonte. Migración aditiva `20260615200000_add_round_scheduling`. Ver DECISIONS 2026-06-15.
- **LogSchedule** *(implementado — Fase 2.3)* — horario de ronda: `name?`, `templateId` (FK→Template, Cascade), `orgNodeId`
  (FK→OrgNode, Cascade), `equipmentId?` (FK→Equipment, SetNull; equipo opcional fijado), `recurrenceKind` (enum
  `RecurrenceKind` reusado: NONE/SHIFT/INTERVAL/CALENDAR), `recurrenceConfig` (Json, validado por `@lyra/contracts` según el
  kind: SHIFT `{shiftCodes?}` · INTERVAL `{everyMinutes,anchorTime?}` · CALENDAR `{times,weekdays?,daysOfMonth?}`),
  `dueWindowMinutes` (plazo: `dueAt = scheduledFor + dueWindowMinutes`), `horizonDays` (cuánto materializar adelante, default 2),
  **`responsibleRoleId?` (FK→Role, SetNull; Fase 2.3.1)** = rol responsable del worklist "Mis rondas" (el horario es del PUESTO,
  work center/responsible role de SAP PM/Maximo); `null` = sin responsable ⇒ fallback nodo+turno. Se lee EN VIVO (reasignar
  re-enruta las ocurrencias pendientes; NO se denormaliza al slot), `active`, **`lastGeneratedThrough`** (marca de agua del
  generador idempotente), autoría + `deletedAt`. Contenedor MUTABLE: reprogramar/pausar NO republica la versión de la plantilla.
  *1—N* **RoundOccurrence**.
- **RoundOccurrence** *(implementado — Fase 2.3)* — ocurrencia materializada (un "slot" liviano, NO es una entrada):
  `scheduleId` (FK→LogSchedule, Cascade), `templateId`/`orgNodeId`/`equipmentId?` (denormalizados del horario), `scheduledFor`
  (anclaje UTC), `dueAt` (plazo UTC), `shiftCode?`/`operationalDate?`/`periodKey?` (estampados al generar vía `ShiftResolver`/
  `FiscalResolver`), `status` (enum **`RoundOccurrenceStatus`** PENDING/COMPLETED/SKIPPED/CANCELED), **`logEntryId?` (FK→LogEntry,
  SetNull, `@unique`)** = la entrada que cumplió la ronda (la ocurrencia POSEE el enlace; `LogEntry` tiene la relación inversa,
  sin columna duplicada), omisión (`skippedById/At/Reason`), `generatedAt`. **`@@unique([scheduleId, scheduledFor])`** =
  idempotencia del generador. **"Vencida" NO es un estado:** se DERIVA en consulta (`status=PENDING AND dueAt<now`), espejo del
  SLA, sin cron.
- **Generación** — `enumerateOccurrences` (función PURA en `@lyra/contracts`, solo `Intl` vía `localDateInTz`/`zonedTimeToUtc`):
  `(horario, [from,to)) → slots`. Idempotente vía `createMany skipDuplicates` + watermark; invocada **lazy** al listar
  ocurrencias y por `POST /schedules/generate`. **Ciclo de vida:** `start` crea la entrada (reusa `LogEntriesService.create`) y
  la liga; al **sellar** (submit/transición) la ocurrencia → COMPLETED; **VOID** del borrador la desliga → PENDING. Permisos
  `schedule:view`/`schedule:manage` (planificador) + **`round:execute`** (operador: ver+ejecutar "Mis rondas"; catálogo **63**,
  Fase 2.3.1). ABAC por nodo. **Worklist (2.3.1):** `GET /schedules/my-rounds` acota `PENDING ∩ nodos accesibles ∩ schedule
  {responsibleRoleId null|∈ roles del usuario}`. El listado del planificador (`GET /schedules`) expone además por horario
  `pendingCount`/`overdueCount` y **`nextOccurrenceAt`** (DTO; = `_min(scheduledFor)` de las ocurrencias PENDING, "next call date"
  estilo SAP PM; no es columna persistida). Diferido: multi-nodo · fan-out por equipo (Route) · floating · completion-requirement ·
  cron · rol responsable MULTI.

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

### Modo de equipo por plantilla (Fase 2.8.0.2)
> Migración aditiva **`20260612180000_add_template_equipment_mode`**. Gobernanza del objeto de referencia EAM sobre la
> mecánica de 2.8.0.1 (patrón notification-type SAP PM / WO-type Maximo).
- **`Template.equipmentMode`** (enum **`EquipmentMode`** `NONE|OPTIONAL|SUGGESTED|REQUIRED`, `@default(OPTIONAL)`) — config
  en el **contenedor MUTABLE** (gobernanza VIVA, sin republicar la versión, espejo de `editWindow*`). Default OPTIONAL =
  preserva el comportamiento contextual de 2.8.0.1 en plantillas ya publicadas (cero ruptura). Auditado before/after en
  `template.updated`. **OPTIONAL y SUGGESTED son equivalentes en el backend** (permisivos); SUGGESTED solo empuja en la UI.
- **Enforcement (backend AUTORIZA)** — `LogEntriesService.assertEquipmentForMode(mode, equipmentId)` en **`create`**
  (punto de materialización donde `equipmentId` se estampa, como `orgNodeId`): **REQUIRED** sin equipo ⇒ 400; **NONE** con
  equipo ⇒ 400. `previewNew` (compose) solo valida la consistencia de NONE; REQUIRED **no** bloquea al componer (el gate
  duro corre al materializar). NO se re-valida al sellar: el equipo queda estampado (histórico intacto).
- **Exposición** — `eligibleNodesForTemplate` devuelve `equipmentMode` (el modal de creación lo refleja: oculta/ofrece/
  sugiere/obliga) y **omite** la consulta de equipos cuando el modo es NONE. Sin permiso nuevo (gate `template:edit`).

### Bitácoras — grilla orientada a contenido (Fase 2.8.1a)
> Migración aditiva **`20260612190000_add_grid_field_keys`**. Hace la grilla de `/bitacoras` RECONOCIBLE por su contenido
> (síntesis SAP Fiori smart columns + j5/Maximo + Splunk + EBR; ver DECISIONS 2026-06-12).
- **`Template.gridFieldKeys`** (`String[] @default([])`) — pool ORDENADO de `key` de campos candidatos a mostrarse como
  **"Resumen"** en el listado. Vive en el **contenedor MUTABLE** (gobernanza VIVA, sin republicar; espejo de `equipmentMode`/
  `editWindow*`), guardado con **"Guardar configuración"** vía `PATCH /templates/:id`. Keyed por el `key` **estable** del campo
  (el mismo que usa `LogEntryValue.fieldKey`), no por la versión inmutable ⇒ se aplica a TODAS las versiones/entradas sin
  republicar. Validación: cap **6** + sin duplicados (contrato `gridFieldKeysSchema`); cada key debe existir en alguna versión
  de la plantilla (`assertGridFieldKeysExist`, tolera cross-versión; key órfano se ignora). Auditado before/after en
  `template.updated`. **"El diseñador ofrece (showInGrid), el usuario dispone"** (la elección por usuario llega en 2.8.1b/SavedView).
- **`Template.folioScheme`** (`Json?`, migr. `20260702230000_add_template_folio`) *(folio-por-plantilla, 2026-07-02)* — esquema
  de folio de documento CONFIGURABLE por plantilla (`{prefix, mask, padding, start, scope, reset}`, Zod `folioSchemeSchema` en
  `packages/contracts/src/shared/folio.ts` — motor NEUTRAL reusado por OT y bitácora). Vive en el **contenedor MUTABLE**
  (gobernanza VIVA, espejo de `equipmentMode`/`editWindow*`/`gridFieldKeys`), editable con el **`FolioSchemeEditor` compartido**
  en el Form Builder (`PATCH /templates/:id`). `null` = sin esquema propio ⇒ la entrada usa el correlativo global `entryNumber`
  ("BIT-######"). Default (cuando el esquema existe pero omite ejes) = `DEFAULT_LOG_ENTRY_FOLIO_SCHEME` (scope `type`=**por
  plantilla**, anual, prefijo "DOC"). Emitido al SELLAR (ver `LogEntry.folio`). NO es parte de la versión inmutable (SAP number
  range / NetSuite auto-numbering: la numeración por tipo de doc es config mutable, no de la definición). Auditado before/after.
  **Ámbito completo (2026-07-02, `feat/folio-ambito-visible`):** con `scope` `node`/`structure` el folio inyecta el **código**
  del nodo/estructura como segmento visible (`renderFolio(..., {scopeCode})` + `normalizeFolioSegment`; el backend resuelve
  `orgNode.code ?? externalCode ?? name` / `structure.key ?? name`), p.ej. `RT-NORTE-2026-0001`; `type`/`global` no agregan
  segmento (cero regresión). La unicidad la garantiza el contador por ID; el segmento es la etiqueta humana. Máscara: token `{SCOPE}`.
- **`LogEntry.folio` / `LogEntry.folioSeqKey`** (`String?`, misma migración) — folio HUMANO de documento propio de la plantilla
  (`folio`) + clave de secuencia usada (`folioSeqKey`, auditoría del contador). Se emite **al SELLAR** (`submit()` sin flujo o
  1ª salida del estado inicial en `executeTransition()`), DENTRO de la tx (gapless: `FolioService.next(tx, seqKey)`), sólo si
  `Template.folioScheme != null`. **NO es único global** a propósito (dos plantillas pueden compartir prefijo bajo scope=type;
  la unicidad la garantiza el contador por serie `logentry|type:<templateId>|<año>`). `entryNumber` sigue siendo el handle
  interno estable; el folio es un string humano ADICIONAL nullable. La UI (grilla/visor/peek/CSV) muestra `entryFolioLabel(entry)`
  = `folio ?? formatEntryFolio(entryNumber)` (fuente única del rótulo, cero regresión para plantillas sin esquema).
- **Exposición en el listado** — `LogEntryListItem.summaryValues[]` (`{fieldKey,label,dataType,value,unit?,optionLabel?,
  thresholdBand}`) + `equipmentTag`. `LogbookQueryService.buildSummaries` los arma BATCHED por página (cero N+1): valores de
  `LogEntryValue` acotados a los candidatos + meta de campo CONGELADA por versión (label/unidad/optionSource) + resolución
  batched code→label (inline desde la config; `referenceList` desde `ReferenceItem`). El valor viaja ESTRUCTURADO; el cliente
  formatea números/fechas con la config regional (`lib/format`). La línea Resumen muestra los primeros 3 (default; ordenable
  por usuario en 2.8.1b). MISMO `where`/ABAC del listado ⇒ no expone contenido fuera de alcance.
- **Búsqueda por contenido** — `q` extendido con un `EXISTS` sobre `LogEntryValue` de los candidatos (`string_contains`),
  combinado en OR con folio/plantilla/nodo, DENTRO del AND con ABAC. Índice **GIN trigram** (`pg_trgm`) sobre `(value::text)`
  en `LogEntryValue` para que el match no degrade a seq-scan. Limitación MVP: matchea el valor ALMACENADO (texto/number/**code**);
  para SELECT de lista el `code` no coincide con el label (búsqueda por label = deuda, BACKLOG). Sin permisos nuevos (catálogo 59).

### Vistas guardadas de plataforma (Fase 2.8.1b)
> Migración aditiva **`20260613130000_add_saved_view`**. Personalización de listados como concepto de PLATAFORMA (Bitácoras
> hoy; Incidencias en Fase 4). Ver DECISIONS 2026-06-13.
- **SavedView** *(implementado)* — `id`, **`userId`** (dueño, FK `onDelete: Cascade`), **`module`** (discriminador `String`,
  `"LOGBOOK"`; `String` y no enum para sumar módulos sin migrar — el contrato valida el set vigente), `name`, **`config jsonb`**
  (snapshot de PRESENTACIÓN: `{filters, sort[], columns{order,hidden,pinnedLeft,pinnedRight,widths}, density}`, validado por Zod
  en el contrato), **`isDefault`**, timestamps. **Es DATO PERSONAL**: la API autoriza por **OWNERSHIP** (todo filtra por `userId`),
  NO por RBAC (como favoritos/ui-store, pero server-side para cross-device). **UNA default por `(userId, module)`** garantizada por
  **índice único PARCIAL** `SavedView_user_module_default_key ON ("userId","module") WHERE "isDefault"` (Prisma no lo expresa → SQL
  a mano); al marcar una nueva default se desmarca la previa en la misma transacción. Índice `(userId, module)`. **Vistas de SISTEMA
  NO viven aquí**: son constantes en código (`LOGBOOK_SYSTEM_VIEWS`). Compartir por rol = DIFERIDO (aditivo: futuros `scope`/`sharedRoleId`).
- **Multi-sort** *(implementado, sin cambio de esquema)* — el listado acepta `sorts` (CSV `campo:dir`, máx 3 claves **indexadas**:
  `recordedAt`/`effectiveAt`/`entryNumber`; precedencia sobre `sort`/`dir` legacy). El cursor keyset se generalizó a **tupla
  lexicográfica** `(c1,c2,…,id)` para no perder filas en empates. Orden por columnas de VALOR a escala = Fase 7 (rompería keyset).
- **Facetas / peek / "Mi turno" (Fase 2.8.1c, SOLO LECTURA, sin cambio de esquema)** — `GET /log-entries/facets` agrega por
  dimensión (status/estado/plantilla/equipo/banda) con `GROUP BY`/`count` reusando el `buildWhere`+ABAC del listado, con
  **conteos de HERMANOS** (cada faceta excluye su propio criterio). `GET /log-entries/my-shift` resuelve `{createdById,
  operationalDate, shiftCode}` vía `ShiftResolver` (calendario por defecto). `exceptionsOnly` en la query = OR de umbral
  WARN/CRIT y firma pendiente. El **peek** se sirve con los datos que la fila ya trae (`LogEntryListItem`), sin endpoint nuevo.
  COUNT exacto hoy; a gran escala → rollups/aproximado (Fase 7, §3 del BACKLOG).

### Notificaciones (Bloque N — motor de avisos por correo + canal in-app)
*Cinco entidades ADITIVAS con referencias BLANDAS (String indexado, sin FK dura — patrón AuditLog): la migración NO toca ninguna
tabla existente. El catálogo de EVENTOS vive en CÓDIGO (`@lyra/contracts NOTIFICATION_EVENTS`), no en BD.*
- **NotificationEvent** *(implementado — Bloque N)* — cola transaccional (etapa 1 del transactional outbox): `eventKey`,
  `payload` (jsonb con ids para resolver destinatarios + render), `dedupeKey?` **(@unique)** para eventos DERIVED (un evento por
  ronda vencida / breach de SLA aunque el sweeper la re-descubra), `status` (enum **`NotificationEventStatus`**
  PENDING/DISPATCHED/FAILED), `attempts`, `lastError?`, `dispatchedAt?`. Se inserta DENTRO de la tx del dominio
  (`executeTransition`) o por el sweeper.
- **NotificationOutbox** *(implementado — Bloque N; ampliado Notif. avanzadas Fase B 2026-06-17)* — bandeja de salida + registro de
  envío (etapa 2; **es la pantalla de correo saliente** Req-1/Req-5 **y, para `channel=INAPP`, el ítem de la campanita** del
  destinatario): `eventId?`, `eventKey`, `channel` (enum **`NotificationChannel`** **EMAIL/INAPP**), `recipientUserId?`,
  `recipientEmail`, `subject`, `bodyText`/`bodyHtml` (snapshot renderizado), `status` (enum **`NotificationOutboxStatus`**
  PENDING/SENT/FAILED/SUPPRESSED), `attempts`, `lastError?`, `nextAttemptAt?` (backoff), `dedupeKey?` **(@unique** — un mensaje por
  destinatario **por canal** por suceso; la clave incluye el canal), `relatedEntityType?`/`relatedEntityId?`, `sentAt?`, **`readAt?`
  (Fase B; null = no leída, solo INAPP)**. **Índice `(recipientUserId, channel, readAt)`** para "mis no leídas" de la campanita.
  La in-app NO es una tabla aparte: es una fila de outbox con `channel=INAPP` (`InAppChannel.send` = no-op, la fila es la entrega).
  El deep link se DERIVA en el front de `relatedEntityType`/`relatedEntityId` (`deepLinkForEntity`, sin columna de URL). Purga diaria
  (`@Cron`) de filas INAPP LEÍDAS con > 90 días.
- **NotificationTemplate** *(implementado — Bloque N; ampliado Notif. avanzadas Fase A 2026-06-17)* — gobernanza VIVA: `subject`,
  `bodyText`/`bodyHtml`, `active`, `isSystem` (sembrada por defecto; el admin la edita pero no la borra). Render con placeholders
  `{{var}}` whitelisteados por el evento (sin eval). **+ `templateId String?` = ÁMBITO por bitácora** (null = GENÉRICA/por defecto;
  con valor = específica de esa `Template`). Unique a **`@@unique(eventKey, locale, channel, templateId)`** + **índice PARCIAL único**
  para la genérica (`WHERE templateId IS NULL`, porque Postgres trata los NULL como distintos). Resolución específica→genérica con el
  helper PURO `pickTemplateForScope`. Las ad-hoc (con `templateId`) son borrables; la genérica/sistema no. La plantilla ad-hoc puede
  usar comodines **`{{campo.<key>}}`** de su bitácora (whitelist `allowedVariablesForTemplate`; valor desde la versión CONGELADA de
  la entrada al renderizar).
- **NotificationSubscription** *(implementado — Bloque N)* — watcher: `eventKey`, `subjectUserId?` **XOR** `subjectRoleId?`,
  `orgNodeId?`+`includeDescendants`, `templateId?`, `enabled`. Suma destinatarios (filtrados por ABAC en la resolución).
- **NotificationPreference** *(implementado — Bloque N)* — DATO PERSONAL (ownership, sin permiso RBAC): `@@unique(userId, eventKey,
  channel)`, `mode` (enum **`NotificationMode`** IMMEDIATE/DIGEST/OFF; el MVP entrega IMMEDIATE, OFF suprime). DIGEST diseñado, diferido.
- **SystemSettings** *(ampliado — Bloque N hardening)* — columnas `email*` para la **config SMTP del correo saliente** (singleton,
  editable sin reiniciar): `emailEnabled`, `emailService`, `emailHost`, `emailPort`, `emailSecure`, `emailUser`, **`emailPasswordEnc`
  (AES, write-only)**, `emailFromName`, `emailFromEmail`, `emailConfiguredAt` (null = nunca guardado en BD ⇒ `source=env`; el `.env`
  SMTP_* es el fallback), `emailConfiguredById`. La config es "toda BD o toda env" según `emailConfiguredAt`; la contraseña cae al
  env si la BD no tiene. La administra `EmailConfigService` (permiso `notification:config`); el `SmtpEmailService` la resuelve con
  caché por *firma* del transporte. **+ `notifyTransitionDefaultDestinationRoles Boolean @default(true)`** *(Notif. avanzadas Fase A
  2026-06-17)* — DEFAULT de sistema para las transiciones SIN config de aviso explícita: `true` (default) reproduce la conducta clásica
  (avisar a los roles del estado destino); `false` = no notifica si la transición no lo configura. No rompe nada.

### Inteligencia Artificial administrable (Fase 5 · Slice 2 — *implementado*)
- **AiSettings** *(implementado)* — config de IA **singleton** (`id="system"`), tabla DEDICADA (no en `SystemSettings`), editable
  desde `/configuracion` sin reiniciar (permiso `ai:config`): `enabled`, `provider` ("none"|"anthropic"|"openai-compatible"), `model`,
  `baseUrl` (solo openai-compatible), **`apiKeyEnc` (AES-256-GCM, write-only)** — la API NUNCA la devuelve (la UI solo ve `keySet`),
  `configuredAt` (null = nunca guardada en BD ⇒ `source=env`; el `.env` `AI_*` es el fallback), `configuredById`, `updatedById`. La
  administra `AiConfigService` (`getPublic`/`getResolved`/`resolveFrom`/`set`, espejo del `EmailConfigService`); el gateway `AiService`
  resuelve el proveedor vía la factory de **`@lyra/llm`**.
- **AiGenerationLog** *(implementado)* — registro inmutable (append-only) de cada GENERACIÓN de IA para gobernanza de costo:
  `capability` ("shift-summary"|"test"), `provider`, `model`, `status` ("SUCCESS"|"FAILED"|"FALLBACK"), `inputTokens?`, `outputTokens?`,
  `latencyMs`, `error?`, `handoverId?` (ref BLANDA al cambio de turno, sin FK), `createdById?`, `createdAt`. Índices por `createdAt` y
  `(provider, createdAt)`. El modo `none` NO registra (sin costo). Migración aditiva `20260618010000_add_ai_admin`.
- **Slice 3 (streaming) — SIN cambio de esquema.** El resumen por IA en vivo (SSE) reusa `AiGenerationLog` (registra al cerrar el
  stream) y la columna `ShiftHandover.summaryProvider` (ya existente). El único cambio de contrato es el DTO `updateHandoverSummary`,
  que ahora acepta `summaryProvider` opcional para PERSISTIR el texto IA generado en vivo sin re-generar (no toca la BD/migraciones).

### Apariencia / Temas administrables (EST-TEMAS — *implementado*)
- **ThemePalette** *(implementado, migración `20260624140000_add_theme_palettes`)* — paleta de color de marca construida
  por un admin (`theme:manage`). `name`, `description?`, **`tokensDark`/`tokensLight` (JSONB)** = override PARCIAL de los
  18 tokens temáticos curados (`{ "<tokenKey>": "<color>" }`), validado por `paletteTokensSchema` (whitelist de claves +
  formato de color, `.strict()`) ANTES de persistir; **lo no sobreescrito cae a la marca Lyra**. `isPublished` (sólo las
  publicadas aparecen a los usuarios), `createdById`/`updatedById` (ref BLANDA, sin FK, el nombre se resuelve por consulta),
  `createdAt`/`updatedAt`. Índice por `isPublished`. La administra `ThemeService` (CRUD/publish/setDefault/listPublished/
  `getMyPreference`/`selectForMe`); **auditoría** de crear/publicar/default. La **severidad 1–5 NO es editable** (semántica);
  el gradiente de marca se DERIVA de los acentos en el cliente (`buildPaletteOverrideCss`). Instance-wide (single-tenant).
- **SystemSettings** *(ampliado — EST-TEMAS)* — columna **`defaultPaletteId`** (ref BLANDA, sin FK): paleta por defecto de
  la INSTALACIÓN (la que reciben quienes no eligieron). null = marca Lyra base. Despublicar la default la limpia.
- **User** *(ampliado — EST-TEMAS)* — columna **`themePaletteId`** (FK a `ThemePalette`, **`onDelete: SetNull`**):
  preferencia de paleta del usuario, PORTABLE entre dispositivos. La preferencia claro/oscuro/auto **sigue siendo LOCAL**
  (localStorage, ergonomía por dispositivo) — NO se persiste en BD.

### Orígenes de datos
- **DataSource** — URL base, tipo de auth, **credencial cifrada en reposo**. *1—N* **DataSourceEndpoint** (path, método, mapeo JSONPath, TTL). Caché en Redis. **Espejo ENTRANTE:** en Fase 3 un endpoint puede **alimentar/materializar** una `ReferenceList` (`source=EXTERNAL`).

### Incidencias (workflow HSE)
> **Fase 4.0 (implementado — núcleo):** migración `20260616180000_add_incidents`. Single-tenant: aislamiento por
> NODO/PLANTILLA (ABAC), **sin `tenantId`**. El ciclo de vida **reutiliza `WorkflowDefinition`** (Fase 2.2): la
> incidencia CONGELA una versión de flujo (denormalizada, patrón `LogEntry`) y avanza por sus transiciones con las
> mismas guardas (rol-dato + firma Part 11 opt-in re-autenticada). **Sin borrado físico** (anulación = `lifecycle`
> CANCELED con motivo); timeline **append-only**. Las referencias a usuario/flujo/entrada son **blandas** (sin FK,
> patrón AuditLog). Ver DECISIONS 2026-06-16.
- **IncidentType** *(implementado)* — catálogo CONFIGURABLE con **flags de comportamiento**: `key`/`name`/`color`,
  `defaultWorkflowId?` (flujo que se congela al crear; ref. blanda), `requiresInvestigation`/`requiresCapa`/
  `reportableDefault` (se honran en 4.2/4.3), `active`, `sortOrder`. **SLA light (4.4):** `resolutionDueMinutes?`
  (minutos desde la creación para auto-fijar `Incident.dueAt`; override explícito gana), `escalationAfterMinutes?` +
  `escalationRoleId?` (FK Role SetNull) = escalamiento del aviso de plazo al rol superior tras `dueAt + escalationAfterMinutes`
  (nivel 1; null en cualquiera = sin escalamiento). Seed de 13 tipos. Migración `20260617170000_add_incident_sla`.
- **IncidentCategory** *(implementado)* — subtipos opcionalmente colgados de un tipo (`typeId?`). Seed de 13.
- **Incident** *(implementado)* — `number` (folio `INC-####` derivado), `title`/`description`, `typeId`/`categoryId?`,
  `severity` (1..5) + `potentialSeverity?` (MPL), `priority` (LOW/MEDIUM/HIGH/CRITICAL), `riskProbability?`/
  `riskConsequence?` (ISO 31000, `riskLevelFor`), `originType` (MANUAL/LOG_ENTRY/EXCEPTION/RULE), `lifecycle`
  (OPEN/CLOSED/CANCELED, denormalizado para filtros/KPIs), `workflowDefinitionId?`/`workflowDefinitionVersionId?`/
  `currentStateKey?` + `currentStateSince` (base del SLA de permanencia, reusa `evaluateSla`/`maxStayMinutes`),
  `orgNodeId` (FK Restrict) / `equipmentId?` (FK SetNull) / `shiftCode?`, `originLogEntryId?` (ref. blanda),
  `reporterId?`/`ownerId?`, `dueAt?`, `reportable`, `closedAt?`/`closedById?`/`closureSummary?`, `canceledAt?`/
  `cancelReason?`/`canceledById?`. **§21 — dos "vencidas" SEPARADAS (4.4):** la **permanencia** de estado se DERIVA de
  `currentStateSince`+`maxStayMinutes` (`slaBreached`); el **plazo de resolución** se DERIVA de `dueAt<now`+`lifecycle=OPEN`
  (`resolutionOverdue`). Ambas son derivadas (no columnas de estado), con KPIs/filtros/chips propios; `dueAt` se auto-fija del
  tipo al crear (`resolutionDueMinutes`) y es editable (timeline `DUE_CHANGED`).
- **IncidentComment** *(implementado)* — comentario de gestión (autor + snapshot de nombre).
- **IncidentActivity** *(implementado)* — timeline **append-only**: `kind` (CREATED/ASSIGNED/FIELD_CHANGED/TRANSITION/
  COMMENT/CLOSED/CANCELED) + `summary` + actor + `metadata` jsonb.
- **IncidentTransition** *(implementado)* — transición de flujo EJECUTADA (espejo de `LogEntryTransition`): versión de
  flujo congelada + `transitionKey`/`fromStateKey`/`toStateKey` + actor + `reason?` + `signatureId?` (ref. blanda).
- **LogEntryException** *(implementado 4.1.0)* — materialización de una anomalía de bitácora con ESTADO y TRIAGE (migración
  `20260616200000_add_log_entry_exceptions`). Contexto CONGELADO en la detección (refs BLANDAS, patrón AuditLog): `logEntryId`,
  `templateId?`/`templateVersionId?`, `sectionKey`+`sectionLabel?`, `fieldKey`+`fieldLabel?`, `fieldType?`, `unit?`,
  `occurrenceRef?` (celda de TABLE/MATRIX, hoy null — MVP a nivel de campo). Valor: `originalValue` jsonb **INMUTABLE** +
  `bandsSnapshot` jsonb (warn/crit efectivos). Disparador: `triggerKind` (THRESHOLD_WARN/THRESHOLD_CRIT/RULE/MANUAL),
  `ruleKey?`/`ruleVersionId?`/`ruleSeverity?`, `thresholdType` (warning/critical/invalid), `detail?`. Operacional (denormalizado):
  `orgNodeId`/`equipmentId?`/`shiftCode?`/`operatorId?`/`detectedAt`/`entrySealedAt?`. Triage: `status` (OPEN/ACKNOWLEDGED/
  DISMISSED/CONVERTED/CORRECTED) + `triagedById?`/`triagedAt?`/`dismissReason?`. Corrección GxP: `correctedValue?`/`correctionReason?`/
  `correctedById?`/`correctedAt?` (el original NUNCA se pierde). Ligazón: `incidentId?` (N:1 denormalizado). `number` → folio
  `EXC-####` derivado. **Idempotencia:** `dedupeKey` único `thr:{entryId}:{fieldKey}` (una provisional por entrada+campo;
  re-guardar reconcilia; volver a rango RETIRA la provisional OPEN; al sellar se congela + `entrySealedAt`; VOID purga las
  provisionales). Sin FK a entrada/nodo/equipo (refs blandas); índices por logEntry/orgNode/equipment/status/thresholdType/incident.
- **IncidentExceptionLink** *(implementado 4.1.0)* — join AUTORITATIVO excepción↔incidencia con proveniencia (`linkedById?`/
  `linkedAt`); `@@unique(exceptionId)` = N:1 (una incidencia agrupa varias excepciones). FK Cascade desde Incident y
  LogEntryException. Convertir/asociar deja la excepción CONVERTED + `incidentId` + actividad en el timeline de la incidencia.
- **IncidentAction** *(implementado 4.2a)* — acción CAPA (correctiva/preventiva/inmediata) de la incidencia (migración
  `20260617120000_add_incident_actions`). `number` → folio `ACT-####` derivado; `incidentId` (FK Cascade), `kind`
  (CORRECTIVE/PREVENTIVE/IMMEDIATE), `title`/`description?`, **`mandatory`** (si abierta, BLOQUEA el cierre), responsable
  persona+rol (`responsibleId?`/`responsibleRoleId?` FK Role SetNull, refs blandas), `dueAt?`, `status` (OPEN/IN_PROGRESS/
  DONE/VERIFIED/CANCELED). Realización: `completedAt/ById`/`completionNote?`. **Verificación de eficacia:** `verifiedAt/ById`/
  `effectivenessOutcome` (EFFECTIVE/NOT_EFFECTIVE — NO eficaz reabre a IN_PROGRESS)/`verificationNote?`. Anulación sin borrado
  (`canceledAt/ById`/`cancelReason?`). `evidence` jsonb **reservado** (subida diferida). **`investigationStepId?` (Fase 4.2b,
  FK SetNull)** = causa raíz que la acción ATIENDE. La guarda de cierre (`assertNoBlockingActions`) exige verificación solo si
  el tipo declara `requiresCapa` (`blockingActionsForClose`, autoritativo back↔front). 2 permisos `incident:action:manage`/
  `:verify` (segregación de funciones; cat. 83).
- **IncidentInvestigation** *(implementado 4.2b)* — investigación de causa raíz (1:1 con `Incident`, `incidentId @unique`;
  migración `20260617130000_add_incident_investigation`). `method` (enum `IncidentInvestigationMethod`, MVP `FIVE_WHYS`;
  extensible a ICAM/TapRooT sin re-migrar), `status` (enum `IncidentInvestigationStatus` DRAFT/COMPLETED), `problemStatement`,
  `rootCauseSummary?`, `conductedById?`/`completedAt?`/`completedById?` (refs blandas). FK Cascade desde Incident. *1—N*
  **IncidentInvestigationStep**.
- **IncidentInvestigationStep** *(implementado 4.2b)* — un "porqué" de la cadena 5-Porqués (ordenado): `order`, `statement`
  (la pregunta), `answer?`, **`isRootCause`** (el paso terminal marca causa raíz; puede haber varios). FK Cascade desde la
  investigación; *1—N* `IncidentAction` (las acciones que atienden esa causa). La cadena se REEMPLAZA en bloque al editar
  (patrón de edición de listas; solo en DRAFT). **Bloqueo de cierre (4.2b):** si el tipo declara `requiresInvestigation`, no se
  cierra sin una investigación COMPLETED con ≥1 causa raíz (`assertInvestigationComplete` en `transition`; helper puro
  `investigationBlocksClose` back↔front). **Sin permiso nuevo** (reusa `incident:edit`; cat. se queda en 83). El detalle de la
  incidencia expone `typeRequiresInvestigation`/`typeRequiresCapa` para los avisos de la UI.
- **ReportingObligation** *(implementado 4.3)* — catálogo CONFIGURABLE de obligaciones de reporte (migración
  `20260617140000_add_incident_reporting`): `key` único, `name`/`description`, `authorityName?` (a quién se reporta),
  `defaultDueMinutes?` (plazo por defecto), **`appliesToTypeIds String[]`** (vacío = todos los tipos), `minSeverity?` (null =
  cualquiera), **`mandatory`** (si está pendiente, bloquea el cierre), `active`/`sortOrder`/`deletedAt`. Espejo de
  `IncidentType`/`IncidentCategory` (editable por UI, gate `incidentcatalog:manage`). Los marcos regulatorios concretos por
  vertical (DS 132, SERNAGEOMIN, ISO 14001, etc.) son **seed/dato**, NUNCA lógica. *1—N* **IncidentReport**.
- **IncidentReport** *(implementado 4.3)* — materialización de un reporte de una incidencia (N por incidencia; espejo de
  `IncidentAction`). Folio `REP-####` (de `number`). **Snapshot** de la obligación en la materialización (`obligationName`,
  `authorityName`, **`mandatory`**) para integridad histórica (cambiar el catálogo no altera lo materializado). `status` (enum
  **`IncidentReportStatus`** PENDING/SUBMITTED/NOT_APPLICABLE/CANCELED), `dueAt?`; evidencia de envío `submittedAt?`/
  `submittedById?`/`externalFolio?`/`notes?`; anulación sin borrado físico (`canceledAt`/`cancelReason`/`canceledById`);
  `evidence Json?` reservado (Storage Ola 3). FK Cascade desde Incident, FK Restrict desde ReportingObligation. Índices
  `(incidentId,createdAt)`, `(status,dueAt)`, `(mandatory,status)`. **Materialización (4.3):** al crear una incidencia
  reportable (`reportableDefault` del tipo o `reportable` explícito) se crean los reportes de las obligaciones aplicables
  (helper puro `applicableObligationsFor` por tipo+severidad; idempotente; endpoint `…/reports/materialize` re-deriva).
  **Bloqueo de cierre (4.3):** un reporte de obligación `mandatory` aún PENDING bloquea el cierre (`assertNoBlockingReports`
  en `transition`; helper puro `reportsBlockingClose` back↔front; se resuelve con SUBMITTED o NOT_APPLICABLE+motivo).
  **"Vencido" se DERIVA** (`status=PENDING AND dueAt<now`; `isReportOverdue`), sin estado persistido ni cron — KPI
  `stats.reportOverdue`, filtro `reportOverdueOnly`, flag `reportOverdue` por fila. **Sin permiso nuevo** (catálogo
  `incidentcatalog:manage`, reportes `incident:edit`; cat. 83).
- **Dashboard (4.5)** — **NO agrega entidades** (es analítica read-only). Único cambio de esquema/contrato: **aditivo** —
  `createdFrom`/`createdTo` (filtro por fecha de creación) en `incidentListQuerySchema` (usado por `buildWhere` y por el dashboard).
  La agregación vive en `IncidentDashboardService` (Prisma `groupBy` + `$queryRaw` acotado para tendencia bucketizada `date_trunc(...
  AT TIME ZONE)`, MTTR `AVG(closedAt-createdAt)` y cumplimiento de SLA `FILTER (closedAt<=dueAt)`); **ABAC por nodo replicando
  `buildWhere`** (mismo `getAccessibleNodeIds` ∩ `orgNodeIds`); la permanencia derivada reusa `IncidentsService.openSlaBreachedCount`.
  TZ de bucketing por `PLANT_TIME_ZONE` (env, default America/Santiago). Sin permiso nuevo (reusa `incident:view`). El índice
  `Incident(createdAt, id)` ya existente soporta el rango temporal.
- **Diferido (4.4+):** unificar el criterio de "vencida" del módulo (`Incident.dueAt` vs `WorkflowState.maxStayMinutes`, §21) ·
  **aviso de plazo de reporte** "por vencer/vencido" (épico de notificaciones avanzadas) · `IncidentRegulatoryFlag`/
  clasificación minera/IF-IG · excepción por CELDA de TABLE/MATRIX · adjuntos a nivel de incidencia (MinIO, patrón Ola 3) ·
  registro Part 11 con `payloadHash` para incidencias y para correcciones de excepción · subida de evidencia a la acción CAPA
  y al **reporte** (columnas `evidence` reservadas) · firma Part 11 al verificar eficacia, al completar la investigación y al
  enviar un reporte.

### Cambio de turno / Shift Handover (Fase 5 · Slice 1 — *implementado*)
Migración `20260618000000_add_shift_handover`. El régimen de turnos NO es una entidad nueva: el turno y su ventana se resuelven del
**`OperationalCalendar`/`OperationalShift`** ya existentes (asignado por nodo, heredado por ruta). El ciclo es **FIJO** (no
`WorkflowDefinition`): reusa el mecanismo de firma Part 11 (`ReauthService`) embebido en columnas, no la máquina de estados.
- **ShiftHandover** *(implementado)* — entrega de un turno saliente de un **nodo** (`orgNodeId`) en un **día operacional**
  (`operationalDay`), con la ventana del turno en UTC (`windowStart`/`windowEnd`), turno saliente (`shiftCode`/`shiftLabel`) y
  entrante (`incomingShiftCode`), `timezone` y `calendarId` (ref. blanda). Ciclo `status`: enum **`ShiftHandoverStatus`**
  `COMPILING → SIGNED_OUT → ACKNOWLEDGED` (+ `CANCELED`). `snapshot Json` = cockpit compilado **CONGELADO al firmar** (`snapshotAt`);
  mientras `COMPILING` el cockpit se recalcula en vivo. **Firma del saliente** inline (Part 11): `outgoingById`/`outgoingByName`/
  `signedOutAt`/`signOutMeaning`/`signOutMethod`. **Acuse del entrante** inline: `incomingById`/`incomingByName`/`acknowledgedAt`/
  `ackMeaning`/`ackMethod` + checks `ackReadSummary`/`ackReviewedItems`/`ackNoObservations` + `ackObservations`. Resumen
  `summaryText`/`summaryProvider` (`none` = determinista en Slice 1). Anulación sin borrado físico (`canceledAt`/`cancelReason`/
  `canceledById`). Una entrega no anulada por (nodo, turno, día) — unicidad garantizada en el servicio. *1—N* **ShiftHandoverItem**,
  *1—N* **ShiftHandoverActivity**.
- **ShiftHandoverItem** *(implementado)* — la **baton** de pendientes que rueda. `source` enum **`ShiftHandoverItemSource`**
  (`MANUAL` | `INCIDENT` | `INCIDENT_ACTION` | `INCIDENT_REPORT` | `EXCEPTION` | `ROUND`); `status` enum
  **`ShiftHandoverItemStatus`** (`OPEN` | `CARRIED` | `CLOSED`). Las notas `MANUAL` se copian como `CARRIED` de la entrega previa
  (`originHandoverId` = rastro); los ítems de dominio se re-derivan vivos en cada compilación (`refType`/`refId` = ref. blanda al
  objeto, snapshot legible en `title`/`detail`/`category`/`severity`).
- **ShiftHandoverActivity** *(implementado)* — timeline append-only de la entrega (CREATED/COMPILED/SIGNED_OUT/ACKNOWLEDGED/
  ITEM_ADDED/ITEM_CLOSED/CANCELED).
- **Acta PDF (Fase 5 · Slice 4 — *implementado*, SIN entidad nueva).** El acta de entrega se genera **on-demand** desde el `snapshot`
  congelado (`GET /shift-handover/:id/acta.pdf`); **no se persiste** ningún artefacto ni columna nueva. La **integridad** se garantiza
  con un **hash SHA-256 derivado** (`actaIntegrityHash` = SHA-256 de un JSON CANÓNICO del snapshot + las dos firmas + el resumen),
  calculado en cada export ⇒ determinista, y registrado en **`AuditLog.after.integrityHash`** del evento `shifthandover.acta.exported`.
  *Deuda:* si la carpeta regulatoria exige el binario archivado, persistir en MinIO (vía `Attachment`) + columna `snapshotHash`.

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

### Órdenes de Trabajo / Work Orders (OT / PTW) — S1 Cimientos + S2 Puerta 1 + S3 Puerta 2 + S4 Puerta 3 + S5 Puerta 4 + S6 SLA/semáforos + S7a Dashboard *(implementado)*

> **S7b (Enlace Incidencia↔OT, `feat/ot-incidencia-enlace-s7b`, 2026-07-03) — SIN migración.** Se materializó lo anticipado por
> S7a **reusando `WorkOrder.originIncidentId`** (no se tocó el esquema). Vista inversa `GET /incidents/:id/work-orders` (gate
> `incident:view`+`workorder:view`) resuelta por `WorkOrdersService.listForIncident` (ABAC por nodo del usuario ∩ `originIncidentId`,
> `deletedAt: null`; **NO** por estructura activa — la incidencia define el contexto). Navegación de vuelta: `WorkOrderDetail`
> gana dos campos **DERIVADOS en `getDetail`** (no columnas): `originIncidentCode` + `originIncidentTitle` (helper de contrato
> `incidentCode(number)="INC-####"`), espejo del `originLogEntryNumber` de incidencias. `IncidentAction.workOrderId` **NO** existe
> (decisión 2026-07-03). Cross-módulo: `IncidentsModule` → `WorkOrdersModule` (una dirección, sin ciclo).

> **S7a (Dashboard analítico, `feat/ot-dashboard-s7a`, 2026-07-03) — SIN migración (read-only).** `WorkOrderDashboardService`
> agrega en el backend (GROUP BY / `$queryRaw`) con el MISMO ABAC por nodo ∩ estructura de la lista; no toca el esquema. Nota
> para **S7b (enlace Incidencia↔OT)**: el lado OT del enlace YA existe en el modelo — `WorkOrder.originIncidentId` (ref. blanda
> indexada `@@index([originIncidentId])`) + `originType=INCIDENT` (enum `WorkOrderOrigin`), y `create()` ya lo persiste. S7b
> reusará esa columna (sin migración) para la vista inversa "OT relacionadas" en la incidencia y el botón "Crear OT desde
> incidencia" (traza SAP PM notification→order / Maximo FOLLOWUP). **No** se agregará `IncidentAction.workOrderId` (decisión
> 2026-07-03).

> **S6 (SLA / vigía, `feat/ot-sla-semaforos`, 2026-07-02) — SIN migración** (columnas ya latentes desde el diseño):
> `WorkOrderType.resolutionDueMinutes?`/`escalationAfterMinutes?`/`escalationRoleId?` (FK Role SetNull) = SLA light espejo de
> `IncidentType`. `WorkOrder.dueAt` se **auto-fija AL APROBAR** (`resolutionDueFromType(approvedAt,·)`; override manual gana) y es
> editable (timeline `DUE_CHANGED`). **3 estados DERIVADOS (sin columnas, sin cron):** semáforo de PLAZO (`workOrderTrafficLight`:
> 🔴 `dueAt<now` o actividad con `baselineEnd`/`plannedEnd`<now no cerrada · 🟡 dentro de `AT_RISK_WINDOW_MINUTES`=48 h · 🟢 en
> plazo · ⚪ sin plazo) y PERMANENCIA (`stalled` = `now−currentStateSince > WorkflowState.maxStayMinutes`, indicador aparte, §21).
> **3 eventos derivados del Bloque N** detectados por `WorkOrderSlaService.findBreaches()` (clon de `IncidentSlaService`, barrido
> en `NotificationWorkerService.sweep()`): `workorder.overdue` (plazo, re-aviso diario, escala si `dueAt+escalationAfterMinutes<now`),
> `workorder.stalled` (permanencia, dedupe 1× por ocupación), `workorder.activity.overdue` (actividad del plan, re-aviso diario).
> Resolvers = owner + roles del estado + escalamiento, ABAC por nodo. **Sin permiso nuevo.**

Migraciones `20260701180000_add_work_orders` (S1) y `20260701210000_add_work_order_workflow_folio` (S2). Entidad NUEVA
`WorkOrder`, **espejo de `Incident`** (DECISIONS 2026-07-01, forks W1–W8). Desde S2 el ciclo de la solicitud está VIVO
hasta la Puerta 1: workflow congelado al crear + ejecutor de transiciones (permiso `workorder:transition`, dim. WORKFLOW)
+ folio gapless emitido al aprobar + firma Part 11 opt-in. ABAC por nodo ∩ estructura; sin borrado físico (`deletedAt` +
anulación lifecycle `CANCELED`).

- **WorkOrder** — la orden/solicitud de trabajo. `number` (autoincrement, correlativo interno) → código provisional
  **"SOL-######"** hasta que se emite el `folio` oficial (`OT-2026-0001`, único, null hasta la aprobación en S2).
  Atributos: `title`/`description`, `typeId` (→ **WorkOrderType**, Restrict), `originType` (enum `WorkOrderOrigin`:
  DIRECT|RULE|EXCEPTION|PLANNED|INCIDENT), `criticality` (1..5), `priority` (enum `WorkOrderPriority`), `requiresPtw`,
  riesgo ISO 31000 (`riskProbability`/`riskConsequence`), ubicación (`orgNodeId` → **OrgNode** Restrict = ancla ABAC;
  `equipmentId` → **Equipment** SetNull; `locationDetail`; `shiftCode`), personas (`requesterId`/`ownerId`, refs blandas),
  fechas (`requestedAt`/`detectedAt`/`plannedStart`/`plannedEnd`/`dueAt`), `lifecycle` (enum `WorkOrderLifecycle`:
  DRAFT|OPEN|CLOSED|CANCELED). **Desde S2 el workflow está VIVO**: al crear se CONGELA una versión de flujo
  (`workflowDefinitionId`/`workflowDefinitionVersionId`, la del tipo o la global `ot-4-puertas`) y la solicitud **nace en
  el estado inicial `borrador` (lifecycle DRAFT)** con `currentStateKey`/`currentStateSince`; el lifecycle se DERIVA del
  estado (final tras aprobación ⇒ CLOSED; final sin aprobación = rechazo ⇒ CANCELED; anulación por endpoint ⇒ CANCELED).
  Puerta 1: aprobación (`approvedAt`/`approvedById`; al ENTRAR al estado `folioOnStateKey` se emite el `folio` +
  `folioSeqKey`/`folioIssuedAt`), rechazo (`rejectedAt`/`rejectReason`/`rejectedById`, motivo obligatorio), cierre
  (`closedAt`/`closedById`/`closureSummary`), origen bidireccional (`originIncidentId`/`originLogEntryId`/
  `originExceptionId`, refs blandas). **S4 (Puerta 3):** `planFrozenAt`/`planFrozenById` = instante en que se autorizó/
  congeló la baseline del plan (null = plan no congelado; base de `planNotFrozen` y del bloqueo de edición del plan).
- **WorkOrderTransition** *(S2)* — historial de transiciones ejecutadas (espejo de `IncidentTransition`):
  `workflowDefinitionVersionId` + `transitionKey`/`fromStateKey`/`toStateKey`, actor (`actorId`/`actorEmail`), `reason`,
  `signatureId` (ref. blanda a `LogEntrySignature`, hoy null — deuda payloadHash compartida con Incidencias), `occurredAt`.
  Cascade desde `WorkOrder`; índice `(workOrderId, occurredAt)`.
- **WorkOrderEvent** *(S2)* — timeline APPEND-ONLY (espejo de `IncidentActivity`; se llama "Event" para no chocar con
  `WorkActivity` de S4). `kind` clasifica: CREATED|SENT|APPROVED|REJECTED|FOLIO_ISSUED|TRANSITION|ASSIGNED|CLOSED|CANCELED
  |PLAN_FROZEN|CHECKLIST_ADDED|ACTIVITY_ADDED|ACTIVITY_REMOVED|**ACTIVITY_PROGRESS|ACTIVITY_DONE|ACTIVITY_BLOCKED** (S5).
  `summary`, actor, `metadata` Json, `occurredAt`. Cascade; índice `(workOrderId, occurredAt)`. Dotación (S1) agrega los
  `kind`: WORKER_ADDED|WORKER_REMOVED|ROSTER_CONFIRMED|ROSTER_CHANGED.
- **Dotación del permiso** *(S1 — `feat/dotacion-permiso-s1`; traza OSHA 1910.146 / Maximo Person≠User; diseño citado en
  `docs/design/DOTACION_DESIGN_ARCHITECTURE.md`)*:
  - **Person** — persona real que ingresa a ejecutar, **SEPARADA de `User`** (Maximo Person≠User; los contratistas NO tienen
    login). `kind` (enum `PersonKind` INTERNAL|CONTRACTOR), `firstName`/`lastName`/`fullName` (denormalizado "Apellido, Nombre"),
    `nationalId`/`personnelCode`/`badgeId`/`jobTitle`/`email`/`phone`, `contractorCompanyId?` (→ ContractorCompany SetNull;
    obligatorio si CONTRACTOR), `userId?` (enlace **blando** opcional si además tiene login). Catálogo **compartido** (sin ABAC
    por estructura; el ABAC vive en el roster vía `WorkOrder.orgNodeId`). Soft-delete. Gate `worker:manage`.
  - **ContractorCompany** — empresa contratista (nivel EMPRESA; traza ISN/Avetta/Veriforce + Ley 16.744 art.66bis/183-C).
    `key` única, `name`/`taxId`, **acreditación** `accreditationStatus` (enum `AccreditationStatus` ACCREDITED|CONDITIONAL|
    SUSPENDED|EXPIRED|NONE)/`accreditationGrade`/`accreditedUntil`/`externalProvider` (gancho ISN/Avetta/Veriforce S4)/
    `accreditationNote` — presentes desde S1; **el GATE se activa en S3** (ver abajo). Soft-delete.
  - **RosterRole** — rol de la persona en la dotación, **CONFIGURABLE** (seed = 3 estándar OSHA 1910.146: entry supervisor /
    attendant-vigía / authorized entrant). `key` única, `name`/`description`, `isSupervisorRole` (quien autoriza/firma la
    entrada, traza (f)(6)/(e)(2)), `mustRemainOutside` (semántica de vigía, traza (i)(4)), `color`/`sortOrder`. Soft-delete.
  - **WorkOrderWorker** — el ROSTER de ESTA OT: persona + rol (traza OSHA (f)(4)-(6): el permiso lista personas por rol).
    `workOrderId`(Cascade)/`personId`(Restrict)/`rosterRoleId`(Restrict), `note`, soft-remove (`removedAt`/`removedById`/
    `removeReason`; **re-agregar REVIVE** la fila), columnas de override reservadas (S2: `overrideReason`/`overrideById`/
    `overrideAt`/`overrideSignatureId`). **`@@unique([workOrderId, personId, rosterRoleId])`** (multi-rol: el supervisor puede
    ser además vigía/entrant). Gate `workorder:roster:manage`.
  - En **WorkOrder**: `rosterConfirmedAt?`/`rosterConfirmedById?` (**Gobierno 2** espejo EXACTO de `executionSetConfirmedAt/ById`:
    `confirmRoster` FIRMADO Part 11 / auto-limpieza al curar / `assertRosterConfirmed` gate en la autorización del permiso).
  - En **WorkOrderType**: `rosterEnabled` (bool, default false) — activación OPTATIVA por tipo (sin esto la OT no muestra
    dotación; cero fricción/regresión).
  - Semáforo por persona = función PURA `evaluateWorkerStatus` (contracts; colapsa causas a nivel ok/warning/blocked).
- **Dotación · Slice 2 — competencias con vigencia** *(S2 — `feat/dotacion-competencias-s2`; migr. `20260703120000_add_dotacion_competencias`;
  traza ISO 45001 §7.2 / Maximo Qualifications LABORCERTHIST / SAP validity)*:
  - **CompetencyType** — catálogo: QUÉ certificación/formación existe. `key` única, `name`/`description`, `category` enum
    `CERTIFICATION|TRAINING|MEDICAL_EXAM|INDUCTION|LICENSE`, `defaultValidityDays?`, `requiresExpiry` (default true),
    `warningLeadDays?` (ventana ámbar «por vencer» por tipo; fallback const `DEFAULT_COMPETENCY_WARNING_LEAD_DAYS`=30, traza
    ISN 90d / práctica 30-14-7), `active`/`sortOrder`, soft-delete. Gate `workordercatalog:manage`.
  - **PersonCompetency** — la persona POSEE una competencia. `personId`(Cascade)/`competencyTypeId`(Restrict), `issuedAt`
    (Effective Date), `expiresAt?` (null = sin vencimiento), `certificateNumber?`/`issuedBy?`, `evidence` Json (reservado Ola 3),
    `verifiedById?`/`verifiedAt?` (evidencia documentada ISO 45001), `note?`. **Renovar = registro NUEVO** (soft-delete el viejo,
    historial estilo LABORCERTHIST; la fecha de vencimiento es inmutable una vez emitida). Estado VALID/EXPIRING/EXPIRED
    **DERIVADO** (`competencyValidityState`), nunca almacenado. Gate `worker:manage`.
  - **PersonRestriction** — veto/restricción (Eje B, autorización). `personId`(Cascade), `type` enum
    `MEDICAL|DISCIPLINARY|SITE_BAN|OTHER`, `reason`, `startsAt`/`endsAt?` (null = indefinida), `active`, soft-delete. Vigente
    ⇒ `RESTRICTION_ACTIVE` (rojo). Traza OSHA «authorized by the employer». Gate `worker:manage`.
  - **WorkOrderCompetencyRule** — regla de REQUISITO data-driven, **ESPEJO EXACTO** de `WorkOrderChecklistRule`:
    `competencyTypeId`(Restrict), `mandatory`, `appliesToTypeIds[]`/`minCriticality?`/`specialtyId?`(SetNull)/`requiresPtw?` +
    **`appliesToRosterRoleId?`**(SetNull; exigir sólo a cierto rol, ej. sólo al entrant), `active`/`sortOrder`, soft-delete.
    Función pura `applicableCompetencyRules(ctx, rules)` (clon de `applicableChecklistRules`). Gate `workordercatalog:manage`.
  - **Semáforo REAL** = `deriveWorkerReasons(ctx, now)` (PURA): cruza reglas aplicables × competencias vigentes × restricciones
    activas → `WorkerBlockReason[]` con detalle legible; Ejes A (competencia) y B (autorización) **separados**. Derivado EN VIVO
    en `WorkOrderRosterService` (nunca almacenado). `COMPANY_NOT_ACCREDITED` (empresa) diferida a S3.
  - **Override gobernado** (columnas ya reservadas en `WorkOrderWorker`): al confirmar con personas en ROJO, `confirmRoster`
    exige motivo por persona + UNA firma Part 11 → `overrideReason`/`overrideById`/`overrideAt` (evento `WORKER_OVERRIDE`).
  - **Avisos (Bloque N)**: `WorkerComplianceService.findBreaches()` (dominio) → `worker.competency.expiring`/`.expired`
    (personas en roster de OT abierta; dedupe por OT+competencia+día).
- **Dotación · Pulido UX enterprise + datos personales + auditoría** *(`feat/dotacion-ux-enterprise`, 2026-07-03; migr. aditiva
  `20260703160000_add_person_personal_data`)*:
  - En **Person**: `birthDate?` (edad DERIVADA, nunca almacenada), `gender?` (MALE|FEMALE|OTHER|UNSPECIFIED), `nationality?`,
    `nationalIdType?` (RUT|PASSPORT|DNI|OTHER — contempla EXTRANJEROS). El **RUT se guarda NORMALIZADO** (cuerpo-DV vía
    `normalizeRut`) y se valida mód-11 (`isValidRut`) en el Zod de persona **y** empresa (`taxId`); la UI formatea al mostrar
    (`formatRut`). `PersonDto += activeRestrictions/expiredCompetencies` (impedimentos derivados en vivo para la grilla).
  - **RosterRole CRUD** expuesto (`POST/DELETE /roster-roles`, gate `workordercatalog:manage`; soft-delete, bloqueado si en
    uso en roster activo) — cierra la deuda S1 (eran solo-seed).
  - **Auditoría antes/después**: `deletePersonCompetency`/`deletePersonRestriction` y sus updates ahora graban el **`before`**
    (snapshot legible) en `AuditLog` además del `after` (regla CLAUDE.md). Listados `listPersonCompetencies/Restrictions`
    aceptan `includeArchived` + `PersonCompetencyDto/PersonRestrictionDto += archivedAt` (soft-delete visible como historial).
- **Dotación · Slice 3 — acreditación de EMPRESA como GATE** *(S3 — `feat/dotacion-acreditacion-s3`; migr.
  `20260703140000_add_dotacion_acreditacion`, aditiva; traza ISN RAVS A/B/F + Avetta compliant/conditional/non-compliant +
  Ley 16.744 art.66bis / Cód. Trabajo art.183-C)*:
  - En **WorkOrderType**: **`requireCompanyAccreditation`** (bool, default false) — **toggle por tipo**, espejo de
    `rosterEnabled`. OFF ⇒ la acreditación de empresa es SOLO informativa (cero regresión). ON ⇒ el semáforo evalúa el nivel
    EMPRESA de las personas CONTRATISTAS.
  - **Semáforo de empresa** = tercer bloque `company` (opcional) de `deriveWorkerReasons` (PURA; NO reescrita, ortogonal a los
    Ejes A/B): sólo si `required && persona contratista con empresa`. `ACCREDITED` vigente = ok · por vencer (≤ `DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS`=90 d,
    ISN 90-day flag) = `COMPANY_ACCREDITATION_EXPIRING` (ámbar) · `CONDITIONAL` = `COMPANY_ACCREDITATION_CONDITIONAL` (ámbar
    NUEVO; pasa marcada) · `SUSPENDED`/`EXPIRED`/`NONE`/vencida = `COMPANY_NOT_ACCREDITED` (rojo). Derivado EN VIVO en
    `WorkOrderRosterService` cruzando `Person.contractorCompanyId → ContractorCompany.accreditationStatus/accreditedUntil`
    (nunca almacenado). **Override firmado POR PERSONA REUSADO** (`COMPANY_NOT_ACCREDITED` es `blocked` ⇒ entra sin cambio en
    `confirmRoster`).
  - **Avisos (Bloque N)**: `WorkerComplianceService.findBreaches()` += `contractor.accreditation.expiring`/`.expired` (sólo
    empresas con personal en OT abierta cuyo tipo EXIGE acreditación; sólo ACCREDITED/CONDITIONAL con `accreditedUntil`
    fechado; dedupe por OT+empresa+día) + resolver `resolveContractorAccreditation` + 2 plantillas de correo. **CERO permiso
    nuevo** (`worker:manage`/`workordercatalog:manage`).
- **FolioCounter** *(S2, fork W4)* — motor de folio gapless configurable, REUTILIZABLE (sirve al folio-por-plantilla,
  BACKLOG 2026-06-30). Una fila por secuencia: `sequenceKey` **PK** (codifica entidad+scope+período, ej.
  `workorder|type:<id>|2026`) + `lastValue`. Asignación ATÓMICA `INSERT … ON CONFLICT … DO UPDATE … RETURNING`
  (`FolioService.next(tx, …)`, dentro de la transacción del llamador ⇒ rollback no quema folio). El formateo es PURO en
  `@lyra/contracts` (`work-orders/folio.ts`: `folioSchemeSchema` {prefix,mask,padding,start,scope,reset} +
  `resolveFolioScheme`/`buildFolioSeqKey`/`renderFolio`; default OT = por-tipo + reinicio anual ⇒ `OT-2026-0001`).
- **WorkOrderType** — catálogo configurable de tipos (espejo de `IncidentType`). `key` única, `name`/`description`/`color`,
  `defaultWorkflowId` (ref. blanda; flujo que se CONGELA al crear una OT del tipo), `requiresPtwDefault`,
  `criticalityDefault`, **`folioScheme` (Json validado por `folioSchemeSchema`) + `folioOnStateKey`** (S2: estado al que,
  al ENTRAR, se emite el folio; null = "aprobada"; configurables por API — editor UI pendiente),
  **`checklistSuggestStateKey`/`checklistGateStateKey`** (S3: estados data-driven que disparan la sugerencia de checklists
  y la Puerta 2; null = "en_preparacion"/"checklists_ok"), **`planFreezeStateKey`/`executeStateKey`** (S4: estados
  data-driven que disparan el congelamiento de la baseline [Puerta 3] y el guard "no ejecuta sin plan"; null =
  "plan_aprobado"/"en_ejecucion"), SLA light
  (`resolutionDueMinutes`/`escalationAfterMinutes`/`escalationRoleId` → **Role** SetNull, relación
  `WorkOrderTypeEscalationRole`), `active`/`sortOrder`.
- **WorkOrderChecklistRule** *(S3, fork W5 — Capa A diseño)* — regla de aplicabilidad de un checklist. `templateId`
  (→ **Template**, Restrict; la plantilla del Form Builder que se instancia), **`moment` (enum `WorkOrderChecklistMoment`:
  REQUEST|PLANNING|AUTHORIZATION|EXECUTION|CLOSURE, default AUTHORIZATION — S5b)**, `mandatory` (obligatorio ⇒ no removible +
  bloquea la puerta de su momento), aplicabilidad `appliesToTypeIds String[]` (vacío = todos)/`minCriticality`/`specialtyId`
  (→ **Specialty** SetNull)/`requiresPtw` (null = no discrimina), `active`/`sortOrder`, `deletedAt`. Helper puro
  `applicableChecklistRules` (contracts) decide el match (espejo de `applicableObligationsFor`).
- **WorkOrderChecklist** *(S3, fork W5 — Capa B operación)* — enlace **(OT, plantilla[, actividad])** con
  **`@@unique([workOrderId, templateId, workActivityId])`** (S5b Slice B; ⚠️ **Postgres trata NULL como DISTINTO** ⇒ el unique
  NO protege los de nivel-OT [`workActivityId` null], cuyo anti-duplicado sigue siendo el **guard de código** en
  `materializeForWorkOrder`/`addManual` filtrando `workActivityId: null`). **`moment` (enum `WorkOrderChecklistMoment`, congelado
  al materializar/agregar; denormalizado desde la regla — S5b; índice `(workOrderId, moment)`)**, **`workActivityId` (→
  **WorkActivity** SetNull, índice; SOLO los de EJECUCIÓN cuelgan de una tarea — S5b Slice B; null = nivel-OT)**, `logEntryId`
  (→ **LogEntry** SetNull; instancia viva, null hasta iniciar), `sourceRuleId` (→ WorkOrderChecklistRule SetNull; null = agregado
  manual), `mandatory`, `status` (enum **WorkOrderChecklistStatus**: PENDING|IN_PROGRESS|SUBMITTED|APPROVED|REJECTED),
  `responsibleId`/`responsibleRoleId`, `reviewerId`/`reviewedAt`/`rejectReason` (segregación: revisor ≠ responsable), `addedById`.
  `onDelete: Cascade` desde `WorkOrder`. Guards PUROS `blockingChecklistsForClose` (obligatorio no APPROVED, moment-blind =
  indicador general), **`blockingChecklistsForMoment`** (obligatorio no APPROVED de UN momento: AUTHORIZATION al ENTRAR al
  estado-puerta, CLOSURE/EXECUTION al CERRAR), y **`applicableExecutionRulesForActivity`** (match regla EXECUTION ↔ actividad por
  especialidad de la ACTIVIDAD; regla sin especialidad = todas) + **`blockingExecutionChecklistsForActivity`** (obligatorio de
  EJECUCIÓN de UNA actividad no APPROVED = bloquea marcar esa tarea DONE) — S5b Slice B.
- **WorkActivity** *(S4, fork W1 — entidad PROPIA, NO se fusiona con `IncidentAction`)* — actividad/tarea del plan de
  trabajo. `title`/`description`, `sequence` (orden en el plan), `responsibleId`/`responsibleRoleId` (refs blandas),
  `specialtyId` (→ **Specialty** SetNull, relación `WorkActivitySpecialty`), planificación
  `plannedStart`/`plannedEnd` (plan VIVO) + **`baselineStart`/`baselineEnd`** (congelados al autorizar el plan ⇒ miden
  desviación) + `actualStart`/`actualEnd` (avance real, S5), `progressPct` (0..100), `status` (enum **WorkActivityStatus**:
  PENDING|IN_PROGRESS|BLOCKED|DONE|CANCELED), `mandatory` (abierta ⇒ bloquea cierre, Puerta 4), `dependsOnId` (self,
  SetNull, relación `WorkActivityDeps` — ruta crítica S8, hoy solo la columna), `priority`, `delayReason`, cierre
  (`completedAt`/`completedById`/`completionNote`), cancelación (`canceledAt`/`cancelReason`/`canceledById`), columnas
  RESERVADAS (`estimatedHours`/`actualHours` Decimal S8, `evidence` Json), auditoría (`createdById`/`updatedById`).
  `onDelete: Cascade` desde `WorkOrder`. Guards PUROS (contracts `work-orders/activities.ts`): `planReadyToFreeze` (≥1
  no cancelada, exigido para autorizar el plan), `blockingActivitiesForClose` (mandatory abierta = Puerta 4),
  `planNotFrozen`, `summarizeActivities`, `activityEndDeviationDays`, **`effectiveProgressPct`/`activityDeviationLabel`** (S5).
  **S5:** foto vigente actualizada por cada avance (`status`/`progressPct`/`actual*`/`completed*`); en la lectura el DTO se
  enriquece con `updatesCount`/`lastProgressAt` (batched). El **guard de escritura de avance** es `assertProgressable`
  (servicio): exige plan CONGELADO + OT abierta (espejo inverso de `assertEditable` que bloquea el plan tras congelar).
- **WorkActivityUpdate** *(S5a — entidad NUEVA, migración `20260702200000_add_work_activity_updates`)* — **BITÁCORA
  append-only del AVANCE** de una `WorkActivity`. Cada registro de avance crea una fila INMUTABLE (jamás se edita/borra):
  `status` (nullable = sin cambio de estado), `progressPct` (nullable), `actualStart`/`actualEnd` (fechas reales
  declaradas), `note`, `deviation` (texto de la desviación vs baseline, derivado con `activityDeviationLabel`),
  `delayReason`, `authorId`/`authorName`, `createdAt`; columnas RESERVADAS S8/Ola 3 (`hoursSpent`/`cost` Decimal,
  `evidence` Json). `onDelete: Cascade` desde `WorkActivity`; índice `(workActivityId, createdAt)`. La foto vigente vive
  DENORMALIZADA en `WorkActivity` (este historial explica cómo llegó ahí).
- **Specialty** — catálogo de disciplina/oficio (`key` única, `name`/`description`/`color`, `active`/`sortOrder`).
  Equivale al **Work Center (SAP PM) / Craft (Maximo)**. N:N con la OT. La **ubicación** la da `orgNodeId` (estructura,
  que puede tener un nivel "Área"), **no** un catálogo aparte.
- **WorkOrderSpecialty** — enlace N:N (`@@id([workOrderId, specialtyId])`); `onDelete: Cascade` desde `WorkOrder`,
  `Restrict` desde el catálogo.
- **`Area` / `WorkOrderArea` — ELIMINADOS (2026-07-01, migración `20260701190000_drop_work_order_area`).** Duplicaban la
  jerarquía de ubicación (`OrgNode`); los EAM líderes usan la jerarquía de ubicación para la "área/zona". Ver DECISIONS.

**Implementado en S2** (migración `20260701210000_add_work_order_workflow_folio`): `FolioCounter`, `WorkOrderTransition`,
`WorkOrderEvent`, flujo sembrado "OT — 4 puertas PTW" (`ot-4-puertas`, 11 estados; la anulación NO es estado — es el
endpoint `cancel`, espejo Incidencias). **Implementado en S3** (migración `20260702120000_add_work_order_checklists`):
`WorkOrderChecklistRule` + `WorkOrderChecklist` + enum `WorkOrderChecklistStatus` + 2 columnas data-driven en
`WorkOrderType`; seed de plantilla LOTO publicada + regla obligatoria. *(El bug de folio cross-tipo se CORRIGIÓ el mismo
día, `fix/ot-folio-global`: default scope `global`.)* **Implementado en S4** (migración
`20260702180000_add_work_order_activities`): entidad `WorkActivity` + enum `WorkActivityStatus` + `WorkOrder.planFrozenAt/
planFrozenById` + `WorkOrderType.planFreezeStateKey/executeStateKey`; **REORDEN del flujo** `ot-4-puertas` al estándar
(planificar→autorizar permiso→ejecutar; seed republica una versión nueva, in-flight intactos). **Implementado en S5a**
(migración `20260702200000_add_work_activity_updates`): entidad **`WorkActivityUpdate`** (avance append-only) + relación
`WorkActivity.updates` + enriquecimiento del DTO (`updatesCount`/`lastProgressAt`); seguimiento vivo del avance
(`recordProgress`/`listUpdates`) + cierre punta a punta (guards ya cableados en S4). Reusa `workorder:activity:manage`
(sin permiso nuevo). **Implementado en S5b Slice A** (migración `20260702210000_add_checklist_moment`): enum
**`WorkOrderChecklistMoment`** + columna `moment` en `WorkOrderChecklistRule` y `WorkOrderChecklist` (default AUTHORIZATION,
retrocompatible) + índice `(workOrderId, moment)` + **`WorkOrderType.closureChecklistSuggestStateKey`** (default
`en_revision_cierre`, data-driven, paridad `folioOnStateKey`); materialización y guard **por momento** (AUTHORIZATION = S3
intacto; **CLOSURE per-OT**: sugerido al ENTRAR a la revisión de cierre, BLOQUEA el cierre si obligatorio no APPROVED);
helper puro `blockingChecklistsForMoment`; seed +plantilla/regla de CIERRE. Reusa `workorder:checklist:manage` (sin permiso
nuevo). **Implementado en S5b Slice B** (migración `20260702220000_add_execution_checklists`): `WorkOrderChecklist.workActivityId`
(→ **WorkActivity** SetNull) + relación inversa `WorkActivity.executionChecklists` + `@@unique` a `(workOrderId, templateId,
workActivityId)` + índice `(workActivityId)`; **`WorkOrder.executionSetConfirmedAt/ById`** (sello de Gobierno 2). Materialización
del **SET de EJECUCIÓN por actividad** al ENTRAR a preparación (`materializeExecutionSet`, orquestador `materializeForState`),
match por especialidad de la actividad (`applicableExecutionRulesForActivity`); **Gobierno 2** = `confirmExecutionSet` +
`assertExecutionSetConfirmed` (gate al autorizar) + auto-limpieza al curar el set; **gate por actividad**
`assertActivityExecutionComplete` (no DONE sin verificación de EJECUCIÓN obligatoria aprobada) + backstop
`assertChecklistsCompleteForMoment(EXECUTION)` al cerrar; seed +plantilla/regla de EJECUCIÓN. Reusa `workorder:checklist:manage`
(sin permiso nuevo). **Cierra el modelo §11 de checklists.** **Pendiente:** `WorkOrderComment`; patrones §11.7 (puntos de espera/
testigo, doble firma RII, condicionales). Ver `docs/design/OT_DESIGN_ARCHITECTURE.md §11`.
