# Prompt — Fase 4.1.1: Panel de excepciones en la bitácora (UI)

> Pégalo como mensaje inicial de una **sesión nueva**. Continúa la Fase 4.1. El **backend (4.1.0) ya está construido, probado
> (smoke 39/39) y publicado en `main`**: modelo, generación, triage y permisos están listos. Esta sesión es **solo frontend**
> (más un pequeño editor en el builder). NO programes hasta que apruebe el plan de UX.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada:
lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE,
FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **incidents-module**, **ui-grid-conventions**,
**regional-formatting**, **prototype-location**, **stack-decisions**, **product-name**, **new-permission-dev-gotcha**). No des
nada por sentado: verifica en el código y en git (árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

**Recordatorio permanente:** queda PENDIENTE el épico de **notificaciones avanzadas** (`docs/prompts/notificaciones-avanzadas.md`,
memoria `notif-advanced-requirement`); el dueño pidió que se lo recuerdes seguido.

== DÓNDE ESTAMOS ==
**Fase 4.1.0 — Excepciones BACKEND ✅** (`feat/incidencias-excepciones` → `main`, memoria `incidents-module`). La capa
**Bitácora → Excepción → Incidencia** ya existe en el servidor: el motor de umbrales **materializa** `LogEntryException`
(gobernado por campo: CRIT siempre, WARN opt-in `config.warnRaisesException`) al guardar (provisional) y al sellar (firme);
hay triage completo (acknowledge/dismiss/correct/convert/associate/manual), dedupe por sugerencia, ABAC y auditoría. Falta
**ponerle cara**: el panel de revisión en la bitácora. Lo que YA puedes consumir (no reimplementar):

**Contratos** (`@lyra/contracts`, módulo `incidents/exceptions`): `LogEntryExceptionDto`, `ExceptionSummary`,
`ExceptionListResponse`/`ExceptionListQuery`, `ExceptionDedupeSuggestion`, enums `EXCEPTION_STATUSES`/`EXCEPTION_TRIGGERS`/
`EXCEPTION_THRESHOLD_TYPES`, helpers `isExceptionResolved`/`thresholdTypeForTrigger`, requests
`acknowledge|dismiss|correct|convert|associate|createManual…RequestSchema`, `EXCEPTION_DEDUPE_WINDOW_HOURS`.

**Endpoints** (`apps/watchlog-api/src/exceptions/`, prefijo `/api`):
- `GET /exceptions` (filtros: status/openOnly/thresholdType/triggerKind/logEntryId/orgNodeIds/equipmentId/unlinkedOnly/search/sort/
  page/pageSize → items + total + page + pageSize + **summary**) · `GET /exceptions/summary?logEntryId=` · `GET /exceptions/:id` ·
  `GET /exceptions/:id/dedupe-suggestions`. Gate: `module:incidents:view`.
- `POST /exceptions/:id/acknowledge|dismiss|correct` · `POST /exceptions/convert|associate|manual`. Gates: `exception:triage`
  (convert exige además `incident:create`), `exception:dismiss`/`exception:dismiss-critical` (crítica = permiso superior),
  `exception:correct`. (Catálogo **81**; el admin demo ya los tiene tras el `db:seed` de la sesión anterior.)

== OBJETIVO DE ESTA SESIÓN ==
**FASE 4.1.1 — PANEL DE EXCEPCIONES EN LA BITÁCORA (UI).** Hacer accionable la capa de excepciones desde el llenado y el visor,
con estándar premium Lyra. **ES UNA FASE DE FRONTEND GRANDE: NO programes hasta que apruebe el plan de UX.** Primero
**(1) propón el diseño de pantallas/flujos y los forks**, con mi OK **(2) construye**. Cierra la fase sola.

== ALCANCE PROPUESTO (revísalo y propón el tuyo) ==
1. **Panel de revisión en `EntryFillPage` y `EntryViewerPage`** (reusa el patrón de drawer/modal y tokens del 4.0,
   `features/incidents/`): cabecera "N críticas · N advertencias · N posibles inválidos" (de `GET /exceptions/summary`), lista de
   excepciones de ESA entrada (`GET /exceptions?logEntryId=`) con su campo/valor/umbral, y acciones por excepción: **Corregir dato ·
   Justificar/Reconocer · Crear incidencia · Asociar a incidencia existente · Agrupar · Descartar con motivo · Marcar revisada**.
2. **Decisión explícita al completar una sección con valores críticos** ("Esta sección contiene valores críticos. ¿Qué deseas
   hacer?"). Si el valor parece IMPOSIBLE (muy fuera de rango) → **priorizar Corregir** antes que Crear incidencia.
3. **Modal "Convertir → incidencia"** prellenado desde el contexto congelado (nodo/equipo/turno/origen EXCEPTION; reusa el
   `CreateIncidentModal` de 4.0 o uno hermano) + **sugerencia de dedup** ("Ya existe INC-#### para este equipo. ¿Asociar/Crear/
   Descartar?", de `GET /exceptions/:id/dedupe-suggestions`).
4. **Trazabilidad campo → excepción → incidencia** en el detalle de la incidencia (bloque "Origen" del 4.0): listar las
   excepciones que la originaron, navegables a la entrada/sección/campo. **Marca "tiene excepciones"** en la grilla de `/bitacoras`
   (reusa el indicador `worstThresholdBand`/`exceptionsOnly` ya existente; añade el conteo si aplica).
5. **Editor `warnRaisesException` en el builder** (`BuilderConfigPanel`/`FieldPropertiesPanel`) para NUMBER y para columnas/
   celdas de TABLE/MATRIX: toggle "Una advertencia genera excepción" (el crítico siempre la genera; explícalo en la ayuda).
   Actualiza `docs/FORM_GUIDE.md` (ficha de Número y §estructurados) si cambias el editor.
6. **i18n es-CL** completo (`features/.../locales` o el i18n del proyecto), **formato regional** (`lib/format`), filtros en una
   línea + `GridPager` arriba/abajo si haces una pantalla/listado de excepciones tipo bandeja (opcional/diferible).

**Forks a resolver (cada uno: A/B · pros/contras · recomendación · impacto):**
1. ¿Panel **inline** en la página (sección plegable arriba) vs **drawer** lateral vs **modal**? (recomiendo inline plegable + drawer
   de detalle por excepción, reusando el patrón del 4.0.)
2. ¿Bandeja GLOBAL de excepciones (`/excepciones`, lista paginada con filtros) en esta fase, o solo el panel por entrada y dejar la
   bandeja para después? (recomiendo solo panel por entrada ahora; la bandeja global = follow-up.)
3. ¿La "decisión explícita al completar con críticas" BLOQUEA el avance (modal obligatorio) o solo ADVIERTE (banner + permitir
   continuar)? (recomiendo advertir, no bloquear: el dato ya es válido; bloquear sería un muro nuevo.)
4. Agrupar varias excepciones en una incidencia: ¿selección múltiple en el panel (checkboxes) en esta fase, o de a una? (recomiendo
   selección múltiple simple → un solo `convert`/`associate` con `exceptionIds[]`, que el backend ya soporta.)

== ESTÁNDAR PREMIUM (obligatorio) ==
Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); navegabilidad y UX excelentes; **reusa**:
`features/incidents/` (modal de creación, drawer de detalle, chips de estado/severidad), componentes de `packages/ui`
(Drawer/Modal/Chip/Table/Tooltip/Toast/Combobox/LookupPicker), tokens de severidad para críticas/advertencias, `lib/format`,
`GridPager` (memoria `ui-grid-conventions`). Mira el `prototipo.tsx` de la raíz si dibuja "fuera de rango → revisión/incidencia".
**Render por estado completo** (open/acknowledged/dismissed/converted/corrected con su color e ícono), estados vacío/cargando/error,
a11y AA + teclado + foco visible.

== VERIFICACIÓN Y CIERRE ==
Verifica en verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`. **Smoke VISUAL del dueño** (no hay smoke automatizado
de UI; el backend ya está cubierto por `scripts/smoke-excepciones.py` 39/39 — puedes re-correrlo para sembrar excepciones reales y
revisarlas en pantalla). Mantén VIVOS `docs/` (PROGRESS, BACKLOG, ROADMAP si aplica, **USER_GUIDE** — esta fase SÍ es de cara al
usuario: redacta su sección [para qué sirve · cómo se usa · quién puede · importante] y marca el índice ✅; rellena 1–2 secciones
✍️ de paso), **FORM_GUIDE** si tocas el editor de `warnRaisesException`, y la memoria (`incidents-module`). **Publica al cerrar**
(rama `feat/incidencias-excepciones-ui` → merge a `main` → push) y deja BACKLOG §1 sin pendientes. Marca **4.1.1** hecho en
BACKLOG §2 y deja **4.1.2** (acción del motor de reglas, diferida vía outbox) como siguiente.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API `:3000`
(prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm --filter @lyra/watchlog-web dev`. **PERMISO NUEVO** ya
sembrado en 4.1.0; si das 403, `db:seed` + `redis FLUSHALL` (memoria `new-permission-dev-gotcha`). `@lyra/ui` desde **source**;
`@lyra/contracts` desde **dist** (reconstruye contracts si tocas su API). PowerShell 5.1: NO `2>&1` con exes nativos; commits
largos vía `git commit -F archivo` o heredoc; al escribir SQL/archivos para psql/migraciones, **no uses `Out-File -Encoding utf8`**
(mete BOM y rompe) — usa la herramienta Write. Admin demo: `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos, scope null);
no-admin para gates 403: `operador@watchlog.local`.

== INSTRUCCIÓN FINAL ==
No programes todavía. Primero entrega: (1) diseño de pantallas/flujos (panel + decisión al completar + modal convertir + dedup +
trazabilidad + editor del builder), (2) forks con recomendación, (3) plan por pasos dentro de 4.1.1, (4) riesgos y preguntas.
Espera mi aprobación antes de escribir código.
