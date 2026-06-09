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
  Referencias **modeladas** (editores 2.2/2.3): `workflowDefinitionId?/workflowDefinitionVersionId?` (sin FK
  aún — la entidad `WorkflowDefinition` llega en 2.2), `requireSignature` (Part 11 opt-in),
  `recurrenceKind`/`recurrenceConfig` (rondas/turnos).
- **TemplateSection** *(implementado)* — unidad atómica de permiso/llenado/firma: `key` (estable), `title`,
  `description?`, `order`, `requireSignature` (opt-in), `editableInStateKey?` (estado del flujo que la
  habilita; null = siempre). *N—N* `Role` vía **TemplateSectionRole** (permiso de llenado por sección).
- **TemplateField** *(implementado)* — `key`, `type` (enum `FieldType`: 8 núcleo + SEVERITY/SIGNATURE),
  `label`, `help?`, `required`, `order`, `config` (JSONB validado por unión Zod: unidad/umbral ISA-18.2/
  opciones/regex…), `visibleWhen?` (condicional). *N—N* `Role` vía **TemplateFieldRole** (override por campo).
- **Entry / LogEntry** (bitácora, **Fase 2.4**) — valores con FK a `TemplateVersion`, `OrgNode`, periodo, autor.
- **EntryChangeLog** — diffs antes/después + motivo (auditoría de edición).
- **AutoIncidentRule** — reglas que disparan incidencias desde campos (umbral, severidad ≥ N).

### Orígenes de datos
- **DataSource** — URL base, tipo de auth, **credencial cifrada en reposo**. *1—N* **DataSourceEndpoint** (path, método, mapeo JSONPath, TTL). Caché en Redis.

### Incidencias (workflow HSE)
- **Incident** — severidad, prioridad, estado, asignado, reporter, SLA/due, protocolo, origen.
- **IncidentComment**, **IncidentActivity** (timeline append-only), **IncidentAttachment**.
- **WorkflowDefinition** *1—N* **WorkflowTransition** — estados y transiciones configurables (permiso por transición).

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
