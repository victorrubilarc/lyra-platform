# Modelo de datos — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 1 — esquema de identidad, RBAC/ABAC, estructura y auditoría **implementado** en Prisma; el resto sigue siendo diseño de alto nivel).

> **Estado Fase 1 (implementado):** ver `apps/watchlog-api/prisma/schema.prisma` y migraciones `20260605211220_init_security_structure` + `20260605211546_add_failed_login_count`. Modelos vivos: `User` (con `failedLoginCount`/`lockedUntil`/`forcePasswordChange`), `PasswordHistory`, `Role`, `Permission` (dims. MODULE/ACTION/WORKFLOW), `UserRole`, `RolePermission`, `Scope` (sujeto polimórfico user|role, *check constraint*), `Session`, `RefreshToken` (hash + familia + rotación), `MfaSecret`, `MfaRecoveryCode`, `PasswordPolicy` (singleton), `OrgLevel`, `OrgNode` (ruta materializada `path`), `AuditLog` (trigger de inmutabilidad). El resto de entidades de abajo es diseño pendiente para fases posteriores.

> Single-tenant: **no** hay `tenant_id`. Cada instalación es de un cliente. Convenciones generales: PK `id` (cuid/uuid), `createdAt`/`updatedAt`, autor (`createdById`/`updatedById`) donde aplique, borrado lógico (`deletedAt`) en entidades de negocio.

## Entidades principales y relaciones

### Identidad y seguridad
- **User** — credenciales (hash Argon2id), estado, MFA. `User` *N—N* `Role` (vía **UserRole**).
- **Role** *N—N* **Permission** (vía **RolePermission**). Permisos atómicos de 4 dimensiones (ver `SECURITY.md`).
- **UserScope** — alcance de datos: liga `User`/`Role` a uno o más `OrgNode` (con herencia a descendientes) y/o a `Template` específicos.
- **Session / RefreshToken** — sesiones y refresh tokens rotativos. **MfaSecret** (TOTP).
- **PasswordPolicy** — política configurable (longitud, expiración, etc.).
- **AuthIdentity** (Fase futura) — vínculo a proveedor externo OIDC/LDAP cuando se active.

### Estructura organizacional
- **OrgLevel** — nombres de nivel configurables (Área/Proceso/Equipo…).
- **OrgNode** — auto-referencial (`parentId`, `level`); jerarquía configurable y opcional.

### Plantillas y registros
- **Template** *1—N* **TemplateVersion** — definición de campos en `JSONB`, versionada (inmutable al publicar). Anclada a `OrgNode` y a roles.
- **Entry** (bitácora) — valores en `JSONB`; FK a `TemplateVersion`, `OrgNode`, `Shift`, autor.
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
