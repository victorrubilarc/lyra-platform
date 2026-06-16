# Prompt — Fase 4: Módulo de Incidencias (gestión HSE/operacional, workflow + kanban)

> Pégalo como mensaje inicial de una **sesión nueva**. Arranca con una INVESTIGACIÓN de los líderes mundiales
> y de la realidad de la minería/industria chilena ANTES de diseñar. Objetivo: potente, ágil, enterprise, premium,
> con experiencia de usuario excelente y casos de uso reales.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de
nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG,
USER_GUIDE, FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **stack-decisions**, **product-name**,
**rules-engine**, **notifications-engine**, **notif-advanced-requirement**, **ui-grid-conventions**,
**new-permission-dev-gotcha**, **regional-formatting**, **prototype-location**). No des nada por sentado: verifica en el
código y en git (árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

**Recordatorio permanente:** queda PENDIENTE el épico de **notificaciones avanzadas** (`docs/prompts/notificaciones-avanzadas.md`,
memoria `notif-advanced-requirement`); el dueño pidió que se lo recuerdes seguido. Menciónaselo cuando sea pertinente (esta
fase lo va a rozar: las incidencias notifican/escalan).

== OBJETIVO DE ESTA SESIÓN ==
**FASE 4 — MÓDULO DE INCIDENCIAS** (gestión de incidencias operacionales / HSE con **workflow + tablero kanban**). Es uno de
los módulos centrales del producto. Debe ser **potente, eficiente, ágil, enterprise y premium**, con **experiencia de usuario
excelente y gran navegabilidad**, **fácil de administrar y fácil de usar**, y debe **atacar casos de uso REALES de la minería
y la industria chilena** (seguridad, salud ocupacional, medio ambiente, calidad, confiabilidad de activos).

**ES UN MÓDULO ENORME: NO programes hasta que yo apruebe el plan.** El trabajo de esta sesión es **(1) INVESTIGAR** a fondo,
**(2) PROPONER** un diseño y un **plan POR FASES** con forks, y recién con mi OK, **(3) empezar a construir la primera fase**.

== 1. INVESTIGACIÓN PREVIA (obligatoria, antes de proponer nada) ==
Investiga y SINTETIZA cómo lo hacen los grandes, y aterrízalo a Chile. Entrégame un resumen claro (no copies catálogos):

**a) Plataformas EHS/HSE y de gestión de incidentes (cómo modelan y operan):**
   Intelex · Cority · Enablon (Wolters Kluwer) · Sphera · VelocityEHS · Benchmark Gensuite · EcoOnline · Ideagen.
   Mira: tipos/clasificación de incidente, severidad/riesgo, ciclo de vida (reporte→triage→investigación→acciones→cierre),
   investigación de causa raíz, CAPA (acciones correctivas/preventivas), tableros, SLA, reportes/indicadores, notificaciones.

**b) ITSM / workflow / kanban (experiencia y navegabilidad):**
   ServiceNow (Incident Management) · Jira Service Management. Mira: kanban, colas, asignación, escalamiento, vistas
   guardadas, SLA, automatización, portal de auto-reporte.

**c) EAM/CMMS (cruce con activos y mantención):**
   SAP PM (notification → work order) · IBM Maximo. Mira: cómo un aviso/incidente se liga al **activo** y dispara una OT.

**d) METODOLOGÍAS de investigación de causa raíz** (configurables, no inventar):
   **ICAM** (muy usado en minería AU/CL) · TapRooT · **5 Por qués** · **Árbol de causas** · **Bowtie** · RCA · **Jerarquía
   de controles** (eliminación→sustitución→ingeniería→administrativo→EPP). CAPA = acciones con responsable y plazo.

