# DOTACION_DESIGN_ARCHITECTURE — Dotación del permiso (personas, competencias, contratistas)

> **Lyra WatchLog · ITESICWS** — Anexo técnico del módulo OT/PTW. Gestión de la **DOTACIÓN**: el listado de
> personas (propias y contratistas) que ingresan a ejecutar labores bajo permiso, su **rol**, su **competencia**
> (certificaciones vigentes), su **autorización/designación** (habilitación sin veto), la **acreditación de la
> empresa contratista**, y el **control de esa dotación por quien aprueba el permiso**.
>
> **Estado: APROBADO por el dueño (2026-07-03). Slice 1 IMPLEMENTADO (`feat/dotacion-permiso-s1`).** Forks D1–D7 confirmados
> (D3 firma Part 11 en S1; vocabulario estándar). S2–S4 = roadmap abierto (BACKLOG). Decisiones consolidadas en DECISIONS 2026-07-03.**
> Fecha: 2026-07-02 (diseño) / 2026-07-03 (S1). Autor: agente (verificado contra código + git; estándares investigados y citados).
>
> **Convención de lectura:** cada capacidad dice si **REUSA** algo existente (con ruta/nombre real verificado) o
> si es **NUEVO**. Cada entidad/campo/rol/estado/regla lleva **TRAZA** a un estándar nombrado o a un líder
> citado. Lo que no tiene respaldo se marca **[SUPOSICIÓN A VALIDAR]** — no se inventa.

---

## 0. La necesidad real (del dueño) y la corrección de rumbo

En muchas OT —no en todas— hay que gestionar **quiénes entran** a un área a trabajar. **Quien aprueba el permiso
debe conocer y validar esa dotación**: quiénes ingresan, si están **autorizados/acreditados**, si tienen
**competencias vigentes**, y si hay **impedimentos** (certificación vencida, examen preocupacional no vigente,
empresa contratista no acreditada, restricción/veto, inducción faltante).

**Hoy esto NO existe** (verificado, §1). El módulo OT solo tiene responsables (`ownerId`/`requesterId`, refs
blandas a `User`) y especialidades (`WorkOrderSpecialty` N:N = *Work Center/Craft*). **No** hay entidad de
personas, ni contratistas, ni competencias con vigencia, ni control de dotación en la aprobación.

**Optativo por diseño (requisito explícito):** sin configuración, la OT **no muestra dotación** (cero fricción,
cero regresión). Se activa por tipo de OT (S1) y las exigencias concretas se derivan de reglas data-driven (S2).

---

## 1. Grounding verificado (código + git, no redescubierto)

**Verificado 2026-07-02** en `main` (árbol limpio, OT S1–S7 + folio mergeadas; `refactor/ot-ptw-authorization`
mergeada):

| Hecho | Verificación |
|---|---|
| **NO existe** `Person`/`Worker`/`Contractor(Company)`/`Competency`/`Certification`/`Qualification`/`Roster`/`Crew` | `grep "^model (...)" schema.prisma` → *ninguno*. La dotación es **campo nuevo por completo**. |
| `WorkOrder` solo tiene personas como refs blandas a `User` | `ownerId`/`requesterId` en `schema.prisma`; **no** hay roster de personas. |
| Especialidad = *Work Center/Craft*, N:N, **no** es persona | `model Specialty` + `WorkOrderSpecialty` (`schema.prisma:2955`). |

**Patrones a REUTILIZAR (rutas reales, no se duplica ni reinventa):**

| Patrón | Ubicación real verificada | Se reutiliza para |
|---|---|---|
| **Gobierno 2** (confirmación sellada + auto-limpieza al curar + gate) | `work-order-checklists.service.ts`: `confirmExecutionSet()` (378), `clearExecutionConfirmation()` (394, auto-limpia al cambiar el set), `assertExecutionSetConfirmed()` (406, gate); campos `WorkOrder.executionSetConfirmedAt/ById` | **Confirmación de la dotación** por el aprobador (§6). Espejo EXACTO: `rosterConfirmedAt/ById`. |
| **Aplicabilidad data-driven** (función PURA) | `packages/contracts/src/work-orders/checklists.ts`: `applicableChecklistRules(ctx, rules)` con `appliesToTypeIds`/`minCriticality`/`specialtyId`/`requiresPtw` | **Reglas de requisito** de competencia/autorización (§5). Espejo: `applicableCompetencyRules(ctx, rules)`. |
| **Gate en la transición** | `work-orders.service.ts:361` — `assertExecutionSetConfirmed(id)` se invoca al ENTRAR al estado-puerta de AUTORIZACIÓN (`checklistGateStateKey`) | **Gate de dotación**: `assertRosterConfirmed(id)` en el MISMO punto (no autorizar sin dotación confirmada). |
| **Firma Part 11** | `work-orders.service.ts:331-337` — `ReauthService.verifyForSignature()` ya cableado en `transition()`; `WorkOrderTransition.signatureId` (ref. blanda a `LogEntrySignature`) | **Confirmación firmada de la dotación** + **override gobernado** (§6.3). Reusa `ReauthService`. |
| **Timeline append-only** | `WorkOrderEvent` (`schema.prisma:2927`, `kind` clasifica) + `addEvent()` | Eventos de dotación (`WORKER_ADDED`/`WORKER_REMOVED`/`ROSTER_CONFIRMED`/`ROSTER_CHANGED`/`OVERRIDE`). |
| **ABAC nodo ∩ estructura** | `ScopeService` (`src/authz/scope.service.ts`): `getAccessibleNodeIds`, `canAccessNode` | Roster acotado por `WorkOrder.orgNodeId`. Catálogos (Personas/Contratistas) = compartidos. |
| **Bloque N (SLA/avisos)** | `WorkOrderSlaService.findBreaches()` (`work-order-sla.service.ts`) + `NotificationWorkerService.sweep()` + `NotificationResolverService` (case por `eventKey`) | **Avisos de vencimiento** de competencia/acreditación (§9, S2/S3). |
| **Semáforos** (patrón S6) | `work-order-sla.service.ts` (estado derivado, no almacenado) | **Semáforo por persona** derivado en vivo (§7). |
| **Catálogo + permiso `*:manage`** | `Specialty`/`WorkOrderType` + `workordercatalog:manage`; `RequirePermission` | Catálogos `Person`/`ContractorCompany`/`CompetencyType`/`RosterRole`. |
| **Pickers buscables** | `packages/ui`: `MultiSelect` + `Combobox` (`index.ts:69-73`) | Picker de personas del roster (buscable, con chips) — **nunca** `<select multiple>` nativo. |

