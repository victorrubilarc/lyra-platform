# Modelo de datos — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 1 — esquema de identidad, RBAC/ABAC, estructura y auditoría **implementado** en Prisma; el resto sigue siendo diseño de alto nivel).

> **Estado Fase 1 (implementado):** ver `apps/watchlog-api/prisma/schema.prisma` y migraciones `20260605211220_init_security_structure` + `20260605211546_add_failed_login_count`. Modelos vivos: `User` (con `failedLoginCount`/`lockedUntil`/`forcePasswordChange` y, para el throttle del 2.º factor, `mfaFailedCount`/`mfaLockedUntil`), `PasswordHistory`, `Role` (con `requireMfa`), `Permission` (dims. MODULE/ACTION/WORKFLOW), `UserRole`, `RolePermission`, `Scope` (sujeto polimórfico user|role, *check constraint*), `Session`, `RefreshToken` (hash + familia + rotación), `MfaSecret`, `MfaRecoveryCode`, `PasswordResetToken` (hash SHA-256 + single-use + TTL, migración `20260606021713_add_password_reset_token`), `PasswordPolicy` (singleton, con `mfaMode`: enum `MfaMode`; migración `20260606041921_add_mfa_policy_requirement`), `OrgLevel`, `OrgNode` (ruta materializada `path`), **`Equipment`/`EquipmentCategory`/`ExternalReference`** (migración `20260608195838_add_equipment_and_external_reference`, con check constraints de criticidad 1–5 y de dueño polimórfico exclusivo en `ExternalReference`), `AuditLog` (trigger de inmutabilidad). El resto de entidades de abajo es diseño pendiente para fases posteriores.

> Single-tenant: **no** hay `tenant_id`. Cada instalación es de un cliente. Convenciones generales: PK `id` (cuid/uuid), `createdAt`/`updatedAt`, autor (`createdById`/`updatedById`) donde aplique, borrado lógico (`deletedAt`) en entidades de negocio.

## Entidades principales y relaciones

### Identidad y seguridad
- **User** — credenciales (hash Argon2id), estado, MFA. `User` *N—N* `Role` (vía **UserRole**).
- **Role** *N—N* **Permission** (vía **RolePermission**). Permisos atómicos de 4 dimensiones (ver `SECURITY.md`).
- **UserScope** — alcance de datos: liga `User`/`Role` a uno o más `OrgNode` (con herencia a descendientes) y/o a `Template` específicos.
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
- **Template** *(implementado)* — contenedor lógico mutable: `name`, `description?`, `orgNodeId?` (ancla en
  estructura; null = global), `status` (DRAFT/PUBLISHED/ARCHIVED), `currentVersionId?` (versión publicada
  viva), `createdById/updatedById` (referencia blanda), `deletedAt` (borrado lógico).
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
    `inline` (`items:[{code,label}]`, único editable hoy) · `referenceList` (`listKey` → Lista de Referencia
    gobernada, entidad y FK en 2.x) · `external` (`sourceKey` → Orígenes de Datos, Fase 3). El shape `options[]`
    legacy se **sube** a `inline` al leer/escribir (helper `upgradeFieldConfig`; configs son JSONB ⇒ sin migración SQL).
  - **Regla de reportabilidad:** el valor que se persiste al llenar (2.4) para una referencia es el **`code` estable,
    NO el label** (patrón dimensión de DW / FHIR Coding). Labels cambian sin romper histórico.
- **Entry / LogEntry** (bitácora, **Fase 2.4** — solo DISEÑO, sin tabla aún):
  - **Campos de SISTEMA intrínsecos** (columnas indexadas, inmutables/auditadas, capturados SIEMPRE): `recordedAt`
    (commit), `createdBy`, `orgNodeId`, `equipmentId?`, `templateVersionId` (FK), `currentState`, periodo/turno?,
    firmas. La trazabilidad temporal es **estructural**, no un campo que se agrega.
  - **`effectiveAt`** (columna indexada) = fecha efectiva de negocio (hora del evento/lectura ≠ captura). Se promueve
    del valor del campo con `semanticRole = EFFECTIVE_DATE`; si la plantilla no marca ninguno, cae a `recordedAt`.
  - Valores con historial por campo + transiciones de flujo. **Las tablas se crean en 2.4** (aditivo/no destructivo;
    su forma se valida con la lógica real del llenado). En 2.1.1 quedan solo como diseño aquí y en DECISIONS.
- **EntryChangeLog** — diffs antes/después + motivo (auditoría de edición).
- **AutoIncidentRule** — reglas que disparan incidencias desde campos (umbral, severidad ≥ N).

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

### Orígenes de datos
- **DataSource** — URL base, tipo de auth, **credencial cifrada en reposo**. *1—N* **DataSourceEndpoint** (path, método, mapeo JSONPath, TTL). Caché en Redis.

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
- Valores de formularios en `JSONB` validados contra la `TemplateVersion` (Zod en backend); columnas indexadas/derivadas donde haga falta filtrar/ordenar.
- Índices previstos: FKs, `OrgNode.parentId`, `Entry(templateId, createdAt)`, `Incident(status, severity)`, GIN en `tsvector` de KB y en `JSONB` consultable.
- El esquema vive en `apps/watchlog-api/prisma/schema.prisma`; migraciones versionadas con `prisma migrate`.