**e) REALIDAD Y REGULACIÓN CHILENA (minería e industria) — clave para "casos de uso reales":**
   **SERNAGEOMIN — DS 132 (Reglamento de Seguridad Minera)**: obligación de **reportar accidentes graves/fatales**,
   investigación, paralización. **Ley 16.744** (seguro de accidentes del trabajo y enfermedades profesionales) +
   **mutualidades** (ACHS · IST · Mutual de Seguridad): reporte de accidentes, **DIAT/DIEP**. **DS 40** (prevención de
   riesgos). Conceptos: **cuasi-accidente / near-miss**, **accidente con/sin tiempo perdido (CTP/STP)**, **incidente
   ambiental / derrame**, **no conformidad / desviación**, **índices de frecuencia y gravedad (IF/IG)**, **clasificación
   por potencial de gravedad**, **investigación obligatoria**, **plan de acción**. Considera también ISO 45001 (SST),
   ISO 14001 (ambiental), ISO 31000 (riesgo, ya usamos su matriz en el form builder).

Cierra la investigación con: qué patrones adoptamos, qué casos de uso chilenos atacamos primero, y qué NO (alcance).

== 2. DISEÑO A PROPONER (con forks; espera mi OK en cada uno; decisiones a DECISIONS.md) ==
Todo **configurable, NADA hardcodeado** (tipos, severidades, flujos, campos, permisos = DATO).

- **Tipos / clasificación** de incidente configurables (seguridad, salud ocupacional, medio ambiente, calidad/no
  conformidad, falla de equipo/confiabilidad, cuasi-accidente, accidente CTP/STP, derrame…). **Severidad/riesgo** reusando
  la **matriz de riesgo ISO 31000** que YA existe como objeto del formulario (`RISK_MATRIX`/`riskLevelFor`) + potencial de
  gravedad. Flag "reportable" (SERNAGEOMIN / mutualidad) configurable.
- **Ciclo de vida / workflow**: reporte → triage/clasificación → investigación (RCA/ICAM) → **CAPA** (acciones correctivas/
  preventivas con responsable y plazo) → verificación → cierre (con **firma Part 11** reusando lo de 2.5). **REUSA la entidad
  `WorkflowDefinition`** (máquinas de estado reutilizables, Fase 2.2) — fork: flujo propio de incidencias vs el motor
  genérico. SLA por estado reusando `WorkflowState.maxStayMinutes`.
- **Tablero KANBAN** (arrastrar entre estados, con guardas de transición server-side) **+ vista LISTA/grilla** reusando la
  infraestructura premium de `/bitacoras` (filtros en UNA línea + **paginación arriba/abajo** [memoria `ui-grid-conventions`,
  `GridPager`], facetas con conteo, vistas guardadas `SavedView` [ya es genérica por `module`], peek lateral, multi-sort,
  review-by-exception, "mis incidencias").
- **Asignación + responsables + SLA + escalamiento**. **Investigación**: causa raíz (5 porqués / ICAM), **evidencia/adjuntos**
  reusando **MinIO (Ola 3)**. **CAPA**: sub-acciones con dueño/plazo/estado (¿entidad `IncidentAction`?).
- **Origen**: **manual** (auto-reporte), **desde una ENTRADA de bitácora** (link entrada↔incidencia), y **automático desde el
  MOTOR DE REGLAS** (la acción "abrir incidencia" diferida del 2.º corte — `docs/BACKLOG.md`: umbral en una bitácora dispara
  incidencia). **Notificaciones** con el **motor del Bloque N** (asignación, SLA en riesgo/incumplido, escalamiento) — y con
  el épico avanzado cuando exista.
- **Ligazón**: incidencia ↔ **nodo** (estructura) ↔ **equipo** (EAM, ISO 14224) ↔ plantilla/entrada ↔ turno. **ABAC** en
  todo (alcance por nodo y, si aplica, por tipo).
- **Reportes/indicadores básicos**: IF/IG, por tipo/nodo/severidad/estado, tendencia (el dashboard rico es Fase 6; aquí
  KPIs y conteos).
- **Modelo (placeholder ya en DATA_MODEL §Incidencias):** `Incident` (severidad, prioridad, estado, asignado, reporter,
  SLA/due, tipo, origen, nodo/equipo/entrada) · `IncidentComment` · `IncidentActivity` (timeline append-only) ·
  `IncidentAttachment` · `IncidentAction` (CAPA). Ajústalo y justifícalo.