---

## 2. Investigación de estándares — tabla de trazabilidad (CITADA)

> Regla madre: cada pieza del diseño se ancla aquí. Vocabulario y roles = los **estándar**, no caseros.

### 2.1 El roster y los roles = requisito legal del permiso (OSHA)

**OSHA 29 CFR 1910.146 — Permit-Required Confined Spaces.** El permiso **DEBE listar** a las personas por rol
(verificado en el texto regulatorio):

| Término estándar (inglés) | Definición / deber (cita) | En el permiso | Fuente |
|---|---|---|---|
| **Authorized entrant** ("ejecutante autorizado") | "an employee who is **authorized by the employer** to enter a permit space" (§1910.146(b)); deberes en (h) | **(f)(4)** el permiso identifica a los entrants "**by name** or by such other means (rosters or tracking systems)" | OSHA 1910.146 |
| **Attendant** ("**vigía**") | "an individual **stationed outside** … who monitors the authorized entrants" (b); "**Remains outside the permit space during entry operations until relieved**" (i)(4) | **(f)(5)** "the personnel, **by name**, currently serving as attendants" | OSHA 1910.146 |
| **Entry supervisor** ("supervisor de entrada") | "the person … responsible for **determining if acceptable entry conditions are present**" (b); "**Verifies that rescue services are available**" (j)(4) | **(f)(6)** "the individual, **by name**, currently serving as entry supervisor, **with a space for the signature** … who originally authorized entry"; **(e)(2)** "the entry supervisor … **shall sign the entry permit to authorize entry**" | OSHA 1910.146 |

⇒ **Traza dura:** el roster con roles nombrados **y la FIRMA del supervisor de entrada que autoriza** son
requisito del permiso, no un adorno. Es el ancla del diseño (roles = dato configurable, §4.3; firma = §6.3).
Fuente: https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.146

**OSHA 29 CFR 1910.147 — LOTO.** Dos clases de persona (traza para el eje "autorización/designación", §3):
- **Authorized employee**: "A person who **locks out or tags out** machines or equipment … to perform servicing or maintenance" (§1910.147(b)).
- **Affected employee**: "an employee whose job requires him/her to **operate** … or to **work in an area** in which such servicing or maintenance is being performed."
Fuente: https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147

### 2.2 Sistema de permiso y competencia (UK HSE + ISO)

- **HSE HSG250 — *Guidance on permit-to-work systems*.** El PTW asegura que el trabajo esté **debidamente
  autorizado**; exige **estándares de competencia** (issuer/authorized person competente), **aceptación** por
  quien ejecuta, y para permisos **electrónicos**: impedir emisión/aceptación no autorizada, **e-firmas
  seguras**, y que "**permits cannot be issued remotely without a site visit**". ⇒ Traza para: firma segura de
  la confirmación (§6.3) y competencia del que autoriza (ya cubierto por RBAC `workorder:transition`).
  Fuente: https://www.hse.gov.uk/pubns/books/hsg250.htm · https://books.hse.gov.uk/gempdf/hsg250.pdf
- **ISO 45001:2018 §7.2 (Competence) / §7.3 (Awareness).** La organización debe **determinar la competencia
  necesaria** de los trabajadores que afectan el desempeño SST, **asegurar que sean competentes** con base en
  educación/formación/experiencia, y **conservar información documentada como evidencia** de competencia. ⇒
  Traza directa a `CompetencyType` + `PersonCompetency` con **evidencia** y **vigencia** (§4.4).
  Fuente: https://www.iso.org/standard/63787.html (cláusula descrita en fuentes de auditoría citadas)

### 2.3 Modelo de personas y calificaciones (líderes EAM)

