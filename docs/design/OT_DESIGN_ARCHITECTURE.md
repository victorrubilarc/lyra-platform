# OT_DESIGN_ARCHITECTURE — Módulo de Órdenes de Trabajo (OT / PTW)

> **Lyra WatchLog · ITESICWS** — Anexo técnico de arquitectura del módulo de Órdenes de Trabajo con
> Permiso de Trabajo (Solicitud → Requerimiento/OT → PTW). **Sesión 0 (DISEÑO, sin código).**
> Estado: **PROPUESTA a la espera del visto bueno del dueño.** Los FORKS marcados abajo esperan tu OK
> explícito antes de la Sesión 1. Fecha: 2026-07-01. Autor: agente (verificado contra código + git).
>
> **Convención de lectura:** cada capacidad dice si **REUSA** algo que ya existe (con ruta/nombre real
> verificado en el repo) o si es **NUEVO** (a construir). Nada citado como existente se inventa.

---

## 0. Resumen ejecutivo (para la propuesta comercial)

El módulo absorbe el flujo industrial **Solicitud de Trabajo → Orden de Trabajo con Permiso de Trabajo
(PTW)** —el estándar EAM/CMMS (SAP PM *Aviso→Orden*, IBM Maximo *Work Request→Work Order*) combinado con
**PTW de alto riesgo** (LOTO/bloqueo de energías, trabajo en altura, espacios confinados, ART) exigido por
**DS 132 SERNAGEOMIN** e **ISO 45001**— **sin construir un CMMS desde cero**: se modela como una entidad
nueva `WorkOrder`, **espejo de `Incident`**, que reutiliza **~70 % de la maquinaria transversal** ya
probada en Incidencias.

**Qué se reutiliza (existe y funciona hoy):** motor de workflow configurable, Form Builder como motor de
checklists, patrón CAPA/acciones, Bloque N (alertas/SLA), dashboard analítico, RBAC + ABAC por nodo ∩
estructura, auditoría inmutable, firmas Part 11. **Qué se construye:** la entidad `WorkOrder` y sus
catálogos/tablas satélite, el motor de **folio gapless configurable** (`FolioCounter`, hoy inexistente —
ver §4), y las pantallas del módulo.

**Regla comercial clave:** las 4 puertas de aprobación son **configurables** (una minera exigente usa las
4; una PYME, 1) — no hay flujo hardcodeado; el cliente arma su gobernanza como dato.

---

## 1. Validación del grounding (verificado en el código, no redescubierto)

Rutas y nombres **confirmados** en el repo (correcciones al prompt marcadas ⚠️):

| Pieza a reutilizar | Ubicación real verificada | Notas |
|---|---|---|
| Motor de workflow | `apps/watchlog-api/prisma/schema.prisma`: `WorkflowDefinition` (931), `WorkflowDefinitionVersion` (954 — ⚠️ **no** se llama `WorkflowVersion`), `WorkflowState` (981), `WorkflowTransition` (1009), `WorkflowTransitionRole` (1038) | `requireSignature`/`signatureMeaning`/`requireMfa` opt-in por transición; `maxStayMinutes` por estado = SLA de permanencia; `notifyConfig` congelado. Roles por transición = **DATO** (`WorkflowTransitionRole`). |
| Form builder = motor de checklists | `Template` (719), `TemplateVersion` (765), `LogEntry` (1527) como instancia viva | `TemplateVersion.rules` (reglas cruzadas), `requireSignature`, `recurrenceConfig`. **No** se crea entidad de checklist nueva. |
| Acciones / CAPA | `IncidentAction` (2315) | Base conceptual de `WorkActivity`; tiene `mandatory`, verificación de eficacia, `evidence Json?`, `investigationStepId`. |
| Alertas / SLA (Bloque N) | `NotificationOutbox` (1866); `IncidentSlaService.findBreaches()` (`apps/watchlog-api/src/incidents/incident-sla.service.ts`); `NotificationWorkerService.sweep()` y `NotificationResolverService` (`src/notifications/`) | Eventos incidencia: `incident.sla.breached`, `incident.overdue`, `incident.action.overdue`, `incident.report.due`. |
| Dashboard | `IncidentDashboardService` (`src/incidents/incident-dashboard.service.ts`): `build()`, `buildCross()`, `computeKpis()`, `mttrAndCompliance()` ($queryRaw con `date_trunc AT TIME ZONE` = `PLANT_TIME_ZONE`) | Plantilla a clonar para `WorkOrderDashboardService`. |
| Permisos | `packages/contracts/src/security/permissions.ts` | ⚠️ **No hay "categorías numéricas"** en el código: cada permiso es `{ key, dimension: MODULE\|ACTION\|WORKFLOW, group: string, description }`. Las "cat. 83/90/91" de docs/memoria son convención de *display*, no del catálogo. |
| ABAC | `ScopeService` (`src/authz/scope.service.ts`): `getAccessibleNodeIds()`, `getAccessibleNodes()`, `canAccessNode()`, `getAccessibleStructureIds()`, `getAccessibleTemplateIds()` | Devuelve `null` = sin restricción; `Set` vacío = sin acceso. 100 % reutilizable. |
| Auditoría inmutable | `AuditLog` (1754) | Refs blandas (`actorId`/`entityType`/`entityId`, `before`/`after`). |
| Firmas Part 11 | `LogEntrySignature` (1732): `payloadHash` SHA-256, `meaning`, `method`, `signerName`; `ReauthService.verifyForSignature()` | Incidencias las referencia por ref. blanda (`IncidentTransition.signatureId`). |
| Vistas guardadas / grilla | `SavedView` (1781); `SavedViewsService` (`src/saved-views/`); contrato `SavedViewModule` en `packages/contracts/src/saved-views/` | Genérico por `module` (hoy `"logbook"`, `"incidents"`). Autorización por ownership. |
| Folio | ⚠️ **`FolioCounter` NO existe.** Hoy: `Incident.number`/`LogEntry.entryNumber`/`IncidentAction.number` = `@default(autoincrement())` GLOBAL; el código humano se **deriva** (`incidentCode() → INC-####`, `BIT-######`, `ACT-####`). | Autoincrement es gapless pero **global, sin scope ni reinicio anual**. La OT necesita folio **al aprobar** con posible reinicio anual/por-tipo → **se construye `FolioCounter`** (§4). |
| Prototipo | `prototipo.tsx` (raíz) | ⚠️ **No dibuja OT** (los 2 hits de "orden/trabajo" son ruido). La UI de OT se diseña desde cero respetando la identidad Lyra + convenciones de grilla. |

