# Prompt — Fase 4.4: SLA de incidencias + escalamiento + aviso de plazo

> Pégalo como mensaje inicial de una **sesión nueva**. Cierra el ciclo "registro → gestión → cierre verificado"
> de Incidencias con los **plazos y avisos**: SLA de permanencia y de resolución, avisos de vencimiento
> (incidencia, acción CAPA y **reporte regulatorio 4.3**) y escalamiento. Se apoya en el **épico de
> Notificaciones avanzadas, ya COMPLETO (A+B: correo + campanita in-app + SSE)**.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`).

Ejecuta la **RUTINA DE ARRANQUE de CLAUDE.md ANTES de cualquier análisis o cambio**:
- Lee `CLAUDE.md`.
- Lee `docs/`: PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, **ROADMAP** (mira el
  **Desglose Fase 4**), BACKLOG (en especial **§2** y los ítems 4.4), USER_GUIDE, FORM_GUIDE, SALES_GUIDE.
- Revisa MEMORY.md, en especial: **incidents-module** (estado de 4.0–4.3 + el rumbo de 4.4 al final),
  **notifications-engine** y **notif-advanced-requirement** (el motor que vas a reusar: outbox+worker+resolver,
  4 eventos, canal EMAIL + **INAPP/campanita**, `deepLinkForEntity`), **ui-grid-conventions**,
  **regional-formatting**, **new-permission-dev-gotcha**, **challenge-dont-please**,
  **explain-and-document-userguide**, **user-guide-convention**, **sales-guide-convention**,
  **commit-settings-json**, **stack-decisions**, **product-name**.
- Verifica git: árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0.
- Confírmame en dos líneas dónde estamos y qué haremos antes de escribir código.

== CONTEXTO ==
Incidencias (Fase 4) tiene núcleo (4.0), excepciones (4.1), CAPA (4.2a), investigación 5-Porqués (4.2b) y
**reportabilidad configurable (4.3)** ✅. El **épico de Notificaciones avanzadas está COMPLETO** (Fase A:
disparo por transición + plantillas por bitácora + comodines; Fase B: **canal in-app/campanita + SSE**), así
que 4.4 ya tiene la cañería de avisos lista (correo **y** campanita; `deepLinkForEntity("Incident", id)` ya
enruta a `/incidencias?incidentId=`).

**Deuda que 4.4 debe saldar (heredada y registrada):**
- **§21 de la auditoría — "vencida" está desalineado:** el KPI/filtro de "vencidas" hoy usa el SLA de
  **permanencia** (`maxStayMinutes` por estado del flujo, vía `evaluateSla`), pero la incidencia tiene un
  `dueAt` (plazo de **resolución**) que se guarda/muestra y **no** alimenta KPIs ni avisos. Son **DOS conceptos
  distintos** y hay que desambiguarlos.
- **4.3 difirió el aviso de plazo de los reportes** (`IncidentReport.dueAt`, "vencido" hoy es solo derivado en
  pantalla) — el disparo del aviso es de 4.4.
- **CAPA (4.2a)** ya tiene `IncidentAction.dueAt` pero no avisa su vencimiento.

== OBJETIVO DE ESTA SESIÓN: Fase 4.4 — SLA + avisos de plazo + escalamiento ==
Que las incidencias, sus **acciones CAPA** y sus **reportes** tengan **plazos** claros y **avisen** (por correo y
campanita) cuando se acercan/vencen, con **escalamiento** configurable. Reusa el motor del Bloque N — **NO lo
reinventes**.

**ES UN MÓDULO con cañería de fondo: propón el PLAN y ESPERA MI OK antes de programar.** Investiga el estándar
(ITIL/ServiceNow SLA + OLA + escalation policies, PagerDuty escalation policies, Jira SLA/Automation) y propón.

== SUB-DECISIONES YA ACORDADAS (no reabrir salvo que el análisis lo exija) ==
1. **Modelo SLA "light":** `IncidentType.resolutionDueMinutes Int?` (catálogo, aditivo) ⇒ al crear una
   incidencia se **auto-calcula `Incident.dueAt`** (= `occurredAt`/`createdAt` + `resolutionDueMinutes`), con
   override manual. NO un motor de SLA pesado con calendarios/pausas (eso es futuro).
2. **§21 desambiguado — son dos cosas distintas y se muestran/filtran por separado:**
   - **SLA de permanencia** = `WorkflowState.maxStayMinutes` (cuánto puede quedarse en UN estado) → ya existe
     (`evaluateSla`).
   - **Plazo de resolución** = `Incident.dueAt` (cuándo debe estar CERRADA, extremo a extremo) → 4.4 lo activa
     en KPIs/filtros/avisos.
3. **4 eventos nuevos en el catálogo del Bloque N** (`@lyra/contracts NOTIFICATION_EVENTS`, variables
   whitelisteadas, render sin eval, plantillas default sembradas, canal EMAIL + INAPP):
   - `incident.sla.breached` — incumplió la **permanencia** en el estado actual (espejo de `entry.sla.breached`).
   - `incident.overdue` — incumplió el **plazo de resolución** (`dueAt` < now y sigue OPEN).
   - `incident.action.overdue` — una **acción CAPA** venció (`IncidentAction.dueAt` < now, sin resolver).
   - `incident.report.due` — un **reporte** regulatorio venció (`IncidentReport.dueAt` < now, PENDING) — cierra
     la deuda de 4.3.

== PIEZAS A DISEÑAR Y CONSTRUIR (propón, espera OK) ==
1. **Modelo (aditivo):** `IncidentType.resolutionDueMinutes`; auto-`dueAt` en `IncidentsService.create`
   (honra override). Decide si el "vencido" de cada cosa es **derivado** (status+dueAt<now, como 4.3) o
   necesita columna/flag. Migración aditiva (patrón del repo: `prisma migrate diff` + `db:deploy`, sin BOM,
   quitar `DROP INDEX` ajeno del diff).
2. **Sweeper + emisión de eventos:** descubre vencimientos y **encola** los 4 eventos `incident.*` con `dedupeKey`
   estable (un aviso por suceso/destinatario). **Fork:** ¿extender el `NotificationWorkerService.sweep` (donde ya
   viven round.overdue / entry.sla.breached) o un cron propio en el módulo de incidencias que solo emite? Reusa
   el patrón "emite evento mínimo → el resolver resuelve fuera de la tx".
3. **Resolver de destinatarios `incident.*`** (en `NotificationResolverService`, con ABAC obligatorio): decide la
   regla — **asignado + rol responsable + roles del estado actual del flujo** (+ ¿autor?, ¿externos? — creo que
   no para incidencias). Contexto de render: folio `INC-####`, tipo, severidad, estado, `dueAt`, "vencido hace…",
   nodo/equipo, link (`/incidencias?incidentId=`).