- **IBM Maximo** (verificado en docs IBM + guías): **`Person` está SEPARADO de `User`** — un Person **no
  requiere** cuenta de sistema (contratistas/contactos externos existen como Person sin login). **`Labor`** (el
  que ejecuta, per-organización) enlaza a Person; **`Craft`** = disciplina/oficio. La app **`Qualifications`**
  registra certificaciones por Labor con **`Effective Date` + `Expiration Date`** (Duration), botón
  **Extend/Renew**, e historial **`LABORCERTHIST`** (auditoría de renovaciones). El módulo **HSE / Permit to
  Work**: solo **"qualified personnel"** pre-designados pueden revisar/aprobar/emitir el permiso.
  ⇒ Traza a: `Person` ≠ `User` (§4.1), `PersonCompetency` con vigencia + historial (§4.4), autorización por rol
  (RBAC existente). Fuentes: https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=resources-labor ·
  https://maximosecrets.com/2020/11/03/qualifications/ · https://www.ibm.com/docs/en/mhs-and-em/7.6.2?topic=work-permits
- **SAP** — **HR Qualifications Catalog**: las calificaciones tienen **`Validity Period`**; "**at the end of
  this period, the qualification expires**" y se **elimina automáticamente** del perfil (ej. certificado de
  primeros auxilios válido 2 años). **Work Clearance Management (WCM)**: el permiso "**authorizes specified
  persons to carry out specified work**"; **`Person Responsible`** confirma las medidas de seguridad. ⇒ Traza a
  vigencia con vencimiento automático (§4.4) y a la confirmación de la dotación (§6). Fuentes:
  https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE (Qualifications Catalog / WCM) · https://community.sap.com (WCM PTW)

### 2.4 Acreditación de contratistas — DOS niveles (empresa + trabajador)

Plataformas líderes de prequalification confirman **dos niveles** con **vigencias** y **grado/estado**:

| Plataforma | Nivel EMPRESA | Nivel TRABAJADOR | Vigencia | Fuente |
|---|---|---|---|---|
| **ISNetworld (ISN)** | Grado **RAVS** (revisión de programas SST vs OSHA/cliente); % de fuerza laboral verificada | *Worker-level training & qualifications*; "**tracks all training expirations and sends notifications** to renew"; badging + site orientation | **Sí** (90-day flag) | https://www.isnetworld.com/en/worker-level-training-qualifications |
| **Avetta** | *Compliance grade* por cliente (cuestionarios; gate previo al contrato) | Credenciales a nivel *contractor, subcontractor and workers*; "expiry dates must be visible inside the record" | **Sí** | https://www.avetta.com/clients/solutions/health-and-safety/prequalification |
| **Veriforce** | Score que "clears the client's minimum threshold" | Verificación de credenciales de trabajador | **Sí** | https://www.safetyservicescompany.com/prequalification-services/veriforce/ |

⇒ Traza a: `ContractorCompany.accreditationStatus/grade/accreditedUntil` (empresa, §4.2) **y**
`PersonCompetency` (trabajador, §4.4). El semáforo se pone rojo si la empresa **no** está acreditada (§7). El
campo `externalProvider` deja el gancho para integrar ISN/Avetta/Veriforce (S4, fuera de alcance).

### 2.5 Marco chileno (mercado objetivo)

| Exigencia | Base normativa | Qué obliga | Fuente |
|---|---|---|---|
| **ODI / "derecho a saber"** | **DS 44/2024 art. 15** (vigente; **deroga DS 40**) | Informar **oportuna y adecuadamente** riesgos, medidas y métodos correctos **antes** de iniciar | https://www.dt.gob.cl/portal/1628/w3-article-95297.html |
| **Reglamento especial para contratistas** + verificación de cumplimiento | **Ley 16.744 art. 66 bis** (Ley 20.123) | El **mandante** coordina, **verifica cumplimiento** y sanciona a contratistas/subcontratistas | https://www.suseso.gob.cl/613/w3-propertyvalue-69171.html |
| **Registro de contratistas** | **Código del Trabajo art. 183-C** (DS 319/2006) | Mantener **listado actualizado** de contratistas y acreditar cumplimiento laboral/previsional | https://www.dt.gob.cl/portal/1626/w3-article-98244.html |
| **Examen médico** (preocupacional/ocupacional) | **Ley 16.744 art. 71** | Vigilancia de salud; el **preocupacional** lo costea la empresa | https://www.suseso.gob.cl/612/w3-propertyvalue-69080.html |
| **Inducción básica minería** | **DS 132/2004 (SERNAGEOMIN)** | Curso Básico Estandarizado de Inducción para todo ingreso a faena minera | https://www.bcn.cl/leychile/navegar?idNorma=221064 |

⇒ Traza a: `CompetencyType.category` incluye `INDUCTION` / `MEDICAL_EXAM` (§4.4), y a `ContractorCompany`
(registro/acreditación de contratistas). **Cambio normativo confirmado:** **DS 44 rige HOY** (vigente 01-feb-2025,
derogó DS 40/54). **[SUPOSICIÓN A VALIDAR]:** el formato de "credencial de acceso" es práctica industrial (ACHS/
Mutual/IST), **no** exigencia legal de formato único — modelable pero no obligatorio.

---

## 3. Los TRES sentidos de "autorización" (NO fusionar) y los DOS ejes de la persona

| # | Sentido | Qué es | Dónde vive |
|---|---|---|---|
| 1 | Autorización **del permiso** | La firma del aprobador que autoriza la OT/permiso | **EXISTE**: `WorkOrderTransition` + `ReauthService` (firma Part 11) |
| 2 | Quién **puede aprobar** | RBAC: qué rol ejecuta la transición de puerta | **EXISTE**: `WorkflowTransitionRole` + `workorder:transition` |
| 3 | Que una **PERSONA** esté autorizada a **ingresar/ejecutar ESTE** permiso | La dotación — objeto de este diseño | **NUEVO** |

