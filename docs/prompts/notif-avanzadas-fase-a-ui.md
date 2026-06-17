# Prompt — Notificaciones avanzadas · Fase A · UI

> Pégalo como mensaje inicial de una **sesión nueva**. Continúa el épico de notificaciones avanzadas:
> la **Fase A BACKEND** ya está hecha y publicada (`feat/notif-avanzadas` → main, 2026-06-17); esta sesión
> construye la **UI** (editor de aviso por transición + master-detail de plantillas por bitácora + diccionario
> de comodines + toggle de defaults). Decisión del dueño: épico completo (A+B) primero, luego 4.4.

---

Continuamos **Lyra WatchLog** (`g:\Development\BitacorasInteligentes`).

Ejecuta la **RUTINA DE ARRANQUE** de CLAUDE.md ANTES de cualquier análisis o cambio:
- Lee CLAUDE.md.
- Lee `docs/`: PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE, FORM_GUIDE, SALES_GUIDE.
- Lee `docs/prompts/notificaciones-avanzadas.md` (el épico completo, para contexto de Fase B y forks ya resueltos).
- Revisa MEMORY.md, en especial: **notif-advanced-requirement** (estado del épico + gotcha zod), **notifications-engine**, **ui-grid-conventions**, **regional-formatting**, **prototype-location**, **new-permission-dev-gotcha**, **challenge-dont-please**, **explain-and-document-userguide**, **user-guide-convention**, **sales-guide-convention**, **commit-settings-json**, **stack-decisions**, **product-name**.
- Verifica git: árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0.
- Confírmame en dos líneas dónde estamos y qué haremos antes de escribir código.

== CONTEXTO ==
Lyra WatchLog es ON-PREMISE, single-tenant. El épico de **Notificaciones avanzadas** va por fases (decisión del dueño: épico completo A+B PRIMERO, luego 4.4). La **Fase A — BACKEND ya está hecha y publicada** (`feat/notif-avanzadas` → main, 2026-06-17). Esta sesión construye la **Fase A — UI** (solo frontend + pequeños ajustes si faltara algún endpoint).

**Backend ya disponible (NO rehacer):**
- `WorkflowTransition.notifyConfig` (regla de destinatarios CONGELADA en la versión del flujo; contrato `transitionNotifyConfigSchema`: `enabled`/`templateId?`/`roleIds[]`/`userIds[]`/`includeAuthor`/`includeActor`/`includeDestinationRoles`/`externalEmails[]`). Ya viaja en `WorkflowDetail.version.transitions[].notify` y en `DraftTransitionInput.notify`; el builder ya lo **PRESERVA** en el round-trip (falta la UI que lo edite).
- Plantillas por bitácora: `NotificationTemplate.templateId?` + endpoints `GET /notifications/templates?scope=generic|scoped&eventKey=&q=`, `POST /notifications/templates` (crear ad-hoc; 400 whitelist, 409 dup), `DELETE /notifications/templates/:id` (genérica/sistema no se borra), `PATCH …/:id`, `GET /notifications/templates/field-variables?templateId=` (diccionario de comodines `{{campo.<key>}}`). El DTO trae `templateId`/`templateName` (ámbito).
- Defaults de sistema: `SystemSettings.notifyTransitionDefaultDestinationRoles` (bool). **OJO: revisar si falta endpoint para leerlo/editarlo** (hoy solo existe la columna + lectura interna del resolver) — si falta, agrégalo mínimo (gate `notification:config` o equivalente de settings).
- Permisos: config de transición = `workflow:manage`; plantillas = `notiftemplate:manage`. Render seguro sin eval (`renderTemplate`/`sampleContextForEvent` en `@lyra/contracts`, isomorfo).

