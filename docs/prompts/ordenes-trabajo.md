# Prompt — Módulo de Órdenes de Trabajo (OT / PTW) · Sesión 0: DISEÑO (sin código)

> Pégalo como mensaje inicial de una **sesión nueva**. Es una sesión de **DISEÑO, SIN CÓDIGO**: el análisis del
> caso de uso ya está hecho (minería, oportunidad real de cliente; ver `docs/DECISIONS.md` 2026-07-01 y la memoria
> `work-orders-module-plan`), así que la sección 1 es de **validación del grounding** en el código, no de investigación
> desde cero. Objetivo: producir el diseño formal que sirve de anexo técnico de la propuesta comercial y deja rieles
> para las Sesiones 1–8. Roadmap completo en `docs/BACKLOG.md` §2 (épico "🟢 MÓDULO DE ÓRDENES DE TRABAJO").

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE, FORM_GUIDE). Lee el épico "🟢 MÓDULO DE ÓRDENES DE TRABAJO (OT/PTW)" en `docs/BACKLOG.md` §2 y la entrada `docs/DECISIONS.md` 2026-07-01. Revisa tu memoria persistente (MEMORY.md; en especial **work-orders-module-plan**, **incidents-module**, **rules-engine**, **notifications-engine**, **notif-advanced-requirement**, **fase2-formbuilder-plan**, **form-guide-convention**, **stack-decisions**, **ui-grid-conventions**, **new-permission-dev-gotcha**, **regional-formatting**, **prototype-location**, **channel-business-model**, **product-name**). No des nada por sentado: verifica en el código y en git.

**Antes de empezar:** el backlog muestra trabajo SIN publicar (docs de canal: BACKLOG/DEPLOYMENT/SECURITY/LICENSING/estrategia-canal/docs\comercial + los docs de esta planificación OT). Propón commit/push para dejar el árbol limpio ANTES de trabajar (git rev-list --count origin/main..main debe quedar en 0).

**Recordatorio permanente:** los **entitlements / activación de módulo por licencia** (que OT e Incidencias sean activables según lo contratado) NO se tocan en este módulo — van al épico de licenciamiento (`BACKLOG §2(1)`, Ed25519). Hoy la visibilidad es solo RBAC. También sigue pendiente el épico de **notificaciones avanzadas**; menciónamelo si es pertinente.

== OBJETIVO DE ESTA SESIÓN (único, cerrable) ==
Módulo OT — **Sesión 0: DISEÑO FORMAL, SIN CÓDIGO.** Producir `docs/design/OT_DESIGN_ARCHITECTURE.md`, que me sirva de anexo técnico para la propuesta comercial. **NO escribas migraciones ni código**; al terminar, commitea el diseño y espera mi **visto bueno explícito** antes de la Sesión 1. Contexto: oportunidad real de cliente en MINERÍA; el módulo absorbe el flujo Solicitud de Trabajo → Orden de Trabajo con Permiso de Trabajo (PTW). Es entidad NUEVA `WorkOrder` **espejo de `Incident`** que reusa ~70% de la maquinaria transversal.

== 1. VALIDA EL GROUNDING (no lo redescubras de cero; confírmalo en el código y corrígeme con fundamento si cambió) ==
Contrasta el diseño con el estándar de industria (EAM/CMMS: SAP PM Aviso→Orden, IBM Maximo; PTW de alto riesgo: LOTO/altura/espacios confinados/ART; DS 132–SERNAGEOMIN, ISO 45001). Reutiliza (verifica rutas/nombres):
- Motor de workflow: `WorkflowDefinition/Version/State/Transition/TransitionRole` (`prisma/schema.prisma` ~931-1047; ya lo usan LogEntry e Incident; estados/transiciones/roles = DATO; firma opt-in por transición `requireSignature`/`signatureMeaning`/`requireMfa`; `maxStayMinutes` por estado = SLA).
- Form builder = motor de checklists: `Template/TemplateVersion/Section/Field` (~719-906) + `LogEntry` como instancia viva (~1527-1620). Tipos CONFORMITY/BOOLEAN/SELECT/TABLE/ATTACHMENT. NO crear entidad de checklist nueva.
- Actividades: `IncidentAction`/CAPA (~2315-2363) como base de `WorkActivity`.
- Alertas/SLA: Bloque N (`NotificationOutbox`/worker) + `IncidentSlaService.findBreaches`.
- Dashboard: `IncidentDashboardService` como plantilla a clonar.
- Permisos/ABAC: catálogo `packages/contracts/src/security/permissions.ts`; `ScopeService` (ABAC por nodo ∩ estructura activa).
- Auditoría inmutable (`AuditLog`) + firmas Part 11 (`LogEntrySignature`, hash+reauth).
- Folio: diseño `FolioCounter` gapless en BACKLOG (hoy NO implementado).
Cierra con: qué patrón adoptamos, qué se sale del CMMS típico y cómo se absorbe sin ad-hoc, y qué queda fuera de alcance.