4. **Escalamiento (FORK principal):** recomienda el alcance del primer corte. Opciones:
   - **(A, recomendado) Re-aviso + 1 nivel de escalamiento configurable:** mientras siga vencida, re-avisar cada
     N minutos (dedup por ventana) y, pasado un umbral, sumar a un **rol de escalamiento** (config por
     `IncidentType` o `SystemSettings`). Simple, cubre el 80%.
   - **(B) Política de escalamiento por TIERS** (estilo PagerDuty: niveles con destinatarios y demoras) — modelo
     dedicado configurable. Más potente, más grande. Propón si lo difieres a 4.4.1.
5. **KPIs/filtros/UI de plazos:** en `/incidencias` y el drawer, **separar visualmente** "permanencia vencida"
   (estado) de "**plazo de resolución vencido**" (`dueAt`); KPI/chip/filtro nuevos para `overdue` de resolución;
   contador/“vence en…” con formato regional (`lib/format`, incl. `formatRelativeTime`). En el catálogo de tipos,
   editor de `resolutionDueMinutes` (reusa `SlaDurationField`).

== FORKS A RESOLVER CONMIGO (recomendación + espera mi OK en cada uno) ==
- (a) **Escalamiento:** A (re-aviso + 1 nivel) vs B (tiers configurables). ¿Config por `IncidentType` o global?
- (b) **`dueAt`:** auto por tipo + override manual al crear/editar; ¿editable luego con auditoría?
- (c) **Destinatarios** de `incident.*` (asignado/rol responsable/roles del estado; ¿externos?).
- (d) **Dónde vive el sweeper** (worker de notificaciones vs cron del módulo incidencias).
- (e) **"Vencida" unificada §21:** nombres/columnas para distinguir permanencia vs resolución en KPIs/filtros.
- (f) **Permisos:** creo que **sin permiso nuevo** (config de SLA = `incidentcatalog:manage`; ver/recibir avisos =
    ABAC + ownership de preferencias). Si algo lo exige, justifícalo (gotcha: permiso nuevo ⇒ `db:seed` + Redis
    FLUSHALL).

