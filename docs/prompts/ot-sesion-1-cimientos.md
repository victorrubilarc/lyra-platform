# Prompt — OT Sesión 1 (Cimientos)

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE, FORM_GUIDE). **Lee el diseño aprobado `docs/design/OT_DESIGN_ARCHITECTURE.md` COMPLETO** (es la fuente de verdad de este módulo) y las entradas de `docs/DECISIONS.md` 2026-07-01 (las 3: planificación, entrega S0, y **forks W1–W8 APROBADOS**). Revisa tu memoria persistente (MEMORY.md; en especial **work-orders-module-plan**, **incidents-module**, **stack-decisions**, **fase2-formbuilder-plan**, **multi-org-structure-requirement**, **org-views-vs-isolation** [aislamiento por estructura], **role-node-scope-requirement**, **ui-grid-conventions**, **regional-formatting**, **new-permission-dev-gotcha**, **prototype-location**, **product-name**, **leave-site-running-on-close**, **explain-and-document-userguide**). No des nada por sentado: verifica en el código y en git.

**Antes de empezar:** confirma árbol limpio (`git rev-list --count origin/main..main` debe ser 0; la Sesión 0 quedó publicada en `main`, commits `1a3131b` + `9e45b33`). Si hubiera algo sin publicar, resuélvelo antes.

**Recordatorios permanentes:** los **entitlements / activación por licencia** NO se tocan (van al épico de licenciamiento §2(1)); hoy la visibilidad es solo RBAC (`module:workorders:view`). El épico de **notificaciones avanzadas** sigue pendiente (se cruza recién en S6). El diseño está **CONGELADO** por los forks W1–W8 aprobados: respétalos; si encuentras un motivo de peso para desviarte, **objétalo con fundamento** antes de codificar (regla challenge-dont-please), no cambies el diseño en silencio.

== OBJETIVO DE ESTA SESIÓN (único, cerrable) — OT Sesión 1: CIMIENTOS ==
Levantar el esqueleto del módulo de Órdenes de Trabajo hasta "crear y listar una SOLICITUD", **sin** workflow/folio/checklists/actividades (esos son S2–S5). Alcance exacto:

1. **Schema Prisma (entidades nuevas, según §2 del diseño):**
   - `WorkOrder` (espejo de `Incident`) — en esta sesión solo los campos necesarios para SOLICITUD: identidad/título/tipo/origen/criticidad/prioridad/riesgo, `orgNodeId`/`equipmentId`/`locationDetail`/`shiftCode`, solicitante/responsable/fechas tentativas, `lifecycle` (DRAFT|OPEN|CLOSED|CANCELED), `originIncidentId`/`originLogEntryId`/`originExceptionId`, auditoría. Deja **declarados pero inertes** los campos de workflow/folio/cierre (se activan en S2+) o difiérelos si ensucian — decide y regístralo.
   - `WorkOrderType` (espejo de `IncidentType`): `key`/`name`/`color`/`defaultWorkflowId`/`requiresPtwDefault`/`criticalityDefault`/SLA light/`folioScheme`/`folioOnStateKey`/`active`/`sortOrder`/soft-delete. (Los campos de folio quedan declarados; su USO es S2.)
   - Catálogos `Area` y `Specialty` + tablas enlace N:N `WorkOrderArea`/`WorkOrderSpecialty` (fork **W3** aprobado: separados, NO reusar `OrgNode`).
   - **NO** crear todavía `WorkOrderChecklist(Rule)`, `WorkActivity(Update)`, `FolioCounter`, satélites de workflow (S2–S5).
   - Migración: sigue el gotcha EPERM Windows (mata el node del API `:3000`; `migrate diff` + `db:deploy`, NO `migrate dev`; quita del diff cualquier `DROP INDEX` ajeno).

2. **Permisos nuevos (grupo `"workorders"`, fork W2 aprobado):** agrega al catálogo `packages/contracts/src/security/permissions.ts` los de esta fase: `module:workorders:view` (MODULE), `workorder:view`/`workorder:create`/`workorder:edit`/`workorder:assign`/`workorder:comment`/`workorder:cancel`/`workordercatalog:manage` (ACTION). (`workorder:transition`, `:checklist:manage`, `:activity:manage` entran cuando lleguen sus fases — o decláralos ahora si es más limpio, tú decides y lo registras.) Registra la **etiqueta del grupo** donde el web renderiza los grupos de permisos. Aplica el gotcha: `pnpm db:seed` + `redis FLUSHALL` o el admin demo da 403.