**El sentido (3) tiene DOS EJES ORTOGONALES — no colapsar en un flag** (traza: OSHA "authorized entrant" +
Maximo Person/Qualification/authorization):

- **Eje A — Competencia:** la persona posee la **certificación/formación VIGENTE** exigida (ISO 45001 §7.2;
  Maximo Qualification; SAP validity). Falla si: falta o está **vencida**.
- **Eje B — Autorización/Designación:** la persona está **habilitada** para este permiso/espacio/tarea y **sin
  veto/restricción** activa (OSHA "authorized by the employer"; Maximo "qualified personnel"). Falla si: no
  designada / con **restricción** activa.

**Semáforo por persona (§7) = ROJO si falla CUALQUIERA de las 4 causas:** (1) competencia vencida/faltante
[Eje A], (2) no autorizada/designada [Eje B], (3) **empresa contratista no acreditada** [nivel empresa, §2.4],
(4) **veto/restricción** activa [Eje B]. Cada causa se modela por separado; el rojo es su OR.

---

## 4. Modelo de datos (entidades NUEVAS; cada una trazada)

> Patrones del repo: `id cuid`, refs blandas `*ById String?`, `createdAt/updatedAt`, `deletedAt` (sin borrado
> físico), enums `PascalCase`. Nombres = PROPUESTA.

### 4.1 `Person` — persona, SEPARADA de `User` [traza: Maximo Person ≠ User]

```
model Person {
  id                 String  @id @default(cuid())
  kind               PersonKind @default(INTERNAL)  // INTERNAL | CONTRACTOR
  firstName          String
  lastName           String
  fullName           String            // denormalizado (búsqueda/rendimiento)
  nationalId         String?           // RUT/DNI (identificador de la persona real)
  personnelCode      String?           // ficha/código interno o del contratista
  badgeId            String?           // credencial física (gancho control de acceso S4)
  jobTitle           String?           // cargo (texto; la disciplina formal = Specialty si se liga)
  email              String?
  phone              String?
  contractorCompanyId String?          // null = propio; set = trabajador de contratista
  userId             String?           // enlace BLANDO si además tiene login (propios); null = sin login
  active             Boolean @default(true)
  createdById String?  updatedById String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?

  contractorCompany ContractorCompany? @relation(fields: [contractorCompanyId], references: [id], onDelete: SetNull)
  competencies      PersonCompetency[]   // S2
  restrictions      PersonRestriction[]  // S2
  rosterEntries     WorkOrderWorker[]
  @@index([kind]) @@index([contractorCompanyId]) @@index([active]) @@index([deletedAt])
  @@index([nationalId]) @@index([fullName])
}
```
*Decisión:* `Person` es **catálogo compartido** (como `Specialty`/tipos), **sin** ABAC por nodo — el ABAC se
aplica en el roster vía `WorkOrder.orgNodeId`. `userId` es enlace **blando** opcional: un propio puede ser
también `User`, un contratista **no** tiene login (traza Maximo). Contratistas se comparten entre estructuras.

### 4.2 `ContractorCompany` — empresa contratista con acreditación [traza: ISN/Avetta/Veriforce + Ley 16.744 66bis/183-C]

```
model ContractorCompany {
  id            String @id @default(cuid())
  key           String @unique
  name          String
  taxId         String?                       // RUT de la empresa (registro art. 183-C)
  // --- Acreditación (nivel EMPRESA) — campos presentes en S1, GATE se activa en S3 ------
  accreditationStatus AccreditationStatus @default(NONE) // ACCREDITED|CONDITIONAL|SUSPENDED|EXPIRED|NONE
  accreditationGrade  String?                    // "A" (ISN RAVS) / score (Avetta/Veriforce)
  accreditedUntil     DateTime?                  // vencimiento de la acreditación
  externalProvider    String?                    // "ISNetworld"|"Avetta"|"Veriforce"|null (gancho S4)
  accreditationNote   String?
  active   Boolean @default(true)
  createdById String?  updatedById String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?
  persons  Person[]
  @@index([active]) @@index([accreditationStatus]) @@index([deletedAt])
}
```

### 4.3 `RosterRole` — rol en la dotación (CONFIGURABLE) [traza: OSHA entrant/attendant/entry supervisor]

```
model RosterRole {
  id              String @id @default(cuid())
  key             String @unique       // "authorized_entrant" | "attendant" | "entry_supervisor" | ...
  name            String               // "Ejecutante", "Vigía", "Supervisor de entrada"
  description     String?
  isSupervisorRole Boolean @default(false)  // el que autoriza/firma (entry supervisor) — traza OSHA (f)(6)/(e)(2)
  mustRemainOutside Boolean @default(false) // semántica de vigía (attendant) — traza OSHA (i)(4)
  color           String?
  active          Boolean @default(true)
  sortOrder       Int @default(0)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?
  rosterEntries WorkOrderWorker[]
  @@index([active]) @@index([deletedAt])
}
```
**Seed (dato, editable):** los 3 roles OSHA. **No** hardcodeados: el cliente agrega/renombra. La **completitud
de roles** (ej. "exige un supervisor de entrada" / "exige un vigía") = regla de configuración, ver §6.2.