== REGLAS ==
- NO programes hasta presentarme el plan y recibir mi OK.
- Reusa el motor del Bloque N (outbox/worker/resolver/`NotificationChannel`/campanita) y los componentes premium
  de `packages/ui`. Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil).
  Formato regional vía `apps/watchlog-web/src/lib/format.ts`. Filtros en UNA línea + paginación arriba/abajo en
  grillas (`GridPager`). Render seguro sin `eval` (whitelist por evento). La autorización SIEMPRE en backend.
- Reusa lo que ya existe: `evaluateSla`/`maxStayMinutes`, `IncidentReport.dueAt`/`isReportOverdue`,
  `IncidentAction.dueAt`, `deepLinkForEntity("Incident", id)`.

== VERIFICACIÓN Y CIERRE ==
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde + **smoke en vivo** (Python, patrón
  `scripts/smoke-*.py`; login→Bearer; crea y LIMPIA por ID vía `docker exec lyra-watchlog-dev-postgres-1 psql -U
  watchlog -d watchlog`). Smoke nuevo `smoke-incidencias-sla.py` (auto-`dueAt` por tipo · sweeper encola los 4
  eventos al vencer · resolver entrega correo+campanita al destinatario correcto · escalamiento · "vencida"
  permanencia vs resolución separadas) + **REGRESIÓN** sin romper: `smoke-incidencias.py` (32/32),
  `smoke-incidencias-capa.py` (23/23), `smoke-incidencias-reportabilidad.py` (31/31),
  `smoke-notificaciones.py` (18/18), `smoke-notif-inapp.py` (18/18), `smoke-notif-avanzadas.py` (22/22). Si
  Mailpit (`lyra-watchlog-dev-mailpit-1`) está caído, reinícialo.
- **Smoke VISUAL** (KPIs/chips de plazo, editor de `resolutionDueMinutes`, avisos en correo+campanita): documenta
  qué se probó.
- Actualiza **PROGRESS / BACKLOG / ROADMAP (Desglose Fase 4: marca 4.4 ✅) / DECISIONS / DATA_MODEL / SECURITY** (si
  aplica) y **USER_GUIDE** (sección de plazos/avisos de incidencias: 4 partes + caso paso a paso) y **SALES_GUIDE**
  (SLA + avisos de plazo + escalamiento como valor nuevo). FORM_GUIDE NO aplica.
- Actualiza memoria (**incidents-module**: 4.4 ✅; **notifications-engine** si sumas eventos; MEMORY.md).
- **Publica al cerrar:** rama `feat/incidencias-sla` → merge a `main` → push; BACKLOG §1 sin pendientes. Incluye
  SIEMPRE `.claude/settings.json` si cambió.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, **MAILPIT**
`:1025`/`:8025`. API `:3000` (`/api`), Web `:5173` (`pnpm dev`). `@lyra/ui` desde **source**; `@lyra/contracts`
desde **dist** (reconstruye `pnpm --filter @lyra/contracts build` si tocas su API). **EPERM de prisma en
Windows** → mata el `node` del API `:3000` por PID antes de migrar/regenerar; aplica con `prisma migrate diff` +
`db:deploy` (NO `migrate dev`) y **quita del diff cualquier `DROP INDEX` AJENO** (drift persistente). **PERMISO
NUEVO** (si lo hubiera) → `pnpm --filter @lyra/watchlog-api db:seed` + `docker exec lyra-watchlog-dev-redis-1
redis-cli FLUSHALL` o el admin demo da 403. **`POST /api/notifications/run`** (gate `notification:admin`) corre el
worker YA (barrer+despachar+enviar) y devuelve `{swept,dispatched,sent}` — úsalo en el smoke (ojo flaky: el @Cron
de fondo puede despachar el evento recién insertado antes de tus aserciones; re-corre si falla). **OJO procesos
dev zombi:** si el sitio se ve caído, revisa que no haya múltiples `pnpm dev`/`nest`/`node dist/main` peleando
`:3000`; deja UN solo `pnpm dev` limpio (mata SOLO PIDs de `BitacorasInteligentes`, NO de otros proyectos).
Admin demo: `demo@watchlog.local` / `Demo!Pass2026`; no-admin para gates 403: `operador@watchlog.local`.

== RECORDATORIO ==
Tras 4.4 queda **4.5 — Dashboard de incidencias** (tendencias, reincidencia, tiempos de resolución, KPIs por
nodo/tipo). El **escalamiento por tiers** (si difieres el fork (a) a B) y la **firma Part 11** de
verificación/envío quedan como deuda registrada.