- **Permisos** (RBAC/ABAC configurables): módulo, acciones (crear/asignar/investigar/cerrar), **transiciones de workflow**
  (dato), alcance de datos. **Firma** en el cierre. **Auditoría** inmutable. Migración aditiva.

**Forks típicos a resolver:** flujo de incidencias = `WorkflowDefinition` genérico vs dedicado · CAPA como entidad propia vs
sub-tareas genéricas · kanban: estados del workflow como columnas (config) · auto-creación por regla: síncrona vs evento ·
qué metodología RCA en el MVP (5 porqués vs ICAM completo) · campos regulatorios chilenos: fijos vs plantilla configurable de
incidencia (¿el form-builder define el formulario de la incidencia, como una bitácora especial?) — **esto último es grande y
elegante: evaluar reusar el form-builder para el "formulario de incidencia" por tipo**.

== 3. PLAN POR FASES (propón el orden; recomendación de partida) ==
- **4.0** — modelo + ciclo de vida básico (crear/listar/ver/transicionar/asignar) + **kanban + lista** + ABAC + auditoría.
- **4.1** — investigación (RCA/5-porqués/ICAM) + **CAPA** (acciones con dueño/plazo) + adjuntos (MinIO) + firma de cierre.
- **4.2** — **auto-creación**: desde entrada de bitácora + **desde el motor de reglas** (umbral→incidencia).
- **4.3** — **notificaciones/escalamiento** (motor Bloque N) + KPIs/indicadores (IF/IG) + flags regulatorios.
Cada fase cierra sola (un objetivo por sesión, regla de CLAUDE.md).

== ESTÁNDAR PREMIUM (obligatorio) ==
Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); **navegabilidad y UX excelentes**
(kanban fluido, filtros en una línea, paginación arriba/abajo, facetas, vistas guardadas, peek, atajos); formato regional vía
`lib/format`; componentes reutilizables en `packages/ui`; **reusa** WorkflowDefinition, RISK_MATRIX, MinIO/adjuntos, SavedView/
grid/facetas/peek, SLA, motor de reglas, motor de notificaciones, firmas Part 11, audit, ABAC, estructura/equipos. Mira el
`prototipo.tsx` de la raíz (memoria `prototype-location`) si dibuja incidencias.

== VERIFICACIÓN Y CIERRE ==
Verifica en verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` + **smokes en vivo** (Python, patrón
`scripts/smoke-*.py`; login → Bearer; crea y LIMPIA por ID vía `docker exec lyra-watchlog-dev-postgres-1 psql -U watchlog -d
watchlog`). Mantén VIVOS `docs/` (PROGRESS, BACKLOG, ROADMAP, DECISIONS, DATA_MODEL, SECURITY, USER_GUIDE; FORM_GUIDE si
reusas el form-builder para incidencias). **Publica al cerrar** (rama `feat/incidencias-...` → merge a `main` → push) y deja
BACKLOG §1 sin pendientes.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API
`:3000` (prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm dev`. Si el dev se cae, relánzalo y espera login
200; mata SOLO los PIDs de `:3000`/`:5173` por PID. **PERMISO NUEVO** → `db:seed` + `redis FLUSHALL` o el admin demo da 403.
**EPERM prisma Windows** → mata el node del API `:3000` antes de migrar/regenerar; aplica con `migrate diff` + `db:deploy` (NO
`migrate dev` que pide RESET por drift — hay datos demo) y **QUITA del diff cualquier `DROP INDEX
"LogEntry_currentStateSince_idx"` AJENO** (drift de otra rama). `@lyra/ui` desde **source**; `@lyra/contracts` desde **dist**
(reconstruye contracts si tocas su API). PowerShell 5.1: NO `2>&1` con exes nativos; commits largos vía `git commit -F archivo`
o heredoc. Admin demo: `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos, scope null); no-admin para gates 403:
`operador@watchlog.local`.
