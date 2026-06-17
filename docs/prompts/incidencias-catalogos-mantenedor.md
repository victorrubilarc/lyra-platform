# Prompt — Mantenedor de catálogos de incidencias (Tipos + Categorías) [UI]

> Pégalo como mensaje inicial de una **sesión nueva**. Es **mayormente FRONTEND**: el backend ya administra los catálogos
> (`IncidentType`/`IncidentCategory`); falta la pantalla. NO programes hasta que apruebe el plan.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada:
lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE,
FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **incidents-module**, **stack-decisions**, **product-name**,
**ui-grid-conventions**, **new-permission-dev-gotcha**). No des nada por sentado: verifica en el código y en git (árbol limpio
salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

**Recordatorio permanente:** queda PENDIENTE el épico de **notificaciones avanzadas** (`docs/prompts/notificaciones-avanzadas.md`,
memoria `notif-advanced-requirement`); el dueño pidió que se lo recuerdes seguido.

== DÓNDE ESTAMOS ==
La **Fase 4.1 está completa** (núcleo de incidencias 4.0 + excepciones 4.1.0/4.1.1 + acción del motor de reglas 4.1.2). En un
follow-up se agregaron al alta de incidencias el **equipo/activo** y la **fecha del evento** (`occurredAt`), y se corrigió un bug del
panel anclado (`useAnchoredPanel`). Todo publicado en `main`.

**Lo que YA existe (verifícalo, no lo reinventes):**
- **Modelo:** `IncidentType` (key/name/description/color/`defaultWorkflowId`/`requiresInvestigation`/`requiresCapa`/`reportableDefault`/
  `active`/`sortOrder`) y `IncidentCategory` (key/name/description/`typeId?` [categoría de un tipo o transversal]/`active`/`sortOrder`).
  Catálogos CONFIGURABLES, sin borrado físico (referenciados por incidencias existentes).
- **Contratos** (`@lyra/contracts/incidents`): `upsertIncidentTypeRequestSchema` y `upsertIncidentCategoryRequestSchema` (upsert por
  `key`), `incidentTypeSchema`/`incidentCategorySchema`, `incidentCatalogKeySchema`.
- **API** (`apps/watchlog-api/src/incidents/`): `GET /incidents/types` y `/categories` (con `?includeInactive=true`),
  `POST /incidents/types` y `/categories` (upsert), gateados por **`incidentcatalog:manage`** (cat. 81; el seed/usuario admin ya lo
  tiene). `IncidentsService.listTypes/listCategories/upsertType/upsertCategory`. Seed inicial en `prisma/incidents-seed-data.ts`
  (13 tipos + 13 categorías de minería/HSE Chile).
- **Web** (`apps/watchlog-web/src/features/incidents/`): hoy solo CONSUME los catálogos para los desplegables
  (`useIncidentTypes`/`useIncidentCategories` en `incidents-queries.ts`, fetch en `incidents-api.ts`). **No hay mantenedor.**
- **Patrones de mantenedor a IMITAR** (mira cómo están hechos): *Datos de referencia* (`features/reference-data` o equivalente),
  *Equipos / categorías de equipo* (`features/equipment`), *Flujos* (`features/workflows`). Reusa `Table`/`Drawer`/`Modal`/`Input`/
  `Select`/`Combobox`/`Toggle`/`Chip`/`GridPager` de `@lyra/ui` y las convenciones de grilla (filtros en UNA línea + paginación
  arriba/abajo, memoria `ui-grid-conventions`).

== OBJETIVO DE ESTA SESIÓN ==
**Construir el MANTENEDOR de catálogos de incidencias (Tipos + Categorías) en la UI**, para que un admin con `incidentcatalog:manage`
pueda crear/editar/activar/desactivar tipos y categorías SIN tocar el seed ni la API a mano. **MAYORMENTE FRONTEND.** Primero
**(1) propón diseño + forks**, con mi OK **(2) construye**. Cierra la sesión sola.

== ALCANCE PROPUESTO (revísalo y propón el tuyo) ==
1. **Capa web** (`features/incidents`): extiende `incidents-api.ts`/`incidents-queries.ts` con `upsertIncidentType`/`upsertIncidentCategory`
   (+ invalidación de `useIncidentTypes`/`useIncidentCategories`) y `useIncidentTypes/Categories({ includeInactive })` para el admin
   (la lista de los DESPLEGABLES debe seguir mostrando solo activos).
2. **Pantalla**: tabla(s) con **buscador + orden + paginación** (Tipos y Categorías), botón **Nuevo**, fila con editar y toggle
   activo/inactivo. **Tipo:** nombre, key (solo al crear — es la identidad del upsert), descripción, color (token/heatmap), flujo por
   defecto (selector de `WorkflowDefinition` publicados; vacío = global `incidencia-operacional`), flags **requiere investigación /
   requiere CAPA / reportable por defecto**, orden. **Categoría:** nombre, key (solo al crear), descripción, **tipo** (un tipo o
   "transversal"), orden. Identidad Lyra (tokens, Sora/Inter, Lucide, claro+oscuro, 44px, a11y).
3. **Ubicación** (FORK): pestaña dentro de `/incidencias` (junto a Lista/Tablero) vs. sección en `/configuracion` vs. ruta propia
   `/incidencias/catalogos`. Recomienda una y justifícala (gobernanza del módulo, descubribilidad, gate).
4. **i18n es-CL**; **USER_GUIDE** (cómo se mantienen los catálogos, quién puede); **FORM_GUIDE** no aplica (no es del formulario).

**Forks a resolver (cada uno: A/B · pros/contras · recomendación · impacto):**
1. **¿Dónde vive la pantalla?** (pestaña en /incidencias · /configuracion · ruta propia) — recomienda.
2. **¿`key` editable?** Recomiendo **solo al crear** (es la identidad del upsert; cambiarla rompe trazabilidad). Confírmalo.
3. **¿Desactivar vs. borrar?** Solo **desactivar** (`active=false`): el borrado físico rompería incidencias que referencian el tipo/
   categoría. Verifica que un tipo/categoría inactivo NO aparezca en los desplegables del alta pero SÍ se siga mostrando en incidencias
   históricas que ya lo usan.
4. **¿Validaciones server que falten?** Revisa si el backend ya impide, p. ej., desactivar un tipo con incidencias abiertas, o
   `key` duplicada, o categoría apuntando a un tipo inexistente; agrega lo que sea mínimo y razonable (sin sobre-ingeniería).

== ESTÁNDAR (obligatorio) ==
Server-authoritative (el gate real es `incidentcatalog:manage` en el backend; la UI solo oculta/deshabilita). Sin permisos nuevos
(catálogo 81). Reusa componentes de `@lyra/ui` y el patrón de los mantenedores existentes; NO dupliques. Sin borrado físico de
catálogos. Tests donde aplique; **smoke en vivo** del CRUD (crear tipo/categoría, editar, desactivar→no aparece en el alta, gate 403
para no-admin) y re-correr `smoke-incidencias.py` sin regresión. Identidad Lyra completa.

== VERIFICACIÓN Y CIERRE ==
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde + **smoke en vivo** del mantenedor (+ `smoke-incidencias.py` sin
regresión). Mantén VIVOS `docs/` (PROGRESS, BACKLOG [marca este ítem hecho], DECISIONS, **USER_GUIDE**) y la memoria
(**incidents-module**). **Publica al cerrar** (rama `feat/incidencias-catalogos-ui` → merge a `main` → push) y deja BACKLOG §1 sin
pendientes.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API `:3000`
(prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm --filter @lyra/watchlog-web dev`. `@lyra/ui` desde **source**;
`@lyra/contracts` desde **dist** (reconstruye contracts si tocas su API: `pnpm --filter @lyra/contracts build`). **Si agregas permiso
nuevo** (no debería): `db:seed` + `redis FLUSHALL` o el admin demo da 403 (memoria `new-permission-dev-gotcha`). PowerShell 5.1: NO
`2>&1` con exes nativos. Admin demo: `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos); no-admin para gates 403:
`operador@watchlog.local`. **Si el dev server tiene tomado el engine de Prisma al regenerar, mata el proceso `nest start --watch` de
watchlog-api primero** (pasó esta sesión; no aplica si no tocas el esquema — y aquí NO deberías tocarlo).

== INSTRUCCIÓN FINAL ==
No programes todavía. Primero entrega: (1) diseño (capa web, pantalla, ubicación), (2) forks con recomendación, (3) plan por pasos,
(4) riesgos y preguntas. Espera mi aprobación antes de escribir código.