### 4.4 `CompetencyType` + `PersonCompetency` — competencia con VIGENCIA [S2] [traza: ISO 45001 §7.2 · Maximo Qualifications · SAP validity]

```
model CompetencyType {                    // catálogo (qué certificación/formación existe)
  id            String @id @default(cuid())
  key           String @unique
  name          String                    // "Trabajo en altura", "Espacio confinado – entrante", "Inducción SERNAGEOMIN"
  description    String?
  category       CompetencyCategory        // CERTIFICATION|TRAINING|MEDICAL_EXAM|INDUCTION|LICENSE  (traza Chile: INDUCTION/MEDICAL_EXAM)
  defaultValidityDays Int?                 // duración típica (Maximo Effective+Duration; SAP validity)
  requiresExpiry Boolean @default(true)
  active Boolean @default(true)  sortOrder Int @default(0)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?
  personCompetencies PersonCompetency[]
  requirementRules   WorkOrderCompetencyRule[]
}
model PersonCompetency {                   // la persona POSEE una competencia (con vigencia + evidencia)
  id            String @id @default(cuid())
  personId      String
  competencyTypeId String
  issuedAt      DateTime                   // "Effective Date"
  expiresAt     DateTime?                  // null = sin vencimiento (requiresExpiry=false)
  certificateNumber String?
  issuedBy      String?                    // organismo/instructor emisor
  evidence      Json?                      // descriptores de adjunto (Ola 3), reservado
  verifiedById  String?  verifiedAt DateTime?   // quién validó la evidencia (ISO 45001 evidencia documentada)
  createdById String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?  // soft: renovar = nuevo registro (historial, traza LABORCERTHIST)
  person Person @relation(fields: [personId], references: [id], onDelete: Cascade)
  competencyType CompetencyType @relation(fields: [competencyTypeId], references: [id], onDelete: Restrict)
  @@index([personId]) @@index([competencyTypeId]) @@index([expiresAt]) @@index([deletedAt])
}
```
*Estado (VALID/EXPIRING/EXPIRED) = DERIVADO* de `expiresAt` vs ahora (no se almacena; función pura, §7).

### 4.5 `PersonRestriction` — veto/restricción (Eje B) [S2] [traza: OSHA "authorized by the employer"]

```
model PersonRestriction {
  id       String @id @default(cuid())
  personId String
  type     RestrictionType   // MEDICAL | DISCIPLINARY | SITE_BAN | OTHER
  reason   String
  startsAt DateTime @default(now())
  endsAt   DateTime?          // null = indefinida
  active   Boolean @default(true)
  createdById String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?
  person Person @relation(fields: [personId], references: [id], onDelete: Cascade)
  @@index([personId]) @@index([active]) @@index([endsAt])
}
```

### 4.6 `WorkOrderWorker` — el roster de ESTA OT (persona + rol) [traza: OSHA permiso lista personas por rol]

```
model WorkOrderWorker {
  id           String @id @default(cuid())
  workOrderId  String
  personId     String
  rosterRoleId String
  note         String?
  addedById    String?  addedAt DateTime @default(now())
  removedAt    DateTime?  removedById String?  removeReason String?   // soft (sin borrado físico)
  // --- Override gobernado (si se confirma con la persona en ROJO) — §6.3 -----------
  overrideReason      String?
  overrideById        String?  overrideAt DateTime?
  overrideSignatureId String?      // ref. blanda a LogEntrySignature (Part 11)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  workOrder  WorkOrder  @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  person     Person     @relation(fields: [personId], references: [id], onDelete: Restrict)
  rosterRole RosterRole @relation(fields: [rosterRoleId], references: [id], onDelete: Restrict)
  @@unique([workOrderId, personId, rosterRoleId])   // una persona puede tener >1 rol (OSHA: supervisor puede ser también entrant/attendant si está capacitado)
  @@index([workOrderId]) @@index([personId]) @@index([removedAt])
}
```

### 4.7 En `WorkOrder` y `WorkOrderType` (aditivos)

```
// WorkOrder (mirror EXACTO de executionSetConfirmedAt/ById):
rosterConfirmedAt   DateTime?
rosterConfirmedById String?
// WorkOrderType (activación optativa — §5):
rosterEnabled       Boolean @default(false)   // sin esto ⇒ la OT NO muestra dotación (cero fricción)
```

---

## 5. Aplicabilidad data-driven + activación optativa

**Dos niveles, ambos dato (traza: patrón `WorkOrderChecklistRule`/`applicableChecklistRules`):**

- **(a) ¿La OT gestiona dotación?** — toggle `WorkOrderType.rosterEnabled` (S1). Sin activar ⇒ sin pestaña, sin
  gate, cero regresión. *(El dueño: "no aplica siempre ni a todas las OT".)*
- **(b) ¿Qué competencia/autorización se exige, a quién, cuándo?** — `WorkOrderCompetencyRule` (S2), espejo de
  `WorkOrderChecklistRule`, evaluada por una función **PURA** `applicableCompetencyRules(ctx, rules)`:

