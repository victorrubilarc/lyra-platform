# Prompt — Fase 4.1: Excepciones operacionales desde bitácoras

> Pégalo como mensaje inicial de una **sesión nueva**. Continúa la Fase 4 (Incidencias). La Fase 4.0 (núcleo) ya está
> construida y publicada; esta fase introduce la capa **Bitácora → Excepción → Incidencia** y la apertura automática
> diferida desde el motor de reglas. NO programes hasta que apruebe el plan.

---

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de
nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, ROADMAP, BACKLOG,
USER_GUIDE, FORM_GUIDE). Revisa tu memoria persistente (MEMORY.md; en especial **incidents-module**, **rules-engine**,
**notifications-engine**, **notif-advanced-requirement**, **stack-decisions**, **product-name**, **ui-grid-conventions**,
**new-permission-dev-gotcha**, **regional-formatting**, **prototype-location**). No des nada por sentado: verifica en el
código y en git (árbol limpio salvo `.claude/settings.json`; `git rev-list --count origin/main..main` = 0).

**Recordatorio permanente:** queda PENDIENTE el épico de **notificaciones avanzadas** (`docs/prompts/notificaciones-avanzadas.md`,
memoria `notif-advanced-requirement`); el dueño pidió que se lo recuerdes seguido. Esta fase lo roza (las incidencias creadas
desde excepciones podrían notificar), pero el épico en sí sigue para después.

== DÓNDE ESTAMOS ==
**Fase 4.0 — Núcleo de Incidencias ✅** (`feat/incidencias-nucleo`, memoria `incidents-module`): `Incident` + catálogos
configurables (`IncidentType`/`IncidentCategory`) + ciclo de vida que **reusa `WorkflowDefinition`** + lista/kanban/detalle +
ABAC por nodo + auditoría + **creación manual y desde una entrada de bitácora** (link manual `originType=LOG_ENTRY`) + timeline
append-only + 9 permisos (cat. 77). El origen `EXCEPTION` y `RULE` ya están en el enum `IncidentOrigin` pero **todavía no se
usan**: esta fase los activa.

== OBJETIVO DE ESTA SESIÓN ==
**FASE 4.1 — EXCEPCIONES OPERACIONALES DESDE BITÁCORAS.** Convertir el motor de formularios y umbrales en un **generador
inteligente de excepciones**, e introducir la capa explícita **Bitácora → Excepción → Incidencia** (decisión central del diseño
aprobado, DECISIONS 2026-06-16). Una anomalía de bitácora **NO** es automáticamente una incidencia: hay un paso de **triage**
entre el dato y la incidencia.

**ES UNA FASE GRANDE: NO programes hasta que yo apruebe el plan.** Primero **(1) propón el diseño y los forks**, con mi OK
**(2) construye**. Cierra la fase sola (un objetivo por sesión, regla de CLAUDE.md).

== PRINCIPIO (recordatorio del diseño aprobado) ==
Cuatro tiers, mapeados a lo que YA existe (no reinventar):
1. **Validación de dato** (valor imposible/formato/inconsistencia) → ya la maneja `validateFieldValue` + reglas ERROR (bloquea guardar).
2. **Excepción operacional** (valor posible pero fuera de umbral / condición a revisar) → HOY es efímera (`thresholdBand` WARN/CRIT
   en la grilla, reglas WARN); **esta fase la MATERIALIZA** como `LogEntryException` con estado y decisión de triage.
3. **Incidencia** → ya existe (`Incident`, 4.0).
4. **Incidente mayor** → 4.3/4.4.

La excepción **NO** siempre crea incidencia. La maquinaria de umbrales/reglas es la fuente; la excepción es su materialización con
TRIAGE. Reusa `thresholdBand`/`effectiveNumberBands`/`thresholdBandFor` y el motor de reglas (`@lyra/contracts/rules`), no un
segundo motor paralelo.

== 1. DISEÑO A PROPONER (con forks; espera mi OK; decisiones a DECISIONS.md) ==

