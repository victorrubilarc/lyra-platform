# Backlog / Estado abierto — Lyra WatchLog

> **Registro único y autoritativo de todo lo que está ABIERTO.** Nada se cierra "de
> palabra": si está pendiente (por hacer, por probar, por publicar) vive aquí hasta
> que se complete. `PROGRESS.md` narra lo **hecho**; este archivo lista lo **abierto**.
>
> **Regla:** al cerrar cada sesión, revisa y actualiza este archivo (ver §0). Última
> actualización: **2026-07-03** — **👷 Dotación del permiso · DISEÑO + Slice 1 (MVP) ✅** (`feat/dotacion-permiso-s1`):
> personas propias/contratistas que ingresan a ejecutar + confirmación FIRMADA (Gobierno 2) por el aprobador. Diseño citado en
> `docs/design/DOTACION_DESIGN_ARCHITECTURE.md`. Entidades `Person`(≠User)/`ContractorCompany`/`RosterRole`(3 OSHA)/`WorkOrderWorker`
> + `WorkOrder.rosterConfirmedAt/ById` + `WorkOrderType.rosterEnabled` (migr. `20260703000000`). `confirmRoster`(firma Part 11)/
> `clearRosterConfirmation`(auto-limpieza)/`assertRosterConfirmed`(gate ANTES de checklists). Permisos `worker:manage` +
> `workorder:roster:manage` (104). Web: catálogo `/ordenes-trabajo/personas` + pestaña «Dotación» + toggle en el tipo. verde +
> roster.spec 8/8 + **smoke-dotacion 26/26** + regresión workorders 122/122 + incidencias 32/32. **ROADMAP dotación (abierto):**
> **S2** = competencias/certificaciones con vigencia + `WorkOrderCompetencyRule` (data-driven) + `PersonRestriction` (veto) +
> semáforo con causas ROJAS (ejes competencia/autorización) + gate/override firmado POR PERSONA + avisos de vencimiento (Bloque N,
> traza ISN 90 días). **S3** = acreditación de contratistas (gate por `accreditationStatus`/`accreditedUntil`). **S4** = integración
> control de acceso/T&A tras interfaz abstracta (on-prem). Pendiente: **smoke VISUAL (dueño)**. Antes:
> **🔧 OT · Sesión 6 · SLA, avisos de plazo, escalamiento y semáforos ("vigía digital") ✅**
> (`feat/ot-sla-semaforos`): ESPEJO de la Fase 4.4 de Incidencias. **SIN migración** (columnas SLA del `WorkOrderType`,
> `WorkOrder.dueAt`, `WorkActivity.baselineEnd/plannedEnd` YA latentes) y **SIN permiso nuevo** (avisos no gatean; SLA del tipo =
> `workordercatalog:manage`, plazo = `workorder:edit`; 102 sin cambio, sin FLUSHALL). **3 eventos** `workorder.overdue` (plazo
> `dueAt`, escala), `workorder.stalled` (permanencia `maxStayMinutes`), `workorder.activity.overdue` (fin baseline/planificado);
> descarté `sla.breached` (redundante con overdue). **`dueAt` se ancla AL APROBAR** (override manual gana) + `DUE_CHANGED`.
> Helpers puros `work-orders/sla.ts` (+ semáforo `workOrderTrafficLight`, ventana `AT_RISK_WINDOW_MINUTES`=48 h); `WorkOrderSlaService.findBreaches()`
> barrido en `NotificationWorkerService.sweep()` + resolvers (owner + roles del estado + escalamiento, ABAC). Grilla: columna
> semáforo + chip "Estancada" + KPIs Vencidas/Por vencer/Estancadas + filtro `slaStatus`; Object Page: chip + plazo editable;
> `WorkOrderTypeModal` gana los campos SLA. Seed: 3 plantillas de notificación. verde + contracts **448** + `smoke-workorders.py`
> **122/122** + regresión incidencias **32/32** + notif-inapp **18/18** + notif-avanzadas **22/22** (el base `smoke-notificaciones.py`
> 13/18 = 5 fallos de correo/SMTP desactivado en dev, preexistentes/ajenos a S6). Pendiente: smoke VISUAL (dueño). **Siguiente =
> OT S7 (Dashboard de OT + Incidencia→OT).** Antes: **🔧 OT · Sesión 5b · Slice B · Checklists de EJECUCIÓN por actividad + Gobierno 2 ✅ → COMPLETA el §11**
> (`feat/ot-ejecucion-gobierno2`): `WorkOrderChecklist.workActivityId` (→ `WorkActivity` SetNull; unique
> `(workOrderId, templateId, workActivityId)` — NULL distinto ⇒ anti-duplicado de nivel-OT por código) + `WorkOrder.executionSetConfirmedAt/ById`
> (migr. aditiva `20260702220000`). El **set de EJECUCIÓN** se materializa por actividad al PREPARAR (una fila por actividad ×
> regla EXECUTION que matchee **por especialidad de la actividad**, `applicableExecutionRulesForActivity`; orquestador
> `materializeForState`). **Gobierno 2:** `confirmExecutionSet` + **gate al autorizar** `assertExecutionSetConfirmed` + auto-limpieza
> al curar; **gate por actividad** `assertActivityExecutionComplete` (no DONE sin verificación obligatoria aprobada) + backstop al
> cierre. Web: «Verificaciones» grupo EJECUCIÓN sub-agrupado por actividad + banner/botón «Confirmar set de ejecución» +
> indicador en «Plan». **Sin permiso nuevo** (reusa `workorder:checklist:manage`, sin FLUSHALL) + seed (plantilla/regla de
> EJECUCIÓN). verde + contracts **433** + `smoke-workorders.py` **108/108** + regresión incidencias **32/32**. Pendiente: smoke
> VISUAL (dueño). Antes: **🔧 OT · Sesión 5b · Slice A · Eje `momento` de checklists + checklist de CIERRE ✅**
> (`feat/ot-checklists-momento`): eje **`momento`** (REQUEST/PLANNING/AUTHORIZATION/EXECUTION/CLOSURE) como DATO en
> `WorkOrderChecklistRule` y `WorkOrderChecklist` (default AUTHORIZATION ⇒ retrocompatible; migr. aditiva
> `20260702210000`) + `WorkOrderType.closureChecklistSuggestStateKey` (data-driven); materialización y guard **por momento**
> (AUTHORIZATION = S3 intacto; **CLOSURE per-OT**: sugerido al entrar a `en_revision_cierre`, BLOQUEA el cierre si obligatorio
> sin aprobar) + helper puro `blockingChecklistsForMoment`. Web: Combobox «Momento» en el editor de la regla + pestaña
> «Verificaciones» AGRUPADA por momento + columna «Momento» en el catálogo. **Sin permiso nuevo** (reusa
> `workorder:checklist:manage`, sin FLUSHALL) + seed (plantilla/regla de CIERRE). verde + `smoke-workorders.py` **95/95** +
> regresión incidencias 32/32. **Movido a S5b Slice B:** checklists de EJECUCIÓN por actividad
> (`WorkOrderChecklist.workActivityId`, guard por actividad) + **Gobierno 2** (confirmación del set de ejecución en la
> autorización, `executionSetConfirmedAt`). Antes (2026-07-02): **🔧 OT · Sesión 5a · PUERTA 4 (seguimiento vivo del avance + cierre) ✅ → CIERRA EL MVP
> Solicitud→Cierre** (`feat/ot-seguimiento-cierre`): entidad NUEVA **`WorkActivityUpdate`** (avance append-only, migr.
> `20260702200000`) + `WorkActivitiesService.recordProgress`/`listUpdates` (foto vigente denormalizada + evento
> `ACTIVITY_PROGRESS`/`_DONE`/`_BLOCKED` + `assertProgressable` = plan congelado + OT abierta) + helpers puros
> `effectiveProgressPct`/`activityDeviationLabel`; **cierre** ya cableado en S4 (guards + firma Part 11 + `closureSummary`),
> S5a lo VERIFICA punta a punta con bloqueos EXPLICADOS; **reusa `workorder:activity:manage`** (sin permiso nuevo). Web:
> pestaña «Plan» viva en ejecución (columna Avance + modal «Registrar avance» + historial expandible). verde + contracts
> **427** + API 252 + web 6 + `smoke-workorders.py` **90/90** + regresión incidencias **32/32**. **Diferido a S5b:** eje
> `momento`, checklists de EJECUCIÓN/CIERRE, Gobierno 2. Antes (2026-07-02): **🔧 OT · Sesión 4 · PUERTA 3 (plan de actividades + congelar baseline) + reorden del
> flujo ✅** (`feat/ot-puerta3`): fase Planificación viva — **`WorkActivity`** (entidad propia, fork W1), `autorizar_plan`
> exige ≥1 actividad + **congela baseline** + `PLAN_FROZEN` + plan inmutable; guards puros `planNotFrozen`/
> `blockingActivitiesForClose`/`planReadyToFreeze`; permiso **`workorder:activity:manage`** (cat. 102); claves data-driven
> `planFreezeStateKey`/`executeStateKey`; **flujo REORDENADO al estándar** (planificar→autorizar permiso→ejecutar, §11.3;
> seed republica v2, OT en curso intactas); pestaña "Plan" con **grilla + asistente guiado** (`Stepper`). contracts **421**
> + `smoke-workorders.py` **78/78** + regresión incidencias 32/32. **Movido a S5:** eje `momento`, checklists de EJECUCIÓN/
> CIERRE, Gobierno 2. Antes (2026-07-02): **🔧 OT · Sesión 3 · PUERTA 2 (checklists / PTW) ✅** (`feat/ot-puerta2`): 2 capas
> (fork W5) sobre el Form Builder — **`WorkOrderChecklistRule`** (plantilla + reglas de aplicabilidad, gate
> `workordercatalog:manage`) + **`WorkOrderChecklist`** (enlace OT↔plantilla + `LogEntry` vivo + estado; permiso NUEVO
> **`workorder:checklist:manage`**). Al preparar la OT el ejecutor **SUGIERE** los aplicables (idempotente) + agregado
> manual; cada checklist se instancia como **`LogEntry`** (se llena/sella con el Form Builder); **guard Puerta 2**
> (`assertChecklistsComplete`/`blockingChecklistsForClose` PURO) bloquea `revisar_checklists` con obligatorio no APROBADO;
> **segregación revisor ≠ responsable**. Claves de estado data-driven en `WorkOrderType` (`checklistSuggestStateKey`/
> `checklistGateStateKey`). Migración `20260702120000`. Seed: plantilla LOTO + regla obligatoria. Web: pestaña "Checklists"
> en el drawer + sub-tab "Reglas de checklist" en catálogos. verde + contracts **412** + `smoke-workorders.py` **65/65** +
> regresión incidencias 32/32. **✅ FIX mismo día (`fix/ot-folio-global`): folio de OT = serie ÚNICA GLOBAL** (corrige la
> colisión entre tipos que daba Internal Error al aprobar; default scope `type`→`global` + reconciliación de contador; ver
> §2). **DEUDA:** editor UI de `folioScheme`/claves de estado. *(`Template.purpose` W5 = ✅ hecho 2026-07-02.)* **Siguiente: OT Sesión 5
> (Puerta 4 — seguimiento vivo + cierre; incluye lo movido de S4: eje `momento`, checklists de EJECUCIÓN/CIERRE, Gobierno 2).**
> Antes (2026-07-01): **🔧 OT · Sesión 2 · PUERTA 1 ✅** (`feat/ot-puerta1`): workflow CONGELADO al crear
> (flujo sembrado **"OT — 4 puertas PTW"** como DATO; la solicitud nace `borrador`/DRAFT) + ejecutor de transiciones
> espejo de Incidencias (permiso NUEVO **`workorder:transition`** dim. WORKFLOW, rol-dato, **firma Part 11**
> re-autenticada) + **`FolioCounter` gapless** (atómico `ON CONFLICT…RETURNING` dentro de la tx; folio **SOLO al
> aprobar** = entrar a `folioOnStateKey`; default por-tipo+anual ⇒ **OT-2026-0001**; formateo puro en contracts
> `folio.ts`) + rechazo con motivo OBLIGATORIO (final sin aprobación ⇒ CANCELED) + satélites
> `WorkOrderTransition`/`WorkOrderEvent` (timeline) + web (stepper, botones, modal de firma, timeline, folio/estado en
> grilla). verde (contracts **403** · API 252 · web 6) + `smoke-workorders.py` **51/51** + regresión incidencias 32/32.
> **DEUDA nueva:** editor UI de `folioScheme` (hoy API-only). **Siguiente: OT Sesión 3 (Puerta 2 — checklists con Form
> Builder).** Antes (mismo día): **🔧 OT · Sesión 1 · CIMIENTOS ✅** (`feat/ot-cimientos`): `WorkOrder`+`WorkOrderType`+
> `Area`/`Specialty` (N:N), 8 permisos grupo `workorders`, backend CRUD+ABAC, web `/ordenes-trabajo` (grilla+wizard),
> seed de arranque; folio/workflow INERTES (S2). **+ Anexo post-S1 ✅** (`feat/ot-catalogos`): mantenedor de catálogos
> `/ordenes-trabajo/catalogos` + seed realista CMMS/EAM. **+ Ajuste ✅** (`feat/ot-quitar-area`): se **ELIMINÓ el catálogo
> `Area`** (duplicaba la jerarquía de ubicación; los EAM líderes usan el `OrgNode`/Functional Location para eso). Modelo
> final: **ubicación=nodo · disciplina=`Specialty` · tipo=`WorkOrderType`**. *Planner Group/Work Group* diferido a S6–S8.
> **+ Responsive** grillas OT+Incidencias (tablet/móvil). verde + `smoke-workorders.py` **32/32**. **DEUDA que queda:**
> SavedView de OT (+ Incidencias) = slice transversal pendiente. **Siguiente: OT Sesión 2 (Puerta 1 + `FolioCounter`).** Antes (2026-07-01, SIN código): **📋 ROADMAP MÓDULO ÓRDENES DE TRABAJO
> (OT / PTW) registrado** en §2 (épico nuevo, 8 sesiones S0–S8, ~397 HH; oportunidad real de cliente minero;
> **entitlements de módulo DIFERIDOS** al épico de licenciamiento §2(1)). Ver DECISIONS 2026-07-01 y memoria
> `work-orders-module-plan`.
> Última sesión de CÓDIGO: **2026-06-24** (**🎨 TEMAS FASE 2A · Plantillas de inicio + Duplicar ✅** —
> `feat/temas-plantillas`: catálogo CURADO de **10 plantillas de arranque** (constantes en `@lyra/contracts`
> `theme/presets.ts`: Grafito/Cobre/Acero/Medianoche/Bosque/Solar/Índigo/Cobalto/Magma/Salitre; prístinas, NO BD, NO
> publicables, usuario final no las ve) + botón **«Desde plantilla»** (modal `TemplatePicker`) y **«Duplicar»** que CLONAN
> tokens en una paleta NUEVA editable (borrador) → se ajusta y publica con el flujo EST-TEMAS existente. Clonar/duplicar =
> **clonado en CLIENTE** (POST existente, reusa validación). **TODAS pasan WCAG AA claro+oscuro** (test nuevo
> `presets.spec.ts`). Solo tocan superficies/texto/2 acentos (bordes/funcionales/severidad = marca base). **Sin backend,
> sin migración, sin permiso nuevo** (reusa `theme:manage`). typecheck/lint(0)/build/test (392 contracts) verdes ·
> `smoke-temas-plantillas.py` **11/11**. **PENDIENTE: smoke VISUAL del dueño.** **Siguiente: Fase 2B (generador desde
> colores de marca, OKLCH); luego 2C (import DTCG/hex).** Anterior: **🎨 EST-TEMAS · Sistema de TEMAS / PALETAS
> administrable (MVP) ✅** —
> `feat/tema-paletas`: un admin construye paletas de marca (claro+oscuro) como **override PARCIAL de 18 tokens curados**
> sobre el sistema de tokens (NO fork), con **vista previa en vivo** + **contraste WCAG**, las publica (flag) y marca una
> por defecto; los usuarios eligen entre las publicadas (preferencia **portable** `User.themePaletteId`), aplicación
> instantánea. Backend `ThemePalette`+`SystemSettings.defaultPaletteId`+permiso **`theme:manage`** (cat. 91)+auditoría;
> capa de override scopeada a `[data-wl-themed]` ⇒ **login intacto** (marca oscura). Severidad PROTEGIDA; gradiente
> derivado de acentos. **Reemplaza la deuda de branding por licenciatario de Fase 7** (build-args VITE_ → runtime).
> typecheck/lint(0)/build/test (349+252) verdes · `smoke-tema-paletas.py` **23/23**. **PENDIENTE: smoke VISUAL del dueño.**
> **Fase 2 (futuro):** semilla 1-color→rampas, import/export, logo. **Siguiente: lo que el dueño defina (L4 u otro).**
> Anterior: **🎨 EST-FIX-ALTO · Paneles maestro-detalle llenan el alto del viewport ✅** —
> `fix/layout-altura-paneles`: el split «lista | detalle» quedaba a media pantalla con vacío debajo. Causa: cadena de
> altura flex rota (`ResizableSplit` no crecía en un flex-column) + alturas por-página inconsistentes (calc frágil que
> ignoraba la barra de pestañas / sin altura). Fix DRY en 2 lugares compartidos: contenedor de `ResizableSplit` pasa a
> `flex:1 1 auto; min-height:0` y nueva variante de shell `data-fill-height="pad"` (llena el alto conservando el padding);
> las 4 páginas afectadas solo marcan el atributo y se borra el `height: calc()` frágil de calendarios. Logbook
> (`data-fill-height` a sangre) y UsersPage (ya llenaba) intactos. Solo CSS/contenedores, tokens, sin librerías nuevas.
> typecheck/lint(0)/build/test (252+6) verdes. **PENDIENTE: smoke VISUAL del dueño.** **Siguiente: Sistema de temas /
> paletas (EST-TEMAS).** Anterior:
> **🔒 L1c · Coherencia de la estructura activa al CREAR ✅** — `feat/estructura-creacion-coherente`:
> cierra la última grieta del aislamiento por estructura. Hasta L1b los LISTADOS filtraban por la estructura activa
> (`?structureId=`) pero el flujo de **«Nueva entrada»** la ignoraba: un usuario con alcance en DOS estructuras (A y B),
> «en A», veía/elegía plantillas y nodos de **B** (no era fuga — el ABAC seguía siendo la frontera — pero rompía la
> promesa de la estructura activa). **Backend:** `TemplatesService.list` y `eligibleNodesForTemplate` aceptan `structureId`
> opcional intersectado **ADITIVO al ABAC** vía `orgNode.structureId` (espejo de L1b): plantilla CON asignación aparece si
> **≥1 nodo vive en la estructura activa**; plantilla **GLOBAL siempre aparece** (decisión (a)); nodos elegibles acotados a
> la estructura ∩ ABAC; endpoints `GET /log-entries/templates` y `/templates/:id/nodes` reciben `@Query('structureId')`.
> **Web:** `useAvailableTemplates` + `fetch*` + `NewEntryPage`/`ScheduleDrawer` cablean `useActiveStructureId()` (queryKey
> incluida) ⇒ coherencia extendida también a la **programación de rondas**. **UX/coherencia, NO hard-block** (`create()` ya
> valida nodo por ABAC + asignación); **by-id/deep-links intactos**; **«Nueva incidencia» NO se tocó** (ya usaba
> `useAccessibleOrgTree` con `?structureId=`); **catálogos COMPARTIDOS intactos**. **Sin migración/permiso/FLUSHALL.**
> typecheck/lint(0)/build/test (252+6) verdes · `smoke-estructura-creacion-coherente.py` **16/16** (dual A+B separa por
> estructura · global siempre visible · tplA bajo structureId=B vacío · **frontera ABAC** acotado a A nunca ve B) +
> regresión aislamiento 33/33 · multi-estructura 33/33 · template-scope 14/14 · asistente L3b 15/15 · ux-premium L3 18/18 ·
> grid 25/25. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L4 ni panorama multi-módulo. **Siguiente: panorama
> multi-módulo, L4 u otro.** Anterior:
> **🎯 L3b · Asistente «crear una nueva área» ✅** — `feat/estructura-asistente-area`:
> un **wizard de 3 pasos** (identidad → niveles base → primer nodo raíz) que aprovisiona una estructura organizacional
> COMPLETA y operativa de una sola vez, lanzado desde el `StructuresDrawer` con el botón **«Nueva área»** (que REEMPLAZA
> al "Nueva estructura" simple). **Backend ATÓMICO** `POST /structure/structures/provision`
> (`StructureService.provisionStructure`): estructura + niveles + nodo raíz en **una sola `prisma.$transaction`** ⇒ o el
> área queda operable (≥1 nodo) o no se crea nada (sin huérfanas). **Sin migración, sin permiso nuevo** (reusa
> `module:structure:manage` = super-admin; el servicio re-autoriza) ⇒ **sin `db:seed`/FLUSHALL**. UI: componente `Stepper`
> nuevo en `packages/ui` + subcomponente `StructureIdentityFields` extraído del `StructuresDrawer` (reusa el editor de
> identidad L3 sin duplicar; CSS movido a `StructureIdentityFields.module.css`); 3 plantillas de niveles (Minería/
> Manufactura/TI) + manual; al terminar fija la estructura activa + navega a `/estructura`. **CIERRA la deuda L3b.**
> typecheck/lint(0)/build/test (252+6) verdes · smoke `smoke-estructura-asistente.py` **15/15** (área operable +
> atomicidad sin huérfana + 403 sin super-admin) + regresión ux-premium 18/18 · admin-delegada 29/29 · ciclo-vida 17/17 ·
> rol-alcance 14/14 · aislamiento L1 33/33 · multi-estructura 33/33 · template-scope 14/14. **PENDIENTE: smoke VISUAL del
> dueño.** **NO** se hizo L4 ni el panorama multi-módulo. **Siguiente: L4 (jerarquías alternativas) o el panorama
> multi-módulo.** Anterior:
> **🎯 L3 · UX premium cross-estructura ✅** — `feat/estructura-ux-premium`:
> tres piezas (el asistente "crear área" se DIFIRIÓ a **L3b**). **(1) Identidad inconfundible:** columnas aditivas
> `OrgStructure.color`/`icon` (migración `20260624130000_add_structure_identity`, nullable, cero pérdida) — el color es
> una **clave de paleta curada** (8 acentos Lyra) y el ícono una **lista blanca Lucide**, con **fallback determinístico**
> por `key` (hash FNV-1a) cuando faltan. Badge **"Estás en: X"** SIEMPRE visible en el topbar (acento sutil) que ES el
> disparador del switcher; editor de color/ícono con vista previa en el `StructuresDrawer`. Tokens nuevos `--accent-<clave>`
> + `--structure-accent` (claro/oscuro, sin hex en componentes; Recharts usa `var()`). **(2) Vista ejecutiva «Panorama»:**
> ruta `/panorama` (sidebar SOLO con el permiso) que CONSOLIDA KPIs de incidencias (abiertas/críticas/vencidas/SLA) de
> **todas** las estructuras accesibles a la vez — endpoint `GET /incidents/dashboard/cross` + `IncidentDashboardService.buildCross`.
> **Excepción explícita al aislamiento L1** (cruza la estructura activa) pero **el ABAC por nodo sigue siendo la frontera**:
> un gerente sin alcance ve todas; uno acotado, solo sus nodos/estructuras. Tarjetas con identidad + drill-down (fija la
> estructura activa y entra a Incidencias) + barra comparativa Recharts (tokens). **(3) Switcher pulido:** búsqueda +
> identidad por fila + a11y. **Permiso NUEVO `module:dashboard:cross-view`** (catálogo 89→90 ⇒ `db:seed` + Redis FLUSHALL
> hechos). contracts/API/web typecheck/lint(0)/build/test (252+6) verdes · smoke `smoke-estructura-ux-premium.py` **18/18**
> (identidad en payload, consolida ≥2 estructuras para gerente sin scope, ABAC frontera con usuario acotado, gate 403) +
> regresión admin-delegada 29/29 · ciclo-vida 17/17 · multi-estructura 33/33 · aislamiento L1 33/33 · rol-alcance 14/14 ·
> template-scope 14/14. **PENDIENTE: smoke VISUAL del dueño.** **DEUDA:** L3b asistente "crear área"; panorama multi-módulo
> (hoy solo incidencias). **NO** se hizo L4. **Siguiente: L3b (asistente) o L4 cuando el negocio lo pida.** Anterior:
> **🎯 L2c · Ciclo de vida de la estructura organizacional ✅** —
> `feat/estructura-ciclo-vida`: ARCHIVAR / REACTIVAR y REORDENAR estructuras sin borrar datos, desde el
> `StructuresDrawer`. **Cierra la deuda (a) y (c)** de multi-estructura. El modelo ya existía (`OrgStructure.active`/
> `reportOrder`/`deletedAt`) ⇒ **SIN migración**. Backend: endpoint atómico `PUT /structure/structures/reorder`
> (lista ordenada de ids → `reportOrder`, auditado) + guarda "no archivar la última activa" (la por defecto ya estaba
> protegida). Front: acciones **Archivar/Reactivar de primer nivel** por fila + **flechas ↑/↓** (la por defecto va fija
> arriba) + toggle **"ver archivadas"** (la gestión las oculta por defecto; el selector global YA las ocultaba vía
> `isOperable` y YA saneaba el fallback al archivar la activa). Editor simplificado a identidad (nombre/clave/desc):
> estado y orden se gobiernan desde la lista. **Paridad L1**: una archivada (`active:false`, `deletedAt:null`) sigue
> legible por id/deep-link (`resolveStructureId` solo filtra `deletedAt`). **Permiso reusado `orglevel:manage`** ⇒ sin
> clave nueva, sin FLUSHALL. contracts 321 · API 252 · web 6 · smoke `smoke-estructura-ciclo-vida.py` **17/17** +
> regresión multi-estructura 33/33 · aislamiento L1 33/33 · rol-alcance L2a 14/14 · template-scope 14/14.
> typecheck/lint(0)/build verdes. **PENDIENTE: smoke VISUAL del dueño.** **(c) purga GxP destructiva** queda fuera por
> diseño (la respuesta no-destructiva es archivar). **NO** se hizo L2b/L3/L4. **Siguiente: L2b (administración delegada
> por estructura) o lo que defina el dueño.** Anterior:
> **🎯 L2a · Alcance por NODO a nivel de ROL ✅** — `feat/rol-alcance-nodo`:
> cierra el requerimiento `role-node-scope-requirement`. El alcance ABAC por nodo ahora se configura también en el
> **ROL** (no solo por usuario), una sola vez por rol, aplicando a todos sus miembros. Conviven ambos ejes de
> sujeto (rol Y usuario), combinados por **UNIÓN** (gana el más amplio). **Sin migración** (`Scope.roleId` ya
> existía) y **sin clave nueva** (endpoint `PUT /security/roles/:id/scope` reusa `role:manage` ⇒ sin `db:seed`/
> FLUSHALL). Backend `RolesService.assignScope` = espejo de `UsersService.assignScope` con `roleId`; `RoleDetail
> += scopes[]`. Front: pestaña "Alcance" del rol = 2 sub-secciones ("por nodo" reusa `ScopeTreePicker`, "por
> plantilla" lo previo). Quitar el rol re-acota EN VIVO (`ScopeService.getAccessibleNodes` ya unía user+roles en
> read-time; verificado, no denormaliza). `smoke-rol-alcance-nodo.py` **14/14** + regresión L1 33/33 ·
> template-scope 14/14 · multi-estructura 33/33 + unit API 252/web 6. typecheck/lint(0)/build verdes. **PENDIENTE:
> smoke VISUAL del dueño.** **NO** se hizo L2b/L2c/L3/L4. **Siguiente: L2c (ciclo de vida de estructura) o L2b
> (administración delegada).** Anterior:
> **🔒 AISLAMIENTO COMPLETO por estructura (Enterprise L1) ✅** — `feat/aislamiento-estructura`:
> cierra la deuda `org-views-vs-isolation`. Ningún usuario/estructura ve datos operacionales de otra en NINGÚN listado.
> **L1a:** cerradas las 2 fugas reales de ABAC en equipos (`search` sin scope, `listByNode` sin validar nodo → 403).
> **L1b:** filtro por estructura activa (`?structureId=`, espejo de calendarios, sin tocar contratos Zod) intersectado
> en AND con el ABAC por nodo en **incidencias** (list/stats/dashboard), **bitácoras** (list/stats/facets/export CSV),
> **excepciones**, **rondas/mis-rondas**, **cambio de turno**; front cablea `useActiveStructureId()` en cada hook.
> **by-id y descargas puntuales = SOLO ABAC** (no se filtran por estructura, para no romper deep-links). Notificaciones
> sin cambio (ownership). Catálogos COMPARTIDOS intactos. `smoke-aislamiento-estructura.py` **33/33** + unit 252 +
> regresión incidencias 32 · grid 25 · mis-rondas 18 · cambio-turno 29 · excepciones 39 · dashboard 24. typecheck/
> lint(0)/build verdes. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L2/L3/L4 (siguiente). Anterior:
> **💾 Backup de Postgres pre-deploy + cron ✅** — commit `6130774`, OPS sin features:
> cierra la última pendiente del blindaje de deploys (§3 #4) ⇒ **blindaje COMPLETO (#1–#4)**. `deploy/onprem/backup.sh`
> (`pg_dump -Fc`, retención 14d/piso 10, `.tmp`+`mv`-atómico) llamado por `backup()` en `update.sh` ANTES de migrar,
> **BLOQUEA por defecto** (`migrate deploy` es forward-only; el rollback no revierte el esquema). Cron diario 03:30 en el
> host. Verificado en vivo: dump 286 KB CUSTOM · restauración schema-only = 74 tablas · rotación al piso de 10. Ver §3.
> Anterior: **Multi-estructura organizacional ✅** — `feat/multi-estructura-org`: una
> instalación single-tenant puede definir VARIAS estructuras en paralelo (cada una con su set de niveles y su
> árbol). Nueva `OrgStructure` + `structureId` en `OrgLevel`/`OrgNode`/calendarios; `@@unique([order])`→
> `@@unique([structureId, order])`; default de calendarios POR ESTRUCTURA. Migración aditiva
> `20260623120000_add_org_structure` con **"Estructura por defecto"** que absorbe lo legado (cero pérdida
> verificada). Aislamiento estricto + selector global por usuario + ABAC; catálogos COMPARTIDOS. Permiso
> reusado `orglevel:manage`. contracts 321 · API 249 · web verde · smoke `smoke-multi-estructura.py` **33/33** +
> regresión incidencias 32 · cambio-turno 29 · sla 25. **PENDIENTE: smoke VISUAL del dueño.** **Deuda nueva:**
> (a) ~~`StructuresDrawer` no permite (des)activar ni reordenar estructuras~~ ✅ RESUELTO 2026-06-24 (L2c,
> `feat/estructura-ciclo-vida`: archivar/reactivar + flechas ↑/↓ + ver archivadas) ·
> (b) ~~un admin ACOTADO no ve una estructura recién creada hasta que tenga un nodo accesible (se deriva del
> ABAC por nodo)~~ ✅ RESUELTO 2026-06-24 (L2b, `feat/estructura-admin-delegada`): la administración por estructura
> deja de derivarse de nodos (tabla `StructureAdmin`); un delegado VE y arma su estructura aunque no tenga nodos
> (`listStructures` = accesibles-por-nodo ∪ administrables-por-delegación) · (c) ~~purgar una estructura con historial de nodos no es posible~~ RESUELTO POR DISEÑO 2026-06-24
> (L2c): la respuesta no-destructiva es ARCHIVAR (conserva el historial, sale del selector/listados, sigue legible por
> id); la purga GxP destructiva queda fuera de alcance a propósito · (d) el `deleteLevel` da 500 si un nodo SOFT-deleted aún
> referencia el nivel (bug latente preexistente; mitigado en estructuras por la cascada). **Dependencia:**
> "rol acotado a nodo" (`Scope.roleId` en UI) ✅ RESUELTO 2026-06-24 (L2a, `feat/rol-alcance-nodo`).
> **+ Indicador de versión ✅** (mismo día): «Acerca de» en el menú de perfil con versión + fecha de compilación +
> commit (Vite `define`; en prod los inyecta el release vía Docker build-args desde el tag git). **DEUDA (pedido del
> dueño):** mostrar la versión en un lugar MÁS A LA VISTA — un pie en el login y/o junto al logo del sidebar — además
> del «Acerca de».
> Anterior: **Fase 5 · Cambio de turno · Slice 4 — EXPORT PDF del acta de entrega ✅ → FASE 5 COMPLETA** —
> `feat/cambio-turno-acta-pdf`: desde una entrega FIRMADA se descarga un **acta PDF de grado auditoría** (identidad Lyra, snapshot
> congelado, dos firmas Part 11, folio + hash verificable), generada en el backend, on-prem, sin SaaS. Motor **pdfmake** (NO Chromium;
> Sora/Inter embebidas como TTF OFL); builder PURO `buildActaDocument` desde el snapshot; endpoint `GET /shift-handover/:id/acta.pdf`
> (`@Res`, gate de lectura reusado, **ABAC**, **409** en COMPILING, auditoría `shifthandover.acta.exported`); **hash SHA-256 de JSON
> canónico** del snapshot+firmas (determinista, sin persistir, sin migración); botón en cockpit/historial vía `apiBlob`. Sin permiso
> nuevo, sin migración, sin FLUSHALL. api 247 · web 3 · smoke `smoke-acta-pdf.py` **17/17** + regresión cambio-turno 29/29 · ia-config
> 20/20 · ia-stream 13/13 · notif 18/18 · notif-inapp 18/18. **PENDIENTE: smoke VISUAL del dueño.** **Deuda:** persistir artefacto en
> MinIO si la carpeta regulatoria lo exige · verificador público de hash · usar `integrityHash` como payloadHash de la firma Part 11.
> **Con el Slice 4 la FASE 5 queda COMPLETA → siguiente: Fase 6 o lo que defina el dueño.** Anterior:
> **Fase 5 · Cambio de turno · Slice 3 — resumen de turno por IA EN VIVO / streaming ✅** —
> `feat/cambio-turno-resumen-ia-streaming`: "Generar con IA" escribe el brief token a token sobre el cockpit (SSE espejo del inbox,
> endpoint dedicado `GET /shift-handover/:id/summary/stream`). `@lyra/llm` ganó `LlmStream`+`generateSummaryStream` en los 3 adapters;
> **prompt v2** (guarda anti-inyección); **scrubber de PII** que redacta solo si la generación egresa de la planta (`egressesPlant`).
> Persiste al completar por el PATCH auditado (`summaryProvider`); degradación stream→no-stream→determinista; crudo y firma humana intactos.
> @lyra/llm 11 · contracts 321 · API 247; smoke-ia-stream **13/13** + regresión ia-config 20/20 · cambio-turno 29/29 · notif 18/18 · notif-inapp 18/18.
> **PENDIENTE: smoke VISUAL del dueño.** **Siguiente: Slice 4 (export PDF).** Anterior:
> **Cambio de turno — fix deep link "se queda pensando" ✅** — `feat/cambio-turno-deeplink-fix`:
> al abrir desde la campanita la pestaña quedaba en spinner infinito. La API/datos/permisos eran correctos (200); el problema era resiliencia de
> UI (`CockpitView` solo miraba `isLoading||!detail`). Fixes: error+Reintentar en `CockpitView` (nunca spinner infinito) · `useHandoverDetail`
> `retry:1` · **`GET /shift-handover/:id` → `RequireAnyPermission(view,compile,sign,acknowledge)`** (el entrante a menudo solo tiene acknowledge) ·
> roles demo `supervisor`/`jefe` ganan los permisos `shifthandover:*` (el seed era anterior a Fase 5; aplicado en vivo + FLUSHALL) · smoke
> `pick_nodes` prefiere nodo sin entregas previas (aísla la baton). smoke-cambio-turno **29/29**; typecheck/lint(0)/build verdes. **PENDIENTE: smoke
> VISUAL del dueño.** **Siguiente: Slice 3 (streaming).** Anterior:
> **Cambio de turno — UX ronda 2 ✅** — `feat/cambio-turno-ux-fixes`:
> el detalle de una incidencia en el cockpit ahora **reutiliza el `IncidentDetailDrawer` REAL del módulo** (mismo panel/pestañas/acciones, en
> contexto) en vez de un panel propio liviano + deep-link que perdía al usuario; aplica a incidencias, acciones/reportes (incidencia padre),
> excepciones con incidencia y pendientes `refType=Incident` (gated `incident:view`). **Persistencia:** volver a la pestaña ya no la vacía
> (`sessionStorage` de entrega/nodo). **Panel derecho** más ancho por defecto (468, acotado 380–560). **CTA de firma** deja de ser de ancho
> completo → tarjeta de acción centrada con botón a escala. Solo frontend. typecheck/lint(0)/build verdes. **PENDIENTE: smoke VISUAL del dueño.**
> **Siguiente: Slice 3 (streaming).** Anterior:
> **Cambio de turno — retoques UX del cockpit ✅** — `feat/cambio-turno-ux`:
> paneles del cockpit **redimensionables** (grid con `--nav-w`/`--aside-w` + 2 divisores `ColHandle`, doble-clic reset, persistido; centro flexible;
> se descartó `ResizableSplit` del DS por su chrome de card 2-panel + overflow que rompe el sticky de los paneles). Narrativa del resumen **ampliable**
> (textarea 7→10 + botón "Ampliar" → Modal xl con el crudo lado a lado). Ítems centrales y pendientes **clicables → `Drawer` de detalle** (todos los
> campos + deep link "Abrir en Incidencias/Mis rondas"). Solo frontend; reusa `Modal`/`Drawer`. typecheck/lint(0)/build verdes. **PENDIENTE: smoke
> VISUAL del dueño.** **Siguiente: Slice 3 (streaming del resumen).** Anterior:
> **Fase 5 — Cambio de turno · Slice 2: IA ADMINISTRABLE ✅** — `feat/ia-administrable`:
> la IA pasa de `.env` a **módulo administrable** (tab "Inteligencia Artificial" en `/configuracion`, permiso **`ai:config`**, cat. 88→89): proveedor
> ninguno/Anthropic/local, clave **cifrada + write-only** (`AiSettings.apiKeyEnc`), botón **Probar** real, todo sin reiniciar. Fundación **`@lyra/llm`**
> (interfaz `LlmProvider` + adapters none/anthropic/openai-compatible + prompt versionado, decoplado de contracts ⇒ reusable Fase 6). Gateway `AiService`
> con **degradación elegante** a determinista + **`AiGenerationLog`** (gobernanza de costo). Primer consumidor: **resumen de turno por IA grounded**
> (etiqueta "generado por IA · revisar", crudo determinista visible, firma humana). Bugfix latente Slice 1 (`updateSummary` con `nodeName=""`). Migración
> aditiva `…_add_ai_admin`. contracts 321 · API 247 · `@lyra/llm` 6 · smoke `smoke-ia-config.py` **20/20** (servidor OpenAI-compatible FALSO) + regresión
> cambio-turno 29/29 · notificaciones 18/18. **PENDIENTE: smoke VISUAL del dueño.** **Deuda:** streaming del resumen (Slice 3) · export PDF (Slice 4) ·
> panel de costo sobre `AiGenerationLog` · scrubber de PII explícito (AC-IA-7). **Siguiente: Slice 3 (resumen IA generativo + streaming).** Anterior:
> **Fase 5 — Cambio de turno · Slice 1 ✅** — `feat/cambio-turno`:
> entrega de turno firmada de dos partes, auto-compilada por nodo+turno con ABAC, resumen DETERMINISTA (sin IA) y baton que rueda.
> Estándar citado (HSE-UK/CCPS; Texas City/Piper Alpha; J5/eSOMS/Honeywell). Entidad dedicada `ShiftHandover` con ciclo FIJO de 3
> pasos reusando SOLO firma Part 11 (NO `WorkflowDefinition`); snapshot congelado al firmar; baton = objetos abiertos del alcance +
> notas manuales (CARRIED) hasta cerrarse; `handover.ready` (Bloque N) al rol del turno entrante. **4 permisos nuevos**
> `shifthandover:view/:compile/:sign/:acknowledge` + `module:handover:view` (cat. **83→88**; db:seed + FLUSHALL aplicado). Migración
> aditiva `…_add_shift_handover`. Web `/cambio-turno`: cockpit maestro-detalle de 3 zonas + sub-modo Recibo + historial ABAC + deep
> link. Contracts 326 · API 247 · smoke `smoke-cambio-turno.py` **29/29** + regresión notificaciones 18 · notif-inapp 18 · incidencias
> 32 · sla 25. **PENDIENTE: smoke VISUAL del dueño.** **Slice 2 (IA administrable desde la app) ANOTADÍSIMO** abajo en §1 y en
> DECISIONS con la referencia a `ruta-bus` + AC-IA-1..7 — NO construido. **Siguiente: Fase 5 · Slice 2.** Anterior:
> **Sesión QA / validación end-to-end** — sin features nuevas:
> se creó `scripts/seed-demo-planta.py` (escenario «Faena Demo QA» = concentradora de cobre, idempotente, marca
> DEMOQA, comando `--clean` verificado sin residuos) + `docs/QA_WALKTHROUGH.md` (guion 13 bloques + 9 credenciales
> `@planta.local`/`Demo!Pass2026` + checklist + tabla de HALLAZGOS). Sembrado: estructura 4 niveles/17 nodos + 13
> equipos + 3 listas ref + calendarios A/B y fiscal + plantilla multi-actor con umbral/condicional/regla→incidencia +
> flujo bitácora (firma/MFA/SLA) + SLA+escalamiento en tipos + 2 rondas (3 vencidas) + **64 incidencias históricas
> envejecidas por SQL** (50 cerradas/8 plazo vencido/reincidencia + 14 CAPA + 12 reportes) + 3 en vivo + 30 avisos.
> **ABAC verificado** (sup.flotación NO ve Molienda; admin ve todo). **HALLAZGOS: el recorrido guiado los irá poblando
> (§ pendiente en QA_WALKTHROUGH y aquí).** Anterior:
> **Fase 4.5 — Dashboard de incidencias ✅ → FASE 4 COMPLETA** — `feat/incidencias-dashboard`:
> analítica read-only con ABAC por nodo (mismo `buildWhere`), filtros 1 línea + rango de fechas, **Recharts** con tokens del DS
> (claro/oscuro), export CSV y **drill-down** por querystring. Endpoint `GET /incidents/dashboard` (`groupBy` + `$queryRaw` acotado,
> **nunca filas al cliente**, TZ de planta `PLANT_TIME_ZONE`). KPIs (creadas/cerradas/abiertas/críticas/plazo/permanencia/MTTR/
> cumplimiento SLA/CAPA/reportes) + tendencia creación-vs-cierre + Pareto por tipo + dona severidad + barras nodo/origen/equipo/turno +
> reincidencia. Métricas por estándar (ISO 45001/9001/14224, ITIL, Pareto); **IF/IG diferidos** (requieren HH trabajadas). **Sin
> permiso nuevo** (reusa `incident:view`), **sin migración, sin FLUSHALL**. Contracts 314 · API 247 · smoke `smoke-incidencias-dashboard.py`
> 24/24 (incl. **ABAC**: usuario scoped no ve nodos ajenos) + regresión incidencias 32/32 · capa 23/23 · investigación 27/27 ·
> reportabilidad 31/31 · sla 25/25. **PENDIENTE: smoke VISUAL del dueño.** **Deuda 4.5:** MTTA · export PNG · IF/IG. **Con esto la
> Fase 4 de Incidencias queda COMPLETA → siguiente bloque a definir (¿Fase 5 turnos?).** Anterior:
> **Fase 4.4 — SLA de incidencias + avisos de plazo + escalamiento ✅** — `feat/incidencias-sla`:
> plazos de resolución que AVISAN al vencer (correo + campanita) con escalamiento, reusando el motor del Bloque N. SLA light
> (`IncidentType.resolutionDueMinutes` → auto-`dueAt` + override editable con auditoría `DUE_CHANGED`); **4 eventos derivados**
> (`incident.sla.breached`/`incident.overdue`/`incident.action.overdue`/`incident.report.due`) detectados por `IncidentSlaService` y
> barridos en `NotificationWorkerService.sweep()`; **escalamiento re-aviso diario + 1 nivel** (`escalationAfterMinutes`/`escalationRoleId`);
> **§21 desambiguado** (Permanencia [maxStayMinutes] vs Plazo [dueAt] — KPIs/filtros/chips/stats aparte); destinatarios = asignado +
> roles del estado + escalamiento, ABAC por nodo. Migración aditiva `…_add_incident_sla`. **Sin permiso nuevo (cat. 83, sin FLUSHALL).**
> Contracts 303 · API 247 · smoke `smoke-incidencias-sla.py` 25/25 + regresión incidencias 32/32 · capa 23/23 · investigación 27/27 ·
> reportabilidad 31/31 · notif-avanzadas 22/22 · notif-inapp 18/18 · notificaciones 18/18. **Salda el aviso de plazo de reportes 4.3 y
> CAPA.** **PENDIENTE: smoke VISUAL del dueño.** **Deuda:** picker de rol de escalamiento usa `role:read` (→ `role-options` decoplado) ·
> plantilla INAPP propia · escalamiento multi-nivel/tiers (diferido). **Siguiente: 4.5 (dashboard de incidencias).** Anterior:
> **Shell: sidebar premium + Favoritos al topbar ✅** — `feat/sidebar-premium`: por feedback del dueño
> (módulos pequeños / menú estrecho / "que se vea premium"). **(1) Premium del lateral (solo CSS):** ancho 244→**288px** + **riel
> colapsado afinado** (scrollbar fina en vez de la gruesa del sistema, íconos compactos sin scroll horizontal), texto de
> módulos 13.5→**14.5px**, activo a peso 600, íconos 18→**19px**, encabezados de grupo 10.5→**11px**, más aire. **(2) Favoritos al
> topbar:** se quita la sección Favoritos del sidebar y se expone como **menú-estrella** en el topbar (`FavoritesMenu`, junto a la
> campanita; navegar al clic + desfijar desde el `trailing`); **se mantiene la estrella por ítem en el lateral para FIJAR**. Reusa
> `favorites-store`/`routeByPath`/`Menu` de `@lyra/ui`; sin store nuevo. Solo frontend del shell; sin permisos/rutas/migración.
> typecheck/lint(0)/build verdes. **PENDIENTE: smoke VISUAL del dueño.** **Nota:** se cierra la deuda menor "Favoritos con encabezado
> estático" (ya no vive en el lateral); `.navLabel`/`nav.sectionLabel` siguen huérfanos (limpieza trivial en §3). **Siguiente: 4.4.**
> Anterior:
> **Shell: menú lateral en GRUPOS colapsables ✅** — `feat/sidebar-grupos`: el sidebar plano de 16
> ítems con scroll se reorganizó en **grupos con encabezado** (Operación · Diseño y datos · Administración · Favoritos), colapsables
> con estado persistido (`ui-store.collapsedNavGroups`), **invariante: el grupo del ítem activo siempre visible**; riel colapsado =
> clústeres de íconos separados por divisores + tooltip. Modelo aditivo: `group` en `NavRoute` + `NAV_GROUPS` + helper `buildNavGroups`;
> **`SIDEBAR_ROUTES`/`routeForPath`/`routeByPath` intactos** (⌘K/pestañas/breadcrumbs no se tocan). Solo frontend del shell; sin
> permisos/rutas/migración. typecheck/lint(0)/build verdes. **PENDIENTE: smoke VISUAL del dueño.** **Deuda menor:** `.navLabel` y
> `nav.sectionLabel` quedaron huérfanos (reemplazados por `.navGroupLabel`/`nav.groups.*`); Favoritos con encabezado estático
> (intencional). **Siguiente: 4.4.** Anterior:
> **UX del builder de Flujos ✅** — `feat/builder-flujos-ux`: (1) atajo "copiar destinatarios de otra
> transición" movido **arriba** del bloque de aviso (condicional: solo si hay otra transición con aviso) · (2) **estados colapsables**
> (paridad con transiciones, resumen compacto) · (3) **fix sticky** del encabezado de columnas (`top:58px`→`top:0`, el scroll vive en
> `.content`). Solo frontend; sin contratos/API/migración; typecheck/lint(0)/build verdes. **Deuda nueva:** **copiar destinatarios
> desde OTRO flujo/plantilla** (cross-workflow) — diferido a fase aparte (configs congeladas de otros flujos + roles/usuarios que
> podrían no aplicar + ABAC). **Siguiente: 4.4.** Anterior:
> **Notificaciones avanzadas · Fase B — canal IN-APP (campanita) + tiempo real ✅** —
> `feat/notif-avanzadas-inapp`: **CIERRA EL ÉPICO** (A+B). Cada aviso genera también una notificación IN-APP por destinatario
> (leído/no leído) visible en la **campanita del Topbar** (badge + dropdown navegable + marcar leídas) y en la bandeja de
> `/mis-notificaciones`, en **tiempo real (SSE + fallback poll)**. Reusa el motor del Bloque N (outbox+worker+resolver+canal abstracto).
> 4 forks del dueño: INAPP **ON por defecto** (opt-out por evento×canal) · **SSE** (`@Sse`, token por query, heartbeat, payload =
> contador) + poll 60 s · **deep link derivado en el front** (`deepLinkForEntity`) · **purga diaria** de leídas > 90 días. In-app =
> extender `NotificationOutbox.readAt` (NO tabla dedicada). **SIN permiso nuevo** (ownership). Modelo aditivo (enum `INAPP` +
> `readAt` + índice; migración `…_add_notif_inapp_channel`). Resolver multi-canal (EMAIL+INAPP por preferencia; `dedupeKey` con canal);
> worker enruta por canal (`NotificationChannelRegistry`/`InAppChannel`), SUPPRESSED solo EMAIL, nudge SSE tras SENT;
> `NotificationRealtimeService` (bus in-memory). Endpoints inbox (`/inbox`, `/unread-count`, `/:id/read`, `/read-all`, `/stream` SSE).
> Web: `NotificationBell` + `InboxPanel` + `useInboxRealtime` + preferencias con columna INAPP. Contracts 295 · API 247 · web 3 ·
> smoke `smoke-notif-inapp.py` 18/18 + regresión `smoke-notif-avanzadas.py` 22/22 + `smoke-notificaciones.py` 18/18. **PENDIENTE:
> smoke VISUAL del dueño.** **Deuda:** SSE in-memory (multi-instancia → Redis pub/sub) · plantilla INAPP propia (hoy reusa la del
> correo) · retención configurable (hoy 90 días fijos). **ÉPICO COMPLETO → siguiente: 4.4 (SLA/escalamiento + aviso de plazo).**
> Anterior: **Notificaciones avanzadas · Fase A UI ✅** — `feat/notif-avanzadas-ui`: editor de aviso POR
> TRANSICIÓN inline en el builder de flujos (toggle + roles/usuarios/checks autor·ejecutor·roles destino/correos externos en chips
> validados + selector de plantilla + atajo "copiar destinatarios de otra transición") + master-detail de plantillas POR BITÁCORA
> (columna Ámbito + filtro scope + Nueva/Borrar ad-hoc + diccionario de comodines de campo `{{campo.<key>}}` en el editor scoped) +
> pestaña "Notificaciones" en `/configuracion` con el toggle de default `notifyTransitionDefaultDestinationRoles` (expuesto en
> `GET`/`PATCH /settings`, gate `settings:manage`). 3 forks de UX (inline · pestaña propia · chips) aprobados por el dueño. SIN
> permiso nuevo, SIN migración. Contracts 293 · API 247 · smoke `smoke-notif-avanzadas.py` 22/22 [+3 sección E settings] +
> regresión notificaciones 17/17. **PENDIENTE: smoke VISUAL del dueño.** **Deuda:** picker de usuarios depende de `/security/users`
> (considerar `user-options` decoplado, patrón `role-options`). **Siguiente: Fase B — campanita in-app + SSE; luego 4.4.** Anterior:
> **Notificaciones avanzadas · Fase A BACKEND ✅** — `feat/notif-avanzadas`: disparo de aviso por
> TRANSICIÓN (config de destinatarios CONGELADA en la versión del flujo, `WorkflowTransition.notifyConfig`) + plantillas POR BITÁCORA
> (`NotificationTemplate.templateId`, resolución específica→genérica `pickTemplateForScope`) + comodines `{{campo.<key>}}` desde la
> versión congelada + defaults de sistema (`SystemSettings.notifyTransitionDefaultDestinationRoles`) + correos EXTERNOS gated/auditados.
> Reusa el motor del Bloque N. 2 migraciones aditivas. SIN permiso nuevo. Contracts 292 · API 247 · smoke `smoke-notif-avanzadas.py`
> 19/19 + regresión notificaciones 17/17 · incidencias 32/32 · capa 23/23 · investigación 27/27 · reportabilidad 31/31. **Fase A UI
> ✅ (arriba).** · **Fase B** (canal in-app/campanita + SSE) · luego **4.4 (SLA/escalamiento + avisos de plazo)**. Anterior:
> **Fase 4.3 — Reportabilidad configurable ✅** — `feat/incidencias-reportabilidad`:
> reportes a autoridades/obligaciones configurables y transversales (nada regulatorio hardcodeado; marcos concretos = seed/catálogo),
> honrando `IncidentType.reportableDefault`. Catálogo `ReportingObligation` (key/authorityName/defaultDueMinutes/appliesToTypeIds[]/
> minSeverity/mandatory) + materialización `IncidentReport` (folio REP-####, snapshot obligación, status PENDING/SUBMITTED/
> NOT_APPLICABLE/CANCELED, dueAt, externalFolio); **bloqueo de cierre por reporte OBLIGATORIO pendiente** (`mandatory` del catálogo;
> helper `reportsBlockingClose` + guarda `assertNoBlockingReports`); **vencido DERIVADO** (status PENDING + dueAt<now; KPI/filtro/
> flag de fila); materialización en create si reportable; **sin permiso nuevo** [catálogo `incidentcatalog:manage`, reportes
> `incident:edit`, cat. **83**]. Migración aditiva `…_add_incident_reporting`. Web: pestaña Reportes en el drawer + sub-pestaña
> Obligaciones en `/incidencias/catalogos` + KPI/chip "Reporte vencido". Contracts 283 · API 241 · smoke
> `smoke-incidencias-reportabilidad.py` 31/31 + regresión incidencias 32/32 · capa 23/23 · investigación 27/27 · excepciones 39/39 ·
> reglas 21/21 · catálogos 16/16. **Deuda:** evidencia de envío (Storage Ola 3) · firma Part 11 al enviar · aviso de plazo (→ 4.4 +
> notificaciones avanzadas). **Siguiente: 4.4 — SLA/escalamiento + aviso de plazo.** Anterior:
> **Fase 4.2b — Investigación de causa raíz (5 Porqués) ✅** — `feat/incidencias-investigacion`:
> investigación configurable/transversal honrando `IncidentType.requiresInvestigation`. Modelo dedicado `IncidentInvestigation`
> (1:1, method FIVE_WHYS, status DRAFT/COMPLETED, problemStatement, rootCauseSummary) + `IncidentInvestigationStep` (porqués
> ordenados con `isRootCause`); enlace causa raíz↔CAPA (`IncidentAction.investigationStepId`); **bloqueo de cierre configurable**
> (`assertInvestigationComplete` + helper `investigationBlocksClose`); drawer a **PESTAÑAS** (Resumen/Acciones/Investigación/
> Actividad); **sin permiso nuevo** [reusa `incident:edit`, cat. **83**]. Migración aditiva `…_add_incident_investigation`.
> Contracts 271 · API 234 · smoke `smoke-incidencias-investigacion.py` 27/27 + `smoke-incidencias-capa.py` 23/23 +
> `smoke-incidencias.py` 31/31. **Deuda:** firma Part 11 al completar · evidencia a la investigación · plantillas ICAM/Ishikawa.
> **Siguiente: 4.3 — Reportabilidad configurable.** Anterior:
> **Fase 4.2a — Acciones CAPA ✅** — `feat/incidencias-capa`: tras la **auditoría del módulo de
> Incidencias** (core ya genérico/transversal; brecha P1 = seguimiento real → CAPA), gestión de acciones correctivas/preventivas/
> inmediatas. Entidad `IncidentAction` (folio ACT-####, mandatory, responsable persona+rol, plazo, status OPEN/IN_PROGRESS/DONE/
> VERIFIED/CANCELED, **verificación de eficacia** [no eficaz reabre], anulación sin borrado, `evidence` reservado); **bloqueo de
> cierre** por acción `mandatory` (verificación exigida si el tipo `requiresCapa`); 2 permisos `incident:action:manage`/`:verify`
> [cat. **83**]; bloque "Acciones" en el drawer + modales. Migración aditiva. Contracts 263 · API 234 · smoke
> `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 30/30. **Deuda:** subida de evidencia (Storage Ola 3) · picker de rol
> responsable en UI · firma Part 11 al verificar. **Siguiente: 4.2b — Investigación (5 Porqués).** Anterior:
> **Mantenedor de catálogos de incidencias [UI] ✅** — `feat/incidencias-catalogos-ui`: pantalla
> `/incidencias/catalogos` [ruta propia + botón en header de `/incidencias`, gate `incidentcatalog:manage`] con sub-pestañas
> Tipos/Categorías [buscador+estado+orden en 1 línea, GridPager arriba/abajo, crear/editar modal, toggle activo]; backend mínimo:
> guarda "flujo por defecto publicado" en `upsertType` + **409** al crear con key existente [`?create=true`, guarda cliente+server];
> swatches de color con tokens del DS; sin permisos nuevos [cat. 81], sin migración. Contracts 257 · API 234 · smoke
> `smoke-catalogos-incidencias.py` 16/16 + `smoke-incidencias.py` 30/30. **Siguiente: 4.2 — Investigación + CAPA.** Anterior:
> **Fase 4.1.1 — Excepciones operacionales [UI] ✅** — `feat/incidencias-excepciones-ui`: panel
> inline plegable de revisión en llenado/visor [resumen + lista accionable + selección múltiple], `ExceptionDetailDrawer` con
> triage (reconocer/corregir[GxP+reauth]/crear-asociar incidencia/descartar), `ConvertExceptionModal` con dedup, banner "advertir
> no bloquear" al completar con críticas, **bandeja global `/excepciones`** [KPIs + filtros + GridPager + menú], trazabilidad
> campo→excepción→incidencia [filtro `incidentId` nuevo], toggle `warnRaisesException` en el builder de NUMBER. Contracts 255 ·
> API 234 · smoke 39/39 + filtro live. **Siguiente: 4.1.2 — acción del motor de reglas (diferida, outbox).** Anterior:
> **Fase 4.1.0 — Excepciones operacionales [BACKEND] ✅** — `feat/incidencias-excepciones`: capa
> Bitácora→Excepción→Incidencia. `LogEntryException` + `IncidentExceptionLink` (migración aditiva); generación SÍNCRONA gobernada
> por campo (CRIT siempre / WARN opt-in `warnRaisesException`) reconciliada en guardar/sellar + purga en VOID; triage completo
> (ack/dismiss[crítica=permiso superior]/correct[GxP, preserva original]/convert→incidencia/associate/manual) + dedupe por sugerencia;
> ABAC + auditoría; 4 permisos [cat. **81**]. Contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39. **Siguiente: 4.1.1 — panel
> de excepciones en la bitácora (UI)** + 4.1.2 (acción del motor de reglas, diferida). Anterior: **Fase 4.0 — Núcleo de Incidencias ✅** — `feat/incidencias-nucleo`: módulo de incidencias
> operacionales/HSE que reusa `WorkflowDefinition`; 6 entidades aditivas, catálogos configurables, lista+kanban+detalle, ABAC,
> creación manual y desde bitácora, 9 permisos [cat. **77**], smoke 26/26. Plan por fases 4.1–4.5 aprobado [DECISIONS]. **Siguiente:
> Fase 4.1 — Excepciones operacionales.** Anterior: **Bloque N — Hardening de Notificaciones ✅** — `feat/notif-hardening`: **#1 config SMTP en BD**
> (pantalla en `/configuracion` tab "Correo saliente", permiso `notification:config` [cat. **68**]; `SystemSettings.email*`, `.env`
> fallback, **contraseña CIFRADA write-only**, sin reiniciar; presets + probar conexión/envío contra Mailpit; sender suprime si está
> apagado) **+ #2 editor de plantillas premium** (vista previa en vivo, diccionario de variables con descripción+ejemplo, insertar
> en cursor, **`{{entry.summary}}`** = campos de resumen de la bitácora). Migración aditiva. Contracts 255 · API 234 · smokes 8/8 +
> 17/17. **Siguiente: Fase 4 — Incidencias.** Anterior: **Bloque N — Notificaciones ✅** — `feat/notificaciones`: motor de avisos por CORREO premium,
> transactional outbox de 2 etapas + worker `@nestjs/schedule` (1.ª infra de cron); 5 entidades aditivas (`NotificationEvent`/
> `Outbox`/`Template`/`Subscription`/`Preference`); catálogo de eventos en código (4: ronda vencida/SLA/transición/firma) con
> variables whitelisteadas + render sin eval; emisión IN-TX en `executeTransition`; resolución de destinatarios con ABAC; sweeper
> que GENERA rondas antes de escanear vencidas; bandeja de salida (Req-1/5) + plantillas configurables + preferencias propias;
> 4 permisos (cat. **67**); migración aditiva; seed de 4 plantillas. Contracts 255 · API 234 · smoke 17/17. **Siguiente: Fase 4 —
> Incidencias.** Anterior: **Fase 2.3.1 — Worklist de rondas ✅** — `feat/rondas-worklist`: separa PLANIFICAR de
> EJECUTAR. Permiso nuevo **`round:execute`** (cat. **63**) gatea ver+ejecutar "Mis rondas"; start/skip se mueven de
> `schedule:manage` a `round:execute`. **`LogSchedule.responsibleRoleId?`** SINGLE nullable (FK Role SetNull) = rol responsable
> del worklist, leído EN VIVO (reasignar re-enruta pendientes); `null` = fallback nodo+turno. `GET /schedules/my-rounds`
> (+`/stats`) acota `PENDING ∩ nodos accesibles ∩ {responsable null|∈ mis roles}` con toggles overdueOnly/shiftOnly/includeUpcoming;
> `GET /schedules/role-options` (gate schedule:manage, decoplado de role:read). Web: página `/mis-rondas` (worklist operador) +
> `/rondas` relabelada "Programación de rondas" (sin ejecución, monitoreo read-only + selector de rol responsable) + widget en
> Inicio + badge de /bitacoras → mis-rondas. Migración aditiva. Contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 +
> `smoke-rondas.py` 21/21. **Siguiente: Notificaciones (correo).** Anterior:
> **Fase 2.3 — Programación de rondas ✅** — `feat/programacion-rondas`: `LogSchedule` (horario
> VIVO plantilla×nodo×recurrencia SHIFT/INTERVAL/CALENDAR) + `RoundOccurrence` (ocurrencias materializadas pendiente/cumplida/
> vencida[derivada]/omitida); la ENTRADA se crea al **iniciar la ronda** (reusa `LogEntriesService.create`, ligada por
> `logEntryId @unique`); generación lazy idempotente + botón Generar; página `/rondas` (KPIs + iniciar/omitir + horarios) + badge
> en `/bitacoras`; 2 permisos `schedule:view/manage` (cat. **62**); enumerador PURO testeado; migración aditiva. Contracts 249 ·
> API 234 · smoke 21/21. **Siguiente: a definir con el dueño.** Anterior:
> **Builder: formateo en vivo + paleta de elementos + modal "Ver más" ✅** —
> `feat/builder-formateo-paleta`: RUT al teclear · número/moneda/porcentaje con miles+decimales (`FormattedNumberInput`) ·
> máscara genérica `OT-#####` (`config.mask`) · «Decimales» expuesto · footer Aceptar/Cancelar en PROPIEDADES · paleta DOCKED a
> la izquierda con buscador + scroll al campo creado · modal "Ver más" con demo en vivo + caso de uso · "objeto"→"elemento".
> Contracts 239 · API 234. Anterior:
> **Pulidos de UX del Form Builder ✅** — `feat/builder-ux-pulidos`: mín/máx caracteres +
> contador en vivo en Texto/Párrafo; hover de info en el lienzo (`SectionCanvas`); footer Aceptar/Cancelar en el drawer
> avanzado [Cancelar = revierte por snapshot]; fix del Enter al crear ítems de lista [`LinesTextarea` conserva texto crudo];
> + fix preexistente del spec `logbook-query.service` [faltaba `storage` en el constructor]. Doc VIVO `FORM_GUIDE.md`
> actualizado. Contracts 239 · API 234. Anterior:
> **Catálogo de objetos premium · Ola 4 ✅** — `feat/objetos-ola4`: objetos ESTRUCTURADOS /
> repetibles, sin infra. Dos `FieldType` nuevos: `TABLE` (tabla repetible `layout=table` + grupo repetible `layout=cards`,
> valor `Array<Record<colKey,escalar>>`, filas dinámicas) y `MATRIX` (parámetro×turno, filas/columnas FIJAS + celda
> uniforme, `Record<rowKey,Record<colKey,escalar>>`). Columnas/ejes = sub-campos ESCALARES en config, congelados en la
> versión; **validación POR CELDA** reusando `validateFieldValue` del tipo de columna (SELECT de celda = opciones inline);
> `requiredFieldError` generaliza la obligatoriedad. Render único `RepeatableControl`/`MatrixControl` recursivos sobre
> `FieldControl` (modo `bare`) + paleta "Estructurados" + editores en el builder. Opacos a resumen/reglas en el MVP.
> Migración ALTER enum. Contracts 230 · API 234 · smoke 22/22. Pendiente: smoke VISUAL [§4]. Anterior:
> **Catálogo de objetos premium · Ola 3 ✅** — `feat/objetos-ola3`: adjuntos/terreno con
> infra MinIO. `StorageService` abstracto (token DI) + `MinioStorageService` (SDK `minio`, bucket idempotente). Un
> `FieldType ATTACHMENT` + presets → `dataType FILE_ARRAY` (valor `descriptor[]`); foto/cámara · archivo · nota de voz
> (`MediaRecorder`) · croquis (canvas→PNG) · escáner QR (`config.scan` sobre TEXT, `@zxing/browser`, NO archivo). Subida
> **PROXIED** (`@fastify/multipart`, choke-point) a `entries/{id}/{fieldKey}/…`; descriptor en `LogEntryValue.value` (NUNCA
> URL); descarga = **presigned GET** con la ABAC de `getDetail`; pertenencia por prefijo + delete-on-remove + VOID limpia
> huérfanos. Migración ALTER enum aditiva. Render único `AttachmentControl` + paleta "Evidencia / Terreno". Contracts 222 ·
> API 234 · smoke 26/26. Pendiente: smoke VISUAL [§4]. Anterior: **Catálogo de objetos premium · Ola 2 ✅** — `feat/objetos-ola2`: objetos de REFERENCIA
> (un tipo `REFERENCE` + `config.entity` equipo/usuario/nodo/turno, `dataType REFERENCE`) con resolución + validación ABAC
> server-side (`opts.allowedRefIds` espejo de `allowedCodes`; endpoint `GET /log-entries/references/:kind/options`); lectura
> con tolerancia (NUMBER + expected±tol que deriva bandas warn/crit); contador/acumulado (NUMBER + delta vs lectura previa
> sellada); matriz de riesgo (`RISK_MATRIX`/`dataType RISK`, ejes 2..7 + celda→severidad, ISO 31000). Migración ALTER enum
> aditiva. Render único FieldControl + paleta categoría "Referencia" + editores. Contracts 215 · API 234 · smoke 22/22.
> Pendiente: smoke VISUAL [§4]. Anterior: **Catálogo de objetos premium · Ola 1 ✅** — `feat/objetos-ola1`: +11 tipos
> (CONFORMITY/RATING/TIME/DURATION/RANGE + 6 de presentación), `displayAs` en SELECT/MULTISELECT y `format` en
> TEXT/NUMBER, dataType `LAYOUT`/`RANGE`, migración ALTER enum aditiva, render único FieldControl premium, paleta por
> presets, guardas LAYOUT en API. Contracts 204 · API 234 · smoke 21/21. Pendiente: smoke VISUAL [§4]. Anterior:
> **Fase 2.1.7 Diseñador visual de formularios ✅ FASE 1** — `feat/builder-visual-designer`:
> el modelo auto-fila era rígido (no se podía colocar/redimensionar libre). Se contradijo el píxel-absoluto puro (rompe el
> responsive de terreno) y el dueño aceptó **grilla responsiva de posicionamiento libre** (`react-grid-layout`): geometría
> EXPLÍCITA `{x,y,w,h}` por campo (columnas `TemplateField.gridX/gridY/gridH` NULLABLE, migración aditiva; `null`=legacy ⇒
> el editor la deriva del orden+colSpan), arrastrar/redimensionar cualquier campo, snapping, arrastrar desde la paleta.
> Editor 3 zonas (paleta · lienzo RGL · propiedades) + escritorio/tablet/móvil (preview con el MISMO `FieldGrid` data-driven
> + container-queries) + cuadrícula. Render único intacto; compat con plantillas viejas. Contracts 195 · API 234 · smoke
> `smoke-field-geometry.py` 14/14. **Diferido Fase 2/3** (historial, multi-sel, alinear/distribuir, capas, copiar/pegar,
> atajos, edición por breakpoint, zoom) + limpieza de huérfanos (BuilderFieldCard/FieldToolbar/AddFieldMenu/dnd-kit).
> Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.6 Builder motor de arrastre con dnd-kit ✅** — `feat/builder-dnd-kit`: el
> dueño reportó que tras 2.1.5 seguía sin poder mover un campo al lado de otro. Causa: (1) **bug** del DnD nativo (el drag
> solo arrancaba desde el grip, pero el ícono SVG dejaba el target sin `data-drag-handle` ⇒ casi nunca iniciaba); (2)
> **techo** del DnD nativo (sin reflow en vivo, fantasma gris). Se adoptó **dnd-kit** (core 6 + sortable 10 + utilities 3;
> MIT, on-prem, pointer/teclado/touch) y se reescribió el lienzo: nodo sortable = **celda** (reflow animado), tarjeta =
> **activador** (se agarra donde sea; rótulo/borde exentos), **`DragOverlay`** sigue al cursor, intención al-lado/fila **por
> píxeles** reusando el auto-layout de 2.1.5 (`applyDrop`/`splitRow`). Frontend puro (sigue `colSpan`; `FieldGrid` fuente
> única). Contracts 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.5 Builder auto-layout por arrastre ✅** — `feat/builder-autolayout`: por
> feedback del dueño (4 puntos): lienzo a **todo el ancho**; **auto-layout estilo Notion** (soltar al lado ⇒ comparten
> fila con ancho repartido solo; a su línea ⇒ ancho completo; el usuario NO piensa en columnas); se quita el menú "12/12"
> y el ajuste fino es un **divisor** del borde; **responsive 1/2/12** (móvil/tablet/escritorio). Frontend puro. Contracts
> 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.4 Builder canvas-first ✅** — `feat/builder-canvas`: por feedback del dueño
> ("estrecho y poco intuitivo vs Canva"), el editor pasa a **canvas-first** (lienzo a todo el ancho), la paleta es un
> popover "＋ Agregar", la config avanzada vive en un `Drawer`, y **se configura SOBRE el lienzo**: control REAL
> (WYSIWYG), rótulo/sección editables en el lugar, barra flotante contextual (ancho/obligatorio/mover/duplicar/eliminar).
> Frontend puro (no toca modelo/API). Fase 1; Fase 2 diferida (drag-desde-paleta, inline placeholder/opciones, colapsar,
> atajos, multi-sel). Contracts 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.3 Editor de layout WYSIWYG ✅** — `feat/layout-editor-wysiwyg`: el editor del
> builder pasa a manipulación directa (arrastrar para reordenar dentro/entre secciones + redimensionar el borde); por
> feedback del dueño ("el panel de ancho era ciego"). Granularidad a **12 columnas**: reemplaza el enum `LayoutWidth` por
> `TemplateField.colSpan` 1..12 (migración `…_field_colspan`). Sin librería de DnD nueva (DnD nativo `ColumnsDrawer` +
> pointer-events `ResizableSplit`; el builder es de escritorio). `FieldGrid` numérico (fuente única intacta). Contracts
> 195 · API 234 · smoke 14/14. Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.2 Layout de formulario en grilla responsiva ✅** — `feat/layout-grilla`:
> ancho por campo `{FULL,HALF,THIRD}` en **columna `TemplateField.layoutWidth`** [versión inmutable, NO en `config`
> JSONB porque los config por tipo son Zod `.strict()`] + grilla CSS 12-col responsiva [THIRD→½ tablet, 1 col <768px]
> desde fuente de render ÚNICA `FieldGrid`/`FieldGridCell` [builder-preview + llenado + visor idénticos]. Presentación
> PURA y aditiva, default FULL = cero ruptura. Migración `…_add_field_layout_width`. Contracts 195 · API 234 · smoke
> 12/12. Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.8.2 VOID de borradores + ruta de edición ✅** — `feat/void-edicion`: `status=VOID`
> con motivo ≥5 auditado [NO `deletedAt`], autorización ownership + permiso nuevo `logentry:void` para ajenas [catálogo
> **59→60**], `buildWhere` excluye VOID por defecto [recuperable con `?status=VOID`], evento timeline VOIDED, banner en
> visor/llenado, **ruta de edición dedicada `/bitacoras/:id/editar`**. Cierra la deuda (b)(c) de 2.8.2 [la (a) ya estaba].
> Contracts 193 · API 234 · smoke 17/17. **Falta:** VOID GxP de entradas SELLADAS [firma §11.200 + transición inversa,
> con 2.5(a)]. Anterior: **Fase 2.8.0.2 Modo de equipo por PLANTILLA ✅** — gobernanza del objeto de referencia EAM:
> enum `EquipmentMode` `NONE|OPTIONAL|SUGGESTED|REQUIRED` en `Template` [contenedor mutable, default OPTIONAL = cero ruptura];
> backend AUTORIZA REQUIRED/NONE en `create`; `eligibleNodes` expone el modo; control en `TemplateBuilder`. Sin permisos
> nuevos [catálogo 59]. Tests contracts 151 · API 216 · smoke 17/17. 6 forks en DECISIONS. Pendiente: smoke VISUAL [§4].
> Anterior: **Fase 2.8.0 Plantillas MULTI-NODO ✅** — eje de NODO de la visibilidad de plantilla:
> entidad `TemplateNodeAssignment` [templateId × orgNodeId + `includeDescendants`, N:M] = fuente de verdad única; 3 modos
> [uno/varios/"todos los hijos de X"]; **0 asignaciones = GLOBAL** [permisivo]; `Template.orgNodeId` = nodo primario DERIVADO
> [deprecado, DROP en §3]. `ScopeService.getAccessibleNodes`+`isTemplateVisibleByNode`; selector de nodo al crear acotado a
> asignaciones ∩ ABAC [autoselección si 1, **obliga si >1**] vía `eligibleNodesForTemplate` + `assertNodeAllowedForTemplate`
> [**cierra el diferido (a) de 2.4**]. UI en `TemplateBuilder` [reusa `ScopeTreePicker`] + `NewEntryPage`. **Sin permisos
> nuevos — catálogo 59.** Tests contracts 149 · API **213**. **+ 2.8.0.1 Equipo OPCIONAL al crear** (objeto de referencia
> EAM: nodo + equipo del nodo; `eligibleNode.equipment` + `assertEquipmentInNode`; modal con selector de equipo; smoke 18/18).
> **+ fix re-binding de flujo** al guardar plantilla (preexistente 2.2). Siguiente recomendado: **2.8.0.2 modo de equipo por
> plantilla** (gobernanza, opción B) · **2.8.1 UX de acceso nodo↔grilla** (fusiona 2.6.1 SavedView) o **2.7.3 matriz
> rol×sección×tiempo**. Deuda abierta: **2.8.2** [VOID de borradores + ruta de edición propia] y el DROP de `Template.orgNodeId` [§3]).

---

## 0. Definición de "sesión cerrada de forma segura" (checklist)

Antes de declarar una sesión completa, TODO esto debe estar hecho o registrado aquí:

- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde.
- [ ] Smoke en vivo de lo construido (y registrado qué se probó y qué **no**, en §4).
- [ ] Docs actualizados: `PROGRESS.md`, los docs afectados y **este `BACKLOG.md`**.
- [ ] Si se completó una funcionalidad de cara al usuario: **`docs/USER_GUIDE.md`** actualizado
      (sección redactada + índice marcado ✅) y, de paso, 1–2 secciones antiguas (✍️) rellenadas.
- [ ] Commit(s) descriptivos.
- [ ] **Publicación decidida y ejecutada** (§1): push de la rama y/o merge a `main` y
      push de `main`. Un commit que solo vive en este disco **es trabajo en riesgo**.
- [ ] Toda decisión nueva en `DECISIONS.md`; toda deuda nueva en §3 de este archivo.

> Si algo queda a medias, no se borra del checklist: se mueve a la sección
> correspondiente de este backlog con el detalle exacto para retomarlo.

---

## 1. Git: ramas y commits SIN publicar (riesgo de pérdida) 🔴

> Estado al 2026-06-10 (todo publicado). Verificar con:
> `git rev-list --count origin/main..main` (debe dar 0) y `git branch --no-merged main`.

| Qué | Dónde | Estado | Acción pendiente |
|---|---|---|---|
| **Fase 1: Login + branding + reset de contraseña + docs + rutina** | `main` | ✅ publicado en `origin/main` | ninguna |
| **Fase 1: MFA self-service** | `main` (fusionado desde `feat/auth-mfa-self-service`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Estructura v2 + externalCode + Table fix** | `main` | ✅ publicado (`f84cbd8`) | ninguna |
| **Estructura UX: layout responsivo, ResizableSplit, description, reportOrder, fix puerto** | `main` | ✅ publicado (`5170f70`) | ninguna |
| **Docs cierre + fix header responsivo del detalle** | `main` | ✅ publicado (`91a4bd6`) | ninguna |
| **Módulo Equipos** (CRUD + categorías + `ExternalReference` modelo) | `main` (fusionado desde `feat/equipos`) | ✅ fusionado y publicado en `origin/main` (`a299ab6`) | ninguna |
| **UI de Seguridad** (usuarios/roles/política/auditoría + reset MFA) | `main` (fusionado desde `feat/seguridad-ui`) | ✅ fusionado y publicado en `origin/main` (`a6f8b10`) | ninguna |
| **Fase 2.1 Plantillas** (modelo definición + contratos + Form Builder) | `main` (fusionado desde `feat/plantillas`) | ✅ fusionado y publicado en `origin/main` (`a440f54`) | ninguna |
| **Fase 2.1.1 Endurecimiento de modelo** (campo en 3 capas + `optionSource`) | `main` (fusionado desde `feat/plantillas-2.1.1`) | ✅ fusionado y publicado en `origin/main` (`365e31f`) | ninguna |
| **Fase 2.2 Flujos reutilizables** (`WorkflowDefinition` + mantenedor + binding) | `main` (fusionado desde `feat/workflows`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.x Datos de referencia** (`ReferenceList`/`ReferenceItem` + mantenedor + binding) | `main` (fusionado desde `feat/datos-referencia`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Datos de referencia — UX enterprise** (grilla orden/búsqueda/paginación + `Combobox` + selectores premium) | `main` (fusionado desde `feat/datos-referencia-ux`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fix recorte de paneles + `LookupPicker`** (flip-up/clamp + diálogo tabla con tokens) | `main` (fusionado desde `feat/datos-referencia-lookup`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Import/Export CSV de Listas** (dry-run→commit + export `;` es-CL) | `main` (fusionado desde `feat/listas-csv`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3.0 Calendario operacional** (`OperationalCalendar`/`OperationalShift` + `ShiftResolver` + mantenedor) | `main` (fusionado desde `feat/calendario-operacional`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.4 Llenado (Nueva entrada)** (`LogEntry*` + `/log-entries` + `FieldControl` + pantalla de llenado) | `main` (fusionado desde `feat/llenado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.5 Ejecución de flujo + firmas Part 11** (`LogEntryTransition`/`LogEntrySignature` + `executeTransition` + `ReauthService` + modales de firma) | `main` (fusionado desde `feat/ejecucion-flujo`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.6.0 Módulo de Bitácoras — núcleo de lectura** (folio + estampados + `LogbookQueryService` + `/bitacoras` + record viewer + verificación de firmas) | `main` (fusionado desde `feat/bitacoras-auditor`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Afinamiento #4** (triage 10 mejoras + guardado por sección autoexplicativo + `submit` objetivo + motivos de bloqueo) | `main` (fusionado desde `feat/afinamiento-llenado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.0 Registro diferido** (`entryOrigin` + `setDeferral` + gesto mínimo + huella grilla/visor/timeline) | `main` (fusionado desde `feat/registro-diferido`) | ✅ fusionado y publicado en `origin/main` |
| **Fase 2.7.1 Período contable gobernado** (`OperationalPeriod` + guarda `assertWritable` + cierre/reapertura auditada + mantenedor) | `main` (fusionado desde `feat/periodo-gobernado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.1.1 Calendario FISCAL transversal** (`FiscalCalendar` + `FiscalResolver` + período materializado OPEN→CLOSED→LOCKED + generate/lock/unlock + pantalla `/calendario-fiscal`) | `main` (fusionado desde `feat/calendario-fiscal`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.1.1 Afinamiento UX + Configuración** (panel a pestañas + grilla scroll/orden + historial por período c/MFA estampado + `/configuracion` MFA por acción + formato regional + fix Toast z-index) | `main` (fusionado desde `feat/calendario-fiscal-ux`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.2 Ventana de edición configurable** (`Template.editWindow*` + `SystemSettings` global/MFA + guarda `assertEditWindowWritable` + override `logentry:write-expired` con motivo + huella `editWindow` + UI builder/`/configuracion`/llenado) | `main` (fusionado desde `feat/ventana-edicion`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8 Alcance por PLANTILLA (2.º eje ABAC)** (`TemplateScope` + `getAccessibleTemplateIds`/`assertTemplateInScope` + filtro picker/grilla + `PUT users\|roles/:id/template-scope` + options + `TemplateScopePicker`) | `main` (fusionado desde `feat/alcance-plantilla`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8 Afinamiento** (fix anclaje de selectores + Combobox/MultiSelect premium + filtro de Bitácoras con alcance `GET /log-entries/filter-templates` + RoleDrawer a pestañas + acceso por rol desde la plantilla `GET/PUT /templates/:id/role-scope` + `TemplateAccessModal`) | `feat/afinamiento-2.8` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.0 Plantillas MULTI-NODO** (`TemplateNodeAssignment` N:M + `getAccessibleNodes`/`isTemplateVisibleByNode` + selector de nodo al crear `eligibleNodesForTemplate` + `assertNodeAllowedForTemplate` + UI builder/NewEntryPage) | `feat/plantillas-multinodo` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fix re-binding de flujo al guardar plantilla** (el builder reenviaba la versión de flujo congelada; ahora ata la vigente — bug preexistente 2.2 detectado en el smoke visual de 2.8.0) | `main` (commit directo) | ✅ publicado en `origin/main` (`2a58d9f`) | ninguna |
| **Fase 2.8.0.1 Equipo OPCIONAL al crear entrada** (`eligibleNode.equipment` + `assertEquipmentInNode` + selector de equipo en el modal de creación) | `feat/equipo-opcional-entrada` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.0.2 Modo de equipo por PLANTILLA** (`EquipmentMode` en `Template` + `assertEquipmentForMode` en `create` + `equipmentMode` en `eligibleNodes` + control en `TemplateBuilder`/`NewEntryPage`) | `feat/modo-equipo-plantilla` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Afinamiento UX TemplateBuilder** ("Guardar configuración" `PATCH` separado del borrador + `editStateToConfigRequest` + riel vertical/sub-pestañas + barra sticky + `ScopeTreePicker`/`Toast` premium) | `feat/builder-vistas-config` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.1a Bitácoras grilla orientada a contenido** (`Template.gridFieldKeys` gobernanza viva + `summaryValues`/`equipmentTag` en el listado batched + búsqueda por contenido `pg_trgm` + checklist en builder + columnas Equipo/Resumen) | `feat/bitacoras-grilla-contenido` → `main` | ✅ fusionado y publicado en `origin/main` (`4a3a7a9`) | ninguna |
| **Afinamiento UX grilla de Bitácoras** (fix párrafos + filtros primarios+Drawer + filtro multi-nodo `orgNodeIds` + paginador discreto arriba/abajo + Actualizar + KPIs premium) | `feat/grilla-ux` → `main` | ✅ fusionado y publicado en `origin/main` (`6b06662`) | ninguna |
| **Fase 2.8.1b Vistas guardadas + gestor de columnas + multi-sort** (`SavedView` ownership-gated + `SavedViewsModule` + `Table` column-aware en `@lyra/ui` + `ColumnsDrawer`/`ViewBar` + multi-sort keyset + columnas de valor por plantilla) | `feat/bitacoras-vistas-guardadas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.1c Peek + facetas + review-by-exception + Mi turno** (`/facets` conteos de hermanos + `/my-shift` + `exceptionsOnly` + `FacetsPanel`/`PeekDrawer` + `rowClassName` en `@lyra/ui` + filtro de equipo en UI) | `feat/bitacoras-peek-facetas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Workflow SLA + atrasos** (`WorkflowState.maxStayMinutes` + `LogEntry.currentStateSince` + `evaluateSla` + `roleNames` en versión congelada + `delayedOnly`/`stats.delayed`/`facets.delayed` + vista sistema "Retrasadas" + `SlaDurationField` builder + alertas diagrama/grilla) | `feat/workflow-sla-atrasos` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Motor de reglas — primer corte (Req-7)** (`@lyra/contracts/rules` AST seguro + formulados + cruzadas + `TemplateField.computed`/`TemplateVersion.rules` + recálculo autoritativo/estampado en API + `ExpressionEditor`/`RulesEditor`/preview en vivo) | `feat/motor-reglas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.2 VOID de borradores + ruta de edición** (`status=VOID` + `voidedAt/voidReason/voidedById` + `POST /void` ownership/`logentry:void` + `buildWhere` excluye VOID + evento timeline VOIDED + `VoidEntryModal`/banner + ruta `/bitacoras/:id/editar`) | `feat/void-edicion` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.1.2 Layout de formulario en grilla responsiva** (enum `LayoutWidth` + columna `TemplateField.layoutWidth` + migración `…_add_field_layout_width` + `FieldGrid`/`FieldGridCell` compartido + selector en `BuilderConfigPanel` + cableo de PreviewForm/EntryFillPage/EntryViewerPage) | `feat/layout-grilla` → `main` | ✅ fusionado y publicado en `origin/main` (`a74a320`) | ninguna |
| **Fase 2.1.3 Editor de layout WYSIWYG (12 col + arrastre)** (reemplaza enum `LayoutWidth` por `TemplateField.colSpan` 1..12 + migración `…_field_colspan` + `FieldGrid` numérico + `BuilderFieldCard` con DnD nativo reorder y resize pointer/teclado + presets en `BuilderConfigPanel` + `moveFieldBefore`) | `feat/layout-editor-wysiwyg` → `main` | ✅ fusionado y publicado en `origin/main` (`d84240d`) | ninguna |
| **Fase 2.1.4 Builder canvas-first (config en el lienzo)** (lienzo full-width + `AddFieldMenu` popover + config en `Drawer` + control real WYSIWYG + rótulo/sección inline + `FieldToolbar` flotante + `addFieldAt`/`duplicateField`; frontend puro) | `feat/builder-canvas` → `main` | ✅ fusionado y publicado en `origin/main` (`3f3ccbc`/`a654646`) | ninguna |
| **Fase 2.1.5 Builder auto-layout por arrastre (Notion)** (ancho completo + soltar-al-lado/a-su-línea con ancho auto `splitRow`/`rowRangeOf`/`applyDrop` + divisor de borde `resizeDivider` + quitar menú "12/12" + responsive 1/2/12 + indicadores de soltado; frontend puro) | `feat/builder-autolayout` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.1.6 Builder motor de arrastre con dnd-kit (Canva-grade)** (adopta `@dnd-kit/core`6+`sortable`10+`utilities`3; nodo sortable = celda con reflow animado; tarjeta = activador; `DragOverlay` sigue al cursor; intención al-lado/fila por píxeles reusando `applyDrop`/`splitRow`; `SectionDropArea` droppable de sección; arregla el bug del grip-SVG; frontend puro) | `feat/builder-dnd-kit` → `main` | ✅ fusionado y publicado en `origin/main` (`20e236b`) | ninguna |
| **Fase 2.1.7 Diseñador visual de formularios (lienzo libre)** (geometría `TemplateField.gridX/gridY/gridH` nullable + migración `…_add_field_grid_geometry` + contratos + 3 map sites API; `react-grid-layout` en `SectionCanvas` + `FieldPalette` + `FieldPropertiesPanel`; `FieldGrid` data-driven + container-queries; deriva legacy del orden+colSpan; smoke geometría 14/14) | `feat/builder-visual-designer` → `main` | ✅ fusionado y publicado en `origin/main` (`85cd2c4`) | ninguna |
| **Catálogo de objetos premium · Ola 1** (+11 `FIELD_TYPES` + `LAYOUT`/`RANGE` dataType + migración `…_add_ola1_field_types` ALTER enum; `displayAs` SELECT/MULTISELECT + `format` TEXT/NUMBER + tri-estado/rating/time/duration/range + presentación LAYOUT; `validateFieldValue`/`isEmptyValue`/helpers; guardas LAYOUT en API; FieldControl premium + paleta presets + editores config + lib/format; contracts 204 · API 234 · smoke 21/21) | `feat/objetos-ola1` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 2** (+`REFERENCE`/`RISK_MATRIX` FieldType + `RISK` dataType + migración `…_add_ola2_field_types` ALTER enum; selectores de referencia con ABAC server-side `GET /references/:kind/options` + `opts.allowedRefIds`; tolerancia NUMBER `deriveToleranceBands`; contador `resolveCounterPreviousValues`/delta; `riskLevelFor`; FieldControl render único + paleta "Referencia" + editores; contracts 215 · API 234 · smoke 22/22) | `feat/objetos-ola2` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 3** (+`ATTACHMENT` FieldType + `FILE_ARRAY` dataType + migración `…_add_ola3_field_types` ALTER enum; `StorageService`/`MinioStorageService` (SDK minio) + `StorageModule` @Global + env MINIO_*; subida PROXIED `@fastify/multipart` + endpoints `POST/GET :id/attachments/…`; descriptor jsonb + presigned GET con ABAC; pertenencia por prefijo + delete-on-remove + VOID limpia; `AttachmentControl`/`QrScanButton` (@zxing) + paleta "Evidencia / Terreno" + `apiUpload`; contracts 222 · API 234 · smoke 26/26) | `feat/objetos-ola3` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 4** (+`TABLE`/`MATRIX` FieldType + `TABLE`/`MATRIX` dataType + migración `…_add_ola4_field_types` ALTER enum; `tableFieldConfigSchema`/`matrixFieldConfigSchema` con columnas/ejes = sub-campos escalares; `validateFieldValue` casos TABLE/MATRIX POR CELDA + `requiredFieldError`/`countCompleteTableRows`/`isEmptyMatrixValue`; opacos a resumen/reglas; `RepeatableControl`/`MatrixControl` recursivos sobre `FieldControl` modo `bare` + `TableConfigEditor`/`MatrixConfigEditor` + paleta "Estructurados"; contracts 230 · API 234 · smoke 22/22) | `feat/objetos-ola4` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **FORM_GUIDE.md — mapa de capacidades del formulario (doc VIVO)** (catálogo de objetos + transversales en lenguaje simple, 7 partes por objeto; regla de doc vivo en §0.3 + cierre de CLAUDE.md + memoria) | `docs/form-guide` → `main` | ✅ fusionado y publicado en `origin/main` (`9421959`) | ninguna |
| **Pulidos de UX del Form Builder** (mín/máx caracteres + contador `CharCounter` en Texto/Párrafo; hover de info en `SectionCanvas`; footer Aceptar/Cancelar en el drawer con revert por snapshot; fix Enter en listas `LinesTextarea`; fix preexistente del spec `logbook-query.service` [storage]; FORM_GUIDE actualizado; contracts 239 · API 234) | `feat/builder-ux-pulidos` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Builder: formateo en vivo + paleta de elementos + modal "Ver más"** (RUT al teclear · número/moneda/porcentaje miles+decimales `FormattedNumberInput` · máscara genérica `config.mask`/`applyMask` · «Decimales» expuesto · footer Aceptar/Cancelar en PROPIEDADES + snapshot · paleta DOCKED `FieldPalette` + scroll `scrollToUid` · modal `FieldInfoModal`+`field-info.ts` con demo en vivo · "objeto"→"elemento") | `feat/builder-formateo-paleta` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Bloque N Hardening (config SMTP en BD + editor de plantillas)** (`SystemSettings.email*` + migración `…_add_email_config` aditiva; `EmailConfigService` [getPublic/getResolved/resolveFrom/set, password AES write-only] + `SmtpEmailService` refactor [BD+cache+firma+verify/sendWith] + `EmailController` `GET/PUT/test/verify settings/email` + permiso `notification:config` [cat. **68**]; sender SUPPRESSED si apagado; web tab "Correo saliente" en `/configuracion` [presets+pistas+probar]; editor con vista previa en vivo + diccionario + insertar-en-cursor + `{{entry.summary}}`; contracts 255 · API 234 · smoke `smoke-email-config.py` 8/8 + `smoke-notificaciones.py` 17/17) | `feat/notif-hardening` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3 Programación de rondas** (`LogSchedule`+`RoundOccurrence` + enum `RoundOccurrenceStatus` + migración `…_add_round_scheduling`; `enumerateOccurrences` puro + config por kind + 2 permisos `schedule:view/manage`; módulo API `schedules/` [CRUD/generate/start/skip/occurrences/stats] + hook de cierre en `LogEntriesService` + `ShiftResolver.calendarForNode`; página `/rondas` + `ScheduleDrawer` + badge en `/bitacoras` + menú/i18n; contracts 249 · API 234 · smoke 21/21) | `feat/programacion-rondas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3.1 Worklist de rondas (separar planificar/ejecutar)** (permiso `round:execute` [cat. 63] + `LogSchedule.responsibleRoleId?` [FK Role SetNull] + migración `…_add_schedule_responsible_role`; `GET /schedules/my-rounds`+`/stats` [responsabilidad EN VIVO por rol ∩ ABAC ∩ turno] + `role-options` + start/skip re-gateados; web `/mis-rondas` [MyRoundsPage] + `/rondas` relabel "Programación de rondas" [monitoreo read-only + selector de rol] + widget Inicio + badge→mis-rondas + nav/i18n; contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 + `smoke-rondas.py` 21/21) | `feat/rondas-worklist` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Bloque N Notificaciones (motor de avisos por correo)** (5 entidades `Notification*` + 4 enums + migración `…_add_notifications` [aditiva]; catálogo `NOTIFICATION_EVENTS` [4] + render sin eval + 4 permisos [cat. **67**]; `@nestjs/schedule`; API `notifications/` [emitter in-tx en `executeTransition`, channel/EmailChannel, resolver ABAC, worker sweeper/dispatcher/sender con backoff, service CRUD+bandeja, `POST /run`]; sweeper GENERA rondas antes de escanear vencidas + SLA breaches; seed 4 plantillas; web `/notificaciones` [Correo saliente/Plantillas/Mis preferencias] + `/mis-notificaciones` + nav/topbar/i18n; contracts 255 · API 234 · smoke `smoke-notificaciones.py` 17/17) | `feat/notificaciones` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.0 Núcleo de Incidencias** (6 entidades `Incident`/`IncidentType`/`IncidentCategory`/`IncidentComment`/`IncidentActivity`/`IncidentTransition` + 3 enums + migración `…_add_incidents` aditiva; `@lyra/contracts/incidents` + 9 permisos [cat. **77**]; `IncidentsService` [ABAC por nodo, workflow reusado + reauth Part 11, catálogos, SLA derivado] + controller + módulo; seed flujo `incidencia-operacional` + 13 tipos + 13 categorías; web `features/incidents/` [/incidencias lista+kanban+GridPager, drawer detalle+stepper+transiciones, modal crear, botón "Reportar incidencia" en el visor] + nav/i18n; contracts 255 · API 234 · smoke `smoke-incidencias.py` 26/26) | `feat/incidencias-nucleo` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.1.0 Excepciones (BACKEND)** (2 entidades `LogEntryException`/`IncidentExceptionLink` + 3 enums + migración `…_add_log_entry_exceptions` aditiva; `@lyra/contracts/incidents/exceptions` + `thresholdExceptionTrigger` + config `warnRaisesException` en NUMBER/TABLE/MATRIX + 4 permisos [cat. **81**]; `ExceptionGeneratorService` @Global [generación síncrona reconciliada en saveSection/seal + purga en VOID, 13.º arg de LogEntriesService] + `ExceptionsService`/controller/module [triage ack/dismiss/correct/convert/associate/manual + dedupe + ABAC + auditoría]; contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39) | `feat/incidencias-excepciones` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.1.1 Excepciones (UI)** (filtro `incidentId` en `exceptionListQuerySchema`+`buildWhere`; web `features/exceptions/` [api/queries/presentation + `ExceptionCard`/`ExceptionDetailDrawer`/`ConvertExceptionModal`/`ExceptionReviewPanel`/`ExceptionsPage`]; panel inline en EntryFillPage/EntryViewerPage + banner "advertir no bloquear" al completar con críticas; bandeja global `/excepciones` + ruta + nav `nav.exceptions`; trazabilidad en `IncidentDetailDrawer`; toggle `warnRaisesException` en `BuilderConfigPanel` [NUMBER umbral+tolerancia]; i18n es-CL; contracts 255 · API 234 · smoke 39/39 + filtro incidentId live) | `feat/incidencias-excepciones-ui` → `main` | ✅ fusionado y publicado en `origin/main` (`3565749`) | ninguna |
| **Fase 4.1.2 Acción del motor de reglas (diferida, outbox)** (`action?` en `crossRuleSchema` + `ruleActionSchema` + `ruleActionKind`/`ruleHasAction` + `validateRulesDesign` exige WARN; `assertRuleActionsValid` server; migración `…_add_rule_action_outbox` [tabla `RuleActionOutbox` + enum + `LogEntryException.sectionKey/fieldKey` nullable]; `RuleActionEmitterService` @Global in-tx en submit/executeTransition + `RuleActionWorkerService` @Cron/`runOnce` + `POST /rule-actions/run` [gate `incident:create`]; `ExceptionGeneratorService.createRuleException`; reusa `IncidentsService.create` con originType=RULE + link; UI selector de acción en `RulesEditor` + excepción RULE sin Corregir; contracts 257 · API 234 · smoke `smoke-reglas-incidencias.py` 21/21 + `smoke-excepciones.py` 39/39) | `feat/incidencias-reglas-accion` → `main` | ✅ fusionado y publicado en `origin/main` (`36bdda9`) | ninguna |
| **Incidencias: equipo/activo + fecha del evento en el alta** (`GET /incidents/equipment-options` ABAC; `Incident.occurredAt` nullable + migración `…_add_incident_occurred_at`; create() hereda equipo de la bitácora de origen; modal con selector Equipo [cascada nodo] + Fecha del evento; detalle muestra "Ocurrió"; smoke `smoke-incidencias.py` 30/30) | `feat/incidencias-equipo-fecha` → `main` | ✅ fusionado y publicado en `origin/main` (`900ad89`) | ninguna |
| **Mantenedor de catálogos de incidencias (Tipos + Categorías) [UI]** (web `features/incidents/` [`CatalogsPage` + `IncidentTypeModal`/`IncidentCategoryModal` + `catalogs.module.css`]; `incidents-api`/`-queries` con upserts + `includeInactive` + hooks admin; ruta `/incidencias/catalogos` + botón header [gate `incidentcatalog:manage`, no en sidebar]; backend: guarda "flujo publicado" en `upsertType` + 409 al crear con key existente vía `?create=true`; swatches de color de tokens DS; sin permisos nuevos cat. 81; sin migración; smoke `smoke-catalogos-incidencias.py` 16/16 + `smoke-incidencias.py` 30/30) | `feat/incidencias-catalogos-ui` → `main` | ✅ fusionado y publicado en `origin/main` (`9b0d436`) | ninguna |

| **Fase 4.2a Acciones CAPA** (`IncidentAction` + 3 enums + migración `…_add_incident_actions` aditiva; `@lyra/contracts/incidents/actions` con DTO/requests/enums + helpers `hasOpenMandatoryActions`/`blockingActionsForClose`/`incidentActionCode`; 2 permisos `incident:action:manage`/`:verify` [cat. **83**]; `IncidentActionsService` [CRUD+complete+verify+cancel, ABAC heredada, timeline+auditoría] + 6 endpoints + guarda `assertNoBlockingActions` en `transition`; web `IncidentActionsBlock` + modales + api/queries + meta; contracts 263 · API 234 · smoke `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 30/30) | `feat/incidencias-capa` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **Fase 4.2b Investigación de causa raíz (5 Porqués)** (`IncidentInvestigation`+`IncidentInvestigationStep` + 2 enums + columna `IncidentAction.investigationStepId` + migración `…_add_incident_investigation` aditiva; `@lyra/contracts/incidents/investigation` con DTO/requests/enums + helpers `hasRootCause`/`isInvestigationComplete`/`investigationBlocksClose` + 8 specs; `IncidentInvestigationService` [get/upsert/complete/reopen, ABAC heredada, timeline+auditoría] + 4 endpoints [gate `incident:edit`] + guarda `assertInvestigationComplete` en `transition`; detalle expone `typeRequiresInvestigation`/`typeRequiresCapa`; web drawer a PESTAÑAS + `IncidentInvestigationBlock` + selector causa raíz en `IncidentActionsBlock` + api/queries; sin permiso nuevo cat. 83; contracts 271 · API 234 · smoke `smoke-incidencias-investigacion.py` 27/27 + regresión 23/23 + 31/31 + reglas 21/21 + excepciones 39/39) | `feat/incidencias-investigacion` → `main` | ✅ fusionado y publicado en `origin/main` (`114b2f1`) | ninguna |

| **Fix: guard de regresión de permisos por sección/campo** (diagnóstico de incidente del dueño: backend INTACTO; causa = el builder dejó de propagar `roleIds` de SECCIÓN en Fase 2.1.x ⇒ versiones v3–v11 publicadas sin gate. 3 guards: web `builder-model.spec.ts` [round-trip detalle→payload], API `templates.service.spec.ts` [saveDraft mapea roles], smoke `smoke-permisos-seccion.py` 10/10 e2e. DECISIONS 2026-06-17. contracts 271 · API 235 · web 3) | `fix/permisos-seccion-guard` → `main` | ✅ fusionado y publicado en `origin/main` (`debe02c`) | ninguna |

| **Fase 4.3 Reportabilidad configurable** (`ReportingObligation` [catálogo: appliesToTypeIds[]/minSeverity/mandatory/defaultDueMinutes] + `IncidentReport` [folio REP-####, snapshot obligación, status PENDING/SUBMITTED/NOT_APPLICABLE/CANCELED, dueAt, externalFolio] + enum + relación en `Incident` + migración `…_add_incident_reporting`; `@lyra/contracts/incidents/reporting` con DTO/requests/enums + helpers `applicableObligationsFor`/`isReportOverdue`/`reportsBlockingClose`/`incidentReportCode` + 12 specs; `IncidentReportsService` [catálogo upsert+409, materialize idempotente, create+dedup 409, submit/not-applicable/cancel, ABAC, timeline+auditoría] + 11 endpoints + guarda `assertNoBlockingReports` en `transition` + materialización en `create` + KPI `reportOverdue`/filtro `reportOverdueOnly`/flag de fila; seed 2 obligaciones ejemplo; web `IncidentReportsBlock` [pestaña Reportes] + `ReportingObligationModal` [sub-pestaña Obligaciones en catálogos] + KPI/chip; SIN permiso nuevo cat. **83**; contracts 283 · API 241 · smoke `smoke-incidencias-reportabilidad.py` 31/31 + regresión incidencias 32/32 · capa 23/23 · investigación 27/27 · excepciones 39/39 · reglas 21/21 · catálogos 16/16) | `feat/incidencias-reportabilidad` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **Notificaciones avanzadas · Fase A BACKEND** (`WorkflowTransition.notifyConfig Json?` [regla de destinatarios CONGELADA en la versión] + `NotificationTemplate.templateId String?` [ámbito por bitácora + índice parcial único genérica] + `SystemSettings.notifyTransitionDefaultDestinationRoles` + 2 migraciones aditivas `…_add_notif_advanced_phase_a`/`…_add_notify_transition_default`; contratos `transitionNotifyConfigSchema` [todos requeridos, sin `.default()`] + `notify` en `workflowTransitionSchema`/`draftTransitionInputSchema` + `pickTemplateForScope` + comodines `{{campo.<key>}}` [`allowedVariablesForTemplate`] + `createNotificationTemplateRequestSchema`/`notificationTemplateListQuerySchema` + `notif-advanced.spec.ts`; `NotificationResolverService` reescrito [destinatarios desde config congelada: roles/usuarios/autor/ejecutor/estado con ABAC + externos sin ABAC auditados + default de sistema; plantilla por ámbito + comodines de versión congelada], `NotificationsService` createTemplate/deleteTemplate/listTemplates(scope)/fieldVariablesFor + endpoints `POST/DELETE /notifications/templates`+`?scope=`+`/field-variables` [whitelist 400, dup 409, genérica no se borra] + `notifications.service.spec.ts`; web builder PRESERVA `notify` en el round-trip [sin UI aún]; SIN permiso nuevo; contracts 292 · API 247 · smoke `smoke-notif-avanzadas.py` 19/19 + regresión notificaciones 17/17 + incidencias/capa/investigación/reportabilidad) | `feat/notif-avanzadas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **Notificaciones avanzadas · Fase A UI** (frontend + mínimo backend: expone `notifyTransitionDefaultDestinationRoles` en `systemSettingsSchema`/`updateSystemSettingsRequestSchema` + `SettingsService` [reusa `GET`/`PATCH /settings`, gate `settings:manage`]; `TransitionNotifyEditor` inline en `WorkflowBuilder` [toggle + MultiSelect roles/usuarios + 3 checks + correos externos chips validados con banner + Select de plantilla + atajo "copiar destinatarios de otra transición" + chip-resumen/columna "Aviso"; pickers `retry:false`]; `NotificationsPage` master-detail [columna Ámbito + filtro scope generic/scoped + "Nueva plantilla" modal → `POST` → editor + borrar ad-hoc + diccionario de comodines de campo `GET …/field-variables` en el editor scoped]; pestaña "Notificaciones" en `SettingsPage` con el toggle de default; web api/queries `fetchNotificationTemplates(query)`/`createNotificationTemplate`/`deleteNotificationTemplate`/`fetchNotificationFieldVariables` + hooks; i18n es-CL; SIN permiso nuevo, SIN migración; contracts 293 · API 247 · web 3 · smoke `smoke-notif-avanzadas.py` 22/22 [+3 sección E] + regresión notificaciones 17/17) | `feat/notif-avanzadas-ui` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **Notificaciones avanzadas · Fase B — canal IN-APP (campanita) + tiempo real** (CIERRA EL ÉPICO; enum `NotificationChannel += INAPP` + `NotificationOutbox.readAt` + índice `(recipientUserId,channel,readAt)` + migración `…_add_notif_inapp_channel`; contratos `NOTIFICATION_CHANNELS += INAPP` + DTOs inbox `inboxItem/ListQuery/ListResponse/UnreadCount` + helper `deepLinkForEntity` + 2 specs; API `InAppChannel`+`NotificationChannelRegistry` [worker enruta por canal], resolver multi-canal [EMAIL+INAPP por preferencia, `dedupeKey` con canal], sender SUPPRESSED solo EMAIL + nudge SSE tras SENT + `@Cron` purga leídas>90d, `NotificationRealtimeService` [bus in-memory], endpoints inbox `/inbox`+`/unread-count`+`/:id/read`+`/read-all`+`/stream` SSE [`@Public`+token query, ownership], preferencias por canal; web `NotificationBell` [Topbar badge+dropdown] + `useInboxRealtime` [EventSource+poll] + `InboxPanel` [bandeja en /mis-notificaciones] + `PreferencesPanel` columna INAPP + `formatRelativeTime`; SIN permiso nuevo [ownership]; contracts 295 · API 247 · web 3 · smoke `smoke-notif-inapp.py` 18/18 + regresión `smoke-notif-avanzadas.py` 22/22 + `smoke-notificaciones.py` 18/18) | `feat/notif-avanzadas-inapp` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **UX del builder de Flujos** (3 ajustes: atajo "copiar destinatarios" movido arriba + condicional · estados colapsables [paridad con transiciones] · fix sticky `.columnHeader` `top:58px`→`0`; solo frontend web/CSS/i18n; typecheck/lint(0)/build verdes) | `feat/builder-flujos-ux` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

| **Fase 5 · Slice 4 EXPORT PDF del acta de entrega** (deps `pdfmake`+`@types/pdfmake`+`@expo-google-fonts/sora`+`/inter`; `shift-handover/acta/` [`acta-renderer.ts` singleton pdfmake + Sora/Inter TTF OFL por ruta con `localAccessPolicy` lista blanca + `urlAccessPolicy=false`; `acta-document.ts` builder PURO `buildActaDocument` modo claro premium + gradiente solo en banda; `acta-hash.ts` SHA-256 de JSON canónico]; `ShiftHandoverService.exportActa` [ABAC + 409 COMPILING + snapshot + breadcrumb + auditoría `shifthandover.acta.exported`] + endpoint `GET /shift-handover/:id/acta.pdf` [`@Res`, gate `RequireAnyPermission(view/compile/sign/acknowledge)`, Content-Disposition significativo]; web `downloadHandoverActa` vía `apiBlob` + botón en cockpit/historial + i18n; SIN migración/permiso/FLUSHALL; api 247 · web 3 · smoke `smoke-acta-pdf.py` 17/17 + regresión cambio-turno 29/29 · ia-config 20/20 · ia-stream 13/13 · notif 18/18 · notif-inapp 18/18) | `feat/cambio-turno-acta-pdf` → `main` | ✅ fusionado y publicado en `origin/main` (`81db4ad`) | ninguna |

| **EST-FIX-ALTO · Paneles maestro-detalle llenan el alto del viewport** (cadena de altura flex rota: `ResizableSplit` no crecía en flex-column + alturas por-página inconsistentes [calc frágil/sin altura]; fix DRY en 2 lugares compartidos: contenedor de `ResizableSplit` `flex:1 1 auto;min-height:0` + variante shell `data-fill-height="pad"` que llena conservando padding; 4 páginas marcan el atributo, se borra el `height:calc()` frágil de calendarios; Logbook/`data-fill-height` a sangre INTACTO; UsersPage ya llenaba; solo CSS/contenedores, tokens, sin libs; typecheck/lint(0)/build/test 252+6) | `fix/layout-altura-paneles` → `main` | ✅ fusionado y publicado en `origin/main` | **PENDIENTE: smoke VISUAL del dueño** (5 páginas, claro/oscuro, escritorio/tablet) |

| **TEMAS FASE 2A · Plantillas de inicio + Duplicar** (catálogo CURADO de **10 plantillas** en `@lyra/contracts/theme/presets.ts` [`THEME_PRESETS`: Grafito/Cobre/Acero/Medianoche/Bosque/Solar/Índigo/Cobalto/Magma/Salitre; constantes, NO BD, NO publicables] + test `presets.spec.ts` [TODAS pasan WCAG AA claro+oscuro] · web botón «Desde plantilla» [`TemplatePicker` modal] + «Duplicar» [borrador «… (copia)»] + `PaletteSwatch` extraído + seed en `PaletteEditor` · clonar/duplicar = clonado en CLIENTE [POST existente] · SIN backend/migración/permiso nuevo · contracts 392 · `smoke-temas-plantillas.py` 11/11) | `feat/temas-plantillas` → `main` | ✅ fusionado y publicado en `origin/main` | **PENDIENTE: smoke VISUAL del dueño** (elegir plantilla → ajustar → publicar; duplicar una paleta) |

**Estado:** todo publicado — `main` = `origin/main` (verificado `git rev-list --count origin/main..main` = 0).

**Convención propuesta (a confirmar):** trabajar cada módulo en rama `feat/<modulo>`;
al cerrar la sesión → push de la rama + merge a `main` + push de `main`. Así `origin/main`
nunca queda más de una sesión atrás.

---

## 2. Pendiente por HACER (módulos / submódulos)

### 🟣 ÉPICO — PREPARACIÓN PARA DISTRIBUCIÓN / CANAL (modelo mayorista marca blanca) 🔒
> **Registrado 2026-07-01.** Contexto de negocio: se vende vía un **socio de canal** (mayorista) que revende a
> los clientes finales (minería/industria) con **marca blanca**; ITESICWS **no** llega al cliente final. Modelo:
> **licencias ANUALES RENOVABLES por tramos de volumen** (ver `docs/estrategia-canal.md` — INTERNO). Este épico
> agrupa TODO lo que falta para poder **distribuir a múltiples clientes on-premise de forma profesional y segura**.
> **Bloquea firmar el canal.** Debe quedar **segurísimo**: software que corre en infraestructura ajena, distribuido
> por un tercero. Docs de referencia: `estrategia-canal.md` (comercial), `LICENSING.md` (spec técnica), `SECURITY.md`
> §9 (distribución segura), `DEPLOYMENT.md` (runbook de flota). Orden de magnitud total: **~255–540 HH**.
>
> **Regla de corte:** NO firmar el canal sin, al menos, (1) licenciamiento + (2) marca blanca + (4) seguridad de
> cadena de suministro. La orquestación de flota (3) se puede diferir hasta tener ~3–5 clientes (con 1–2 se hace a
> mano con el `update.sh` actual).

- [ ] **(1) Módulo de licenciamiento / activación** (~80–160 HH) — **spec cerrada en `docs/LICENSING.md`.**
      Llave firmada **Ed25519 OFFLINE** (JWS): `installationId`, vencimiento + `graceDays`, topes
      (`maxInstallations`/`maxNodes`/`maxNamedUsers`), `modules[]` habilitados, `edition`, `whiteLabel`. Verificación
      al arranque + periódica → máquina de estados (VÁLIDA/POR VENCER/GRACIA/BLOQUEADA=solo lectura, nunca borra
      datos) + gating de módulos por *entitlement* (eje distinto del RBAC). CLI de emisión. **SEGURIDAD:** custodia
      de la clave privada en **HSM/secret manager** (NUNCA en repo/imagen/.env), verificación **distribuida** (no un
      solo `if`), empaquetado anti-tamper del módulo crítico (bytecode V8 / binario nativo). Antipirateo = disuasión
      por capas + dependencia de updates, **no bóveda** (documentado honestamente en LICENSING §7).
- [ ] **(2) Modo marca blanca COMPLETO** (~60–120 HH) — hoy los temas son override PARCIAL en runtime y el **login
      queda con marca Lyra** (ver memoria `theme-system`). Falta: **nombre de producto configurable** en toda la app,
      **login personalizable**, branding en el **acta PDF** y en los **correos** salientes. Sin rebuild (runtime),
      gobernado por la licencia (`whiteLabel:true`). Reusa el sistema de temas EST-TEMAS.
- [ ] **(3) Orquestación de flota / actualización multi-cliente** (~75–160 HH) — **runbook en `DEPLOYMENT.md`.**
      Hoy el pipeline actualiza UNA instalación (`update.sh`: backup→pull→migrate→healthcheck→rollback→prune). Para
      N clientes falta: **(3a) inventario/reporte de versión** por instalación (endpoint `/version` o *heartbeat* del
      módulo de licencia, reusa `installationId`) ~20–40 HH · **(3b) actualizador estandarizado / agente** con
      **aprobación** (versión "aprobada" + ventana de mantención; sin SSH manual en 10 máquinas) ~40–90 HH · **(3c)
      bundle AIR-GAPPED** (`docker save`/`load` + migración empaquetada, para plantas SIN internet — muy común en
      minería) ~15–30 HH · **(3d) despliegue por ANILLOS (canary)**: actualizar 1–2 clientes conejillo → verificar →
      resto (NO los N de golpe). Recordatorio: migraciones `prisma migrate deploy` son **solo-hacia-adelante**; el
      rollback revierte imágenes, NO el esquema ⇒ el **backup pre-update es la red** (ya existe en `backup.sh`).
- [ ] **(4) Distribución SEGURA / cadena de suministro** (~40–100 HH) 🔒 — **requisitos en `SECURITY.md` §9.** Software
      que corre en infra ajena y lo despliega un tercero ⇒ blindar la cadena: **firma de imágenes** (cosign/Sigstore)
      + **verificación de firma** en el host antes de correr · **pull por DIGEST fijo** (no solo por tag mutable,
      reproducibilidad e integridad) · **registro privado** con credenciales/tokens **read-only por cliente**
      (revocables) · **escaneo de vulnerabilidades** de imágenes (Trivy/Grype) **antes de publicar** + gate en CI ·
      **SBOM** (CycloneDX) por release para auditoría del cliente · **backups cifrados** (hoy `pg_dump -Fc` sin
      cifrar) · **secrets por instalación cifrados** en reposo · **TLS** en todo (ya vía Caddy). Objetivo: que un
      cliente/auditor pueda **verificar** que la imagen que corre vino de ITESICWS y no fue alterada.
- [ ] **(5) Hardening del stack de producción para distribución** (parte hereda deuda Fase 7) — `install.sh`
      idempotente (hoy bootstrap manual), healthcheck del `web`/borde, observabilidad/logs centralizados **opt-in por
      cliente** (sin sacar datos de la planta salvo consentimiento), `pull_policy`/digests fijos, límites de recursos
      (ya hechos), y checklist de **hardening del host** entregable al cliente/socio (firewall, actualizaciones de SO,
      backups verificados, rotación de secretos).

### 🟢 ÉPICO — MÓDULO DE ÓRDENES DE TRABAJO (OT / Permiso de Trabajo · PTW) 🏗️ **PRIORIDAD (oportunidad de cliente)**
> **Registrado 2026-07-01** (planificación aprobada por el dueño; **diseño formal detallado = Sesión 0**). Contexto:
> hay una **oportunidad real de cliente en MINERÍA** para absorber con Lyra WatchLog un flujo de **Solicitud de Trabajo
> → Requerimiento/Orden de Trabajo con Permiso de Trabajo (PTW)**. Es el patrón enterprise EAM/CMMS (SAP PM Aviso→Orden,
> IBM Maximo) + PTW de alto riesgo (LOTO/bloqueo de energías, trabajo en altura, espacios confinados, ART; exigido por
> **DS 132 / SERNAGEOMIN**, ISO 45001). **El caso de uso financia el módulo**, que queda como producto reutilizable (IP
> ITESICWS). ~**70% de la maquinaria transversal YA existe** (workflow configurable, form builder = motor de checklists,
> `IncidentAction`/CAPA como base de actividades, Bloque N para alertas/SLA, `IncidentDashboardService` como plantilla de
> dashboard, RBAC/ABAC, auditoría inmutable, firmas Part 11, `FolioCounter` diseñado). Ver DECISIONS 2026-07-01 y memoria
> `work-orders-module-plan`.
>
> **4 fases / 4 puertas de aprobación:** (1) Solicitud→Aprobación inicial · (2) Preparación→Revisión de checklists ·
> (3) Planificación→Autorización del plan · (4) Ejecución/Seguimiento→Cierre definitivo. **Reglas duras:** el **folio
> nace SOLO al aprobar** (no al crear = evita "basura digital"/duplicados); **sin "botón de pánico"** (checklist
> obligatorio rechazado BLOQUEA el avance); **plan base congelado** (permite medir desviación); **cierre gobernado** por
> guards. Trazabilidad 360° + alertas democratizadas (responsable+supervisor+solicitante+gerencia).
>
> **Modelado como entidad NUEVA `WorkOrder`, espejo de `Incident`** (NO se mete en `LogEntry` ni en `Incident`): reusa
> el motor de workflow para las 4 puertas **CONFIGURABLES** (un cliente puede usar 1 o 4). Nace de las mismas fuentes que
> una incidencia (directa / regla en bitácora / excepción) **+** planificada; una **Incidencia puede gatillar una OT**.
> **DIFERIDO explícitamente (decisión del dueño 2026-07-01):** la capa de **entitlements / activación de módulo por
> contrato** (que Incidencias y OT sean activables según lo licenciado) se aborda dentro del **épico de licenciamiento
> §2(1)**, NO en este épico. Por ahora la visibilidad es solo RBAC (`module:workorders:view`).
>
> **Orden de magnitud total: ~397 HH.** Paquete comercial recomendado: **S1–S5 (MVP, cierra el caso de uso, ~195 HH)**
> + **S6–S7 (control/dashboard, ~80 HH)**; **S8 (enterprise, ~108 HH) = evolución opcional**. Sesiones chicas y
> cerrables (opción 2, elegida por el dueño), cada una con el ciclo completo (código→verde→docs→memoria→commit→push→
> prompt de la siguiente).

- [x] **Sesión 0 — Diseño y aprobación (SIN código, ~14 HH):** ✅ **CERRADA 2026-07-01** (commit `1a3131b`).
      `docs/design/OT_DESIGN_ARCHITECTURE.md` (schema Prisma de las entidades nuevas, relaciones con Incidencia/Bitácora,
      catálogo de permisos `group:"workorders"`, workflow base de 4 puertas configurables + mecánica de folio-al-aprobar,
      `FolioCounter` nuevo, qué va a `packages/`, 8 forks W1–W8, plan S1–S8). **Forks W1–W8 APROBADOS por el dueño**
      (DECISIONS 2026-07-01). **Deuda anotada:** extraer un `WorkflowExecutorService` compartido (LogEntry/Incident/
      WorkOrder = 3.ª copia del ejecutor de transición) = sesión dedicada con tests, NO dentro de OT. **← Sesión 1 arranca
      en sesión NUEVA.**
- [x] **Sesión 1 — Cimientos (~40 HH):** ✅ **CERRADA 2026-07-01** (`feat/ot-cimientos`). Entidad `WorkOrder` (+ enums
      Origin/Priority/Lifecycle) + catálogos `WorkOrderType`, `Area`/`Specialty` (N:N `WorkOrderArea`/`WorkOrderSpecialty`);
      migración `20260701180000_add_work_orders`; back-relations en OrgNode/Equipment/Role. **Folio/workflow INERTES**
      (campos presentes, se activan en S2); `WorkOrder.number` → handle provisional "SOL-######". 8 permisos grupo
      `workorders`. Contratos `packages/contracts/src/work-orders/`. Backend CRUD catálogos + create/list/detail/update/
      assign/cancel con ABAC nodo ∩ estructura (`?structureId=`), auditoría, sin borrado físico. Seed (5 tipos/4 áreas/5
      especialidades). Web `/ordenes-trabajo` (grilla+facetas+paginación arriba/abajo + wizard 2 pasos + drawer detalle).
      verde (typecheck/lint/build/test) + `smoke-workorders.py` **31/31**. **La solicitud nace OPEN** (DRAFT reservado
      para el estado `borrador` del flujo, S2). **DEUDA registrada:** SavedView de OT (y de Incidencias) = slice
      transversal pendiente — ver §3. **Siguiente = Sesión 2.**
      - [x] **Anexo (post-S1) — Mantenedor de catálogos de OT + seed de industria ✅ 2026-07-01** (`feat/ot-catalogos`):
            pantalla `/ordenes-trabajo/catalogos` (gate `workordercatalog:manage`, botón en header, `inSidebar:false`) +
            seed realista CMMS/EAM. **Cierra la deuda del mantenedor de catálogos de OT.**
      - [x] **Ajuste (post-S1) — ELIMINADO el catálogo `Area` ✅ 2026-07-01** (`feat/ot-quitar-area`, migración
            `20260701190000_drop_work_order_area`): duplicaba la jerarquía de ubicación (`OrgNode`, que tiene nivel "Área");
            los EAM líderes (SAP PM Functional Location / Maximo Location) usan la ubicación para eso. Modelo final =
            **ubicación=nodo · disciplina=`Specialty` (Work Center/Craft) · tipo=`WorkOrderType`**. El mantenedor queda con
            **Tipos + Especialidades**. Ver DECISIONS 2026-07-01. smoke **32/32**.
      - [ ] **(S6–S8) "Grupo responsable / de planificación" (Planner Group / Work Group)** — agrupación transversal de
            responsabilidad que cruza nodos (SAP *Planner Group*, Maximo *Work Group*), para enrutamiento/backlog por grupo,
            KPIs y **aprobadores automáticos**. NO se llama "Área" y va **fuera del formulario del solicitante** (lo fija el
            planificador). Se evalúa cuando exista workflow/alertas/dashboard (S6–S8), solo si aporta.
      - [x] **Responsive (post-S1) — grillas OT + Incidencias en tablet/móvil ✅ 2026-07-01** (`feat/ot-responsive`):
            filtros que envuelven, selects full-width <900px, área táctil 44px; tabla con scroll horizontal. Solo CSS.
- [x] **Sesión 2 — Aprobación inicial + folio al aprobar / Puerta 1 (~35 HH):** ✅ **CERRADA 2026-07-01**
      (`feat/ot-puerta1`). Workflow CONGELADO al crear (flujo del tipo o global **"OT — 4 puertas PTW"** sembrado como
      DATO, fork W6; 11 estados — la anulación NO es estado, es el endpoint `cancel`); la solicitud **nace `borrador`/
      DRAFT** (reemplaza el "nace OPEN" de S1). Ejecutor `transition()` espejo de Incidencias (rol-dato + firma Part 11
      re-autenticada; **permiso NUEVO `workorder:transition`** dim. WORKFLOW, catálogo → 100). **`FolioCounter`** (PK
      `sequenceKey`) + `FolioService.next(tx,…)` atómico `ON CONFLICT … RETURNING` + formateo puro en contracts
      (`folio.ts`; default por-tipo + anual ⇒ **OT-2026-0001**, gapless verificado …-0002). Semántica data-driven:
      aprobación = entrar a `folioOnStateKey` (default "aprobada") ⇒ folio+`approvedAt`; **rechazo = final sin aprobación
      ⇒ motivo OBLIGATORIO** + CANCELED. Satélites `WorkOrderTransition`+`WorkOrderEvent` (migración
      `20260701210000_add_work_order_workflow_folio`). Web: stepper + botones + modal firma + rechazo + timeline; grilla
      con estado del flujo y folio. verde + smoke **51/51** + regresión incidencias 32/32. Ver DECISIONS 2026-07-01 S2.
      **DEUDAS registradas:** editor UI de `folioScheme`/`folioOnStateKey` en el mantenedor de tipos (hoy API-only, §3) ·
      payloadHash de firmas de transición = deuda compartida con Incidencias (ya listada). **Siguiente = Sesión 3.**
- [x] **Sesión 3 — Motor de checklists ligados / Puerta 2 (~45 HH):** ✅ **CERRADA 2026-07-02** (`feat/ot-puerta2`).
      2 capas (fork W5): **Capa A** `WorkOrderChecklistRule` (plantilla del Form Builder + reglas de aplicabilidad
      appliesToTypeIds/minCriticality/specialtyId/requiresPtw, patrón `ReportingObligation`; gate `workordercatalog:manage`);
      **Capa B** `WorkOrderChecklist` (enlace OT↔plantilla + `logEntryId` vivo + estado PENDING/IN_PROGRESS/SUBMITTED/
      APPROVED/REJECTED; gate **permiso NUEVO `workorder:checklist:manage`**). Al ENTRAR al estado de preparación el ejecutor
      SUGIERE automáticamente los aplicables (idempotente) + agregado manual. Instanciación = `LogEntry` vivo (reusa
      `LogEntriesService.create`, se llena/sella con el Form Builder). **Guard Puerta 2** `assertChecklistsComplete` (PURO
      `blockingChecklistsForClose` en contracts) bloquea `revisar_checklists` si hay obligatorio no APPROVED. **Segregación:**
      revisor ≠ responsable (403). Claves de estado **data-driven** en `WorkOrderType` (`checklistSuggestStateKey`/
      `checklistGateStateKey`, default por constante — paridad con `folioOnStateKey`). Migración
      `20260702120000_add_work_order_checklists`. Seed: plantilla LOTO publicada + regla obligatoria transversal. Web:
      pestaña "Checklists" en el drawer + sub-tab "Reglas de checklist" en `/ordenes-trabajo/catalogos`. verde
      (typecheck/lint/build/test) + contracts **412** + smoke-workorders **65/65** + regresión incidencias 32/32.
      Ver DECISIONS 2026-07-02. **Siguiente = Sesión 4.**
- [x] **Sesión 4 — Plan de actividades / Puerta 3 ✅ HECHA 2026-07-02** (`feat/ot-puerta3`; ver PROGRESS + DECISIONS
      2026-07-02). Entregado: **`WorkActivity`** (entidad propia, fork W1; sin `WorkActivityUpdate`, difiere a S5);
      **`autorizar_plan`** exige ≥1 actividad + **congela baseline** (`planned*→baseline*`) + `planFrozenAt` + evento
      `PLAN_FROZEN`; plan **inmutable** tras congelar; guards puros `planNotFrozen`/`blockingActivitiesForClose`/
      `planReadyToFreeze` en contracts; permiso **`workorder:activity:manage`** (cat. 102); claves data-driven
      `planFreezeStateKey`/`executeStateKey`; **(a) REORDEN del flujo al estándar** (planificar→autorizar permiso→ejecutar,
      §11.3; seed republica v2, in-flight intactos); **(e) UX** pestaña "Plan" con **grilla + asistente guiado** (`Stepper`,
      defaults desde la OT, alta en lote). smoke-workorders **78/78** + regresión incidencias 32/32.
      **↳ MOVIDO A S5 (acotación del prompt del dueño):** (b) eje `momento` en `WorkOrderChecklistRule`
      (REQUEST/PLANNING/AUTHORIZATION/EXECUTION/CLOSURE); (c) checklists de **EJECUCIÓN** ligados a `WorkActivity`
      (candados/energía cero/LMRA en terreno, §11.4); (d) **visibilidad del aprobador (Gobierno 2)** en Puerta 2 (ve/confirma
      el set de ejecución, §11.5).
      **Diferido a backlog (solo con caso real, §11.7):** puntos de espera/testigo de calidad (guard por actividad);
      inspección independiente/doble firma (aviación RII); requisitos condicionales por reglas; y **gobernanza de aprobación
      de plantillas de checklist** (Gobierno 1, §11.5: hoy = publicar en el Form Builder; formalizar si se pide).
      **DEUDA fina S4:** editor UI de `planFreezeStateKey`/`executeStateKey` (junto al de `folioScheme`/claves de checklist);
      cronológicamente P3 va antes que P2 (el rótulo "Puerta N" del diseño es solo referencia; la UI muestra nombres de
      etapa). Dependencias/ruta crítica = solo la columna `dependsOnId` (S8).
- [x] **Sesión 5a — Seguimiento vivo del avance + cierre / Puerta 4 ✅ (2026-07-02, `feat/ot-seguimiento-cierre`) → CIERRA
      EL MVP Solicitud→Cierre:** `WorkActivityUpdate` (append-only: estado/% avance/fechas reales/nota/desviación/motivo;
      costos/HH/evidencia reservados S8) + `recordProgress`/`listUpdates` (foto vigente denormalizada + `updatesCount`/
      `lastProgressAt` + eventos ACTIVITY_PROGRESS/_DONE/_BLOCKED + `assertProgressable`); helpers puros
      `effectiveProgressPct`/`activityDeviationLabel`; **cierre** verificado punta a punta (guards `blockingActivitiesForClose`/
      `planNotFrozen` + firma Part 11 + `closureSummary` ya de S4; bloqueos EXPLICADOS). Reusa `workorder:activity:manage`.
      Web: pestaña «Plan» viva (columna Avance + modal «Registrar avance» + historial expandible). smoke-workorders **90/90**
      + incidencias 32/32.
- [~] **Sesión 5b — Checklists por `momento` + Gobierno 2 (~20–25 HH):** partida en 2 slices (visto bueno del dueño).
  - [x] **Slice A ✅ (2026-07-02, `feat/ot-checklists-momento`):** (b) eje `momento` en `WorkOrderChecklistRule` **y**
        `WorkOrderChecklist` (default AUTHORIZATION, retrocompatible; §11.2) mapeado a estados por dato
        (`closureChecklistSuggestStateKey`, paridad `folioOnStateKey`); **+ checklist de CIERRE del permiso per-OT** (§11.4.3):
        sugerido al entrar a `en_revision_cierre`, BLOQUEA el cierre si obligatorio sin aprobar (guard
        `assertChecklistsCompleteForMoment`/`blockingChecklistsForMoment`). UI: Combobox «Momento» + «Verificaciones» agrupada
        por momento + columna en catálogo. Sin permiso nuevo. `smoke-workorders.py` 95/95 + incidencias 32/32.
  - [x] **Slice B ✅ (2026-07-02, `feat/ot-ejecucion-gobierno2`):** (c) checklists de **EJECUCIÓN** por actividad
        (`WorkOrderChecklist.workActivityId` → `WorkActivity` SetNull; unique `(workOrderId, templateId, workActivityId)`;
        materializados al PREPARAR — una fila por actividad × regla EXECUTION que matchee **por especialidad de la actividad**,
        `applicableExecutionRulesForActivity`; **gate por actividad** `assertActivityExecutionComplete` al marcar DONE + backstop
        `assertChecklistsCompleteForMoment(EXECUTION)` al cerrar, §11.4.2); (d) **Gobierno 2** (el aprobador VE/CURA/CONFIRMA el set
        de ejecución — filas por actividad — con agregar/quitar + sello `WorkOrder.executionSetConfirmedAt/ById`, **gate al
        autorizar** `assertExecutionSetConfirmed` + auto-limpieza al curar; reusa `workorder:checklist:manage`, §11.5). Migr.
        `20260702220000`. UI: «Verificaciones» grupo EJECUCIÓN sub-agrupado por actividad + banner/botón «Confirmar set de
        ejecución» + indicador en «Plan». Sin permiso nuevo. `smoke-workorders.py` **108/108** + incidencias 32/32. **Cierra §11.**
        DECISIONS 2026-07-02 (Slice B).
- [x] **Sesión 6 — Alertas, SLA y semáforos / "vigía digital" ✅ (`feat/ot-sla-semaforos`, 2026-07-02):** 3 eventos
      `workorder.overdue`/`.stalled`/`.activity.overdue` (se descartó `.sla.breached` por redundante con overdue: `resolutionDueMinutes`
      CALCULA `dueAt`, no es un evento) + escalamiento OT-level (1 nivel, re-aviso diario) + semáforo `workOrderTrafficLight`
      (columna+chip) + KPIs/filtro `slaStatus` sobre la grilla existente (el "panel de seguimiento" NO es vista nueva). `dueAt`
      ancla AL APROBAR (override manual gana). ESPEJO Fase 4.4 (clon `IncidentSlaService`/resolvers/helpers). Reusa Bloque N +
      `WorkOrderSlaService.findBreaches`. Sin migración/permiso nuevo. contracts 448 + smoke-workorders 122/122. **DEFERIDO a
      futuro (no pedido):** curva de alerta esperado-vs-real / detección de incoherencia del avance; escalamiento multinivel (S8);
      breach de permanencia (`stalled`) sólo se ve si el flujo configura `maxStayMinutes` por estado (hoy el seed no lo hace).
- [ ] **Sesión 7 — Dashboard de OT + integración Incidencia→OT (~40 HH):** `WorkOrderDashboardService` (clon del de
      incidencias: KPIs, cuellos de botella, tendencia, drill-down, export CSV); botón "Generar OT" desde incidencia/
      excepción/bitácora con enlace bidireccional. **Fin del paquete comercial recomendado.**
- [ ] **Sesión 8 — Enterprise / opcional (~108 HH, Fase 3):** aprobadores dinámicos por reglas (área/criticidad/
      especialidad/monto/riesgo, reusa el motor de reglas); dependencias/ruta crítica; costos/HH + reportes/export;
      escalamiento multinivel. Puede subdividirse al llegar.
- [ ] **IDEA DEL DUEÑO (2026-07-02) — GANTT de actividades del plan (~15–25 HH):** en la pestaña «Plan de actividades»,
      un **botón que levante un GANTT** (modal/pantalla) para ver el espectro completo del plan de forma profesional
      (barras por actividad sobre una línea de tiempo, con **baseline vs plan vs real**, dependencias `dependsOnId` y, más
      adelante, ruta crítica de S8). Encaja con S8 (dependencias/ruta crítica) o como slice de visualización propio.
      Evaluar librería (p. ej. una de Gantt liviana o SVG propio, respetando tokens del DS y modo claro/oscuro).
- [ ] **IDEA DEL DUEÑO (2026-07-02) — Grilla de OT ENRIQUECIDA (~10–18 HH):** en `/ordenes-trabajo`, mostrar por fila
      **más información de un vistazo**: nº de **actividades** configuradas (y % avance), nº de **verificaciones**
      (checklists) y su estado (p. ej. "2/3 aprobadas"), quizás SLA/desviación, y un **acceso directo** (ícono) para abrir
      el **Gantt** del plan sin entrar al detalle. Requiere que el listado (`WorkOrderListItem`/`list()`) devuelva esos
      conteos (agregados eficientes por OT). Alinéalo con el slice de columnas/`SavedView` (elegir qué columnas ver).
- [ ] **SLICE FUTURO — Plantillas de plan / "job plans" (task lists) (~20–30 HH; posterior a S4):** biblioteca de
      **planes de actividades predefinidos** por tipo de OT (equivalente a SAP PM *task list* / Maximo *job plan*): el
      planificador **parte de una plantilla** (p. ej. "Cambio de rodamiento" → precarga N pasos estándar) y la ajusta, en
      vez de armar el plan desde cero. Es el mayor salto de usabilidad **y** el estándar real de la industria. Merece su
      propio slice (no meterlo en S4): definir el modelo (¿reusar `Template`/nuevo `WorkPlanTemplate`?), CRUD de la
      biblioteca (gate catálogo), y "aplicar plantilla" en el asistente de plan de S4. Decisión del dueño 2026-07-02:
      **registrado como slice siguiente al plan de actividades.**

> **✅ BUG folio cross-tipo — CORREGIDO 2026-07-02 (`fix/ot-folio-global`).** *Síntoma:* aprobar una 2.ª OT (de otro
> tipo) daba **Internal Error** (500 `Unique constraint failed: folio`). *Causa:* el default `folioScheme` era **scope
> `type`** (contador por tipo) pero `renderFolio` produce `OT-2026-0001` SIN el tipo y `WorkOrder.folio` es **@unique
> GLOBAL** ⇒ dos tipos colisionaban en el mismo string. *Fix (opción (a), estándar SAP/Maximo):* `DEFAULT_WORK_ORDER_FOLIO_SCHEME.scope`
> = **`global`** ⇒ una sola serie anual `OT-2026-0001, 0002…` global-única (formato intacto). **Reconciliación** en `seed.ts`
> (`reconcileWorkOrderFolioCounters`, idempotente): fija el contador `workorder|global|<año>` al mayor folio existente del
> año para no re-emitir uno ya usado. Los folios existentes (`Solicitud de Prueba` 0001, `Reparacion de cable` 0002) quedan
> intactos; la siguiente OT toma `0003`. Un cliente que quiera serie POR TIPO debe usar una `mask` con el tipo en
> `WorkOrderType.folioScheme`. folio.spec actualizado (413) + smoke 65/65 + aprobación real verificada.
> **Deuda relacionada (sigue abierta): editor UI de `folioScheme`/`folioOnStateKey`** en el mantenedor de tipos (hoy
> API-only).

> ~~**DEUDA S3 (menor) — marcador `Template.purpose` (fork W5) DIFERIDO.**~~ **✅ HECHO 2026-07-02** (`feat/ot-template-purpose`,
> a pedido del dueño): columna **`Template.purpose`** (enum `TemplatePurpose?`, hoy `CHECKLIST`; null = general; migr.
> `20260702190000_add_template_purpose`) + `purpose` en contrato (templateSchema/create/update) y servicio + **selector
> «Propósito de la plantilla» en el Form Builder** (General / Checklist, gobernanza viva vía `updateMeta`) + el **picker de
> reglas de checklist filtra por defecto a `purpose=CHECKLIST`** (Combobox buscable) con toggle «ver todas» y fallback a
> todas si aún no hay ninguna marcada; seed marca la plantilla LOTO. smoke-workorders 78/78. *(Filtrado en el CLIENTE por
> ahora; si el catálogo crece mucho, agregar `?purpose=` a `/templates` — deuda menor.)*

### 🟡 DEUDA UX — Alinear el detalle de Incidencias al patrón Object Page (~6–10 HH)
> **Decisión del dueño (2026-07-02):** OT migró su detalle de **drawer lateral → página dedicada** (Object Page, ruta
> `/ordenes-trabajo/:id`, deep-linkable, cuerpo a todo el ancho + panel lateral; ver DECISIONS/PROGRESS). **Incidencias
> sigue usando el `IncidentDetailDrawer`** (720px). Para coherencia del producto, migrarlo al mismo patrón: nueva ruta
> `/incidencias/:id` + `IncidentDetailPage` (reusar el layout de `WorkOrderDetailPage`: header + CTA de etapa + stepper +
> 2 columnas), `IncidentsPage` navega con `useNavigate`, eliminar el drawer. Se dejó para una sesión aparte (no tocar dos
> módulos a la vez). *(Si conviene, extraer un `ObjectPageLayout` reutilizable en `packages/ui` al hacerlo.)*
> **+ Deuda relacionada:** el **`WorkflowDiagram`** (diagrama gráfico del flujo) vive en `features/logbook` y ahora la
> página de OT lo importa **cross-feature**. Cuando se toque, **extraerlo a `packages/ui`** (es presentacional puro:
> depende solo de contracts + i18n + `lib/format`) para que OT/Incidencias/Bitácoras lo compartan sin acoplarse entre features.

### 🟡 DEUDA TRANSVERSAL — Vistas guardadas (`SavedView`) para Incidencias **y** Órdenes de Trabajo (~15–20 HH)
> **Decisión del dueño (2026-07-01): DEJAR PENDIENTE para AMBOS módulos** (no hacerlo solo para OT). Hoy `SavedView`
> (vistas guardadas: filtros + búsqueda + orden + columnas + densidad, ownership-gated, con vistas de sistema en código)
> **solo está cableado en Bitácoras** (`SAVED_VIEW_MODULES = ["LOGBOOK"]`). Ni Incidencias ni OT lo tienen; construirlo
> solo para OT rompería la paridad con su módulo hermano. Cuando se aborde, hacerlo **de una vez para los dos**:
> - Agregar `"INCIDENTS"` y `"WORK_ORDERS"` al enum `SavedViewModule` (`packages/contracts/src/saved-views/saved-views.ts`).
> - Reusar `SavedViewsService` tal cual (genérico por `module`, cero cambios de backend) — patrón ya probado en Bitácoras.
> - En cada grilla (`IncidentsPage`, `WorkOrdersPage`): `ViewBar` (selector + guardar/actualizar/eliminar + default),
>   serializar la query actual → `config.filters` y rehidratarla al aplicar; opcional gestor de columnas/densidad.
> - Definir 2–3 **vistas de sistema** por módulo (ej. OT: "Mías", "Sin responsable", "Requieren PTW"; Incidencias:
>   "Críticas abiertas", "Plazo vencido").
> Hoy las grillas ya filtran/ordenan/paginan/facetan; lo que falta es **persistir la combinación con nombre**. NO bloquea el MVP.

### 🔴 MÓDULO CANDIDATO #1 (decidido 2026-06-22) — Corrección / Anulación GxP de registros SELLADOS
> **Recomendado como el PRÓXIMO módulo tras la ronda de prueba manual (antes de Fase 3/6).** Es el pendiente
> de auditoría más serio: hoy un registro **SELLADO** (firmado, inmutable) no tiene una vía gobernada de
> **anulación/corrección**. En entorno regulado (FDA 21 CFR Part 11 **§11.200**, ALCOA+) NUNCA se borra un
> registro firmado, pero **debe poder emitirse una corrección/anulación TRAZABLE** mediante una **transición
> inversa firmada** que deje el original intacto + rastro del porqué. El modelo append-only ya lo soporta
> conceptualmente. **Por qué es módulo aparte y NO un "cierre rápido":** toca el motor de flujo (transición
> inversa), un nuevo *significado* de firma, persistencia de firma (`IncidentSignature` / generalizar
> `LogEntrySignature` con `payloadHash`), reglas de quién puede revertir qué, y auditoría reforzada. Hacerlo
> apurado *añade* riesgo de auditoría. **Unifica:** BACKLOG 2.5(a)(d) [reversa/anulación de transición +
> anulación de entrada sellada], 2.8.2 [VOID GxP de SELLADAS] y la deuda de firma con `payloadHash`.
> Esperar a que la ronda QA confirme prioridad para el cliente.

### Fase 5 — Cambio de turno / Shift Handover (Slices 1–4 ✅ → FASE COMPLETA)
> Plan por slices aprobado (DECISIONS 2026-06-18). **Los 4 slices HECHOS y publicados.**
- [x] **Slice 1 — Núcleo:** entrega firmada de 2 partes (compilar→firma saliente→acuse entrante), cockpit 3 zonas, baton que rueda,
  snapshot congelado, `handover.ready`, historial ABAC, resumen determinista. `feat/cambio-turno`. smoke 29/29.
- [x] **Slice 2 — Fundación `@lyra/llm` + IA ADMINISTRABLE DESDE LA APP ✅** (`feat/ia-administrable`, 2026-06-18). Construido y
  verificado: `@lyra/llm` (interfaz + adapters none/anthropic/openai-compatible + prompt versionado, decoplado de contracts) ·
  `AiSettings`/`AiGenerationLog` (config cifrada/write-only + registro de costo) · endpoints `/settings/ai` + Probar + permiso
  `ai:config` + auditoría · tab "Inteligencia Artificial" · resumen de turno por IA grounded (degradación elegante, crudo visible,
  firma humana). smoke `smoke-ia-config.py` **20/20**. **Cumple AC-IA-1..6; AC-IA-7 parcial (prompt versionado + clave cifrada;
  scrubber de PII explícito = deuda).** Forks resueltos en DECISIONS 2026-06-18 (tabla dedicada · proveedor global · log de generaciones
  · streaming diferido). **Pendiente: smoke VISUAL del dueño.**
- [x] **Slice 3 — Resumen IA generativo + STREAMING ✅** (`feat/cambio-turno-resumen-ia-streaming`, 2026-06-19). Token a token vía SSE
  (`@Sse` + token por query, espejo del inbox; endpoint dedicado `GET /shift-handover/:id/summary/stream`). `@lyra/llm` ganó `LlmStream`
  + `generateSummaryStream` en los 3 adapters (sin reescribir consumidores). **Prompt → v2** (priorización + guarda anti-inyección).
  **Scrubber de PII** (`scrubGrounding` + política `egressesPlant`): redacta correo/RUT/teléfono **solo si la generación egresa de la
  planta** (AC-IA-7 parcial). Persistencia al completar vía el PATCH auditado (`summaryProvider`). Degradación stream→no-stream→determinista.
  Crudo y firma humana intactos. smoke `smoke-ia-stream.py` **13/13** + regresión (ia-config 20/20, cambio-turno 29/29, notif 18/18, notif-inapp 18/18).
  **Pendiente: smoke VISUAL del dueño.**
- [ ] **Deuda IA (Slices 2–3):** panel de **costo/uso** sobre `AiGenerationLog` (tokens/latencia/$ por proveedor/periodo) · **scrubber de
  PII más completo** (nombres; hoy cubre correo/RUT/teléfono al egresar) · plantilla de prompt por capacidad para Fase 6 (insights/RAG
  reusan `@lyra/llm`) · **streaming multi-instancia** (el aborto/heartbeat es in-proc, como el bus SSE del Bloque N; respaldo Redis si se escala).
- [x] **Slice 4 — EXPORT PDF del acta de entrega ✅** (`feat/cambio-turno-acta-pdf`, 2026-06-19). Acta de grado auditoría desde el
  snapshot congelado: motor **pdfmake** (NO Chromium; Sora/Inter TTF OFL embebidas), builder PURO `buildActaDocument`, endpoint
  `GET /shift-handover/:id/acta.pdf` (`@Res`, gate de lectura reusado, **ABAC**, **409** en COMPILING, auditoría `shifthandover.acta.exported`),
  **hash SHA-256 de JSON canónico** del snapshot+firmas (determinista, sin persistir, sin migración), botón en cockpit/historial vía
  `apiBlob`. Sin permiso nuevo. smoke `smoke-acta-pdf.py` **17/17** + regresión. **Pendiente: smoke VISUAL del dueño.**
- [ ] **Deuda Slice 4:** persistir el artefacto en **MinIO** (+ `snapshotHash` columna) si la carpeta regulatoria exige el binario
  archivado · **verificador público de hash** (subir un PDF/folio y validar integridad) · usar el `integrityHash` como **payloadHash de
  la firma Part 11** (cierra la deuda de firma de abajo) · export PNG/CSV del acta si se pide.
- [ ] **Deuda menor Slice 1:** disciplinas/categorías por taxonomía de catálogo (hoy secciones por tipo de dato) · firma con hash
  criptográfico del payload (hoy reauth Part 11 + método/significado, sin `payloadHash` — el `integrityHash` del Slice 4 es el candidato
  natural) · estado general como catálogo configurable.

### Notificaciones avanzadas — épico (Fase A backend ✅ 2026-06-17; resto pendiente)
> El dueño pidió el épico COMPLETO (A+B) y LUEGO la 4.4 (DECISIONS 2026-06-17). Fase A BACKEND está hecha y publicada.
- [ ] **Fase A · UI (sesión siguiente, prioridad):**
  - [ ] **Editor de aviso por TRANSICIÓN en el builder de flujos** (`WorkflowBuilder`/`TransitionEditor`): toggle "Notificar" +
        regla de destinatarios (roles [picker], usuarios, autor, ejecutor, roles del estado destino, correos externos) + selector
        de plantilla opcional. El modelo del builder YA preserva `notify` (passthrough); falta la UI que lo edite. Identidad Lyra,
        44px, claro/oscuro.
  - [ ] **Atajo "copiar la configuración de destinatarios de OTRA transición"** (puro frontend; decisión del dueño para que
        administrar varias transiciones no sea burocrático).
  - [ ] **Master-detail de plantillas POR BITÁCORA** en `/notificaciones` → Plantillas: botón "Nueva plantilla" (evento + bitácora +
        idioma), **columna "Ámbito"** (Por defecto / nombre de bitácora), filtros (evento, scope generic/scoped, búsqueda), borrar
        las ad-hoc (la genérica no). Endpoints listos (`POST/DELETE /notifications/templates`, `GET …?scope=`).
  - [ ] **Diccionario de comodines de campo** en el editor de una plantilla ad-hoc (consume `GET /notifications/templates/field-variables?templateId=`):
        insertar `{{campo.<key>}}` en el cursor, junto a las variables del evento y `{{entry.summary}}`.
  - [ ] **Toggle de defaults de sistema** en `/configuracion` (tab Correo o Notificaciones): "Transiciones sin config notifican a
        los roles del estado destino" (`SystemSettings.notifyTransitionDefaultDestinationRoles`; endpoint a exponer si no existe).
  - [ ] **Smoke VISUAL del dueño** de toda la Fase A.
- [ ] **Fase B · Canal IN-APP (campanita):** enum `NotificationChannel += INAPP` (ALTER aditivo) + `NotificationOutbox.readAt` +
      sender INAPP (marca entregado sin SMTP) + **campanita en el Topbar** (contador no leídas + dropdown + marcar leídas) +
      **SSE** (decisión del dueño; con fallback a poll) + preferencias por canal (ya existen). Ownership para "mis in-app".
- [ ] **Diferido del épico (BACKLOG, no Fase A/B):** `DistributionList` reusable (azúcar sobre la regla embebida, si el reuso duele) ·
      override de plantilla POR TRANSICIÓN más fino · disparo configurable de `entry.signature.pending` por transición.
- [ ] **Luego: Fase 4.4 — SLA/escalamiento + avisos de plazo** (incidencias/reportes 4.3/CAPA): eventos `incident.*` + sweeper +
      resolvers + unificación de "vencida" §21 (dos conceptos: SLA de permanencia vs plazo de resolución `dueAt`) + auto-due
      `IncidentType.resolutionDueMinutes`. Las 3 sub-decisiones de 4.4 ya quedaron acordadas con el dueño (modelo SLA light · §21
      desambiguar · 4 eventos `incident.sla.breached`/`incident.report.due`/`incident.overdue`/`incident.action.overdue`).

### Datos de demo — entradas legacy sin gate de sección (registrado 2026-06-17)
- [ ] Las entradas de *Bitácora de Turno — Demo Completa* creadas sobre las versiones **v3–v11** (que se publicaron sin roles de
      sección por la regresión del builder, ya blindada) **no aplican** la autorización por sección (cada entrada congela su
      versión inmutable; no se corrige mutando el histórico, es GxP). Para la demo: **recrear** esas entradas sobre la versión
      vigente (v12, que sí enforce) o anularlas. Las entradas nuevas ya quedan correctas (verificado con `smoke-permisos-seccion.py`).

### Incidencias — Fase 4 (plan por fases; 4.0/4.1/4.2a/4.2b/4.3 ✅)
- [ ] **4.2a · Deuda (no bloqueante):** subida de **archivos de evidencia** a la acción (columna `evidence Json?` ya reservada;
      reusará `StorageService` Ola 3, proxied + presigned GET con ABAC) · **picker de rol responsable** en la UI (el modelo/contrato/
      API ya soportan `responsibleRoleId`; falta un endpoint de role-options del módulo + el selector) · **firma Part 11** al verificar
      eficacia (GxP). *(Drawer a pestañas: HECHO en 4.2b.)*
- [x] **4.2b · Investigación (5 Porqués) ✅** (`feat/incidencias-investigacion`): honra `requiresInvestigation`; modelo dedicado
      `IncidentInvestigation`+`Step`; enlace causa raíz↔CAPA (`IncidentAction.investigationStepId`); bloqueo de cierre configurable
      (`assertInvestigationComplete`); drawer a PESTAÑAS; reusa `incident:edit` (sin permiso nuevo); contracts 271 · API 234 · smoke
      `smoke-incidencias-investigacion.py` 27/27 + regresión 23/23 + 31/31. **Deuda 4.2b:** firma Part 11 al completar la investigación ·
      adjuntos de evidencia a la investigación · plantillas de método ICAM/Ishikawa (5 Porqués es el MVP).
- [x] **4.3 · Reportabilidad configurable ✅** (`feat/incidencias-reportabilidad`) — §14 de la auditoría: catálogo `ReportingObligation`
      (autoridad/plazo/aplicabilidad por tipo+severidad/`mandatory`) + materialización `IncidentReport` (N por incidencia, snapshot de
      obligación, status PENDING/SUBMITTED/NOT_APPLICABLE/CANCELED, folio externo); honra `reportableDefault` (materializa al crear si
      reportable); **bloqueo de cierre por reporte OBLIGATORIO pendiente** (`mandatory` del catálogo; `reportsBlockingClose` +
      `assertNoBlockingReports`); **vencido DERIVADO** (KPI/filtro/flag); sin permiso nuevo (cat. 83). contracts 283 · API 241 · smoke
      `smoke-incidencias-reportabilidad.py` 31/31 + regresión sin romper. **Deuda 4.3:** subida de **evidencia del envío** (Storage Ola
      3; `IncidentReport.evidence Json?` ya reservado) · **firma Part 11** al marcar enviado · **aviso de plazo** "por vencer/vencido"
      (→ 4.4 + notificaciones avanzadas; el dato/estado ya está, falta el disparo).
- [x] **4.4 · SLA/notificaciones/escalamiento ✅** (`feat/incidencias-sla`): SLA light (`IncidentType.resolutionDueMinutes` →
      auto-`dueAt` + override editable con auditoría) + 4 eventos derivados del Bloque N + sweeper en el worker + escalamiento
      (re-aviso diario + 1 nivel `escalationAfterMinutes`/`escalationRoleId`) + **§21 desambiguado** (Permanencia vs Plazo, stats/
      filtros/KPIs aparte) + **aviso de plazo de reportes 4.3 y CAPA saldado**. Sin permiso nuevo (cat. 83). Contracts 303 · API 247 ·
      smoke `smoke-incidencias-sla.py` 25/25 + regresión. **Deuda 4.4:** rol de escalamiento usa `role:read` (→ `role-options`
      decoplado) · plantilla INAPP propia · escalamiento multi-nivel/tiers (diferido, ver §"Escalamiento por TIERS"). **Pendiente: smoke VISUAL.**
- [x] **4.5 · Dashboard/analítica ✅** (`feat/incidencias-dashboard`): MTTR, reincidencia, tendencia creación/cierre, Pareto por tipo,
      distribuciones, cumplimiento SLA, CAPA/reportes; ABAC por nodo; export CSV; drill-down. **Deuda:** MTTA · export PNG · IF/IG.
- [ ] **Mejoras menores de la auditoría:** campos universales en el alta (medida inmediata, impactos) · dedup entre incidencias ·
      separar seed núcleo neutro vs paquetes verticales por industria (la arquitectura ya lo permite como datos).

### Incidencias (Fase 4) — DEUDA TÉCNICA ACUMULADA (índice agrupado) 🗂️
> Índice ÚNICO y accionable de todo lo que quedó abierto en 4.0–4.4 (las notas por fase de arriba son el registro histórico de
> qué entregó cada una; ESTE bloque es la lista para retomar). Ninguna es bloqueante. Agrupada a pedido del dueño (2026-06-17).

**Transversal del módulo (un fix salda varias fases):**
- [ ] **Endpoint `role-options` del módulo de incidencias** (devuelve `{id,name}` de roles, gate `incidentcatalog:manage`/
      `incident:edit`, decoplado de `role:read`; patrón `schedules/role-options`). **Salda DOS pickers que hoy dependen de
      `role:read`:** el **rol responsable de CAPA** (4.2a) y el **rol de escalamiento** (4.4). Sin él, un admin de catálogos sin
      `role:read` ve esos desplegables vacíos.
- [ ] **Subida de evidencia (archivos)** reusando `StorageService` Ola 3 (proxied + presigned GET con ABAC) en: **acción CAPA**
      (4.2a), **investigación** (4.2b) y **reporte enviado** (4.3). Las columnas `evidence Json?` ya están reservadas en los 3 modelos.
- [ ] **Firma Part 11 (`payloadHash`)** en los actos GxP: verificar eficacia de CAPA (4.2a), completar investigación (4.2b), marcar
      reporte enviado (4.3) y la transición con firma del núcleo 4.0 (hoy exige re-auth pero NO persiste la firma → falta
      `IncidentSignature` o generalizar `LogEntrySignature`).

**4.2 — Investigación / CAPA:**
- [ ] **Plantillas de método** de investigación ICAM / Ishikawa (hoy solo 5 Porqués; el enum `INCIDENT_INVESTIGATION_METHODS` ya es
      extensible sin re-migrar).

**4.4 — SLA / avisos de plazo / escalamiento:**
- [ ] **Plantilla INAPP propia** para los eventos de incidencias (hoy la campanita reusa el contenido renderizado de la plantilla
      EMAIL; es la **misma deuda transversal del canal in-app**, ver §"Notificaciones (Bloque N) — deuda diferida").
- [ ] **Escalamiento multi-nivel / tiers** estilo PagerDuty (N niveles ordenados con timeout por nivel). Hoy 4.4 da **re-aviso diario
      + 1 nivel** (cubre el 90%); el modelo es extensible sin romper. Diferido — ítem maestro en §"Escalamiento por TIERS".

**Núcleo / alta (de la auditoría y deuda fina 4.0):**
- [ ] **Extras del alta** (no mínimos): matriz de riesgo prob×consec, asignar responsable al crear, flag "reportable" editable,
      evidencia a nivel incidencia (MinIO Ola 3). · **Auditoría:** campos universales (medida inmediata/impactos), dedup entre
      incidencias, separar seed núcleo neutro vs paquetes verticales. · **IF/IG** (índices de frecuencia/gravedad) — requiere fuente
      de **HH trabajadas**, que HOY NO existe (precondición de 4.5/HSE). · Deuda fina 4.0: `incident:export` (CSV), facetas/SavedView/
      peek/multi-sort en la lista, drag&drop en el kanban.

### Form Builder — FORMATEO EN VIVO de campos (acordado con el dueño 2026-06-15)
- [x] **A · Quick wins ✅** (`feat/builder-formateo-paleta`): RUT al teclear (`formatRutLive`); número/moneda/porcentaje con
      miles+decimales (`FormattedNumberInput` + `Intl.NumberFormat`); «Decimales» expuesto en NUMBER.
- [x] **B · Máscara de texto genérica ✅** (`config.mask` + `applyMask`: `#/A/*`+literales, p. ej. `OT-#####`). *Diferido:*
      aplicar la máscara también al valor que llega del escáner QR.
- [ ] **Deuda de limpieza:** borrar `BuilderFieldCard.tsx` + `BuilderFieldOverlay` (CÓDIGO MUERTO de la era dnd-kit 2.1.6; el
      lienzo real es `SectionCanvas` desde 2.1.7). No lo importa nadie. Quitarlo evita volver a editar el componente equivocado.
- [ ] **Pulido del modal "Ver más" (diferido):** placeholder/valor de ejemplo precargado en la demo en vivo del elemento.

### Form Builder — CATÁLOGO DE OBJETOS PREMIUM (olas 1–5) — acordado con el dueño (2026-06-15)
El set actual (NUMBER, TEXT, TEXTAREA, SELECT, MULTISELECT, BOOLEAN, DATE, DATETIME, SEVERITY,
SIGNATURE) es el núcleo; el dueño pidió **TODOS** los objetos que ofrecen los sistemas de este tipo,
a nivel **premium/enterprise**. El `prototipo.tsx` ya dibuja varios (radio, checklist, slider, foto,
GPS, tabla, activo/QR). Se entrega por **OLAS** (una por sesión; cerrar cada una).

**ESTÁNDAR PREMIUM (obligatorio por objeto — "terminado" = cumple TODO):** identidad Lyra WatchLog
(solo tokens, Sora/Inter, Lucide, glow no sombras negras, claro+oscuro); componentes en `packages/ui`
(reusar Input/Select/Combobox/LookupPicker/Checkbox/Toggle/Drawer/Modal/Chip/Table; primitivo nuevo
documentado si falta); anatomía común (etiqueta/ayuda/obligatorio/error/readOnly); estados completos
(default/hover/focus-visible/activo/disabled/**inválido**/**vacío**/**cargando**/**readOnly premium**);
a11y AA + teclado + foco visible + táctil ≥44px; validación clara + formato regional (`lib/format.ts`);
listas largas virtualizadas/paginadas; WYSIWYG fiel (control real); render ÚNICO (FieldControl). Si no
llega al nivel, NO se publica: queda aquí con lo que falta.

- [x] **Ola 1 — objetos SIN infra ✅ (2026-06-15, `feat/objetos-ola1` → `main`).** Tri-estado `CONFORMITY` ·
      radio/segmentos/casillas/multiselección-modal vía `displayAs` (SELECT/MULTISELECT) · valoración `RATING`
      (estrellas/numérica/Likert) · `TIME` · `DURATION` (minutos) · `RANGE` {from,to} · RUT/correo/teléfono/URL
      (`TEXT+format`) · porcentaje/moneda (`NUMBER+format`) · presentación `HEADING/STATIC_TEXT/DIVIDER/NOTICE/
      PROCEDURE_LINK/REFERENCE_IMAGE` (`dataType LAYOUT`, el llenado los ignora). 5 forks resueltos (DECISIONS
      2026-06-15). Paleta = presets por categoría. Sin permisos nuevos (catálogo 60). Contracts 204 · API 234 ·
      smoke 21/21. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda fina:** RANGE es el único valor no-escalar
      ({from,to}); revisar export/línea Resumen si se necesita mostrarlo. La imagen de referencia es por URL (el
      upload de imágenes propias es Ola 3/MinIO).
- [x] **Ola 2 — objetos de referencia ✅ (2026-06-15, `feat/objetos-ola2` → `main`).** Selector de equipo/activo
      (ISO 14224) · usuario/responsable · nodo de estructura · turno — **un tipo `REFERENCE` + `config.entity`**,
      `dataType REFERENCE`, opciones + validación ABAC server-side (`GET /log-entries/references/:kind/options`;
      `opts.allowedRefIds`). Lectura con tolerancia (NUMBER + expected±tol → bandas derivadas), contador/acumulado
      (NUMBER + delta vs lectura previa sellada), matriz de riesgo (`RISK_MATRIX`/`dataType RISK`, ejes 2..7 +
      celda→severidad, ISO 31000). 6 forks resueltos (DECISIONS 2026-06-15). Sin permisos nuevos (catálogo 60).
      Contracts 215 · API 234 · smoke 22/22. **Pendiente: smoke VISUAL** (§4). **Deuda:** crew como entidad (hoy TURNO =
      `OperationalShift`); usuario filtrado por alcance de nodo; contador no-decreciente y delta cross-entry sin smoke en
      vivo (requieren entrada sellada previa); estampar el delta del contador como `computed` si se necesita reportar;
      banda de umbral para `RISK_MATRIX` (review-by-exception); resolver id→label de REFERENCE en la grilla/summary.
- [x] **Ola 3 — adjuntos/terreno ✅ (2026-06-15, `feat/objetos-ola3` → `main`).** Foto/cámara · archivo ·
      nota de voz (`MediaRecorder`) · croquis (canvas→PNG) · **escáner QR/código** (`config.scan` sobre TEXT,
      `@zxing/browser`, NO es archivo). Un `FieldType ATTACHMENT` + presets → `dataType FILE_ARRAY` (valor =
      `descriptor[]`). `StorageService` abstracto (token DI) + `MinioStorageService` (SDK `minio`, bucket
      idempotente). Subida **PROXIED** (`@fastify/multipart`, choke-point de validación) a
      `entries/{id}/{fieldKey}/…`; descriptor `{id,key,filename,size,contentType,checksum,uploadedAt,uploadedById}`
      en `LogEntryValue.value` (NUNCA URL); descarga = **presigned GET** con la ABAC de `getDetail`. Pertenencia
      verificada por prefijo + existencia (análogo a `allowedRefIds`); delete-on-remove; VOID limpia huérfanos.
      Migración `…_add_ola3_field_types` (ALTER enum). Render único `AttachmentControl` + paleta "Evidencia /
      Terreno". 4 forks resueltos (DECISIONS 2026-06-15). Sin permisos nuevos (catálogo 60). Contracts 222 · API
      234 · smoke 26/26. **Pendiente: smoke VISUAL** (§4). **Deuda:** antivirus (ClamAV) · object-lock/WORM ·
      thumbnails/lightbox · retención automática · **sweeper de subidas abandonadas** (hoy solo VOID/delete-on-remove
      limpian) · **presigned directo** (escala; hoy proxied) · escáner solo cámara (sin REFERENCE(equipment)-scan) ·
      adjuntos a nivel de REGISTRO/TRANSICIÓN (Req-2 b/c; hoy solo a nivel de CAMPO) · ocultar la `key` cruda del
      descriptor en el detalle (hoy round-trip al cliente; inofensivo: el presign+ABAC es la guarda real).
- [x] **Ola 4 — estructurados ✅ (2026-06-15, `feat/objetos-ola4` → `main`).** **Tabla/grilla repetible**
      (columnas = sub-campos escalares, valor `Array<Record<colKey,escalar>>`, validación POR CELDA, agregar/quitar/
      reordenar) · **grupo/sección repetible** (mismo tipo `TABLE` + `config.layout=cards`) · **matriz parámetro×turno**
      (tipo `MATRIX`, filas/columnas FIJAS configuradas + celda uniforme, `Record<rowKey,Record<colKey,escalar>>`). 4 forks
      resueltos (DECISIONS 2026-06-15): 2 tipos (TABLE+MATRIX) · matriz con columnas configuradas (sin ShiftResolver) ·
      celda solo escalares · sin agregados. `requiredFieldError` generaliza la obligatoriedad (TABLE ≥ filas completas /
      MATRIX ≥1 celda). Opacos a resumen/reglas. Render `RepeatableControl`/`MatrixControl` recursivos sobre `FieldControl`
      (modo `bare`); paleta categoría "Estructurados". Migración ALTER enum. **Sin permisos nuevos (catálogo 60).** Contracts
      230 · API 234 · smoke 22/22. **Pendiente: smoke VISUAL** (§4). **+ Pulido (`fix/objetos-pulido`, 2026-06-15):** ✅ poda
      de filas vacías al guardar (`pruneEmptyTableRows`; maxRows ya no cuenta vacías + jsonb limpio) · ✅ catálogo de celda
      SELECT por lista de referencia RECHAZADO en el diseño (cierra el hueco de validación). **+ (`feat/tablas-umbral-reglas`,
      2026-06-15):** ✅ **umbral por celda numérica → review-by-exception/grilla** (`thresholdBandFor` estampa la PEOR banda de
      las celdas de TABLE/MATRIX) · ✅ **agregados de columna en el motor de reglas** (nodo AST `col` + `sum/avg/min/max/count`
      sobre una columna, en campos calculados y reglas cruzadas; operando "Columna de tabla" en el editor). **Deuda restante:**
      condiciones por FILA del motor (`any/all`: "si alguna fila estado=fuera ⇒ alerta") · resumen "N filas" en la grilla ·
      export CSV de tablas · agregado como COLUMNA visible (pie de tabla) · obligatoriedad fina de MATRIZ (completa / por
      fila-columna; hoy solo ≥1 celda) · `minRows` cuando la tabla NO es obligatoria · REFERENCE/ATTACHMENT/RANGE/RISK en
      celda · tabla ANIDADA · columnas de la matriz desde el calendario operacional en vivo (ShiftResolver) · pulido fino
      sticky/scroll/táctil en tablet.
- [ ] **Ola 5 — origen de datos (Fase 3).** Lectura autocompletada desde tag SCADA/PI/OPC (modelar + stub).

### Incidencias (Fase 4) — fases siguientes (plan aprobado 2026-06-16, DECISIONS)
- [x] **4.0 — Núcleo ✅** (`feat/incidencias-nucleo`): Incident + catálogos + manual + link desde entrada + workflow reusado +
      lista/kanban + ABAC + auditoría + navegación bitácora↔incidencia.
- [~] **4.1 — Excepciones operacionales desde bitácoras.** `LogEntryException` + `IncidentExceptionLink`; detección desde umbral/
      valor inválido/crítico (reusa `thresholdBand`/reglas); panel de excepciones en la bitácora; convertir/asociar/agrupar/descartar
      con motivo/corregir valor con trazabilidad (preserva original); deduplicación por sugerencia; **acción "abrir incidencia" del
      motor de reglas vía evento DIFERIDO** (reusa el outbox transaccional del Bloque N).
  - [x] **4.1.0 — BACKEND ✅** (`feat/incidencias-excepciones`): modelo + migración aditiva + generación síncrona gobernada por
        campo (CRIT siempre / WARN opt-in `warnRaisesException`) reconciliada en guardar/sellar + purga en VOID + triage
        (ack/dismiss[crítica=permiso superior]/correct[GxP]/convert/associate/manual) + dedupe (sugerencia) + ABAC + auditoría +
        4 permisos (cat. **81**). Smoke `smoke-excepciones.py` 39/39. **Deuda fina 4.1.0:** excepción por CELDA de TABLE/MATRIX (hoy
        a nivel de campo) · Part 11 `payloadHash` de la corrección (deuda compartida con 4.0) · `thresholdType=invalid` aún no se
        materializa (tier 1 = validación dura que bloquea guardar; reservado para la regla del motor 4.1.2).
  - [x] **4.1.1 — UI: panel de excepciones en la bitácora ✅** (`feat/incidencias-excepciones-ui`): panel inline plegable en
        llenado/visor (resumen "N críticas · N advertencias · N posibles inválidos" + lista accionable con selección múltiple),
        `ExceptionDetailDrawer` (reconocer/corregir[GxP, reauth si sellada]/crear-asociar incidencia/descartar[crítica=permiso
        superior]), `ConvertExceptionModal` (incidencia nueva o asociar a existente + sugerencia de dedup), banner "advertir no
        bloquear" al completar con críticas, **bandeja GLOBAL `/excepciones`** (KPIs + filtros 1 línea + GridPager arriba/abajo +
        menú, gate `module:incidents:view`), trazabilidad campo→excepción→incidencia en el detalle de la incidencia (filtro
        **`incidentId`** nuevo en `GET /exceptions`), toggle **`warnRaisesException`** en el builder de NUMBER (umbral + tolerancia),
        i18n es-CL · tokens Lyra. Contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39 (sin regresión; filtro incidentId
        verificado en vivo). **Deuda 4.1.1:** toggle `warnRaisesException` por CELDA de TABLE/MATRIX (requiere antes un editor de
        umbrales por columna, que el builder aún NO expone) · conteo de excepciones abiertas por entrada en la grilla `/bitacoras`
        (hoy se reusa el indicador `worstThresholdBand`; el conteo exige que el listado devuelva el dato) · `CorrectModal` usa la
        config mínima del campo (unidad), sin bandas/opciones completas (el backend valida igual). **Pendiente: smoke VISUAL del dueño.**
  - [x] **4.1.2 — Acción del motor de reglas (diferida vía outbox) ✅** (`feat/incidencias-reglas-accion`). `action?` en `CrossRule`
        (`none|raiseException|openIncident{tipo/categoría/severidad}`, congelada en la versión, sin migración de reglas) + regla con
        acción ⇒ WARN (validateRulesDesign + server). Tabla DEDICADA `RuleActionOutbox` (no se reusa NotificationEvent); emisión
        IN-TX al sellar (submit/executeTransition, `dedupeKey rule:{entryId}:{ruleKey}`); `RuleActionWorkerService` (@Cron + `POST
        /rule-actions/run`) crea la excepción RULE (idempotente) y abre incidencia originType=RULE + link CONVERTED, atribuida al
        actor que selló (reusa IncidentsService.create + ExceptionGeneratorService.createRuleException). `LogEntryException.sectionKey/
        fieldKey` NULLABLE (regla no ata campo; sin "Corregir"). UI: selector de acción en `RulesEditor`. Migración aditiva. Contracts
        257 · API 234 · smoke `smoke-reglas-incidencias.py` 21/21 + `smoke-excepciones.py` 39/39. **Con esto la Fase 4.1 queda
        COMPLETA.** *Diferido:* `thresholdType=invalid` (tier 1 = validación dura que bloquea guardar; no lo produce este corte).
        **Pendiente: smoke VISUAL del dueño.**
- [ ] **Incidencias — extras del alta (opcionales, NO mínimo; evaluación 2026-06-16).** Tras cerrar equipo/activo + fecha del evento,
      quedan como mejoras NO mínimas del formulario de creación: **matriz de riesgo** (probabilidad×consecuencia) en el alta (el modelo
      ya tiene `riskProbability/riskConsequence`; hoy solo en update); **asignar responsable** al crear (hoy se asigna después);
      **flag "reportable"** editable en el modal (hoy default por tipo); **evidencia/adjuntos** a nivel incidencia (→ 4.2, MinIO patrón
      Ola 3). Decidir cuáles entran al alta vs. triage/investigación.
- [x] **Incidencias — MANTENEDOR de catálogos (tipos + categorías) [UI] ✅ (2026-06-17, `feat/incidencias-catalogos-ui`).** Pantalla
      `/incidencias/catalogos` (ruta propia; acceso por botón "Catálogos" en el header de `/incidencias`, gate `incidentcatalog:manage`;
      NO en el sidebar para no doble-resaltar el padre, patrón `/seguridad/*`). Sub-pestañas **Tipos** / **Categorías** con buscador +
      filtro activo/inactivo + orden (1 línea) + `GridPager` arriba/abajo + crear/editar (modal) + toggle activo/inactivo. **Tipo:**
      nombre/key(solo crear)/descripción/color(swatches de tokens DS)/flujo publicado/flags investigación·CAPA·reportable/orden.
      **Categoría:** nombre/key(solo crear)/descripción/tipo(o transversal)/orden. **Backend mínimo:** guarda "flujo por defecto debe
      estar PUBLICADO" en `upsertType`; **rechazo 409** al crear con key existente (query `?create=true`, guarda cliente+server). Sin
      permisos nuevos (cat. 81), sin migración. Contracts 257 · API 234 · smoke `smoke-catalogos-incidencias.py` 16/16 +
      `smoke-incidencias.py` 30/30 (sin regresión); guarda DRAFT verificada en vivo. **Pendiente: smoke VISUAL del dueño.**
- [ ] **4.2 — Investigación + CAPA.** `IncidentInvestigation` (5 Porqués + causa inmediata/básica/raíz + lección) + `IncidentAction`
      (CAPA con responsable/plazo/evidencia/**verificación de eficacia**/reapertura); bloqueo de cierre si hay CAPA obligatorias
      abiertas; **registro Part 11 con `payloadHash` para incidencias** (hoy 4.0 exige re-auth pero no persiste la firma criptográfica);
      adjuntos a nivel de incidencia (MinIO, patrón Ola 3).
- [ ] **4.3 — HSE Chile / minería.** Clasificación (near-miss/CTP/STP/enf. profesional/ambiental/derrame/daño) + potencial de gravedad
      fino + flags reportables (SERNAGEOMIN/mutualidad) + DIAT/DIEP (registro/adjunto) + **IF/IG** (requiere fuente de **HH trabajadas**,
      que HOY no existe) + ICAM como plantilla de investigación (evaluar reuso del form-builder).
- [x] **4.4 — SLA + Notificaciones + Escalamiento ✅** (`feat/incidencias-sla`). SLA light de resolución (auto-`dueAt` desde el tipo +
      override editable con auditoría `DUE_CHANGED`); 4 eventos derivados del Bloque N (`incident.sla.breached`/`incident.overdue`/
      `incident.action.overdue`/`incident.report.due`) detectados por `IncidentSlaService` y emitidos por el sweeper del worker (correo +
      campanita); escalamiento = re-aviso diario + 1 nivel configurable; §21 desambiguado (Permanencia vs Plazo). Sin permiso nuevo.
      Smoke `smoke-incidencias-sla.py` 25/25.
- [x] **4.5 — Dashboard e indicadores ✅** (`feat/incidencias-dashboard`). Por tipo/severidad/nodo/equipo/turno/origen + tendencia
      creación/cierre + reincidencia + MTTR + cumplimiento SLA + CAPA + reportes + export CSV + drill-down; ABAC por nodo; sin permiso
      nuevo. smoke `smoke-incidencias-dashboard.py` 24/24. **Diferido:** MTTA · heatmap · export PNG · **IF/IG** (requiere HH trabajadas).
- [ ] **4.6 (candidata) — Evaluación de riesgo FMEA/RPN + escalamiento dinámico del RCA → DIFERIDO, opt-in, solo bajo demanda
      regulada (decisión 2026-06-17).** Origen: contraste con el estándar de un "RCA/CAPA nativo" (FMEA con gravedad×ocurrencia×detección
      ⇒ RPN; modularidad dinámica que despliega módulos de investigación profunda al cruzar un umbral de riesgo). **Decisión del dueño:
      NO construir ahora.** Motivos: (1) FMEA/RPN es de NICHO (farma/aeroespacial/automoción — IATF 16949, ISO 14971); para minería/
      manufactura general/energía el eje único de severidad 1–5 + `potentialSeverity` + la **matriz de riesgo `RISK_MATRIX` (ISO 31000,
      Ola 2)** ya cubren el grueso. (2) Riesgo de **densificar el sistema** para empresas pequeñas. (3) El verdadero costo es la
      *modularidad dinámica por puntaje en caliente* (motor de umbrales + reactividad de UI), no FMEA en sí. **Mitigación arquitectónica:
      la capacidad NO densifica si NO se obliga** — todo el módulo es config por `IncidentType` (`requiresInvestigation`/`requiresCapa`/
      `reportableDefault`/`mandatory`), así que una empresa chica simplemente lo deja apagado. **Cómo entraría si un cliente regulado lo
      pide:** método de investigación adicional (el enum `INCIDENT_INVESTIGATION_METHODS` ya es extensible, [investigation.ts:34]) + un
      tipo de incidencia que lo exija; **cero impacto** para quien no lo active. Reutiliza la lógica de bloqueo de cierre ya existente.
- [ ] **Deuda fina 4.0:** equipo en el modal de creación (hoy solo en edición; el modelo lo soporta) · `incident:export` (CSV) ·
      facetas/SavedView/peek/multi-sort en la lista (hoy filtros + paginación; el resto de la grilla premium = follow-up) · drag&drop
      en el kanban (hoy clic para abrir + transición por botón con guarda server-side) · resolver id→label de `originLogEntryNumber`
      sin query extra · vistas semilla guardadas (Mis/Críticas/Vencidas…).

### Notificaciones (Bloque N) — deuda diferida (registrada 2026-06-16)
- [ ] **Digest / batching** (resumen diario/horario por usuario). El modelo ya tiene `NotificationPreference.mode IMMEDIATE|DIGEST|OFF`;
      el MVP solo entrega IMMEDIATE (DIGEST se trata como entrega inmediata). Falta la ventana de batch + render de resumen + su tick.
- [ ] **UI de SUSCRIPCIONES** (watchers). El modelo `NotificationSubscription` + endpoints (`GET/POST/DELETE /notifications/subscriptions`,
      `notification:admin`) + la resolución por suscripción YA existen y se honran; falta la pantalla (pestaña en `/notificaciones`).
- [ ] **🎯 NOTIFICACIONES AVANZADAS — épico (requerimiento del dueño 2026-06-16).** Prompt enterprise listo en
      **`docs/prompts/notificaciones-avanzadas.md`** (pégalo en una sesión nueva). Personalización a la medida de cada bitácora/flujo:
      **(1)** disparo **por TRANSICIÓN** configurable en el builder de flujos (¿envía? · qué plantilla · a quién), DATO en
      `WorkflowTransition` congelado en la versión; **(2)** **listas de distribución** (rol/usuarios/autor/rol-del-estado/alcance/
      correos externos con gobernanza); **(3)** **plantillas por bitácora** (`NotificationTemplate.templateId?`, override de la genérica
      con fallback); **(4)** **variables de campo `{{campo.<key>}}`** con **VERSIONADO** (keys estables, valores de la versión congelada
      de la entrada, degradación elegante) — expande el `{{entry.summary}}` actual; **(5)** **defaults a nivel de sistema**
      (`SystemSettings`); **(6)** **canal IN-APP (la campanita)** en el Topbar (contador + dropdown + marcar leídas; poll vs SSE). **ÉPICO
      grande: plan POR FASES** (A=email por transición/bitácora/campos/defaults · B=in-app). Ver memoria [[notif-advanced-requirement]].
- [ ] **`round.overdue` sin rol responsable → fan-out por NODO para correo.** DECISIÓN CONSCIENTE del MVP: cuando `LogSchedule.responsibleRoleId`
      es null, el correo se resuelve **solo por suscripciones** (no se hace fan-out automático a todos los que alcanzan el nodo, para evitar
      tormentas de avisos). El worklist in-app SÍ muestra esas rondas a todos los que alcanzan el nodo. Si se quiere el fan-out por nodo en
      correo, requiere un reverse-ABAC acotado (quién alcanza el nodo). **A confirmar con el dueño.**
- [~] **Escalamiento por TIERS** (ítem maestro; estilo PagerDuty escalation policy, N niveles con timeout por nivel). **Parcialmente
      cubierto por 4.4:** las INCIDENCIAS ya tienen **re-aviso diario + 1 nivel** configurable (`IncidentType.escalationAfterMinutes`/
      `escalationRoleId`). Falta el multi-nivel (tiers) y extenderlo a `round.overdue`/`entry.sla.breached`. **Diferido** (4.4 cubre el
      90%). *(La parte de incidencias también está indexada en §"Incidencias (Fase 4) — DEUDA TÉCNICA ACUMULADA".)*
- [ ] **Smoke en vivo de `entry.transition` / `entry.sla.breached` / `entry.signature.pending`.** Los resolvers están typecheck+wired y comparten
      el pipeline (dispatcher/sender/render/ABAC/dedup/opt-out) ya probado end-to-end vía `round.overdue` (smoke 17/17). Falta un smoke que
      siembre una entrada + flujo + transición real y verifique el correo (necesita plantilla publicada con workflow + secciones completas).
- [ ] **Canal in-app / SMS.** La interfaz `NotificationChannel` ya abstrae el canal (solo `EmailChannel` implementado); `NotificationOutbox.channel`
      reserva el modelo. Implementar otros canales no toca el motor.
- [ ] **Escala del worker.** Hoy lote por tick + `@nestjs/schedule`; a escala alta, mover a BullMQ tras la misma interfaz de canal (swap Fase 7).

### Transversal — Manual de uso (`docs/USER_GUIDE.md`)
- [ ] **Backfill INCREMENTAL del manual de uso** (decidido 2026-06-14 con el dueño). Existe
      `docs/USER_GUIDE.md` (documento VIVO) con el **índice completo de funcionalidades** (las pendientes
      marcadas ✍️) y la 1.ª sección redactada (Bitácoras ▸ Anular / Editar, 2.8.2). **Pendiente:** redactar
      las secciones ✍️ de lo ya construido (Fases 1 y 2) a razón de **1–2 por sesión**, además de documentar
      cada funcionalidad NUEVA al cerrar su sesión (ya es regla en `CLAUDE.md` y en §0). NO requiere su propia
      sesión: avanza pegado al trabajo normal.

### Fase 1 — Seguridad + Estructura (en curso)
- [x] **App Shell / Workspace premium** ✅ (2026-06-06). Sidebar colapsable, top bar (breadcrumbs/
      búsqueda ⌘K/densidad/idioma/notificaciones/perfil), pestañas de trabajo acotadas, command palette
      (cmdk), favoritos/recientes, i18n-ready (react-i18next, es-CL), estado en localStorage, +9 primitivos
      `@lyra/ui`. **Pendiente solo el smoke visual** (ver §4).
- [x] **UI Estructura organizacional** ✅ (2026-06-07). Árbol expandible con CRUD de nodos y gestión de
      niveles. `@lyra/ui` ampliado con `Chip`, `Table`, `Select`. Backend: `DELETE /structure/levels/:id`.
- [x] **externalCode en OrgNode** ✅ (2026-06-07). Campo de integración ERP/CMMS/SCADA: migración,
      contratos, backend (service + buildTree), UI (drawer + detalle). i18n. Build limpio.
- [x] **Estructura UX** ✅ (2026-06-08). Workspace full-width + responsivo (tokens de layout +
      breakpoints); **`ResizableSplit`** propio en `@lyra/ui` (reemplaza `react-resizable-panels`);
      **`description`** y **`reportOrder`** en `OrgNode` (full-stack, con backfills no destructivos);
      grilla de hijos ordenable + edición inline del orden; densidad de tabla; dev server fijado a 5173;
      fix responsivo del header del detalle. **Smoke visual ✅** (confirmado por el usuario).
- [x] **Módulo Equipos** ✅ (2026-06-08). CRUD de `Equipment` integration-ready (tag único, categoría,
      criticidad 1–5, estado/baja lógica, orden), catálogo configurable `EquipmentCategory` + drawer de
      gestión, `ExternalReference` polimórfica (modelo + contratos; UI/motor en Fase 3). Migración con
      check constraints, 5 permisos nuevos, guard en `deleteNode`, grilla en `NodeDetail`, seed demo.
      **Estructura organizacional CERRADA.** Ver DECISIONS 2026-06-08.
- [x] **UI Seguridad** ✅ (2026-06-08) sobre `/security/*` — ver PROGRESS y DECISIONS 2026-06-08:
  - [x] Usuarios: listado, alta (contraseña temporal), edición, asignar roles, asignar alcance (scope)
        vía árbol con "incluye descendientes".
  - [x] Roles/permisos: CRUD de roles + matriz de permisos (catálogo de `@lyra/contracts`, agrupada),
        editar `requireMfa` por rol; system no borrable.
  - [x] Política de seguridad: editar contraseñas + bloqueo + **`mfaMode`** global.
  - [x] **MFA de admin**: estado de MFA por usuario + **resetear MFA**
        (`POST /security/users/:id/mfa/reset`, permiso `user:reset-mfa`). *Backend ✅ + UI ✅.*
  - [x] **Reset de contraseña por admin** ✅ (2026-06-08, variante A estilo AD): contraseña temporal +
        cambio forzado + revoca sesiones + auditoría, sin tocar MFA. Permiso nuevo `user:reset-password`
        (catálogo 26), `POST /security/users/:id/reset-password`, UI en pestaña *Seguridad*. Ver DECISIONS.
  - [ ] **Reset de contraseña por enlace (variante B)** — opción futura: el admin dispara el flujo
        self-service por correo (el admin no ve la clave). Requiere SMTP + buzón del usuario. **Prioridad: baja**
        (complementa la variante A ya entregada).
  - [x] Lectura de auditoría (`/security/audit`) con paginación por cursor y diff before/after.
  - **Añadidos**: contrato `auditLogEntrySchema`, primitivo `@lyra/ui` `Checkbox`, navegación por sub-rutas
    anidadas (`routeForPath`/`isRouteActive`). **Pendiente solo el smoke visual** (ver §4).
- [x] **Ampliar `@lyra/ui`** ✅ Fase Shell: Toggle/Tooltip/Menu/Modal/Drawer/Skeleton/Breadcrumb/EmptyState.
      ✅ Fase Estructura (2026-06-07): Chip, Table, Select. Pendiente: nada para esta fase.

### Mejoras futuras de Estructura (enterprise, post-Seguridad)

- [ ] 🔴 **L1 · AISLAMIENTO COMPLETO por estructura (Enterprise base) — PRÓXIMA SESIÓN (auditado 2026-06-23).**
      Tras multi-estructura, el aislamiento quedó a medias: los **listados operacionales** no filtran por
      estructura activa, y hay **fugas reales de ABAC por nodo** (`equipment.search()` SIN ScopeService;
      `equipment.listByNode()` sin validar nodo). Caso guía: empresa con departamentos Industrial/TI/Logística
      sin verse entre sí. **Plan completo + inventario auditado (backend y frontend) + prompt de sesión en
      `docs/NOTA_estructuras_y_jerarquias.md` (Anexo A y B).** L1a (fugas ABAC, urgente) + L1b (filtro por
      estructura activa en incidents/log-entries/exceptions/schedules/shift-handover + exports). **NO tocar
      catálogos COMPARTIDOS** (templates/workflows/reference-data/roles/users/settings/audit/saved-views).
      Smoke que barre TODOS los listados con usuario acotado. Esfuerzo ~3–5 días. Luego **L2** (rol-acotado-a-nodo
      + administración delegada + ciclo de vida), **L3** (UX premium: contexto por estructura + vista ejecutiva
      cross-estructura), **L4** (jerarquías alternativas + SSO/SCIM, a demanda). Ver memorias `org-views-vs-isolation`,
      `multi-org-structure-requirement`, `role-node-scope-requirement`.
- [ ] 🔴 **MÚLTIPLES ESTRUCTURAS ORGANIZACIONALES (pedido URGENTE del dueño 2026-06-23) — PRÓXIMA SESIÓN.**
      Soportar varias estructuras en paralelo en una instalación (cada una con su propio set de niveles y su
      propio árbol), para modelar negocios/casos de uso distintos. **NO es multi-tenant**: es multi-estructura
      dentro de una única instalación single-tenant on-prem.
      **Estado actual VERIFICADO (schema.prisma):** una sola estructura global. Bloqueador concreto =
      `OrgLevel @@unique([order])` (el `order`/profundidad es único en toda la instalación). Ni `OrgLevel`
      ni `OrgNode` tienen `structureId`; un solo árbol. `OrgNode` es el eje del que cuelga casi todo
      (LogEntry, Incident, `Scope`, `TemplateNodeAssignment`, calendarios operacional/fiscal por `path`,
      `LogSchedule`/rondas).
      **Migración NO-DESTRUCTIVA (requisito innegociable, CERO pérdida de datos):** crear `OrgStructure`,
      insertar "Estructura por defecto", agregar `structureId` a niveles + raíces de nodos backfilleando TODO
      lo existente a ella, y reescopar unique (`@@unique([structureId, order])`). Los nodos/niveles/alcances/
      asignaciones/calendarios actuales quedan intactos bajo la estructura por defecto.
      **Decisiones a resolver EN EL PLAN (antes de codear):** (1) **aislamiento** entre estructuras (¿mundos
      separados o se cruzan? inclinación = aislamiento estricto v1); (2) selección de estructura activa por
      usuario; (3) impacto en `Scope`/`TemplateScope`; (4) `OperationalCalendar.isDefault` ¿único por
      estructura?; (5) UI de gestión/cambio (identidad Lyra); (6) no romper herencia por `path`.
      **AUDITORÍA OBLIGATORIA:** derivar del código TODAS las referencias a OrgNode/OrgLevel que deban volverse
      structure-aware (no asumir la lista). **Esfuerzo: ALTO** (cambio arquitectónico amplio, factible).
      Ver memoria `multi-org-structure-requirement`. **Prioridad: ALTA, antes de seguir otros puntos del análisis
      de casos de uso (espesador / Eiser).**
- [x] **Alcance por nodo a nivel de ROL ("rol acotado a un nodo") ✅ (L2a, 2026-06-24, `feat/rol-alcance-nodo`).**
      Expuesto UI/API: endpoint `PUT /security/roles/:id/scope` (reusa `role:manage`, sin clave nueva) +
      `RoleDetail.scopes[]` + sub-sección "Alcance por nodo" (con `ScopeTreePicker`) en la pestaña "Alcance" del
      `RoleDrawer`. Backend `RolesService.assignScope` = espejo de `UsersService.assignScope` con `roleId`. Sin
      migración (`Scope.roleId` ya existía). Confirmado: el alcance efectivo es la UNIÓN user+roles evaluada en
      vivo (`ScopeService.getAccessibleNodes`); quitar el rol re-acota sin denormalizar. Ambos ejes (rol y usuario)
      conviven. `smoke-rol-alcance-nodo.py` 14/14 + regresión L1 33/33 · template-scope 14/14 · multi-estructura
      33/33. Ver DECISIONS 2026-06-24. **NO** se hizo L2b/L2c.
- [x] **L3 · UX premium cross-estructura ✅ (2026-06-24, `feat/estructura-ux-premium`).** (1) Identidad por estructura:
      columnas aditivas `OrgStructure.color`/`icon` (paleta curada de 8 acentos + lista blanca Lucide, fallback
      determinístico por `key`); badge "Estás en: X" siempre visible (= disparador del switcher) + editor con vista
      previa en `StructuresDrawer`; tokens `--accent-<clave>`/`--structure-accent`. (2) Vista ejecutiva «Panorama»
      (`/panorama`, gate `module:dashboard:cross-view`): consolida KPIs de incidencias de TODAS las estructuras
      accesibles (`GET /incidents/dashboard/cross` + `buildCross`); **excepción explícita a L1**, el **ABAC por nodo
      sigue siendo la frontera** (verificado: scoped ve solo lo suyo, 403 sin permiso). (3) Switcher con búsqueda +
      identidad. Migración `20260624130000_add_structure_identity`; catálogo 89→90 (db:seed + FLUSHALL). smoke
      `smoke-estructura-ux-premium.py` 18/18 + regresión 29/17/33/33/14/14. Ver DECISIONS 2026-06-24. **NO** L3b/L4.
  - [x] **L3b · Asistente "crear nueva área" ✅ (2026-06-24, `feat/estructura-asistente-area`).** Wizard de 3 pasos
        (identidad → niveles base → nodo raíz) lanzado desde el `StructuresDrawer` («Nueva área», reemplaza el create
        simple). Se DECIDIÓ **endpoint atómico** `POST /structure/structures/provision` (las 3 inserciones en una
        `prisma.$transaction`, sin huérfanas) en vez de orquestar desde el front; super-admin only
        (`module:structure:manage`, el servicio re-autoriza), sin migración, sin permiso nuevo. `Stepper` nuevo en
        `packages/ui` + `StructureIdentityFields` extraído (reusa identidad L3). smoke `smoke-estructura-asistente.py`
        15/15 + regresión estructura completa. Ver DECISIONS/PROGRESS 2026-06-24.
  - [ ] **Panorama multi-módulo (deuda de L3).** La vista ejecutiva hoy consolida SOLO incidencias. Extender a
        bitácoras/rondas/cambio de turno (tarjetas/KPIs por estructura) cuando se justifique, manteniendo el ABAC como
        frontera. **Esfuerzo: MEDIO.**
- [x] **Selector de nodos acotado por ABAC ✅ (2026-06-23, `feat/scoped-node-selector`).** Bug: el selector de
      nodos al crear incidencia (y otros de flujo operacional) mostraba TODOS los nodos a un usuario con alcance
      acotado. Fix con camino separado para no romper la administración (que sí debe ver todo): nuevo
      `StructureService.getAccessibleTree` + endpoint `GET /structure/accessible-nodes` (filtra por
      `getAccessibleNodeIds`, **sin `orgnode:read`** — el alcance ES la autorización) + hook `useAccessibleOrgTree`;
      migrados `CreateIncidentModal`/`LogbookPage`/`ShiftHandoverPage`. **+ fix UX `Combobox` base** (el label largo
      se desbordaba: envuelto en `.optText` truncable + `.optHint` truncado; el modal pasa nombre+ruta). Sin
      permiso/migración/FLUSHALL. smoke-scoped-node-selector 12/12 + regresión multi-estructura 33/33. Ver
      DECISIONS 2026-06-23. **NO cierra `org-views-vs-isolation`**: los LISTADOS operacionales (grillas de
      bitácoras/incidencias/dashboards) siguen sin acotar por estructura activa — deuda en pausa (ver memoria).
- [ ] **Visibilidad del calendario efectivo en el detalle del nodo (deuda UX, 2026-06-23).** Hoy el detalle de un
      nodo/host en `/estructura` **no muestra qué calendario operacional/fiscal rige** (ni el asignado directo ni el
      heredado por `path`). La asignación se hace solo desde el mantenedor de Calendarios (calendario → nodos), pero
      no hay forma de verificar desde el nodo "qué calendario me aplica". Propuesta: **badge "Calendario efectivo:
      <nombre> (heredado de <ancestro> | directo)"** en el detalle del nodo. Con multi-estructura y varios calendarios
      esto se vuelve necesario. **Esfuerzo: BAJO** (read-model: resolver el ancestro más cercano con calendario).

- [x] **Alcance por plantillas (2.ª dimensión ABAC) ✅ (2026-06-12, `feat/alcance-plantilla` → `main`).** Entidad
      aparte **`TemplateScope`** (`userId|roleId` XOR + `templateId`, sin descendientes), eje ORTOGONAL al `Scope` de
      nodo que combina en **AND**. Semántica **PERMISIVA** (sin scope = ve todas; migración aditiva sin backfill).
      Filtra el **picker** `GET /log-entries/templates` (`applyTemplateScope`) y la **grilla/stats/export** de
      `/bitacoras`; `assertTemplateInScope` en todas las rutas de lectura/llenado de entrada (defensa en profundidad).
      El admin `/plantillas` **NO** se filtra. Asignación por **usuario** (`PUT users/:id/template-scope`) **y rol**
      (`PUT roles/:id/template-scope`), UI `TemplateScopePicker` en pestaña *Alcance* + `RoleDrawer`. Sin permisos
      nuevos (catálogo 59). Tests contracts 149 · API 205. Smoke 14/14. Ver DECISIONS/PROGRESS 2026-06-12.
  - [ ] **Deuda 2.8 (aditiva):** **(a)** flag de instalación/rol "scope ESTRICTO de plantilla" (deny-by-default) si un
        cliente lo exige; **(b)** **agrupador de plantillas** (categorías/etiquetas) para asignar alcance por grupo
        (hoy es por plantilla individual; SAP/Maximo scopean por tipo de objeto); **(c)** smoke VISUAL en navegador.
- [ ] **Demo de capacidades — re-probar con "ownership estricto por campo" (pedido 2026-06-12).** La plantilla
      demo «Bitácora de Turno — Demo Completa» quedó con la sección 2 **compartida** (Operador + Mantenedor) y
      solo `estado_mecanico` reservado. El usuario quiere luego cambiarla a **estricta** (override de rol en
      CADA campo → cada quien edita solo lo suyo) y volver a recorrer el flujo. Es solo config de la plantilla
      (republica v3); aplica a entradas nuevas. Script `scripts/demo-bitacora.py`.
- [ ] **Seguridad a nivel de nodo en el mantenedor de Estructura (ABAC enterprise).** Volver a
      `/estructura` para incorporar gestión de **alcance de datos por nodo** (asignar usuarios/roles a
      nodos con herencia a descendientes) desde el propio árbol/detalle, al estilo de los grandes
      softwares industriales (SAP PM, Maximo): permisos efectivos por rama, vista de "quién tiene acceso
      a este nodo", scoping visual. El **modelo backend ya existe** (`Scope` polimórfico user|role +
      `includeDescendants` + ruta materializada; ver DECISIONS 2026-06-05). Falta la **UI** y conectarla
      con la pantalla de Seguridad. Pedido explícito del usuario (2026-06-08). **Prioridad: media**, tras
      la UI de Seguridad base.

### Identidad / Federación (v2 — diseño aprobado, implementación diferida)
> Diseño registrado el 2026-06-08 (ver DECISIONS). El objetivo es que activar proveedores externos
> (AD/OIDC/SAML) sea **aditivo**. Anclado a **SCIM 2.0** (RFC 7643/7644), **OIDC Core §5.1**, inetOrgPerson.
- [ ] **Set lean de campos de usuario (SCIM-alineado), a agregar cuando se justifique.** `username`
      (login estable, opcional, ≠ email), `firstName`/`lastName`, `phone`, `jobTitle`, `employeeId`,
      `preferredLanguage`/`timezone`. Migración + contratos + UI (pestaña *Datos* del detalle de usuario).
      Alto valor para bitácoras/notificaciones; mapean 1:1 a SCIM/OIDC. **Prioridad: media** (su propia sesión).
- [ ] **Costura de federación (v2): tabla `UserIdentity`** (`userId`, `provider` LOCAL|OIDC|SAML|LDAP,
      `providerKey`, `subject`/`externalId`, `claims jsonb`, `linkedAt`) + `authProvider` en `User`
      (default LOCAL) + reglas de *mastering* de atributos (campos gobernados por el IdP = solo-lectura en UI).
      Permite account linking. **No tocar la tabla `User` ahora**; es migración aditiva al activar un IdP.
- [ ] **SCIM inbound + JIT provisioning + mapeo grupo→rol** (el RBAC ya es 100% dato). **v2.**
- [ ] **MFA delegada al IdP**: `mfaMode` debe poder *deferir* al proveedor (no exigir TOTP propio si el IdP
      ya hizo MFA / AAL suficiente). **v2.**
- [ ] **Validez por fechas para contratistas** (`validFrom`/`validTo`, `userType`) + multi-email/multi-phone.
      **v2 / cuando lo pida un cliente.**

### Módulos intermedios (antes de Fase 2)
- [x] **Módulo Equipos** ✅ (2026-06-08) — ver el ítem cerrado arriba en "Fase 1 — Seguridad + Estructura"
      y DECISIONS 2026-06-08. La descripción original (decisiones a tomar) se conserva abajo como
      referencia histórica de lo decidido.
- [ ] ~~**Módulo Equipos**~~ *(cerrado — texto original conservado como referencia)* Modelo `Equipment`
      (name, code, externalCode, description, reportOrder, type, abbreviation, active, processId FK a
      OrgNode de nivel Proceso/último), migración, contratos (schema + create/update DTOs), service +
      endpoints `GET/POST/PATCH/DELETE /structure/equipment` (gateados por permisos nuevos
      `equipment:view/create/edit/delete` en el catálogo de `@lyra/contracts`), y **grid CRUD en
      `NodeDetail`** al seleccionar un nodo de último nivel — reemplaza el placeholder
      "Equipos — próximamente". Reusar `Table` (sortable + edición inline de orden, igual que hijos),
      `NodeDrawer`-style para alta/edición, descripción como 2ª línea. Seed/backfill de equipos de
      ejemplo opcional. **Antes de codear: confirmar el modelo de `Equipment` con el usuario**
      (¿qué `type`/categorías?, ¿abbreviation obligatoria?, ¿activo/baja lógica?).
  - **Integración (diseño integration-ready, decisión a tomar antes de codear):** la plataforma es
    industrial y conversará con historiadores/MES/EAM (PI System vía **PI Web API**: *WebID* opaco +
    *PI AF path*; **OPC UA**: *NodeId* + namespace/BrowseName; **SAP PM**: Equipment Number / Functional
    Location; **IBM Maximo**: Asset Num; lenguaje de intercambio **ISA-95** Physical Asset). Un equipo
    mapea a **varios** sistemas a la vez ⇒ el `externalCode` único **no basta**. Propuesta a evaluar:
    entidad genérica **`ExternalReference`** (o `SystemLink`) **polimórfica** (dueño `orgNodeId?` **o**
    `equipmentId?` con check constraint, **mismo patrón que `Scope`**) con campos `systemType`/`systemKey`
    (catálogo configurable, NO enum hardcodeado), `externalId` (WebID/NodeId/EquipmentNumber, estable),
    `externalPath` (AF/browse path, legible pero frágil), `endpoint`/namespace, `metadata jsonb`,
    `enabled`/`syncDirection`. Identidad estable de Lyra hacia afuera: el `id` (cuid) ya es inmutable;
    evaluar además un `tag`/assetTag de negocio estable. **El MOTOR de integración (conectar/leer/sync)
    es Fase 3 (Orígenes de datos), NO esta sesión** — aquí solo el modelo de datos + (opcional) UI mínima
    de referencias, para no migrar después. Decidir con el usuario: ¿se crea `ExternalReference` ahora
    (modelo + UI mínima) o solo se deja diseñada y se difiere a Fase 3? Refs: PI Web API WebID, OPC UA
    NodeId, ISA-95/OPC UA companion, ISO 14224 (taxonomía de equipos para confiabilidad).

### Requerimientos del dueño 2026-06-14 (registrados, sin planificar fecha) 🆕
> Capturados el 2026-06-14. Pendientes de plan/aprobación por sesión. Análisis y referencias de industria abajo.

- [x] **✅ Correlativo/folio PROPIO por plantilla — HECHO 2026-07-02** (`feat/folio-editor-y-plantillas`). Implementado
      EXACTAMENTE con el enfoque acordado (un esquema configurable + contador atómico genérico): `Template.folioScheme`
      (Json, gobernanza VIVA del contenedor, migr. `20260702230000_add_template_folio`) editable en el Form Builder con el
      **`FolioSchemeEditor` compartido** (mismo componente que el folio de OT) + vista previa en vivo; `LogEntry.folio`
      (nullable, ADITIVO — `entryNumber` global intacto) **emitido al SELLAR** vía `FolioService`/`FolioCounter` gapless
      (scope `type`=por plantilla, `node`/`structure` disponibles, reinicio `never`/`annual`); sin esquema ⇒ fallback al
      correlativo global (`entryFolioLabel`); folio en grilla/visor/peek/CSV. MVP entregado + máscara con tokens. Referencia
      cumplida (SAP number range / NetSuite auto-numbering por tipo de doc). *(Detalle histórico del enfoque, abajo.)*
- [ ] ~~**Correlativo/folio PROPIO por plantilla, definible por el constructor (registrado 2026-06-30)**~~ El dueño pide
      que cada **plantilla/formulario tenga su PROPIO correlativo** y que el **constructor de la plantilla lo defina**:
      prefijo (p. ej. `PT-`, `OT-`, `RONDA-`), formato/relleno de ceros y **desde qué número empieza** (número inicial).
      **INVESTIGADO 2026-06-30 — HOY NO EXISTE:** el folio de una entrada es `LogEntry.entryNumber Int @unique
      @default(autoincrement())` (schema:1532) = **una sola secuencia GLOBAL de la BD** compartida por TODAS las plantillas
      y nodos, renderizada como `BIT-000007`/`#7` en backend (no configurable, sin prefijo por plantilla, sin número
      inicial, sin scope). Incidencias usa el mismo patrón (`Incident.number` global → `INC-####`). En `Template`/
      `TemplateVersion` **no hay** ningún campo de folio/prefijo/secuencia (solo `versionNumber`, que es la versión de la
      DEFINICIÓN, no un correlativo de registros).
      **ENFOQUE ACORDADO (2026-06-30): "varias posibilidades" = UN esquema CONFIGURABLE, no N variantes.** Se modela un
      **esquema de folio** en la plantilla con ejes independientes que el constructor COMBINA, y UN contador genérico
      atómico que cubre todas las combinaciones. Ejes: **prefijo** (texto libre `PT-`/`OT-`), **máscara/tokens**
      (`{prefijo}{aaaa}-{seq:0000}` → `PT-2026-0001`), **relleno** (ceros), **número inicial** (1, 500, 1000…),
      **alcance del contador** (global por plantilla · por plantilla+**nodo/área** · por plantilla+**estructura** · por
      plantilla+**equipo**), **reinicio** (nunca · **anual** · mensual · por **período/turno**).
      **Mecanismo (la clave):** al SELLAR, el backend calcula una **"clave de secuencia"** concatenando los ejes elegidos
      (p. ej. `templateId|nodeId|2026`) y pide el siguiente número de ESA clave a un contador atómico ⇒ cambiar de
      "global" a "por área con reinicio anual" es **solo cambiar qué entra en la clave**, sin código por combinación.
      **Qué implicaría:** (1) config en la plantilla (`Template.folioScheme` JSON: prefijo/máscara/padding/start/scope/
      reset) editable en el builder; (2) tabla **`FolioCounter`** (1 fila por clave derivada) con asignación atómica
      (`INSERT … ON CONFLICT … RETURNING` o `SELECT … FOR UPDATE`), **NO** autoincrement por plantilla a mano; (3)
      **asignar al SELLAR, no al crear el borrador** (folios **sin huecos**/gapless que esperan auditorías; un borrador
      abandonado no quema correlativo) — decisión de peso GxP; (4) **migración + backfill ADITIVO** (conservar
      `entryNumber` global como folio interno; el nuevo correlativo es ADICIONAL, no se renumera — protege auditoría/Part
      11); (5) folio en grilla/visor/PDF/notificaciones y **buscable**; (6) **inmutable** una vez sellado.
      **MVP recomendado:** prefijo + padding + número inicial + alcance {global-plantilla|por-nodo} + reinicio
      {nunca|anual} (cubre ~90%, patrón Veeva/Maximo "prefijo+año+secuencia"); resto (por equipo, mensual, máscara con
      tokens arbitrarios) = crecimiento ADITIVO sobre el mismo motor. **Referencia industria:** WO number configurable de
      Maximo, document numbering de Veeva/MasterControl (prefijo+secuencia+reinicio por año), numbering schemes de
      ServiceNow. **Viabilidad ALTA.** **Riesgos a cuidar:** atomicidad de la secuencia, gapless ⇒ asignar al sellar,
      inmutabilidad post-sellado. Pendiente de plan/aprobación por sesión.

- [x] **2.1.2 — Layout de formulario en GRILLA responsiva ✅ (2026-06-14, `feat/layout-grilla` → `main`).** Ancho por
      campo (columna dedicada en la versión inmutable) + grilla CSS responsiva desde una fuente de render ÚNICA
      `FieldGrid`/`FieldGridCell` (builder-preview + llenado + visor idénticos). Aditivo, default = cero ruptura; NO toca
      validación/umbral/condicional/permisos. **Superado por 2.1.3** (granularidad enum→colSpan 12 + editor WYSIWYG).
- [x] **2.1.3 — Editor de layout WYSIWYG (12 col + arrastre) ✅ (2026-06-14, `feat/layout-editor-wysiwyg` → `main`).**
      Por feedback del dueño (el panel de ancho era "ciego"): el editor del builder pasa a **manipulación directa**
      (arrastrar para reordenar dentro/entre secciones + redimensionar el borde; estándar ServiceNow/Power Apps/Fiori).
      Granularidad a **12 columnas** (`TemplateField.colSpan` 1..12 reemplaza el enum `LayoutWidth`; migración
      `20260614180000_field_colspan`). Sin librería de DnD nueva (DnD nativo `ColumnsDrawer` + pointer-events
      `ResizableSplit`; el builder es de escritorio). Accesible (flechas ↑↓ + handle `role=slider` ← →). Smoke API 14/14.
- [x] **2.1.4 — Builder canvas-first con configuración EN EL LIENZO ✅ (2026-06-14, `feat/builder-canvas` → `main`).**
      Por feedback del dueño (estrecho/poco intuitivo vs Canva): lienzo a todo el ancho (artboard), paleta → popover
      "＋ Agregar campo", config avanzada → `Drawer`; **se configura sobre el lienzo** (control REAL WYSIWYG, rótulo/
      sección inline, barra flotante contextual con ancho/obligatorio/mover/duplicar/eliminar/más opciones). Frontend
      puro. Nuevos `AddFieldMenu`/`FieldToolbar`; `BuilderFieldCard` reescrito; `addFieldAt`/`duplicateField`.
- [x] **2.1.5 — Builder auto-layout por arrastre (Notion) + ancho completo + responsive ✅ (2026-06-14,
      `feat/builder-autolayout` → `main`).** El usuario ya NO piensa en "columnas": arrastra un campo al lado de otro ⇒
      comparten fila (ancho repartido solo); a su propia línea ⇒ ancho completo (`splitRow`/`rowRangeOf`/`applyDrop`).
      Lienzo a todo el ancho; ajuste fino = divisor del borde (`resizeDivider`); se quitó el menú "12/12"; responsive
      móvil 1 / tablet 2 / escritorio 12 col (terreno). Frontend puro.
  - [ ] **2.1.4/2.1.5 Fase 2 (diferida):** arrastrar DESDE la paleta a una posición (drag-to-add); edición inline de
        placeholder/ayuda/opciones; **colapsar secciones**; atajos de teclado + copiar/pegar; multi-selección de campos.
  - [ ] **Deuda 2.1.x (aditiva, si surge caso real):** el editor de layout AVANZADO (posicionamiento absoluto, plantillas
        de layout wizard/pestañas/colapsable) es **2.9.0** (otra sesión), NO aquí. Eventual DnD táctil del builder en
        tablet (hoy es de escritorio; reordenar por teclado ya está con las flechas/barra).
- [ ] **Adjuntos / evidencias en formularios (Req-2).** Subir archivos/fotos. Los grandes (Maximo, SAP DMS, ServiceNow,
      Veeva/MasterControl, j5) lo hacen en **3 niveles** y conviene soportar: **(a) tipo de campo "archivo/foto"** (adjunto
      como dato del formulario), **(b) adjuntos a nivel de REGISTRO** (evidencia general), **(c) adjuntos en la TRANSICIÓN**
      (evidencia al aprobar/rechazar). MVP recomendado: (a)+(b). Storage = **MinIO** (ya está en docker). Requiere pipeline
      de subida (límite de tamaño/tipo, antivirus opcional, URLs firmadas, retención), inmutabilidad al sellar (GxP), audit.
      Ya estaba en §3 como Fase 7; **el dueño lo quiere en plantillas** ⇒ se puede adelantar. **Fase 2 (form builder) + MinIO.**
- [ ] **Notificaciones / Mensajería en TRANSICIONES (Req-1) + pantalla de correo saliente súper configurable (Req-5).**
      Al disparar una transición, **notificar** por canal (mail / SMS / WhatsApp) a roles/usuarios. Quién lo hace:
      **ServiceNow** (notifications + Flow Designer), **Jira** (automation rules), **Camunda** (listeners/connectors),
      **SAP/Maximo** (workflow notifications / escalations + communication templates). Requiere un **MOTOR de
      notificaciones**: canales detrás de una interfaz abstracta (ya existe `EmailService` como molde), **plantillas de
      mensaje**, **resolución de destinatarios** (rol→usuarios), opt-in **por transición** (config en la versión del flujo).
      **Alcance del canal (decisión dueño 2026-06-14): SOLO MAIL.** **SMS y WhatsApp quedan FUERA DE ALCANCE**
      (rompían el on-prem puro: exigían pasarela externa Twilio / Meta WhatsApp Business API). El motor se diseña con
      canales detrás de interfaz abstracta por si en el futuro se reabren, pero **no se construyen** SMS/WhatsApp.
      **Req-5 = pantalla dedicada** de correo saliente
      (SMTP host/puerto/seguridad/auth a BD + perfiles de remitente + editor de plantillas + **botón "enviar prueba"** +
      cola/reintentos), estilo WP Mail SMTP / Odoo "servidores de correo saliente" / settings de GitLab/Jira. Este motor
      lo **reutiliza Incidencias (Fase 4: SLA/escalamiento)** ⇒ es pieza FUNDACIONAL. **Nuevo bloque transversal
      "Notificaciones" (entre Fase 3 y 4; recomendado construirlo antes de Fase 4).**
- [ ] **API de datos por plantilla (Req-3) — salida OUTBOUND.** Exponer las entradas de una plantilla a sistemas externos.
      Recomendación (criterio): **NO** generar un endpoint físico por plantilla (pesadilla de mantención); sí un **único
      motor de API** versionado, **filtrable por `templateId`**, con **API Keys** de máquina (M2M), **scoping por key** (qué
      plantillas/nodos), **rate-limit**, paginación keyset y esquema estable (OpenAPI). Un "endpoint propio por plantilla"
      se ofrece como **alias/URL de conveniencia** sobre ese motor. Patrón: Table API de ServiceNow / Salesforce, API por
      base de Airtable. **Fase 3 (integración, eje OUTBOUND; el inbound SCADA/PI ya es Fase 3).** Ver memoria
      `integration-pending` (API Keys/Webhooks).
- [ ] **Webhooks salientes desde plantillas (Req-4).** Empujar datos a otros sistemas ante eventos (entrada creada/sellada/
      transición). Quién y cómo: **Stripe** (diseño canónico: payload **firmado HMAC**, **reintentos con backoff**, tipos de
      evento, **idempotencia**, log de entregas, rotación de secreto), **GitHub/Shopify** (igual), consumidos por
      **Zapier/Make/n8n**; **ServiceNow** vía outbound REST/business rules. Requiere: **bus de eventos** (ya dejamos el gancho
      `onTransitionExecuted` no-op), **suscripciones** (por plantilla o globales), **firma HMAC**, **cola de reintentos**,
      **log de entregas** + reintento manual. On-prem friendly (solo HTTP POST saliente). Lo difícil = entrega confiable
      (cola+reintentos+idempotencia). **Fase 3 (integración OUTBOUND), junto a Req-3.**
- [ ] **Asistente IA: consulta de bitácoras en LENGUAJE NATURAL (RAG) (Req-6, dueño 2026-06-14).** Preguntar en lenguaje
      natural ("¿qué fallas tuvo la bomba 2 este mes?") y que el asistente responda **citando los folios** de respaldo.
      Técnica = **RAG** (Retrieval-Augmented Generation): (1) **indexar** entradas + base de conocimiento como
      **embeddings**; (2) ante la pregunta, **recuperar** los fragmentos relevantes; (3) el **LLM** redacta la respuesta
      SOLO con eso (con citas), reduciendo alucinación. Piezas: pipeline de ingest/re-index (entradas son inmutables GxP),
      **vector store = `pgvector`** (extensión de Postgres ⇒ **on-prem**, sin servicio nuevo), `LlmProvider` **abstracto**
      (modelo local tipo Ollama/llama.cpp **o** API; CLAUDE.md ya exige la interfaz abstracta), prompt+citas.
      **CRÍTICO de seguridad:** el recuperador DEBE aplicar el **MISMO ABAC** que la grilla — el asistente solo "ve" lo
      que el usuario puede ver (nada de fuga vía IA). Quién lo hace así: Glean, Danswer/Onyx, Azure AI Search + RAG.
      **Fase 6 (Asistente IA), sobre la base de conocimiento; apoyado en la interfaz LLM de Fase 5.**
- [ ] **Inteligencia PREDICTIVA de fallos (Req-6b, dueño 2026-06-14).** Que el sistema **discierna patrones y prediga
      posibles fallos** desde el histórico de bitácoras. Dos niveles, NO confundir:
      **(A) "Insights" asistidos por IA (alcanzable antes):** el LLM razona sobre el histórico recuperado (RAG) y sugiere
      causas probables / patrones / recomendaciones, **con citas**. Extiende el asistente Req-6. **Fase 6.**
      **(B) Predicción ML real (anomalías / predicción de falla):** modelos sobre series de tiempo + datos estructurados
      (los campos numéricos con umbral + equipo + **modos de falla ISO 14224** que YA capturamos son el sustrato; FMEA).
      **Objeción honesta (criterio):** la predicción ML seria **necesita VOLUMEN e historial** (no se predice con semanas
      de datos) + etiquetado + entrenamiento/validación + MLOps ⇒ es un esfuerzo **grande y posterior**. Recomendación:
      capturar datos ya (en curso), entregar (A) en Fase 6, y (B) como **fase posterior/piloto** cuando haya historial.
      Quién: mantenimiento predictivo de IBM Maximo (MAS/Predict), GE/AVEVA Predictive Analytics, SAP PdMS.
      **Fase 6 (insights) + fase posterior (ML real).**

- [~] **Motor de REGLAS DE NEGOCIO y validaciones por plantilla (Req-7, dueño 2026-06-14).**
      **PRIMER CORTE ✅ (2026-06-14, `feat/motor-reglas` → `main`):** expresión SEGURA (AST tipo JSONLogic, evaluador puro,
      sin `eval`) en `@lyra/contracts/rules` = fuente única back↔front; **campos FORMULADOS** (`TemplateField.computed`,
      read-only, valor estampado al guardar / congela al sellar, ÷0 e inputs nulos ⇒ vacío, umbral ISA-18.2 sobre el
      calculado, recálculo autoritativo en servidor); **validación CRUZADA** (`TemplateVersion.rules`, ERROR bloquea /
      WARN informa); ciclos/refs detectados al guardar el diseño; UI builder (ExpressionEditor + sub-pestaña Reglas) +
      preview/llenado en vivo. Smoke 20/20. **PENDIENTE 2.º corte:** **(1)** límites dinámicos (min/max según otro campo o
      lista); **(2)** acciones que disparan otros módulos (abrir incidencia → Fase 4, notificar → bloque Notificaciones,
      exigir firma, marcar para revisión, autocompletar); **(3)** lookups a metadata de listas de referencia (exige
      resolución server-side; rompe pureza del evaluador — pasar pre-resuelto); **(4)** tablas **DMN** para matrices de
      decisión (clase equipo × lectura → severidad); **(5)** obligatoriedad/visibilidad condicional con el motor completo
      (hoy `visibleWhen` es el struct simple); **(6) deuda fina:** un formulado en una sección ya firmada se recomputa
      mientras la entrada no esté sellada (puede invalidar la firma de esa sección → §11.70 lo marca CHANGED_AFTER);
      evaluar "congelar formulados al completar/firmar la sección" o `LogEntryValue.computed Boolean` para filtrar por SQL.
      **Texto original del requerimiento abajo (referencia):**
- [ ] ~~Motor de REGLAS DE NEGOCIO (texto original, conservado como referencia).~~ Que la plantilla deje de ser
      "formulario tonto": reglas configurables declarativas `cuando (condición) → entonces (acción)`. **Ya hay base**
      (obligatorios, rangos min/max, **umbral ISA-18.2**, formato, **`visibleWhen`** condicional, validación 100% en backend
      con fuente única `validateFieldValue` reusada en cliente). Falta el **motor** que agregue: **(1)** validación
      **cruzada** entre campos (si A>B ⇒ error), **(2)** **obligatoriedad/visibilidad condicional** (extiende visibleWhen),
      **(3)** **campos calculados / FORMULADOS** (valor derivado de otros campos + constantes + listas; read-only; auto-actualiza;
      ej. `horas = fin − inicio`, `consumo = lect_final − lect_inicial`, `eficiencia = salida/entrada`, promedios/totales,
      "días desde última mantención"). Detalles: **mismo** motor de expresión seguro; **se ESTAMPA el valor al guardar**
      (registro histórico fijo y reportable, marcado como derivado; recalcula en DRAFT, congela al sellar — GxP);
      **dependencias** (saber qué campos lo alimentan para recalcular); **el umbral ISA-18.2 puede aplicar al valor
      calculado** (ej. eficiencia calculada dispara WARN); manejar **división por cero / inputs nulos** (⇒ vacío) y
      **referencias circulares** (detectar y bloquear); formato regional vía `lib/format`. Cómo lo hacen: Salesforce
      formula fields, Airtable/Notion formulas, ServiceNow calculated fields, hojas de cálculo. **(4)** **límites
      dinámicos** (min/max según otro campo o lista de
      referencia), **(5)** **acciones**: mensaje error/advertencia/info, exigir firma, **abrir incidencia** (→Fase 4),
      **notificar** (→bloque Notificaciones), bloquear envío/transición, marcar para revisión, autocompletar.
      **Cómo lo hacen los grandes:** ServiceNow (Business Rules + UI/Data Policies declarativas + Flow Designer);
      Salesforce (Validation Rules por fórmula + Flows + campos fórmula); SAP **BRFplus**; **Camunda/DMN decision tables**
      (estándar OMG, lógica de decisión declarativa = ideal para matrices "clase de equipo × lectura → severidad");
      Maximo (conditional expressions + automation scripts); Power Apps (business rules declarativas). **Decisión de
      arquitectura clave (criterio):** reglas **DECLARATIVAS first** + **lenguaje de expresión SEGURO y sandboxeado**
      (whitelist tipo JSONLogic/CEL, **NUNCA `eval`/JS arbitrario** — seguridad + on-prem + auditable), evaluado **idéntico
      en cliente y servidor** (extiende la fuente única actual); **NO** scripting libre (sobre-ingeniería + riesgo). Las
      reglas viajan en la **versión INMUTABLE** de la plantilla (cambiar una regla = nueva versión auditada, GxP). Evaluar
      **DMN** para las tablas de decisión complejas. **Encaje por capas:** el NÚCLEO (condiciones + cálculo + validación
      cruzada + fuente única) es **Fase 2** (expande el form engine); las **acciones que disparan** incidencia/
      notificación se cablean cuando existan esos módulos (Fase 4 / Notificaciones).

### Fases siguientes (roadmap, ver PROGRESS §tabla)
- [ ] **Fase 2** — Plantillas / Form Builder + Bitácoras. **Arquitectura enterprise definida en DECISIONS
      2026-06-09** ("formulario = proceso/documento vivo de secciones"; captura multi-actor por fases;
      definición versionada vs ejecución auditada; flujo = máquina de estados configurable integrada al RBAC
      dim. 3; firmas estilo Part 11 opt-in). **El modelo se diseña completo desde el inicio** (secciones +
      flujo + versionado + firma) para no migrar; la UI/comportamiento se construye por sesiones:
  - [x] **2.1 Plantillas: modelo + contratos + Form Builder (estructura).** ✅ (2026-06-09). `Template` 1—N
        `TemplateVersion` inmutable (MMR Part 11) + **secciones** + campos núcleo (número con min/max/**umbral
        ISA-18.2**/unidad, texto, textarea, select/multiselect, booleano, fecha/datetime) + SEVERITY/SIGNATURE
        modelados + validación de config por tipo en backend + permiso por sección (override por campo en el
        modelo) + **vista previa** + **borrador/publicar** (congela versión, editar publicada clona borrador).
        Referencias a `WorkflowDefinition`/firma/recurrencia como columnas (editores 2.2/2.3). 7 permisos
        nuevos (catálogo 33). `@lyra/ui`: `Textarea`. **Sin llenado.** Ver PROGRESS y DECISIONS 2026-06-09.
        **Pendiente: smoke VISUAL** (ver §4).
  - [x] **2.1.1 Endurecimiento de modelo (ADITIVO, antes del llenado 2.4).** ✅ (2026-06-09). Campo en **3 capas**:
        `type` (presentación) + **`dataType`** derivado (enum `FieldDataType`, 12 valores; `deriveDataType`) +
        **`semanticRole?`** (enum `FieldSemanticRole?`, nullable; solo `EFFECTIVE_DATE` con editor/comportamiento,
        ≤1 por versión). `options[]` → **`optionSource`** discriminado (`inline` editable; `referenceList`/`external`
        modelados, sin resolución; `upgradeFieldConfig` sube el shape legacy sin migración SQL). Valor de referencia =
        **`code` estable** (documentado). Migración aditiva `20260609155007_add_field_layers` (backfill de `dataType`
        desde `type`). Form Builder: editor inline `code/label` + toggle "Fecha efectiva". **`LogEntry` diferido 100%
        a 2.4** (solo diseño en DATA_MODEL/DECISIONS; crear tablas nuevas es aditivo). Tests: contracts 23, API 78.
        Smoke en vivo OK. **Pendiente: smoke VISUAL** (§4). Ver PROGRESS y DECISIONS 2026-06-09.
  - [x] **2.x Datos de referencia / Listas (módulo nuevo, hermano de Estructura/Seguridad).** ✅ (2026-06-09).
        Mantenedor de **`ReferenceList`** + **`ReferenceItem`** (`code` estable + `label` + `active` + `sortOrder` +
        **`metadata` jsonb**), catálogo **gobernado** (NO versionado-inmutable). 4 permisos nuevos
        (`module:referencedata:view/manage` + `referencelist:view/manage`, catálogo **41**), auditado. Binding REAL
        de SELECT/MULTISELECT a una lista (`optionSource.referenceList.listKey` por clave, validado en
        `saveDraft`); la vista previa **resuelve** opciones (muestra label, guarda code). Guard "en uso" al borrar
        lista. Mantenedor master-detail `/datos-referencia` + Form Builder (selector de fuente inline↔lista). Seed
        demo `failure-modes` (ISO 14224) + `shifts`. Tests: contracts 44, API 97. El **sync desde APIs externas**
        sigue en **Fase 3** (`source=EXTERNAL` solo modelado); el **hard-delete de ítem con code en uso** se guarda
        cuando exista `LogEntry` (2.4). Ver DECISIONS/PROGRESS 2026-06-09. **Pendiente: smoke VISUAL** (§4).
  - [ ] **Datos de referencia — roadmap industrial** (análisis crítico 2026-06-09, ver DECISIONS; todo ADITIVO,
        cada ítem en su sesión):
    - [x] **Import/export CSV masivo de ítems** ✅ (2026-06-09). Export `;` es-CL + metadata aplanada
          `metadata.<clave>`; import dry-run→commit con upsert por `code`, errores por línea, `deactivateMissing`
          opt-in (nunca borra), tope `REFERENCE_IMPORT_MAX_ROWS` (env), transaccional + auditado. Parser RFC 4180
          propio con auto-detección de delimitador. Web: Exportar/Importar + modal con preview del diff. Tests:
          contracts 46, API 110. Ver DECISIONS/PROGRESS 2026-06-09. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Jerarquía de ítems** (`parentId` self-FK) — ALTA-MEDIA (ISO 14224 es jerárquico; áreas→subáreas;
          especies→productos). El picker gana agrupación/árbol.
    - [ ] **Listas dependientes / cascada** (`optionSource.referenceList.filter {byFieldKey, metadataKey}`) —
          MEDIA, **diseñar con 2.4** (subárea según área; modo de falla según clase de equipo).
    - [ ] **Atributos tipados por lista** (`ReferenceList.metadataSchema` jsonb que valida ítems) — MEDIA
          (gobierno RDM: metadata consistente para reportes).
    - [ ] **Vigencia por ítem** (`validFrom`/`validTo`; resolve filtra por fecha) — MEDIA (contratistas, normativas).
    - [ ] **Mapeo de códigos externos por ítem** (crosswalk/ConceptMap; `systemKey`+`externalCode`) — con **Fase 3**
          (motor de sync `source=EXTERNAL`).
    - [ ] **Deprecación con reemplazo** (`replacedByCode`) — BAJA-MEDIA (reportes puente al sucesor).
    - [ ] **Resolve server-side con búsqueda+paginación** para listas 5k+ — MEDIA, con 2.4/Fase 3 (hoy el resolve
          completo es correcto hasta ~1k ítems).
    - [ ] **i18n de labels** (Fase 7) · **presentación semántica por ítem** (color/icono/abreviatura) — formalizar
          si el patrón se repite (la metadata ya puede llevarlo).
  - [x] **2.2 Flujos reutilizables (`WorkflowDefinition`):** ✅ (2026-06-09). Mantenedor propio (catálogo estilo
        Plantillas) — `WorkflowDefinition` 1—N `WorkflowDefinitionVersion` (inmutable) → estados + transiciones +
        **roles por transición (dato)** + firma/`signatureMeaning`/MFA opt-in; versionado/congelable. `validateWorkflowMachine`
        (fuente única: contrato+backend+builder). FK desde `TemplateVersion` (reemplaza columnas string, `onDelete:
        Restrict`). Binding validado en backend (flujo publicado + versión vigente + `editableInStateKey` ∈ estados).
        Web: `WorkflowBuilder` declarativo + Form Builder (asignar flujo, sección→estado, override de rol por campo
        `TemplateFieldRole`). 4 permisos nuevos (catálogo **37**). Tests: contracts 36, API 88. Ver DECISIONS/PROGRESS.
        **Pendiente: smoke VISUAL** (§4).
  - [x] **2.3.0 Calendario operacional (turnos + periodo contable)** ✅ (2026-06-09). `OperationalCalendar` 1—N
        `OperationalShift` (catálogo VIVO, no versionado) + `PeriodKind` MONTH(anchorDay)/WEEK(startWeekday)/CUSTOM
        (ciclo N días). **`resolveShift`** función pura (`Intl`, sin deps) `timestamp→(operationalDate, shiftCode,
        periodKey)` + **`validateOperationalCalendar`** (sin solapes, huecos OK) = fuentes únicas. **`ShiftResolver`**
        (token DI, patrón EmailService) exportado para 2.4/2.3/Fase 5. FK `OrgNode.operationalCalendarId` + resolución
        por path. 4 permisos (catálogo **45**). Migración aditiva `…_add_operational_calendar`. Web
        `/calendario-operacional` (editor turnos + timeline 24 h + ancla + periodo + **probador** en vivo + nodos).
        Seed `mina-rajo`. Tests: contracts 76, API 119. Smoke en vivo OK. Ver DECISIONS/PROGRESS 2026-06-09.
        **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos del Calendario operacional (aditivos, cuando un cliente lo pida):** calendario fiscal **4-4-5**
          (meses de largo variable, retail/finanzas); **rotación de cuadrillas / turno distinto por día de semana**
          (sería un scheduler); **shift definitions con vigencia** (`validFrom`/`validTo`) para re-resolver timestamps
          históricos con la definición de su época (hoy el catálogo es vivo + estampado en `LogEntry` preserva el
          histórico). Ver DECISIONS 2026-06-09 (forks 2 y 5).
  - [x] **2.3 Programación de rondas ✅ (2026-06-15, `feat/programacion-rondas` → `main`).** Renombrada `LogPeriod` →
        **`LogSchedule`** (horario) + **`RoundOccurrence`** (ocurrencia) tras objetar el nombre (choca con `OperationalPeriod`).
        Horario VIVO (plantilla×nodo×recurrencia SHIFT/INTERVAL/CALENDAR, apoyado en `OperationalCalendar`/`ShiftResolver`) que
        genera ocurrencias materializadas (PENDING/COMPLETED/SKIPPED/CANCELED); la ENTRADA se crea al **iniciar** (reusa
        `LogEntriesService.create`, ligada por `RoundOccurrence.logEntryId @unique`); generación lazy idempotente + botón Generar,
        "vencida" DERIVADA. Página `/rondas` + badge en `/bitacoras`. 2 permisos `schedule:view/manage` (cat. 62). Enumerador PURO
        testeado. Contracts 249 · API 234 · smoke 21/21. **Deuda diferida:** multi-nodo/descendientes · fan-out por equipo (Route) ·
        anclaje a cierre real (floating) · completion-requirement (no abrir la próxima hasta cerrar la anterior) · escalamiento/
        notificación de vencidas (→ Notificaciones) · cron `@nestjs/schedule` · picker de plantilla/nodo propio del planificador
        (hoy reusa el de `logentry:create`) · COMPLETED-on-seal sin smoke en vivo (cubierto por el hook + unit; sellar es
        template-dependiente). **Pendiente: smoke VISUAL** (§4).
  - [x] **2.3.1 Rondas: separar PLANIFICAR de EJECUTAR ✅ (2026-06-16, `feat/rondas-worklist` → `main`).** Permiso nuevo
        **`round:execute`** (cat. 63) gatea ver+ejecutar **"Mis rondas"** (`/mis-rondas`, worklist del operador con toggles
        Pendientes/Mi turno/Vencidas/Próximas + Iniciar/Continuar/Omitir); start/skip se MOVIERON de `schedule:manage` a
        `round:execute`. **`LogSchedule.responsibleRoleId?`** SINGLE nullable (FK Role SetNull) = rol responsable, leído EN VIVO
        (reasignar re-enruta pendientes); `null` = fallback nodo+turno. `/rondas` relabelada **"Programación de rondas"** (CRUD +
        monitoreo read-only + selector de rol responsable), widget en Inicio, badge de /bitacoras → mis-rondas. `GET
        /schedules/my-rounds`+`/stats` (responsabilidad por rol ∩ ABAC ∩ turno) + `role-options` (decoplado de role:read).
        Migración aditiva. Contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 + `smoke-rondas.py` 21/21. 4 forks en
        DECISIONS 2026-06-16. **Pendiente: smoke VISUAL** (§4). **Deuda diferida:** rol responsable MULTI (hoy single);
        notificar al rol responsable de su ronda vencida (→ Notificaciones); shiftOnly resuelve el turno del calendario por
        defecto (no per-nodo del usuario).
    - [ ] **RONDAS · Route (fan-out por EQUIPO) — pendiente prioritario (pedido 2026-06-16).** Hoy un `LogSchedule` apunta a
          **UN** nodo y opcionalmente **UN** equipo ⇒ para abrir una ronda por activo hay que crear **un horario por equipo**
          (funciona, pero N horarios que mantener). **A construir:** un horario que cubra **varios equipos** de un nodo (todos /
          por categoría / lista) y, en cada ocurrencia, haga **fan-out** = abrir **una `RoundOccurrence` por equipo** (cada una
          con su `equipmentId`, su entrada y su firma). Patrón *Route/Operator Round* de SAP PM (route + measurement points) /
          Maximo (route + asset list) / j5. **Caso de uso real:** 5 estanques de combustible (equipos) chequeados cada hora ⇒ con
          Route = 1 horario → 5 rondas/hora automáticamente, en vez de 5 horarios. Decidir al planificar: selección de equipos
          (categoría/tag/lista) · una entrada por equipo (recomendado, trazabilidad EAM/ISO 14224) vs una entrada con
          sub-secciones por equipo · migración (`LogSchedule` gana el criterio de equipos o tabla puente). **Workaround actual:**
          `scripts/seed-demo-estanques.py` (1 horario por estanque).
    - [ ] **RONDAS · ESCALABILIDAD del planificador a millones de ocurrencias (detectado 2026-06-16).** Hoy es MVP client-side:
          **(a)** `GET /schedules` devuelve TODOS los horarios sin paginar (OK a cientos; pesado a miles en multi-sitio) —
          falta paginación/orden/búsqueda server-side. **(b)** La grilla de **Ocurrencias** carga `take: 500` y pagina/busca/ordena
          en el CLIENTE ⇒ con millones de `RoundOccurrence` **solo se ven las primeras 500**. **(c)** Los filtros (equipo/área/
          bitácoras) se derivan de los datos cargados ⇒ con paginación server-side quedarían incompletos. **A construir (patrón ya
          probado en Bitácoras `LogbookQueryService`):** keyset/cursor + filtros + orden + búsqueda **server-side** para ocurrencias
          (y horarios al crecer); **endpoint de FACETAS** para poblar los dropdowns completos (como `/log-entries/facets`); el
          selector de EQUIPO como **value-help con typeahead server-side** sobre el catálogo de equipos en alcance (no derivado de la
          página). Mientras el volumen sea bajo (config + demos) el MVP basta; agendar antes de un cliente con alto volumen.
    - [ ] **RONDAS · "RUN MODE" — ejecución guiada de la ronda (UX premium del OPERADOR). Retomar DESPUÉS de Notificaciones,
          con PLAN DETALLADO (idea capturada 2026-06-16, pedido del dueño).** Hoy al "Iniciar" se cae en la pantalla genérica de
          llenado; lo potente es un **modo a pantalla completa, paso a paso**, pensado para hacerse caminando en terreno
          (tablet/guantes). **Alcance #1 (recomendado, frontend, reusa `FieldControl`/secciones — NO reinventa validación):**
          una cosa a la vez (sección/equipo por pantalla) · **barra de progreso** ("3 de 8") · botón gigante Siguiente · áreas
          táctiles enormes + teclado numérico grande · swipe entre equipos · **resumen final** (qué quedó fuera de rango) antes de
          sellar. Patrón apps móviles SAP PM / Maximo / j5. **Complementos de alto impacto:** **(A)** "**Todo conforme**" por
          excepción (pre-llena lo esperado, el operador solo toca lo anómalo — velocidad en rondas rutinarias; review-by-exception
          en CAPTURA); **(B)** **escanear el equipo → abre su ronda** (reusa el escáner QR de Ola 3 `@zxing` + endpoint resolver
          equipo→ocurrencia); **(C)** **tendencia/lectura anterior en línea** al capturar un número (valor previo + mini-sparkline +
          delta; extiende el contador/delta de Ola 2). **Estratégica aparte (mayor esfuerzo, su propio proyecto):** **modo OFFLINE**
          (PWA offline-first: descargar mis rondas → llenar sin señal → sincronizar con manejo de conflictos GxP) — alto valor en
          faena minera sin cobertura. **Nota de criterio:** es UX del FLUJO DE LLENADO (no de la pantalla de rondas) ⇒ tratarlo como
          su PROPIA sesión con plan/forks (un objetivo por sesión). **Al retomar: redactar el plan detallado del Run Mode (forks,
          alcance, mockup en texto) y esperar visto bueno antes de codear.**
  - [x] **2.4 Llenado (Nueva entrada) multi-actor** ✅ (2026-06-10). Tablas `LogEntry`/`LogEntrySection`/
        `LogEntryValue`/`LogEntryFieldChange` (aditivas). Secciones editables por estado+rol (dato `TemplateSectionRole`
        + override por campo) × ABAC; validación 100% en servidor (`validateFieldValue` = fuente única reusada en
        cliente); **concurrencia optimista por sección** (409); auditoría por campo. Estampa `recordedAt` (inmutable),
        `effectiveAt` (recalcula en DRAFT, congela al enviar) y vía `ShiftResolver` `shiftCode`/`operationalDate`/
        `periodKey` (nullable = degradación elegante). `workflowDefinitionVersionId` DENORMALIZADO. Web: `FieldControl`
        compartido + `/nueva-entrada` (picker) + `/nueva-entrada/:id` (llenado). 4 permisos (catálogo **49**). Tests:
        contracts 97, API 129. Ver DECISIONS/PROGRESS 2026-06-10. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos de 2.4 (seguimientos, aditivos):** **(a) ✅ RESUELTO en 2.8.0** — selector de NODO al crear (para
          globales y multi-nodo): `NewEntryPage` ofrece los nodos elegibles (asignaciones ∩ ABAC), autoselecciona si hay
          1 y obliga si >1; el backend valida la membresía. **(b)** re-seed del borrador local al resolver un **409** (hoy se recarga la query pero el
          borrador conserva los valores intentados; falta refrescar el editor con lo del servidor sin perder lo no
          guardado). **(c)** edición de una entrada ya enviada (`logentry:edit`/anulación con motivo) — hoy SUBMITTED es
          inmutable. **(d)** hard-delete real de ítem de Lista con `code` en uso (ahora ya hay `LogEntryValue` para
          consultarlo, deuda registrada en 2.x).
  - [x] **2.5 Ejecución de flujo + firmas electrónicas (Part 11)** ✅ (2026-06-10). Motor `executeTransition`
        (rol-dato `WorkflowTransitionRole` × ABAC × completitud de secciones del estado de origen), firmas
        `LogEntrySignature` polimórficas (TRANSITION|SECTION_COMPLETION, check XOR) con re-auth `ReauthService`
        (contraseña + MFA step-up condicional) y hash del snapshot canónico (§11.50/11.70/11.200), recomputo de
        secciones (LOCKED/reapertura), sellado reconciliado a la 1ª transición (submit queda para forms sin flujo),
        `status` terminal SUBMITTED, historial `LogEntryTransition`. Permiso `logentry:transition` (catálogo **50**).
        Gancho `onTransitionExecuted` (no-op) para el bus de eventos/Fase 4. Web: `TransitionModal`/`SectionSignModal`
        + barra de transiciones + timeline. Migración `…_add_log_entry_execution`. Tests: contracts 104, API 144.
        Smoke en vivo 21/21. `/security-review` sin hallazgos. Ver DECISIONS/PROGRESS 2026-06-10. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos de 2.5 (aditivos):** **(a)** **reversa/anulación de transición** (corrección GxP) — transición
          inversa con motivo obligatorio + su propia firma; el modelo append-only ya la soporta (fork 5 diferido).
          **(b)** guarda de completitud **configurable por transición** (hoy exige COMPLETED todas las secciones del
          estado de origen con campos). **(c)** re-seed del editor al transicionar desde otra pestaña (concurrencia de
          estado, espejo del 409 de sección). **(d)** anulación de entrada (`VOID`): **borradores ✅ en 2.8.2** (motivo
          auditado, `status=VOID`, sin firma); **falta la anulación de una entrada SELLADA** (firma §11.200 + transición
          inversa) — va junto con (a).
  - [x] **2.6.0 Módulo de Bitácoras — núcleo de lectura** ✅ (2026-06-10). Diseño COMPLETO del módulo + slicing en
        DECISIONS 2026-06-10 (9 forks + 3 adiciones de modelo confirmados). Migración aditiva
        `…_add_logbook_review_columns` (folio `entryNumber` con backfill ordenado, `requiresSignature` estampado,
        `thresholdBand` ISA-18.2 estampada + `db:backfill-threshold-bands`, índices createdById/currentStateKey).
        `LogbookQueryService` (CQRS-lite): list con filtros completos en SQL + ABAC + keyset, stats, export CSV
        server-side, timeline ALCOA+ fusionada en backend, changes paginado, related, **verificación de integridad de
        firma** (§11.70, veredicto tri-estado, auditada; canonicalización v2 del payload — descarta valores vacíos —
        y `changedAt` estampado con el reloj de la firma). Web `/bitacoras` (KPIs + filtros + chips + grilla con color
        de estado congelado + indicadores + cursor + deep-link + export) y `/bitacoras/:id` (record viewer EBR:
        mini-stepper, FieldControl readOnly + badges de umbral, panel de firmas con verificación, timeline, log de
        cambios, relacionadas, impresión). `Chip.onRemove` en @lyra/ui. Tests: contracts 113, API 156. Smoke 22/22.
        **Pendiente: smoke VISUAL** (§4).
  - [ ] **2.6.1 Bitácoras — Personalización** **← siguiente recomendada.** `SavedView` server-side como concepto de
        PLATAFORMA (`module` discriminador; config = {filters, search, sort, columns{order,hidden,pinned,widths},
        density}; CRUD del dueño; UNA default por usuario+módulo; **vistas de sistema en código**, no en BD: "Mi
        turno", "Firmas pendientes", "Excepciones", "Últimas 24h"; deep-link a vista; compartir por rol DIFERIDO) +
        **gestor de columnas** (mostrar/ocultar/reordenar drag/pin izq-der/redimensionar/autosize — evolución del
        `Table` de @lyra/ui, reusable por Incidencias Fase 4) + densidad por grilla + recordar última vista (efímero
        localStorage, nombradas en BD). Incluir aquí: **filtro de EQUIPO en UI** (contrato ya lo soporta) y
        **multi-sort** si el gestor lo justifica.
  - [ ] **2.6.2 Bitácoras — Analítica/UX avanzada**: **facetas con conteo por valor** (estilo Splunk/Kibana; de paso
        el select de "estado del flujo" deja de poblarse solo con el set cargado), agrupación con subtotales
        (por plantilla/nodo/turno/estado), peek/quick-look (Drawer lateral sin salir del listado), hover cards,
        copiar al portapapeles (folio/valor), mini-tendencias/sparklines de campos numéricos en el periodo,
        atajos de teclado + ⌘K profundo (abrir vista guardada), atajos "turno actual"/"este periodo" (requieren
        resolver el calendario o facetas), **export con columnas de valores al filtrar por UNA plantilla**,
        contador de cambios por campo inline en sección (popover). Formato LONG de export diferido hasta demanda BI.
  - [ ] **2.7 (cruce Fase 4)** reglas de umbral que disparan incidencias (con el motor de incidencias).
        *Nota 2026-06-11: con el plan post-2.6.0 los números 2.7/2.8/2.9 se reasignan a las fases nuevas (abajo);
        este cruce umbral→incidencia pasa a vivir dentro de la Fase 4.*
  - [ ] **MEJORAS POST-2.6.0 (revisión del dueño del producto, 2026-06-11)** — 10 mejoras registradas; texto
        íntegro en el historial de git de `docs/NEXT_SESSION.md` (commit `db17981`); triage + plan de fases en
        DECISIONS 2026-06-11 (**APROBADO TAL CUAL por el dueño del producto el 2026-06-11**; orden 2.7 → 2.8 → 2.9):
    - [x] **#4 Rediseño "Guardar sección"/"Guardar y completar" + garantía por sección en servidor** ✅
          (2026-06-11, esta sesión). Auditado ANTES de declarar bug: el backend ya gateaba (sin agujero); causas
          reales = datos demo sin roles por sección + DTO sin "porqué" + gap REAL en `submit` sin flujo (sellaba
          sin secciones COMPLETED ⇒ eludía la firma de sección). Ver DECISIONS 2026-06-11.
    - [ ] **Fase 2.7 — Gobernanza temporal del registro** (interdependientes; alta prioridad por integridad):
      - [x] **2.7.0 (#1) Registro diferido** ✅ (2026-06-11, `feat/registro-diferido` → `main`). `entryOrigin`
            ONLINE|DEFERRED DECLARADO + `declaredEffectiveAt`/`deferredReason` (obligatorio)/declarante +
            `PUT :id/deferral` + cadena `campo → declarada → recordedAt` en `resolveEffectiveAt` + huella en
            llenado/grilla (filtro+chip)/visor/timeline (`DEFERRED_DECLARED`) + export CSV. 3 forks resueltos en
            DECISIONS 2026-06-11. Tests: contracts 120 · API 169. Smoke 14/14. **Pendiente: smoke VISUAL** (§4).
        - [ ] **Diferidos de 2.7.0 (aditivos):** **(a)** *nudge* suave de UI cuando `effectiveAt` difiere mucho de
              `recordedAt` sin declaración (invita a declarar; NO guarda de servidor — diseñar con 2.7.2);
              **(b)** KPI/faceta "Diferidas" en `/bitacoras` (hoy hay filtro+chip; el conteo llega natural con las
              facetas de 2.6.2); **(c)** al QUITAR la marca el campo `EFFECTIVE_DATE` escrito por el gesto se
              conserva (decisión: es dato del canal normal) — reevaluar si confunde en la práctica.
      - [x] **2.7.1 (#5) Período contable gobernado** ✅ (2026-06-11, `feat/periodo-gobernado` → `main`). Entidad
            `OperationalPeriod` (calendario × periodKey) OPEN/CLOSING/CLOSED, **modelo LAZY** (ausencia=abierto), cierre/
            reapertura con motivo+permiso+auditoría (`opsperiod.closed|reopened`), guarda única `assertWritable` por
            `effectiveAt` en create/saveSection/setDeferral/submit/executeTransition (`PERIOD_CLOSED`), bypass DATO
            `opsperiod:write-closed` (catálogo **54**), huella proactiva en getDetail + mantenedor en
            `/calendario-operacional`. 4 forks resueltos en DECISIONS 2026-06-11. Tests: contracts 125 · API 180.
            Smoke 17/17. **Pendiente: smoke VISUAL** (§4) + guarda de executeTransition live (cubierta por código+unit).
        - [ ] **Diferidos de 2.7.1 (aditivos):** **(b)** KPI/indicador de períodos cerrados en `/bitacoras`; **(c)**
              vista "¿qué entradas caen en este período?" desde el mantenedor. *(El hard lock pasó a 2.7.1.1 como LOCKED.)*
      - [ ] **2.7.1.1 (#5b) Calendario FISCAL transversal + período al estándar industrial** **← siguiente (APROBADO,
            DECISIONS 2026-06-11).** Corrige el acoplamiento detectado por el dueño del producto: el período contable es
            **transversal**, hoy vive dentro del calendario de turnos. **Desacoplar** en entidad **`FiscalCalendar`**
            (transversal, default + asignación por nodo; `OperationalCalendar` se queda solo con turnos). Modelo
            **Maximo + tri‑estado NetSuite**: períodos con rango From/To contiguos, **generación explícita** ("Generar
            períodos" idempotente), estado **OPEN→CLOSED→LOCKED** (LOCKED duro bloquea incl. bypass; reabrir con
            `opsperiod:unlock`), **cierre secuencial**, fecha sin período = abierta por defecto + flag `requirePeriod`.
            `OperationalPeriod` re‑scopeada a `fiscalCalendarId × periodKey`. Permisos `opsperiod:lock`/`unlock`
            (catálogo **54→56**). Supersede la presentación LAZY y el scope-por-turno de 2.7.1 (modelo de cierre/guarda
            se conserva y endurece). El `periodKey` estampado no se rompe (se migra la config de período). 4 forks +
            corrección estructural resueltos en DECISIONS 2026-06-11. **Su propia sesión.**
      - [x] **2.7.2 (#6) Ventana de edición configurable** ✅ (2026-06-12, `feat/ventana-edicion` → `main`).
            `{ancla RECORDED|EFFECTIVE, duración}` en `Template` (gobernanza VIVA, sin republicar) + fallback global en
            `SystemSettings`; fuera de ventana solo **`logentry:write-expired`** (catálogo **59**) + **motivo auditado**
            (evento dedicado `logentry.editwindow.override` + `FieldChange.reason`) + MFA opt-in (`requireMfaEditWindowOverride`
            vía `ReauthService`). En **AND** con el período ("gana la más estricta", cada guarda con su bypass);
            `blockedReason` extendido con `EDIT_WINDOW_EXPIRED` (precedencia ENTRY_CLOSED→PERIOD_CLOSED→EDIT_WINDOW_EXPIRED→
            reglas de sección). Guarda en `saveSection`/`setDeferral`/`submit` (NO create ni executeTransition); huella
            `editWindow` en `getDetail`. Fuente única `resolveEditWindow`/`editWindowDeadline`/`isEditWindowExpired`. 5 forks
            resueltos (DECISIONS 2026-06-12). Tests contracts 149 · API 200. Smoke 21/21. **Pendiente: smoke VISUAL** (§4).
        - [ ] **Diferidos de 2.7.2 (aditivos):** **(a)** *nudge* suave de UI cuando `effectiveAt` difiere mucho de
              `recordedAt` sin declaración (heredado de 2.7.0(a); UX pura, NO guarda de servidor); **(b)** KPI/faceta
              "Editadas fuera de ventana" en `/bitacoras` (el conteo llega natural con las facetas de 2.6.2; el dato ya
              está en AuditLog `logentry.editwindow.override`).
      - [ ] **2.7.3 (#7) Permisos sección × tiempo**: matriz administrable rol×sección×ventana aplicada en
            servidor; extiende `blockedReason` (+PERIOD_CLOSED, +EDIT_WINDOW_EXPIRED) para que la UI siempre
            diga POR QUÉ.
    - [ ] **Fase 2.8 — Alcance de plantilla + acceso** (absorbe diferido (a) de 2.4 y la 2.6.1 planificada):
      - [x] **2.8.0 (#2) Plantillas multi-nodo** ✅ (2026-06-12, `feat/plantillas-multinodo` → `main`). N:M
            **`TemplateNodeAssignment`** (nodo + `includeDescendants`) = fuente de verdad única de la visibilidad por
            nodo; `Template.orgNodeId` = nodo primario DERIVADO (deprecado, DROP en §3). 3 modos (uno/varios/"todos los
            hijos de X"); **0 asignaciones = GLOBAL** (permisivo). `ScopeService.getAccessibleNodes`+`isTemplateVisibleByNode`;
            selector de nodo al crear **acotado a asignaciones ∩ ABAC** (autoselección si 1, **obliga si >1**),
            `assertNodeAllowedForTemplate` en create/previewNew (**cierra el diferido (a) de 2.4**), endpoint
            `GET /log-entries/templates/:id/nodes`. UI en `TemplateBuilder` (reusa `ScopeTreePicker`) + `NewEntryPage`.
            Sin permisos nuevos (catálogo 59). Tests API **213** (+8). Smoke 15/15. 6 forks en DECISIONS 2026-06-12.
            **Smoke VISUAL ✅** (confirmado por el dueño 2026-06-12).
      - [x] **2.8.0.1 Equipo OPCIONAL al crear entrada (objeto de referencia EAM)** ✅ (2026-06-12,
            `feat/equipo-opcional-entrada` → `main`). Tras elegir el nodo, selector de **equipo opcional** instalado en ese
            nodo (patrón SAP PM/Maximo ubicación+activo; grano ISO 14224 para confiabilidad/Fase 4). `eligibleNodesForTemplate`
            devuelve los equipos activos por nodo; `assertEquipmentInNode` valida pertenencia en create/previewNew; el modal
            de creación se abre también con 1 nodo si tiene equipos. El **equipo se muestra en la cabecera del llenado**.
            `LogEntry.equipmentId` ya existía (2.4). Smoke 18/18 + **VISUAL ✅** (confirmado por el dueño). Ver DECISIONS 2026-06-12.
      - [x] **2.8.0.2 Modo de equipo por PLANTILLA (gobernanza, "opción B") ✅ (2026-06-12, `feat/modo-equipo-plantilla` →
            `main`).** Enum **`EquipmentMode`** `NONE|OPTIONAL|SUGGESTED|REQUIRED` en **`Template`** (contenedor MUTABLE =
            gobernanza viva, default OPTIONAL = cero ruptura). OPTIONAL≡SUGGESTED en backend (permisivos; SUGGESTED solo
            empuja en UI). Enforcement en **`create`/materialización** (`assertEquipmentForMode`: REQUIRED sin equipo → 400,
            NONE con equipo → 400); `previewNew` solo valida NONE. `eligibleNodes` expone `equipmentMode` y omite equipos si
            NONE. Control en `TemplateBuilder` (gate `template:edit`) + lógica del modal en `NewEntryPage`. Sin permisos
            nuevos (catálogo 59). Migración `20260612180000_add_template_equipment_mode`. 6 forks en DECISIONS 2026-06-12.
            Tests contracts **151** · API **216**. Smoke **17/17** (`scripts/smoke-template-equipment-mode.py`, crea+limpia
            por ID). **Pendiente: smoke VISUAL** (§4). Deuda diferida: re-validar al sellar si el equipo REQUIRED se da de baja.
      - [ ] **2.8.1 Bitácoras — Grilla ORIENTADA A CONTENIDO + personalización (#9 + 2.6.1 fusionadas).** **PLAN ACORDADO
            con el dueño (2026-06-12, ver DECISIONS).** Problema raíz detectado por el dueño: la grilla de `/bitacoras` es
            **ciega al contenido** (solo metadatos: folio/plantilla/nodo/estado/fechas/autor) ⇒ no se puede *reconocer ni
            encontrar* un registro por su negocio (temperatura, presión, "operó normal", equipo). Síntesis del estándar
            (SAP Fiori smart columns+variants · j5/Hexagon línea de resumen · Maximo descripción+activo+saved queries ·
            ServiceNow peek+facetas · Splunk facetas con conteo+búsqueda por contenido · EBR/PAS-X review-by-exception).
            **Modelo de columnas en 3 niveles:** (1) metadatos [hoy] · (2) **valores de negocio/Resumen** [lo que falta] ·
            (3) **Equipo** [EAM, ya existe]. **Descriptor (fork resuelto):** la PLANTILLA marca el *pool* de campos
            candidatos (toggle **`showInGrid`** por campo, gobernanza viva) y el USUARIO elige cuáles ver (columnas o línea
            "Resumen") con default sensato — "el diseñador ofrece, el usuario dispone". **Entregar en 3 sub-slices:**
        - [x] **2.8.1a — Contenido reconocible (MVP) ✅ (2026-06-13, `feat/bitacoras-grilla-contenido` → `main`).** Pool de
              candidatos = **`Template.gridFieldKeys String[]`** (gobernanza VIVA del contenedor, `PATCH` "Guardar
              configuración", **NO** `TemplateField.showInGrid` — corrige el plan: poner el flag en la versión inmutable
              forzaría republicar una versión GxP por un hint de visualización; ver DECISIONS). Cap 6 + sin dup +
              `assertGridFieldKeysExist`. Listado expone `summaryValues[]` (batched, cero N+1, code→label, banda umbral) +
              `equipmentTag`; default = línea **Resumen** (3); columna **Equipo** `TAG·Nombre`; **búsqueda por contenido**
              (`EXISTS` sobre candidatos + `pg_trgm` GIN). MISMO where/ABAC ⇒ sin fuga. UI builder (checklist) + `LogbookPage`.
              Sin permisos nuevos (59). Tests contracts 154 · API 216 · smoke 21/21. **Deuda:** búsqueda por LABEL del SELECT
              (hoy matchea el code) · smoke VISUAL.
        - [x] **2.8.1b — Vistas guardadas + gestor de columnas + multi-sort ✅ (2026-06-13, `feat/bitacoras-vistas-guardadas`
              → `main`).** `SavedView` genérica (`module` + `config jsonb`, **ownership-gated**, default único por `(userId,module)`
              vía índice único parcial, migración `20260613130000`) + `SavedViewsModule` CRUD + vistas de SISTEMA en código
              (Firmas pendientes/Excepciones/Últimas 24h) + `Table` column-aware en `@lyra/ui` (orden/ocultar/anclar sticky/anchos/
              densidad + badge prioridad + resize grip) + `ColumnsDrawer` + `ViewBar` (dirty/Guardar como/Actualizar/Predeterminada/
              Eliminar) + última vista localStorage + **multi-sort keyset lexicográfico** (`sorts` CSV, máx 3 indexadas) +
              **columnas de VALOR individuales por plantilla** (con 1 plantilla filtrada). Sin permisos nuevos (catálogo 59). Tests
              contracts 163 · API 224. Smoke 24/24 (`scripts/smoke-saved-views.py`). Ver DECISIONS/PROGRESS 2026-06-13.
          - [ ] **Diferidos de 2.8.1b (aditivos):** **(a)** compartir vistas por ROL (slots `scope`/`sharedRoleId`, aditivo);
                **(b)** **autosize** de columnas (doble-clic mide contenido; hoy hay resize manual); **(c)** vista de sistema
                **"Mi turno"** (requiere `ShiftResolver` para resolver turno/persona actual → 2.8.1c); **(d)** **orden global por
                columnas de VALOR** (hoy solo client-side del lote; global = Fase 7, rompería keyset/denormalización); **(e)** smoke
                VISUAL del dueño.
        - [x] **2.8.1c — Peek + facetas + review-by-exception + "Mi turno" ✅ (2026-06-13, `feat/bitacoras-peek-facetas` →
              `main`).** `GET /log-entries/facets` (5 dims, **conteos de HERMANOS** reusando `buildWhere`+ABAC) + `GET
              /log-entries/my-shift` (`ShiftResolver`) + `exceptionsOnly`. Web: `FacetsPanel` (clic = toggle de filtro → URL/
              SavedView), `PeekDrawer` (vistazo INSTANTÁNEO desde la fila + "Abrir ficha completa"; clic en fila = peek), realce
              por excepción (`rowClassName` en `@lyra/ui` Table), vista de sistema "Mi turno", **filtro de equipo en UI**
              (cierra pendiente de 2.6.1). Sin permisos nuevos (59). Tests contracts 163 · API 227. Smoke 11/11
              (`scripts/smoke-facets-peek.py`). **2.8.1 COMPLETA.** Ver DECISIONS/PROGRESS 2026-06-13.
          - [ ] **Diferidos de 2.8.1c (aditivos):** **(a)** **multi-select por faceta** (requiere volver multi esos filtros,
                como se hizo con nodos); **(b)** facetas/COUNT **a escala** sin COUNT exacto (Redis/rollups) = Fase 7 (§3);
                **(c)** peek con más detalle (valores por sección reusando `getDetail`, hoy muestra resumen+metadatos+indicadores);
                **(d)** smoke VISUAL del dueño.
      - [ ] **Workflow SLA + atrasos (APROBADO por el dueño 2026-06-13, su propia sesión).** Diagrama de flujo premium ya
            entregado (visor/grilla + builder, horizontal+puertos+canal de retorno, dónde-estás/siguiente-paso, tiempos reales,
            responsable por elemento). **Falta (requiere modelo):** **SLA por ESTADO** `WorkflowState.maxStayMinutes` (migración
            aditiva) + campo en `WorkflowBuilder` (min/horas) + contrato → **alerta de atraso** en el diagrama (estado actual
            sobre SLA = anillo rojo; tramos pasados sobre SLA = ámbar) + **grilla**: indicador/columna "Atraso" + filtro/faceta/
            KPI "Retrasadas" (`delayedOnly`, backend: `status=DRAFT AND now−inicio_estado_actual > SLA_estado_actual`). +
            exponer `roleNames` en la transición de la versión congelada para el responsable en el VISOR. Ver DECISIONS 2026-06-13.
        - [ ] **Parte A del #9 (acceso nodo↔grilla):** selector de nodo ágil "mis nodos"/recientes/favoritos + filtros
              persistentes. Intercalable en 2.8.1a/b (presentar micro-alternativa al llegar). El backend ya guarda
              `LogEntryValue`; solo falta exponerlo acotado. Adiciones de modelo: `TemplateField.showInGrid` + `SavedView` (aditivas).
      - [x] **2.8.2 Creación de entrada SIN borradores huérfanos + descarte de borrador** ✅ (deuda de UX/integridad
            detectada 2026-06-11, CERRADA en 2 cortes). **(a) ✅ 2026-06-12** (`feat/ventana-edicion-ux`): persistencia
            diferida — elegir plantilla NO crea nada (`GET /log-entries/new` arma el detalle sin persistir); la entrada
            se materializa en el **primer guardado real** (modo compose). **(b)(c) ✅ 2026-06-14** (`feat/void-edicion`):
            **anulación de borrador** (`POST /log-entries/:id/void`, `status=VOID`, motivo ≥5 auditado, ownership o
            `logentry:void` para ajenas, ABAC; NUNCA borrado físico — ALCOA+; `buildWhere` excluye VOID por defecto,
            recuperable con `?status=VOID`) + **ruta de edición dedicada** `/bitacoras/:id/editar`. Ver DECISIONS/PROGRESS
            2026-06-14. **Falta (corte posterior):** VOID GxP de entradas **SELLADAS** (firma §11.200 + transición
            inversa, junto a la reversa de transición de 2.5(a)).
    - [ ] **Fase 2.9 — Plantillas inteligentes**:
      - [ ] **2.9.0 (#3) Layouts modernos**: modo por versión (clásico/pestañas/wizard/colapsable) + grilla
            responsiva de campos (1/1, 1/2, 1/3) + separadores/ayudas, como DATO de la versión.
      - [ ] **2.9.1 (#8) Motor de reglas de negocio**: condición→acción como dato versionado (mostrar/ocultar,
            habilitar, exigir, calcular, validar entre campos), misma fuente única back↔front (generaliza
            `visibleWhen`/`validateFieldValue`); admin visual sin código; extensible a notificar/escalar/incidente.
    - [ ] **#10 IA-ready**: restricción TRANSVERSAL de diseño (no fase): metadatos estructurados + reglas como
          datos + claves estables; documentar por fase qué habilita. La IA sigue detrás de `LlmProvider`.
  - [ ] **Expansión de tipos de campo (incremental, cada uno pequeño).** Alto valor industrial: **Conforme/No
        conforme/N.A.** (tri-estado), **lookup/picker de referencia** (single/multi, tras 2.x), **picker de
        Equipo/Usuario/Nodo** (`reference`), **grupo repetible / tabla-matriz**, **campo calculado/fórmula**,
        **bloque de instrucción**, **TIME**. Evidencia (MinIO; modelar ahora, construir hacia Fase 7): adjunto,
        **foto**, **código de barras/QR**, **GPS**. Ligeros: escala/Likert, slider %, rating, email, teléfono,
        URL, auto-numérico. El enum `FieldType` crece de forma aditiva. Ver DECISIONS 2026-06-09 (taxonomía).
  - **Permisos nuevos** (catálogo `@lyra/contracts`): `template:view/create/edit/publish/delete`,
    `workflow:view/manage`, `logentry:view/create/fill`, transiciones por dato. **Forks confirmados**
    (ver DECISIONS 2026-06-09): ambas capturas (colaborativa + rondas), firmas Part 11 opt-in, granularidad
    sección+override, flujos reutilizables.
- [ ] **Fase 3** — Orígenes de datos.
- [ ] **Fase 4** — Motor de incidencias (workflow HSE). **Alcance ampliado a modelar desde el inicio** (escenario
      planteado por el usuario 2026-06-09): una **regla de negocio en un campo de bitácora** (umbral ISA-18.2 ya
      modelado en `TemplateField.config`) **dispara una incidencia** (`AutoIncidentRule`) en un **modelo aparte**
      (`Incident`), con su **propio flujo** (reutiliza `WorkflowDefinition` de 2.2). La incidencia puede generar
      **N tareas** (`IncidentTask`/`WorkItem`) **asignables a uno o varios responsables**, **cada tarea con su propio
      flujo**, y cada una capaz de **generar sus propios registros de avance / bitácoras**. Requisitos clave a diseñar:
  - **Procedencia/trazabilidad bidireccional**: `Incident.sourceLogEntryId` (+ campo/valor que disparó), y enlaces
    `Incident → IncidentTask → (registros de avance)`. La **entrada de bitácora original queda atada** a la
    incidencia y a todos los registros derivados (línea de tiempo navegable en ambos sentidos).
  - **Tareas con flujo propio**: `IncidentTask` instancia su `WorkflowDefinition` (definición inmutable vs ejecución
    auditada, igual patrón que `LogEntry`); asignación multi-responsable; firmas/MFA por transición ya disponibles.
  - **Reutilización**: NO duplicar el motor de máquina de estados ni el de definición/ejecución; todo cuelga de
    `WorkflowDefinition` + el patrón de 2.x. La taxonomía de campos (evidencia foto/QR/GPS, etc.) se comparte.
  - **El disparo concreto** (crear la incidencia al cruzar el umbral) es el **cruce Fase 2.7 ↔ Fase 4**; en Fase 2
    solo se modela la regla en el campo. Ver DECISIONS 2026-06-09 (umbrales) y la sección Incidencias de DATA_MODEL.
- [ ] **Fase 5** — Cambio de turno + IA (resumen).
- [ ] **Fase 6** — Base de conocimiento + Dashboard + Asistente IA.
- [ ] **Fase 7** — Endurecimiento (ver §3 y §5).
- [ ] **Plataforma: Eventos de dominio + Webhooks salientes** (módulo transversal; diseño en DECISIONS 2026-06-09).
      **Backbone de eventos** (`logentry.*`, `incident.*`, `task.*`, `structure.*`) con **patrón outbox**
      (entrega at-least-once) que alimenta tanto Notificaciones como **Webhooks salientes** para **empujar datos
      de bitácoras/incidencias/otros a sistemas externos**. `WebhookSubscription` (URL, eventos suscritos, **secreto
      HMAC** cifrado, headers, activo) + `WebhookDelivery` (intentos, status, **reintentos backoff**, **replay**),
      entrega asíncrona/auditada. Espejo SALIENTE de Fase 3 (entrante). **Amplía** el punto "D: Webhooks" de la
      integración pendiente (ya no solo estructura). Se construye **con/después de 2.5**.
- [ ] **Plataforma: Mensajería / Notificaciones multicanal** (módulo transversal; diseño en DECISIONS 2026-06-09).
      Notificar **POR TRANSICIÓN** (se configura cuáles disparan y cuál mensaje; 0..N por transición): **correo** con
      enlace **aprobar/rechazar**, **WhatsApp**, **SMS**, **in-app**; **mantenedor de plantillas de mensaje**
      (`NotificationTemplate`, variables de merge, i18n).
      Reutiliza el `EmailService`/`SmtpEmailService` ya existentes; proveedores SMS/WhatsApp **opcionales**
      (Twilio/Meta) — sin SaaS obligatorio. Disparo = **dato** (campo aditivo `notifications` en
      `WorkflowTransition`); destinatarios por roles/usuarios/asignado/**escalamiento**; **token de acción**
      firmado single-use/TTL (patrón `PasswordResetToken`) con **restricción Part 11** (si la transición exige
      firma, el enlace re-autentica + captura significado, no aprueba "a ciegas" → **security review**); entrega
      **asíncrona** (cola/reintentos/estado de envío/rate-limit/opt-out). **Se construye con/después de Fase 2.5**
      (necesita el evento de transición); compartido con **Fase 4 (SLA/escalamiento de incidencias)** y **Fase 5**.
      El mantenedor de plantillas puede adelantarse. **Prioridad: alta dentro de 2.5+.**

---

## 3. Deuda técnica / seguridad REGISTRADA (no perder)

> Items con fundamento ya discutidos; aquí para que no se diluyan en `DECISIONS.md`.

### OT · S2 — Editor UI del esquema de folio (`folioScheme` / `folioOnStateKey`) — ✅ HECHO 2026-07-02
- [x] **✅ HECHO 2026-07-02** (`feat/folio-editor-y-plantillas`). El `WorkOrderTypeModal` gana la sección "Folio de la
      orden" con el **`FolioSchemeEditor` compartido** (prefijo/ámbito/reinicio/relleno/inicio/máscara + **vista previa en
      vivo** de 2 folios + clave de secuencia + avisos de colisión scope/mask) + picker "¿cuándo se emite?" poblado con los
      estados del flujo del tipo (o el global OT). Reutiliza el mismo componente que el folio-por-plantilla de bitácora. El
      motor puro se movió a `packages/contracts/src/shared/folio.ts` (ya no es "de OT"). Sin permiso nuevo.

### Despliegue AWS — blindaje de deploys continuos (2026-06-22) — ver `docs/DEPLOYMENT.md`
> WatchLog **EN VIVO** en `lyra.watchlog.itesicws.com`, en el EC2 compartido con Lyra Pass.
> **Hecho:** #1 red `edge` persistente (un redeploy de Lyra Pass ya no tumba WatchLog) + swap 2 GB +
> servicio `watchlog-web` (sin choque de nombres). **#2 y #3 ✅ (2026-06-23, OPS — WatchLog commit `8e8c9a6`,
> Lyra Pass commit `9bfb07e`)** + **#4 backup de Postgres ✅ (2026-06-23, WatchLog commit `6130774`)**:
> **blindaje COMPLETO (#1–#4).** Ver detalle en `docs/DEPLOYMENT.md` y `PROGRESS.md`.
- [x] **#2 · Límites de memoria por servicio (`mem_limit`) ✅ 2026-06-23.** `mem_limit` por servicio en AMBOS
      compose (aislamiento por cgroup: una fuga OOM-mata SOLO su contenedor, no a la vecina). Topes holgados
      sobre el uso real medido (`docker stats`; son techos, no reservas). WatchLog: pg 512m · redis 384m · minio
      384m · api 512m (+NODE_OPTIONS=--max-old-space-size=384) · web 128m · migrate 512m. Lyra Pass: pg 768m (por
      su `shm_size`) · redis 384m · api 512m (+NODE_OPTIONS) · web/admin 256m · worker 384m · migrate 512m · caddy
      192m (borde). Verificado en vivo: 12 contenedores con tope + 3 URLs 200.
- [x] **#3 · Auto-prune en el deploy ✅ 2026-06-23.** `prune_old` tras deploy EXITOSO en ambos `update.sh`:
      `docker image prune -f` (dangling) + borrado DIRIGIDO de la versión anterior de la propia app
      (`lyra-watchlog-*` / `lyra-pass-*` con `$PREV`) — `prune -f` solo no reclama las versiones viejas (quedan
      con tag). App-scoped (nunca en uso ni la vecina), respeta el rollback. **Se ejercita en el próximo deploy con tag.**
- [x] **#4 · Backup de Postgres de WatchLog + cron ✅ 2026-06-23** (WatchLog commit `6130774`). Red de seguridad
      antes de cada migración (`prisma migrate deploy` es forward-only; el rollback solo revierte imágenes, no el
      esquema). `deploy/onprem/backup.sh`: `pg_dump -Fc` (CUSTOM, inspeccionable con `pg_restore --list`/
      `--schema-only`) + `.tmp`/`mv`-atómico + retención 14d **con piso mínimo de 10 copias** (evita el bug del
      `-mtime +14` puro de Lyra Pass). `backup()` en `update.sh` ANTES de migrar, **BLOQUEA por defecto** (escape
      `BACKUP_REQUIRED=false`). Almacén `deploy/backups/` (gitignored). **Cron diario 03:30** instalado en el host.
      Verificado en vivo (BD de prod intacta): dump 286 KB CUSTOM · restauración schema-only a BD descartable =
      74 tablas · rotación al piso de 10. **Con esto el blindaje de deploys (#1–#4) queda COMPLETO.**
- [ ] **Higiene de repo (Lyra Pass):** los cambios de infra del host (Caddyfile + edge) ya se subieron a su
      repo; mantener host↔repo en sync para que un `git pull` manual no choque. **Prioridad: baja.**
- [ ] **Recordatorio en cada deploy** (el dueño lo pidió): verificar Lyra Pass después · `git pull` en
      `/opt/watchlog` si se tocó `deploy/` · `docker system prune -af` cada varios deploys.

### Hallazgos de la sesión QA (2026-06-18) — ver `docs/QA_WALKTHROUGH.md` §4
> **Actualización 2026-06-22:** se cerraron QA#1, QA#2, QA#4 y QA#6 (rama `feat/qa-fixes-y-seed-lite`).
> **QA#3 también se cerró** (apareció apenas el dueño abrió la prueba: los equipos sembrados en Molienda/Flotación
> quedaban invisibles). QA#5 queda **diferido con motivo** (abajo).
- [x] **[QA#1 · bug · media] Pestañas del workspace no son por usuario.** ✅ **RESUELTO 2026-06-22.**
      `workspace-store` ahora guarda `ownerUserId` y `syncOwner(userId)`; `AuthProvider` lo sincroniza al resolver la
      sesión (mismo usuario tras refresh = no-op, conserva sus pestañas; otro usuario / logout = entra **limpio**).
- [x] **[QA#2 · mejora UX · baja] Falta el "ojo" en cambio de contraseña.** ✅ **RESUELTO 2026-06-22.**
      `ForcePasswordChangePage` gana el toggle mostrar/ocultar (mismo patrón `rightSlot`+Eye/EyeOff de `ResetPasswordPage`).
- [x] **[QA#3 · bug · media] Estructura: equipos de nodos intermedios invisibles.** ✅ **RESUELTO 2026-06-22.**
      `NodeDetail.tsx` mostraba **o hijos o equipos** según `isLastLevel` (excluyente); un equipo en un nodo que NO
      es del último nivel quedaba inaccesible. **Fix:** la sección de **hijos** se muestra solo si existe un nivel
      inferior y la **`EquipmentSection` se renderiza SIEMPRE** (con un divisor entre ambas cuando hay hijos), así un
      nodo intermedio muestra hijos **y** equipos. *(Se cerró durante la prueba: los equipos sembrados en
      Molienda/Flotación de DEMOLITE quedaban ocultos por existir el nivel «Línea» debajo de «Proceso».)*
- [x] **[QA#4 · bug i18n · baja] Matriz de permisos mezcla idiomas.** ✅ **RESUELTO 2026-06-22.**
      `es-CL.ts` `permGroups` ahora traduce los 16 grupos del catálogo (templates, workflows, referencedata,
      opscalendar, opsperiod, settings, logbook, schedules, notifications, incidents, handover + los previos).
- [ ] **[QA#5 · mejora UX/seguridad · media] El gate del cliente no se propaga a sesiones activas.** **Backend OK**
      (devuelve 403 correcto; el caché Redis `authz:perms:<userId>` reflejó el set real — **no hay bug de caché**: el
      `[]` observado se debía a que el usuario quedó sin roles, asignación legítima). El cliente gatea con
      `session.permissions` del login (`use-permissions.ts`); al cambiar roles/permisos de un usuario con sesión activa,
      su menú/pantallas siguen visibles hasta refrescar/re-login y puede **abrir** una pantalla ya no permitida.
      Considerar invalidar sesión / refetch del checker ante cambios sensibles, o forzar re-login en revocaciones.
      **DIFERIDO (decidido 2026-06-22):** endurecimiento de sesión de su propio diseño (invalidación/refetch ante
      cambios sensibles); no bloquea la prueba. **Mitigación parcial entregada:** con QA#6, abrir una pantalla ya no
      permitida ahora muestra un aviso "Sin acceso" en vez de quedar muda.
- [x] **[QA#6 · bug · media] La web no avisa ante 403 (pantalla vacía silenciosa).** ✅ **RESUELTO 2026-06-22** (parcial,
      ver nota). El `QueryCache.onError` global detecta `ApiError` 403 y, vía el puente `forbidden-notice` →
      `ForbiddenToastBridge`, muestra un **toast "Sin acceso"** (con throttle para no inundar). Cierra el "no avisa".
      **Pulido menor diferido:** empty-states ricos por pantalla ("Sin acceso" dentro de la grilla en vez de toast) —
      transversal a las vistas `useQuery`, no urgente.

### Hallazgos de la ronda QA liviana (2026-06-22) — ver `docs/QA_DIA_OPERACION.md`
- [x] **[QA-L#1 · carencia · media-alta] No hay BÚSQUEDA de texto en Estructura.** ✅ **RESUELTO 2026-06-22.**
      Buscador en el header del árbol (`StructurePage`) que filtra por nombre/código/cód. externo/descripción
      (insensible a acentos/mayúsculas), **resalta** la coincidencia y **auto-expande** el camino a cada match
      (ancestros + coincidencia); estado "Sin coincidencias" cuando no hay. Filtro **en memoria** sobre el árbol ya
      cargado (`OrgTree` ganó prop `query`). **+ Búsqueda de EQUIPOS (2026-06-22):** la búsqueda también surface el
      **nodo dueño de un equipo** que coincide (ej. "Weinig") — endpoint backend `GET /structure/equipment?search=`
      con **ABAC** (`EquipmentService.searchAccessible` + `ScopeService`); el árbol muestra los equipos coincidentes
      como chips bajo el nodo. **Búsqueda GLOBAL** (gated por `equipment:view`, **sin** scope de datos por nodo) — se
      corrigió un primer intento que aplicaba `getAccessibleNodeIds` y resultaba MÁS estricto que el resto del módulo
      de Estructura (`getTree` devuelve el árbol COMPLETO y `listByNode` no aplica scope): un admin acotado VEÍA el nodo
      en el árbol pero la búsqueda de su equipo daba `[]`. **Pendiente a escala (diferido):** búsqueda server-side de
      NODOS si el árbol crece a decenas de miles (hoy los nodos se filtran en memoria; los equipos ya van por API).
- [x] **[QA-L#3 · UX · baja] Grilla de equipos: tag/placa en 2 líneas + nombre acapara.** ✅ **RESUELTO 2026-06-22.**
      `.code` con `white-space: nowrap` (tags largos como `REMA-ELAB-MOLD-01` en 1 línea) + columna tag 150→180 +
      columna nombre acotada a 260 (trunca con elipsis) en `EquipmentSection`.
- [ ] **[QA-L#2 · carencia · media] Niveles de estructura GLOBALES (una sola escalera por profundidad).** `OrgLevel`
      tiene `@@unique([order])`: existe **un único nivel por profundidad** para TODO el sistema, así que todas las
      estructuras raíz comparten los mismos nombres/semántica por nivel. **No** se puede tener "Faena→Área→Proceso→Línea"
      en una estructura y "Planta→Sector→Equipo" en otra. Coherente con single-tenant simple, pero corto para
      multi-faena/multi-industria (el seed ya mezcla minería + madera). **Recomendación:** conjuntos de niveles por
      estructura (`LevelSet` referenciado por la raíz; reemplaza el `@@unique([order])` global) — cambio de modelo +
      migración + UX, peso medio. **Diferir** hasta confirmar necesidad real de multi-industria; no bloquea la prueba.

- [ ] **Sidebar: limpieza de huérfanos tras la agrupación (`feat/sidebar-grupos`).** El estilo `.navLabel` (en
      `AppShell.module.css`) y la clave i18n `nav.sectionLabel` ("Módulos") dejaron de usarse al pasar a grupos
      (`.navGroupLabel` / `nav.groups.*`). Limpieza mecánica trivial. **No urgente** (inertes). (La deuda "Favoritos colapsable"
      quedó sin objeto: con `feat/sidebar-premium` Favoritos se movió al menú-estrella del topbar y ya no vive en el lateral.)
- [ ] **DROP de `Template.orgNodeId` (deprecado tras 2.8.0).** Con `TemplateNodeAssignment` como fuente de verdad de
      la visibilidad por nodo, `Template.orgNodeId` quedó como "nodo primario" DERIVADO (no editable por separado; sin
      drift). Limpieza mecánica pendiente: quitar la columna de la lógica restante (proyección/audit), del contrato
      (`templateSchema.orgNodeId` y los `@deprecated` en create/update/saveDraft), de la web que aún lo lea, y migración
      de DROP. **No urgente** (la columna es inerte). Ver DECISIONS 2026-06-12 (fork 1).
- [ ] **`OrgNode.externalCode` plano → migrar a `ExternalReference`.** El campo único `externalCode`
      de OrgNode (Fase Estructura) quedó como atajo de un solo sistema; con `ExternalReference`
      polimórfica ya disponible, debe unificarse ahí (un nodo puede mapear a varios sistemas). Migración
      de datos no destructiva + ajustar UI del nodo. **Hacer junto con el motor de integración (Fase 3).**
- [ ] **`ExternalReference`: UI de mapeos + catálogo de `systemType`.** Modelo y contratos ya existen
      (2026-06-08); la **UI** de gestión de referencias externas y el catálogo configurable de sistemas
      (`systemType`) se construyen en **Fase 3 (Orígenes de datos)** junto al motor de conexión/sync.
- [ ] **`User.passwordHash` debe ser nullable + separar login de email (preparación de federación).** Hoy
      el login es el email y la contraseña local es obligatoria; un usuario federado (AD/OIDC) no tendrá
      contraseña local y su login estable puede no ser el email. Hacer `passwordHash` nullable y prever
      `username` como login estable evita una migración dolorosa en v2. Ref: DECISIONS 2026-06-08
      (federación). **Prioridad: media**, junto con el set lean de campos.
- [ ] **`user:disable` sin enforcement.** El cambio de `status` (ACTIVE↔DISABLED) viaja por
      `PATCH /security/users/:id` gateado por `user:edit`; el permiso `user:disable` del catálogo no lo
      exige ningún guard. Decidir: (a) separar endpoint/guard de habilitar/deshabilitar, o (b) retirar la
      clave. La UI hoy gatea el toggle de estado por `user:edit`. Ref: DECISIONS 2026-06-08. **Prioridad: baja.**
- [ ] **`forcePasswordChange` con enforcement solo en UI.** Hoy `ProtectedRoute` redirige,
      pero el backend no bloquea otros endpoints. Igualarlo al gate de MFA (claim + guard).
      Ref: `SECURITY.md` §7 (residual). **Prioridad: media-alta** (auditoría).
- [ ] **Rechazo de contraseñas comprometidas** (NIST 800-63B §5.1.1.2; HIBP k-anonymity o
      lista local). Pluggable y **apagado por defecto** (on-premise). Aplica a change/force/
      reset. Ref: `DECISIONS.md` 2026-06-06 (reset). **Fase 7 / transversal.**
- [ ] **Anti-replay del mismo OTP** dentro de su ventana de validez (TOTP). Deuda menor.
      Ref: `SECURITY.md` §7.
- [ ] **`mfaMode = REQUIRED_BY_ROLE`: cambiar `requireMfa` no invalida tokens vigentes.** El
      gate se aplica al siguiente refresh (≤15 min). Decidir si se fuerza (revocar sesiones
      de los miembros del rol al activar el requisito) o se acepta la latencia. **Prioridad: baja.**
- [ ] **Bundle web grande** (~743 KB JS): code-splitting / `manualChunks`. **Fase 7.**
- [ ] **Ranura OIDC/LDAP**: diseñada, `AuthProvider` listo; se activa cuando un cliente lo pida.
- [ ] **Flujos (`WorkflowDefinition`) — gaps de gobernanza (no afectan integridad).** La integridad histórica
      ya está garantizada (inmutabilidad de versiones publicadas + FK `onDelete: Restrict` + guard "en uso" en
      `remove` + validación FSM). Falta el **gobierno/UX proactivo**, registrado el 2026-06-09:
  - **Aviso proactivo de impacto al editar/publicar un flujo en uso.** Hoy, si una versión nueva elimina/renombra
    un estado que plantillas vivas usan en `editableInStateKey`, la incompatibilidad **solo se detecta cuando esa
    plantilla se re-vincula** (400 en `TemplatesService.saveDraft`). Falta un "⚠️ N plantillas usan el estado *X*"
    en el momento de editar/publicar el flujo, y/o un visor de **"¿qué plantillas usan este flujo?"**. **Prioridad:
    media; cobra más valor junto con la ejecución 2.5.**
  - **Concurrencia optimista en el builder de flujos** (igual que se hará en el llenado por sección): dos admins
    editando el mismo borrador → hoy *last-write-wins* (reemplazo total). Añadir revisión/`updatedAt` check. **Prioridad: baja.**
  - **El conteo "en uso" es conservador**: cuenta `TemplateVersion` en borrador e incluso de plantillas con borrado
    lógico. Evaluar acotar a publicadas/activas si molesta en la práctica. **Prioridad: baja.**

- [ ] **Verificación de firmas — nota de compatibilidad (2.6).** La canonicalización v2 del payload (descarta
      valores vacíos) hace que firmas creadas ANTES de 2.6 cuyo mapa firmado contenía claves con `null` verifiquen
      `INVALID`. Hoy solo existían datos de demo/smoke (aceptado en DECISIONS 2026-06-10). Si alguna vez se migra una
      instalación con firmas v1 reales, implementar verificación dual (intentar v1 y v2). **Prioridad: informativa.**
- [ ] **Firmas/re-auth (Fase 2.5) — deuda de endurecimiento (no afecta integridad).** Registrada el 2026-06-10
      tras `/security-review` (sin hallazgos explotables):
  - **Throttle de re-auth de firma**: `ReauthService.verifyForSignature` no tiene contador propio de fallos. No es
    explotable en la práctica (el actor re-autentica su PROPIA contraseña en una sesión ya autenticada), pero como
    defensa en profundidad conviene reutilizar el lockout de contraseña o un contador dedicado. **Prioridad: baja.**
  - **Recovery code consumido antes del commit**: en el step-up MFA con código de recuperación, `assertSecondFactor`
    consume el código antes de la transacción de la transición; si la tx falla después, el código queda gastado.
    Mover la verificación MFA dentro de la tx o compensar. **Prioridad: baja** (operacional, no de seguridad).
  - **PKI / sello de tiempo cualificado**: hoy la firma es hash SHA-256 + metadatos (integridad/no repudio interno).
    Firma criptográfica con validez probatoria externa (PAdES/sello cualificado) **diferida a Fase 7**.

### Recomendaciones de endurecimiento (Fase 7, ya registradas)
Respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) ·
rate-limit global + CSP/HSTS (Caddy) · exportación CSV/PDF · notificaciones SMTP
(SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · modo offline
terreno (PWA) · retención/borrado lógico · adjuntos/evidencias en MinIO · firma con validez
probatoria (hash+timestamp). Ref: `DECISIONS.md` (sección de recomendaciones).

#### Escalabilidad de la grilla de Bitácoras a MILLONES de registros (consulta del dueño 2026-06-13)
Análisis hecho el 2026-06-13. **Resuelto ya (no es Fase 7):** índices COMPUESTOS para keyset
(`LogEntry(recordedAt,id)` + `(effectiveAt,id)`, migración `20260613120000_add_logentry_keyset_indexes`)
— el orden por defecto `recordedAt desc` no tenía índice. Lo que **sí** es Fase 7 (endurecimiento), con su
implementación esperada:
- [ ] **KPIs/stats sin `COUNT` exacto a escala** (el cuello de botella real). Hoy `stats()` hace 5 conteos sobre el
      set filtrado, 2 con semi-join a `LogEntryValue`/`LogEntrySection`. Implementación: **caché corta en Redis**
      (`CacheService` ya existe) por hash de filtros, y/o **rollups materializados** (tabla/vista materializada de
      conteos por día×nodo×plantilla×estado refrescada por job o trigger), con *fallback* a conteo en vivo para
      filtros ad-hoc; opción de conteos **aproximados**. KPIs bajo demanda si se prefiere.
- [ ] **Búsqueda por contenido full-text** (hoy `ILIKE` sobre `value::text` con índice GIN trgm + cap de 5.000 ids).
      Implementación in-Postgres: **columna `tsvector`** denormalizada de los valores `gridFieldKeys`, GIN + `@@`
      con ranking, mantenida por trigger/al guardar; o, a gran escala, **OpenSearch** (indexa entradas → ids →
      hidrata de Postgres) — solo si un cliente lo exige (rompe la simplicidad on-prem).
- [ ] **Particionado por tiempo de `LogEntry`** (+ `LogEntryValue`/`LogEntryFieldChange`). Implementación:
      `PARTITION BY RANGE (recordedAt)` mensual (PK compuesta con `recordedAt`), creación/*drop* de particiones por
      `pg_partman` o job; **partition pruning** por filtros de fecha + archivado barato de particiones viejas.
      Migración no trivial (raw SQL, Prisma no gestiona particiones). El modelo ya estampa `recordedAt`/
      `operationalDate`/`periodKey` (partition-ready). Acompaña **retención/archivado**.
- [ ] **Paginador absoluto** (saltar a "página N de millones") queda DESCARTADO con keyset (no random-access);
      a escala el patrón es FILTRAR (ya hay filtros potentes + multi-nodo). El paginador actual es relativo a la
      ventana cargada (lotes de 100). Solo si un cliente lo exige se evaluaría offset+count (no escala).
- [ ] **Export CSV** capado a 100.000 filas (`EXPORT_MAX_ROWS`, marca `truncated`) — revisar a demanda.
- [ ] **"Retrasadas" (Workflow SLA) a escala** (2026-06-13). Hoy `delayedEntryIds()` resuelve los ids vencidos con un
      JOIN raw `LogEntry→WorkflowState` (cap **5.000**) intersectado con el `where`+ABAC del listado (cero fuga, MVP
      correcto). A escala: **materializar el atraso** (columna/flag `isDelayed` denormalizado o vista materializada
      refrescada por job, ya que el vencimiento depende de `now()`), o un índice parcial sobre DRAFT; integrar con la
      caché de KPIs de arriba. El `currentStateSince` ya está estampado (partition/index-ready).
- [ ] **SLA en HORAS HÁBILES** (Workflow SLA, futuro). Hoy el atraso es tiempo CALENDARIO. Las horas hábiles requieren
      acoplar el calendario operacional/turnos (`OperationalCalendar`/`ShiftResolver`) al cómputo de `evaluateSla`
      (descontar no-laborables). Solo si un cliente lo pide.

---

## 4. Pendiente por PROBAR (gaps de verificación)

> Lo construido puede estar "verde en tests" pero no ejercido en condiciones reales.

- [ ] **Notificaciones — hardening — smoke VISUAL** (se verificó typecheck/lint/build + smokes 8/8 y 17/17; falta el clic).
      **`/configuracion` ▸ Correo saliente** (gate `notification:config`): elegir un preset (Gmail/Mailpit…) que rellena host/puerto
      + muestra su pista; guardar (la clave no se muestra, queda "configurada"); **Probar conexión** y **Enviar prueba** (verlo en
      MAILPIT `:8025`); apagar "Correo activado". **`/notificaciones` ▸ Plantillas**: insertar variables en el cursor del asunto/
      cuerpo desde el diccionario (con descripción+ejemplo), ver la **vista previa en vivo** actualizarse, y comprobar que
      `{{entry.summary}}` aparece en el catálogo de los eventos de entrada. Verificar claro+oscuro, 44px, tokens Lyra.
- [ ] **Notificaciones (Bloque N) — smoke VISUAL en navegador** (se verificó typecheck/lint/build + smoke API 17/17; falta el
      clic). **`/notificaciones`** (gate `module:notifications:view`): pestaña **Correo saliente** (filtrar por estado/buscar,
      abrir un correo → vista previa HTML en iframe, reintentar uno FAILED), **Plantillas** (elegir una, insertar variables con
      los chips, editar asunto/cuerpos, guardar; intentar una variable no permitida → toast de error), **Mis preferencias**
      (apagar/encender un evento). **`/mis-notificaciones`** desde el menú de perfil (todo usuario). Verificar claro+oscuro, 44px,
      tokens Lyra. Generar correos reales: dejar una ronda vencer (o usar `POST /notifications/run`) y verlos en MAILPIT (`:8025`).
- [ ] **Catálogo de objetos · Ola 4 (estructurados) — smoke VISUAL en navegador** (se verificó typecheck/lint/build +
      smoke API round-trip 22/22; falta el clic). Por cada objeto: agregarlo desde la paleta (categoría **Estructurados**),
      configurarlo en el builder (columnas: rótulo/tipo/obligatoria + opciones inline de un SELECT; minRows/maxRows; layout
      tabla vs tarjetas; ejes y celda de la matriz), y en una entrada: **Tabla repetible** (agregar/quitar/reordenar fila a
      44px, scroll horizontal con encabezado/1ª columna sticky en tablet, celda inválida marca borde rojo, total de filas
      ≥ min al completar), **Grupo repetible** (tarjetas "agregar otro" apiladas), **Matriz parámetro×turno** (cabeceras
      read-only, celdas editables, 1ª columna sticky). Verificar estados (vacío/inválido/readOnly del visor), claro+oscuro,
      44px, responsive. App en `:5173`.
- [ ] **Catálogo de objetos · Ola 3 (adjuntos/terreno) — smoke VISUAL en navegador** (se verificó typecheck/lint/build +
      smoke API/MinIO 26/26; falta el clic). Por cada objeto de **Evidencia / Terreno**: agregarlo desde la paleta, verlo
      en el lienzo (marcador "se sube al llenar"), configurarlo (multiple/maxCount/maxSizeMb/accept/cámara), y en una
      entrada: **Foto** (capturar con cámara en tablet / subir de galería; miniatura/descarga), **Archivo** (PDF), **Nota
      de voz** (grabar con `MediaRecorder` + detener + reproducir/descargar), **Croquis** (dibujar en el lienzo→guardar
      PNG), **Escáner QR** (apuntar la cámara, decodifica y rellena el TAG). Verificar: **VISTA PREVIA al hacer clic** (botón
      "Ver" / ítem clicable abre el modal: imagen en lightbox, audio/video reproducibles, PDF en iframe, otros → abrir en
      pestaña), descarga (presigned), quitar un adjunto, estados (busy/error/inválido/vacío/readOnly), claro+oscuro, 44px,
      responsive. App en `:5173`.
- [ ] **Catálogo de objetos · Ola 2 — smoke VISUAL en navegador** (selectores de referencia equipo/usuario/nodo/turno con
      dropdown/modal, tolerancia objetivo±tol, contador con delta, matriz de riesgo clicable + heatmap del editor).
- [ ] **Catálogo de objetos · Ola 1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build + smoke API
      round-trip 21/21; falta el clic). Por cada objeto nuevo: agregarlo desde la paleta (categorías Básicos/
      Selección/Evaluación/Presentación), verlo en el lienzo (WYSIWYG), configurarlo (format/displayAs/rating
      estilo+máx/conformidad N.A./aviso variante+texto/encabezado nivel/enlace/imagen URL), y llenarlo en una
      entrada. Revisar **estados** (default/hover/focus/inválido/vacío/readOnly), **claro y oscuro**, áreas
      táctiles 44px y **responsive** (tablet 2 col / móvil 1). Casos: tri-estado colores; estrellas/likert;
      duración HH:MM y rango mín–máx; RUT/correo/% con su validación; multiselección MODAL (LookupPicker);
      objetos de presentación (encabezado/aviso/separador/enlace/imagen) que NO piden dato. App en `:5173`.

- [ ] **App Shell — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + que el dev
      sirve; falta el clic): colapsar/expandir sidebar, abrir/cerrar/fijar pestañas (sin refrescos),
      ⌘K (saltar, densidad, idioma, tema, logout), cambiar idioma y densidad, menú de perfil, favoritos.
- [ ] **Estructura — smoke VISUAL en navegador** (actualizado tras master-detail v2): navegar a
      `/estructura`, seleccionar un nodo (panel derecho aparece con breadcrumb + hijos), navegar
      via breadcrumb, usar acciones del header (editar/mover/eliminar), CRUD de hijos inline desde
      la tabla del panel derecho, verificar botón "Equipos — próximamente" en el nivel Proceso,
      abrir `LevelsDrawer`, modo claro y oscuro. App en `:5173`.
- [x] **Estructura UX 2026-06-08 — smoke VISUAL** ✅ (confirmado por el usuario): splitter, 2ª línea de
      descripción en árbol y grilla, orden de columnas, edición inline del orden, full-width y
      comportamiento en iPad (tras el fix del header que aplastaba la descripción). Pendiente menor no
      bloqueante: QA explícito de **modo claro** en esta pantalla (se cubre en el ítem "Modo claro — QA
      visual" más abajo).
- [ ] **Equipos — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): seleccionar un nodo de nivel Proceso → aparece la grilla de equipos; alta/edición vía
      `EquipmentDrawer` (tag, categoría, criticidad, toggle de estado); edición inline del orden; abrir
      `CategoriesDrawer` (crear/editar/activar/eliminar categoría); borrar equipo (modal); chips de
      criticidad (colores Severidad 1–5) y de estado; modo claro y oscuro. App en `:5173`.
- [x] **Seguridad — smoke VISUAL en navegador** ✅ (2026-06-09, confirmado por el usuario): sub-tabs
      `/seguridad/{usuarios,roles,politica,auditoria}` (deep-link + breadcrumb + una sola pestaña), alta de
      usuario, detalle con pestañas (datos/roles/**scope** con buscador/**Seguridad**: reset de contraseña +
      **reset de MFA**, MFA self-service probado en vivo), CRUD de roles + **matriz de permisos** con buscador
      + `requireMfa`, **política** (incl. `mfaMode`), **auditoría** filtrable + export CSV, búsquedas y
      exportaciones. Pendiente menor no bloqueante: QA explícito de **modo claro** (ítem propio más abajo).
- [ ] **Plantillas 2.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): `/plantillas` (grilla, buscador, filtro de estado, estados vacíos), crear plantilla
      (modal → builder), builder (agregar sección, agregar campos núcleo desde la paleta, configurar etiqueta/
      obligatorio, NÚMERO con unidad+min/max+**bandas de umbral**, opciones de select, **condicional por
      booleano**, **roles por sección**, firma Part 11 opt-in, reordenar con flechas, borrar), **vista previa**
      (incl. número fuera de rango), **Guardar borrador** y **Publicar** (confirmación + versión congelada),
      editar publicada (crea borrador v2), borrar plantilla; modo claro. App en `:5173`.
- [ ] **Plantillas 2.1.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): en el builder, agregar un SELECT/MULTISELECT y editar opciones inline (verificar que cada
      línea genera un `code` estable + `label`); marcar el toggle **"Fecha efectiva del registro"** en un campo
      DATE/DATETIME y comprobar que al marcar otro se **desmarca el anterior**; vista previa del SELECT usando los
      codes; guardar/publicar; modo claro. App en `:5173`.
- [ ] **Flujos 2.2 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API; falta el
      clic): `/flujos` (grilla, buscador, filtro de estado, estados vacíos), crear flujo (modal → builder), builder
      (agregar estados, marcar inicial único/final, color; agregar transiciones from→to, etiqueta, roles permitidos,
      toggles firma+significado / MFA; **banner de validación FSM en vivo**; publicar deshabilitado si es inválida),
      **Guardar borrador** y **Publicar** (congela versión), editar publicada (clona borrador), borrar (bloqueado si
      en uso); en el **Form Builder**: asignar un flujo publicado, mapear secciones→estados editables, editar el
      **override de rol por campo**; modo claro. App en `:5173`.
- [ ] **Fase 2.1.7 Diseñador visual de formularios (lienzo libre, react-grid-layout) — smoke VISUAL en navegador**
      (typecheck/lint/build OK; smoke geometría 14/14; falta el clic): en el **builder** (`/plantillas/:id`, Diseño ▸
      Editor) hay **3 zonas**: PALETA (izq, buscador + categorías), LIENZO (centro), PROPIEDADES (der). **(1)** Arrastra un
      objeto de la paleta a una **posición** del lienzo (o clic = al final). **(2)** Mueve un campo existente **libremente**.
      **(3)** Redimensiónalo desde los **handles** (lados/esquina): ancho Y alto, CUALQUIER campo (incluido uno solo en su
      fila). **(4)** Guarda borrador, **recarga** ⇒ la posición/tamaño se mantienen. Selecciona un campo ⇒ el panel derecho
      edita rótulo/obligatorio/ancho/alto/posición y **"Opciones avanzadas"** abre el Drawer (umbral/opciones/condicional/
      fórmula/roles). **Cuadrícula** on/off. **Dispositivo escritorio/tablet/móvil**: en tablet/móvil se ve el **preview
      responsivo** (sin cortes; móvil 1 col, tablet 2). Verifica **lienzo ≈ llenado (`/nueva-entrada/:id`) ≈ visor
      (`/bitacoras/:id`)** y que una **plantilla antigua** abre igual que antes (geometría derivada). Modo claro y oscuro.
      App en `:5173`. **NOTA Fase 2/3 (no esperar aún):** deshacer/rehacer, multi-selección/marquee, alinear/distribuir,
      capas, copiar/pegar, atajos de teclado, edición por breakpoint.
- [ ] **Workflow SLA + atrasos — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API
      20/20; falta el clic): en el **builder de flujos** (`/flujos/:id`), por estado el campo **"Tiempo máximo de
      estadía"** (Min/Horas/**Días**, vacío = sin SLA), guardar borrador y publicar (el SLA persiste). En el **diagrama
      del registro** (visor `/bitacoras/:id` + peek ⎇): un estado actual vencido muestra **anillo rojo + "Atrasado hace
      X · SLA Y"**, uno cerca del SLA **ámbar "En riesgo"**, y un tramo pasado sobre su SLA un **badge ámbar**; tooltips
      con SLA + **responsable** (que ahora aparece también en el visor, no solo en el builder). En la **grilla
      `/bitacoras`**: KPI **"Retrasadas"**, faceta **"Retrasadas"** (toggle), badge **"Atraso"** en la celda de estado +
      columna "Atraso" (activable en el gestor de columnas), y la **vista de sistema "Retrasadas"**; modo claro. Para
      verlo en vivo: poner un SLA corto a un estado con registros DRAFT antiguos. App en `:5173`.
- [ ] **Datos de referencia 2.x — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por
      API; falta el clic): `/datos-referencia` (lista de Listas + buscador), crear lista (drawer: key/nombre/descr/
      activo/orden), seleccionar lista → grilla de ítems; agregar ítem (code/label/orden + **metadata key-value**),
      **activar/desactivar** ítem, **orden inline**, editar, eliminar (modal); editar/eliminar lista (bloqueada si en
      uso). En el **Form Builder**: en un SELECT/MULTISELECT cambiar la fuente a **Lista de Referencia**, elegir
      `failure-modes`, y verificar que la **vista previa resuelve** las opciones (muestra label, guarda code); guardar/
      publicar; modo claro. App en `:5173`. **(UX enterprise 2026-06-09)** verificar además: en la grilla de ítems el
      **buscador**, el **filtro de estado**, el **ordenamiento por columnas**, la **paginación** y la metadata en
      chips; en el Form Builder el **selector de Lista buscable (`Combobox`)** y que el **SELECT/MULTISELECT de la
      vista previa** sean buscables y escalen con una lista larga. **(Lookup 2026-06-09)** verificar además: el
      `Combobox` cerca del borde inferior abre **hacia arriba** (no se corta); el MULTISELECT con Lista abre el
      **`LookupPicker`** (diálogo con tabla código/etiqueta/metadata, búsqueda, selección con checkbox + confirmar,
      single clic en fila; tokens removibles con × bajo el campo). **(CSV 2026-06-09)** verificar además:
      **Exportar** descarga un CSV que Excel es-CL abre en columnas (`;` + BOM, metadata aplanada); **Importar**
      (elegir archivo → analizar → reporte con chips/tabla, error con nº de línea → aplicar; checkbox de
      desactivar ausentes; con errores el botón Aplicar queda deshabilitado).
- [ ] **Calendario operacional 2.3.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build + smoke
      por API; falta el clic): `/calendario-operacional` (lista + buscador + badge predeterminado), crear calendario
      (drawer key/nombre/TZ), editar turnos en filas (agregar/eliminar) y ver el **timeline 24 h** con cobertura/
      huecos + marcador del turno ancla, **banner de validación en vivo** (solape → rojo), elegir turno ancla del
      día, cambiar periodo MONTH/WEEK/CUSTOM (campos condicionales), usar el **probador** (datetime → turno/día
      operacional/periodo en vivo, incl. madrugada y hueco), **Guardar** (deshabilitado si inválido o sin cambios),
      hacer predeterminado, asignar nodos (modal sobre el árbol), eliminar (bloqueado si es el default); modo claro.
      App en `:5173`.
- [ ] **Llenado 2.4 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por API 15/15;
      falta el clic): `/nueva-entrada` (grilla de plantillas publicadas, crear entrada), pantalla de llenado
      (cabecera con estado + chips de turno/día operacional/periodo/fecha efectiva; secciones como cards; campo NÚMERO
      con bandas de umbral; SELECT/MULTISELECT resolviendo Lista; validación inmediata por campo; **Guardar sección** y
      **Guardar y completar**; **Enviar y registrar** → banner de sellado; secciones de solo-lectura tras enviar);
      probar **concurrencia** (dos pestañas guardando la misma sección → toast de conflicto + recarga); modo claro.
      App en `:5173`.
- [ ] **Bitácoras 2.6.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por API
      22/22; falta el clic): `/bitacoras` (KPIs clicables y que respetan filtros; barra de filtros: búsqueda con
      debounce, nodo con incluir-descendientes, plantilla, status, estado de flujo, turno, día operacional, rangos
      con atajos hoy/24h/7d/30d, banda de umbral, mis entradas, firmas pendientes; chips activos removibles +
      limpiar; grilla: folio mono, chip de estado con color congelado, indicadores por fila con tooltips, orden por
      folio/efectiva/captura, cargar más; **deep-link**: copiar la URL con filtros y abrirla en otra pestaña;
      exportar CSV y abrirlo en Excel es-CL); `/bitacoras/:id` (cabecera con folio + mini-stepper del flujo, chips de
      dimensiones, secciones read-only con labels de Listas resueltos + badges de umbral, panel de firmas §11.50 +
      **verificar integridad** [VALID y VALID_RECORD_CHANGED_AFTER tras editar], timeline unificada + cargar más,
      log de cambios antes→después, relacionadas navegables, **imprimir** [solo contenido, sin chrome]); ítem
      "Bitácoras" en sidebar y ⌘K; modo claro y oscuro; tablet. App en `:5173`.
- [ ] **Registro diferido 2.7.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por
      API 14/14; falta el clic): en `/nueva-entrada` el toggle "Registrar con otra fecha/hora" (apagado por defecto;
      al activarlo aparecen fecha/hora + motivo; crear sin motivo válido muestra el aviso); crear una entrada diferida
      → en el llenado: chip "Diferida", fecha de captura junto a la efectiva, nota con la declaración y el motivo,
      "Editar diferimiento" (corregir fecha/motivo y QUITAR la marca); con una plantilla CON campo fecha efectiva
      verificar que el gesto lo deja escrito en el formulario; en `/bitacoras`: filtro "Origen", chip removible,
      indicador "Diferida" en la fila (tooltip = motivo), export CSV con las columnas nuevas; en `/bitacoras/:id`:
      chip + nota "el evento ocurrió el… · declarado por…" + evento "Registro diferido declarado" en la timeline;
      modo claro y oscuro. App en `:5173`.
- [ ] **Período contable gobernado 2.7.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web +
      smoke por API 17/17; falta el clic): en `/calendario-operacional` → detalle de un calendario → sección
      "Períodos contables": lista de períodos recientes con estado (Abierto/En cierre/Cerrado), cerrar un período
      (modal con estado destino CLOSING/CLOSED + motivo obligatorio), ver el chip pasar a Cerrado + "Cerrado por…",
      reabrir (modal de motivo) → vuelve a Abierto; con un usuario SIN `opsperiod:write-closed`: en el llenado de una
      entrada cuya fecha cae en el período cerrado, todas las secciones muestran "Período cerrado" (solo lectura) y no
      hay botones de transición; con permiso de excepción, sí puede escribir; modo claro y oscuro. App en `:5173`.
- [ ] **Período gobernado 2.7.1 — guarda de `executeTransition` en vivo** (cubierta por código + unit test; el smoke
      por API no la ejerció en vivo porque la plantilla de prueba no ofrecía una transición disponible al usuario sin
      bypass). Verificar con una plantilla CON flujo + un estado con transición de rol abierto + período cerrado:
      executeTransition debe dar 403 `PERIOD_CLOSED` (la guarda corre antes de la completitud y del re-auth).
- [ ] **Calendario FISCAL 2.7.1.1 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API completo OK; falta
      el clic): en **`/calendario-fiscal`** → crear un calendario fiscal (tipo de período MONTH/WEEK/CUSTOM), editar
      config + toggle "Exigir período generado", asignar nodos; en la sección "Períodos contables": botón **Generar**
      (elige año → materializa filas agrupadas por año, badge **Actual**), cerrar un período (secuencial: el botón falla
      con motivo si hay un anterior abierto), bloquear (CLOSED→LOCKED), desbloquear, reabrir (con aviso de
      secuencialidad inversa si hay posteriores cerrados); verificar que `/calendario-operacional` ya **no** muestra
      config de período (solo turnos + ancla); modo claro y oscuro. App en `:5173`. **Nota**: el smoke por API dejó una
      entrada demo (`cmq7eglvm…`) con `fecha=2026-06-09` y `version` de sección +1 (benigno).
- [ ] **Ventana de edición 2.7.2 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API 21/21 OK; falta
      el clic): en el **`TemplateBuilder`** → control "Ventana de edición" en la metadata (heredar global / sin ventana /
      propia con horas+ancla RECORDED|EFFECTIVE), guardar y publicar; en **`/configuracion` → pestaña Bitácoras** → fijar
      ventana global (horas, ancla, toggle "Exigir MFA al editar fuera de ventana"). En `/nueva-entrada/:id`: con ventana
      VIGENTE, chip "Editable hasta <fecha>" y guardado normal sin fricción; con ventana VENCIDA y permiso de override,
      aviso de ventana vencida + cada acción (Guardar avance / Completar(+firma) / Enviar / declarar diferido) abre el
      **`EditWindowOverrideModal`** pidiendo motivo (≥5) y, si el ajuste lo exige, contraseña + MFA; sin el permiso, las
      secciones quedan en solo-lectura con el motivo "la ventana de edición venció el <fecha>". Verificar fechas con
      formato regional (`lib/format.ts`); modo claro y oscuro. App en `:5173`.
- [ ] **Modo de equipo por plantilla 2.8.0.2 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API 17/17 OK;
      falta el clic): en el **`TemplateBuilder`** → control "Equipo en la entrada" (No usar / Opcional / Sugerido /
      Obligatorio), guardar y publicar. En `/nueva-entrada` con esa plantilla: **Obligatorio** → el modal de creación obliga
      a elegir equipo (sin "(sin equipo)"; Continuar deshabilitado hasta elegir; aviso si el nodo no tiene equipos activos);
      **Sugerido** → autoselecciona el equipo único + hint "recomendado", pero permite "(sin equipo)"; **No usar** → no se
      muestra el selector de equipo; **Opcional** → comportamiento previo. Verificar que al crear con Obligatorio sin equipo
      el backend devuelve el aviso; modo claro y oscuro. App en `:5173`.
- [ ] **Afinamiento #4 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build + smoke por API 22/22;
      falta el clic): en `/nueva-entrada/:id` con una plantilla cuyas secciones tengan roles asignados y un campo con
      override: chip "N de M secciones completadas" en cabecera; chip "Asignada a: <rol>" por sección; sección ajena
      bloqueada con el motivo real ("asignada a X" / "se completa en la etapa Y" / "ya fue registrada"); campo
      reservado en solo-lectura con nota; botones "Guardar avance" y "Completar sección"/"Completar y firmar" con
      hint; "Enviar y registrar" deshabilitado listando las secciones que faltan (y habilitado al completar todas);
      transiciones deshabilitadas con la misma guía; modo claro. App en `:5173`.
- [ ] **Ejecución de flujo + firmas 2.5 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web +
      smoke por API 21/21; falta el clic): abrir una entrada con flujo en `/nueva-entrada/:id` → chip de estado del
      flujo en cabecera; completar la sección del estado inicial; **barra de transiciones** (botones gateados por
      `availableTransitions`); ejecutar una transición **sin firma** (reason opcional) → verificar cambio de estado,
      sección anterior **LOCKED**, banner/sello; ejecutar una transición **con firma** → **`TransitionModal`** muestra
      el significado + firmante y pide contraseña (y MFA si la transición lo exige) → verificar chip "Firmado" e
      **historial de transiciones**; una sección con `requireSignature` → **`SectionSignModal`** al completar; estado
      final → sin transiciones; modo claro. App en `:5173`.
- [ ] **Modo claro — QA visual** (nuevo): revisar que TODO el workspace se vea premium en **claro**
      (contraste WCAG, glass, glows, severidades, tablas futuras, drawers/modales) y que `auto` siga al
      sistema. El default es oscuro; el login es siempre oscuro. Ref: DECISIONS 2026-06-06.
- [ ] **MFA en el navegador real** (se probó por API/curl, no la UI): escanear el
      QR con una app real, copiar/descargar recovery codes, ver el **redirect del gate**
      `/activar-mfa`, y `/perfil/seguridad` (activar/regenerar/desactivar). *Backend ✅ en vivo.*
- [ ] **`COOKIE_SECURE` solo-HTTPS en producción**: no ejercido (dev es HTTP en localhost).
      Requiere entorno HTTPS. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **`httpOnly` frente a `document.cookie`**: flag presente, no ejecutado como ataque real
      en navegador. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Access 15 min → refresh transparente** al expirar: probado por unit/código, no
      cronometrado en vivo. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Build de imágenes de producción** (`docker-compose.prod.yml` + Caddy TLS): no
      construido aún. **Fase 7.**

---

## 5. Cómo retomar (arranque de sesión)

1. Lee `CLAUDE.md` + `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS,
   AUTH_FLOW) **y este BACKLOG.md**.
2. Confirma el objetivo único de la sesión (un módulo/submódulo).
3. Revisa §1 (git): si hay trabajo sin publicar de la sesión anterior, **resuélvelo primero**.
4. Al cerrar, ejecuta el checklist §0 y actualiza este archivo.
