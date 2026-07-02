# Registro de decisiones — Lyra WatchLog

Formato: fecha · decisión · motivo. Las más recientes arriba.

---

### 2026-07-02 · OT — UX: el detalle pasa de DRAWER lateral a PÁGINA dedicada (Object Page)
El dueño observó que el **drawer lateral** (680px) comprime la OT justo cuando más espacio necesita (objeto denso: 4 puertas
+ folio + checklists + plan + baseline + firmas + timeline). *Decisión (con su visto bueno, 2 opciones):* reemplazar el
drawer por una **página de detalle dedicada** con ruta propia `/ordenes-trabajo/:id` (**deep-linkable**), estándar
**SAP Fiori Object Page / IBM Maximo Work Order** para objetos de trabajo densos. Layout: cabecera con folio+estado+
**CTA primario de etapa** (la transición de AVANCE destacada; las secundarias —devolver/reabrir/rechazar— discretas) +
stepper del flujo + **cuerpo a 2 columnas** (pestañas Resumen/Plan/Permiso/Actividad a todo el ancho + panel lateral de
estado/responsable/prioridad/metadatos). Responsive: el panel baja debajo en pantallas angostas (tablet/terreno).
`WorkOrderDetailDrawer` **eliminado**; `WorkOrderDetailPage` nueva; la lista navega con `useNavigate` (fila → detalle) y
el alta redirige al detalle. `WorkOrderPlanBlock`/`WorkOrderChecklistsBlock`/`TransitionModal` se **reutilizan tal cual**.
**Alcance (decisión del dueño):** **solo OT ahora**; **Incidencias usa el mismo drawer** → alinear al Object Page queda
como **deuda en BACKLOG** (slice aparte, para no tocar dos módulos a la vez). typecheck/lint(0 err)/build web verdes.

---

### 2026-07-02 · OT — Sesión 4 (Puerta 3 · plan de actividades + congelar baseline + reorden del flujo)
Se dio vida a la fase Planificación (`feat/ot-puerta3`). Con visto bueno explícito del dueño (3 preguntas):
1. **REORDEN del flujo `ot-4-puertas` al estándar EAM** (§11.3): **planificar → autorizar el permiso → ejecutar**
   (los peligros dependen de las tareas). Nuevo orden: `borrador → solicitada → aprobada → en_planificacion →
   plan_aprobado (P3, congela baseline) → en_preparacion → checklists_ok (P2, permiso) → en_ejecucion →
   en_revision_cierre → cerrada`. **Solo cambian `from/to/order`**; se conservan las claves de estado y de
   transición (y sus guards data-driven). El flujo es DATO versionado e **INMUTABLE**: el seed ahora detecta el
   cambio (firma de contenido) y **republica una versión NUEVA** (`v2`), repuntando `currentVersionId` — los OT en
   curso conservan su versión CONGELADA (no se rompen). El estado `checklists_ok` se renombró a "Permiso autorizado"
   (display). En la UI se muestran NOMBRES de etapa, no "Puerta N" (cronológicamente P3 va antes que P2, pero el
   usuario no ve numeración).
2. **`WorkActivity` = entidad PROPIA** (fork W1), shape de §2.5. **NO** se construyó `WorkActivityUpdate` (avance
   append-only) — difiere a S5 por acotación del prompt. Incluye columnas reservadas (estimatedHours/actualHours S8,
   evidence, dependsOnId para ruta crítica S8 = solo la columna). Migración `20260702180000_add_work_order_activities`
   vía `migrate diff` + `db:deploy` (drift ajeno descartado, patrón S1). + `WorkOrder.planFrozenAt/planFrozenById`.
3. **Puerta 3 exige ≥1 actividad** para `autorizar_plan` (decisión del dueño: un plan sin tareas no es un plan;
   estándar SAP PM/Maximo ≥1 operación). Guard puro `planReadyToFreeze`. Al autorizar se **CONGELA la baseline**
   (copia `planned* → baseline*` de cada actividad no cancelada, dentro de la MISMA tx de la transición, idempotente)
   + `planFrozenAt` + evento `PLAN_FROZEN`. El plan queda **inmutable** tras congelar (crear/editar/reordenar/eliminar
   → 400).
4. **Semántica data-driven** (paridad `folioOnStateKey`/`checklistGateStateKey`): 2 claves nuevas en `WorkOrderType`
   — `planFreezeStateKey` (def. `plan_aprobado`, dispara el congelamiento) y `executeStateKey` (def. `en_ejecucion`,
   dispara el guard "no ejecuta sin plan"). Editor UI de estas claves = diferido con el resto (deuda S2/S3).
5. **Guards PUROS en contracts** (`activities.ts`, espejo de `blockingChecklistsForClose`): `planNotFrozen(wo)`,
   `blockingActivitiesForClose(activities)` (mandatory abierta), `planReadyToFreeze`, `summarizeActivities`,
   `activityEndDeviationDays`. `planNotFrozen` se cablea al ENTRAR a `executeStateKey`; `blockingActivitiesForClose`
   se cablea al CERRAR (becomesFinal && approvedAt) — Puerta 4 de actividades ya viva (S5 sumará el checklist de
   CIERRE). **Nota:** en el flujo estándar `en_ejecucion` sólo se alcanza tras `plan_aprobado`, así que el guard
   `planNotFrozen` es DEFENSA (contra un flujo mal configurado); el gate operativo real de "sin plan no se avanza" es
   `autorizar_plan` (≥1 actividad). Ambos con test unitario en `activities.spec.ts` (8).
6. **Permiso NUEVO `workorder:activity:manage`** (dim. ACTION, grupo workorders; catálogo 101→**102**; db:seed +
   FLUSHALL). Listar el plan = `workorder:view`; gestionarlo/generarlo = el permiso nuevo.
7. **UX (visto bueno del dueño):** pestaña **"Plan"** en el drawer con DOS formas: (a) **grilla** (secuencia/responsable/
   especialidad/fechas/estado, reordenar ▲▼, editar, eliminar, desviación plan-vs-baseline con chips +Xd tras congelar);
   (b) **asistente guiado** (`Stepper` de packages/ui, 4 pasos: Tareas → Equipo → Fechas → Orden/revisar) con defaults
   inteligentes (responsable/fechas desde la OT) que genera las filas en lote (`POST :id/activities/batch`). Cuando la
   OT no tiene actividades, arranca el asistente (decisión del dueño). Banner de etapa que EXPLICA la próxima acción y
   los bloqueos. La autorización del plan (transición firmada opcional) sigue el patrón único de transiciones (Resumen).
Verde: typecheck/lint/build + test (contracts **421** incl. activities 8 · api 252 · web 6) + `smoke-workorders.py`
**78/78** (pipeline planificar→autorizar_plan[baseline==planned]→plan inmutable→preparar→checklists→ejecutar + guards
+ gates 403) + regresión incidencias 32/32. **Diferido a S5:** checklists de EJECUCIÓN/CIERRE por actividad, eje
`momento`, confirmación del set de ejecución en Puerta 2 (§11.5 Gob. 2), `WorkActivityUpdate`.

---

### 2026-07-02 · OT — Realineación PTW al estándar: el PERMISO tiene 3 momentos (no uno)
El dueño cuestionó (con razón) que la Puerta 2 pidiera "aplicar el bloqueo / verificar energía cero" durante la
**preparación**, cuando el bloqueo de energías (LOTO) se aplica **físicamente en terreno al momento de ejecutar**, no en la
oficina días antes. *Diagnóstico:* el MECANISMO de S3 (checklists configurables sobre el Form Builder + guard de puerta +
segregación) es correcto y estándar, pero conflaba **dos momentos distintos** del Permiso de Trabajo. **Modelo fiel al
estándar (PTW / ISO 45001 / DS 132 / LOTO OSHA 1910.147), acordado:** el permiso tiene **3 momentos** a lo largo de la OT:
1. **Autorizar el permiso** (documental, ANTES de ejecutar) = **Puerta 2**: peligros identificados, plan de aislación,
   personal competente, coordinación con Operaciones. *(Es lo que S3 ya hace; solo estaba mal REDACTADA la plantilla.)*
2. **Aplicar/aceptar controles en terreno** (físico, AL EJECUTAR, **por actividad**): poner candados/tarjetas, verificar
   energía cero, LMRA/toma-5. → **S4/S5, ligado a `WorkActivity`** (checklists de EJECUCIÓN, aún no construidos).
3. **Cerrar el permiso** (retirar controles, reenergizar, sitio seguro) → **Puerta 4 / S5** (checklist de cierre).
**Orden correcto del flujo:** **planificar → autorizar el permiso → ejecutar** (los peligros dependen de las tareas). El
flujo sembrado hoy pone checklists ANTES de planificar (al revés); como el flujo es DATO, se **reordena en S4** (cuando
exista la planificación de actividades), no ahora, para no dejar estados a medio construir ni romper S3.
**Hecho ahora (seguro, sin tocar el flujo):** se REDACTÓ la plantilla de demo en modo AUTORIZACIÓN
("Permiso de Trabajo — Aislación de energías (LOTO)": ¿fuentes identificadas? ¿procedimiento de bloqueo definido?
¿personal competente? ¿coordinado con Operaciones?) y se **retiró el demo legado** (regla desactivada + plantilla
ARCHIVED, sin borrar por si hay una OT en curso que la referencia; `LEGACY_CHECKLIST_*` en `work-orders-seed-data.ts`).
smoke 65/65. **S4 incorporará:** reordenar el flujo (planificación antes del permiso) + `WorkActivity` + **checklists de
EJECUCIÓN por actividad**; **S5:** checklist de **cierre** del permiso. *(Principio del dueño: implementar el estándar de
la industria, sin engendros.)*
**Ampliación consolidada (misma fecha, tras conversación con el dueño) → ver `docs/design/OT_DESIGN_ARCHITECTURE.md §11`
(FUENTE DE VERDAD para S4–S5):** (1) el motor de checklists es **genérico**, NO PTW — cubre calidad/ITP, GMP/Part 11,
readiness/PSSR, rondas, SOP, cierre (§11.1); (2) se agrega el **eje `momento`** (REQUEST/PLANNING/AUTHORIZATION/EXECUTION/
CLOSURE) a las reglas, mapeado a estados por dato (§11.2); (3) **orden correcto planificar→autorizar→ejecutar**, se reordena
el flujo en S4 (§11.3); (4) **hueco detectado por el dueño**: el aprobador no ve los checklists de ejecución → en Puerta 2
debe **ver y confirmar (solo lectura) el set de ejecución** que se exigirá (Gobierno 2), separado de la **gobernanza del
instrumento** a nivel de plantilla/HSE (Gobierno 1) (§11.5); (5) "exigir o no" = 3 niveles: flujo (¿hay puerta?) + regla
(`mandatory` + aplicabilidad) + manual siempre opcional (§11.6); (6) patrones avanzados (puntos de espera de calidad, doble
inspección/RII aviación, requisitos condicionales) **diferidos** hasta caso real (§11.7).

---

### 2026-07-02 · OT — FIX: folio de OT = serie ÚNICA GLOBAL (corrige colisión entre tipos)
El bug de folio cross-tipo detectado al cerrar S3 (ver abajo, decisión #6) se **corrigió el mismo día** porque bloqueaba
al dueño (aprobar una 2.ª OT de otro tipo → Internal Error 500). *Decisión:* el default de `folioScheme` pasa de
**scope `type`** a **scope `global`** (`DEFAULT_WORK_ORDER_FOLIO_SCHEME` en `packages/contracts/src/work-orders/folio.ts`).
*Motivo:* el folio renderizado (`OT-2026-0001`) NO incluye el tipo y `WorkOrder.folio` es único GLOBAL; con contador por
tipo, dos tipos distintos generaban el mismo string y colisionaban. `global` = **una sola serie anual de número de OT**
(estándar SAP PM / Maximo: un único rango de WO number), siempre única, conservando EXACTO el formato `OT-2026-0001`
aprobado. Si un cliente quiere serie por tipo, usa una `mask` con el tipo en el `folioScheme` del `WorkOrderType`. Se
agregó **reconciliación idempotente** en `seed.ts` (`reconcileWorkOrderFolioCounters`): fija `workorder|global|<año>` al
mayor número de folio ya emitido ese año, para no re-emitir un folio existente (los OT de QA `OT-2026-0001`/`0002` quedan
intactos; el siguiente correlativo es `0003`). Esto **reinterpreta** el literal de W4 ("por tipo"), que era
auto-contradictorio con el string sin tipo — es el tipo de corrección con fundamento que el dueño pide. `folio.spec.ts`
actualizado (default global + caso type opt-in); contracts **413**, smoke-workorders **65/65** (el smoke usa
`folioScheme {prefix:"OTSMK", scope:"type"}` para aislar su serie), aprobación real verificada (`OT-2026-0003`).

---

### 2026-07-02 · OT — Sesión 3 (Puerta 2 · checklists / PTW): decisiones de implementación
Al dar vida a la fase Preparación (`feat/ot-puerta2`: reglas + checklists + instanciación LogEntry + guard) se tomaron
las siguientes decisiones no explícitas en el diseño (§2.4 / fork W5):
1. **Claves de estado de checklist DATA-DRIVEN en `WorkOrderType`** (`checklistSuggestStateKey` ≈ `en_preparacion`,
   `checklistGateStateKey` ≈ `checklists_ok`), con defaults por CONSTANTE en contracts. *Motivo:* paridad con la
   decisión S2 de `folioOnStateKey` — así "qué estado sugiere" y "qué estado es la Puerta 2" son DATO, no claves en duro;
   un cliente que reduzca el flujo apunta esas claves donde corresponda. El ejecutor `transition()` corre el guard cuando
   `toState.key === checklistGateStateKey` (espejo de `assertNoBlockingActions` de Incidencias) y la sugerencia cuando
   `toState.key === checklistSuggestStateKey`. Editor UI de esas claves = diferido junto al de `folioScheme` (deuda S2).
2. **La sugerencia se materializa al ENTRAR a preparación** (no al aprobar). *Motivo:* los checklists son de la fase
   Preparación; materializar al aprobar los mostraría antes de tiempo. Es **idempotente** (@@unique OT×plantilla +
   chequeo previo, espejo de `materializeForIncident`) y hay endpoint de re-derivación manual (`/checklists/suggest`).
3. **`Template.purpose` (fork W5) DIFERIDO.** El marcador opcional null|CHECKLIST era SOLO filtro UX del picker. *Motivo:*
   aditivo pero inerte sin su propia UI en el Form Builder ("no construir lo que no se usa"). El picker de reglas ofrece
   **todas las plantillas PUBLICADAS**. Registrado en BACKLOG para cuando el catálogo crezca.
4. **Instanciación = `LogEntry` real vía `LogEntriesService.create`** (no una copia del motor). El checklist se llena y
   **sella** con el flujo existente del Form Builder; "enviar a revisión" exige el LogEntry `SUBMITTED` (sellado). No se
   propaga el equipo de la OT al LogEntry (el nodo carga el ABAC; la plantilla de checklist se siembra `equipmentMode NONE`).
   Re-instanciar un checklist RECHAZADO abre un LogEntry nuevo (recuperación).
5. **Segregación de funciones en la revisión** (revisor ≠ responsable) se aplica en el backend (403), NO como permiso
   separado. *Motivo:* el diseño §5 sólo define `workorder:checklist:manage`; un 2.º permiso de "revisar" contradiría el
   alcance aprobado. La segregación por identidad (responsibleId ≠ userId) es suficiente y auditable.
6. **🔴 BUG descubierto (defecto de S2): el folio de OT colisiona entre TIPOS.** `folioScheme` default scope `type`
   (contador por tipo) + `renderFolio` sin el tipo en el string (`OT-2026-0001`) + `WorkOrder.folio` @unique GLOBAL ⇒ la
   2.ª OT-tipo que apruebe choca (500). Es un defecto de uso normal (>1 tipo). NO se corrige en S3 (toca el default
   aprobado W4 + datos existentes ⇒ necesita tu visto bueno + migración). Recomendación: default scope **`global`** (una
   serie anual, estándar SAP/Maximo, folio EXACTO `OT-2026-0001` global-único). El smoke de OT usa prefijo propio `OTSMK`
   para no chocar con datos reales. Registrado en BACKLOG §2.
Verde (typecheck/lint/build/test) + contracts **412** (incl. `checklists.spec.ts` 9) + `smoke-workorders.py` **65/65**
(ciclo: sugerencia auto → gate bloqueado 400 → instanciar LogEntry → sellar → enviar a revisión → segregación 403 →
aprobar → `revisar_checklists` OK; + gates 403) + regresión incidencias 32/32.

---

### 2026-07-01 · OT — Sesión 2 (Puerta 1): decisiones de implementación
Al dar vida al ciclo de la solicitud (`feat/ot-puerta1`: workflow congelado + ejecutor + `FolioCounter` + firma) se
tomaron 6 decisiones no explícitas en el diseño:
1. **Firma Part 11 = ESPEJO EXACTO de Incidencias (re-auth exigida y verificada; SIN registro criptográfico aún).**
   `ReauthService.verifyForSignature` gatea la transición ANTES de mutar (§11.200), pero NO se crea la fila
   `LogEntrySignature` (el `payloadHash`). *Motivo:* Incidencias —el módulo hermano— tiene exactamente esa deuda; crear
   el registro solo para OT rompería la paridad y duplicaría el trabajo cuando se cierre la deuda PARA AMBOS.
   `WorkOrderTransition.signatureId` queda como ref. blanda lista (columna ya creada). La deuda "payloadHash de firmas
   de transición (Incidencias + OT)" queda en BACKLOG.
2. **Aprobación/rechazo/cierre = semántica DATA-DRIVEN, sin claves de estado en duro.** Aprobación = ENTRAR al estado
   `WorkOrderType.folioOnStateKey` (default `"aprobada"`, constante compartida en contracts) — ahí se fijan
   `approvedAt/approvedById` y se emite el folio (si aún no existe). Rechazo = llegar a un estado FINAL **sin haber sido
   aprobada nunca** ⇒ motivo OBLIGATORIO (400 si falta), `rejectedAt/rejectReason`, lifecycle `CANCELED` (la solicitud
   murió sin ser trabajo). Estado final TRAS la aprobación = cierre (`closedAt`, `CLOSED`). *Motivo:* funciona con
   cualquier flujo que arme el admin (1 puerta o 4) sin comparar contra claves "rechazada"/"cerrada" hardcodeadas.
   `deriveWorkOrderLifecycle` (contracts) codifica la regla; `availableTransitions[].requiresReason` la expone a la UI.
3. **La ANULACIÓN no es un estado del flujo sembrado** (el diseño §3 dibujaba `cancelada` con "cancelar desde casi
   cualquier estado"). *Motivo:* el motor exige `fromStateId` por transición (habría que sembrar N transiciones), e
   Incidencias ya modela anular como ACCIÓN transversal auditada (`POST :id/cancel` + lifecycle `CANCELED` + motivo)
   desde cualquier estado. Paridad > literalidad del diagrama. El flujo sembrado queda con 11 estados.
4. **`FolioCounter.sequenceKey` es la PK (sin `id cuid`).** *Motivo:* la asignación atómica es un `INSERT … ON CONFLICT
   … RETURNING` CRUDO y el default `cuid()` de Prisma se genera en el CLIENTE (no existe en la DDL) — un upsert SQL no
   puede poblarlo. Para una tabla-contador, la clave natural ES la identidad. `FolioService.next(tx, key, start)` recibe
   la transacción del LLAMADOR: si la transición hace rollback, el correlativo no se quema (gapless de verdad). El año
   del reinicio anual se calcula con `PLANT_TIME_ZONE` (misma decisión que el dashboard).
5. **`folioSchemeSchema` sin `.default()` de Zod** — campos opcionales + `resolveFolioScheme()` aplica los defaults
   (prefix OT · padding 4 · scope type · reset annual). *Motivo:* gotcha conocido TS2719 (los `.default()` en schemas
   embebidos en DTOs rompen la web). `folioScheme`/`folioOnStateKey` son configurables por API desde ya; el **editor UI
   en el mantenedor de tipos queda como deuda** (BACKLOG) — el default OT cubre el caso de uso aprobado (W4).
6. **La grilla de OT deja de filtrar "Abiertas" por defecto** (pasa a "Todos los estados"). *Motivo:* desde S2 la
   solicitud NACE en `borrador` (DRAFT); con el filtro anterior, lo recién creado desaparecía de la vista.
Verde + `smoke-workorders.py` **51/51** (ciclo enviar→aprobar[folio OT-2026-0001+firma]/rechazar[motivo]→gapless 0002 +
gates) + regresión incidencias 32/32.

---

### 2026-07-01 · OT — Se ELIMINA el catálogo `Area` (alineación con EAM líderes)
Tras revisar cómo lo modelan los grandes (SAP PM, IBM Maximo, Infor EAM), se **elimina** el catálogo plano `Area`
(tabla + `WorkOrderArea` + relación + seed + UI + filtros + contrato), introducido horas antes en el anexo de S1.
**Motivo:** en los EAM líderes **NO existe un catálogo "Área" separado**; la "área/zona" (Chancado, Molienda…) **ES la
jerarquía de ubicación** (SAP *Functional Location* / Maximo *Location*), que en Lyra es el **`OrgNode`** (la estructura
tiene un nivel que puede llamarse "Área"). Mi seed inicial sembró `Area` con zonas de planta → **duplicaba la jerarquía y
confundía** (lo notó el dueño). El mapeo correcto y definitivo: **ubicación = `OrgNode` · disciplina/oficio = `Specialty`
(= SAP *Work Center* / Maximo *Craft*) · tipo = `WorkOrderType` (= *Order/Work Type*)**. La agrupación transversal de
responsabilidad que sí tienen los grandes (*Planner Group* / *Work Group*) **NO se llama "Área"** y **se DIFIERE a S6–S8**
(cuando exista enrutamiento/aprobadores), y allí irá **fuera del formulario del solicitante** (la fija el planificador),
para no complicar el registro en terreno. Migración `20260701190000_drop_work_order_area` (drop guardado; nada real la
referenciaba). Verde + `smoke-workorders.py` 32/32. **Principio reforzado por el dueño: no construir cosas que luego haya
que deshacer — decidir bien de una.**

---

### 2026-07-01 · OT — Sesión 1 (Cimientos): decisiones de implementación
Al construir el esqueleto de OT (`feat/ot-cimientos`, espejo de Incidencias) se tomaron 4 decisiones no explícitas en
el diseño:
1. **`WorkOrder.number` (autoincrement) NUEVO además del `folio`.** *Motivo:* el diseño emite el `folio` oficial SOLO al
   aprobar (S2), pero una solicitud necesita un **handle humano estable desde que nace** (para la grilla, búsqueda,
   soporte). Se deriva **"SOL-######"** del `number` (mismo patrón que `Incident.number`); el `folio` gapless (OT-2026-0001)
   sigue siendo el correlativo oficial que se emite al aprobar. `workOrderCode(folio, number)` = folio ?? SOL-###### .
2. **La solicitud nace `lifecycle = OPEN`, no DRAFT.** *Motivo:* en S1 aún no existe el workflow (estado `borrador`), así
   que DRAFT no tendría forma de avanzar. Se reserva DRAFT para cuando el flujo configurable (S2) tenga su estado inicial
   `borrador`. Los KPIs ya contemplan ambos.
3. **SavedView de OT NO se cableó.** *Objeción fundada:* el enum `SAVED_VIEW_MODULES` solo tiene `LOGBOOK`; **Incidencias
   tampoco usa SavedView**. Construirlo solo para OT rompería la paridad con el módulo hermano y excede "cimientos". Queda
   como **slice transversal** (para OT e Incidencias a la vez) en `BACKLOG`. La grilla de S1 sí cumple las convenciones
   (filtros en 1 línea + facetas + paginación arriba/abajo).
4. **Campos de folio/workflow presentes pero INERTES desde S1.** *Motivo:* incluirlos en la migración inicial evita
   re-migrar `WorkOrder` en cada sesión (S2 solo agrega tablas satélite + `FolioCounter`, no columnas a `WorkOrder`).
   La migración se generó con `prisma migrate diff` + `db:deploy` (no `migrate dev`) por el EPERM de Windows, **descartando
   drift preexistente ajeno** (`LogEntry_currentStateSince_idx`, default de `OrgStructure.updatedAt`) para que la
   migración toque SOLO DDL de OT.

---

### 2026-07-01 · OT — Forks W1–W8 APROBADOS por el dueño (diseño congelado para la Sesión 1)
El dueño dio el **visto bueno explícito** al diseño de `docs/design/OT_DESIGN_ARCHITECTURE.md`. Decisiones DEFINITIVAS:
1. **W1** — `WorkActivity` = **entidad propia** (base conceptual `IncidentAction`, pero con `progressPct`/baseline/
   `dependsOnId`/HH). NO se fusiona con `IncidentAction`; solo se comparten **guards de cierre PUROS** en `packages/contracts`.
2. **W2** — **un único permiso `workorder:transition`** (dimensión WORKFLOW); QUIÉN ejecuta cada puerta = **DATO**
   (`WorkflowTransitionRole`). NO se crean 4 permisos fijos de puerta (contradiría el motor de workflow configurable).
3. **W3** — catálogos `Area`/`Specialty` **separados** (N:N con la OT); `orgNodeId` sigue siendo ubicación + ancla ABAC.
4. **W4** — se **construye `FolioCounter`** (gapless, atómico `ON CONFLICT … RETURNING`); default OT = **scope por-tipo +
   reinicio anual** (`OT-2026-0001`), configurable vía `WorkOrderType.folioScheme`; emisión en la transición cuyo
   `toStateKey == WorkOrderType.folioOnStateKey` (default `aprobada`), dentro de la tx. Motor reutilizable (sirve al
   folio-por-plantilla del dueño, BACKLOG 2026-06-30).
5. **W5** — checklists = `Template` normal + marcador **opcional** `Template.purpose` (null|CHECKLIST) solo como filtro UX.
6. **W6** — se **siembra** el flujo "OT — 4 puertas PTW" (dato clonable/simplificable a 1 puerta).
7. **W7** — **paridad UI con Incidencias** (lista + kanban + facetas + `SavedView module:"work-orders"` + peek).
8. **W8** — OT nace **directo desde la incidencia** (`originIncidentId`, enlace bidireccional); la CAPA liviana
   (`IncidentAction`) se queda en la incidencia.
**Deuda aceptada:** extraer `WorkflowExecutorService` compartido (LogEntry/Incident/WorkOrder) = sesión dedicada con tests,
NO dentro de OT. **Siguiente = Sesión 1 (Cimientos), en sesión NUEVA.**

---

### 2026-07-01 · OT — Sesión 0: DISEÑO FORMAL entregado (anexo técnico), forks pendientes de OK
Se produjo `docs/design/OT_DESIGN_ARCHITECTURE.md` (diseño sin código; anexo de la propuesta comercial). Grounding
verificado contra el repo, con **correcciones al plan de arranque**: (a) el modelo es `WorkflowDefinitionVersion`, **no**
`WorkflowVersion`; (b) los permisos se catalogan por `group:string` + `dimension:MODULE|ACTION|WORKFLOW`, **NO** por
"categorías numéricas" (las "cat. 8x/9x" de docs/memoria son convención de *display*); (c) **`FolioCounter` NO existe** hoy
(los folios son `autoincrement()` global derivado) ⇒ el motor de folio gapless se **construye** (y de paso sirve al folio-
por-plantilla del dueño); (d) el `prototipo.tsx` **no** dibuja OT. Se dejan **8 forks (W1–W8) con recomendación fundada** a
la espera del visto bueno del dueño (destacan: W1 `WorkActivity` entidad propia — no fusionar con `IncidentAction`; W2 un
solo `workorder:transition` con roles-por-transición como DATO — no 4 permisos de puerta; W4 construir `FolioCounter` con
scope por-tipo + reinicio anual). **Las decisiones definitivas se consolidan aquí al aprobar los forks.** Plan S1–S8 (~397
HH) confirmado. Deuda registrada: extraer `WorkflowExecutorService` compartido (sesión aparte, no OT).

---

### 2026-07-01 · MÓDULO DE ÓRDENES DE TRABAJO (OT / PTW) — enfoque y fases (planificación)
Ante una **oportunidad real de cliente en minería**, se decide absorber con Lyra WatchLog el flujo Solicitud de
Trabajo → Orden de Trabajo con Permiso de Trabajo (PTW). Decisiones de enfoque (aprobadas antes del diseño detallado):
1. **Entidad NUEVA `WorkOrder`, espejo de `Incident` — NO meterlo en `LogEntry` ni en `Incident`.** *Motivo:* una OT
   tiene N checklists, N actividades y varias aprobaciones que exceden a un checklist (LogEntry) y a un evento HSE
   (Incident). El patrón de Incidencias ("entidad + workflow congelado + acciones + guards de cierre + dashboard") es el
   molde correcto; reusa ~70% de la maquinaria transversal (workflow, form builder, CAPA, Bloque N, dashboard, RBAC/
   ABAC, auditoría, firmas Part 11, `FolioCounter`).
2. **4 puertas de aprobación = ESTADOS+TRANSICIONES del motor de workflow CONFIGURABLE, no hardcodeadas.** *Motivo:* un
   cliente minero exigente usa las 4; una PYME, 1. Evita el "engendro ad-hoc": es el estándar de la propia plataforma.
3. **El folio (N° de requerimiento) se emite SOLO al aprobar la solicitud, nunca al crear.** *Motivo:* regla de negocio
   explícita del caso de uso; evita "basura digital"/duplicados. Reusa el diseño `FolioCounter` gapless (asignación al
   aprobar en vez de al sellar).
4. **Checklists = plantillas del Form Builder (NO entidad nueva).** *Motivo:* el motor de checklists ya existe; se
   conecta vía tabla enlace `WorkOrderChecklist` + reglas de aplicabilidad por tipo/criticidad/especialidad/riesgo
   (patrón `appliesToTypeIds` de reportabilidad). Config en 2 capas: diseño (Form Builder + regla) vs operación
   (sugerencia automática + selección manual en la OT).
5. **La OT nace de las mismas fuentes que una Incidencia (directa / regla en bitácora / excepción) + planificada, y una
   Incidencia puede GATILLAR una OT.** *Motivo:* coherencia enterprise (Maximo: incident→work order), sin inventar
   orígenes nuevos; la CAPA liviana sigue en la incidencia, el trabajo "pesado" se promueve a OT.
6. **Entitlements / activación de módulo por contrato = DIFERIDO al épico de licenciamiento (§2(1)).** *Motivo:* decisión
   explícita del dueño (2026-07-01): la capa que hace Incidencias/OT activables según lo licenciado (dos guardias en AND:
   licencia de instalación ∩ RBAC) se aborda junto con todo el licenciamiento Ed25519, no dentro de este épico. Hoy la
   visibilidad es solo RBAC (`module:workorders:view`). Diseño de referencia esbozado (ModuleRegistry + EntitlementService
   + `@RequireModule`), a construir después.
7. **Ejecución en sesiones chicas y cerrables (opción 2), NO 3 fases grandes.** *Motivo:* respeta el CLAUDE.md ("un
   objetivo por sesión, cerrar siempre") y evita llenar el contexto. Roadmap S0–S8 (~397 HH) en BACKLOG §2. Paquete
   comercial recomendado: MVP S1–S5 + control S6–S7; S8 opcional. Diseño formal detallado = Sesión 0.

---

### 2026-06-24 · TEMAS FASE 2A · Plantillas de inicio + Duplicar
Primera de tres fases enterprise sobre EST-TEMAS (2A plantillas+duplicar · 2B generador desde colores de marca con
OKLCH · 2C import DTCG/hex). Las 5 decisiones de diseño (aprobadas antes de construir), con motivo:
1. **Plantillas = CONSTANTES en `@lyra/contracts` (`theme/presets.ts`), NO filas de BD.** *Motivo:* una paleta es solo
   JSON de tokens ⇒ un catálogo de plantillas es barato como código: prístino, versionado con el release, sin migración
   ni seed. El backend NO necesita conocerlas (la creación ya valida tokens/whitelist). NO se seedean como `ThemePalette`,
   NO son editables ni publicables, y el usuario final NUNCA las ve: son solo el punto de arranque del admin.
2. **Duplicar = CLONADO EN CLIENTE (reusa `POST /theme/admin/palettes`), no endpoint dedicado.** *Motivo:* menos
   superficie de API y reusa la validación existente; clonar es una sola inserción ⇒ la atomicidad server-side no aporta.
   Tanto «desde plantilla» como «duplicar» leen tokens y crean una paleta NUEVA (borrador) con el flujo ya construido.
3. **Toda plantilla PASA contraste WCAG AA en claro Y oscuro, garantizado por un TEST.** *Motivo:* regresión — una
   plantilla nunca puede nacer inaccesible. `presets.spec.ts` recorre `THEME_PRESETS` y verifica whitelist + AA en ambas
   variantes (los mismos pares de `evaluateContrast` que advierte el builder). Diseño con receta de TEXTO compartida (los
   pares de texto pasan por construcción) ⇒ solo varían superficies tintadas y acentos.
4. **UX = botón «Desde plantilla» (modal con miniaturas) y «Duplicar» (en las acciones de la paleta).** *Motivo:* patrón
   Material/Radix; entra al editor con los tokens como borrador SIN guardar, el admin ajusta y pulsa Crear (reusa el flujo
   de creación + vista previa en vivo + `PaletteSwatch` extraído para lista y picker).
5. **Naming: desde plantilla = nombre de la plantilla; duplicar = «<nombre> (copia)».** *Motivo:* convención estándar; el
   admin lo edita antes de guardar. **Alcance de las plantillas:** sobreescriben SOLO superficies + texto + 2 acentos;
   bordes (translúcidos, se adaptan) y funcionales/severidad se dejan a la marca base ⇒ **semántica de estado constante**
   entre todos los temas. 10 plantillas (industria chilena + constelación Lyra): Grafito, Cobre, Acero, Medianoche,
   Bosque, Solar, Índigo, Cobalto, Magma, Salitre. **Sin permiso/migración nuevos** (reusa `theme:manage`).

---

### 2026-06-24 · EST-TEMAS · Sistema de TEMAS / PALETAS administrable (MVP)
Las 7 decisiones de diseño (aprobadas antes de construir), con motivo:
1. **Granularidad = set ACOTADO y curado (18 tokens), NO los 100+.** *Motivo:* editar superficies/texto/bordes/acentos/
   funcionales por variante cubre el 95% del rebranding sin volver inmanejable el builder. La **severidad 1–5 queda
   PROTEGIDA** (es significado operacional, no decoración — CLAUDE.md) y el gradiente de marca **se DERIVA** de los acentos.
   Semilla 1-color→rampas = Fase 2.
2. **Aplicación en runtime = capa de OVERRIDE de variables CSS, no fork de tokens.** *Motivo:* un `<style>` inyectado con
   bloques `[data-wl-themed][data-theme="dark|light"]` gana por orden de cascada + especificidad a los tokens base; lo no
   sobreescrito cae a la marca. **Scopeado a `[data-wl-themed]`** (el workspace) ⇒ el **login conserva la identidad oscura
   de marca** (regla CLAUDE.md). Reusa `data-theme`/theme-store; cero duplicación de los tokens.
3. **Persistencia = `ThemePalette` + `SystemSettings.defaultPaletteId` + `User.themePaletteId`.** *Motivo:* paleta como
   fila con tokens JSON validados por Zod; default a nivel de instalación en el singleton de settings (fácil de cambiar y
   auditar); preferencia por usuario PORTABLE server-side (precedente `SavedView`/`NotificationPreference`). **claro/oscuro/
   auto se queda LOCAL** (localStorage) — es **ergonomía ambiental del dispositivo** (claro en oficina, oscuro en la tablet
   de terreno); sincronizarlo entre dispositivos sería PEOR UX. La PALETA (marca) sí debe ser consistente por usuario.
4. **Permiso nuevo `theme:manage` (cat. 91); elegir una publicada NO requiere permiso.** *Motivo:* construir/publicar/
   default son actos de configuración (auditados); elegir paleta es preferencia del usuario (patrón ownership, como las
   notificaciones). Aplica `new-permission-dev-gotcha` (db:seed + Redis FLUSHALL).
5. **Contraste WCAG en el MVP (cálculo PURO en `@lyra/contracts`).** *Motivo:* es barato, testeable y es **lo que hace
   premium** al builder (Material Theme Builder / Radix lo hacen). Advierte AA (4.5:1 texto / 3:1 UI) al editar; no bloquea.
6. **Instance-wide (single-tenant); NO atar la paleta a estructura.** *Motivo:* la identidad por estructura (L3,
   `--accent-<clave>`) es OTRA capa y se conserva; atar paletas a estructura sería especular. Posible futuro, no MVP.
7. **Este sistema ABSORBE el branding por licenciatario (deuda Fase 7 de `DEPLOYMENT.md`).** *Motivo:* un sistema de
   paletas EN RUNTIME (configurable por el admin, sin rebuild) es **superior** a los build-args `VITE_` (requieren
   recompilar la web por cliente). La identidad Lyra sigue siendo la base; las paletas la PERSONALIZAN sin romperla.
   *Acción:* la deuda de Fase 7 queda **superada** por EST-TEMAS (registrar en BACKLOG al cerrarla).

**Decisiones de implementación adicionales (con motivo):**
- **Acentos editables + gradiente DERIVADO.** El cliente pone SU color institucional como acción primaria; se recalculan
  `--gradient-brand`/`--gradient-brand-subtle`/`--color-border-accent` desde los dos acentos efectivos para no perder
  coherencia (logo/CTA). "Gradiente reservado" (CLAUDE.md) = uso con restraint, no hue inmutable.
- **Override PARCIAL (no full).** Una paleta sólo guarda las claves que cambia; el resto hereda la marca. Menos error,
  permite "volver a la marca" por token (botón reset) y el contraste se evalúa sobre el valor EFECTIVO (override ?? base).
- **Validación anti-inyección.** El formato de color se valida con regex acotada (hex/`rgb()/rgba()`) y las claves con
  `.strict()` (whitelist) ANTES de construir el `<style>`; severidad y claves arbitrarias se rechazan con 400.
- **Despublicar la default la quita de default.** *Motivo:* una paleta no publicada no puede ser la por defecto de la
  instalación (coherencia); el servicio limpia `defaultPaletteId` al despublicarla (verificado en smoke T15).

### 2026-06-24 · EST-FIX-ALTO · Cadena de altura de páginas maestro-detalle (DS: `ResizableSplit`)
Las páginas de split «lista | detalle» (Estructura, calendarios operacional/fiscal, datos de referencia) dejaban el
panel a media pantalla con un vacío debajo — defecto premium. La causa era una cadena de altura (flex) rota e
inconsistente, no un bug del componente. Decisiones (con motivo):
- **El contenedor de `ResizableSplit` (`packages/ui`) pasa a `flex: 1 1 auto; min-height: 0` (se quita el
  `min-height: 520px` fijo).** *Motivo:* un split dentro de un flex-column NO crecía — `align-items: stretch` solo
  estira el eje transversal (ancho), y sin `flex-grow` el contenedor tomaba su alto de contenido (clavado en 520px). Con
  `flex:1 1 auto` llena el alto del padre acotado y `min-height:0` es indispensable para que los paneles scrolleen
  **internamente** en vez de desbordar. Si el padre no acota la altura, cae con gracia a su alto de contenido (sin piso
  fijo); todos los consumidores actuales viven en contexto de fill.
- **La cadena de altura se centraliza en el shell con la variante `data-fill-height="pad"`, NO parcheando cada página.**
  *Motivo:* DRY. El shell ya tenía `data-fill-height` «a sangre» (padding:0) para las grillas que gestionan su propio
  scroll de borde a borde (Logbook). Se añade una segunda variante que **llena el alto conservando el padding del shell**
  (la tarjeta enmarcada del split respira): vuelve `.content` un flex-column y estira la página con `flex:1; min-height:0`.
  Cada página de split solo **marca el atributo** en su `<div>` raíz (wiring, cero CSS de alto por página). El
  `data-fill-height` por defecto (Logbook) queda **intacto**.
- **Se elimina el hack `height: calc(100dvh − 58px − 2·pad)` del CSS compartido de calendarios.** *Motivo:* era deuda
  frágil — asumía un topbar de 58px y NO descontaba la barra de pestañas del workspace ni la densidad compacta (topbar
  52px), dando una altura equivocada cuando había pestañas. El mecanismo del shell es robusto a ambos. Net: **menos** CSS
  divergente, no más.
- **`UsersPage` no se tocó.** *Motivo:* ya llenaba el alto vía su propia cadena `flex:1/min-height:0` bajo
  `SecurityLayout` (que provee `height:100%`); el cambio del contenedor de `ResizableSplit` la deja igual de correcta.
  Solo CSS/estructura de contenedores; sin librerías nuevas, sin modelo de datos, tokens existentes (claro/oscuro y táctil).

### 2026-06-24 · L1c · Coherencia de la estructura activa en los caminos de CREACIÓN
Hasta L1b los LISTADOS operacionales ya filtraban por la estructura activa (`?structureId=`), pero el flujo de
«Nueva entrada» la IGNORABA: el picker de plantillas (`GET /log-entries/templates`) y el de nodos elegibles
(`GET /log-entries/templates/:id/nodes`) solo aplicaban ABAC + alcance de plantilla. Resultado: un usuario cuyo
alcance abarca DOS estructuras (A y B), estando «en A», veía y podía elegir plantillas/nodos de B — incoherente con
el badge «Estás en A». NO era fuga de datos (el ABAC seguía siendo la frontera), pero rompía la promesa de la
estructura activa. Decisiones (las "a resolver" del plan, con su motivo):
- **Plantilla GLOBAL (sin asignación de nodo) bajo estructura activa → SIEMPRE aparece (opción a).** *Motivo:* una
  plantilla global es «de toda la instalación»; acotarla a la estructura activa contradeciría su semántica. Solo se
  acotan las plantillas CON asignación de nodo: aparecen si **≥1 de sus nodos vive en la estructura activa**. (Se
  descartó la opción b —resolver también las globales contra los nodos de la estructura— por romper «global = en todos
  lados».) Los **nodos elegibles** de una global SÍ se acotan a la estructura activa (∩ ABAC), porque el nodo concreto
  donde se crea la entrada SÍ pertenece a una estructura — coherente con el badge.
- **El filtro por estructura es UX/coherencia, NO un hard-block nuevo al materializar.** *Motivo:* `LogEntriesService.create`
  ya valida el nodo con **ABAC** (`canAccessNode`) + **asignación de plantilla** (`assertNodeAllowedForTemplate`), y la
  estructura del nodo ES su estructura — un bloqueo extra al guardar sería redundante y arriesgaría romper deep-links y
  la creación legítima por id. El filtro vive SOLO en los pickers/listados, nunca en el GET por id (paridad con L1b).
- **Mismo patrón que L1b, ADITIVO al ABAC (AND).** *Motivo:* no duplicar lógica — `structureId` se intersecta vía
  `orgNode.structureId` (espejo de incidencias/bitácoras). Nunca reemplaza al ABAC: un usuario acotado a A jamás ve B
  aunque no pase `structureId` (verificado en smoke E1/E2). **Sin migración, sin permiso nuevo** (es alcance de
  visibilidad, no una capacidad).
- **Catálogos COMPARTIDOS intactos.** *Motivo:* el mantenedor de plantillas/flujos (Configurador) sigue mostrando el
  catálogo GLOBAL completo (`applyTemplateScope:false` / sin `structureId`). El filtro de estructura es exclusivo de las
  superficies OPERACIONALES de creación.
- **«Nueva incidencia» NO se tocó.** *Motivo:* su picker de nodo ya usa `useAccessibleOrgTree`, que YA pasa
  `?structureId=` a `GET /structure/accessible-nodes` ⇒ ya era coherente (verificado por lectura + cubierto en el smoke
  de aislamiento). Se evitó cambiar lo que ya funcionaba.
- **Alcance ampliado de forma natural a la PROGRAMACIÓN DE RONDAS.** *Motivo:* `ScheduleDrawer` reusa el mismo hook
  `useAvailableTemplates` y `fetchTemplateEligibleNodes`; al cablear la estructura activa en el hook, programar una ronda
  «en A» tampoco ofrece plantillas/nodos de B — coherente, sin trabajo extra.

### 2026-06-24 · L3b · Asistente «crear una nueva área»
Un wizard que aprovisiona una estructura organizacional COMPLETA y operativa de una vez (identidad → niveles →
nodo raíz), eliminando la fricción de los 3 pasos sueltos. Decisiones (las "a resolver" del plan, con su motivo):
- **Orquestación → ENDPOINT BACKEND ATÓMICO `POST /structure/structures/provision`** (no orquestar los 3 endpoints
  desde el front). *Motivo:* el fallo parcial es feo — encadenar `createStructure`→`createLevel`→`createNode` (3
  transacciones) puede dejar una **estructura huérfana sin nodos** (no operable, oculta del selector vía `isOperable`,
  pero presente). El estándar es **integridad transaccional en la frontera del agregado**: las 3 inserciones van en un
  solo `prisma.$transaction` ⇒ o el área queda operable (≥1 nodo), o no se crea nada. Evita lógica de compensación
  frágil en el cliente. **Sin migración** (modelos existentes), **sin permiso nuevo** (reusa `module:structure:manage`).
- **Autorización → super-admin (`module:structure:manage`)**, igual que crear una estructura. *Motivo:* aprovisionar un
  "dominio" nuevo es provisión global. El controller mantiene el gate grueso `orglevel:manage`; el **servicio
  re-autoriza super-admin** (`assertSuperStructureAdmin`) ⇒ un delegado con `orglevel:manage` pero sin super-admin
  recibe **403** (verificado en smoke). El front solo OCULTA el botón al no-super-admin.
- **Fallo parcial → se disuelve con la transacción.** *Motivo:* al ser atómico no hay estado a medias que limpiar; el
  wizard muestra UN banner de error en el submit y permite reintentar. (Se descartó el rollback manual borrando lo
  creado: redundante y propenso a errores.)
- **«Nueva área» REEMPLAZA al «Nueva estructura» simple** del `StructuresDrawer` (no conviven). *Motivo:* el create
  vacío producía exactamente la fricción que L3b elimina (estructura sin niveles/nodos = no operable). Un solo punto de
  entrada premium; el editor de identidad de estructuras existentes queda intacto (solo edición).
- **Componente de pasos → `Stepper` MÍNIMO presentacional en `packages/ui`** (no dentro del feature). *Motivo:* es
  reutilizable a nivel DS y pequeño; honra "lo compartido vive en packages/ui" sin sobre-ingeniería. La **lógica** del
  wizard (state machine, validación por paso) vive en el feature. Además se extrajo `StructureIdentityFields` (editor de
  identidad L3) a subcomponente para reusarlo en el wizard sin duplicar.
- **Plantillas de niveles → 3 curadas + manual** (Minería, Manufactura, TI/Infraestructura + «Desde cero»). *Motivo:*
  arranque rápido sin encajonar; las plantillas prellenan la lista y el usuario agrega/quita/renombra/reordena (mínimo 1
  nivel). Los nombres viven en i18n (`returnObjects`), no hardcodeados en el componente.

### 2026-06-24 · L3 · UX premium cross-estructura (identidad + vista ejecutiva + switcher)
Hace que trabajar con varias estructuras se sienta de clase mundial y sin ambigüedad. Tres piezas (el asistente
"crear área" se DIFIRIÓ a L3b por tamaño). Decisiones (las "a resolver" del plan, con su motivo):
- **Identidad → columnas CONFIGURABLES `OrgStructure.color`/`icon` (migración aditiva, nullable) con FALLBACK
  determinístico.** *Motivo:* premium + parametrizable donde se justifica; cero pérdida (NULL = "auto" ⇒ se deriva de
  la `key` con un hash estable FNV-1a, mismo color/ícono entre recargas). Migración `20260624130000_add_structure_identity`.
- **El color NO es hex libre: es una CLAVE de paleta curada** (indigo/cyan/violet/emerald/amber/rose/teal/slate), y el
  ícono es de una **lista blanca Lucide**. *Motivo (objeción de marca):* dejar elegir un hex arbitrario rompería el
  contraste y la coherencia Lyra. La hue vive UNA sola vez como token (`--accent-<clave>` en `tokens/index.css`); los
  componentes consumen `var()` (incluido Recharts `fill`) — **nunca hex en el componente**. Validado por Zod (`z.enum`)
  en el contrato ⇒ acento fuera de paleta = 400.
- **Alcance del acento → SUTIL.** Badge "Estás en: <estructura>" SIEMPRE visible en el topbar (borde-izquierdo + tinte
  translúcido del acento) y el switcher lo adopta. **Sin** gradiente a pantalla completa ni fondos claros en oscuro
  (CLAUDE.md "lo que NO hacer visualmente"). Funciona en claro/oscuro vía tokens.
- **Badge y switcher = UNA sola superficie.** *Motivo:* mostrar el nombre dos veces (badge + selector) es redundante;
  el disparador del switcher ES el badge (estático si hay una sola estructura operable, desplegable con búsqueda si ≥2).
- **Vista ejecutiva → permiso NUEVO de alto nivel `module:dashboard:cross-view`** (dimensión MODULE, grupo `dashboards`).
  *Motivo:* es la **EXCEPCIÓN EXPLÍCITA al aislamiento L1** (la única forma de cruzar la estructura activa); merece una
  llave propia y gerencial, no reusar `incident:view`. Gotcha asumido: `db:seed` + Redis `FLUSHALL` (catálogo 89→90).
- **La vista cruza la estructura activa pero NO el ABAC por nodo.** *Motivo (seguridad):* el aislamiento por estructura
  es un "lente de workspace"; la **frontera de datos es el ABAC**. El servicio interseca, por estructura, sus nodos vivos
  con los nodos accesibles del usuario: un gerente sin alcance ve todas las estructuras; uno acotado, SOLO aquellas donde
  tiene nodos accesibles (y solo sus nodos). Verificado en el smoke con usuario scoped (ve A, no B) y gate 403 sin permiso.
- **Alcance de KPIs → primer corte ACOTADO a INCIDENCIAS** (reusa `IncidentDashboardService`, nuevo `buildCross`):
  abiertas/críticas/vencidas/SLA por estructura + totales. *Motivo:* no reconstruir un BI multi-módulo; el panorama
  bitácoras/rondas/turnos queda como **deuda** (BACKLOG).
- **Endpoint `GET /incidents/dashboard/cross`** (montado en el controller de incidencias por reuso del servicio; sin
  `?structureId=`). Read-only, agregado en el backend (counts, nunca filas crudas al cliente).
- **Asistente "crear nueva área" → DIFERIDO a L3b** (objeción al plan): un wizard multi-paso que orquesta 3 endpoints con
  manejo de error propio sobrecargaba la sesión junto a la pieza sensible (vista ejecutiva). Mejor 3 piezas verificadas
  que 4 a medias.

### 2026-06-24 · L2b · Administración DELEGADA por estructura + red anti-lockout
Permite que un administrador NO sea "dios de toda la instalación": se le delega administrar SOLO ciertas estructuras
(árbol/niveles/ciclo de vida), mientras el super-admin sigue administrándolo todo (patrón ServiceNow domain-admin).
Decisiones (las "a resolver" del plan, con su motivo):
- **Modelo → tabla NUEVA `StructureAdmin(structureId, roleId?/userId?)`** (migración aditiva, no sobrecargar `Scope`).
  *Motivo:* "administrar la estructura" es un eje DISTINTO de "ver los datos de sus nodos" (ABAC). Sobrecargar `Scope`
  mezclaría semánticas (`includeDescendants` no aplica) y ataría la administración a los nodos (justo lo que causa la
  deuda b). Sujeto polimórfico con check exclusivo, espejo de `Scope`. Migración `20260624120000_add_structure_admin_delegation`,
  cero pérdida (sin filas = comportamiento previo: super-admin administra todo, nadie más).
- **Sujeto → rol Y usuario, combinados por UNIÓN** (paridad exacta con L2a). *Motivo:* delegar a un rol ("Líderes TI") de
  una vez, o a una persona puntual; el `ScopeService` une en read-time las filas propias + las de los roles, evaluado EN
  VIVO (quitar el rol/la delegación re-acota sin denormalizar).
- **Permiso → REUSAR `module:structure:manage`** (antes LATENTE en el catálogo) como marca de **super-admin** (administra
  TODAS las estructuras + reparte delegaciones). Los `orglevel:manage`/`orgnode:*` pasan a ser **contextuales** (administran
  solo lo delegado). *Motivo:* cero clave nueva ⇒ sin gotcha `db:seed`/Redis `FLUSHALL`; el rol de sistema "Administrador"
  ya la tiene (todos los permisos) ⇒ **el super-admin sigue siéndolo con cero cambios de grants/migración**. Su descripción
  ("Administrar la estructura organizacional") ya calza.
- **Reparto de actos:** crear/eliminar estructura y reordenar el selector = **super-admin only** (provisión que afecta al
  conjunto global); renombrar/archivar/reactivar X y CRUD de niveles/nodos de X = **delegado-de-X o super-admin** (ciclo de
  vida y árbol DENTRO de X). *Motivo:* crear/borrar/reordenar el set global es "provisión de dominios"; configurar dentro de
  una estructura es administración delegable.
- **Autorización CONTEXTUAL centralizada** en `ScopeService.assertCanAdministerStructure` / `assertSuperStructureAdmin`,
  invocada en el SERVICIO (donde se resuelve el `structureId`), con el controller manteniendo el gate grueso del decorador
  (patrón híbrido, precedente `logentry:void`). *Motivo:* el `PermissionsGuard` es global y no conoce el `structureId` del
  recurso; no dispersar la lógica copiándola endpoint por endpoint.
- **Super-admin → criterio = TENER el permiso `module:structure:manage`** (NO "no tener delegaciones"). *Motivo (objeción al
  plan):* atar el super-admin a "sin delegaciones" es frágil — delegarle algo al admin lo degradaría sin querer. El permiso
  explícito es dato RBAC editable y garantiza que SIEMPRE haya quién administre todo.
- **Deuda (b) CERRADA:** `listStructures` = `accesibles-por-nodo ∪ administrables-por-delegación`; un delegado VE y arma su
  estructura aunque no tenga nodos accesibles. El backend marca por fila `canAdminister` (derivado del mismo cálculo) para
  que la UI habilite/oculte la gestión, sin un endpoint extra.
- **Paridad by-id/lectura:** leer un recurso por id sigue rigiéndose por ABAC; L2b restringe **MUTAR** estructuras ajenas,
  no leerlas (igual que L1/L2c).
- **Red ANTI-LOCKOUT (a petición del dueño; invariante "≥1 usuario ACTIVO con rol de sistema").** Tres candados en el
  backend, con 400/403 claros: **(A)** el rol de sistema no puede modificar sus permisos (idempotente OK), **(B)** no se
  quita el rol de sistema al último administrador, **(C)** no se deshabilita al último admin activo. *Motivo:* hoy era
  posible vaciar de permisos el rol Administrador, quitarle el rol al último admin o deshabilitarlo, dejando la instalación
  sin nadie capaz de administrar (riesgo real preexistente). Estándar de la industria (GitHub/AWS IAM/Atlassian: "last admin
  protection"). "Administrador" = cualquier usuario con un rol `isSystem`.

### 2026-06-24 · L2c · Ciclo de vida de la estructura organizacional (archivar / reactivar / reordenar)
Permite gobernar el ESTADO y el ORDEN de las estructuras sin borrar datos. Verificado en código (no asumido):
el modelo ya existía (`OrgStructure.active`/`reportOrder`/`deletedAt`/`isDefault`); `updateStructure` ya togglea
`active` con guarda "la por defecto no se desactiva"; el `StructureSwitcher` ya **oculta archivadas** (`isOperable`)
y ya **sanea el fallback** (cae a la por defecto si la activa deja de ser operable); `resolveStructureId` filtra solo
`deletedAt` ⇒ una archivada sigue legible por id/deep-link. ⇒ **NO hubo migración.** Decisiones (las "a resolver"):
- **Modelo de estado → `active: boolean` (NO se agrega `archivedAt`).** *Motivo:* ya está cableado en schema/
  contratos/UI y es suficiente; el `AuditLog` (`structure.structure.updated`) ya registra QUIÉN y CUÁNDO archivó/
  reactivó, así que un timestamp dedicado sería redundante. Archivada = `active:false` + `deletedAt:null` (viva pero
  fuera de operación); eliminada = `deletedAt` (borrado lógico, solo si no tiene nodos).
- **Permiso → REUSAR `orglevel:manage`** (el mismo que ya gobierna crear/editar/borrar estructura y multi-estructura).
  *Motivo:* archivar/reactivar/reordenar **es** administrar la estructura; no inventar clave evita el gotcha de dev
  (`db:seed` + Redis `FLUSHALL`). Sin clave nueva, sin migración.
- **Reordenar → endpoint ATÓMICO dedicado `PUT /structure/structures/reorder`** (lista ordenada de ids → `reportOrder`
  0..n en una transacción), no editar el orden estructura por estructura. *Motivo:* deja el orden del selector
  consistente de una sola vez y sin huecos; rechaza ids desconocidos (no aplica un reorden a medias). La **por defecto
  va fija arriba** porque el backend la ancla con `orderBy: isDefault desc`; por eso las flechas de la UI operan solo
  sobre el segmento NO-default.
- **Fallback al archivar la estructura activa de un usuario → el saneo YA existente del `StructureSwitcher`** (cae a la
  por defecto al navegar fuera de configuración), reforzado con una guarda backend: no se archiva la por defecto ni la
  ÚLTIMA activa (defensa en profundidad; en la práctica la por defecto, inarchivable, garantiza siempre ≥1 activa).
- **Paridad con L1:** una archivada sigue legible por id/deep-link (no se filtra `active` en `resolveStructureId`),
  igual que el criterio de L1 para by-id; solo desaparece de selector y listados operacionales.
- **Purga GxP destructiva → FUERA de alcance por diseño.** *Motivo:* la respuesta correcta a "no puedo borrar una
  estructura con historial" es **archivar** (conserva el historial). Una purga real exigiría un flujo regulatorio
  (firma/justificación/retención) que no corresponde a esta sesión.
- **Editor simplificado a identidad (nombre/clave/descripción).** *Motivo:* estado y orden ahora tienen acciones de
  primer nivel en la lista; mantenerlos también en el formulario crearía dos fuentes de verdad.

### 2026-06-24 · L2a · Alcance por NODO a nivel de ROL (ABAC dim. 4 configurable en el rol)
Cierra el requerimiento `role-node-scope-requirement`: hasta ahora el alcance ABAC por nodo solo se
configuraba **por usuario** (Seguridad → Usuarios → "Alcance", `PUT /security/users/{id}/scope`). Ahora
también se configura **por ROL**, una sola vez, y aplica a todos sus miembros (caso: "Rol Analista-TI →
subárbol TI"). Conviven **ambos ejes de sujeto** (rol Y usuario) y se combinan por **UNIÓN** (gana el más
amplio). Verificado en código (no asumido):
- **Sin migración:** la tabla `Scope` ya tenía `roleId` + `@@unique([roleId, orgNodeId])`. Solo faltaba
  exponer la ESCRITURA.
- **El motor ya unía user+roles:** `ScopeService.getAccessibleNodes` consulta
  `where:{ OR:[{userId},{role:{users:{some:{userId}}}}] }` ⇒ el alcance efectivo del usuario YA era la unión
  de sus Scope propios + los de sus roles, evaluada **en read-time** (no se denormaliza). ⇒ quitarle el rol a
  un usuario lo **re-acota EN VIVO** (cubierto por el smoke T5).
Decisiones (las "a resolver", con su fundamento):
- **Permiso del endpoint → REUSAR `role:manage`** (no se inventa clave nueva). *Motivo:* el `update`/`create`
  del rol y su `PUT .../template-scope` ya usan `role:manage`; asignar el alcance de datos de un rol **es**
  administrarlo. Mantiene mínimo privilegio + consistencia y, sobre todo, **evita el gotcha de dev**
  (`db:seed` + Redis `FLUSHALL`) que exige toda clave nueva (el admin demo daría 403). El eje de usuario usa
  `user:assign-scope`; el análogo correcto para el rol es `role:manage`.
- **UX del doble eje del rol → una sola pestaña "Alcance" con DOS sub-secciones rotuladas** ("Alcance por nodo"
  + "Alcance por plantilla"). *Motivo:* paridad con la pantalla de usuario (que también agrupa nodo+plantilla
  en una pestaña) y evita proliferar pestañas. Los dos ejes son ABAC ortogonales (Scope vs TemplateScope) que
  combinan en AND; vacío en cualquiera = sin restricción en ese eje.
- **Reuso total, sin duplicar:** backend `RolesService.assignScope` = espejo de `UsersService.assignScope` con
  sujeto `roleId`; front reusa `ScopeTreePicker` (mismo `useOrgTree`, respeta la estructura activa) y el
  contrato `assignScopeRequestSchema`/`scopeEntrySchema` ya existentes. `RoleDetail += scopes[]`.
- Verificado: `smoke-rol-alcance-nodo.py` **14/14** (write+read del scope del rol; unión user+rol; la unión
  AMPLÍA al sumar scope propio; quitar el rol re-acota en vivo; gate `role:manage` ⇒ 403; nodo inexistente ⇒
  400; lista vacía limpia) + regresión L1 `smoke-aislamiento-estructura.py` 33/33 · `smoke-template-scope.py`
  14/14 · `smoke-multi-estructura.py` 33/33 + unit API 252/web 6. **NO** se hizo L2b/L2c/L3/L4.

---

### 2026-06-24 · Aislamiento COMPLETO por estructura (L1): filtro `structureId` en TODO listado operacional
Cierra la deuda `org-views-vs-isolation`: hasta ahora la "estructura activa" solo filtraba la CONFIGURACIÓN
(árbol/niveles/calendarios) y los selectores de nodo, pero los **listados operacionales** (incidencias,
bitácoras, excepciones, rondas, cambio de turno, dashboard, exports) seguían mostrando datos de otra estructura
(leak). El aislamiento "o es total, o no es aislamiento". Plan L1 del Anexo A de `NOTA_estructuras_y_jerarquias.md`.
Decisiones (las 3 "a resolver", confirmadas con el dueño):
- **¿Cómo conoce el backend la estructura activa?** Querystring **`?structureId=`** separado, idéntico al patrón
  ya correcto de `operational-calendar` — **NO** se toca el contrato Zod de cada query (cero churn de contratos).
  El controller lee `@Query("structureId") structureId?: string` y lo pasa al service. El front lo añade vía
  `useActiveStructureId()` en el `queryKey` + la URL (espejo de calendarios).
- **Combinación con el ABAC por nodo = AND (intersección).** Se aplica de dos formas según el modelo:
  (a) relación navegable `orgNode: { structureId }` cuando existe (Incident, LogEntry, ShiftHandover);
  (b) resolución del `structureId` a su **conjunto de nodos** e intersección con los nodos accesibles cuando el
  modelo solo denormaliza `orgNodeId` sin relación `orgNode` (LogEntryException, LogSchedule, RoundOccurrence, y
  el dashboard que mezcla Prisma + SQL crudo).
- **Usuario acotado con estructura activa AJENA ⇒ lista VACÍA** (la intersección ABAC ∩ estructura es vacía). ✔
- **by-id (getDetail) y descarga de UN acta/registro puntual ⇒ SOLO ABAC, NO se filtran por estructura activa.**
  *Motivo:* la estructura activa es una **lente de workspace**, no la frontera de seguridad — esa frontera es el
  ABAC por nodo (403 si el nodo no es accesible). Endurecer el by-id por estructura activa no añade aislamiento
  para clientes realmente separados (ya bloqueados por ABAC) y **rompería los deep-links legítimos de la
  campanita** entre estructuras (un admin abriendo una notificación suya de otra estructura). El filtro de
  estructura aplica a LISTAS/stats/dashboard/**exports masivos** (CSV de bitácoras, lista de actas); la lectura
  puntual se rige por ABAC. (Decisión del dueño vía `AskUserQuestion`, opción "Solo ABAC".)
- **L1a (fugas reales de ABAC, URGENTE):** `equipment.search()` no aplicaba `ScopeService` (un usuario acotado
  veía equipos de otras estructuras) y `equipment.listByNode()` no validaba el nodo. Cerradas: `search` acota al
  ABAC del usuario + estructura activa; `listByNode` exige `canAccessNode` (403 si ajeno).
- **NO se tocan los catálogos COMPARTIDOS** (templates, reference-data, workflows, roles, users, settings, audit,
  saved-views): filtrarlos por estructura rompería el diseño "catálogos compartidos" (decisión 2026-06-23).
- **Notificaciones: sin cambio (decisión explícita).** El inbox in-app es por **ownership** (las notificaciones
  son del usuario, no de una estructura) y el outbox es vista de admin global; ninguno es un "listado operacional
  por nodo". No se acota por estructura activa.
- Verificado: `smoke-aislamiento-estructura.py` **33/33** (siembra datos reales en estructuras A y B; usuario
  acotado a A ve solo A en incidencias/bitácoras/equipos y `?structureId=B` ⇒ vacío; `listByNode(B)` ⇒ 403; admin
  cambiando estructura activa ve solo la activa en incidencias/bitácoras/equipos/dashboard) + regresión
  incidencias 32 · grid-content 25 · mis-rondas 18 · cambio-turno 29 · excepciones 39 · dashboard 24 + unit 252.
  **NO** se hizo L2/L3/L4. Deuda: el front del export imperativo (`exportLogbookCsv`) ya pasa la estructura activa;
  los demás exports puntuales by-id quedan por ABAC (correcto).

### 2026-06-23 · Camino "scoped" para selectores de nodo de flujo operacional (ABAC)
Bug: el selector de nodos al **crear una incidencia** (y otros selectores operacionales) mostraba TODOS los
nodos a un usuario con alcance acotado, porque `GET /structure/nodes` (`StructureService.getTree`) devuelve el
árbol completo sin filtrar por `ScopeService`. **Trampa de diseño:** ese mismo endpoint lo usan las pantallas de
ADMINISTRACIÓN (mantenedor del árbol, asignación de nodos a calendarios), donde ver TODO es correcto — filtrar
`getTree()` globalmente las rompería.
**Decisión:** un **camino separado** para selectores operacionales en vez de tocar el de administración.
- Backend: nuevo `StructureService.getAccessibleTree(userId, structureId?)` (filtra por
  `getAccessibleNodeIds`: `null`=admin⇒árbol completo, `Set`⇒acota, vacío⇒vacío; nodo accesible bajo ancestro no
  accesible queda como raíz, nunca se filtran nodos ajenos) y endpoint **`GET /structure/accessible-nodes`**.
- **Sin `@RequirePermission`** (a diferencia de `/structure/nodes`, que exige `orgnode:read`): un operador NO
  administra la estructura. El **alcance del propio usuario ES la autorización** — el servicio nunca devuelve
  nodos ajenos. *Motivo:* exigir `orgnode:read` bloquearía a los operadores (que no lo tienen) en el flujo de
  crear incidencia/bitácora.
- Frontend: hook `useAccessibleOrgTree()` (clave de cache aparte `["structure","accessible-tree",sid]`,
  invalidada en altas/bajas de nodo). Migrados a él: `CreateIncidentModal`, `LogbookPage`, `ShiftHandoverPage`
  (selectores de flujo). Los de ADMINISTRACIÓN siguen con `useOrgTree`/`getTree` (sin acotar).
- Respeta la estructura activa (`?structureId`) y el ABAC multi-estructura (deriva estructura del nodo).
- Bonus UX: el `Combobox` base truncaba el label mal (el texto suelto no recibía el ellipsis; la regla apuntaba
  al `.optHint`). Fix: envolver el label en `.optText` truncable + truncar `.optHint`; el modal de incidencias
  pasa ahora **nombre (label) + ruta (hint)** en vez de la ruta kilométrica como label. Mejora TODOS los selectores.
- Verificado: `smoke-scoped-node-selector.py` 12/12 (admin ve 83 nodos; usuario scoped ve solo su subárbol de 2,
  no el padre) + regresión `smoke-multi-estructura.py` 33/33. Deuda relacionada `org-views-vs-isolation`
  (otros listados operacionales aún sin acotar) sigue abierta; este fix cierra el selector de nodos.

### 2026-06-23 · Multi-estructura organizacional (varias estructuras en una instalación)
Requerimiento urgente del dueño: poder definir **varias estructuras organizacionales** en paralelo en la
misma instalación single-tenant (p. ej. una jerarquía minera Faena→Planta y otra de infra TI
Contrato→Dominio), cada una con su **propio set de niveles** y su **propio árbol**. NO es multi-tenant.
Plan aprobado; forks resueltos por `AskUserQuestion`:
- **Catálogos COMPARTIDOS (no por estructura).** Solo el árbol + niveles + calendarios se vuelven
  por-estructura. Plantillas, flujos, tipos/categorías de incidencia, listas de referencia y datos maestros
  siguen siendo un catálogo ÚNICO; una plantilla "aparece" en una estructura al asignarla a nodos de ella.
  *Motivo:* acota el alcance (no `structureId` en ~15 entidades), evita re-crear catálogos por estructura.
- **Aislamiento ESTRICTO.** Un nodo vive en exactamente UNA estructura; no se reparenta entre estructuras
  (invariante `node.structureId == parent.structureId`). Bitácoras/incidencias/handovers/rondas heredan la
  estructura de su nodo, sin columna propia (derivable por join). *Motivo:* los datos quedan particionados
  por construcción; cruzar estructuras no tiene caso de uso y multiplicaría la complejidad.
- **Selección por SELECTOR GLOBAL persistido por usuario** (store `structure-store`, espejo de
  `workspace-store`/`ownerUserId`), con las estructuras seleccionables **derivadas del ABAC**
  (`ScopeService.getAccessibleStructureIds`: distinct de las estructuras de los nodos accesibles; sin scopes
  = todas). *Motivo:* sin pertenencia explícita usuario↔estructura nueva; reusa el ABAC por nodo existente.
- **`structureId` solo donde hace falta:** `OrgStructure` (nueva) + `OrgLevel` (denormalizado, reescopa
  `@@unique([order])`→`@@unique([structureId, order])` — el bloqueador real) + `OrgNode` (denormalizado en
  CADA nodo para filtrar sin join a la raíz; guardia de invariante) + `OperationalCalendar`/`FiscalCalendar`
  (default e asignación de nodos **por estructura**, índices únicos parciales). **NO** en `Scope`/`TemplateScope`
  (el nodo ya implica su estructura) ni en `LogEntry`/`Incident`/`ShiftHandover`/`LogSchedule` (derivable).
- **`path` (ruta materializada) SIN cambios.** Son IDs de nodo (cuid únicos): los prefijos `startsWith` de
  descendientes/ancestros NO colisionan entre estructuras. ⇒ ABAC por nodo y herencia de calendarios por
  ruta **no se reescriben**; `structureId` entra solo como filtro y guardia. *(Hallazgo clave que bajó el riesgo.)*
- **Calendarios: default POR ESTRUCTURA.** El fallback de los resolvers (turno/fiscal) pasa de "el default
  global" a "el default de la ESTRUCTURA del nodo" (o de la estructura por defecto si no hay nodo).
  *Motivo:* industrias distintas, ritmos de turno/período distintos; un default global no tiene sentido.
- **Permiso REUSADO `orglevel:manage`** para crear/editar/borrar una estructura (sin nuevo gate, sin FLUSHALL).
  *Motivo:* quien configura niveles/árbol gestiona estructuras; no crece el catálogo de permisos.
- **Migración ADITIVA no-destructiva** (`20260623120000_add_org_structure`): crea `OrgStructure`, inserta una
  **"Estructura por defecto"** (`key=default`, `isDefault`), backfillea TODO lo legado a ella, reescopa el
  unique de niveles e índices parciales de default. **Cero pérdida** (verificado: 4 niveles/83 nodos/5+5
  calendarios + 18 scopes/19 asignaciones/70 bitácoras/71 incidencias intactos bajo la estructura por defecto).
- **`deleteStructure` bloquea por NODOS (activos o eliminados), no por niveles.** Un nodo soft-deleted
  arrastra historial y FKs `Restrict` (LogEntry/Incident); los niveles caen por cascada con la estructura.
  *Motivo:* descubierto por el smoke — borrar el nivel de un nodo soft-deleted daba 500 (FK). Una estructura
  con historial de nodos no se borra; una solo con niveles (sin nodos) sí.

**Backend tocado:** `StructureService`/`Controller` (estructuras CRUD + scoping de niveles/árbol por
`?structureId` + invariante de reparent/nivel), `ScopeService` (+`getAccessibleStructureIds`),
`OperationalCalendarService`/`FiscalCalendarService` (default e asignación por estructura, list filtrable),
`shift-resolver`/`fiscal-resolver` (fallback = default de la estructura del nodo), `seed.ts`.
**Frontend:** `structure-store` + `StructureSelector` + `StructuresDrawer` (CRUD) en el header de Estructura;
`useOrgTree`/`useOrgLevels` leen la estructura activa ⇒ **todos los pickers de nodo** (bitácoras, incidencias,
alcance, asignar calendario, cambio de turno) quedan scoped sin tocarlos uno a uno; listas de calendarios
también por estructura activa. **Smoke:** `smoke-multi-estructura.py` 33/33 (2 estructuras, datos no se
mezclan, default intacto, aislamiento estricto, calendarios por estructura) + regresión incidencias 32 ·
cambio-turno 29 · sla 25. **Dependencia anotada (fuera de alcance):** "rol acotado a nodo" (`Scope.roleId` en UI).

### 2026-06-22 · Sesión de barrido QA + caso de uso liviano "un día de operación" (sin features nuevas)
Sesión de **entender, cerrar/diferir lo abierto de Fases 0–5 y HABILITAR una prueba manual end-to-end**.
NO se construyó funcionalidad nueva. Forks resueltos por `AskUserQuestion`:
- **Cierres rápidos (bugs de la QA del 2026-06-18):** se cerraron **QA#1** (pestañas del workspace aisladas por
  usuario: `workspace-store.ownerUserId`+`syncOwner`, sincronizado en `AuthProvider`), **QA#2** (ojo mostrar/ocultar
  en `ForcePasswordChangePage`), **QA#4** (i18n de los 16 grupos de la matriz de permisos en `es-CL.ts`) y **QA#6**
  (toast transversal "Sin acceso" ante 403 vía `QueryCache.onError` → puente `forbidden-notice` → `ForbiddenToastBridge`,
  con throttle). Rama `feat/qa-fixes-y-seed-lite`. **+ QA#3** (cerrado durante la prueba: los equipos sembrados en
  nodos intermedios Molienda/Flotación quedaban invisibles; `NodeDetail` ahora muestra hijos **y** `EquipmentSection`
  siempre, no excluyente por nivel — se revirtió la decisión de diferirlo porque bloqueaba ver el equipo). **Diferido
  con motivo:** QA#5 (propagación del gate a sesiones activas — endurecimiento de sesión de su propio diseño; QA#6 lo
  mitiga parcialmente).
- **Reversa/Anulación GxP de registros SELLADOS = se DIFIERE como MÓDULO PROPIO (candidato #1 tras la ronda QA).**
  *Motivo:* es el pendiente de auditoría más serio (Part 11 §11.200) pero **no es un cierre rápido**: transición
  inversa + nuevo significado de firma + `payloadHash` + reglas de quién revierte + auditoría reforzada. Hacerlo
  apurado añade riesgo. Registrado en BACKLOG §2 como módulo candidato #1; unifica 2.5(a)(d), 2.8.2 y la deuda de firma.
- **Caso de uso liviano = SEED NUEVO APARTE** (`scripts/seed-demo-lite.py`, marca `DEMOLITE`, `--clean` verificado sin
  residuos) en vez de un "modo lite" del seed denso. *Motivo:* aislamiento total (no toca DEMOQA ni los datos del dueño),
  más limpio y reversible. **Escenario:** «Planta Demo Andina» → Concentradora → {Molienda, Flotación} (4 nodos),
  7 usuarios con roles reales + ABAC, 1 plantilla con 2 secciones y privilegios + umbral/condicional/regla→incidencia,
  1 flujo con firma Part 11 + SLA, 1 ronda (1 vencida), 2 incidencias en vivo. **NO modifica catálogos compartidos**
  (no toca las SLA de `IncidentType` base; eso se demuestra en DEMOQA) → `--clean` solo borra lo `DEMOLITE`.
- **IA del resumen = modo `none` (determinista)** en el escenario liviano, para que la prueba no dependa de un proveedor;
  IA real se prueba aparte (Anthropic/Ollama). **MFA = apagado por defecto** en DEMOLITE (sin enrolar TOTP en la prueba);
  apéndice en el guion para activarlo. **Tamaño = "+1 proceso y +2 usuarios"** sobre el mínimo (elección del dueño).
- **Guion** `docs/QA_DIA_OPERACION.md` (documento VIVO): 9 actos de menos a más (panorama → ABAC → correo → llenado →
  excepción→incidencia → firmas Part 11 → notificaciones → cambio de turno + acta PDF → auditor), con tabla de hallazgos
  y **mapeo a los smokes visuales del BACKLOG §4** para tacharlos durante la prueba.
- **Hallazgos de la ronda en Estructura (mismo día):** (1) equipos de nodos intermedios invisibles → sub-pestañas
  Hijos/Equipos con contador; (2) faltaba búsqueda → buscador de nodos en memoria + **búsqueda de equipos por API**;
  (3) grilla de equipos: tag en 2 líneas → nowrap + anchos. **Decisión de diseño confirmada:** la **pantalla de
  Estructura es una vista de CONFIGURACIÓN GLOBAL**, NO acotada por scope de datos — `OrgNodeService.getTree()` devuelve
  el árbol COMPLETO y `EquipmentService.listByNode` no filtra por nodo accesible; el control de acceso es el permiso
  (`module:structure:view`/`equipment:view`). Por eso la **búsqueda de equipos también es GLOBAL** (se descartó un primer
  intento con `getAccessibleNodeIds` que la dejaba más estricta que el árbol: un admin acotado veía el nodo pero no su
  equipo). El **ABAC por nodo gobierna los datos OPERACIONALES** (bitácoras, incidencias), no la configuración del
  organigrama. *(Si en el futuro se quiere acotar el organigrama por scope, es una decisión transversal aparte que
  tocaría también `getTree`.)*

### 2026-06-20 · Fase 5 — Resumen de turno por IA: prompt v3 (más potente, sin aflojar el anclaje)
Feedback del dueño: el resumen por IA "se sentía pobre, no era para WOW". Diagnóstico: el prompt **v2** lo amordazaba a propósito (Slice 2 conservador) — *"no recomiendes acciones ni emitas juicios"* + tope de **180 palabras en prosa plana** ⇒ solo re-listaba los DATOS. **Fork resuelto por `AskUserQuestion`:** recomendaciones **ACOTADAS A LOS DATOS** (no "solo explicar", no "operativas amplias").
- **Prompt → `v3`** (auditable, versionado): permite **EXPLICAR** el significado de los hechos (por qué algo es prioritario: severidad + plazo vencido; qué condiciona el cierre) y **RECOMENDAR** en un bloque final "Para el turno entrante", pero **cada recomendación DEBE referenciar un folio/ítem presente en DATOS** y limitarse a *priorizar / vigilar / dar seguimiento / cumplir un plazo*. **PROHIBIDO** causas raíz, diagnósticos, repuestos, procedimientos, cifras o fechas que no estén en DATOS; **no calcular tiempos** (usar el plazo solo si DATOS lo trae; si está "vencido", decirlo sin estimar cuánto). Estructura en 3–5 párrafos cortos con subtítulo, hasta ~300 palabras. Guarda anti-inyección intacta.
- **Grounding enriquecido (señales que YA viven en el snapshot, no inventadas):** incidencias ahora exponen `typeName` + `dueLabel` (plazo formateado es-CL+TZ del nodo); acciones/reportes exponen su **incidencia padre** (`incidentFolio`) + `dueLabel` y se rotulan "condicionan el cierre". Da ganchos concretos para explicar/priorizar con base. `SUMMARY_MAX_TOKENS` 700→900.
- *Motivo:* potencia real (brief de relevo, no inventario) manteniendo el anclaje ironclad (AC-IA-2/3): todo lo que el modelo diga sigue siendo rastreable a una línea de DATOS. El crudo determinista sigue visible al lado y la **firma sigue humana**. `none`/fallback/streaming sin cambios. Sin migración. Tests: @lyra/llm 11 · API 247; smoke ia-config 20/20 · ia-stream 13/13 · cambio-turno 29/29. **Calidad de la prosa = smoke visual del dueño con su proveedor real (Anthropic/local).**

### 2026-06-19 · Fase 5 · Slice 4 — EXPORT PDF del acta de entrega de turno (forks resueltos)
Plan por capas aprobado; 3 forks por `AskUserQuestion` + 4 recomendados sin objeción:
- **(a) Motor de PDF = `pdfmake`** (sobre `@react-pdf/renderer`/`pdfkit` y, sobre todo, sobre Puppeteer/headless Chrome). *Motivo:* el acta es un documento **estructurado/tabular**; pdfmake lo arma con menos código, es JS puro **determinista** y liviano y **no arrastra Chromium** (~300 MB + superficie de ataque + binario en la imagen Docker on-prem). Fuentes de marca **Sora/Inter** embebidas como TTF estáticos (`@expo-google-fonts/*`, OFL); referenciadas por ruta con `localAccessPolicy` en **lista blanca** + `urlAccessPolicy=false` (sin recursos externos). El SVG de la banda de marca va inline.
- **(d) Gobernanza de estado = BLOQUEAR (409)**, no borrador con marca de agua. El acta OFICIAL solo existe desde **SIGNED_OUT/ACKNOWLEDGED** (hay snapshot congelado + firma); en COMPILING/CANCELED ⇒ 409. *Motivo:* un acta sin firma desde la vista en vivo no es "fiel/inmutable"; emitir un borrador invita a confusión. Desde SIGNED_OUT el acta es oficial y marca el acuse entrante como "Pendiente de reconocimiento" hasta que se firme.
- **(b/e) Entrega ON-DEMAND + hash al vuelo.** No se persiste el binario; el acta se genera y descarga al momento (el snapshot inmutable la hace reproducible). La **integridad** = **SHA-256 de un JSON CANÓNICO** (claves ordenadas) del snapshot + las dos firmas + el resumen, calculado en cada request ⇒ determinista (dos exports ⇒ mismo hash, AC-PDF-1) y **sin migración**. Folio + hash en el pie y en un bloque de verificación. *Esto siembra la deuda del payloadHash de firma del BACKLOG.* Persistir en MinIO se difiere a si la carpeta regulatoria lo exige.
- **(c) Permiso = REUSAR `shifthandover:view`** (gate `RequireAnyPermission(view/compile/sign/acknowledge)` como `getDetail`: el entrante a veces solo tiene `acknowledge`). Sin permiso nuevo ⇒ **sin `db:seed`/FLUSHALL**. Cada export se **AUDITA** (`shifthandover.acta.exported` con folio + hash).
- **(f) Alcance = export PDF a secas** (sin verificador de hash aparte).
- **(g) Locale/branding = es-CL fijo + TZ del calendario del nodo** (`snapshot.scope.timezone`, fallback `America/Santiago`), no el locale del usuario: es un documento oficial reproducible. Documento en **modo claro premium** (imprimible/legible), gradiente de marca solo en la banda del encabezado.

### 2026-06-19 · Fase 5 · Slice 3 — streaming del resumen de turno por IA (forks resueltos)
Plan por capas aprobado; 3 forks por `AskUserQuestion`:
- **Transporte/persistencia (a/b/c):** SSE con `@Sse` de NestJS + token por `?access_token=` (espejo del stream de la campanita del Bloque N), endpoint **dedicado** `GET /shift-handover/:id/summary/stream` (request-scoped; NO reusa `NotificationRealtimeService`, que es un bus multi-usuario). El GET solo **genera + streamea + registra** (`AiGenerationLog`); **no persiste**. La persistencia es **solo al completar**, vía el `PATCH :id/summary` ya auditado, extendido con `summaryProvider` para guardar el texto IA + su procedencia sin re-generar. *Motivo:* reusa el precedente SSE del repo y el `EventSource` del front; mantener la mutación en el PATCH preserva la auditoría y deja el texto firmable editable por el humano.
- **Prompt → v2 (e):** se sube `SUMMARY_PROMPT_VERSION` a `v2` (estructura/priorización + **guarda anti-inyección**: un dato del bloque DATOS nunca altera las reglas), manteniendo grounding estricto. *Motivo:* el prompt ya estaba versionado y decoplado; el cambio es aislado y auditable.
- **Scrubber de PII (AC-IA-7) (f):** función pura `scrubGrounding` en `@lyra/llm` (correo/RUT/teléfono chilenos) aplicada **solo si la generación EGRESA de la planta** (`egressesPlant`: `anthropic` siempre; `openai-compatible` solo si la baseUrl NO es local/privada; `none` nunca). *Motivo:* on-prem local conserva fidelidad y no hay fuga; la nube no recibe PII en texto libre. Cubre parcialmente AC-IA-7 (deuda restante: scrubber más completo + nombres).
- **Degradación (AC-IA-5):** el stream emite `done{degraded:true}` ante fallo del proveedor; el cockpit cae a la ruta **no-streaming** existente (`regenerate+useAi`), que a su vez degrada a determinista. Cancelación por `AbortController` atado al cierre del `EventSource`.
- **Alcance (g):** Slice 3 = streaming a secas; **export PDF diferido a Slice 4**.

### 2026-06-18 · Fase 5 · Slice 2 — IA ADMINISTRABLE desde la app (CONSTRUIDO) + resumen de turno por IA

**Estado:** ✅ construido y verificado (`feat/ia-administrable`). Reemplaza la nota "ANOTADÍSIMO — NO construido" de más abajo.

**Forks resueltos con el dueño (4 por `AskUserQuestion` + 3 recomendados sin objeción):**
- **(a) Almacenamiento de la config = tabla DEDICADA `AiSettings`** (no en `SystemSettings` singleton como el SMTP). *Elección del dueño* sobre la recomendación (singleton): entidad propia, más aislada/extensible. Se conserva el mismo blindaje del SMTP: `apiKeyEnc` cifrada AES-256-GCM + write-only (`keySet`), `.env` solo fallback (`configuredAt` null ⇒ source=env).
- **(b) Un proveedor ACTIVO global** (no por capacidad). La interfaz `@lyra/llm` recibe la "capacidad" como contexto para que Fase 6 (RAG/insights) pueda override después, pero hoy resuelve un único proveedor. Evita *parametrizar por parametrizar*.
- **(c) Alcance = Slice 2 COMPLETO** (fundación `@lyra/llm` + config cifrada + Probar + permiso + auditoría + tab UI + resumen de turno por IA). Es el WoW.
- **(d) Adapters = `none` + `anthropic` + `openai-compatible`** (este último cubre Ollama/vLLM/LM Studio/OpenAI/DeepSeek por `baseURL`).
- **(e) Registro = tabla `AiGenerationLog`** (provider/model/tokens/latencyMs/status/handoverId, append-only) para gobernanza de costo. *Recomendado, no objetado.*
- **(f) Streaming del resumen = DIFERIDO a Slice 3.** El brief es corto (pocos segundos); no-streaming con spinner es más simple y robusto; `@lyra/llm` queda listo para agregar `generateSummaryStream` sin reescribir a los consumidores. *Explicado al dueño y aceptado.*
- **(g) Modelos por defecto (editables):** nube **`claude-opus-4-8`** (default Anthropic; `claude-sonnet-4-6` opción de costo); local **`qwen2.5:7b-instruct`** vía Ollama `http://localhost:11434/v1` (fuerte en español, on-prem). *Propuesta del agente.*

**Arquitectura (mejor que ruta-bus):** `@lyra/llm` **decoplado de `@lyra/contracts`** (recibe `fallbackText`+`grounding` genéricos, no conoce el dominio del cambio de turno ⇒ reusable por Fase 6). Adapter `anthropic` sin `thinking`/`effort` para servir CUALQUIER modelo que el admin configure sin 400. Prompt **VERSIONADO** (`SUMMARY_PROMPT_VERSION`). Gateway `AiService` con **degradación elegante** a determinista (AC-IA-5) y registro de costo. Permiso nuevo **`ai:config`** (cat. 88→89). Migración aditiva `20260618010000_add_ai_admin`.

**Bugfix latente del Slice 1 (descubierto por el smoke F2):** `updateSummary` recompilaba el cockpit con `toCompileScope(handover, null)` ⇒ `nodeName=""`, por lo que el resumen regenerado decía "Entrega de … en **.**". Ahora resuelve el nombre del nodo (lookup a `OrgNode`) como hace `toDetail`. Afectaba tanto al determinista como al grounding de la IA.

**Criterios de aceptación IA cumplidos:** AC-IA-1 (none primero) · AC-IA-2 (grounding por construcción: el smoke verifica que el prompt enviado contiene el bloque DATOS y el nodo) · AC-IA-3 (crudo determinista siempre visible vía `<details>` + etiqueta "generado por IA · revisar") · AC-IA-4 (firma humana Part 11, la IA solo produce texto) · AC-IA-5 (degradación a none + aviso) · AC-IA-6 (local = sin fuga; documentado por proveedor en el contrato y la UI) · AC-IA-7 (prompt versionado, sin secretos, clave cifrada/write-only; **deuda: scrubber de PII explícito**).

---

### 2026-06-18 · Fase 5 — Cambio de turno (Shift Handover) · Slice 1 (núcleo, sin IA)

**Contexto:** la Fase 4 (Incidencias) quedó completa. La entrega de turno es un proceso CRÍTICO de seguridad de proceso
(HSE-UK *Effective Shift Handover* OTO 96 003 + HSG48; CCPS/AIChE *Conduct of Operations*; lecciones CSB de **Texas City 2005**
y **Piper Alpha 1988**, donde la comunicación de relevo falló y los pendientes se cayeron entre turnos). Referentes de producto:
Hexagon **J5**, AVEVA **eSOMS**, Honeywell. Lyra WatchLog ya CAPTURA todo lo del turno (entradas, excepciones, incidencias con
CAPA/investigación/reportes/SLA, rondas, lecturas fuera de umbral); la Fase 5 lo convierte en una **entrega firmada de dos partes**.

**Forks resueltos con el dueño (los 4 por `AskUserQuestion` + 2 recomendados sin objeción):**
- **(a) Alcance** = por **NODO operativo (nivel configurable) + TURNO + día operacional** (no por planta). El turno y su ventana
  salen del `OperationalCalendar` que ya existe (asignado por nodo, heredado por ruta). Coherente con el ABAC por área (J5/eSOMS).
- **(b) Modelo/ciclo** = **entidad dedicada `ShiftHandover` con ciclo FIJO de 3 pasos** (COMPILING → SIGNED_OUT → ACKNOWLEDGED),
  reusando **solo el mecanismo de firma Part 11** (`ReauthService` + significado + método), **NO** un `WorkflowDefinition`
  configurable. *Objeción del agente aceptada (challenge-dont-please):* el relevo de dos partes es un protocolo que el estándar fija;
  volverlo parametrizable sería *parametrizar por parametrizar*. Incidencias sí reusó `WorkflowDefinition` porque su ciclo es
  configurable por tipo; aquí no.
- **(c) Compilación** = **vista EN VIVO mientras se arma + snapshot CONGELADO al firmar** (`snapshot Json`), patrón de inmutabilidad
  de incidencias (versión congelada). Integridad/auditoría.
- **(d) Baton** = **objetos abiertos del alcance auto-incluidos + ítems manuales, ambos ruedan turno a turno hasta cerrarse**. Las
  notas MANUALES se copian como `CARRIED` de la entrega previa; los objetos de dominio (incidencias/CAPA/reportes abiertos) se
  re-derivan vivos en cada `compile` (`syncBaton`: agrega los nuevos, cierra los que su objeto ya cerró). Es el control que evita el
  patrón Piper Alpha/Texas City.
- **(e) Permisos** = **4 nuevos** `shifthandover:view/:compile/:sign/:acknowledge` + `module:handover:view` (segregación de funciones:
  quien compila/firma —saliente— NO es quien reconoce —entrante—; el servicio bloquea acknowledge si `outgoingById === userId`).
  Catálogo **83 → 88**. (db:seed + Redis FLUSHALL aplicado.)
- **(f) Notificación** = reuso del **Bloque N**: evento `handover.ready` (correo + campanita) al **rol que puede recibir el turno
  entrante en ese nodo** (`shifthandover:acknowledge`, ABAC por nodo, excluido el saliente) + deep link `/cambio-turno?handoverId=`.

**Resumen del turno (Slice 1) = DETERMINISTA (`provider = none`):** `buildDeterministicSummary` (helper PURO en `@lyra/contracts`)
arma un brief profesional por secciones desde el cockpit compilado. Todo lo que aparece es rastreable al dato crudo mostrado al lado
(pre-cumple el grounding de la IA). La IA generativa se enchufa DESPUÉS detrás de la misma columna (Slice 3), sin tocar la fuente.

**Implementación:** contratos `@lyra/contracts/shift-handover` (estados, cockpit, baton, requests, helpers PUROS
`resolveHandoverWindow`/`buildDeterministicSummary`/`shiftHandoverCode` + specs); modelo `ShiftHandover`/`ShiftHandoverItem`/
`ShiftHandoverActivity` (migración aditiva `20260618000000_add_shift_handover`, se removió del diff un DROP INDEX ajeno de drift);
`ShiftHandoverCompilerService` (ABAC = subárbol del nodo ∩ nodos accesibles; entradas selladas/excepciones/incidencias/CAPA+reportes/
rondas en la ventana); `ShiftHandoverService` (ciclo + firma + baton + resumen); `handover.ready` en el resolver del Bloque N. Web:
cockpit **maestro-detalle de 3 zonas** (nav de secciones · contenido · panel de resumen + sign-off + baton) con sub-modo "Recibo",
historial read-only con ABAC, identidad Lyra. Tests: contracts **326** · API **247** · smoke `smoke-cambio-turno.py` **29/29** +
regresión (notificaciones 18 · notif-inapp 18 · incidencias 32 · sla 25). **Diferido (BACKLOG):** disciplinas/categorías por taxonomía
de catálogo (hoy secciones por tipo de dato) · export PDF (Slice 4) · firma con hash criptográfico del payload (hoy reauth + método).

---

### 2026-06-18 · Fase 5 · Slice 2 (ANOTADÍSIMO — NO construido aún) — IA administrable desde la app (config en BD, no por `.env`)

> **Estado: COMPROMETIDO, pendiente.** Se documenta COMPLETO aquí y en `BACKLOG.md` para que no se pierda nada. **No se construyó en
> la sesión del Slice 1.**

**Referencia a replicar (estudiada):** `G:\Development\ruta-bus` —
`apps/api/src/modules/analytics/analytics.config.service.ts` + `analytics.assistant.service.ts` +
`apps/admin/.../ai-assistant/page.tsx`. Patrón: **config de IA en BD (NO `.env`)**, API keys **write-only**, **abstracción de
proveedor** (anthropic nativo + openai-compatible por `baseURL` = OpenAI/DeepSeek/Ollama/vLLM…), grounding por construcción y ABAC
forzado en el servidor. **Replicarlo PERO MEJOR**, reusando NUESTRO precedente: el **SMTP administrable del Bloque N**
(`SystemSettings.email*` cifrado + write-only + "probar conexión" + gate `notification:config` + tab en `/configuracion`).

**Spec a construir en el Slice 2:**
- **(a) Abstracción en `packages/` (`@lyra/llm`):** interfaz `LlmProvider` (`generateSummary`/`complete`, streaming opcional) +
  adapters `none` (determinista/offline, el del Slice 1) · `anthropic` (claude-opus-4-8 / claude-sonnet-4-6 vía SDK) ·
  `local`+`openai-compatible` (`baseURL` → Ollama/vLLM; la data NO sale de la planta). Reutilizable por el resumen de turno y por
  insights/RAG de Fase 6.
- **(b) Config en BD (env solo fallback):** `enabled`/`provider`/`model`/`baseURL`; API keys **CIFRADAS** en reposo
  (`EncryptionService`/`APP_ENC_KEY`, como el password SMTP) y **WRITE-ONLY** (la UI expone `keySet` booleano; vacío = no cambiar).
  Patrón `getPublic()`/`getResolved()`/`set()`.
- **(c)** Botón **"PROBAR"** por proveedor (espejo del SMTP). Permiso nuevo **`ai:config`** (gate). Cambios **AUDITADOS**; cada
  generación registrada (proveedor/modelo/tokens/latencia) para gobernanza de costo.
- **(d) UI:** tab **"Inteligencia Artificial"** en `/configuracion` (DS de Lyra, espejo de "Correo saliente").

**Mejoras sobre ruta-bus (explícitas):** modo `none`/offline de primera clase · keys cifradas · permiso + auditoría · abstracción en
packages reutilizable · degradación elegante a `none` · on-prem explícito.

**Criterios de aceptación — IA (gating del Slice de IA):**
- **AC-IA-1 · MODO `none` PRIMERO:** el cambio de turno funciona COMPLETO sin IA (ya garantizado por el Slice 1). Los adapters
  anthropic/local se construyen ENCIMA de eso.
- **AC-IA-2 · GROUNDING:** el resumen IA se genera SOLO con la data estructurada del snapshot CONGELADO, pasada explícitamente en el
  prompt; sin tools, sin BD, sin internet para "buscar"; toda cifra rastreable a la data cruda mostrada al lado. (El tool-use de
  ruta-bus se reserva para el analista conversacional de Fase 6.)
- **AC-IA-3 · CRUDO SIEMPRE VISIBLE** junto al resumen; etiqueta "generado por IA · revisar"; nunca reemplaza datos.
- **AC-IA-4 · FIRMA EL HUMANO, NO LA IA** (Part 11 con reauth).
- **AC-IA-5 · DEGRADACIÓN ELEGANTE:** si el proveedor falla/timeout/sin clave, cae a `none` con aviso, sin romper.
- **AC-IA-6 · ON-PREM / SIN FUGA:** en `local` no sale data a internet; en `none`/`local` sin key ni red externa; documenta qué sale y
  a dónde por proveedor.
- **AC-IA-7 · GUARDAS:** redacción/omisión de PII; límite de tokens/longitud; prompt versionado; sin secretos en repo; si un dato no
  está en la data compilada, no aparece en el resumen.

**Secuencia completa de la Fase 5:** Slice 1 (núcleo, resumen `none`) ✅ → **Slice 2** (fundación `@lyra/llm` + IA administrable) →
Slice 3 (resumen IA generativo grounded + streaming) → Slice 4 (export PDF para la carpeta/regulador).

---

### 2026-06-17 · Incidencias 4.5 — Dashboard de incidencias (analítica read-only, ABAC por nodo)

**Contexto:** la Fase 4 ya tenía todos los datos para analítica (severidad/riesgo, lifecycle, originType, nodo/equipo/turno, flujo
congelado, `dueAt` + doble "vencida" del §21, CAPA, investigación, reportabilidad, timeline). Faltaba la **vista analítica**: KPIs de
periodo, tendencias y desgloses. Con 4.5 la Fase 4 queda COMPLETA.

**Contraste con el estándar (no se inventan métricas):** ISO 45001 §9.1 (seguimiento/medición), ISO 9001 §10.2 (CAPA + eficacia),
ISO 14224 / ITIL (MTTR, *time-to-resolution*), Pareto 80/20 (priorización), ITIL SLA attainment (% dentro de plazo), fiabilidad
(reincidencia = fallas repetidas). **IF/IG (índices de frecuencia/gravedad) quedan DIFERIDOS**: requieren **HH trabajadas**, fuente
que HOY no existe (ya en BACKLOG/ROADMAP). No se fabrican.

**Decisión (forks resueltos con el dueño; los contestados explícitamente + los recomendados no objetados):**
- **(a) Ubicación = página propia `/incidencias/dashboard`** con botón "Dashboard" en el header de `/incidencias` (patrón de
  `/incidencias/catalogos` y `/seguridad/*`); **NO va en el sidebar** (evita el doble-resaltado por `startsWith`).
- **(b) Agregación = un endpoint dedicado `GET /incidents/dashboard`** que agrega SIEMPRE en el backend (Prisma `groupBy` para
  distribuciones/reincidencia; `$queryRaw` acotado para la tendencia bucketizada, MTTR y cumplimiento de SLA). **Nunca se traen filas
  al cliente.** Reusa el MISMO cálculo de ABAC por nodo que `IncidentsService.buildWhere` (un `IncidentDashboardService` replica la
  resolución de `getAccessibleNodeIds` ∩ `orgNodeIds`). Rango por `createdFrom`/`createdTo` (añadidos también a la query de la lista,
  aditivo). **Zona horaria de PLANTA** para el bucketing (`PLANT_TIME_ZONE`, default `America/Santiago`) — single-tenant ⇒ una sola
  TZ, no se infiere del navegador. **KPIs de estado vivo** (open/critical/overdue/permanencia/CAPA/reportes) NO se acotan al rango
  (son estado "ahora"); **created/closed/distribuciones/tendencia/reincidencia** SÍ son del periodo.
- **(c) Librería = Recharts** (ya era dependencia del web y la usa el `prototipo.tsx`; MIT, on-prem sin CDN, composable). Colores
  **vía tokens del DS** (`var(--color-…)`) para respetar claro/oscuro — NO los hex en duro del prototipo.
- **(d) Export = CSV** de las tablas agregadas (cliente, desde el payload ya traído; BOM + CRLF para Excel). **PNG diferido** (deuda).
- **(e) Permisos = SIN permiso nuevo, reusa `incident:view`.** El dashboard no expone nada que el usuario no vea ya (mismo ABAC); un
  `incident:dashboard:view`/`incident:export` sería parametrizar sin driver (YAGNI) y obligaría a FLUSHALL. **Sin migración** (es
  lectura/agregación; el único cambio de contrato es aditivo: `createdFrom`/`createdTo` + el contrato del dashboard).
- **(f) Drill-down = SÍ:** clic en barra/segmento/KPI navega a `/incidencias` con el querystring (rango + dimensión). La lista se
  SIEMBRA desde el querystring (tipo/severidad/lifecycle/flags como controles; origen/equipo/nodo/rango como pase directo). Si llega
  rango sin lifecycle explícito, la lista muestra TODAS (no solo abiertas) para coincidir con el conteo de la barra.

**Métricas confirmadas:** conteos de periodo; tendencia creación vs cierre; MTTR (MTTA diferido); distribución por tipo (Pareto)/
severidad/nodo/equipo/turno/origen; reincidencia (mismo tipo+equipo en ventana, default 30 días); CAPA abiertas/vencidas/eficacia;
reportes pendientes/vencidos; cumplimiento de SLA de plazo.

---

### 2026-06-17 · Incidencias 4.4 — SLA de resolución + avisos de plazo + escalamiento (reusa el Bloque N)

**Contexto:** las incidencias guardaban `dueAt` y lo mostraban, pero el KPI/filtro "vencidas" usaba `slaBreached` (permanencia de
estado por `WorkflowState.maxStayMinutes`), NO `dueAt` — desalineado (auditoría §21). No había aviso al vencer plazos (incidencia,
CAPA, reporte 4.3) ni escalamiento. El épico de notificaciones avanzadas (correo + campanita INAPP + SSE) ya estaba COMPLETO, así
que la cañería de avisos existe y se reusa (NO se reinventa el motor).

**Contraste con el estándar:** ITIL/ServiceNow = *time-to-resolution* con breach + escalación; PagerDuty = *escalation policy* de N
niveles con timeout por nivel; Jira = SLA con calendarios + evento de breach. Para single-tenant on-prem se adopta el modelo
ServiceNow simplificado ("SLA light"): un plazo de resolución + recordatorio recurrente + **1 nivel** de escalamiento. Se DESCARTAN
los tiers PagerDuty (sobre-ingeniería; puerta abierta en BACKLOG).

**Decisión (6 forks resueltos con el dueño, todos en la recomendación):**
- **(a) Escalamiento = re-aviso recurrente (diario) + 1 nivel configurable.** `IncidentType.escalationAfterMinutes Int?` +
  `escalationRoleId String?` (FK Role SetNull). Cuando una incidencia sigue vencida más allá de `dueAt + escalationAfterMinutes`, el
  aviso de plazo se manda TAMBIÉN al rol de escalamiento (nivel 1). El recordatorio se repite con bucket diario en el `dedupeKey`.
- **(b) `dueAt` auto + override + editable con auditoría.** Al crear, `dueAt = createdAt + IncidentType.resolutionDueMinutes` SOLO si
  no se pasó `dueAt` explícito (el override gana). El reloj arranca en el reporte (`createdAt`), no en `occurredAt`. Editable con
  `incident:edit` → entrada de timeline `DUE_CHANGED` + auditoría.
- **(c) Destinatarios.** `incident.sla.breached`/`incident.overdue` → asignado (owner) + usuarios de los roles del estado actual
  (ABAC) + rol de escalamiento en nivel 1; **sin externos** (los externos son para reportes a la autoridad); fallback a suscripciones
  si no hay nada (consistente con `round.overdue`). `incident.action.overdue` → responsable/rol de la acción + owner.
  `incident.report.due` → owner + roles del estado.
- **(d) Sweeper.** El tick reusa el ÚNICO cron del proyecto (`NotificationWorkerService.sweep()`); la DETECCIÓN vive en incidencias
  (`IncidentSlaService.findBreaches()`, espejo de `schedules.findOverdueOccurrenceIds()`). Una sola infra de scheduling.
- **(e) Nombres (cambio de contrato).** Dos conceptos separados: **Permanencia** (`slaBreached`, `maxStayMinutes`) vs **Plazo**
  (`overdue`/`resolutionOverdue`, `dueAt`). `IncidentStats` parte en `slaBreached` (permanencia) + `overdue` (resolución, antes
  significaba permanencia); query gana `overdueOnly`; flag de fila `resolutionOverdue`. KPI/filtro mostrados aparte.
- **(f) Permisos.** SIN permiso nuevo: config SLA en `IncidentType` (`incidentcatalog:manage`), edición de `dueAt` (`incident:edit`),
  avisos por ownership/preferencias. Catálogo se queda en **83 ⇒ sin FLUSHALL**.

**Eventos nuevos (4, `origin: derived`):** `incident.sla.breached`, `incident.overdue`, `incident.action.overdue`,
`incident.report.due` (este último salda la deuda de aviso de plazo de 4.3). Cada uno con sus variables whitelisteadas + seed de
plantilla. La campanita ya navega a la incidencia (`deepLinkForEntity("Incident")→/incidencias?incidentId=`); action/report se ligan
a su incidencia padre.

**Motivo:** un solo plazo de resolución claro + recordatorio + 1 nivel cubre el grueso de minería/manufactura/energía sin densificar
el sistema para empresas chicas (todo es config por `IncidentType`, apagable). Reusar el motor del Bloque N evita duplicar
outbox/worker/resolver/dedup/ABAC. Migración aditiva; rama `feat/incidencias-sla`.

---

### 2026-06-17 · Shell — Riel colapsado: magnificación tipo dock + tooltip por PORTAL (fix de recorte)

**Contexto:** en el menú colapsado a riel de íconos no se distinguía qué era cada ícono. **Causa raíz:** el `Tooltip` de `@lyra/ui`
es CSS puro (burbuja `position:absolute` dentro del flujo); como vive dentro de `.sidebarScroll` —que tiene `overflow` para
scrollear el riel— la burbuja que sale hacia la derecha quedaba **recortada por el overflow** y nunca se veía. El dueño además pidió
que el ícono **se magnificara al hover, estilo dock de macOS**.

**Decisión:** para el riel se usa un componente propio `RailNavItem` (en `Sidebar.tsx`) que:
1. **Magnifica el ícono al hover/foco** (`transform: scale(1.4)` con resorte `cubic-bezier(0.34,1.56,0.64,1)`), sin caja de fondo en
   hover (solo el activo conserva su gradiente) para que el protagonismo lo lleve el ícono.
2. **Renderiza el tooltip por PORTAL** a `document.body` con `position: fixed` posicionado desde el `getBoundingClientRect()` del
   botón (a la derecha, centrado vertical). Al ser portal **escapa del `overflow`** del scroll y siempre se ve. (No se tocó el
   `Tooltip` compartido, que sigue sirviendo donde no hay contenedor con overflow, p. ej. el topbar.)

**Motivo:** el tooltip CSS no puede escapar de un ancestro con `overflow` sin portal; un portal con posición fija calculada es la
solución estándar y robusta. La magnificación da el feedback "premium" pedido sin librerías. Solo frontend del shell; sin
contratos/API/migración.

---

### 2026-06-17 · UI — Drawers laterales más anchos (default 480→540; incidencias 720, excepciones 660)

**Contexto:** el dueño encontró estrechos los paneles laterales (drawers), en particular el **detalle de incidencia** (5 pestañas
Resumen/Acciones/Investigación/Reportes/Actividad que desbordaban en horizontal) y la percepción de que **todos** los drawers eran
angostos. **El "porqué":** cada drawer fija su propio `width` y los valores eran conservadores (default **480**, varios en 500–560);
no había tope oculto (el `Drawer` admite hasta `max-width: 94vw`).

**Decisión:** subir el **default del componente `Drawer`** (`packages/ui`) de **480→540** (beneficia a todos los que no fijan ancho:
usuarios, horarios, nodos, columnas, peek, builder…) y ensanchar los **content-rich**: **incidencias 560→720** (para que las 5
pestañas quepan sin scroll horizontal) y **excepciones 560→660**. Los drawers de formulario simple conservan su ancho propio
(500–560). Sigue respetando `max-width: 94vw` (responsive en pantallas chicas).

**Motivo:** dar aire a los detalles ricos en contenido sin inflar los formularios simples; el ancho vive en una sola fuente por
drawer y el default cubre el grueso. Solo frontend; sin contratos/API/migración.

---

### 2026-06-17 · UI global — Scrollbar fina/premium en TODA la app (no parchar pantalla por pantalla)

**Contexto:** la scrollbar gruesa del sistema se veía mal en el riel colapsado del sidebar y también en la fila de pestañas del drawer
de incidencias (`.drawerTabs`). Iban dos reportes del dueño del mismo problema; previsiblemente aparece en más pantallas con scroll.

**Decisión:** en vez de estilar la scrollbar caso por caso, se define **una regla GLOBAL** en `apps/watchlog-web/src/styles/main.css`
(`html { scrollbar-width: thin; scrollbar-color: … }` + `::-webkit-scrollbar`/`-thumb`/`-track`/`-corner`) usando **tokens del DS**
(`--color-border-subtle` / `--color-border-accent`), por lo que **se adapta a claro/oscuro**. El thumb usa el truco
`border: 2px solid transparent` + `background-clip: padding-box` para adelgazarlo visualmente y dejarlo "flotando" (look premium). Se
**eliminó la scrollbar a medida del sidebar** (`.sidebarScroll`) para que herede la global y todo quede uniforme; componentes con riel
propio pueden afinarla con una regla más específica si hace falta.

**Motivo:** consistencia visual de una sola fuente, sin whack-a-mole por pantalla; arregla el sidebar y las pestañas de incidencias y
cualquier otro contenedor con scroll de una sola vez. Solo CSS; cero impacto funcional.

---

### 2026-06-17 · Shell — Sidebar premium (más legible/ancho) + Favoritos movidos al topbar

**Contexto:** feedback del dueño sobre el sidebar agrupado recién entregado: los nombres de los módulos se veían pequeños y el menú
estrecho; pidió que se viera "premium". Además sugirió mover **Favoritos a un menú propio arriba, en el topbar**.

**Decisión:**
1. **Premium del sidebar (solo CSS/presentación):** ancho 244→**288px**; texto de módulos 13.5→**14.5px** (+ `letter-spacing`
   leve); ítem activo a peso **600**; íconos de ítem 18→**19px**; encabezados de grupo 10.5→**11px**; más aire vertical (padding de
   ítem y de encabezado). **Riel colapsado:** scrollbar fina/discreta (`scrollbar-width:thin` + `::-webkit-scrollbar` 6px) en vez de
   la barra gruesa del sistema + `overflow-x:hidden`; íconos compactos (riel 72px, ítem 42px) para minimizar el scroll. Sin cambios de
   estructura ni de tokens (sigue claro/oscuro; el alto táctil pleno 44px+ se reserva al menú expandido).
2. **Favoritos al topbar (`FavoritesMenu`):** se **saca la sección Favoritos del sidebar** y se expone como un **menú-estrella en el
   topbar** (junto a la campanita), reusando el `Menu` premium de `@lyra/ui`. La estrella se rellena cuando hay ≥1 favorito; el menú
   lista los favoritos (navegar al hacer clic) y permite **desfijar** desde el `trailing` (estrella con `stopPropagation`, sin navegar
   ni cerrar). **Se MANTIENE la estrella por ítem en el sidebar para FIJAR** → el modelo es "fijo desde el lateral, accedo desde
   arriba". Reusa `favorites-store` y `routeByPath` (sin store nuevo).

**Motivo:** (1) un menú lateral con tipografía más grande y más ancho lee mejor en terreno/tablet y se siente premium sin recargar;
(2) mover Favoritos al topbar libera el lateral de una lista dinámica que competía con los grupos fijos y deja los accesos rápidos
siempre a un clic, junto al resto de utilidades del topbar (tema, idioma, notificaciones, perfil). Solo frontend del shell; sin
permisos/rutas/contratos/API/migración.

---

### 2026-06-17 · Shell — Menú lateral reestructurado en GRUPOS colapsables (Operación · Diseño y datos · Administración · Favoritos)

**Contexto:** el sidebar creció a una lista plana de 16 ítems con scrollbar; se veía poco profesional y no escalaba. Objetivo:
agruparlo con encabezados de sección (estilo SAP Fiori / ServiceNow / Linear) para que quepa sin scroll. Solo UI del shell; sin tocar
permisos, rutas ni gateo.

**Decisión (4 forks resueltos con el dueño):**
1. **Esquema de grupos (a):** 3 grupos fijos + Favoritos dinámico, en este orden:
   - **Operación:** Inicio · Bitácoras · Nueva entrada · Mis rondas · Incidencias · Excepciones.
   - **Diseño y datos:** Plantillas · Flujos · Datos de referencia · Estructura · Programación de rondas · Calendario operacional · Calendario fiscal.
   - **Administración:** Seguridad · Notificaciones · Configuración.
   - **Favoritos:** se mantiene (sección dinámica al final, encabezado estático).
   *Matices ofrecidos y descartados por el dueño:* sacar "Inicio" suelto arriba (patrón Linear); mover "Estructura" a Administración.
   Se eligió **el esquema tal cual** (Inicio en Operación, Estructura en Diseño y datos).
2. **Colapsables persistidos (b) [recomendado y aceptado]:** cada grupo pliega/despliega; el estado vive en `ui-store`
   (`collapsedNavGroups`, persistido en localStorage). **Invariante:** el grupo del ítem activo se muestra SIEMPRE, aunque esté
   plegado (`open = !collapsed || hasActive`) — nunca se esconde el módulo en el que estás. Encabezados discretos con chevron + `aria-expanded`.
3. **Riel colapsado (c):** en modo solo-iconos NO hay encabezados ni plegado; los grupos se separan con **divisores sutiles**
   (`.navDivider`) y cada ítem se identifica por **tooltip** (ya existía `Tooltip side="right"`). Favoritos = un clúster más tras un divisor.
4. **Modelo (d) [recomendado y aceptado]:** se agrega `group?: NavGroupId` a `NavRoute` + un arreglo ordenado `NAV_GROUPS` (id +
   labelKey) + helper puro `buildNavGroups(visibleRoutes)` que respeta el orden de `NAV_GROUPS` (grupos) y de `SIDEBAR_ROUTES`
   (ítems). **`SIDEBAR_ROUTES`, `routeForPath`, `routeByPath` quedan INTACTOS** → command palette (⌘K), pestañas y breadcrumbs no se
   tocan (leen de `navigation.ts` sin enterarse de los grupos). Un grupo sin ítems visibles por permiso **no se renderiza**.

**Motivo:** un menú agrupado por ciclo de trabajo (operar → diseñar → administrar) es el estándar de los shells enterprise; reduce la
carga cognitiva, elimina el scroll y se ve profesional. Mantener el modelo aditivo (`group` opcional + helper) evita acoplar el resto
del shell a los grupos y deja la agrupación como pura presentación. Solo frontend; sin contratos/API/migración.

---

### 2026-06-17 · Incidencias — FMEA/RPN + RCA dinámico por riesgo = DIFERIDO (opt-in, solo bajo demanda regulada)

**Contexto:** contraste del módulo de Incidencias contra el estándar de un "RCA/CAPA nativo" (FMEA con gravedad×ocurrencia×detección
⇒ índice de prioridad de riesgo RPN; "modularidad dinámica" que despliega módulos de investigación profunda al cruzar un umbral de
riesgo calculado). Hoy tenemos: 5 Porqués (4.2b), CAPA (4.2a), reportabilidad (4.3), severidad eje único 1–5 + `potentialSeverity`, y
matriz de riesgo `RISK_MATRIX` (ISO 31000) como TIPO DE CAMPO del formulario.

**Decisión (dueño): NO construir FMEA/RPN ni el escalamiento dinámico del RCA por ahora.** Motivos:
1. **FMEA/RPN es de nicho** (farma/aeroespacial/automoción — IATF 16949, ISO 14971). Para minería/manufactura general/energía, el eje
   de severidad 1–5 + `potentialSeverity` + `RISK_MATRIX` cubren el grueso del valor sin la pesadez de 3 factores + cálculo de RPN.
2. **Riesgo de densificar** el sistema y volverlo difícil de usar para empresas pequeñas.
3. El costo real no es FMEA en sí, sino la **modularidad dinámica por puntaje en caliente** (motor de umbrales + reactividad de UI).

**Por qué la capacidad NO densifica si se difiere bien:** todo el módulo es configurable por `IncidentType`
(`requiresInvestigation`/`requiresCapa`/`reportableDefault`/`mandatory`). La densidad la produce *obligar* el flujo, no *tenerlo*: una
empresa chica lo deja apagado. Por eso agregar capacidades no perjudica a quien no las activa — y por eso se difiere sin culpa.

**Cómo entraría a futuro (si un cliente regulado lo exige):** como método de investigación adicional —el enum
`INCIDENT_INVESTIGATION_METHODS` ya es extensible sin re-migrar— + un tipo de incidencia que lo exija, reutilizando la lógica de
bloqueo de cierre ya existente. Cero impacto para quien no lo active. Registrado como **Fase 4.6 candidata** en BACKLOG §2.

---

### 2026-06-17 · Notificaciones avanzadas · Fase B — canal IN-APP (campanita) + tiempo real (CIERRA EL ÉPICO)

Última fase del épico: cada aviso, además del correo, genera una notificación IN-APP por destinatario, con campanita en el Topbar
y bandeja en `/mis-notificaciones`, en tiempo real. **4 forks presentados con recomendación; el dueño aceptó las cuatro:**

- **(1) Canal IN-APP ON por defecto** para todos los eventos (opt-out por evento×canal en "Mis preferencias", igual que el correo).
  Motivo: la campanita es alto valor / bajo costo y debe ser descubrible; el usuario igual puede silenciar por evento. La ausencia
  de preferencia = recibir (ambos canales ON). `NotificationPreference` ya es por canal; el resolver respeta `mode=OFF` por canal.
- **(2) Tiempo real = SSE + fallback poll.** `@Sse()` nativo de NestJS, un stream por usuario; payload LIVIANO (`{type:"inbox",
  unread}`, un "nudge" + contador), el cliente refetchea por el endpoint autenticado (no viaja contenido sensible por el stream);
  heartbeat ~25 s para sobrevivir proxies. react-query `refetchInterval` (60 s) queda SIEMPRE activo como respaldo (proxies que
  cortan SSE / navegadores sin soporte). Motivo: instantáneo cuando conecta, robusto cuando no; on-prem sin SaaS. **Auth del SSE:**
  `EventSource` no manda header `Authorization` ⇒ el access token va por `?access_token=` y se verifica en el handler (ruta
  `@Public` para saltar el guard global, auth CONFINADA a ese endpoint — no se relaja el guard global). Ver SECURITY.md.
- **(3) Deep link DERIVADO en el front** (`deepLinkForEntity(relatedEntityType, id)` en `@lyra/contracts`), sin columna nueva en el
  outbox. Motivo: el outbox ya guarda `relatedEntityType`/`relatedEntityId`; materializar URLs en BD acoplaría el backend a rutas
  del SPA y exigiría migración. Mapeo: `LogEntry`→`/bitacoras/:id`, `RoundOccurrence`→`/mis-rondas`, `Incident`→`/incidencias`.
- **(4) Retención = purga diaria de in-app LEÍDAS > 90 días** (`@Cron`, umbral como constante). Motivo: evita crecimiento sin tope
  del inbox sin añadir todavía un setting (se puede parametrizar luego). Las no leídas y el correo no se purgan en esta fase.

**Otras decisiones de implementación:**
- **Almacenamiento in-app = extender `NotificationOutbox` con `readAt`** (fork (b) del épico), NO una tabla `NotificationInbox`
  dedicada. Motivo: el INAPP es "otra entrega del mismo aviso"; reusa outbox/worker/dedup/auditoría. Índice
  `(recipientUserId, channel, readAt)` para "mis no leídas".
- **`dedupeKey` incluye el canal** (`evento|eventId|canal|destinatario`). Motivo: un mismo destinatario recibe email E in-app del
  mismo suceso; sin el canal en la clave, el segundo INSERT chocaría el índice único.
- **Canales por registro** (`NotificationChannelRegistry` con `EmailChannel` + `InAppChannel`), el worker enruta `row.channel`.
  `InAppChannel.send` es no-op (la fila ES la notificación). **SUPPRESSED solo aplica a EMAIL** si el correo está apagado (la in-app
  no depende del SMTP). El nudge SSE lo emite el worker tras marcar SENT (el canal se mantiene puro).
- **Sin permiso nuevo:** ver/leer MIS notificaciones in-app = **ownership** (patrón SavedView/preferencias). Sin gate de catálogo.
- **Auditoría:** la in-app NO audita entrega ni lectura (la fila de outbox es el registro inmutable; la lectura es dato propio del
  dueño). El correo conserva `notification.email.sent`.
- **Sin plantilla INAPP propia** en esta fase: la in-app reusa el contenido renderizado de la plantilla EMAIL (el enum
  `NotificationTemplate.channel` deja la puerta abierta a una plantilla INAPP dedicada a futuro).
- **Deuda anotada:** el bus SSE es in-memory (single-process). Escalar a varias instancias exigirá respaldarlo en Redis pub/sub.

### 2026-06-17 · Notificaciones avanzadas · Fase A UI — 3 forks de UX + exponer el default de sistema

Construcción de la UI de la Fase A (el backend ya estaba en `main`). **3 forks de UX presentados con recomendación; el dueño
aceptó las tres:**

- **(1) Editor de aviso por transición = INLINE en la tarjeta de la transición** (no Drawer). Motivo: la tarjeta de la transición
  ya es el hogar de toda su config (firma, MFA, roles); un Drawer rompería ese patrón y añadiría un clic. El bloque de aviso se
  oculta hasta activar el toggle "Notificar", así que no recarga la tarjeta. Componente `TransitionNotifyEditor`.
- **(2) Default de sistema = pestaña "Notificaciones" PROPIA en `/configuracion`** (no dentro de "Correo saliente"). Motivo: el
  toggle es gobernanza de NOTIFICACIONES, no configuración SMTP; mezclarlo en la pestaña de correo confundiría conceptos. La
  pestaña queda lista para crecer (futuros defaults). Visibilidad = `module:settings:view`; el toggle se deshabilita sin
  `settings:manage` (mismo patrón que Seguridad/Bitácoras).
- **(3) Correos externos = CHIPS con validación de formato** (no textarea de uno-por-línea). Motivo: feedback inmediato (evita
  correos malformados), chips removibles, look premium. Banner de advertencia explícito "saltan permisos, se auditan".

**Backend mínimo (no re-arquitectura):** el resolver ya leía `SystemSettings.notifyTransitionDefaultDestinationRoles`, pero la
columna NO estaba expuesta en el contrato/servicio de settings. Se agregó a `systemSettingsSchema` +
`updateSystemSettingsRequestSchema` + `SettingsService` (select/defaults/get/auditShape/update), **reusando `GET`/`PATCH /settings`**
(gate `settings:manage`) — sin endpoint nuevo. Test: sección E del smoke (round-trip + gate 403).

**Atajo "copiar destinatarios de otra transición":** puro frontend (lo pidió el dueño para no hacer burocrático administrar
varias transiciones). Copia roles/usuarios/3 checks/externos de otra transición del mismo flujo; NO toca `enabled` ni la plantilla.

**Decisión derivada (deuda, BACKLOG):** el picker de USUARIOS del editor consume `/security/users`; un gestor de flujos sin ese
permiso ve la lista vacía. Se mitigó con `retry:false` (degradación elegante; la autorización real la hace el backend al resolver),
y se anotó como deuda un endpoint `user-options` decoplado (patrón `role-options` de 2.3.1). No se resuelve ahora para no inflar
el alcance de la Fase A UI.

---

### 2026-06-17 · Notificaciones avanzadas (épico) — plan por fases + 7 forks — 🚧 EN CURSO (Fase A)

**Contexto y secuencia (registro honesto):** la sesión arrancó con objetivo **Fase 4.4 (SLA/escalamiento + aviso de plazo)**.
Recomendé con fundamento un **slice mínimo** para 4.4 (eventos `incident.*` + sweeper + resolvers, reusando el motor) y **diferir el
épico** de notificaciones avanzadas (es ortogonal: personaliza avisos de bitácoras, no de incidencias; y es multi-fase). El dueño,
tras una objeción explícita de mi parte (le señalé el choque con la regla "un objetivo por sesión" y que 4.4 no depende del épico),
**reafirmó construir el épico COMPLETO (Fase A + B) primero y luego la 4.4**. Decisión del dueño, acatada. Para respetar la regla de
sesión, **esta sesión se acota a Fase A** (cierra sola); **Fase B (campanita/SSE)** y **4.4** quedan como sesiones siguientes (BACKLOG).

**Objetivo del épico:** personalizar los avisos a la medida de cada bitácora/flujo + canal in-app. Estándar de referencia:
ServiceNow (Notifications con trigger por evento/transición + "who will receive" + email templates), Jira Automation
(`on transition` → send email con smart values `{{issue.field}}`), SAP PM/Maximo (workflow notifications + roles/listas +
communication templates con sustitución de campos).

**Fases:** **A (solo email)** = disparo por transición + plantillas por bitácora + comodines `{{campo.<key>}}` + defaults de
sistema. **B** = canal in-app (campanita) + SSE. Cada una cierra sola.

**Los 7 forks (resueltos con el dueño):**
- **(a) Destinatarios = EMBEBIDOS en la transición, congelados en la versión del flujo** (regla estructurada: roles / usuarios /
  autor / ejecutor / roles del estado destino / correos externos; los roles se resuelven a usuarios EN VIVO al enviar). **NO**
  `DistributionList` reusable. *Motivo:* el flujo ya congela roles/firma como dato en la versión ⇒ el aviso viaja con la versión
  (reproducible/auditable); una lista reusable es viva (afectaría versiones publicadas), añade entidad + pantalla + permiso nuevo
  (FLUSHALL) e indirección. **Atajo de UX en el builder:** "copiar la configuración de destinatarios de OTRA transición" (puro
  frontend, sin costo de modelo) para que administrar varias transiciones no sea burocrático. `DistributionList` → BACKLOG como
  azúcar futura sobre la misma regla.
- **(b) In-app = extender `NotificationOutbox` con `readAt`** (Fase B), NO tabla `NotificationInbox` dedicada. Reusa el pipeline de
  2 etapas + dedup + `relatedEntity`; el canal (`INAPP`) ya namespacea las filas; el sender INAPP marca entregado sin SMTP.
- **(c) Real-time de la campanita = SSE** (decisión del dueño; mi recomendación era poll por simplicidad on-prem). Se implementará
  con **fallback a poll** (`react-query refetchInterval`) para robustez si la conexión SSE cae. Fase B.
- **(d) Correos EXTERNOS = SÍ en Fase A, con gating explícito y auditados** (lista estática por transición, marcada "externa: salta
  ABAC"). Cubre la necesidad real (contratista/autoridad/on-call). **Variables de campo:** el editor de la plantilla ad-hoc ofrece
  los campos de la versión **PUBLICADA** de esa bitácora (keys estables); los valores salen de la versión **congelada** de la
  entrada; campo ausente ⇒ vacío (degradación elegante).
- **(e) Defaults de sistema = mínimo:** un toggle global en `SystemSettings` "las transiciones sin config notifican a los roles del
  estado destino (sí/no)", con **default = conducta actual** (no rompe nada).
- **(f) `entry.transition` = COEXISTE:** sin config explícita en la transición cae al default de sistema (= conducta actual: roles
  del estado destino); con config, la transición manda. Migración sin sorpresas.
- **(g) Fases A→B** (ya confirmado).

**Permisos:** config de notificación de transición = `workflow:manage` (es parte del flujo); plantillas por bitácora =
`notiftemplate:manage`; ver/leer mis in-app = **ownership** (sin permiso, patrón SavedView). **SIN permiso nuevo ⇒ sin FLUSHALL.**
**Migraciones aditivas:** `WorkflowTransition` (+config de aviso), `NotificationTemplate` (+`templateId`, cambia el unique),
`NotificationChannel` (+`INAPP`, Fase B), `NotificationOutbox` (+`readAt`, Fase B).

---

### 2026-06-17 · Incidencias — Fase 4.3 (Reportabilidad configurable) — ✅ IMPLEMENTADO

Que una incidencia pueda gatillar uno o más REPORTES a una autoridad/obligación, con plazo y seguimiento de estado, de forma
**configurable y transversal** (NADA de SERNAGEOMIN/DS 132/HSE-Chile hardcodeado en la lógica; los marcos concretos son
CATÁLOGO/seed por vertical). Honra el flag `IncidentType.reportableDefault` (hoy inerte), igual que 4.2a honró `requiresCapa`
y 4.2b `requiresInvestigation`. Forks resueltos con el dueño (recomendación aprobada):

- **Modelo dedicado (catálogo + materialización), NO algo liviano.** Catálogo **`ReportingObligation`** (espejo de
  `IncidentType`: key/name/description/`authorityName`/`defaultDueMinutes`/`appliesToTypeIds[]` [vacío = todos]/`minSeverity?`/
  `mandatory`/`active`/`sortOrder`/`deletedAt`) + materialización **`IncidentReport`** (N por incidencia, espejo de
  `IncidentAction`: folio `REP-####`, **snapshot** de obligationName/authorityName/mandatory para integridad histórica, `status`,
  `dueAt`, evidencia de envío `submittedAt`/`submittedById`/`externalFolio`/`notes`, anulación sin borrado físico, `evidence`
  reservado). Motivo: auditabilidad, multiplicidad real y la consulta "incidencias con reporte vencido" sale de un índice
  `(status, dueAt)`. Un JSON en `Incident` no daría nada de eso.
- **BLOQUEA el cierre gobernado por `ReportingObligation.mandatory` (catálogo), NO por un flag de tipo.** Objeción fundamentada:
  el reporte a la autoridad y el cierre interno son ciclos de vida distintos; bloquear el cierre contra la confirmación externa
  puede mantener incidencias abiertas o forzar cierres falsos, **pero** tampoco debe poderse "cerrar y olvidar" una obligación
  legal pendiente. Espejo preciso de CAPA (`mandatory` por acción): el `mandatory` vive en la obligación (el marco regulatorio
  declara si es vinculante). Al cerrar, un reporte de obligación `mandatory` aún **PENDING bloquea** (400); se resuelve
  enviándolo (SUBMITTED) o marcándolo **NOT_APPLICABLE** con motivo. Las no obligatorias solo **alertan**. Helper puro
  autoritativo `reportsBlockingClose` (espejo de `blockingActionsForClose`/`investigationBlocksClose`); guarda
  `assertNoBlockingReports` en `IncidentsService.transition` junto a las de CAPA/investigación. `reportableDefault` queda como
  DISPARADOR de materialización (al crear, si la incidencia es reportable, se materializan las obligaciones aplicables por
  tipo/severidad vía helper puro `applicableObligationsFor`).
- **SIN permiso nuevo (catálogo se queda en 83).** Aplico la disciplina de 4.2b: permiso solo si hay segregación real (como
  ejecutar≠verificar en CAPA), que aquí no existe. Catálogo de obligaciones → reusa **`incidentcatalog:manage`** (es otro
  catálogo); reportes sobre una incidencia → reusa **`incident:edit`**. (Evita el gotcha del FLUSHALL: 0 permisos nuevos.)
- **"VENCIDO" se DERIVA** (`status=PENDING AND dueAt<now`), sin estado persistido ni cron — espejo del SLA y las rondas
  (`isReportOverdue`). KPI/filtro/flag de fila derivados (`reportOverdue`/`reportOverdueOnly` en stats/listado). La unificación
  de "vencida" del módulo (Incident.dueAt vs WorkflowState.maxStayMinutes, §21) se DIFIERE a 4.4 (SLA/escalamiento), para no
  inflar 4.3.
- **UI:** pestaña **Reportes** en el `IncidentDetailDrawer` (ya a pestañas) + **sub-pestaña Obligaciones** en
  `/incidencias/catalogos` (Tipos · Categorías · Obligaciones, no ruta nueva) + KPI clicable **"Reporte vencido"** y chip de fila
  en `/incidencias`.
- **NOTIFICACIÓN de plazo DIFERIDA a 4.4:** el dato/estado (`dueAt`/derivación de vencido) queda listo; el AVISO "por
  vencer/vencido" depende del épico de **notificaciones avanzadas** (pendiente) y se construye en 4.4.

Migración aditiva `20260617140000_add_incident_reporting` (2 tablas + 1 enum + relación en `Incident`; sin BOM; `db execute` +
`migrate resolve` por el drift del historial). Seed: 2 obligaciones de EJEMPLO genéricas (idempotentes, marcadas "(ejemplo)").
Blindaje: contracts spec (`reporting.spec.ts`, 12) + API spec (`incident-reports.service.spec.ts`, 6) + smoke en vivo
`scripts/smoke-incidencias-reportabilidad.py` 31/31 + regresión de incidencias 32/32 · capa 23/23 · investigación 27/27 ·
excepciones 39/39 · reglas 21/21 · catálogos 16/16. **Siguiente: 4.4 — SLA/escalamiento + aviso de plazo (depende del épico de
notificaciones avanzadas).**

---

### 2026-06-17 · Llenado — guard de regresión de permisos por sección/campo — ✅ IMPLEMENTADO

**Incidente:** el dueño reportó que en *Bitácora de Turno — Demo Completa* la autorización por sección/campo no se aplicaba
(cualquiera podía llenar). **Diagnóstico (verificado en vivo):** el backend (`saveSection` + `versionInclude` con `roles`) y la
guarda `sectionBlockedReasonFor` estaban **intactos y funcionando** (probado: un usuario solo-Administrador recibe 403 en
secciones gateadas de la versión vigente v12). La causa REAL fue **datos**: durante las reescrituras del Form Builder (Fase
2.1.x), el round-trip detalle→modelo→payload **dejó de propagar los `roleIds` de SECCIÓN** al guardar/publicar (los de CAMPO
sobrevivieron). Las versiones **v3–v11** de esa plantilla se publicaron con 0 roles de sección; como cada entrada CONGELA su
versión, las entradas creadas sobre ellas quedaron sin gate de sección. v1/v2/v12 sí los tienen (v12 = roles re-asignados con el
builder ya corregido). **Nadie lo notó porque NO había test del round-trip.**

**Decisión — defensa en profundidad en CI (`pnpm test`), no guardas de runtime** (un check que bloquee publicar "una sección que
antes tenía roles y ahora no" daría falsos positivos al quitar roles legítimamente):
- **Frontend** `builder-model.spec.ts`: afirma que `detailToEditState`→`editStateToDraftRequest` conserva `roleIds` de sección y
  de campo (la superficie EXACTA que regresó). Primeros tests del paquete web.
- **Backend** `templates.service.spec.ts`: afirma que `saveDraft` mapea `roleIds` → `roles: { create: [...] }` en sección y campo.
- **Smoke en vivo** `scripts/smoke-permisos-seccion.py` 10/10: crea plantilla con rol de sección + override de campo, publica,
  verifica el round-trip de la versión publicada, crea entrada y comprueba el comportamiento (usuario sin rol → 403; con rol →
  200; override de campo → 403).

**Entradas legacy (v3–v11):** NO se corrigen mutando versiones inmutables (rompería la integridad GxP, y es a propósito). Para la
demo, lo prolijo es recrear esas entradas sobre v12. Anotado en BACKLOG.

---

### 2026-06-17 · Incidencias — Fase 4.2b (Investigación de causa raíz · 5 Porqués) — ✅ IMPLEMENTADO

Investigación de causa raíz configurable y transversal, honrando el flag `IncidentType.requiresInvestigation` (igual que
4.2a honró `requiresCapa`). Método inicial **5 Porqués** (Toyota/Lean/ISO 45001 §10.2): NO ICAM/TapRooT/Bowtie (sería
sobreingeniería; el enum de método deja la puerta abierta a agregarlos como plantillas posteriores sin re-migrar). Forks
resueltos con el dueño (en la recomendación aprobada):
- **Modelo dedicado, NO JSON.** Dos entidades aditivas `IncidentInvestigation` (1:1 con `Incident`, `method`/`status`
  DRAFT|COMPLETED/`problemStatement`/`rootCauseSummary`/conducido-por/completado-por) + `IncidentInvestigationStep` (los
  "porqués" ordenados: `order`/`statement`/`answer`/`isRootCause`). Motivo: coherente con `IncidentAction`/
  `IncidentExceptionLink` (entidades de primer orden auditables); permite **ligar una causa raíz a una acción CAPA por FK**,
  auditar por fila y consultar ("incidencias sin investigación cerrada"). Un JSON opaco no daría nada de eso.
- **Conecta con CAPA:** columna aditiva `IncidentAction.investigationStepId?` (ref. blanda `SetNull`) = la causa raíz que la
  acción ATIENDE. Opcional (las acciones de contención inmediata no nacen de la investigación). Cierra el lazo
  problema→causa→acción (ISO 9001 §10.2 / CAPA). El backend valida que el paso pertenezca a la MISMA incidencia.
- **Bloquea el cierre, configurable (espejo de 4.2a):** si el tipo declara `requiresInvestigation`, no se pasa a estado
  FINAL sin una investigación **COMPLETED con ≥1 causa raíz** (`assertInvestigationComplete` en `transition`; helper puro
  autoritativo `investigationBlocksClose` compartido back↔front). Si el tipo no la exige, nunca bloquea (registrable opcional).
  Se exige una causa raíz FORMAL (paso marcado), no solo texto narrativo: es lo que ata las acciones CAPA.
- **SIN permiso nuevo — reusa `incident:edit`** (catálogo se queda en **83**). Contraste con 4.2a, que SÍ creó permisos por
  la segregación de funciones ejecutar≠verificar. En la investigación NO hay esa segregación: documentar la causa raíz es
  parte de la gestión de la incidencia. Crear `incident:investigation:manage` sería parametrizar por parametrizar
  (CLAUDE.md). Un futuro gate de aprobación QA de la investigación sí justificaría un permiso (deuda, no MVP).
- **Drawer a PESTAÑAS:** con Origen+Excepciones+Acciones+Investigación+Comentarios+Timeline el drawer inline era larguísimo
  (DECISIONS 4.2a ya lo anticipó). Se pasó a **Resumen · Acciones · Investigación · Actividad** (chips de conteo/aviso: punto
  de alerta cuando hay acciones obligatorias sin resolver o investigación pendiente exigida).
- **Edición en bloque de la cadena:** el upsert REEMPLAZA los pasos (el cliente envía el estado completo; patrón de edición
  de listas del proyecto). Solo en DRAFT (una COMPLETED se reabre primero). `complete`/`reopen` como transiciones explícitas.
  El detalle de la incidencia expone `typeRequiresInvestigation`/`typeRequiresCapa` (para los avisos de la UI).

Migración aditiva `20260617130000_add_incident_investigation` (2 tablas + 2 enums + columna + FKs; aplicada `db execute` +
`migrate resolve` por el drift del historial). Contracts 271 (+8 helpers) · API 234 sin regresión · smoke
`smoke-incidencias-investigacion.py` 27/27 + `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 30/30 sin regresión.
**Siguiente: 4.3 — Reportabilidad configurable.**

---

### 2026-06-17 · Incidencias — Auditoría del módulo + Fase 4.2a (Acciones CAPA) — ✅ IMPLEMENTADO

Tras una **auditoría constructiva** del módulo de Incidencias (pedida por el dueño): el core ya es **genérico/transversal** (tipos/
categorías = datos configurables; severidad 1..5 + ISO 31000; flujo reusado; nada minero hardcodeado — lo minero vive solo en seeds).
La única brecha **P1 funcional** para "seguimiento real, no solo registro" era la gestión de **acciones (CAPA)**. Rumbo de campos por
tipo: **Opción C** (core fijo ahora, campos dinámicos por tipo diferidos). Se construyó **4.2a — Acciones CAPA**. Forks resueltos con
el dueño (en la recomendación):
- **2 permisos nuevos** (`incident:action:manage`, `incident:action:verify`), no reusar `incident:edit`. Motivo: la gestión de
  acciones y la **verificación de eficacia** son responsabilidades distintas; segregación de funciones (quien ejecuta una acción no
  debería auto-verificarla). Cat. **81→83**.
- **Bloqueo de cierre por flag `mandatory` POR ACCIÓN** (no "toda incidencia del tipo debe tener acciones"). Más fino y explícito: el
  usuario marca cuáles acciones son condición de cierre.
- **Verificación de eficacia CONFIGURABLE:** `DONE` basta para cerrar, **salvo** que el tipo declare `requiresCapa` → entonces exige
  `VERIFIED`. Honra el flag `requiresCapa` que ya existía en el catálogo y no hacía nada. Lógica autoritativa compartida back↔front
  (`blockingActionsForClose`).
- **Verificación NO eficaz reabre** la acción a `IN_PROGRESS` (no la deja "verificada"): una acción inefectiva debe re-trabajarse y
  sigue bloqueando el cierre. La verificación efectiva (`VERIFIED`) es la única que libera.
- **`responsibleRoleId` (grupo responsable) incluido ya** a nivel modelo/contrato/API (atiende §7 P2 de la auditoría), aunque el
  **picker de rol en la UI se difiere** (la UI MVP asigna persona). El dato/endpoint ya lo soportan.
- **Evidencia (archivos) DIFERIDA:** se reserva la columna `evidence Json?` (descriptores Ola 3) pero la subida se posterga a un
  follow-up que reusará el `StorageService` de Ola 3. Motivo: cerrar 4.2a con el ciclo CAPA correcto y testeado vale más que media
  cañería MinIO; la narrativa GxP del cierre queda cubierta por las notas de cierre/verificación (texto). Migración única aditiva, sin
  re-migrar al agregar la subida.
- **Sin pestañas en el drawer (todavía):** el bloque de Acciones se suma como sección inline (mismo patrón que Origen/Excepciones/
  Comentarios). Cuando entren Investigación (4.2b) y evidencia, se evaluará pasar el drawer a pestañas.

---

### 2026-06-17 · Incidencias — mantenedor de catálogos (Tipos + Categorías) [UI] — ✅ IMPLEMENTADO

Le pone pantalla a `IncidentType`/`IncidentCategory` (ya configurables en backend). Forks resueltos con el dueño:
- **Ubicación = ruta propia `/incidencias/catalogos`** (no pestaña en `/incidencias` ni sección en `/configuracion`). Motivo:
  gate independiente (`incidentcatalog:manage` ≠ `module:incidents:view` del operador), cohesión con el módulo, y sigue el patrón
  de mantenedores con ruta propia (Flujos, Datos de referencia). **No se agrega al sidebar:** el sidebar resalta por `startsWith`,
  así que un ítem de sub-ruta doble-resaltaría el padre `/incidencias` (mismo motivo por el que `/seguridad/*` no está en el
  sidebar). El acceso es un **botón "Catálogos" en el header de `/incidencias`** (gateado), y la ruta se registra en `navigation.ts`
  con `inSidebar:false` solo para resolver título/pestaña/breadcrumb.
- **`key` editable solo al crear** (read-only en edición). Es la identidad del upsert por key: cambiarla crearía una fila nueva y
  dejaría huérfana la anterior (rompe trazabilidad de incidencias que la referencian).
- **Solo desactivar, sin borrado físico.** Un tipo/categoría está referenciado por incidencias históricas. Desactivar (`active=false`)
  lo retira de los desplegables del alta pero lo preserva en las incidencias que ya lo usan. **No** se bloquea desactivar un tipo con
  incidencias abiertas (desactivar = retirar a futuro; bloquearlo sería sobre-ingeniería).
- **Colisión de key al crear = guarda cliente + server.** El endpoint es upsert por key (el server no distingue crear de actualizar).
  La UI bloquea crear una key ya usada (tiene la lista completa incl. inactivos) **y** el backend devuelve **409** cuando se pide
  `?create=true` sobre una key existente. Defensa en profundidad, server-authoritative. (No se tocó el contrato: la señal viaja por
  query string, no por el body upsert.)
- **Guarda nueva: el flujo por defecto debe estar PUBLICADO** (no solo existir). Se congela al crear una incidencia del tipo; un
  borrador no se puede congelar. El selector solo ofrece publicados; el server lo exige (status PUBLISHED + currentVersionId).
- **Color del tipo = paleta acotada de tokens del DS** (swatches: acentos + severidades), sin campo hex libre. CLAUDE.md prohíbe
  valores en duro; el modelo persiste el hex del token elegido (misma convención que el seed). `CATALOG_COLOR_SWATCHES` centralizado.

Sin permisos nuevos (cat. 81), sin migración, sin cambios de contrato. Smoke `smoke-catalogos-incidencias.py` 16/16 + `smoke-incidencias.py` 30/30.

---

### 2026-06-16 · Incidencias — equipo/activo + fecha del evento en el alta (mínimo ISO 14224) — ✅ IMPLEMENTADO

Follow-up de QA: el modal de alta no exponía el equipo ni la fecha de ocurrencia. Decisiones:
- **Equipo/activo en el alta** (ISO 14224: la incidencia/falla se ata a un ACTIVO, no solo a la ubicación). El modelo y el detalle
  ya lo soportaban; era brecha de UI. Endpoint **propio del módulo** `GET /incidents/equipment-options` (gate `incident:view`, ABAC
  por nodo) en vez de reusar `GET /equipment` o el `references/equipment` de bitácoras: evita exigir `equipment:view`/`logentry:view`
  al que reporta (mismo criterio de auto-suficiencia que el resto del módulo).
- **Herencia del activo desde la bitácora de origen** cuando el reporte es del mismo nodo y no se eligió otro: una incidencia que
  nace de una entrada conserva su activo sin recapturarlo. Solo si coincide el nodo (si no, evita un 400 confuso por equipo fuera de nodo).
- **`occurredAt` (fecha/hora del evento) ≠ `createdAt` (reporte)** — columna nullable nueva. En terreno se reporta tarde; HSE/ISO
  exigen la fecha del suceso. Null = no declarada (la UI/consumidores caen a `createdAt`). Migración aditiva.
- **NO entran al alta (se difieren a triage/investigación, BACKLOG):** matriz de riesgo prob×consec, asignar responsable al crear,
  flag reportable editable, evidencia/adjuntos. Motivo: mantener el alta simple (MVP), esos campos son de gestión posterior.

---

### 2026-06-16 · Fase 4.1.2 — Acción del motor de reglas (diferida vía outbox): forks — ✅ IMPLEMENTADO

2.º corte del motor de reglas (`feat/incidencias-reglas-accion`). Cierra la Fase 4.1. Una regla cruzada puede, al sellar, generar
una excepción RULE o abrir una incidencia. Forks resueltos con el dueño:
1. **`action` como enum aditivo en `CrossRule`** (`none|raiseException|openIncident`), congelado en `TemplateVersion.rules` (JSONB,
   sin migración de reglas), NO una entidad nueva. Motivo: lo simple/aditivo; la acción es parte del diseño inmutable, igual que la
   regla.
2. **Outbox DEDICADO `RuleActionOutbox`, NO reuso de `NotificationEvent`** (fork 1B — el dueño aceptó la objeción del agente).
   Motivo: `NotificationEvent`/dispatcher son específicos de CORREO (whitelist de eventos, resolución de destinatarios, render). "Crear
   un objeto de dominio" ≠ "avisar a alguien": mezclar dos consumidores sobre la misma tabla/columna `status` invita carreras y
   confunde la máquina de estados. Se reusa el PATRÓN (emit in-tx + worker), no la tabla.
3. **Acción evaluada SOLO al SELLAR** (firme), no en provisional. Motivo: la excepción de regla es un hecho del registro firme; el
   WARN en vivo ya da feedback. Evita la tormenta de eventos al guardar por sección.
4. **Creación DIFERIDA vía worker**, no síncrona como los umbrales (fork 3). Motivo (más fuerte que "crash post-commit"):
   **desacoplar dominios de falla** — crear una incidencia es pesado (resuelve flujo, congela versión, link, audita); si fallara
   dentro de la tx del sello haría rollback del sello del operador. Una automatización NO puede bloquear ni revertir el acto firme
   del operador.
5. **`openIncident` = excepción RULE → CONVERTED → incidencia** (no incidencia directa), con **`originType=RULE`** (fork 4B — el
   dueño pidió que la incidencia sea filtrable como "de regla"). Motivo: una sola ruta de proveniencia (toda incidencia automática
   tiene su excepción de origen vía `IncidentExceptionLink`) y a la vez el origen real visible es la regla.
6. **Atribución de SISTEMA = el actor que SELLÓ** (capturado en la orden), reusando `IncidentsService.create` (su ABAC ya cubre el
   nodo: el operador selló ahí) en vez de un principal de sistema con ABAC bypass (fork 5). Motivo: máxima reutilización, sin
   inventar un usuario de sistema; la regla es server-authoritative (congelada en la versión que el operador usó). La excepción RULE
   la crea `ExceptionGeneratorService.createRuleException` (extiende el generador, no se reinventa).
7. **Una regla con acción debe ser `severity=WARN`** (fork 6). Motivo: una regla ERROR bloquea el sello, y la acción ocurre AL
   sellar ⇒ jamás se ejecutaría. `validateRulesDesign` (contrato) y `assertRuleActionsValid` (server, valida además existencia del
   tipo/categoría) lo exigen; el builder fuerza WARN al elegir acción.
8. **`LogEntryException.sectionKey/fieldKey` → NULLABLE** (fork 2). Motivo: una excepción de regla cruzada no ata un campo único; con
   campo null la UI oculta "Corregir" (la corrección es campo-específica) y muestra el mensaje de la regla (`detail`).
9. **`thresholdType=invalid` sigue DIFERIDO** (fork 7). Motivo: no lo produce este corte — las acciones van sobre reglas WARN
   (advisory → `warning`); el tier `invalid` es validación dura que bloquea guardar, y lo que bloquea nunca materializa una excepción.

---

### 2026-06-16 · Fase 4.1.1 — Panel de excepciones en la bitácora (UI): forks UX — ✅ IMPLEMENTADO

Sesión de FRONTEND sobre la capa 4.1.0 (backend ya en `main`). 4 forks de UX resueltos con el dueño (recomendación aceptada salvo
el #4, donde el dueño AMPLIÓ el alcance):
1. **Contenedor = panel INLINE plegable + drawer de detalle por excepción** (no modal, no muro). Motivo: no tapa el formulario,
   escala a N excepciones y reusa el patrón del drawer de Incidencias 4.0.
2. **Al completar una sección con CRÍTICAS: advertir, NO bloquear** (banner con atajos *Revisar/Corregir/Crear incidencia*, deja
   continuar). Motivo: el dato ya es válido; bloquear sería un muro nuevo. El crítico/imposible se prioriza visualmente "Corregir".
3. **Agrupar = selección múltiple** (checkboxes → un solo `convert`/`associate` con `exceptionIds[]`). El backend ya lo soporta.
4. **Bandeja GLOBAL `/excepciones` SÍ entra en esta fase** (el dueño la pidió, no como follow-up): lista paginada con KPIs +
   filtros en una línea + `GridPager` arriba/abajo + menú, gate `module:incidents:view`. Reusa el drawer + acciones del panel.
- **Toque mínimo de backend (aditivo, sin migración):** filtro **`incidentId`** en `exceptionListQuerySchema` + `buildWhere`, para
  poder listar en el detalle de la incidencia las excepciones que la originaron (la lista solo tenía `logEntryId`/`unlinkedOnly`).
- **Deuda asumida:** el toggle `warnRaisesException` se expone SOLO para NUMBER de nivel superior (umbral + tolerancia); para
  CELDAS de TABLE/MATRIX se difiere porque el builder aún NO expone un editor de umbrales por columna (no hay banda a la que ligar
  el toggle). La marca "tiene excepciones" en la grilla `/bitacoras` reusa el indicador `worstThresholdBand` existente; el conteo
  de excepciones abiertas por entrada se difiere (exige que el listado lo devuelva). Sin permisos nuevos (cat. 81).

### 2026-06-16 · Fase 4.1 — Excepciones operacionales desde bitácoras: diseño + forks — 🔵 PLAN APROBADO

Continúa la Fase 4 (Incidencias). Activa la capa explícita **Bitácora → Excepción operacional → Incidencia** y los orígenes
`EXCEPTION`/`RULE` del enum `IncidentOrigin` (ya existían sin uso). Materializa la excepción HOY efímera (`thresholdBand` WARN/CRIT,
reglas WARN) como entidad con estado y triage. **NO se reinventa motor:** reusa `thresholdBandFor`/`effectiveNumberBands`
(`@lyra/contracts/log-entries`), `evaluateCrossRules` (`@lyra/contracts/rules`), el outbox del Bloque N
(`NotificationEmitterService.emit({client})`) y el módulo de Incidencias 4.0.

**Modelo (aditivo, SIN `tenantId` — single-tenant):**
- **`LogEntryException`** — contexto CONGELADO en la detección: origen del dato (`logEntryId` FK Restrict, `templateId`/
  `templateVersionId`, `sectionKey`+label, `fieldKey`+label, `fieldType`, `occurrenceRef?` para celda de TABLE/MATRIX), valor
  (`originalValue` jsonb INMUTABLE, `unit?`, `bandsSnapshot` jsonb), disparador (`triggerKind` THRESHOLD_WARN/THRESHOLD_CRIT/RULE/
  MANUAL, `ruleKey?`/`ruleVersionId?`/`ruleSeverity?`, `thresholdType` warning/critical/invalid), operacional denormalizado
  (`orgNodeId`/`equipmentId?`/`shiftCode?`/`operatorId?`/`detectedAt`/`entrySealedAt?`), triage (`status` OPEN/ACKNOWLEDGED/
  DISMISSED/CONVERTED/CORRECTED + `triagedById?`/`triagedAt?`/`dismissReason?`), corrección GxP (`correctedValue?`/`correctionReason?`/
  `correctedById?`/`correctedAt?` — el original NUNCA se pierde), `incidentId?` denormalizado, `number?` folio `EXC-####` derivado.
- **`IncidentExceptionLink`** (N:1) — una incidencia agrupa varias excepciones (fork 8 de 4.0). Refs blandas, sin borrado físico,
  auditoría inmutable (`AuditLog`).

**Forks resueltos (dueño, recomendación aceptada en los 4):**
1+6. **Gobernanza POR CAMPO** (config `raisesException` en el campo, congelada en la versión): **CRIT siempre** genera excepción,
     **WARN opt-in** por campo. Evita la tormenta de excepciones; coherente con umbrales/`computed` que ya viven en la versión
     inmutable. Toca `FORM_GUIDE.md`.
2. **AMBOS momentos con idempotencia**: provisional al **guardar sección** (donde ya se estampa `thresholdBand`), firme al **sellar**;
   VOID purga las del borrador. Idempotencia por `(logEntryId, fieldKey, occurrenceRef, triggerKind)`. El operador la ve mientras llena.
3. **Acción de regla = excepción pendiente de triage** salvo regla marcada `auto-incident` (raro, opt-in), vía outbox DIFERIDO. *(4.1.2)*
4. **Corrección de valor sellado PERMITIDA** creando excepción `CORRECTED` con original preservado, detrás de permiso + motivo
   (+ MFA opt-in), reusando la ventana de edición / `logentry:write-expired` y `LogEntryFieldChange`. En borrador = edición normal.
5. **Dedup = sugerencia (nunca merge automático)**, default fijo `(orgNodeId, equipmentId, incidentType, 24h)`, configurable luego.

**Alcance MVP:** excepción a nivel de **CAMPO** (no por celda de TABLE/MATRIX — `thresholdBandFor` colapsa a la peor banda;
celda = deuda). **Permisos nuevos** (cat. 77→81): `exception:triage`, `exception:correct`, `exception:dismiss`,
`exception:dismiss-critical` (descarte de crítica = permiso superior); ver = `module:incidents:view`. Tras tocar el catálogo:
`db:seed` + Redis FLUSHALL.

**Plan por subfases (la sesión cierra tras 4.1.0+4.1.1; 4.1.2 = sesión propia):**
- **4.1.0** backend: modelo + migración aditiva + generación síncrona idempotente gobernada por campo + endpoints de triage
  (ack/dismiss/correct/convert/associate/group) + ABAC por nodo + auditoría + smoke backend.
- **4.1.1** UI: panel de excepciones en llenado/visor + acciones + modal convertir prellenado (origen EXCEPTION) + dedup
  (sugerencia) + trazabilidad campo→excepción→incidencia + marca "tiene excepciones" en la grilla de `/bitacoras`.
- **4.1.2** (sesión aparte) acción "abrir incidencia" del motor de reglas: 2.º corte del motor (acción en `CrossRule`,
  congelada en la versión) + emisión vía outbox in-tx + worker que crea excepción/incidencia + smoke.

**Aprobado por el dueño** (los 4 forks de alto impacto cerrados en la recomendación; alcance de sesión = 4.1.0 + 4.1.1).

**🟢 4.1.0 IMPLEMENTADO** (`feat/incidencias-excepciones`): modelo `LogEntryException` + `IncidentExceptionLink` (migración aditiva
`20260616200000_add_log_entry_exceptions`); generación SÍNCRONA reconciliada en `saveSection` (provisional) y al SELLAR
(`submit`/`executeTransition`, firme + `entrySealedAt`), purga de provisionales en `voidEntry`; `ExceptionGeneratorService`
(@Global, Prisma-only, inyectado en `LogEntriesService` como 13.º arg); `ExceptionsService`/controller/module de triage
(list/summary/detail/dedupe-suggestions + acknowledge/dismiss/correct/convert/associate/manual), ABAC por nodo + auditoría;
4 permisos (cat. **77→81**). Smoke `scripts/smoke-excepciones.py` **39/39**. **Desviaciones del diseño (justificadas):**
- **Gobernanza WARN = booleano `config.warnRaisesException`** (no enum 3-modos): CRIT siempre dispara (piso de seguridad, no
  configurable), WARN opt-in. Más simple y expresa exactamente la decisión.
- **`IncidentExceptionLink` se conserva** como join autoritativo CON proveniencia (`linkedById`/`linkedAt`, `@@unique(exceptionId)`
  = N:1) **+ `LogEntryException.incidentId` denormalizado** para filtros rápidos. (Se evaluó quitarlo por ser N:1 puro, pero el
  audit del enlace + futura M:N lo justifican; patrón "denormaliza para query + relación autoritativa" del proyecto.)
- **Excepción a nivel de CAMPO** (no por celda de TABLE/MATRIX): `thresholdBandFor` colapsa a la peor banda; celda = deuda 4.1.x.
- **Idempotencia por `(entrada, campo)`** vía `dedupeKey = thr:{entryId}:{fieldKey}`: una excepción ya triada (CONVERTED/DISMISSED/
  CORRECTED) CONGELA el slot — un re-disparo del mismo campo en la misma entrada no genera otra (no spamea; la decisión humana manda).
- **`exception:dismiss-critical` permiso SEPARADO** (no flag): descartar una crítica exige el permiso superior; el endpoint admite
  cualquiera de los dos (`RequireAnyPermission`) y el servicio exige el específico según `thresholdType`.
- **Corrección de valor**: escribe `LogEntryValue` + `LogEntryFieldChange` (motivo) + re-estampa banda + preserva original; el
  registro criptográfico Part 11 de la corrección = deuda 4.2 (igual que en incidencias 4.0).

**Pendiente: 4.1.1 — panel de excepciones en la bitácora (UI)** + **4.1.2 — acción "abrir incidencia" del motor de reglas (diferida)**.

---

### 2026-06-16 · Fase 4 — Módulo de Incidencias: investigación + diseño + plan por fases — 🔵 PLAN APROBADO

Sesión de investigación (no se programó nada hasta aprobar). El dueño aprobó los 4 forks gating en su opción **recomendada** y
confirmó **single-tenant**. Investigación sintetizada: EHS (Intelex/Cority/Enablon/Sphera/VelocityEHS/Gensuite/EcoOnline/Ideagen)
converge en *intake→triage→investigación→CAPA→verificación→cierre* y separa **evento/observación** de **incidente registrable**
(valida la capa de excepción); severidad real vs **potencial de gravedad (MPL)**; **CAPA con verificación de eficacia**;
reportabilidad por flags. ITSM (ServiceNow/Jira): workflow-como-dato, kanban por estado, SLA por estado, "major incident" =
flujo aparte. EAM (SAP PM/Maximo): notification→WO ligada al activo (ISO 14224); la OT es **frontera de integración futura**. RCA:
**5 Porqués** en MVP, ICAM (minería) como plantilla de investigación posterior. Chile: SERNAGEOMIN **DS 132** (reporte de graves/
fatales), **Ley 16.744** + mutualidades (**DIAT/DIEP**), **DS 40**; CTP/STP/near-miss/condición insegura/ambiental; **IF/IG**
(requieren HH trabajadas, dato que HOY no existe → diferido a 4.5).

**Principio central:** capa explícita **Bitácora → Excepción operacional → Incidencia** (no conectar bitácora→incidencia de forma
simplista). Cuatro tiers mapeados a lo que YA existe: validación de dato (`validateFieldValue`+reglas ERROR, ya bloquea), excepción
(`thresholdBand`/reglas WARN, hoy efímera → **se materializa como `LogEntryException` en 4.1**), incidencia (`Incident`+workflow),
incidente mayor (workflow dedicado+escalamiento).

**Forks resueltos (recomendación aceptada):**
1. **Excepción = entidad propia** `LogEntryException` (no solo evento en timeline) — necesita estado/triage/corrección/link. *(4.1)*
2. **Flujo = reusar `WorkflowDefinition`** (no dedicado) — ya tiene estados/transiciones/roles/SLA/firma Part 11. *(4.0)*
3. **CAPA = `IncidentAction`** (sub-tareas) en MVP, evolución a entidad rica después. *(4.2)*
4. **Kanban = estados del workflow como columnas** (config). *(4.0)*
5. **Auto-creación = evento DIFERIDO** (no síncrona) — reusa el outbox transaccional del Bloque N (emite in-tx, worker crea); no
   bloquea el guardado ni crea incidencias para borradores que luego se anulan (VOID). Hard-stop crítico = opt-in raro. *(4.1)*
6. **RCA MVP = 5 Porqués** (no ICAM completo); ICAM = plantilla configurable. *(4.2/4.3)*
7. **Formulario de incidencia = campos fijos + extra por tipo (JSONB validado)**, NO reusar el form-builder completo en MVP (es la
   trampa de scope; acopla a la parte más pesada del código). El form-builder se reserva para los formularios de **investigación**. *(4.0/4.3)*
8. **Agrupar N excepciones en una incidencia** (1:N), no 1:1. *(4.1)*
9. **Asociar excepción a incidencia existente** (sí, con dedup por sugerencia). *(4.1)*
10. **Flags regulatorios** = booleano `reportable` simple en 4.0; gobernanza regulatoria completa (SERNAGEOMIN/mutualidad/DIAT/DIEP) en **4.3**.
11. **Generación de OT** = integración posterior (solo `externalRef` reservado), no MVP.
12. **Catálogos = entidades dedicadas** `IncidentType`/`IncidentCategory` con flags de comportamiento (workflow default, requiere
    investigación/CAPA, reportable) + **severidad escala 1–5 existente** + **riesgo vía `RISK_MATRIX`/`riskLevelFor`**. No reusar
    `ReferenceList` puro (su metadata jsonb no expresa bien las FK de comportamiento ni el orden semántico).
13. **Dato inválido = depende del tier**: imposible (tier 1) bloquea guardar; fuera de umbral (tier 2) permite con justificación + excepción. *(4.1)*
14. **Cierre con firma = configurable por transición** (reusa `requireSignature` del workflow), no obligatorio. *(disponible desde 4.0)*

**SINGLE-TENANT confirmado:** se quita `tenantId` de TODO el modelo de Incidencias (el prompt lo pedía, pero contradice la decisión
fijada del proyecto). Aislamiento por **nodo/plantilla (ABAC)**, no por tenant. Migración aditiva, sin reset, timeline append-only,
**sin borrado físico** (anulación/cancelación con motivo). ②③④ defaults aplicados: firma vía workflow disponible sin obligar · IF/IG → 4.5 · `reportable` booleano simple.

**Plan por fases (cada una cierra sola):** **4.0** núcleo (Incident + catálogos + manual + link desde entrada + workflow reusado +
kanban + lista premium + ABAC + auditoría) · **4.1** excepciones operacionales (LogEntryException + panel + convertir/asociar/agrupar/
descartar/corregir + dedup + acción "abrir incidencia" del motor de reglas) · **4.2** investigación 5-Porqués + CAPA + firma de cierre ·
**4.3** HSE Chile/minería (clasificación + reportables + DIAT/DIEP + ICAM) · **4.4** SLA + notificaciones + escalamiento (← roza el
épico de **notificaciones avanzadas**, `docs/prompts/notificaciones-avanzadas.md`) · **4.5** dashboard/indicadores (IF/IG con HH).

**Primera fase a construir = 4.0** (esta sesión).

---

### 2026-06-16 · Bloque N — Hardening premium de Notificaciones (config SMTP en BD + editor de plantillas) — 🔵 PLAN APROBADO (`feat/notif-hardening`)

Dos mejoras pedidas por el dueño antes de Fase 4, sobre el módulo de Notificaciones. Referencia revisada: `G:\Development\ruta-bus`
(módulo email: config SMTP en BD + presets + probar envío) — se SUPERA en seguridad (la referencia guarda la contraseña en CLARO).

**#1 — Pantalla de configuración del correo saliente (SMTP en BD).**
- Config persistida en **`SystemSettings`** (singleton tipado; columnas `email*` aditivas), `.env` como **fallback de arranque**; la UI
  indica `source: db|env`. Se aplica **sin reiniciar** (el `SmtpEmailService` resuelve desde BD con caché + invalidación por *firma*
  del transporte). *Motivo:* impensable manejar el transporte solo por `.env`; el admin debe configurarlo en caliente.
- **Contraseña SMTP cifrada en reposo** (`EncryptionService` AES), **write-only** (nunca vuelve a la UI; solo `passwordSet`). *Mejora
  de seguridad sobre la referencia* (OWASP ASVS: credenciales cifradas en reposo).
- **Presets de proveedor + diccionario de pistas** (Gmail/Workspace · M365 · Amazon SES · SendGrid · Mailpit dev · Personalizado).
- **Probar conexión** (`verify()`) y **Probar envío** (correo de prueba con los valores del form sin guardar; muestra el error real
  del SMTP). Toggle **"Correo activado"** (apagado ⇒ sender marca SUPPRESSED, no rompe el flujo).
- **Permiso DEDICADO `notification:config`** (least-privilege, separable en la matriz de roles; catálogo **67→68**) — NO se reusa
  `settings:manage`. **Ubicación: tab nuevo en `/configuracion`** (decisión del dueño: la config de correo es parte de la
  configuración del SISTEMA, con roles y permisos; sub-tabs si crece), no en `/notificaciones`. Auditoría `email.config.updated/tested`.

**#2 — Editor de plantillas premium.**
- **Vista previa EN VIVO** (split editor/preview) con el MISMO `renderTemplate` (isomorfo, `@lyra/contracts`) + **valores de ejemplo
  por variable** (`sample` nuevo en `NotificationVariableDef`). *Motivo:* el editor actual es ciego (sin preview).
- **Diccionario de variables**: descripción + ejemplo por variable (ya en `NOTIFICATION_EVENTS`), insertar **en el cursor** del campo
  enfocado (asunto/cuerpo), resaltado de variables inválidas.
- **Compartir datos de la bitácora = `{{entry.summary}}`** (decisión del dueño "ambas: summary ahora + dinámicas como fase 2"):
  renderiza los **campos de resumen** ya configurados por plantilla (`gridFieldKeys`, etiqueta+valor+unidad, formato regional). Reusa
  gobernanza existente, cero explosión de modelo. **Variables de campo dinámicas por tipo de formulario** (`{{field.<key>}}`,
  plantillas scoped al form-template) = **DISEÑADO, diferido a fase 2** (BACKLOG).

---

### 2026-06-16 · Bloque N — Notificaciones (motor de avisos por correo) — 🔵 PLAN APROBADO (forks resueltos con el dueño; en implementación, `feat/notificaciones`)

Motor de notificaciones premium **solo correo** (SMS/WhatsApp fuera de alcance), on-prem, fundacional para Fase 4 y para
cablear los avisos diferidos de **rondas vencidas** (2.3) y **SLA** (workflow-sla). Reusa el `EmailService` abstracto existente
como transporte. **Forks resueltos con el dueño + 2 correcciones de correctness de la sesión de Rondas:**

1. **Entrega = Transactional Outbox + worker (NO BullMQ).** *Motivo:* la fila de outbox ES la "bandeja de salida"
   (Req-1/Req-5) — un solo modelo cubre durabilidad + reintentos + auditoría; el `INSERT` va atómico con el cambio de dominio
   (BullMQ `add()` no es transaccional con Postgres ⇒ dual-write); degradación elegante si SMTP cae (PENDING/FAILED+backoff).
   BullMQ queda como swap de escala (Fase 7) tras la misma interfaz `NotificationChannel`. Costo: se suma `@nestjs/schedule`
   (dep oficial mínima) = **primera infra de cron del proyecto** (tick del dispatcher/sender/sweeper).
2. **Plantillas de mensaje CONFIGURABLES en DB** (`NotificationTemplate` por evento×locale×canal, asunto+cuerpo text/html),
   con seed de defaults (funciona out-of-the-box, editable por admin). Render con placeholders `{{var}}` **whitelisteados por
   evento, SIN eval** (misma postura segura que el motor de reglas/AST). Estándar ServiceNow/Jira.
3. **Outbox de 2 ETAPAS (corrección #4):** en la tx del dominio (`executeTransition`) se inserta un `NotificationEvent` mínimo
   (eventKey + payload de ids + dedupeKey); la **resolución de destinatarios + render** ocurren en el dispatcher (tick), NO en la
   tx (la resolución es pesada y no debe alargar la transición). Un crash entre commit y envío no pierde el evento.
4. **Eventos del MVP (4, catálogo extensible en CÓDIGO `NOTIFICATION_EVENTS`):** `round.overdue`, `entry.sla.breached`,
   `entry.transition`, `entry.signature.pending`. Tx-driven (transition/signature) vs DERIVED-driven (overdue/SLA, vía sweeper).
5. **Destinatarios de `round.overdue` = `LogSchedule.responsibleRoleId` (corrección #1), NO el equipo.** Un equipo
   (`equipmentId`) es un ACTIVO, no expande a personas. Reusa la lógica del worklist (2.3.1) invertida: usuarios cuyos roles
   incluyen el `responsibleRoleId` (o fallback nodo+turno si es null), ∩ `scopeFilters` (nodo ∩ plantilla ABAC). La ocurrencia
   denormaliza `orgNodeId`+`templateId` ⇒ el ABAC aplica aunque aún no exista `LogEntry`.
6. **El sweeper GENERA antes de escanear (corrección #2).** Las `RoundOccurrence` se materializan lazy (al listar) + watermark;
   nada corre en `dueAt`. El sweeper invoca el generador idempotente system-level (`generateAllActive`, sin scope de usuario)
   ANTES de buscar vencidas, o las rondas que nadie abrió no existen como filas y se perderían los avisos.
7. **Resolución de destinatarios con ABAC obligatorio:** unión de suscripción explícita ∪ rol-derivado ∪ asignación-derivada
   (roleNames del estado destino para transition; responsibleRole para overdue) → expandir a usuarios → **filtro ABAC**
   (`getAccessibleNodeIds` + alcance de plantilla) → quitar opt-outs/duplicados. NUNCA se notifica algo que el destinatario no
   podría ver (sin fuga de alcance de datos).
8. **Dedup explícito para eventos DERIVED (corrección #5):** una vez por ocurrencia/breach por destinatario —
   `dedupeKey = round.overdue|{occurrenceId}|{userId}` y `entry.sla.breached|{entryId}|{stateSince}|{userId}` (`NotificationOutbox.dedupeKey`
   único). Escalamiento por tiers (recordatorio diario) = diferido.
9. **Preferencias = inmediato + opt-in/out; digest DISEÑADO pero diferido.** `NotificationPreference (userId,eventKey,channel)→mode
   IMMEDIATE|DIGEST|OFF`; el MVP entrega solo IMMEDIATE + permite opt-out y suscripción (opt-in). Dato PERSONAL ⇒ autorización por
   **ownership** (patrón `SavedView`), sin permiso RBAC.
10. **Canal abstracto:** interfaz `NotificationChannel` con solo `EmailChannel` (reusa `EmailService`); `NotificationOutbox.channel`
    (EMAIL hoy; INAPP/SMS futuros sin tocar el motor).
11. **4 permisos nuevos (catálogo 63→67):** `module:notifications:view`, `notiftemplate:manage`, `notification:view-outbox`,
    `notification:admin` (suscripciones/config). *Mis preferencias propias* = ownership, sin permiso.

**Modelo (5 entidades aditivas, sin tocar tablas):** `NotificationEvent` (cola transaccional), `NotificationOutbox` (bandeja +
registro de envío), `NotificationTemplate` (gobernanza viva), `NotificationSubscription` (watchers), `NotificationPreference`
(ownership). Catálogo de eventos en código (no tabla). **UI:** Plantillas · Bandeja de salida · Mis notificaciones.

---

### 2026-06-16 · Fase 2.3.1 — Worklist de rondas (separar PLANIFICAR de EJECUTAR) — ✅ IMPLEMENTADO (`feat/rondas-worklist` → `main`)

Implementación del refinamiento aprobado el 2026-06-15 (diseño abajo). **4 forks resueltos con el dueño antes de codear**
(recomendación aceptada en los 4):

1. **Permiso de ejecución = `round:execute`** (no `schedule:execute`). *Motivo:* el operador actúa sobre la **ronda**
   (`RoundOccurrence`), no sobre el horario; namespace propio de recurso, como `logentry:*` (instancia) vs `template:*`
   (definición). Gatea **ver + ejecutar** "Mis rondas" (un solo permiso, patrón My Maintenance Tasks/Fiori — sin un 4.º
   `round:view`). `schedule:view` (ver el planificador) y `schedule:manage` (CRUD horarios + Generar) quedan como estaban;
   **start/skip se MOVIERON** de `schedule:manage` a `round:execute`. Catálogo **62→63** (grupo `schedules`). El operador además
   necesita `logentry:fill`/`logentry:view` (config de rol) para LLENAR la entrada creada al iniciar.
2. **Rol responsable SINGLE** = `LogSchedule.responsibleRoleId String?` nullable (FK `Role`, `onDelete: SetNull`). *Motivo:*
   estándar SAP PM/Maximo (responsable único por plan); migración aditiva trivial; el fallback `null` cubre "todos del área". A
   join multi-rol = aditivo si surge (BACKLOG).
3. **Responsabilidad EN VIVO (join), no denormalizada al slot.** A diferencia de las dimensiones de tiempo
   (`shiftCode`/`operationalDate`, que no deben cambiar), la responsabilidad es una **asignación** que legítimamente cambia:
   reasignar el rol del horario **re-enruta las pendientes** al worklist correcto de inmediato. Además evita una columna +
   backfill en `RoundOccurrence`. El worklist filtra `schedule: { OR: [{responsibleRoleId: null}, {responsibleRoleId: {in: misRoles}}] }`.
4. **Filtro de turno = suave conmutable** (no muro duro). Default del worklist = `PENDING ∩ nodos accesibles ∩ responsabilidad ∩
   hoy+arrastre vencido` (no oculta lo heredado del turno anterior — entrega ISA-95); toggles **Mi turno** (`shiftCode` =
   `ShiftResolver.resolve(now,null)`, espejo de `myShiftFilter`), **Vencidas** (`dueAt<now`), **Próximas** (`includeUpcoming`).

**Rutas/superficies (recomendaciones aceptadas):** operador en **`/mis-rondas`** (nuevo, gate `round:execute`, clúster operador
tras Bitácoras); planificador **se queda en `/rondas`** relabel **"Programación de rondas"** (gate `schedule:view`), sin acciones
de ejecución (queda CRUD + KPIs + Generar + **monitoreo read-only** de ocurrencias). **Widget en Inicio** (`/`, solo con
`round:execute` y si hay pendientes: "Tienes N rondas pendientes · M vencidas" → `/mis-rondas`, tile estilo Fiori Launchpad). El
**badge de `/bitacoras`** pasó de `schedule:view`/`occurrenceStats`/`→/rondas` a **`round:execute`/`my-rounds/stats`/`→/mis-rondas`**
(es preocupación del operador). **Endpoint propio** `GET /schedules/role-options` (gate `schedule:manage`) para el selector de rol
responsable, **decoplado de `role:read`** (el planificador no necesita el módulo de seguridad). **API:** `GET /schedules/my-rounds`
+ `/my-rounds/stats` (gate `round:execute`), `responsibleRoleId` en create/update (valida que el rol exista). Migración aditiva
`20260615220000_add_schedule_responsible_role`. Contracts **249** · API **234** (sin specs nuevos: el scoping ABAC×rol se prueba
en vivo). **Smoke `smoke-mis-rondas.py` 18/18** (responsable=mi rol/fallback/otro rol; 403 sin permiso; CRUZADO: tras conceder
`round:execute` al rol operador, su worklist trae SU rol + fallback y NO el del admin; overdueOnly; stats; separación de gates) +
`smoke-rondas.py` **21/21** sin regresión. typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (BACKLOG §4).
**Siguiente: Notificaciones (correo).**

---

### 2026-06-15 · Fase 2.3.1 — Separar PLANIFICAR de EJECUTAR rondas (decisión de diseño; implementación = sesión propia)

Feedback del dueño tras ver el MVP de rondas: una sola pantalla `/rondas` que mezcla **crear horarios** (planificador)
con **iniciar/omitir ocurrencias** (operador) "se ve rara" — son **dos trabajos, dos roles, dos momentos**. Correcto y
alineado con el estándar (SAP PM Maintenance Plan vs *My Maintenance Tasks*/Fiori · Maximo PM vs *Start Center → My
Assignments* · j5 schedules vs *shift logbook*): el **planificador** configura de vez en cuando; el **operador** ve una
**lista de trabajo acotada a él, ahora** (su turno · su nodo · su rol) y ejecuta. **Decisiones aprobadas:**

1. **Dos superficies independientes:** (a) **"Mis rondas"** = worklist del OPERADOR (default Hoy/Pendientes; solo
   Iniciar/Continuar/Omitir; idealmente widget en Inicio); (b) **"Programación de rondas"** = admin del PLANIFICADOR (CRUD de
   `LogSchedule`, junto a Calendarios/Plantillas).
2. **Responsabilidad por ROL/posición** (no por persona): el horario declara un **rol responsable** (ej. "Operador de
   Molienda"); el worklist muestra al usuario las rondas de SUS roles ∩ sus nodos accesibles ∩ su turno. *Motivo:* las rondas
   son del PUESTO, no de un individuo (sobreviven a turnos rotativos/ausencias), patrón work center/responsible role de SAP/
   Maximo. Sin rol responsable ⇒ fallback a nodo + turno (visible a todos los del nodo).
3. **Permiso separado:** ejecutar una ronda (iniciar/omitir) ≠ gestionar horarios. `schedule:manage` queda para PLANIFICAR;
   se añade un permiso operativo liviano para EJECUTAR (asignable al rol operador sin darle administración). Nombre/forma exactos
   a resolver al planificar la sesión.
4. **Prioridad:** se hace **ANTES** de Notificaciones (el dueño lo quiere natural antes del demo a cliente); Notificaciones
   queda justo después y encaja (avisar al ROL responsable de su ronda pendiente/vencida).

Pendiente de implementar (sesión 2.3.1): migración aditiva (`LogSchedule.responsibleRoleId?` + permiso nuevo), backend
(filtro del worklist por roles del usuario), web (2 páginas + widget de inicio + menú/i18n), tests + smoke. Ver BACKLOG.

---

### 2026-06-15 · Fase 2.3 — Programación de rondas (`LogSchedule` + `RoundOccurrence`)

Recurrencia que ABRE una entrada de bitácora por ocurrencia (estándar SAP PM Maintenance Plan/calls · IBM Maximo PM/WO ·
Hexagon j5 schedules · ISA-95 shift handover). **Forks confirmados por el dueño (los 4 mayores + menores con default lean):**

1. **Modelo A — entidad `LogSchedule` (horario) + `RoundOccurrence` (ocurrencia materializada).** *Motivo:* el patrón de la
   industria separa el PLAN (mutable, gobernanza viva) del contenido versionado; la ocurrencia es un "slot" liviano
   (PENDING/COMPLETED/SKIPPED/CANCELED) que da lista de pendientes, vencidas y omisión auditada. Se descartó (B) virtual
   (sin id estable por ocurrencia ⇒ no se puede omitir-con-motivo ni auditar el atraso) y (C) recurrencia en `TemplateVersion`
   (reprogramar/pausar obligaría a republicar una versión GxP). El placeholder `recurrenceKind/Config` de `TemplateVersion`
   queda **dormido** (solo round-trip, sin lógica).
2. **Nombre objetado.** El objetivo decía `LogPeriod`; se renombró a **`LogSchedule`/`RoundOccurrence`** porque "LogPeriod"
   choca con `OperationalPeriod` (período fiscal) y "period" ≠ ronda.
3. **Generación lazy idempotente + botón "Generar".** *Motivo:* on-prem sin SaaS ni daemon obligatorio. Un generador
   idempotente materializa `[lastGeneratedThrough, now+horizonDays)` por horario (watermark + `createMany skipDuplicates` sobre
   la única `@@unique(scheduleId, scheduledFor)`); se invoca al listar ocurrencias y por `POST /schedules/generate`. **"Vencida"
   se DERIVA en consulta** (`status=PENDING AND dueAt<now`), espejo de `delayedEntryIds()` del SLA — sin cron que voltee
   estados. Cron `@nestjs/schedule` = mejora opcional de Fase 7.
4. **2 permisos nuevos** `schedule:view` / `schedule:manage` (catálogo **60→62**). *Motivo:* el PLANIFICADOR ≠ el diseñador de
   la plantilla (SAP/Maximo: el maintenance planner es un rol distinto). Llenar la entrada reusa `logentry:create`.
5. **UI superficie propia `/rondas`** (gestión de horarios + ocurrencias pendientes/vencidas) + KPI + badge "rondas vencidas"
   en `/bitacoras` (atajo) + filtros "pendientes/hoy/vencidas". La ocurrencia NO es una entrada ⇒ no se mezcla en la grilla de
   /bitacoras (dos entidades en un keyset sería frágil).
6. **`dueAt = scheduledFor + dueWindowMinutes`** (regla uniforme en los 3 tipos), en vez de derivar la ventana del turno/intervalo.
   *Motivo:* simplicidad y predecibilidad; el editor sugiere un default por tipo.
7. **Forks menores (default lean):** horario apunta a **UN nodo** (multi-nodo/fan-out por equipo tipo Route = follow-up) ·
   equipo **opcional** fijado en el horario · ocurrencias de horario **fijo** (no ancladas a la fecha de cierre real) ·
   **sin completion-requirement** (cada ocurrencia independiente) · MISSED derivado, no persistido.

**Integración del ciclo de vida:** iniciar una ronda crea la ENTRADA real reusando `LogEntriesService.create` (todas las guardas
ABAC/EAM aplican) y la liga por `RoundOccurrence.logEntryId @unique` (una sola FK; `LogEntry` tiene la relación inversa, sin
columna duplicada — se desvió del plan que proponía `LogEntry.scheduleOccurrenceId` para evitar doble fuente de verdad). Al
**sellar** la entrada (submit / transición que sella) la ocurrencia pasa a **COMPLETED**; **anular** (VOID) el borrador la
**desliga** y la devuelve a PENDING. Migración aditiva `20260615200000_add_round_scheduling`. Smoke en vivo `smoke-rondas.py`
**21/21**; contracts **249** · API **234**.

---

### 2026-06-15 · Form Builder: formateo en vivo, paleta de elementos docked y modal "Ver más"

Continuación del pulido del builder (QA del dueño). **(A) Formateo en vivo:** RUT formatea **mientras se teclea** (no al blur)
porque el dueño lo pidió así; número/moneda/porcentaje se editan en plano y se formatean **al desenfocar** (evita los saltos de
cursor de formatear-mientras-tecleas-números); el símbolo de moneda lo da el sufijo (no se duplica); un número simple solo
agrupa miles si el diseñador fijó `decimals` (un año/folio no se agrupa). **Máscara genérica** (`config.mask` aditivo en TEXT,
`applyMask`): `#/A/*` + literales; si hay `format` semántico, manda él. **(#4) La paleta de elementos pasó a panel DOCKED a la
izquierda** (bajo "Diseño") con buscador, reemplazando el popover de la barra; al agregar, el lienzo hace **scroll hasta el
campo creado** (`scrollToUid`). *Motivo:* el dueño quería la paleta siempre visible y que el editor lo llevara al elemento
nuevo. **(#5) Modal "Ver más"** con **demo EN VIVO** (reusa `FieldControl`, el mismo render del llenado) + descripción + caso de
uso + ejemplo; contenido en `field-info.ts` (resumen del FORM_GUIDE), no en i18n, para mantenerlo en un solo lugar editable.
**Nomenclatura:** se adopta **"elemento"** en la UI (en vez de "objeto") por ser más claro para el usuario no técnico (el doc
técnico FORM_GUIDE conserva "objeto"). Sin permisos nuevos, sin migración (solo `mask` aditivo en config jsonb). Contracts 239 ·
API 234. **Diferido (BACKLOG):** máscara aplicada también al valor escaneado por QR; placeholder de ejemplo precargado en la
demo del modal; homologar "elemento" en el FORM_GUIDE si se quiere.

---

### 2026-06-15 · Pulidos de UX del Form Builder (mín/máx caract. + contador, hover de info, footer del drawer, fix Enter)

QA en vivo del dueño sobre el builder. Decisiones: **(1)** El contador de caracteres y los inputs Mín./Máx. se exponen en
Texto corto y Párrafo; el contador es **discreto** (línea atenuada a la derecha, "Quedan N"/ámbar/rojo) para "no invadir" el
formulario. Se agregó `minLength` a Párrafo (TEXT ya lo tenía) en vez de inventar un tipo nuevo. **(2)** El hover de
información se montó en **`SectionCanvas`** tras detectar que `BuilderFieldCard` (era dnd-kit, 2.1.6) quedó como **código
muerto** al adoptarse el motor pointer-events de 2.1.7; va en `.canvasCell` (no `.canvasItem`, `overflow:hidden`) con
`pointer-events:none` para no estorbar arrastre/clic. *Motivo:* reconocer un campo sin pincharlo (estándar de builders tipo
Typeform/Jotform). **Deuda:** borrar `BuilderFieldCard` y su overlay (código muerto) — anotado en BACKLOG. **(3)** Footer del
drawer = **Aceptar** (conserva; igual que la X/Escape, edición en vivo) + **Cancelar** (revierte vía **snapshot del EditState
al abrir**, restaurado con `patchState`). *Motivo:* el panel edita en vivo; un Cancelar honesto necesita snapshot, no solo
cerrar. **(4)** Fix del Enter en listas: el textarea de opciones inline derivaba su `value` de los ítems ya parseados (líneas
vacías filtradas) ⇒ borraba la línea nueva en el re-render; nuevo `LinesTextarea` conserva el texto crudo local y solo propaga
los ítems. *También* destapó y corrigió un fix preexistente: el spec `logbook-query.service` no pasaba `storage` al
constructor de `LogEntriesService` (typecheck API rojo desde Ola 3; vitest no chequea aridad). Sin permisos nuevos, sin
migración. Contracts 239 · API 234. **Siguiente acordado: formateo en vivo (A)** — RUT puntos+guion y número/moneda
miles+decimales (reusan `lib/format`); máscara de texto genérica (`OT-#####`) = paso **B**, diferido.

---

### 2026-06-15 · `docs/FORM_GUIDE.md` — mapa de capacidades del FORMULARIO como doc VIVO

A pedido del dueño (sesión de "entender a cabalidad el formulario"), se crea **`docs/FORM_GUIDE.md`**: mapa en lenguaje simple, con ejemplos de planta, de TODO lo que el formulario puede hacer hoy (catálogo de objetos Olas 1–4 agrupado por la paleta real `basics/selection/evaluation/reference/evidence/structured/presentation` + transversales: layout en grilla, obligatoriedad, condicional, motor de reglas, umbrales/excepción, formato regional, gobernanza). Cada objeto sigue una **plantilla fija de 7 partes** (qué es · para qué · cómo se ve/usa · cómo se configura · qué valida ✅/❌ · ejemplo punta a punta · qué agregar a futuro). *Motivo:* es DISTINTO de `USER_GUIDE.md` (cara al usuario final); `FORM_GUIDE.md` es para **entender el sistema a fondo** (incluye tipos internos, dataType, qué se congela). **Decisión clave: es VIVO** — se actualiza en la misma sesión que cambie/agregue/elimine un objeto o capacidad del formulario (regla §0.3 del propio doc + añadida al cierre de sesión en `CLAUDE.md` paso 4). Fuentes de verdad citadas en el encabezado (`field-types.ts`, `log-entries.ts`, `rules/*`, paleta web). No es desarrollo de features (solo documentación + lectura del código).

---

### 2026-06-15 · Objetos estructurados: umbral por celda → excepción + agregados de tabla en reglas — ✅ IMPLEMENTADO (`feat/tablas-umbral-reglas` → `main`)

Tras la evaluación de brechas con el dueño, dos mejoras para que las tablas/matrices dejen de ser "opacas". **2 forks confirmados (recomendación aceptada en los 2):** (1) alcance del motor sobre tablas = **agregados de COLUMNA** (`sum/avg/min/max/count`), difiriendo las condiciones por FILA (`any/all`); (2) los agregados se usan en **campos calculados Y reglas cruzadas** (mismo evaluador puro).

1. **Umbral por celda → review-by-exception.** `thresholdBandFor` (fuente única del estampado de `LogEntryValue.thresholdBand`) ahora, para `TABLE`/`MATRIX`, devuelve la **PEOR banda** (CRIT>WARN) de sus celdas numéricas (reusa `effectiveNumberBands` por columna/celda; corta en el primer CRIT). *Motivo:* el API ya estampa `thresholdBand` por campo y la grilla/`exceptionsOnly` lo leen ⇒ una lectura crítica dentro de una tabla **marca la entrada como excepción** sin tocar API ni migrar. Estampar banda POR CELDA (no solo a nivel campo) se difiere (no hay columna por-celda; el campo basta para la excepción).

2. **Agregados de columna en el motor de reglas.** Nodo de AST nuevo **`{kind:"col",table,column}`** que SOLO los operadores de agregación expanden a los valores no vacíos de esa columna (fuera de agregación = vacío, degradación elegante). *Motivo del `col` node vs var con path "tabla.col":* explícito y type-safe (el `ExprValue` sigue siendo escalar; la expansión vive dentro de la agregación). `collectVarRefs` añade la dependencia al campo TABLA (orden topológico + resaltado); `collectColRefs` + `validateRulesDesign` rechazan agregar la columna de algo que no es TABLA. Server-authoritative (mismo evaluador back↔front; el valor de la tabla viaja en `valuesByKey`). UI: operando "Columna de tabla" en `ExpressionEditor` (ofrecido solo si hay tablas con columnas numéricas), `RuleFieldRef.columns`, `expressionToInfix` rinde «columna» de Tabla. Sin migración, sin permisos nuevos (catálogo 60). Tests contracts 236 · API 234 · probe en vivo 9/9. **Diferido (BACKLOG):** condiciones por fila (`any/all`), resumen "N filas" en la grilla, agregado como columna visible.

---

### 2026-06-15 · Catálogo de objetos premium — OLA 4 (objetos ESTRUCTURADOS / repetibles) — ✅ IMPLEMENTADO (`feat/objetos-ola4` → `main`)

Cuarta ola: objetos que capturan una **colección de celdas** en un solo campo (el mayor diferenciador del catálogo). **NO estrena infraestructura** (como Olas 1–2): es contratos + render sobre el **render ÚNICO** `FieldControl`↔`FieldGrid`. **4 forks confirmados con el dueño antes de codear** (recomendación aceptada en los 4):

1. **DOS tipos: `TABLE` + `MATRIX` (no 1 unificado, no 3 separados).** `TABLE` cubre la **tabla repetible** (`config.layout=table`) Y el **grupo repetible** (`config.layout=cards`): mismo valor `Array<Record<colKey, escalar>>`, filas dinámicas; una "tarjeta" es solo el render vertical de la misma fila. `MATRIX` (parámetro×turno) va aparte porque su estructura difiere de raíz (filas/columnas FIJAS × celda uniforme × cabeceras read-only): valor `Record<rowKey, Record<colKey, escalar>>`. *Motivo:* unificar tabla+grupo (que son el MISMO dato) evita duplicar render/validación; forzar la matriz en `Array<Record>` ramificaría el value model. Superficie de `FieldType` chica + paleta rica (calca presets de Olas 1–3). *Estándar:* SAP measurement documents/characteristics, IBM Maximo Multi-record/Asset Meter, ServiceNow MultiRow Variable Set, j5 tabular logs, EBR repeating sections.
2. **Columnas de la MATRIZ CONFIGURADAS en la plantilla (no resueltas del calendario en vivo).** Filas=parámetros y columnas=turnos/intervalos se definen como etiquetas en `config` y se **CONGELAN** en la versión. *Motivo:* self-contained, sin acoplar a `ShiftResolver`/calendario/nodo/fecha; entrega el crosstab completo con mucho menos riesgo. **Ligar columnas al calendario operacional en vivo = follow-up (BACKLOG §4).**
3. **Sub-tipos de celda = SOLO ESCALARES.** `TEXT, TEXTAREA, NUMBER, SELECT (opciones INLINE), BOOLEAN, DATE, TIME, DURATION, CONFORMITY, RATING`. *Motivo:* sin I/O extra por celda — `validateFieldValue` se reusa por celda con la del tipo de columna, y el SELECT resuelve su catálogo desde las opciones inline de la columna (sin ABAC por celda). **Diferido (BACKLOG):** `REFERENCE` adentro (ABAC por celda), `ATTACHMENT` adentro, tabla anidada, `RANGE`/`RISK` en celda.
4. **Sin agregados (total/promedio por columna) en esta ola.** MVP = captura + validación por celda. *Motivo:* resiste sobre-ingeniería; se agrega un footer sum/avg si surge caso real (BACKLOG).

**Modelo de valor + validación.** `FIELD_TYPES += TABLE, MATRIX`; `FIELD_DATA_TYPES += TABLE, MATRIX`. Las columnas/ejes viajan en la versión INMUTABLE (config jsonb, clonado al publicar vía `upgradeFieldConfig` no-op, igual que `RISK_MATRIX.cells`). `validateFieldValue` gana los casos `TABLE`/`MATRIX`: itera filas/celdas y delega en la validación del tipo de cada celda (prefijando el error con fila/columna); **filas vacías = placeholder se ignoran**; columna `required` vacía en fila NO vacía ⇒ error; banda de umbral por celda numérica disponible para el realce (estampado a nivel campo = diferido). **Obligatoriedad generalizada `requiredFieldError`** (fuente única back↔front): TABLE ⇒ ≥ `max(1, minRows)` filas COMPLETAS; MATRIX ⇒ ≥1 celda; resto ⇒ no vacío. **Opacos al motor de reglas y a la línea "Resumen" de la grilla en el MVP** (refs del AST a celdas/agregados diferidas; `assertGridFieldKeysExist` rechaza TABLE/MATRIX como candidato de resumen — conteo de filas como resumen = BACKLOG). **Sin permisos nuevos** (catálogo 60).

**Render (único).** Controles `RepeatableControl` (tabla con scroll horizontal + encabezado/1ª columna sticky, agregar/quitar/reordenar fila a 44px; layout `cards` para el grupo) y `MatrixControl` (cabeceras read-only, celdas editables, 1ª columna sticky) **co-ubicados** en `FieldControl.tsx` (como `RiskMatrixControl`) porque **recurren** sobre `FieldControl` (cada celda reusa el MISMO control en modo nuevo `bare` = sin etiqueta/ayuda) ⇒ un NUMBER de columna trae su unidad/umbral y un SELECT su catálogo inline sin duplicar render. Editores de config `TableConfigEditor`/`MatrixConfigEditor` en `BuilderConfigPanel`; paleta categoría nueva **"Estructurados"** (Tabla repetible / Grupo repetible / Matriz parámetro×turno). Migración aditiva `…_add_ola4_field_types` (ALTER enum, idempotente). Tests contracts 230 · API 234 · smoke `smoke-objetos-ola4.py` 22/22 (round-trip CONGELADA, validación por celda 400, completitud, agregar/quitar/reordenar). **Smoke VISUAL pendiente** (BACKLOG §4). **Siguiente: Ola 5** (origen de datos SCADA/PI/OPC, Fase 3).

---

### 2026-06-15 · Catálogo de objetos premium — OLA 3 (adjuntos / terreno, infra MinIO) — ✅ IMPLEMENTADO (`feat/objetos-ola3` → `main`)

Tercera ola: objetos de EVIDENCIA. A diferencia de Olas 1–2, **estrena infraestructura** (object storage on-prem), por eso el diseño se confirmó antes de codear. **4 forks confirmados con el dueño** (recomendación aceptada en los 4):

1. **Subida PROXIED por la API (no presigned PUT directo).** El navegador hace `POST` multipart (`@fastify/multipart`); la API valida tamaño/tipo, audita y hace stream a MinIO. *Motivo:* on-prem la API es la **única superficie alcanzable** por las tablets (presigned exigiría exponer MinIO + ruta en Caddy + un `MINIO_PUBLIC_ENDPOINT`); el choke-point único da **validación + auditoría server-authoritative** (GxP) ANTES de persistir (presigned aterriza el byte y valida post-hoc); los archivos de terreno son chicos (foto/voz/croquis, tope ~25 MB) ⇒ memoria de API no es problema. **Presigned directo = camino de ESCALA en BACKLOG** (cuando crezcan volumen/tamaño y MinIO sea alcanzable). *Estándar:* AWS/MinIO recomiendan presigned para offload, pero el balance on-prem/GxP/MVP favorece proxied.
2. **Materializar al adjuntar (no prefijo temporal + promover).** En compose, la subida **materializa** la entrada (reusa la maquinaria existente) y guarda en `entries/{id}/{fieldKey}/{uuid}-{file}`. *Motivo:* respeta el invariante "sin borradores huérfanos" (adjuntar ES una interacción real, como cualquier primer guardado); evita el copy/promote por objeto y el sweeper de temp del enfoque desacoplado. Quitar un adjunto borra el objeto (delete-on-remove); VOID de un borrador limpia su prefijo. **Sweeper de subidas abandonadas (crash mid-upload) = diferido (BACKLOG).**
3. **QR/código = `config.scan` sobre TEXT, NO un archivo.** Un preset "Escáner" sobre TEXT añade un botón de cámara que decodifica client-side (`@zxing/browser`) y rellena el valor. Sin storage, sin `dataType` nuevo, degradación elegante (el usuario teclea si no hay cámara). *Motivo:* un código es un dato (un TAG), no un objeto que almacenar; encuadrarlo como archivo sería incorrecto. **`REFERENCE(equipment)`-scan (escanear el TAG → seleccionar el activo) = diferido.**
4. **Un `FieldType ATTACHMENT` + presets (no PHOTO/FILE/AUDIO/SKETCH separados).** `dataType FILE_ARRAY` nuevo; el valor es **siempre** un `descriptor[]` (multiple=false solo limita a 1) ⇒ el mapa `FIELD_TYPE_TO_DATA_TYPE` queda **estático** (sin derivación dinámica). `config.kind` (file/photo/audio/sketch) elige el widget de captura + `accept`/`capture` por defecto. *Motivo:* calca los presets de Ola 1/2 (RUT=preset de TEXT); 1 tipo, 1 forma de valor, 1 validador, paleta rica con superficie de `FieldType` chica.

**Modelo de valor (descriptor, NUNCA URL):** `{id,key,filename,size,contentType,checksum(sha256),uploadedAt,uploadedById}` en `LogEntryValue.value` (jsonb). *Motivo:* ALCOA+/Part 11 — la evidencia es el objeto inmutable + su metadata íntegra, no un enlace mutable. La `key` viaja al cliente y round-trips en el guardado (el cliente echa el valor completo); es inofensivo (no es credencial; la guarda real es el presign + ABAC). La **descarga** = `presigned GET` de vida corta firmado server-side, con la **MISMA ABAC** que `getDetail`; el descriptor se resuelve por `id` desde los valores persistidos (el cliente nunca presigna una key arbitraria). **Pertenencia** verificada server-side por **prefijo de objeto** + existencia en storage (`statObject`), análogo a `allowedRefIds` pero por prefijo (I/O ⇒ fuera del validador puro). **Sin permisos nuevos** (`logentry:fill`/`logentry:view` + ABAC ya cubren; catálogo 60). **GxP:** entrada SELLADA ⇒ objetos inmutables/retenidos (el `assertWritable`/estado DRAFT lo garantiza). **Diferido (BACKLOG):** antivirus (ClamAV), object-lock/WORM del bucket, thumbnails/lightbox, retención automática, adjuntos a nivel de REGISTRO/TRANSICIÓN (Req-2 b/c; MVP = a nivel de CAMPO).

**Implementación:** `StorageService` (clase abstracta = token DI, patrón `EmailService`/`ShiftResolver`) + `MinioStorageService` (SDK `minio`, bucket idempotente en `onModuleInit`); `StorageModule` `@Global`; `env.schema` `MINIO_*` (endpoint/keys/bucket/region/presignTTL). Contratos: `ATTACHMENT`/`FILE_ARRAY`, `attachmentFieldConfigSchema`, `fileDescriptorSchema`, helpers `effectiveAccept`/`acceptMatches`/`maxAttachmentBytes`/`maxAttachmentCount`, `validateFieldValue` ATTACHMENT (forma+tamaño+tipo), `config.scan` en TEXT. Migración aditiva `…_add_ola3_field_types` (ALTER enum, idempotente). API: endpoints upload/download, assert de pertenencia + delete-on-remove en `saveSection`, `removePrefix` en `voidEntry`. Web: `AttachmentControl` (render único) + `QrScanButton` + `apiUpload` + paleta "Evidencia / Terreno" + editores + `formatFileSize` + i18n. Tests contracts 222 · API 234 · smoke `smoke-objetos-ola3.py` 26/26 (incl. MinIO real, inmutabilidad de sellada, limpieza de huérfanos). **Smoke VISUAL pendiente** (BACKLOG §4). **Siguiente: Ola 4** (tabla/grupo repetible).

---

### 2026-06-15 · Catálogo de objetos premium — OLA 2 (objetos de REFERENCIA + tolerancia/contador/riesgo) — ✅ IMPLEMENTADO (`feat/objetos-ola2` → `main`)

Segunda ola del catálogo: objetos que apuntan a **entidades de la plataforma** (resolución y validación server-side con ABAC) + tres objetos analíticos. A diferencia de Ola 1 (objetos puros sin BD), aquí el backend debe **resolver opciones y validar referencias en alcance**. **6 forks confirmados con el dueño antes de codear** (recomendación aceptada en los 6):

1. **Selectores de referencia = UN tipo `REFERENCE` + `config.entity`** (`equipment|user|orgNode|shift`), expuesto como **4 presets** en la paleta (Equipo/Usuario/Nodo/Turno). Todos almacenan **un id → `dataType REFERENCE`** que YA existe (lo usa SIGNATURE) ⇒ cero migración de dataType; solo se agrega el valor `REFERENCE` al enum `FieldType`. *Motivo:* lo que difiere por entidad (endpoint/columnas/alcance) es un discriminador de **config**, no de almacenamiento; un solo branch de `FieldControl`, un editor, un validador. Calca el patrón de presets de Ola 1 (RUT=preset de TEXT) y mantiene chica la superficie de `FieldType`. (Descartado: tipos por entidad EQUIPMENT_REF/USER_REF/… = 4 ramas y 4 enums sin ganancia.)
2. **Resolución + validación server-side espejo de `allowedCodes`.** `validateFieldValue` sigue **puro**: gana `opts.allowedRefIds?: Set<string>` (hermano de `allowedCodes`). El servicio resuelve el set válido por campo (existe + activo + EN ALCANCE ABAC) en `resolveAllowedReferences` y lo pasa a la validación en saveSection/submit ⇒ id inexistente/fuera de alcance → 400. **Endpoint genérico** `GET /log-entries/references/:kind/options?nodeId&q` (kind=equipment|user|orgNode|shift) con **ABAC en el backend** (los pickers NO son fuente de verdad de permisos): equipment acotado al nodo de la entrada (reusa la query de `eligibleNodesForTemplate`); orgNode = nodos accesibles (`getAccessibleNodes`); user = usuarios activos; shift = turnos del calendario. Pickers web reusan `Combobox`/`LookupPicker`.
3. **Lectura con tolerancia = variante de NUMBER** (`config {expected, tolerance, critTolerance?}`, preset de paleta, **sin tipo nuevo ni migración**) que **deriva** las bandas warn/crit y reusa íntegro `thresholdBandFor`/`validateFieldValue`. Helper puro `deriveToleranceBands` (fuente única) mapea expected±tol → warnLow/warnHigh y expected±critTol → critLow/critHigh. *Motivo:* calca Ola 1 (percent=NUMBER+format); no inflar el enum con lo que es número.
4. **Contador/acumulado = NUMBER + `config.counter`** con lookup del **valor previo sellado del mismo equipo+campo** (vive en `LogEntryValue` existente, sin infra nueva): el backend valida monotonicidad opcional (nuevo ≥ previo) y expone `previousValue` para que la UI muestre el **delta**. El delta es **presentación** (no se persiste) en MVP ⇒ estamparlo como computed = deuda en BACKLOG.
5. **Matriz de riesgo = tipo nuevo `RISK_MATRIX` con `dataType RISK` nuevo.** Valor estructurado `{probability, consequence}` (análogo a RANGE estrenando su dataType estructurado); el **nivel se DERIVA** por una matriz configurable (ejes p.ej. 5×5 con rótulos + mapeo **celda→severidad 1..5**, ISO 31000, extiende Severidad). Editor builder = cuadrícula "pintable" (heatmap); render llenado = cuadrícula clicable que muestra el nivel/color. Helper puro `riskLevelFor(config, value)`. (Descartado reusar RANGE: su valor {from,to} no tiene ejes/matriz/derivación.)
6. **Paleta: nueva categoría "Referencia"** para los 4 selectores de entidad; tolerancia y contador en "Básicos"; matriz de riesgo en "Evaluación".

**Notas de alcance (resistencia a sobre-ingeniería):** "cuadrilla/crew" no existe como entidad ⇒ TURNO mapea a `OperationalShift`; crew = deuda en BACKLOG. El selector de USUARIO lista usuarios activos (single-tenant); filtrar usuarios por alcance de nodo = mejora futura. Migración única ALTER enum aditiva (PG12+, idempotente, sin backfill). **Fuera de alcance (olas propias):** adjuntos/QR (Ola 3/MinIO), tabla repetible (Ola 4), lectura SCADA/PI (Ola 5).

**Implementación:** migración aditiva `20260615140000_add_ola2_field_types` (ALTER enum). Contratos: `REFERENCE`/`RISK_MATRIX` en `FIELD_TYPES`, `RISK` en `FIELD_DATA_TYPES`, `referenceFieldConfigSchema`/`riskMatrixFieldConfigSchema`, NUMBER += tolerancia/contador, helpers puros `deriveToleranceBands`/`effectiveNumberBands`/`riskLevelFor`, `validateFieldValue` (REFERENCE con `opts.allowedRefIds`, RISK_MATRIX, NUMBER con bandas efectivas), `thresholdBandFor` usa bandas efectivas. API: `GET /log-entries/references/:kind/options` (ABAC), `resolveAllowedReferences`/`validReferenceIds` (en saveSection + collectCompletionErrors), `resolveCounterPreviousValues`/`counterMonotonicErrors`, `counterPreviousValues` en el detalle. Web: render único `FieldControl` (4 selectores Combobox/LookupPicker, matriz clicable, tolerancia, delta de contador), `useReferenceOptions`, paleta categoría "Referencia", editores de config (tolerancia/contador/heatmap de riesgo). **Sin permisos nuevos — catálogo 60.** Tests contracts 204→**215** · API **234**. **Smoke `scripts/smoke-objetos-ola2.py` 22/22** (round-trip + ABAC: equipo de otro nodo / riesgo fuera de matriz / usuario inexistente ⇒ 400; banda WARN derivada de tolerancia; crea y LIMPIA por ID). **Deuda:** contador no-decreciente y delta cross-entry sin smoke en vivo (requieren entrada sellada previa); estampar el delta como `computed` si se necesita reportar; banda de umbral para RISK; crew como entidad; usuario filtrado por nodo. **Smoke VISUAL pendiente** (BACKLOG §4). **Siguiente: Ola 3** (adjuntos + QR, infra MinIO).

---

### 2026-06-15 · Catálogo de objetos premium — OLA 1 (objetos sin infraestructura) — ✅ IMPLEMENTADO (`feat/objetos-ola1` → `main`)

El dueño pidió ofrecer TODOS los objetos que esperan las bitácoras industriales, a nivel enterprise, sobre el render ÚNICO (`FieldControl`↔`FieldGrid` = builder/llenado/visor idénticos). Se entrega por **OLAS**; esta es la Ola 1 (sin infraestructura nueva — adjuntos/QR/tabla/origen de datos van en olas propias). **5 forks resueltos con el dueño antes de codear** (recomendación aceptada en los 5):

1. **Variantes por `displayAs` vs tipos nuevos.** SELECT gana `displayAs` (dropdown/radio/segmented) y MULTISELECT (dropdown/checkboxes/**modal** = Value Help que reusa `LookupPicker`): **mismo `dataType` (CODE/CODE_ARRAY) y misma validación** (allowedCodes), solo cambia el widget. **Tipos NUEVOS solo donde la semántica difiere:** **`CONFORMITY`** (tri-estado Conforme/No conforme/N.A. — catálogo cerrado `{CONFORME,NO_CONFORME,NA}`, `dataType CODE`, espejo de cómo SEVERITY es 1..5) y **`RATING`** (valoración estrellas/numérica/Likert, ordinal `dataType NUMBER`). *Motivo:* menos superficie de `FieldType`, validación no duplicada; es además el patrón del prototipo (select/radio/checklist comparten `OptionsField`).
2. **Objetos de PRESENTACIÓN (no-dato) → `dataType LAYOUT` dedicado.** HEADING/STATIC_TEXT/DIVIDER/NOTICE/PROCEDURE_LINK/REFERENCE_IMAGE son `FieldType` con `dataType=LAYOUT`; el llenado los IGNORA por una **única** guarda `isPresentationalType` (basada en el dataType, no en una lista paralela): no crean `LogEntryValue`, no validan, no entran a reglas/resumen/obligatorios. *Motivo:* un dataType dedicado deja saltarlos con un solo chequeo en cada capa (validación/persistencia/completitud/summary), patrón FHIR `display`. La imagen es una **URL configurada** por el diseñador (los uploads son Ola 3/MinIO).
3. **RUT/moneda/%/correo/teléfono/URL = variantes; HORA/DURACIÓN/RANGO = tipos.** HORA (`TIME`, `dataType TIME`) y DURACIÓN HH:MM (`DURATION`, `dataType NUMBER`, **minutos canónicos** como SLA/ventana) son tipos propios (teclado/validación distintos). RUT/correo/teléfono/URL = **`TEXT + config.format`**; porcentaje/moneda = **`NUMBER + config.format`** (validación regional con `isValidTextFormat`/`isValidRut`, formateo en `lib/format`). **RANGO mín–máx = tipo `RANGE`** con valor estructurado `{from,to}` y `dataType RANGE` (el ÚNICO no-escalar; se registró como la deuda fina de la ola). *Motivo:* no inflar el enum con formatos que son texto/número; sí tipos propios donde el input/validación difieren.
4. **Multiselección con modal = `displayAs:'modal'` de MULTISELECT** reusando `LookupPicker` (Value Help SAP/Fiori), no un tipo nuevo.
5. **Paleta = PRESETS por categoría** (Básicos · Selección · Evaluación · Presentación). La paleta se desacopla de `FIELD_TYPES`: `FIELD_PALETTE` lista presets `{id,type,category,icon,config()}` y un mismo `type` aparece como varias tarjetas (RUT/Correo son TEXT; Radio/Segmentos son SELECT). `fieldDisplayMeta(field)` elige el icono/etiqueta del preset que calza con `type+config` para campos existentes.

**Implementación:** contratos (+11 `FIELD_TYPES`, +`LAYOUT`/`RANGE` dataType, `FIELD_TYPE_TO_DATA_TYPE`, config Zod `.strict()` por tipo, `validateFieldValue` con todos los casos, `isEmptyValue` para RANGE, helpers puros fuente única back↔front); migración aditiva ALTER enum (PG12+, idempotente, sin backfill = cero ruptura); API (guardas LAYOUT en saveSection/completitud/summary; clone/mapVersion ya cubren); web (FieldControl premium claro+oscuro 44px, paleta, editores de config, lib/format, EntryFillPage). **Sin permisos nuevos — catálogo 60.** Tests contracts 204 · API 234 · smoke `smoke-objetos-ola1.py` 21/21. **Smoke VISUAL pendiente** (BACKLOG §4). **Siguiente: Ola 2.**

---

### 2026-06-14 · Fase 2.1.7 — Diseñador visual de formularios (lienzo de posicionamiento libre, react-grid-layout) — ✅ IMPLEMENTADO FASE 1 (`feat/builder-visual-designer` → `main`)

Tras 2.1.6 el dueño seguía sin poder colocar un campo donde quería ni redimensionar uno libremente: el modelo **auto-fila** (orden + `colSpan`, ancho DERIVADO por `splitRow`) es intrínsecamente rígido — no existe "a la derecha de", solo "después en la lista", y un campo solo en su fila no era redimensionable. Pidió un **diseñador visual tipo Canva/Figma/Power Apps** con un brief detallado (paleta + lienzo + propiedades + posicionamiento libre + responsive + historial + capas + multi-selección).

**Contradicción argumentada (criterio técnico):** el píxel-absoluto puro (Figma/Canva, con z-index/capas/solapamiento) es el modelo equivocado para formularios industriales que se llenan en **tablet/celular en terreno** (requisito #4 del brief y regla del proyecto): no refluye, corta campos en otro tamaño y obliga a rehacer cada pantalla a mano (el dolor clásico de Power Apps Canvas); y en un formulario los campos **no deben solaparse**. **Recomendación aceptada por el dueño:** lienzo de **grilla responsiva de posicionamiento libre** (estándar de dashboards/editores serios — `react-grid-layout`): geometría EXPLÍCITA `{x,y,w,h}` por campo, arrastrar/redimensionar cualquiera, snapping, y **layouts responsivos** que nunca cortan campos. Cumple ~12 de los 13 criterios; el píxel-absoluto fallaría el #12 en terreno.

- **Modelo de datos (sin romper compat):** geometría por campo en la versión INMUTABLE — columnas `TemplateField.gridX`/`gridY`/`gridH` **NULLABLE** (el ANCHO sigue siendo `colSpan` = w). Migración aditiva `20260614190000_add_field_grid_geometry` (checks 0..11 / ≥0 / ≥1). **`null` = plantilla legacy** ⇒ el editor DERIVA la geometría del orden + `colSpan` (empaque en filas de 12, idéntico a la vista anterior) y la persiste al primer guardado. Contratos: `gridX/gridY/gridH` (nullable en respuesta, opcional en `draftFieldInput`). Geometría estructurada, **NO en CSS** (como pidió el brief).
- **Render (fuente ÚNICA `FieldGrid`):** reescrito a **data-driven** (`fields` + `renderCell`): coloca por `grid-column: x / span w` + fila densa derivada de `y`; lo consumen llenado/visor/preview. **Responsive por CONTAINER QUERIES** (no viewport): la grilla colapsa según el ancho de SU contenedor ⇒ el preview de tablet/móvil reflowe dentro de su marco y el llenado real respeta su ancho (móvil 1 col, tablet 2, escritorio = geometría).
- **Editor (3 zonas):** `FieldPalette` (izq: buscador + categorías plegables + objetos arrastrables/clic), lienzo central con **`react-grid-layout`** (`SectionCanvas`: drag/resize de cualquier campo, snapping, `compactType=null`+`preventCollision`+`isBounded` = colocación libre sin solapar; arrastrar DESDE la paleta vía `isDroppable`/`onDrop`; commit al SOLTAR, no por píxel), `FieldPropertiesPanel` (der: rótulo, obligatorio, ancho, alto, posición + "Opciones avanzadas" → Drawer existente). Barra: selector **escritorio/tablet/móvil** (tablet/móvil = preview responsivo read-only con el MISMO `FieldGrid`) + toggle de cuadrícula. **Se retiró dnd-kit del builder** (reemplazado por RGL); `BuilderFieldCard`/`FieldToolbar`/`AddFieldMenu` quedan huérfanos (limpieza pendiente, BACKLOG).
- **Entregado como FASE 1.** Cubre criterios 1-4, 8, 9, 10, 11, 12. **Diferido FASE 2/3 (BACKLOG):** historial deshacer/rehacer · multi-selección + marquee · alinear/distribuir · panel de capas (orden/bloquear/ocultar) · copiar/pegar · atajos de teclado (mover/eliminar/duplicar) · edición por breakpoint (hoy se edita en escritorio; tablet/móvil auto-reflow) · zoom/reglas · tests de lienzo.

**Motivo:** el auto-fila tenía techo (rigidez estructural, no de interacción); el estándar enterprise para "diseñar" es geometría explícita sobre una grilla responsiva. typecheck/lint(0)/build verdes; contracts 195 · API 234 (sin regresión); **smoke `scripts/smoke-field-geometry.py` 14/14** (round-trip geometría borrador→congelado→entrada + legacy null). **Smoke VISUAL pendiente** (BACKLOG §4).

---

### 2026-06-14 · Fase 2.1.6 — Motor de arrastre del builder con **dnd-kit** (Canva-grade) — ✅ IMPLEMENTADO (`feat/builder-dnd-kit` → `main`)

Tras probar 2.1.5 el dueño reportó que **seguía sin poder mover un campo al lado de otro** ("no veo cambios… en Canva lo hace por píxeles… quiero meterme entre dos objetos y que ambos se auto-dimensionen… algo enterprise y profesional"). Diagnóstico honesto:

1. **Bug real del DnD nativo:** el arrastre solo arrancaba si `e.target.dataset.dragHandle` era verdadero, pero el grip era un `<span>` con un **SVG** dentro ⇒ al presionar sobre el ícono el target era el SVG (sin el dataset) ⇒ `preventDefault()` ⇒ **el drag casi nunca iniciaba**.
2. **Techo del DnD nativo:** aunque se arregle el bug, HTML5 DnD nativo nunca da la sensación Canva/Notion (fantasma gris del navegador, `dragover` tosco, **sin reflow en vivo**). Canva/Notion/Typeform/Webflow usan **pointer events** con drag overlay, reflow animado y detección por píxeles.

**Decisión (confirmada con el dueño):** adoptar **dnd-kit** (`@dnd-kit/core` 6 + `@dnd-kit/sortable` 10 + `@dnd-kit/utilities` 3) y **reescribir** la interacción del lienzo. Es el estándar de la industria para builders en React: ~10 kB, MIT, **cero servicios externos** (100% on-prem, cumple la regla del proyecto), y soporta **pointer + teclado + touch** ⇒ además deja el builder accesible y usable en tablet. **Frontend puro** — NO se toca modelo/contratos/API/migraciones: sigue `colSpan` 1..12 y `FieldGrid` sigue siendo la **fuente única** de render (llenado/visor idénticos).

- **Nodo sortable = la CELDA de la grilla** (no la tarjeta interna) ⇒ el reflow de los vecinos se anima con `rectSortingStrategy`. El **área activadora** (`setActivatorNodeRef`) es la **tarjeta completa** ⇒ se agarra en casi cualquier parte; el **rótulo** (textarea) y el **borde-divisor** quedan exentos vía `stopPropagation` en `pointerdown` (para escribir / redimensionar). Adiós al bug del grip.
- **`DragOverlay`** dibuja la copia que **sigue al cursor** (`BuilderFieldOverlay`, no interactiva) — sin fantasma gris; el original queda atenuado (placeholder).
- **Intención de soltado por píxeles:** en `onDragMove` se compara el **centro del campo arrastrado** (`active.rect.current.translated`) contra el rect del destino (`over.rect`): arriba/abajo ⇒ fila propia (ancho completo), mitad izq/der ⇒ **al lado** (comparten fila, `splitRow` reparte el ancho). Se reusa **íntegro** el auto-layout de 2.1.5 (`applyDrop`/`splitRow`/`rowRangeOf`) — solo cambió el MOTOR que dispara el drop. La intención se guarda en un **ref** (`dropIntentRef`) leído síncronamente en `onDragEnd` (no depende de estado asíncrono).
- **Colisiones `closestCenter`** + el **droppable de sección se desactiva cuando tiene campos** ⇒ con campos siempre gana un CAMPO (intención al-lado/fila); el contenedor solo actúa en sección vacía / soltar al final. Sensor pointer con umbral 5px (no roba los clics de selección); sensor de teclado con `sortableKeyboardCoordinates` (recoger/mover/soltar accesible).
- **Se conserva:** el **divisor** del borde (pointer-events) para el ajuste fino 70/30, los indicadores de soltado (barra azul beside/row), y el responsive de terreno 1/2/12 de `FieldGrid`.

**Motivo:** parchar drag nativo por 5.ª vez era invertir en un piso que no da el nivel pedido; el estándar enterprise es un motor pointer-based (dnd-kit). typecheck/lint(0)/build verdes; contracts 195 · API 234 (sin cambios, frontend puro). **Smoke VISUAL pendiente** (BACKLOG §4).

---

### 2026-06-14 · Fase 2.1.5 — Builder: ancho completo + auto-layout por arrastre (Notion) + responsive de terreno — ✅ IMPLEMENTADO (`feat/builder-autolayout` → `main`)

Feedback del dueño tras 2.1.4 (4 puntos, "pensar en el usuario final, simpleza"): (1) el editor no usaba todo el ancho; (2) arrastrar entre líneas no era natural; (3) el usuario NO entiende "dividir en columnas", solo quiere arrastrar y que quede bien; (4) el formulario debe verse bien en móvil/tablet (terreno). **Frontend puro** (se mantiene `colSpan`; el ancho se DERIVA del arrastre).

- **(#1) Ancho completo:** se quita el `max-width:1040px` del lienzo (`.workspace`) ⇒ llena el ancho disponible.
- **(#2/#3) Auto-layout por arrastre (Notion/Coda), confirmado por el dueño:** soltar un campo **AL LADO** de otro ⇒ comparten fila y el ancho **se reparte solo** (`splitRow`: 2→6/6, 3→4/4/4, 4→3/3/3/3; tope 4 por fila); soltar en **su propia línea** (zona arriba/abajo) ⇒ **ancho completo** (`colSpan=12`). El usuario nunca elige columnas. **`onDragOver` deriva la zona** del puntero sobre la card (tercios: arriba=row-before, abajo=row-after, izq/der=beside) con **indicadores** (barra vertical=compartir fila, horizontal=fila nueva). Helpers puros nuevos en `builder-model`: `splitRow` + `rowRangeOf` (una "fila" = corrida cuyos colSpan suman ≤12). `applyDrop` reemplaza a `moveFieldBefore`.
- **(#3) Se quita la jerga de "12 columnas":** se elimina el menú "12/12" de `FieldToolbar`. El **ajuste fino** queda como **DIVISOR** (estilo Notion): arrastrar el borde transfiere columnas entre el campo y su vecino de la MISMA fila (suma constante, cada uno mín. 3; `resizeDivider`); el handle solo aparece si hay vecino a la derecha. El control de ancho explícito sobrevive solo en el Drawer avanzado (baja visibilidad).
- **(#4) Responsive de terreno** en `FieldGrid` (fuente de render única ⇒ aplica a llenado y visor): móvil <768px = 1 col; **tablet 768–1023px = 2 col fijas** (fluyen de a 2, táctil 44px); escritorio ≥1024px = grilla de 12 con `colSpan`.

**Motivo:** estándar de editores modernos = arrastrar-para-acomodar con ancho automático; el usuario no debe pensar en grillas. Sin librería nueva (DnD nativo + pointer-events; builder de escritorio). typecheck/lint(0)/build verdes; contracts 195 · API 234 (sin cambios). **Smoke VISUAL pendiente** (BACKLOG §4).

---

### 2026-06-14 · Fase 2.1.4 — Builder CANVAS-FIRST con configuración en el lienzo — ✅ IMPLEMENTADO (`feat/builder-canvas` → `main`)

Feedback del dueño tras probar 2.1.3: el editor se sentía **estrecho y poco intuitivo** vs Canva/Webflow/Google Forms ("el usuario está acostumbrado a otros softwares, no podemos darle menos"). Causa: lienzo espachurrado entre paleta (220px) y config (320px) ⇒ ~280px; y toda la config en un panel lateral abstracto. **Frontend puro** (no toca modelo/contratos/API — `colSpan` ya estaba).

- **Shell canvas-first:** se elimina la grilla de 3 columnas; el **lienzo ocupa todo el ancho** (artboard centrado, max-width ~1040px). La **paleta deja de ser columna**: agregar campo es un **popover "＋ Agregar campo"** (`AddFieldMenu`, reusa `Menu` de @lyra/ui) en la barra del lienzo y **al final de cada sección** (inserta donde se invoca, vía `addFieldAt(type, sectionUid, index)`). El **panel de config pasa a `Drawer` lateral** (@lyra/ui) que se abre con "Más opciones" — solo para lo AVANZADO (umbral, opciones/lista, condicional, fórmula, roles).
- **Configuración EN EL LIENZO (lo potente):** cada campo se ve como el **control REAL** (`FieldControl` no interactivo, `pointer-events:none`, se oculta su rótulo interno) ⇒ lo que ves es lo que es. **Rótulo editable en el lugar** (textarea auto-grow), **título/descripción de sección inline**, y **barra flotante contextual** (`FieldToolbar`) sobre el campo activo: ancho (presets + el handle fino), obligatorio, mover ↑↓, duplicar, eliminar, "Más opciones". Patrón Canva/Notion/Google Forms.
- **Se conserva:** arrastrar para reordenar (DnD nativo) y redimensionar (handle pointer/teclado), la fuente de render ÚNICA (`FieldGrid`/`FieldGridCell`) ⇒ builder ≈ llenado ≈ visor, y la accesibilidad (flechas ↑↓ en la barra, handle `role=slider`).
- **Nuevos componentes:** `AddFieldMenu`, `FieldToolbar`; `BuilderFieldCard` reescrito a WYSIWYG. `WIDTH_PRESETS` movido a `builder-model` (compartido barra+panel). `duplicateField` nuevo.
- **Entregado en 2 fases (honestidad de alcance).** Fase 1 (esto): canvas-first + WYSIWYG + config en el lienzo. **Fase 2 (BACKLOG):** drag-desde-paleta-a-posición, edición inline de placeholder/ayuda/opciones, colapsar secciones, atajos/copiar-pegar, multi-selección. **NO** se hace posicionamiento absoluto ni plantillas de layout (sigue siendo 2.9.0). **Motivo:** estándar enterprise de editores de formulario = el lienzo ES el formulario y se configura encima. typecheck/lint(0)/build verdes; contracts 195 · API 234 (sin cambios). **Smoke VISUAL pendiente** (BACKLOG §4).

---

### 2026-06-14 · Fase 2.1.3 — Editor de layout WYSIWYG (grilla de 12 col + arrastre) — ✅ IMPLEMENTADO (`feat/layout-editor-wysiwyg` → `main`)

Iteración sobre 2.1.2 por feedback del dueño: el panel lateral de ancho era **ciego** (editas en abstracto, verificas en otra pestaña). Los líderes (ServiceNow, Power Apps, Salesforce, SAP Fiori, Retool) editan el layout **WYSIWYG por manipulación directa sobre el formulario**. El dueño eligió manipulación directa COMPLETA (arrastrar para redimensionar y reordenar) y granularidad de **12 columnas**.

1. **Granularidad → grilla de 12 col.** Se **reemplaza** el enum `LayoutWidth {FULL,HALF,THIRD}` de 2.1.2 por un entero **`TemplateField.colSpan` 1..12** (`@default(12)`), estilo SAP Fiori/Bootstrap. Permite el redimensionado fino por arrastre (3 topes era pobre para "arrastrar"). Migración de conversión NUEVA hacia adelante (FULL→12/HALF→6/THIRD→4; los migrations publicados son inmutables, no se edita el de 2.1.2): `20260614180000_field_colspan` agrega `colSpan`, convierte, dropea `layoutWidth` y el enum, y agrega CHECK 1..12.

2. **Sin librería de DnD nueva.** El repo ya tiene **arrastre nativo HTML5** (`ColumnsDrawer`) y **pointer-events** (`ResizableSplit`). El builder lo usa el **Configurador en ESCRITORIO** (la regla 44px/guantes/tablet es del OPERADOR llenando, ya cubierta por la grilla responsiva), así que NO se necesita DnD táctil ⇒ reordenar = DnD nativo, redimensionar = handle con pointer-events. Cero dependencias nuevas (coherente con la cultura del repo: `ResizableSplit`/`useAnchoredPanel` son propios).

3. **Accesibilidad.** Se MANTIENEN las flechas ↑↓ (reordenar por teclado) y el handle de redimensionar es **`role="slider"`** (aria-valuemin/max/now; ← → ajustan ±1) ⇒ todo operable sin mouse.

4. **Fuente de render única intacta.** `FieldGrid`/`FieldGridCell` siguen siendo la única grilla; el **lienzo del builder los REUSA** (los campos del editor se ven con el mismo layout que llenado/visor). `FieldGridCell` pasó de `width:enum` a `span:number` (vía `--col-span` custom property, para que la media query de celular pueda sobreescribir a 1 col).

**Cambios:** contratos (`colSpanSchema` 1..12 reemplaza `layoutWidthSchema`), Prisma (`colSpan Int`, drop enum), API (`colSpan` en ambos services), web (`FieldGrid` numérico, nuevo `BuilderFieldCard` con grip+resize, lienzo WYSIWYG en `TemplateBuilder` con `moveFieldBefore` para reordenar dentro/entre secciones, presets de ancho en `BuilderConfigPanel`). **Motivo:** llevar el editor al estándar enterprise sin sobre-ingeniería (sin posicionamiento absoluto ni plantillas de layout = sigue siendo 2.9.0). Tests contracts 195 · API 234 · smoke `scripts/smoke-field-layout.py` 14/14. **Smoke VISUAL pendiente** (BACKLOG §4): arrastrar para reordenar (dentro/entre secciones) y redimensionar 1..12 con reflow en vivo; teclado; los tres lados idénticos.

---

### 2026-06-14 · Fase 2.1.2 — Layout de formulario en grilla responsiva (ancho por campo) — ✅ IMPLEMENTADO (`feat/layout-grilla` → `main`) — (granularidad reemplazada por 2.1.3: enum→colSpan 12)

Presentación PURA y ADITIVA: el diseñador da un **ancho por campo** y los campos se acomodan en una **grilla CSS responsiva por sección** que colapsa a 1 columna en tablet/celular. NO toca validación/umbral/condicional/permisos/reglas. Default = ancho completo ⇒ cero ruptura. 5 forks resueltos con el dueño:

1. **Set de anchos = enum mínimo `{FULL, HALF, THIRD}`** (recomendación aceptada). Mapea limpio a una grilla de 12 col (12/6/4), sin spans sueltos = sin error de fila. TWO_THIRDS/QUARTER/spans numéricos 1–12 → BACKLOG si surge un caso real (sobre-ingeniería para terreno hoy).

2. **Persistencia = columna dedicada `TemplateField.layoutWidth`** en la versión INMUTABLE (es diseño controlado MMR/Part 11). **Corrige la sospecha inicial del dueño (config JSONB para evitar migración)**: los config por tipo son Zod `.strict()` (8 esquemas) ⇒ meterlo en `config` obliga a tocar los 8 o romper el strict; en cambio `visibleWhen`/`computed`/`semanticRole` YA son columnas top-level separadas (NO en config). La columna calca ese patrón, es consultable, y `@default(FULL)` NOT NULL rellena las filas existentes en el mismo `ALTER` ⇒ **sin backfill, cero ruptura**. Costo: 1 migración aditiva trivial (`20260614170000_add_field_layout_width`).

3. **Responsive (recomendación)**: grilla de 12 col. Desktop ≥1024px → FULL=12 / HALF=6 / THIRD=4. Tablet 768–1023px → THIRD degrada a ½ (span 6). <768px → grilla a 1 columna (celdas a `auto`). Alineado al breakpoint 768 ya usado por `ResizableSplit`. 44px se conservan (los controles ya tienen `min-height:44px`); `min-width:0` evita que contenido largo reviente columnas.

4. **Tipos de campo (recomendación)**: hint UNIVERSAL, default FULL, el motor solo COLOCA, nada se fuerza. TEXTAREA/SEVERITY/SIGNATURE quedan FULL por default pero el diseñador puede cambiarlos.

5. **Fuente de render ÚNICA (recomendación)**: componente compartido nuevo `FieldGrid` + `FieldGridCell` (un solo CSS module `FieldGrid.module.css`), usado por los TRES lados (vista previa del builder, llenado, visor). El **contenedor de grilla vive a nivel de sección**; el **span vive en la celda** desde `field.layoutWidth`. Sin CSS copiado ⇒ el registro se ve idéntico en los tres.

**Motivo:** terreno/tablet sufre el scroll de una sola columna; SAP Fiori (12-col responsive grid) y ServiceNow (form layout por anchos) son el estándar. Mantenerlo mínimo (ancho + grilla, nada de drag&drop/posicionamiento absoluto/plantillas de layout = eso es 2.9.0) evita la sobre-ingeniería. Round-trip verificado (`scripts/smoke-field-layout.py` 12/12: el ancho viaja en la versión CONGELADA y vuelve en el detalle de entrada; omitido = FULL). **Smoke VISUAL pendiente** (BACKLOG §4): builder-preview + llenado + visor idénticos, colapso a 1 col en tablet, ⅓→½ intermedio, 44px.

---

### 2026-06-14 · Fase 2.8.2 — VOID de borradores + ruta de edición propia — ✅ IMPLEMENTADO (`feat/void-edicion` → `main`)

Cierra la deuda (b)(c) de 2.8.2. 4 forks resueltos con el dueño (recomendación aceptada en los 4):

1. **Alcance = solo DRAFT en este corte.** Anular/descartar un borrador no sellado. La anulación GxP de una entrada
   **SELLADA** (transición inversa + firma §11.200) es un control DISTINTO y va en el corte posterior, junto a la reversa
   de transición diferida de 2.5 (diferido (a)/(d)). Motivo: no mezclar "descartar borrador" (bajo riesgo) con "anular
   registro controlado" (alto riesgo, exige firma); ServiceNow/Jira distinguen "Cancelled" (borrador) de "Reversed/Voided"
   (documento publicado).

2. **Anulación LÓGICA vía `status = VOID`, NO `deletedAt`.** El enum `LogEntryStatus.VOID` ya existía (andamiaje muerto):
   se ESTRENA. **No** se usa `deletedAt` porque `buildWhere` lo filtra siempre ⇒ ocultaría la entrada hasta del filtro
   `status=VOID` (contradice "trazable"). En cambio `buildWhere` **excluye VOID por defecto** y lo muestra solo con filtro
   explícito (patrón ServiceNow "Cancelled" / SAP documento anulado): fuera de las superficies operacionales normales
   (grilla/stats/facetas/export/related) pero recuperable. Huella `voidedAt/voidReason/voidedById` + `AuditLog`
   inmutable (`logentry.voided`). El período cerrado / la ventana vencida **NO** bloquean descartar (no es corrección de
   dato; es retirar un borrador erróneo).

3. **Autorización HÍBRIDA = ownership + permiso nuevo para ajenas.** El AUTOR (`createdById === userId`) anula su PROPIO
   borrador como autoservicio con `logentry:create` + ABAC (precedente del repo: `SavedView` autoriza por ownership,
   2.8.1b; análogo a descartar tu borrador no enviado en ServiceNow/Jira/Docs). Anular el borrador AJENO (limpieza
   supervisora de un borrador abandonado) exige el **permiso nuevo `logentry:void`** — configurable, NO hardcodeado.
   **Catálogo 59→60.** El gate del controller es GRUESO (`logentry:view` = estar en el módulo) y la autorización FINA
   (ownership o `logentry:void`, + ABAC nodo×plantilla) la decide el SERVICIO — mismo patrón que saveSection/transition.

4. **Para un borrador basta MOTIVO obligatorio (≥5), auditado; sin re-auth/firma.** El borrador no es un registro firmado
   Part 11; ALCOA+/MHRA exigen registrar POR QUÉ se descartó, y eso basta. La re-autenticación/firma (§11.200) se reserva
   a acciones sobre registros SELLADOS (será parte del corte de void GxP).

5. **(criterio) Ruta de edición DEDICADA `/bitacoras/:id/editar`**, separada del flujo de creación/compose de
   `/nueva-entrada`, reusando el componente `EntryFillPage`. La URL refleja "editar registro existente" (no "crear"); los
   botones "Editar" de grilla/peek/visor apuntan ahí; el rótulo *eyebrow* (Editar/Nueva entrada/Llenado) y el "Volver"
   contextual (al visor) distinguen editar de crear. Respeta ventana (2.7.2) + período (2.7.1) + rol-sección×ABAC vía el
   `saveSection` ya gateado (el backend AUTORIZA siempre). Una entrada VOID es terminal en edición (banner + secciones
   bloqueadas `ENTRY_CLOSED`).

**Verificación:** contracts 193 · API 234 (+6: void ownership/permiso/guardas + default-exclude VOID). typecheck/lint(0)/
build verdes. **Smoke en vivo `scripts/smoke-void-edit.py` 17/17** (anula con motivo + huella; sale de la grilla y aparece
con `?status=VOID`; timeline VOIDED; re-anular/motivo<5 ⇒ 400; ajeno sin permiso ⇒ 403; admin con `logentry:void` ⇒ 2xx;
round-trip de edición persiste; crea y LIMPIA por ID, AuditLog conserva el rastro). **Pendiente: smoke VISUAL del dueño.**

---

### 2026-06-14 · Motor de reglas de negocio — PRIMER CORTE (Req-7) — ✅ IMPLEMENTADO (`feat/motor-reglas` → `main`)

Núcleo del motor: expresión segura + campos FORMULADOS + validación CRUZADA. **NO** incluye acciones que disparan
otros módulos (incidencia/notificación = Fase 4/Notificaciones), ni límites dinámicos, ni DMN. 5 forks resueltos con
el dueño (recomendación aceptada en los 5):

1. **Lenguaje = AST tipo JSONLogic con evaluador PROPIO** (~150 líneas, sin dependencia externa), helper PURO en
   `@lyra/contracts` evaluado **idéntico cliente/servidor** (extiende el patrón `validateFieldValue`/`visibleWhen`).
   Motivo: **cero superficie de parser** (vs CEL/string), serializa nativo a JSONB de la versión inmutable, **diffea
   para auditoría GxP**, sin cadena de suministro (on-prem). La legibilidad infija es asunto de UI: el builder
   **renderiza** `salida > entrada` y **almacena** el árbol. DMN/CEL para tablas de decisión complejas → BACKLOG.

2. **Ubicación HÍBRIDA, todo en la versión INMUTABLE como JSON** (clonado al publicar):
   - **Fórmula → en el campo:** nueva columna `TemplateField.computed Json?` (paralela a `visibleWhen`, NO dentro de
     `config`). Un campo calculado *es* su fórmula; dependencias y recálculo son per-campo.
   - **Validación cruzada → en la versión:** nueva columna `TemplateVersion.rules Json` (array de
     `{key, when, severity ERROR|WARN, message}`). Una regla cruzada referencia varios campos y no la posee ninguno
     (patrón Validation Rules de Salesforce / Data Policies de ServiceNow = a nivel de objeto).
   - **JSON, no entidad relacional** en el primer corte (las reglas se leen como un todo, nunca por SQL individual;
     una tabla `TemplateRule` no aporta y suma migración/clonado → BACKLOG si hay analítica por regla).
   - **Clave GxP:** va a la versión **inmutable** (cambiar regla/fórmula = re-versión auditada), a diferencia de
     `editWindow`/`equipmentMode`/`gridFieldKeys` (gobernanza *mutable* del contenedor): la lógica de cálculo/
     validación es parte del documento controlado; un *hint* de visualización no.

3. **Campo formulado = flag `computed` + expresión sobre el TIPO EXISTENTE**, NO un dataType nuevo. Conserva
   `type`/`dataType` real (NUMBER/DATE…) ⇒ **el umbral ISA-18.2 aplica al valor calculado gratis**, y grilla/búsqueda/
   facetas/reporte funcionan sin caminos especiales. `computed` presente ⇒ campo **read-only**, valor derivado.
   **Estampado:** el valor se persiste en `LogEntryValue` (recalcula en DRAFT, **congela al sellar** — GxP). "¿Es
   derivado?" se sabe **desde la versión** (sin columna nueva); el `LogEntryFieldChange` del recálculo se marca con
   `reason: "COMPUTED"` y actor = quien cambió el input (ALCOA+: el humano teclea insumos, el sistema deriva). Filtrar
   computados por SQL (`LogEntryValue.computed Boolean`) → BACKLOG si se necesita.

4. **Set de funciones del primer corte (mínimo útil, todo SÍNCRONO y PURO):** referencias (`var(fieldKey)`) +
   literales; aritmética (`+ − × ÷`, abs/round/ceil/floor/min/max; **÷0 ⇒ vacío**); comparación (`== != > >= < <=`);
   lógica (and/or/not); condicional (`if`); nulos (`coalesce`, `isEmpty`; **operando nulo ⇒ resultado vacío**); fecha
   (`dateDiff(unidad,a,b)`, `now()`); agregación intra-entrada sobre lista explícita (`sum/avg/count/min/max`).
   **Diferido (BACKLOG):** lookups a metadata de listas de referencia (rompe pureza → exige I/O), tablas DMN, límites
   dinámicos. Si una regla necesita datos resueltos, el llamador los pre-resuelve y los pasa (patrón `allowedCodes`).

5. **Recálculo/dependencias/ciclos (diseño fijo):** dependencias extraídas estáticamente del AST (hojas `var`);
   grafo entre formulados. **Cliente** recomputa en cada cambio en orden topológico (feedback); **servidor
   AUTORITATIVO** recomputa todos los formulados desde los valores persistidos al guardar y los **estampa**,
   ignorando lo que el cliente envíe para campos computados. **Ciclos** se detectan en **guardar/publicar el diseño**
   (topo-sort) → rechazo con error de qué campos forman el ciclo (fallar en diseño, nunca en llenado); también se
   valida que los `fieldKey` referenciados existan. **Cruzada:** se evalúa tras recomputar; si falta un campo
   referenciado (vacío) la regla se **omite**; con todos presentes, **ERROR bloquea** completar/enviar/transicionar
   (canal de errores existente), **WARN informa** (como bandas de umbral). **Sin permisos nuevos** (catálogo 59):
   edición usa los gates de plantilla; la evaluación corre dentro de fill/submit/transition ya gateados.

---

### 2026-06-13 · Workflow SLA + atrasos — ✅ IMPLEMENTADO (forks resueltos)

Implementación del plan aprobado abajo. **SLA por ESTADO** (`WorkflowState.maxStayMinutes` nullable, minutos canónicos,
migración aditiva). 4 forks resueltos con el dueño (recomendación aceptada en los 4):

1. **Unidad del SLA = Min / Horas / Días** (UI), almacenado en **minutos canónicos** (espejo de la ventana de edición 2.7.2,
   con "Días" añadido porque los SLA operacionales suelen medirse en días). `slaDurationField` propio.
2. **Tiempo CALENDARIO** en el MVP (horas hábiles = futuro, requiere el calendario operacional/turnos → BACKLOG §3).
3. **Estampar `LogEntry.currentStateSince`** (columna aditiva, seteada al crear = `recordedAt` y en cada transición =
   `occurredAt`): evita la subconsulta `MAX(transición)` y es semántica de primera clase. El filtro/KPI **"Retrasadas"** se
   computa con un **JOIN raw** `LogEntry→WorkflowState` (`currentStateSince + maxStayMinutes < now()`), intersectado con el
   `where`+ABAC del listado (mismo patrón que la búsqueda por contenido 2.8.1a ⇒ cero fuga). A escala = endurecimiento Fase 7.
4. **Dos niveles de alerta** (estándar de monitoreo at-risk vs breach): estado actual **`at-risk` (ámbar)** al alcanzar el
   **80%** del SLA (`SLA_AT_RISK_RATIO`), **`breached` (rojo)** al superarlo; tramos pasados sobre su SLA = ámbar. El **filtro
   `delayedOnly`/KPI** cuenta solo **breached** (vencido, no en riesgo) para mantenerlo crítico.
5. **Superficie completa de "Retrasadas"** (espejo de `exceptionsOnly`): flag `delayedOnly`, KPI en `stats`, bucket en
   `/facets`, indicador "Atraso" por fila + columna, y **vista de SISTEMA** "Retrasadas".
6. **Responsable en el VISOR** (sin migración): la versión de flujo CONGELADA expuesta en el detalle resuelve `roleNames` por
   transición (backend); el `WorkflowDiagram` usa `roleNameOf` (builder) o cae a `tr.roleNames` (visor).

Helper puro **`evaluateSla`** en `@lyra/contracts` (workflows) = fuente única back↔front del veredicto de SLA; el cliente
formatea duraciones con `lib/format` (regional). El SLA viaja en la versión congelada ⇒ los registros históricos conservan su SLA.

---

### 2026-06-13 · Diagrama de flujo premium + plan SLA/atrasos — ✅ (visual) / 📋 (SLA aprobado, pendiente)

**Hecho (visual, sin modelo):** `WorkflowDiagram` reusable en visor/grilla (modo REGISTRO) y mantenedor de flujos (modo
DEFINICIÓN). Layout HORIZONTAL izq→der (estándar BPMN/Jira) con **puertos distribuidos** (anclajes repartidos por el borde
según el nodo opuesto) y **aristas de retorno ORTOGONALES por canal inferior** (no cruzan el flujo; estilo Sugiyama). Color
por estado (paleta por defecto si el estado no tiene color). "Dónde estás ahora" (glow pulsante + banner), "siguiente paso"
(aristas/nodos animados), **tiempos reales del registro** (duración por tramo + en estado actual). Tooltips premium. Modal
expandible (tamaño `xl` en `@lyra/ui`). **Responsable por elemento** (rol que ejecuta cada transición; el del estado = unión de
sus salientes) en nodo (definición) + tooltips; el builder pasa el resolver de nombres de rol (sin migración).

**Aprobado por el dueño (a implementar en sesión propia "Workflow SLA + atrasos"):**
- **SLA por ESTADO** (decisión del dueño): `WorkflowState.maxStayMinutes` nullable (migración aditiva) + campo en el
  `WorkflowBuilder` (minutos/horas, espejo de la ventana de edición) + contrato. Tiempo CALENDARIO en el MVP (horas hábiles =
  futuro, requiere el calendario operacional).
- **Diagrama (registro):** si el estado actual excede su SLA ⇒ **alerta roja** en el nodo (anillo pulsante + "Atrasado hace X ·
  SLA Y"); tramos pasados sobre SLA ⇒ badge ámbar.
- **Grilla:** indicador/columna "Atraso" ("⚠ En *Estado* hace 3 d · SLA 1 d") + filtro/faceta/KPI "Retrasadas"
  (`delayedOnly`). Backend computa: `status=DRAFT AND (now − inicio_en_estado_actual) > SLA_del_estado_actual` (inicio = última
  transición o `recordedAt`; SLA = estado actual de la versión congelada). A escala = endurecimiento Fase 7.
- **Responsable en el VISOR (registro):** exponer `roleNames` en la transición de la versión congelada (resolución backend, sin
  migración) para mostrar el responsable también fuera del builder.

---

### 2026-06-13 · Fase 2.8.1c — Peek lateral + facetas con conteo + review-by-exception + "Mi turno" — ✅ IMPLEMENTADO

**Cierre (cierra TODA la 2.8.1):** `GET /log-entries/facets` (5 dimensiones, conteos de hermanos, reusa `buildWhere`+ABAC),
`GET /log-entries/my-shift` (resuelve turno/día + autor vía `ShiftResolver`), `exceptionsOnly` en la query. Web: `FacetsPanel`
(panel lateral toggleable, clic = toggle de filtro → URL/SavedView), `PeekDrawer` (vistazo INSTANTÁNEO desde la fila, sin
round-trip; "Abrir ficha completa"; el clic en la fila abre el peek), realce por excepción en la fila (`rowClassName` en
`@lyra/ui` Table), vista de sistema "Mi turno", filtro de **equipo** en UI (cierra el pendiente 2.6.1). **Refinamiento sobre
el fork 2:** el peek se arma desde la fila (más rápido que reusar `getDetail`); el detalle completo se abre aparte. Extraído
`formatSummaryValue` a `logbook-cells` (compartido) y corregida la fecha de columnas a `lib/format` (regional, dejó de
hardcodear `es-CL`). Sin permisos nuevos (59). Tests contracts 163 · API 227. Smoke `scripts/smoke-facets-peek.py` **11/11**
(facetas, hermanos, exceptionsOnly acota, my-shift, ABAC de los 3 usuarios). **Pendiente: smoke VISUAL del dueño.**

---

### 2026-06-13 · Fase 2.8.1c — Peek lateral + facetas con conteo + review-by-exception + "Mi turno" — 📋 FORKS RESUELTOS

Tercer y último sub-slice de 2.8.1 (grilla orientada a contenido). El dueño aprobó avanzar con mi criterio, estándar
enterprise/premium. **5 forks resueltos:**

1. **Facetas = endpoint nuevo `GET /log-entries/facets`** (no extender `/stats`: responsabilidad distinta), server-side,
   reusando `buildWhere(userId, query)` (mismo where + ABAC ⇒ cero fuga). **Conteos de HERMANOS** (Kibana/Splunk): cada
   faceta se computa con el where SIN su propio criterio de dimensión ⇒ elegir un valor no anula las demás opciones.
   Dimensiones: `status`, `stateKey` (estado del flujo — el `<select>` deja de poblarse solo con el lote cargado),
   `templateId`, `equipmentId`, `band` (WARN/CRIT). COUNT exacto + tope de buckets; rollups/aproximado = Fase 7 (BACKLOG §3).
2. **Peek lateral = Drawer que reusa `getDetail`** (mismo endpoint del visor, misma autorización), vista REDUCIDA
   (cabecera + valores readOnly + indicadores) + "Abrir ficha completa" → `/bitacoras/:id`. **El clic en la fila abre el
   PEEK** (antes navegaba al visor); el botón "Editar" se mantiene. Hojear rápido sin salir de la lista (ServiceNow).
3. **"Mi turno" = backend resuelve los filtros** (`ShiftResolver.resolve(now, null)` con el calendario por defecto, porque
   el usuario abarca varios nodos): `createdById = yo` + `operationalDate` + `shiftCode` vigentes. Degradación: sin
   calendario ⇒ `createdById = yo` + `operationalDate = hoy` (sin shift). El cliente pide los filtros y los aplica (no
   acopla la grilla al motor). Cierra el diferido de 2.8.1b.
4. **Facetas ↔ URL/SavedView:** clic en un valor de faceta hace toggle del filtro correspondiente, reflejado en la URL ⇒
   capturable en una `SavedView`. **MVP single-select por faceta** (coherente con los filtros actuales single); multi-select
   por faceta = aditivo posterior (requiere volver multi esos filtros, como se hizo con nodos).
5. **Review-by-exception en capas:** (a) **realce visual por FILA** (tinte/borde sutil por la peor banda — solo semántica,
   regla de marca) reforzando los indicadores existentes; (b) **flag `exceptionsOnly`** opt-in en la query = OR de lo
   accionable (umbral WARN/CRIT **OR** firma pendiente; ambos queryables). "Fuera de ventana/período" NO es columna
   filtrable directa (se computa) ⇒ queda fuera del flag (se ve en el peek/visor).

**Sin permisos nuevos** (todo bajo `logentry:view` + ABAC). Pendiente: implementación + smoke.

---

### 2026-06-13 · Fase 2.8.1b — Vistas guardadas + gestor de columnas + multi-sort — ✅ IMPLEMENTADO

**Cierre:** entregado todo lo confirmado. `SavedView` (entidad genérica, migración `20260613130000`, índice único
parcial), `SavedViewsModule` CRUD ownership-gated, multi-sort keyset lexicográfico (cursor multi-columna, no pierde
filas en empates), `Table` column-aware en `@lyra/ui` (orden/ocultar/anclar sticky/anchos/densidad + badge de prioridad),
gestor de columnas (`ColumnsDrawer`), selector de vistas (`ViewBar`: sistema en código + personales + dirty + Guardar
como/Actualizar/Predeterminada/Eliminar), última vista en localStorage, y **columnas de VALOR individuales por plantilla**
(con 1 plantilla filtrada). **Recortes entregados como tales:** resize de columnas ✅ (grip de arrastre) / **autosize
diferido**; **"Mi turno" diferida a 2.8.1c** (requiere `ShiftResolver`); **orden global por columnas de valor diferido a
Fase 7** (rompería keyset). Sin permisos nuevos (catálogo 59). Tests contracts 163 · API 224. Smoke `scripts/smoke-saved-views.py`
**24/24** (CRUD, default único, ownership 404, validación, multi-sort + cursor reanuda/rechaza orden incongruente).
**Pendiente: smoke VISUAL del dueño.**

---

### 2026-06-13 · Fase 2.8.1b — Vistas guardadas + gestor de columnas + multi-sort — 📋 FORKS RESUELTOS

Segundo sub-slice del plan 2.8.1: **el usuario dispone**. Tras 2.8.1a (la plantilla *ofrece* el pool `gridFieldKeys`),
aquí el usuario elige qué ver, en qué orden, lo guarda y lo reusa. **5 forks resueltos con el dueño (confirmados):**

1. **Modelo de `SavedView` = entidad GENÉRICA de PLATAFORMA** con `module` discriminador (`"LOGBOOK"` hoy; reusable por
   Incidencias Fase 4) + **`config jsonb`** validado por Zod (`{filters, search, sort[], columns{order,hidden[],pinned{left,right},
   widths}, density}`) — NO columnas por atributo (universo abierto, mar de NULLs; misma razón que `TemplateField.config`).
   **`isDefault` único por `(userId, module)` vía índice único PARCIAL** `WHERE "isDefault"` (Postgres; migración a mano).
   **Alcance: solo personal ahora**; compartir por rol DIFERIDO pero aditivo (slots `scope`/`sharedRoleId` a futuro, sin
   romper). **Sin permisos nuevos (catálogo sigue en 59):** una vista es DATO PERSONAL del usuario (como favoritos/ui-store,
   pero server-side para cross-device); el backend autoriza por **ownership** (`userId === session.user.id`) + acceso al módulo
   (`logentry:view`, ya existe); el front solo refleja. No inflar RBAC con una preferencia de UI. Refs: SAP Fiori *variants*
   (personal+default), ServiceNow *personal list views*.

2. **Vistas de SISTEMA en CÓDIGO, no BD** (no migrables). Constantes que producen un grid-state. Selector con grupo "Sistema"
   (solo lectura; "Guardar como…" las bifurca a personal) + grupo "Mis vistas". Entrego las 3 expresables con filtros
   existentes: **"Firmas pendientes"** (`pendingSignature`), **"Excepciones"** (`thresholdBand=ANY`), **"Últimas 24h"** (preset
   effective 1d). **"Mi turno" DIFERIDA a 2.8.1c** (necesita resolver turno/persona actual vía `ShiftResolver` — es motor, no
   filtro; no se entrega a medias).

3. **Gestor de columnas = separar render de configuración.** El `Table` de `@lyra/ui` evoluciona a **column-aware** (props
   controladas: orden, ocultas, ancladas izq/der, anchos; emite cambios) = reusable por Incidencias. La **UI de gestión** vive
   en panel/Drawer aparte ("Columnas": checklist + drag reorder + toggles de anclar) que alimenta esas props. Reorder = drag
   nativo HTML5 (sin dep). Pin = sticky. **Anchos manuales + persistencia ahora; resize-drag/autosize = stretch goal** (si el
   contexto da; si no, 2.8.1c). **Columnas de VALOR por plantilla (nivel 2/3) solo con 1 plantilla filtrada** (claves homogéneas
   → ofrece sus `gridFieldKeys` como columnas); con 0 o ≥2 plantillas cae a la línea "Resumen" (= Fiori smart columns,
   coherente con 2.8.1a).

4. **"Última vista" efímera en localStorage** (id de la última vista aplicada / estado ad-hoc por usuario-dispositivo); vistas
   nombradas en BD. Espejo de `ui-store`/`workspace-store`. **Multi-sort — objeción técnica (cito *Use The Index, Luke*):** la
   paginación keyset exige tupla INDEXADA; hoy solo `recordedAt/effectiveAt/entryNumber` tienen índice keyset `(col,id)`.
   ⇒ **multi-sort server-side LIMITADO a esas 3 columnas indexadas** (lista ordenada, máx 2–3 claves). **Orden por columnas de
   VALOR = solo client-side sobre el lote cargado** (≤100, etiquetado "orden del lote visible"), NUNCA global. **Orden global
   por valores arbitrarios = Fase 7** (columnas de orden denormalizadas / OpenSearch; ya en BACKLOG §3, no se improvisa).

5. **Deep-link/URL ↔ SavedView:** la URL sigue siendo el estado canónico en runtime; la vista es un snapshot nombrado. Aplicar
   una vista ESCRIBE su config en la URL/estado y marca "vista activa = X" (efímero); deep-link sin vista = estado desde params
   (como hoy). Tras aplicar, tocar filtros marca la vista **"modificada" (dirty)** → "Actualizar vista" / "Guardar como nueva"
   (patrón dirty de Fiori variants). **Separación (ServiceNow/Fiori):** la URL lleva *qué datos* (filtros+búsqueda+sort) =
   compartible; **columnas+densidad** (*cómo lo veo yo*) viven en la vista/localStorage, **NO en la URL** (verbosa, impersonal).

**Recortes declarados** (para que el slice sea cerrable en una sesión): resize/autosize de columnas = stretch; "Mi turno" y
orden global por valores = slices posteriores. Si el contexto se llena, consolido y se parte. Ver BACKLOG §2.

---

### 2026-06-13 · Afinamiento UX de la grilla de Bitácoras (QA del dueño) — ✅ IMPLEMENTADO

Tras el smoke visual de 2.8.1a el dueño pidió un overhaul de UX de la grilla. Es **frontend** (salvo un cambio chico de
backend para multi-nodo); las **Vistas Guardadas** (`SavedView`, backend nuevo) quedan para **2.8.1b** (su propia sesión).

1. **Defecto de 2.8.1a — párrafos del Resumen desbordados.** Un valor TEXTAREA largo se renderizaba `nowrap` sin tope y
   rompía la fila. Fix: el Resumen apila "etiqueta: valor" y **trunca cada valor con ellipsis** (texto completo en el `title`).
   Además se **muestran todos los candidatos con valor** (no solo 3; el pool ya está acotado a 6).
2. **Filtros: barra PRIMARIA + "Más filtros" en `Drawer`** (acordado). 4 filtros de mayor uso visibles (Buscar, Nodo,
   Plantilla, Estado) + presets; el resto en un panel lateral con **badge** del nº de filtros activos. Patrón SAP Fiori.
3. **Filtro de nodo MULTI-NODO real** (acordado, toca backend): el listado acepta **`orgNodeIds`** (CSV→arreglo; `orgNodeId`
   legacy se mantiene). `buildWhere`: con `includeDescendants` = **OR de prefijos de ruta** por nodo; sin él `orgNodeId IN`.
   El **ABAC sigue en AND aparte** (filtrar por un nodo fuera de alcance no amplía lo visible). UI: `MultiSelect` de `@lyra/ui`.
4. **Paginador DISCRETO numerado, ARRIBA y ABAJO** (pedido). Keyset/cursor para escala: el servidor trae lotes de **100** y la
   grilla **pagina ese lote en el cliente** (rango "X–Y de N", selector 10/25/50, **inicio « ‹ números › » fin**); "siguiente"
   en la última página trae el lote siguiente del servidor si lo hay. No se hizo paginación numerada server-side (incompatible
   con keyset; offset+count se evaluará si el volumen lo exige).
5. **Pulidos pedidos:** botón **"Actualizar"** (refetch lista+KPIs, ícono girando); **KPI cards** centradas con **contorno
   premium** (borde + realce + glow del acento en hover, sin sombras negras); **lista enmarcada** en card contenida; `<select>`
   "por pág." discreto (sin outline blanco nativo, flecha propia, foco con acento).

Verde: typecheck/lint (0 err) · API **217** (+1 test multi-nodo) · contracts 154 · build web · **smoke 25/25**
(`scripts/smoke-grid-content.py` + filtro multi-nodo). **Pendiente: re-confirmación VISUAL del dueño.**

---

### 2026-06-12 · Fase 2.8.1a — Bitácoras: grilla orientada a contenido (MVP) — ✅ IMPLEMENTADO

Primer sub-slice del plan 2.8.1 (ver entrada de plan más abajo). Resuelve la queja del dueño: la grilla es ciega
al contenido. Entrega: campos candidatos de resumen marcados en la plantilla + **línea Resumen** + columna **Equipo**
+ **búsqueda por contenido**. **6 forks resueltos con el dueño (4 vía recomendación aceptada, 3 por criterio técnico):**

1. **`showInGrid` vive en el CONTENEDOR mutable, NO en el campo versionado** (recomendación mía aceptada, corrige el
   plan que nombró `TemplateField.showInGrid`). `TemplateField` vive en `TemplateVersion` **inmutable (MMR Part 11)**:
   poner ahí el flag obligaría a clonar borrador + republicar una versión CONTROLADA solo por un *hint* de
   visualización ⇒ ensucia el historial GxP y fuerza re-aprobación por algo no sustantivo. Decisión: `Template.gridFieldKeys
   String[]` (lista ORDENADA de `key` estables — el mismo `key` que usa `LogEntryValue.fieldKey` en todo el sistema),
   guardado con **"Guardar configuración"** vía `PATCH /templates/:id` (espejo exacto de `equipmentMode`/`editWindow`):
   se aplica en vivo a todas las versiones/entradas SIN republicar (lo que el dueño pidió). Key huérfano (campo
   renombrado/eliminado) = inofensivo (se ignora; se poda al publicar). La parte "viva/reactiva" real (qué columnas ve
   CADA usuario) la cubre el USUARIO en 2.8.1b (SavedView); el nivel plantilla solo *ofrece* el pool ⇒ versionarlo no aporta.
2. **Tope del pool = 6 candidatos.** Pool ilimitado = columnas/valores ilimitados que batch-cargar + Resumen
   ininteligible. 6 cubre el default de 2–3 con holgura (Fiori smart columns son acotadas). Validado en contrato + backend.
3. **Default = LÍNEA "Resumen" compuesta**, NO columnas individuales. La grilla mezcla entradas de muchas plantillas;
   columnas por-campo solo tienen sentido con UNA plantilla filtrada (claves homogéneas) — como Fiori. Una celda
   "Resumen" por fila (`Temp 78 °C · Presión 9 bar`, primeros 3 candidatos de SU plantilla) funciona en lista
   heterogénea (cada fila se resume a sí misma). Columnas individuales = 2.8.1b (con gestor de columnas + SavedView).
4. **Búsqueda por contenido acotada a los candidatos `showInGrid`** ("lo que ves es lo que buscas"). `EXISTS` sobre
   `LogEntryValue` de los campos candidatos, `value::text ILIKE %q%`, **dentro del mismo `buildWhere`** (AND con ABAC,
   OR con el `q` actual folio/plantilla/nodo). Índice GIN trigram (`pg_trgm`) sobre `(value::text)` para mantenerla
   rápida on-prem. **Limitación honesta del MVP:** busca el valor ALMACENADO (texto/número/**code**); para SELECT de
   lista de referencia el `code` no matchea el label (búsqueda por label = deuda, requeriría denormalizar el label).
5. **Backend sin N+1** (criterio): extiende `enrich()` (batched por página) con 3 queries — `gridFieldKeys` de las
   plantillas distintas + `LogEntryValue` de `logEntryId ∈ página AND fieldKey ∈ unión(candidatos)` + meta de campo
   CONGELADA (`TemplateField` por `templateVersionId` distintos, para label/unidad/tipo/banda) + resolución batched
   code→label de listas de referencia. **Formato regional**: el backend manda valor ESTRUCTURADO + meta (no string
   pre-formateado); el CLIENTE formatea números/fechas con `lib/format.ts` (regla regional). Contrato:
   `summaryValues: { fieldKey, label, dataType, value, unit?, optionLabel?, thresholdBand }[]` en `LogEntryListItem`.
6. **Columna Equipo + ABAC** (criterio): `Equipment.tag` (único) + `name` ⇒ display **`TAG · Nombre`** (Maximo asset
   num + descripción); orden EAM **Folio · Plantilla · Nodo · Equipo · Resumen · Estado · …**. Los valores se
   batch-cargan SOLO para los `pageIds` ya filtrados por node+template ABAC en `buildWhere`; la búsqueda por contenido
   vive DENTRO del mismo `where` ⇒ cero fuga de contenido fuera de alcance (confirmado por smoke).

**Afinamiento QA del dueño (smoke visual, 2026-06-13) — 2 ajustes:** (a) **mostrar TODOS los candidatos con valor**, no
los primeros 3. El dueño marcó 6 campos y solo veía 3 (el `slice(0,3)` del default) ⇒ "no se reflejan". Como el pool ya
está acotado a 6, la línea Resumen muestra todos los marcados que tengan valor (la elección/orden por usuario sigue para
2.8.1b). (b) **búsqueda por contenido CASE-INSENSITIVE**: el `string_contains` de Prisma sobre JSON era sensible a
mayúsculas (`"Conforme"` no encontraba el code `conforme`). Reemplazado por un `$queryRaw` con **`ILIKE` sobre `value::text`**
(usa el índice GIN trigram), resuelto a un set de ids que se intersecta con el ABAC del `where` externo. Persiste la deuda
de buscar por **label** del SELECT (hoy matchea el code: `"No conforme"` no encuentra `no_conforme`).

---

### 2026-06-12 · Plan de Fase 2.8.1 — Bitácoras: grilla ORIENTADA A CONTENIDO + personalización — 📋 ACORDADO (no implementado)

El dueño detectó el problema raíz de `/bitacoras`: la grilla es **ciega al contenido**. Muestra metadatos (folio, plantilla,
nodo, estado, fechas, autor, indicadores) pero **ningún dato del negocio** que la bitácora capturó (temperatura, presión,
"operó normal", equipo) ⇒ es imposible *reconocer ni encontrar* un registro por su contenido. Analizado cómo lo resuelven los
sistemas líderes (SAP Fiori, j5/Hexagon Operations Logbook, IBM Maximo, ServiceNow, Splunk/Kibana, EBR/Körber PAS-X). **Patrón
común que a nosotros nos falta:** (1) un **descriptor/resumen legible** por registro, (2) **valores de negocio clave** como
columnas, (3) **búsqueda por contenido** + **facetas con conteo**, (4) **peek/expand** para ver detalle sin salir, (5)
**personalización = vistas guardadas + gestor de columnas**, (6) **review-by-exception**.

**Diseño acordado (mi mejor propuesta, aprobada por el dueño):**
- **Columnas en 3 niveles:** metadatos [hoy] · **valores de negocio/Resumen** [lo que falta] · **Equipo** [EAM, ya existe].
- **Descriptor — fork resuelto con el dueño:** la **PLANTILLA marca el *pool* de campos candidatos** (toggle por campo
  `showInGrid`, gobernanza viva, sin republicar) y **el USUARIO elige cuáles ver** (columnas individuales o una línea
  "Resumen" compuesta), con un default sensato (primeros 2–3). Lema: *"el diseñador ofrece, el usuario dispone"* (= SAP Fiori
  smart columns + variants). Preferencia explícita del dueño: marcar en la plantilla TODOS los candidatos, a gusto del usuario.
- **Personalización (absorbe 2.6.1):** entidad **`SavedView`** de PLATAFORMA (`module` discriminador, reusable por Incidencias
  Fase 4; config {filtros, búsqueda, orden, columnas{orden,ocultas,ancladas,anchos}, densidad}; una default por usuario+módulo;
  vistas de sistema EN CÓDIGO) + **gestor de columnas** (evoluciona el `Table` de `@lyra/ui`) + densidad + recordar última vista.
- **Buscar y encontrar:** búsqueda sobre VALORES de campo + **facetas con conteo** (estilo Splunk) + **vistazo (peek)** lateral
  reusando `getDetail` (estilo ServiceNow) + **resaltado por excepción** (estilo EBR/MES).
- **Entrega en 3 sub-slices** (sesión cerrable cada una): **2.8.1a** contenido reconocible (MVP: `showInGrid` + Resumen/valores
  + Equipo + búsqueda por contenido) → **2.8.1b** SavedView + gestor de columnas + multi-sort → **2.8.1c** peek + facetas +
  review-by-exception. La "Parte A" del #9 (acceso nodo↔grilla: mis nodos/recientes/favoritos) se intercala en a/b.
- **Adiciones de modelo (aditivas):** `TemplateField.showInGrid` (flag, gobernanza viva) + entidad `SavedView`. El backend ya
  guarda `LogEntryValue`; solo falta exponer los valores seleccionados en el listado de forma acotada y eficiente.
- **Arrancar por 2.8.1a** (es lo que tiene "atado" al dueño hoy; bajo riesgo, alto impacto). Ver BACKLOG §2.

---

### 2026-06-12 · Afinamiento UX del TemplateBuilder (vistas + guardado de gobernanza) — ✅ IMPLEMENTADO

Iteración de UX del dueño sobre el builder de plantillas (tras 2.8.0.2). Cuatro decisiones:

1. **El guardado de la CONFIGURACIÓN/gobernanza se separa del borrador, con su propio botón explícito (NO autosave).**
   El dueño observó que cambiar un ajuste (modo de equipo, ventana de edición) y volver atrás no guardaba, pero tampoco
   quería publicar. El builder mezclaba todo en "Guardar borrador" (que crea/clona una versión). **Decisión:** la
   gobernanza viva del contenedor (identidad, alcance de nodos, ventana de edición, modo de equipo) se guarda con
   **"Guardar configuración"** vía `PATCH /templates/:id` (`useUpdateTemplate`), **en vivo, sin crear borrador ni
   publicar**; la DEFINICIÓN (secciones/campos/flujo) sigue por "Guardar borrador"→"Publicar". Para que no se pisen, se
   **quitaron** del payload del borrador (`editStateToDraftRequest`) los campos de gobernanza (nodeAssignments,
   editWindow*, equipmentMode) y se creó `editStateToConfigRequest`. Descartado el autosave (el dueño lo rechazó): un
   botón explícito es más predecible para un ajuste. Solo en EDICIÓN (el PATCH exige un id; la creación es un modal aparte).
2. **El FLUJO se queda en Diseño, NO en Configuración** (honestidad técnica): el flujo es **definición versionada**
   (`PATCH` no lo acepta; cambiarlo exige publicar). Ponerlo bajo "Guardar configuración" mentiría sobre el "se aplica
   sin publicar".
3. **Layout en riel vertical premium** (2 secciones: **Configuración** [por defecto] · **Diseño**) en vez de tabs
   horizontales. Configuración tiene 2 sub-pestañas (**Identidad y gobernanza** | **Alcance y acceso**); Diseño absorbe la
   **Vista previa** como sub-pestaña (Editor | Vista previa). La barra del builder se hace **sticky** bajo el topbar
   global (offset `--wl-sticky-top`) para no perder las acciones al hacer scroll. Sin permisos nuevos.
4. **`ScopeTreePicker` + `Toast` (`@lyra/ui`) más prolijos** (componentes compartidos ⇒ mejoran también Seguridad y todos
   los avisos): el árbol deja de teñir la fila seleccionada (el check ya lo indica) y alinea el toggle "Incluye
   descendientes" a la derecha; el resumen de seleccionados pasa a panel con cabecera (cuenta + Limpiar) y chips debajo.
   El Toast gana barra de acento por variante + glow del color (no sombra negra) + badge del icono, para que no pase
   desapercibido. Verde: typecheck/lint (0 err)/build/test (API 216 · contracts 151). **Smoke VISUAL ✅** (dueño).

**Nota operativa (no es código):** la plantilla demo «Bitácora de Turno — Demo Completa» tenía su versión PUBLICADA (v5)
con `config = {}` en todos los campos por una republicación antigua (código previo a los arreglos). Se verificó con
round-trips (crear/editar/publicar) que el código ACTUAL conserva la config; se restauró el dato copiando la config de la
v2 (que la conserva) a la versión publicada. El seeder `scripts/demo-bitacora.py` es idempotente por nombre (no re-siembra).

---

### 2026-06-12 · Fase 2.8.0.2 — Modo de equipo por PLANTILLA (gobernanza, "opción B") — ✅ IMPLEMENTADO

Capa de **gobernanza** sobre la mecánica EAM de 2.8.0.1: el TIPO de registro (la plantilla) declara cómo se trata el equipo
y el backend lo **AUTORIZA**. Patrón **notification-type de SAP PM / WO-type de Maximo**: el tipo de registro decide si el
objeto de referencia es obligatorio (una mantención/inspección exige equipo; un turno/área lo deja opcional u oculto). **6
forks resueltos con el dueño** (recomendación primero, fundada):

1. **Dónde vive `equipmentMode` → en `Template` (contenedor MUTABLE), NO en `TemplateVersion`.** Es **gobernanza VIVA**:
   cambiarlo aplica de inmediato a entradas nuevas sin republicar la versión, espejo exacto de la ventana de edición 2.7.2 y
   del notification-type de SAP (master data configurable, no parte congelada del documento). No re-validamos históricos
   (el equipo ya quedó o no estampado), así que congelarlo no aportaría.
2. **Enum `NONE | OPTIONAL | SUGGESTED | REQUIRED`** (el dueño pidió incluir SUGGESTED). **OPTIONAL y SUGGESTED son
   idénticos en el BACKEND** (permisivos, sin enforcement); SUGGESTED solo cambia la UX (autoselecciona el equipo único,
   "recomendado", pero permite "(sin equipo)"). NONE oculta; REQUIRED obliga. Extensible de forma aditiva.
3. **Enforcement de REQUIRED en `create`/materialización** (no en submit/transición). `equipmentId` es un dato de creación
   (se estampa una vez, como `orgNodeId`; no se edita por sección ni después). En modo compose la materialización ES un
   create ⇒ el gate corre ahí. Hacerlo en submit dejaría borradores huérfanos sin equipo con dims/período ya estampados.
   La **"huella"** del faltante NO es un `blockedReason` de sección (corre antes de que existan secciones): vive en el modal
   de creación (el front fuerza la selección, gateado por el `equipmentMode` que `eligibleNodes` expone) + 400 del backend.
4. **Default de migración = OPTIONAL** (no NONE): preserva EXACTAMENTE el comportamiento contextual de 2.8.0.1 en plantillas
   ya publicadas (cero ruptura). NONE habría ocultado el equipo = regresión. Migración aditiva sin backfill destructivo.
5. **UI**: control "Equipo en la entrada" en el `TemplateBuilder` (junto al alcance de nodo / ventana de edición), gate
   `template:edit` (sin permiso nuevo, catálogo sigue en **59**). En el modal de creación: REQUIRED quita "(sin equipo)" y
   obliga (botón Continuar deshabilitado sin equipo; aviso si el nodo no tiene equipos activos); SUGGESTED empuja; NONE no
   muestra equipo (y `eligibleNodes` no consulta equipos).
6. **No re-validar al sellar** si un equipo REQUIRED se da de baja luego: el equipo se estampa al crear (existe+activo+nodo);
   el histórico queda **intacto** (igual que `shiftCode`/`periodKey`). "Bloquear sellado si el objeto de referencia se retiró"
   queda diferido (BACKLOG) por si un cliente lo exige.

**Implementación.** Contrato: `EQUIPMENT_MODES`/`equipmentModeSchema` + `equipmentMode` en `templateSchema`/list/detail y en
create/update/saveDraft (opcional) + en `templateEligibleNodesSchema`. Prisma: enum `EquipmentMode` + `Template.equipmentMode
@default(OPTIONAL)`, migración aditiva `20260612180000_add_template_equipment_mode`. Backend: `TemplatesService` persiste/mapea/
audita (before/after de gobernanza); `LogEntriesService.assertEquipmentForMode` (gate duro en `create`: REQUIRED sin equipo →
400, NONE con equipo → 400) + previewNew solo valida consistencia de NONE (REQUIRED no bloquea al componer); `eligibleNodes`
expone `equipmentMode` y omite equipos si NONE. Web: control en builder + lógica del modal en `NewEntryPage`. Verde:
typecheck/lint (0 err)/build · tests **contracts 151** (+2) · **API 216** (+3) · smoke en vivo **17/17**
(`smoke-template-equipment-mode.py`, crea plantilla+equipo, recorre los 4 modos, **crea+limpia por ID** vía psql cascade;
AuditLog inmutable conserva el rastro). Pendiente: smoke VISUAL. **NO probado en vivo con operador/supervisor/mantenedor** por
separado: el gate corre en `create` ANTES de los chequeos de rol ⇒ es independiente del rol (cubierto por unit tests).

---

### 2026-06-12 · Fase 2.8.0.1 — Equipo OPCIONAL al crear entrada (objeto de referencia EAM) — ✅ IMPLEMENTADO

Tras el selector de nodo (2.8.0), el dueño observó que un nodo puede tener equipos y pidió poder **tagear la bitácora a
una máquina concreta**. Se investigó el estándar industrial antes de decidir (respaldo en el chat): EAM/CMMS modelan un
**objeto de referencia de dos ejes** — **ubicación funcional** [nuestro nodo] + **activo/equipo** — donde SAP PM permite
equipo *o* ubicación (opcional según lo que se reporta) y al elegir el equipo **deriva la ubicación donde está instalado**;
Maximo lleva **ambos** en el registro. **ISO 14224** fundamenta el grano: la analítica de confiabilidad (RCM/RCA, modos de
falla por clase) requiere el dato a nivel de **equipo/ítem mantenible**, no solo de área — registrar el equipo es lo que
habilita la analítica y el motor de incidencias (Fase 4). Las bitácoras de turno comerciales (j5/Hexagon) taggean la entrada
a la unidad/activo. El modelo de Lyra **ya contemplaba** `LogEntry.equipmentId` (create/previewNew lo aceptaban desde 2.4);
solo faltaba exponerlo.

**Decisión (con el dueño): implementar AHORA el "opción A" (equipo OPCIONAL contextual) y AGENDAR el "opción B" (modo de
equipo por plantilla).** Fundamento: A no es un atajo, es la **mecánica del objeto de referencia** (nodo siempre + equipo
opcional instalado en ese nodo, con el backend validando consistencia), que es exactamente cómo SAP capa el modelo (el campo
existe siempre; la obligatoriedad por tipo de registro se añade después). B (`equipmentMode` por plantilla:
`ninguno/opcional/requerido`, patrón notification-type de SAP / WO-type de Maximo) es el end-state de gobernanza y queda como
slice propio con migración + control en el TemplateBuilder (BACKLOG §2, 2.8.0.2).

**Implementación (A).** Contrato: `eligibleEquipmentSchema` + `equipment[]` dentro de `eligibleNodeSchema`. Backend:
`eligibleNodesForTemplate` carga los equipos ACTIVOS por nodo (1 query, agrupados); **`assertEquipmentInNode`** en
`create`/`previewNew` valida que el equipo exista, esté activo y **pertenezca al nodo** de la entrada (defensa en profundidad
— el front ya ofrece solo los del nodo). Web: el modal "Elige el nodo" gana un selector de **equipo opcional** (Combobox,
"(sin equipo)") que aparece solo si el nodo elegido tiene equipos; el modal ahora se abre también cuando hay **1 nodo con
equipos** (antes solo con >1 nodo). `equipmentId` viaja por compose→create (y previewNew). i18n es-CL. Verde: typecheck/lint
(0 err)/web build · tests API 213 · smoke en vivo **18/18** (`smoke-template-multinode.py` +3: elegibles con equipo, preview
con equipo del nodo 200, equipo de otro nodo 400). Pendiente: smoke VISUAL.

---

### 2026-06-12 · Fase 2.8.0 — Plantillas MULTI-NODO (eje de NODO de la visibilidad de plantilla) — ✅ IMPLEMENTADO

Hoy `Template.orgNodeId` ataba cada plantilla a **un solo nodo** (o global). Se introduce la asignación N:M
**plantilla × nodo** con 3 modos (un nodo / varios / "todos los hijos de X" incl. nodos futuros), que gobierna la
**visibilidad por nodo** (picker + grilla admin) y, al CREAR una entrada, ofrece un selector de nodo acotado a
(asignaciones de la plantilla ∩ nodos accesibles del usuario) — resolviendo también el diferido (a) de 2.4 (plantillas
globales sin nodo al crear). **Es el eje de NODO** (no confundir con el alcance por PLANTILLA de 2.8, que limita QUÉ
plantillas ve un USUARIO/ROL); ambos se mantienen ORTOGONALES y combinan en AND. **6 forks resueltos con el dueño:**

1. **Modelo = entidad nueva `TemplateNodeAssignment` (templateId × orgNodeId + `includeDescendants`), N:M aditiva, FUENTE
   DE VERDAD ÚNICA de la visibilidad por nodo.** `Template.orgNodeId` se **conserva como "nodo primario" DERIVADO**
   (deprecado): se calcula = el nodo cuando hay UNA sola asignación de nodo simple, `null` en global/varios/rama; nunca se
   edita por separado ⇒ **sin drift posible**. Se decidió NO dropear la columna ahora (rompería contratos/web a mitad de
   feature); su DROP queda como **deuda técnica** en BACKLOG §3. Fundamento: una sola fuente de verdad normalizada en la ruta
   de autorización (lo que un auditor exige), retirando la columna de la LÓGICA hoy y del ESQUEMA después — patrón SAP PM /
   Maximo (la disponibilidad por sitio/ubicación es una relación N:M; cualquier "principal" es derivado, no verdad paralela).
2. **Semántica "global" = CERO asignaciones** (sin filas = visible en todo nodo), consistente con la semántica **PERMISIVA**
   ya adoptada en ambos ejes ABAC ("ausencia = sin restricción") y con SAP/Maximo (app sin restricción de sitio = disponible
   en todos). Migración **sin backfill de globales** (las `orgNodeId=null` → 0 filas), cero ruptura. *"Todos los hijos de X"*
   (1 fila `includeDescendants=true`) es DISTINTO de global: subárbol explícito sin abrir a toda la organización.
3. **Combinación con el ABAC de nodo del usuario:** la plantilla es visible si el usuario no tiene restricción, o es global,
   o **ALGUNA** asignación intersecta `getAccessibleNodes`. Intersección de `(M, incDesc)`: `M ∈ accesibles`, **o** (si
   `incDesc`) algún nodo accesible es descendiente de M (`path.startsWith(M.path)`, ruta materializada con "/" final ⇒ sin
   colisión entre hermanos). En **AND** con el eje de PLANTILLA (2.8), sin cambios en ese eje.
4. **Selector de nodo al crear = FORZAR elección (decisión del dueño).** Opciones = `expand(asignaciones) ∩ accesibles`
   (global = todos los accesibles). 1 nodo ⇒ autoselección (cero fricción, como hoy); **>1 ⇒ el operador DEBE elegir** (sin
   default silencioso): correctitud sobre comodidad, una entrada estampada en el nodo equivocado corrompe la bitácora y es
   difícil de revertir (sellado). **El backend AUTORIZA** la membresía en `create` y en `previewNew` (`assertNodeAllowedForTemplate`);
   el front solo la ofrece. Endpoint `GET /log-entries/templates/:id/nodes` (gate `logentry:create`) sirve los elegibles.
5. **Entradas YA creadas = histórico intacto** (confirmado por diseño). Las entradas estampan su `orgNodeId` (sellado
   ALCOA+); quitar/cambiar una asignación gobierna la **creación y la visibilidad de la plantilla**, NO reescribe entradas.
   La grilla `/bitacoras` sigue filtrando por el ABAC de nodo del USUARIO, no por las asignaciones actuales de la plantilla.
6. **UI = en el TemplateBuilder (decisión del dueño), gate `template:edit`.** Sección "Alcance de estructura (nodos)" que
   **reutiliza `ScopeTreePicker`** (mismo shape `{orgNodeId, includeDescendants}`) con un nuevo prop `defaultIncludeDescendants`
   (default `true` en seguridad; `false` aquí = "solo este nodo", más preciso). 0 filas = aviso "GLOBAL". El alta rápida
   (`CreateTemplateModal`) mantiene 0/1 nodo y el multi-nodo completo se edita en el builder. `NewEntryPage` autoselecciona
   (1) o abre un modal de elección (>1, `Combobox` searchable). `TemplatesPage`/picker muestran "Global / N nodos / nodo (y
   subnodos)".

**Implementación.** Migración aditiva `20260612170000_add_template_node_assignment` (tabla + `@@unique([templateId,orgNodeId])`
+ índice + **backfill** 1 fila `incDesc=false` por plantilla con `orgNodeId`; globales → 0 filas; verificado 3→3, 0 globales).
Contratos: `templateNodeAssignmentInput/Schema` + `nodeAssignments` en detail/list + en create/update/saveDraft requests
(`orgNodeId` marcado `@deprecated`) + `eligibleNodeSchema`/`templateEligibleNodesSchema` en log-entries. `ScopeService`:
`getAccessibleNodes` (ids + rutas, fuente única de la que cuelga `getAccessibleNodeIds`/`canAccessNode`), `nodeAssignmentInScope`,
`isTemplateVisibleByNode` (puros). `TemplatesService.list/getDetail/create/updateMeta/saveDraft` filtran/persistten/derivan por
asignaciones (audit before/after del set); `updateMeta` pasó a transacción por atomicidad. `LogEntriesService.create/previewNew`
validan membresía; `eligibleNodesForTemplate` + endpoint. Web: `ScopeTreePicker` (prop nuevo), `TemplateBuilder`, `NewEntryPage`
(selector), `TemplatesPage`, builder-model, api/queries, i18n es-CL. Verde: typecheck (todos) · lint (0 err, 1 warn preexistente
OrgTree) · web build · tests **API 213** (+8: visibilidad por nodo/elegibles/rechazo) · contracts 149. **Smoke en vivo 15/15**
(`scripts/smoke-template-multinode.py`: persistencia 1-nodo/rama/global, elegibles 1 vs 31, previewNew 200/400, picker filtrado
por alcance de nodo del operador restringido; CREA plantilla + ajusta scope y **limpia TODO por ID**). Pendiente: smoke VISUAL.

---

### 2026-06-12 · Fase 2.8 — Afinamiento (QA del dueño) — ✅ IMPLEMENTADO

Cuatro correcciones tras probar 2.8 en pantalla:

1. **Selectores premium + bug de anclaje (todos los selectores).** El panel flotante se **encogía
   progresivamente al arrastrar su propia barra de scroll**. Causa: `useAnchoredPanel` escuchaba `scroll` en
   **captura** (catchea el scroll INTERNO del panel) y `maxHeight` se **realimentaba** de `panel.scrollHeight`
   ya recortado. Fix: (a) ignorar los eventos de scroll cuyo `target` está dentro del panel; (b) `maxHeight` con
   **tope absoluto por viewport** (no de la medición previa) ⇒ converge sin encoger. Además, rediseño visual de
   `Combobox` y `MultiSelect` a estándar premium (iconos **Lucide** en vez de glifos ASCII, `ChevronDown` animado,
   `Search` en el buscador, panel con glass/sombra/anim, estados de opción con acento). Dual-theme vía tokens.
2. **Fuga del filtro de Bitácoras.** El `<Combobox>` de "Plantilla" en `/bitacoras` se poblaba con
   `useTemplates` (`GET /templates`, alcance solo de NODO) ⇒ ofrecía plantillas fuera del alcance de plantilla.
   Nuevo `GET /log-entries/filter-templates` (`logentry:view`) acotado por el **mismo alcance que la grilla**
   (nodo × plantilla). La grilla ya filtraba bien (era solo el selector).
3. **Editor de rol a pestañas.** El alcance por plantilla quedaba sepultado al final de la matriz de permisos.
   `RoleDrawer` reorganizado a **pestañas (Datos / Permisos / Alcance)** y drawer más ancho (760px).
4. **Acceso por rol desde la PLANTILLA (vista recíproca).** Pedido del dueño: asignar roles directamente desde
   la pantalla de Plantillas. `GET/PUT /templates/:id/role-scope` con `TemplateAccessModal` (MultiSelect de
   roles). **`setRoleScope` reemplaza SOLO las filas `TemplateScope` de esa plantilla con `roleId` no nulo** ⇒
   "sin sacar de lo que existe en los roles": el resto del alcance de cada rol y las asignaciones por usuario
   quedan intactos. **Gate = `template:edit`** (decisión): quien diseña la plantilla ya gobierna su nodo
   (visibilidad por nodo), así que gobernar también su audiencia por rol es coherente y permite hacerlo "directo"
   en Plantillas sin exigir permisos de admin de seguridad; si se requiere separación estricta, se puede regatear.
   Auditado (`template.rolescope.assigned`).

Verde: typecheck (6) · lint (0 err, 1 warn preexistente OrgTree) · web build · API **205** · smokes en vivo
**14/14** (2.8) + **8/8** (afinamiento: filtro con alcance, role-scope desde plantilla, garantía de no-borrado del
resto del alcance del rol). Pendiente: smoke VISUAL del dueño (selectores premium + pestañas del rol + modal de acceso).

---

### 2026-06-12 · Fase 2.8 — Alcance por PLANTILLA (2.ª dimensión ABAC) — ✅ IMPLEMENTADO

Hoy quien tiene `module:logbook:view`/`logentry:create` + alcance de **nodo** ve/usa **todas** las plantillas y entradas de
ese nodo, sin importar a qué plantillas tiene privilegio (detectado en vivo en la demo 2.8.2; SECURITY §2.4 ya lo contemplaba).
Se agrega la **2.ª dimensión de alcance de datos**: limitar **qué plantillas** ve/usa cada usuario y filtrar con eso el
**picker** de `/nueva-entrada` y la **grilla/stats/export** de `/bitacoras`. Los **roles por sección** (ya implementados)
limitan QUÉ edita dentro de una plantilla, NO su visibilidad — son ejes distintos, no se mezclan. **6 forks resueltos con el
dueño (recomendación primero):**

1. **Modelo — entidad aparte `TemplateScope`, NO extender `Scope`.** El `Scope` de nodo es intrínsecamente jerárquico
   (`orgNodeId` obligatorio + `includeDescendants` + ruta materializada + únicos `[user,node]`/`[role,node]`). Meter
   `templateId` XOR `orgNodeId` obligaría a `orgNodeId` nullable (rompe los únicos: PG trata NULLs como distintos) y a
   arrastrar `includeDescendants` sin sentido. Son ejes **ortogonales que combinan en AND** — el patrón de SAP PM/Maximo
   (alcance por sitio/planta ≠ autorización por tipo de objeto; el perfil las combina). Tabla dedicada espejo del patrón
   polimórfico: `TemplateScope { userId?|roleId? (XOR), templateId, @@unique([userId,templateId]), @@unique([roleId,templateId]) }`,
   set plano sin descendientes. Migración 100% **aditiva**, no toca `Scope`.
2. **Semántica por defecto — PERMISIVA: "sin scope de plantilla = ve TODAS".** Idéntica al contrato del scope de nodo
   (`null` = sin restricción) y a SAP (sin restricción de valor = '*') / Maximo (grupo sin data-restriction ve todo lo que la
   app permite). El *least privilege* se cumple en la capa de **permiso** (`logentry:create`/`logbook:view`) y de **nodo**;
   el scope de plantilla es un estrechamiento **opcional adicional**. Ventaja decisiva: **migración sin backfill, cero
   ruptura** (todo sigue igual hasta que un admin asigne) y **consistencia** con el otro eje. Deny-by-default queda como flag
   configurable a futuro si un cliente lo exige (registrado en BACKLOG).
3. **Combinación nodo × plantilla — AND ("gana la más estricta").** Ve T si: (nodo) `T.orgNodeId ∈ accesibles` ∨
   `T.orgNodeId null` (global) ∨ `nodos=null`; **Y** (plantilla) `plantillas=null` ∨ `T.id ∈ accesibles`. Las **globales**
   pasan el eje de nodo siempre, pero **sí** quedan sujetas al eje de plantilla (si hay allow-list y no están, no se ven).
4. **Granularidad — plantilla individual.** No hay categorías de plantilla hoy; introducirlas es otra feature. Asignación
   plana, precisa, mínima superficie. La semántica permisiva mitiga "plantilla nueva no cubierta". Categorías/etiquetas como
   agrupador → BACKLOG.
5. **Superficies — solo las OPERACIONALES; el admin `/plantillas` queda fuera.** El scope de plantilla gobierna uso/visibilidad
   operacional (llenar/ver entradas), no la administración. Como el picker y el admin comparten `TemplatesService.list`, se
   parametriza con `applyTemplateScope` (default `false` = admin **idéntico**; el picker pasa `true`). Se filtra además
   `LogbookQueryService.list/stats/export` (por `LogEntry.templateId`) y se gatea por `assertTemplateInScope` en
   getDetail/saveSection/submit/transition (defensa en profundidad: bloquea también el fill por API directa).
6. **UI + asignación — por usuario Y por rol (decisión del dueño), permiso reutilizado.** Sección "Plantillas" hermana de
   "Estructura organizacional" en la pestaña *Alcance* del detalle de usuario + sección nueva en el detalle de rol (selector
   plano searchable, reutiliza primitivos premium). Endpoints **separados** `PUT /security/users/:id/template-scope` (gate
   `user:assign-scope`) y `PUT /security/roles/:id/template-scope` (gate `role:manage`), guardado independiente + audit
   propio (`user.templatescope.assigned` / `role.templatescope.assigned`). `GET /security/template-scope/options` (gate
   `user:assign-scope` OR `role:manage`) sirve la lista de plantillas asignables sin exigir `template:view`. **Sin permisos
   nuevos** — catálogo se queda en **59**. El read-time une scopes de usuario + de sus roles (espejo de `getAccessibleNodeIds`).

---

### 2026-06-12 · Fase 2.8.2 (parcial) — No crear borradores huérfanos + arreglos de la demo — ✅ IMPLEMENTADO

Durante la prueba en vivo de la ventana de edición, el dueño detectó que **elegir una plantilla creaba un `LogEntry`
de inmediato** (entrar y salir dejaba un borrador vacío). Se resolvió el frente (a) de la deuda 2.8.2 **diferir la creación**:
- **`GET /log-entries/new`** (permiso `logentry:create`): arma el MISMO `LogEntryDetail` que produciría crear+abrir pero
  **sin persistir** (`id:""`). Se refactorizó `getDetail` en `buildDetail(entry|sintético, …)` (tipo `EntrySource` = Pick),
  reusando TODA la lógica de editabilidad/dimensiones/ventana/transiciones — **cero duplicación en el cliente**.
- **Modo COMPOSE** en `EntryFillPage` (ruta `/nueva-entrada/comenzar/:templateId`): carga el preview; el **primer guardado
  real** materializa la entrada (`createLogEntry` con el diferido declarado) y pasa a edición **sin remontar** (preserva el
  borrador; URL vía `replaceState`). **Creación ÚNICA por `ref`**: si la acción falla tras crear, cambia a la entrada real
  para no duplicar al reintentar. `NewEntryPage` solo navega (no crea).
- Diferido (b)(c) de 2.8.2 (VOID de borradores con contenido + ruta de edición propia fuera de `/nueva-entrada`) **siguen abiertos**.

**Arreglos surgidos de la demo (multi-actor por rol + flujo + firma):**
- **`GET /log-entries/templates`** (permiso `logentry:create`, ABAC): el picker de "Nueva entrada" listaba plantillas con
  `GET /templates` (exige `template:view`, permiso de ADMIN de plantillas) → un Operador no podía. El llenado de bitácora
  no debe requerir acceso al módulo de Plantillas: endpoint propio del módulo de bitácoras.
- Ítem de menú **"Nueva entrada" gateado por `logentry:create`** (antes `module:logbook:view`): quien solo llena/revisa
  (Mantenedor, Supervisor) no lo ve; llega a las entradas por **Bitácoras → Editar**.
- Botón **"Volver" contextual**: una entrada existente vuelve a Bitácoras; una entrada nueva sin crear, al picker.
- Indicador **"secciones completadas" cuenta `COMPLETED` + `LOCKED`**: una sección LOCKED se completó antes de sellarse al
  avanzar el flujo (la guarda de completitud no deja avanzar sin completar), así un registro aprobado muestra **M/M**, no 0/M.

Tests: contracts 149 · API 200 (verde tras ajustar el assert del indicador). Demo de capacidades creada con `scripts/demo-bitacora.py`
(3 roles + 3 usuarios + flujo + plantilla de 3 secciones; **fuera del commit**, es seeder de demo). **Pendiente
(registrado en BACKLOG):** alcance por PLANTILLA (filtrar picker+grilla, Fase 2.8) y re-probar la demo con ownership
estricto por campo.

---

### 2026-06-12 · Fase 2.7.2 — Afinamiento UX (QA del dueño) — ✅ IMPLEMENTADO

Iteración visual tras probar 2.7.2 en el navegador:
- **Duración en MINUTOS u HORAS** (pedido del dueño): se cambió la unidad canónica de almacenamiento de **horas a
  MINUTOS** (`editWindowHours`→`editWindowMinutes` en `Template` y `SystemSettings`; migración `…_edit_window_minutes`
  renombra + **convierte ×60** + check 0..525600 = 365 d). La UI ofrece **número + selector de unidad** (Minutos/Horas)
  vía componente reutilizable `EditWindowDurationField` (normaliza a minutos; vacío = sin límite). `editWindowDeadline`
  pasa a `×60_000`. Motivo: granularidad operacional real (correcciones de minutos), sin ambigüedad (una sola unidad
  canónica; la UI presenta la cómoda). Extensible a "días" después.
- **Banner PROMINENTE de ventana en el llenado** (antes era un chip gris perdido entre las dimensiones): franja de
  ancho completo bajo la cabecera — **info (cian)** "editable hasta X" cuando vigente, **warning (ámbar)** cuando
  vencida (con override: "indica un motivo…"; sin override: "solo lectura"). El chip viejo se eliminó.
- **Fix de alineación** del ítem "Sellada" en el visor (`/bitacoras`): cada ítem de `viewerMetaRow` es `inline-flex`
  (ícono ✓ no se separa de su texto al envolver). Aclaración: **"Sellada"** = instante en que se congelaron
  effectiveAt + dimensiones (1ª transición con flujo, o submit sin flujo).
- **Aprendizaje operacional**: el cleanup de un smoke borró (lógico) la plantilla real del dueño por filtrar el listado
  por nombre. Regla: los smokes limpian **solo por ID de lo que el propio script creó**, nunca por filtro sobre el
  listado. La plantilla se restauró (deletedAt → null; sin pérdida de versiones/secciones).

---

### 2026-06-12 · Fase 2.7.2 — Ventana de edición configurable (#6) — ✅ IMPLEMENTADO Y PUBLICADO

Segundo eslabón de la **gobernanza temporal** (tras 2.7.0 registro diferido y 2.7.1/2.7.1.1 período gobernado):
un plazo configurable para corregir un registro; vencido, solo se edita con privilegio explícito y motivo auditado.
Se investigó el estándar antes de codear (MHRA GxP Data Integrity 2018 / FDA DI Q&A: *contemporaneous* + corrección
tardía **justificada y atribuida**, sin número normativo; SAP OB52 y Odoo lock dates = config **viva**, no congelada
en el documento; Maximo rechaza por fecha; eLogbooks comerciales con ventanas/amendments configurables + audit trail).
**5 forks resueltos, todos con la opción recomendada aprobada por el dueño ("avanza"):**

1. **Dónde se configura = columnas en `Template` (contenedor mutable) + fallback en `SystemSettings`.** La ventana es
   **gobernanza VIVA** (patrón SAP OB52 / Odoo): cambiar la política aplica de inmediato a TODAS las entradas, sin
   republicar la versión. Congelarla en `TemplateVersion` obligaría a clonar versión por cada ajuste y dejaría
   entradas viejas con ventanas obsoletas (un auditor lo objetaría). La integridad no la da congelar la política sino
   **auditar cada override**. Fallback en `SystemSettings` (singleton de gobernanza, ya con UI en `/configuracion`),
   NO en `PasswordPolicy` (dominio auth). Duración en **horas enteras** (1–8760); `editWindowHours` tri-estado:
   `null`=hereda global · `0`=sin ventana (explícito) · `>0`=propia.
2. **Ancla = ambas configurables por plantilla, default `RECORDED`.** Con `RECORDED` (desde `recordedAt` inmutable) el
   operador SIEMPRE tiene la ventana completa desde que crea la entrada — un **registro diferido legítimo (2.7.0) no
   nace vencido**. `EFFECTIVE` (desde la fecha del evento) queda para plantillas estrictas; quien la elige acepta que
   los diferidos largos requieren override. La guarda con ancla EFFECTIVE usa la `effectiveAt` **persistida** (no la
   prospectiva): editar el campo de fecha efectiva no puede "reabrir" la ventana en el mismo guardado.
3. **Override = permiso nuevo `logentry:write-expired` (catálogo 58→59) + MOTIVO obligatorio + MFA configurable.**
   Nombre espejo de `opsperiod:write-closed` (ambos = "escribir pasada una guarda temporal"). **Diferencia GxP frente
   al bypass de período (silencioso): aquí el motivo es OBLIGATORIO** (≥5, patrón `deferredReason`) en CADA escritura
   fuera de ventana → `AuditLog` (evento dedicado `logentry.editwindow.override`) + `LogEntryFieldChange.reason`. Sin
   motivo ⇒ 400 aunque se tenga el permiso. MFA opt-in vía `SystemSettings.requireMfaEditWindowOverride` + `ReauthService`
   (mismo patrón por-acción de períodos; `mfaVerified` estampado en la auditoría).
4. **Composición con período = guardas independientes en AND ("gana la más estricta"), cada una con SU bypass.**
   Escribible solo si AMBAS lo permiten: `logentry:write-expired` no salva un período cerrado y `opsperiod:write-closed`
   no salva una ventana vencida; LOCKED bloquea a todos. **Precedencia del `blockedReason`** (del menos al más accionable
   por el usuario): `ENTRY_CLOSED` → `PERIOD_CLOSED` → `EDIT_WINDOW_EXPIRED` → `WRONG_STATE`/`MISSING_ROLE`. La guarda de
   período se evalúa ANTES (su 403 precede). `getDetail` expone `editWindow {anchor, windowHours, expiresAt, expired,
   canOverride, overrideRequiresMfa}` para la huella proactiva ("Editable hasta X").
5. **Alcance temporal = `saveSection` + `setDeferral` + `submit` SÍ; `create` y `executeTransition` NO.** La ventana
   gobierna la **corrección de DATOS**, no el avance del flujo: incluir `executeTransition` obligaría a dar el override
   a todos los aprobadores (un ciclo revisión→aprobación legítimamente excede 48h), vaciando el permiso — SAP/Maximo
   bloquean *posteos* por período (eso ya lo hace la guarda de período, que SÍ aplica a transiciones), no aprobaciones.
   `create` NO porque con RECORDED la ventana nace con la entrada y con EFFECTIVE bloquear la creación contradiría el
   diferido declarado de 2.7.0. `setDeferral` SÍ (muta `effectiveAt` = corrección de dato); `submit` SÍ (sellar tarde un
   borrador abandonado es la finalización tardía que GxP flaguea). El **nudge 2.7.0(a)** (aviso suave sin guarda) se
   **difiere de nuevo** (UX pura; queda en BACKLOG).

**Implementación.** Migración aditiva `20260612025159_add_edit_window`: enum `EditWindowAnchor` (RECORDED|EFFECTIVE);
`Template.editWindowAnchor/Hours` nullable; `SystemSettings.editWindowAnchor` (default RECORDED) + `editWindowHours`
(null) + `requireMfaEditWindowOverride`; check constraints 0..8760 h. Contratos: `EDIT_WINDOW_ANCHORS`,
`editWindowHoursSchema`, `EDIT_WINDOW_EXPIRED` en `SECTION_BLOCKED_REASONS`, `editWindowInfoSchema` en el detalle,
`overrideReason`+creds en save/deferral/submit, y **fuente única back↔front** `resolveEditWindow` / `editWindowDeadline`
/ `isEditWindowExpired` (borde no inclusivo: en el límite aún se edita). Backend `LogEntriesService.assertEditWindowWritable`
(en saveSection/setDeferral/submit) + huella en `getDetail`; `SettingsService.editWindowSettings()` en una lectura;
`LogEntriesModule` importa `SettingsModule`. Web: control en el `TemplateBuilder`, pestaña "Bitácoras" en `/configuracion`,
chip "Editable hasta X" + `EditWindowOverrideModal` (motivo + creds) interceptando guardar/completar/enviar/diferir;
`EntryFillPage` migrada a `lib/format.ts`. Tests: contracts **149** (+5), API **200** (+10). Smoke en vivo **21/21**
(round-trip settings, ventana propia EFFECTIVE/24h, diferida 3d ⇒ vencida, 400 sin motivo / 200 con motivo + FieldChange
+ AuditLog dedicado, usuario sin permiso ⇒ 403 + EDIT_WINDOW_EXPIRED, MFA exigido sin enrolar ⇒ rechazo, vigente ⇒ huella
+ canal normal intacto; datos creados y LIMPIADOS, conteos en 0). **Siguiente: 2.7.3 matriz rol×sección×tiempo.**

---

### 2026-06-12 · Fase 2.7.1.1 — Afinamiento UX + Configuración del sistema — ✅ IMPLEMENTADO Y PUBLICADO

Iteración de inspección visual del dueño sobre la pantalla fiscal. Decisiones tomadas en la sesión:
- **MFA de gobernanza de período = POR ACCIÓN** (no un flag único): pedido del dueño para flexibilidad (p. ej. exigir MFA
  solo al reabrir/bloquear, no al cerrar). `SystemSettings` con 4 booleanos; gate per-action vía `ReauthService`.
- **Configuración del sistema = pantalla propia `/configuracion`** (no dentro de la política de seguridad), con **pestañas
  verticales por categoría** (scaffold enterprise para crecer). Permisos `module:settings:view` + `settings:manage` (→58).
- **El historial de período estampa `mfaVerified`** (si la acción se re-autenticó con MFA en ESE momento): el ajuste puede
  cambiar después, así que el registro de auditoría debe ser auto-descriptivo (no derivarse del ajuste actual).
- **Grilla = el componente que scrollea/pagina** (thead/footer sticky, altura acotada), no el panel; **orden por columnas**
  como en el resto del sistema; **historial por período** (drill-down al AuditLog).
- **Período MENSUAL con meses de largo variable**: confirmado correcto — el período es `[ancla mes M, ancla mes M+1)`, toma
  el largo real (28/29/30/31); el día-ancla se acota a 1–28 para que el borde exista en todos los meses (patrón SAP).
- **Regla permanente: formato regional** para fechas/números/monedas (helper único `lib/format.ts` que lee el locale activo;
  CLP por defecto). Fix transversal `@lyra/ui`: `Toast` z-index sobre modales/drawers.

---

### 2026-06-11 · Fase 2.7.1.1 — Calendario FISCAL transversal + período al estándar industrial — ✅ IMPLEMENTADO Y PUBLICADO

Tras revisar la pantalla de 2.7.1, el dueño del producto pidió alinear los períodos al estándar de los grandes
sistemas ("la más potente", entre NetSuite y Maximo) y **detectó un acoplamiento de diseño correcto**: el período
contable es **transversal**, pero hoy vive DENTRO del calendario de turnos. Se investigó el estándar (SAP OB52 /
fiscal year variant a nivel de sociedad; NetSuite accounting periods Open/Closed/Locked + Set Up Full Year + cierre
secuencial + Override Period Restrictions; Maximo financial periods a nivel de ORGANIZACIÓN, contiguos, rango From/To,
validación por fecha).

**Corrección estructural (la decisión central):** **DESACOPLAR** el período del calendario de turnos. Hoy
`OperationalCalendar` empaqueta turnos + `periodKind`/ancla y `OperationalPeriod` se scopea por `calendarId` ⇒ el mes
contable queda fragmentado por calendario de turno. El estándar es claro: el período fiscal es **transversal a la
organización** (SAP = company code; Maximo = Organization; NetSuite = subsidiaria), separado del *factory/shift
calendar*. Se introduce **`FiscalCalendar`** (entidad transversal: `periodKind` MONTH/WEEK/CUSTOM + ancla, con
**default** y asignación por nodo opcional — mismo patrón de resolución por ruta que `OperationalCalendar`, simétrico).
`OperationalCalendar` se queda **solo con turnos + ancla del día operacional**. La fecha efectiva resuelve **dos ejes
independientes**: `(operationalDate, shiftCode)` del calendario de turnos y `periodKey` del **calendario fiscal**.

**4 forks resueltos (los 4 con la recomendación):**
1. **Modelo base = backbone Maximo + tri‑estado NetSuite.** Períodos con **rango `periodStart`/`periodEnd`** (día
   operacional, derivado del calendario FISCAL), **contiguos sin huecos**, validación por fecha; estado
   **OPEN → CLOSED → LOCKED**. No se copian los "períodos especiales 13–16" de SAP (ajustes de GL de cierre de año,
   fuera del alcance de una bitácora operacional).
2. **Generación EXPLÍCITA.** Acción "Generar períodos" (año/rango) que **materializa filas contiguas** desde la config
   del calendario fiscal (espejo de *Set Up Full Year* / generate de Maximo), **idempotente** (jamás degrada un
   CLOSED/LOCKED). Reemplaza la lista sintética LAZY (ventana −400/+45d) que confundía. UI agrupa por año, marca el
   período **Actual**.
3. **Fecha sin período generado = ABIERTA por defecto + flag opt‑in `requirePeriod`** (en el FiscalCalendar). El rechazo
   estricto de Maximo al pie de la letra trabaría el terreno; default permisivo (seguro), flag activa el rigor estricto.
4. **Cierre SECUENCIAL + LOCKED duro.** No se cierra un período si hay uno anterior abierto. OPEN → **CLOSED**
   (reversible; bypass `opsperiod:write-closed` aún postea) → **LOCKED** (bloquea a TODOS, incl. bypass; reabrir exige
   permiso superior). Permisos nuevos **`opsperiod:lock` / `opsperiod:unlock`** (catálogo **54→56**); `opsperiod:reopen`
   queda para el reabrir soft.

**Plan de implementación (2.7.1.1, su propia sesión):** migración (nueva `FiscalCalendar` + asignación por nodo;
**mover** `periodKind`/`periodAnchorDay`/`periodStartWeekday`/`periodLengthDays`/`periodAnchorDate` de `OperationalCalendar`
a `FiscalCalendar`, seedeando un fiscal default desde la config de período existente para que el `periodKey` ya estampado
en `LogEntry` quede consistente; `OperationalPeriod` re‑scopeada a `fiscalCalendarId × periodKey`, += `periodStart`/
`periodEnd`; `PeriodStatus` += `LOCKED`, CLOSING deprecado; `FiscalCalendar.requirePeriod`). Resolver: split en eje
turno (OperationalCalendar) y eje período (FiscalCalendar) — `LogEntry` estampa `shiftCode`/`operationalDate` del primero
y `periodKey` del segundo. `enumeratePeriods` (start/end contiguos) en `@lyra/contracts`. `OperationalPeriodService`:
`generate` idempotente, `close` con guarda secuencial, `lock`/`unlock`, `list` por filas generadas agrupadas por año +
"Actual"; `assertWritable` gana LOCKED (bloquea incl. bypass) y `requirePeriod`. Permisos `opsperiod:lock`/`unlock` +
seed + invalidar caché authz. UI: mantenedor de calendario fiscal (probablemente pantalla/sección propia, separada de
turnos) + `PeriodsSection` con "Generar" y acciones close/reopen/lock/unlock gateadas. **Supersede** la presentación LAZY
y el scope-por-turno de 2.7.1 (el modelo de cierre/guarda se conserva y se endurece). El `periodKey` sigue siendo la
identidad estampada (histórico intacto).

**4 forks finos resueltos (2026-06-11, en la sesión de construcción; los 4 con la recomendación):**
1. **Mantenedor fiscal = PANTALLA PROPIA `/calendario-fiscal`** (no sección dentro de `/calendario-operacional`).
   SAP (company code) / Maximo (Organization) / NetSuite (subsidiaria) separan el período fiscal del *shift calendar*;
   re-meterlo en la pantalla de turnos re-acopla lo que el refactor desacopla y genera ambigüedad ("¿períodos de qué
   calendario?"). Costo bajo (ruta + nav + permiso de módulo).
2. **Migración: un `FiscalCalendar` por cada config de período DISTINTA en uso** (dedup por firma
   `periodKind`+ancla), no un fiscal global único. Verificado en BD: 3 calendarios con **2 configs** — default
   `planta-eagon` = WEEK (SECADO/ELABORACION), `mina-rajo` = MONTH (**TREATMENT PLANT**), `calendario` = MONTH (sin
   nodo). El default fiscal sale del calendario de turnos default (WEEK); cada fiscal no-default se **re-asigna a los
   mismos nodos** que hoy resuelven a su calendario de turnos. Así el `periodKey` ya estampado (`2026-06-08`, llave
   semanal, 23 entradas) y el de TREATMENT PLANT (MONTH) se preservan EXACTOS. Un fiscal global único habría cambiado
   TREATMENT PLANT de MONTH→WEEK (histórico inconsistente).
3. **`periodStart`/`periodEnd` ALMACENADOS** en las filas materializadas (set al "Generar", calculados por
   `enumeratePeriods` puro; `periodEnd` exclusivo = inicio del siguiente). La generación explícita ya materializa filas
   (Maximo), así que el costo de columna es cero y habilita "Actual" por SQL indexado (`periodStart <= hoy < periodEnd`),
   cierre secuencial por orden y validación de contigüidad. La función pura sigue siendo la fuente de verdad; único
   escritor = `generate` idempotente que jamás altera CLOSED/LOCKED.
4. **Reapertura de LOCKED = two-key + secuencialidad inversa graduada.** `unlock` (`opsperiod:unlock`) lleva
   LOCKED→**CLOSED** (no directo a OPEN); un segundo paso deliberado `reopen` (`opsperiod:reopen`) lleva CLOSED→OPEN
   (espejo NetSuite, defensa en profundidad para lo más sensible). Reabrir un CLOSED se **BLOQUEA** si existe un período
   POSTERIOR **LOCKED** (no se reabre detrás de un lock duro); se **ADVIERTE + permite con motivo** si los posteriores
   están solo CLOSED (cultura de corrección ALCOA+, equilibra UX vs. consistencia).

**Implementación (notas de construcción):** migración en **2 pasos + script TS** por el EPERM de Windows con el watch:
M1 estructural aditiva (FiscalCalendar + `OrgNode.fiscalCalendarId?` + `OperationalPeriod += fiscalCalendarId?/periodStart?/
periodEnd?/locked*` + `PeriodStatus += LOCKED`), script idempotente `db:migrate-fiscal` (dedup de firmas → fiscales,
reasignación de nodos, remapeo de filas con `enumeratePeriods`), M2 cleanup (drop columnas de período de
`OperationalCalendar`, `fiscalCalendarId` NOT NULL, swap del `@@unique`). Split del resolver: `resolveShift` pierde el
período; nuevo `FiscalResolver` (token abstracto, path-walk por `OrgNode.fiscalCalendarId`) provee `periodKey`.

---

### 2026-06-11 · Fase 2.7.1 — Período contable gobernado (`OperationalPeriod`) — IMPLEMENTADO (forks resueltos)

Segundo slice de la gobernanza temporal (#5). Los períodos (`periodKey` que ya estampa el `ShiftResolver`)
pueden CERRARSE; toda escritura cuya `effectiveAt` caiga en período no abierto se bloquea con
`blockedReason = PERIOD_CLOSED` salvo permiso de excepción configurable. Rama `feat/periodo-gobernado`.
**4 forks resueltos con el dueño del producto (los 4 con la recomendación):**

1. **Materialización LAZY ("ausencia = ABIERTO", patrón lock-date de Odoo).** No se pre-generan filas: un
   período sin fila se trata como OPEN; cerrar/poner en cierre crea/actualiza la fila con motivo+permiso+
   auditoría; reabrir la vuelve a OPEN (conserva el rastro de reapertura). El mantenedor LISTA los períodos
   recientes DERIVADOS de la config del calendario (helper puro `enumeratePeriodKeys`, ventana −400/+45 días)
   unidos con las filas explícitas. Motivo: `periodKey` es ilimitado y puede ser null (entradas sin calendario
   = **ungobernadas, nunca bloqueadas**); generar filas exigiría un scheduler y rangos arbitrarios, contrario al
   on-prem simple. El período se identifica por **(calendarId × periodKey)** porque la llave es calendar-specific.
2. **Mantenedor como SECCIÓN dentro de `/calendario-operacional`** (no pantalla propia). Los períodos derivan de
   la config del calendario (periodKind/ancla); co-ubicarlos mantiene el modelo mental. Promovible a pantalla
   propia si aparece un perfil contable dedicado.
3. **Hard lock irreversible DIFERIDO.** Solo soft-close + reapertura auditada en 2.7.1. La irreversibilidad por
   diseño choca con ALCOA+ (cultura de corrección) y con el eje "mejor UX" (un clic sin retorno); NetSuite/SAP
   casi nunca hacen lock duro real. Se deja el slot conceptual (`lockLevel`) para adoptarlo barato después.
4. **La guarda aplica a TODAS las mutaciones, incluidas las transiciones de flujo; las lecturas y la verificación
   de firma NUNCA se bloquean.** Una transición ES una transacción que muta y puede sellar dimensiones (Maximo
   rechaza por fecha). El estado **CLOSING** permite que los flujos en vuelo de roles privilegiados continúen
   (patrón SAP OB52); CLOSING y CLOSED bloquean por igual a los no privilegiados (difieren en intención).
5. **(confirmado por diseño, no fork) Registro diferido en período cerrado → `PERIOD_CLOSED`.** `setDeferral`
   recalcula `effectiveAt` y pasa por la MISMA guarda: declarar/corregir una fecha de evento en período cerrado
   se rechaza con el mismo motivo visible.

**Roles privilegiados = DATO, nada hardcodeado:** el permiso **`opsperiod:write-closed`** (clave RBAC asignable a
roles, patrón authorization group de SAP OB52) habilita el bypass de la guarda. Catálogo **50→54**:
`opsperiod:view/close/reopen/write-closed` (`reopen` separado de `close` por ser más sensible, patrón SAP/NetSuite).

**Implementación:** migración aditiva `20260611200225_add_operational_period` (`OperationalPeriod` calendarId×
periodKey + enum `PeriodStatus` OPEN|CLOSING|CLOSED + cierre/reapertura, FK `onDelete: Cascade`, índice
(calendarId,status)). Contrato `@lyra/contracts/operational-periods` (DTOs + `closePeriodRequest`/`reopenPeriodRequest`
con motivo ≥5) + `PERIOD_CLOSED` sumado a `SECTION_BLOCKED_REASONS` (enum extensible que dejó listo el Afinamiento #4) +
helper puro `enumeratePeriodKeys` en el contrato de calendario. `ShiftResolver` gana `resolveWithCalendar` (devuelve
`calendarId` + resolución) como fuente única para la guarda. `OperationalPeriodService.assertWritable(at, orgNodeId,
perms)` = guarda única invocada en `create`/`saveSection`/`setDeferral`/`submit`/`executeTransition` sobre la
`effectiveAt` que el write persistiría; en `getDetail`, si el actor sin excepción tiene una entrada en período cerrado,
TODAS las secciones reportan `PERIOD_CLOSED` y no se ofrecen transiciones (huella proactiva, patrón Afinamiento #4).
La guarda se evalúa ANTES de la completitud/validación de campos y del re-auth (gate duro; evita el círculo vicioso de
"complete las secciones" en período cerrado y no consume códigos de recuperación). `OperationalPeriodController`
(`/operational-periods` list/close/reopen) gateado y auditado (`opsperiod.closed|reopened` con before/after). Web:
`PeriodsSection` en el detalle del calendario (lista con estado, cerrar/reabrir con modal de motivo) + caso
`PERIOD_CLOSED` en la huella del llenado + i18n `opsPeriod`. **Degradación elegante:** `periodKey` null (sin calendario)
⇒ ungobernado ⇒ nunca bloquea. Tests: contracts **125** (+5) · API **180** (+11). Smoke en vivo **17/17** (rol+usuario
temporal SIN bypass para observar el bloqueo + demo CON bypass para la excepción; datos creados y LIMPIADOS, conteos
verificados; la guarda de `executeTransition` quedó cubierta por código+unit — la plantilla de prueba no ofrecía
transición al usuario sin bypass). **Siguiente: 2.7.2 ventana de edición.**

---

### 2026-06-11 · Plan de fases post-2.6.0 APROBADO + Fase 2.7.0 Registro diferido — IMPLEMENTADO (forks resueltos)

El dueño del producto **APROBÓ tal cual** el plan de fases propuesto abajo (2.7 Gobernanza temporal → 2.8
Alcance+acceso → 2.9 Plantillas inteligentes; #10 IA-ready transversal; 2.8.0 multi-nodo adelantable si Eagon lo
exige). Esta sesión ejecutó **2.7.0 — Registro diferido (#1)** (rama `feat/registro-diferido`). **3 forks resueltos
con el dueño del producto:**

1. **Dónde se declara la fecha del evento → HÍBRIDO (a).** Si la versión congelada tiene campo
   `semanticRole = EFFECTIVE_DATE`, el gesto **escribe ESE campo** (sigue siendo la única fuente viva) aplicando las
   MISMAS guardas que `saveSection` (sección editable en el estado × rol de sección × override de rol por campo — sin
   bypass), con `LogEntryFieldChange` auditado (el motivo del diferimiento queda como `reason`) y **bump de la
   `version` de la sección** (editores concurrentes ven 409). Si NO existe, la fecha declarada vive a nivel de entrada
   (`LogEntry.declaredEffectiveAt`) y entra a `resolveEffectiveAt` como **fallback intermedio**:
   `campo → declarada → recordedAt`. Motivo: exigir el campo en la plantilla (opción b) rompía la degradación elegante
   y obligaba a re-versionar plantillas publicadas; la cadena de prioridad mantiene UNA fuente resuelta por entrada.
   Detalle de exactitud: para campos DATE se preserva la **fecha civil** del operador tomándola del string ISO con
   offset (no de la conversión UTC, que puede correr un día).
2. **Motivo del diferimiento → OBLIGATORIO** (mín. 5 caracteres, contrato + backend). Práctica GxP de late entry
   (MHRA Data Integrity 2018, FDA DI Q&A 2018, ALCOA+ *contemporaneous*): la anotación tardía se identifica CON
   justificación. Hacerlo configurable hoy sería parametrizar por parametrizar; relajarlo después es aditivo
   (lo contrario dejaría históricos sin motivo).
3. **Diferido DECLARADO, no inferido.** `entryOrigin` es una **atestación del operador** (línea confirmada por el
   dueño del producto): inferir por diferencia de relojes produce falsos positivos (drift, guardados lentos, TZ) y
   convierte una declaración de integridad en una adivinanza. Complemento registrado en BACKLOG para 2.7.2: *nudge*
   suave de UI (no guarda de servidor) si `effectiveAt` difiere mucho de `recordedAt` sin declaración.

**Implementación:** migración aditiva `20260611183427_add_log_entry_origin` (`LogEntryOrigin` ONLINE|DEFERRED default
ONLINE + `declaredEffectiveAt?` + `deferredReason?` + `deferredDeclaredById?/At?` + índice). Contratos: enum +
`deferralInputSchema` + `deferred?` en create + `setDeferralRequestSchema` (PUT declara/corrige/quita con null) +
filtro `entryOrigin` en la list query + evento `DEFERRED_DECLARED` en la timeline + `resolveEffectiveAt` con 4.º
parámetro opcional (compatible). Backend: `create` acepta `deferred`; **`setDeferral`** (`PUT /log-entries/:id/deferral`,
permiso `logentry:fill` + ABAC, SOLO en DRAFT sin sellar — el sellado congela el origen) recalcula `effectiveAt` +
dimensiones vía `ShiftResolver` y audita `logentry.deferral.declared|cleared` (before/after); quitar la marca NO toca
el campo de fecha (es dato visible del canal normal). El evento de timeline refleja la declaración VIGENTE; las
correcciones quedan en AuditLog + FieldChange. Export CSV gana columnas Origen / Fecha evento declarada / Motivo
diferido. **Sin permisos nuevos** (declarar el diferido es parte de llenar; las guardas privilegiadas llegan con
2.7.1/2.7.2). Web: toggle "Registrar con otra fecha/hora" en `/nueva-entrada` (apagado por defecto = cero fricción),
`DeferralModal` en el llenado (declarar/corregir/quitar en borrador), chip/indicador "Diferida" + ambas fechas en
llenado/grilla/visor, filtro "Origen" + chip removible en `/bitacoras`, evento en la timeline del visor.
Tests: contracts **120** (+5) · API **169** (+8). Smoke en vivo **14/14** (datos creados y LIMPIADOS, conteos
verificados en BD).

---

### 2026-06-11 · Revisión del dueño del producto: 10 mejoras post-2.6.0 — triage, auditoría del #4 y plan de fases (APROBADO el 2026-06-11; ver la entrada de arriba)

El dueño del producto entregó **10 mejoras** tras una revisión exhaustiva en el navegador (texto íntegro en
`docs/BACKLOG.md` §2 "Mejoras post-2.6.0" y en `docs/NEXT_SESSION.md`). Esta sesión hizo triage + investigación +
diseño, y ejecutó SOLO el fix **#4** (abajo). El plan de fases queda **PROPUESTO, pendiente de visto bueno**; no se
codea ninguna fase grande sin aprobación (CLAUDE.md).

**Auditoría del #4 (hallazgo real, documentado ANTES de declarar bug):**
- El backend **SÍ gatea** la edición por sección en el servidor (`LogEntriesService.saveSection`): editabilidad =
  (sección editable en `currentStateKey`) × (rol-dato `TemplateSectionRole` + override por campo `TemplateFieldRole`)
  × ABAC, con 403. **No hay agujero de autorización.**
- Lo que el usuario observó tiene 3 causas reales: **(a) datos** — la plantilla de prueba publicada tiene 0 roles por
  sección y `editableInStateKey` null, y el sistema demo tiene UN solo rol (Administrador) que tienen los 3 usuarios ⇒
  nunca hay nada que gatear (una sección sin roles queda abierta a cualquiera con `logentry:fill`, degradación
  elegante POR DISEÑO); **(b) UX** — el DTO solo exponía `editable: boolean` sin el PORQUÉ, la UI no muestra a qué rol
  está asignada cada sección ni qué falta para completar/avanzar, y los nombres "Guardar sección"/"Guardar y
  completar" no describen el efecto; **(c) un gap REAL en `submit` (forms sin flujo)** — validaba completitud solo
  sobre las secciones editables POR EL QUE ENVÍA (predicado relativo al usuario) y NO exigía secciones en estado
  COMPLETED ⇒ un actor podía SELLAR la entrada con secciones de otros roles incompletas y, peor, **sin capturar la
  firma de completitud de sección** (`TemplateSection.requireSignature` se podía eludir por la vía submit). Con
  flujo, `executeTransition` ya validaba objetivo (guard d); el submit sin flujo quedó asimétrico desde 2.5.

**Fix #4 implementado (esta sesión):**
1. **`submit` (sin flujo) pasa a validación OBJETIVA**: exige TODAS las secciones con campos en `COMPLETED` y valida
   todos los obligatorios/valores (predicado objetivo, espejo del guard (d) de `executeTransition`). Cierra la elusión
   de la firma de sección (Part 11) y la asimetría con flujo. Enviar = sellar el registro completo (GxP commit).
2. **Contrato aditivo**: `LogEntrySectionStateDto` gana `blockedReason` (`ENTRY_CLOSED` | `WRONG_STATE` |
   `MISSING_ROLE` | null), `assignedRoleNames: string[]` (nombres de los roles-dato de la sección) y
   `readOnlyFieldKeys: string[]` (campos cuyo override de rol excluye al usuario). El enum nace EXTENSIBLE a
   propósito: la Fase de gobernanza temporal le sumará `PERIOD_CLOSED`/`EDIT_WINDOW_EXPIRED` (#7) sin migración.
3. **UI del llenado autoexplicativa**: barra de progreso de secciones en cabecera ("N de M completadas"); por sección,
   chip de asignación de rol y motivo de bloqueo específico (no más "no editable" genérico); campos con override en
   solo-lectura visible; acciones renombradas a lo que HACEN: "Guardar avance" (persiste sin completar) y "Completar
   sección" / "Completar y firmar" (marca COMPLETED + firma si corresponde), con hint; "Enviar y registrar" se
   deshabilita listando qué secciones faltan (el backend re-valida siempre).

**Plan de fases PROPUESTO (espera visto bueno; sub-slices publicables):**
- **Fase 2.7 — Gobernanza temporal del registro** (#5 + #6 + #1 + #7, interdependientes; toca la INTEGRIDAD del
  registro auditable):
  - **2.7.0 Registro diferido (#1):** el modelo temporal YA existe (`recordedAt` vs `effectiveAt`); falta la UX de
    gesto mínimo ("Registrar con otra fecha/hora"), la marca explícita de entrada diferida (`entryOrigin`
    ONLINE|DEFERRED declarado, no inferido) + motivo, y su huella en grilla/visor/timeline. GxP: la entrada tardía es
    legítima si queda IDENTIFICADA como tal con fecha de evento vs fecha de registro y quién (ALCOA+ contemporaneous;
    el backdating se vuelve fraude solo cuando se OCULTA).
  - **2.7.1 Período gobernado (#5):** entidad NUEVA `OperationalPeriod` (calendario × `periodKey`) con estado
    `OPEN`/`CLOSING`/`CLOSED`, cierre y **reapertura con motivo + permiso + auditoría**; guardas de ESCRITURA: toda
    mutación (crear/guardar/transicionar) cuya `effectiveAt` caiga en período no abierto se bloquea salvo rol
    privilegiado configurable. Referentes destilados: SAP OB52 (intervalos abiertos por grupo de autorización — roles
    privilegiados pueden postear en período en cierre), NetSuite (reapertura con justificación obligatoria y
    re-cierre; "Allow Non-G/L Changes" = edición parcial configurable en período cerrado), Odoo (lock date "soft" con
    excepciones por usuario+motivo auditadas vs **hard lock irreversible**, que adoptamos como opción de
    configuración), Maximo (transacción rechazada si `actualdate` no cae en período financiero activo).
  - **2.7.2 Ventana de edición (#6):** config por plantilla (fallback global) `{ancla: RECORDED|EFFECTIVE, duración}`;
    fuera de ventana solo roles con privilegio explícito y motivo (corrección excepcional auditada, patrón GxP).
    Convive con 2.7.1: **gana la restricción más estricta**.
  - **2.7.3 Permisos sección × tiempo (#7):** matriz administrable rol × sección × ventana temporal aplicada en
    servidor; extiende el `blockedReason` de hoy para que la UI diga SIEMPRE por qué ("Período cerrado", "Fuera de
    ventana", "Asignada a otro rol").
- **Fase 2.8 — Alcance de plantilla + acceso** (#2 + #9; absorbe el diferido (a) de 2.4 y la 2.6.1 planificada):
  - **2.8.0 Multi-nodo (#2):** N:M `TemplateNodeAssignment` (`orgNodeId` + `includeDescendants`) que reemplaza el
    `Template.orgNodeId` único (migración: 1 fila por plantilla existente; 0 filas = global). Cubre los 3 modos
    pedidos (uno / varios / "todos los hijos de X" con herencia a nodos futuros vía path). Al crear entrada: selector
    de nodo filtrado por asignación ∩ ABAC cuando resuelve >1.
  - **2.8.1 UX de acceso (#9 + 2.6.1):** se presentarán 2–3 alternativas con pros/contras ANTES de implementar
    (entrada por nodo vs selector en flujo vs vista global con filtros persistentes — patrones Maximo Start
    Center/"mis activos", j5 listas configurables por estación, Shiftconnector). La 2.6.1 (SavedView + gestor de
    columnas) SE FUSIONA aquí: "filtros persistentes" de #9 y SavedView son la misma pieza.
- **Fase 2.9 — Plantillas inteligentes** (#3 + #8):
  - **2.9.0 Layouts (#3):** modo de presentación por versión (CLÁSICO | PESTAÑAS | WIZARD | COLAPSABLE) + grilla
    responsiva de campos (ancho 1/1, 1/2, 1/3) + separadores/ayudas, todo DATO en la `TemplateVersion`. Referentes:
    NN/g (wizard para proceso secuencial, tabs para acceso aleatorio, accordion reduce visibilidad — el modo lo
    decide el CREADOR según naturaleza), Salesforce Dynamic Forms / page layouts, ServiceNow form sections.
  - **2.9.1 Motor de reglas (#8):** reglas condición→acción como DATO VERSIONADO en la `TemplateVersion`
    (mostrar/ocultar, habilitar/deshabilitar, exigir, calcular, validar entre campos), evaluadas por la MISMA fuente
    única back↔front (generaliza `visibleWhen` + `validateFieldValue` + umbrales ISA-18.2 ya existentes). Referentes:
    ServiceNow **UI Policies** (condición→acción declarativa no-code; con **Data Policies** como espejo server-side =
    exactamente nuestra arquitectura cliente-UX/servidor-garantía) y Salesforce **Validation Rules** (fórmula → error
    bloqueante) + Dynamic Forms (visibilidad condicional por campo/sección). Extensible a acciones futuras
    (notificar, escalar, gatillar incidente — gancho Fase 4).
- **#10 IA-ready = restricción TRANSVERSAL de diseño, no fase**: cada fase deja metadatos estructurados y enumerados
  (dimensiones estampadas, `entryOrigin`, períodos con clave estable, `blockedReason`, reglas como datos versionados)
  que son exactamente el substrato que un LLM necesita para búsqueda en lenguaje natural/resúmenes vía la interfaz
  `LlmProvider` ya abstracta. Se documenta por fase.

**Orden recomendado entre fases: 2.7 → 2.8 → 2.9** (coincide con la inclinación del usuario, con fundamento): (a) la
gobernanza temporal cambia la semántica del CAMINO DE ESCRITURA — mientras antes exista, menos datos nacen bajo
reglas laxas (retrofit barato hoy: `periodKey` ya se estampa); (b) el registro diferido (#1) es EL bloqueador
operacional de adopción (las entradas atrasadas son lo habitual en operación real); (c) #7 necesita período+ventana
para existir y #4 ya dejó el `blockedReason` listo para extenderlo. Contraste honesto: **2.8.0 multi-nodo es barato y
auto-contenido** — si el piloto Eagon lo necesita para estructurar sus bitácoras antes, puede adelantarse como slice
suelto sin romper el orden. 2.6.2 (analítica) queda intercalable tras 2.8; 2.3 Rondas se reevalúa tras 2.7 (sinergia
con período/turnos).

---

### 2026-06-10 · Fase 2.6 Módulo de Bitácoras — diseño COMPLETO + slicing; 2.6.0 (núcleo de lectura) IMPLEMENTADO

Vista de consulta/auditoría sobre todo lo que produce la ejecución (2.4/2.5). El módulo se **diseñó completo de una
vez** (contratos + modelo + arquitectura) y se construye por **sub-slices publicables**: **2.6.0 núcleo de lectura ✅**
(esta sesión) · **2.6.1 personalización** (SavedView server-side como concepto de PLATAFORMA + gestor de columnas +
densidad + última vista) · **2.6.2 analítica/UX avanzada** (facetas con conteo, agrupación con subtotales, peek panel,
sparklines, ⌘K profundo, export con columnas de valores por plantilla). Patrones aplicados: **review by exception**
(ISPE GAMP 5 / EBR — indicadores por fila y vista de excepciones), **§11.50 manifestación de firma** y **§11.70
record–signature linking** (verificación), **ALCOA+** (audit trail unificado), saved searches/list variants
(Splunk/Kibana/SAP/Maximo — 2.6.1), estado de grilla serializable (AG Grid columnState → shape del deep-link y del
futuro `SavedView.config`), event frames de PI (panel de relacionadas). **9 forks confirmados por el usuario:**

1. **`/bitacoras` = pantalla nueva del módulo logbook** (sidebar propio como el prototipo); backend en el MISMO
   `LogEntriesModule` (mismo agregado/autorización), pero **CQRS-lite**: lado de lectura en `LogbookQueryService`
   separado del de escritura (`LogEntriesService`, que ya iba en ~1000 líneas); comparte sus helpers internos.
2. **Timeline fusionada en BACKEND** (`GET :id/timeline`): k-way merge de cambios+transiciones+firmas de sección+
   eventos sintéticos CREATED/SEALED con cursor `(at, id)`. Motivo: orden autoritativo del servidor y paginación
   multi-tabla imposible de hacer bien en cliente; patrón audit trail viewer de Veeva/MasterControl; reusable Fase 4.
   El desempate a igual instante es por `id` (estable para el cursor), no por tipo de evento.
3. **Verificación de integridad ON-DEMAND** (botón por firma) y **AUDITADA** (`logentry.signature.verified`): la
   verificación es un acto de revisión GxP. Veredicto tri-estado: `VALID` (hash coincide con valores actuales) /
   `VALID_RECORD_CHANGED_AFTER` (coincide al REBOBINAR `LogEntryFieldChange` a `signedAt` ⇒ firma íntegra, registro
   editado después — legítimo en flujos multi-estado) / `INVALID` (no reconstruible ⇒ investigar).
4. **Log de cambios por campo = endpoint paginado aparte** (`GET :id/changes`): es append-only y sin tope; el detalle
   queda liviano. En el visor van timeline (narrativa) Y log de cambios (tabla fina) como paneles separados.
5. **SIN permiso nuevo de "auditor"**: `logentry:view` + ABAC ya definen el alcance (el alcance es atributo, no clave
   nueva — NIST SP 800-162); "ver todo" = rol sin restricción de scope; la autoría es FILTRO, no frontera (el logbook
   es registro compartido del turno por diseño). Si un cliente exige "solo mis entradas", será dimensión de scope.
6. **Export CSV WIDE** (1 fila/entrada: columnas de sistema + indicadores), espejo exacto del patrón de
   `/security/audit/export` (lotes keyset, tope 100k, `X-Export-Truncated`, BOM, `;` es-CL). Variante "con columnas de
   valores" SOLO al filtrar por una plantilla → 2.6.2; formato LONG (BI) diferido hasta demanda real.
7. **Vistas guardadas: server-side desde 2.6.1 como plataforma** (`SavedView` con discriminador `module`, config =
   {filters, search, sort, columns{order,hidden,pinned,widths}, density}); vistas de SISTEMA en código (versionables,
   i18n, imborrables por construcción), no en BD. Compartir por rol DIFERIDO (columna aditiva futura).
8. **Facetas con conteo → 2.6.2**; en 2.6.0 ya hay KPIs (`GET /log-entries/stats`: groupBy acotados con el MISMO
   `where` del listado). **Sin virtualización**: cursor keyset + "cargar más" de 50 (un humano filtra, no pagina 5k).
9. **Slicing aprobado** con 2 ajustes: deep-link básico y CSS de impresión SUBEN a 2.6.0.

**Modelo (migración aditiva `20260610051359_add_logbook_review_columns`, las 3 adiciones confirmadas):**
- **`LogEntry.entryNumber`** — folio humano correlativo (`BIT-000123`, helper `formatEntryFolio`); backfill ORDENADO
  por `recordedAt` con secuencia propia (un SERIAL directo asignaría en orden físico). Patrón WO number Maximo.
- **`LogEntrySection.requiresSignature`** — estampado de la definición congelada al instanciar (+backfill): "firmas
  pendientes" pasa a ser `EXISTS (requiresSignature AND signatureId IS NULL)` en SQL, sin join a la definición.
- **`LogEntryValue.thresholdBand`** (enum WARN|CRIT) — banda ISA-18.2 estampada al guardar (la validación ya la
  computa; fuente única `thresholdBandFor` en contracts, también usada por el badge en UI y el backfill
  `db:backfill-threshold-bands`). Habilita filtros/KPIs de excepción sin re-evaluar configs.
- Índices nuevos: `LogEntry(createdById)`, `LogEntry(currentStateKey)`, `LogEntryValue(thresholdBand)` (deuda
  detectada: autoría y estado de flujo sin índice).

**Canonicalización de firma v2 (decisión técnica importante):** el mapa `values` firmado podía contener claves con
`null` SIN fila en BD (inputs vacíos de `saveSection`) ⇒ ambigüedad "clave-con-null" vs "clave-ausente" que produciría
falsos `INVALID` al verificar. `canonicalSignaturePayload` ahora **descarta los valores vacíos**
(`canonicalSignatureValues`, fuente única) y `LogEntryFieldChange.changedAt` se estampa con el MISMO reloj que
`signedAt` (antes lo ponía la BD ⇒ el rebobinado no podía excluir con exactitud los cambios del propio guardado
firmado). **Efecto:** las firmas creadas ANTES de 2.6 cuyo payload contenía nulls verificarían `INVALID`; aceptado
explícitamente porque no existe ninguna instalación productiva (solo datos de demo/smoke). Desde 2.6 el hash es
estable y verificable.

**Decisiones de UI:** filtro de nodo con `Combobox` aplanado + checkbox "incluir descendientes" (el `ScopeTreePicker`
es un editor multi-selección de scope, control equivocado para UN nodo de filtro); el select de "estado del flujo" se
puebla con los estados PRESENTES en el set cargado (self-narrowing honesto hasta las facetas de 2.6.2); atajos "turno
actual" / "este periodo" DIFERIDOS (requieren resolver el calendario en cliente o facetas; hoy van hoy/24h/7d/30d);
filtro de EQUIPO en contrato pero sin UI (2.6.1). `@lyra/ui Chip` gana `onRemove` (chips de filtros activos,
reutilizable por Incidencias). La URL es la fuente de verdad de la grilla (deep-link; base del `SavedView` de 2.6.1).
Orden servidor solo por la whitelist NOT NULL (`recordedAt`/`effectiveAt`/`entryNumber`) — keyset correcto sin ramas
de nulos; el multi-sort de columnas arbitrarias queda para el gestor de columnas (2.6.1) si se justifica.

Tests: contracts **113** (+9) · API **156** (+12). Smoke en vivo **22/22** (datos de prueba creados y LIMPIADOS).
Rama `feat/bitacoras-auditor`.

---

### 2026-06-10 · Fase 2.5 Ejecución de flujo + firmas electrónicas Part 11 — IMPLEMENTADO (forks resueltos)

Cierra el bucle de ejecución abierto en 2.4: motor de transiciones + firmas estilo **21 CFR Part 11**
(§11.50/11.70/11.200, ALCOA+, NIST 800-63B step-up). Migración aditiva `20260610035255_add_log_entry_execution`
(`LogEntryTransition` + `LogEntrySignature`). Backend `executeTransition` (rama `feat/ejecucion-flujo`). **5 forks
confirmados por el usuario** con su motivo:

1. **Firma = tabla dedicada `LogEntrySignature` POLIMÓRFICA** (`context` TRANSITION|SECTION_COMPLETION, check XOR), no
   embebida. Motivo: §11.50/11.70 piden la firma como entidad de primer orden enlazable; cubre tanto la firma de
   transición como la de completitud de sección (`LogEntrySection.signatureId` la anticipaba); mismo patrón XOR que
   Scope/ExternalReference.
2. **Se hashea un snapshot canónico (SHA-256) + metadatos; PKI/sello de tiempo cualificado → Fase 7.** `canonicalSignaturePayload`
   (claves ordenadas recursivamente, determinista) en `@lyra/contracts` = fuente única. Se guarda SOLO el hash (el snapshot es
   reconstruíble desde `LogEntryValue`/`LogEntryFieldChange`). Da integridad/no repudio sin sobre-ingeniería.
3. **Re-auth: firma ⇒ significado + contraseña (§11.200, 2.º componente); MFA step-up SOLO si `requireMfa`** de la transición.
   Las secciones no portan flag de MFA ⇒ su firma de completitud es solo-contraseña. Encapsulado en `ReauthService` (módulo
   auth, reutilizable por Fase 4 / notificaciones con acción firmada).
4. **`status` reconciliado, sin enum nuevo:** `currentStateKey` = verdad del flujo; al entrar a un estado `isFinal` ⇒
   `status=SUBMITTED` (el sellado ya ocurrió en la 1ª transición); `VOID` reservado a anulación. `status` sigue para
   índices/listados gruesos. Evita doble fuente de verdad y migración de enum.
5. **Reversa/anulación de transición (corrección GxP) DIFERIDA** (modelo append-only ya la soporta como transición inversa
   con motivo + firma). Mantiene el alcance en "ejecutar + firmar"; registrada en BACKLOG §2/§3.

**Sellado reconciliado:** movido de `submit` (2.4) a la **1ª transición que sale del estado inicial**; `submit` queda como
finalización SOLO de plantillas sin flujo (degradación elegante). `saveSection` respeta `sealedAt` (no recalcula dimensiones
tras sellar). **Recomputo de secciones** en cada transición: no editable en el nuevo estado ⇒ `LOCKED` (preserva
completitud/firma/autoría); editable y estaba `LOCKED` ⇒ reapertura a `PENDING` (rework). **Gancho** `onTransitionExecuted`
(no-op) = punto único para el bus de eventos/outbox → Notificaciones y umbral→incidencia (Fase 4). Permiso nuevo
`logentry:transition` (catálogo **50**; QUIÉN puede cada transición sigue siendo dato `WorkflowTransitionRole`). El motor
vive en `LogEntriesService` (no en un servicio aparte) para reusar la maquinaria de secciones/valores/validación/sellado
sin duplicarla. Tests: contracts 104, API 144. Smoke en vivo 21/21. `/security-review` sin hallazgos. **Deuda registrada:**
throttle de re-auth de firma (defensa en profundidad), recovery code consumido antes del commit de la tx (operacional).

---

### 2026-06-10 · Fase 2.4 Llenado (Nueva entrada) multi-actor — IMPLEMENTADO (forks resueltos)

Primer slice de EJECUCIÓN: tablas `LogEntry*` (aditivas, migración `20260610011231_add_log_entry`) +
backend `/log-entries` + pantalla de llenado web. Paradigma EBR/GxP: definición versionada inmutable
(`TemplateVersion`) vs ejecución relacional auditada. **4 forks confirmados por el usuario** con su motivo:

1. **Valores en TABLA HIJA** (`LogEntryValue`, 1 fila por campo) **+ historial append-only**
   (`LogEntryFieldChange`), NO un blob JSONB en la cabecera. Motivo: la auditoría por campo (antes/después,
   Part 11) es natural por fila; la concurrencia optimista por sección queda limpia; reporta por columna;
   y habilita el guard real de "code en uso" de Listas. El `value` por fila es JSONB tipado por `dataType`.
   El valor de un campo de referencia se persiste como **`code` estable, no label** (dimensión de DW / FHIR Coding).
2. **Secciones INSTANCIADAS** (`LogEntrySection` con estado/filledBy/firma/`version`), no derivadas de la
   versión. Motivo: la sección porta ESTADO de ejecución (completitud, autoría, firma, revisión de
   concurrencia) que NO se puede derivar de la plantilla. Los campos siguen viviendo en la versión congelada
   (no se instancian); solo se instancian secciones + valores.
3. **Concurrencia optimista POR SECCIÓN** (`version` Int, check-and-bump → `ConflictException` 409). Motivo:
   coincide con el paradigma "sin bloqueo global, multi-actor por secciones"; el operador A y el técnico B
   editan secciones distintas en paralelo sin pisarse. Por entrada serializaría; por campo sería sobre-ingeniería.
   La autorización por sección = `(editable en `currentStateKey`) × (rol de sección, dato `TemplateSectionRole`
   + override por campo `TemplateFieldRole`) × (ABAC `orgNodeId`)`. Validación 100% en servidor
   (`validateFieldValue`, fuente única reusada por el cliente para feedback inmediato).
4. **Sellado: `recordedAt` al crear (inmutable); `effectiveAt` + dimensiones (turno/día operacional/periodo,
   vía `ShiftResolver`) se RECALCULAN en cada guardado mientras la entrada es DRAFT y se CONGELAN al ENVIAR**
   (`sealedAt`, `status=SUBMITTED`). Motivo: el campo `EFFECTIVE_DATE` puede llenarse a mitad de camino; sellar
   al crear estamparía el turno con la hora equivocada. Sellar al enviar es el momento "commit" GxP. Degradación
   elegante: sin calendario → dimensiones null; sin campo `EFFECTIVE_DATE` → `effectiveAt = recordedAt`.

**`workflowDefinitionVersionId` DENORMALIZADO** en `LogEntry` (copiado al crear): la entrada vive su ciclo bajo
la versión de flujo que congeló su `TemplateVersion`, aunque el flujo publique v(n+1) después.

**Límite del slice (acordado):** la entrada permanece en su **estado inicial**; el motor de TRANSICIONES y las
firmas Part 11 son **2.5**. En plantillas multi-estado solo se llenan en 2.4 las secciones del estado inicial;
las plantillas sin flujo se llenan completas (degradación elegante). `LogEntryTransition` queda modelado; su
tabla se crea en 2.5 (mismo criterio con que `LogEntry` se difirió a 2.4).

**DRY de UI:** se extrajo `FieldControl` (control de campo interactivo + solo-lectura) como fuente única que
reusan la vista previa del Form Builder y el llenado, para que nunca diverjan.

**Seguimientos registrados** (BACKLOG): selector de nodo para plantillas GLOBALES al crear entrada (hoy se usa
el nodo de la plantilla; las globales requieren `orgNodeId`); re-seed del borrador local al resolver un 409
(hoy se recarga la query pero el borrador conserva los valores intentados); motor de transiciones/firmas (2.5).

---

### 2026-06-09 · Fase 2.3.0 Calendario operacional — IMPLEMENTADO (forks resueltos)

Implementada la decisión de abajo. **Forks confirmados por el usuario** y su justificación:

1. **Forma del modelo = entidad padre + hijos** (`OperationalCalendar` 1—N `OperationalShift`), no
   JSON embebido. Los turnos necesitan identidad estable (`code`), orden y validación individual;
   reusa el patrón `ReferenceList`/`ReferenceItem`. El guardado **reemplaza los turnos en bloque**
   (set pequeño y cohesivo, mismo criterio que estados/transiciones de un flujo).
2. **Catálogo VIVO (como Listas), NO versionado-inmutable.** La inmutabilidad histórica la dará el
   **estampado** de `operationalDate`/`shiftCode`/`periodKey` en `LogEntry` al sellar (2.4); el cambio
   queda en `AuditLog` (before/after). Registrada como mejora futura "shift definitions con vigencia"
   por si un cliente necesita re-resolver timestamps históricos con definiciones de su época.
3. **Sin solapes (error duro) + huecos permitidos.** Un instante cae en ≤1 turno (clave de dimensión
   única); pero una operación de turno único es válida: una lectura fuera de turno resuelve
   `shiftCode=null` conservando su `operationalDate`. Validación por "pintado" de minutos en un círculo
   de 1440 (cubre también suma de duraciones > 24 h).
4. **TZ = UTC + `Intl` nativo** (sin luxon/date-fns-tz, requisito on-prem). Se guarda UTC; el resolver
   convierte a hora de pared local del sitio con `Intl.DateTimeFormat` (DST correcto: los límites de
   turno son hora de pared). El probador convierte hora-de-sitio→UTC con el offset de la TZ.
5. **Periodo HÍBRIDO** (flexible multi-industria, no scheduler): `MONTH` + `anchorDay` (1..28; mes
   26→25), `WEEK` + `startWeekday` (llave = fecha de inicio de semana), `CUSTOM` = ciclo de N días
   operacionales desde una fecha ancla (quincena 14, ciclo 28, rosters; llave = fecha de inicio del
   ciclo). **Fuera de alcance (BACKLOG):** calendario fiscal 4-4-5 (meses de largo variable) y rotación
   de cuadrillas / turno distinto por día de semana (sería el scheduler genérico que la decisión excluyó).
6. **Asignación por nodo = FK `OrgNode.operationalCalendarId` + resolución por ruta materializada**
   (nodo → ancestro más cercano con calendario → `isDefault`) + picker mínimo sobre el árbol existente
   (no toca la pantalla de Estructura). Exactamente un calendario `isDefault` (mantenido en tx; el
   default no se puede borrar).

**Entregado:** `@lyra/contracts/operational-calendar` (schemas + DTOs + `validateOperationalCalendar`
fuente única + **`resolveShift` función PURA** `timestamp→(operationalDate, shiftCode, periodKey)`, 30
specs incl. DST Santiago / borde de mes / ciclo CUSTOM / WEEK / huecos). 4 permisos (catálogo **45**).
Migración aditiva `20260609233155_add_operational_calendar`. Backend `OperationalCalendarModule` (CRUD
gateado/auditado + `preview`) + **`ShiftResolver`** (clase abstracta = token DI, patrón `EmailService`;
elige el calendario por nodo y delega en `resolveShift`; exportado para 2.4/2.3/Fase 5). Web
`/calendario-operacional` (master-detail + editor de turnos con **timeline 24 h** + selector de ancla +
periodo + **probador** en vivo + asignación de nodos). Seed demo `mina-rajo`. Tests: contracts 76, API
119. Smoke en vivo OK (preview DST, validación de solape 400, borrar default 400, ciclo create/setDefault/
assign/delete + limpieza). **Pendiente: smoke VISUAL** (BACKLOG §4).

### 2026-06-09 · Calendario operacional (turnos + periodo contable) — dimensiones derivadas, NO campos (aprobado)

Inquietud del usuario (correcta) antes de 2.4: **turno, periodo contable y fecha** son **estructurales/contextuales**,
como el nodo de la estructura organizacional — una plantilla los *puede* usar o no, pero **no son campos que el
operador escribe**. Investigado el estándar y aprobada la solución + el orden.

**Cómo lo hace la industria:** un **Calendario Operacional / Shift Calendar** como **configuración de primera clase**,
separado del formulario. SAP PP/PM (*factory calendar* + *shift definitions/sequences*), MES (Wonderware/AVEVA,
Rockwell: módulo "Shift Calendar" con *production day*), **ISA-95 Parte 2** (*resource/operations calendars*),
historiadores PI/AVEVA (*shift reports*/event frames). Es el patrón **dimensión de Fecha + Turno del Data Warehouse**:
el *hecho* (la lectura) recibe claves de Fecha/Turno/Periodo **derivadas del timestamp al cargar**. Concepto central:
**"día de producción" ≠ "día civil"** — el día operacional arranca en el cambio de turno (p. ej. 07:00), por eso el
**mes contable puede empezar en el 2.º turno del día 1** (caso que planteó el usuario).

**Decisión (extiende el modelo de campos de sistema de 2.1.1):** los campos de sistema son **intrínsecos, DERIVADOS,
no tipeados**. Ya existen `recordedAt` (commit, UTC) y `effectiveAt` (hora de negocio, del campo con rol
`EFFECTIVE_DATE`). **Turno y Periodo son dos dimensiones más, derivadas de `effectiveAt`** (fallback `recordedAt`):

1. **Módulo de configuración `OperationalCalendar`** (mantenedor hermano de Estructura/Seguridad/Listas): **turnos**
   (`code` A/B/C, label, `startTime`, `durationMinutes` — la duración resuelve el cruce de medianoche sin
   ambigüedad), **ancla del día operacional** (a qué hora/turno empieza el día de producción), **definición del
   periodo** (`MONTH`/`WEEK`/`CUSTOM` + ancla; el "mes de producción" va del inicio del día operacional del día 1 al
   del 1 del mes siguiente), **TZ del sitio** (se guarda UTC, se resuelve en la TZ para que los límites de turno
   caigan bien). Alcance: un calendario por defecto (single-tenant), **asignable por nodo modelado** sin
   sobre-ingeniería al inicio.
2. **`ShiftResolver`** (servicio tras interfaz, patrón `LlmProvider`/`EmailService`): `timestamp → (operationalDate,
   shiftCode, periodKey)`. Fuente única consumida por 2.4 (estampa), 2.3 Rondas (programa por turno) y Fase 5
   (cambio de turno).
3. **En `LogEntry` (2.4):** columnas **indexadas, inmutables, nullable** `shiftCode?`, `operationalDate?`,
   `periodKey?` estampadas por el resolver al sellar la entrada → reportabilidad por turno/periodo sin recalcular y
   offline-friendly. **Opt-in / degradación elegante:** sin calendario configurado quedan en null y la plantilla que
   no lo necesita los ignora (igual que anclar a un nodo o marcar `EFFECTIVE_DATE` es opcional).

**Orden de fases (aprobado por el usuario): `2.3.0` ANTES de `2.4`.** El calendario es **pura configuración** (bajo
riesgo, como las Listas) y es el **cimiento compartido** de 2.4 (estampado), 2.3 Rondas (programación por turno) y
Fase 5. Hacerlo primero ⇒ la **primera entrada real ya nace clasificada** por turno/periodo (sin backfills) y se evita
diseñar el `LogEntry` dos veces. Re-slicing: **2.3.0 Calendario operacional → 2.4 Llenado → 2.3 Rondas → 2.5 …**
(ver BACKLOG §2). NO es un scheduler genérico; se mantiene simple y anclado a la práctica industrial.

### 2026-06-09 · Datos de referencia — Import/Export CSV de ítems (implementado)

Primer quick-win del roadmap industrial (ver entrada "mirada crítica"). Patrón **dry-run enterprise** (SAP LSMW /
Salesforce Data Loader): el archivo NUNCA se aplica a ciegas. Forks confirmados por el usuario (4/4 con la opción
recomendada):

- **Metadata APLANADA en columnas `metadata.<clave>`** (Excel-friendly; la unión de claves de todos los ítems,
  orden alfabético; valores no-string → JSON en la celda). Round-trip: lo exportado se reimporta tal cual.
- **Upsert por `code` + `deactivateMissing` OPT-IN**: por defecto solo crea/actualiza (ausentes intactos); con el
  checkbox los ítems activos ausentes del archivo se **desactivan** (nunca DELETE — gobernanza del catálogo).
- **Export con `;` / import auto-detecta `;` o `,`**: Excel es-CL usa `;` como separador de listas; `toCsv` ganó
  parámetro de delimitador (default `,` → el export de Auditoría queda intacto). Parser RFC 4180 propio
  (`common/csv-parse.ts`, sin dependencias): comillas dobladas, delimitadores/saltos DENTRO de celda, BOM, CRLF/LF.
- **Tope `REFERENCE_IMPORT_MAX_ROWS=5000` por env** (env.schema + .env.example): 5k filas ≈ 400 KB < bodyLimit
  1 MB de Fastify; catálogos mayores van por el sync de Fase 3. El CSV viaja como TEXTO en el body JSON (el cliente
  lo lee con FileReader) → **sin dependencia multipart**.
- **Flujo en 2 fases**: `POST /reference-lists/:id/import` con `dryRun:true` parsea + valida (cabecera: code/label
  requeridos, columnas desconocidas → 400 claro; por fila: longitudes, duplicados en archivo, active/sortOrder,
  metadata con inferencia de tipos y JSON inválido → error con **nº de línea**) y devuelve el **reporte de diff**
  (create/update/unchanged/deactivate/error + `changes` por campo) SIN escribir. El commit **re-valida todo** (no
  confía en ningún preview), con errores **no aplica nada**, escribe en **transacción** y audita
  (`referencelist.imported` con el summary). Comparación de metadata por **JSON canónico** (claves ordenadas).
- **Export** `GET /reference-lists/:id/export` (gate `referencelist:view`; el import gate `referencelist:manage`):
  CSV BOM UTF-8 + `Content-Disposition` fechado, mismo molde que Auditoría.
- **Web**: botones Exportar/Importar en el panel de detalle; modal de 2 pasos (archivo + checkbox → analizar →
  summary en chips + tabla paginada del reporte → aplicar, deshabilitado con errores).
- **Verificado**: typecheck/lint/build web (1927 módulos)/test (**contracts 46** +2 · **API 110** +13: 6 del parser,
  7 de import/export) + **smoke en vivo** (export de `failure-modes` con metadata aplanada; dry-run con fila errónea
  → BD intacta; commit → metadata persistida; re-import idéntico → todo `unchanged`; `deactivateMissing` desactiva
  el ausente). Datos de prueba limpiados (hard-delete de la lista smoke).

### 2026-06-09 · Datos de referencia — mirada crítica industrial (roadmap; análisis pedido por el usuario)

Revisión contra lo que exige la industria multi-rubro (minería, madera/remanufactura, energía, manufactura),
anclada en **ISO 14224** (taxonomías jerárquicas de equipos/fallas), **Reference Data Management** (IBM/Informatica:
atributos tipados, jerarquías, mapeos, vigencia), **FHIR ValueSet/ConceptMap** (codes inactivos, crosswalks) y la
práctica de SAP/Oracle (LOVs dependientes, validez por fechas). Conclusión: **la base es correcta** (code estable +
metadata jsonb + gobernanza activar/desactivar cubren el 80%), y los gaps reales son **aditivos** (no exigen
re-migrar). Prioridades fijadas (implementación: cada una en su sesión, BACKLOG §2):

1. **Import/export CSV masivo de ítems** (ALTA — el gap más real): una planta carga cientos/miles de codes desde
   Excel/ERP; el alta uno-a-uno no escala. Export ya tiene patrón (Auditoría RFC 4180); import = upsert por `code`
   con dry-run/reporte de difs. **Primer quick-win candidato.**
2. **Jerarquía de ítems** (`parentId` self-FK, ALTA-MEDIA): ISO 14224 es jerárquico (categoría→subcategoría→modo);
   áreas→subáreas; especies→productos madereros. Aditivo; el picker gana agrupación/árbol.
3. **Listas dependientes / cascada** (MEDIA, **diseñar con 2.4**): filtrar opciones por el valor de OTRO campo
   (subárea según área; modo de falla según clase del equipo). Modelable como
   `optionSource.referenceList.filter: { byFieldKey, metadataKey }` — necesita el motor de llenado para validarse.
4. **Atributos tipados por lista** (MEDIA): hoy la metadata es key-value libre (flexible pero sin gobierno);
   RDM define el **esquema de atributos por dominio**. `ReferenceList.metadataSchema` (jsonb) que valida los ítems
   al guardar → reportes consistentes sin basura.
5. **Vigencia por ítem** (`validFrom`/`validTo`, MEDIA): contratistas, normativas, reactivos con caducidad. Aditivo;
   el resolve filtra por fecha efectiva.
6. **Mapeo de códigos externos por ítem** (MEDIA-ALTA pero **atada a Fase 3**): el code interno ≠ el ID de SAP/MES
   (patrón ConceptMap/crosswalk). Tabla `ReferenceItemMapping(systemKey, externalCode)` o reuso de
   `ExternalReference`; se decide junto al motor de sync (`source=EXTERNAL`).
7. **Deprecación con reemplazo** (`replacedByCode`, BAJA-MEDIA): cuando un code se retira, los reportes puentean al
   sucesor (patrón SCD/ConceptMap).
8. **Resolve server-side con búsqueda+paginación** (MEDIA, con 2.4/Fase 3): hoy el resolve trae la lista completa
   (correcto hasta ~1k ítems); para 5k+ el picker debe buscar en servidor.
9. **i18n de labels** (Fase 7) y **presentación semántica por ítem** (color/icono/abreviatura — la metadata ya puede
   llevarlo hoy; se formaliza si se repite el patrón).

**Decisión:** NO se migra nada ahora (todo es aditivo cuando toque); se registra el roadmap priorizado en BACKLOG §2.
El orden recomendado: CSV import/export (sesión propia) → jerarquía → tipado de metadata; cascada y resolve paginado
se diseñan con 2.4; mapeos externos con Fase 3.

### 2026-06-09 · UI — fix de recorte de paneles flotantes + primitivo `LookupPicker` (patrón Value Help)

Hallazgo del smoke visual del usuario: el panel del `Combobox` en la **vista previa** del Form Builder se salía del
viewport (siempre abría hacia abajo). Fix en `@lyra/ui`: **`panelPlacement`** compartido — el panel abre hacia
**arriba** cuando no hay espacio debajo y **acota su altura** al espacio disponible; aplicado a `Combobox` y
`MultiSelect` (mismo defecto latente).

Además, segundo pedido: un objeto de selección **más potente que un combo** para listas grandes. Investigado el
patrón de las grandes plataformas — **SAP Fiori "Value Help Dialog"**, **Salesforce Lookup**, **Oracle popup LOV**,
Dynamics lookup — el patrón común es: trigger compacto → **diálogo con búsqueda + tabla** (columnas ricas, paginada)
→ selección **borrador** con checkbox que se aplica **al confirmar** (en single, el clic confirma y cierra) →
selección vigente visible como **tokens removibles con ×** bajo el campo. Nuevo primitivo **`LookupPicker`** en
`@lyra/ui` (compone Modal + Table + Input + Checkbox existentes; columnas código/etiqueta/detalle, sortable +
paginada + búsqueda sin acentos). **Aplicación:** en la vista previa, un MULTISELECT ligado a una **Lista de
Referencia** usa `LookupPicker` (la metadata aparece como columna de detalle — ahí se justifica la tabla); el
MULTISELECT inline corto mantiene el `MultiSelect` y el SELECT mantiene `Combobox` (más ágil para selección única).
En 2.4, la elección del widget podrá hacerse configurable por campo (capa de presentación).

### 2026-06-09 · Datos de referencia — endurecimiento UX (grilla enterprise + `Combobox`)

Pulido pedido por el usuario tras 2.x, antes de avanzar de fase. Decisiones:
- **Grilla de ítems enterprise** (no una tabla básica): buscador (code/label/metadata), **filtro de estado**
  (todos/activos/inactivos), **columnas ordenables** (code/label/orden/estado), **paginación** (10/pág), conteo
  "activos · total", y **metadata como chips**. El orden inline ahora **remonta** (`key` por `id+sortOrder`) para
  reflejar el valor del servidor tras editar. Reusa el `Table` de `@lyra/ui` (ya soportaba sort/paginación).
- **Nuevo primitivo `@lyra/ui`: `Combobox`** (single-select buscable con panel **portal**, navegación por teclado
  flechas+Enter, Escape, limpiable, **reposiciona en scroll/resize**). Era un hueco real del design system: existían
  `MultiSelect` (múltiple) y `Select` (nativo, listas cortas) pero no un **autocomplete de selección única** para
  catálogos grandes. **Motivo (objeción del usuario):** un `<select>` nativo no escala a una Lista de Referencia
  larga; el selector debe ser un objeto premium buscable.
- **Aplicación:** en el Form Builder el **selector de Lista** usa `Combobox`; en la **vista previa**, un campo SELECT
  bound a una lista usa `Combobox` y un MULTISELECT usa el `MultiSelect` primitivo (antes pintaba TODAS las opciones
  como chips → se rompía con listas largas). Ambos buscables, premium y consistentes con el resto de la app.

### 2026-06-09 · Fase 2.x — Datos de referencia / Listas (`ReferenceList`/`ReferenceItem`) (implementado)

Hace REAL el `optionSource.referenceList` que 2.1.1 dejó modelado. Investigación de respaldo: **FHIR
ValueSet/CodeSystem**, **Reference/Master Data Management**, **dimensión de Data Warehouse** (guardar code,
no label), **ISO 14224** (taxonomía de fallas como code-list). Decisiones de ejecución (plan + 3 forks
aprobados por el usuario):

- **Catálogo GOBERNADO, NO versionado-inmutable** (a diferencia de Template/Workflow). Es un mantenedor vivo
  estilo `Equipment`/`Role`: `ReferenceList` (key único estable + name + description + `source` MANUAL|EXTERNAL
  + active + sortOrder + **borrado lógico** `deletedAt`) 1—N `ReferenceItem` (`code` estable **único por lista** +
  label + active + sortOrder + **metadata jsonb** enriquecido). **Resuelve la ambigüedad** de la entrada de diseño
  2026-06-09 ("activa/versionable"): el versionado-inmutable **no** aplica aquí; la integridad histórica la dará el
  llenado (2.4) guardando el **code estable**, no una versión de la lista. Migración aditiva
  `20260609205303_add_reference_data` (`migrate deploy`, esquiva el EPERM del DLL con el watch).
- **El valor se persiste como `code` estable, no el label** (regla de oro de reportabilidad = dimensión DW /
  FHIR Coding; ya documentada en 2.1.1). Un **code en uso se DESACTIVA, no se borra** (fork confirmado): en la UI
  la acción gobernada del ítem es activar/desactivar; el **hard-delete de ítem** existe en el backend para limpiar
  errores de captura, pero el **guard de "code en uso" real** (valores de `LogEntry`) se incorpora en **2.4** (hoy
  no hay ejecución que consultar). El `resolve` devuelve solo ítems **activos**.
- **`listKey` por CLAVE, no FK** (coherente con `editableInStateKey` de 2.2): el `optionSource.referenceList.listKey`
  vive en el `config` JSONB del campo y referencia `ReferenceList.key`. La integridad se valida en backend
  (`TemplatesService.saveDraft`: la lista debe existir y estar viva) — **espejo de la validación del binding de
  flujo**. Mantiene config JSONB + degradación elegante (un SELECT inline sigue igual). Una lista **referenciada
  por una plantilla no se borra** (guard en `ReferenceListsService.remove`, consulta JSONB de `TemplateField.config`),
  espejo del guard "en uso" de Flujos. *Nota:* el conteo es **conservador** (cuenta campos de versiones aunque la
  plantilla esté con borrado lógico), mismo comportamiento ya registrado para Flujos (BACKLOG §3).
- **Módulo propio de sidebar** (fork confirmado): `/datos-referencia`, hermano de Estructura/Seguridad/Flujos.
  **4 permisos nuevos** (catálogo 37→**41**): `module:referencedata:view/manage` + `referencelist:view/manage`. El
  `resolve` y la lectura se gatean por `referencelist:view` (lo necesitan también los editores de plantillas para
  el preview); el seed los asigna al rol admin iterando el catálogo (sin código nuevo).
- **UI = mantenedor master-detail** (molde Equipos/Roles, `ResizableSplit`): lista de Listas + panel de detalle
  con grilla de ítems (activar/desactivar, orden inline, editar, eliminar) y drawers de lista/ítem (editor de
  metadata key-value que infiere número/booleano/texto). En el **Form Builder**, SELECT/MULTISELECT gana un selector
  de **fuente de opciones** (inline vs Lista de Referencia); la **vista previa resuelve** las opciones desde la lista
  (muestra label, valor = code). Reusa primitivos `@lyra/ui` existentes (Select/Table/Drawer/Chip); sin componentes nuevos.
- **Frontera con Fase 3/2.4 (intacta):** el **sync** que alimenta/materializa una lista desde ERP/MES/RRHH es Fase 3
  (`source=EXTERNAL` solo modelado). El **llenado** que guarda codes en vivo es 2.4. Seed demo (dev): `failure-modes`
  (ISO 14224, con metadata) + `shifts`.
- **Verificado:** typecheck (6 paquetes) · lint (0 errores; 1 warning preexistente en OrgTree) · build web (1921
  módulos; API NO se buildea por el watch) · test (**contracts 44** +5 · permissions 5 · **API 97** +8 de
  `ReferenceListsService`). **Smoke en vivo** (demo): CRUD lista/ítem; key duplicada 400; code duplicado por lista
  400; resolve (excluye inactivos, conserva metadata); binding en `saveDraft` (listKey inexistente 400 / válido 200);
  lista EN USO no se borra 400. Datos de prueba ad-hoc limpiados (hard-delete); las 2 listas del seed quedan como
  demo dev-only.

### 2026-06-09 · Eventos de dominio + Webhooks salientes (diseño; implementación diferida)

Necesidad planteada por el usuario: el sistema debe poder **empujar datos** (bitácoras, incidencias, transiciones,
etc.) a **sistemas externos vía webhooks**. Decisión de diseño: introducir un **backbone de EVENTOS DE DOMINIO**
con **patrón outbox** que es la **fuente común** tanto de las **Notificaciones** (sumidero a personas) como de los
**Webhooks salientes** (sumidero máquina-a-máquina). Aún NO se programa.

- **Eventos de dominio** versionados: `logentry.created`, `logentry.transitioned`, `incident.created`,
  `incident.transitioned`, `task.*`, `structure.*`, etc. Se persisten en una tabla **outbox** (misma transacción
  que el cambio → entrega "at-least-once" garantizada) y un worker los despacha **asíncrono**.
- **Webhooks salientes** (patrón Stripe/GitHub): **`WebhookSubscription`** (URL endpoint, tipos de evento
  suscritos, **secreto** para firma **HMAC** del payload, headers custom, activo, **credencial cifrada en reposo**)
  + **`WebhookDelivery`** (log de intentos, status, **reintentos con backoff**, **replay** manual). Payload JSON
  estable y versionado. On-prem friendly: solo HTTP POST saliente (egress + secretos). Auditado.
- **Relación con lo demás:** comparte el backbone con la **Mensajería/Notificaciones** (ver entrada siguiente) — un
  mismo evento alimenta reglas de notificación y/o suscripciones de webhook. **Amplía el punto "D: Webhooks"** de la
  integración pendiente (estaba acotado a cambios de estructura; ahora es transversal a bitácoras/incidencias/flujos).
  Es el **espejo SALIENTE** de la Fase 3 (Orígenes de datos = entrante); puede vivir en Fase 3 o en un módulo de
  integración propio. Se construye **con/después de Fase 2.5** (cuando existen los eventos de transición).
  Refs: Stripe/GitHub webhooks (HMAC + reintentos + replay), patrón transactional outbox.

### 2026-06-09 · Plataforma de Mensajería / Notificaciones multicanal (diseño; implementación diferida)

Necesidad planteada por el usuario: una transición de flujo (y, por extensión, incidencias/turnos) debe poder
**notificar** — correo (con enlace para **aprobar/rechazar**), **WhatsApp**, **SMS**, in-app — de forma
**configurable y enterprise**, con **mantenedor de plantillas de mensaje**. Decisión: es un **subsistema de
plataforma transversal**, NO una feature de flujos; se reutilizará en Flujos (2.5), **Incidencias (Fase 4,
SLA/escalamiento)** y **Cambio de turno (Fase 5)**. Aún NO se programa. Pilares (estándar tipo ServiceNow/Jira/
Camunda + EBR/GxP):

- **Abstracción de canal enchufable** (`NotificationChannel`: EMAIL/SMS/WHATSAPP/IN_APP/WEBHOOK) detrás de una
  interfaz, **igual patrón que `EmailService`/`LlmProvider`** (token DI). **Reutiliza el `EmailService` +
  `SmtpEmailService` ya existentes** (Fase 1, nodemailer/Mailpit). SMS/WhatsApp = proveedores **opcionales**
  (Twilio / Meta Cloud API) — nunca obligatorios (respeta on-prem / sin SaaS forzado).
- **Mantenedor de `NotificationTemplate`** (canal, asunto, cuerpo con **variables de merge**, i18n, versionable):
  mismo molde de mantenedor de la casa.
- **Disparo declarativo = DATO, POR TRANSICIÓN:** se configura en **cuáles** transiciones se gatilla mensaje y en
  cuáles no, y **qué** mensaje. Campo **aditivo** `notifications` en `WorkflowTransition` = lista **0..N** de
  {plantilla, canal(es), destinatarios, condición opcional}. Coherente con "roles por transición = dato".
  Resolución de **destinatarios** por roles→usuarios / usuarios / el asignado / **cadenas de escalamiento**.
- **Acciones desde el mensaje (aprobar/rechazar)**: **token de acción firmado, single-use, con TTL y alcance**
  (entry+transición+usuario+nonce), reusando el patrón de `PasswordResetToken` (se guarda el hash). **Restricción
  Part 11:** si la transición exige firma, el enlace **NO** aprueba de un clic — aterriza en una página que
  **re-autentica (MFA step-up) y captura el significado**; el "un clic" solo aplica a transiciones **sin** firma y
  **siempre auditado**. Es superficie de auth → **requiere security review** al implementarse.
- **Entrega asíncrona** (cola + reintentos), **estado/auditoría de envío**, **rate-limit**, **preferencias/opt-out**
  por usuario y canal.
- **Secuenciación**: el *motor de disparo* necesita la **ejecución de transiciones (Fase 2.5)** (antes no hay
  evento que notificar). Se construye **con/después de 2.5** como módulo de plataforma; el **mantenedor de
  plantillas** puede adelantarse. El campo `notifications` en `WorkflowTransition` se añade de forma **aditiva**
  cuando toque (no ahora). Ya parcialmente anticipado en BACKLOG §3 ("notificaciones SMTP SLA/escalamiento").

### 2026-06-09 · Fase 2.2 — Flujos reutilizables (`WorkflowDefinition`) (implementado)

Implementación del fork 4 (flujos REUTILIZABLES) fijado el 2026-06-09. Un flujo es una **máquina de estados
configurable** (estados + transiciones), **NO BPMN**, integrada al RBAC dim. 3 (la autorización por transición es
DATO). Solo lado **DEFINICIÓN**: la ejecución (LogEntry/transiciones en vivo/firmas) sigue diferida a 2.4/2.5.
Investigación de respaldo: FSM declarativa (XState / Step Functions Standard, no orquestador BPMN), ciclo de vida
de registro controlado (21 CFR Part 11 / GAMP 5 / ALCOA+), validación de máquina (1 inicial, ≥1 final,
alcanzabilidad, sin trampas). Decisiones de ejecución (aprobadas por el usuario, plan + 3 forks):

- **Versionado/congelable estilo Template.** `WorkflowDefinition` (contenedor mutable) 1—N
  `WorkflowDefinitionVersion` (INMUTABLE al publicar) → `WorkflowState` + `WorkflowTransition` +
  `WorkflowTransitionRole` (roles permitidos por transición = dato, mismo patrón que `TemplateSectionRole`).
  El builder edita SIEMPRE un borrador; publicar congela; editar publicada **clona** un borrador nuevo (espejo
  exacto de `TemplatesService`). Flags por transición `requireSignature`+`signatureMeaning` y `requireMfa`
  (step-up AAL) **modelados** y se honran en ejecución (2.5).
- **`editableInStateKey` de sección por CLAVE, no FK** (objeción aceptada): la versión de plantilla congela una
  versión de flujo; la sección referencia un estado *dentro de esa versión* por su `key` estable, igual que
  `visibleWhen` referencia campos. Un FK a `WorkflowState.id` acoplaría a IDs de una versión concreta sin ganar
  integridad (la da el congelamiento de la versión). Coherente con la intención ya documentada en 2.1.
- **FK desde `TemplateVersion`** (reemplaza las columnas string de 2.1): `workflowDefinitionId` →
  `WorkflowDefinition`, `workflowDefinitionVersionId` → `WorkflowDefinitionVersion`, ambas **`onDelete: Restrict`**
  (un registro histórico no queda sin su flujo; el borrado del flujo es lógico vía `deletedAt`). Aditivo: las
  columnas existían en null (no había editor), así que añadir el FK no toca datos. `WorkflowsService.remove`
  además **bloquea** borrar un flujo en uso por una versión de plantilla.
- **Binding flujo↔plantilla validado en backend** (`TemplatesService.saveDraft`): el flujo debe existir, estar
  **PUBLICADO** y la versión a congelar debe ser su `currentVersionId` vigente; cada `editableInStateKey` de
  sección debe ser una clave de estado de esa versión. Sin flujo (`null`) ⇒ ninguna sección puede declarar
  estado (**degradación elegante**: form simple). El binding se preserva al clonar borrador.
- **Validación de la máquina = fuente única** `validateWorkflowMachine` en `@lyra/contracts` (1 inicial exacto,
  ≥1 final, claves únicas, refs válidas, alcanzabilidad desde el inicial, sin trampas). La usa el `superRefine`
  del contrato, el backend (defensa en profundidad, al guardar y al publicar) **y** el builder web (feedback en
  vivo + deshabilita publicar si es inválida). Se confirmó el fork: **≥1 estado final exigido para publicar**.
- **Permisos** (catálogo 33 → **37**): `module:workflows:view/manage` (módulo/sidebar, mi adición por
  consistencia con los demás módulos — aprobada en el fork) + `workflow:view/manage` (acción, coarse estilo
  Roles). La autorización **por transición** NO es clave de catálogo: vive en `WorkflowTransitionRole`. Seed los
  asigna al rol admin (itera el catálogo, sin código nuevo).
- **UI = editor declarativo, NO canvas BPMN** (fork confirmado): mantenedor `features/workflows` (lista estilo
  Plantillas + `WorkflowBuilder` con listas de estados/transiciones + roles por transición + validación FSM en
  vivo). El Form Builder gana: selector de flujo publicado, mapeo sección→estado y editor de override de rol por
  campo (`TemplateFieldRole`, que ya persistía en backend desde 2.1).
- **Editor del override por campo (`TemplateFieldRole`)**: el modelo y el persistir ya existían (2.1); 2.2 agrega
  solo el editor UI (multiselect de roles por campo; vacío = hereda la sección).
- **Refinamiento UX (mismo día, pulido del builder a pedido del usuario):** la validación de la máquina se
  clasifica por **severidad** — `error` (integridad: claves duplicadas, transición a estado inexistente) **bloquea
  guardar Y publicar** (banner rojo); `pending` (falta inicial/final, inalcanzable, trampa) **solo bloquea
  publicar** (banner ámbar "pendiente de conectar"). Así un borrador a medio construir **se puede guardar** (antes
  el `superRefine`/backend exigían la máquina completa al guardar → no se podía guardar WIP). El contrato y
  `WorkflowsService.saveDraft` ahora solo exigen INTEGRIDAD; **`publish` sigue exigiendo la máquina completa**.
  Helper `hasBlockingMachineErrors`. Además: header de columna **fijo (sticky `top:58px`** = alto del topbar de la
  app, que es el contenedor sticky; el `.tabsBar` no lo es) para no perder "Agregar estado/transición" en listas
  largas, y **tabla resumen** de transiciones (etiqueta · desde→hacia · firma · MFA · roles), **plegable y plegada
  por defecto**. **Nuevo primitivo `@lyra/ui`: `MultiSelect`** (token-picker con búsqueda + chips + panel portal
  acotado con scroll / seleccionar-todos / limpiar / conteo) que **reemplaza las listas planas de checkboxes de
  roles** (no escalaban con catálogos grandes) en: roles por transición del flujo, y en el Form Builder los roles
  de sección y el override de rol por campo. Tests: contracts 39, API 89.
- **Verificado:** typecheck/lint (0 errores; 1 warning preexistente en OrgTree)/build web (1911 módulos)/test
  (contracts 39 · permissions 5 · API 89) en verde. **Smoke en vivo** (demo): flujo crear→borrador→máquina
  inválida (sin final / inalcanzable) 400→publicar (congela)→listar→borrar 204; binding plantilla↔flujo (estado de
  sección válido persiste; estado inexistente 400; versión no vigente 400; flujo EN USO no se borra 400); severidad
  (guardar con pendiente 200 / publicar con pendiente 400 / guardar con error de integridad 400). Datos de
  prueba limpiados (hard-delete). Migración `20260609163822_add_workflow_definition` aplicada con `migrate deploy`.

### 2026-06-09 · Fase 2.1.1 — Endurecimiento de modelo (ADITIVO): campo en 3 capas + `optionSource` (implementado)

Implementación del endurecimiento de modelo fijado el mismo día (ver entrada siguiente), ANTES del llenado (2.4)
y mientras no hay datos de ejecución. Todo aditivo/no destructivo. Decisiones de ejecución (aprobadas por el usuario):

- **`dataType` (capa 2) DERIVADO, no editable.** Enum Prisma `FieldDataType` (12 valores, MAYÚSCULAS coherente con
  `FieldType`; incluye TIME/FILE/GEO/COMPUTED sin productor aún, forward-compat de la taxonomía). El backend lo deriva
  del `type` al guardar (fuente única `deriveDataType` en `@lyra/contracts`); la UI no lo muestra ni lo envía. Mapeo:
  NUMBER→NUMBER, TEXT/TEXTAREA→STRING, SELECT→**CODE**, MULTISELECT→**CODE_ARRAY**, BOOLEAN→BOOLEAN, DATE→DATE,
  DATETIME→DATETIME, **SEVERITY→CODE** (escala cerrada {1..5} = dimensión reportable, lista de sistema implícita),
  **SIGNATURE→REFERENCE** (el valor referencia la firma/identidad del firmante; ejecución en 2.5).
- **`semanticRole` (capa 3) nullable, sin miembro `NONE`.** Enum `FieldSemanticRole?` (EFFECTIVE_DATE/TITLE/
  PRIMARY_EQUIPMENT/SEVERITY_DRIVER); null = sin rol (más limpio que un `NONE` redundante). En 2.1.1 **solo
  `EFFECTIVE_DATE` tiene editor y comportamiento** (promueve `LogEntry.effectiveAt` en 2.4). **A lo sumo un campo
  por versión** puede ser `EFFECTIVE_DATE`: validado en el contrato (`saveTemplateDraftRequestSchema.superRefine`) y
  en el backend; la UI desmarca los demás al marcar uno.
- **`optionSource` discriminado reemplaza `options[]`** en SELECT/MULTISELECT: `inline` (`{code,label}[]`, único
  editable hoy — `value`→`code`), `referenceList` (`listKey` string; entidad `ReferenceList` + FK en 2.x, mismo patrón
  que `WorkflowDefinition` en 2.2) y `external` (`sourceKey`; Orígenes de Datos Fase 3) **modelados** sin resolución.
  **Sin migración SQL:** los `config` son JSONB; el helper `upgradeFieldConfig` (en contracts) sube el shape legacy
  `{options:[{value,label}]}` → `{optionSource:{kind:'inline',items:[{code,label}]}}` al **leer** (`mapVersion`),
  **escribir** (`preprocess` Zod + en `saveDraft`) y **clonar** (`ensureDraft`). Idempotente. **El valor de una
  referencia se persiste como `code` estable, no el label** (reportabilidad = dimensión DW / FHIR Coding).
- **Migración aditiva `20260609155007_add_field_layers`:** crea los 2 enums, agrega `dataType`/`semanticRole` a
  `TemplateField` **nullable**, **backfillea `dataType` desde el `type`** existente (CASE), y luego `dataType SET NOT
  NULL`. No altera ni borra datos (había 14 filas de smokes visuales previos; quedaron backfilleadas). Aplicada con
  `migrate deploy` (no regenera cliente → evita el EPERM del rename del DLL del engine con el watch del API vivo).
- **`LogEntry` se DIFIERE 100% a 2.4** (recomendación del agente, aprobada). Crear tablas nuevas es aditivo; un
  esqueleto sin la lógica de llenado se validaría mal (riesgo de re-migrar). Los campos de sistema + `effectiveAt`
  quedan como **diseño** en DATA_MODEL/DECISIONS; 2.1.1 endurece solo el lado DEFINICIÓN.
- **Form Builder (cambios mínimos):** el editor de opciones inline ahora escribe `optionSource.inline.items`
  (`code`/`label`); toggle **"Fecha efectiva del registro"** (`Checkbox`) en campos DATE/DATETIME que conmuta
  `semanticRole`; `dataType` oculto/derivado. Dual theme, i18n es-CL, 44px. **Verificado:** typecheck/lint/build/test
  (contracts 23, API 78) en verde + **smoke en vivo** (crear → guardar con SELECT optionSource + DATE effectiveDate →
  leer `dataType` derivado/`semanticRole`/`optionSource` normalizado → legacy `options[]` se sube a inline → 2×
  EFFECTIVE_DATE ⇒ 400 → borrar 204; datos de prueba limpiados).

### 2026-06-09 · Fase 2 — Modelo de campo en 3 capas, campos de sistema, y DATOS DE REFERENCIA (dirección aprobada)

Sesión de diseño pedida por el usuario antes de seguir, con investigación de industria (FHIR Questionnaire/SDC,
Reference Data Management, dimensiones de data warehouse, taxonomías de form builders). Aprobado: (1) modelo de
datos de referencia con **Listas gobernadas + `optionSource`** guardando el **code** estable; (2) hacer primero
un **endurecimiento de modelo 2.1.1** (aditivo) antes de 2.2 Flujos. Aún NO se programa.

**Principio rector — un campo son 3 capas separadas** (como FHIR `item.type` + `answerOption/answerValueSet`):
1. **Presentación/widget** (cómo se ve: selector, radio, slider, matriz…).
2. **Tipo de dato** (cómo se almacena/valida/reporta: string, number+unidad, boolean, date/time, **code** =
   referencia única, **code[]**, **reference** = id de entidad, file, geo, **computed**).
3. **Rol semántico** opcional (qué significa para el sistema: `effectiveDate`, `title`, `primaryEquipment`,
   `severityDriver`…). El almacenamiento/reporte sigue al **tipo de dato**, no al widget. La UI sigue simple;
   el MODELO lleva `dataType` + `optionSource` + `semanticRole?`.

**Campos de SISTEMA vs CONTENIDO (Tema 1 — reportabilidad temporal):**
- **Intrínsecos** en cada `LogEntry` (Fase 2.4), capturados SIEMPRE, como **columnas indexadas** inmutables/
  auditadas: `recordedAt` (commit), `createdBy`, `orgNode`, `equipo?`, versión, estado, periodo/turno?, firmas.
  La trazabilidad temporal NO es opcional ni un "campo que se agrega": es estructural.
- **Fecha efectiva de negocio** (hora de lectura/evento ≠ captura): es un campo DATE/DATETIME/TIME con
  **rol `effectiveDate`** → la plataforma lo promueve a una columna `effectiveAt` indexada. Si la plantilla no
  marca ninguno, `effectiveAt` cae a `recordedAt`. "Estructural donde importa, opcional donde no", vía rol.

**DATOS DE REFERENCIA (Tema 2 — el diferenciador). `optionSource` discriminado** reemplaza el `options[]`
literal de SELECT/MULTISELECT:
- `inline` — `{code,label}[]` en el campo (caso trivial; lo actual, solo envuelto).
- `referenceList` — FK a una **Lista de Referencia** interna gobernada (RECOMENDADO para lo reutilizable/reportable).
- `external` — endpoint de Orígenes de Datos (Fase 3), resuelto en backend/cacheado, **materializable** (sync)
  en una Lista de Referencia.

Entidades nuevas (módulo propio "Datos de referencia / Listas", hermano de Estructura/Seguridad):
- **`ReferenceList`**: `key`, `name`, `description`, `source` (MANUAL | EXTERNAL), activa/versionable.
- **`ReferenceItem`**: `code` (**clave estable**), `label`, `active`, `sortOrder`, **`metadata` jsonb** (atributos
  enriquecidos: falla→{categoríaISO, severidadDefault}; contratista→{rut, vigencia}; químico→{CAS}…).

**Regla de oro de reportabilidad (patrón dimensión de DW / FHIR Coding):** el valor de la entrada almacena el
**`code` estable, NO el label**. Los reportes unen valor→`ReferenceItem` y traen label + metadata → agrupar/
filtrar por atributos enriquecidos. Labels cambian sin romper histórico; un code en uso **no se borra** (se
desactiva). Permiso `referencelist:manage`, auditado. **Persistencia = eficiencia + offline en terreno** (no se
machaca la API en cada render). En **Fase 3**, un endpoint externo alimenta/sincroniza una Lista (ERP/MES/RRHH).

**Taxonomía de OBJETOS (Tema 3) — roadmap incremental** (enum aditivo en Postgres; `config`+`dataType`+
`optionSource` cubren las necesidades):
- Alto valor próximo: **Conforme/No conforme/N.A.** (tri-estado de inspección), **lookup/picker de referencia**
  (single/multi), **picker de Equipo/Usuario/Nodo** (`reference`), **grupo repetible / tabla-matriz**, **campo
  calculado/fórmula**, **bloque de instrucción**, **TIME** + `effectiveDate`.
- Evidencia (MinIO; modelar ahora, construir hacia Fase 7): adjunto, **foto**, **código de barras/QR**, **GPS**.
- Ligeros: escala/Likert, slider %, rating, email, teléfono, URL, auto-numérico.

**Qué FIJAR en 2.1.1 (aditivo, ANTES del llenado 2.4, para no migrar con datos):** `options[]`→`optionSource`
(`inline` ahora; `referenceList`/`external` modelados), agregar `dataType` (derivable del tipo) y `semanticRole?`
al campo, y dejar definido que el valor de una referencia se guarda como **code**. El mantenedor de Listas es su
propia sesión; el sync externo es Fase 3. **Re-slicing:** 2.1.1 endurecer modelo → 2.2 Flujos → **2.x Datos de
referencia** (antes/junto al llenado) → 2.3 Rondas → 2.4 Llenado (guarda code/refs + fechas sistema/efectiva) →
expansiones de tipos → Fase 3 alimenta/sincroniza listas. Refs: FHIR ValueSet/answerValueSet, IBM Reference Data
Management, dimensión de data warehouse (code vs label), ISO 14224 (taxonomías como code lists), ISA-95 (master data).

### 2026-06-09 · Fase 2.1 — Plantillas: modelo de DEFINICIÓN + contratos + Form Builder (implementado)

Implementación de 2.1 sobre la arquitectura fijada el mismo día (ver entrada siguiente). Decisiones de
ejecución tomadas con el usuario (4 forks, todos con la opción recomendada):

- **Umbrales del campo NÚMERO = bandas estilo ISA-18.2.** `config` lleva `min`/`max` (rango válido duro) +
  bandas opcionales `warnLow/warnHigh` (advertencia) y `critLow/critHigh` (crítico). El cruce del rango
  crítico **alimentará** la creación de incidencia en Fase 4. Es más rico que el `min/max` único del
  prototipo y diferencia a Lyra de un Forms genérico. Retro-compatible.
- **Tablas de EJECUCIÓN diferidas a 2.4.** En 2.1 se migra SOLO el lado **definición** (`Template`,
  `TemplateVersion`, `TemplateSection`, `TemplateField`, joins `TemplateSectionRole`/`TemplateFieldRole`).
  Las tablas `LogEntry*` se diseñan en contratos pero se migran cuando se construya el llenado (2.4), donde
  su forma se valida con lógica real. **Agregar tablas nuevas es aditivo/no destructivo** ⇒ no contradice
  "diseñar el modelo completo desde el inicio" (lo que esa regla evita son los `ALTER` destructivos).
- **`WorkflowDefinition` como entidad llega en 2.2.** En 2.1 la versión referencia el flujo por **columnas**
  (`workflowDefinitionId`/`workflowDefinitionVersionId` nullable, sin FK) y la sección guarda
  `editableInStateKey` (clave de estado, sin FK). La entidad y su FK se añaden con su mantenedor en 2.2.
  Firma (`requireSignature` en versión y sección) y recurrencia (`recurrenceKind`/`recurrenceConfig`) van
  como columnas opt-in modeladas; sus editores en 2.3/2.5.
- **Tipos de campo = 8 núcleo con editor + SEVERITY/SIGNATURE modelados.** El enum `FieldType` tiene los 10;
  el builder edita los 8 núcleo (NUMBER/TEXT/TEXTAREA/SELECT/MULTISELECT/BOOLEAN/DATE/DATETIME). Agregar más
  valores al enum en Postgres es aditivo (no re-migra).
- **Permiso por sección editable ahora; override por campo modelado.** El builder asigna **roles por
  sección** (join `TemplateSectionRole`). El override por campo (`TemplateFieldRole`) existe en el modelo;
  su editor llega en 2.2 junto al binding sección→estado del flujo.

**Inmutabilidad / versionado (patrón MMR de 21 CFR Part 11):** el builder edita SIEMPRE una versión en
**BORRADOR**. Publicar congela esa versión (`PUBLISHED`, `publishedAt/By`) y fija `Template.currentVersionId`.
Editar una plantilla publicada **clona** la versión publicada en un nuevo borrador `v(n+1)` (las publicadas
nunca se mutan). Verificado en smoke en vivo (crear→borrador→publicar v1→editar→clona borrador v2→borrar).

**`config` como JSONB validado por unión Zod** (`fieldConfigSchemaFor(type)`), no columnas por atributo: el
universo de tipos/config es abierto y heterogéneo; columnas serían un mar de NULLs. La validación de config
**contra el tipo** se aplica en backend (request `saveDraft`) — verificado: opciones en un NÚMERO ⇒ 400.

**Claves estables de sección/campo:** se generan al crear (slug único) y se preservan; el `visibleWhen`
(condicional) referencia por clave, estable entre recargas. **Alcance ABAC al listar:** plantillas globales
(sin nodo) visibles para todos; las ancladas a un nodo, solo si está en el alcance del usuario (reusa
`ScopeService`). **Nuevo primitivo `@lyra/ui`: `Textarea`** (los demás componentes se reusaron; los del
builder son de dominio y viven en `features/templates`).

### 2026-06-09 · Fase 2 — Arquitectura enterprise del Form Builder (forks CONFIRMADOS por el usuario)

> Diseño de fondo pedido por el usuario para que el módulo de plantillas/bitácoras marque diferencia con
> sistemas tipo "Forms" genéricos. Anclado a **registros electrónicos GxP / 21 CFR Part 11** (batch records),
> **máquinas de estado** (no BPMN pesado) y a la auth RBAC/ABAC ya existente. Los 4 forks quedaron
> **confirmados el 2026-06-09** (ver al final). Aún NO se programa.

**Paradigma (la idea que rompe con "un form plano"):** un formulario **no** es una lista de campos que se
llena de una vez; es un **proceso = documento vivo** compuesto de **secciones**, donde cada sección tiene
**dueño** (rol/permiso), **momento** (estado del flujo en que es editable) y **estado de completitud/firma**.
El **registro** (entrada de bitácora) instancia una **versión** de la plantilla y avanza por un **flujo de
estados configurable**; en cada estado se habilitan/bloquean secciones para ciertos roles. *Quién llena qué y
cuándo* **emerge** de `secciones × flujo × RBAC/ABAC`, sin lógica a medida. Es el paradigma del **registro
electrónico por lotes (EBR/GxP)** aplicado a bitácoras operacionales.

**Elegancia clave — la maquinaria enterprise es OPT-IN (degradación elegante):** una plantilla con **una
sección, un estado, sin firma** se comporta como un form simple tipo Google Forms. Secciones múltiples, flujo,
permisos por sección y firmas se activan **solo cuando se configuran**. Así no complejizamos lo simple.

**La SECCIÓN es la unidad atómica** de: permiso de llenado, asignación a estado del flujo, completitud,
bloqueo y firma. Resuelve el requisito "varios usuarios llenan distintas secciones en distintos instantes":
el operador A llena la Sección 1 en T1 (atribuida `filledBy/At`, opcionalmente firmada → bloqueada), el
técnico B llena la Sección 2 en T2. **No hay bloqueo global del formulario**; la concurrencia es por sección
(concurrencia optimista con revisión por sección). "Distintos permisos por instante" = la editabilidad de una
sección es función de **(estado del flujo) × (rol/permiso) × (alcance ABAC)**.

**Definición (config versionada) vs Ejecución (relacional + auditada):**
- *Definición:* `Template` + **`TemplateVersion` inmutable** (al publicar se congela: secciones, campos,
  flujo y config de firma). Las entradas referencian una **versión** concreta → editar la plantilla luego no
  altera registros históricos (auditabilidad). Campos con `type`, `required`, validaciones (min/max/umbral/
  unidad/regex), visibilidad condicional, orden, sección.
- *Ejecución:* `LogEntry` (versión, alcance/nodo/equipo, periodo/turno opcional, `currentState`),
  `LogEntrySection` (estado pending/in_progress/completed/locked + `filledBy/At` + firma), `LogEntryValue`
  (valor actual) con **historial por campo** (reusar `AuditLog` quién/qué/cuándo/antes-después),
  `LogEntryTransition` (log del flujo: from→to, actor, motivo, firma).

**Flujo = máquina de estados configurable, integrada al RBAC dim. 3 (workflows):** estados + transiciones;
cada transición guarda **roles/permiso permitidos como DATO** (no hardcodeado) + flags `requireSignature?`,
`requireMfa?` (step-up AAL para acciones críticas). Entrar a un estado recomputa qué secciones son editables.
Esto reusa la dimensión 3 de permisos ya diseñada (`docs/SECURITY.md` §2). **No** se usa un motor BPMN: una
máquina de estados liviana y declarativa basta.

**Firmas electrónicas (diferenciador enterprise, estilo Part 11):** opcionales por completitud de sección y
por transición. Registran `userId`, timestamp UTC, **significado** ("Revisado"/"Aprobado") y **hash del
payload firmado**; re-autenticación (contraseña/MFA step-up) configurable. Junto con la auditoría append-only
ya existente → registros con validez probatoria (minería/farma/energía). Es lo que separa esto de un Forms
genérico.

**Validación y umbrales:** el backend valida valores contra las reglas de la versión al guardar y como
**guardas de transición** (p. ej. no se puede "enviar" si faltan secciones obligatorias). Los umbrales marcan
lecturas fuera de rango y **modelan** una regla que, en **Fase 4 (motor de incidencias)**, disparará una
incidencia. En Fase 2 solo se modela la regla; **la creación de la incidencia se integra en Fase 4**.

**Cómo atacarlo sin perder el hilo (un objetivo por sesión; el MODELO se diseña completo desde el inicio para
no migrar después):**
1. **Plantillas: modelo + contratos + Form Builder (estructura).** `Template`/`TemplateVersion` + secciones +
   campos (tipos núcleo) + validaciones básicas + **vista previa** + **borrador/publicar con versión
   inmutable**. Flujo y firma quedan **modelados en contratos** aunque su editor UI venga después. Sin llenado.
2. **Editor de flujo + permisos de sección** (definición): estados/transiciones, asignar secciones a estados y
   roles, config de firma.
3. **Llenado (Nueva entrada) multi-actor:** secciones editables según estado+rol; guardar con validación
   backend + auditoría por campo + concurrencia por sección.
4. **Ejecución de flujo + firmas:** transiciones gateadas, firma electrónica (re-auth/MFA), bloqueo/desbloqueo
   de secciones, log de transiciones.
5. **Bitácoras: listado + detalle + línea de tiempo + log de cambios** (vista de auditor del registro vivo).
6. **(cruce Fase 4)** reglas que disparan incidencias.

**Permisos nuevos (catálogo `@lyra/contracts`, asignación = dato):** `template:view/create/edit/publish/delete`,
`logentry:view/create/fill`, y transiciones vía datos de la transición (roles permitidos) en lugar de claves
hardcodeadas. Confirmar en el diseño detallado.

**Forks CONFIRMADOS por el usuario (2026-06-09) — definen el modelo:**
1. **Captura temporal = AMBAS, completas.** (a) registro **colaborativo por fases** (secciones llenadas por
   distintos usuarios en distintos momentos) **y** (b) **rondas/lecturas programadas recurrentes** por
   turno/periodo. ⇒ Se modela **`LogPeriod`/programación** (turno/intervalo/calendario): una plantilla puede
   declararse **recurrente** y cada ocurrencia genera/abre un `LogEntry` ligado a su periodo; además el
   registro admite llenado colaborativo por secciones. Investigar estándar de **rondas/turnos** (ISA-95, shift
   handover) antes de modelar el calendario; mantenerlo simple (no un scheduler genérico).
2. **Firmas electrónicas estilo Part 11 = SÍ**, configurables por plantilla/transición (opt-in), con re-auth /
   **MFA step-up** reutilizando el MFA ya implementado. Diferenciador para auditorías.
3. **Granularidad = SECCIÓN por defecto + OVERRIDE por campo** donde se justifique. El modelo de permisos de
   llenado se resuelve a nivel sección, con posibilidad de afinar por campo.
4. **Flujo = DEFINICIONES REUTILIZABLES.** `WorkflowDefinition` es **entidad de primera clase** (catálogo de
   flujos: estados + transiciones + roles/permiso + firma), referenciada por las versiones de plantilla
   (varias plantillas pueden compartir un flujo). Mantenedor propio (estilo Roles). La **ejecución** sigue
   normalizada (`LogEntry.currentState`, `LogEntrySection`, `LogEntryTransition`). La versión de plantilla
   **congela** qué `WorkflowDefinition` (y versión de éste) usa, para no alterar registros históricos.

**Ajuste al modelo por los forks:** entidades nuevas respecto a la propuesta inicial → **`WorkflowDefinition`**
(catálogo reutilizable, versionado/congelable) y **`LogPeriod`/config de recurrencia** (rondas/turnos). El
slicing por sesión se reordena en BACKLOG §2 para incluir un mantenedor de **Flujos** (2.2) y la
**Programación de rondas** (2.3) antes del llenado.

### 2026-06-08 · Reset de contraseña por administrador (contraseña temporal, estilo AD)

Hueco detectado en la UI de Seguridad: no había forma de que un admin restableciera la contraseña de un
usuario existente (solo existía el self-service por correo y el alta con temporal). Se implementó la
**variante A** (aprobada por el usuario), que es el patrón de **Active Directory / helpdesk** y el más
adecuado para terreno industrial (no asume que el operador tenga correo):

**El admin fija/genera una contraseña temporal** → el backend la valida contra la política, marca
`forcePasswordChange = true` (el usuario la cambia al primer ingreso), **revoca TODAS las sesiones** del
objetivo (la cuenta pudo verse comprometida), invalida enlaces de reset pendientes y **audita**
(`auth.password.admin_reset`). **No toca el MFA** — contraseña y segundo factor son factores distintos
(coherente con el reset self-service y con el reset de MFA, que tampoco se cruzan). El admin ve la temporal
un instante; es de un solo uso efectivo por el cambio forzado. Fundamento: NIST 800-63B + práctica AD.

- **Permiso nuevo `user:reset-password`** (catálogo 25→**26**), **separado** de `user:edit` — igual que
  `user:reset-mfa` está separado — para poder dar "reset" a soporte sin edición completa. Asignación = dato
  en BD (seed lo agrega al rol admin).
- **Backend**: `AuthService.adminResetPassword` (reusa `policy`/`passwords`/`tokens`/`resets`/`audit`) +
  `POST /security/users/:id/reset-password` (`AdminResetPasswordRequest`). **3 tests** nuevos.
- **UI**: subsección "Contraseña" en la pestaña *Seguridad* del detalle (gateada por `user:reset-password`)
  + `ResetPasswordModal` (temporal con generador/mostrar-una-vez + aviso de revocación de sesiones y cambio
  forzado). Helper `generateTempPassword` compartido con el alta (sin duplicar).
- **Variante B (enlace por correo) descartada como default**, registrada como opción futura cuando haya SMTP
  y el usuario tenga correo: preserva privacidad (el admin no ve la clave) pero no sirve a operadores sin
  buzón. Ver BACKLOG.

### 2026-06-08 · Modelo de usuario alineado a SCIM + costura de federación (diseño; implementación diferida a v2)

Decisión de **diseño** (sin migraciones aún) sobre qué datos tendrá `User` y cómo dejar lista la
identidad federada (AD / OIDC / SAML) para la próxima versión, de modo que activarla sea **aditivo** y no
un refactor. Anclado a estándares: **SCIM 2.0** (RFC 7643/7644 — el esquema que Entra ID/Okta/Google/
JumpCloud usan para aprovisionar), **OIDC Core §5.1** (claims) e **inetOrgPerson** (LDAP/AD).

**Catálogo de datos de usuario (referencia SCIM, priorizado para este producto industrial):** identidad/login
(`userName` login estable + `externalId` del IdP, separados del email de contacto que puede cambiar), nombre
(`givenName`/`familyName` además de `displayName`), contacto (`emails[]` con primario, `phoneNumbers[]` —
clave para notificaciones/escalamiento HSE), empleo/organización (`employeeNumber`, `title`/cargo,
`department`, `manager`, `costCenter`), ubicación/sitio (encaja con el **scope ABAC** = nodo de estructura),
locale/i18n (`preferredLanguage`, `timezone` — sellos de tiempo por turno), ciclo de vida (`active` —ya
existe `status`—, validez `validFrom`/`validTo` para contratistas, `userType`), avatar y auditoría
(`created`/`lastLogin`, ya presentes).

**Costura de federación (lo crítico, decidido a nivel de diseño):**
1. **`User` = principal canónico; identidades enganchadas aparte.** Patrón Keycloak/Auth0/Entra: tabla
   **`UserIdentity`** (`userId`, `provider` ∈ {LOCAL, OIDC, SAML, LDAP}, `providerKey` = instancia,
   `subject`/`externalId` estable del IdP, `claims jsonb`, `linkedAt`). Permite **account linking** (password
   local + cuenta OIDC del mismo usuario) sin duplicar. Es la contraparte de datos de la "auth enchufable"
   (DECISIONS 2026-06-05).
2. **Atribución de origen + *mastering* de atributos.** Cuando el IdP es dueño de `displayName`/`email`/
   `department`, esos campos pasan a **solo-lectura** en la UI (sincronizados por SCIM/JIT). Marca por
   usuario/campo quién manda (`authProvider`/`managedExternally`) para que un sync no pise ediciones locales.
3. **Password y MFA opcionales/delegados.** Usuario federado **sin `passwordHash`** (debe ser nullable) y su
   AAL/MFA puede venir del IdP → `mfaMode` debe poder **deferir** al proveedor (no exigir TOTP propio si el
   IdP ya hizo MFA).
4. **Grupos del IdP → roles** vía tabla de mapeo (el RBAC ya es 100% dato).

**Plan de implementación (cuándo):**
- **No ahora:** SCIM completo sería sobre-ingeniería (CLAUDE.md) — la mitad de los campos no los consume
  ningún módulo todavía.
- **Set lean a agregar cuando se justifique (barato, alto valor, ya usable por bitácoras/notificaciones):**
  `username` (login estable, opcional, ≠ email), `firstName`/`lastName`, `phone`, `jobTitle`, `employeeId`,
  `preferredLanguage`/`timezone`. Mapean 1:1 a SCIM/OIDC.
- **Diseñar listo, implementar en v2:** `UserIdentity` + `authProvider` en `User` (default `LOCAL`) +
  `passwordHash` nullable + reglas de mastering → activar un proveedor = migración aditiva, sin tocar `User`.
- **Diferir a v2:** SCIM inbound, JIT provisioning, mapeo grupo→rol, validez por fechas de contratistas,
  multi-email/multi-phone, MFA delegada.

Registrado en BACKLOG §2 (Identidad/Federación v2) y §3 (deuda: `passwordHash` nullable, separar login de email).

### 2026-06-08 · UI de Seguridad (usuarios/roles/política/auditoría) sobre `/security/*`

Consume el backend de seguridad ya existente (RBAC/ABAC, política, MFA, reset de admin, auditoría). Decisiones (aprobadas tras propuesta):

**Navegación: sub-rutas anidadas + match por prefijo (UNA pestaña por módulo).** `/seguridad` es un `SecurityLayout` con barra de sub-tabs y `Outlet`; las sub-secciones son rutas anidadas reales (`/seguridad/{usuarios,roles,politica,auditoria}`), deep-linkables y gateadas cada una por su permiso (`user:read`/`role:read`/`security:policy:manage`/`audit:read`). El índice redirige a la primera sub-tab permitida. Para que el shell (pestañas/breadcrumb/sidebar) trate todo `/seguridad/*` como **un** módulo se añadieron helpers `routeForPath` (coincidencia por prefijo más largo) e `isRouteActive` en `navigation.ts`, y se ajustaron AppShell/WorkspaceTabs/Topbar/Sidebar. **Motivo:** deep-linking y breadcrumbs por área sin ensuciar la tira de pestañas con 4 entradas; patrón reutilizable para futuros módulos con sub-secciones (Plantillas, etc.).

**UX de usuarios: master-detail** (mismo patrón que Estructura, `ResizableSplit`). Lista a la izquierda; panel derecho con secciones independientes que guardan por separado contra los endpoints atómicos del backend: datos básicos (`PATCH :id`), roles (`PUT :id/roles`), alcance de datos (`PUT :id/scope`) y MFA (estado + reset `POST :id/mfa/reset`). **Selector de alcance (ABAC dim. 4):** árbol de la estructura con checkbox por nodo + toggle "incluye descendientes" por entrada. La vista node-centric/por-rol (asignar desde el propio árbol, "quién accede a este nodo") queda como ítem ABAC enterprise futuro (BACKLOG §2).

**Contrato de auditoría añadido** (`auditLogEntrySchema` + `AuditLogEntry` en `@lyra/contracts`): el `GET /security/audit` retornaba filas Prisma crudas sin tipo compartido. Se tipó el controller y se mapea `occurredAt`→ISO string (forma de respuesta idéntica en el cable; solo se formaliza). `before`/`after`/`metadata` son `unknown` (snapshots JSON). Paginación por cursor de `id` (UI con `useInfiniteQuery` + "cargar más").

**`scopeEntrySchema`: se quitó `.default(true)` de `includeDescendants` (campo explícito).** El default hacía que el tipo de **entrada** Zod (`includeDescendants?`) difiriera del de **salida**, y los helpers tipados del cliente (`apiJson`) infieren el de entrada → conflicto "dos tipos distintos con el mismo nombre". Hacerlo explícito (la UI siempre lo envía) alinea input/output y es más estricto. **Motivo:** correctitud de tipos extremo a extremo sin castings.

**Nuevo primitivo `@lyra/ui`: `Checkbox`** (CSS Module sobre tokens, dual theme, área táctil 44px, estado **indeterminado** para selección de grupo). Lo exige la matriz de permisos (agrupada por `group`/`dimension` del catálogo) y reutilizado en scope/roles.

**Hallazgo (honestidad técnica): el permiso `user:disable` no está enforced.** El cambio de `status` (ACTIVE↔DISABLED) viaja por `PATCH :id`, gateado por `user:edit`, no por `user:disable`; el permiso del catálogo queda sin guard que lo exija. La UI gatea el control de estado por `user:edit`; `user:disable` se registra como deuda en BACKLOG §3 (decidir: separar endpoint o retirar la clave). No se tocó el backend "cerrado" en esta sesión más allá del tipado de auditoría.

### 2026-06-08 · Módulo Equipos: modelo `Equipment` integration-ready + `ExternalReference` polimórfica (modelo) + catálogo de categorías

Cierre del módulo de Estructura. Reemplaza el placeholder "Equipos — próximamente" del nivel final por un CRUD real. Decisiones (aprobadas por el usuario tras propuesta):

**Modelo `Equipment` integration-ready (entidad separada, NO 4.º nivel de OrgNode).** Patrón SAP PM: Functional Location (OrgNode) 1:N Equipment. Campos: identidad (`name`, `code?` corto interno, **`tag?` @unique** = assetTag estable, clave de negocio/reportes), clasificación (`categoryId?` → catálogo configurable), `manufacturer/model/serialNumber`, `criticality?` (Int **1–5**, RCM/ISO 14224, reusa la escala Severidad 1–5 del DS), `active` (estado operacional) **+** `deletedAt` (borrado lógico — son conceptos distintos), `reportOrder` (orden en informes por nodo), y **`orgNodeId`** (FK a OrgNode). Decisiones de criterio que difieren del enunciado inicial y fueron aceptadas:
- **`orgNodeId`, no `processId`:** el DB no puede forzar "último nivel" (los niveles son configurables y un Proceso podría ganar hijos); el modelo admite cualquier nodo y la **UI** muestra la sección Equipos solo en el nivel final. Nombre consistente con `Scope.orgNodeId` / `ExternalReference`.
- **Sin `abbreviation`** (redundante con `code`) y **sin `externalCode` plano** en Equipment: los mapeos van por `ExternalReference`. El `externalCode` plano de OrgNode queda como deuda a migrar a `ExternalReference` (BACKLOG §3).
- **`criticality` acotada por check constraint** (`1..5` o NULL), análogo al check del Scope.

**Clasificación = catálogo configurable `EquipmentCategory`, NO enum ni texto libre.** Mismo espíritu que `OrgLevel`: `name`, `code?`, `isoRef?` (alineación **opcional** a ISO 14224, sin forzarla), `description?`, `reportOrder`, `active`. Texto libre rompería consistencia/reportes; un enum hardcodeado violaría "nunca hardcodear lo configurable" (madera ≠ minería) y obligaría a migrar por cliente. Se entrega con seed inicial editable **+ drawer de gestión** (molde `LevelsDrawer`) gateado por permiso nuevo `equipmentcategory:manage`, para que "configurable" sea real desde ya.

**`ExternalReference` polimórfica: modelo ahora, UI/motor en Fase 3.** Dueño `orgNodeId?` **XOR** `equipmentId?` (**check constraint raw SQL**, mismo patrón que `Scope` — validado en BD: ambos-nulos→falla, uno→OK, ambos→falla). Campos `systemType` (String, catálogo configurable que se define en Fase 3 — no enum), `externalId` (WebID/NodeId/Equipment Number), `externalPath` (PI AF/OPC browse path), `endpoint`, `metadata jsonb`, `enabled`. **Se descartó construir UI de mapeos esta sesión:** sin el motor de Fase 3 no se puede validar un WebID/NodeId ni probar conectividad → sería UI desechable (lo que CLAUDE.md prohíbe). El costo real a evitar era el modelo polimórfico + backfill, que queda resuelto. Un equipo mapea a varios sistemas a la vez ⇒ el `externalCode` único no bastaba.

**Permisos nuevos** (catálogo `@lyra/contracts`, asignación = dato en BD): `equipment:view/create/edit/delete` + `equipmentcategory:manage` (total catálogo: 20→25).

**Guard nuevo en `deleteNode`:** bloquea borrar un nodo con equipos activos (simétrico al bloqueo por hijos), evitando equipos huérfanos.

**Equipos NO es módulo de sidebar:** vive dentro de `/estructura` (en `NodeDetail` del nivel final), gateado por `module:structure:view`; las acciones gatean el CRUD interno. Sin cambios de navegación.

### 2026-06-08 · Estructura: UX de layout responsivo, splitter propio, `description` y `reportOrder`

Sesión de pulido de UX del mantenedor de Estructura (continuación). Decisiones:

**Workspace full-width y responsivo (token-first).** Se eliminaron los `max-width` (1320/1400px) y `margin:0 auto` que dejaban el contenido flotando con márgenes vacíos en monitores anchos, y el **doble padding** (shell + page). El padding del workspace pasa a tokens de layout nuevos en `@lyra/ui` (`--layout-content-pad-x/y`, `--layout-tree-width`) con breakpoints explícitos: mobile <768px (apilado), tablet/desktop, wide >1920px (padding y árbol crecen). Motivo: usar todo el ancho disponible en cualquier resolución; cambios en una sola fuente de verdad.

**Splitter de paneles propio, NO `react-resizable-panels`.** Se probó la librería (v4) y se descartó: aplica el `className` a un **div anidado** mientras su contenedor externo (con `overflow:hidden` y tamaño propio) **recortaba** el contenido del árbol (nombres invisibles, scroll horizontal), además de imponer topes de redimensionado arbitrarios. Se reemplazó por **`ResizableSplit`** (en `@lyra/ui`, ~120 líneas, sin dependencia): ancho izquierdo explícito en px, panel derecho `flex:1`, divisor con **pointer events + teclado (flechas) + táctil**, doble clic para resetear, ancho persistido en `localStorage`, re-clamp con `ResizeObserver`. Sin topes arbitrarios; solo mínimos sensatos (220px izq / 360px der) para que ningún panel colapse. **Promovido a `packages/ui`** para reúso (regla del monorepo). Motivo: control total del DOM/CSS = contenido siempre ajustado (ellipsis, no recorte) y comportamiento "inteligente" sin pelear con el modelo de la librería; bundle −32 KB.

**`description` (uso del nodo) en `OrgNode`, full-stack.** Campo `String?` (máx. 500). Se muestra como **segunda línea** en el árbol (truncada) y en la grilla de hijos (bajo el nombre), y en el header del detalle. Descripciones de demo (planta de remanufactura de madera, referencia tipo ITI) en **un módulo único** `prisma/structure-descriptions.ts` consumido por el seed (nodos nuevos) y por un **backfill no destructivo** (`db:backfill-descriptions`, solo `description IS NULL`).

**`reportOrder` (orden en informes) por nodo, relativo a hermanos.** Campo `Int @default(0)`. `getTree` ordena por `(reportOrder asc, name asc)` → afecta árbol y grilla. Decisiones de UX confirmadas con el usuario: **edición inline** en la grilla (input numérico por fila, persiste en blur/Enter) y **orden por defecto** por este campo. Orden inicial **escalonado** (10,20,30…) por grupo de hermanos vía helper único `prisma/report-order.ts` (seed + backfill `db:backfill-report-order`, no destructivo). Honesto: el escalonado inicial es **alfabético**, no el flujo físico real de la planta; el usuario lo ajusta desde la grilla.

**Grilla de hijos ordenable.** El `Table` de `@lyra/ui` ya era **controlado** (emite `onSort`, el padre ordena); `NodeDetail` ahora mantiene estado de sort y ordena los hijos localmente (columnas nombre/orden/código/cód. externo). Densidad de tabla reducida (padding `14→10`, `th 10→8`) con `min-height:44px` por fila para preservar el área táctil de terreno.

**Dev server fijado al puerto 5173.** `strictPort:true` en `vite.config` + script `predev` (`scripts/free-port.mjs`) que mata lo que ocupe 5173 antes de arrancar (cross-platform). Motivo: Vite derivaba a 5174+ en silencio y el usuario "no encontraba" la app.

### 2026-06-07 · Estructura v2: layout master-detail + Menu portal + Equipment como entidad separada

**Layout master-detail de dos paneles** (árbol izquierda, detalle derecha) adoptado como patrón estándar para la gestión de jerarquías. Es el patrón de SAP PM (Functional Location / Equipment), IBM Maximo (Asset/Location), Figma (Layers + Properties), VS Code (Explorer + Editor). Ventajas sobre el árbol + menú contextual: sin menús recortados por `overflow:hidden`, más espacio para atributos futuros, navegación por breadcrumb, acciones visibles y contextualizadas.

**Menu portal**: `@lyra/ui/Menu` migrado a `createPortal(panel, document.body)` con `position:fixed`. Solución estándar de la industria (Radix UI, Headless UI, Floating UI) para menus/tooltips/popovers que necesitan escapar de cualquier contexto de apilamiento CSS. El detector de click-fuera usa `panelRef` adicional al `triggerRef`.

**Equipos ≠ 4.º nivel de OrgNode**: los equipos industriales (máquinas) son una entidad operacional distinta de la jerarquía organizacional/funcional. Mezclarlos en OrgNode crearía columnas condicionales (code / externalCode / type / abbreviation / sortOrder / active solo tienen sentido para Equipo). El patrón correcto (SAP PM): Functional Location (OrgNode) 1:N Equipment. El modelo `Equipment` se implementará en sesión posterior con su propia migración, endpoints y grid en NodeDetail.

### 2026-06-07 · Fase 1 (UI): Estructura organizacional — árbol sin librería, MoveModal con ruta materializada
Árbol de nodos implementado como componente recursivo **sin dependencia de librería de árboles**
(custom `OrgTree` + `NodeBranch` en `features/structure/`). Justificación:
- Las estructuras industriales esperadas son de decenas a ~300 nodos: no se justifica virtual scrolling ni lazy loading.
- El árbol tiene comportamientos de dominio específicos (acciones por nodo gateadas por permiso, `Chip` de nivel, reparentado) que no encajan limpiamente en la mayoría de librerías.
- Coste marginal de un árbol recursivo manual es bajo dadas las capacidades ya existentes.

**Reparentado (MoveNodeModal):** se usa el campo `path` (ruta materializada) del backend para pre-deshabilitar en la UI los nodos que no pueden ser padre (el propio nodo y sus descendientes, con `path.startsWith(node.path)`). El backend sigue siendo la fuente de verdad con `assertValidReparent`; la UI mejora el UX sin relajar la seguridad.

**Componentes nuevos en `@lyra/ui`:** `Chip` (badge genérico, 6 variantes), `Table` (sortable, skeleton, dual theme), `Select` (mismo patrón que `Input`). `NodeTag`/`NodeTree` descartados — acoplan el DS al dominio.

**DELETE /structure/levels/:id** añadido al backend (bloquea si hay nodos activos — simétrico al DELETE de nodo que bloquea si tiene hijos).

### 2026-06-06 · Fase 1 (UI): tema claro / oscuro / auto en el workspace (revierte "dark-only v1")
A pedido del producto se incorpora **modo claro/oscuro/auto** en el workspace, **revirtiendo** la regla
de identidad "Dark mode … No hay modo claro en v1" (actualizada en `CLAUDE.md`). Implementación:
- **Token-first, sin tocar componentes**: el tema EFECTIVO se aplica como `data-theme="dark|light"` en
  `<html>`; los tokens se redefinen por tema en `packages/ui/src/tokens/index.css`
  (`[data-theme="dark"]` / `[data-theme="light"]`). Se definió una **paleta clara completa** (fondos,
  bordes, texto, glass, glows, sombras) y dos tokens de interacción nuevos: `--color-hover` (superficies
  hover/activas) y `--color-chrome` (fondo translúcido de sidebar/topbar/pestañas). Se barrieron los
  `rgba(255,255,255,…)` en duro de los componentes del workspace y se reemplazaron por tokens.
- **Preferencia** (`dark`/`light`/`auto`) en `theme-store` (Zustand + persist, `localStorage`,
  no secreto). `auto` resuelve con `prefers-color-scheme` y reacciona a cambios del sistema
  (`use-theme-controller`). Default = **oscuro**. Selector en el top bar y en la command palette (⌘K).
- **La entrada/login es SIEMPRE oscura** (experiencia de marca): `AuthLayout` fuerza `data-theme="dark"`
  en su raíz, por eso el tema solo afecta al workspace.
- **Pestañas de trabajo**: más estilo + animación sobria (línea de acento de marca al activarse,
  entrada `tabIn` fade/slide, se "conectan" al contenido); respeta `prefers-reduced-motion`.
**Pendiente:** QA visual del modo claro en navegador (BACKLOG §4). El default sigue oscuro.

### 2026-06-06 · Fase 1 (UI): App Shell / Workspace premium ANTES de los módulos
Antes de construir la UI de Estructura/Seguridad se construye un **shell de aplicación premium**
(el "área de trabajo"), porque es el marco donde viven todos los módulos y retrofitearlo después
obliga a re-alojar pantallas y, sobre todo, a meter i18n y pestañas en todo lo ya hecho.
- **Secuencia:** shell primero (una sesión enfocada) → luego Estructura nace dentro de él. Los
  primitivos de `@lyra/ui` que faltan (Tabs, Drawer, Modal, Menu, Tooltip, Skeleton, Breadcrumb,
  EmptyState, Toggle) se construyen aquí y se reutilizan en todos los módulos (no es trabajo perdido).
- **Paradigma de navegación: pestañas de trabajo ACOTADAS** (no MDI ilimitado). Tira de pestañas
  fijables (tope ~6); **cada pestaña es una ruta** y el estado se preserva por la **caché de TanStack
  Query** (con `staleTime`), no manteniendo árboles de componentes vivos. Logra el "no salir y entrar"
  sin **datos rancios/memoria** (el "ojo con los refrescos" del usuario) ni la hostilidad del MDI en
  **tablet/terreno con guantes**. Colapsa con gracia en pantallas chicas.
  - **Descartado:** MDI completo (memoria creciente, estancamiento, malo en tablet).
- **i18n-ready desde ahora** (no diferido a Fase 7): capa ligera con **es-CL por defecto** + selector
  de idioma visible; **todos los strings como claves**. Los catálogos de otros idiomas se llenan en
  Fase 7, pero no hay que retrofitear pantallas. On-prem, sin SaaS.
- **Recursos premium del shell:** sidebar colapsable (completo ↔ riel de íconos, persistido),
  **command palette ⌘K** (saltar a módulos/acciones/nodos), top bar con breadcrumbs + búsqueda +
  notificaciones + **menú de perfil** (Mi seguridad/MFA, Preferencias, Logout) + cambio de idioma +
  **toggle de densidad** (cómodo/compacto), **favoritos + recientes**, skeleton loaders + updates
  optimistas. Estado de UI (sidebar/densidad/idioma/pestañas) en `localStorage` (nunca tokens/secretos).
- **Tooling propuesto (a confirmar al implementar):** `react-i18next` (estándar, offline, plural/
  interpolación) y `cmdk` (headless, lo estilizamos con tokens Lyra) — ambos locales, sin SaaS.

### 2026-06-06 · Fase 1 (Auth): MFA self-service — política por rol + enrolamiento forzado
Segundo factor TOTP con enrolamiento **self-service** (el secreto solo lo conoce el dispositivo del
usuario; el admin NUNCA enrola por él). Estándar NIST 800-63B / OWASP ASVS v4 §2. Decisiones:
- **Política de requerimiento** en dos piezas: campo **`Role.requireMfa`** (granularidad por rol) +
  modo global **`PasswordPolicy.mfaMode`** = `OPTIONAL | REQUIRED_BY_ROLE | REQUIRED_FOR_ALL`. El piso
  es **OPCIONAL** (nadie forzado, pero cualquiera puede auto-enrolarse): **se descartó un modo
  "deshabilitado"** que impidiera el enrolamiento voluntario por ser un anti-feature de seguridad.
  Requerimiento **derivado**: `required = ALL || (BY_ROLE && algúnRol.requireMfa)`.
- **Enrolamiento forzado con enforcement en backend (no solo UI).** Análogo a `forcePasswordChange`,
  pero `forcePasswordChange` hoy solo redirige en la UI; para MFA eso **degradaría el AAL** (operar con
  solo-contraseña vía API). Se añadió un claim **`mfaPending`** al access token (recalculado en cada
  emisión/rotación) y un **`MfaEnrollmentGuard`** global que bloquea (**403 `MFA_ENROLLMENT_REQUIRED`**)
  todo salvo lo marcado con **`@AllowPendingEnrollment`** (me, logout, mfa/setup, mfa/verify,
  change-password). Al verificar, un `/auth/refresh` limpia el claim. *Pendiente registrado:* dar el
  mismo enforcement de backend a `forcePasswordChange` (hoy solo UI).
- **Throttle del 2.º factor** (faltaba; NIST §5.2.2 / ASVS §2.2.1): contador **propio** en
  `User.mfaFailedCount`/`mfaLockedUntil`, **separado** del lockout de contraseña (si se compartiera, una
  contraseña correcta reiniciaría el tope del 2.º factor). Tras `maxFailedAttempts` bloquea
  `lockoutMinutes`. Se fijó **ventana TOTP ±1** (RFC 6238) para desfase de reloj.
- **Reset de MFA por admin** (dispositivo perdido): `POST /security/users/:id/mfa/reset`, permiso nuevo
  **`user:reset-mfa`** (catálogo, no hardcodeado). Borra el factor y **revoca TODAS las sesiones** del
  objetivo (evita sesión rancia con el AAL anterior); si el rol sigue exigiendo MFA, cae al gate en el
  próximo login. El admin **no** enrola por el usuario.
- **Sesiones:** auto-activar / auto-desactivar mantienen la sesión actual; **reset de admin revoca
  todo**. Un factor **exigido por política no se puede auto-desactivar** (`disableMfa` lanza 403 si el
  rol lo requiere; solo el admin lo restablece). El reset de **contraseña** sigue sin tocar MFA.
- **Recovery codes:** 10, hasheados, single-use (ya existían); se añadió **regenerar** con
  reconfirmación de contraseña (invalida los anteriores). Se muestran **una sola vez** (copiar/descargar).
- **Frontend:** página de seguridad del perfil (`/perfil/seguridad`) y gate full-screen `/activar-mfa`
  comparten un `MfaEnrollFlow` (QR con **`qrcode.react`** desde el `otpauth://` del backend → verificar →
  códigos). `ProtectedRoute` prioriza cambio de contraseña y luego enrolamiento de MFA.
**Alcance:** el **reset de admin y la lectura de estado** se entregan como **backend + contratos** ahora;
su **UI vive en la pantalla de Seguridad/usuarios** (sesión posterior), para no construir UI desechable.
**Residual honesto:** no se implementa anti-replay del mismo OTP dentro de su ventana (deuda menor).

### 2026-06-06 · Fase 1 (Auth): recuperación de contraseña self-service
Reset por correo siguiendo NIST 800-63B y OWASP ASVS §2.5 / Forgot Password Cheat Sheet.
- **Token**: aleatorio de 256 bits, se guarda **solo el hash SHA-256** (`PasswordResetToken`),
  **single-use** (`usedAt`) y **TTL corto** (`PASSWORD_RESET_TTL`, def. 30 min). Al pedir uno nuevo
  —o al cambiar la contraseña por cualquier vía— los pendientes se invalidan.
- **`POST /auth/forgot-password`**: respuesta **neutra siempre** (`{ok:true}`), sin enumeración de
  usuarios; el correo se envía **en segundo plano** para no filtrar por *timing*. **Rate-limit** por
  correo y por IP (contadores en `CacheService`); superar el tope no cambia la respuesta.
- **`POST /auth/reset-password`**: valida token (hash, no usado, no expirado) con **mensaje genérico**
  ("inválido o expirado"), impone la **política** (complejidad + historial), **revoca TODAS las
  sesiones** (`TokenService.revokeAllForUser`), limpia lockout/`forcePasswordChange`, **no toca MFA**
  (quien controle el correo sigue sin pasar el 2º factor) y **no auto-loguea** (redirige a `/login`).
- **Correo tras una interfaz abstracta `EmailService`** (token DI, patrón tipo `LlmProvider`) con
  implementación SMTP (**nodemailer**); en dev usa **Mailpit**. Sin SaaS obligatorio (on-premise).
  Se envía además una **notificación de seguridad** "tu contraseña fue cambiada".
- **Frontend**: `/recuperar-contrasena` (pedir correo + confirmación neutra) y nueva
  `/restablecer-contrasena?token=…`. **Endurecimiento del token en URL**: se borra de la URL al montar
  (`history.replaceState`) y `<meta name="referrer">` para no filtrarlo por *referer*.
- **Auditoría** append-only: `reset_requested` (con `delivered`), `reset_completed`, `reset_failed`,
  `reset_throttled`.
**Pendiente registrado (mejora transversal, NO en esta sesión):** rechazo de **contraseñas
comprometidas** (NIST 800-63B §5.1.1.2, ej. HIBP k-anonymity o lista local). Aplica a todo seteo de
contraseña (change/force/reset); se diseñará pluggable y apagado por defecto para respetar on-premise.

### 2026-06-05 · Fase 1 (UI): co-branding de la empresa licenciataria + entrada premium
La pantalla de acceso co-marca **producto (Lyra WatchLog) + empresa licenciataria**. Como es
single-tenant on-premise, la identidad del cliente (nombre, rubro, logo) se configura **por entorno**
(`VITE_LICENSEE_NAME/INDUSTRY/LOGO_URL`, `envDir` apunta al `.env` raíz), nunca hardcodeada; sin logo
se usa un **monograma** de iniciales (con fallback automático si el logo falla al cargar). El logo se
muestra sobre **placa clara** para legibilidad de cualquier color. Se añadió un gráfico vectorial
animado propio (constelación Lyra + telemetría operacional) y animaciones de entrada
(`prefers-reduced-motion` respetado).
**Bug corregido en tokens:** los componentes usaban `--space-*`, `--text-*`, `--transition-*` que NO
existían en `@lyra/ui/tokens` (solo `--spacing-*`), por lo que el espaciado y la tipografía colapsaban.
Se agregaron esos tokens (fuente de verdad), mejorando toda la app.

### 2026-06-05 · Fase 1 (UI): login estándar y recuperación asistida (reset self-service PENDIENTE)
El login incorpora lo estándar: mostrar/ocultar contraseña, **recordar correo** (nunca la contraseña),
**¿olvidaste tu contraseña?** y, en el segundo factor, opción de **código de recuperación** (fiel:
`assertSecondFactor` ya acepta TOTP o recovery code). La recuperación de contraseña es **asistida por
administrador** (patrón on-premise estándar) porque el **reset self-service por correo es backend no
implementado** (endpoints + SMTP) y, por regla, requiere aprobación antes de codear. No se simula envío
de correo.
**Decisión de diseño MFA (estándar de industria):** el enrolamiento de MFA es **self-service del
usuario** (el secreto TOTP solo lo conoce su dispositivo); el administrador NO "activa" MFA por usuario
con un booleano, sino que define la **política de requerimiento** (deshabilitado/opcional/requerido,
idealmente por rol) y puede **resetear** el MFA de un usuario (dispositivo perdido). Ver NIST 800-63B y
OWASP ASVS v4 (§2). Pendiente de implementar (próxima sesión de auth).

### 2026-06-05 · Regla permanente: criterio y honestidad técnica
Se añadió a `CLAUDE.md` la regla de **no complacer a la primera**: contrastar mis propuestas con el
estándar de la industria y objetar con fundamento cuando convenga. Motivo: mejores decisiones de
producto/seguridad.

### 2026-06-05 · Fase 1 (UI): arquitectura del frontend de autenticación
Sesión enfocada **solo en Login + cimientos** (no las 3 pantallas a la vez), para cerrar por módulo según CLAUDE.md. Decisiones:
- **Access token en memoria** (`src/lib/session-token.ts`, módulo plano sin React, nunca en localStorage) + **refresh proactivo** ~30 s antes de expirar (`AuthProvider`). El refresh token va en cookie httpOnly; al arrancar la app se intenta un refresh silencioso para rehidratar la sesión.
- **Cliente HTTP central** (`src/lib/api-client.ts`): añade `Authorization: Bearer` + `credentials:"include"`; ante un **401 con token vigente** hace **un** refresh transparente (coalescido) y reintenta; si falla, marca la sesión como expirada. CSRF de doble envío (`wl_csrf` cookie → header `x-csrf-token`) en refresh/logout.
- **Estado de sesión** en Zustand (`auth-store.ts`): solo `status` + `SessionInfo` (usuario, permisos, scope), no el token.
- **Cliente de permisos** en paquete nuevo **`@lyra/permissions`** (TS puro: `can`/`canAll`/`canAny`/`createPermissionChecker`, tipado con `PermissionKey`). El hook React (`usePermissions`) y el componente `<Can>` viven en la web y lo consumen. La UI **solo oculta/deshabilita**; el backend decide.
- **Componentes premium** en **`@lyra/ui`** con **CSS Modules sobre tokens** (Button, Input, FormField, Card, Spinner, Toast). Área táctil 44px, dark-mode, Lucide.
**Motivo:** patrón resistente a XSS (token efímero en memoria) y a robo de refresh; límites de paquete limpios y reutilizables por el ecosistema Lyra; cumple "permisos nunca hardcodeados" reusando el catálogo de `@lyra/contracts`.

### 2026-06-05 · Fase 1: estrategia de tokens (access en memoria + refresh httpOnly rotativo)
Access JWT corto (15 min) por header `Authorization: Bearer`, guardado **en memoria** en el front. Refresh token opaco en cookie `httpOnly`/`Secure`/`SameSite=Strict`, del que solo se guarda el **hash SHA-256** en BD. **Rotación con familia y detección de reuso**: si un refresh ya rotado se reutiliza, se revoca toda la familia + sesión.
**Motivo:** resistente a XSS (el access no es robable desde JS persistente) y a robo de refresh (rotación + reuso ⇒ revocación). Patrón estándar de la industria.

### 2026-06-05 · Fase 1: CSRF de doble envío en endpoints con cookie
`refresh` y `logout` (que confían en la cookie) exigen un header `x-csrf-token` igual a una cookie CSRF **no httpOnly** que el SPA reenvía. Las llamadas normales usan Bearer (no vulnerables a CSRF).
**Motivo:** defensa en profundidad sobre `SameSite=Strict`.

### 2026-06-05 · Fase 1: catálogo de permisos como código, asignaciones como dato
Las **claves** de permiso (4D) viven en `@lyra/contracts` (las referencian los guards y las siembra el seed). La **asignación** rol→permiso y rol→usuario es 100% dato en BD, editable desde la UI.
**Motivo:** cumple "permisos nunca hardcodeados" sin perder el tipado/validación de las claves. Lo prohibido es hardcodear roles/reglas, no la existencia de las claves.

### 2026-06-05 · Fase 1: alcance de datos (Scope) con sujeto polimórfico
Tabla `Scope` con `userId?` **o** `roleId?` (check constraint que exige exactamente uno) + `orgNodeId` + `includeDescendants`. El alcance efectivo de un usuario = unión de sus scopes propios y los de sus roles, expandiendo descendientes vía la **ruta materializada** `OrgNode.path`.
**Motivo:** flexibilidad (alcance por usuario y por rol) sin multiplicar tablas; el `path` permite resolver descendientes en una sola query indexada.

### 2026-06-05 · Fase 1: AuditLog inmutable por trigger Postgres
Además de no exponer update/delete en la app, un trigger `BEFORE UPDATE OR DELETE` rechaza toda mutación de `AuditLog`.
**Motivo:** la inmutabilidad la garantiza la base, no solo la confianza en el código (requisito de auditoría).

### 2026-06-05 · Fase 1: MFA TOTP completo en backend; lockout en BD
Enrolamiento TOTP end-to-end (setup/verify/disable + recovery codes hasheados, secreto cifrado con `APP_ENC_KEY`). El **lockout por fuerza bruta** usa un contador persistente en `User` (`failedLoginCount`/`lockedUntil`), no Redis, que queda como acelerador opcional de caché.
**Motivo:** MFA listo de punta a punta para cuando llegue la UI; contador en BD = durable, testeable y sin depender de Redis on-prem.

### 2026-06-05 · Fase 1: ajustes de tooling (dotenv-cli, otplib v12, fastify directo)
Scripts Prisma cargan el `.env` raíz vía `dotenv-cli` (monorepo). `otplib` fijado a v12 (API `authenticator` síncrona; v13 es una reescritura async incompatible). `fastify` añadido como dependencia directa del API (los tipos no estaban expuestos por transitividad).
**Motivo:** que `pnpm db:migrate/seed` funcione sin fricción y evitar romper el código con una mayor de otplib.

### 2026-06-05 · Fase 0: andamiaje del monorepo
Se construye la base: pnpm workspaces, NestJS+Prisma+Postgres, React+Vite+Tailwind v4, Docker (dev/prod) + Caddy, tokens del Design System en `@lyra/ui`, contratos en `@lyra/contracts`, API con healthchecks.
**Motivo:** establecer cimientos correctos y verificables antes de la lógica de negocio.

### 2026-06-05 · Nombre del producto: **Lyra WatchLog**
Marca paraguas *Lyra*; producto *WatchLog* ("watch" = turno de guardia + vigilar; "log" = bitácora/registro). Codename interno *Sheliak* opcional.
**Motivo:** memorable y autoexplicativo en B2B industrial; "Sheliak" no convencía comercialmente.

### 2026-06-05 · Backend: NestJS + Prisma + PostgreSQL
**Motivo:** madurez, modularidad (seguridad/incidencias/orígenes), Guards para autorización en servidor, tipado fuerte, migraciones versionadas estándar. Se descarta Drizzle al no necesitar RLS (single-tenant).

### 2026-06-05 · Despliegue single-tenant on-premise (sin multi-tenant)
Un cliente = un stack Docker + su BD. Sin `tenant_id` ni RLS.
**Motivo:** cautela; evita la complejidad SaaS (cobros, infra). El modelo de datos se mantiene limpio por si se evalúa SaaS a futuro, pero no se construye ahora.

### 2026-06-05 · Autenticación enchufable (local + ranura OIDC/LDAP)
Auth local (Argon2id, refresh rotativo, lockout, MFA TOTP opcional) tras una abstracción; OIDC (Azure/Entra, Google…) y LDAP se activan por configuración por despliegue. Keycloak descartado para el MVP.
**Motivo:** clientes distintos tendrán necesidades distintas; la abstracción evita "casarse" con un método y no obliga a reescribir.

### 2026-06-05 · IA abstracta en el backend
Interfaz `LlmProvider` con implementaciones nube (Anthropic/OpenAI/Gemini/Deepseek) o local (Ollama/vLLM).
**Motivo:** agnóstico al proveedor; on-premise puede requerir modelo local. **Hallazgo del prototipo:** llamaba a la IA desde el frontend (fuga de API key) — se mueve al backend.

### 2026-06-05 · Monorepo con pnpm workspaces (sin Turborepo aún)
**Motivo:** simplicidad; se evaluará Turborepo cuando el repo crezca (varias apps del ecosistema).

### 2026-06-05 · Tailwind v4 cableado a los tokens Lyra
**Motivo:** el Design System es token-first; Tailwind v4 (`@theme`) mapea los tokens CSS sin duplicarlos.

## Recomendaciones registradas para incorporar (fase de endurecimiento u oportuna)
Mover IA/orígenes al backend (hecho como principio) · adjuntos/evidencias en MinIO · firma con validez probatoria (hash+timestamp) · respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) · healthchecks (hechos) · rate-limit + CSP/HSTS · exportación CSV/PDF · notificaciones SMTP (SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · **modo offline terreno (PWA) como fase posterior** · retención/borrado lógico · tests de lógica crítica desde Fase 1.