3. **Backend (NestJS, `apps/watchlog-api/src/work-orders/`):** módulo/servicio/controlador que soporten:
   - Catálogos: CRUD de `WorkOrderType`/`Area`/`Specialty` (gate `workordercatalog:manage`), estilo mantenedor de catálogos de Incidencias.
   - Solicitudes: `create` (DRAFT/OPEN) y `list` con **`buildWhere` ABAC por nodo ∩ estructura activa** (reusa `ScopeService.getAccessibleNodeIds` + patrón `?structureId=`; respeta el aislamiento L1 — ver memoria org-views-vs-isolation) + `getDetail`/`update`/`assign`/`cancel`. Paginación keyset + facetas como Incidencias.
   - Contratos en `packages/contracts/src/work-orders/` (DTOs + Zod + `workOrderCode`/helpers + contrato de lista). Recuerda reconstruir `@lyra/contracts` (dist) si tocas su API.

4. **Web (`/ordenes-trabajo`):** grilla con **convenciones de grilla** (filtros en UNA línea + paginación arriba y abajo, `GridPager`; facetas; `SavedView module:"work-orders"` — fork W7) + **wizard de nueva solicitud**. Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); formato regional vía `lib/format`; ruta + entrada en el sidebar gated por `module:workorders:view`. Sin kanban todavía si no alcanza (decláralo diferido a cuando exista workflow), pero deja la lista premium.

== NADA HARDCODEADO ==
Tipos/áreas/especialidades = DATO (catálogos). Criticidad/prioridad/riesgo reusan los tokens/escala existentes. La autorización de datos es ABAC (no permisos). Sigue los patrones REALES verificados en el diseño (nombres exactos: `WorkflowDefinitionVersion`, permisos por `group`/`dimension`, etc.).

== SEED / DATOS DEMO ==
Agrega al seed: 1–2 `WorkOrderType` (p. ej. "Correctiva", "Permiso de Alto Riesgo"), un puñado de `Area`/`Specialty` mineras (Mina Rajo/Planta; Mecánica/Eléctrica/Instrumentación), y asigna los permisos nuevos al rol admin demo. `db:seed` DESPUÉS de build de contracts o el permiso no entra (403).

== VERIFICACIÓN Y CIERRE (CLAUDE.md §Gestión de sesiones) ==
1. En verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` + **smoke Python** `scripts/smoke-workorders.py` (login→Bearer; crea tipo/área/solicitud, lista con ABAC, verifica 403 de `operador@watchlog.local` donde corresponda, y LIMPIA por ID). Registra qué se probó y qué NO.
2. Actualiza `docs/PROGRESS.md`, `docs/BACKLOG.md` (tacha S1, deja S2 como próxima), `docs/DATA_MODEL.md` (entidades nuevas), y **`docs/USER_GUIDE.md`** (funcionalidad de cara al usuario: 4 partes + índice ✅; backfill 1–2 antiguas si puedes). Si tocaste objetos del formulario NO aplica aquí (OT usa checklists en S3).
3. Commit descriptivo + **push** (regla "nada se queda atrás"; incluye SIEMPRE `.claude/settings.json` si cambió). Verifica `git rev-list --count origin/main..main` = 0.
4. **Deja el sitio OPERATIVO**: no mates el `pnpm dev`; verifica API `:3000/api/health` y web `:5173` y avísame las URLs (suelo hacer el smoke visual justo después).
5. Actualiza la memoria (`work-orders-module-plan`: marca S1 hecha + rutas/nombres reales creados).
6. Muéstrame el resumen y dime: "Esta sesión está completa. Por favor abre una sesión nueva para continuar con: OT Sesión 2 (Puerta 1 — aprobación inicial + folio al aprobar)."

== ENTORNO Y GOTCHAS ==
Docker dev (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API `:3000` (prefijo `/api`), Web `:5173` con `pnpm dev`. Admin demo `demo@watchlog.local` / `Demo!Pass2026` (scope null); no-admin para 403 `operador@watchlog.local`. **PERMISO NUEVO** → `db:seed` + `redis FLUSHALL`. **EPERM prisma Windows** → mata el node del API `:3000` antes de migrar; `migrate diff` + `db:deploy` (NO `migrate dev`); quita del diff cualquier `DROP INDEX` ajeno. `@lyra/ui` desde source; `@lyra/contracts` desde dist (reconstruye si tocas su API). PowerShell 5.1: NO `2>&1` con exes nativos; commits largos vía `git commit -F archivo`.