```
model WorkOrderCompetencyRule {              // S2
  id            String @id @default(cuid())
  name          String
  competencyTypeId String                    // qué competencia se exige
  mandatory     Boolean @default(true)       // exigida ⇒ su ausencia/vencimiento pone ROJO y bloquea confirmar
  // Aplicabilidad (todo vacío/null = aplica a todos) — MISMO shape que checklists:
  appliesToTypeIds String[] @default([])     // WorkOrderType.id
  minCriticality   Int?
  specialtyId      String?
  requiresPtw      Boolean?
  appliesToRosterRoleId String?              // exigir SOLO a cierto rol (ej. sólo al entrant) — traza OSHA
  active Boolean @default(true)  sortOrder Int @default(0)
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  deletedAt DateTime?
  competencyType CompetencyType @relation(fields: [competencyTypeId], references: [id], onDelete: Restrict)
  @@index([competencyTypeId]) @@index([active])
}
```
Gate del catálogo (reglas/tipos/roles): **`workordercatalog:manage`** (es otro catálogo, como Tipos/Especialidades).

---

## 6. Control de la dotación en la aprobación (Gobierno 2 — espejo EXACTO)

Traza: SAP WCM *Person Responsible confirms*; OSHA *entry supervisor signs to authorize*; §11.5 Gobierno 2 del
diseño OT (el aprobador valida que el **set correcto y completo** se seleccionó para ESTE trabajo).

### 6.1 Mecánica (mirror de `confirmExecutionSet`/`clearExecutionConfirmation`/`assertExecutionSetConfirmed`)

- **`confirmRoster(userId, workOrderId, {signature}, ctx)`** — el aprobador ve la dotación con **semáforo por
  persona**, la **cura** (agrega/quita), y **confirma/sella** → `rosterConfirmedAt/ById`. **Firmado (Part 11)**
  vía `ReauthService.verifyForSignature` (meaning: *"Autorización de dotación / entry authorization"* — traza
  OSHA (e)(2) firma del supervisor de entrada + HSG250 e-firma segura). Evento `ROSTER_CONFIRMED`.
- **`clearRosterConfirmation(workOrderId, actorId)`** — **auto-limpieza al curar**: agregar/quitar una persona
  tras confirmar invalida la confirmación (`rosterConfirmedAt = null`) + evento `ROSTER_CHANGED`. Idéntico a la
  auto-limpieza del set de ejecución. Garantiza "lo que entra = lo autorizado".
- **`assertRosterConfirmed(workOrderId)`** — **GATE**: si la OT tiene dotación (roster con ≥1 persona **y**
  `type.rosterEnabled`) y **no** está confirmada ⇒ bloquea la transición de **autorización del permiso**.
  Se invoca en `transition()` en el **mismo punto** que `assertExecutionSetConfirmed` (al entrar al
  `checklistGateStateKey`, `work-orders.service.ts:361`). Sin dotación ⇒ no exige nada (retrocompatible).

### 6.2 Bloqueos EXPLICADOS (qué le falta a quién)

`confirmRoster` recolecta las causas rojas (§7) y, si hay, **explica**: p.ej. *"Juan Pérez (contratista ACME):
certificación 'Trabajo en altura' vencida el 12-05-2026"*. Mensajes en español, jerga interna jamás visible.
**Completitud de roles [S2, config]:** una regla puede exigir "≥1 supervisor de entrada" / "≥1 vigía" (traza
OSHA permiso confinado) — su ausencia bloquea confirmar.

### 6.3 Override GOBERNADO con firma (no un botón de pánico)

Si el aprobador decide autorizar **pese a un rojo** (riesgo aceptado, excepción documentada), **no** se salta:
debe registrar **motivo por persona** (`WorkOrderWorker.overrideReason`) + **firmar** (Part 11,
`overrideSignatureId`) → evento `WORKER_OVERRIDE` + `AuditLog` (antes/después). Traza: mismo gobierno que las
transiciones firmadas; nada se "traga". **En S1** (sin competencias/veto todavía) el único gobierno es la
**firma de la confirmación** (la dotación se sella firmada); los overrides **por persona** llegan con las causas
rojas en **S2/S3**.

---

## 7. Semáforo por persona (derivado en vivo) + estados

Función **PURA** en `packages/contracts/src/work-orders/roster.ts` (espejo de los helpers de S6), evaluada al
leer (no almacenada, evita staleness):

```
evaluateWorkerStatus(ctx) → { level: 'ok'|'warning'|'blocked', reasons: WorkerBlockReason[] }
```
- `ok` (verde): todo vigente/autorizado.
- `warning` (ámbar): competencia **por vencer** (≤ N días) o acreditación de empresa **por vencer**.
- `blocked` (rojo): OR de las 4 causas — `COMPETENCY_MISSING` / `COMPETENCY_EXPIRED` [Eje A] ·
  `NOT_AUTHORIZED` / `RESTRICTION_ACTIVE` [Eje B] · `COMPANY_NOT_ACCREDITED` [empresa].

**En S1** la función existe pero solo evalúa presencia/rol (todo `ok` salvo rol faltante si se configura); las
causas rojas se activan en S2 (competencia/veto) y S3 (acreditación). Firma de contrato estable desde S1.

---

## 8. ABAC · auditoría · Part 11