**a) Modelo `LogEntryException`** (campos del plan en DATA_MODEL §Incidencias «Diferido 4.1»; **SIN `tenantId`** — single-tenant):
contexto CONGELADO en el momento de la detección (plantilla, versión, sección+label, campo+label, tipo, **valor original**,
unidad, umbrales seguro/warning/crítico, regla que gatilló, operador, turno, nodo, equipo, fecha) + `thresholdType`
(warning|critical|invalid) + `status` (open|acknowledged|dismissed|converted|corrected) + corrección con trazabilidad
(`correctedValue`/`correctionReason`/quién/cuándo, **preservando el original**) + `incidentId?`. **`IncidentExceptionLink`**
(N:1: una incidencia agrupa varias excepciones). Migración ADITIVA (sin reset; quita del diff cualquier `DROP INDEX` ajeno).

**b) Detección / generación de excepciones.** ¿Cuándo y dónde se materializa una excepción? Opciones a evaluar:
   - **al guardar/completar una sección** (síncrono, donde ya se computa `thresholdBand` y se evalúan reglas WARN), y/o
   - **al sellar la entrada** (congelado definitivo). Fuentes: umbral warning/crítico (numérico, incl. celdas de tabla/matriz),
     valor inválido, booleano "condición insegura", opción catalogada como riesgosa, regla WARN del motor, firma/relevo incompleto,
     registro manual del operador. **Fork:** ¿materializar SIEMPRE toda banda WARN/CRIT (puede ser ruidoso) vs solo CRIT + WARN
     marcadas por la plantilla como "generan excepción"? (recomiendo lo segundo: gobernanza por plantilla/campo, evita tormenta).
   - **Idempotencia:** no duplicar la excepción de un mismo (entrada, campo, ocurrencia) al re-guardar.

**c) Panel de excepciones en la bitácora (UX).** En el llenado/visor, panel claro de revisión: "N críticas · N advertencias · N
   posibles inválidos" con acciones: **corregir dato · justificar · crear incidencia · asociar a incidencia existente · agrupar ·
   descartar con motivo · enviar a revisión · marcar revisada sin acción**. Al completar una sección con valores críticos, **decisión
   explícita** ("Esta sección contiene valores críticos. ¿Qué deseas hacer?"). Si el valor parece IMPOSIBLE (muy fuera del rango
   físico) → **priorizar corrección** antes que incidencia. Reusa el patrón de modal/drawer y tokens del 4.0.

**d) Deduplicación (sugerencia, no merge automático).** Al convertir una excepción en incidencia, si existe una incidencia ABIERTA
   relacionada por `(nodo, equipo, tipo, ventana temporal)` → sugerir asociar en vez de crear nueva ("Ya existe INC-xxxx para este
   equipo. ¿Asociar / Crear nueva / Descartar / Revisar?"). Permitir que una incidencia **agrupe varias excepciones**.

**e) Acción "abrir incidencia" del motor de reglas (2.º corte del motor, DIFERIDO/event-driven).** El fork ya está decidido:
   **evento DIFERIDO**, NO síncrono — **reusa el transactional outbox del Bloque N** (emitir un evento mínimo DENTRO de la tx del
   guardado/sello; un worker resuelve y crea la incidencia/excepción). No bloquea el guardado ni crea incidencias para borradores
   que luego se anulan (VOID). Guarda `ruleId` + versión de regla + payload evaluado + motivo. Define la forma de la acción en el
   editor de reglas (qué tipo/severidad de incidencia abrir, o solo excepción). **Fork:** ¿el worker crea directamente la incidencia,
   o crea una EXCEPCIÓN pendiente de triage que un humano confirma? (recomiendo: excepción pendiente salvo regla marcada "auto-incidencia").

**f) Trazabilidad campo → excepción → incidencia.** En el detalle de la incidencia (bloque "Origen" del 4.0), enlazar a las
   excepciones que la originaron y de ahí a la entrada/sección/campo. En la grilla de bitácoras, marca de "tiene excepciones".

**g) Permisos / ABAC.** Permisos nuevos (¿`exception:view`, `exception:triage`, `exception:dismiss`, `exception:dismiss-critical`,
   `exception:correct`?) — propónlos y justifícalos; el descarte de una excepción CRÍTICA puede exigir permiso superior. ABAC por
   nodo en todo. Auditoría inmutable de correcciones/descartes/conversiones. Tras tocar el catálogo: `db:seed` + Redis FLUSHALL
   (memoria `new-permission-dev-gotcha`).