### 1.1 Contraste con el estándar de industria

- **EAM/CMMS (SAP PM, Maximo):** *Aviso/Notification → Orden/Work Order* con estados de usuario y
  operaciones (tareas). **Adoptamos** el patrón "entidad + workflow congelado + tareas + guards de cierre
  + dashboard", que es exactamente el molde de Incidencias.
- **Lo que se SALE del CMMS típico y cómo se absorbe sin ad-hoc:**
  1. **PTW como ciudadano de primer orden.** Un CMMS clásico atornilla el PTW como módulo aparte. Aquí el
     PTW **es un `WorkOrderType`** ("Permiso de Alto Riesgo") con **checklists obligatorios** (LOTO, ART,
     altura, espacio confinado) instanciados desde el **Form Builder** y una **transición de revisión
     firmada** (Puerta 2). Cero motor nuevo.
  2. **Folio emitido SOLO al aprobar** (no al crear). El CMMS numera al crear; nuestra regla de negocio
     evita "basura digital"/duplicados. Se absorbe con `FolioCounter` emitiendo en la transición de
     aprobación (§4).
  3. **Workflow configurable de N puertas** en vez de estados fijos. Es **más** flexible que los *user
     status* de SAP; se absorbe con `WorkflowDefinition` (dato, no código).
- **PTW de alto riesgo / DS 132 / ISO 45001:** los permisos específicos (bloqueo de energías, altura,
  espacios confinados, ART) son **plantillas de checklist** (contenido = dato del cliente), **jamás
  hardcodeadas** (mismo principio que las obligaciones regulatorias de Incidencias, que son *seed* por
  vertical).

### 1.2 Fuera de alcance de este módulo (explícito)