- **ABAC:** el roster se acota por `WorkOrder.orgNodeId` (∩ estructura activa) vía `ScopeService` — igual que
  el resto de la OT. Catálogos `Person`/`ContractorCompany`/`CompetencyType`/`RosterRole` = **compartidos**
  (como Especialidades/Tipos), gobernados por permiso de catálogo.
- **Auditoría inmutable:** toda mutación (`worker.added`/`worker.removed`/`roster.confirmed`/`worker.override`)
  → `AuditLog` (actor, antes/después) + `WorkOrderEvent` (timeline). Sin borrado físico (`removedAt`/`deletedAt`).
- **Part 11:** `confirmRoster` firmado; `overrideSignatureId` en cada excepción. Reusa `ReauthService` +
  `LogEntrySignature` (ref. blanda).

---

## 9. Vencimientos (Bloque N) [S2/S3]

Clon de `WorkOrderSlaService.findBreaches()` → `WorkerComplianceService.findBreaches()` barrido por
`NotificationWorkerService.sweep()`; casos nuevos en `NotificationResolverService`:
- `worker.competency.expiring` (N días antes de `expiresAt`) · `worker.competency.expired`.
- `contractor.accreditation.expiring` · `contractor.accreditation.expired`.
Destinatarios: responsable de la OT / rol responsable / (futuro) la persona. Traza: ISN "tracks all training
expirations and sends notifications". `dedupeKey` por persona+competencia+día (patrón existente).

---

## 10. Permisos NUEVOS (RBAC — `group`/`dimension`, no "categorías")

| `key` | `dimension` | Propósito |
|---|---|---|
| `worker:manage` | ACTION | Administrar catálogo de **Personas** y **Empresas contratistas** (crear/editar). *(Traza Maximo: autorización se otorga en la app People.)* |
| `workorder:roster:manage` | ACTION | Agregar/quitar personas del roster de una OT. *(Espejo de `workorder:checklist:manage`; gobierna también `confirmRoster`.)* |
| `workordercatalog:manage` | ACTION | **REUSA** (existe): reglas de competencia, `RosterRole`, `CompetencyType`. |
| `workorder:transition` | WORKFLOW | **REUSA** (existe): quién autoriza el permiso (dato por transición). |

**Sin permisos de "gate" fijos** (misma objeción W2 del diseño OT: la autorización por transición ya es dato).
**Gotcha dev:** permiso nuevo ⇒ `pnpm db:seed` + Redis `FLUSHALL` o el admin demo da 403.

---

## 11. UX (propuesta — espera visto bueno antes de construir UI)

Mirar `prototipo.tsx` antes de construir. Tokens del DS siempre (claro **y** oscuro), nunca hex con fallback.

- **Pestaña "Dotación"** en la Object Page de la OT (coherente con Verificaciones/Plan), **visible solo si**
  `type.rosterEnabled`. Contenido:
  - Lista de personas con: nombre · empresa (propio/contratista) · **rol** (chip) · **semáforo** (verde/ámbar/
    rojo, ≥44px, alto contraste) · motivo del bloqueo legible.
  - **Agregar persona:** `Combobox`/`MultiSelect` de `packages/ui` — **buscable, con chips** (jamás `<select
    multiple>`). Elegir rol al agregar.
  - Botón **"Confirmar dotación"** (gate a autorizar) → modal de **firma Part 11**; si hay rojos, exige
    motivo+firma por persona (override). Estado "Confirmada por X el <fecha locale>" (lib/format.ts).
- **Catálogo "Personas"** (nueva pantalla admin, gate `worker:manage`): grilla con **filtros en una línea +
  paginación arriba/abajo** (convención). Alta de persona propia/contratista; alta de empresa contratista.
- **Semáforo legible de un vistazo**; bloqueos EXPLICADOS. Responsive de terreno.

---

## 12. Roadmap en SLICES (chicos, cerrables)

| Slice | Alcance | Entrega |
|---|---|---|
| **S1 (MVP)** | `Person` (≠User) + `ContractorCompany` + `RosterRole` (seed 3 OSHA, configurable) + `WorkOrderWorker` (roster con rol) + `WorkOrderType.rosterEnabled` + **confirmación firmada** de la dotación (Gobierno 2: `confirmRoster`/`clearRosterConfirmation`/`assertRosterConfirmed`, gate en autorización) + permisos `worker:manage`/`workorder:roster:manage` + web (catálogo Personas + pestaña Dotación + confirmar). **SIN competencias/vigencias.** | Permiso lista personas por rol (OSHA (f)) + aprobador confirma/firma la dotación (OSHA (e)(2)). |
| **S2** | `CompetencyType` + `PersonCompetency` (vigencia + evidencia) + `WorkOrderCompetencyRule` + `applicableCompetencyRules` + `PersonRestriction` + **semáforo con causas rojas** (Ejes A/B) + gate/override por persona + avisos de vencimiento (Bloque N). | Verificación de competencia en la aprobación (ISO 45001 §7.2). |
| **S3 ✅** (`feat/dotacion-acreditacion-s3`, 2026-07-03) | Acreditación de contratistas: **gate** por `accreditationStatus`/`accreditedUntil` (empresa), activado por **toggle por tipo** `WorkOrderType.requireCompanyAccreditation` (default false = informativa) + reason ámbar nuevo `COMPANY_ACCREDITATION_CONDITIONAL` + avisos `contractor.accreditation.expiring/.expired` (Bloque N) + UI de acreditación (CompanyModal completo + badge + toggle). Override firmado por persona REUSADO. Ventana 90 d (ISN). | Prequalification empresa (ISN/Avetta/Veriforce, Ley 16.744 66bis/183-C). |
| **S4** | Integración control de acceso / T&A **detrás de interfaz abstracta** (on-prem): sincronizar `badgeId`/presencia. **En esta sesión solo se esboza la interfaz**, no se implementa. | Torniquetes/credencial (fuera de alcance de S1–S3). |

