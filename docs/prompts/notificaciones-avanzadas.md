# Prompt — Notificaciones avanzadas (personalización por flujo/transición + canal in-app)

> Pégalo como mensaje inicial de una **sesión nueva**. Captura el requerimiento del dueño (2026-06-16):
> avisos a la medida de cada bitácora, configurables por transición de flujo, con destinatarios, comodines
> de campo y la "campanita" in-app. Es la evolución enterprise del Bloque N (motor + hardening ya construidos).

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de
nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG,
USER_GUIDE, FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **notifications-engine**,
**notif-advanced-requirement**, **ui-grid-conventions**, **new-permission-dev-gotcha**, **regional-formatting**,
**rules-engine**, **stack-decisions**, **product-name**). No des nada por sentado: verifica en el código y en git
(árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

== OBJETIVO DE ESTA SESIÓN ==
**NOTIFICACIONES AVANZADAS** — personalización de los avisos a la medida de cada bitácora y flujo, + **canal IN-APP
(la campanita)**. Da flexibilidad para adaptar la plataforma a cualquier realidad operacional: distintas bitácoras
necesitan mensajes muy distintos, gatillados en transiciones específicas, a destinatarios específicos, con datos
propios del registro.

**Estado actual (NO rehacer — ya está en `main`):** motor **transactional-outbox + worker** (`@nestjs/schedule`), 4
eventos (`round.overdue`/`entry.sla.breached`/`entry.transition`/`entry.signature.pending`), **plantillas configurables
por evento** (1 genérica × locale × canal) con **render sin eval** + `{{entry.summary}}`, **bandeja de salida**,
**preferencias** propias, **config SMTP en BD** (cifrada, pantalla en `/configuracion`), **editor master-detail** con
vista previa/diccionario de variables, **canal abstracto `NotificationChannel`** (solo `EmailChannel` implementado;
`NotificationOutbox.channel` reserva el modelo), permiso catálogo en **68**.

**ES UN ÉPICO GRANDE: NO programes hasta que yo apruebe el plan.** Primero investiga el estándar (ServiceNow
notification + flow-driven email, Jira automation rules, SAP PM/Maximo workflow notifications + distribution lists,
Camunda/n8n) y **propón un PLAN POR FASES** con forks; espera mi visto bueno en cada uno (decisiones a `DECISIONS.md`).

== LAS PIEZAS A DISEÑAR Y CONSTRUIR ==

1. **Disparo por TRANSICIÓN (config en el flujo, versionada).** Hoy `entry.transition` se dispara en TODA transición a
   roles fijos. Evolución: cada **transición** del flujo declara, **en el builder de flujos**, si **envía notificación**,
   con **qué plantilla** y **a quién**. La config es **DATO en `WorkflowTransition`**, **congelada en la versión del
   flujo** (como `requireSignature`/`requireMfa`/roles). El emitter la lee al ejecutar la transición (el hook in-tx en
   `executeTransition` ya existe). Igual aplica a otros disparos (firma pendiente) si se justifica.

2. **DESTINATARIOS / LISTA DE DISTRIBUCIÓN.** Resolver server-side **respetando ABAC**: por **rol**, **usuarios
   explícitos**, **autor/ejecutor** de la entrada, **rol del estado destino**, **alcance por nodo**, y **correos
   externos** (gobernanza: los externos SALTAN ABAC ⇒ control/whitelisting explícito). **Fork:** entidad **reusable
   `DistributionList`** (referenciable desde varias transiciones/plantillas) vs **config embebida** en la transición.
   Recomienda con fundamento.

3. **PLANTILLAS POR BITÁCORA (form-template) con override de la genérica.** `NotificationTemplate.templateId?`
   (`null` = genérica/default, con valor = específica de esa bitácora). **Resolución: la más específica
   (evento × bitácora) primero, fallback a la genérica.** UI: botón **"Nueva plantilla"** (evento + bitácora + idioma),
   columna **"Ámbito"** (Por defecto / nombre de la bitácora), filtros, borrar las ad-hoc (las del sistema no).

4. **VARIABLES DE CAMPO `{{campo.<key>}}` con VERSIONADO.** La plantilla ad-hoc (atada a una bitácora) ofrece **los
   CAMPOS de esa bitácora como comodines** en asunto/cuerpo, además de las comunes y `{{entry.summary}}`. Las **keys son
   ESTABLES**; los **valores salen de la versión CONGELADA de la entrada**; un campo ausente en esa versión ⇒ vacío
   (degradación elegante). El editor ofrece los campos de la versión **publicada** (o unión de versiones — fork). Reusa
   la meta de campo de la versión y el formateo regional (`lib/format`).

5. **DEFAULTS A NIVEL DE SISTEMA (`SystemSettings`).** Cuando una transición no configura nada: ¿notifica?, qué
   plantilla (genérica), destinatarios por defecto. Configurable en `/configuracion` (junto a la config de correo).

6. **CANAL IN-APP (LA CAMPANITA).** Nuevo canal **INAPP** además de EMAIL: cada aviso también genera una notificación
   **in-app por destinatario** (estado leído/no leído). En el **Topbar**, la **campanita** muestra el **contador de no
   leídas**, un **dropdown** con la lista (leíble, con link a la entidad) y **marcar como leídas**. "Suena/aparece":
   **poll** (`react-query refetchInterval`) o **SSE** (fork). Reusa `NotificationChannel` + `NotificationOutbox.channel`;
   **fork:** extender `NotificationOutbox` con `readAt` para INAPP vs **tabla `NotificationInbox`** dedicada. Las
   preferencias por canal ya existen (`NotificationPreference.channel`).

== FORKS A RESOLVER CONMIGO (recomendación + espera mi OK en cada uno) ==
(a) Destinatarios: `DistributionList` reusable vs config embebida en la transición. (b) Almacenamiento in-app: extender
`NotificationOutbox` (readAt) vs tabla propia. (c) Real-time de la campanita: poll vs SSE. (d) Variables de campo: qué
versión ofrece el editor (publicada vs unión de versiones); correos externos ¿en el MVP? (e) Defaults de sistema:
alcance. (f) ¿`entry.transition` pasa a ser 100% config-de-transición o coexiste con el comportamiento actual (roles del
estado destino)? (g) **FASES** (recomiendo: **Fase A** = disparo por transición + plantillas por bitácora + variables de
campo + defaults de sistema [solo email]; **Fase B** = canal in-app + campanita). Que cada fase cierre sola.

== PERMISOS / GOBERNANZA ==
La config de notificación de una transición usa `workflow:manage` (es parte del flujo). Administrar listas de
distribución = ¿permiso nuevo `notification:distribution`? Ver/leer **mis notificaciones in-app** = **ownership** (sin
permiso, patrón SavedView). Migración aditiva. Auditoría de la config y de cada envío (ya existe `notification.email.sent`;
añadir el equivalente in-app si aplica).

== ESTÁNDAR PREMIUM (obligatorio) ==
Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); formato regional vía
`apps/watchlog-web/src/lib/format.ts`; **filtros en UNA línea + paginación arriba/abajo en toda grilla** (memoria
`ui-grid-conventions`; usa `GridPager` de `@lyra/ui`). Componentes reutilizables en `packages/ui`. Render seguro sin
`eval` (igual que el motor de reglas). El render `renderTemplate`/`sampleContextForEvent` vive en `@lyra/contracts`
(isomorfo) — reusa para la vista previa.