- **Entitlements / activación por licencia** (que OT e Incidencias sean activables según lo contratado):
  **DIFERIDO** al épico de licenciamiento (`BACKLOG §2(1)`, Ed25519). Hoy la visibilidad es **solo RBAC**
  (`module:workorders:view`). *(DECISIONS 2026-07-01 #6.)*
- **Reportabilidad regulatoria de la OT** hacia una autoridad externa (equivalente a `IncidentReport`):
  no se contempla en el MVP; si el cliente lo pide, se clona el patrón `ReportingObligation`/`IncidentReport`.
- **Costos/HH detallados, ruta crítica/dependencias, aprobadores dinámicos por reglas:** Sesión 8 (opcional).
- **Refactor del ejecutor de workflow** compartido LogEntry/Incident/WorkOrder: deuda técnica de una sesión
  dedicada (ver §7), **no** este módulo.

---

## 2. Modelo de datos propuesto (entidades NUEVAS)

> Todas las tablas siguen los patrones del repo: `id cuid`, refs blandas a personas (`*ById String?` sin FK
> dura, patrón `AuditLog`/`Incident`), `createdAt/updatedAt`, `deletedAt` para borrado lógico, sin borrado
> físico. Enums nuevos en `PascalCase`. Los nombres son **PROPUESTA**.

### 2.1 `WorkOrder` (espejo de `Incident`)

```
model WorkOrder {
  id                          String  @id @default(cuid())
  // FOLIO: null hasta la aprobación (Puerta 1). Se emite vía FolioCounter (§4).
  folio                       String? @unique        // ej. "OT-2026-0001" (humano, inmutable)
  folioSeqKey                 String?                 // clave de secuencia usada (auditoría del contador)
  folioIssuedAt               DateTime?
  title                       String
  description                 String?
  typeId                      String                  // → WorkOrderType (Restrict)
  originType                  WorkOrderOrigin @default(DIRECT)  // DIRECT|RULE|EXCEPTION|PLANNED|INCIDENT
  criticality                 Int                     // 1..5 (tokens severidad; significado operacional)
  priority                    WorkOrderPriority @default(MEDIUM)
  riskProbability             Int?                    // ISO 31000 (reusa RISK_MATRIX / riskLevelFor)
  riskConsequence             Int?
  requiresPtw                 Boolean @default(false) // ¿exige permiso de trabajo? (default del tipo, override)
  // --- Ubicación / alcance (orgNode = ancla ABAC; location = detalle libre) -----
  orgNodeId                   String                  // → OrgNode (Restrict). ABAC + estructura.
  equipmentId                 String?                 // → Equipment (SetNull)
  locationDetail              String?                 // "Chancador primario, nivel 3"
  shiftCode                   String?
  // --- Workflow congelado (denormalizado, patrón Incident) ----------------------
  workflowDefinitionId        String?
  workflowDefinitionVersionId String?
  currentStateKey             String?
  currentStateSince           DateTime @default(now())  // base del SLA de permanencia
  lifecycle                   WorkOrderLifecycle @default(DRAFT) // DRAFT|OPEN|CLOSED|CANCELED
  // --- Personas / fechas --------------------------------------------------------
  requesterId                 String?                 // solicitante (ref. blanda)
  ownerId                     String?                 // responsable de la OT
  requestedAt                 DateTime @default(now())
  detectedAt                  DateTime?               // cuándo se detectó la necesidad
  plannedStart                DateTime?               // tentativa (baseline se congela en Puerta 3)
  plannedEnd                  DateTime?
  dueAt                       DateTime?               // SLA de resolución
  // --- Puerta 1 (aprobación de la solicitud) ------------------------------------
  approvedAt                  DateTime?
  approvedById                String?
  rejectedAt                  DateTime?
  rejectReason                String?
  rejectedById                String?
  // --- Cierre / anulación (sin borrado físico) ----------------------------------
  closedAt                    DateTime?
  closedById                  String?
  closureSummary              String?
  canceledAt                  DateTime?
  cancelReason                String?
  canceledById                String?
  // --- Origen / ligazón bidireccional (refs blandas) ----------------------------
  originIncidentId            String?                 // Incidencia que gatilló la OT
  originLogEntryId            String?                 // entrada de bitácora
  originExceptionId           String?                 // excepción operacional
  createdById                 String?
  updatedById                 String?
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
  deletedAt                   DateTime?

  type        WorkOrderType        @relation(fields: [typeId], references: [id], onDelete: Restrict)
  orgNode     OrgNode              @relation(fields: [orgNodeId], references: [id], onDelete: Restrict)
  equipment   Equipment?           @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
  areas       WorkOrderArea[]
  specialties WorkOrderSpecialty[]
  checklists  WorkOrderChecklist[]
  activities  WorkActivity[]
  transitions WorkOrderTransition[]
  comments    WorkOrderComment[]
  events      WorkOrderEvent[]     // timeline append-only (≠ activities)

  @@index([typeId]) @@index([orgNodeId]) @@index([equipmentId])
  @@index([lifecycle]) @@index([priority]) @@index([criticality])
  @@index([ownerId]) @@index([originType]) @@index([originIncidentId])
  @@index([currentStateKey]) @@index([createdAt, id])
}
```

**Nota de naming:** en Incidencias, `IncidentActivity` = *timeline*; aquí el timeline se llama
**`WorkOrderEvent`** para no chocar con `WorkActivity` (las tareas de trabajo). `WorkOrderTransition` es
espejo exacto de `IncidentTransition`.

### 2.2 `WorkOrderType` (espejo de `IncidentType`)

```
model WorkOrderType {
  id                     String  @id @default(cuid())
  key                    String  @unique
  name                   String
  description            String?
  color                  String?
  defaultWorkflowId      String?                 // WorkflowDefinition congelado al crear (ref. blanda)
  requiresPtwDefault     Boolean @default(false)
  criticalityDefault     Int?
  // --- Folio (esquema configurable; ver §4) ------------------------------------
  folioScheme            Json?                   // {prefix, mask, padding, start, scope, reset}
  folioOnStateKey        String?                 // clave del estado al que, al ENTRAR, se emite el folio
  // --- SLA light (espejo IncidentType) -----------------------------------------
  resolutionDueMinutes   Int?
  escalationAfterMinutes Int?
  escalationRoleId       String?
  active                 Boolean @default(true)
  sortOrder              Int     @default(0)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  deletedAt              DateTime?

  escalationRole Role?                     @relation(fields: [escalationRoleId], references: [id], onDelete: SetNull)
  checklistRules WorkOrderChecklistRule[]
  workOrders     WorkOrder[]

  @@index([active]) @@index([deletedAt]) @@index([escalationRoleId])
}
```

### 2.3 Catálogos de clasificación N:N — `Area`, `Specialty`

`Area` (zona/área funcional, p.ej. "Mina Rajo", "Planta Concentradora") y `Specialty` (disciplina, p.ej.
"Mecánica", "Eléctrica", "Instrumentación") son **catálogos ligeros independientes**; una OT puede tocar
**varias** de cada uno (N:N). **No** sustituyen a `orgNodeId` (que sigue siendo el ancla de ubicación +
ABAC) — son ejes de **clasificación/enrutamiento** para reglas de checklist y (S8) selección de aprobadores.

```
model Area {                              // idéntico shape para Specialty
  id String @id @default(cuid())
  key String @unique
  name String
  description String?
  color String?
  active Boolean @default(true)
  sortOrder Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  workOrders WorkOrderArea[]
}
model WorkOrderArea {                     // idéntico para WorkOrderSpecialty
  workOrderId String
  areaId      String
  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  area      Area      @relation(fields: [areaId], references: [id], onDelete: Restrict)
  @@id([workOrderId, areaId])
  @@index([areaId])
}
```

### 2.4 Checklists en 2 capas — `WorkOrderChecklistRule` (diseño) + `WorkOrderChecklist` (operación)

**Capa A · diseño (admin):** construye cada checklist en el **Form Builder** (`Template` normal) y define
**reglas de aplicabilidad** (patrón `appliesToTypeIds`/`minSeverity` de `ReportingObligation`):

```
model WorkOrderChecklistRule {
  id            String  @id @default(cuid())
  name          String
  templateId    String                  // → Template (checklist a instanciar; Restrict)
  mandatory     Boolean @default(false) // obligatorio ⇒ no removible, bloquea Puerta 2
  // Aplicabilidad (todo vacío/null = aplica a todos):
  appliesToTypeIds String[] @default([])   // WorkOrderType.id (vacío = todos los tipos)
  minCriticality   Int?
  areaId           String?                 // SetNull
  specialtyId      String?                 // SetNull
  requiresPtw      Boolean?                // solo si la OT exige PTW
  active        Boolean @default(true)
  sortOrder     Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  type WorkOrderType? @relation(...)     // opcional: regla colgada de un tipo, o transversal
  @@index([templateId]) @@index([active])
}
```

**Capa B · operación (en la OT, fase Preparación):** al aprobar, el backend **sugiere automáticamente** los
checklists cuyas reglas matchean (los `mandatory` no se pueden quitar) y el usuario **agrega manualmente**
los que falten. Cada uno instancia un **`LogEntry` vivo** (responsable, firma, evidencia):

```
model WorkOrderChecklist {
  id            String  @id @default(cuid())
  workOrderId   String
  templateId    String                  // qué checklist
  logEntryId    String?                 // instancia viva (null hasta iniciarla) → LogEntry
  sourceRuleId  String?                 // qué regla lo sugirió (null = agregado manual)
  mandatory     Boolean @default(false)
  status        WorkOrderChecklistStatus @default(PENDING) // PENDING|IN_PROGRESS|SUBMITTED|APPROVED|REJECTED
  responsibleId     String?
  responsibleRoleId String?
  reviewerId    String?                 // rol/persona que revisa en Puerta 2 (segregación)
  reviewedAt    DateTime?
  rejectReason  String?
  addedById     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  @@unique([workOrderId, templateId])   // MVP: 1 instancia por (OT, plantilla). Multi-instancia = futuro.
  @@index([workOrderId]) @@index([status]) @@index([logEntryId])
}
```

**Guard de Puerta 2 (`assertChecklistsComplete`)**: no se puede avanzar de Preparación → Planificación si
existe algún `WorkOrderChecklist.mandatory` que **no** esté `APPROVED`. **Sin "botón de pánico".**

### 2.5 `WorkActivity` (base `IncidentAction` + planificación) y `WorkActivityUpdate` (append-only)

```
model WorkActivity {
  id            String  @id @default(cuid())
  workOrderId   String
  title         String
  description   String?
  sequence      Int     @default(0)      // orden en el plan
  responsibleId     String?
  responsibleRoleId String?
  specialtyId   String?                  // disciplina (SetNull)
  // --- Planificación (baseline congelada en Puerta 3) --------------------------
  plannedStart  DateTime?                // plan VIVO (editable)
  plannedEnd    DateTime?
  baselineStart DateTime?                // congelado al aprobar el plan ⇒ mide desviación
  baselineEnd   DateTime?
  actualStart   DateTime?
  actualEnd     DateTime?
  estimatedHours Decimal? @db.Decimal(10,2)   // (S8, opcional)
  actualHours    Decimal? @db.Decimal(10,2)   // (S8, opcional)
  progressPct   Int     @default(0)      // 0..100
  status        WorkActivityStatus @default(PENDING) // PENDING|IN_PROGRESS|BLOCKED|DONE|CANCELED
  mandatory     Boolean @default(true)   // abierta ⇒ bloquea cierre (Puerta 4)
  dependsOnId   String?                  // predecesora (self, SetNull) — ruta crítica (S8)
  priority      WorkOrderPriority?
  delayReason   String?
  completedAt   DateTime?  completedById String?  completionNote String?
  canceledAt    DateTime?  cancelReason String?  canceledById String?
  evidence      Json?                    // reservado (descriptores Ola 3)
  createdById String?  updatedById String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  dependsOn WorkActivity? @relation("ActivityDeps", fields: [dependsOnId], references: [id], onDelete: SetNull)
  dependents WorkActivity[] @relation("ActivityDeps")
  updates   WorkActivityUpdate[]
  @@index([workOrderId, sequence]) @@index([status]) @@index([responsibleId]) @@index([mandatory, status])
}

model WorkActivityUpdate {               // BITÁCORA append-only del avance
  id            String  @id @default(cuid())
  workActivityId String
  progressPct   Int?
  actualStart   DateTime?  actualEnd DateTime?    // fechas reales declaradas
  note          String?
  deviation     String?                  // desviación respecto al baseline
  delayReason   String?
  hoursSpent    Decimal? @db.Decimal(10,2)   // (S8)
  cost          Decimal? @db.Decimal(14,2)   // (S8)
  evidence      Json?
  authorId      String?  authorName String?
  createdAt     DateTime @default(now())
  workActivity WorkActivity @relation(fields: [workActivityId], references: [id], onDelete: Cascade)
  @@index([workActivityId, createdAt])
}
```

**Guard de Puerta 4 (`assertActivitiesComplete`)**: no se puede cerrar si hay `WorkActivity.mandatory`
abierta (≠ DONE/CANCELED).

### 2.6 Satélites espejo (patrón Incidencias, sin sorpresas)

`WorkOrderComment` (= `IncidentComment`), `WorkOrderEvent` (= `IncidentActivity` timeline, `kind` clasifica:
CREATED|APPROVED|REJECTED|FOLIO_ISSUED|CHECKLIST_ADDED|TRANSITION|PLAN_FROZEN|CLOSED|CANCELED),
`WorkOrderTransition` (= `IncidentTransition`, con `signatureId` ref. blanda a `LogEntrySignature`).

---

## 3. Workflow base: 4 PUERTAS configurables + emisión de folio

**Es una `WorkflowDefinition` SEMBRADA** ("OT — 4 puertas PTW") con estados/transiciones/roles como **DATO**.
El admin puede clonarla y simplificarla a 1 puerta. Estados/transiciones propuestos (todos editables):

| # | Estado (`key`) | `isInitial/isFinal` | Transición saliente | Puerta | `requireSignature` |
|---|---|---|---|---|---|
| 1 | `borrador` | initial | `enviar` → `solicitada` | — | no |
| 2 | `solicitada` | — | **`aprobar`** → `aprobada` **(EMITE FOLIO)** · `rechazar` → `rechazada` (motivo obligatorio) | **P1** | sí (firma) |
| 3 | `aprobada` | — | `preparar` → `en_preparacion` | — | no |
| 4 | `en_preparacion` | — | **`revisar_checklists`** → `checklists_ok` (guard P2) · `devolver` → `aprobada` | **P2** | sí |
| 5 | `checklists_ok` | — | `planificar` → `en_planificacion` | — | no |
| 6 | `en_planificacion` | — | **`autorizar_plan`** → `plan_aprobado` **(CONGELA BASELINE)** · `devolver_plan` → `en_preparacion` | **P3** | opcional |
| 7 | `plan_aprobado` | — | `ejecutar` → `en_ejecucion` (guard "no ejecuta sin plan") | — | no |
| 8 | `en_ejecucion` | — | `solicitar_cierre` → `en_revision_cierre` | — | no |
| 9 | `en_revision_cierre` | — | **`cerrar`** → `cerrada` (guards P4) · `reabrir` → `en_ejecucion` | **P4** | sí (firma) |
| 10 | `cerrada` | final | — | — | — |
| 11 | `rechazada` | final | — | — | — |
| 12 | `cancelada` | final | `cancelar` desde casi cualquier estado (motivo obligatorio) | — | opcional |

**Mecánica EXACTA de emisión del folio (la clave del caso de uso):**
En `WorkOrdersService.transition()`, dentro de la **transacción** de la transición, **antes** de escribir el
nuevo estado:

```
if (workOrder.folio == null && toStateKey == type.folioOnStateKey) {
    const seqKey = buildFolioSeqKey(type.folioScheme, workOrder);   // ej. "workorder|<typeId>|2026"
    const seq    = await folio.next(seqKey);                        // atómico (§4)
    workOrder.folio = renderFolio(type.folioScheme, seq);           // "OT-2026-0001"
    workOrder.folioSeqKey = seqKey;  workOrder.folioIssuedAt = now;
    // + WorkOrderEvent kind=FOLIO_ISSUED
}
```

`folioOnStateKey` es **DATO del `WorkOrderType`** (default `"aprobada"`), de modo que **no se hardcodea qué
transición emite** ni se contamina el modelo de workflow compartido con banderas OT-específicas. Si el admin
reduce el flujo a 1 puerta, apunta `folioOnStateKey` al estado que corresponda.

**Guards de cierre (Puerta 4)** — funciones **PURAS** en `packages/contracts` (patrón
`blockingActionsForClose`/`investigationBlocksClose`), invocadas por el servicio cuando `toState.isFinal`:
- `blockingChecklistsForClose(checklists)` → mandatory no APPROVED.
- `blockingActivitiesForClose(activities)` → mandatory abierta.
- `planNotFrozen(workOrder)` → no se ejecutó/cerró sin baseline congelado.

---

## 4. `FolioCounter` — motor de folio gapless configurable (NUEVO)

**Por qué se construye (objeción fundada):** el `autoincrement()` global de hoy **no** permite folio
**al aprobar** con **reinicio anual** ni **scope por tipo/nodo**. La OT lo exige ("N° de requerimiento"
correlativo). Además, este mismo motor resuelve el **requerimiento pendiente del dueño** de *"correlativo
propio por plantilla"* (`BACKLOG` 2026-06-30): **construirlo aquí lo siembra para toda la plataforma.**

```
model FolioCounter {
  id          String @id @default(cuid())
  sequenceKey String @unique   // clave derivada: "workorder|<typeId>|2026"
  lastValue   Int    @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Asignación **atómica** (sin `SELECT max`+1 de carrera):
`INSERT ... ON CONFLICT (sequenceKey) DO UPDATE SET lastValue = FolioCounter.lastValue + 1 RETURNING lastValue`.
Servicio `FolioService` en `apps/watchlog-api/src/folio/` (NestJS, exportado y reutilizable). El **formateo**
(prefijo/máscara/padding, reusa `applyMask` ya existente para `OT-#####`) vive en `packages/contracts`.

`folioScheme` (JSON validado por Zod en contrato): `{ prefix, mask, padding, start, scope, reset }` con
ejes independientes que el admin combina (mismo diseño acordado en `BACKLOG`):
- **scope**: `global` · `type` · `node` · `structure` (qué entra en `sequenceKey`).
- **reset**: `never` · `annual` (agrega `YYYY` a la clave) · (mensual/período = crecimiento aditivo).

---

## 5. Catálogo de permisos NUEVOS (RBAC)

Se agrega el **grupo `"workorders"`** al catálogo `packages/contracts/src/security/permissions.ts`
(mecanismo real = `group` + `dimension`, **no** "categoría numérica"). Además hay que registrar la etiqueta
del grupo donde el web renderiza los grupos de permisos.

| `key` | `dimension` | Propósito |
|---|---|---|
| `module:workorders:view` | MODULE | Ver el módulo de OT (lista, kanban, detalle). |
| `workorder:view` | ACTION | Listar y ver OT. |
| `workorder:create` | ACTION | Crear solicitudes de OT (manual o desde incidencia/excepción/bitácora/planificada). |
| `workorder:edit` | ACTION | Editar atributos (criticidad, prioridad, área, especialidad, fechas). |
| `workorder:assign` | ACTION | Asignar/cambiar responsable. |
| `workorder:comment` | ACTION | Comentar en la OT. |
| `workorder:transition` | **WORKFLOW** | Ejecutar transiciones y firmar (**QUIÉN puede cada puerta = DATO**: `WorkflowTransitionRole`). |
| `workorder:cancel` | ACTION | Anular con motivo auditado (sin borrado físico). |
| `workorder:checklist:manage` | ACTION | Agregar/quitar/instanciar checklists en una OT. |
| `workorder:activity:manage` | ACTION | Gestionar el plan de actividades y sus updates de avance. |
| `workordercatalog:manage` | ACTION | Administrar `WorkOrderType`, `Area`, `Specialty` y reglas de checklist. |

**⚠️ Objeción fundada al fork "4 permisos de puerta" (`approve`/`checklist:review`/`plan:approve`/`close`):**
la plataforma **ya** modela la autorización *por transición* como **DATO** (`WorkflowTransitionRole`) — es la
dimensión WORKFLOW y así funciona Incidencias (`incident:transition`). Crear 4 permisos fijos de puerta
**duplicaría y contradiría** el motor de workflow, y rompería la promesa de "puertas configurables" (un
cliente con 1 puerta no sabría qué permiso pedir). **Recomiendo un único `workorder:transition`** + roles por
puerta como dato. Es más flexible y consistente. *(Fork W2, abajo.)*

**Gotcha de dev (para S1+):** permiso nuevo ⇒ `pnpm db:seed` + `redis FLUSHALL` o el admin demo da 403.

---

## 6. Integración Incidencia → OT (enlace bidireccional)

- **Botón "Generar OT"** en el detalle de una Incidencia (gate `workorder:create`): crea una `WorkOrder`
  con `originIncidentId` + `originType = INCIDENT`, prellenando nodo/equipo/título/criticidad desde la
  incidencia. **La CAPA liviana (`IncidentAction`) se queda en la incidencia**; el trabajo "pesado" se
  promueve a la OT. *(Maximo: incident → work order a nivel de incidente, no de acción.)*
- **Back-link:** la incidencia muestra sus OT vinculadas (`WorkOrder where originIncidentId = …`); la OT
  muestra su incidencia de origen. Refs **blandas** (una anulación no rompe la otra).
- **Mismas fuentes que una incidencia + planificada:** `originType ∈ {DIRECT, RULE, EXCEPTION, PLANNED,
  INCIDENT}`. Desde una excepción/regla/bitácora se setea `originExceptionId`/`originLogEntryId`.

---

## 7. Qué se extrae a `packages/` (sin duplicar Incidencias) y límites de dependencia

- **`packages/contracts/src/work-orders/`** (NUEVO): DTOs + Zod schemas, `workOrderCode`/render de folio,
  **guards de cierre PUROS** (`blockingChecklistsForClose`, `blockingActivitiesForClose`, `planNotFrozen`),
  enums de estado, contrato de lista (query keyset + facetas) y contrato de dashboard. **Espejo** de
  `packages/contracts/src/incidents/`. *Dependencia:* contracts no depende de apps (regla del monorepo).
- **`FolioService`** (backend, `apps/watchlog-api/src/folio/`, NUEVO): reutilizable por OT **y** por el
  folio-por-plantilla del dueño. Formateo puro en contracts.
- **`SavedView`:** agregar `"work-orders"` al enum `SavedViewModule` en contracts y **reusar**
  `SavedViewsService` tal cual (cero cambios de servicio).
- **ABAC:** reusar `ScopeService` sin cambios (`getAccessibleNodeIds` en `buildWhere` de la OT).
- **Bloque N:** reusar `NotificationWorkerService.sweep()` agregando `WorkOrderSlaService.findBreaches()`
  (clon de `IncidentSlaService`) + resolvers para `workorder.overdue`/`.activity.overdue`/`.stalled`/
  `.sla.breached` (S6).
- **Dashboard:** **clonar** `IncidentDashboardService` → `WorkOrderDashboardService` (S7). Se prefiere clon
  a abstracción prematura; si aparecen helpers SQL triviales comunes (bucketing TZ) se extraen.

**Deuda técnica registrada (NO en este módulo):** el ejecutor de transición está **duplicado** entre
`LogEntriesService` e `IncidentsService`; la OT sería la **3.ª** copia. Extraer un `WorkflowExecutorService`
compartido merece **una sesión dedicada con tests** (toca 2 módulos en producción); CLAUDE.md prohíbe
refactors masivos a mitad de módulo. Se anota en `BACKLOG`.

---

## 8. FORKS a resolver (cada uno espera tu OK; recomendación fundada)

| # | Fork | Recomendación | Fundamento |
|---|---|---|---|
| **W1** | `WorkActivity` propia **vs** generalizar `IncidentAction` a un motor compartido en `packages/` | **Entidad propia `WorkActivity`**; compartir solo los **guards puros** en contracts | CAPA (verificación de eficacia) ≠ tarea de OT (progressPct/baseline/dependencias/HH). Fusionar a nivel de BD infla una tabla polimórfica. Maximo separa *WO operations* de *incident CAPA*. |
| **W2** | 4 permisos de puerta **vs** un `workorder:transition` + roles-por-transición (dato) | **Un `workorder:transition`** + `WorkflowTransitionRole` | La plataforma ya modela autorización por transición como dato (dim. WORKFLOW). 4 permisos fijos rompen "puertas configurables". |
| **W3** | "Área" = reusar `OrgNode` **vs** catálogo `Area` separado | **Catálogo `Area` separado** (N:N); `orgNodeId` sigue siendo ubicación+ABAC | `OrgNode` es jerarquía/ABAC; "área/disciplina" crosscutea ubicaciones. Sobrecargar `OrgNode` ensucia el ABAC. |
| **W4** | `FolioCounter`: alcance {global/nodo/estructura/tipo} y reinicio {nunca/anual} | **Construirlo ahora**; default OT = **por tipo + anual** (`OT-2026-0001`), configurable | Autoincrement no da scope/reinicio; folio-al-aprobar lo exige; siembra el folio-por-plantilla del dueño. |
| **W5** | Checklist-plantilla: `Template` normal **vs** marcada "tipo checklist" | **`Template` normal** + marcador **opcional** `Template.purpose` (null\|CHECKLIST) solo como filtro UX | Cualquier plantilla puede ser checklist; el marcador solo acota el picker de reglas/OT. Aditivo, default null = cero ruptura. |
| **W6** | 4 puertas: sembrar flujo base **vs** que el admin lo arme | **Sembrar** "OT — 4 puertas PTW" (dato, clonable/simplificable) | Operable día 1 para la minera; PYME lo reduce a 1. Nada hardcodeado (mismo patrón que los flujos seed existentes). |
| **W7** | UI: kanban+lista+facetas+`SavedView` **vs** solo grilla | **Paridad total con Incidencias** (lista + kanban + facetas + `SavedView` + peek) | La maquinaria existe; es el estándar premium y la coherencia del producto. |
| **W8** | OT desde `IncidentAction` "pesada" **vs** directo desde la incidencia | **Directo desde la incidencia** (`originIncidentId`) | Maximo incident→WO es a nivel de incidente; la CAPA liviana se queda en la incidencia. |

---

## 9. Plan por fases (roadmap confirmado — `BACKLOG §2`)

Sesiones chicas y cerrables (una por objetivo). **Paquete comercial recomendado: MVP S1–S5 + control
S6–S7; S8 opcional.**

| Sesión | Alcance | HH |
|---|---|---:|
| **S0** | **Diseño y aprobación (este documento).** | ~14 |
| **S1** | Cimientos: `WorkOrder` + `WorkOrderType` + `Area`/`Specialty` (N:N); permisos; crear/listar solicitud (DRAFT/OPEN) con ABAC nodo ∩ estructura; web `/ordenes-trabajo` (grilla con convenciones de filtro/paginación + wizard). Sin workflow/folio/checklists/actividades. | ~40 |
| **S2** | Puerta 1: workflow congelado, aprobar/rechazar (motivo obligatorio), **`FolioCounter`** (folio SOLO al aprobar), firma Part 11 + timeline. | ~35 |
| **S3** | Puerta 2: `WorkOrderChecklistRule` + `WorkOrderChecklist`; sugerencia auto + selección manual + instanciación (Form Builder/`LogEntry`); guard "obligatorios completos + aprobados" con revisor distinto. | ~45 |
| **S4** | Puerta 3: `WorkActivity`; enviar/aprobar/rechazar plan → **congelar baseline**; guard "no ejecuta sin plan". | ~40 |
| **S5** | Puerta 4 → **CIERRA EL MVP**: `WorkActivityUpdate` (append-only); solicitud de cierre + revisión + guards. Ciclo Solicitud→Cierre punta a punta. | ~35 |
| **S6** | Alertas/SLA/semáforos ("vigía digital"): eventos `workorder.overdue`/`.activity.overdue`/`.stalled`/`.sla.breached`; escalamiento; Bloque N + `findBreaches`. | ~40 |
| **S7** | Dashboard de OT (`WorkOrderDashboardService`, clon) + integración Incidencia→OT bidireccional. **Fin del paquete comercial.** | ~40 |
| **S8** | Enterprise/opcional: aprobadores dinámicos por reglas, dependencias/ruta crítica, costos/HH, escalamiento multinivel. | ~108 |
| | **Total** | **~397** |

---

## 10. Criterios de aceptación (revisados)

- ✅ **Todo nombre existente citado se verificó en el repo**; los NUEVOS están marcados como tales.
  Correcciones al prompt: `WorkflowDefinitionVersion` (no `WorkflowVersion`); permisos por `group`/`dimension`
  (no "categorías numéricas"); `FolioCounter` **no** existe; el prototipo no dibuja OT.
- ✅ **Cada capacidad dice qué REUSA y qué CONSTRUYE** (§§2–7).
- ✅ **Nada hardcodeado que deba ser dato:** puertas/roles/tipos/reglas/checklists/folio = configurables.
- ✅ **Entitlements/activación por licencia NO se tocan** (§1.2; DECISIONS 2026-07-01 #6).
- ✅ **Objeciones fundadas** entregadas (W1/W2/W4 + deuda del ejecutor de workflow).

---

> **Próximo paso:** requiere tu **visto bueno explícito** de los forks W1–W8 (y del enfoque general) antes
> de la Sesión 1. Al aprobar, las decisiones se consolidan en `docs/DECISIONS.md` y arranca S1 (Cimientos).