### 12.1 Elementos estándar NO omitidos (contemplados aunque construidos después)

| Elemento estándar | Fuente | Dónde queda | Slice |
|---|---|---|---|
| Vigía (attendant) / supervisor de entrada / ejecutante | OSHA 1910.146 | `RosterRole` seed (configurable) | **S1** |
| Firma del supervisor de entrada que autoriza | OSHA (e)(2) | `confirmRoster` firmado (Part 11) | **S1** |
| Verificación de competencia en la aprobación | ISO 45001 §7.2; Maximo | `PersonCompetency` + semáforo + gate | S2 |
| Vencimiento de certificación + aviso | Maximo/SAP/ISN | vigencia derivada + Bloque N | S2 |
| Veto/restricción (no autorizado) | OSHA authorized; Maximo | `PersonRestriction` | S2 |
| Acreditación de contratista (empresa + empleado) | ISN/Avetta/Veriforce; Ley 16.744 | `ContractorCompany` (empresa) + `PersonCompetency` (empleado) | empresa base S1 / gate S3 |
| Inducción / ODI / examen preocupacional | DS 44 art.15; Ley 16.744 art.71; DS 132 | `CompetencyType.category` INDUCTION/MEDICAL_EXAM | S2 |
| Registro de contratistas | Cód. Trabajo 183-C | `ContractorCompany` catálogo | S1 |
| Control de acceso / credencial | práctica industrial | interfaz abstracta esbozada | S4 |

---

## 13. Decisiones abiertas (FORKS) — recomendación fundada, espera OK

| # | Fork | Recomendación | Fundamento |
|---|---|---|---|
| **D1** | `Person` **catálogo global compartido** vs con ABAC por estructura | **Global compartido** (ABAC en el roster vía OT.orgNodeId) | Maximo Person es global; contratistas cruzan estructuras; coherente con Especialidades/Tipos. |
| **D2** | Activación: `WorkOrderType.rosterEnabled` (toggle por tipo) vs regla de aplicabilidad | **Toggle por tipo en S1**; reglas data-driven para el *contenido* (competencias) en S2 | El dueño pidió "por tipo"; mantiene S1 simple, honesto y sin regresión. |
| **D3** | `confirmRoster` **firmado (Part 11)** en S1 vs sellado sin firma (como executionSet) | **Firmado** | Traza dura OSHA (e)(2): la autorización de entrada del supervisor **es** una firma; HSG250 exige e-firma segura. Da gobierno real en S1. |
| **D4** | `WorkOrderWorker` unique por `(WO,persona)` vs `(WO,persona,rol)` | **`(WO,persona,rol)`** (permite multi-rol) | OSHA: el entry supervisor puede además ser attendant/entrant si está capacitado. |
| **D5** | S1 incluye **override por persona** vs solo firma de confirmación | **Solo firma de confirmación en S1**; override por persona en S2 | En S1 no hay causas rojas (sin competencias/veto); el override necesita algo que overridear. Se evita construir gobierno sin sujeto. |
| **D6** | Nombre del catálogo: **"Personas"/"Dotación"** vs "Trabajadores" | **"Personas"** (catálogo) + **"Dotación"** (en la OT) | Vocabulario claro, no jerga; "dotación" es el término chileno de campo. |
| **D7** | Reusar `Specialty` como disciplina de la persona vs `jobTitle` libre | **`jobTitle` libre en S1**; ligar `Specialty` si se pide | Evita acoplar el catálogo de personas a Work Center antes de un caso real. |

---

## 14. Criterios de aceptación del diseño

- ✅ Verificado: **no existe** ninguna entidad de personas/contratistas/competencias hoy (§1).
- ✅ Cada entidad/campo/rol/estado **trazado** a estándar citado (§2, §4, §12.1). Sin invento; lo no respaldado
  marcado `[SUPOSICIÓN A VALIDAR]` (credencial de acceso; formato preocupacional).
- ✅ **Vocabulario estándar** (authorized entrant/attendant-vigía/entry supervisor; competency; acreditación).
- ✅ **Tres sentidos de autorización** separados; **dos ejes** (competencia vs autorización) sin colapsar (§3).
- ✅ **Reusa motores** (Gobierno 2, aplicabilidad data-driven, ScopeService, WorkOrderEvent, ReauthService,
  Bloque N, semáforos) — nada duplicado.
- ✅ **Optativo/configurable**: sin `rosterEnabled` ⇒ cero fricción.
- ✅ **Elementos estándar no omitidos**; lo diferido, enumerado con su porqué (§12).

> **Próximo paso:** requiere tu **visto bueno** de los forks D1–D7 y del alcance de **S1**. Al aprobar:
> decisiones → `DECISIONS.md`, roadmap → `BACKLOG.md`, y arranca **S1** (rama `feat/dotacion-permiso-s1`).