== OBJETIVO DE ESTA SESIÓN: Notificaciones avanzadas — Fase A · UI ==
Ponerle PANTALLA a lo que ya existe en backend:
1. **Editor de aviso por TRANSICIÓN en el builder de flujos** (`WorkflowBuilder` / editor de transición): toggle "Notificar en esta transición" + regla de destinatarios (multiselección de **roles** [picker], **usuarios** explícitos, checks **autor** / **ejecutor** / **roles del estado destino**, y lista de **correos externos** claramente marcada "salta permisos, se audita") + selector opcional de **plantilla**. Edita `transition.notify` (el modelo del builder ya lo conserva).
2. **Atajo "copiar la configuración de destinatarios de OTRA transición"** (puro frontend; lo pidió el dueño para que administrar varias transiciones no sea burocrático).
3. **Master-detail de plantillas POR BITÁCORA** en `/notificaciones` → pestaña Plantillas: botón **"Nueva plantilla"** (evento + bitácora + idioma), **columna "Ámbito"** (Por defecto / nombre de bitácora), filtros (evento, scope generic/scoped, búsqueda), borrar las ad-hoc (la genérica no). Reusa el editor master-detail existente.
4. **Diccionario de comodines de campo** en el editor de una plantilla ad-hoc (consume `GET /notifications/templates/field-variables?templateId=`): insertar `{{campo.<key>}}` en el cursor, junto a las variables del evento y `{{entry.summary}}`. Reusa el diccionario/insert-en-cursor que ya tiene el editor de plantillas.
5. **Toggle de defaults de sistema** en `/configuracion` (tab Correo saliente o Notificaciones): "Las transiciones sin configuración avisan a los roles del estado destino" (`notifyTransitionDefaultDestinationRoles`).

== REGLAS ==
- NO programes hasta presentarme el enfoque/UI y recibir mi OK (decide forks de UX: dónde vive el editor de aviso —inline en el panel de la transición vs drawer—, cómo se ven roles/usuarios/externos, etc.).
- Reusa componentes premium de `packages/ui` y los patrones ya existentes (el master-detail de plantillas, los pickers de roles/usuarios del builder, `GridPager`). Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, **claro+oscuro**, 44px táctil). Formato regional vía `lib/format.ts`. **Filtros en UNA línea + paginación arriba/abajo** en toda grilla.
- La autorización SIEMPRE en backend; el front solo oculta/deshabilita. No dupliques lógica que ya vive en `@lyra/contracts`.
- Si descubres que falta un endpoint mínimo (p. ej. leer/guardar el default de sistema), agrégalo con su gate y un test, sin re-arquitecturar el backend.

== BLINDAJE Y CIERRE ==
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde + **smoke VISUAL** (la UI es el entregable; documenta qué se probó). Regresión: `smoke-notif-avanzadas.py` 19/19 y `smoke-notificaciones.py` 17/17 sin romper (entorno: si Mailpit `lyra-watchlog-dev-mailpit-1` está caído, reinícialo; si el correo no llega, revisa `SystemSettings.emailHost`/`emailConfiguredAt`).
- Actualiza PROGRESS / BACKLOG / ROADMAP / DECISIONS y, como la Fase A queda de cara al usuario, **USER_GUIDE.md AL DETALLE** (sección "Notificaciones a la medida" con las 4 partes + caso de uso paso a paso: configurar un aviso en una transición, crear una plantilla por bitácora con comodines de campo) y **FORM_GUIDE/SALES_GUIDE** según aplique. Enriquece SALES_GUIDE (el changelog ya lo anuncia "en construcción" → pásalo a disponible).
- Actualiza memoria (notif-advanced-requirement: Fase A UI ✅; MEMORY.md).
- **Publica al cerrar:** rama `feat/notif-avanzadas-ui` → merge a `main` → push; deja BACKLOG §1 sin pendientes.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, **MAILPIT** `:1025`/`:8025`. API `:3000` (`/api`), Web `:5173` (`pnpm dev`). `@lyra/ui` desde source; `@lyra/contracts` desde **dist** (reconstruye `pnpm --filter @lyra/contracts build` si tocas su API). **Gotcha zod:** no metas `.default()` en schemas DTO embebidos (rompe la re-inferencia del web con TS2719) — usa campos requeridos. Admin demo `demo@watchlog.local` / `Demo!Pass2026`; no-admin `operador@watchlog.local`.

== RECORDATORIO ==
Tras la Fase A UI vienen **Fase B (campanita in-app + SSE)** y luego **4.4 (SLA/escalamiento)** — sus decisiones ya están acordadas y registradas en BACKLOG §2.