== VERIFICACIÓN Y CIERRE ==
Verifica en verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` + **smokes en vivo** (Python, patrón
`scripts/smoke-*.py`; login → Bearer; correo por la API de **MAILPIT** `:8025`; in-app por su endpoint; crea y LIMPIA
por ID vía `docker exec lyra-watchlog-dev-postgres-1 psql -U watchlog -d watchlog`). Mantén VIVOS `docs/` (PROGRESS,
BACKLOG, ROADMAP, DECISIONS, DATA_MODEL, SECURITY, USER_GUIDE; FORM_GUIDE si tocas objetos del formulario). **Publica al
cerrar** (rama `feat/...` → merge a `main` → push) y deja BACKLOG §1 sin pendientes.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, **MAILPIT** SMTP `:1025`
/ UI+API `:8025`. API `:3000` (prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm dev`. Si el dev se
cae, relánzalo (`pnpm dev` o `pnpm --filter @lyra/watchlog-api dev`) y espera login 200; mata SOLO los PIDs de `:3000`/
`:5173` por PID (NO `Get-Process node | Stop-Process` masivo). **`@nestjs/schedule` YA instalado** (cron del worker).
**PERMISO NUEVO** → `pnpm --filter @lyra/watchlog-api db:seed` Y `docker exec lyra-watchlog-dev-redis-1 redis-cli
FLUSHALL` o el admin demo da 403. **EPERM de prisma en Windows** → mata el node del API `:3000` antes de migrar/regenerar;
aplica con `prisma migrate diff` + `db:deploy` (NO `migrate dev` que pide RESET por drift — hay datos demo) y **QUITA del
diff cualquier `DROP INDEX "LogEntry_currentStateSince_idx"` AJENO** (drift persistente de otra rama). `@lyra/ui` se
consume desde **source**; `@lyra/contracts` desde **dist** (reconstruye `pnpm --filter @lyra/contracts build` si tocas su
API). PowerShell 5.1: NO `2>&1` con exes nativos; commits largos vía `git commit -F archivo` o heredoc.

== ÚTIL ==
`POST /api/notifications/run` (gate `notification:admin`) corre el worker YA (no esperar el cron) y devuelve
`{swept,dispatched,sent}`. **OJO smoke flaky:** el `@Cron` de fondo puede despachar el evento recién insertado antes de
tus aserciones; re-corre si falla. Admin demo: `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos, scope null);
no-admin para gates 403: `operador@watchlog.local`.