== 2. DISEÑO A PROPONER (con FORKS; espera mi OK en cada uno; decisiones a DECISIONS.md) ==
Todo configurable, NADA hardcodeado. Propón campos completos y relaciones para las entidades NUEVAS:
- `WorkOrder` (espejo de Incident): tipo, categoría, origen {directa/regla/excepción/planificada}, criticidad, prioridad, `orgNodeId`/ubicación, solicitante, fechas (detección/tentativas), workflow congelado (defId+versionId+currentStateKey), **folio emitido SOLO al aprobar**, lifecycle, cierre; relación con `Incident` (originIncidentId) y `LogEntry`.
- `WorkOrderType` (como `IncidentType`: defaultWorkflowId, SLA, reglas de checklist aplicable con patrón `appliesToTypeIds`/minSeverity/especialidad/riesgo).
- `Area`+`WorkOrderArea` (N:N); `Specialty`+`WorkOrderSpecialty` (N:N).
- `WorkOrderChecklist` (enlace WorkOrder↔LogEntry: mandatory, status, responsable).
- `WorkActivity` (base `IncidentAction` + `progressPct`, `plannedStart/End`, `actualStart/End`, `dependsOnId`, prioridad, `delayReason`, responsable/rol).
- `WorkActivityUpdate` (append-only: %avance, fechas reales, evidencias, desviaciones, costos/HH opcionales, autor, fecha).
Además define: (a) el **workflow base de 4 PUERTAS CONFIGURABLES** (estados+transiciones+roles+firma) y la mecánica exacta de emisión del folio en la transición de aprobación inicial; (b) **catálogo de permisos nuevos** por dimensión (`module:workorders:view`, `workorder:create`/`approve`/`checklist:review`/`plan:approve`/`close`…); (c) **config de múltiples checklists en 2 capas** (diseño: Form Builder + regla de aplicabilidad; operación: sugerencia auto + selección manual + guard de Puerta 2); (d) **integración Incidencia→OT** (mismas fuentes que una incidencia + planificada; enlace bidireccional; la CAPA liviana queda en la incidencia); (e) **qué se extrae a `packages/`** para NO duplicar Incidencias (guards de cierre, motor de actividades, base de dashboard) con límites de dependencia.

**FORKS típicos a resolverme (con recomendación fundada):** `WorkActivity` entidad propia vs **generalizar `IncidentAction` a un motor de actividades compartido** en `packages/` · **"Área" = reusar `OrgNode` vs catálogo `Area` separado** · `FolioCounter`: alcance {global/nodo/estructura/tipo} y reinicio {nunca/anual} · checklist-plantilla: `Template` normal vs marcada "tipo checklist" · las 4 puertas: sembrar un flujo base vs que el admin lo arme · kanban+lista reusando `SavedView`/grid/facetas (como Incidencias) vs solo grilla · OT desde una `IncidentAction` "pesada" vs directo desde la incidencia.

== 3. ENTREGABLE Y PLAN POR FASES ==
El documento cierra con el desglose HH afinado por sesión (S1–S8, ~397 HH total) y confirma el roadmap del BACKLOG §2. Recuerda el paquete comercial recomendado: MVP S1–S5 + control S6–S7; S8 opcional. Sesiones chicas y cerrables (un objetivo por sesión).

== ESTÁNDAR PREMIUM (para las fases de código, deja el diseño alineado) ==
Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); navegabilidad/UX excelentes (filtros en UNA línea + paginación arriba/abajo [`ui-grid-conventions`/`GridPager`], facetas, vistas guardadas `SavedView`, peek); formato regional vía `lib/format`; reutilizables en `packages/ui`; **reusa** WorkflowDefinition, Form Builder/LogEntry, IncidentAction, Bloque N, IncidentDashboardService, SavedView/grid, SLA, motor de reglas, firmas Part 11, AuditLog, ABAC, estructura/equipos. Mira `prototipo.tsx` de la raíz por si dibuja OT.

== CRITERIOS DE ACEPTACIÓN (revísalos antes de decir "listo") ==
- Todo nombre de modelo/servicio/permiso citado EXISTE en el repo o se marca explícito como NUEVO. Cero invención.
- Cada capacidad nueva dice qué REUTILIZA y qué CONSTRUYE.
- Nada hardcodeado que deba ser dato (puertas/roles/tipos/reglas configurables).
- Entitlements/activación por licencia NO se tocan (van al épico §2(1)).
- Objétame con fundamento (EAM/CMMS + PTW) si algo del plan es subóptimo.

== VERIFICACIÓN Y CIERRE (sesión de DISEÑO) ==
No hay build/migraciones/smoke (es diseño). "En verde" = documento completo con los criterios de aceptación cumplidos. Deja VIVOS los docs (BACKLOG/DECISIONS/PROGRESS y DATA_MODEL si esbozas el modelo). Commitea/pushea el diseño (rama `docs/ot-design` o directo a `main` según lo pactado) y deja BACKLOG §1 sin pendientes. Dime explícitamente: "diseño listo para tu visto bueno antes de la Sesión 1".

== ENTORNO Y GOTCHAS (para cuando empiece el código en S1) ==
Docker dev (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API `:3000` (prefijo `/api`), Web `:5173` con `pnpm dev`. Admin demo `demo@watchlog.local` / `Demo!Pass2026` (scope null); no-admin para 403 `operador@watchlog.local`. **PERMISO NUEVO** → `db:seed` + `redis FLUSHALL` o el admin demo da 403. **EPERM prisma Windows** → mata el node del API `:3000` antes de migrar; usa `migrate diff` + `db:deploy` (NO `migrate dev`, pide RESET por drift con datos demo) y quita del diff cualquier `DROP INDEX` ajeno. `@lyra/ui` desde source; `@lyra/contracts` desde dist (reconstruye contracts si tocas su API). PowerShell 5.1: NO `2>&1` con exes nativos; commits largos vía `git commit -F archivo`. Smokes Python (`scripts/smoke-*.py`; login→Bearer; crea y LIMPIA por ID). — En la Sesión 0 nada de esto se ejecuta; es referencia para S1.
