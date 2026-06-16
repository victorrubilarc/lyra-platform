# Prompt — Fase 4.1.2: Acción "abrir incidencia/excepción" del motor de reglas (diferida vía outbox)

> Pégalo como mensaje inicial de una **sesión nueva**. Cierra la Fase 4.1. El **4.1.0 (backend de excepciones)** y el **4.1.1 (UI:
> panel + bandeja + triage)** ya están construidos, probados y **publicados en `main`**. Esta sesión es **mayormente BACKEND**
> (motor de reglas + outbox + worker) con un **toque pequeño de UI** en el editor de reglas del builder. NO programes hasta que
> apruebe el plan.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada:
lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG, USER_GUIDE,
FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **incidents-module**, **rules-engine**, **notifications-engine**,
**new-permission-dev-gotcha**, **stack-decisions**, **product-name**). No des nada por sentado: verifica en el código y en git
(árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

**Recordatorio permanente:** queda PENDIENTE el épico de **notificaciones avanzadas** (`docs/prompts/notificaciones-avanzadas.md`,
memoria `notif-advanced-requirement`); el dueño pidió que se lo recuerdes seguido.

== DÓNDE ESTAMOS ==
**Fase 4.1 — Excepciones operacionales** cerrada en sus dos primeros cortes:
- **4.1.0 BACKEND ✅** (`feat/incidencias-excepciones`): capa Bitácora→Excepción→Incidencia. `LogEntryException` (triggerKind
  THRESHOLD_WARN|THRESHOLD_CRIT|**RULE**|MANUAL; thresholdType warning|critical|**invalid**) + `IncidentExceptionLink`.
  `ExceptionGeneratorService` materializa **solo umbrales** hoy (CRIT siempre / WARN opt-in `warnRaisesException`), reconciliado en
  `saveSection`/sellar. **Faltan dos caminos del enum, reservados para ESTA fase:** `triggerKind=RULE` (reglas de negocio) y
  `thresholdType=invalid`.
- **4.1.1 UI ✅** (`feat/incidencias-excepciones-ui`): panel inline en llenado/visor + bandeja global `/excepciones` +
  `ExceptionDetailDrawer` (triage) + `ConvertExceptionModal`/dedup + trazabilidad (filtro `incidentId`) + toggle `warnRaisesException`
  en el builder. Contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39.

**Lo que YA puedes reusar (no reinventar):**
- **Motor de reglas** (`@lyra/contracts/rules`): `crossRuleSchema`/`CrossRule` (`{key,name,when,severity:ERROR|WARN,message,enabled}`),
  `evaluateCrossRules(rules,fields,values)` → `{errors[],warnings[]}` con `CrossRuleHit`, `validateRulesDesign`, AST seguro SIN eval.
  Las reglas viven CONGELADAS en `TemplateVersion.rules`. Hoy las reglas ERROR **bloquean completar** y las WARN avisan; ninguna
  abre incidencia/excepción.
- **Outbox transaccional del Bloque N** (`apps/watchlog-api/src/notifications/`): `NotificationEmitterService.emit({client,…})`
  (etapa 1, @Global, Prisma-only, emite DENTRO de la tx — patrón ya usado en `executeTransition`), worker `@nestjs/schedule`
  (sweeper/dispatcher/sender) + `POST /notifications/run` para ops/smoke. `NotificationEvent` tiene `dedupeKey` único.
- **Excepciones/Incidencias**: `ExceptionGeneratorService`, `ExceptionsService.convert/createManual`, `IncidentsService.create`,
  catálogos de tipo/categoría, ABAC por nodo, auditoría.

== OBJETIVO DE ESTA SESIÓN ==
**FASE 4.1.2 — ACCIÓN DEL MOTOR DE REGLAS (segundo corte del motor), DIFERIDA VÍA OUTBOX.** Que una **regla de negocio cruzada**
pueda, al dispararse, **materializar una excepción** (`triggerKind=RULE`) o **abrir una incidencia directamente** —de forma
**asíncrona** (no en el camino crítico del guardado/sellado), reusando el **outbox in-tx** del Bloque N. **ES MAYORMENTE BACKEND.
NO programes hasta que apruebe el plan.** Primero **(1) propón el diseño + forks**, con mi OK **(2) construye**. Cierra la fase sola.

== ALCANCE PROPUESTO (revísalo y propón el tuyo) ==
1. **`action` en `CrossRule`** (congelada en la versión, aditiva): qué hace la regla al dispararse — p. ej.
   `none` (comportamiento actual) · `raiseException` (crea `LogEntryException` triggerKind=RULE, thresholdType derivado de
   `severity`/config) · `openIncident` (regla `auto-incident`: abre incidencia directa con tipo/categoría/severidad por defecto).
   Decide la forma exacta del DTO (un enum `action` + sub-config, vs flags) y su validación en `validateRulesDesign`.
2. **Emisión IN-TX al SELLAR** (no en cada `saveSection` provisional, para no spamear): en `submit`/`executeTransition`, tras
   confirmar el sello, evalúa `evaluateCrossRules` con la foto final y, por cada regla con `action≠none` que disparó, **emite un
   evento al outbox DENTRO de la misma tx** (`emit({client})`), con `dedupeKey` estable `rule:{entryId}:{ruleKey}` (una vez por
   entrada/regla; reconciliación si re-sella).
3. **Worker que consume el evento** (etapa 2, reusa el patrón sweeper/dispatcher del Bloque N): crea la **excepción** (RULE) o la
   **incidencia** (auto-incident) con **ABAC + auditoría**, liga a la entrada/sección/campo y a la incidencia si aplica;
   idempotente (no duplica si ya existe por `dedupeKey`). `POST /notifications/run` (o un runner hermano) para dispararlo en smoke.
4. **(Opcional, evaluar)** **`thresholdType=invalid`**: el 4.1.0 lo dejó sin materializar (tier 1 = validación dura que bloquea
   guardar). Decide si esta fase lo cubre vía una regla "invalid" o si sigue diferido.
5. **UI mínima en el builder** (`RulesEditor`): selector de **acción** por regla (Ninguna / Generar excepción / Abrir incidencia) +
   ayuda; si es "abrir incidencia", los campos por defecto (tipo/categoría/severidad). Actualiza `FORM_GUIDE.md` (transversal del
   motor de reglas) y, si hay UX de cara al usuario, `USER_GUIDE.md`.
6. **i18n es-CL**, smoke en vivo dedicado (`scripts/smoke-reglas-incidencias.py` o similar): regla con `raiseException` →
   al sellar aparece la excepción RULE en la bandeja; regla `auto-incident` → abre incidencia con originType=RULE; idempotencia al
   re-sellar; ABAC; gates.

**Forks a resolver (cada uno: A/B · pros/contras · recomendación · impacto):**
1. **¿`action` como enum nuevo en `CrossRule` (`none|raiseException|openIncident`) + sub-config, o una entidad de acción aparte?**
   (recomienda lo aditivo y simple, congelado en la versión, sin entidad nueva).
2. **¿La acción se evalúa SOLO al sellar (firme) o también en provisional?** (recomiendo solo al sellar: evita la tormenta y respeta
   que la excepción de regla es un hecho del registro firme; el WARN de umbral ya cubre el feedback en vivo).
3. **¿La creación la hace el WORKER (asíncrona, reusa outbox) o síncrona como los umbrales?** El prompt pide **diferida vía outbox**
   (corrección #4 del Bloque N: no perder el evento ante crash post-commit). Confírmalo o argumenta síncrono.
4. **¿`openIncident` crea la incidencia directa, o crea una excepción CONVERTED ligada a una incidencia nueva** (para que toda
   incidencia automática tenga su excepción de origen y traza uniforme)? (recomienda lo segundo: una sola ruta de proveniencia).
5. **¿`thresholdType=invalid` entra ahora o sigue diferido?**

== ESTÁNDAR (obligatorio) ==
Server-authoritative (mismo evaluador puro back↔front, sin eval). Congelar la acción en la versión inmutable (patrón LogEntry/
reglas). ABAC por nodo + auditoría inmutable en toda creación. Idempotencia por `dedupeKey`. Tests para lo crítico (evaluación de
acción, emisión in-tx, worker, idempotencia). UI del builder con identidad Lyra (tokens, Sora/Inter, Lucide, claro+oscuro, 44px).
**No** reinventes el outbox ni el generador de excepciones: extiéndelos.

== VERIFICACIÓN Y CIERRE ==
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde + **smoke en vivo** dedicado (y re-correr `smoke-excepciones.py`
39/39 sin regresión). Mantén VIVOS `docs/` (PROGRESS, BACKLOG, DECISIONS, ROADMAP si aplica, **FORM_GUIDE** por la acción del motor,
**USER_GUIDE** si hay cara al usuario) y la memoria (**incidents-module**, **rules-engine**). **Publica al cerrar**
(rama `feat/incidencias-reglas-accion` → merge a `main` → push) y deja BACKLOG §1 sin pendientes. Marca **4.1.2** hecho en BACKLOG §2.
Con 4.1.2 cerrada, **la Fase 4.1 queda completa** → el siguiente hito es **4.2 (Investigación + CAPA)**.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API `:3000`
(prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm --filter @lyra/watchlog-web dev`. **Si agregas permiso nuevo:**
`db:seed` + `redis FLUSHALL` o el admin demo da 403 (memoria `new-permission-dev-gotcha`). `@lyra/ui` desde **source**;
`@lyra/contracts` desde **dist** (reconstruye contracts si tocas su API: `pnpm --filter @lyra/contracts build`). PowerShell 5.1: NO
`2>&1` con exes nativos; commits largos vía heredoc/`git commit -F`; al escribir SQL/archivos para psql/migraciones **no uses
`Out-File -Encoding utf8`** (mete BOM y rompe) — usa la herramienta Write. **Toda migración aditiva y versionada** (si tocas
`TemplateVersion.rules` es JSONB, probablemente sin migración; si agregas columnas/enums, migración aditiva idempotente, ojo con el
BOM que rompió el primer deploy del 4.1.0). Admin demo: `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos, scope null);
no-admin para gates 403: `operador@watchlog.local`.

== INSTRUCCIÓN FINAL ==
No programes todavía. Primero entrega: (1) diseño (forma de `action`, emisión in-tx al sellar, worker, idempotencia/dedup, ABAC,
trazabilidad excepción/incidencia), (2) forks con recomendación, (3) plan por pasos dentro de 4.1.2, (4) riesgos y preguntas.
Espera mi aprobación antes de escribir código.
