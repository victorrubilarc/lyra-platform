# Prompt — Reestructurar el menú lateral (agrupación por secciones)

> Sesión CORTA y de bajo riesgo (solo frontend del shell). El sidebar creció a una columna larga con
> scrollbar; hay que **agruparlo en secciones** para que se vea profesional (estilo SAP Fiori / ServiceNow /
> Linear / Notion) y entre sin scroll. NO toca backend, contratos ni migraciones.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`).

Ejecuta la **RUTINA DE ARRANQUE de CLAUDE.md** (lee CLAUDE.md + `docs/` PROGRESS/ARCHITECTURE/BACKLOG/ROADMAP +
MEMORY.md; en especial **ui-grid-conventions**, **regional-formatting**, **product-name**, **stack-decisions**,
**commit-settings-json**). Verifica git limpio (`git rev-list --count origin/main..main` = 0). Confírmame en dos
líneas el plan antes de tocar código.

== OBJETIVO ==
El **menú lateral (sidebar)** creció a una sola columna con **scrollbar**. Reestructurarlo en **grupos/secciones
con encabezado** para que se vea **profesional** (como los grandes softwares) y **quepa sin scroll** en pantallas
normales. **Es UI del shell, rápido y autocontenido.** Propón el esquema de agrupación y **espera mi OK** antes de
implementar.

== DÓNDE ESTÁ (no reinventar) ==
- Fuente de verdad de rutas: `apps/watchlog-web/src/shell/navigation.ts` (`ROUTES` + `SIDEBAR_ROUTES`; cada ítem
  tiene `path`/`labelKey`/`icon`/`permission`/`inSidebar`). HOY es una **lista plana**.
- Render del sidebar + secciones "MÓDULOS"/"FAVORITOS": `apps/watchlog-web/src/shell/AppShell.tsx` +
  `AppShell.module.css` (clases `.navItem`, etc.). El sidebar tiene un **estado colapsado** (riel solo-iconos,
  chevron arriba) — respétalo.
- Favoritos: ya existe una sección "FAVORITOS" (store de UI). El estado de UI del shell vive en
  `apps/watchlog-web/src/shell/ui-store.ts` (densidad, etc., persistido) — úsalo si los grupos se pliegan.
- i18n es-CL: `apps/watchlog-web/src/i18n/locales/es-CL.ts` (claves `nav.*`); agrega las etiquetas de grupo.

== PROPUESTA DE AGRUPACIÓN (ajústala y propón la tuya con fundamento) ==
Ítems actuales en el sidebar: Inicio · Estructura · Plantillas · Nueva entrada · Bitácoras · Mis rondas ·
Programación de rondas · Incidencias · Excepciones · Flujos · Datos de referencia · Calendario operacional ·
Calendario fiscal · Seguridad · Notificaciones · Configuración (+ Favoritos).

Agrupación sugerida (3–4 grupos, orden de uso diario primero):
- **Operación** (día a día): Inicio · Bitácoras · Nueva entrada · Mis rondas · Incidencias · Excepciones.
- **Diseño y datos** (configurar el "qué"): Plantillas · Flujos · Datos de referencia · Estructura ·
  Programación de rondas · Calendario operacional · Calendario fiscal.
- **Administración**: Seguridad · Notificaciones · Configuración.
- **Favoritos** (se mantiene).

Patrón profesional: **encabezados de sección discretos** (mayúsculas pequeñas, muted, ya existe el estilo de
"MÓDULOS"/"FAVORITOS") + grupos **colapsables** (recordar plegado/expandido por grupo, persistido en
`ui-store`), con divisores sutiles. El ítem activo abre su grupo. Densidad acorde a la del shell.

== FORKS A RESOLVER CONMIGO (recomendación + OK) ==
- (a) **Esquema de grupos** exacto (los buckets de arriba vs el que propongas).
- (b) **Colapsables vs encabezados estáticos**: recomiendo **colapsables con estado persistido** (como Fiori/
  VS Code), default expandidos; el grupo del ítem activo siempre visible.
- (c) **Sidebar COLAPSADO** (riel solo-iconos): cómo se ven los grupos (divisores entre grupos, sin encabezados
  de texto; tooltip por ítem).
- (d) **Modelo de datos**: ¿`group` (clave i18n) en cada `NavRoute` + un orden de grupos, o una estructura
  `NAV_GROUPS` aparte? Recomiendo `group` en el ítem + un arreglo ordenado de grupos (fuente única, mínimo
  cambio). Mantén `SIDEBAR_ROUTES`/`routeForPath` intactos para pestañas/breadcrumbs/command palette.

== REGLAS ==
- NO programes hasta tener mi OK del esquema.
- Solo frontend del shell. **NO** cambies permisos, rutas, ni el gateo por `permission` (un grupo que queda
  vacío porque el usuario no tiene permiso para ninguno de sus ítems **no se muestra**). Reusa componentes y
  tokens de `packages/ui`/DS. Identidad Lyra (tokens, Sora/Inter, Lucide, glow, claro+oscuro, 44px táctil).
  Accesible (role/aria-expanded en los encabezados colapsables, navegable por teclado).
- No rompas la command palette (⌘K), las pestañas de trabajo ni los breadcrumbs (todos leen de `navigation.ts`).

== VERIFICACIÓN Y CIERRE ==
- `pnpm typecheck && pnpm lint && pnpm build` en verde. (No hay backend que probar; no se necesita smoke de API.)
- **Smoke VISUAL** (lo principal aquí): sidebar agrupado en claro/oscuro, colapsado/expandido, grupos que pliegan,
  ítem activo resaltado sin doble-resalte, responsive; documenta qué se probó.
- Actualiza PROGRESS / BACKLOG / ROADMAP (si aplica) / DECISIONS (registra el esquema de agrupación y el porqué).
  Si cambia la forma de navegar, una nota breve en USER_GUIDE (§ El espacio de trabajo).
- **Publica al cerrar:** rama `feat/sidebar-grupos` → merge a `main` → push; BACKLOG §1 sin pendientes. Incluye
  `.claude/settings.json` si cambió.

== ENTORNO ==
Docker dev arriba; Web `:5173` (`pnpm dev`), API `:3000`. `@lyra/ui` desde source. Si el sitio se ve caído,
revisa que no haya múltiples `pnpm dev`/`nest`/`node dist/main` peleando `:3000`/`:5173`; deja UN solo `pnpm dev`
limpio (mata SOLO PIDs de `BitacorasInteligentes`, no de otros proyectos). Admin demo: `demo@watchlog.local` /
`Demo!Pass2026`.