**Forks a resolver explícitamente (cada uno: A/B · pros/contras · recomendación · impacto técnico/UX · fase):**
1. Materializar toda banda WARN/CRIT vs solo lo gobernado por plantilla/campo.
2. Generar al guardar sección vs al sellar la entrada (o ambos).
3. Acción de regla: crea incidencia directa vs excepción pendiente de triage.
4. Corrección de valor: ¿se permite editar el valor sellado creando una excepción `corrected` con el original preservado, o solo
   en borrador? (GxP: el original NUNCA se pierde).
5. Dedup: ventana temporal y criterios exactos (configurable vs fijo).
6. Dónde vive la gobernanza "este campo/umbral genera excepción": en la definición de plantilla (config del campo) vs global.

== 2. PLAN POR FASES (dentro de 4.1; propón el orden) ==
Sugerencia de partida: (1) modelo `LogEntryException` + `IncidentExceptionLink` + generación + endpoints de triage + ABAC/
auditoría + smoke backend; (2) panel de excepciones en la bitácora + acciones (convertir/asociar/agrupar/descartar/corregir) +
dedup + trazabilidad en la UI; (3) acción "abrir incidencia" del motor de reglas vía evento diferido (outbox) + su smoke. Si es
mucho para una sesión, corta por aquí y deja (3) como 4.1.1.

== ESTÁNDAR PREMIUM (obligatorio) ==
Identidad Lyra (tokens, Sora/Inter, Lucide, glow no sombras, claro+oscuro, 44px táctil); navegabilidad y UX excelentes; filtros
en una línea + paginación arriba/abajo (`GridPager`, memoria `ui-grid-conventions`); formato regional vía `lib/format`; componentes
reutilizables en `packages/ui`; **reusa**: el módulo de Incidencias 4.0 (`features/incidents/`, `IncidentsService`), `thresholdBand`/
motor de reglas, el outbox del Bloque N, `WorkflowDefinition`, MinIO si hay evidencia, ABAC/auditoría, la grilla premium de
`/bitacoras`. Mira el `prototipo.tsx` de la raíz si dibuja la revisión de excepciones / "fuera de rango → incidencia".

== VERIFICACIÓN Y CIERRE ==
Verifica en verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` + **smoke en vivo** (Python, patrón
`scripts/smoke-*.py`; login → Bearer; crea y LIMPIA por ID vía `docker exec lyra-watchlog-dev-postgres-1 psql -U watchlog -d
watchlog`). Mantén VIVOS `docs/` (PROGRESS, BACKLOG, ROADMAP, DECISIONS, DATA_MODEL, SECURITY, USER_GUIDE; FORM_GUIDE si tocas la
gobernanza del campo/umbral) y la memoria (`incidents-module`). **Publica al cerrar** (rama `feat/incidencias-excepciones` →
merge a `main` → push) y deja BACKLOG §1 sin pendientes.

== ENTORNO Y GOTCHAS ==
Docker dev arriba (`lyra-watchlog-dev-*`): postgres `:5432`, redis `:6379`, minio `:9000/:9001`, Mailpit `:1025/:8025`. API
`:3000` (prefijo `/api`; login `POST /api/auth/login`), Web `:5173` con `pnpm dev`. **PERMISO NUEVO** → `db:seed` + `redis FLUSHALL`
o el admin demo da 403. **EPERM prisma Windows** → mata el node del API `:3000` (PID que escucha :3000) antes de migrar/regenerar;
aplica con `migrate diff` (`--from-schema-datasource` → `--to-schema-datamodel`) + `db:deploy` (NO `migrate dev`) y **QUITA del diff
cualquier `DROP INDEX "LogEntry_currentStateSince_idx"` AJENO**. `@lyra/ui` desde **source**; `@lyra/contracts` desde **dist**
(reconstruye contracts si tocas su API). `dotenv` del script = usa `pnpm exec dotenv -e ../../.env -- prisma …`. PowerShell 5.1: NO
`2>&1` con exes nativos; commits largos vía `git commit -F archivo` o heredoc. Admin demo: `demo@watchlog.local` / `Demo!Pass2026`
(todos los permisos, scope null); no-admin para gates 403: `operador@watchlog.local`.

== INSTRUCCIÓN FINAL ==
No programes todavía. Primero entrega: (1) diseño propuesto del modelo y la generación de excepciones, (2) forks con recomendación,
(3) UX del panel de excepciones, (4) plan por fases dentro de 4.1, (5) riesgos y preguntas. Espera mi aprobación antes de escribir
código.
