# Progreso — Lyra WatchLog

**2026-07-06 — 🔐 Licenciamiento L6 · UI de estado + avisos de licencia ✅** (`feat/licenciamiento-l6`). El estado de
la licencia por fin es **VISIBLE y ACCIONABLE** para quien opera la planta — hasta hoy solo vivía en logs/auditoría
y en el DTO. **(1) Banner global** en el shell (`LicenseBanner` bajo el Topbar) alimentado por `useLicenseStatus`;
mapeo estado→presentación = función PURA `licenseBannerFor` (6 tests): VALIDA sin banner · POR_VENCER/
LIMITE_EXCEDIDO solo admins (`settings:manage`, filtro de UI) descartables por sesión · EN_GRACIA todos, prominente
("renovar en **X días**" con el campo NUEVO `graceDaysRemaining`, única adición al DTO delgado — decisión explícita
L6a, sin huella/linaje) · SOLO_LECTURA/BLOQUEADA/PENDIENTE_ACTIVACION todos y PERSISTENTES; `LINEAGE_MISMATCH` con
texto humano propio. i18n `license.*` + tokens DS. **(2) Pestaña Licencia en /configuracion** (solo lectura: estado+
motivo humanizado, edición, módulos en chips, vencimiento+días, instrucciones de renovación del runbook §4; gate
`module:settings:view` — SIN permiso nuevo, decisión L6b; deep link `?tab=license` desde banner y campanita).
**(3) Avisos por el Bloque N (cierra el pendiente L1(iii)):** 3 eventos granulares — `license.state.changed` (tx:
transición EN CALIENTE en `LicenseService.refresh`; el arranque NO emite para no spamear cada reinicio) ·
`license.expiring` (derived: POR_VENCER semanal por semana ISO / EN_GRACIA diario) · `license.restricted` (derived
diario) — detección en el dominio (`findLicenseNotices`, espejo de IncidentSlaService) + 3 plantillas seed;
destinatarios = usuarios con rol que concede `settings:manage` (configurable, sin roles en duro) ∪ suscripciones,
SIN ABAC de nodo; EMAIL+INAPP con preferencias. **CARVE-OUT del worker** (hallazgo de la sesión): en estados
restringidos las 3 etapas procesan SOLO eventos `license.*` — sin esto la licencia restringida silenciaba su propia
alarma (probado EN VIVO: smoke C4). **El payload del evento congela el estado presentable** (multi-instancia con BD
compartida: el dispatcher de otra instancia no puede resolver desde SU snapshot); bandeja/contexto sin
licenseId/customer/huella/linaje (deep link = `LicenseInstallation/"system"`). **(4) Gate latente `whiteLabel`**
(decisión L6d: `isWhiteLabelEnabled()`, sin efecto visible; épico §2(2) lo cablea). **(5)**
`gen-dev-license --expires-in-days=N` (N<0 = vencida hace |N| días) para probar el banner. **SIN migración ni
permiso nuevo** (solo `db:seed`). **Verde:** typecheck/lint/build/test (contracts **518** = +5 · API **296** = +4 ·
web **17** = +6) + **smoke-licencia-avisos.py 25/25 NUEVO** (:3404 — DTO por estado, aviso al admin y NO a un
usuario sin criterio, dedupe semanal, carve-out vía cron real, VALIDA en silencio) + regresión licencia
**28/28 · 23/23 · 20/20 · 29/29** + notificaciones **18/18 · 22/22 · 18/18** — el 18/18 exigió un **fix de DERIVA DE
DATOS preexistente** en el arnés (el demo acumula 400+ rondas vencidas y el lote del sweeper es 200: la ocurrencia
del smoke ahora se inserta como la MÁS antigua; deuda de reseed sigue en BACKLOG §3). **No probado:** smoke VISUAL
del banner/pestaña (lo hace el dueño — dev queda con licencia POR_VENCER y restauración = `pnpm license:dev` +
reiniciar api); re-aviso multi-día real (la cadencia se afirma por dedupeKey). Decisiones a–f en DECISIONS
2026-07-06. **PRUEBA DE FUEGO L4 EJECUTADA (misma sesión) ✅ — primera renovación real del producto:** `v0.1.14`
(release+deploy automático) → EC2 VALIDA con pública PROD + `renovacion.lreq` auto-escrita → `renew` DENEGADO por el
emisor (¡control correcto!: el ledger L3 tenía un installationId armado a mano pre-L1; la identidad real nació en
v0.1.13) → re-emisión auditable con `--license-id` contra la identidad real (import = CURRENT sin rotar) → **`renew`
counter 0→1** (herencia, vence 2027-07-06) → import en producción: **linaje ROTADO** (log «counter 0 → 1; la
respuesta ya no es importable en otra instalación»), solicitud nueva con counter=1 + nonce fresco, VALIDA 364 días.
Respaldos conservados; passphrase por archivo efímero borrado tras firmar; lección operacional en PROCEDURE §2
(emitir SIEMPRE contra la solicitud generada por la app). **Siguiente: L5 anti-tamper** (con imagen vendible
desplegada y renovación probada, el eslabón débil es el JS legible de la imagen).

**2026-07-05 — 🔐 Licenciamiento L4 · challenge-response de RENOVACIÓN + linaje rotatorio (detección de clon) ✅**
(`feat/licenciamiento-l4`). La capa 4 de la defensa (STRATEGY §4, patrón CodeMeter, **PoC T6 ahora EN VIVO**): la
licencia se **renueva por archivos** (air-gap intacto) y el **clon de la instalación queda DETECTADO al renovar**.
**(1) Solicitud (producto):** `LicenseService` deja/refresca **`renovacion.lreq`** junto a `license.lic` SIEMPRE que
haya payload verificado (decisión a — upgrade a mitad de ciclo usa la misma ceremonia): `type:"renewal"` +
`licenseId` + linaje local (`renewalCounter` + `nonce` de `LicenseInstallation`; **nonce inicializado perezoso y
JAMÁS viaja** salvo en la solicitud — ni al front [L2c] ni a la auditoría); idempotente entre re-evaluaciones.
**(2) Emisión:** comando dedicado **`lyra-license renew --request renovacion.lreq --expires <ISO>`** (decisión b):
exige el ledger íntegro, **valida el linaje contra él** — renovación previa con el MISMO counter presentado ⇒
**CLON DETECTADO, DENIEGA** (decisión c; cita la entrada del ledger como evidencia; override humano
`--force-duplicate` queda MARCADO en la entrada), counter desfasado / licenseId ajeno también deniegan, huella
distinta exige `--accept-new-fingerprint` (migración legítima auditada); **hereda los términos comerciales de la
última emisión** (mismo licenseId — renovar = misma licencia con nuevo vencimiento; flags = upgrade); emite
`counter=presentado+1` + `nonce=presentado` (el binding) reusando `issueLicense`/`signLicense` (cero criptografía
nueva). **(3) Runtime (importación única):** helper puro **ADITIVO `evaluateLineage` en L0** (decisión d;
congelados intactos) → `CURRENT` / `ROTATE` (primera importación: persiste counter + **nonce local FRESCO** +
`lastRenewalAt`, audita `license.renewed`; NO rota si la evaluación bloquea) / `MISMATCH` ⇒ **BLOQUEADA con reason
nuevo `LINEAGE_MISMATCH`** (solo lectura + exportación, jamás destructivo) — tras rotar, ni la licencia anterior ni
una respuesta re-importada calzan; el **worker** re-verifica firma desde disco Y contrasta linaje (verificación
distribuida, misma regla pura). **RETROCOMPAT DURA verificada:** counter=0 jamás renovada evalúa EXACTO como L3
(el EC2 demo con `lic_2026_demo_ec2_001` no se tocó y sigue VALIDA). **(4) Ciclo corto = política documentada**
(decisión e): 90 días vía canal / anual directo (PROCEDURE §4; la detección solo ocurre AL RENOVAR). **SIN
migración** (columnas de linaje declaradas en L1) **ni permiso nuevo. Desviación registrada** (challenge-dont-please):
el nonce NUEVO lo genera la instalación LOCALMENTE (PoC T6: "nunca sale de su máquina"), el payload lleva el
PRESENTADO — cero campos nuevos ⇒ sin bump de schemaVersion. **Verde:** typecheck/lint/build/test (licensing **50**
= +8 linaje real · CLI **38** = +16 · API **292** = +6 · contracts 513/web 11 intactos) + **smoke-licencia-renovacion.py
29/29 NUEVO** (:3403, T6 en vivo: activación→renew con herencia→rotación → re-import viejo BLOQUEADA con lectura
viva y DTO sin fugas → **clon acusado por el emisor** → force-duplicate marcado → ledger íntegro; snapshot/restore
del linaje dev) + regresión **28/28 · 23/23 · 20/20**. **No probado:** renovación contra el EC2 demo en vivo
(decisión f: v0.1.13 es pre-L4 — **prueba de fuego = renovar `lic_2026_demo_ec2_001` con el primer tag v0.1.14**,
BACKLOG §2(1)); prompt interactivo de passphrase (flujos automatizados usan env). Decisiones a–f en DECISIONS
2026-07-05 (L4). **Siguiente: Licenciamiento L6 (UI de estado/avisos) — propuesto antes que L5/L2b: el banner
POR_VENCER es lo que hace OPERABLE la renovación L4 por un admin de planta.**

**2026-07-05 — 🔐 Licenciamiento L3 · CLI de emisión + custodia de clave privada + pública PROD embebida ✅**
(`feat/licenciamiento-l3`). ITESICWS ya **emite licencias reales** y la imagen de release **queda vendible**.
**(1) `@lyra/licensing-cli`** (decisión a — `packages/licensing-cli`, privado, `pnpm license <cmd>`, JAMÁS en la
imagen del cliente): `keygen` (par Ed25519; privada **PKCS#8 CIFRADA** aes-256-cbc con **passphrase generada de alta
entropía** mostrada una vez → gestor del dueño; se niega a sobreescribir), `issue` (parsea `solicitud.lreq` →
node-lock real; valida edición/módulos contra `LICENSED_MODULE_KEYS`/fechas ISO/enteros; firma con `signLicense` de
L0 — cero re-implementación; **auto-verifica** round-trip + huella; registra en ledger), `inspect` (QA del emisor) y
`ledger` (JSONL **append-only con cadena de hashes** — adulterar/borrar una línea la rompe y el listado lo acusa;
resumen de banda por socio). Custodia en `LYRA_LICENSE_HOME` (def. `~/.lyra-license/`, decisión b); passphrase por
prompt sin eco/env/archivo, nunca por flag. **(2) Pública de PROD committeada + codegen** (decisión c, mejora sobre
la spec): `scripts/license/prod-keys/prod-public.pem` (la pública NO es secreto) + `embed-public-key.mjs` que
`release.yml` corre ANTES del docker build (valida Ed25519, rechaza privadas y la DEV) ⇒ **desde el primer tag `v*`
post-L3 la imagen SÍ es distribuible**; `pnpm build` local y ci.yml siguen con la DEV (todo verde sin clave de
PROD). **(3) Par PROD REAL generado** (privada cifrada en la custodia del dueño). **(4) `license:dev` = envoltorio
delgado** de `issueLicense` (una sola implementación DEV/PROD). **(5) EC2 demo LICENCIADO con el par PROD** (decisión
f ajustada con causa: el host corría v0.1.12 **pre-L1** y el compose sin mounts — una licencia DEV era inerte y
quedaría BLOQUEADA en el primer release): `git pull` del clon + huella real con la MISMA imagen del api
(`e271ce4b…`) + `solicitud.lreq` + `issue` con la privada PROD (1.ª emisión real del ledger:
`lic_2026_demo_ec2_001`) + `inspect`=VALIDA + `up -d api` con mounts (health 200 interno y público). La
**confirmación VALIDA en vivo queda amarrada al primer tag post-L3** (imagen actual no verifica; BACKLOG §2(1)).
**(6) Rotación multi-clave (`kid`) DIFERIDA** (decisión d — L0 congelado; el camino retrocompatible es probar N
públicas embebidas). **.gitignore endurecido** (`*.enc.pem`, `prod-private*`, `.lyra-license/`, `ledger.jsonl`).
**Verde:** typecheck/lint/build/test (CLI **22** nuevos · API 286 · contracts 513 · licensing 42 intactos) +
**smoke-licencia-emision.py 20/20** (ceremonia real: API sin licencia escribe solicitud → keygen → issue DEV →
VALIDA y opera → **keygen del atacante BLOQUEADO end-to-end** → inspect acepta/rechaza → ledger íntegro y
tamper-evident). **(7) Tag `v0.1.13` cortado EN LA MISMA SESIÓN** (a pedido del dueño): release en verde → deploy automático → el
EC2 arrancó **`estado=VALIDA · lic_2026_demo_ec2_001`** con la imagen que embebe la pública PROD ⇒ **cadena de
confianza probada END-TO-END en producción; `v0.1.13` = primera imagen VENDIBLE** (cierra también el pendiente
operacional de BACKLOG §2(1)). **No probado:** prompt interactivo de passphrase (los flujos automatizados usan
env). Decisiones a–f en DECISIONS 2026-07-05 (L3). **Siguiente: Licenciamiento L4 (challenge-response de
renovación + linaje rotatorio).**

**2026-07-05 — 🔐 Licenciamiento L2 · gating de módulos por entitlement en API + web ✅** (`feat/licenciamiento-l2`).
Se ACTIVARON los gates latentes de L1: un módulo fuera de `modules[]` de la licencia **no se puede operar ni aparece**,
respetando «nunca secuestrar datos». **(1) Catálogo canónico** (decisión a): `LICENSED_MODULE_KEYS` (13 claves) +
`licenseStatusSchema` en **`@lyra/contracts`** (`src/licensing/`) — el web lo necesita y `@lyra/licensing` es
server-only; el payload sigue libre (claves futuras no rompen). **(2) Gate backend** (decisión b):
`@RequireModule(<clave>)` a nivel de controlador (17 controladores etiquetados; mapeo en `LICENSING.md §5.1` —
workflows/calendarios = `core` por ser infra compartida) + **`ModuleEntitlementGuard`** global (5.º, tras el de estados):
módulo no licenciado ⇒ mutaciones `403 {code: MODULE_NOT_LICENSED, module}`, **GET/HEAD/OPTIONS pasan SIEMPRE**
(lectura/exportación intactas, aun con downgrade de edición); `core` jamás se gatea; **sin payload verificado el guard
NO opina** (precedencia del `LICENSE_RESTRICTED` de L1). Workers module-aware (`LicenseService.moduleOperational`):
notificaciones no genera/despacha/envía sin su módulo; acciones de regla no materializa excepciones (órdenes quedan
PENDING, nunca se descartan). **(3) DTO delgado + endpoint** (decisión c): `GET /api/license/status` autenticado SIN
permiso — `toLicenseStatus` mapea CAMPO A CAMPO desde el snapshot (jamás huella/linaje/installationId/licenseId/
customer; testeado); `modules: null` = sin payload. **(4) Gate frontend:** `NavRoute.module` en el REGISTRO +
`useLicenseStatus`/`useLicensedModules` (`auth/use-license.ts`) ⇒ **visible = módulo licenciado ∧ permiso** en sidebar,
Inicio (tiles con su `enabled` + accesos), ⌘K y campanita; mientras no llega el DTO no se oculta (el candado real es el
403). **(5) Extra:** `pnpm license:dev -- --modules=a,b` (licencias DEV acotadas). **SIN migración, SIN permiso nuevo,
SIN FLUSHALL** (decisión e); límites numéricos DIFERIDOS (decisión d, BACKLOG). **Verde:** typecheck/lint/build/test
(API **286** = 276+10 · web 11 = +3 · contracts 513 = +5 · licensing 42 intactos) + **smoke-licencia-modulos.py 23/23**
(acotada `[core,incidents,notifications]`: licenciado opera [gate pasa → 400 de validación], no licenciado 403 con
clave + GET 200 + export CSV viva, DTO exacto sin campos sensibles, 401 sin token, precedencia C3) + regresión
**smoke-licencia.py 28/28**. **No probado:** smoke VISUAL del sidebar ocultando módulos (requiere licencia acotada en
el dev server — el dueño puede generarla con `--modules` y recargar). USER_GUIDE § Licencia ampliada (módulo no
incluido). **Siguiente: Licenciamiento L3 (CLI de emisión + custodia de clave privada).**

**2026-07-05 — 🔐 Licenciamiento L1 · runtime de la licencia en la API ✅** (`feat/licenciamiento-l1`).
La API ahora **vive la licencia** consumiendo `@lyra/licensing` (L0 intacto, cero re-implementación de lógica pura).
**(1) `LicenseModule` global** (`src/licensing/`): `LicenseService` carga `LICENSE_FILE` (def. `.license/license.lic`;
contenedor `/app/license/license.lic`), verifica firma con **pública EMBEBIDA como constante** (`license-public-key.ts`,
jamás por env), deriva huella real, evalúa con actuals (nodos/usuarios ACTIVE) + `LICENSE_WARN_DAYS`, **cachea**
`LicenseSnapshot` y re-evalúa cada `LICENSE_RECHECK_MINUTES` (def. 6 h, interval vía SchedulerRegistry); expone
`getEvaluation()`/`isModuleLicensed()` (LATENTE para L2) y `workersOperational()`. **(2) Señales estables bajo Docker**
(decisión a): `MachineSignalsCollector` = machine-id del **HOST** (bind-mount ro en ambos compose) + cpuModel +
osPlatform; MACs/hostname EXCLUIDOS (inestables al recrear contenedor); Windows dev = MachineGuid. **(3) Identidad local**
(decisión b): tabla single-row **`LicenseInstallation`** (migr. `20260705041924`, patrón AiSettings) con linaje L4
declarado; sin licencia escribe **`solicitud.lreq`** solo (ceremonia runbook §2 real). **(4) Enforcement** (decisión c):
`LicenseEnforcementGuard` global (4.º, tras authz) — SOLO_LECTURA/BLOQUEADA/**PENDIENTE_ACTIVACION** (estado runtime,
no del enum L0) bloquean mutaciones con `403 code=LICENSE_RESTRICTED+licenseStatus`; GET/HEAD/OPTIONS SIEMPRE pasan
(export = GET); whitelist explícita testeada `/api/auth/` + `/api/health`; **2.º chequeo distribuido en el worker de
notificaciones** (re-verifica firma DESDE DISCO por tick; el acta PDF NO se toca — es exportación). **(5) Auditoría**:
`license.state.changed` (actor `system@license`, antes/después) + log nítido al arranque. **(6) Dev/CI** (decisión d):
par DEV **committeado** (`scripts/license/dev-keys/`) + `pnpm license:dev` (tools/gen-dev-license.ts, mismo recolector;
`--expired` para smokes); pública PROD = OTRA, nace en L3 con custodia (imagen actual NO vendible — BACKLOG).
**Desviación registrada:** `@lyra/licensing` ganó **build dist** (espejo contracts) — la API CJS no puede importar TS
fuente (el espejo source-only `@lyra/permissions` solo lo consume la web/Vite); mitigado por predev/CI/Dockerfile
(+ `packages/licensing/package.json` en stage deps del Dockerfile.api). **Verde:** typecheck/lint/build/test monorepo
(API **276** = 252+24 nuevos: service 11 con reloj falso / collector 6 / guard 7; licensing 42 intactos) +
**smoke-licencia.py 28/28** (4 arranques reales: VÁLIDA opera + adulteración EN CALIENTE pausa el worker ·
sin archivo = PENDIENTE_ACTIVACION + solicitud.lreq · adulterada = BLOQUEADA · vencida = SOLO_LECTURA con export CSV
vivo · auditoría por arranque vía SQL). **Fix colateral:** `_prisma_migrations` del dev tenía checksum drift (fila
duplicada + checksum viejo) que forzaba reset — corregido en la tabla de contabilidad, sin tocar esquema/datos.
**No probado:** compose de prod con los mounts nuevos (se probará en el próximo deploy; el EC2 demo necesitará su
licencia — ver BACKLOG). USER_GUIDE: sección "Licencia de la instalación" agregada. **Siguiente: Licenciamiento L2
(gating de módulos por entitlement en API/web).**

**2026-07-04 — 🔐 Licenciamiento L0 · núcleo `@lyra/licensing` ✅** (`feat/licenciamiento-l0`).
Primera sesión del plan L0–L6 del módulo de licenciamiento (BACKLOG §2(1), estrategia **Opción C** decidida el
2026-07-04). Se creó **`packages/licensing`** como librería **PURA** (sin NestJS/Prisma/infra/I-O; **cero dependencias**,
solo `node:crypto`; llaves, señales y `now` SIEMPRE por parámetro) = el PoC `docs/poc/licencia-poc.mjs` (9/9) endurecido,
tipado y testeado. **API pública** (aprobada por el dueño antes de codificar): `signLicense`/`verifyLicense` (JWS compacto
EdDSA, resultado tipado sin excepciones tragadas: `MALFORMED_JWS`/`UNSUPPORTED_ALG`/`INVALID_SIGNATURE`/`INVALID_PAYLOAD`),
`deriveFingerprint` (huella sha256 canónica de señales del host; el clon perfecto de VM se DETECTA en L4, no se previene —
documentado), `evaluateLicense` + helpers puros (`isExpired`/`isWithinGrace`/`isModuleLicensed`/`exceedsLimits`) con la
máquina de estados de LICENSING.md §5 (precedencia BLOQUEADA→SOLO_LECTURA→EN_GRACIA→LIMITE_EXCEDIDO→MODULO_NO_LICENCIADO→
POR_VENCER→VALIDA; **nunca destructivo**, tope = solo lectura), y tipos (`LicensePayload` con linaje `renewalCounter`/
`nonce` declarado para L4, `LicenseLimits`, `LicenseState`, `LicenseEvaluation`, `MachineSignals`…). **Decisiones**
(DECISIONS 2026-07-04 L0): paquete **source-only** espejo de `@lyra/permissions`; **tipos en licensing, NO en contracts**
(web nunca ve el payload completo; DTO delgado recién en L2/L6); 3 endurecimientos sobre el PoC (verify/evaluate separados
para verificación DISTRIBUIDA; `warnDays` parametrizable; `signatureAlg` FUERA del payload — alg fijado a EdDSA en el
verificador, RFC 8725). **Tests: 42/42** (vitest; paridad con los 9 casos del PoC T1–T6 + bordes: notBefore futuro,
límites excedidos, módulo no licenciado, JWS corrupto/truncado, payload no-JSON, llaves no-Ed25519, canonicidad de la
huella, precedencia). Verde: typecheck/lint/test del paquete + monorepo completo. **No probado:** integración con la API
(no existe aún — es L1); no se levantó Docker (lib pura). **USER_GUIDE no aplica** (L0 no es de cara al usuario).
Docs vivos actualizados: `LICENSING.md` (estado L0, payload sin `signatureAlg` + huella/linaje, §9). **Siguiente:
Licenciamiento L1 (LicenseService NestJS + máquina de estados + guard de arranque).**

**2026-07-03 — 🏠 Inicio enterprise · cockpit del turno ✅** (`feat/inicio-enterprise`).
Rediseño de la pantalla de Inicio (`features/home/HomePage.tsx`), que pintaba **6 tarjetas HARDCODEADAS** (`MODULES` +
`STATUS_LABEL/CLASS`) con estados fijos: módulos ya listos (Plantillas/Incidencias) salían como «Pronto» y NO navegaban,
faltaban casi todos los módulos reales, y el copy era de v1. TODO consulta ya existente ⇒ **SIN migración, SIN permisos, SIN
FLUSHALL**. **(1) Accesos derivados del REGISTRO** (`SIDEBAR_ROUTES`, fuente única de verdad; se agregó `descKey?` opcional
i18n a `NavRoute` + descripciones `nav.desc.*` para los 18 módulos). **(2) «Mi trabajo hoy» = 5 tiles accionables** con conteo
EN VIVO + desglose de riesgo (crítico/vencido/sin responsable/advertencia) + deep-link al listado filtrado: Mis rondas
(`useMyRoundsStats`), Incidencias (`useIncidentStats`), Órdenes de trabajo (`useWorkOrderStats`, `?lifecycle=OPEN`), Excepciones
por triar (`useExceptions().summary`), Notificaciones (`useInboxUnreadCount`). Cada hook **gateado por su permiso**
(`enabled: can(...)`) ⇒ sin 403 al operador sin módulo; se aditó `enabled?` a `useIncidentStats`/`useWorkOrderStats`. Tile en 0 =
calmo (severidad solo semántica, no grita). **(3) «Operación»** = accesos del grupo `operation` del registro que no son ya un tile
(Panorama, Nueva entrada, Bitácoras, Cambio de turno). **Tras feedback del dueño** («sobrecargado, poco premium») se DESCARTÓ el
muro de los 3 grupos (18 tarjetas): el Inicio es un **cockpit**, no el directorio (Diseño/Admin quedan en el sidebar). Tokens del
DS (sin hex), Lucide 16–24px, glass, 44px táctil, responsivo, claro+oscuro, conteos con `lib/format`. **Fixes de UX en vivo:**
`/mis-notificaciones` usa ahora todo el ancho (se quitó `max-width:1180px` centrado) + el `Select` «Todas» de la bandeja dejó de
estirarse (clase `.filterSelect` de ancho fijo; el `Select` de `@lyra/ui` trae `width:100%`). **Mis rondas «no filtra» = NO bug:**
verificado por API (289 rondas 100% vencidas, 17 días de antigüedad); el horizonte acota solo lo que VIENE y las vencidas siempre
se muestran (estándar de worklists) ⇒ deuda de DATA (reseed), no de código. Verde: web typecheck + lint (0 errores) + build +
**test 8/8** (`navigation.spec` extendido: descKey en todo módulo + grupo operativo). Pendiente: **smoke VISUAL (dueño)**.
Decisiones en `DECISIONS.md` (2026-07-03, entrada Inicio). USER_GUIDE §Inicio redactada.

**2026-07-03 — 🎛️ UX · Pulido transversal pre-Slice 8 ✅** (`feat/ux-pulido-pre-s8`).
Ronda de 6 ítems de feedback del dueño + 2 hallazgos, TODO UI/consulta (SIN migración, SIN permisos, SIN FLUSHALL).
**(1)** Se quitó la jerga «(Fase X)» de 6 hints VISIBLES en `es-CL.ts` (no se tocaron comentarios `// Fase`).
**(2)** Ventana lateral de incidencias más ancha: `IncidentDetailDrawer` width 720→860.
**(3+hallazgo A) Checklists de OT fuera de Bitácoras:** los checklists de OT son `LogEntry` que instancian una
`WorkOrderChecklist` (Puerta 2). El 1.er intento filtró por `template.purpose=CHECKLIST` — **incompleto**: una regla de
checklist puede apuntar a una plantilla GENERAL (`purpose=null`) y su instancia se colaba (fuga real: 1 registro en la
BD del dueño). **Corregido de raíz por el ENLACE**, no por el purpose: `buildWhere` (único punto que alimenta
list/stats/facets/export) excluye `{ workOrderChecklists: { none: {} } }`. **Hallazgo B:** `{ purpose: { not: "CHECKLIST" } }`
NO es null-safe en Prisma (habría ocultado TODAS las bitácoras generales) — lo cazó el smoke antes de publicar.
**(4) Pickers operacionales:** `TemplatesService.list` gana `opts.excludeChecklists` (null-safe con `OR purpose=null`),
pasada SOLO desde `GET /log-entries/templates` y `/filter-templates` (Nueva entrada + filtro de grilla); el catálogo admin
`GET /templates` NO la pasa (ahí deben verse para gestionarlas). **(5) Reutilizables en `features/shared/`:** `FilterChips`
(chips de filtros activos removibles + «Limpiar filtros», espejo del patrón ya presente en Bitácoras), `RefreshButton`
(invalida el prefijo del módulo vía `useIsFetching`+gira) y `DateRangePresets` (Hoy·24h·7d·30d por fecha de creación).
Aplicados: chips+limpiar+refrescar+presets en `WorkOrdersPage` e `IncidentsPage` (los filtros del drill-down
—createdFrom/To, orgNodeIds, originType, equipmentId— pasaron de const a ESTADO, ahora removibles); SOLO refrescar+limpiar en
`ExceptionsPage`; Bitácoras (`LogbookPage`) YA los tenía ⇒ intacto. **(6) Back-nav dashboard→lista:** `drill()` de ambos
dashboards (OT + Incidencias) añade `?from=dashboard` ⇒ la lista muestra «← Volver al dashboard». Tokens del DS (sin hex),
ui-grid-conventions respetadas. Verde: web typecheck+lint+build · api typecheck+lint+**252** tests (logbook-query 21/21) ·
**smoke-checklist-exclusion 12/12** (NUEVO: admin catálogo SÍ trae CHECKLIST; pickers y grilla NO; **fuga plantilla-general
excluida**; null-safe generales visibles) + regresión **rondas 21/21 · mis-rondas 18/18 · workorders 122/122 · incidencias
32/32 · ot-incidencia 17/17**. Pendiente: **smoke VISUAL (dueño)**. Decisiones en `DECISIONS.md` (2026-07-03, entrada UX pulido).
**Feedback adicional del dueño (registrado en BACKLOG, próxima sesión):** pantalla de INICIO desactualizada (módulos con
estado «Pronto» que ya están listos / tarjetas que no navegan / faltan módulos) ⇒ rediseño a **launchpad enterprise**
(tiles accionables por permiso del usuario conectado). **Siguiente: a definir (Inicio enterprise u OT Slice 8).**

**2026-07-03 — 🔗 OT · Slice 7b · Enlace Incidencia↔OT bidireccional ✅** (`feat/ot-incidencia-enlace-s7b`).
Cierra el paquete comercial de OT conectando incidencias y órdenes de trabajo EN AMBOS SENTIDOS, al estándar de los grandes
(SAP PM notification→order / IBM Maximo Related Records ORIGINATOR↔FOLLOWUP). **Reusa `WorkOrder.originIncidentId` (indexado) +
`originType=INCIDENT`, ya cableados en `create()` desde S7a** ⇒ **SIN migración, SIN permiso nuevo, SIN FLUSHALL**. Decidido:
enlace SOLO a nivel incidencia (NO `IncidentAction.workOrderId` — excede el estándar ticket→followup). **(a) Vista inversa:**
`WorkOrdersService.listForIncident(userId, incidentId)` (nuevo) reusa `buildWhere`-style ABAC por nodo + `listInclude` +
`toListItems` (semáforo/estado/criticidad ya resueltos; NO por estructura activa: la incidencia define el contexto,
cross-structure-safe) → endpoint `GET /incidents/:id/work-orders` en `IncidentsController` (gate **`incident:view` + `workorder:view`**,
defensa en profundidad: es un join cross-módulo; `IncidentsService.assertViewable` valida existencia + ABAC de la incidencia ANTES
de delegar). `IncidentsModule` importa `WorkOrdersModule` (una dirección, sin ciclo). **(b) Crear OT desde la incidencia:**
`CreateWorkOrderModal` gana prop `seed` (`WorkOrderSeed`: originIncidentId/code/title/description/orgNodeId/criticality) que
pre-siembra el asistente (título/descr. copiados, nodo de la incidencia, criticidad ← severidad 1..5 escala común; **tipo NO
sembrado** — no hay mapeo incidencia→tipo, lo elige el usuario, como SAP PM); montaje CONDICIONAL en la pestaña ⇒ el seed se
aplica al abrir sin efectos. **(c) Vuelta:** `getDetail` de OT resuelve `originIncidentCode`+`originIncidentTitle` (helper de
contrato NUEVO `incidentCode` reutilizado; espejo de `originLogEntryNumber` de incidencias) → `WorkOrderDetailPage` muestra
«Originada por incidencia **INC-#### — «título»**» con link. **Web:** 6.ª pestaña «Órdenes de trabajo» (ícono `Wrench`, badge de
conteo, gate `workorder:view`) en `IncidentDetailDrawer` = `IncidentWorkOrdersBlock` (lista con folio/estado/criticidad/semáforo
de plazo, tokens del DS; botón «Crear OT» gate `workorder:create`; invalida la query al crear) + FIX del deep-link roto
`/incidencias/:id` (no existía la ruta): IncidentsPage ahora auto-abre el drawer con `?open=<id>` y el link de vuelta apunta ahí.
Contrato `work-orders/work-orders.ts` (+2 campos en `workOrderDetailSchema`) + `incidents/incidents.ts` (helper `incidentCode` +
spec `incidents.spec.ts`). Verde: contracts **507** (incidents.spec +2) · api typecheck+lint+**252** tests · web typecheck+lint+build+**6** ·
**smoke-ot-incidencia 17/17** (ida: originType INCIDENT; inversa: aparece/DIRECT no aparece/incidencia sin OT = []; vuelta:
code+title resueltos; **gate operador 403**; **ABAC scoped: ve OT nodo A, NO ve OT nodo B ligada a A [filtro de nodo de OT],
403 en incidencia de nodo fuera de alcance**) + regresión OT **122/122** · incidencias **32/32** · incid-dashboard **24/24** ·
OT-dashboard **30/30** · dotación **65/65** (flaky de notif re-corrido). Pendiente: **smoke VISUAL (dueño)**. Decisiones en
`DECISIONS.md` (2026-07-03, entrada S7b). **FASE OT (S1–S7b) COMPLETA. Siguiente: a definir con el dueño.**

**2026-07-03 — 🔧 OT · Slice 7a · Dashboard analítico de Órdenes de Trabajo (read-only) ✅** (`feat/ot-dashboard-s7a`).
ESPEJO del dashboard de Incidencias (Fase 4.5). Analítica agregada **siempre en el backend** (GROUP BY / `$queryRaw` acotado;
nunca filas crudas al cliente) con el **MISMO ABAC por nodo ∩ estructura activa** que la lista de OT (replica el `buildWhere`:
`getAccessibleNodeIds` ∩ `orgNode.structureId` ∩ filtros). **Sin permiso nuevo** (gate `workorder:view`, como incidencias reusó
`incident:view`) → **sin migración, sin FLUSHALL**. **Servicio** `WorkOrderDashboardService`: KPIs vivos (borradores, abiertas,
críticas, sin responsable, con PTW, **plazo vencido / por vencer / estancadas** reusando el "vigía" S6 y `workOrderTrafficLight`)
+ del periodo (creadas, cerradas, **MTTR** creación→cierre `AVG`, **cumplimiento SLA** `FILTER` cerró ≤ `dueAt`) + tendencia
creación/cierre (`date_trunc AT TIME ZONE`, `PLANT_TIME_ZONE`) + distribuciones/Pareto por **tipo, criticidad, nodo,
especialidad, prioridad, origen y ESTADO del workflow** (esta última DERIVADA del flujo configurable congelado —no hay estado
hardcodeado— resolviendo nombre/color desde `WorkflowState` y fusionando por nombre). **Endpoint** `GET /work-orders/dashboard`
(ruta estática **antes de `:id`**). **Contrato** `work-orders/dashboard.ts` que REUSA los helpers puros genéricos de
`incidents/dashboard.ts` (`paretoOrder`/`defaultBucketForRange`/`defaultDashboardRange`, DRY) + aporta `criticalityDimensionLabel`;
spec 8 casos. **Web** `WorkOrderDashboardPage` + `dashboard.module.css` (Recharts con **tokens del DS, nunca hex**; Area tendencia
+ Pareto por tipo + dona por criticidad + barras nodo/especialidad/estado/prioridad/origen) + **export CSV** (BOM+CRLF) +
**drill-down por querystring** que siembra los filtros de `WorkOrdersPage` (ruta `inSidebar:false` + botón "Dashboard" en el
header de OT). **De paso** se cableó en el `queryString` de la lista de OT el envío de `slaStatus`/`createdFrom`/`createdTo` que
faltaban (el filtro `slaStatus` de la grilla no llegaba al backend —bug latente— y el drill-down los necesita). Verde: contracts
**505** (dashboard.spec 8) · api typecheck · web typecheck+build · **smoke-workorders-dashboard 30/30** (KPIs, agregación, MTTR/SLA,
**ABAC con usuario scoped**, rango/contrato, gate 403, **drill-down parity con la lista**) + regresión OT **122/122** ·
incidencias **32/32** · dotación **65/65**. **Hallazgo clave**: el enlace Incidencia↔OT **ya está medio hecho** en el schema
(`WorkOrder.originIncidentId` indexado + `originType=INCIDENT`, cableado en `create()`); **S7b** (vista inversa en la incidencia +
"Crear OT desde incidencia") = **siguiente sesión** (decidido: solo nivel incidencia, sin `IncidentAction.workOrderId`). Pendiente:
**smoke VISUAL (dueño)**. Decisiones en `DECISIONS.md` (2026-07-03, entrada OT S7a). **Siguiente = OT S7b (enlace Incidencia↔OT).**

**2026-07-03 — 👷 Dotación · Pulido UX enterprise + datos personales + auditoría ✅** (`feat/dotacion-ux-enterprise`).
Ronda de feedback del dueño sobre la UX del catálogo de Personas/Dotación, resuelta de raíz. **Grillas al ESTÁNDAR**:
Personas y Empresas ahora usan `GridPager` + `.tableCard`/`.table` de `catalogs.module.css` (importado como `grid`) — se
descartó la tabla/paginador a mano de S3 (regla "no salirse del estándar de grillas"). **Íconos en línea** en cabeceras y
pestañas (`.sectionTitle`/`.tab`/`.h1` a flex; el DS renderiza `<svg>` en bloque). **Datos personales opcionales** en `Person`
(migr. aditiva `20260703160000`): fecha de nacimiento (edad derivada), **género**, nacionalidad y **tipo de documento**
(RUT/Pasaporte/DNI/Otro — contempla extranjeros). **RUT formateado + validado (mód-11) + normalizado** reutilizando helpers
existentes (`normalizeRut`/`isValidRut`/`formatRut`/`formatRutLive`), en persona y empresa. **Roles de dotación configurables
por UI** (cierra deuda S1: eran solo-seed) — CRUD bajo `workordercatalog:manage` + tab "Roles de dotación". **Grillas revelan
impedimentos** (chip rojo con competencias vencidas/restricciones activas por persona). **AUDITORÍA COMPLETA**: el `AuditLog`
de quitar/editar competencia o restricción ahora captura el **antes** (snapshot — ej. levantar un veto guarda el motivo) +
listados con `?includeArchived` + toggle "Mostrar archivadas (historial/auditoría)" que muestra las filas archivadas en gris.
**Modales enterprise** (competencias `xl`, Person/Company `lg` por secciones; "Verifiqué la evidencia" aclarado; confirmación
al archivar). **Sin permisos nuevos / sin FLUSHALL.** Verde: contracts **497** · api **252** · web **6** · **smoke-dotacion
65/65** + regresión OT **122/122** e incidencias **32/32**. Decisiones en `DECISIONS.md` (2026-07-03, entrada UX enterprise).

**2026-07-03 — 👷 Dotación del permiso · Slice 3 (acreditación de contratistas como GATE) ✅** (`feat/dotacion-acreditacion-s3`).
Hace REAL el tercer origen de rojo (nivel EMPRESA) que S2-A dejó diferido. **Investigación citada** (fuente primaria):
ISNetworld RAVS A/B pasan, F descalifica + "90-day flag"; Avetta Compliant/Conditional/Non-Compliant (*conditional* retrasa
pero no impide; *non-compliant* impide); Ley 16.744 art.66 bis (el mandante VERIFICA el cumplimiento del contratista) +
Cód. Trabajo art.183-C. **Toggle por tipo** `WorkOrderType.requireCompanyAccreditation` (default false, espejo de
`rosterEnabled`; migración aditiva `20260703140000`, drift ajeno descartado a mano): OFF ⇒ acreditación **informativa** (cero
regresión); ON ⇒ gate vivo. **Semáforo de empresa** (persona CONTRATISTA, sólo si el tipo lo exige, derivado EN VIVO al leer
el roster — nunca almacenado): `ACCREDITED` vigente = verde · por vencer (≤90 d) = ámbar `COMPANY_ACCREDITATION_EXPIRING` ·
`CONDITIONAL` = ámbar `COMPANY_ACCREDITATION_CONDITIONAL` (reason NUEVO; pasa marcada) · `SUSPENDED`/`EXPIRED`/`NONE`/vencida
= rojo `COMPANY_NOT_ACCREDITED`. **`deriveWorkerReasons` NO se reescribió** — se le agregó un tercer bloque `company`
(opcional) tras los Ejes A/B; ortogonal. **Override firmado POR PERSONA REUSADO tal cual** (`COMPANY_NOT_ACCREDITED` es
`blocked` ⇒ entra sin cambios en `confirmRoster`; sólo se enriqueció el mensaje). **Avisos Bloque N**
`contractor.accreditation.expiring`/`.expired` (clon del patrón de competencias en `WorkerComplianceService.findBreaches` +
resolver `resolveContractorAccreditation` + `events.ts` + 2 plantillas de correo); sólo empresas con personal en OT abierta
cuyo tipo exige acreditación. **Web:** `CompanyModal` completo (estado, grado, **vigencia con fecha por locale**, proveedor
externo, nota) + badge de estado/vigencia por nivel + grilla de empresas con **filtros en una línea + paginación arriba/abajo**
(convención); toggle "Exige acreditación" anidado bajo Dotación en `WorkOrderTypeModal`; `describeDetail` del semáforo redacta
las 3 causas de empresa en español ("Empresa «ACME»: acreditación vencida el …"); se quitó la nota "la acreditación es
informativa por ahora". **CERO permiso nuevo / CERO FLUSHALL** (`worker:manage`/`workordercatalog:manage`); `db:seed` por las
plantillas nuevas. **Verde:** contracts **497** (roster.spec **30**) + **smoke-dotacion 51/51** + regresión workorders
**122/122** e incidencias **32/32**. **Pendiente: smoke VISUAL del dueño.** **ROADMAP dotación: S4** = control de acceso/T&A
tras interfaz abstracta (solo esbozo). Decisiones S3-A…S3-F en `DECISIONS.md`; USER_GUIDE actualizado.

**2026-07-03 — 👷 Dotación del permiso · Slice 2 (competencias/certificaciones con vigencia) ✅** (`feat/dotacion-competencias-s2`).
Hace REAL la validación que S1 dejó inerte (el semáforo era siempre verde). **Investigación citada** (piezas nuevas,
fuente primaria): ISN «flag 90 días» + práctica 30/14/7 ⇒ ventana de aviso configurable por tipo; Maximo *Expiration Date*
inmutable + Extend/Renew crea registro nuevo en `LABORCERTHIST` + SAP elimina al vencer ⇒ **renovar = fila nueva, expiración
DURA sin gracia**; Maximo no auto-verifica al renovar ⇒ `verifiedById/verifiedAt` (ISO 45001 §7.2 evidencia documentada).
**Entidades nuevas** (migración `20260703120000_add_dotacion_competencias`, aditiva; drift ajeno descartado a mano):
`CompetencyType` (catálogo: `category CERTIFICATION|TRAINING|MEDICAL_EXAM|INDUCTION|LICENSE`, `defaultValidityDays`,
`requiresExpiry`, `warningLeadDays` = ventana ámbar por tipo, fallback const 30), `PersonCompetency` (posee la competencia
con `issuedAt/expiresAt/certificateNumber/issuedBy/verified*`; renovar = registro nuevo, historial; estado VALID/EXPIRING/
EXPIRED **derivado**), `PersonRestriction` (veto Eje B: `MEDICAL|DISCIPLINARY|SITE_BAN|OTHER` con vigencia),
`WorkOrderCompetencyRule` (**espejo EXACTO** de `WorkOrderChecklistRule` + `appliesToRosterRoleId`). **Funciones PURAS** en
`contracts/work-orders/roster.ts`: `applicableCompetencyRules` (clon de `applicableChecklistRules`) + `deriveWorkerReasons`
(cruza reglas aplicables × competencias vigentes × restricciones activas → `WorkerBlockReason[]`, Ejes A/B **separados**) +
`competencyValidityState` + `workerStatusFromDetails`; `evaluateWorkerStatus` queda de colapsador (specs `roster.spec` 21).
**Semáforo REAL**: `WorkOrderRosterService.buildRosterDto` deriva las causas EN VIVO por persona (nunca almacena;
COMPANY_NOT_ACCREDITED **diferida a S3**). **Gate/override firmado POR PERSONA** (§6.3): si al confirmar hay personas en
ROJO, `confirmRoster` exige `overrides:[{workerId,reason}]` por cada una + UNA firma Part 11 (columnas reservadas
`overrideReason/ById/At`; `overrideSignatureId` null = deuda compartida) → evento `WORKER_OVERRIDE` + `AuditLog`; bloqueos
**explicados en español** (`explainBlock`). **Avisos de vencimiento (Bloque N)**: `WorkerComplianceService.findBreaches()`
(clon de `WorkOrderSlaService`, `$queryRaw` join roster de OT abierta) barrido por `sweep()` + casos
`worker.competency.expiring`/`.expired` en `NotificationResolverService` + eventos en `events.ts` + plantillas de correo;
dedupe por OT+competencia+día. **CERO permiso nuevo** (`worker:manage` competencias/restricciones, `workordercatalog:manage`
tipos/reglas, `workorder:roster:manage` confirmar/override ⇒ sin FLUSHALL). **Web:** panel «Competencias»/«Restricciones»
por persona en el catálogo Personas (`PersonCompetenciesModal`, renovar = nuevo registro, badge de vigencia); pestañas
«Competencias» + «Reglas de competencia» en el catálogo de OT (`CompetencyTypeModal`, `WorkOrderCompetencyRuleModal` con
`MultiSelect`/`Combobox`); semáforo REAL en la pestaña «Dotación» con motivos legibles + modal de override firmado por
persona. Seed demo: 5 competencias + 2 reglas (inducción PTW / examen preocupacional del ejecutante alto riesgo). Verde:
typecheck 7 · lint 0 err · build · contracts **488** (roster.spec 21) · **smoke-dotacion 39/39** + regresión **workorders
122/122** + **incidencias 32/32**. **Pendiente:** smoke VISUAL del dueño. **Siguiente = S3 (acreditación de contratistas como gate).**

**2026-07-03 — 👷 Dotación del permiso · DISEÑO + Slice 1 (MVP) ✅** (`feat/dotacion-permiso-s1`). Necesidad real del dueño:
gestionar el LISTADO DE PERSONAS (propias y contratistas) que ingresan a ejecutar una OT, y que quien APRUEBA valide esa
dotación. **DISEÑO** completo, investigado y **citado** (`docs/design/DOTACION_DESIGN_ARCHITECTURE.md`): traza a OSHA
1910.146 (authorized entrant / attendant-vigía / entry supervisor; el permiso lista personas y el supervisor **firma** para
autorizar) + 1910.147 (authorized/affected), HSG250 (e-firma segura), ISO 45001 §7.2 (competencia + evidencia), IBM Maximo
(**Person ≠ User**; Qualifications con vigencia), SAP WCM/Qualifications (validity auto-expira), ISN/Avetta/Veriforce
(acreditación empresa+trabajador), Chile (DS 44 ODI, Ley 16.744 art.66bis/183-C, DS 132 SERNAGEOMIN). **Tres sentidos de
autorización separados** + **dos ejes ortogonales** (competencia vs autorización/designación) sin colapsar en un flag.
**Slice 1 construido:** entidades `Person` (≠User, `kind` INTERNAL/CONTRACTOR, catálogo compartido), `ContractorCompany`
(acreditación inerte, gate en S3), `RosterRole` (seed 3 roles OSHA, configurable), `WorkOrderWorker` (roster con rol, soft-
remove, columnas de override reservadas); `WorkOrder.rosterConfirmedAt/ById` + `WorkOrderType.rosterEnabled` (migración
`20260703000000_add_dotacion_roster`). **Gobierno 2 espejo EXACTO** (`confirmRoster` FIRMADO Part 11 vía `ReauthService` /
`clearRosterConfirmation` auto-limpieza al curar / `assertRosterConfirmed` gate en la autorización, ANTES del gate de
checklists). Semáforo por persona = función pura `evaluateWorkerStatus` (forma final desde S1; en S1 siempre verde, causas
rojas en S2/S3). Permisos NUEVOS `worker:manage` + `workorder:roster:manage` (104 total). Contratos `work-orders/roster.ts`
(+ `rosterEnabled` en el tipo). **Web:** catálogo «Personas y contratistas» (`/ordenes-trabajo/personas`, tabs Personas/
Empresas), pestaña «Dotación» en la Object Page (visible solo si el tipo la gestiona; `Combobox` buscable + semáforo +
confirmar con modal de firma), toggle «Gestiona dotación» en el editor de tipos. Verde: typecheck (7) · lint 0 err · build ·
**contracts (roster.spec 8/8)** · API 252 · web 6 · **smoke-dotacion 26/26** (catálogo + gate + firma + auto-limpieza +
retrocompat tipo sin dotación) + regresión **smoke-workorders 122/122** + **smoke-incidencias 32/32**. **Diferido:** S2
competencias/vigencias + semáforo con causas rojas + gate/override por persona + avisos de vencimiento (Bloque N); S3
acreditación de contratistas; S4 control de acceso (interfaz abstracta).

**2026-07-02 — 🔢 Folio: "el ámbito completo" (segmento visible por nodo/estructura) ✅** (`feat/folio-ambito-visible`).
Refinamiento pedido por el dueño tras revisar el editor: el **ámbito** (`por nodo`/`por estructura`) partía el contador
pero **no se veía** en el folio ⇒ dos nodos generaban el mismo `RT-2026-0001`. Ahora el ámbito **inyecta automáticamente el
código** del nodo/estructura como segmento visible → `RT-NORTE-2026-0001` vs `RT-SUR-2026-0001` (cada serie se distingue a
simple vista y desaparece la colisión). `tipo`/`global` NO agregan segmento (el prefijo ya distingue ⇒ **cero regresión**,
el default de bitácora `RT-2026-0001` y el folio de OT `OT-2026-0001` intactos). **Contracts:** `renderFolio(scheme, seq,
{year, scopeCode?})` intercala el segmento (canónico `PREFIX-SCOPE-YYYY-SEQ`; máscara gana token **`{SCOPE}`**) +
**`normalizeFolioSegment`** (MAYÚSCULAS, sin tildes, `[A-Z0-9]`) + `scopeRendersSegment` (solo node/structure); `folioSchemeWarnings`
recableado (nodo/estructura ya NO avisan colisión —muestran su código—; el aviso queda para `scope=type` bajo unicidad global,
+ aviso si la máscara con ámbito no incluye `{SCOPE}`). **Backend:** `LogEntriesService.issueFolioWithinTx` y
`WorkOrdersService.transition` resuelven el código (`orgNode.code ?? externalCode ?? name`; `structure.key ?? name`, normalizado)
y lo pasan a `renderFolio`; `WorkOrderRow`/`listInclude` amplían el select del nodo. **Web:** el `FolioSchemeEditor` muestra el
segmento en la **vista previa** (marcador `‹NODO›`/`‹ESTRUCT›`) + ayuda bajo el ámbito ("el folio incluirá el código del
nodo…") + `{SCOPE}` en la ayuda de máscara. La UNICIDAD real la sigue garantizando el contador por ID; el segmento es la
etiqueta humana. Verde: typecheck (7) · lint 0 err · build · **contracts 467** (+8) · API 252 · web 6 · **smoke-folio 15/15**
(+2: OT/bitácora sin cambio + **por nodo** `RN-‹CODE›-AAAA-0001` con el código real del nodo) + regresión **smoke-workorders
122/122** + **incidencias 32/32**. Ver DECISIONS 2026-07-02 ("el ámbito completo"). **Siguiente = OT S7 (Dashboard + Incidencia→OT).**

**2026-07-02 — 🔢 Editor visual de FOLIO configurable (reutilizable) + folio-por-plantilla de bitácora ✅** (`feat/folio-editor-y-plantillas`).
Cierra DOS deudas de una: (A) el **editor UI de `folioScheme`/`folioOnStateKey`** que faltaba en el mantenedor de tipos de OT
(hoy era API-only, deuda desde S2) y (B) el requerimiento del dueño (BACKLOG 2026-06-30) de **correlativo/folio PROPIO por
plantilla** de bitácora — ambos con el MISMO componente compartido y **cero reinvención** (reusan el motor gapless
`FolioCounter`/`FolioService` + `folio.ts` ya existentes de OT). **4 decisiones aprobadas por el dueño con mi recomendación**
(vía 4 preguntas, contrastando SAP PM SNRO / Maximo / NetSuite): (a) el esquema vive en **`Template` (contenedor MUTABLE)** con
fallback global, NO en `TemplateVersion` (es config de gobernanza como editWindow/equipmentMode; en SAP/NetSuite la numeración
por tipo de documento es config mutable, no parte de la definición versionada); (b) el folio se emite **al SELLAR** (commit GxP),
NO al crear el borrador (borradores abandonados dejarían huecos en la serie humana; paridad con `folioOnStateKey` de OT); (c)
**optativo por plantilla + fallback** (sin esquema ⇒ correlativo global `entryNumber`/"BIT-######", cero regresión, deep-links
intactos; con esquema ⇒ folio propio); (d) componente **`FolioSchemeEditor` en `features/shared`** (domain-aware, usa primitivos
de `@lyra/ui`, NO va en el design-system) + el motor puro se **movió** a `packages/contracts/src/shared/folio.ts` (ya no es "de
OT"). **Contracts:** `shared/folio.ts` = motor NEUTRAL (`folioSchemeSchema`, scopes/resets, `buildFolioSeqKey` con
`entity:"logentry"`, `renderFolio`, `resolveFolioSchemeWith(raw, defaults)` parametrizado + **`folioSchemeWarnings(scheme,
domain)`** que avisa de colisiones scope/mask — codifica el aprendizaje del `fix/ot-folio-global`); `work-orders/folio.ts` conserva
los defaults OT + `resolveFolioScheme` de 1-arg (cero churn); `log-entries/log-entries.ts` gana `DEFAULT_LOG_ENTRY_FOLIO_SCHEME`
(scope=type = **por plantilla**, anual, prefijo "DOC"), `resolveLogEntryFolioScheme`, `LogEntry.folio` (nullable) y el helper
**`entryFolioLabel(entry)`** (fuente única del rótulo: folio propio ?? "BIT-######"); `Template.folioScheme` en el DTO/create/update.
**Migración aditiva `20260702230000_add_template_folio`** (`Template.folioScheme` Json? + `LogEntry.folio`/`folioSeqKey` TEXT;
drift ajeno `LogEntry_currentStateSince_idx`+`OrgStructure.updatedAt` descartado a mano; node de :3000 detenido por EPERM). **Backend:**
`TemplatesService` persiste/expone `folioScheme` (create/updateMeta/DTO/audit); `LogEntriesService` inyecta `FolioService`
(vía `FolioModule`) y **emite el folio DENTRO de la tx del sellado** (helper `issueFolioWithinTx`, llamado en `submit()` y en
`executeTransition()` cuando `seal`; scope=type ⇒ `typeId`=`templateId`, gapless; sin esquema ⇒ folio null); `logbook-query`
expone `folio` en grilla/CSV via `entryFolioLabel`. **`folio` NO es único global** a propósito (dos plantillas pueden compartir
prefijo bajo scope=type; la unicidad la garantiza el contador por serie; `entryNumber` sigue siendo el handle interno). **Web:**
`FolioSchemeEditor` compartido (toggle activar + prefijo/ámbito/reinicio/relleno/inicio/máscara + **vista previa EN VIVO** de 2
folios + clave de secuencia + avisos), reusado por **`WorkOrderTypeModal`** (entity `workorder`, dominio `global`, + picker "¿cuándo
se emite?" con los estados del flujo) y por **`TemplateBuilder`** (entity `logentry`, dominio `per-type`, sub-pestaña "Identidad y
gobernanza"); grilla/visor/peek/flow de bitácoras muestran `entryFolioLabel` (folio propio con fallback). **SIN permiso nuevo**
(OT=`workordercatalog:manage`, plantilla=`template:edit`) ⇒ **sin db:seed/FLUSHALL**. Verde: typecheck (7) · lint 0 err · build
(contracts+web) · **contracts 459** (+11 `shared/folio.spec`) · **API 252** · web 6 · **smoke-folio.py 13/13** (OT máscara
`PTWSMK/AAAA/0001` gapless por tipo + bitácora sin esquema⇒folio null + con esquema⇒`RTSMK-AAAA-0001` gapless por plantilla + serie
independiente por plantilla + listado expone el folio) + regresión **smoke-workorders 122/122** + **incidencias 32/32**. Ver
DECISIONS 2026-07-02 (Folio editor). **Pendiente:** smoke VISUAL del dueño (crear tipo OT con folio `PTW/{YYYY}/{SEQ}` y ver la
vista previa; crear plantilla con folio propio y sellar una entrada para ver el folio real). **Siguiente = OT S7 (Dashboard de OT
+ integración Incidencia→OT).**

**2026-07-02 — 🔧 OT · Sesión 6 · SLA, avisos de plazo, escalamiento y semáforos ("vigía digital") ✅** (`feat/ot-sla-semaforos`).
ESPEJO de la Fase 4.4 de Incidencias (se clonó `IncidentSlaService`/resolvers/helpers; nada reinventado). **SIN migración**
(las columnas `WorkOrderType.resolutionDueMinutes/escalationAfterMinutes/escalationRoleId`, `WorkOrder.dueAt` y
`WorkActivity.baselineEnd/plannedEnd/status` YA existían latentes; `WorkOrderEvent.kind` es String libre) y **SIN permiso
nuevo** (avisos no gatean acciones; SLA del tipo = `workordercatalog:manage`, editar plazo = `workorder:edit`) ⇒ **sin
db:seed/FLUSHALL por permisos** (102 sin cambio; el seed sólo re-corre por las 3 plantillas de notificación nuevas).
**3 eventos SLA (no 4)** — descarté `workorder.sla.breached` por redundante (`resolutionDueMinutes` NO es un evento: CALCULA
`dueAt`): `workorder.overdue` (plazo `dueAt` vencido, re-aviso diario, escala si corresponde), `workorder.stalled`
(permanencia de estado > `maxStayMinutes`, dedupe 1× por ocupación) y `workorder.activity.overdue` (actividad del plan con
fin baseline/planificado pasado, re-aviso diario). **Desambiguación §21:** Permanencia (`stalled`) ≠ Plazo (`overdue`) ≠
Actividad vencida. **`dueAt` se ancla AL APROBAR** (no al crear la solicitud): `workOrderDueFromType(approvedAtMs, type.resolutionDueMinutes)`
en la tx de la transición emisora del folio; el **override manual GANA** (sólo se calcula si `dueAt` está null) + evento
`DUE_CHANGED`; `dueAt` también editable manual (PATCH) con `DUE_CHANGED`. **Contracts** (`work-orders/sla.ts`, +15 specs):
helpers PUROS `workOrderDueFromType`/`isWorkOrderOverdue`/`workOrderEscalationThreshold`/`workOrderShouldEscalate` (prefijados
para no colisionar con los homólogos de Incidencias en el barrel plano) + **semáforo** `workOrderTrafficLight` (🔴 vencida/
actividad vencida · 🟡 por vencer [`AT_RISK_WINDOW_MINUTES`=48 h] · 🟢 en plazo · ⚪ sin plazo) + `isActivityOverdue`;
`WorkOrderType` gana los 3 campos SLA (+`escalationRoleName`); `WorkOrderListItem` gana `slaStatus`+`stalled` (DERIVADOS en el
server, sin cron); `slaStatus` a la query (overdue/atRisk/stalled) + `WorkOrderStats` gana `overdue/atRisk/stalled`; 3 eventos
+ `WORKORDER_VARIABLES` en el catálogo `NOTIFICATION_EVENTS` + `deepLinkForEntity("WorkOrder")`. **Backend:** `WorkOrderSlaService.findBreaches()`
(dominio, clon de `IncidentSlaService`) barrido en `NotificationWorkerService.sweep()`; resolvers `resolveWorkOrder{Overdue,Stalled,ActivityOverdue}`
(owner + roles del estado + escalamiento si `workOrderShouldEscalate`, todo `filterByNode`/ABAC, espejo de `incidentRecipients`);
`stats()` calcula los 3 KPIs; `buildWhere` filtra por `slaStatus` (raw `findStalledIds` para permanencia); `toListItems` deriva
`slaStatus`+`stalled` (consulta batch de actividades vencidas). **Web:** `WorkOrderTypeModal` gana los campos SLA (reusa
`SlaDurationField`+`useRoles`); grilla con **columna semáforo** (punto tokenizado + tooltip) + **chip "Estancada"** + 3 KPIs
(Vencidas/Por vencer/Estancadas, click = faceta del vigía sobre la grilla existente) + filtro `slaStatus`; Object Page con
**chip de semáforo** en la cabecera + **plazo editable** (`datetime-local`) en el panel. **Colores = TOKENS del DS** (`--color-error/
-warning/-success/-text-muted`), sin hex/jerga. **Seed:** 3 plantillas de notificación (OT vencida/estancada/actividad vencida)
+ grupo "Órdenes de trabajo" en la UI de notificaciones. Verde: typecheck (7) · lint 0 err · build (contracts+web) · **contracts
448** (+15) · **API 252** · web 6 · `smoke-workorders.py` **122/122** (+14: SLA persiste en el tipo → auto-dueAt al aprobar/
override gana → DUE_CHANGED manual → semáforo `red`+KPI `overdue`+filtro → worker detecta `overdue`/`activity.overdue`/
**escalamiento** con destinatarios + ABAC) + regresión **incidencias 32/32** + **notif-inapp 18/18** + **notif-avanzadas 22/22**.
*(El smoke base `smoke-notificaciones.py` = 13/18: los 5 fallos son de ENTREGA por correo — SMTP desactivado en dev, sin fila
`EmailConfig` — preexistentes y ajenos a S6; la maquinaria INAPP/resolvers que S6 reusa está en verde.)* Ver DECISIONS 2026-07-02
(OT S6). **Pendiente:** smoke VISUAL en navegador (dueño). **Siguiente = OT S7 (Dashboard de OT + integración Incidencia→OT).**

**2026-07-02 — 🔧 OT · Sesión 5b · Slice B · Checklists de EJECUCIÓN por actividad + Gobierno 2 ✅ → COMPLETA el modelo §11 de checklists** (`feat/ot-ejecucion-gobierno2`).
Cierra el modelo GENERALIZADO de checklists del §11: los controles de terreno (LOTO físico, energía cero, toma-5/LMRA)
se aplican **POR ACTIVIDAD** y el aprobador **cura y confirma el set** que se exigirá antes de autorizar el permiso.
**Datos** (migr. aditiva `20260702220000_add_execution_checklists`): `WorkOrderChecklist.workActivityId` (→ `WorkActivity`
SetNull; SOLO los de EJECUCIÓN cuelgan de una tarea, el resto null=nivel-OT) + el `@@unique` pasa a
`(workOrderId, templateId, workActivityId)` (Postgres trata NULL como distinto ⇒ el anti-duplicado de los de nivel-OT
sigue siendo el guard de código, documentado); `WorkOrder.executionSetConfirmedAt/ById` (sello de Gobierno 2). **Backend:**
`materializeExecutionSet(woId, actor)` crea una fila por **cada actividad × regla EXECUTION que matchee** (aplicabilidad de
OT ∩ **especialidad de la ACTIVIDAD**; regla sin especialidad = todas — helper puro `applicableExecutionRulesForActivity`,
+3 specs); orquestador `materializeForState(woId, stateKey, actor)` (reusado por `transition()` y `suggest()`) materializa
AUTORIZACIÓN + SET de EJECUCIÓN al ENTRAR a `en_preparacion` (plan ya congelado ⇒ actividades fijas). **Gobierno 2:**
`confirmExecutionSet` sella el set (`workorder:checklist:manage`, sin permiso nuevo) + **gate al autorizar el permiso**
(`assertExecutionSetConfirmed`: si hay reglas EXECUTION, exige el set confirmado) + **auto-limpieza** de la confirmación al
curar el set (agregar/quitar EJECUCIÓN ⇒ re-confirmar; trazabilidad "lo aplicado = lo autorizado"). **Gate por actividad:**
no se marca una actividad **DONE** con su verificación de EJECUCIÓN obligatoria sin aprobar (`assertActivityExecutionComplete`,
helper puro `blockingExecutionChecklistsForActivity`) + **backstop al cierre** (`assertChecklistsCompleteForMoment(EXECUTION)`).
**Web:** pestaña «Verificaciones» — grupo EJECUCIÓN **sub-agrupado por actividad** (cada tarea con sus controles) + banner/botón
**«Confirmar set de ejecución»** de Gobierno 2 (chip verde "confirmado por X" tras sellar) + «Agregar» por actividad; pestaña
«Plan» gana un **indicador de solo lectura** por fila ("N verificaciones de ejecución pendiente(s) — ver «Verificaciones»").
Tokens DS claro/oscuro, sin jerga «Puerta N». **Seed:** +1 plantilla «Aplicación de controles en terreno — Bloqueo físico y
toma-5» (`purpose:"CHECKLIST"`) + regla `EXECUTION, mandatory` (ptw-alto-riesgo). **SIN permiso nuevo, SIN FLUSHALL** (102
permisos sin cambio). Verde: typecheck (7) · lint 0 err · build (contracts+web) · **contracts 433** (+6) · **API 252** ·
`smoke-workorders.py` **108/108** (+13: regla EXECUTION → materialización por actividad + match por especialidad → Gobierno 2
bloquea autorizar sin confirmar → confirmar/curar-limpia-confirmación/re-confirmar → gate DONE por actividad → aprobar verif.
→ DONE OK → cierre) + regresión **incidencias 32/32**. Ver DECISIONS 2026-07-02 (Slice B). **Pendiente:** smoke VISUAL en
navegador (dueño). **Siguiente = OT S6 (SLA/semáforos) o S7 (dashboard OT + Incidencia→OT).**

**2026-07-02 — 🔧 OT · Sesión 5b · Slice A · Eje `momento` de checklists + checklist de CIERRE ✅** (`feat/ot-checklists-momento`).
Completa el primer tramo del modelo GENERALIZADO de checklists del §11: hasta ayer el motor solo conocía **un** momento
(AUTORIZACIÓN, S3); ahora los checklists tienen un **eje `momento`** (REQUEST/PLANNING/AUTHORIZATION/EXECUTION/CLOSURE) como DATO
y queda cableado el momento de **CIERRE** del permiso. **Datos** (migr. aditiva `20260702210000_add_checklist_moment`): enum
`WorkOrderChecklistMoment` + columna `moment` en `WorkOrderChecklistRule` **y** `WorkOrderChecklist` (**default AUTHORIZATION ⇒
100% retrocompatible**; congelado al materializar; índice `(workOrderId, moment)`) + `WorkOrderType.closureChecklistSuggestStateKey`
(default `en_revision_cierre`, data-driven, paridad `folioOnStateKey`). **Backend:** `materializeForWorkOrder(woId, moment, actor)`
filtra reglas por momento; `suggest()` deriva el momento del estado actual (`momentForCurrentState`); guard genérico
`assertChecklistsCompleteForMoment` + helper puro `blockingChecklistsForMoment` (contracts, +2 specs). En `transition()`:
AUTHORIZATION al ENTRAR al estado-puerta (S3 intacto) + **CLOSURE per-OT** = sugerido al ENTRAR a `en_revision_cierre` y
**BLOQUEA el cierre** (junto al guard de actividades) si un CLOSURE obligatorio no está APPROVED, con bloqueo EXPLICADO (nombra
la plantilla). **CIERRE per-OT** (no per-actividad) por ser el cierre formal del permiso UN acto — barato y valida la maquinaria
de punta a punta; la EJECUCIÓN por actividad va en Slice B. **Permiso:** reusa `workorder:checklist:manage` (**sin permiso nuevo,
sin FLUSHALL**; 102 permisos sin cambio; el seed se re-corre solo por la nueva plantilla/regla). **Web:** editor de la regla con
**Combobox «Momento»** (+hint) — no `<select>` nativo; pestaña «Verificaciones» **agrupada por momento** (subtítulos
Autorización·Ejecución·Cierre en orden cronológico) para leer "dónde va cada checklist" de un vistazo; columna «Momento» en la
grilla de reglas del catálogo; sin jerga «Puerta N», tokens DS claro/oscuro. **Seed:** +plantilla «Cierre de permiso — Retiro de
bloqueos y reenergización» + regla `CLOSURE, mandatory` (ptw-alto-riesgo); LOTO marcada `AUTHORIZATION`. Verde: typecheck (7) ·
lint 0 err · build exit 0 · API 252 · web · contracts (checklists.spec 11); `smoke-workorders.py` **95/95** (+5: regla CLOSURE →
materialización → cierre bloqueado sin aprobar → aprobar → cerrar OK) + regresión **incidencias 32/32**. Ver DECISIONS 2026-07-02.
**Diferido a S5b Slice B:** checklists de EJECUCIÓN por actividad (`WorkOrderChecklist.workActivityId`, guard por actividad) +
**Gobierno 2** (visibilidad/confirmación del set de ejecución en la autorización, `executionSetConfirmedAt`). **Siguiente = OT
S5b Slice B (ejecución por actividad + Gobierno 2) o S6 (SLA/semáforos).**

**2026-07-02 — 🔧 OT · Sesión 5a · PUERTA 4 (seguimiento vivo del avance + cierre) ✅ → CIERRA EL MVP del ciclo Solicitud→Cierre**
(`feat/ot-seguimiento-cierre`). Con la baseline congelada (S4), la **ejecución** ahora se registra encima: el plan es inmutable
pero cada actividad acumula **avance** hasta cerrarse, y la OT se **cierra** punta a punta con los guards ya cableados en S4.
**`WorkActivityUpdate`** (entidad NUEVA, append-only §2.5): por cada registro de avance una fila inmutable
(`status`/`progressPct`/`actualStart`-`End`/`note`/`deviation`/`delayReason`; `hoursSpent`/`cost`/`evidence` reservados S8) +
`authorId`/`authorName`; cascade desde `WorkActivity`, índice `(workActivityId, createdAt)`. Migración
`20260702200000_add_work_activity_updates` (`migrate diff` live→datamodel + `db:deploy`, **drift ajeno descartado**:
`LogEntry_currentStateSince_idx` + `OrgStructure.updatedAt`; node de :3000 detenido antes de `prisma generate` por el EPERM).
**Seguimiento vivo:** `WorkActivitiesService.recordProgress()` crea el update append-only + actualiza la **foto vigente** de la
`WorkActivity` (status/%/actual\*/`completedAt`; DONE ⇒ 100% y auto-`actualEnd`, IN_PROGRESS ⇒ auto-`actualStart`) + evento
`ACTIVITY_PROGRESS`/`ACTIVITY_DONE`/`ACTIVITY_BLOCKED` + auditoría; guard `assertProgressable` (espejo inverso de `assertEditable`:
exige **plan congelado + OT abierta**). `listUpdates()` = historial más reciente primero. `WorkActivityDto` enriquecido con
`completedAt`/`completionNote`/`updatesCount`/`lastProgressAt` (batched, sin N+1). Helpers PUROS nuevos en
`contracts/work-orders/activities.ts`: `effectiveProgressPct` (DONE⇒100), `activityDeviationLabel` (atraso/adelanto legible) —
fuente única back↔front. Contrato `recordWorkActivityProgressRequestSchema` (refine: exige ≥1 dato de avance). **Cierre (Puerta 4):**
los guards ya estaban cableados en S4 (`assertActivitiesComplete`/`blockingActivitiesForClose` al pasar a estado final +
`planNotFrozen` al ejecutar); esta sesión verifica el ciclo entero y lo EXPLICA en la UI. **Permiso:** reusa
`workorder:activity:manage` (avance = gestión del plan; **sin permiso nuevo, sin db:seed/FLUSHALL**). **Web:** pestaña «Plan de
actividades» viva en ejecución — columna **Avance** (barra + % + fecha) tras congelar, botón **«Registrar avance»** por fila
(`ProgressModal`: chips de estado IN_PROGRESS/BLOCKED/DONE, slider de %, fechas reales opcionales, contexto baseline+desviación,
motivo de atraso/bloqueo, nota) + **historial expandible** append-only por actividad (`ActivityHistory`); banner de etapa guía la
ejecución («N/M completadas · X%»). Reglas de estilo respetadas (tokens DS, sin jerga «Puerta N», ≥44px, claro/oscuro). Verde:
typecheck (6 paquetes) · lint (0 errores) · build web (2996 módulos) · **contracts 427** (+6 specs) · API 252 · web 6;
`smoke-workorders.py` **90/90** (avance append-only → gate 403 operador → avance vacío 400 → **cierre BLOQUEADO con obligatorias
abiertas 400** → DONE ambas → **cerrar con firma → cerrada/CLOSED/closureSummary** + eventos ACTIVITY_DONE/CLOSED → avance tras
cerrar 400 + avance antes de congelar 400) + regresión **incidencias 32/32**. Ver DECISIONS 2026-07-02. **Diferido a S5b:** eje
`momento` en reglas de checklist (§11.2), checklists de EJECUCIÓN por actividad (§11.4.2), checklist de CIERRE (§11.4.3),
Gobierno 2 (§11.5). **Siguiente = OT S5b (checklists por momento + Gobierno 2) o S6 (SLA/semáforos).**

**2026-07-02 — 🔧 OT/Form Builder · W5 `Template.purpose` (filtrar plantillas a «checklist»)** (`feat/ot-template-purpose`).
A pedido del dueño (la lista de plantillas mezclaba todo). Marcador **`Template.purpose`** (`TemplatePurpose?`, hoy
`CHECKLIST`; null=general; migr. `20260702190000`) + contrato + servicio + **selector «Propósito» en el Form Builder**
(gobernanza viva) + el **picker de reglas filtra por defecto a checklist** (Combobox buscable, toggle «ver todas», fallback
a todas si no hay marcadas, selección actual siempre visible); seed marca LOTO. Verde + contracts 421 + smoke-workorders
**78/78**. Se anotaron 2 ideas del dueño en BACKLOG (Gantt de actividades · grilla de OT enriquecida). Ver DECISIONS 2026-07-02.

**2026-07-02 — 🎨 OT · UX: llenar el checklist en MODAL embebido** (`feat/ot-checklist-modal`). Llenar/ver un checklist de
la OT ya no saca de la pantalla: reutiliza `EntryFillPage` en **modo embebido** (props opcionales `embedded`/`entryId`/
`onClose`; **la ruta normal de Bitácoras NO cambia**) abierto en un **modal** sobre la OT, con **"Cerrar"** en vez de
"Volver"; al cerrar refresca el estado del checklist. Viable porque sellar no navega. typecheck/lint(0 err)/build verdes.
Ver DECISIONS 2026-07-02.

**2026-07-02 — 🎨 OT · UX: detalle DRAWER → PÁGINA dedicada (Object Page)** (`feat/ot-detalle-pagina`). El detalle de la
OT deja de ser un drawer lateral (680px, comprimía el objeto) y pasa a una **página dedicada** con ruta propia
`/ordenes-trabajo/:id` (deep-linkable), estándar SAP Fiori Object Page / Maximo. Cabecera con folio+estado + **CTA primario
de etapa** (transición de avance destacada; secundarias discretas) + stepper + **cuerpo a 2 columnas** (pestañas a todo el
ancho + panel lateral de estado/responsable/prioridad/metadatos); responsive (el panel baja en tablet/terreno). Drawer
eliminado; `WorkOrderDetailPage` reutiliza Plan/Permiso/Actividad + `TransitionModal`. **Solo OT** (Incidencias sigue con
drawer → deuda en BACKLOG). typecheck/lint(0 err)/build web verdes. **Refinamientos (mismo día):** ancho completo a la
izquierda · botón «volver» visible · **fila consultada resaltada al volver** (sessionStorage) · stepper con **glow sobrio**
en la etapa actual · **pestaña «Flujo»** que reutiliza el `WorkflowDiagram` de Bitácoras (grafo + recorrido + «Estás en» +
tooltips) — `WorkOrderDetail` expone `workflow` (grafo+ejecutadas) vía `buildWorkflowView` · **Resumen** completo y profesional
(Descripción siempre + grupos Clasificación/Ubicación/Personas/Fechas/Origen; incl. PTW, riesgo ISO 31000, turno, fechas
planificadas). smoke-workorders **78/78** (getDetail con flujo OK). Ver DECISIONS 2026-07-02.

**2026-07-02 — 🔧 OT · Sesión 4 · PUERTA 3 (plan de actividades + congelar baseline) + reorden del flujo ✅**
(`feat/ot-puerta3`). La fase **Planificación** está VIVA. **Reorden al estándar EAM (§11.3):** el flujo `ot-4-puertas`
pasa a **planificar → autorizar el permiso → ejecutar** (los peligros dependen de las tareas). Nuevo orden:
`borrador → solicitada → aprobada → en_planificacion → plan_aprobado (P3) → en_preparacion → checklists_ok (P2, "Permiso
autorizado") → en_ejecucion → en_revision_cierre → cerrada`. Solo cambian `from/to/order`; el flujo es DATO INMUTABLE
versionado y el seed **republica una versión NUEVA (v2)** al detectar el cambio (firma de contenido) — los OT en curso
conservan su versión CONGELADA. **`WorkActivity`** (entidad PROPIA, fork W1): title/desc/sequence/responsable/especialidad/
plannedStart-End/**baselineStart-End**/actualStart-End/progressPct/status(PENDING|IN_PROGRESS|BLOCKED|DONE|CANCELED)/
mandatory/dependsOnId(self, ruta crítica S8)/priority + columnas reservadas (HH S8, evidence). Migración
`20260702180000_add_work_order_activities` (`migrate diff`+`db:deploy`, drift ajeno descartado) + `WorkOrder.planFrozenAt/
planFrozenById`. **Puerta 3 (`autorizar_plan`)**: exige **≥1 actividad** (guard puro `planReadyToFreeze`), **CONGELA la
baseline** (copia `planned*→baseline*` dentro de la tx, idempotente) + `planFrozenAt` + evento `PLAN_FROZEN`; tras congelar
el plan es **inmutable** (mutaciones → 400). **Guard "no ejecuta sin plan"** (`planNotFrozen`, puro) al ENTRAR a
`executeStateKey`; **guard de cierre** `blockingActivitiesForClose` (mandatory abierta) al cerrar. **Claves data-driven**
nuevas en `WorkOrderType`: `planFreezeStateKey`(def. `plan_aprobado`)/`executeStateKey`(def. `en_ejecucion`) (paridad
`folioOnStateKey`). **Permiso NUEVO `workorder:activity:manage`** (catálogo 101→**102**; db:seed+FLUSHALL hechos). **Web:**
pestaña **"Plan"** en el drawer (`WorkOrderPlanBlock`): banner de etapa que EXPLICA la próxima acción y bloqueos + **grilla**
(reordenar ▲▼/editar/eliminar, desviación plan-vs-baseline +Xd tras congelar) + **asistente guiado** (`Stepper`, 4 pasos
Tareas→Equipo→Fechas→Orden, defaults desde la OT, genera en lote `/activities/batch`; arranca cuando no hay actividades).
Guards PUROS en `contracts/work-orders/activities.ts` (+`activities.spec.ts` 8). typecheck(0)/lint(0 err)/build/test verdes;
**contracts 421** · API 252 · web 6; `smoke-workorders.py` **78/78** (pipeline planificar→autorizar_plan[baseline==planned]→
plan inmutable→preparar→checklists→ejecutar + Puerta 3 sin actividades bloqueada + gates 403 del permiso nuevo) + regresión
incidencias 32/32. **Diferido a S5:** checklists de EJECUCIÓN/CIERRE por actividad, eje `momento`, confirmación del set en
Puerta 2 (§11.5), `WorkActivityUpdate`. Ver DECISIONS 2026-07-02. **Siguiente = OT S5 (Puerta 4 — seguimiento vivo + cierre).**

**2026-07-02 — 🐞 FIX OT · folio = serie ÚNICA GLOBAL** (`fix/ot-folio-global`). *Síntoma reportado por el dueño:*
aprobar una 2.ª OT (de otro tipo) daba **Internal Error** (500 `Unique constraint failed: folio`). *Causa:* el default
`folioScheme` era **scope `type`** (contador por tipo) pero el folio renderizado (`OT-2026-0001`) NO lleva el tipo y
`WorkOrder.folio` es **@unique global** ⇒ dos tipos colisionaban en el mismo string. *Fix (opción (a), estándar SAP/
Maximo):* `DEFAULT_WORK_ORDER_FOLIO_SCHEME.scope` = **`global`** → una sola serie anual `OT-2026-0001, 0002…`
global-única (formato intacto). **Reconciliación** idempotente en `seed.ts` (`reconcileWorkOrderFolioCounters`): fija el
contador `workorder|global|<año>` al mayor folio existente del año (no re-emite folios ya usados; los OT reales
`Solicitud de Prueba`/`Reparacion de cable` = 0001/0002 quedan intactos, el siguiente = 0003). El smoke usa
`folioScheme {prefix:"OTSMK", scope:"type"}` para aislar su serie. `folio.spec.ts` actualizado. Verde: contracts **413** +
smoke-workorders **65/65** + **aprobación real verificada** (OT-2026-0003). Ver DECISIONS 2026-07-02. *(Serie por-tipo
sigue disponible por `WorkOrderType.folioScheme` con `mask` que incluya el tipo.)*

**2026-07-02 — 🔧 OT · Sesión 3 · PUERTA 2 (checklists / permisos de trabajo) ✅** (`feat/ot-puerta2`). La fase
**Preparación** está VIVA: se diseñan reglas de checklist, se sugieren/agregan a una OT, se instancian como `LogEntry`
vivos (Form Builder) y la Puerta 2 se bloquea si falta un obligatorio sin aprobar. **NO se reinventó el motor de
checklists** — cada checklist ES una plantilla del Form Builder instanciada como `LogEntry` (fork W5). **2 capas:**
**Capa A (diseño)** `WorkOrderChecklistRule` = `templateId` (→ Template) + reglas de aplicabilidad
`appliesToTypeIds`/`minCriticality`/`specialtyId`/`requiresPtw` (patrón `ReportingObligation`; helper puro
`applicableChecklistRules`), `mandatory`; gate `workordercatalog:manage`. **Capa B (operación)** `WorkOrderChecklist` =
enlace **(OT, plantilla)** `@@unique` con `logEntryId` (instancia viva), `sourceRuleId` (null = manual), `status`
(PENDING|IN_PROGRESS|SUBMITTED|APPROVED|REJECTED), responsable/revisor; gate **permiso NUEVO `workorder:checklist:manage`**
(catálogo 100→**101**; `db:seed`+FLUSHALL hechos). **Flujo operativo:** al ENTRAR al estado de preparación el ejecutor
`transition()` **SUGIERE automáticamente** los checklists cuyas reglas matchean (idempotente, `materializeForWorkOrder`) +
agregado manual; **instanciar** crea un `LogEntry` vía `LogEntriesService.create` (responsable = actor, IN_PROGRESS); se
llena/**sella** con el Form Builder; **enviar a revisión** exige el LogEntry SUBMITTED; **revisar** aprueba/rechaza con
**segregación (revisor ≠ responsable, 403)**. **Guard Puerta 2** `assertChecklistsComplete` (PURO `blockingChecklistsForClose`
en contracts, espejo `assertNoBlockingActions`) bloquea `revisar_checklists` si hay obligatorio no APPROVED; se dispara
cuando `toState.key === checklistGateStateKey`. **Claves de estado DATA-DRIVEN** en `WorkOrderType`
(`checklistSuggestStateKey`≈`en_preparacion`, `checklistGateStateKey`≈`checklists_ok`, defaults por constante — paridad con
`folioOnStateKey`). **Migración** `20260702120000_add_work_order_checklists` (`migrate diff`+`db:deploy`, drift ajeno
descartado). **Seed:** plantilla LOTO publicada (equipmentMode NONE, campos opcionales) + regla obligatoria transversal.
**Web:** pestaña **"Checklists"** en el drawer (`WorkOrderChecklistsBlock`: sugerir/agregar/iniciar/llenar[link a
`/nueva-entrada/:id`]/enviar/revisar + aviso de Puerta 2 bloqueada) + sub-tab **"Reglas de checklist"** en
`/ordenes-trabajo/catalogos` (`WorkOrderChecklistRuleModal`). typecheck(0)/lint(0 errores)/build/test verdes; **contracts
412** (+9 `checklists.spec.ts`) · API 252 · web 6; `smoke-workorders.py` **65/65** (sugerencia auto → gate 400 → instanciar
LogEntry → sellar → enviar → segregación 403 → aprobar → `revisar_checklists` OK; + gates 403) + regresión incidencias
32/32. **🔴 BUG descubierto (defecto de S2): el folio de OT colisiona entre TIPOS** (scope `type` + string sin tipo +
`folio` @unique global) — requiere decisión del dueño + migración; el smoke usa prefijo `OTSMK` para aislarse (ver
DECISIONS/BACKLOG 2026-07-02). **DEUDAS:** `Template.purpose` (W5) diferido; editor UI de `folioScheme`. **Siguiente: OT
Sesión 4 (Puerta 3 — plan de actividades + congelar baseline).**

**2026-07-01 — 🔧 OT · Sesión 2 · PUERTA 1 (aprobación + folio al aprobar) ✅** (`feat/ot-puerta1`). El ciclo de la
solicitud está VIVO hasta aprobar/rechazar, espejo del ejecutor de Incidencias. **Workflow:** al crear una OT se
**CONGELA** la versión del flujo (el del `WorkOrderType.defaultWorkflowId` o el global sembrado **"OT — 4 puertas PTW"**,
clave `ot-4-puertas`, fork W6: 11 estados/13 transiciones COMO DATO, clonable; Puertas 2–4 existen como dato, sus guards
llegan en S3–S5) y la solicitud **nace en `borrador` (lifecycle DRAFT)** — reemplaza el "nace OPEN" provisional de S1.
**Ejecutor** `WorkOrdersService.transition()` (espejo `IncidentsService.transition`): estado actual → transición válida,
**rol-dato** (`WorkflowTransitionRole`, vacío = abierta al permiso), **firma Part 11 opt-in** re-autenticada
(`ReauthService`; el registro criptográfico payloadHash = deuda COMPARTIDA con Incidencias, decisión en DECISIONS),
semántica **data-driven** de Puerta 1: aprobación = entrar a `folioOnStateKey` (default "aprobada") ⇒ `approvedAt` +
**FOLIO**; rechazo = estado final sin aprobación ⇒ motivo OBLIGATORIO + lifecycle CANCELED; final tras aprobación =
cierre. **Folio gapless (fork W4):** modelo **`FolioCounter`** (PK `sequenceKey`) + `FolioService.next(tx,…)` atómico
(`INSERT … ON CONFLICT … RETURNING`, DENTRO de la tx de la transición ⇒ rollback no quema folio; año por
`PLANT_TIME_ZONE`) + formateo PURO en contracts (`work-orders/folio.ts`: `folioSchemeSchema`
{prefix,mask,padding,start,scope,reset} sin `.default()` [gotcha TS2719] + `resolveFolioScheme`/`buildFolioSeqKey`/
`renderFolio`; default OT = por-tipo + anual ⇒ **OT-2026-0001**; motor reutilizable para el folio-por-plantilla del
dueño). `WorkOrderType.folioScheme/folioOnStateKey` configurables por API (editor UI = deuda). **Satélites** (migración
`20260701210000_add_work_order_workflow_folio`, `migrate diff`+`db:deploy`, drift ajeno descartado):
`WorkOrderTransition` (espejo IncidentTransition, `signatureId` ref. blanda lista) + `WorkOrderEvent` (timeline
append-only; kinds CREATED|SENT|APPROVED|REJECTED|FOLIO_ISSUED|TRANSITION|ASSIGNED|CANCELED|CLOSED). **Permiso NUEVO
`workorder:transition`** (dim. WORKFLOW, grupo workorders, fork W2 — catálogo 99→**100**; `db:seed`+FLUSHALL hechos).
**Backend:** `POST /work-orders/:id/transitions` (gate + rol-dato + firma); detalle expone `states` +
`availableTransitions` (con `requiresReason` derivado) + `events`; lista trae `currentStateName/Color`. **Web:** drawer
con pestañas Resumen|Actividad + **stepper** del flujo + botones de transición + **modal de firma** (contraseña/MFA) +
**rechazo con motivo obligatorio** + timeline; grilla muestra el estado del flujo y el folio (SOL-###### → OT-2026-0001
al aprobar); filtro por defecto pasa a "Todos" (lo creado nace DRAFT). **La anulación NO es estado del flujo** (endpoint
`cancel` transversal, espejo Incidencias — DECISIONS). typecheck(0)/lint(0 errores)/build/test (**contracts 403** [+11
folio] · API 252 · web 6) verdes; `smoke-workorders.py` **51/51** (nace DRAFT/borrador · enviar→OPEN · aprobar sin firma
401 · con firma → **folio OT-2026-0001** + APPROVED/FOLIO_ISSUED · rechazar sin motivo 400 / con motivo → CANCELED ·
**gapless por tipo …-0002** · 403 operador) + regresión `smoke-incidencias.py` 32/32. **Siguiente: OT Sesión 3 (Puerta 2 —
checklists/PTW ligados con Form Builder).**

**2026-07-01 — 🔧 OT · S1 · ajuste · ELIMINADO el catálogo `Area` (alineación con EAM líderes) ✅** (`feat/ot-quitar-area`).
Tras revisar SAP PM / Maximo / Infor EAM: en los grandes **no hay un catálogo "Área" aparte** — la zona/área **es la
jerarquía de ubicación** (Functional Location / Location), que en Lyra ya es el **`OrgNode`** (la estructura tiene un nivel
que puede llamarse "Área"). Mi seed inicial sembró `Area` con zonas de planta (Chancado/Molienda…), **duplicando la
jerarquía** y generando confusión (lo detectó el dueño). Se elimina `Area` en TODAS las capas: schema (`Area` +
`WorkOrderArea` + relación `WorkOrder.areas`; migración `20260701190000_drop_work_order_area`, drop guardado, nada la
referenciaba), contrato (`AreaDto`/`areaIds`/`areas`/`areaId` fuera), backend (endpoints `/areas`, validación, include,
filtro), web (wizard, filtros, columna, detalle, pestaña del mantenedor → ahora **Tipos + Especialidades**), seed y smoke.
**Modelo definitivo = idéntico a los EAM líderes: ubicación = `OrgNode` · disciplina = `Specialty` (Work Center/Craft) ·
tipo = `WorkOrderType` (Order/Work Type)**. La agrupación transversal *Planner Group/Work Group* se DIFIERE a S6–S8 y NO
se llamará "Área" ni irá en el formulario del solicitante. typecheck(0)/lint(0)/build/test(252) verdes; smoke **32/32**.
Ver DECISIONS 2026-07-01. **También:** grillas de OT e Incidencias hechas responsivas (tablet/móvil: filtros que envuelven,
selects full-width <900px, área táctil 44px; `feat/ot-responsive` en `main`).

**2026-07-01 — 🔧 OT · S1 · anexo · Mantenedor de catálogos + seed de industria ✅** (`feat/ot-catalogos`). Cierra
una deuda que quedó abierta en S1: los catálogos de OT (Tipos/Áreas/Especialidades) ya se administran **desde la app**,
no solo por API/seed. **Web**: pantalla `/ordenes-trabajo/catalogos` (gate `workordercatalog:manage`, botón «Catálogos»
en el header de `/ordenes-trabajo`, sub-ruta `inSidebar:false` para no doblar el resaltado — patrón de Incidencias) con
3 sub-pestañas (Tipos · Áreas · Especialidades), cada una con buscador + filtro activo/inactivo + orden + paginación
arriba/abajo + toggle activar/desactivar + crear/editar en modal (colisión de key → 409, key inmutable al editar,
swatches de color del DS). Componentes: `WorkOrderCatalogsPage`, `WorkOrderTypeModal`, `WorkOrderTagModal` (Área y
Especialidad comparten un modal parametrizado por `kind`); queries admin (`…Admin` con `includeInactive`) + mutaciones
upsert. **Seed enriquecido con datos reales de industria (CMMS/EAM: SAP PM order types, Maximo work types, ISO 14224)**:
10 tipos (correctiva, correctiva de emergencia, preventiva, predictiva, inspección, lubricación, calibración, overhaul,
mejora, PTW alto riesgo), 11 áreas de planta minera (Mina/Rajo, Chancado, Molienda, Flotación, Espesamiento y relaves,
Correas, Servicios/Utilidades, Puerto, Planta de procesos, Taller, Obras civiles), 13 especialidades/disciplinas
(mecánica, eléctrica, instrumentación, automatización PLC/DCS, soldadura, hidráulica, neumática, lubricación, HVAC,
piping, estructuras, izaje/rigging, pintura); las 2 «áreas» iniciales que en realidad eran disciplinas (mecánica/
eléctrica) se retiran del catálogo de áreas SOLO si ninguna OT las referencia (guardado). typecheck(0)/lint(0 errores)/
build verdes; `scripts/smoke-workorders.py` ampliado a **35/35** (catálogos tipos+áreas+especialidades + activar/
desactivar). **No** hubo cambio de schema/permiso/contrato. **Cierra la deuda "mantenedor de catálogos de OT" de S1.**

**2026-07-01 — 🔧 OT · Sesión 1 · CIMIENTOS ✅** (`feat/ot-cimientos`). Primer código del módulo de Órdenes de
Trabajo (OT/PTW), espejo de Incidencias. Levanta el esqueleto hasta **crear y listar una SOLICITUD** — sin workflow,
folio, checklists ni actividades (esos son S2–S5). **Schema** (migración `20260701180000_add_work_orders`): entidades
NUEVAS `WorkOrder` (+ enums `WorkOrderOrigin`/`WorkOrderPriority`/`WorkOrderLifecycle`), `WorkOrderType`, catálogos
ligeros `Area`/`Specialty` con enlaces N:N `WorkOrderArea`/`WorkOrderSpecialty`; back-relations en `OrgNode`/`Equipment`/
`Role`. Los campos de **FOLIO y WORKFLOW existen pero INERTES** (se activan en S2). `WorkOrder.number` = correlativo
interno provisional → handle humano **"SOL-######"** antes del folio oficial (que se emite al aprobar en S2). **Permisos**
grupo nuevo `workorders` (8 claves: `module:workorders:view` + `workorder:view/create/edit/assign/comment/cancel` +
`workordercatalog:manage`; `workorder:transition` dim. WORKFLOW llega en S2 por fork W2). **Contratos**
`packages/contracts/src/work-orders/` (DTOs + Zod + list query con facetas + helpers puros `workOrderCode`/
`deriveWorkOrderLifecycle`). **Backend** `apps/watchlog-api/src/work-orders/` (`WorkOrdersService`+controller+module,
registrado en `app.module`): CRUD de catálogos (tipos/áreas/especialidades, upsert con `?create=true`→409) +
create/list/detail/update/assign/cancel de solicitudes con `buildWhere` **ABAC por nodo ∩ estructura** (`?structureId=`),
auditoría inmutable, sin borrado físico. **Seed** de arranque (5 tipos incl. PTW alto riesgo, 4 áreas, 5 especialidades).
**Web** `/ordenes-trabajo` (gate `module:workorders:view`, sidebar grupo Operación): grilla con convenciones (KPIs
clicables, filtros en 1 línea + facetas tipo/criticidad/prioridad/área/especialidad, paginación arriba/abajo) + **wizard
de 2 pasos** (trabajo → ubicación/clasificación, `Stepper` del DS) + drawer de detalle (reasignar/prioridad/anular);
identidad Lyra (tokens, sin hex nuevos). **Objeción registrada:** SavedView NO se cableó — Incidencias tampoco lo tiene
(solo Bitácoras); es slice transversal pendiente (BACKLOG). typecheck(0)/lint(0 errores)/build/test (252 api + 6 web + 11
llm + contracts) **verdes**; `scripts/smoke-workorders.py` **31/31** (catálogos+CRUD+filtros+ABAC+gates 403). Migración
generada con `migrate diff`+`db:deploy` (gotcha EPERM Windows: se detuvo la API para `prisma generate`); `db:seed`+Redis
FLUSHALL por los permisos nuevos. **Siguiente: OT Sesión 2 (Puerta 1 — aprobación inicial + folio al aprobar,
`FolioCounter`).**

**2026-07-01 — 🏗️ OT · Sesión 0 · DISEÑO FORMAL entregado (sin código).** Se produjo
`docs/design/OT_DESIGN_ARCHITECTURE.md`, anexo técnico del módulo de Órdenes de Trabajo (OT/PTW) para la propuesta
comercial. Grounding **verificado contra el repo** (no redescubierto): motor de workflow (`WorkflowDefinition`/
`…Version`/`State`/`Transition`/`TransitionRole`), Form Builder/`LogEntry` como motor de checklists, `IncidentAction` como
base de `WorkActivity`, Bloque N (`IncidentSlaService.findBreaches` + `NotificationWorkerService.sweep`),
`IncidentDashboardService`, `ScopeService` (ABAC), firmas Part 11 (`LogEntrySignature`/`ReauthService`), `SavedView`. El
documento define: **entidades nuevas** (`WorkOrder`, `WorkOrderType`, `Area`/`Specialty` N:N, `WorkOrderChecklistRule`/
`WorkOrderChecklist`, `WorkActivity`/`WorkActivityUpdate`, satélites espejo, **`FolioCounter` nuevo**); **workflow base de
4 puertas configurables** + mecánica exacta de **folio-al-aprobar** (`WorkOrderType.folioOnStateKey`, sin contaminar el
modelo de workflow); **permisos** `group:"workorders"`; **integración Incidencia→OT** bidireccional; **qué va a
`packages/`**; y **8 forks (W1–W8)** con recomendación fundada. **Correcciones al plan de arranque** registradas en
DECISIONS (nombre real `WorkflowDefinitionVersion`; permisos por `group`/`dimension` no "categorías"; `FolioCounter` no
existía; prototipo no dibuja OT). **Estado: a la espera del visto bueno explícito del dueño de los forks antes de la
Sesión 1 (Cimientos).** Árbol limpio al iniciar (`origin/main..main`=0). Sin build/migración/smoke (es diseño).

**2026-06-24 — 🎨 TEMAS FASE 2A · Plantillas de inicio + Duplicar ✅** (`feat/temas-plantillas`).
Primera de tres fases enterprise sobre EST-TEMAS (2A plantillas+duplicar · 2B generador desde colores de marca · 2C
import DTCG/hex). Antes, crear una paleta partía de CERO (18 tokens × 2 variantes a mano): laborioso. Ahora hay un
**catálogo CURADO de 10 plantillas de arranque** ("starter themes", como Material/Radix/shadcn) y dos atajos que CLONAN
tokens en una paleta NUEVA editable (borrador), que se ajusta y publica con el flujo ya existente. **Plantillas =
CONSTANTES en `@lyra/contracts`** (`theme/presets.ts`: `THEME_PRESETS` con `id/name/description/tokensDark/tokensLight`),
**prístinas y versionadas con el código** — NO filas de BD, NO editables, NO publicables, el usuario final no las ve;
son solo el punto de arranque del admin. Cada plantilla sobreescribe SOLO la whitelist de 18 tokens, y de ella
únicamente **superficies + texto + 2 acentos** (bordes translúcidos y funcionales/severidad se dejan a la marca:
semántica constante entre temas). Las 10: **Grafito, Cobre, Acero, Medianoche, Bosque, Solar, Índigo, Cobalto, Magma,
Salitre** (industria chilena + constelación Lyra). **TODAS pasan contraste WCAG AA en claro Y oscuro**, garantizado por
un test nuevo `presets.spec.ts` que recorre el catálogo (regresión: una plantilla nunca puede nacer inaccesible).
**Duplicar = CLONADO EN CLIENTE** (leer paleta/plantilla → `POST /theme/admin/palettes` existente; menos superficie de
API, reusa validación). **Web:** botón **«Desde plantilla»** (junto a «Nueva») abre `TemplatePicker` (modal con
miniaturas dark+light de cada plantilla); elegir entra al editor con esos tokens como borrador sin guardar. Botón
**«Duplicar»** en las acciones de una paleta existente → borrador «<nombre> (copia)» editable e independiente. `Swatch`
extraído a `PaletteSwatch` reusable (lista + picker). **Sin backend nuevo, sin migración, sin permiso nuevo** (reusa
`theme:manage`) ⇒ sin seed gap/FLUSHALL. typecheck/lint(0)/build/test verdes (**contracts 392** [+43 presets] · web vite
ok) · `scripts/smoke-temas-plantillas.py` **11/11** (clonar plantilla→borrador con sus tokens · severidad protegida 400 ·
duplicar→copia distinta · editar la copia NO altera el original · 403 sin permiso). **PENDIENTE: smoke VISUAL del dueño**
(elegir una plantilla, ajustarla, publicarla; duplicar una existente). **Siguiente: Fase 2B (generador desde colores de
marca, con OKLCH).**

**2026-06-24 — 🎨 EST-TEMAS · Sistema de TEMAS / PALETAS administrable (MVP) ✅** (`feat/tema-paletas`).
Sistema enterprise para que un ADMIN construya **paletas de color de marca** (los colores institucionales del cliente),
con variante **CLARA y OSCURA**, las **publique** con un flag y marque **UNA por defecto**; los **usuarios** eligen entre
las publicadas, con **aplicación instantánea** sin recargar. Construido **SOBRE** el sistema de tokens existente (NO se
forkea): una paleta es un **override PARCIAL** de un set ACOTADO y curado de **18 tokens temáticos** (superficies, texto,
bordes, acentos, funcionales) por variante; lo no sobreescrito **cae a la marca Lyra**. **Contrato `@lyra/contracts`**:
`theme/palette.ts` (whitelist de claves + `paletteTokensSchema` Zod `.strict()` con formato de color anti-inyección +
DTOs + `buildPaletteOverrideCss` que **deriva el gradiente de marca de los acentos**) y `theme/contrast.ts` (cálculo
**WCAG 2.1 PURO** reutilizable, con tests). La **severidad 1–5 queda PROTEGIDA** (semántica, no editable). **Backend:**
modelo `ThemePalette` (tokensDark/Light JSON, isPublished, auditoría) + `SystemSettings.defaultPaletteId` +
`User.themePaletteId` (preferencia PORTABLE server-side; migración aditiva `…140000_add_theme_palettes`); permiso nuevo
**`theme:manage`** (cat. 91); `ThemeService`+controller con CRUD/publish/default/list-publicadas/`/theme/me` (elegir, sin
permiso) y **auditoría** de crear/publicar/default. **Web:** capa de override `palette-store` (`<style>` scopeado a
`[data-wl-themed]` ⇒ **el login conserva la identidad oscura de marca**) + `usePaletteController` + **selector en el menú
de tema del Topbar** (junto a claro/oscuro/auto); **builder admin** en `/configuracion` → pestaña **«Apariencia»**
(lista de paletas + editor por variante con **VISTA PREVIA EN VIVO** sobre todo el workspace + **aviso de contraste WCAG
AA**). **claro/oscuro/auto sigue LOCAL** (ergonomía por dispositivo); la PALETA va server-side por usuario.
typecheck/lint(0)/build/test (**contracts 349 + API 252**, incl. contrast/palette specs) verdes · `scripts/smoke-tema-paletas.py`
**23/23** (crear→validar[color/whitelist/severidad]→publicar→default→sólo-publicadas→403 sin permiso→elegir/persistir→
404 no-publicada→fallback default→despublicar quita default). **Reemplaza la deuda de branding por licenciatario de Fase 7**
(build-args VITE_ → ahora runtime, sin rebuild). **PENDIENTE: smoke VISUAL del dueño** (construir una paleta institucional
y verla en claro/oscuro). **Fase 2 (futuro):** semilla 1-color→rampas, import/export, logo, identidad por estructura.
**FIX post-merge (selector de override, v0.1.11):** la paleta no aplicaba los colores — el override se generaba con
`[data-wl-themed][data-theme]` (ambos atributos en UN mismo elemento) pero `data-wl-themed` estaba en el `<div>` del shell
y `data-theme` en `<html>` ⇒ el selector compuesto nunca casaba. Se movió `data-wl-themed` a **`<html>`** (lo pone/quita
`usePaletteController` al montar/desmontar el shell) ⇒ el override gana a los tokens base, **cubre TODO incluidos los
portales** (menús/modales/toasts que se montan en `<body>`), y el login (sin shell) queda intacto. Verificado en vivo.
**Siguiente: Fase 2A de temas (plantillas de inicio + duplicar), según definición del dueño.**

**2026-06-24 — 🎨 EST-FIX-ALTO · Paneles maestro-detalle llenan el alto del viewport ✅** (`fix/layout-altura-paneles`).
Defecto **premium**: en las páginas tipo maestro-detalle (Estructura, calendarios, datos de referencia, usuarios) el
split «lista | detalle» quedaba a **media pantalla** con un gran vacío debajo en vez de llegar al borde inferior. **Causa
raíz:** la cadena de altura (flex) estaba rota/inconsistente — `ResizableSplit` dentro de un flex-column **no crecía** (su
contenedor no tenía `flex-grow`; `align-items:stretch` solo estira el ancho), y cada página resolvía la altura de forma
distinta: StructurePage/ReferenceDataPage sin altura (split clavado en su viejo `min-height:520px`), Operational/Fiscal
con un hack frágil `height: calc(100dvh − 58px − 2·pad)` que **ignoraba la barra de pestañas del workspace y la densidad
compacta**, y UsersPage ya correcta (cadena `flex:1/min-height:0` propia bajo `SecurityLayout`). **Fix DRY en 2 lugares
compartidos:** **(1)** `ResizableSplit` (`packages/ui`) — su contenedor pasa a `flex: 1 1 auto; min-height: 0` (se quita
el `min-height:520px` fijo): llena cualquier flex-column padre acotado y los paneles scrollean **internamente**.
**(2)** El shell (`AppShell.module.css`) — nueva variante **`data-fill-height="pad"`**: llena el alto disponible PERO
**conserva el padding del shell** (la tarjeta enmarcada respira), volviendo el contenedor un flex-column y estirando la
página con `flex:1; min-height:0`. Centraliza la cadena de altura: cada página de split solo **marca el atributo** en su
`<div>` raíz (wiring, no CSS de alto propio). Se borró el `height: calc(...)` frágil del CSS compartido de calendarios
(deuda eliminada, no añadida). **El `data-fill-height` «a sangre» (padding:0) de Logbook queda INTACTO** (variante por
defecto). **UsersPage no se tocó** (ya llenaba). Solo CSS/estructura de contenedores — sin librerías nuevas, sin modelo de
datos, tokens existentes (respeta claro/oscuro y responsive/táctil). Beneficia a las **4** páginas rotas/frágiles + valida
la 5.ª (Usuarios). typecheck/lint(0 errores)/build/test (**252 API + 6 web**) en verde. **PENDIENTE: smoke VISUAL del
dueño** (las 5 páginas, claro/oscuro, escritorio/tablet). **Nota de incidente de tooling:** un `pnpm` con `CI=true`
disparó un `install --production` que podó las devDependencies; se restauró con `pnpm install` completo y se desactivó
`verify-deps-before-run` para esta máquina. **Siguiente: Sistema de temas / paletas (EST-TEMAS).**

**2026-06-24 — 🛠️ OPS · Workflow CI reparado ✅** (`fix/ci-pnpm-builds`, PR #1 → `main`). El workflow
`ci.yml` (typecheck+lint+test) **había fallado en TODAS las corridas desde que existe** — el gate de
calidad nunca corrió en la nube. Dos causas que solo se manifiestan en checkout LIMPIO (en local no,
porque `node_modules` y `packages/*` ya están construidos): **(1)** `pnpm install --frozen-lockfile`
moría con `ERR_PNPM_IGNORED_BUILDS` (exit 1) por los build scripts nativos (prisma/argon2/esbuild/
@nestjs/core); en este pnpm (11.5.2) `onlyBuiltDependencies` **no se aplica** al instalar y lo que se
honra es **`allowBuilds: true`** en `pnpm-workspace.yaml` (el bloque "basura" con placeholders era el
andamiaje que pnpm autoescribe sin decidir). **(2)** typecheck/lint/test fallaban porque los paquetes
compartidos (`@lyra/contracts`, `@lyra/llm`) se resuelven por su `dist`/tipos y CI **nunca los
construía** → nuevo paso **«Construir paquetes compartidos»** antes de typecheck. Validado en un **git
worktree limpio** (reproduce CI): install exit 0 → packages build → typecheck → test 252+6; y luego en
CI real (verde por primera vez, en la rama y en `main`). Sin cambios en el lockfile. Detalle en la
memoria `ci-pipeline`. **Disparado durante el deploy de `v0.1.9`** (que fue exitoso por su propio
camino de build Docker, ajeno a este fallo de CI).

**2026-06-24 — 🔒 L1c · Coherencia de la estructura activa en los caminos de CREACIÓN ✅** (`feat/estructura-creacion-coherente`).
Cierra la última grieta del aislamiento por estructura. Hasta L1b los LISTADOS ya filtraban por la estructura activa
(`?structureId=`), pero el flujo de **«Nueva entrada»** la ignoraba: el picker de plantillas y el de nodos elegibles solo
aplicaban ABAC + alcance de plantilla. Un usuario con alcance en DOS estructuras (A y B), estando «en A», veía y podía
elegir plantillas/nodos de **B** — incoherente con el badge «Estás en A» (no era fuga de datos: el ABAC seguía siendo la
frontera, pero rompía la promesa de la estructura activa). **Backend:** `TemplatesService.list` y
`LogEntriesService.eligibleNodesForTemplate` aceptan un `structureId` opcional que se intersecta **ADITIVO al ABAC** (AND,
espejo de L1b vía `orgNode.structureId`): una plantilla CON asignación aparece solo si **≥1 de sus nodos vive en la
estructura activa**; una plantilla **GLOBAL** (sin asignación) es «de toda la instalación» y aparece **SIEMPRE** (decisión
(a)); los **nodos elegibles** (incluidos los de una global) se acotan a la estructura activa ∩ ABAC. Los endpoints
`GET /log-entries/templates` y `GET /log-entries/templates/:id/nodes` reciben `@Query('structureId')`. **Web:**
`fetchAvailableTemplates`/`fetchTemplateEligibleNodes` + el hook `useAvailableTemplates` (queryKey incluida) y los dos
llamadores directos (`NewEntryPage`, `ScheduleDrawer`) cablean `useActiveStructureId()` — esto extiende la coherencia,
sin trabajo extra, a la **programación de rondas** (otro camino de creación que reusa el mismo hook). **UX/coherencia, NO
hard-block:** `create()` ya valida el nodo con ABAC + asignación de plantilla; no se añadió bloqueo nuevo al materializar
(la estructura del nodo ES su estructura). **by-id/deep-links intactos** (el filtro vive solo en pickers/listados).
**«Nueva incidencia» NO se tocó** (su picker ya usa `useAccessibleOrgTree`, que YA pasa `?structureId=` ⇒ coherente).
**Catálogos COMPARTIDOS intactos** (el Configurador sigue mostrando el catálogo global completo). **Sin migración, sin
permiso nuevo, sin FLUSHALL.** typecheck/lint(0)/build/test (252+6) verdes; `smoke-estructura-creacion-coherente.py`
**16/16** (usuario dual A+B separa plantillas/nodos por estructura activa · global siempre visible · tplA bajo
structureId=B ⇒ vacío · **frontera ABAC**: acotado a A jamás ve B aunque no pase structureId) + regresión aislamiento
33/33 · multi-estructura 33/33 · template-scope 14/14 · asistente L3b 15/15 · ux-premium L3 18/18 · grid 25/25.
**PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L4 ni el panorama multi-módulo. **Siguiente: panorama multi-módulo,
L4 (jerarquías alternativas) u otro que defina el dueño.**

**2026-06-24 — 🎯 L3b · Asistente «crear una nueva área» ✅** (`feat/estructura-asistente-area`). Levantar un
"área/negocio" nuevo deja de ser un trámite de 3 pasos sueltos y dispersos (crear estructura → ir a definir niveles →
crear el nodo raíz, con el riesgo de dejar una estructura **huérfana sin nodos**, no operable y oculta del selector) y
pasa a ser **un solo flujo guiado premium**. Es lo que se DIFIRIÓ en L3. **(1) Wizard de 3 pasos** en un `Modal` lanzado
desde el `StructuresDrawer` (botón **«Nueva área»**, que REEMPLAZA al "Nueva estructura" simple — el create vacío era
justo la fricción que esto elimina): **Paso 1 · Identidad** (nombre, clave autogenerada/editable, descripción, color/ícono
reusando el editor de identidad L3 con vista previa del badge); **Paso 2 · Niveles base** (3 **plantillas** curadas —
Minería: Faena→Planta→Área→Equipo · Manufactura: Planta→Línea→Estación · TI: Contrato→Sitio→Host — + **Desde cero**, con
edición manual: agregar/quitar/renombrar/reordenar; mínimo 1 nivel); **Paso 3 · Nodo raíz** (nombre + código opcional en
el nivel 0) con **resumen** de lo que se creará. **(2) Backend ATÓMICO** `POST /structure/structures/provision`
(`StructureService.provisionStructure`): las **tres** inserciones (estructura + niveles + nodo raíz) van en **una sola
transacción Prisma** ⇒ o el área entera queda **operable** (≥1 nodo), o **no se crea nada** — sin estructuras huérfanas,
sin lógica de compensación frágil en el front. **Sin migración** (modelos existentes), **sin permiso nuevo** (reusa
`module:structure:manage` = super-admin; el controller mantiene el gate grueso `orglevel:manage` y el servicio re-autoriza
super-admin) ⇒ **sin `db:seed`/FLUSHALL**. **(3) Componente `Stepper`** presentacional nuevo en `packages/ui` (indicador
de pasos numerado con estado hecho/actual/pendiente + a11y; la lógica del wizard vive en el feature) y **subcomponente
`StructureIdentityFields`** extraído del `StructuresDrawer` para reusar el editor de identidad L3 sin duplicar (única
fuente de verdad de la identidad en la UI; el CSS se movió a `StructureIdentityFields.module.css`). **Al terminar OK:**
fija la nueva estructura como **activa** (`setActive`) + toast + navega a `/estructura` para seguir poblándola. **Fallo
parcial:** se disuelve con la transacción (no hay estado a medias); el wizard muestra UN banner de error en el submit y
permite reintentar. **Decisiones** (en DECISIONS): endpoint atómico vs orquestación front (atómico, integridad en la
frontera del agregado) · «Nueva área» reemplaza al create simple · Stepper en `packages/ui` · 3 plantillas + manual.
typecheck/lint(0)/build/test (252+6) verdes; `smoke-estructura-asistente.py` **15/15** (provision crea área operable
nodeCount≥1 + niveles en orden + nodo raíz en nivel 0; clave duplicada/0-niveles ⇒ 400 SIN huérfana; usuario con
`orglevel:manage` pero sin super-admin ⇒ 403) + regresión ux-premium 18/18 · admin-delegada 29/29 · ciclo-vida 17/17 ·
rol-alcance 14/14 · aislamiento L1 33/33 · multi-estructura 33/33 · template-scope 14/14. **PENDIENTE: smoke VISUAL del
dueño.** **NO** se hizo L4 ni el panorama multi-módulo. **Siguiente: L4 (jerarquías alternativas) cuando el negocio lo
pida, o el panorama multi-módulo.**

**2026-06-24 — 🎯 L3 · UX premium cross-estructura ✅** (`feat/estructura-ux-premium`). Trabajar con varias estructuras
ahora se siente de clase mundial y SIN ambigüedad. Tres piezas (el asistente "crear área" se DIFIRIÓ a **L3b**).
**(1) Contexto inconfundible.** Cada estructura tiene **color de acento** (clave de una paleta curada Lyra de 8 acentos)
e **ícono** (lista blanca Lucide), configurables por el super-admin con **fallback determinístico** por `key` (hash
FNV-1a) cuando faltan ⇒ cero pérdida. Migración aditiva `20260624130000_add_structure_identity` (`OrgStructure.color`/`icon`
nullable). Un **badge "Estás en: <estructura>"** SIEMPRE visible en el topbar (borde-izquierdo + tinte translúcido del
acento) que ES el disparador del switcher, para que nadie registre datos en la estructura equivocada. Editor de
color/ícono con **vista previa** en el `StructuresDrawer`. Tokens nuevos `--accent-<clave>` + `--structure-accent`/
`--structure-accent-soft` en `tokens/index.css` (claro/oscuro, **sin hex en componentes**; Recharts usa `var()`).
**(2) Vista ejecutiva «Panorama».** Ruta `/panorama` (en sidebar SOLO con el permiso) que CONSOLIDA KPIs de incidencias
(abiertas/críticas/vencidas/SLA) de **todas** las estructuras accesibles a la vez: endpoint `GET /incidents/dashboard/cross`
+ `IncidentDashboardService.buildCross` (reuso, read-only, counts agregados en el backend). Es la **EXCEPCIÓN EXPLÍCITA al
aislamiento L1** (cruza la estructura activa), pero **el ABAC por nodo sigue siendo la frontera de datos**: el servicio
interseca, por estructura, sus nodos vivos con los nodos accesibles del usuario ⇒ un gerente sin alcance ve todas; uno
acotado, SOLO aquellas donde tiene nodos accesibles (y solo sus nodos). Tarjetas por estructura con identidad +
**drill-down** (fija la estructura activa y entra a Incidencias) + barra comparativa Recharts (tokens del DS). Contrato
`incidents/cross-dashboard.ts` (`CrossDashboard`/`CrossStructureCard`/`sumCrossKpis`). **(3) Switcher pulido:** búsqueda +
identidad por fila (acento + ícono) + a11y; badge estático si hay una sola estructura operable. **Permiso NUEVO
`module:dashboard:cross-view`** (dimensión MODULE, grupo `dashboards`; catálogo 89→90 ⇒ `db:seed` + Redis `FLUSHALL`
hechos). **Decisiones** (en DECISIONS): color CONFIGURABLE con fallback (no derivación pura) · clave de paleta + token
(no hex libre) · acento SUTIL (badge+switcher, sin gradiente full-screen) · permiso de alto nivel = excepción documentada
a L1 · KPIs primer corte solo incidencias (panorama multi-módulo = deuda) · asistente diferido a L3b. typecheck/lint(0)/
build/test (252+6) verdes; `smoke-estructura-ux-premium.py` **18/18** (identidad en payload + persistencia/validación;
consolida ≥2 estructuras para gerente sin scope; ABAC frontera con usuario acotado [ve A, no B]; gate 403 sin permiso) +
regresión admin-delegada 29/29 · ciclo-vida 17/17 · multi-estructura 33/33 · aislamiento L1 33/33 · rol-alcance 14/14 ·
template-scope 14/14. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L3b/L4. **Siguiente: L3b (asistente) o L4.**

**2026-06-24 — 🎯 L2b · Administración DELEGADA por estructura + red anti-lockout ✅** (`feat/estructura-admin-delegada`).
Un administrador deja de ser "dios de toda la instalación": ahora se le puede **delegar** la administración de SOLO
ciertas estructuras (su árbol de nodos, sus niveles y su ciclo de vida), mientras el **super-admin** sigue
administrándolo todo. Caso de uso: el "líder de TI" administra la estructura TI (crea nodos, edita niveles, renombra/
archiva), pero NO puede tocar Industrial ni Logística; el dueño sí administra todas. Patrón ServiceNow domain-admin.
**Modelo:** tabla nueva `StructureAdmin(structureId, roleId?/userId?)` (migración aditiva `20260624120000_add_structure_admin_delegation`,
cero pérdida, check de sujeto exclusivo espejo de `Scope`). El alcance de administración = **UNIÓN** de las delegaciones
propias del usuario + las de sus roles, evaluada **EN VIVO** (quitar el rol/la delegación re-acota al instante).
**Autorización CONTEXTUAL centralizada** en `ScopeService` (`getAdministrableStructureIds`/`assertCanAdministerStructure`/
`assertSuperStructureAdmin`), invocada en CADA mutación del `StructureService` (patrón híbrido: el controller mantiene el
gate grueso `orglevel:manage`/`orgnode:*`, el servicio decide el fino contextual). **Reparto:** crear/eliminar estructura y
reordenar el selector = **super-admin only** (provisión global); renombrar/archivar/reactivar X y CRUD de niveles/nodos de X
= **delegado-de-X o super-admin**. **Permiso:** se REUSA `module:structure:manage` (antes latente) como marca de super-admin
(administra todo + reparte delegaciones) — sin clave nueva ⇒ **sin `db:seed`/FLUSHALL**; el rol "Administrador" ya la tiene
⇒ conserva acceso total con cero cambios de grants. **Cierra la deuda (b)** de multi-estructura: `listStructures` =
`accesibles-por-nodo ∪ administrables-por-delegación` ⇒ un delegado VE y arma su estructura aunque aún no tenga nodos
accesibles; el backend marca por fila `canAdminister` para que la UI habilite/oculte la gestión. **Lectura por id sigue por
ABAC** (paridad L1/L2c: L2b restringe MUTAR, no leer). **API:** `PUT /security/{roles,users}/:id/admin-structures` (gate
`module:structure:manage`), detalle de rol/usuario += `adminStructureIds`. **Red ANTI-LOCKOUT** (a petición del dueño, para
que NUNCA se quede la instalación sin quién administre todo): **(A)** el rol de sistema no puede modificar sus permisos
(403; idempotente OK), **(B)** no se quita el rol al último administrador (400), **(C)** no se deshabilita al último admin
activo (400). **Frontend:** componente reusable `AdminStructuresPicker` + sección "Administración delegada de estructuras" en
el `RoleDrawer` (pestaña Alcance) y en el editor de Usuario (pestaña Alcance), editable solo por el super-admin (el resto la
ve read-only); el `StructuresDrawer` respeta la delegación (crear/reordenar/eliminar solo super-admin; editar/archivar por
fila según `canAdminister`). **Decisiones** (en DECISIONS): modelo tabla nueva (no sobrecargar `Scope`) · sujeto rol Y usuario
(unión, paridad L2a) · super-admin = permiso explícito (NO "sin delegaciones", que sería frágil) · anti-lockout como invariante
"≥1 admin activo con rol de sistema". typecheck/lint(0)/build verdes; contracts 314 · API 252 · web 6;
`smoke-estructura-admin-delegada.py` **29/29** (super-admin todo; delegado A: crea/edita/archiva A 200 pero B 403 en cada
mutación; lee B por ABAC 200; crear/reordenar/eliminar estructura 403; deuda (b): ve y arma C sin nodos; quitar delegación
re-acota en vivo; delegación por ROL une; candados A/B/C) + regresión `smoke-estructura-ciclo-vida` 17/17 ·
`smoke-rol-alcance-nodo` 14/14 · `smoke-aislamiento-estructura` 33/33 · `smoke-multi-estructura` 33/33 · `smoke-template-scope`
14/14. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L3/L4. **Siguiente: L3 (UX premium cross-estructura) o lo que
defina el dueño.** Anterior:

**2026-06-24 — 🎯 L2c · Ciclo de vida de la estructura organizacional ✅** (`feat/estructura-ciclo-vida`).
Permite **ARCHIVAR / REACTIVAR** y **REORDENAR** estructuras desde el `StructuresDrawer`, sin borrar datos. Cierra la
deuda (a) y (c) de multi-estructura. Caso de uso: una empresa cierra temporalmente una línea → archiva su estructura
(deja de aparecer en el selector y en los listados, pero conserva todo su historial), puede reactivarla, y puede
ordenar las estructuras a gusto en el selector. **Hallazgo (verificado en código, no de memoria):** el modelo y buena
parte del ciclo de vida YA existían como efecto colateral de multi-estructura — `OrgStructure.active`/`reportOrder`/
`deletedAt`; `updateStructure` ya togglea `active`; el `StructureSwitcher` ya **oculta archivadas** (`isOperable`) y ya
**sanea el fallback** (si tu estructura activa deja de ser operable, cae a la por defecto); `resolveStructureId` solo
filtra `deletedAt` ⇒ **by-id/deep-link de una archivada sigue legible** (paridad L1). ⇒ **SIN migración.** Lo que
faltaba era UX de primer nivel + robustez. **Backend:** endpoint atómico `PUT /structure/structures/reorder` (lista
ordenada de ids → `reportOrder` 0..n, rechaza ids desconocidos, auditado `structure.structure.reordered`) + guarda
explícita "no archivar la última activa" (la por defecto ya estaba protegida de archivarse). **Frontend:** acciones
**Archivar/Reactivar de primer nivel** por fila (íconos `Archive`/`ArchiveRestore`) + **flechas ↑/↓** para reordenar (la
por defecto va FIJA arriba, el backend la ancla con `isDefault desc`) + toggle **"ver archivadas"** (la gestión las
oculta por defecto; se atenúan al mostrarlas; "Trabajar aquí" deshabilitado en archivadas). El editor se **simplificó a
identidad** (nombre/clave/descripción): el estado y el orden ahora se gobiernan desde la lista, no en dos lugares.
**Decisiones** (en DECISIONS): estado = `active:boolean` (ya cableado; el audit log ya timestampea, sin `archivedAt`) ·
permiso reusado **`orglevel:manage`** (sin clave nueva ⇒ sin `db:seed`/FLUSHALL) · fallback = el saneo existente del
switcher + guarda backend · purga GxP destructiva fuera de alcance (archivar es la respuesta no-destructiva).
typecheck/lint(0)/build verdes; contracts 321 · API 252 · web 6; `smoke-estructura-ciclo-vida.py` **17/17** (crear A/B
configuradas; archivar B ⇒ sigue en gestión inactiva + by-id legible + nodo intacto; reactivar; reorder + inverso +
id desconocido⇒400; archivar la por defecto⇒400) + regresión `smoke-multi-estructura.py` 33/33 ·
`smoke-aislamiento-estructura.py` 33/33 · `smoke-rol-alcance-nodo.py` 14/14 · `smoke-template-scope.py` 14/14.
**PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L2b/L3/L4. **Siguiente: L2b (administración delegada por
estructura) o lo que defina el dueño.** Anterior:

**2026-06-24 — 🎯 L2a · Alcance por NODO a nivel de ROL ✅** (`feat/rol-alcance-nodo`).
Cierra el requerimiento `role-node-scope-requirement`: el alcance ABAC por nodo ahora se configura también en el
**ROL** (no solo usuario por usuario). Caso de uso: "Rol Analista-TI → subárbol TI" se define UNA vez y aplica a
todos sus miembros. Conviven **ambos ejes de sujeto** (rol Y usuario), que se combinan por **UNIÓN** (gana el más
amplio). Verificado en el código antes de tocar nada: la tabla `Scope` ya tenía `roleId` (⇒ **sin migración**) y
`ScopeService.getAccessibleNodes` ya unía `userId` con los roles del usuario en read-time (⇒ el alcance efectivo
YA era la unión; faltaba solo exponer la ESCRITURA del scope del rol, y quitarle el rol re-acota EN VIVO sin
denormalizar). **Backend:** `RolesService.assignScope` = espejo exacto de `UsersService.assignScope` con sujeto
`roleId` (delete+createMany, valida nodos, audita `role.scope.assigned`); `GET /security/roles/:id` ahora trae
`scopes[]`; endpoint nuevo `PUT /security/roles/:id/scope` gateado por **`role:manage`** (sin clave nueva ⇒ **sin
`db:seed`/FLUSHALL**). Contrato `RoleDetail += scopes[]` (reusa `scopeEntrySchema`/`assignScopeRequestSchema`).
**Frontend:** la pestaña "Alcance" del `RoleDrawer` pasa a **dos sub-secciones** rotuladas — "Alcance por nodo"
(reusa `ScopeTreePicker` + `useOrgTree`, respeta la estructura activa) y "Alcance por plantilla" (lo previo).
**Decisiones** (en DECISIONS): permiso reusado `role:manage` (no inventar clave) · una pestaña con dos secciones
(paridad con usuarios) · reuso total del service/picker/contrato. typecheck/lint(0)/build verdes; unit API
**252/252** + web 6; `smoke-rol-alcance-nodo.py` **14/14** (write+read del scope del rol; usuario sin scope propio
+ rol→A ve solo A; sumar scope propio en B AMPLÍA a A∪B; quitar el rol re-acota a B en vivo; `role:manage`⇒403;
nodo inexistente⇒400; lista vacía limpia) + regresión `smoke-aislamiento-estructura.py` 33/33 · `smoke-template-scope.py`
14/14 · `smoke-multi-estructura.py` 33/33. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L2b/L2c/L3/L4.
**Siguiente: L2c (ciclo de vida de estructura: activar/archivar/reordenar) o L2b (administración delegada).** Anterior:

**2026-06-24 — 🔒 AISLAMIENTO COMPLETO por estructura organizacional (Enterprise L1) ✅** (`feat/aislamiento-estructura`).
Cierra la deuda `org-views-vs-isolation`: la plataforma queda ENTERPRISE — ningún usuario/estructura ve datos
operacionales de otra, en NINGÚN listado. Caso guía: una empresa con departamentos Industrial/TI/Logística, cada
uno su estructura, sin fugas. Re-auditado el código (no de memoria): se enumeró CADA endpoint que lista/agrega/
exporta datos operacionales y CADA grilla, marcando antes/después. **L1a (fugas reales de ABAC, cerradas):**
`equipment.search()` no aplicaba `ScopeService` (un usuario acotado veía equipos de otras estructuras) y
`equipment.listByNode()` no validaba el nodo → ahora `search` acota a los nodos accesibles + estructura activa y
`listByNode` exige `canAccessNode` (403). **L1b (filtro por estructura activa en TODOS los listados):** patrón
uniforme — el controller acepta `@Query("structureId")` separado (espejo de `operational-calendar`, SIN tocar los
contratos Zod) y el `where` intersecta en AND con el ABAC por nodo, vía relación `orgNode: { structureId }`
(Incident/LogEntry/ShiftHandover) o resolviendo la estructura a su conjunto de nodos (LogEntryException/LogSchedule/
RoundOccurrence/dashboard). Cubiertos: **incidencias** (list/stats/dashboard), **bitácoras** (list/stats/facets/
**export CSV**), **excepciones** (list), **rondas** (list/occurrences/stats/**my-rounds**/stats), **cambio de
turno** (list). El front pasa `useActiveStructureId()` en `queryKey` + URL en cada hook (incidents/logbook/
exceptions/schedules/shift-handover + búsqueda de equipos). **Decisiones** (confirmadas con el dueño, en
DECISIONS): estructura activa por querystring · usuario acotado a estructura ajena ⇒ lista vacía (intersección) ·
**by-id y descargas puntuales = SOLO ABAC** (no se filtran por estructura activa, para no romper deep-links de la
campanita; la estructura es lente de workspace, no frontera de seguridad — esa es el ABAC). **Notificaciones sin
cambio** (inbox = ownership; outbox = admin global). **NO se tocan los catálogos COMPARTIDOS** (templates/
reference-data/workflows/roles/users/settings/audit/saved-views). typecheck/lint(0)/build verdes;
`smoke-aislamiento-estructura.py` **33/33** (datos reales en A y B; acotado a A ve solo A y `?structureId=B`⇒vacío;
`listByNode(B)`⇒403; admin cambiando estructura ve solo la activa en incidencias/bitácoras/equipos/dashboard) +
unit **252/252** + regresión incidencias 32 · grid 25 · mis-rondas 18 · cambio-turno 29 · excepciones 39 ·
dashboard 24. **PENDIENTE: smoke VISUAL del dueño.** **NO** se hizo L2/L3/L4. **Siguiente: L2 (gobierno: rol
acotado a nodo en UI, administración delegada por estructura) o lo que defina el dueño.** Anterior:

**2026-06-23 — 🔒 Selector de nodos ACOTADO por ABAC + fix de truncado del Combobox ✅** (`feat/scoped-node-selector`).
Bugfix: al **crear una incidencia**, un usuario con alcance acotado veía TODOS los nodos en el selector (la fuga
de ABAC en los SELECTORES que estaba registrada como deuda). Causa: `GET /structure/nodes` (`getTree`) devuelve el
árbol completo y lo usan TANTO los selectores operacionales COMO la administración del árbol (no se podía filtrar
global sin romper la admin). **Solución — camino separado:** nuevo `StructureService.getAccessibleTree(userId)` +
endpoint **`GET /structure/accessible-nodes`** (filtra por `ScopeService.getAccessibleNodeIds`; **sin
`orgnode:read`** — el alcance del usuario ES la autorización, nunca devuelve nodos ajenos), hook
`useAccessibleOrgTree()`. Migrados los selectores de **flujo operacional** (`CreateIncidentModal`, `LogbookPage`,
`ShiftHandoverPage`); la **administración** sigue con `useOrgTree`/`getTree` sin acotar. Respeta estructura activa
y ABAC multi-estructura. **Fix UX del `Combobox` base:** el label largo se desbordaba (el texto suelto no recibía
el ellipsis; la regla truncaba el `.optHint`) → label envuelto en `.optText` truncable + `.optHint` truncado;
el modal de incidencias pasa **nombre + ruta (hint)** en vez de la ruta entera como label. typecheck/lint(0)/build
verdes; `smoke-scoped-node-selector.py` **12/12** (admin 83 nodos; scoped solo su subárbol de 2, NO el padre) +
regresión `smoke-multi-estructura.py` 33/33. Sin permiso/migración/FLUSHALL. **Deuda `org-views-vs-isolation`**
(otros listados operacionales aún sin acotar) sigue abierta; este fix cierra el SELECTOR de nodos. **Siguiente:
seguir poblando el caso Eiser (plantillas) o lo que defina el dueño.**

**2026-06-23 — 💾 Backup de Postgres pre-deploy + cron (OPS, sin features) ✅** (commit `6130774` en `main`).
Cierra el **#4 / última pendiente** del blindaje de deploys (BACKLOG §3). Ahora era urgente: el deploy ya corre
`prisma migrate deploy` contra la BD de **producción** en cada release, y `migrate deploy` es **forward-only** —
el rollback de `update.sh` solo revierte **imágenes**, no el **esquema** ⇒ una migración que corrompa datos sin
backup es pérdida irreversible. **`deploy/onprem/backup.sh`** (espejo del de Lyra Pass, con mejoras de criterio,
NO copia): `pg_dump -Fc` (formato CUSTOM — comprimido, restauración selectiva e **inspeccionable sin aplicarlo**
con `pg_restore --list`/`--schema-only`, a diferencia del SQL plano de Lyra Pass) corrido dentro del contenedor
`postgres:16-alpine` (versión exacta del server); **escritura a `.tmp` + `mv`-atómico** (nunca deja un dump
parcial con nombre bueno — el `pg_dump|gzip>file` de Lyra Pass sí podía); **retención por días (14) con piso
mínimo de copias (10)** — corrige un bug latente del de Lyra Pass (su `-mtime +14` a secas borra TODO tras un mes
sin deploys ni cron, dejando CERO backups). Almacén `deploy/backups/` (gitignored). **Integración en `update.sh`:
`backup()` ANTES de migrar, BLOQUEA por defecto** (decisión del dueño 2026-06-23; válvula de escape
`BACKUP_REQUIRED=false`); nunca corre antes del rollback; se salta solo si Postgres no existe (bootstrap).
**Verificado EN VIVO** (host EC2, BD de prod intacta — `pg_dump` es solo-lectura): dump **286 KB** formato CUSTOM
(600 entradas TOC, server 16.14) · `pg_restore --list` OK · restauración **schema-only a BD descartable** =
**74 tablas**, sin errores de extensión/rol, BD de prueba botada · **rotación** forzada con 15 dumps falsos
añejados = bajó al piso de 10. **Cron diario 03:30 instalado** (`crontab` de `ubuntu` → `backups/backup.log`).
**Siguiente: blindaje de deploys COMPLETO (#1–#4 ✅); próximo módulo a definir con el dueño** (candidato: reversa
GxP de registros sellados, o Fase 6).

**2026-06-23 — 🛡️ Blindaje de deploys continuos (OPS, sin features) ✅** (commit `8e8c9a6` en `main`).
Las dos apps (WatchLog v0.1.7 + Lyra Pass) comparten el EC2 y el borde Caddy, ambas en deploy continuo. Se
blindó el pipeline para que **un deploy/fuga de una NUNCA tumbe a la otra**, completando #2 y #3 de BACKLOG §3.
**#2 Límites de memoria por servicio (`mem_limit`, aislamiento por cgroup):** una fuga/pico se queda en su
propio cgroup (OOM-mata SOLO ese contenedor, que se reinicia solo) y no arrastra a la vecina. Topes HOLGADOS
sobre el uso real medido con `docker stats` (la máquina usa ~1.3 GB de 3.7 GB; los topes son TECHOS, no
reservas — su suma puede exceder la RAM física, es correcto). **WatchLog** (`deploy/docker-compose.prod.yml`):
postgres 512m, redis 384m (su `--maxmemory` interno es 256mb ⇒ 256m lo mataría con el fork del bgsave), minio
384m, api 512m (+`NODE_OPTIONS=--max-old-space-size=384` para que V8 haga GC antes del SIGKILL del cgroup),
watchlog-web 128m, migrate 512m. **Lyra Pass** (en su repo, commit `9bfb07e`): postgres **768m** (por su
`shm_size: 256mb` que cuenta contra el cgroup), redis 384m, api 512m (+NODE_OPTIONS), web/admin 256m, worker
384m, migrate 512m, **caddy 192m** (borde/SPOF de ambas, margen extra). **#3 Auto-prune tras deploy EXITOSO**
en ambos `update.sh`: borra SOLO las imágenes de la versión anterior de la PROPIA app (`lyra-watchlog-*` /
`lyra-pass-*` con el tag `$PREV`) + dangling. **Hallazgo:** `docker image prune -f` solo borra dangling; las
versiones viejas quedan **con tag** (no dangling) ⇒ no se reclamaban (5.7 GB acumulados). El borrado dirigido
las reclama, app-scoped (nunca toca en uso ni la app vecina), respetando el rollback. **Verificado en vivo:**
topes aplicados en los 12 contenedores + las **3 URLs → 200** tras recrear (incluido el borde Caddy). Cambios
de config (recrear con `up -d`), sin subir versión ni tag. **Dato:** Lyra Pass ya tiene `backup.sh` y lo corre
antes de cada deploy ⇒ baja urgencia del backup de Postgres de WatchLog (deuda Fase 7). **Pendiente:** el
auto-prune se ejercita solo en el próximo deploy con tag; backup de Postgres de WatchLog (espejar `backup.sh`).

**2026-06-23 — 🏗️ Multi-estructura organizacional ✅** (`feat/multi-estructura-org`).
El dueño pidió (urgente) poder definir **VARIAS estructuras organizacionales** en la misma instalación
single-tenant (cada una con su propio set de niveles y su propio árbol), p. ej. una jerarquía minera
Faena→Planta y otra de infra TI Contrato→Dominio. **NO es multi-tenant.** Plan aprobado; 3 forks por
`AskUserQuestion` (DECISIONS 2026-06-23): **catálogos COMPARTIDOS** (solo árbol+niveles+calendarios por
estructura; plantillas/flujos/tipos/listas siguen únicos) · **aislamiento ESTRICTO** + **selector global
persistido por usuario** con estructuras **derivadas del ABAC** · **permiso REUSADO `orglevel:manage`**.
**Hallazgo clave que bajó el riesgo:** `OrgNode.path` son IDs de nodo (cuid únicos) ⇒ los prefijos
`startsWith` NO colisionan entre estructuras, así que ABAC por nodo y herencia de calendarios por ruta **no
se reescriben**; `structureId` entra solo como filtro/guardia. **Modelo:** nueva `OrgStructure` + `structureId`
en `OrgLevel` (reescopa `@@unique([order])`→`@@unique([structureId, order])` — el bloqueador real), `OrgNode`
(denormalizado en cada nodo, invariante `node.structureId==parent.structureId`, no reparenta entre
estructuras), `OperationalCalendar`/`FiscalCalendar` (default e asignación de nodos **por estructura**, índices
únicos parciales). **Migración aditiva `20260623120000_add_org_structure`:** crea `OrgStructure`, inserta
**"Estructura por defecto"**, backfillea TODO lo legado a ella, reescopa uniques. **Cero pérdida verificada:**
4 niveles/83 nodos/5+5 calendarios + 18 scopes/19 asignaciones/70 bitácoras/71 incidencias intactos bajo la
estructura por defecto. **Backend:** `StructureService`/`Controller` (estructuras CRUD + niveles/árbol por
`?structureId` + invariante de reparent/nivel), `ScopeService.getAccessibleStructureIds` (derivado de los
nodos accesibles), calendarios + resolvers con **fallback al default de la estructura del nodo**, `seed.ts`.
**`deleteStructure` bloquea por NODOS (activos o eliminados, arrastran historial/FK), niveles caen por
cascada** (corrección descubierta por el smoke: borrar el nivel de un nodo soft-deleted daba 500). **Frontend:**
`structure-store` (estructura activa persistida por usuario, espejo de `workspace-store`) + `StructureSelector`
+ `StructuresDrawer` (CRUD) en el header de Estructura; **`useOrgTree`/`useOrgLevels` leen la estructura activa
⇒ TODOS los pickers de nodo** (bitácoras, incidencias, alcance, asignar calendario, cambio de turno) quedan
scoped sin tocarlos uno a uno; listas de calendarios también por estructura activa; selección aislada por
usuario (`syncOwner` en `AuthProvider`). **Verde:** contracts 321 · API 249 (mock `orgStructure` agregado a
`operational-calendar.service.spec`) · web typecheck/lint(0 err)/build · **smoke `smoke-multi-estructura.py`
33/33** (2 estructuras reusando order 0/1 sin choque, niveles/árbol no se mezclan, hijo hereda estructura,
reparent/nivel cruzado ⇒ 400, calendarios por estructura + asignar nodo ajeno ⇒ 400, default no se borra,
estructura con nodos no se borra, vacía sí) + regresión incidencias 32 · cambio-turno 29 · sla 25.
**Reusa `orglevel:manage`** (sin permiso nuevo, sin FLUSHALL). **Pendiente: smoke VISUAL del dueño** (selector
en el header, crear estructura, niveles propios, datos no se mezclan). **Dependencia anotada (fuera de
alcance):** "rol acotado a nodo" (`Scope.roleId` en UI). **Siguiente: lo que defina el dueño** (candidato:
reversa GxP, o "rol acotado a nodo").

**2026-06-22 — 🚀 WatchLog EN VIVO en AWS (`https://lyra.watchlog.itesicws.com`) ✅** (sesión de ops).
Se desplegó WatchLog en producción en el **mismo EC2** que ruta-bus (Lyra Pass), compartiendo máquina y borde Caddy. Flujo: `git tag v*` → GitHub Actions construye imágenes → GHCR → SSH al EC2 → `update.sh` (pull + migrate + up + healthcheck + rollback). **El primer deploy destapó y arregló 7 bugs reales de empaquetado de prod** (detalle en `docs/DEPLOYMENT.md`): `@lyra/llm` faltante en Dockerfile.api · `@nestjs/schedule` dep fantasma · faltaba `.dockerignore` · `pnpm deploy` v10+ (`--legacy` + `dangerouslyAllowAllBuilds` + openssl) · migrate con `pnpm exec` purgaba sin TTY (→ binarios directo) · healthcheck `wget`→`node` · `prisma generate` en el stage runtime final. **Ops resuelto:** disco lleno por imágenes acumuladas (`docker system prune` liberó 4 GB) · **swap 2 GB** · **choque de nombres** `web` entre ambas apps en la red `edge` → rompió el POS de Lyra Pass → servicio renombrado a **`watchlog-web`** (regla: nombres únicos en `edge`) · red `edge` **persistente** en el compose de Lyra Pass + sincronizada en su repo (un redeploy de Lyra Pass ya no tumba a WatchLog). **Imágenes verificadas localmente** (api construye + `PrismaClient`/argon2 inicializan). **En vivo: v0.1.5.** **Pendiente de blindaje (próxima sesión, BACKLOG §2):** #2 límites de memoria por app, #3 auto-prune en el deploy, backup de Postgres. Decisiones: quedarse en São Paulo (latencia Chile > ahorro Virginia), disco gp3 OK.

**2026-06-22 — Despliegue AWS vía GitHub Actions (andamiaje, Fase 7 parcial) 🟡** (`feat/deploy-aws-github-actions`).
El dueño quiere mostrar WatchLog en vivo en `https://lyra.watchlog.itesicws.com`, **compartiendo el EC2** donde ya corre **ruta-bus**. Se investigó el patrón de ruta-bus (que ya fluye): tag `v*` → GitHub Actions construye imágenes → **GHCR** → **SSH al EC2** → `update.sh` (pull + migrate + up + healthcheck/rollback); borde **Caddy** en 80/443 que enruta por dominio con TLS auto. **Forks del dueño (AskUserQuestion):** reusar el Caddy de ruta-bus como **borde compartido** · subdominio `lyra.watchlog.itesicws.com` · gatillo **tag `v*`** · **Postgres en contenedor dedicado**. **Creado en el repo:** `.github/workflows/release.yml` (tag `v*` → build `lyra-watchlog-{api,web,migrate}` → GHCR → SSH deploy) + `ci.yml` (typecheck/lint/test); **target `migrate`** en `docker/Dockerfile.api` (init container con Prisma CLI + migraciones + seed — la imagen `api` se arma con `pnpm deploy --prod` y NO trae el CLI); `deploy/docker-compose.prod.yml` (imágenes GHCR, pg/redis/minio **dedicados**, **sin publicar 80/443**, web en red externa `edge` con alias `watchlog-web` para que el Caddy de borde lo alcance); `deploy/onprem/update.sh` (espejo de ruta-bus, con rollback); `deploy/.env.prod.example`; **`docs/DEPLOYMENT.md`** (runbook completo: DNS, secrets `DEPLOY_SSH_*`, red `edge`, bloque Caddy de ruta-bus, bootstrap con `RUN_SEED`, flujo de release). Compose validado (`docker compose config` ✅). **Pendiente (manos del dueño / host):** crear el registro DNS, los GitHub secrets, `docker network create edge` + enganchar el Caddy de ruta-bus (red + bloque del subdominio), clonar el repo en `/opt/watchlog`, llenar `.env` con secretos, y el **primer deploy** (`v0.1.0` con `RUN_SEED=true`). **Deuda Fase 7:** script de backup de Postgres, `install.sh` idempotente, build-args VITE de branding, observabilidad. **NO toca ruta-bus automáticamente** (el snippet del Caddy + red está documentado para aplicarlo con cuidado).

**2026-06-22 — Estructura: búsqueda de EQUIPOS (ABAC) + fix grilla de equipos (hallazgos de la ronda QA) ✅** (en `main`).
Dos hallazgos más en la prueba. **(1) La búsqueda solo encontraba nodos, no equipos** (buscar "Weinig" no surface el nodo dueño). Como NO había endpoint global de equipos, se agregó `GET /structure/equipment?search=` con **ABAC** (`EquipmentService.searchAccessible` + `ScopeService.getAccessibleNodeIds`: null=sin restricción, Set vacío=nada, si no filtra `orgNodeId IN accesibles`; busca name/tag/code `contains insensitive`, take 100). Frontend: `searchEquipment`/`useEquipmentSearch` (enabled ≥2 chars) en `StructurePage` agrupa los equipos por nodo dueño y los pasa a `OrgTree` (`equipmentHits`): un nodo cuenta como coincidencia por su equipo y muestra los equipos encontrados como **chips** (con ícono llave + resaltado) bajo el nombre; estado "Buscando equipos…" mientras la query está en vuelo. **Corrección de diseño (mismo día):** el primer corte aplicaba ABAC (`ScopeService.getAccessibleNodeIds`), pero quedaba MÁS estricto que el resto del módulo de Estructura — `getTree` devuelve el árbol **COMPLETO** y `listByNode` no aplica scope — así que un admin acotado VEÍA el nodo (REMANUFACTURE) en el árbol pero su búsqueda de equipo daba `[]`. Se quitó el scope: la búsqueda es **GLOBAL**, gated solo por `equipment:view` (consistente con `getTree`/`listByNode`); verificado en vivo que un admin scoped y el super admin obtienen los mismos resultados. **(2) Grilla de equipos:** la columna tag/placa se partía en 2 líneas y el nombre acaparaba → `.code` con `white-space: nowrap`, tag 150→180, nombre acotado a 260 con elipsis. **Verde:** API typecheck + tests **250/250** (equipment 12, +3 de `searchAccessible`: term<2, ABAC sin nodos, acota a accesibles) · web typecheck/lint(0 err)/build/test 6/6. **OJO infra:** la API de watchlog corre desde un **dist compilado** (no `nest --watch`), así que este cambio de backend requiere **rebuild + restart de la API** para activarse (dist ya reconstruido; el frontend degrada elegante mientras tanto: sin equipos, sin error).

**2026-06-22 — Estructura: búsqueda de nodos + QA#3 a sub-pestañas (hallazgos de la ronda QA) ✅** (en `main`).
Durante la prueba manual surgieron dos cosas en la pantalla de Estructura. **(1) QA#3 (equipos de nodos intermedios):** el Molino SAG/Celda Rougher sembrados en Molienda/Flotación quedaban invisibles porque la UI mostraba *o* hijos *o* equipos según el nivel. Por elección de UX del dueño se rehízo a **sub-pestañas «Líneas N · Equipos N» con contador** en `NodeDetail` (default a la pestaña con contenido; el badge de contador hace visible el equipo aunque estés en la otra pestaña; `EquipmentSection` ganó prop `hideTitle`); nodo de último nivel = solo Equipos. **(2) Carencia QA-L#1 (búsqueda):** la pantalla no tenía buscador, así que encontrar un nodo sin saber su estructura obligaba a escanear a mano. Se agregó un **buscador en el header del árbol** (`StructurePage` + `OrgTree` con prop `query`): filtra por nombre/código/cód. externo/descripción (insensible a acentos/mayúsculas), **resalta** la coincidencia y **auto-expande** el camino; estado "Sin coincidencias"; filtro en memoria sobre el árbol ya cargado (server-side diferido para escala). **También se registró la carencia QA-L#2** (niveles de estructura GLOBALES por `@@unique([order])` ⇒ todas las estructuras comparten nombres/semántica por profundidad; multi-industria requeriría `LevelSet` por estructura — **diferido con motivo**). **Verde:** web typecheck/lint(0 err)/build/test 6/6. Solo frontend; sin contratos/API/migración.

**2026-06-22 — Barrido QA (cierres rápidos) + caso de uso liviano "un día de operación" ✅** (`feat/qa-fixes-y-seed-lite`).
Sesión de **entender, cerrar/diferir lo abierto de Fases 0–5 y HABILITAR una prueba manual end-to-end** (sin features nuevas). **Parte A — inventario y cierres:** se confirmó que la gran mayoría de los ~110 ítems abiertos de Fases 0–5 ya están **diferidos con motivo** (Identity v2, escalabilidad, Fase 7) o son sub-fases futuras (2.7.3, 2.9, 2.º corte del motor de reglas, roadmap de datos de referencia); lo genuinamente "colgando" eran los bugs de la QA del 2026-06-18 y los smokes visuales. **Cerrados (5 bugs, fixes):** **QA#4** (i18n de los 16 grupos de la matriz de permisos en `es-CL.ts` — ya no salen en inglés), **QA#2** (toggle mostrar/ocultar en `ForcePasswordChangePage`, patrón `rightSlot`+Eye/EyeOff), **QA#6** (toast transversal "Sin acceso" ante 403: `QueryCache.onError` global → puente `forbidden-notice` → `ForbiddenToastBridge` montado en `ToastProvider`, con throttle 4 s; cierra el "no avisa", empty-states ricos por pantalla = pulido menor diferido), **QA#1** (pestañas del workspace aisladas por usuario: `workspace-store` gana `ownerUserId`+`syncOwner`, `AuthProvider` lo sincroniza al resolver sesión → mismo usuario tras refresh conserva pestañas, otro usuario/logout entra limpio), **QA#3** (equipos de nodos intermedios invisibles — apareció apenas el dueño abrió la prueba: el Molino SAG/Celda Rougher sembrados quedaban ocultos; `NodeDetail` ahora muestra hijos **y** `EquipmentSection` siempre, no excluyente por nivel). **Diferidos con motivo:** QA#5 (propagación del gate a sesiones activas — endurecimiento de sesión propio; QA#6 lo mitiga parcialmente) y la **reversa/anulación GxP de registros SELLADOS** registrada como **MÓDULO CANDIDATO #1** tras la ronda QA (BACKLOG §2, unifica 2.5(a)(d)+2.8.2+`payloadHash`). **Parte B — caso de uso liviano:** `scripts/seed-demo-lite.py` (marca `DEMOLITE`, idempotente, `--clean` **verificado sin residuos**, NO toca DEMOQA [17 nodos/10 usuarios intactos] ni modifica catálogos compartidos) — escenario «Planta Demo Andina» → Concentradora → {Molienda, Flotación} (4 nodos), **7 usuarios** con roles reales + ABAC, **1 plantilla** con 2 secciones y privilegios + umbral/condicional/regla→incidencia + foto, **1 flujo** con firma Part 11 + SLA, **1 ronda** (1 vencida), 2 incidencias en vivo; IA en modo `none` y **MFA apagado** por defecto. Guion vivo `docs/QA_DIA_OPERACION.md` (9 actos de menos a más + **tabla de hallazgos** + **mapeo a los smokes visuales §4** para tacharlos). **Verde:** web typecheck OK · lint 0 errores (4 warnings preexistentes ajenos) · seed probado crear+re-run idempotente+`--clean` limpio. **Solo frontend + script/docs; sin contratos/API/migración/permisos.** **Siguiente: la ronda de prueba manual del dueño con `docs/QA_DIA_OPERACION.md` (cazar bugs/carencias) → luego decidir módulo (candidato: reversa GxP) o Fase 3/6.**

**2026-06-20 — Fix: "Flujos" desaparecido del menú lateral ✅** (`fix/nav-flujos-grupo`).
Reporte del dueño: el módulo **Flujos** no aparecía en el sidebar pese a tener privilegios (rol `admin`), en cualquier navegador. **Diagnóstico (no era de permisos):** verificado en vivo que la BD y `/auth/me` SÍ entregan `module:workflows:view` al usuario; el problema era de **render del menú**. **Causa raíz:** regresión del refactor del menú a grupos colapsables (commit `10af413`): a la ruta `/flujos` se le **olvidó asignar `group`**. `buildNavGroups` arma cada grupo con `routes.filter(r => r.group === group.id)`, así que una ruta `inSidebar:true` SIN `group` queda **fuera de todos los grupos** y desaparece — fallo silencioso, para todos los usuarios. (De paso se confirmó otra cosa no-bug: los permisos efectivos se cachean por usuario en Redis 5 min y un `db:seed` externo no invalida esa caché → conviene `FLUSHALL` tras seed; pero NO era la causa aquí.) **Fix:** `group: "design"` en la ruta `/flujos` (su grupo correcto, junto a Plantillas/Datos de referencia). **Guarda anti-regresión:** `navigation.spec.ts` (3 tests) — toda ruta `inSidebar` debe tener `group` válido + `buildNavGroups` no pierde rutas visibles + Flujos en sidebar. Solo frontend; sin contratos/API/permisos/migración. typecheck/lint(0)/build verdes; **web tests 6/6** (3 nuevos). El dev server hace HMR; basta **recargar** la página (no requiere re-login: es un fix de código, no de sesión).

**2026-06-20 — Fase 5: Resumen de turno por IA · prompt v3 (más potente, sin inventar) ✅** (`feat/resumen-ia-v3`).
Feedback del dueño: el resumen por IA "se sentía pobre, no era para WOW; debe ser más potente, con explicaciones e incluso recomendaciones, pero sin inventar nada". Diagnóstico: el prompt **v2** lo amordazaba a propósito (Slice 2 conservador) — prohibía recomendar/juzgar y topaba a 180 palabras en prosa plana ⇒ solo re-listaba los DATOS. **Fork por `AskUserQuestion`: recomendaciones ACOTADAS A LOS DATOS.** **Prompt v3** (`@lyra/llm`, versionado/auditable): ahora **EXPLICA** el significado de los hechos (por qué algo es prioritario; qué condiciona el cierre) y **RECOMIENDA** en un bloque final "Para el turno entrante", pero **cada recomendación referencia un folio/ítem de DATOS** y se limita a priorizar/vigilar/seguir/cumplir plazo; **PROHIBIDO** causas, diagnósticos, repuestos, procedimientos, cifras o fechas fuera de DATOS, y **no calcular tiempos**. Estructura en 3–5 párrafos con subtítulo, ~300 palabras; guarda anti-inyección intacta. **Grounding enriquecido** con señales que ya viven en el snapshot congelado (no inventadas): incidencias con `typeName` + `dueLabel` (plazo es-CL+TZ del nodo); acciones/reportes con su **incidencia padre** (`incidentFolio`) + `dueLabel`, rotulados "condicionan el cierre"; `SUMMARY_MAX_TOKENS` 700→900. El anclaje sigue ironclad (AC-IA-2/3): todo rastreable a una línea de DATOS; crudo determinista visible al lado; firma humana; `none`/fallback/streaming sin cambios. **Sin migración.** Tests: **@lyra/llm 11** (fixture + aserciones de grounding v3 + versión v3) · **API 247**; typecheck/lint(0)/build verdes. Smoke en vivo **`smoke-ia-config.py` 20/20 · `smoke-ia-stream.py` 13/13 · `smoke-cambio-turno.py` 29/29** (el grounding v3 fluye end-to-end con el servidor OpenAI-compatible fake). **Pendiente: smoke VISUAL del dueño con su proveedor real (Anthropic/local)** — la calidad de la prosa solo se aprecia con un modelo de verdad; los smokes usan un echo fake. **Deuda viva (sin cambios):** scrubber PII más completo (nombres) · panel de costo sobre `AiGenerationLog`.

**2026-06-19 — Fase 5: Cambio de turno · Slice 4 (EXPORT PDF del acta de entrega de turno) ✅ → FASE 5 COMPLETA** (`feat/cambio-turno-acta-pdf`).
El WoW: desde una entrega FIRMADA, cualquiera con acceso descarga un **acta PDF de grado auditoría** —identidad Lyra, snapshot CONGELADO, las dos firmas Part 11 y folio + hash verificable— lista para la carpeta del regulador. On-prem, generada en el backend, sin SaaS. **Plan por capas aprobado; 3 forks por `AskUserQuestion` + 4 recomendados (DECISIONS 2026-06-19):** motor **pdfmake** (no Chromium) · COMPILING ⇒ **409** (solo firmada) · **on-demand + hash SHA-256 al vuelo** (sin persistir, sin migración) · reusar `shifthandover:view` · es-CL + TZ del nodo. **Capa 1 — motor PDF (`acta/acta-renderer.ts`):** singleton de pdfmake configurado una vez con **Sora** (títulos) + **Inter** (cuerpo) embebidas como TTF estáticos (`@expo-google-fonts/*`, OFL) referenciadas por ruta con `localAccessPolicy` en lista blanca + `urlAccessPolicy=false` (on-prem, sin recursos externos; AC-PDF-3). `renderActaPdf(doc):Promise<Buffer>`. **Capa 2 — armado PURO (`acta/acta-document.ts`):** `buildActaDocument(input)` desde el `ShiftHandoverDetail` (cockpit congelado) — banda de marca con **gradiente Lyra solo en el encabezado** (SVG inline), documento en **modo claro premium imprimible**, meta (folio/nodo+ruta/turno saliente→entrante/día/ventana/TZ/estado general), resumen firmado + etiqueta determinista|IA, baton con «Heredado», 5 tablas del snapshot (registros/excepciones/incidencias/acciones-reportes/rondas), bloque de **firmas Part 11** (saliente firmó + entrante reconoció/observaciones/método; "Pendiente de reconocimiento" si aún no), bloque de **verificación** (folio + SHA-256 + exportado por/cuándo) y pie con paginación + folio + hash corto. Formato **es-CL** + `scope.timezone`. **Capa hash (`acta/acta-hash.ts`):** `actaIntegrityHash` = SHA-256 de un JSON CANÓNICO (claves ordenadas) del snapshot+firmas+resumen ⇒ determinista (AC-PDF-1) sin migración; semilla del payloadHash de firma pendiente. **Capa 3 — endpoint:** `GET /shift-handover/:id/acta.pdf` (`@Res() reply`, patrón del export CSV; `Content-Type application/pdf` + `Content-Disposition` con nombre significativo `acta-<folio>-<nodo>-<dia>.pdf` + `Cache-Control: no-store`), gate `RequireAnyPermission(view/compile/sign/acknowledge)` (como `getDetail`); `ShiftHandoverService.exportActa` = loadHandover + **ABAC** `assertNodeAccess` (AC-PDF-4) + **409** si COMPILING/CANCELED (AC-PDF-7) + arma desde el snapshot (`toDetail`, frozen) + resuelve breadcrumb de ancestros del nodo + hash + render + **auditoría** `shifthandover.acta.exported` (folio + status + hash; AC-PDF-5). **Capa 4 — web:** botón **«Descargar acta (PDF)»** en el cockpit (panel de sign-off, visible solo SIGNED_OUT/ACKNOWLEDGED) + ícono de descarga en cada fila firmada del **historial**; `downloadHandoverActa` vía `apiBlob` (mantiene Bearer + refresh; un `<a>` no puede mandar Authorization) → `downloadBlob` con el nombre significativo; estado de carga propio; i18n es-CL (`handover.downloadActa/downloadingActa/actaHint/actaError`). **Sin migración · sin permiso nuevo · sin FLUSHALL.** Deps nuevas en watchlog-api: `pdfmake` (+`@types/pdfmake`), `@expo-google-fonts/sora`, `@expo-google-fonts/inter`. Tests: contracts/llm/api/web sin cambios (**api 247 · web 3** verdes); typecheck/lint(0)/build verdes. **Smoke en vivo `scripts/smoke-acta-pdf.py` 17/17** (COMPILING ⇒ 409 · firmada ⇒ 200 + `application/pdf` + magic `%PDF` + tamaño>0 · Content-Disposition con nombre significativo · auditoría con folio+hash · **dos exports ⇒ MISMO hash de integridad** [contenido inmutable; los bytes varían por el CreationDate de PDFKit] · **ABAC** scoped a otro nodo ⇒ 403 · gate operador ⇒ 403 · sigue disponible tras el acuse) **+ regresión `smoke-cambio-turno.py` 29/29 · `smoke-ia-config.py` 20/20 · `smoke-ia-stream.py` 13/13 · `smoke-notificaciones.py` 18/18 · `smoke-notif-inapp.py` 18/18.** **Pendiente: smoke VISUAL del dueño** (descargar desde el cockpit y el historial → acta premium en claro/imprimible, firmas Part 11, folio+hash; COMPILING sin botón). **Deuda (BACKLOG):** persistir el artefacto en MinIO si la carpeta regulatoria lo exige · verificador público de hash · usar el `integrityHash` como payloadHash de la firma Part 11. **Con el Slice 4, la Fase 5 (Cambio de turno) queda COMPLETA → siguiente: Fase 6 (asistente de consulta sobre el histórico) o lo que defina el dueño.**

**2026-06-19 — Fase 5: Cambio de turno · Slice 3 (resumen de turno por IA EN VIVO / streaming token a token) ✅** (`feat/cambio-turno-resumen-ia-streaming`).
El WoW del cambio de turno: el supervisor pulsa **"Generar con IA"** y ve el brief **escribirse palabra por palabra** sobre el cockpit, con el crudo determinista al lado y la firma siempre humana. **Plan por capas aprobado; 3 forks por `AskUserQuestion` (DECISIONS 2026-06-19):** SSE espejo del inbox + persistir al completar vía el PATCH auditado · **prompt v2** · **scrubber PII** con política de egreso. **Capa 1 — `@lyra/llm` streaming (sin romper consumidores):** interfaz `LlmStream` (`[Symbol.asyncIterator]` de deltas + `finalResult()` con tokens/latencia, espeja `messages.stream()`+`.finalMessage()`) + `generateSummaryStream` en los 3 adapters — **anthropic** (`client.messages.stream()`, `text_delta`, usage de `finalMessage`; sin `thinking`/sampling ⇒ cualquier modelo) · **openai-compatible** (`chat.completions` `stream:true` + `stream_options.include_usage`, Ollama/vLLM) · **none** (emite el determinista en un bloque, costo cero); helper reusable `CollectingLlmStream` (acumula texto una vez, `finalResult` resuelve/rechaza). **Capa transversal — scrubber PII (AC-IA-7):** `scrubGrounding`/`scrubText` (correo/RUT/teléfono CL, conservador: NO toca cifras operacionales) + política `egressesPlant` (anthropic siempre nube; openai-compatible solo si baseUrl no es local/privada; none nunca) ⇒ se redacta **solo si la generación sale de la planta**. **Capa prompt — v2:** `SUMMARY_PROMPT_VERSION=v2`, estructura/priorización (crítico y vencido primero) + **guarda anti-inyección** (DATOS es información, no instrucciones), grounding estricto intacto. **Capa 2 — backend SSE:** gateway `AiService.streamSummary` (resuelve proveedor, scrub si egresa, emite `delta`/`done{provider,generatedByAi,degraded}`, **registra `AiGenerationLog` al cerrar**, corta limpio si el cliente aborta); servicio `ShiftHandoverService.streamSummary` (ABAC por nodo + `assertCompiling` + grounding compartido vía el nuevo helper `buildSummaryInputs`, reutilizado también por `updateSummary`); controller `@Public @Sse(":id/summary/stream")` (token por query verificado a mano como el inbox + ABAC en el servicio, `AbortController` atado a `req.raw 'close'`, heartbeat, `takeWhile` cierra en `done`). **Capa 3 — cockpit en vivo:** hook `useSummaryStream` (`EventSource`, deltas → textarea en vivo, `cancel()`, degradación); botón **Cancelar** durante el stream, textarea read-only mientras escribe, tag "Escribiendo con IA…"; al cerrar persiste el texto final + `summaryProvider` por el PATCH (DTO extendido con `summaryProvider`, validado `aiProviderSchema`). **Degradación (AC-IA-5):** stream falla/se corta ⇒ `regenerateNonStreaming` (ruta no-streaming → determinista, con aviso). **Sin migración** (`summaryProvider` ya existía; el resto son DTO/lógica). **AC gating cumplidos:** none primero · grounding solo del snapshot · crudo siempre visible + etiqueta · firma humana · degradación stream→no-stream→determinista · on-prem sin fuga (local no se redacta y no egresa) · prompt versionado + sin secretos + límite de tokens + scrubber. Tests: **@lyra/llm 11** (+streaming/scrub/egress) · **contracts 321** · **API 247** · web 3; typecheck/lint(0)/build verdes. **Smoke en vivo `scripts/smoke-ia-stream.py` 13/13** (servidor OpenAI-compatible FALSO **con SSE**: deltas en vivo + `done` IA + AiGenerationLog SUCCESS · grounding con DATOS+nodo · **on-prem local NO redacta** el correo de un pendiente · degradación [endpoint muerto ⇒ `done{degraded}` + FAILED] · modo none [determinista + sin registro] · gate token inválido · persistencia `summaryProvider`) **+ regresión `smoke-ia-config.py` 20/20 · `smoke-cambio-turno.py` 29/29 · `smoke-notificaciones.py` 18/18 · `smoke-notif-inapp.py` 18/18**. **Pendiente: smoke VISUAL del dueño** (pulsar "Generar con IA" → el texto se escribe en vivo; Cancelar; con proveedor caído cae a no-streaming). **Deuda (BACKLOG):** export PDF (Slice 4) · scrubber PII más completo (nombres) · panel de costo/uso sobre `AiGenerationLog`. **Siguiente: Fase 5 · Slice 4 (export PDF del acta de entrega).**

**2026-06-19 — Cambio de turno: fix "se queda pensando" al abrir desde la notificación + endurecimiento ✅** (`feat/cambio-turno-deeplink-fix`).
Bug del dueño: al abrir una entrega desde la campanita, la pestaña quedaba en spinner indefinido. **Diagnóstico (verificado contra la BD):** el deep link, los datos y los permisos del destinatario eran CORRECTOS (la API devuelve 200) — el problema era de **resiliencia de la UI**: `CockpitView` solo evaluaba `isLoading || !detail` y, si la carga fallaba por cualquier causa (red/token transitorio en la navegación, o un 403 de permiso), **se quedaba en spinner para siempre**. **Fixes:** (1) `CockpitView` ahora **maneja el error**: si la carga falla muestra un `EmptyState` con el motivo (mensaje real, o aviso de permiso si es 403) y un botón **Reintentar** (`refetch`); un panel de producción **nunca** debe colgarse en spinner. (2) `useHandoverDetail` con `retry: 1` (el error aflora rápido, sin 3 reintentos). (3) **Permiso de lectura ampliado**: `GET /shift-handover/:id` pasa de `RequirePermission("shifthandover:view")` a **`RequireAnyPermission(view, compile, sign, acknowledge)`** — el ENTRANTE a menudo solo tiene `acknowledge`; sin esto el deep link de la notificación le daría 403. (4) **Brecha del seed demo:** los roles `demoqa-supervisor`/`demoqa-jefe-planta` no tenían NINGÚN permiso `shifthandover:*` (el seed es anterior a la Fase 5) → agregados los 5 (view/compile/sign/acknowledge + `module:handover:view`), aplicado también en vivo (`RolePermission` + Redis FLUSHALL). (5) **Smoke robusto:** `smoke-cambio-turno.py` `pick_nodes` ahora prefiere el nodo más profundo **sin entregas previas** (aísla la baton de datos de prueba ya existentes; antes colisionaba con handovers que el dueño creó probando "Faena Demo QA"). i18n es-CL (`handover.loadErrorTitle/loadErrorDesc/loadForbidden/retry`). typecheck/lint(0)/build verdes; **smoke-cambio-turno 29/29** (incl. gates operador 403 + ABAC scoped, que verifican el nuevo `RequireAnyPermission`). **Pendiente: smoke VISUAL del dueño** (abrir desde la campanita carga la entrega; si falla, muestra error+Reintentar, no spinner infinito). **Siguiente: Fase 5 · Slice 3 (streaming del resumen).**

**2026-06-18 — Cambio de turno: UX ronda 2 (consistencia del detalle + persistencia + CTA enterprise) ✅** (`feat/cambio-turno-ux-fixes`).
Segundo pase por feedback del dueño. Solo frontend. **(1) Detalle de incidencias CONSISTENTE y en contexto:** antes el cockpit mostraba un panel de detalle PROPIO (liviano) distinto al del módulo de incidencias y un botón "Abrir en Incidencias" que llevaba a la lista sin seleccionar nada (dead-end). *Decisión/justificación:* en un producto enterprise el usuario no debe ver dos paneles distintos para el mismo objeto ni navegar y perderse — así que ahora **se reutiliza el MISMO `IncidentDetailDrawer` del módulo** (pestañas Resumen/Acciones/Investigación/Reportes/Actividad, con sus acciones y permisos), abierto **en contexto** sobre el cockpit. Aplica a filas de Incidencias, a Acciones/Reportes (abren su incidencia padre vía `incidentId`), a Excepciones que derivaron incidencia (`incidentId`) y a pendientes del baton con `refType="Incident"`. Gated por `incident:view`; sin el permiso cae al panel liviano. **Se eliminaron los deep-links "Abrir en…"** (la información ya está en contexto). Objetos sin módulo rico (registros, rondas, excepciones sin incidencia, notas del baton) siguen con el `RowDetailDrawer` liviano (todos sus campos). **(2) Persistencia de la pestaña:** volver a Cambio de turno ya **no la vacía** — la entrega y el nodo activos se guardan en `sessionStorage` (`handover.activeId`/`nodeId`) y se restauran al montar. **(3) Panel derecho más ancho por defecto:** `468px` (antes ~340), acotado a `[380, 560]` (clave `asideW.v2` para que aplique a quienes ya tenían un ancho guardado) — más sitio para leer el resumen sin estirarse feo. **(4) CTA de firma a escala:** "Firmar y entregar turno"/"Reconocer" dejan de ser **botones de ancho completo** (se veía poco enterprise); ahora van en una **tarjeta de acción** centrada con una línea de contexto y un botón de ancho de contenido (`min-width 260`). **Reusa `IncidentDetailDrawer`/`Modal`/`Drawer`** del DS; i18n es-CL (`handover.signReady`; se quitaron `openInIncidents/openInRounds`). typecheck/lint(0)/build verdes; dev :5173 con HMR. **Pendiente: smoke VISUAL del dueño** (abrir incidencia/acción/reporte/excepción/pendiente-incidencia → mismo drawer del módulo; volver a la pestaña conserva la entrega; ancho derecho por defecto; CTA de firma). **Siguiente: Fase 5 · Slice 3 (streaming del resumen).**

**2026-06-18 — Cambio de turno: retoques UX premium del cockpit (legibilidad + navegabilidad + paneles redimensionables) ✅** (`feat/cambio-turno-ux`).
Pulido por feedback del dueño: la pantalla funcionaba pero la densidad de lectura no estaba "enterprise". Solo frontend (sin contratos/API/migración). **(1) Paneles REDIMENSIONABLES:** el cockpit de 3 zonas (nav · contenido · resumen+sign-off) pasa de grid fijo `232px 1fr 340px` a **grid con anchos por variable CSS** (`--nav-w`/`--aside-w`) + **2 divisores arrastrables** (`ColHandle`, pointer+teclado, doble-clic restablece); centro flexible (`minmax(320px,1fr)`); ancho **persistido por usuario** (`useColWidth` → localStorage); apila en móvil (<1180). *Se descartó reutilizar `ResizableSplit` del DS:* es un card 2-panel con `overflow-y:auto`+`min-height`+borde (master-detail), y anidarlo doble-bordeaba la nav, metía un card anidado y rompía el `position:sticky` de los paneles — un resizer propio de columnas encaja mejor con el layout de 3 cards sobre el fondo. **(2) Narrativa del resumen ampliable:** el textarea sube de **7→10 filas** + botón **"Ampliar"** (Maximize2) que abre un **Modal xl** con editor cómodo (status + textarea 18 filas + Regenerar/IA) y el **crudo determinista LADO A LADO** (no en `<details>`) para contrastar; en lectura el modal muestra el texto grande + crudo. Persiste al cerrar. **(3) Navegabilidad de los ítems centrales:** cada fila del cockpit (registros/excepciones/incidencias/acciones-reportes/rondas) y cada pendiente (baton) es **clicable → `Drawer` lateral de detalle** (`RowDetailDrawer`) con TODOS los campos (folio, tipo, estado, severidad, plazo, flags…) + chevron de affordance + botón **"Abrir en Incidencias/Mis rondas"** (deep link) cuando aplica. **Reusa primitivos del DS** (`Modal`, `Drawer`) + i18n es-CL (`handover.expand/viewDetail/openInIncidents/openInRounds`). Identidad Lyra (tokens, claro/oscuro, 44px, a11y con role/aria en divisores). typecheck/lint(0 errores)/build verdes; dev :5173 con HMR. **Pendiente: smoke VISUAL del dueño.** **Siguiente: Fase 5 · Slice 3 (streaming del resumen).**

**2026-06-18 — Fase 5: Cambio de turno · Slice 2 (IA ADMINISTRABLE desde la app + resumen de turno por IA grounded) ✅** (`feat/ia-administrable`).
Convierte la IA del ecosistema de "config por `.env`" a un **módulo administrable de primera clase**, espejo del correo saliente del Bloque N: un admin elige el proveedor (ninguno / Anthropic / local), pega su clave (cifrada, write-only), pulsa **Probar** y ve una respuesta real, todo desde `/configuracion` sin reiniciar. Primer consumidor visible: el **resumen de turno por IA** (grounded al snapshot, etiqueta "generado por IA · revisar", crudo determinista siempre visible al lado, firma humana Part 11). **Plan por capas aprobado; 4 forks por `AskUserQuestion` + 3 recomendados (DECISIONS 2026-06-18):** (a) **tabla dedicada `AiSettings`** (no singleton — elección del dueño); (b) **un proveedor global** (capacidad como contexto para Fase 6); (c) Slice 2 **completo**; (d) adapters **none+anthropic+openai-compatible**; (e) **tabla `AiGenerationLog`** (gobernanza de costo); (f) **streaming DIFERIDO a Slice 3**; (g) defaults **`claude-opus-4-8`** (nube) / **`qwen2.5:7b-instruct`** vía Ollama (local). **Capa 1 — `@lyra/llm`** (packages/): interfaz abstracta `LlmProvider` (`generateSummary`+`complete`) + factory + adapters `none` (determinista/offline) · `anthropic` (`@anthropic-ai/sdk`, no-streaming, sin `thinking`/`effort` para servir cualquier modelo) · `openai-compatible` (`openai` SDK por `baseURL`); **prompt VERSIONADO** (`SUMMARY_PROMPT_VERSION=v1`) + grounding por construcción (`buildSummaryUserPrompt` enumera el bloque DATOS); **decoplado de `@lyra/contracts`** (recibe `fallbackText`+`grounding` genéricos ⇒ reusable por insights/RAG de Fase 6 sin reescribir). **Capa 2 — config en BD cifrada:** modelo `AiSettings` (singleton, `apiKeyEnc` AES-256-GCM **write-only**, `configuredAt` null⇒source=env) + `AiGenerationLog` (provider/model/tokens/latencyMs/status/handoverId) — migración aditiva `20260618010000_add_ai_admin` (`db execute`+`migrate resolve`). `AiConfigService` espejo de `EmailConfigService` (`getPublic`/`getResolved`/`resolveFrom`/`set`). **Capa 3 — endpoints + Probar + permiso + auditoría:** `AiController` `GET/PUT /settings/ai` + `POST /settings/ai/test` (gate **`ai:config`** nuevo — cat. **88→89**, db:seed + Redis FLUSHALL aplicado); cambios auditados sin la clave; `AiService` (gateway) resuelve el proveedor, ejecuta, **registra cada generación** y **degrada a determinista** ante fallo (AC-IA-5). **Capa 4 — UI:** tab **"Inteligencia Artificial"** en `/configuracion` (`AiSettingsPanel`, reusa el CSS del correo): toggle activar, selector proveedor, modelo, baseURL (solo local), clave write-only con `keySet`, botón **Probar** con resultado en vivo (latencia + respuesta). **Capa 5 — resumen de turno por IA:** `updateSummary` enruta `regenerate+useAi` por `AiService` (grounding desde el cockpit congelado vía `buildSummaryGrounding`), persiste `summaryProvider` (columna ya existía); cockpit con botón **"Generar con IA"** + etiqueta "generado por IA · revisar" + `<details>` con el crudo determinista (AC-IA-3) + aviso de degradación; firma sigue humana. **Bugfix latente (Slice 1):** `updateSummary` recompilaba el cockpit con `nodeName=""` (el resumen decía "en ."); ahora resuelve el nombre del nodo como `toDetail`. **i18n es-CL** (`settings.ai.*`, `settings.cat.ai`, `permGroups.ai`, `handover.summaryAi/generateAi/crudoTitle/aiGenerated/aiDegraded`). **Sin secretos en repo; `.env.example` con fallbacks `AI_*` alineados.** Tests: **contracts 321** (+6 ai) · **API 247** · **@lyra/llm 6** (nuevo) · web 3; typecheck/lint(0)/build verdes. **Smoke en vivo `scripts/smoke-ia-config.py` 20/20** (servidor OpenAI-compatible FALSO en proceso: gate 403 · default env/none · write-only + keySet + clave CIFRADA en BD + re-PUT conserva · Probar real + fake recibió · degradación Probar [endpoint muerto] · **resumen IA grounded** [summaryProvider openai-compatible + el prompt contiene DATOS y el nodo + AiGenerationLog SUCCESS] · **degradación del resumen** [IA caída ⇒ determinista + AiGenerationLog FAILED] · modo none sin registro) **+ regresión `smoke-cambio-turno.py` 29/29 + `smoke-notificaciones.py` 18/18**. **Pendiente: smoke VISUAL del dueño.** **Deuda (BACKLOG):** streaming del resumen (Slice 3) · export PDF (Slice 4) · panel de costo/uso sobre `AiGenerationLog` · scrubber de PII explícito (AC-IA-7). **Siguiente: Fase 5 · Slice 3 (resumen IA generativo + streaming).**

**2026-06-18 — Fase 5: Cambio de turno (Shift Handover) · Slice 1 (núcleo, sin IA) ✅** (`feat/cambio-turno`).
Primer slice de la Fase 5: la **entrega de turno firmada de dos partes**, auto-compilada por nodo+turno con ABAC, resumen
DETERMINISTA (sin IA) y baton de pendientes que rueda. Estándar investigado y citado (HSE-UK *Effective Shift Handover* OTO 96 003 +
HSG48; CCPS/AIChE *Conduct of Operations*; lecciones CSB Texas City 2005 / Piper Alpha 1988; referentes Hexagon J5 · AVEVA eSOMS ·
Honeywell). **Plan por capas aprobado; 4 forks por `AskUserQuestion` + 2 recomendados (DECISIONS 2026-06-18):** (a) alcance por
**nodo (nivel configurable) + turno + día operacional** (turno/ventana del `OperationalCalendar`); (b) **entidad dedicada con ciclo
FIJO de 3 pasos** reusando SOLO la firma Part 11 (NO `WorkflowDefinition` configurable — objeción del agente aceptada); (c) **vista en
vivo + snapshot CONGELADO al firmar**; (d) **baton** = objetos abiertos del alcance + notas manuales que ruedan (CARRIED) hasta
cerrarse; (e) **4 permisos** `shifthandover:view/:compile/:sign/:acknowledge` + `module:handover:view` (segregación saliente≠entrante;
cat. **83→88**); (f) **notificación** `handover.ready` (Bloque N, correo + campanita) al rol del turno entrante (ABAC). **Contratos**
(`@lyra/contracts/shift-handover`): estados + cockpit (secciones ENTRIES/EXCEPTIONS/INCIDENTS/FOLLOWUP/ROUNDS/PENDING) + baton +
sign-off + requests + helpers PUROS `resolveHandoverWindow` (turno saliente/entrante + ventana UTC vía `zonedTimeToUtc`) /
`buildDeterministicSummary` (brief por secciones, fuente del modo `none`) / `shiftHandoverCode` + specs. **Modelo:** `ShiftHandover`
(alcance + snapshot congelado + firma saliente/acuse entrante inline Part 11) + `ShiftHandoverItem` (baton OPEN/CARRIED/CLOSED) +
`ShiftHandoverActivity` (timeline). Migración aditiva `20260618000000_add_shift_handover` (3 enums + 3 tablas; se quitó del diff un
DROP INDEX ajeno de drift). **API:** `ShiftHandoverCompilerService` (ABAC = subárbol del nodo ∩ nodos accesibles; entradas selladas /
excepciones / incidencias abiertas / CAPA+reportes pendientes-vencidos / rondas, en la ventana del turno) + `ShiftHandoverService`
(compile get-or-create + `rollBatonFromPrevious` [notas manuales→CARRIED] + `syncBaton` [objetos de dominio vivos] · updateSummary/
addItem/updateItem · **signOut** [reauth Part 11 → SIGNED_OUT + snapshot congelado + emite `handover.ready`] · **acknowledge** [reauth +
checks/observaciones → ACKNOWLEDGED; bloquea si es el mismo que entregó] · cancel) + controller (9 endpoints, gates por permiso) +
módulo registrado + caso `handover.ready` en el resolver del Bloque N (roles con `shifthandover:acknowledge` ∩ ABAC nodo, − saliente)
+ plantilla EMAIL seed. **Web:** `/cambio-turno` cockpit **maestro-detalle de 3 zonas** (nav de secciones con contadores · contenido
de la sección · panel derecho: turno saliente→entrante + resumen determinista editable + sign-off Part 11 + sub-modo "Recibo" con
checks/observaciones + baton) + **historial** read-only con filtros 1 línea + paginación + ABAC + deep link `?handoverId=`
(campanita/correo); modal de reauth Part 11; nav en grupo Operación; i18n es-CL. Identidad Lyra (tokens, Sora/Inter, Lucide,
claro/oscuro, 44px, glass sutil, gradiente solo en énfasis). **Sin secretos; .env.example sin cambios.** Tests: **contracts 326**
(+5) · **API 247** · web 3; typecheck/lint(0 errores)/build verdes. **Smoke en vivo `scripts/smoke-cambio-turno.py` 29/29** (compile
get-or-create + idempotente · ventana/turno resueltos · baton manual rueda CARRIED · baton de dominio auto-incluye incidencia abierta ·
resumen determinista menciona estado/pendientes · firma clave inválida 401 / correcta → SIGNED_OUT + snapshot congelado · `handover.ready`
emitido · **segregación: el saliente no reconoce 400** · acuse entrante → ACKNOWLEDGED + checks/observaciones · inmutable tras acuse 400 ·
historial + filtros · **ABAC: scoped a otro nodo ⇒ 403 en compile + no ve la entrega** · gates operador 403 en compile/list/sign/ack)
**+ regresión `smoke-notificaciones.py` 18/18 · `smoke-notif-inapp.py` 18/18 · `smoke-incidencias.py` 32/32 · `smoke-incidencias-sla.py`
25/25** sin romper. **Pendiente: smoke VISUAL del dueño** (cockpit 3 zonas claro/oscuro/responsive, entrega→firma→recibo, baton,
historial, deep link de la campanita). **Slice 2 (IA administrable desde la app, config en BD cifrada/write-only, none/anthropic/local,
permiso `ai:config`, auditoría, tab en `/configuracion`) DEJADO ANOTADÍSIMO** en DECISIONS/BACKLOG con la referencia a `ruta-bus` y los
AC-IA-1..7 — **NO construido en esta sesión**. **Siguiente: Fase 5 · Slice 2 (fundación `@lyra/llm` + IA administrable).**

**2026-06-17 — Fase 4.5: Dashboard de incidencias (tendencias + indicadores de gestión) ✅ → FASE 4 COMPLETA** (`feat/incidencias-dashboard`).
Cierra la 4.5 y con ella la **Fase 4 de Incidencias** (4.0 núcleo · 4.1 excepciones · 4.2a CAPA · 4.2b investigación · 4.3
reportabilidad · 4.4 SLA · **4.5 dashboard**). Una pantalla de **análisis read-only** con ABAC por nodo (nunca muestra lo que el
usuario no puede ver), filtros en 1 línea + rango de fechas, gráficos premium (identidad Lyra, claro/oscuro) y export CSV. **Métricas
según estándar (no inventadas):** ISO 45001 §9.1 (conteos), ITIL/ISO 14224 (MTTR + tendencia creación/cierre), Pareto 80/20
(distribución por tipo), ISO 9001 §10.2 (CAPA + eficacia), ITIL SLA attainment (% dentro de plazo), fiabilidad (reincidencia). **IF/IG
DIFERIDOS** (requieren HH trabajadas, fuente inexistente; BACKLOG). **Plan aprobado; 3 forks contestados por el dueño + 3 recomendados
no objetados (DECISIONS 2026-06-17):** (a) **página propia `/incidencias/dashboard`** con botón en el header de `/incidencias` (NO
sidebar, evita doble-resaltado); (b) **un endpoint SQL dedicado** (`groupBy` + `$queryRaw` acotado), **nunca filas al cliente**, mismo
ABAC que la lista, **TZ de planta** (`PLANT_TIME_ZONE`, def. America/Santiago); (c) **Recharts** (ya era dependencia, colores vía
tokens del DS); (d) **export CSV** (PNG diferido); (e) **sin permiso nuevo** (reusa `incident:view`, sin migración, sin FLUSHALL); (f)
**drill-down** por querystring. **Contratos** (`@lyra/contracts/incidents/dashboard`): `incidentDashboardQuerySchema` +
`incidentDashboardSchema` (KPIs + tendencia + 6 distribuciones + reincidencia + `range` con bucket/TZ/ventana) + helpers PUROS
`defaultDashboardRange`/`defaultBucketForRange`/`paretoOrder` + 11 specs; `createdFrom`/`createdTo` añadidos a `incidentListQuerySchema`
(aditivo, los usa también `buildWhere`). **API:** `IncidentDashboardService.build()` (ABAC por nodo replicando `buildWhere`; **KPIs de
estado vivo** open/critical/overdue/permanencia/CAPA/reportes NO acotados al rango; **created/closed/distribuciones/tendencia/
reincidencia** del periodo; MTTR + cumplimiento SLA por `$queryRaw` con `AVG`/`FILTER`; tendencia bucketizada por `date_trunc(... AT
TIME ZONE)`; permanencia derivada reusa `IncidentsService.openSlaBreachedCount`) + endpoint `GET /incidents/dashboard` (gate
`incident:view`, antes de `:id`). **Web:** `IncidentDashboardPage` (KPI strip + filtros 1 línea + rango + tendencia área + Pareto por
tipo + dona severidad + barras por nodo/origen/equipo/turno + tabla de reincidencia, todo con drill-down a la lista) + `dashboard.module.css`
+ botón "Dashboard" en el header de `IncidentsPage` + ruta `/incidencias/dashboard` + nav (no-sidebar) + i18n. La lista se SIEMBRA desde
el querystring del drill-down. Identidad Lyra (tokens, Sora/Inter, Lucide, claro/oscuro, 44px). **Sin permiso nuevo, sin migración, sin
FLUSHALL.** Tests: **contracts 314** (+11) · **API 247** sin regresión · web 3; typecheck/lint(0)/build verdes. **Smoke en vivo
`scripts/smoke-incidencias-dashboard.py` 24/24** (agregación: created/byNode/bySeverity/byOrigin/Pareto, suma trend==created,
byEquipment≥2, reincidencia par≥2, typeId filtra · cerradas/MTTR≈5h/SLA 100% · **ABAC: usuario temporal scoped a un nodo NO ve el nodo
ajeno** [byNode y created] vs admin que ve ambos · rango lejano⇒0 · range echo · gate operador 403) **+ regresión incidencias 32/32 ·
capa 23/23 · investigación 27/27 · reportabilidad 31/31 · sla 25/25** sin romper. **Pendiente: smoke VISUAL del dueño** (gráficos en
claro/oscuro/responsive, drill-down, export CSV, rango de fechas). **Deuda 4.5 (BACKLOG):** MTTA (creación→asignación) · export PNG del
gráfico · IF/IG (requiere HH trabajadas). **Con 4.5, la FASE 4 de Incidencias queda COMPLETA → siguiente bloque a definir (¿Fase 5
turnos/cambio de turno?).**

**2026-06-17 — Fase 4.4: SLA de incidencias + avisos de plazo + escalamiento ✅** (`feat/incidencias-sla`). Cierra la 4.4 del módulo
de Incidencias: plazos de resolución claros que AVISAN al vencer (correo + campanita) con escalamiento, reusando el motor del Bloque N
(outbox+worker+resolver multi-canal) — NO se reinventó. **Salda 3 deudas:** §21 "vencida" desalineada (permanencia vs plazo), aviso de
plazo de reportes (diferido de 4.3) y vencimiento de acciones CAPA. **Plan aprobado; 6 forks resueltos en la recomendación
(DECISIONS 2026-06-17):** (a) escalamiento = **re-aviso recurrente diario + 1 nivel** configurable (NO tiers PagerDuty); (b) `dueAt`
**auto + override + editable** con timeline/auditoría; (c) destinatarios = **asignado + roles del estado (ABAC) + rol de escalamiento**,
sin externos, fallback a suscripciones; (d) sweeper = **tick en el worker de notificaciones + detección en el dominio**
(`IncidentSlaService`); (e) nombres = **Permanencia** (estado) vs **Plazo** (resolución); (f) **sin permiso nuevo** (cat. 83, sin
FLUSHALL). **Modelo (migración aditiva `20260617170000_add_incident_sla`):** `IncidentType += resolutionDueMinutes Int?`,
`escalationAfterMinutes Int?`, `escalationRoleId String?` (FK Role SetNull) + back-relation. **Contratos** (`@lyra/contracts`): **4
eventos nuevos** al catálogo del Bloque N (`incident.sla.breached`/`incident.overdue`/`incident.action.overdue`/`incident.report.due`,
todos `derived`, grupo `incidents`, con variables whitelisteadas) + helpers PUROS `resolutionDueFromType`/`isResolutionOverdue`/
`escalationThreshold`/`shouldEscalate` + `IncidentTypeDto`/`UpsertIncidentTypeRequest` con los 3 campos SLA (+`escalationRoleName`
resuelto) + `incidentListItemSchema += resolutionOverdue` + `incidentStatsSchema` partido (`overdue`=plazo + nuevo `slaBreached`=
permanencia) + query `+slaBreachedOnly` (y `overdueOnly` re-cableado a plazo, antes muerto) + 8 specs (`sla.spec.ts`). **Seed:** 4
plantillas EMAIL de incidencias (identidad Lyra) + **fix latente del seed** (la unique de `NotificationTemplate` pasó a incluir
`templateId` en Fase A; el seed seguía usando la clave compuesta vieja → `findFirst` con `templateId:null`). **API:** auto-due en
`create` (`resolutionDueFromType` si no hay override) · timeline `DUE_CHANGED` + auditoría en `update` · `stats` partido (overdue=plazo
por columna `dueAt<now`, slaBreached=permanencia derivada in-memory) · `resolutionOverdue` por fila en `toListItems` · `buildWhere`
cablea `overdueOnly` (where real) y `slaBreachedOnly` (id-set derivado para no romper paginación) · `listTypes`/`upsertType` con los
campos SLA + validación del rol de escalamiento · **`IncidentSlaService.findBreaches()`** (detección SQL eficiente, espejo de
`findSlaBreaches`: permanencia por JOIN a `WorkflowState`, plazo/acción/reporte por `dueAt<now`; dedupe diario para el recordatorio,
por ocupación de estado para la permanencia) exportado e inyectado en `NotificationWorkerService.sweep()` · **4 resolvers** en
`NotificationResolverService` (destinatarios = owner + roles del estado [transiciones que salen del estado actual] + escalamiento si
`shouldEscalate`; ABAC por NODO con `filterByNode`; `subscriptionRecipients` ahora hace ABAC node-only sin plantilla). `IncidentsModule`
exporta `IncidentSlaService`; `NotificationsModule` lo importa (sin ciclo). **Web:** KPIs partidos "Plazo vencido"/"Permanencia
excedida" + filtros `overdueOnly`/`slaBreachedOnly` + chips de fila/kanban (Plazo vencido vs Permanencia) · campos **SLA + escalamiento**
en `IncidentTypeModal` (reusa `SlaDurationField`; rol vía `useRoles`, degrada a vacío sin `role:read`) · drawer: "Plazo de resolución"
con badge "vencido" (corrige el bug §21 que coloreaba con `slaBreached`) + **edición inline del plazo** (gate `incident:edit`, lifecycle
OPEN) + fila "Permanencia". i18n es-CL (`notifications.events.incident*` + grupo "Incidencias"). **Sin permiso nuevo (cat. 83, sin
FLUSHALL).** Tests: **contracts 303** (+8) · **API 247** sin regresión; typecheck/lint(0 errores)/build verdes. **Smoke en vivo
`scripts/smoke-incidencias-sla.py` 25/25** (auto-due + override · §21: resolutionOverdue/slaBreached separados, stats partido, filtros
overdueOnly/slaBreachedOnly, DUE_CHANGED · sweeper: los 4 eventos emitidos + outbox al responsable · escalamiento DISCRIMINANTE [estado
inicial sin roles: escalada CON destinatarios vs no-escalada SIN destinatarios] · gates 403 operador) **+ regresión incidencias 32/32 ·
capa 23/23 · investigación 27/27 · reportabilidad 31/31 · notif-avanzadas 22/22 · notif-inapp 18/18 · notificaciones 18/18** (se
actualizó el conteo de eventos/plantillas de 4→8). **Pendiente: smoke VISUAL del dueño** (KPIs/filtros partidos, chips, campos SLA en
el modal de tipo, edición de plazo en el drawer, correo/campanita de los 4 avisos). **Deuda 4.4 (BACKLOG):** picker de rol de
escalamiento usa `role:read` (un admin de catálogo sin ese permiso ve la lista vacía → endpoint `role-options` decoplado del módulo) ·
plantilla INAPP propia (hoy reusa la del correo) · escalamiento multi-nivel/tiers (diferido, BACKLOG). **Con 4.4 cerrada → siguiente:
4.5 (dashboard de incidencias).**

**2026-06-17 — Shell: sidebar premium + Favoritos al topbar ✅** (`feat/sidebar-premium`). Pulido por feedback del dueño tras la
agrupación: los módulos se veían pequeños y el menú estrecho; además pidió mover Favoritos a un menú propio en el topbar. **(1)
Premium del sidebar (solo CSS):** ancho 244→**288px**, texto de módulos 13.5→**14.5px** (+ `letter-spacing` leve), ítem activo a peso
**600**, íconos 18→**19px**, encabezados de grupo 10.5→**11px**, más aire (padding de ítem 44→46px de alto y encabezado 14px arriba).
**Riel colapsado afinado** (2.º feedback): **scrollbar fina** (`scrollbar-width:thin` + `::-webkit-scrollbar` 6px, no la barra gruesa
del sistema) + `overflow-x:hidden`, íconos más compactos (riel 72px, ítem min-height 42px) para que quepan sin scroll en la mayoría
de pantallas.
**(2) Favoritos al topbar (`FavoritesMenu`):** se quita la sección Favoritos del sidebar y se expone como **menú-estrella en el
topbar** (junto a la campanita; reusa el `Menu` de `@lyra/ui`): la estrella se rellena con ≥1 favorito, lista los favoritos (navegar
al clic) y permite **desfijar** desde el `trailing` (estrella con `stopPropagation`, no navega ni cierra). **Se mantiene la estrella
por ítem en el sidebar para FIJAR** (modelo "fijo desde el lateral, accedo desde arriba"); reusa `favorites-store`/`routeByPath` sin
store nuevo. **Archivos:** `AppShell.module.css` (medidas premium + `.menuEmpty`/`.favMenuUnpin`), `FavoritesMenu.tsx` (nuevo),
`Topbar.tsx` (monta el menú), `Sidebar.tsx` (quita ambos bloques de Favoritos —riel y expandido—, sube ícono a 19, mantiene la
estrella por ítem). Identidad Lyra (tokens, claro+oscuro, 44px, a11y). **Sin contratos/API/migración; sin permisos nuevos.**
typecheck/lint(0)/build verdes; dev :5173 con HMR. **Pendiente: smoke VISUAL del dueño** (legibilidad/ancho del lateral en
claro/oscuro; menú-estrella del topbar: fijar desde el lateral, ver/navegar/desfijar arriba, estado vacío; riel colapsado).
**Siguiente: 4.4 (SLA de incidencias + escalamiento + aviso de plazo).**

**2026-06-17 — Shell: menú lateral reestructurado en GRUPOS colapsables ✅** (`feat/sidebar-grupos`). El sidebar había crecido a una
**lista plana de 16 ítems con scrollbar** (poco profesional, no escalaba). Se reorganizó en **grupos con encabezado** (estilo SAP
Fiori / ServiceNow / Linear) que caben **sin scroll**. **Solo UI del shell; sin tocar permisos, rutas ni gateo.** **4 forks resueltos
con el dueño** (DECISIONS 2026-06-17): **(a) esquema** = 3 grupos fijos + Favoritos, tal cual lo propuso el dueño (se le ofrecieron y
descartó "Inicio suelto arriba" y "Estructura→Administración"): **Operación** (Inicio · Bitácoras · Nueva entrada · Mis rondas ·
Incidencias · Excepciones) · **Diseño y datos** (Plantillas · Flujos · Datos de referencia · Estructura · Programación de rondas ·
Calendario operacional · Calendario fiscal) · **Administración** (Seguridad · Notificaciones · Configuración) · **Favoritos**
(dinámico al final). **(b) colapsables persistidos** — cada grupo pliega/despliega, estado en `ui-store.collapsedNavGroups`
(localStorage); **invariante: el grupo del ítem activo se muestra SIEMPRE** aunque esté plegado (`open = !collapsed || hasActive`);
encabezado con chevron + `aria-expanded`. **(c) riel colapsado** (solo-iconos) sin encabezados ni plegado: grupos separados por
**divisores sutiles** (`.navDivider`) + tooltip por ítem (reusa `Tooltip side="right"`); Favoritos = clúster tras un divisor. **(d)
modelo aditivo** = `group?: NavGroupId` en `NavRoute` + `NAV_GROUPS` ordenado + helper PURO `buildNavGroups(visibleRoutes)` (respeta
el orden de `NAV_GROUPS` y de `SIDEBAR_ROUTES`; omite grupos sin ítems visibles por permiso); **`SIDEBAR_ROUTES`/`routeForPath`/
`routeByPath` INTACTOS** → command palette (⌘K), pestañas y breadcrumbs no se enteran de los grupos. **Archivos:** `navigation.ts`
(tipos + grupos + asignación `group` a las 16 rutas + helper), `ui-store.ts` (`collapsedNavGroups` + `toggleNavGroup` persistidos),
`Sidebar.tsx` (render dividido en riel/expandido, grupos colapsables, invariante de activo), `AppShell.module.css` (`.navGroup`/
`.navGroupHeader`/`.navGroupLabel`/`.navGroupChevron`/`.navDivider`), i18n es-CL (`nav.groups.operation|design|admin`). Identidad
Lyra (tokens, claro+oscuro, 44px, a11y con `aria-expanded`/teclado). **Sin contratos/API/migración; sin permisos nuevos.**
typecheck/lint(0 errores)/build verdes; dev server :5173 arriba (HMR). **Pendiente: smoke VISUAL del dueño** (agrupado claro/oscuro,
colapsado/expandido, grupos que pliegan, activo sin doble-resalte, responsive). **Deuda menor (BACKLOG):** la sección Favoritos quedó
con encabezado estático (no colapsable) — intencional, es dinámica; el estilo `.navLabel` y la clave `nav.sectionLabel` quedaron
huérfanos (reemplazados por `.navGroupLabel` / `nav.groups.*`). **Siguiente: 4.4 (SLA de incidencias + escalamiento + aviso de plazo).**

**2026-06-17 — UX del builder de Flujos (3 ajustes por feedback del dueño) ✅** (`feat/builder-flujos-ux`). Pulido del
`WorkflowBuilder` tras QA visual: **(1) "Copiar destinatarios de otra transición" más descubrible** — el atajo ya existía
(`TransitionNotifyEditor`) pero vivía al final del editor; ahora va **arriba del bloque de aviso** (lo primero al activar "Notificar").
Se mantiene **condicional**: solo se muestra si hay OTRA transición con aviso de la cual copiar (decisión del dueño: si no hay fuente,
no mostrar nada — evita ruido). **(2) Estados colapsables** — paridad con las transiciones (que ya colapsaban): `collapsedStates` (existentes plegados al
abrir, nuevos expandidos) + cabecera con resumen compacto (swatch · nombre · clave · tags Inicial/Final/SLA); de-clutter del panel
"se veía muy lleno". **(3) Encabezado sticky de las columnas** — bug real: `.columnHeader` usaba `top: 58px` (alto del topbar) pero
el scroll vive en `.content` del shell (`overflow-y:auto`) con topbar+pestañas FUERA de ese contenedor ⇒ el sticky se anclaba 58px
abajo dejando una franja muerta donde se colaba el contenido; corregido a **`top: 0`**. Solo frontend (web + CSS + i18n es-CL),
sin contratos/API/migración. typecheck/lint(0 errores)/build verdes. **Pendiente: smoke VISUAL del dueño** (copiar arriba/siempre,
estados que colapsan, encabezado pegado al tope sin franja). **Diferido (BACKLOG):** **copiar destinatarios desde OTRO flujo/plantilla**
(no solo dentro del mismo flujo) — feature aparte (traer configs congeladas de otros flujos + resolver roles/usuarios que podrían no
aplicar + ABAC). **Siguiente: 4.4 (SLA/escalamiento + aviso de plazo).**

**2026-06-17 — Notificaciones avanzadas · Fase B: canal IN-APP (la campanita) + tiempo real ✅** (`feat/notif-avanzadas-inapp`).
**CIERRA EL ÉPICO de notificaciones avanzadas** (A + B). Cada aviso, además del correo, genera una notificación IN-APP por
destinatario (leído/no leído), visible en la **campanita del Topbar** (badge de no leídas + dropdown navegable + marcar leídas) y
en la **bandeja de `/mis-notificaciones`**, actualizada en **tiempo real (SSE con fallback a poll)**. **Reusa el motor del Bloque N**
(outbox + worker + resolver + `NotificationChannel` abstracto) — NO lo reinventa. **4 forks resueltos por el dueño (las 4
recomendaciones):** (1) INAPP **ON por defecto** para todos los eventos (opt-out por evento×canal en Mis preferencias, igual que el
correo); (2) tiempo real = **SSE** (`@Sse` nativo de NestJS, token por `?access_token=`, heartbeat ~25 s, payload liviano = solo el
contador/nudge) **+ poll de respaldo** (react-query `refetchInterval` 60 s); (3) **deep link DERIVADO en el front**
(`deepLinkForEntity(relatedEntityType,id)`, sin columna nueva: `LogEntry`→`/bitacoras/:id`, `RoundOccurrence`→`/mis-rondas`,
`Incident`→`/incidencias`); (4) **purga diaria** de in-app LEÍDAS > 90 días (`@Cron`). Almacenamiento in-app = **extender
`NotificationOutbox` con `readAt`** (NO tabla dedicada; fork (b) del épico). **SIN permiso nuevo** (ver/leer mis notificaciones =
**ownership**, patrón SavedView/preferencias). **Modelo (aditivo):** enum `NotificationChannel += INAPP` + `NotificationOutbox.readAt
DateTime?` (null = no leída) + índice `(recipientUserId, channel, readAt)`; migración `20260617160000_add_notif_inapp_channel`
(`ALTER TYPE … ADD VALUE` + columna + índice). **Contratos** (`@lyra/contracts`): `NOTIFICATION_CHANNELS += INAPP` + DTOs del inbox
(`inboxItemSchema`/`inboxListQuerySchema`/`inboxListResponseSchema`/`inboxUnreadCountSchema`) + helper PURO `deepLinkForEntity`
(isomorfo) + 2 specs. **API:** (a) **canales por registro** — `InAppChannel` (entrega = la propia fila; sin SMTP) + `EmailChannel`
en un `NotificationChannelRegistry`; el worker enruta cada fila por `row.channel`. (b) **resolver multi-canal** — por destinatario
INTERNO emite EMAIL (si tiene correo y no optó OFF) **+** INAPP (si no optó OFF); externos solo EMAIL; **`dedupeKey` incluye el canal**
(`evento|eventId|canal|destinatario`) para que email e in-app coexistan sin chocar el índice único. (c) **worker** — dispatch con
`m.channel`; sender enruta por canal; **SUPPRESSED solo a las filas EMAIL** si el correo está apagado (las INAPP no dependen del SMTP);
tras SENT de una INAPP, **empuja un nudge SSE** al destinatario con su contador fresco; **`@Cron` de purga** de leídas > 90 días.
(d) **`NotificationRealtimeService`** (bus in-memory `Subject` por usuario, multicast a sus pestañas, refcount con limpieza). (e)
**endpoints del inbox (ownership)**: `GET /notifications/inbox` (cursor + `unreadOnly` + `q`), `/inbox/unread-count`,
`POST /inbox/:id/read` (404 si no es del usuario), `/inbox/read-all`, y **`GET /inbox/stream` (SSE, `@Public` + verificación manual
del token de query**, auth confinada a esa ruta). (f) **preferencias por canal** — `listMyPreferences` ahora devuelve EMAIL + INAPP por
evento; `setMyPreference` respeta el canal. **Auditoría:** la in-app NO genera `notification.*.sent` ni audita lecturas (la fila de
outbox es el registro inmutable; la lectura es dato propio); el correo conserva su `notification.email.sent`. **Web:** **`NotificationBell`**
en el Topbar (badge de no leídas + dropdown premium con las 8 recientes, marcar todas, navegar+marcar al click, "ver todas") +
**`useInboxRealtime`** (`EventSource` → invalida queries; poll de respaldo) + **`InboxPanel`** = bandeja completa en `/mis-notificaciones`
(pestañas Bandeja/Preferencias; filtros leídas/no-leídas + búsqueda en UNA línea; `GridPager` arriba/abajo; marcar una/todas; navegación
por deep link) + **`PreferencesPanel`** con **columna INAPP** (opt-out por evento×canal) + `formatRelativeTime` regional en `lib/format`.
Identidad Lyra (tokens, Sora/Inter, Lucide, glow, claro+oscuro, 44px táctil). **Sin permiso nuevo (sin FLUSHALL).** Tests: contracts
**295** (+2) · API **247** · web **3**; typecheck/lint(0 errores)/build verdes. **Smoke en vivo `scripts/smoke-notif-inapp.py` 18/18**
(emisión multi-canal: fila INAPP del admin SENT sin depender del SMTP + coexiste la EMAIL [dedupe por canal] + nace no leída · inbox
ownership: unread-count sube, GET /inbox la incluye, listado y contador coinciden · marcar leída baja el contador + readAt persiste ·
read-all → 0 · **ownership: no-admin lee la del admin → 404**, y accede a SU inbox → 200 · **SSE emite el evento inicial con el
contador** · poll refleja 0 tras read-all) **+ regresión `smoke-notif-avanzadas.py` 22/22 + `smoke-notificaciones.py` 18/18** (se
actualizó 3b/5b a ser conscientes del canal y se sumó **5c: opt-out de correo NO silencia la campanita**). **Pendiente: smoke VISUAL
del dueño** (campanita en el Topbar: badge, dropdown, navegación, marcar leídas; bandeja en `/mis-notificaciones`; preferencias con
columna INAPP; claro/oscuro/responsive; tiempo real con dos pestañas). **Deuda (BACKLOG):** el bus SSE es in-memory (single-process);
escalar a multi-instancia exigirá Redis pub/sub · plantilla INAPP propia (hoy la in-app reusa el contenido renderizado de la plantilla
EMAIL) · retención configurable (hoy constante 90 días). **Con la Fase B, el ÉPICO de notificaciones avanzadas queda COMPLETO →
siguiente: 4.4 (SLA/escalamiento + aviso de plazo).**

**2026-06-17 — Notificaciones avanzadas · Fase A (UI) ✅** (`feat/notif-avanzadas-ui`). Le pone PANTALLA al backend de
Fase A (ya en `main`): editor de aviso POR TRANSICIÓN en el builder de flujos + master-detail de plantillas POR BITÁCORA con
diccionario de comodines de campo + toggle de defaults de sistema en `/configuracion`. **Mayormente frontend** + el mínimo
backend para exponer el default. **3 forks de UX resueltos con el dueño (las 3 recomendaciones aceptadas):** (1) el editor de
aviso vive **INLINE** en la tarjeta de la transición (no drawer; coherente con firma/MFA/roles); (2) el default de sistema va
en una **pestaña "Notificaciones" propia** en `/configuracion` (no dentro de "Correo saliente"; separa gobernanza de avisos del
SMTP); (3) los correos externos se editan con **chips validados** (no textarea). **Backend mínimo:** se expone
`notifyTransitionDefaultDestinationRoles` en `systemSettingsSchema`/`updateSystemSettingsRequestSchema` + `SettingsService`
(select/defaults/get/auditShape/update) — **sin endpoint nuevo** (reusa `GET`/`PATCH /settings`, gate `module:settings:view`/
`settings:manage`). **Web:** (a) **`TransitionNotifyEditor`** inline en `WorkflowBuilder` (toggle "Notificar en esta transición"
→ materializa `notify` desde `EMPTY_TRANSITION_NOTIFY`; `MultiSelect` de roles + usuarios; 3 checks autor/ejecutor/roles del
estado destino; **correos externos = chips validados con banner "salta permisos, se audita"**; `Select` de plantilla
[Automática=null + plantillas `entry.transition`]; **atajo "Copiar destinatarios de otra transición"** [puro front, copia
roles/usuarios/checks/externos]) + chip-resumen "Aviso · N destinatarios" en la cabecera colapsada y columna "Aviso" en la tabla
resumen; pickers con `retry:false` (un gestor de flujos sin permisos de seguridad/plantillas degrada a lista vacía sin romper —
la autorización real la hace el backend). (b) **Master-detail de plantillas** (`NotificationsPage`): columna **"Ámbito"** (Por
defecto / nombre de bitácora) + filtro **scope** (generic/scoped) en la barra de filtros + botón **"Nueva plantilla"** (modal
evento + bitácora + idioma → `POST` → abre el editor) + **borrar** las ad-hoc (la genérica/sistema no, gate por `isSystem`/
`templateId`) + en el editor de una plantilla **scoped** el diccionario suma los **comodines de campo** (`GET …/field-variables`)
con el mismo insert-en-cursor. (c) **Pestaña "Notificaciones"** en `/configuracion` con el toggle "Las transiciones sin
configuración avisan a los roles del estado destino". **Web API/queries** extendidos: `fetchNotificationTemplates(query)` con
scope, `createNotificationTemplate`/`deleteNotificationTemplate`, `fetchNotificationFieldVariables` + hooks
`useCreate/Delete/FieldVariables`. **Identidad Lyra** (tokens, Sora/Inter, Lucide, claro+oscuro, 44px táctil); filtros en una
línea + GridPager arriba/abajo (ya estaban). **Sin permisos nuevos** (config de transición = `workflow:manage`, plantillas =
`notiftemplate:manage`, default = `settings:manage`); **sin migración** (la columna ya existía); **sin FLUSHALL**. Tests:
contracts **293** · API **247** · web **3** · permissions **5**; typecheck/lint(0 errores)/build verdes. **Smoke en vivo
`scripts/smoke-notif-avanzadas.py` 22/22** (+3 sección E nueva: `GET /settings` expone el default · `PATCH /settings` round-trip ·
no-admin `PATCH` → 403) **+ regresión `smoke-notificaciones.py` 17/17** sin romper. **Pendiente: smoke VISUAL del dueño** (editor
inline en el builder, chips de externos, copiar de otra transición, columna Ámbito + Nueva/Borrar plantilla, diccionario de
comodines de campo, pestaña Notificaciones; claro/oscuro/responsive). **Deuda (BACKLOG):** picker de usuarios depende de
`/security/users` (un gestor de flujos sin ese permiso ve la lista de usuarios vacía → considerar endpoint `user-options`
decoplado, patrón `role-options` de 2.3.1). **Siguiente: Fase B — canal in-app (campanita) + SSE**, luego **4.4 (SLA/escalamiento)**.

**2026-06-17 — Notificaciones avanzadas · Fase A (BACKEND) ✅** (`feat/notif-avanzadas`). Épico de notificaciones avanzadas,
**Fase A solo-backend** (disparo por TRANSICIÓN + plantillas POR BITÁCORA + comodines de campo + defaults de sistema), sobre el
motor del Bloque N (outbox + worker + render sin eval) sin reinventarlo. **Contexto (honesto):** la sesión arrancó para 4.4
(SLA/avisos); recomendé un slice mínimo de 4.4 y diferir este épico; **el dueño, tras mi objeción fundamentada, reafirmó construir
el épico COMPLETO (A+B) primero y luego 4.4** (DECISIONS 2026-06-17). Para respetar "un objetivo por sesión", **esta sesión entrega
Fase A backend** (cierra y verifica sola); **la UI de Fase A (editor de aviso en el builder de flujos + master-detail de plantillas
por bitácora + diccionario de comodines + toggle de defaults), Fase B (campanita in-app + SSE) y 4.4 quedan como sesiones
siguientes** (BACKLOG). **7 forks resueltos:** (a) destinatarios EMBEBIDOS y CONGELADOS en la versión del flujo (no
`DistributionList`; atajo "copiar de otra transición" pendiente para la UI); (b) in-app = extender `NotificationOutbox.readAt`
(Fase B); (c) SSE con fallback a poll (Fase B); (d) correos EXTERNOS sí, gated+auditados; comodines del editor = campos de la versión
PUBLICADA; (e) defaults de sistema = toggle mínimo (default = conducta actual); (f) `entry.transition` COEXISTE (sin config →
default; con config → manda); (g) A→B. **Modelo (aditivo):** `WorkflowTransition.notifyConfig Json?` (regla de destinatarios
CONGELADA en la versión, como roles/firma; migración `20260617150000_add_notif_advanced_phase_a`) + `NotificationTemplate.templateId
String?` (ámbito por bitácora; null = genérica; unique `(eventKey,locale,channel,templateId)` + índice PARCIAL único para la
genérica) + `SystemSettings.notifyTransitionDefaultDestinationRoles Boolean @default(true)` (migración
`20260617150500_add_notify_transition_default`). **Contratos** (`@lyra/contracts`): `transitionNotifyConfigSchema`
(enabled/templateId/roleIds/userIds/includeAuthor/includeActor/includeDestinationRoles/externalEmails — **todos requeridos, SIN
`.default()`** para que `z.input===z.output` y no romper la re-inferencia del web; ver DECISIONS/TS2719) + `notify` en
`workflowTransitionSchema`/`draftTransitionInputSchema` (congelado en saveDraft/clon/mapVersion) + plantillas con `templateId`/
`templateName` + `createNotificationTemplateRequestSchema` + `notificationTemplateListQuerySchema` (scope generic/scoped) + helper
PURO `pickTemplateForScope` (específica→genérica) + comodines `{{campo.<key>}}` (`FIELD_VARIABLE_PREFIX`/`fieldVariableName`/
`isFieldVariable`/`allowedVariablesForTemplate`) + specs (`notif-advanced.spec.ts`; contracts **292**). **API:** `NotificationResolverService`
reescrito: resuelve destinatarios de `entry.transition` desde la config CONGELADA (roles EN VIVO / usuarios / autor / ejecutor /
roles del estado destino con ABAC; **externos sin ABAC, auditados, `recipientUserId=null`**); default de sistema cuando no hay
config; plantilla por ÁMBITO (`pickTemplateForScope`) y **comodines `{{campo.<key>}}` desde la versión CONGELADA** (valor ausente ⇒
""). `NotificationsService` gana `createTemplate`/`deleteTemplate`/`listTemplates(scope)`/`fieldVariablesFor` + endpoints
(`POST/DELETE /notifications/templates`, `GET …?scope=`, `GET …/field-variables`) con whitelist que incluye los comodines de campo
(400 si inválido) y 409 al duplicar; la genérica/sistema NO se borra. **Web (mínimo seguro):** el builder PRESERVA `notify` en el
round-trip detail→modelo→draft (evita borrarlo al guardar — lección del guard de permisos de sección); **editor visual + master-detail
+ diccionario = UI de la sesión siguiente.** **Permisos:** sin permiso nuevo (config de transición = `workflow:manage`; plantillas =
`notiftemplate:manage`); **sin FLUSHALL**. Tests: contracts **292** (+9) · API **247** (+6, `notifications.service.spec.ts`);
typecheck/lint(0)/build verdes. **Smoke `scripts/smoke-notif-avanzadas.py` 19/19** (plantilla scoped + nombre · whitelist comodín
inexistente 400 · duplicada 409 · field-variables · filtros scope · borrar genérica 400 · config de transición CONGELADA round-trip ·
resolver runtime: externo + plantilla específica + comodín renderizado · default OFF → 0 destinatarios · gates 403) **+ regresión
`smoke-notificaciones.py` 17/17** (tras corregir una config SMTP rota de sesión previa: `emailHost` vacío en BD → fallback a `.env`)
**+ incidencias 32/32 · capa 23/23 · investigación 27/27 · reportabilidad 31/31** sin romper. **Pendiente: smoke VISUAL** (no aplica
aún: sin UI). **Siguiente: Fase A — UI**, luego **Fase B (campanita in-app + SSE)** y luego **4.4 (SLA/escalamiento)**.

**2026-06-17 — Fase 4.3: Reportabilidad configurable (obligaciones + reportes + bloqueo de cierre + vencido derivado) ✅**
(`feat/incidencias-reportabilidad`). Cierra §14 de la auditoría del módulo: una incidencia puede gatillar uno o más REPORTES a una
AUTORIDAD/obligación, con plazo y seguimiento, **configurable y transversal** (nada SERNAGEOMIN/DS 132/HSE-Chile hardcodeado; los
marcos concretos son **seed/catálogo** por vertical). Honra el flag `IncidentType.reportableDefault` (hasta hoy inerte), igual que
4.2a honró `requiresCapa` y 4.2b `requiresInvestigation`. **Plan aprobado por el dueño; 6 forks resueltos en la recomendación:**
(1) **modelo dedicado** catálogo `ReportingObligation` + materialización `IncidentReport` (N por incidencia), NO algo liviano —
auditabilidad + consulta "reporte vencido" por índice + multiplicidad; (2) **bloquea el cierre gobernado por
`ReportingObligation.mandatory`** (el marco regulatorio declara si es vinculante), NO por flag de tipo — el reporte a la autoridad
y el cierre interno son ciclos de vida distintos; (3) **SIN permiso nuevo** (catálogo `incidentcatalog:manage`, reportes
`incident:edit`; cat. se queda en **83**, sin gotcha de FLUSHALL); (4) **"vencido" DERIVADO** (`status=PENDING AND dueAt<now`), la
unificación con `maxStayMinutes` (§21) se difiere a 4.4; (5) **UI** pestaña Reportes + sub-pestaña Obligaciones en catálogos + KPI;
(6) **aviso de plazo DIFERIDO a 4.4** (épico de notificaciones avanzadas). **Modelo:** 2 entidades aditivas + 1 enum + relación en
`Incident`. `ReportingObligation` (catálogo configurable: key/name/`authorityName`/`defaultDueMinutes`/`appliesToTypeIds[]` [vacío =
todos]/`minSeverity?`/`mandatory`/active/sortOrder/deletedAt) + `IncidentReport` (folio `REP-####`, **snapshot** de
obligationName/authorityName/mandatory para integridad histórica, status PENDING/SUBMITTED/NOT_APPLICABLE/CANCELED, `dueAt`,
evidencia de envío submittedAt/submittedById/`externalFolio`/notes, anulación sin borrado físico, `evidence` reservado Ola 3).
**Migración aditiva** `20260617140000_add_incident_reporting` (sin BOM; `db execute` + `migrate resolve` por el drift del historial).
**Contratos** (`@lyra/contracts/incidents/reporting`): enums + DTOs + requests + helpers PUROS `applicableObligationsFor`/
`isReportOverdue`/**`reportsBlockingClose`**/`incidentReportCode` (autoritativos back↔front) + 12 specs. **API:**
`IncidentReportsService` (catálogo upsert con 409 al crear key existente; `materializeForIncident` idempotente; create manual con
dedup 409; submit/markNotApplicable/cancel; ABAC heredada del nodo; timeline `REPORT_*` + auditoría) + 11 endpoints
(`/incidents/obligations` GET/POST; `:id/reports` GET/POST, `:id/reports/materialize`, `reports/:id` PATCH/submit/not-applicable/
cancel; gates `incidentcatalog:manage`/`incident:edit`/`incident:view`) + **guarda de cierre** `assertNoBlockingReports` en
`transition` (junto a CAPA/investigación) + **materialización en `create`** si la incidencia es reportable + KPI `reportOverdue` en
stats + filtro `reportOverdueOnly` + flag `reportOverdue` por fila (batched). **Seed:** 2 obligaciones de EJEMPLO genéricas
idempotentes (sev≥4 mandatory transversal · ambiental no obligatoria). **Web:** capa `incidents-api`/`-queries` extendida +
**pestaña Reportes** en `IncidentDetailDrawer` (`IncidentReportsBlock`: lista con folio/autoridad/plazo[rojo si vencido]/estado +
re-derivar + agregar + marcar enviado[folio]/no aplica/anular + aviso de bloqueo) + **sub-pestaña Obligaciones** en `CatalogsPage`
(`ReportingObligationModal`: aplicabilidad por tipos/severidad + plazo + obligatorio) + **KPI "Reporte vencido"** clicable + chip de
fila en lista/kanban + meta `REPORT_STATUS_META`. Identidad Lyra (tokens, Sora/Inter, Lucide, claro+oscuro, 44px, a11y).
**Sin permisos nuevos (cat. 83), sin migrar permisos (Redis sin FLUSHALL).** Tests: **contracts 283** (+12) · **API 241** (+6);
typecheck/lint(0)/build verdes. **Smoke en vivo `scripts/smoke-incidencias-reportabilidad.py` 31/31** (catálogo + colisión 409 ·
materialización por tipo/severidad · minSeverity no aplica · bloqueo de cierre con obligatorio pendiente → 400 · enviar[folio] →
cierra · no aplica desbloquea + motivo corto 400 · materializar idempotente · duplicado 409 · vencido derivado [reporte/listado/
KPI/filtro] · tipo no reportable no materializa · gates 403 operador) **+ regresión incidencias 32/32 (con paso 6.6 de resolver el
reporte obligatorio antes de cerrar) · capa 23/23 · investigación 27/27 · excepciones 39/39 · reglas 21/21 · catálogos 16/16** sin
romper. **Deuda 4.3 (BACKLOG):** subida de evidencia del envío (Storage Ola 3, `evidence` reservado) · firma Part 11 al enviar ·
recordatorio/aviso de plazo (→ 4.4 + notificaciones avanzadas). **Pendiente: smoke VISUAL del dueño** (pestaña Reportes, modales,
sub-pestaña Obligaciones, KPI/chip, bloqueo de cierre). **Siguiente: 4.4 — SLA/escalamiento + aviso de plazo de reporte.**
🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente (`docs/prompts/notificaciones-avanzadas.md`); es dependencia
de la **4.4** y del aviso de plazo de esta 4.3.

**2026-06-17 — Fase 4.2b: Investigación de causa raíz (5 Porqués) + bloqueo de cierre + enlace a CAPA ✅**
(`feat/incidencias-investigacion`). Cierra la investigación de incidencias, configurable y **transversal** (nada minero/HSE
hardcodeado), honrando el flag `IncidentType.requiresInvestigation` igual que 4.2a honró `requiresCapa`. Método inicial =
**5 Porqués** (Toyota/Lean/ISO 45001 §10.2); NO ICAM/TapRooT/Bowtie (sobreingeniería — el enum de método deja la puerta
abierta a agregarlos sin re-migrar). **Plan aprobado por el dueño; 4 recomendaciones que diferían del default, todas
aceptadas:** (1) **modelo dedicado, NO JSON** (entidad de primer orden auditable y ligable, como `IncidentAction`); (2)
**SIN permiso nuevo — reusa `incident:edit`** (no hay segregación de funciones como en CAPA; crear un permiso sería
parametrizar por parametrizar; cat. se queda en **83**); (3) **drawer a PESTAÑAS** (Resumen · Acciones · Investigación ·
Actividad); (4) **bloquea el cierre, configurable** (espejo de CAPA). **Modelo:** 2 entidades aditivas
`IncidentInvestigation` (1:1 con `Incident`, `method` FIVE_WHYS / `status` DRAFT|COMPLETED / `problemStatement` /
`rootCauseSummary?` / conducido+completado-por) + `IncidentInvestigationStep` (los "porqués" ordenados: `statement`/`answer?`/
**`isRootCause`**) + 2 enums + columna **`IncidentAction.investigationStepId?`** (FK SetNull = la causa raíz que la acción
ATIENDE; cierra el lazo problema→causa→acción, ISO 9001 §10.2). **Migración aditiva** `20260617130000_add_incident_investigation`
(2 tablas + 2 enums + columna + FKs; aplicada `db execute` + `migrate resolve` por el drift del historial; sin BOM).
**Contratos** (`@lyra/contracts/incidents/investigation`): enums + DTOs + requests (upsert REEMPLAZA la cadena en bloque /
complete / reopen) + helpers PUROS `hasRootCause`/`isInvestigationComplete`/**`investigationBlocksClose`** (autoritativos
back↔front) + 8 specs. **API:** `IncidentInvestigationService` (get/upsert[solo DRAFT, reemplaza pasos en tx]/complete[exige
≥1 causa raíz → COMPLETED]/reopen[COMPLETED→DRAFT]; ABAC heredada del nodo; timeline `INVESTIGATION_*` + auditoría) + 4
endpoints (`:id/investigation` GET/POST, `.../complete`, `.../reopen`; gate `incident:edit`) + **guarda de cierre**
`assertInvestigationComplete` en `IncidentsService.transition` (al pasar a FINAL: 400 si el tipo exige investigación y no está
completa con causa raíz). El detalle ahora expone `typeRequiresInvestigation`/`typeRequiresCapa`. Acciones CAPA: contrato +
servicio aceptan/validan/resuelven `investigationStepId` (+`investigationStepLabel` en el DTO; el backend valida que el paso
sea de la MISMA incidencia). **Web:** **drawer a pestañas** (`IncidentDetailDrawer` con chips de conteo/aviso: punto rojo si
hay obligatorias CAPA sin resolver o investigación pendiente exigida) + **`IncidentInvestigationBlock`** (editor de cadena
5-Porqués: problema + N porqués con respuesta + marcar causa raíz, agregar/quitar, guardar/completar/reabrir; aviso de bloqueo;
lectura premium con tag de causa raíz) + selector **"Causa raíz que atiende"** en el modal de acción CAPA (ofrecido solo si la
investigación tiene causas raíz) + capa `incidents-api`/`-queries` extendida. Identidad Lyra (tokens, Sora/Inter, Lucide,
claro+oscuro, 44px, a11y con role/tab). Tests: **contracts 271** (+8 investigación) · **API 234** sin regresión;
typecheck/lint(0)/build verdes. **Smoke en vivo `scripts/smoke-incidencias-investigacion.py` 27/27** (tipo que exige
investigación: cerrar sin ella → 400 · upsert DRAFT + timeline · completar sin causa raíz → 400 · con causa raíz → COMPLETED ·
cerrar tras completar → CLOSED · tipo que NO la exige cierra sin investigación · validación problema/paso · reabrir · enlace
CAPA↔causa raíz + label resuelto + causa de otra incidencia → 400 · `typeRequiresInvestigation` en el detalle · gate 403
operador) **+ regresión `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 31/31** (se le sumó el paso de completar la
investigación que `seguridad` ahora exige para cerrar). **Deuda 4.2b (BACKLOG):** firma Part 11 al completar la investigación ·
adjuntos de evidencia a la investigación · plantillas de método ICAM/Ishikawa. **Pendiente: smoke VISUAL del dueño** (pestañas
del drawer, editor 5-Porqués, marcar causa raíz, bloqueo de cierre, selector de causa en CAPA). **Siguiente: 4.3 —
Reportabilidad configurable.** 🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente
(`docs/prompts/notificaciones-avanzadas.md`); es dependencia de la futura **4.4 (SLA/escalamiento)**.

**2026-06-17 — Fase 4.2a: Acciones CAPA (correctivas/preventivas) + bloqueo de cierre + verificación de eficacia ✅**
(`feat/incidencias-capa`). Primera mejora tras la **auditoría del módulo de Incidencias** (sesión de diagnóstico previa: el core ya
era genérico/transversal, no minero-hardcodeado; la única brecha **P1 funcional** era el seguimiento real → CAPA). Convierte el
módulo de "registro" en "gestión con cierre verificado". **Plan aprobado por el dueño; 4 forks resueltos en la recomendación:**
(1) **2 permisos nuevos** `incident:action:manage` + `incident:action:verify` (segregación de funciones: quien ejecuta NO
auto-verifica; cat. **81→83**); (2) **bloqueo por flag `mandatory` por acción** (más fino que "todo el tipo"); (3) **verificación
configurable** — DONE basta para cerrar, salvo que el TIPO declare `requiresCapa` (entonces exige VERIFIED); (4) **`responsibleRoleId`
incluido ya** (grupo responsable, §7 P2 de la auditoría) a nivel modelo/contrato/API. **Modelo:** 1 entidad aditiva `IncidentAction`
(folio `ACT-####`, kind CORRECTIVE/PREVENTIVE/IMMEDIATE, mandatory, responsable persona+rol [refs blandas], dueAt, status OPEN/
IN_PROGRESS/DONE/VERIFIED/CANCELED, realización + **verificación de eficacia** EFFECTIVE/NOT_EFFECTIVE, anulación sin borrado físico,
`evidence Json?` **reservado**) + 3 enums + relación en `Incident`/`Role`. **Migración aditiva** `20260617120000_add_incident_actions`
(se quitó del diff un `DROP INDEX` AJENO; aplicada con `db execute` + `migrate resolve` por el drift previo del historial). **Contratos**
(`@lyra/contracts/incidents/actions`): DTO + requests + enums + helpers PUROS `hasOpenMandatoryActions`/**`blockingActionsForClose`**
(autoritativos back↔front) + `incidentActionCode`. **API:** `IncidentActionsService` (CRUD + complete[→DONE] + **verify**[EFICAZ→
VERIFIED · NO eficaz→reabre IN_PROGRESS] + cancel; ABAC heredada del nodo de la incidencia; timeline `ACTION_*` + auditoría en cada
mutación) + 6 endpoints en `IncidentsController` (`:id/actions` GET/POST, `actions/:actionId` PATCH, `.../complete|verify|cancel`) +
**guarda de cierre** `assertNoBlockingActions` en `IncidentsService.transition` (al pasar a estado FINAL: 400 si hay acciones
obligatorias sin resolver; `requireVerification = type.requiresCapa`). **Web:** **bloque "Acciones correctivas/preventivas"** en
`IncidentDetailDrawer` (componente nuevo `IncidentActionsBlock` + modales crear/editar/completar/verificar/anular; chips de tipo/estado,
estrella obligatoria, plazo vencido en rojo, **aviso "N obligatorias sin resolver pueden bloquear el cierre"**, gates por permiso) +
capa `incidents-api`/`-queries` extendida + meta de presentación. **Sin migrar seeds** (los flags `requiresCapa` ya existían en el
catálogo). Tests: **contracts 263** (+6 helpers CAPA) · **API 234** sin regresión; typecheck/lint(0)/build verdes. **Smoke en vivo
`scripts/smoke-incidencias-capa.py` 23/23** (crear/folio/timeline · validación · **bloqueo de cierre con obligatoria abierta → 400 ·
DONE sin verificar [requiresCapa] → 400 · verificar EFICAZ → cierra · tipo sin requiresCapa: DONE basta · NO eficaz reabre · no
obligatoria no bloquea · editar/anular · gates 403 operador**) **+ `smoke-incidencias.py` 30/30** sin regresión. **Deuda 4.2a
(BACKLOG):** subida de archivos de evidencia a la acción (reusará Storage Ola 3; columna `evidence` ya reservada) · picker de
**rol responsable** en la UI (el dato/API ya lo soportan) · firma Part 11 al verificar. **Pendiente: smoke VISUAL del dueño** (bloque
de acciones, modales, aviso de bloqueo, intento de cierre bloqueado). **Siguiente: 4.2b — Investigación (5 Porqués).**
🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente (`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-17 — Incidencias: MANTENEDOR de catálogos (Tipos + Categorías) [UI] ✅** (`feat/incidencias-catalogos-ui`). Le pone
PANTALLA a los catálogos `IncidentType`/`IncidentCategory`, que ya eran configurables en el backend pero solo se cambiaban por seed
o API directa. **Mayormente frontend** + una guarda mínima de backend. **2 forks resueltos con el dueño:** ubicación = **ruta propia
`/incidencias/catalogos`** (acceso por botón "Catálogos" en el header de `/incidencias`, gate `incidentcatalog:manage`; **NO en el
sidebar** para no doble-resaltar el padre — el sidebar resalta por `startsWith`, mismo patrón que `/seguridad/*`); colisión de key =
**guarda cliente + server** (la UI bloquea crear una key ya usada y el backend devuelve **409** con `?create=true`). **Web
(`features/incidents/`):** `CatalogsPage` (sub-pestañas **Tipos**/**Categorías**, filtros en UNA línea [buscador + activo/inactivo +
orden], `GridPager` arriba/abajo, filtro/orden/paginación client-side sobre el listado completo, toggle activo/inactivo por fila,
botón Nuevo) · `IncidentTypeModal` (nombre · key [solo al crear, read-only en edición] · descripción · **color** = swatches de los
tokens del DS, sin hex libre · **flujo por defecto** = `useWorkflows({status:"PUBLISHED"})` · 3 toggles investigación/CAPA/reportable
· orden) · `IncidentCategoryModal` (nombre · key · descripción · **tipo** [un tipo o "Transversal"] · orden) · `incidents-api`/
`-queries` extendidos (`upsertIncidentType`/`upsertIncidentCategory` con `?create`, `fetch…(includeInactive)`, hooks **admin**
`useIncidentTypesAdmin`/`useIncidentCategoriesAdmin` con queryKey propio para NO contaminar los desplegables del alta [siguen solo
activos], mutaciones que invalidan el prefijo `["incidents","types"|"categories"]`). `CATALOG_COLOR_SWATCHES` centralizado en
`incidents-presentation`. **Backend (`incidents/`):** `upsertType`/`upsertCategory` aceptan `failIfExists` (controller `?create=true`)
→ **409 ConflictException** si la key ya existe; `upsertType` ahora exige que el `defaultWorkflowId` esté **PUBLICADO** (status
PUBLISHED + currentVersionId), no solo que exista. **Sin permisos nuevos (cat. 81), sin migración, sin cambios de contrato.**
Identidad Lyra (tokens, Sora/Inter, Lucide, claro+oscuro, 44px, a11y con role/tab). typecheck/lint(0)/build/test (API 234) verdes.
**Smoke en vivo `scripts/smoke-catalogos-incidencias.py` 16/16** (crear tipo + persiste flags/color/orden · colisión key 409 · editar
upsert mismo id · flujo inexistente 400 · flujo DRAFT 400 [verificado aparte con un workflow draft real] · desactivar → fuera de
`/types` pero dentro de `?includeInactive` · categoría transversal + colisión 409 + asociar a tipo + typeId inexistente 400 ·
categoría inactiva idem · gates 403 operador en GET y POST) **+ `smoke-incidencias.py` 30/30** sin regresión. **Pendiente: smoke
VISUAL del dueño** (pantalla, modales, swatches, claro/oscuro/responsive). **Siguiente: Fase 4.2 — Investigación + CAPA.**
🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente (`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-16 — Incidencias: equipo/activo + fecha del evento en el alta (mínimo ISO 14224) ✅** (`feat/incidencias-equipo-fecha`).
Follow-up de QA del dueño: el modal "Reportar incidencia" no permitía elegir el **equipo/activo** (el modelo ya lo tenía y el
detalle ya lo mostraba; era una brecha de UI) ni registraba la **fecha/hora del evento** (solo `createdAt` = cuándo se reportó). Dos
brechas reales del mínimo estándar (ISO 14224 / HSE: la falla se ata a un activo y tiene fecha de ocurrencia distinta del reporte).
**Backend:** `GET /incidents/equipment-options?nodeId=` (gate `incident:view`, ABAC por nodo, equipos activos del nodo — self-contained,
no exige `equipment:view`); `Incident.occurredAt` nullable (migración aditiva `20260616230000_add_incident_occurred_at`) + en
`createIncidentRequestSchema`/`updateIncidentRequestSchema`/`incidentListItemSchema`; `create()` **hereda el equipo de la bitácora de
origen** si el reporte es del mismo nodo y no se eligió otro; validación `assertEquipmentInNode` sobre el equipo efectivo. **Web:**
`CreateIncidentModal` gana selector **Equipo/activo** (cascada del nodo, se limpia al cambiar nodo) + input **Fecha y hora del
evento** (datetime-local → ISO; vacío = momento del reporte); `IncidentDetailDrawer` muestra "Ocurrió". Sin permisos nuevos
(catálogo 81). Tests: contracts 257 · API 234 verdes; typecheck/lint(0)/build OK. **Smokes:** `smoke-incidencias.py` **30/30**
(+equipment-options, alta con activo, equipo de otro nodo→400, occurredAt persistida) · `smoke-reglas-incidencias.py` 21/21 ·
`smoke-excepciones.py` 39/39. **Deuda anotada (opcional, no mínimo de alta):** matriz de riesgo prob×consec en el alta, asignar
responsable al crear, flag "reportable" editable en el modal, evidencia/adjuntos a nivel incidencia (→ 4.2/4.3). **Pendiente: smoke
VISUAL del dueño.**

**2026-06-16 — Fase 4.1.2: Acción del motor de reglas (diferida vía outbox) ✅** (`feat/incidencias-reglas-accion`). **Cierra la
Fase 4.1.** Una regla de negocio CRUZADA puede, al dispararse, **materializar una excepción** (`triggerKind=RULE`) o **abrir una
incidencia** — de forma **asíncrona** (no en el camino crítico del sello), reusando el PATRÓN del outbox del Bloque N pero con tabla
DEDICADA. **3 forks confirmados con el dueño:** (1B) **tabla propia `RuleActionOutbox`** (no se reusa `NotificationEvent`,
específico de correo: "crear un objeto de dominio" ≠ "avisar"); (4B) la incidencia automática lleva **`originType=RULE`** (filtrable
como tal), pasando por una excepción CONVERTED (proveniencia uniforme vía `IncidentExceptionLink`); (6) **una regla con acción debe
ser WARN** (una ERROR bloquea el sello y su acción —que ocurre al sellar— nunca correría); `validateRulesDesign` + server
(`assertRuleActionsValid`) lo exigen. **Diferido vía outbox** (fork 3) = desacopla dominios de falla: una automatización NO puede
bloquear ni revertir el sello del operador. **Atribución de SISTEMA** (fork 5): el worker reusa `IncidentsService.create` con el
actor que SELLÓ (capturado en la orden; su ABAC ya cubre el nodo) — no se reinventa la creación; la excepción RULE la crea
`ExceptionGeneratorService.createRuleException` (extiende el generador). **`thresholdType=invalid` sigue diferido** (fork 7).
**Contratos** (`@lyra/contracts/rules`): `ruleActionSchema` (discriminada `none|raiseException|openIncident{incidentTypeId,
incidentCategoryId?,severity}`) + `action?` en `crossRuleSchema` (JSONB, congelada en la versión, **sin migración** de reglas) +
`ruleActionKind`/`ruleHasAction` + `validateRulesDesign` rechaza acción en regla ERROR. **Migración aditiva**
`20260616220000_add_rule_action_outbox` (tabla `RuleActionOutbox` + enum `RuleActionOutboxStatus` + `LogEntryException.sectionKey/
fieldKey` → NULLABLE [una excepción de regla no ata un campo único]; se quitó del diff un `DROP INDEX` AJENO; aplicada no-destructiva
`db execute`+`migrate resolve` por drift previo del 4.1.0). **API:** `RuleActionEmitterService` (@Global, etapa 1, encola DENTRO de
la tx del sello, `dedupeKey rule:{entryId}:{ruleKey}`) inyectado en `LogEntriesService` (14.º arg; `emitRuleActions` en `submit` y
`executeTransition` tras `reconcileEntryOnSeal`); `RuleActionWorkerService` (@Cron 30 s + `runOnce`, etapa 2: lee la regla de la
versión CONGELADA, crea la excepción RULE [idempotente por dedupeKey], abre incidencia + link + CONVERTED, backoff/FAILED) +
`POST /rule-actions/run` (gate `incident:create`, ops/smoke). La excepción RULE **no ofrece "Corregir"** (sin campo). **Web:**
selector de **acción** por regla en `RulesEditor` (Ninguna / Generar excepción / Abrir incidencia + tipo/categoría/severidad por
defecto, severidad forzada WARN con ayuda) + chip de acción en la tabla; la UI de excepciones renderiza la RULE por su `detail`
(mensaje) y oculta Corregir (fieldType null). **Sin permisos nuevos — catálogo 81.** Tests: **contracts 257** (+2 acción) · **API
234** (mocks del 14.º arg actualizados). **Smoke `scripts/smoke-reglas-incidencias.py` 21/21** (diseño ERROR+acción 400 · tipo
inexistente 400 · emisión 2 órdenes al sellar · worker materializa RULE/CONVERTED + incidencia originType RULE + link · idempotencia
[DONE, sin duplicar] · gate 403). **`smoke-excepciones.py` 39/39** sin regresión. typecheck/lint(0)/build/test verdes. **Pendiente:
smoke VISUAL del dueño** (selector de acción en el builder; excepción RULE en la bandeja; incidencia automática). **Con 4.1.2, la
Fase 4.1 queda COMPLETA → siguiente: 4.2 (Investigación + CAPA).** 🔔 Recordatorio: épico de **notificaciones avanzadas** sigue
pendiente (`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-16 — Fase 4.1.1: Panel de excepciones en la bitácora — UI ✅** (`feat/incidencias-excepciones-ui`). Le pone CARA a la
capa **Bitácora → Excepción → Incidencia** del 4.1.0 (los endpoints ya existían; esta sesión es FRONTEND + un toque mínimo de
backend). **4 forks resueltos con el dueño:** panel **inline plegable + drawer** (no modal/muro) · **advertir, no bloquear** al
completar con críticas · **selección múltiple** para agrupar (`exceptionIds[]`) · **SÍ bandeja global** `/excepciones` (el dueño la
pidió en la fase, no como follow-up). **Backend mínimo (DECISIONS 2026-06-16):** filtro **`incidentId`** nuevo en
`exceptionListQuerySchema` + `buildWhere` (aditivo, sin migración) para listar las excepciones que originaron una incidencia.
**Web (`features/exceptions/`):** capa `exceptions-api`/`-queries`/`-presentation` (consume `GET /exceptions[/summary|/:id|/:id/
dedupe-suggestions]` + triage) · **`ExceptionCard`** (tarjeta compartida panel/bandeja, ícono+color por `thresholdType`, chip de
estado, checkbox de multi-select) · **`ExceptionDetailDrawer`** (contexto congelado + acciones gateadas: reconocer · **corregir**
[FieldControl del tipo real + motivo ≥5 + **reauth Part 11 si la entrada está sellada**, preserva original] · **crear/asociar
incidencia** · **descartar** [crítica exige `exception:dismiss-critical`, deshabilitado con tooltip si falta]) · **`ConvertExceptionModal`**
(incidencia NUEVA o **asociar a existente** [picker de incidencias abiertas] + **sugerencia de dedup** con "Asociar/Crear igual") ·
**`ExceptionReviewPanel`** (inline plegable en llenado/visor: cabecera con resumen "N críticas · N advertencias · N posibles
inválidos" de `GET /exceptions/summary`, lista de ESA entrada `?logEntryId=`, selección múltiple → agrupar; **no se monta si la
entrada no tiene excepciones**) · **`ExceptionsPage`** = **bandeja global `/excepciones`** (KPIs clicables del `summary` · filtros en
UNA línea [estado/severidad/origen/sin-incidencia/orden + búsqueda] · **`GridPager` arriba y abajo** · tarjetas con contexto ·
multi-select). **Integración:** panel + **banner "advertir no bloquear"** al completar una sección con críticas (atajo *Revisar
excepciones* que hace scroll al panel; se invalida el resumen tras cada guardado) en `EntryFillPage`; panel en `EntryViewerPage`;
**trazabilidad campo→excepción→incidencia** en el bloque de `IncidentDetailDrawer` (lista navegable a la entrada, vía filtro
`incidentId`); ruta `/excepciones` + ítem de menú `nav.exceptions` (gate `module:incidents:view`, ícono `AlertOctagon`). **Builder:**
toggle **`warnRaisesException`** en `BuilderConfigPanel` para NUMBER (caja de **umbrales** y caja de **tolerancia**), con ayuda "el
crítico siempre genera excepción". **Grilla `/bitacoras`:** se reusa el indicador `worstThresholdBand`/`exceptionsOnly` existente
como marca "tiene excepciones" (sin cambios). **Sin permisos nuevos — catálogo 81.** Identidad Lyra (tokens, Sora/Inter, Lucide,
glow, claro+oscuro, 44px, a11y AA con role/tab/teclado/foco). Tests: **contracts 255 · API 234** sin regresión. typecheck/lint(0
errores)/build verdes. **Smoke `smoke-excepciones.py` 39/39** re-corrido sin regresión + **filtro `incidentId` verificado en vivo**
(200 + vacío para id inexistente). **Pendiente: smoke VISUAL del dueño** (panel inline, drawer, convertir+dedup, bandeja global,
banner, toggle del builder; claro/oscuro/responsive). **Deuda 4.1.1 (BACKLOG):** `warnRaisesException` por CELDA de TABLE/MATRIX
(falta antes el editor de umbrales por columna en el builder) · conteo de excepciones abiertas por entrada en la grilla (requiere
que el listado lo devuelva) · `CorrectModal` con la config completa del campo (bandas/opciones). **Siguiente: 4.1.2 — acción del
motor de reglas (diferida vía outbox).** 🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente
(`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-16 — Fase 4.1.0: Excepciones operacionales desde bitácoras — BACKEND ✅** (`feat/incidencias-excepciones`). Activa la
capa explícita **Bitácora → Excepción → Incidencia** (DECISIONS 2026-06-16; 4 forks de alto impacto cerrados con el dueño en la
recomendación). **NO reinventa motor:** reusa `thresholdBandFor`/`effectiveNumberBands` y el módulo de Incidencias 4.0.
**Modelo (2 entidades aditivas, SIN `tenantId`):** `LogEntryException` (contexto CONGELADO en la detección: plantilla/versión/
sección+label/campo+label/tipo/unidad/`originalValue` INMUTABLE/`bandsSnapshot`/operador/turno/nodo/equipo/fecha + `triggerKind`
THRESHOLD_WARN|THRESHOLD_CRIT|RULE|MANUAL + `thresholdType` warning|critical|invalid + `status` OPEN|ACKNOWLEDGED|DISMISSED|
CONVERTED|CORRECTED + corrección GxP que preserva el original + `incidentId?` denormalizado + folio `EXC-####` + `dedupeKey` único)
y `IncidentExceptionLink` (join autoritativo N:1 con proveniencia; una incidencia agrupa varias excepciones). **Migración aditiva**
`20260616200000_add_log_entry_exceptions` (se quitó del diff un `DROP INDEX` AJENO; el BOM de PowerShell rompió el 1.er deploy →
reescrito sin BOM + `migrate resolve --rolled-back` + `db deploy`). **Generación SÍNCRONA gobernada por campo** (fork 1+6: CRIT
siempre, WARN opt-in `config.warnRaisesException`, en NUMBER/TABLE/MATRIX): `ExceptionGeneratorService` (@Global, Prisma-only,
13.º arg de `LogEntriesService`) reconcilia en `saveSection` (**provisional**, fork 2) y al **SELLAR** (`submit`/`executeTransition`,
firme + `entrySealedAt`); volver a rango RETIRA la provisional OPEN; una ya triada CONGELA el slot `(entrada,campo)`; `voidEntry`
purga las provisionales. Fuente única `thresholdExceptionTrigger` en `@lyra/contracts`. **Triage** (`ExceptionsService`/controller/
module): `GET /exceptions` (lista ABAC + filtros + paginación + **resumen** críticas/advertencias), `/exceptions/summary`,
`/:id`, `/:id/dedupe-suggestions` (incidencias ABIERTAS del mismo nodo/equipo/24h — **sugerencia**, nunca merge), `acknowledge`,
`dismiss` (crítica exige permiso superior), `correct` (GxP: escribe `LogEntryValue`+`LogEntryFieldChange`+re-estampa banda,
preserva original), `convert` (crea incidencia `originType=EXCEPTION` + link + CONVERTED), `associate` (a incidencia existente),
`manual` (registro del operador). ABAC por nodo + auditoría en todo. **4 permisos** (`exception:triage`/`dismiss`/`dismiss-critical`/
`correct`; catálogo **77→81**). Contracts **255** · API **234** sin regresión. **Smoke en vivo `scripts/smoke-excepciones.py`
39/39** (generación CRIT/WARN gobernada · WARN opt-out no genera · contexto congelado · idempotencia · retiro al volver a rango ·
resumen · gates 403 · acknowledge/dismiss-crítica/correct[preserva original + escribe valor]/convert[originType EXCEPTION+link]/
dedupe/associate · registro manual · `entrySealedAt` al sellar; crea y LIMPIA por ID). typecheck/lint(0)/build/test verdes.
**Pendiente: 4.1.1 — panel de excepciones en la bitácora (UI)** + **4.1.2 — acción del motor de reglas (diferida, outbox)**.
🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente (`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-16 — Fase 4.0: Núcleo de Incidencias operacionales / HSE ✅** (`feat/incidencias-nucleo` → `main`). Primera fase del
módulo de incidencias, tras una sesión de investigación + diseño + plan por fases aprobado (DECISIONS 2026-06-16; 14 forks resueltos
en la opción recomendada; **single-tenant confirmado → SIN `tenantId`**). **Reusa `WorkflowDefinition`** para el ciclo de vida: la
incidencia CONGELA una versión de flujo (denormalizada, patrón `LogEntry`) y avanza por sus transiciones con las MISMAS guardas
(estado origen + rol-dato `WorkflowTransitionRole` + ABAC por nodo + **firma Part 11 opt-in re-autenticada** con `ReauthService`).
**Modelo (6 entidades aditivas):** `IncidentType`/`IncidentCategory` (catálogos CONFIGURABLES con flags de comportamiento:
defaultWorkflow, requiresInvestigation/Capa, reportableDefault), `Incident` (folio `INC-####`, severidad 1..5 + potencial de
gravedad, prioridad, riesgo ISO 31000, `lifecycle` OPEN/CLOSED/CANCELED denormalizado, origen MANUAL/LOG_ENTRY/EXCEPTION/RULE,
ligazón nodo/equipo/turno/entrada, SLA de permanencia reusando `evaluateSla`/`maxStayMinutes`), `IncidentComment`,
`IncidentActivity` (timeline **append-only**), `IncidentTransition` (espejo de `LogEntryTransition`). **Sin borrado físico**
(anulación = CANCELED con motivo); referencias blandas a usuario/flujo/entrada (patrón AuditLog). **Contratos** (`@lyra/contracts/
incidents`): enums + DTOs + requests + `deriveLifecycle` + **9 permisos** (`module:incidents:view`, `incident:view/create/edit/
assign/comment/transition[dim. WORKFLOW]/cancel`, `incidentcatalog:manage`; catálogo **68→77**). **API** `incidents/`:
`IncidentsService` (ABAC por nodo en list/detail/mutaciones; `buildWhere` con filtros + paginación; resolución batched de nombres;
SLA derivado; `resolveWorkflow` = flujo del tipo → global `incidencia-operacional`; transición con guardas + reauth; catálogos)
+ controller (list/detail/stats/users/types/categories + create/update/assign/comments/transitions/cancel) + módulo (importa
AuthModule por `ReauthService`). **Seed**: flujo `incidencia-operacional` PUBLICADO (6 estados reportada→…→cerrada) + 13 tipos +
13 categorías (idempotente). **Migración aditiva** `20260616180000_add_incidents` (se quitó del diff un `DROP INDEX` AJENO).
**Web** (`features/incidents/`): página `/incidencias` (KPIs clicables · **filtros en UNA línea** · tabs **Lista**/**Tablero
kanban** · **`GridPager` arriba y abajo** · tabla premium · kanban por estado del flujo) + **drawer de detalle** (stepper de
estados · bloque Origen navegable a la bitácora · asignar responsable · transiciones con modal de confirmación/firma · comentarios ·
timeline · anular) + **modal de creación** (manual o desde bitácora, picker de nodo) + **botón "Reportar incidencia" en el visor de
bitácora** (`?fromEntry=&fromNode=`, trazabilidad entrada→incidencia) + ítem de menú + i18n es-CL + tokens Lyra. Tests:
**contracts 255 · API 234** sin regresión. **Smoke en vivo `scripts/smoke-incidencias.py` 26/26** (catálogos · crear manual con folio/
flujo/estado inicial/timeline · validación 400 severidad+nodo · editar con huella · asignar · comentar · recorrer flujo a cierre +
transición inválida · lista/stats · anular · desde bitácora originType LOG_ENTRY · gates 403; crea y LIMPIA por ID). typecheck/lint(0)/
build verdes. **Pendiente: smoke VISUAL del dueño.** **Siguiente: Fase 4.1 — Excepciones operacionales desde bitácoras.**
🔔 Recordatorio: épico de **notificaciones avanzadas** sigue pendiente (`docs/prompts/notificaciones-avanzadas.md`).

**2026-06-16 — Notificaciones: rediseño de la pantalla de PLANTILLAS (escala enterprise) ✅** (`feat/notif-templates-ux` → `main`).
Por feedback del dueño (el 3-columnas quedaba apretado y no escalaba a "muchísimas plantillas"). Patrón **master-detail** de clase
mundial (SendGrid/Customer.io/ServiceNow): **(1) lista administrable** = toolbar con **buscador + filtro por grupo de evento +
filtro por estado + contador** sobre una **tabla** (Plantilla/Evento/Canal/Idioma/Estado + Editar; responsive); **(2) editor a
PANTALLA COMPLETA** al elegir una (sin apreturas): cabecera con **← Volver** + título + **toggle Activa/Inactiva**, cuerpo a 2
columnas (formulario amplio: asunto + cuerpo texto + cuerpo HTML alto · **diccionario de variables** al costado, sticky, con
descripción+ejemplo, insertar-en-cursor); **(3) vista previa en un MODAL grande** (`size=xl`) con **selector Escritorio/Móvil** +
asunto + iframe del HTML renderizado con datos de ejemplo (reemplaza la previa inline apretada). El **toggle Activa** ahora se
puede editar (la API ya lo soportaba). Solo frontend (sin contratos/API/migración). typecheck/lint(0)/build verdes. **Pendiente:
smoke VISUAL del dueño.**

**2026-06-16 — Bloque N: Hardening premium de Notificaciones (config SMTP en BD + editor de plantillas) ✅** (`feat/notif-hardening` →
`main`). Dos mejoras pedidas por el dueño antes de Fase 4 (referencia revisada: `G:\Development\ruta-bus`; se SUPERA en seguridad —
la referencia guarda la contraseña en claro). **#1 Configuración del correo saliente (SMTP en BD):** config persistida en
`SystemSettings` (columnas `email*` aditivas) editable **sin reiniciar**, con `.env` como FALLBACK (`source: db|env` en la UI);
**`SmtpEmailService` refactorizado** resuelve desde BD con caché + invalidación por *firma* del transporte; **contraseña cifrada en
reposo** (`EncryptionService` AES), **write-only** (nunca vuelve a la UI, solo `passwordSet`). **`EmailConfigService`** (getPublic/
getResolved/resolveFrom/set/isEnabled) + endpoints `GET/PUT /settings/email`, `POST /settings/email/verify` (probar conexión, sin
enviar) y `/test` (probar envío con los valores del form sin guardar; error real del SMTP), auditados (`email.config.updated/tested`,
sin registrar la clave). **Toggle "Correo activado"** → el sender del worker marca **SUPPRESSED** si está apagado (no rompe el flujo).
**Permiso DEDICADO `notification:config`** (catálogo **67→68**), pantalla = **tab "Correo saliente" en `/configuracion`** (decisión
del dueño: parte de la config del SISTEMA) con **presets de proveedor + diccionario de pistas** (Gmail/M365/SES/SendGrid/Mailpit/
Personalizado). **#2 Editor de plantillas premium:** **vista previa EN VIVO** (split editor/preview con el MISMO `renderTemplate`
isomorfo + **valores de ejemplo por variable**); **diccionario de variables** (nombre + descripción + ejemplo) que **inserta en el
cursor** del campo enfocado (asunto/cuerpo); **`{{entry.summary}}`** nuevo = renderiza los campos de RESUMEN configurados por
plantilla (`gridFieldKeys`, etiqueta+valor+unidad, resuelve code→label de SELECT inline) → el correo lleva datos PROPIOS de la
bitácora sin acoplar la plantilla a un tipo de formulario (**variables de campo dinámicas `{{field.<key>}}` = diferido a fase 2,
BACKLOG**). **Migración aditiva** `20260616160000_add_email_config`. Tests: contracts **255** · API **234**. **Smokes en vivo:
`smoke-email-config.py` 8/8** (config sin password; guardar → source=db + clave CIFRADA len=64 no-claro; verify+test contra
MAILPIT; gates 403; limpieza → env) **· `smoke-notificaciones.py` 17/17** sin regresión. typecheck/lint(0)/build verdes. **Pendiente:
smoke VISUAL del dueño** (config de correo + editor con preview/diccionario/entry.summary). **Siguiente: Fase 4 — Incidencias.**

**2026-06-16 — Bloque N: Notificaciones (motor de avisos por correo) ✅** (`feat/notificaciones` → `main`). Motor PREMIUM
solo-correo (SMS/WhatsApp fuera de alcance), on-prem, fundacional para Fase 4 y para los avisos diferidos de rondas vencidas
(2.3) y SLA (workflow-sla). Estándar ServiceNow (sys_email + templates) · Jira (notification schemes + watchers) · SAP/Maximo.
**Arquitectura = Transactional Outbox de 2 ETAPAS + worker** (NO BullMQ — la fila de outbox ES la bandeja Req-1/Req-5; INSERT
atómico con el cambio de dominio; degradación con backoff si SMTP cae): se suma **`@nestjs/schedule`** = primera infra de cron del
proyecto. **Modelo (5 entidades aditivas, referencias BLANDAS sin FK — patrón AuditLog, no toca tablas existentes):**
`NotificationEvent` (cola tx, dedupeKey único para eventos DERIVED), `NotificationOutbox` (bandeja + registro de envío,
PENDING/SENT/FAILED/SUPPRESSED + backoff + dedupeKey), `NotificationTemplate` (gobernanza viva por evento×locale×canal),
`NotificationSubscription` (watchers), `NotificationPreference` (ownership). Catálogo de **EVENTOS en CÓDIGO**
(`@lyra/contracts NOTIFICATION_EVENTS`, 4: `round.overdue`/`entry.sla.breached`/`entry.transition`/`entry.signature.pending`)
con variables WHITELISTEADAS; **render sin eval** (`renderTemplate`, placeholders `{{...}}`, misma postura que el motor de
reglas). **Contratos:** enums + schemas (template/subscription/preference/outbox) + render puro testeado + **4 permisos**
(`module:notifications:view`, `notiftemplate:manage`, `notification:view-outbox`, `notification:admin`; catálogo **63→67**;
*mis preferencias* = ownership, sin permiso). **API `notifications/`:** `NotificationEmitterService` (etapa 1, @Global Prisma-only,
inyectado en `executeTransition` para emitir DENTRO de la tx — corrección de correctness #4: no se pierde el evento ante un crash
post-commit), `NotificationChannel`+`EmailChannel` (reusa `EmailService`), `NotificationResolverService` (etapa 2: resuelve
destinatarios + render, **ABAC obligatorio** `canAccessNode`∩`canAccessTemplate` — nunca avisa lo que el destinatario no podría
ver), `NotificationWorkerService` (3 `@Cron`: **sweeper** [GENERA rondas primero — corrección #2 — luego escanea vencidas + SLA
breaches vía raw query espejo de `delayedEntryIds`], **dispatcher**, **sender** con backoff), `NotificationsService` (CRUD
plantillas/suscripciones + preferencias propias + bandeja), controller (`/notifications/*` + `POST /run` para ops/smoke).
**Destinatarios de `round.overdue` = `LogSchedule.responsibleRoleId`** (NO el equipo — corrección #1; un activo no expande a
personas), reusa la lógica del worklist 2.3.1; **dedup** una vez por ocurrencia/breach por destinatario (#5). **Migración aditiva**
`20260616120000_add_notifications` (5 tablas + 4 enums; se quitó del diff un `DROP INDEX` AJENO de otra rama). **Seed** de 4
plantillas default (es-CL, HTML branded; idempotente). **Web** (`features/notifications/`): página `/notificaciones` (sidebar,
`module:notifications:view`, pestañas **Correo saliente** [filtros + reintento + vista previa HTML en iframe], **Plantillas**
[editor con chips de variables + validación de whitelist], **Mis preferencias**) + `/mis-notificaciones` (perfil, todo usuario) +
ítem de menú + i18n es-CL + tokens Lyra. **Suscripciones = API+modelo listos, UI diferida.** Tests: **contracts 255** (+6 render) ·
API **234** (specs de log-entries actualizados al 12.º arg `notifications`). **Smoke en vivo `scripts/smoke-notificaciones.py`
17/17** (catálogo+plantillas; whitelist 400/200; round.overdue end-to-end → bandeja SENT + MAILPIT renderizado sin `{{}}` a los
N destinatarios del rol responsable; dedup estable tras re-correr; opt-out suprime; gates 403 no-admin; crea y LIMPIA por ID).
typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda diferida (BACKLOG):** digest/batching ·
UI de suscripciones · escalamiento por tiers · fan-out por nodo para correo cuando `responsibleRoleId` es null (hoy
subscriptions-only) · smoke en vivo de transition/SLA/signature (resolvers typecheck+wired; el end-to-end se cubrió vía overdue) ·
canal in-app/SMS. **Siguiente: Fase 4 — Incidencias** (arranca con la cañería de notificaciones lista).

**2026-06-16 — Fase 2.3.1: Worklist de rondas (separar PLANIFICAR de EJECUTAR) ✅** (`feat/rondas-worklist` → `main`).
Refinamiento aprobado tras el MVP de 2.3: la pantalla única `/rondas` mezclaba **crear horarios** (planificador) con
**iniciar/omitir** (operador); el dueño lo halló poco natural. Estándar (SAP PM Maintenance Plan vs *My Maintenance Tasks*/Fiori ·
Maximo PM vs *Start Center/My Assignments* · j5 schedules vs *shift logbook*): el planificador configura, el OPERADOR ve un
**worklist acotado a ÉL** y solo ejecuta. **4 forks (DECISIONS 2026-06-16):** (1) **permiso `round:execute`** nuevo (cat. **62→63**,
grupo `schedules`) gatea ver+ejecutar "Mis rondas"; **start/skip se MOVIERON** de `schedule:manage` a `round:execute`;
`schedule:view/manage` siguen siendo del planificador. (2) **`LogSchedule.responsibleRoleId String?`** SINGLE nullable (FK Role
SetNull) — el horario es del PUESTO (work center/responsible role SAP/Maximo). (3) **responsabilidad EN VIVO** (join, no
denormalizada): reasignar el rol re-enruta las pendientes. (4) **turno = filtro suave conmutable** (default hoy+arrastre vencido,
no muro duro). **Backend:** `GET /schedules/my-rounds` + `/my-rounds/stats` (gate `round:execute`) con `where = PENDING ∩
getAccessibleNodeIds ∩ schedule{responsibleRoleId null|∈ misRoles}`, toggles overdueOnly/shiftOnly(`ShiftResolver.resolve(now,null)`)/
includeUpcoming; `responsibleRoleId` en create/update (valida rol); `GET /schedules/role-options` (gate `schedule:manage`,
decoplado de `role:read`); start/skip re-gateados. Migración aditiva `20260615220000_add_schedule_responsible_role`. **Web:** página
nueva **`/mis-rondas`** (`MyRoundsPage`: KPIs propios + toggles Pendientes/Mi turno/Vencidas/Próximas + Iniciar/Continuar/Omitir);
**`/rondas` relabelada "Programación de rondas"** (`SchedulesPage` sin ejecución: CRUD + KPIs + Generar + monitoreo read-only +
columna "Responsable" + selector de rol en `ScheduleDrawer`); **widget en Inicio** (`HomePage`, tile launchpad solo con
`round:execute` y pendientes>0); badge de `/bitacoras` → `my-rounds/stats`/`round:execute`/`/mis-rondas`; nav (Mis rondas en clúster
operador) + i18n es-CL. Contracts **249** · API **234**. **Smokes en vivo:** `smoke-mis-rondas.py` **18/18** (responsable=mi rol/
fallback/otro; 403 sin permiso; CRUZADO multiusuario: operador con `round:execute` ve SU rol+fallback y NO el del admin; overdueOnly;
stats; separación de gates) + `smoke-rondas.py` **21/21** sin regresión. typecheck/lint(0)/build verdes. **+ Follow-up UX
(`fix/rondas-volver`):** al iniciar una ronda desde "Mis rondas" el llenado ahora sabe de DÓNDE viene — `EntryFillPage` acepta
`backTo`/`backLabel` por `location.state` (origen explícito) y el "Volver" (y el redirect tras VOID) regresan a **/mis-rondas**
("Volver a Mis rondas") en vez de a Bitácoras. **+ Follow-up UX 2 (`feat/mis-rondas-filtros`):** rediseño de "Mis rondas" para
operación con muchas rondas (ej. 5 estanques × cada hora) — **búsqueda** (ronda/equipo/área), **filtro por equipo** (chips
táctiles con conteo), **filtro por área** (select), **selector de HORIZONTE de tiempo** (Próxima hora / 4 h / 8 h / 12 h / Hoy /
24 h / Todas — las vencidas siempre se ven; pide "próximas" al backend solo si la ventana cruza la medianoche), toggle
**Mi turno**, y sobre todo **agrupación por URGENCIA** (Vencidas → Pendientes de hoy → Próximas, con conteo y color por grupo, lo
más urgente arriba); tag del equipo destacado en cada fila. **+ Fila estilo agenda:** columna de **HORA prominente** (24h, Sora,
tabular-nums) a la izquierda con **cuenta regresiva de urgencia** ("Vence en 45 min" ámbar / "Vencida hace 2 h" rojo / "Vence
HH:MM") y etiqueta de día (Mañana / "Jue 18") para próximas; `formatTime` regional nuevo en `lib/format`. Todo client-side sobre
el worklist (sin tocar API). **+ Follow-up UX 3 — PLANIFICADOR (`feat/programacion-herramientas`):** "Programación de rondas"
llevada a list-report estilo SAP PM (IP10/IP24) · Maximo (PM) · Fiori "Manage Maintenance Plans" — **filter bar** (búsqueda +
estado activo/pausado + recurrencia + área), **KPIs de salud** (horarios activos/pausados + rondas pendientes/vencidas),
**frecuencia legible** ("Cada turno"/"Cada 6 h"/"08:00, 20:00 · Lun a Vie"), **columna "Próxima ronda"** (= *next call date* de SAP;
campo nuevo aditivo `LogScheduleDto.nextOccurrenceAt` = `_min(scheduledFor)` de las PENDING, con realce si está atrasada),
**pausar/activar EN LÍNEA** (toggle que reusa update con el payload del dto), y **monitoreo de ocurrencias plegable** (query
gateada por expansión). Contracts 249 · API 234. **+ Follow-up UX 4 — INTELIGENCIA + AISLAMIENTO (`feat/programacion-pro`):**
**(a) Alcance del planificador endurecido** — `GET /schedules`/generate/occurrences/stats ahora filtran por **nodo ∩ plantilla**
(los dos ejes ABAC de 2.8, en AND, vía `scopeFilters`), no solo por nodo: un planificador de un área NO ve las bitácoras/horarios
de otra (respuesta a "qué ven en una empresa multi-área"; verificado en vivo 6→5 al acotar a 1 bitácora). **(b) Value help de
BITÁCORAS** — selector múltiple en modal (`TemplateFilterModal`, patrón F4/Value Help SAP) que ofrece SOLO las bitácoras
disponibles (las de sus horarios visibles) con búsqueda y conteo; lo elegido se muestra como **chips** removibles y acota la tabla.
**(c) Ocurrencias = GRILLA paginable** con **búsqueda propia** (ronda/equipo/nodo) + paginación cliente (25/50/100 · rango ·
prev/next) + columnas Programada/Ronda/Equipo/Nodo/Turno/Estado/Vence — reemplaza la lista plana. Sin permisos nuevos. Contracts 249
· API 234 · smokes 18/18 + 21/21. **+ Follow-up UX 5 — OVERVIEW PAGE (`feat/programacion-overview`):** rediseño con
JERARQUÍA estilo Fiori Overview Page — **barra de filtros unificada** (búsqueda acotada [max-width, ya no monopoliza] + estado +
recurrencia + área + Bitácoras [botón premium, ícono+texto alineado]) que **gobierna TODA la pantalla**; **KPIs sensibles al
filtro** (activos/pausados/pendientes/vencidas calculados de los horarios visibles, sin endpoint extra); **PESTAÑAS** Horarios ·
Ocurrencias · Resumen. **Ambas grillas** ahora con **orden por columna + paginación** nativos del `Table` de @lyra/ui (no propios);
las ocurrencias se intersectan con los horarios filtrados (los filtros superiores afectan a las dos). **Resumen** = panel de
análisis con gráficas (`MiniBars`, SVG/CSS sin dependencias): rondas pendientes por área · horarios por recurrencia · cumplimiento
(% atrasadas). Frontend puro. typecheck/lint(0)/build verdes. **+ Follow-up UX 6 — pulido del planificador
(`feat/programacion-pulido`):** filtros en **UNA sola línea** (selects de ancho FIJO 176px — el `<select>` interno era
`width:100%` y se estiraba; búsqueda flexible con tope); **filtro por EQUIPO en contexto con su nodo** ("TAG · Nodo", cascadea con
el área); **paginación ARRIBA y ABAJO** de ambas grillas (`GridPager` propio reutilizable: rango + tamaño + primera/ant/sig/última
· se dejó de usar el paginado interno del Table para poder montarlo arriba y abajo); **más columnas** (Horarios +Plazo; Ocurrencias
+Plantilla +Entrada N.º); **tooltips** en los botones (`Tooltip` @lyra/ui); **"Generar" contextualizado** → movido del header a la
pestaña Ocurrencias (es materializar ocurrencias) con tooltip explicativo. Frontend puro. typecheck/lint(0)/build verdes.
**+ Follow-up UX 7 — Mis rondas paginada (`feat/mis-rondas-paginada`):** la agenda del operador conserva lo bueno
(agrupación por urgencia Vencidas→Hoy→Próximas, hora prominente, filtros, ejecutar) pero ahora **lista PLANA paginada** con
**encabezados de grupo EN LÍNEA** (cuando cambia el bucket) + **`GridPager` arriba y abajo** (sin scroll infinito con cientos de
rondas); **más info** en la tarjeta (la **plantilla/bitácora** a llenar) y **barra de filtros en UNA línea** (mismo fix que el
planificador: búsqueda acotada + `toggles` `display:contents` + selects de ancho fijo). Frontend puro. typecheck/lint(0)/build
verdes. **+ demo `seed-demo-estanques.py`** (5 estanques como
equipos + ronda cada hora + umbrales) y **Route (fan-out por equipo) anotado en BACKLOG**. **Pendiente: smoke VISUAL del dueño**
(§4). **Siguiente: Notificaciones (correo).**

**2026-06-15 — Fase 2.3: Programación de rondas (`LogSchedule` + `RoundOccurrence`) ✅** (`feat/programacion-rondas` →
`main`). Recurrencia que ABRE una entrada de bitácora por ocurrencia (estándar SAP PM Maintenance Plan/calls · Maximo PM/WO ·
j5 schedules · ISA-95 shift handover). **Modelo (fork A del dueño):** entidad **`LogSchedule`** (horario: plantilla×nodo×
recurrencia, gobernanza VIVA separada de la versión GxP) que genera **`RoundOccurrence`** (ocurrencias materializadas livianas,
PENDING/COMPLETED/SKIPPED/CANCELED); la ENTRADA real se crea al **iniciar la ronda** (reusa `LogEntriesService.create` con todas
las guardas ABAC/EAM), enlazada por `RoundOccurrence.logEntryId @unique` (sin borradores huérfanos, sin doble FK). **Contratos:**
3 tipos de recurrencia con config `.strict()` por kind (SHIFT `{shiftCodes?}` · INTERVAL `{everyMinutes,anchorTime?}` · CALENDAR
`{times,weekdays?,daysOfMonth?}`) + función PURA testeada **`enumerateOccurrences`** (genera `[from,to)`, `dueAt=scheduledFor+
dueWindowMinutes`, en la línea de `resolveShift`/`evaluateSla`) + helpers `localDateInTz`/`zonedTimeToUtc` en `date-utils`; DTOs
de horario/ocurrencia; **2 permisos** `schedule:view`/`schedule:manage` (catálogo **60→62**, el planificador ≠ el diseñador,
patrón SAP/Maximo). **Generación lazy idempotente** (watermark `lastGeneratedThrough` + `createMany skipDuplicates` sobre
`@@unique(scheduleId,scheduledFor)`) al listar + botón "Generar"; **"vencida" se DERIVA** (`status=PENDING AND dueAt<now`, espejo
del SLA, sin cron). **API:** módulo `schedules/` (CRUD ABAC por nodo + valida plantilla publicada/nodo en alcance/equipo en nodo/
turno existente; `start` crea+liga la entrada; `skip` con motivo ≥5 auditado; `generate`; `occurrences` + `occurrences/stats`);
**hook de cierre** en `LogEntriesService`: al sellar (submit/transición) la ocurrencia → COMPLETED, al VOID → vuelve PENDING y se
desliga. `ShiftResolver` gana `calendarForNode` (TZ+turnos del nodo). Migración aditiva `20260615200000_add_round_scheduling`
(2 tablas + enum `RoundOccurrenceStatus`, idempotente). **Web:** página **`/rondas`** (KPIs pendientes/vencidas/hoy · lista de
ocurrencias con Iniciar/Continuar/Omitir · tabla de horarios con drawer crear/editar [plantilla/nodo/equipo/recurrencia por kind/
plazo/horizonte/activo] · botón Generar) + **badge "rondas vencidas"** en `/bitacoras` (atajo) + ítem de menú "Rondas"
(`schedule:view`) + i18n es-CL. Tests: contracts **249** (+10, enumerador SHIFT cruza medianoche/INTERVAL anchor/CALENDAR weekdays/
daysOfMonth + validación por kind) · API **234**. **Smoke en vivo `scripts/smoke-rondas.py` 21/21** (validación 400 ×3 · creación
materializa 6 ocurrencias con shiftCode/dueAt · generar no duplica · overdueOnly deriva la vencida · iniciar crea entrada ligada ·
VOID desliga → PENDING · omitir → SKIPPED+auditado · stats · gate de permiso 403 para no-admins; crea y LIMPIA por ID).
typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda diferida (BACKLOG):** multi-nodo/descendientes ·
fan-out por equipo (Route) · anclaje a cierre real (floating) · completion-requirement · escalamiento/notificación de vencidas
(→ Notificaciones) · cron `@nestjs/schedule` · picker de plantilla/nodo propio del planificador (hoy reusa el de `logentry:create`).
**Siguiente: a definir con el dueño.**

**2026-06-15 — Form Builder: formateo en vivo + paleta de elementos + modal "Ver más" (Olas 1–2 de pulido) ✅**
(`feat/builder-formateo-paleta` → `main`). Continuación del pulido del builder (QA en vivo del dueño), todo frontend salvo un
campo de config aditivo. **(A) Formateo EN VIVO de campos:** RUT que pone puntos+guion **mientras se teclea**
(`formatRutLive` en `lib/format`); **número/moneda/porcentaje** con `FormattedNumberInput` (al desenfocar muestra miles +
decimales regionales `Intl.NumberFormat`, al enfocar se edita en plano; persiste el número); **máscara de entrada genérica**
(`applyMask`, `#`=dígito/`A`=letra/`*`=alfanum/literales, p. ej. `OT-#####`) en TEXT (`config.mask` aditivo en contrato; si hay
`format` semántico, manda él); se **expuso «Decimales»** en el panel avanzado de NUMBER (faltaba el input). **(#3) Footer
Aceptar/Cancelar en el panel de PROPIEDADES** (espejo del drawer; Cancelar revierte vía snapshot del `EditState` al seleccionar
el campo). **(Ola 2 · #4) Paleta de elementos DOCKED** a la izquierda bajo el riel "Diseño" (`FieldPalette`: buscador +
categorías; reemplaza el popover de la barra); al hacer clic se agrega al final y el lienzo hace **scroll hasta el campo**
(`scrollToUid` en `SectionCanvas` + `data-fuid`). **(Ola 2 · #5) Modal "Ver más"** (`FieldInfoModal` + `field-info.ts`):
**demo EN VIVO** del elemento (mismo `FieldControl`, interactivo) + descripción + **caso de uso** + ejemplo + botones «Agregar al
formulario»/«Cerrar». **Nomenclatura UI:** "objeto" → **"elemento"**. **UX:** columna izquierda 244→280px y lista con la misma
separación a ambos lados (scrollbar a ras). Tests: contracts **239** · API **234**; typecheck/lint(0)/build verdes. **Pendiente:
smoke VISUAL del dueño** (lo hará en paralelo). **Siguiente: Fase 2.3 — Programación de rondas (`LogPeriod`).**

**2026-06-15 — Pulidos de UX del Form Builder (QA en vivo del dueño) ✅** (`feat/builder-ux-pulidos` → `main`). Cuatro
mejoras pedidas tras probar el builder, todas sobre el render/edición ÚNICOS (sin tocar el modelo de datos salvo un campo de
config aditivo). **(1) Mín./Máx. caracteres en Texto corto y Párrafo + contador en vivo:** TEXT ya tenía `minLength/maxLength`
en contrato+validación pero no estaban EXPUESTOS en el builder; ahora ambos tipos muestran los inputs Mín./Máx. y un
**contador discreto** bajo el campo (`CharCounter` en `FieldControl`: "Quedan N", ámbar bajo el mínimo, rojo sobre el máximo;
oculto en celdas `bare`). Se agregó `minLength` a `textareaFieldConfigSchema` (Párrafo solo tenía `maxLength`) + guarda
min≤máx en ambos (la validación de valor ya lo soportaba). **(2) Hover de información en el lienzo:** al pasar el cursor sobre
un campo NO seleccionado de `SectionCanvas` aparece un panel con el ícono+nombre del objeto (`fieldDisplayMeta`) y chips de su
configuración (obligatorio/calculado/condicional/unidad/rango/umbrales/formato/caracteres/opciones/columnas…). **OJO:** se
descubrió que `BuilderFieldCard` (era dnd-kit, Fase 2.1.6) es **código MUERTO** — el lienzo real es `SectionCanvas` (motor
pointer-events, 2.1.7); el hover se montó ahí (en `.canvasCell`, no `.canvasItem` que tiene `overflow:hidden`). **(3) Footer
Aceptar/Cancelar en el drawer de opciones avanzadas:** el `Drawer` (@lyra/ui, ya soportaba `footer`) gana **Aceptar** (cierra
conservando) y **Cancelar** (revierte vía SNAPSHOT del `EditState` tomado al abrir, restaurado con `patchState`). **(4) Fix del
Enter en las listas:** el textarea de opciones inline (SELECT/MULTISELECT y columnas SELECT de tabla) mostraba un valor
re-derivado de los ítems ya parseados (líneas vacías filtradas) ⇒ al pulsar Enter la línea nueva se borraba y era IMPOSIBLE
crear un 2.º ítem; nuevo `LinesTextarea` conserva el TEXTO CRUDO local y solo propaga los ítems parseados. **+ Fix preexistente
destapado:** `logbook-query.service.spec.ts` llamaba al constructor de `LogEntriesService` con 10 args (faltaba `storage`,
añadido en Ola 3) ⇒ el typecheck del API estaba ROJO desde Ola 3 (vitest no chequea aridad); corregido (mock de `storage`).
Doc VIVO `FORM_GUIDE.md` actualizado (fichas Texto/Área de texto + §3.1 hover). Tests: contracts **239** (+3) · API **234**.
typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (confirmado en vivo el hover; resto por confirmar).
**Siguiente: formateo en vivo de campos (A): RUT con puntos+guion, número/moneda con miles+decimales** (acordado con el dueño;
máscara de texto genérica tipo `OT-#####` = paso B, diferido).

**2026-06-15 — Objetos estructurados: umbral por celda → excepción + agregados de tabla en reglas ✅**
(`feat/tablas-umbral-reglas` → `main`). Dos mejoras grandes pedidas por el dueño tras la evaluación de brechas, que dejan
de tratar a las tablas/matrices como "opacas". **(1) Umbral por celda → review-by-exception:** `thresholdBandFor` (fuente
única del estampado de `LogEntryValue.thresholdBand`) ahora calcula la **PEOR banda** (CRIT>WARN) de las celdas numéricas de
un `TABLE`/`MATRIX` (reusando `effectiveNumberBands` por columna/celda). Como el API ya estampa `thresholdBand` por campo, una
lectura **crítica DENTRO de una tabla/matriz marca la entrada como excepción** y muestra su badge en la grilla / la captura
`exceptionsOnly` — sin tocar el API ni migrar. **(2) Agregados de columna en el motor de reglas:** nuevo nodo de AST
`{kind:"col",table,column}` que los operadores de agregación (`sum/avg/min/max/count`) **expanden** a los valores no vacíos de
esa columna; fuera de agregación evalúa vacío (degradación elegante). Usable en **campos CALCULADOS** (KPI: *Total = suma de
una columna*) y **reglas CRUZADAS** (bloquear/avisar según un agregado, ej. *si suma(tonelaje) > tope ⇒ error*). `collectVarRefs`
suma la dependencia al campo TABLA (orden topológico + resaltado); `collectColRefs` + `validateRulesDesign` rechazan agregar una
columna de algo que **no es tabla**. Server-authoritative (mismo evaluador puro back↔front). **Web:** el `ExpressionEditor` gana
el operando **"Columna de tabla"** (selector tabla + columna), ofrecido solo si hay tablas con columnas numéricas; `RuleFieldRef`
expone las columnas numéricas; `expressionToInfix` rinde `«columna» de Tabla`. **Condiciones por fila** ("si alguna fila…")
DIFERIDAS (BACKLOG). Sin migración, sin permisos nuevos (catálogo 60). Tests: **contracts 236** (+4) · API **234**.
typecheck/lint(0)/build verdes; **probe en vivo 9/9** (calculado=suma de columna=400; banda WARN→CRIT por celda; la entrada
entra a `exceptionsOnly`; regla `sum(col)>1000` bloquea completar) + smokes Ola 4 22/22 y reglas 20/20 sin regresión.
**Pendiente: smoke VISUAL del dueño** (§4). **Deuda restante de tablas:** condiciones por fila (`any/all`), resumen "N filas"
en la grilla, export CSV de tablas, agregados como columna visible.

**2026-06-15 — Pulido del catálogo de objetos (QA en vivo del dueño) ✅** (`fix/objetos-pulido` → `main`). Tras armar una
**bitácora de demostración** (seed `scripts/seed-showcase-objetos.py`: ronda operacional de planta concentradora, 6 secciones ·
58 campos · 25 tipos de objeto distintos, con campo CALCULADO "recuperación" y regla CRUZADA concentrado≤alimentado, todo
verificado en vivo) y **sondear brechas**, se cerraron 3 hallazgos: **(1) Adjuntos (Ola 3): VISTA PREVIA al hacer clic** —
`AttachmentControl` gana un botón "Ver" + ítem clicable que abre un modal y muestra el archivo según su tipo (imagen en
lightbox · audio/video reproducibles · PDF en iframe · otros → abrir en pestaña), resolviendo la URL **presigned con ABAC**
(antes solo se podía descargar a ciegas, sin corroborar que el archivo subido fuera el correcto). **(2) Tablas (Ola 4):
validación de catálogo de celda server-side** — una columna/celda `SELECT` por **lista de referencia** ya no es aceptada (el
backend solo valida catálogos INLINE en celdas; ahora se **rechaza en el diseño**, cerrando el hueco de validación; el builder
ya solo ofrecía inline). **(3) Tablas (Ola 4): poda de filas vacías al guardar** — `pruneEmptyTableRows` elimina las filas
placeholder completamente vacías antes de validar/persistir ⇒ `maxRows` ya no cuenta filas en blanco y el jsonb queda limpio
(ALCOA+). Tests: **contracts 232** (+2) · API **234**. typecheck/lint(0)/build verdes; smoke Ola 4 **22/22** sin regresión +
verificación en vivo de los dos fixes de tabla (3/3). **Pendientes mayores (BACKLOG §4, evaluación del dueño):** banda de
umbral por celda numérica → review-by-exception/grilla (hoy las tablas/matrices son opacas a la excepción); reglas/agregados
del motor sobre celdas (`sum(col)`, "si alguna fila…"); resumen "N filas" en la grilla; obligatoriedad fina de matriz
(completa / por fila-columna); `minRows` cuando la tabla no es obligatoria.

**2026-06-15 — Catálogo de objetos premium · OLA 4 (objetos ESTRUCTURADOS / repetibles) ✅** (`feat/objetos-ola4` →
`main`). Cuarta ola: objetos que capturan una **colección de celdas** en un solo campo, todos sobre el **render ÚNICO**
`FieldControl`↔`FieldGrid`. **NO estrena infraestructura** (contratos + render, como Olas 1–2). **4 forks confirmados por el
dueño (DECISIONS 2026-06-15, recomendación aceptada en los 4):** (1) **DOS tipos `TABLE` + `MATRIX`** — `TABLE` unifica
**tabla repetible** (`config.layout=table`) y **grupo repetible** (`config.layout=cards`): valor `Array<Record<colKey,
escalar>>`, filas dinámicas; `MATRIX` (parámetro×turno) aparte: filas/columnas FIJAS × celda uniforme, valor
`Record<rowKey, Record<colKey, escalar>>`. (2) **columnas de la matriz CONFIGURADAS** en la plantilla y congeladas (sin
ShiftResolver; ligar al calendario en vivo = follow-up). (3) **sub-tipos de celda = SOLO escalares** (TEXT/TEXTAREA/NUMBER/
SELECT-inline/BOOLEAN/DATE/TIME/DURATION/CONFORMITY/RATING; REFERENCE/ATTACHMENT/anidada = diferido). (4) **sin agregados**
(total/promedio diferido). **Contratos:** `FIELD_TYPES += TABLE/MATRIX`, `FIELD_DATA_TYPES += TABLE/MATRIX`,
`tableFieldConfigSchema`/`matrixFieldConfigSchema` (columnas/ejes = sub-campos escalares validados con
`fieldConfigSchemaFor`), `validateFieldValue` casos TABLE/MATRIX (**validación POR CELDA** delegando en el tipo de columna;
SELECT de celda resuelve su catálogo desde opciones INLINE sin ABAC por celda; filas vacías = placeholder ignoradas;
columna `required` vacía en fila no vacía ⇒ error), helpers `countCompleteTableRows`/`isEmptyMatrixValue`/`tableRowIsEmpty`
+ **`requiredFieldError`** (obligatoriedad generalizada: TABLE ≥ max(1,minRows) filas completas · MATRIX ≥1 celda · resto no
vacío). **Migración aditiva** `20260615180000_add_ola4_field_types` (ALTER enum, idempotente). **API:** config viaja
verbatim en saveDraft/clone-al-publicar/mapVersion (×2: templates + log-entries.service); las dos rutas de completitud
(saveSection markComplete + `collectCompletionErrors`) usan `requiredFieldError`; `assertGridFieldKeysExist` rechaza
TABLE/MATRIX como candidato de Resumen (**opacos** a la grilla y al motor de reglas en el MVP). **Web:** `RepeatableControl`
(scroll horizontal + encabezado/1ª columna sticky, agregar/quitar/reordenar fila 44px; layout `cards`) y `MatrixControl`
(cabeceras read-only, celdas editables) co-ubicados en `FieldControl.tsx` y **recursivos sobre `FieldControl`** (modo nuevo
`bare` = celda sin etiqueta ⇒ un NUMBER trae su unidad/umbral, un SELECT su catálogo, sin duplicar render); editores
`TableConfigEditor`/`MatrixConfigEditor` en `BuilderConfigPanel`; paleta categoría nueva **"Estructurados"**; i18n es-CL;
CSS premium (sticky, glow, claro+oscuro). **Sin permisos nuevos — catálogo 60.** Tests: **contracts 230** (+8) · **API 234**.
**Smoke en vivo `scripts/smoke-objetos-ola4.py` 22/22**: versión CONGELADA viaja dataType TABLE/MATRIX + config
columnas/ejes/celda; guardar tabla con filas válidas → 2xx + array JSONB; quitar/reordenar fila persiste; celda fuera de
rango/tipo/catálogo → 400; columna required vacía en fila no vacía → 400; matriz válida → 2xx, celda > max → 400;
markComplete con tabla obligatoria vacía → 400, con ≥1 fila completa → 2xx; crea y LIMPIA por ID. typecheck/lint(0)/build
verdes. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda diferida (BACKLOG):** agregados por columna · refs del motor de
reglas a celdas/agregados · resumen "N filas" en la grilla · export CSV de tablas · REFERENCE/ATTACHMENT en celda · tabla
anidada · columnas de matriz desde el calendario operacional en vivo · stripping de filas vacías al persistir · pulido fino
sticky/táctil en tablet. **Siguiente: Ola 5** (origen de datos SCADA/PI/OPC, Fase 3).

**2026-06-15 — Catálogo de objetos premium · OLA 3 (adjuntos / terreno, infra MinIO) ✅** (`feat/objetos-ola3` →
`main`). Tercera ola: objetos de EVIDENCIA con almacenamiento de objetos on-prem, todos sobre el **render ÚNICO**
`FieldControl`↔`FieldGrid`. **4 forks confirmados por el dueño (DECISIONS 2026-06-15, recomendación aceptada en los 4):**
(1) **subida PROXIED por la API** (multipart `@fastify/multipart`): la API es el **choke-point** que valida tamaño/tipo y
audita antes de hacer stream a MinIO (presigned directo = camino de escala en BACKLOG); (2) **materializar al adjuntar** en
compose (la subida crea la entrada y guarda en `entries/{id}/{fieldKey}/{uuid}-{file}`; sin prefijo temporal ni sweeper en el
MVP); (3) **QR/código = `config.scan` sobre TEXT** (decode client-side con `@zxing/browser` que rellena el valor; NO es
archivo, sin storage; REFERENCE(equipment)-scan diferido); (4) **un `FieldType ATTACHMENT` + presets**, `dataType FILE_ARRAY`,
valor SIEMPRE `descriptor[]` (multiple=false limita a 1 ⇒ mapa dataType estático). **Storage:** `StorageService` (clase
abstracta = token DI, patrón `EmailService`) + `MinioStorageService` (SDK `minio`): put/stat/remove/removePrefix/presignedGetUrl,
bucket idempotente al arrancar; `StorageModule` `@Global`; `env.schema` `MINIO_*`. **Descriptor** persistido en
`LogEntryValue.value` (jsonb), **NUNCA una URL**: `{id,key,filename,size,contentType,checksum(sha256),uploadedAt,uploadedById}`;
la descarga = **presigned GET de vida corta** firmado server-side con la **MISMA ABAC** que `getDetail`. **API:** `POST
:id/attachments/:sectionKey/:fieldKey` (`logentry:fill`, valida+audita `attachment.uploaded`) + `GET
:id/attachments/:descriptorId/url` (`logentry:view`, resuelve el descriptor de los valores persistidos, audita `.downloaded`);
`saveSection` verifica la **pertenencia** de cada descriptor NUEVO (prefijo de objeto + existencia en storage, análogo a
`allowedRefIds` por prefijo) y **borra el objeto** quitado del campo tras commit (delete-on-remove); `voidEntry`
`removePrefix(entries/{id}/)` limpia la evidencia de un borrador anulado. **Migración aditiva**
`20260615160000_add_ola3_field_types` (ALTER enum `FieldType +ATTACHMENT`, `FieldDataType +FILE_ARRAY`, idempotente). **Web:**
`AttachmentControl` (render único: lista + descarga + subida por kind — foto/galería + cámara, archivo, nota de voz con
`MediaRecorder`, croquis en canvas→PNG), `QrScanButton` (cámara `@zxing/browser`), `api-client.apiUpload` (multipart con
Bearer/CSRF/refresh), paleta **categoría "Evidencia / Terreno"** (Foto/Archivo/Nota de voz/Croquis/Escáner QR), editor de
config (multiple/maxCount/maxSizeMb/accept/capture) + toggle scan en TEXT, `lib/format.formatFileSize` (regional), i18n es-CL.
**Sin permisos nuevos — catálogo 60.** Tests: **contracts 222** (+7) · **API 234**. **Smoke en vivo
`scripts/smoke-objetos-ola3.py` 26/26**: versión CONGELADA viaja type/dataType/config; PNG real → MinIO (descriptor
key/contentType/checksum); guardar + descargar presigned con bytes coincidentes; tipo/tamaño/key-ajena ⇒ 400; **entrada
SELLADA: subir ⇒ 400 y el objeto PERMANECE**; **VOID limpia el huérfano de MinIO (404)**; crea y LIMPIA por ID + objetos del
bucket. typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda diferida (BACKLOG):** antivirus
(ClamAV), object-lock/WORM, thumbnails/lightbox, retención automática, sweeper de subidas abandonadas, presigned directo
(escala), escáner solo `BarcodeDetector`/zxing (sin REFERENCE-scan). **Siguiente: Ola 4** (tabla/grupo repetible).

**2026-06-15 — Catálogo de objetos premium · OLA 2 (objetos de REFERENCIA + tolerancia/contador/riesgo) ✅** (`feat/objetos-ola2` →
`main`). Segunda ola del catálogo: objetos que apuntan a **entidades de la plataforma** (resolución y validación server-side
con ABAC) + tres analíticos, todos sobre el **render ÚNICO** `FieldControl`↔`FieldGrid`. **6 forks confirmados por el dueño
(DECISIONS 2026-06-15, recomendación aceptada en los 6):** (1) selectores de referencia = **UN tipo `REFERENCE` + `config.entity`**
(`equipment|user|orgNode|shift`), 4 presets en la paleta, `dataType REFERENCE` (ya existía) ⇒ cero migración de dataType. (2)
resolución + validación **espejo de `allowedCodes`**: `validateFieldValue` gana `opts.allowedRefIds`; endpoint genérico
`GET /log-entries/references/:kind/options?nodeId&q` con **ABAC en el backend** (equipo/turno acotados al nodo de la entrada; nodo a
accesibles; usuario activo); asserts en saveSection + collectCompletionErrors. (3) **lectura con tolerancia = NUMBER + `{expected,
tolerance,critTolerance}`** que DERIVA las bandas warn/crit (`deriveToleranceBands`/`effectiveNumberBands`, fuente única en validación
y `thresholdBandFor`). (4) **contador = NUMBER + `{counter,counterNonDecreasing}`** con lookup del último valor sellado del mismo
equipo+campo (`resolveCounterPreviousValues`/`counterMonotonicErrors`); `counterPreviousValues` en el detalle para el delta (delta =
presentación, no se persiste). (5) **matriz de riesgo = tipo `RISK_MATRIX` con `dataType RISK` nuevo** (valor `{probability,
consequence}`, nivel DERIVADO por matriz configurable ejes 2..7 + celda→severidad 1..5, ISO 31000; `riskLevelFor`). (6) paleta:
nueva categoría **"Referencia"**. **Migración aditiva** `20260615140000_add_ola2_field_types` (ALTER enum, idempotente; cero ruptura).
**API**: endpoint de opciones (gate `logentry:view`), validación ABAC de referencias, monotonicidad de contador, delta en el detalle.
**Web**: render único (4 selectores Combobox/LookupPicker que resuelven id→label en fill y visor; matriz clicable; tolerancia con
objetivo±tol; delta de contador), `useReferenceOptions`, paleta + editores de config (tolerancia/contador/**heatmap pintable** de
riesgo), i18n es-CL, CSS premium (tokens severidad, glow). **Sin permisos nuevos — catálogo 60.** Tests: **contracts 215** (+11) ·
**API 234**. **Smoke en vivo `scripts/smoke-objetos-ola2.py` 22/22** (round-trip tipo+config en versión CONGELADA por objeto; opciones
ABAC; válidos 2xx + banda WARN derivada de tolerancia; equipo de otro nodo / riesgo fuera de matriz / usuario inexistente ⇒ 400; crea
y LIMPIA por ID). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda:** contador no-decreciente y
delta cross-entry sin smoke en vivo (requieren entrada sellada previa); estampar delta como `computed`; banda de umbral para RISK;
crew como entidad; usuario filtrado por nodo. **Siguiente: Ola 3** (adjuntos + QR, infra MinIO).

**2026-06-15 — Catálogo de objetos premium · OLA 1 (objetos sin infraestructura) ✅** (`feat/objetos-ola1` →
`main`). El núcleo (NUMBER/TEXT/TEXTAREA/SELECT/MULTISELECT/BOOLEAN/DATE/DATETIME/SEVERITY/SIGNATURE) se amplió con los
objetos que esperan las bitácoras industriales, todos sobre el **render ÚNICO** `FieldControl`↔`FieldGrid` (builder =
llenado = visor). **5 forks confirmados por el dueño (DECISIONS 2026-06-15):** (1) **`displayAs`** en SELECT
(dropdown/radio/segmented) y MULTISELECT (dropdown/checkboxes/**modal** = Value Help con `LookupPicker`) — misma
validación/`dataType`; **tipos NUEVOS solo** donde la semántica difiere: **CONFORMITY** (tri-estado Conforme/No
conforme/N.A., `dataType CODE` con catálogo cerrado) y **RATING** (valoración estrellas/numérica/Likert, `dataType
NUMBER`). (2) Objetos de **PRESENTACIÓN** (HEADING/STATIC_TEXT/DIVIDER/NOTICE/PROCEDURE_LINK/REFERENCE_IMAGE) con
**`dataType LAYOUT`** dedicado que el llenado IGNORA (no `LogEntryValue`, no valida, fuera de reglas/resumen/obligatorios),
vía la fuente única `isPresentationalType`. (3) **HORA** (`TIME`) y **DURACIÓN HH:MM** (`DURATION`, minutos canónicos)
como tipos propios; **RUT/correo/teléfono/URL** = `TEXT + config.format` y **porcentaje/moneda** = `NUMBER + config.format`
(validación regional `isValidTextFormat`/`isValidRut`); **RANGO mín–máx** = tipo `RANGE` con valor estructurado `{from,to}`
(`dataType RANGE`; único no-escalar). (4) modal de multiselección reusa `LookupPicker`. (5) **paleta** del builder
reorganizada en **PRESETS por categoría** (Básicos · Selección · Evaluación · Presentación): un mismo `type` ofrece varios
presets (RUT/Correo son TEXT; Radio/Segmentos son SELECT) ⇒ la superficie de `FieldType` queda chica y la paleta rica.
**Contratos** (`@lyra/contracts`): +11 `FIELD_TYPES`, +`LAYOUT`/`RANGE` en `FIELD_DATA_TYPES`, `FIELD_TYPE_TO_DATA_TYPE`,
config Zod `.strict()` por tipo, `fieldConfigSchemaFor`, `validateFieldValue` (tri-estado/rating/time/duration/range +
format RUT/email/url/percent; presentación se ignora), `isEmptyValue` soporta RANGE, helpers puros RUT/formato/hora.
**Migración aditiva** `20260615120000_add_ola1_field_types` (ALTER enum, PG12+, idempotente; cero ruptura). **API**:
`saveSection` y `collectCompletionErrors` saltan LAYOUT en validación/persistencia/completitud (defensa en profundidad);
`assertGridFieldKeysExist` rechaza LAYOUT como candidato de Resumen; `deriveDataType`/clone/`mapVersion` ya cubren los
tipos. **Web**: `FieldControl` rinde los 13 objetos (premium, tokens claro+oscuro, 44px) + CSS; `lib/format`
(`formatRut`/`formatDurationHm`/`formatPercent`); paleta `FIELD_PALETTE`+`fieldDisplayMeta`; editores de config
(format/displayAs/rating/conformity/notice/heading/divider/enlace/imagen) en `BuilderConfigPanel`/`FieldPropertiesPanel`;
`EntryFillPage` excluye presentación de los valores; i18n es-CL completo. Se eliminó `AddFieldMenu` (huérfano).
**Sin permisos nuevos — catálogo 60.** Tests: **contracts 204** (+9) · **API 234**. **Smoke en vivo
`scripts/smoke-objetos-ola1.py` 21/21** (round-trip: tipo+config en versión CONGELADA por cada objeto; validación en vivo
válidos→2xx / inválidos→400 con ≥5 errores; presentación NO persiste valor; crea y LIMPIA por ID). typecheck/lint(0)/build
verdes. **Pendiente: smoke VISUAL del dueño** (§4: cada objeto premium, estados, claro/oscuro, responsive). **Siguiente:
Ola 2** (selectores de equipo/usuario/nodo/turno + lectura con tolerancia + contador + matriz de riesgo).

**2026-06-14 — Fase 2.1.7 Diseñador visual de formularios (lienzo de posicionamiento libre) ✅ FASE 1**
(`feat/builder-visual-designer` → `main`). El modelo auto-fila (orden + colSpan, ancho derivado) era rígido: no se
podía colocar un campo donde uno quería ni redimensionar uno libremente. Contradije el píxel-absoluto puro (Figma/Canva)
porque rompe el responsive de terreno (tablet/celular) — y el dueño aceptó **grilla responsiva de posicionamiento libre**
(`react-grid-layout`): geometría EXPLÍCITA `{x,y,w,h}` por campo (columnas `TemplateField.gridX/gridY/gridH` NULLABLE,
migración aditiva; `null`=legacy ⇒ el editor la deriva del orden+colSpan), arrastrar/redimensionar CUALQUIER campo,
snapping, arrastrar desde la paleta a una posición. Editor a **3 zonas** (paleta · lienzo RGL · propiedades) + selector
escritorio/tablet/móvil (preview responsivo con el MISMO `FieldGrid`, ahora data-driven + container-queries) + toggle de
cuadrícula. **Fuente única de render** intacta (editor=llenado=visor). Compat con plantillas viejas. typecheck/lint(0)/
build verdes; contracts 195 · API 234; **smoke `smoke-field-geometry.py` 14/14**. Diferido Fase 2/3 (historial, multi-sel,
alinear/distribuir, capas, copiar/pegar, atajos, edición por breakpoint, zoom). Pendiente: smoke VISUAL del dueño.

**2026-06-14 — Fase 2.1.6 Builder: motor de arrastre con dnd-kit (Canva-grade) ✅** (`feat/builder-dnd-kit` → `main`).
El dueño reportó que tras 2.1.5 seguía sin poder mover un campo al lado de otro. Causa doble: (1) **bug** del DnD nativo
(el drag solo arrancaba desde el grip, pero el ícono SVG hacía que el target no tuviera `data-drag-handle` ⇒ casi nunca
iniciaba); (2) **techo** del DnD nativo (no da la sensación Canva: fantasma gris, sin reflow en vivo). Se adoptó
**dnd-kit** (core 6 + sortable 10 + utilities 3; MIT, on-prem, pointer/teclado/touch) y se reescribió la interacción:
el **nodo sortable es la celda** (reflow animado de vecinos), la **tarjeta completa es el activador** (se agarra donde sea;
rótulo y borde exentos), **`DragOverlay`** dibuja la copia que sigue al cursor, y la **intención al-lado/fila se deriva
por píxeles** (centro del arrastrado vs rect del destino) reusando íntegro el auto-layout de 2.1.5 (`applyDrop`/`splitRow`).
**Frontend puro** (no toca modelo/API; sigue `colSpan`; `FieldGrid` = fuente única). typecheck/lint(0)/build verdes;
contracts 195 · API 234 (sin cambios). Pendiente: smoke VISUAL del dueño (BACKLOG §4).

Última actualización: 2026-06-12 (**Fase 1 completa**; **Fase 2.1/2.1.1/2.2/2.x/2.3.0/2.4/2.5/2.6.0 ✅** +
**Afinamiento #4 ✅** + **Fase 2.7.0 — Registro diferido ✅** + **Fase 2.7.1 — Período contable gobernado ✅** +
**Fase 2.7.1.1 — Calendario FISCAL transversal ✅**: el período se DESACOPLÓ de los turnos a la entidad transversal
`FiscalCalendar` (default + asignación por nodo); `OperationalPeriod` re-scopeada a `fiscalCalendarId × periodKey` con
rango `[periodStart, periodEnd)`; tri-estado **OPEN→CLOSED→LOCKED** (NetSuite) con **generación explícita** (Maximo),
cierre **secuencial**, lock/unlock two-key, reapertura con secuencialidad inversa; `assertWritable` gana LOCKED (bloquea
incl. bypass) y `requirePeriod`. **+ Afinamiento UX 2.7.1.1 ✅** (pantalla fiscal a pestañas + grilla con scroll/orden +
historial por período + **Configuración del sistema `/configuracion` con MFA por acción** + formato regional centralizado).
El **plan de fases 2.7 (Gobernanza temporal) / 2.8 (Alcance+acceso) / 2.9 (Plantillas inteligentes) fue APROBADO TAL CUAL
por el dueño del producto** (DECISIONS 2026-06-11).
**+ Fase 2.7.2 — Ventana de edición configurable ✅** (2026-06-12): plazo de corrección por plantilla (fallback global en
`SystemSettings`), ancla **RECORDED|EFFECTIVE**; fuera de ventana solo `logentry:write-expired` + **motivo auditado**
(+ MFA opt-in); en **AND** con el período ("gana la más estricta"), `blockedReason` extendido con `EDIT_WINDOW_EXPIRED`.
Catálogo **59**. Tests contracts 149 · API 200. Smoke en vivo 21/21.
**+ Afinamiento UX 2.7.2 ✅** (2026-06-12, rama `feat/ventana-edicion-ux`): duración en **minutos u horas** (unidad
canónica = minutos; migración `…_edit_window_minutes` ×60); **banner prominente** de ventana en llenado y visor; fix
alineación "Sellada"; **botón "Editar"** desde grilla/visor (acceso a entradas en curso). **+ Fase 2.8.2 ✅ (parcial): no
crear borradores huérfanos** — `GET /log-entries/new` (preview sin persistir vía `buildDetail`) + modo **compose** que
materializa la entrada al primer guardado real. **+ Arreglos de la demo en vivo**: endpoint `GET /log-entries/templates`
(picker gateado por `logentry:create`, no exige permiso de admin de plantillas); ítem de menú "Nueva entrada" gateado por
`logentry:create`; "Volver" contextual (a Bitácoras o al picker); indicador "secciones completadas" cuenta LOCKED (un
registro aprobado muestra M/M, no 0/M).
**REPRIORIZADO (2026-06-12, dueño):** **Siguiente = Fase 2.8 — Alcance + acceso**, empezando por **Alcance por PLANTILLA
(2.ª dimensión ABAC)** — detectado en vivo: hoy quien tiene módulo + alcance de nodo ve TODAS las plantillas. **2.7.3
(matriz rol×sección×tiempo) y el resto de la gobernanza temporal quedan en prioridades siguientes.**

**Fase 2.8 — Alcance por PLANTILLA (2.ª dimensión ABAC) ✅ (2026-06-12, `feat/alcance-plantilla` → `main`).** 2.º eje de
alcance de datos: limita QUÉ plantillas ve/usa cada usuario y con eso filtra el **picker** de `/nueva-entrada` y la **grilla/
stats/export** de `/bitacoras`. **6 forks resueltos con el dueño (DECISIONS 2026-06-12):** (1) **entidad aparte `TemplateScope`**
(`userId|roleId` XOR + `templateId`, sin `includeDescendants`), eje ORTOGONAL al `Scope` de nodo que combina en **AND** (patrón
SAP PM/Maximo: sitio ≠ tipo de objeto); migración aditiva con check de sujeto exclusivo, **sin tocar `Scope`**. (2) **semántica
PERMISIVA** (sin scope = ve TODAS), idéntica al eje de nodo (`null`=sin restricción) y a SAP/Maximo ⇒ **migración SIN backfill,
cero ruptura**; deny-by-default queda como flag futuro. (3) **AND** nodo×plantilla ("gana la más estricta"); las globales pasan
el eje de nodo pero quedan sujetas al de plantilla. (4) **plantilla individual** (sin categorías hoy; agrupador → BACKLOG). (5)
**solo superficies operacionales**: el admin `/plantillas` (`template:view`) NO se filtra (parámetro `applyTemplateScope`, default
`false` = admin idéntico; el picker pasa `true`); `assertTemplateInScope` en create/getDetail/saveSection/submit/setDeferral/
executeTransition + timeline/changes/related/verify (defensa en profundidad). (6) **asignación por usuario Y por rol en la UI**.
`ScopeService.getAccessibleTemplateIds` une scopes propios + de roles (espejo de `getAccessibleNodeIds`). Endpoints **separados**
`PUT /security/users/:id/template-scope` (`user:assign-scope`) y `PUT /security/roles/:id/template-scope` (`role:manage`),
auditados (`user|role.templatescope.assigned`); `GET /security/template-scope/options` (`user:assign-scope` OR `role:manage`,
sin exigir `template:view`). **Sin permisos nuevos — catálogo sigue en 59.** Web: `TemplateScopePicker` (selector plano searchable
agrupado por nodo, chips) en la pestaña *Alcance* del usuario (sección "Plantillas") y en el `RoleDrawer`. Tests: contracts **149**
· API **205** (+5). **Smoke en vivo 14/14** (picker/grilla filtran; getDetail 403 fuera / 200 dentro; options gateado 200/403;
admin intacto; scope por rol restringe; limpieza restaura permisivo; datos limpios). Pendiente: smoke VISUAL.

**+ Afinamiento 2.8 (QA del dueño, `feat/afinamiento-2.8` → `main`):** (1) **bug de anclaje de TODOS los selectores** —
el panel flotante se encogía al arrastrar su scrollbar (`useAnchoredPanel` escuchaba el scroll interno en captura y
`maxHeight` se realimentaba de `scrollHeight` recortado); fix = ignorar scroll interno + tope absoluto por viewport. **+
rediseño premium** de `Combobox`/`MultiSelect` (iconos Lucide, glass, estados con acento). (2) **fuga del filtro de
Bitácoras** — el selector de plantilla usaba `GET /templates` (solo nodo); nuevo `GET /log-entries/filter-templates`
(`logentry:view`) con el mismo alcance que la grilla. (3) **RoleDrawer a pestañas** (Datos/Permisos/Alcance) + más ancho.
(4) **acceso por rol desde la PLANTILLA** (`GET/PUT /templates/:id/role-scope`, `template:edit`, `TemplateAccessModal`):
`setRoleScope` solo toca las filas de esa plantilla (no borra el resto del alcance del rol). Auditado. Smoke **8/8** +
**14/14** sin regresión. Pendiente: smoke VISUAL.

**Fase 2.8.0 — Plantillas MULTI-NODO ✅ (2026-06-12, `feat/plantillas-multinodo` → `main`).** Eje de NODO de la
visibilidad de plantilla: una plantilla puede vivir en VARIOS nodos con 3 modos (un nodo / varios / "todos los hijos de
X" incl. nodos futuros vía `includeDescendants`). Entidad nueva **`TemplateNodeAssignment`** (templateId × orgNodeId +
includeDescendants, N:M, aditiva) = **fuente de verdad única** de la visibilidad por nodo; `Template.orgNodeId` queda como
**nodo primario DERIVADO** (deprecado, DROP en BACKLOG §3). **CERO asignaciones = GLOBAL** (semántica permisiva). Migración
`…_add_template_node_assignment` con backfill (1 fila por plantilla anclada; globales → 0 filas). `ScopeService.getAccessibleNodes`
(ids + rutas) + `isTemplateVisibleByNode`/`nodeAssignmentInScope` (puros, intersección de subárbol por ruta materializada).
`TemplatesService` filtra/persistte/deriva por asignaciones (audit before/after; `updateMeta` ahora transaccional). Al CREAR
una entrada: selector de nodo acotado a **asignaciones ∩ accesibles** — autoselección con 1, **elección obligada con >1**
(sin default silencioso); el backend AUTORIZA la membresía en `create` y `previewNew` (`assertNodeAllowedForTemplate`),
cerrando el diferido (a) de 2.4. Endpoint `GET /log-entries/templates/:id/nodes` (`eligibleNodesForTemplate`). Web: sección
"Alcance de estructura (nodos)" en el `TemplateBuilder` reutilizando `ScopeTreePicker` (prop nuevo `defaultIncludeDescendants`),
selector de nodo en `NewEntryPage` (modal `Combobox` si >1), display "Global / N nodos / nodo (y subnodos)". **Sin permisos
nuevos — catálogo 59.** Tests: contracts 149 · API **213** (+8). **Smoke en vivo 15/15** (`scripts/smoke-template-multinode.py`,
crea y limpia por ID). 6 forks en DECISIONS 2026-06-12. **Smoke VISUAL ✅** (confirmado por el dueño 2026-06-12: selector de
nodo al crear con elección obligada >1, publicar tras el fix de flujo).

**+ Fase 2.8.0.1 — Equipo OPCIONAL al crear entrada ✅ (2026-06-12, `feat/equipo-opcional-entrada` → `main`).** Objeto de
referencia EAM (SAP PM/Maximo: ubicación funcional [nodo] + activo [equipo]; grano ISO 14224 para confiabilidad/Fase 4).
Tras elegir el nodo, selector de **equipo opcional** instalado en ese nodo: `eligibleNodesForTemplate` devuelve los equipos
activos por nodo; `assertEquipmentInNode` valida pertenencia en create/previewNew; el modal de creación se abre también con
1 nodo si tiene equipos. `LogEntry.equipmentId` ya existía (2.4). El **equipo se muestra en la cabecera del llenado** (icono
+ nombre, consistente con visor/grilla). Smoke **18/18** + **VISUAL ✅** (confirmado por el dueño: elegir equipo y verlo en
el formulario). **Opción B agendada** (2.8.0.2: modo de equipo por plantilla, gobernanza). **+ fix de re-binding de flujo**
al guardar plantilla (bug preexistente 2.2: el builder reenviaba la versión de flujo congelada; ahora ata la vigente).

**+ Fase 2.8.0.2 — Modo de equipo por PLANTILLA (gobernanza, "opción B") ✅ (2026-06-12, `feat/modo-equipo-plantilla` →
`main`).** Capa de gobernanza sobre la mecánica de 2.8.0.1: el TIPO de registro (la plantilla) declara cómo se trata el
equipo y el backend lo AUTORIZA (patrón notification-type SAP PM / WO-type Maximo). Nuevo enum **`EquipmentMode`**
`NONE|OPTIONAL|SUGGESTED|REQUIRED` en **`Template`** (contenedor MUTABLE = gobernanza VIVA, sin republicar; espejo de la
ventana de edición 2.7.2), **default OPTIONAL** = preserva el comportamiento contextual previo (cero ruptura). **OPTIONAL y
SUGGESTED son equivalentes en el backend** (permisivos); SUGGESTED solo empuja en la UI (autoselecciona el equipo único,
"recomendado"). **Enforcement en `create`/materialización** (`assertEquipmentForMode`): REQUIRED sin equipo → 400, NONE con
equipo → 400; `previewNew` solo valida consistencia de NONE (REQUIRED no bloquea al componer). `eligibleNodesForTemplate`
expone `equipmentMode` (el modal de creación oculta/ofrece/sugiere/obliga) y omite equipos si NONE. Control "Equipo en la
entrada" en el `TemplateBuilder` (gate `template:edit`). **Sin permisos nuevos — catálogo 59.** Migración aditiva
`20260612180000_add_template_equipment_mode`. **6 forks resueltos (DECISIONS 2026-06-12).** Tests: contracts **151** (+2) ·
API **216** (+3). **Smoke en vivo 17/17** (`scripts/smoke-template-equipment-mode.py`: crea plantilla+equipo, recorre los 4
modos, crea+limpia por ID vía psql cascade). **Smoke VISUAL ✅** (dueño, en el afinamiento siguiente).

**+ Afinamiento UX del TemplateBuilder ✅ (2026-06-12, `feat/builder-vistas-config` → `main`).** Iteración del dueño (ver
DECISIONS 2026-06-12). **(1)** El guardado de **gobernanza** (identidad, alcance de nodos, ventana de edición, modo de
equipo) se separa con su **propio botón "Guardar configuración"** vía `PATCH /templates/:id` (en vivo, **sin borrador ni
publicar**); se **quitó** la gobernanza del payload del borrador (`editStateToDraftRequest`) y se creó `editStateToConfigRequest`.
Sin autosave (rechazado por el dueño); solo en edición. **(2)** El **flujo** se queda en Diseño (definición versionada). **(3)**
Builder reorganizado en **riel vertical** (Configuración [default] · Diseño) con sub-pestañas (Identidad y gobernanza | Alcance
y acceso; Editor | Vista previa) y **barra del builder sticky** bajo el topbar global. **(4)** `ScopeTreePicker` (toggle a la
derecha, filas sin tinte —el check basta—, resumen como panel con cabecera + chips) y **`Toast` (`@lyra/ui`)** más visible
(barra de acento + glow + badge). Sin permisos nuevos, sin migración. Tests sin cambio (API 216 · contracts 151); typecheck/
lint(0)/build verdes. **Smoke VISUAL ✅** (dueño). Saneamiento de dato demo: la v5 publicada de «Demo Completa» tenía config
`{}` (republicación antigua); restaurada desde la v2 (código actual verificado con round-trips, conserva la config).

**+ Fase 2.8.1a — Bitácoras: grilla ORIENTADA A CONTENIDO (MVP) ✅ (2026-06-13, `feat/bitacoras-grilla-contenido` → `main`).**
La grilla de `/bitacoras` dejó de ser CIEGA AL CONTENIDO: ahora se reconoce/encuentra un registro por su negocio. **6 forks
resueltos (4 recomendación aceptada + 2 criterio; DECISIONS 2026-06-12).** **(1)** Pool de campos candidatos de resumen como
**`Template.gridFieldKeys String[]`** — GOBERNANZA VIVA en el contenedor mutable (keyed por `key` estable, espejo de
`equipmentMode`/`editWindow`), guardado con **"Guardar configuración"** (`PATCH /templates/:id`, sin republicar la versión
GxP). Corrige el plan que nombró `TemplateField.showInGrid` (poner el flag en la versión inmutable forzaría re-aprobar una
versión controlada por un *hint* de visualización). Validación: cap **6** + sin duplicados (`gridFieldKeysSchema`) +
`assertGridFieldKeysExist` (key debe existir en alguna versión; órfano se ignora). Audit before/after. **(2)** El listado expone
`LogEntryListItem.summaryValues[]` (`{fieldKey,label,dataType,value,unit?,optionLabel?,thresholdBand}`) + `equipmentTag`;
`LogbookQueryService.buildSummaries` los arma **BATCHED por página** (cero N+1): valores acotados a candidatos + meta de campo
CONGELADA por versión + resolución code→label (inline + `referenceList`). Valor ESTRUCTURADO → el cliente formatea con
`lib/format` (regional). **(3)** Default = **línea "Resumen"** con TODOS los candidatos con valor (pool ≤6; lista
heterogénea); elección por usuario = 2.8.1b. **(4)** **Columna Equipo** `TAG · Nombre` (EAM). **(5)** **Búsqueda por
contenido CASE-INSENSITIVE**: `q` extendido con `$queryRaw` `ILIKE` sobre `value::text` de los candidatos (índice **GIN
trigram** `pg_trgm`), resuelto a ids e intersectado con el AND/ABAC del `where`. **(6)** ABAC: valores batch-cargados solo
para los `pageIds` ya filtrados ⇒ cero fuga. UI: checklist "Resumen en la grilla" en `TemplateBuilder` (Configuración) vía
`editStateToConfigRequest`; columnas Equipo + Resumen en `LogbookPage` (banda de umbral resaltada). Migración aditiva
`20260612190000_add_grid_field_keys`. **Sin permisos nuevos — catálogo 59.** Tests: contracts **154** (+3) · API **216**.
**Smoke en vivo 22/22** (`scripts/smoke-grid-content.py`: PATCH+cap+órfano, summaryValues label/unidad/banda/code→label,
equipmentTag, búsqueda hit/miss/case-insensitive, 3 usuarios demo listan 200; crea+limpia por ID). **+ Afinamiento QA del
dueño (2026-06-13):** mostrar todos los candidatos (no 3) + búsqueda case-insensitive (ILIKE crudo, reemplaza el
`string_contains` sensible a mayúsculas). Limitación MVP: la búsqueda matchea el code del SELECT, no su label (deuda).
**Pendiente: re-confirmación VISUAL del dueño tras los 2 ajustes.** Siguiente: **2.8.1b** (SavedView + gestor de columnas + multi-sort).

**+ Afinamiento UX de la grilla de Bitácoras ✅ (2026-06-13, `feat/bitacoras-grilla-contenido` → `main`).** Overhaul pedido por
el dueño tras el smoke visual (DECISIONS 2026-06-13). **Frontend** salvo un cambio chico de backend (multi-nodo); las **Vistas
Guardadas** (`SavedView`, backend) quedan para 2.8.1b. (1) **Fix del defecto de párrafos** del Resumen (truncado ellipsis +
tooltip; muestra todos los candidatos con valor, no 3). (2) **Filtros** a barra primaria (Buscar/Nodo/Plantilla/Estado +
presets) + **"Más filtros" en `Drawer`** con badge de activos. (3) **Filtro de nodo MULTI-NODO** real (`orgNodeIds` CSV→arreglo
en el contrato; `buildWhere` OR de prefijos de ruta con descendientes / `IN` sin; **ABAC en AND aparte**; UI `MultiSelect`).
(4) **Paginador discreto numerado arriba y abajo** (lote keyset de 100 paginado en cliente; rango "X–Y de N", 10/25/50 por pág.,
inicio «‹ números ›» fin; "siguiente" en la última página trae el lote siguiente). (5) **Botón Actualizar** + **KPIs centradas
con contorno premium** (glow del acento) + lista enmarcada + `<select>` discreto. Tests: contracts 154 · API **217** (+1
multi-nodo). Smoke **25/25**. typecheck/lint(0)/build verdes. **Pendiente: re-confirmación VISUAL del dueño.**

**+ Fase 2.8.1b — Bitácoras: VISTAS GUARDADAS + GESTOR DE COLUMNAS + MULTI-SORT ✅ (2026-06-13, `feat/bitacoras-vistas-guardadas`
→ `main`).** "El usuario dispone": elige qué ver, en qué orden, lo guarda y lo reusa. **5 forks resueltos (DECISIONS 2026-06-13).**
**(1) `SavedView`** = entidad GENÉRICA de PLATAFORMA (`module` discriminador `"LOGBOOK"`, reusable por Incidencias Fase 4) +
**`config jsonb`** (filtros/búsqueda/orden/columnas{orden,ocultas,ancladas,anchos}/densidad). **DATO PERSONAL** → autorización por
**OWNERSHIP** (no RBAC; sin permisos nuevos, catálogo 59). **UNA default por `(userId,module)`** vía **índice único PARCIAL**
`WHERE isDefault` (migración `20260613130000_add_saved_view`). `SavedViewsModule` CRUD (gateado por `logentry:view` + ownership en
service; desmarca la default previa en la misma tx). **(2) Vistas de SISTEMA en CÓDIGO** (`LOGBOOK_SYSTEM_VIEWS`: Firmas pendientes /
Excepciones / Últimas 24h); "Mi turno" DIFERIDA a 2.8.1c (necesita `ShiftResolver`). **(3) `Table` de `@lyra/ui` column-aware**
(retrocompatible): `columnState` controlado (orden, ocultas, ancladas izq/der sticky con offsets, anchos), `density`
comfortable|compact, `sorts` con badge de prioridad, `onColumnResize` (grip de arrastre). UI de gestión SEPARADA (`ColumnsDrawer`).
**(4) Multi-sort** keyset CORRECTO: contrato `sorts` (CSV `campo:dir`, máx 3 indexadas, precedencia sobre `sort`/`dir` legacy);
cursor generalizado a **tupla lexicográfica** (no pierde filas en empates); el header fija orden ÚNICO, el panel arma el multi.
Orden global por columnas de VALOR = Fase 7 (rompería keyset). **(5) URL ↔ vista:** la URL lleva filtros+búsqueda+orden
(compartible); columnas+densidad+vista activa = presentación personal en localStorage (última vista), NO en la URL. Aplicar vista
escribe su config; tocar filtros marca **dirty** → Actualizar / Guardar como. **+ Columnas de VALOR individuales por plantilla**
(headline del objetivo): con UNA plantilla filtrada el gestor ofrece sus `gridFieldKeys` como columnas (de `summaryValues`),
mostradas por defecto; con 0 o ≥2 plantillas cae a la línea "Resumen" (patrón Fiori smart columns). Web: `ViewBar` + `ColumnsDrawer`
+ `logbook-views` (mapeo estado↔config + localStorage). Tests: contracts **163** (+9) · API **224** (+7). Smoke en vivo **24/24**
(`scripts/smoke-saved-views.py`: CRUD, default único, ownership 404, validación, multi-sort + cursor reanuda/rechaza orden
incongruente; crea y LIMPIA por ID). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño.** Siguiente: **2.8.1c**
(peek lateral + facetas con conteo + review-by-exception + "Mi turno").

**+ Fase 2.8.1c — Bitácoras: PEEK LATERAL + FACETAS CON CONTEO + REVIEW-BY-EXCEPTION + "Mi turno" ✅ (2026-06-13,
`feat/bitacoras-peek-facetas` → `main`).** **Cierra TODA la 2.8.1** (grilla orientada a contenido: a reconocible · b vistas/
columnas/multi-sort · c buscar-y-encontrar). **5 forks resueltos (DECISIONS 2026-06-13).** **(1) `GET /log-entries/facets`**:
facetas con conteo (status/estado/plantilla/equipo/banda) reusando `buildWhere`+ABAC, con **conteos de HERMANOS** (cada faceta
se computa SIN su propio criterio ⇒ elegir un valor no anula las demás opciones; estilo Splunk/Kibana). COUNT exacto + top-N;
rollups/aproximado = Fase 7. **(2) `PeekDrawer`**: vistazo lateral **INSTANTÁNEO** armado desde la fila (cero round-trip) +
"Abrir ficha completa" → visor; **el clic en la fila abre el peek** (antes navegaba). Refinamiento sobre el plan (peek desde la
fila es más rápido que reusar `getDetail`; el detalle completo se abre aparte). **(3) `GET /log-entries/my-shift`**: vista de
sistema **"Mi turno"** resuelta por backend (`ShiftResolver.resolve(now, default)` → autor + día + turno vigentes; degrada a
autor+hoy sin calendario). Cierra el diferido de 2.8.1b. **(4) Facetas ↔ filtro ↔ URL/SavedView**: clic en un valor hace toggle
del filtro (single-select MVP). **(5) Review-by-exception en capas**: realce por FILA (tinte sutil por la peor banda, vía
`rowClassName` nuevo en `@lyra/ui` Table) + flag **`exceptionsOnly`** (umbral WARN/CRIT OR firma pendiente). **+ filtro de EQUIPO
en UI** (`equipmentId` en el estado de la grilla, togglable desde la faceta — cierra pendiente histórico de 2.6.1). **+ saneamiento:**
`formatSummaryValue` extraído a `logbook-cells` (compartido grilla/peek) y fecha de columnas migrada a `lib/format` (regional, dejó
de hardcodear `es-CL`). Web: `FacetsPanel` (sticky, premium) + `PeekDrawer` + chips/checkbox de `exceptionsOnly`. Sin permisos
nuevos (catálogo 59). Tests: contracts **163** · API **227** (+3: facetas hermanos, exceptionsOnly, my-shift). Smoke en vivo
**11/11** (`scripts/smoke-facets-peek.py`: facetas 5 dims, hermanos no se autoanulan + total acota 46→41, exceptionsOnly 1≤46,
my-shift turno "dia", ABAC 3 usuarios). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño.** **2.8.1 COMPLETA.**

**+ Workflow SLA + atrasos ✅ (2026-06-13, `feat/workflow-sla-atrasos` → `main`).** SLA de PERMANENCIA por ESTADO
(decisión del dueño). 4 forks resueltos (DECISIONS 2026-06-13). **Modelo:** `WorkflowState.maxStayMinutes Int?` (minutos
canónicos, check 1..525600) + `LogEntry.currentStateSince DateTime?` (estampado al crear = `recordedAt` y en cada
transición = `occurredAt`; backfill desde MAX(transición)|recordedAt). Migración aditiva `20260613140000_add_workflow_sla`.
**Contrato:** `workflowStateSchema.maxStayMinutes` + `draftStateInputSchema` + helper puro **`evaluateSla`** (fuente única:
`ok`/`at-risk` ≥80%/`breached`; `SLA_AT_RISK_RATIO`) + `roleNames` en la transición (responsable en el visor) + ítem de lista
(`currentStateSince`/`currentStateMaxStayMinutes`) + `delayedOnly` en la query + `stats.delayed` + `facets.delayed` + vista de
sistema "Retrasadas". **Persistencia:** el SLA viaja en la versión congelada (`saveDraft`/`ensureDraft`/`mapVersion`); el visor
resuelve `roleNames` (include de rol con nombre, sin migración). **Grilla:** `delayedEntryIds()` = JOIN raw
`LogEntry→WorkflowState` (`currentStateSince + maxStayMinutes < now()`) intersectado en AND con el `where`+ABAC (mismo patrón
que la búsqueda por contenido ⇒ cero fuga); KPI "Retrasadas", faceta toggle, columna/badge "Atraso" por fila (rojo vencido /
ámbar en riesgo). **Diagrama (registro):** nodo actual con anillo rojo "Atrasado hace X · SLA Y" / ámbar "En riesgo"; tramos
pasados sobre su SLA = badge ámbar; SLA + responsable en tooltips. **Builder:** `SlaDurationField` (Min/Horas/**Días** →
minutos, espejo de la ventana de edición 2.7.2) por estado. Tiempo CALENDARIO (horas hábiles = Fase 7). Duraciones vía
`lib/format.formatDuration` (regional). **Sin permisos nuevos — catálogo 59.** Tests: contracts **168** (+5 `evaluateSla`) ·
API **228** (+1 delayedOnly). Smoke en vivo **20/20** (`scripts/smoke-workflow-sla.py`: round-trip SLA builder/publish,
roleNames en versión congelada, delayedOnly/stats/facets, `currentStateSince` gobierna el atraso, ABAC 3 usuarios; muta por
psql y RESTAURA). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4).

## Hecho en Fase 2.7.2 (Ventana de edición configurable — gobernanza temporal #6)

2.º eslabón de la gobernanza temporal: plazo para CORREGIR un registro; vencido, solo se edita con privilegio explícito
y motivo auditado. Investigado el estándar (MHRA/FDA late entry; SAP OB52 / Odoo lock dates = config VIVA; Maximo). 5
forks resueltos con la opción recomendada (DECISIONS 2026-06-12). Rama `feat/ventana-edicion` (4 commits por capa).

- **Migración aditiva `20260612025159_add_edit_window`**: enum `EditWindowAnchor` (RECORDED|EFFECTIVE);
  `Template.editWindowAnchor?/editWindowHours?` (config en el CONTENEDOR mutable = gobernanza viva, sin republicar);
  `SystemSettings.editWindowAnchor`(default RECORDED)/`editWindowHours?`(null=sin ventana)/`requireMfaEditWindowOverride`;
  check constraints 0..8760 h. Aplicada con `migrate deploy` (EPERM del DLL con watch).
- **Contratos** (`@lyra/contracts`): `EDIT_WINDOW_ANCHORS` + `editWindowHoursSchema` (tri-estado null/0/>0);
  `EDIT_WINDOW_EXPIRED` sumado a `SECTION_BLOCKED_REASONS`; `editWindowInfoSchema` en el detalle; `overrideReason`(≥5) +
  creds en `saveSection`/`setDeferral`/`submit`. **Fuente única back↔front**: `resolveEditWindow` (herencia plantilla→
  global) / `editWindowDeadline` (ancla+horas) / `isEditWindowExpired` (borde NO inclusivo). Permiso nuevo
  **`logentry:write-expired`** (catálogo **58→59**).
- **Backend** (`LogEntriesService`): `assertEditWindowWritable` en saveSection/setDeferral/submit (NO create ni
  executeTransition: gobierna datos, no el avance del flujo). Vencida ⇒ exige el permiso + motivo (+ MFA si el ajuste lo
  pide, vía `ReauthService`); en **AND** con la guarda de período, cada una con su bypass. Override auditado con evento
  DEDICADO `logentry.editwindow.override` + `reason` en `LogEntryFieldChange`. `getDetail` expone `editWindow {anchor,
  windowHours, expiresAt, expired, canOverride, overrideRequiresMfa}` y `EDIT_WINDOW_EXPIRED` (precedencia ENTRY_CLOSED →
  PERIOD_CLOSED → EDIT_WINDOW_EXPIRED → reglas de sección). `TemplatesService` persiste/mapea la config (audit
  before/after); `SettingsService.editWindowSettings()` (1 lectura); `LogEntriesModule` importa `SettingsModule`.
- **Web**: control "Ventana de edición" en el `TemplateBuilder` (heredar/sin ventana/propia con horas+ancla); pestaña
  **Bitácoras** en `/configuracion` (ventana global + toggle MFA del override); en el llenado, chip "Editable hasta X",
  aviso de ventana vencida y **`EditWindowOverrideModal`** (motivo + contraseña/MFA si aplica) interceptando Guardar
  avance / Completar(+firma en un paso) / Enviar / diferido. `EntryFillPage` migrada a `lib/format.ts`. i18n es-CL.
- **Verificación**: `typecheck` (todos) · `lint` (0 errores, 1 warning preexistente OrgTree) · `build` web OK · `test`
  **contracts 149** (+5) · **API 200** (+10). **Smoke en vivo 21/21** (round-trip settings; ventana propia EFFECTIVE/24h;
  diferida 3d ⇒ vencida; 400 sin motivo / 200 con motivo + FieldChange + AuditLog dedicado; usuario sin permiso ⇒ 403 +
  EDIT_WINDOW_EXPIRED; MFA exigido sin enrolar ⇒ rechazo; entrada vigente ⇒ huella + canal normal intacto). Datos de
  prueba creados y LIMPIADOS (conteos en 0; AuditLog inmutable conserva el rastro). **Pendiente: smoke VISUAL** (§4).

## Hecho en Motor de reglas de negocio (Req-7 — primer corte)

**Motor de reglas — PRIMER CORTE ✅ (2026-06-14, `feat/motor-reglas` → `main`).** Núcleo declarativo + expresión segura
(NO acciones a otros módulos, NO límites dinámicos, NO DMN). 5 forks resueltos con el dueño (DECISIONS 2026-06-14).

- **Contracts (`@lyra/contracts/rules`)**: **AST tipo JSONLogic** con lista blanca de operadores + evaluador **PURO** (sin
  `eval`, sin dependencia) en `rules/expression.ts` — aritmética (÷0⇒vacío), agregación (ignora vacíos), comparación/lógica
  (propagan null), `if/coalesce/isEmpty`, `dateDiff/now`; cotas de nodos/profundidad; `collectVarRefs`. En `rules/rules.ts`:
  `computedFieldConfigSchema` (campo formulado) + `crossRuleSchema {key,when,severity,message}`; `topoSortComputed` (Kahn +
  detección de ciclo), `validateRulesDesign` (refs/ciclos/cotas), `recomputeComputedValues` (orden topológico, coerce por
  dataType, servidor autoritativo), `evaluateCrossRules` (ERROR bloquea / WARN informa / omite si falta campo). **Fuente única
  back↔front** (extiende `validateFieldValue`). `TemplateField.computed` + `TemplateVersion.rules` en la versión INMUTABLE;
  validación de diseño en el `superRefine` del borrador. **+24 tests (contracts 168→192).**
- **Migración aditiva** `20260614120000_add_business_rules`: `TemplateField.computed` (JSONB?) + `TemplateVersion.rules`
  (JSONB default `[]`). Sin backfill (cero ruptura).
- **API**: `TemplatesService` persiste/clona `computed`+`rules` (saveDraft/ensureDraft) y los expone (mapVersion).
  `LogEntriesService` recomputa los formulados (autoritativo) en saveSection/submit/executeTransition y los **estampa**
  (`stampComputedValues`: banda de umbral + `LogEntryFieldChange` reason=COMPUTED) mientras la entrada no esté sellada
  (congela al sellar). **Rechaza** escritura de cliente a formulados (read-only). **Validación CRUZADA**: ERROR bloquea
  completar/enviar/avanzar, WARN informa; el estampado va ANTES de la firma (snapshot §11.70 coincide con BD). **Sin permisos
  nuevos — catálogo 59.** Tests API **228** (ajustado el test de submit: sella dentro de `$transaction`).
- **Web**: `ExpressionEditor` recursivo (AST seguro + render infijo); toggle "campo formulado" + editor en `BuilderConfigPanel`;
  sub-pestaña **Reglas** en Diseño (`RulesEditor`); `FieldControl` muestra formulados **read-only** con badge "Calculado";
  `PreviewForm` y `EntryFillPage` **recomputan EN VIVO** con la misma fn pura del backend + banner de disparos de reglas.
  i18n es-CL + CSS premium. typecheck/lint(0)/build verdes.
- **Smoke en vivo `scripts/smoke-business-rules.py` 20/20**: diseño rechaza ciclo/ref inexistente (400×3); publicada expone
  regla+computed; **÷0 ⇒ eficiencia vacía**; consumo derivado por el servidor = 15; **formulado read-only ⇒ 400**; el cálculo
  del **servidor manda** (eficiencia=0.4); **umbral ISA-18.2 sobre el valor CALCULADO** (worstThresholdBand WARN); **regla
  cruzada salida>entrada BLOQUEA completar** (400 con su mensaje); con valores válidos completa 200; limpieza por ID = 0.
  **Pendiente: smoke VISUAL del dueño** (§4). **Siguiente corte:** límites dinámicos · acciones (incidencia→Fase 4 /
  notificación) · lookups de listas · DMN.

**+ Afinamiento UX del motor de reglas ✅ (2026-06-14, QA en vivo del dueño, en `main`).** Tras probarlo en navegador:
(1) **Pestaña Reglas enterprise**: TABLA de reglas (severidad/mensaje/condición legible) con **activar/desactivar** (`CrossRule.enabled?`
+ `name?`, evaluateCrossRules salta las desactivadas) + **modal crear/editar con AYUDA y ejemplo** + botones Guardar borrador/Publicar
también en Reglas + aviso "publicada → editar crea borrador". (2) **Selector de VALORES**: al comparar contra un campo de lista/sí-no, el
operando "Valor" se elige de un desplegable (evita escribir códigos errados — causa del caso real "la regla no dispara": se comparó
`conformidad="ok"` en vez de `estado_mecanico`). Metadata/infix compartidos en `expression-meta.ts`. (3) **Llenado**: el toggle SÍ/NO
arranca en `false` (apagado = No) — antes quedaba "vacío" y la regla `=No` no se evaluaba sin moverlo; **mensaje de regla específico**
(ApiError capta el arreglo `errors` del backend → `details`); **resalte de los campos** que la regla dispara (collectVarRefs). (4) **Bug
latente corregido**: `valuesFor` enviaba los campos formulados (read-only) → 400; ahora se excluyen. (5) **Fix de layout del builder**:
se quitó el `sticky` de la barra/columnas (se peleaba con las pestañas de trabajo y flotaba sobre el contenido). Contracts **193** ·
smoke **20/20** sin regresión. **Verificado en vivo por el dueño** ("ok funciona"); hará más pruebas.

**+ Fase 2.8.2 — VOID de borradores + ruta de edición propia ✅ (2026-06-14, `feat/void-edicion` → `main`).** Cierra la
deuda (b)(c) de 2.8.2 (la parte "no crear borradores huérfanos" ya estaba ✅). **4 forks resueltos con el dueño
(recomendación aceptada en los 4; DECISIONS 2026-06-14):** (1) **alcance = solo DRAFT** ahora (la anulación GxP de
entradas SELLADAS = transición inversa + firma §11.200, corte posterior junto a la reversa de 2.5); (2) **anulación
LÓGICA vía `status=VOID`, NO `deletedAt`** (estrena el enum, andamiaje muerto hasta hoy; `deletedAt` ocultaría hasta del
filtro VOID); (3) **autorización HÍBRIDA**: el AUTOR anula su PROPIO borrador por **ownership** (precedente SavedView) +
ABAC, y anular el AJENO exige el **permiso nuevo `logentry:void`** (catálogo **59→60**); (4) **solo MOTIVO ≥5 auditado**
para un borrador (sin re-auth/firma; eso se reserva a registros sellados). **(criterio)** ruta de edición **dedicada
`/bitacoras/:id/editar`** separada de creación/compose, reusando `EntryFillPage`. **Backend:** migración aditiva
`20260614150000_add_logentry_void` (`voidedAt/voidReason/voidedById`, sin backfill); `POST /log-entries/:id/void` (gate
grueso `logentry:view`; authz fina en servicio: ownership o `logentry:void`, + ABAC nodo×plantilla; solo DRAFT no sellado;
no re-anula; el período/ventana NO bloquean descartar); `buildWhere` **excluye VOID por defecto** (grilla/stats/facetas/
export/related) y lo muestra solo con `?status=VOID` (patrón ServiceNow "Cancelled"); evento **`VOIDED`** en el timeline;
auditoría `logentry.voided`. **Huella** `voidedByName/voidReason/voidedAt` en el detalle. **Web:** `VoidEntryModal`
(motivo ≥5) + `useVoidLogEntry`; botón "Anular borrador" en `EntryFillPage` (gateado por ownership/`logentry:void`) +
banner VOID; ruta `/bitacoras/:id/editar` (los botones "Editar" de grilla/peek/visor apuntan ahí, ya no a `/nueva-entrada`)
+ rótulo *eyebrow* (Editar/Nueva entrada/Llenado) + "Volver" al visor; banner VOID + evento VOIDED en `EntryViewerPage`;
i18n es-CL. Tests: contracts **193** · API **234** (+6). **Smoke en vivo `scripts/smoke-void-edit.py` 17/17** (anula con
motivo + huella; sale de la grilla y aparece con `?status=VOID`; timeline VOIDED; re-anular/motivo<5 ⇒ 400; ajeno sin
permiso ⇒ 403, sigue DRAFT; admin con `logentry:void` ⇒ 2xx; round-trip de edición persiste; crea y LIMPIA por ID, 0
huérfanos, AuditLog inmutable conserva el rastro). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño.**

**+ Fase 2.1.2 — Layout de formulario en GRILLA responsiva (ancho por campo) ✅ (2026-06-14, `feat/layout-grilla` →
`main`).** Presentación PURA y ADITIVA: el diseñador da un **ancho por campo** (FULL/HALF/THIRD) y los campos se
acomodan en una **grilla CSS responsiva por sección** que colapsa a 1 columna en tablet/celular (regla de terreno +
44px). NO toca validación/umbral/condicional/permisos/reglas; **default = FULL ⇒ cero ruptura** (lo existente se ve
igual). **5 forks resueltos con el dueño (DECISIONS 2026-06-14):** (1) **enum mínimo `{FULL,HALF,THIRD}`** (12/6/4 en
grilla de 12 col); (2) **columna dedicada `TemplateField.layoutWidth`** en la versión INMUTABLE — **corrige la sospecha
"config JSONB"**: los config por tipo son Zod `.strict()` (8 esquemas), así que `layoutWidth` calca el patrón de
`visibleWhen`/`computed`/`semanticRole` (columna top-level, NO en config); `@default(FULL)` NOT NULL rellena las filas
existentes en el mismo `ALTER` (sin backfill); (3) **responsive 12-col**: desktop FULL=12/HALF=6/THIRD=4, tablet
768–1023px THIRD→½, <768px 1 columna (alineado al breakpoint 768 de `ResizableSplit`; `min-width:0` evita reventar
columnas); (4) **hint universal** (todos los tipos, default FULL, el motor solo COLOCA); (5) **fuente de render ÚNICA**
`FieldGrid`+`FieldGridCell` (un solo CSS module) usada por los TRES lados (vista previa del builder, llenado, visor) ⇒
registro idéntico sin CSS copiado. **Contratos:** `layoutWidthSchema` en `field-types`, `templateFieldSchema` (no
nullable, el backend mapea FULL por default) + `draftFieldInputSchema` (opcional). **Migración aditiva**
`20260614170000_add_field_layout_width` (enum `LayoutWidth` + columna). **API:** persiste/clona `layoutWidth` en
`saveDraft` y en el clonado-al-publicar de `TemplatesService`, y lo expone en AMBOS mapeadores de versión (templates
para el builder + `log-entries.service.mapVersion` para el detalle de entrada — el contrato no-nullable obliga a ambos).
**Web:** selector segmentado (Completo/Mitad/Tercio, 44px, Lucide) en `BuilderConfigPanel`; `EditField.layoutWidth` en
`builder-model`; `PreviewForm`/`EntryFillPage`/`EntryViewerPage` envuelven sus campos en `FieldGrid`/`FieldGridCell`.
i18n es-CL. Sin permisos nuevos (catálogo 60). Tests: contracts **195** (+2) · API **234**. **Smoke en vivo
`scripts/smoke-field-layout.py` 12/12** (round-trip: borrador → publicado CONGELADO → detalle de entrada; omitido ⇒
FULL; crea+limpia por ID). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4).

**+ Fase 2.1.3 — Editor de layout WYSIWYG (grilla de 12 col + arrastre) ✅ (2026-06-14, `feat/layout-editor-wysiwyg` →
`main`).** Iteración sobre 2.1.2 por feedback del dueño ("el panel de ancho es ciego, no enterprise"). El editor del
builder pasa a ser **WYSIWYG por manipulación directa** (estándar ServiceNow/Power Apps/Salesforce/SAP Fiori/Retool):
los campos se ven en su ancho real en el lienzo y se **redimensionan/reordenan arrastrando**. **2 decisiones del dueño:**
(1) **granularidad de 12 columnas** ⇒ se **reemplaza** el enum `LayoutWidth {FULL,HALF,THIRD}` de 2.1.2 por entero
**`TemplateField.colSpan` 1..12** (`@default(12)`, SAP Fiori/Bootstrap); migración de conversión hacia adelante
`20260614180000_field_colspan` (FULL→12/HALF→6/THIRD→4, drop enum, CHECK 1..12). (2) manipulación directa COMPLETA.
**Sin librería de DnD nueva:** reusa el **DnD nativo HTML5** (patrón `ColumnsDrawer`) para reordenar y **pointer-events**
(patrón `ResizableSplit`) para redimensionar — el builder lo usa el Configurador en escritorio (44px/táctil es del
operador, ya cubierto). **Accesible:** flechas ↑↓ (teclado) + handle `role="slider"` (← → ±1). **Fuente de render única
intacta:** `FieldGrid`/`FieldGridCell` pasan de `width:enum` a `span:number` (vía `--col-span`, para que la media query
de celular colapse a 1 col); el lienzo del builder los REUSA ⇒ builder/llenado/visor idénticos. Nuevo `BuilderFieldCard`
(grip + meta + flechas + handle); `moveFieldBefore` reordena dentro Y entre secciones; presets de ancho (12/8/6/4/3) en
`BuilderConfigPanel`. Sin permisos nuevos (catálogo 60). Tests: contracts **195** · API **234**. **Smoke en vivo
`scripts/smoke-field-layout.py` 14/14** (round-trip colSpan 6/8/4/omitido⇒12 por borrador → publicado CONGELADO →
detalle de entrada; crea+limpia por ID). typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4:
arrastrar reordenar dentro/entre secciones + redimensionar 1..12 con reflow + teclado).

**+ Fase 2.1.4 — Builder CANVAS-FIRST con configuración en el lienzo ✅ (2026-06-14, `feat/builder-canvas` → `main`).**
Feedback del dueño tras 2.1.3 ("estrecho y poco intuitivo vs Canva; no podemos darle menos"). **Frontend puro** (no
toca modelo/contratos/API). El editor pasa a **canvas-first**: se elimina la grilla de 3 columnas; el **lienzo ocupa
todo el ancho** (artboard centrado ~1040px). La **paleta deja de ser columna** → popover **"＋ Agregar campo"**
(`AddFieldMenu`, reusa `Menu`) en la barra del lienzo y al final de cada sección (inserta en posición vía
`addFieldAt`). El **panel de config pasa a `Drawer`** que se abre con "Más opciones" (solo lo AVANZADO: umbral/opciones/
condicional/fórmula/roles). **Configuración EN EL LIENZO:** cada campo se ve como el **control REAL** (`FieldControl` no
interactivo) ⇒ WYSIWYG; **rótulo editable en el lugar**, **título/descr. de sección inline**, y **barra flotante**
(`FieldToolbar`) sobre el campo activo (ancho/obligatorio/mover ↑↓/duplicar/eliminar/más opciones). Se conserva arrastrar
para reordenar/redimensionar, la fuente de render ÚNICA (`FieldGrid` ⇒ builder ≈ llenado ≈ visor) y la accesibilidad.
Nuevos `AddFieldMenu`/`FieldToolbar`, `BuilderFieldCard` reescrito, `duplicateField`. **Entregado como Fase 1; Fase 2
diferida** (drag-desde-paleta-a-posición, edición inline de placeholder/ayuda/opciones, colapsar secciones, atajos,
multi-selección). Sin permisos nuevos (catálogo 60). Tests sin cambio (contracts 195 · API 234). typecheck/lint(0)/build
verdes. **Pendiente: smoke VISUAL del dueño** (§4: lienzo ancho, agregar con ＋ en posición, editar rótulo en el lienzo,
barra flotante, drawer de avanzado, arrastrar reordenar/redimensionar).

**+ Fase 2.1.5 — Builder: ancho completo + auto-layout por arrastre (Notion) + responsive de terreno ✅ (2026-06-14,
`feat/builder-autolayout` → `main`).** Feedback del dueño (4 puntos, "pensar en el usuario final"). **Frontend puro**
(se mantiene `colSpan`; el ancho se DERIVA del arrastre). **(#1)** lienzo a **todo el ancho** (se quita `max-width`).
**(#2/#3)** **auto-layout estilo Notion** (confirmado): soltar un campo **al lado** de otro ⇒ comparten fila con ancho
repartido solo (`splitRow` 2→6/6, 3→4/4/4, 4→3/3/3/3; tope 4); soltar **a su línea** (zona arriba/abajo) ⇒ ancho
completo; `onDragOver` deriva la zona del puntero (tercios) con **indicadores** (barra vertical=compartir fila /
horizontal=fila nueva). Helpers puros `splitRow`+`rowRangeOf`; `applyDrop` reemplaza `moveFieldBefore`. **El usuario ya
no elige "columnas":** se quita el menú "12/12" de la barra; el ajuste fino es un **DIVISOR** del borde (transfiere ancho
al vecino de la fila, suma constante, `resizeDivider`; solo si hay vecino a la derecha). **(#4)** responsive en
`FieldGrid` (fuente única ⇒ llenado+visor): móvil 1 col / **tablet 2 col** / escritorio 12. Sin librería nueva (DnD
nativo + pointer-events). Sin permisos nuevos (catálogo 60). Tests sin cambio (contracts 195 · API 234).
typecheck/lint(0)/build verdes. **Pendiente: smoke VISUAL del dueño** (§4: ancho completo, arrastrar al lado/a su línea,
divisor, tablet 2col/móvil 1col).

## Estado por fase

| Fase | Módulo | Estado |
|---|---|---|
| 0 | **Cimientos** (monorepo, Docker, Design System tokens, contratos, API health) | ✅ Hecho |
| 1 | Seguridad (auth + RBAC/ABAC) + Estructura organizacional + AuditLog | ✅ Backend ✅ · UI: Login ✅ · **Estructura ✅ (+ Equipos ✅)** · **Seguridad ✅** |
| 2 | Plantillas / Form Builder + Bitácoras | 🔄 **2.1 ✅** + **2.1.1 ✅** + **2.2 ✅** + **2.x ✅** + **2.3.0 ✅** + **2.4 ✅** + **2.5 ✅** + **2.6.0 ✅** + **2.7.0 ✅** (Form Builder + Flujos + Datos de referencia + Calendario operacional + Llenado + Ejecución de flujo/firmas + **Bitácoras núcleo de lectura** + **Registro diferido**) · 2.3 Rondas, 2.6.2, 2.7.1–2.7.3, 2.8, 2.9 pendientes |
| 3 | Orígenes de datos | ⬜ Pendiente |
| 4 | Motor de incidencias | ⬜ Pendiente |
| 5 | Cambio de turno + IA (resumen) | ⬜ Pendiente |
| 6 | Base de conocimiento + Dashboard + Asistente IA | ⬜ Pendiente |
| 7 | Endurecimiento (backups, observabilidad, exportación, rate-limit, adjuntos, i18n, offline) | ⬜ Pendiente |

## Detalle pantalla por pantalla (mapeo al prototipo)

| Pantalla del prototipo | Fase | Estado |
|---|---|---|
| Login (+ MFA TOTP + cambio forzado) | 1 | ✅ API + UI |
| Recuperación de contraseña (self-service) | 1 | ✅ API + UI |
| MFA self-service (perfil) + gate de enrolamiento forzado | 1 | ✅ API + UI |
| App Shell / Workspace premium (sidebar, topbar, pestañas, ⌘K, i18n) | 1 | ✅ UI |
| Estructura organizacional | 1 | ✅ API + UI |
| Equipos (CRUD + categorías + refs externas modelo) | 1 | ✅ API + UI |
| Seguridad / roles / permisos (nueva) | 1 | ✅ API + UI (usuarios/roles/política/auditoría + reset MFA de admin) |
| Plantillas (Form Builder) | 2 | ✅ **2.1** API + UI (definición: secciones/campos/umbrales/permiso por sección/borrador-publicar) |
| Nueva entrada / Llenado | 2 | ✅ **2.4** API + UI (llenado multi-actor por secciones, concurrencia, validación servidor, estampado de dimensiones, sellado al enviar) |
| Ejecución de flujo + firmas (Part 11) | 2 | ✅ **2.5** API + UI (transiciones gateadas rol-dato×ABAC×completitud, firmas re-auth/MFA step-up, bloqueo/desbloqueo de secciones, historial de transiciones) |
| Bitácoras (listado + detalle + log de cambios) | 2 | ✅ **2.6.0** API + UI (grilla enterprise + record viewer + timeline + verificación de firmas + export) · 2.6.1 personalización / 2.6.2 analítica pendientes |
| Orígenes de datos | 3 | ⬜ |
| Incidencias (kanban + drawer workflow) | 4 | ⬜ |
| Cambio de turno | 5 | ⬜ |
| Base de conocimiento | 6 | ⬜ |
| Dashboard | 6 | ⬜ |
| Asistente IA | 6 | ⬜ |

## Hecho en Fase 0
- Monorepo pnpm con `apps/` y `packages/` (ui, contracts, config).
- TypeScript estricto, ESLint (flat) y Prettier compartidos.
- `@lyra/ui`: tokens del Design System Lyra (CSS/`@theme`).
- `@lyra/contracts`: primer contrato compartido (`HealthStatus` + Zod) con test.
- `watchlog-api`: NestJS + Fastify + Helmet + pino, validación de entorno (Zod), `PrismaService`, endpoints `/api/health` y `/api/health/ready`, test del controller.
- `watchlog-web`: React + Vite + Tailwind v4 + TanStack Query; pantalla Fase 0 que consume el health del API vía el contrato compartido.
- Docker: `compose.dev` (Postgres/Redis/MinIO/Mailpit), `compose.prod` (stack completo), Dockerfiles multi-stage, Caddy (TLS + reverse proxy).
- Docs de memoria: ARCHITECTURE, DATA_MODEL, SECURITY, PROGRESS, DECISIONS.
- Commiteado y pusheado a `origin/main` (github.com/victorrubilarc/lyra-platform), 5 commits por capa.

## Verificación de la Fase 0 (todo ✅)
- `pnpm install` (545 paquetes) + cliente Prisma generado.
- `pnpm build` → contracts (tsc) · API (nest build) · web (vite, 1640 módulos).
- `pnpm typecheck` → 4 paquetes OK.
- `pnpm test` → contracts 2/2 · API 2/2.
- `pnpm lint` → 0 errores, 0 warnings.
- **Smoke test en vivo**: `pnpm infra:up` + `pnpm dev` → la web consume `/api/health/ready`
  contra Postgres real en Docker y muestra el estado en verde. Cadena web↔API↔BD validada
  con el contrato Zod compartido. **Sin pendientes en la Fase 0.**

## Hecho en Fase 1 (backend)
- **Contratos** (`@lyra/contracts`): catálogo de permisos 4D (19 claves, extensible), esquemas
  Zod de auth (login/refresh/MFA/cambio de contraseña), DTOs de users/roles/política y de
  estructura (OrgLevel/OrgNode + árbol). Test de consistencia del catálogo.
- **Esquema** (Prisma): identidad, RBAC/ABAC, sesiones/refresh, MFA, política, estructura y
  auditoría. Dos migraciones aplicadas. Check constraint del `Scope` polimórfico + trigger de
  inmutabilidad de `AuditLog`.
- **Auth**: proveedor local enchufable (Argon2id), `TokenService` (access JWT + refresh rotativo
  con familia y **detección de reuso**), `MfaService` (TOTP + recovery codes, secreto cifrado),
  `PasswordPolicyService` (complejidad + historial), lockout por fuerza bruta en BD, CSRF de
  doble envío. Controlador `/auth/*` con cookies httpOnly.
- **Authz**: `JwtAccessGuard` + `PermissionsGuard` globales, `@RequirePermission`/`@Public`,
  `PermissionService` (permisos efectivos cacheados con invalidación), `ScopeService` (ABAC con
  ruta materializada).
- **Crypto/Audit/Cache**: Argon2id + AES-256-GCM + SHA-256; `AuditService` append-only;
  `CacheService` (Redis con fallback en memoria).
- **CRUD**: estructura (niveles + nodos con mantenimiento de `path` y reparentado seguro),
  usuarios (alta/edición/roles/scope), roles (CRUD + sync de permisos), política y lectura de
  auditoría. Todo con guards por permiso.
- **Seed** idempotente (permisos + rol admin + política + admin de arranque) y variables de
  entorno nuevas en `.env.example`.
- **Tooling**: `dotenv-cli` para Prisma en el monorepo, `otplib` fijado a v12, `fastify` directo.

## Verificación de la Fase 1 (backend)
- `pnpm typecheck` · `pnpm lint` · `pnpm build` → OK en los 5 paquetes.
- `pnpm test` → 32 tests del API + 5 de contracts (crypto, guard de permisos, scope ABAC,
  rotación/reuso de refresh, login/lockout/MFA).
- **Smoke en vivo**: `pnpm db:seed` + API arriba → login del admin de arranque, `/auth/me`
  con permisos efectivos, 401 sin token, 403 de refresh sin CSRF, 200 con CSRF, y creación de
  estructura validando la ruta materializada (`/<root>/` → `/<root>/<hijo>/`).

## Hecho en Fase 1 (UI — Login + cimientos del frontend)
- **`@lyra/permissions`** (paquete nuevo, TS puro): `can`/`canAll`/`canAny`/`createPermissionChecker`
  tipados con `PermissionKey`. 5 tests. La UI solo oculta/deshabilita; el backend decide.
- **`@lyra/ui`** (antes solo tokens): componentes premium con **CSS Modules sobre tokens** —
  `Button` (primary/secondary/danger/icon + loading), `Input` (con slot derecho/mono), `FormField`
  (label+error+aria), `Card` (glass + glow), `Spinner`, `Toast` (`ToastProvider`/`useToast`).
  Área táctil 44px, dark-mode, Lucide. `cx` helper.
- **Cimientos web** (`apps/watchlog-web`):
  - `lib/session-token.ts` — access token **en memoria** (+ expiración); handler de expiración.
  - `lib/api-client.ts` — fetch central (Bearer + `credentials`), **refresh transparente en 401**
    (coalescido) + CSRF de doble envío; `ApiError` con `issues` de Zod.
  - `auth/` — `auth-store` (Zustand), `auth-api` (`/auth/*`), `AuthProvider` (bootstrap por refresh
    al arrancar + refresh proactivo ~30 s antes de expirar), `ProtectedRoute` (auth + desvío a
    cambio forzado), `useAuth`, `usePermissions`, `<Can>`.
  - `routes/` — router (react-router 7) + `AppLayout` (sidebar Lyra; ítems de módulo ocultos por
    permiso, módulos no construidos con badge "Pronto").
- **Pantallas**: `LoginPage` (paso 1 credenciales → paso 2 **MFA TOTP**, con mostrar/ocultar
  contraseña y manejo del `LoginResponse` discriminado), `ForcePasswordChangePage` (cambio forzado
  en primer ingreso), `HomePage` (landing autenticada con mapa de módulos). RHF + Zod del contrato.

## Pulido de la entrada (Login) — branding + estándar
- **Co-branding configurable por instalación** (`src/branding.ts` + `VITE_LICENSEE_*`, `envDir` al
  `.env` raíz): producto Lyra WatchLog + empresa licenciataria (nombre/rubro/logo), con monograma de
  iniciales como fallback. Logo sobre placa clara. Cliente real configurado: **Eagon Lautaro Ltda.**
  (logo en `apps/watchlog-web/public/branding/eagon.svg`).
- **Entrada premium**: layout split-screen, tarjeta estilizada (radio 24px, sombra en capas, barra de
  acento), **gráfico vectorial animado** propio (`BrandScene.tsx`: constelación Lyra + telemetría) y
  animaciones de entrada (respetando `prefers-reduced-motion`). Favicon de marca + `<title>`.
- **Fix de tokens**: se agregaron `--space-*`, `--text-*`, `--transition-*` que faltaban en
  `@lyra/ui/tokens` (mejora el espaciado/tipografía de toda la app).
- **Login estándar**: recordar correo, ¿olvidaste tu contraseña?, y en MFA opción de **código de
  recuperación**. Pantalla `/recuperar-contrasena` **asistida por administrador** (el reset
  self-service por correo queda pendiente de backend; ver Próximo paso).

## Verificación de la Fase 1 (UI — Login)
- `pnpm typecheck` (6 paquetes) · `pnpm lint` (0 errores, 0 warnings) · `pnpm build`
  (web: 1695 módulos, CSS 17 KB / JS 435 KB) → OK.
- `pnpm test` → **+5 tests** de `@lyra/permissions` (total: API 32 · permissions 5 · contracts).
- **Smoke en vivo** (infra + seed + API): login del admin de arranque ⇒ `authenticated` con
  `forcePasswordChange=true`, sin MFA, **19 permisos**, `scope.orgNodeIds=null`, cookies
  `wl_refresh`+`wl_csrf`; `/auth/me` con Bearer OK; **401** sin token; refresh **403** sin CSRF /
  **200** con CSRF; login con contraseña errónea ⇒ **401** "Credenciales inválidas". Es la cadena
  exacta que consume el Login. (No se mutó la contraseña del admin documentado.)

## Hecho en Fase 1 (Auth — Recuperación de contraseña self-service)
- **Backend** (NIST 800-63B / OWASP ASVS §2.5):
  - **`@lyra/contracts`**: `forgotPasswordRequest/Response`, `resetPasswordRequest`.
  - **Prisma**: modelo `PasswordResetToken` (hash SHA-256, `usedAt` single-use, `expiresAt`),
    migración `20260606021713_add_password_reset_token`.
  - **`EmailService`** (clase abstracta = token DI, patrón tipo `LlmProvider`) + **`SmtpEmailService`**
    (nodemailer; Mailpit en dev) + plantillas (enlace de reset y notificación de cambio). `EmailModule`
    global. Variables SMTP/`APP_PUBLIC_URL`/`PASSWORD_RESET_TTL` en `env.schema` y `.env.example`.
  - **`PasswordResetService`**: `requestReset` (respuesta neutra, envío en 2.º plano anti-*timing*,
    rate-limit por correo+IP en `CacheService`, invalida pendientes) y `resetPassword` (token
    hasheado/single-use/TTL, política, **revoca todas las sesiones**, limpia lockout/`forcePasswordChange`,
    notificación; **no toca MFA**, no auto-loguea, mensaje genérico). Endpoints públicos
    `POST /auth/forgot-password` (200 neutro) y `POST /auth/reset-password` (204).
  - `TokenService.revokeAllForUser`; `AuthService.changePassword` invalida tokens de reset pendientes.
  - Auditoría: `auth.password.reset_requested|completed|failed|throttled`.
- **Frontend**: `/recuperar-contrasena` (pedir correo + confirmación neutra) y nueva
  `/restablecer-contrasena?token=…` (`ResetPasswordPage`), reusando `@lyra/ui`, RHF+Zod del contrato y
  el api-client. **Endurecimiento del token en URL**: se borra de la URL al montar (`history.replaceState`)
  y `<meta name="referrer">` en `index.html`. `auth-api`: `forgotPassword`/`resetPassword`.
- **Seed**: usuario de prueba `demo@watchlog.local` / `Demo!Pass2026` (solo fuera de producción).
- **Verificación**: `typecheck`/`lint`/`build` OK (6 paquetes). `pnpm test` → **53** (API **43**, con
  **11 nuevos** de `PasswordResetService`; permissions 5; contracts). **Smoke en vivo con Mailpit**:
  respuesta neutra (un solo correo al usuario real), token single-use (reuso ⇒ 400), política aplicada
  (débil ⇒ 400), login con nueva contraseña ⇒ 200 y con la vieja ⇒ 401, notificación de cambio enviada.

## Hecho en Fase 1 (Auth — MFA self-service: política por rol + enrolamiento forzado)
- **Política de requerimiento** (NIST 800-63B / OWASP ASVS §2): `Role.requireMfa` + modo global
  `PasswordPolicy.mfaMode` (`OPTIONAL`/`REQUIRED_BY_ROLE`/`REQUIRED_FOR_ALL`; piso = OPCIONAL, sin modo
  "deshabilitado"). `MfaRequirementService` deriva `required`/`enrollmentPending`. Migración
  `20260606041921_add_mfa_policy_requirement` (+ `User.mfaFailedCount`/`mfaLockedUntil`).
- **Enrolamiento forzado con enforcement en backend**: claim **`mfaPending`** en el access token
  (recalculado en cada emisión/rotación) + **`MfaEnrollmentGuard`** global → **403
  `MFA_ENROLLMENT_REQUIRED`** salvo `@AllowPendingEnrollment` (me, logout, setup/verify, change-password).
  No degrada AAL. `SessionInfo.user` gana `mfaRequired` y `mfaEnrollmentRequired`.
- **Throttle del 2.º factor** (faltaba): contador propio en BD, separado del de contraseña; bloqueo tras
  `maxFailedAttempts`. Ventana TOTP ±1 (RFC 6238).
- **Reset de admin** `POST /security/users/:id/mfa/reset` (permiso nuevo `user:reset-mfa`): borra el
  factor y **revoca todas las sesiones** del objetivo. Un factor exigido **no** se auto-desactiva (403).
  **Regenerar recovery codes** (`/auth/mfa/recovery-codes/regenerate`, reconfirma contraseña).
  `requireMfa` editable en el CRUD de roles; `mfaRequired` en el detalle de usuario.
- **Frontend**: `MfaEnrollFlow` reutilizable (setup → QR con `qrcode.react` → verify → recovery codes
  copiar/descargar), página **`/perfil/seguridad`** (activar/regenerar/desactivar) y gate full-screen
  **`/activar-mfa`**. `ProtectedRoute` prioriza cambio de contraseña y luego enrolamiento de MFA. Enlace
  "Mi seguridad" en el sidebar.
- **Verificación**: `typecheck`/`lint`/`build` OK (6 paquetes). `pnpm test` → API **58** (+15:
  `MfaRequirementService` 7, `MfaEnrollmentGuard` 5, throttle 3) + permissions 5 + contracts.
  **Smoke en vivo** (demo, admin): gate (403 `MFA_ENROLLMENT_REQUIRED` → enrolar con TOTP real → 200),
  throttle (bloqueo al 5.º intento, mensaje al 6.º, código correcto rechazado estando bloqueado), admin
  reset (revoca sesiones: refresh post-reset = 401). Estado del demo restaurado (mfaMode OPTIONAL, sin MFA).
- **Pendiente (registrado, no en esta sesión)**: la **UI de admin** (ver estado / resetear MFA en el CRUD
  de usuarios) llega con la pantalla de Seguridad; igualar `forcePasswordChange` con enforcement de
  backend; anti-replay de OTP.

## Hecho en Fase 1 (UI — App Shell / Workspace premium)
Marco donde viven todos los módulos (ver DECISIONS 2026-06-06). Reemplaza el `AppLayout` básico.
- **`@lyra/ui` (+9 primitivos)**: `Toggle`, `Tooltip`, `Menu`/`MenuItem`/`MenuSeparator`/`MenuLabel`,
  `Modal`, `Drawer`, `Skeleton`, `Breadcrumb`, `EmptyState` — CSS Modules sobre tokens, a11y, área 44px,
  `prefers-reduced-motion`. (`Table` queda para Estructura.)
- **Shell** (`apps/watchlog-web/src/shell/`): `AppShell` (sidebar colapsable completo↔riel + top bar +
  pestañas + Outlet), `Sidebar` (gated por permiso, favoritos, tooltips en riel), `Topbar` (breadcrumbs,
  búsqueda ⌘K, densidad, idioma, notificaciones, **menú de perfil** con Mi seguridad/MFA + logout),
  `WorkspaceTabs` (**pestañas acotadas** tope 6, fijables, cada una = ruta), `CommandPalette` (cmdk).
- **Estado de UI persistido** (`localStorage`, nunca secretos): `ui-store` (sidebar/densidad),
  `workspace-store` (pestañas), `favorites-store` (favoritos/recientes). `navigation.ts` = registro único
  de rutas (label i18n + ícono + permiso).
- **i18n-ready** (`react-i18next`): `es-CL` por defecto, **strings como claves**, selector de idioma
  (inglés marcado "Próximamente"); preferencia persistida. Catálogos extra → Fase 7.
- **Tema claro / oscuro / auto** (revierte "dark-only v1"): token-first vía `data-theme`, paleta clara
  completa + tokens `--color-hover`/`--color-chrome`, `theme-store` (auto = sistema), selector en topbar
  y ⌘K. La entrada/login queda SIEMPRE oscura. **Pestañas** con acento de marca + animación sobria.
- **Caché compartida** (TanStack Query, `staleTime` 30s): las pestañas preservan estado sin refrescos.
- **Verificación**: `typecheck`/`lint`/`build` (web 1829 módulos) verdes · `pnpm test` 58 (API) ·
  dev sirve y transforma el shell + optimiza `cmdk`/`i18next`. **Pendiente: smoke VISUAL en navegador**
  (colapsar, pestañas, ⌘K, idioma, densidad) — ver BACKLOG §4.

## Fuera de alcance de la Fase 0/1 (planificado para más adelante)
- Build de imágenes de producción (`docker-compose.prod.yml`) — Fase 7 (endurecimiento).
- Ranura OIDC/LDAP: diseñada y con el `AuthProvider` listo para enchufar; se activa cuando un
  cliente lo pida.

## Hecho en Fase 1 (UI — Estructura organizacional)
Pantalla `/estructura` completamente funcional dentro del shell premium.
- **`@lyra/ui` (+3 componentes):** `Chip` (badge semántico, 6 variantes, dual theme), `Table`
  (sortable, skeleton rows, slot vacío, dual theme, CSS Modules), `Select` (mismo patrón que Input).
- **Backend**: `DELETE /structure/levels/:id` añadido (bloquea si hay nodos activos con ese nivel;
  auditoría append-only).
- **Capa de datos** (`structure-api.ts` + `structure-queries.ts`): 7 llamadas tipadas contra
  `@lyra/contracts` + hooks TanStack Query para niveles y árbol, con mutaciones e invalidación de caché.
- **StructurePage**: gateada por `module:structure:view`; header con acciones gateadas por permiso;
  skeleton de carga; EmptyState para árbol vacío; aviso si no hay niveles configurados.
- **OrgTree**: árbol recursivo expandible/colapsable (estado local), `Chip` de nivel, menú `⋮`
  por nodo con acciones gateadas por permiso (`orgnode:create/edit/delete`).
- **NodeDrawer**: crear nodo raíz / hijo / editar — RHF + Zod del contrato; select de niveles; campo
  código opcional.
- **LevelsDrawer**: tabla de niveles con edición inline + crear + eliminar (gateado por
  `orglevel:manage`).
- **DeleteNodeModal**: confirmación con aviso si el nodo tiene hijos.
- **MoveNodeModal**: árbol compacto para reparentar; pre-deshabilita el propio nodo y sus
  descendientes usando `path.startsWith()` (misma lógica que el backend).
- **i18n**: namespace `structure` completo (es-CL); `common` consolidado con claves `edit/delete/errorGeneric`.
- **Smoke en vivo**: API health ✅, GET tree ✅, POST node ✅, PATCH rename ✅, DELETE 204 ✅,
  DELETE level bloqueado con 400 ✅, DELETE level vacío 204 ✅.

## Verificación de la Fase 1 (UI — Estructura)
- `pnpm typecheck` · `pnpm lint` · `pnpm build` (1849 módulos) → OK en 6 paquetes.
- `pnpm test` → 63 tests (API 58, permissions 5, contracts) — sin cambios en tests.
- **Smoke via API** completo (ver arriba). **Pendiente:** smoke VISUAL en el navegador (abrir
  `/estructura`, crear nodo, abrir drawer, cambiar niveles, mover nodo, eliminar) — ver BACKLOG §4.

## Hecho en Fase 1 (UI — Estructura v2: master-detail premium + seed real)

- **@lyra/ui — Menu portal**: el panel del `Menu` se renderiza via `createPortal` en `document.body`
  con `position:fixed`. Soluciona definitivamente el recorte por `overflow:hidden` en cualquier
  contenedor padre. El detector de click-fuera usa refs separados (trigger + panel).
- **Layout master-detail de dos paneles** (patrón SAP PM / Maximo):
  - Panel izquierdo (260 px): árbol de navegación puro — selección + expandir/colapso,
    dot de color por nivel (índigo/cián/verde), badge de hijos, auto-expand del path al navegar.
  - Panel derecho: `NodeDetail` con breadcrumb clicable, header (icono de nivel + nombre + Chip
    + código), acciones de la barra (Editar / Mover / Eliminar gateados por permiso), tabla de
    hijos directos con CRUD inline, placeholder "Equipos — próximamente" para el nivel final.
  - No más menú ⋮ por nodo: las acciones están en el panel, con contexto y espacio suficiente.
- **Seed de 2 plantas reales** (REMANUFACTURE PLANT + TREATMENT PLANT): 3 niveles
  (Planta/Area/Proceso) y 49 nodos reales del sistema de referencia. Idempotente: solo crea si
  no existen nodos; limpia niveles huérfanos si el árbol está vacío.
- **i18n**: claves `structure.tree.*`, `structure.detail.*`, `common.add`.
- **Verificación**: `typecheck`/`lint`/`build` (1851 módulos) OK. Pusheado a `origin/main`.
- **Pendiente:** smoke VISUAL en el navegador (seleccionar nodo, navegar breadcrumb, CRUD inline
  desde detalle, verificar botón Equipos placeholder, modo claro y oscuro) — ver BACKLOG §4.

## Hecho en Fase 1 (Estructura — externalCode + Table fix)

- **`externalCode` en OrgNode**: campo nullable para integración con ERP/CMMS/SCADA.
  - Migración `20260607212602_add_org_node_external_code` (columna `externalCode String?`).
  - `@lyra/contracts`: campo en `orgNodeSchema`, `createOrgNodeRequestSchema`, `updateOrgNodeRequestSchema`.
  - `structure.service.ts`: pasa `externalCode` en create/update, lo incluye en `buildTree` DTO.
  - `NodeDrawer.tsx`: campo "Cód. externo" opcional (después de `code`), i18n + hint.
  - `NodeDetail.tsx`: badge "EXT + código" en el header del nodo; columna "Cód. ext." en la tabla de hijos.
  - `es-CL.ts`: claves `externalCode`, `externalCodeDesc`, `externalCodePlaceholder`.
- **`@lyra/ui — Table`**: fix TypeScript `Object is possibly 'undefined'` en `getPageNumbers`.
- **Verificación**: `typecheck`/`lint`/`build` (API + web + contracts) OK en todos los paquetes.

## Hecho en Fase 1 (Estructura — UX: layout responsivo, splitter, description, reportOrder)

Sesión de pulido de UX del mantenedor de Estructura (ver DECISIONS 2026-06-08). 4 commits en `origin/main`.

- **Workspace full-width y responsivo (token-first):** se eliminaron `max-width` (1320/1400px) +
  `margin:0 auto` + doble padding. Tokens de layout nuevos en `@lyra/ui` (`--layout-content-pad-x/y`,
  `--layout-tree-width`) + breakpoints mobile <768 / tablet-desktop / wide >1920. El árbol crece
  260→300→320px y el detalle usa todo el resto.
- **`ResizableSplit` en `@lyra/ui`** (reemplaza `react-resizable-panels`, que recortaba el contenido y
  ponía topes): split horizontal propio sin dependencia — ancho izq. en px (contenido con ellipsis, no
  recorte), divisor con mouse/teclado/táctil, doble clic resetea, persistencia en `localStorage`,
  re-clamp con `ResizeObserver`. Bundle −32 KB. Reutilizable en cualquier pantalla de dos paneles.
- **`description` en `OrgNode` (full-stack):** migración `…_add_orgnode_description`, contratos,
  service (create/update/buildTree), `NodeDrawer` (textarea), segunda línea en árbol y grilla, y en el
  header del detalle. Descripciones de demo (remanufactura de madera) en `prisma/structure-descriptions.ts`
  (fuente única) + backfill no destructivo (`db:backfill-descriptions`, 49 nodos).
- **`reportOrder` en `OrgNode` (orden en informes, relativo a hermanos):** migración
  `…_add_orgnode_report_order` (`Int @default(0)`), contratos, service; `getTree` ordena por
  `(reportOrder asc, name asc)` (árbol + grilla). `NodeDrawer` campo numérico; **edición inline** en la
  grilla (persiste con `useUpdateNode` en blur/Enter). Orden inicial escalonado (10,20,30…) por hermanos
  vía helper único `prisma/report-order.ts` (seed + backfill `db:backfill-report-order`, 49 nodos).
- **Grilla de hijos ordenable:** `NodeDetail` mantiene estado de sort y ordena hijos localmente
  (nombre/orden/código/cód. externo); el `Table` ya era controlado. Densidad de tabla reducida
  (padding 14→10, th 10→8) con `min-height:44px` por fila (área táctil).
- **Dev server fijado a 5173:** `strictPort:true` + `predev` `scripts/free-port.mjs` (libera el puerto
  antes de arrancar, cross-platform).
- **i18n:** claves `structure.node.description*` y `structure.node.reportOrder*`.
- **Fix responsivo del header del detalle** (post smoke visual): en paneles angostos (tablet / splitter
  arrastrado) los botones Editar/Mover/Eliminar aplastaban la columna de info y la descripción caía
  "una palabra por línea". `.nodeInfo` con `min-width:220px` + `.nodeHeader` con `flex-wrap`: las
  acciones bajan a su propia fila cuando no caben (flexbox, sin breakpoint mágico).
- **Verificación:** `typecheck` (web/api/contracts/ui) + build de producción OK; backfills verificados
  por consulta directa a BD (ELABORACION: reportOrder 10–90, descripciones pobladas). **Smoke VISUAL en
  navegador ✅** (el usuario confirmó: splitter, 2ª línea en árbol y grilla, orden de columnas, edición
  inline del orden, full-width y comportamiento en iPad tras el fix del header).

## Hecho en Fase 1 (Módulo Equipos — cierra Estructura)

Reemplaza el placeholder "Equipos — próximamente" del nivel final por un CRUD real. Ver DECISIONS
2026-06-08 (modelo integration-ready + alcance de integración).

- **`@lyra/contracts`**: `structure/equipment.ts` (schemas Zod + DTOs de `Equipment`,
  `EquipmentCategory` y tipos de `ExternalReference`); **5 permisos nuevos** en el catálogo
  (`equipment:view/create/edit/delete`, `equipmentcategory:manage`) → 25 claves totales.
- **Prisma** (migración `20260608195838_add_equipment_and_external_reference`): modelos `Equipment`,
  `EquipmentCategory`, `ExternalReference` + relaciones en `OrgNode`. Check constraints raw SQL:
  dueño polimórfico exclusivo en `ExternalReference` (orgNodeId XOR equipmentId) y criticidad 1–5.
- **API**: `EquipmentModule` (service + controller) → `GET/POST/PATCH/DELETE /structure/equipment`
  (filtro `?orgNodeId=`) + CRUD de categorías (`/structure/equipment/categories`), todo gateado por
  permiso y auditado. Mapeo de tag duplicado (P2002) → 400. **Guard nuevo en `deleteNode`**: bloquea
  borrar un nodo con equipos activos. **9 tests** del service.
- **Seed** (dev): catálogo de 12 categorías (madera) idempotente + 9 equipos de ejemplo en procesos
  reales, con orden escalonado. `equipment-seed-data.ts` como fuente única.
- **Web** (`features/structure/`): `equipment-api`/`equipment-queries` (TanStack Query); `EquipmentDrawer`
  (molde NodeDrawer: tag, categoría, fabricante/modelo/serie, criticidad, toggle de estado, orden,
  descripción); `CategoriesDrawer` (molde LevelsDrawer, edición inline + toggle activo); **`EquipmentSection`**
  reemplaza el placeholder en `NodeDetail` (grilla `Table` sortable + edición inline del orden + chip
  de criticidad por severidad + chip de estado + descripción 2ª línea + delete modal). i18n namespace
  `equipment` (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores)/`build` (web 1859 módulos)/`test` (**API 67**, +9;
  permissions 5; contracts) en verde. **Smoke en vivo** (API + demo): listar categorías (12) y equipos
  seed; crear/editar/borrar (lógico) equipo; **400** sin `orgNodeId`, tag duplicado, criticidad fuera de
  rango (check de BD) y nodo inexistente; **deleteNode** bloqueado con equipos activos (400); categoría
  en uso no borrable (400), CRUD de categoría OK; **check constraint polimórfico de `ExternalReference`
  verificado en BD** (ambos-nulos→falla, uno→OK, ambos→falla).
- **Pendiente:** smoke **VISUAL** en navegador (seleccionar nodo de nivel Proceso → grilla de equipos,
  alta/edición vía drawer, orden inline, gestión de categorías, modo claro) — ver BACKLOG §4.
- **Home — tarjetas navegables:** el mapa de módulos del `HomePage` ahora **enlaza** las tarjetas con
  pantalla disponible (Estructura → `/estructura`, "Disponible") o en construcción (Seguridad →
  `/seguridad`, "En construcción"), gateadas por permiso de módulo; las no iniciadas siguen como
  "Pronto" no clicables. `navigation.ts`: Estructura deja de marcarse `soon` (ya construida), así el
  sidebar tampoco la muestra como "Pronto".

## Hecho en Fase 1 (UI — Seguridad: usuarios/roles/política/auditoría)

Consume el backend de seguridad ya existente. Ver DECISIONS 2026-06-08. La UI solo oculta/deshabilita
(el backend decide), permisos desde el catálogo de `@lyra/contracts` (nunca hardcodeados), dual theme, i18n es-CL.

- **`@lyra/contracts`**: nuevo `auditLogEntrySchema` + `AuditLogEntry` (+ test de consistencia, 8 tests en
  contracts). `scopeEntrySchema.includeDescendants` pasa a explícito (sin `.default`) por correctitud de
  tipos input/output en el cliente.
- **API (solo tipado)**: `GET /security/audit` ahora retorna `AuditLogEntry[]` tipado (mapeo `occurredAt`→ISO).
  Sin cambio de comportamiento en el cable.
- **`@lyra/ui` (+1 primitivo)**: `Checkbox` (CSS Module sobre tokens, dual theme, área 44px, **estado
  indeterminado** para selección de grupo).
- **Navegación (sub-rutas anidadas, una pestaña por módulo)**: `/seguridad` = `SecurityLayout` (sub-tabs +
  `Outlet`); sub-rutas reales `/seguridad/{usuarios,roles,politica,auditoria}` deep-linkables, cada una
  gateada por permiso; índice redirige a la 1.ª permitida. Helpers `routeForPath`/`isRouteActive` en
  `navigation.ts` + ajustes en AppShell/WorkspaceTabs/Topbar/Sidebar (match por prefijo). Seguridad deja de
  ser `soon`; Home la marca "Disponible".
- **Capa de datos** (`security-api.ts` + `security-queries.ts`): llamadas tipadas contra contracts + hooks
  TanStack Query (usuarios, roles, catálogo de permisos, política, auditoría con `useInfiniteQuery`).
- **Usuarios** (master-detail con `ResizableSplit`): `UsersPage` (lista buscable) + `UserDetail`
  (**pestañas** Datos/Roles/Alcance/Seguridad, cada una con guardado independiente: datos básicos, **roles**,
  **alcance de datos** vía `ScopeTreePicker`, **Seguridad** = reset de contraseña + estado/reset de MFA) +
  `UserDrawer` (alta con contraseña temporal + generador) + `ResetMfaModal` + `ResetPasswordModal`.
- **Reset de contraseña por admin** (post-revisión, ver DECISIONS 2026-06-08): variante A estilo AD —
  contraseña temporal + cambio forzado + revoca sesiones + audita, **sin tocar MFA**. Permiso nuevo
  `user:reset-password` (catálogo **26**), endpoint `POST /security/users/:id/reset-password`, UI en la
  pestaña *Seguridad*. **3 tests** nuevos del `AuthService`.
- **Pulido UX post-revisión**: `ScopeTreePicker` con **buscador** (poda el árbol a coincidencias + ancestros,
  auto-expande, sin acentos/mayúsculas) + **resumen de seleccionados** (chips removibles + limpiar), para
  árboles extensos. Pestaña *Alcance* preparada como **multi-dimensión** (encabezado "Estructura
  organizacional"; las plantillas se sumarán como sección hermana en Fase 2). **Buscador** en la pestaña de
  *Roles* (filtra por nombre/clave/descripción) y **buscador en la matriz de permisos** del editor de rol
  (`PermissionMatrix`: filtra por clave/descripción/grupo, sin acentos; el "seleccionar grupo" opera sobre lo
  visible filtrado).
- **Auditoría filtrable (para auditores)**: backend `GET /security/audit` extendido con filtros **rango de
  fechas** (`from`/`to`), **acción**, **actor** y **tipo de entidad** (coincidencia parcial insensible a
  mayúsculas, vía `where` de Prisma). UI con barra de filtros (fechas + texto + select de entidad), **atajos
  de rango** (24 h / 7 d / 30 d), conteo de resultados y debounce; la query de TanStack se rekeyea por
  filtros. Contrato `AuditFilters`. Smoke en vivo: `action=login` → todos con "login"; `entityType=Role` →
  todos Role; `from=hoy` acota; rango futuro → 0.
- **Exportación CSV** (transversal, anticipada): **Auditoría** exporta **server-side el set completo filtrado**
  (`GET /security/audit/export`, gateado por `audit:read`) — `AuditService.findForExport` itera por cursor en
  lotes (tope `EXPORT_MAX_ROWS=100k`, header `X-Export-Truncated`), CSV RFC 4180 + BOM UTF-8 (helper
  `common/csv.ts`), `Content-Disposition` con nombre fechado. **Usuarios** y **Roles** exportan el listado
  cargado (CSV cliente, `lib/download.ts` + `lib/api-client.apiBlob`). i18n `common.export`. Smoke en vivo:
  CSV con cabeceras, JSON escapado y filtros respetados (`entityType=Role` → 3 filas). PDF y export del resto
  de módulos quedan para Fase 7.
- **Roles**: `RolesPage` (tabla + borrado gateado, system no borrable) + `RoleDrawer` + `PermissionMatrix`
  (agrupada por `group` del catálogo, checkbox de grupo con indeterminado, `requireMfa`).
- **Política**: `PolicyPage` (RHF+Zod): contraseñas (longitud/complejidad/historial/expiración), bloqueo por
  intentos y **`mfaMode` global** con descripción por modo.
- **Auditoría**: `AuditPage` (tabla solo-lectura, chip por verbo de acción, "cargar más" por cursor, modal de
  detalle con diff `before`/`after`/`metadata`).
- **i18n**: namespace `security` completo (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web 1882
  módulos)/`test` (**contracts 8** +3 audit · permissions 5 · **API 70** +3 del reset de contraseña por admin)
  en verde. **Smoke en vivo** (usuario demo con **26** permisos): `GET users/roles/permissions(26)/password-policy`
  → 200; **auditoría con la nueva forma de contrato** (`occurredAt` ISO string, `before/after/metadata`,
  `take`/cursor); **round-trip de rol** crear→leer→borrar 204→404; **reset de contraseña por admin** end-to-end
  (reset 201 · débil 400 · `forcePasswordChange=true` · vieja 401 · temporal autentica con cambio forzado ·
  `auth.password.admin_reset` auditado). *Nota:* el reset se probó contra una instancia **fresca** del API
  (la que corría en :3000 era un build previo sin la ruta nueva).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): navegar sub-tabs, alta/edición de usuario,
  asignar roles/scope, reset MFA, CRUD de roles + matriz, editar política, leer auditoría + diff, modo claro.

## Hecho en Fase 2.1 (Plantillas: modelo de definición + contratos + Form Builder)

Primer slice de la Fase 2. SOLO el lado **definición** (sin llenado/flujos/rondas). Arquitectura en
DECISIONS 2026-06-09; 4 forks resueltos con la opción recomendada. 3 commits (modelo+contratos+permisos /
backend / UI).

- **Prisma** (migración `20260609133247_add_template_definition`): `Template` (contenedor mutable) 1—N
  `TemplateVersion` (inmutable al publicar, patrón MMR Part 11) → `TemplateSection` (unidad atómica de
  permiso/llenado/firma) → `TemplateField`; joins `TemplateSectionRole` + `TemplateFieldRole` (override).
  Enums `TemplateStatus`/`TemplateVersionStatus`/`FieldType` (8 núcleo + SEVERITY/SIGNATURE)/`RecurrenceKind`.
  Referencias a flujo/firma/recurrencia como **columnas** (editores 2.2/2.3, sin re-migrar). Ejecución → 2.4.
- **Contratos** (`@lyra/contracts/templates`): unión de `config` por tipo (`fieldConfigSchemaFor`),
  **NÚMERO con bandas de umbral ISA-18.2** (`warn*`/`crit*`), `visibleWhen`, DTOs y requests
  (create/patch/**saveDraft** bulk/publish/list). **+7 specs** (config por tipo, min>max, claves duplicadas).
- **Permisos** (catálogo **26→33**): `module:templates:view/manage` + `template:view/create/edit/publish/delete`.
  Seed re-sincroniza y los asigna al rol admin (demo los tiene).
- **Backend** `TemplatesModule`: `GET/POST /templates`, `GET /templates/:id`, `PATCH :id`, `PUT :id/draft`
  (save bulk validado por contrato), `POST :id/publish` (congela + fija `currentVersionId`), `DELETE :id`
  (lógico). Gateado por permiso, **auditado**, **validación de config contra el tipo en backend**, alcance
  **ABAC** al listar (`ScopeService`). Inmutabilidad: editar publicada **clona** un borrador nuevo. **+7 tests**.
- **`@lyra/ui`**: primitivo **`Textarea`** (dual-theme sobre tokens). El resto de componentes se reusó.
- **Web** (`features/templates/`, anclado al prototipo): **TemplatesPage** (grilla de cards con nodo/estado/
  conteos/versión, buscador, filtro de estado, estados vacíos/carga/error, alta por modal, borrado) y
  **TemplateBuilder** (3 columnas: paleta de objetos / lienzo de secciones+campos con reordenar / panel de
  config; editores núcleo + umbrales + opciones + condicional + roles por sección + firma opt-in; **vista
  previa** que refleja `FieldRender`; **Guardar borrador** y **Publicar** con confirmación). Navegación
  (`/plantillas`, `/plantillas/:id`) + i18n namespace `templates` (es-CL).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web **1901
  módulos**)/`test` (**contracts 15** +7 · permissions 5 · **API 77** +7) en verde. **Smoke en vivo** (demo):
  crear→guardar borrador (1 sección, 2 campos)→**config inválida para el tipo ⇒ 400**→publicar (PUBLISHED +
  `currentVersionId` + v1)→listar (conteos + publishedV)→editar publicada ⇒ **clona borrador v2**→borrar 204→
  ausente del listado. DB de demo limpia tras el smoke.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/plantillas`, crear, builder (agregar
  sección/campos, umbrales, reordenar, roles por sección, condicional), vista previa, publicar, modo claro.

## Hecho en Fase 2.1.1 (Endurecimiento de modelo — ADITIVO, antes del llenado)

Refina el modelo de campo a **3 capas** y los datos de referencia, ANTES de 2.4 y sin datos de ejecución.
Todo aditivo/no destructivo. Ver DECISIONS 2026-06-09 (entrada "2.1.1 implementado"). Rama `feat/plantillas-2.1.1`.

- **Contratos** (`@lyra/contracts/templates`): enums `FieldDataType` (12 valores) y `FieldSemanticRole` (4, nullable);
  `deriveDataType(type)` (mapeo único `FieldType→FieldDataType`); **`optionSource`** discriminado
  (`inline`/`referenceList`/`external`) con `preprocess` que **sube el `options[]` legacy** a `inline`;
  `upgradeFieldConfig(type,config)` reutilizable; `templateFieldSchema` gana `dataType`+`semanticRole`,
  `draftFieldInputSchema` gana `semanticRole?`; validación **≤1 `EFFECTIVE_DATE` por versión**. **+8 specs**.
- **Prisma** (migración `20260609155007_add_field_layers`): enums + `TemplateField.dataType`/`semanticRole`,
  backfill de `dataType` desde `type`, `SET NOT NULL`. Aplicada con `migrate deploy` (esquiva el EPERM del DLL
  con el watch vivo); cliente regenerado (los `.d.ts`, suficiente para typecheck).
- **Backend** (`TemplatesService`): `saveDraft` **deriva `dataType`** y persiste `semanticRole`; `mapVersion`
  **normaliza el config al leer** (`upgradeFieldConfig`); `ensureDraft` clona ambos + normaliza. **+1 test**
  (deriva capas 2/3). El valor de referencia se documenta como **`code` estable, no label**.
- **Web** (Form Builder): editor de opciones inline ahora escribe `optionSource.inline.items` (`code`/`label`);
  **toggle "Fecha efectiva del registro"** en DATE/DATETIME (único por versión: marca una, desmarca las demás);
  `dataType` oculto/derivado; `FieldPreview`/`builder-model` migrados a `optionSource`. i18n es-CL nuevas claves.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores, 1 warning preexistente en OrgTree) · `build`
  (web **1901** módulos; API NO se buildea por el watch) · `test` (**contracts 23** +8 · permissions 5 · **API 78** +1)
  en verde. **Smoke en vivo** (demo): crear → guardar (DATE effectiveDate + SELECT optionSource inline + NÚMERO) →
  leer (`dataType` DATE/CODE/NUMBER derivado, `semanticRole=EFFECTIVE_DATE`, `optionSource` normalizado) → escribir
  shape legacy `options[]` ⇒ se sube a `inline` al leer → **2× EFFECTIVE_DATE ⇒ 400** → borrar 204. Datos de prueba
  limpiados.
- **Pendiente**: smoke **VISUAL** en navegador (toggle fecha efectiva, editor de opciones inline) — ver BACKLOG §4.

## Hecho en Fase 2.2 (Flujos reutilizables — `WorkflowDefinition`)

Máquina de estados configurable (estados + transiciones), NO BPMN, integrada al RBAC dim. 3. Solo lado
DEFINICIÓN (la ejecución sigue diferida a 2.4/2.5). Ver DECISIONS 2026-06-09 ("Fase 2.2 implementado"). Rama
`feat/workflows`, 5 commits (contratos+permisos / migración / backend+binding / web mantenedor / web form builder).

- **Contratos** (`@lyra/contracts/workflows`): `WorkflowDefinition` 1—N `WorkflowDefinitionVersion` (inmutable) →
  estados + transiciones (con `roleIds` por transición, firma+significado, MFA step-up). **`validateWorkflowMachine`**
  = fuente única de validación FSM (1 inicial, ≥1 final, claves únicas, refs válidas, alcanzabilidad, sin trampas),
  usada por contrato + backend + builder web. DTOs y requests create/update/saveDraft(bulk)/publish/list. **+13 specs**.
- **Permisos** (catálogo **33→37**): `module:workflows:view/manage` + `workflow:view/manage`. La autorización por
  transición es DATO (`WorkflowTransitionRole`), no clave. Seed los asigna al rol admin.
- **Prisma** (migración aditiva `20260609163822_add_workflow_definition`): modelos Workflow* + enums + **FK desde
  `TemplateVersion`** (reemplaza las columnas string de 2.1, `onDelete: Restrict`). 100% aditiva (CREATE + ADD
  CONSTRAINT sobre columnas en null). Aplicada con `migrate deploy` (esquiva el EPERM del DLL con el watch vivo).
- **Backend** `WorkflowsModule`: CRUD gateado/auditado con patrón clonar-borrador-al-editar e inmutabilidad al
  publicar (espejo de `TemplatesService`); valida la máquina en backend (al guardar y al publicar); `remove`
  bloquea flujos en uso. **`TemplatesService.saveDraft`** resuelve/valida el binding del flujo (existe, publicado,
  versión vigente) y que cada `editableInStateKey` de sección sea un estado de esa versión; preserva el binding al
  clonar. Contrato `saveTemplateDraft` gana `workflowDefinitionId/VersionId`. **+10 tests** (WorkflowsService).
- **Web** `features/workflows`: **WorkflowsPage** (grilla de cards estilo Plantillas) + **WorkflowBuilder** (editor
  declarativo de estados [inicial único/final/color] y transiciones [from→to, firma, MFA, roles permitidos] con
  **validación FSM en vivo**; publicar deshabilitado si es inválida; borrador/publicar). Navegación `/flujos` gateada
  por `module:workflows:view`, i18n namespace `workflows`. **Form Builder** ampliado: selector de flujo publicado +
  mapeo sección→estado (`editableInStateKey`) + **editor de override de rol por campo** (`TemplateFieldRole`).
- **Degradación elegante:** una plantilla sin flujo (`workflowDefinitionId = null`) se comporta como form simple
  (ninguna sección declara estado; todas siempre editables).
- **Verificación**: `typecheck`/`lint` (0 errores; 1 warning preexistente en OrgTree)/`build` (web **1911** módulos;
  API NO se buildea por el watch)/`test` (**contracts 36** +13 · permissions 5 · **API 88** +10) en verde. **Smoke en
  vivo** (demo): flujo crear→borrador→máquina inválida 400→publicar (congela)→listar→borrar 204; binding
  plantilla↔flujo (estado válido persiste; estado inexistente / versión no vigente / flujo EN USO → 400). Datos de
  prueba limpiados (hard-delete).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/flujos` (grilla, crear, builder con estados/
  transiciones/roles/firma/MFA, validación en vivo, publicar), y en el Form Builder asignar flujo + mapear
  secciones→estados + override de rol por campo; modo claro.

## Hecho en Fase 2.x (Datos de referencia / Listas — `ReferenceList`/`ReferenceItem`)

Hace REAL el `optionSource.referenceList` de 2.1.1. Catálogo **gobernado** (NO versionado-inmutable como
Plantillas/Flujos): valor = **code estable, no label** (patrón dimensión DW / FHIR Coding). Ver DECISIONS
2026-06-09 ("Fase 2.x implementado"). Rama `feat/datos-referencia`, 5 commits.

- **Contratos** (`@lyra/contracts/reference-data`): `ReferenceList`/`ReferenceListDetail`/`ReferenceItem` +
  `ReferenceSource` (MANUAL|EXTERNAL) + `key` slug estable + `metadata` jsonb freeform + DTOs/requests CRUD +
  **`ResolvedOption`** (code/label/metadata) para el preview/llenado. **+5 specs**.
- **Permisos** (catálogo **37→41**): `module:referencedata:view/manage` + `referencelist:view/manage`. El seed los
  asigna al rol admin (itera el catálogo, sin código nuevo).
- **Prisma** (migración aditiva `20260609205303_add_reference_data`): `ReferenceList` (key único + active + sortOrder
  + `deletedAt` lógico) 1—N `ReferenceItem` (`@@unique([listId, code])` + metadata jsonb, FK `onDelete: Cascade`).
  Aplicada con `migrate deploy` (esquiva el EPERM del DLL con el watch).
- **Backend** `ReferenceListsModule` (`/reference-lists`): CRUD de listas e ítems gateado/auditado (molde
  `EquipmentService`, NO Template); `GET :idOrKey/resolve` (ítems activos ordenados); **guard "en uso"** al borrar
  lista (consulta JSONB de `TemplateField.config`); P2002 → 400 (key/code duplicado). `TemplatesService.saveDraft`
  **valida el binding** (cada `optionSource.referenceList.listKey` apunta a una lista viva), espejo del binding de
  flujo. **+8 tests** (`ReferenceListsService`).
- **Web** `features/reference-data`: capa de datos TanStack Query + **mantenedor master-detail** (`ResizableSplit`):
  lista de Listas + panel de detalle con grilla de ítems (activar/desactivar, **orden inline**, editar, eliminar);
  **drawers** de lista e ítem (con **editor de metadata key-value** que infiere número/booleano/texto). Navegación
  `/datos-referencia` gateada por `module:referencedata:view`, i18n namespace `referenceData`. **Form Builder**
  ampliado: SELECT/MULTISELECT con selector de **fuente** (inline ↔ Lista de Referencia); la **vista previa resuelve**
  opciones desde la lista (muestra label, guarda code). **Degradación elegante:** un SELECT inline sigue idéntico.
- **Seed demo** (dev): `failure-modes` (8 modos ISO 14224 con metadata `isoCategory`) + `shifts` (3 turnos),
  idempotente. Fuente única `prisma/reference-data-seed.ts`.
- **Verificación**: typecheck (6 paquetes)/lint (0 errores; 1 warning preexistente en OrgTree)/build web (**1921**
  módulos; API NO se buildea por el watch)/test (**contracts 44** +5 · permissions 5 · **API 97** +8) en verde.
  **Smoke en vivo** (demo): CRUD lista/ítem; key duplicada 400; code duplicado por lista 400; resolve excluye
  inactivos y conserva metadata; binding en `saveDraft` (listKey inexistente 400 / válido 200); lista EN USO no se
  borra 400; seed resuelve (failure-modes 8 ítems + metadata, shifts 3). Datos ad-hoc limpiados; listas del seed
  quedan como demo dev-only.
- **Endurecimiento UX (mismo día, pedido del usuario):** grilla de ítems **enterprise** (buscador code/label/
  metadata + filtro de estado + columnas ordenables + paginación + conteo + metadata en chips; orden inline remonta
  con el valor del servidor). Nuevo primitivo **`@lyra/ui` `Combobox`** (single-select buscable con portal + teclado
  + clearable + reposición en scroll). El selector de Lista del Form Builder y la vista previa (SELECT→`Combobox`,
  MULTISELECT→`MultiSelect`) pasan a objetos premium que **escalan a listas largas**. Ver DECISIONS 2026-06-09
  ("endurecimiento UX"). Verificado: typecheck/lint (0 errores)/build web (**1923** módulos)/test (contracts 44 ·
  permissions 5 · API 97) + resolve en vivo OK.
- **Fix + LookupPicker (mismo día, hallazgo del smoke visual del usuario):** los paneles de `Combobox`/`MultiSelect`
  se **cortaban** al borde del viewport (siempre abrían hacia abajo) → `panelPlacement` compartido con **flip-up**
  + clamp de altura. Nuevo primitivo **`@lyra/ui` `LookupPicker`** (patrón **SAP Value Help / Salesforce Lookup**):
  diálogo con búsqueda + **tabla paginada/sortable** (código/etiqueta/detalle) + selección borrador con checkbox
  aplicada al confirmar + **tokens removibles con ×** bajo el campo. La vista previa de un MULTISELECT ligado a una
  Lista usa `LookupPicker` (metadata como columna detalle); inline corto mantiene `MultiSelect`. Además, **análisis
  crítico industrial** del módulo (ISO 14224 / RDM / FHIR ConceptMap): base correcta, gaps aditivos registrados como
  **roadmap priorizado** en BACKLOG §2 (CSV import/export = primer quick-win; jerarquía; metadata tipada; cascada y
  resolve paginado con 2.4; crosswalks con Fase 3). Ver DECISIONS 2026-06-09 (2 entradas nuevas).
- **Import/Export CSV de ítems (sesión 2026-06-09, quick-win 1 del roadmap industrial):** export server-side
  (BOM UTF-8, **`;` para Excel es-CL**, metadata **aplanada** `metadata.<clave>`, nombre fechado) + import en
  **2 fases dry-run→commit** (patrón SAP LSMW / Salesforce Data Loader): upsert por `code`, validación por fila con
  nº de línea (longitudes, duplicados, active/sortOrder, metadata con inferencia de tipos), `deactivateMissing`
  opt-in (desactiva ausentes, nunca borra), tope `REFERENCE_IMPORT_MAX_ROWS` (env, 5000), commit **transaccional
  re-validado** (con errores no aplica) y **auditado** con el resumen. Parser RFC 4180 propio (`csv-parse.ts`) con
  auto-detección de delimitador; `toCsv` ganó parámetro de delimitador (Auditoría intacta). Web: botones
  Exportar/Importar + modal con preview del diff (chips de summary + tabla paginada). Tests: **contracts 46** ·
  **API 110** (+13). Smoke en vivo completo (export con metadata; dry-run con error → BD intacta; commit;
  re-import → unchanged; deactivateMissing). Ver DECISIONS 2026-06-09.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4): `/datos-referencia` (crear lista, ítems con
  metadata, **buscar/ordenar/paginar** la grilla, filtro de estado, activar/desactivar, orden inline, eliminar) y en
  el Form Builder elegir una Lista en un SELECT (selector buscable) y ver la **vista previa resolver** (SELECT
  `Combobox` con flip-up cerca del borde; MULTISELECT con **`LookupPicker`**: diálogo, tabla, confirmación, tokens
  con ×); **CSV**: Exportar (abre en Excel es-CL en columnas), Importar (elegir archivo → analizar → reporte →
  aplicar); modo claro.

## Hecho en Fase 2.3.0 (Calendario operacional — turnos + periodo contable)

Configuración de primera clase, **pura config sin ejecución**, aditiva. Turno/día operacional/periodo son
**dimensiones DERIVADAS** del timestamp (patrón Shift Calendar de MES / SAP / ISA-95 / dimensión Fecha+Turno de
DW). Ver DECISIONS 2026-06-09 ("Fase 2.3.0 — IMPLEMENTADO"). Rama `feat/calendario-operacional`, 5 commits.

- **Contratos** (`@lyra/contracts/operational-calendar`): `OperationalCalendar` 1—N `OperationalShift` +
  `PeriodKind` (MONTH/WEEK/CUSTOM) + DTOs create/update/asignación/preview. **`validateOperationalCalendar`** =
  fuente única (contrato `superRefine` + backend + builder web en vivo): TZ IANA, turnos **sin solapes** (huecos
  permitidos), turno ancla del día, config de periodo. **`resolveShift`** = **función PURA** (solo `Intl`)
  `timestamp → (operationalDate, shiftCode, periodKey)`: día operacional ≠ día civil, cruce de medianoche por
  duración, periodo derivado. **30 specs** (DST Santiago invierno/verano, borde de mes con día-ancla, ciclo
  CUSTOM, WEEK configurable, huecos).
- **Permisos** (catálogo **41→45**): `module:opscalendar:view/manage` + `opscalendar:view/manage`. El seed los
  asigna al rol admin iterando el catálogo.
- **Prisma** (migración aditiva `20260609233155_add_operational_calendar`): enum `PeriodKind` + modelos +
  `OrgNode.operationalCalendarId` (FK `onDelete: SetNull`). Aplicada con `migrate deploy` (esquiva el EPERM del DLL).
- **Backend** `OperationalCalendarModule`: CRUD gateado/auditado (molde `ReferenceLists`); guardado reemplaza
  turnos en bloque; `isDefault` único en tx; **no se borra el default**; `assignNodes` (reemplaza set, valida
  existencia, limpia al borrar); `preview(id, at)`. **`ShiftResolver`** (clase abstracta = token DI, patrón
  `EmailService`) + `ShiftResolverService`: elige el calendario por nodo (path-walk → ancestro → default) y delega
  en `resolveShift`. **Exportado** para que 2.4 (estampa `LogEntry`), 2.3 Rondas y Fase 5 lo inyecten. **9 tests**.
- **Web** `features/operational-calendar`: `/calendario-operacional` master-detail (estilo Listas/Flujos);
  `CalendarDrawer` (alta key/nombre/TZ); `CalendarDetailPanel` (editor de turnos en filas + **timeline 24 h** con
  marcador del ancla + **banner de validación en vivo** + selector de turno ancla + definición de periodo
  MONTH/WEEK/CUSTOM + **PROBADOR** que resuelve fecha-hora→turno/día operacional/periodo en vivo con la función
  pura + asignación de nodos por modal sobre el árbol de Estructura). Navegación + Home + i18n namespace
  `opsCalendar` (es-CL), dual theme, tokens, 44px.
- **Seed demo** (dev): `mina-rajo` (America/Santiago, 3 turnos A/B/C de 8 h, día op. 07:00, periodo mensual día 1,
  default). Idempotente por `key`.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente en OrgTree) · `build` web
  (1,482 KB JS; API NO se buildea por el watch) · `test` (**contracts 76** +30 · permissions 5 · **API 119** +9) en
  verde. **Smoke en vivo** (demo, 45 permisos tras invalidar la caché Redis): listar (seed `mina-rajo`); **preview
  02:00 Santiago invierno (UTC-4) ⇒ día op. 2026-06-14 + turno C + periodo 2026-06** (DST + medianoche + mes
  correctos); 09:00 ⇒ turno A mismo día; **crear con solape ⇒ 400**; **borrar default ⇒ 400**; ciclo
  crear/preview-hueco(shiftCode null + CUSTOM key)/setDefault+restaurar/assign-nodos/borrar(204). Datos de prueba
  hard-deleted; `mina-rajo` queda como demo dev-only.
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4).

## Hecho en Fase 2.4 (Llenado / Nueva entrada multi-actor)

Primer slice de EJECUCIÓN. Tablas `LogEntry*` aditivas + backend `/log-entries` + pantalla de llenado. Paradigma
EBR/GxP. Ver DECISIONS 2026-06-10 (4 forks resueltos). Rama `feat/llenado`, 4 commits.

- **Contratos** (`@lyra/contracts/log-entries`): `LogEntry`/`LogEntrySection`/`LogEntryValue` (forma de respuesta +
  DTOs create/saveSection/submit/list) y la **lógica compartida = fuente única backend+frontend**:
  `validateFieldValue` (tipo/rango/**umbral ISA-18.2**/regex/catálogo de codes), `isFieldVisible` (`visibleWhen`),
  `resolveEffectiveAt` (campo `EFFECTIVE_DATE` → `effectiveAt`, fallback `recordedAt`), `isSectionEditableInState`,
  `isEmptyValue`. **+17 specs**.
- **Permisos** (catálogo **45→49**): `module:logbook:view` + `logentry:view/create/fill`. QUIÉN llena cada sección
  sigue siendo DATO (`TemplateSectionRole`), no clave. El seed los asigna al rol admin iterando el catálogo.
- **Prisma** (migración aditiva `20260610011231_add_log_entry`, 100% CREATE): `LogEntry` (cabecera con campos de
  sistema intrínsecos + `workflowDefinitionVersionId` DENORMALIZADO + `effectiveAt`/`shiftCode`/`operationalDate`/
  `periodKey`/`sealedAt`), `LogEntrySection` (estado + `version` para concurrencia), `LogEntryValue` (1 fila/campo,
  `value` jsonb + `dataType`), `LogEntryFieldChange` (historial append-only). `LogEntryTransition` modelado, su tabla
  en 2.5. Aplicada con `migrate deploy` (EPERM del DLL con el watch). Relaciones inversas en Template/TemplateVersion/
  OrgNode/Equipment (`onDelete Restrict`/`SetNull`).
- **Backend** `LogEntriesModule` (`/log-entries`, gateado por `logentry:view/create/fill`): `create` (copia la versión
  publicada, instancia secciones, denormaliza flujo+estado inicial, sella `recordedAt`, estampa dimensiones vía
  `ShiftResolver`); `getDetail` (definición congelada + estado por sección + valores + `editable` resuelto por usuario);
  `saveSection` (**concurrencia optimista por sección** 409, **validación 100% en servidor** + catálogo de codes
  resuelto contra Listas vivas + `visibleWhen`, **override de rol por campo**, **auditoría por campo**, recálculo de
  `effectiveAt`+dims); `submit` (valida obligatorios y **SELLA** `effectiveAt`+dims → `sealedAt`, `SUBMITTED`); `list`
  con ABAC. Inyecta `ShiftResolver`. **+10 tests** (API 119→129).
- **Web** `features/log-entries`: **`FieldControl`** (control de campo COMPARTIDO interactivo + solo-lectura, extraído
  de `FieldPreview`; Form Builder y llenado lo reusan → nunca divergen; resuelve opciones de Listas mostrando label/
  guardando code); **`NewEntryPage`** (`/nueva-entrada`, grilla de plantillas publicadas a rol/alcance → crea entrada);
  **`EntryFillPage`** (`/nueva-entrada/:id`, cabecera con estado + dimensiones estampadas; secciones como cards con
  gating de editabilidad; validación inmediata por campo reusando `validateFieldValue`; guardar/completar por sección
  con manejo de 409; enviar = sella; banner al registrar). Capa de datos TanStack Query; navegación (módulo `logbook`),
  i18n namespace `logbook` es-CL + `common.yes/no`, dual theme, tokens, 44px.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build` web
  (**1943** módulos; API NO se buildea por el watch) · `test` (**contracts 97** +17 · permissions 5 · **API 129** +10)
  en verde. **Smoke en vivo** (demo, 49 permisos tras seed + invalidar Redis): login → crear plantilla (fecha efectiva
  + número con rango/umbral + select inline + obs) → publicar → crear entrada (DRAFT, dimensiones estampadas) →
  **valor fuera de rango 400** → guardar sección válida (**effectiveAt recalcula día op./turno/periodo**; fecha efectiva
  2026-03-15 → día operacional 2026-03-14 noche, cruce de medianoche correcto) → **concurrencia 409** → **select fuera
  de catálogo 400** → enviar/sellar (`sealedAt`) → **inmutable tras enviar 400** → listado lo incluye. **15/15 checks.**
  Datos de prueba hard-deleted (0 entradas restantes).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4).

## Hecho en Fase 2.5 (Ejecución de flujo + firmas electrónicas Part 11)

Cierra el bucle de ejecución abierto en 2.4. Motor de transiciones + firmas estilo **21 CFR Part 11**
(§11.50/11.70/11.200, ALCOA+, NIST 800-63B step-up). Ver DECISIONS 2026-06-10 (5 forks resueltos). Rama
`feat/ejecucion-flujo`, 4 commits (contratos+permiso / migración / backend / web).

- **Contratos** (`@lyra/contracts/log-entries`): enums `SignatureContext`/`SignatureMethod`; DTOs `LogEntrySignature`
  (§11.50: nombre impreso + significado + `payloadHash` + UTC), `LogEntryTransition` (historial), `AvailableTransition`;
  `LogEntryDetail` gana `workflowVersion` congelada + `currentStateName` + `availableTransitions` + `transitions` +
  `signatures`; `SectionStateDto` gana resumen de firma. `executeTransitionRequest` (re-auth opcional) + `saveSection`
  gana `password`. **Fuente única**: `availableTransitionsFor` (gateo estado×rol-dato) y `canonicalSignaturePayload`
  (serialización determinista para el hash, §11.70). **+7 specs**.
- **Permisos** (catálogo **49→50**): `logentry:transition` (gate base del endpoint; el QUIÉN de cada transición sigue
  siendo dato `WorkflowTransitionRole`). El seed lo asigna al rol admin iterando el catálogo.
- **Prisma** (migración aditiva `20260610035255_add_log_entry_execution`, 100% CREATE): `LogEntryTransition` (append-only:
  from/to/transitionKey de la versión congelada + actor + motivo + firma + `occurredAt`); `LogEntrySignature` (Part 11,
  **polimórfica** por `context`, **check XOR** transitionKey↔sectionKey, patrón Scope/ExternalReference); enums. `LogEntry`
  gana relaciones `transitions[]`/`signatures[]`. Aplicada con `migrate deploy` (EPERM del DLL con el watch).
- **Backend**: **`ReauthService`** (módulo auth, **reutilizable** por Fase 4/notificaciones): re-auth contraseña
  (Argon2id) + MFA step-up condicional; método `PASSWORD`|`PASSWORD_MFA`; firmante = sujeto del JWT (sin impersonación).
  **`LogEntriesService.executeTransition`** (`POST /log-entries/:id/transitions`): valida (a) sale del estado actual, (b)
  rol-dato, (c) ABAC, (d) completitud de secciones del estado de origen; aplica cambio de estado, **recomputa secciones**
  (`LOCKED`/reapertura), **sella** dimensiones en la 1ª salida del estado inicial, reconcilia `status` (terminal ⇒
  SUBMITTED), **firma** (TRANSITION) con hash del snapshot canónico en la misma tx, audita y emite el gancho
  `onTransitionExecuted` (no-op; punto de enganche del evento). Firma de **completitud de sección** en `saveSection`
  (flag `TemplateSection.requireSignature`). `submit` ahora finaliza SOLO forms sin flujo. `saveSection` respeta
  `sealedAt`. Helpers DRY compartidos (`collectCompletionErrors`/`computeSeal`/`createSignature`). **+15 tests**.
- **Web** `features/log-entries`: **`TransitionModal`** (confirma transición; si exige firma muestra significado +
  firmante y pide re-auth contraseña + MFA step-up condicional; botones **gateados por `availableTransitions` del
  backend**), **`SectionSignModal`** (firma de completitud de sección), `EntryFillPage` ampliada (chip de estado del
  flujo, indicador de sección firmada, barra de transiciones que reemplaza submit cuando hay flujo, **historial de
  transiciones** timeline ALCOA+). api/queries `executeTransition`. i18n es-CL (`logbook.transition.*` + `fill.signed*`),
  tokens `@lyra/ui`, dual theme, 44px.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build` web (1532 KB
  JS; API NO se buildea por el watch) · `test` (**contracts 104** +7 · permissions 5 · **API 144** +15) en verde.
  **Smoke en vivo** (demo, 50 permisos tras seed + invalidar Redis): workflow open→review→closed publicado + plantilla con
  flujo + 2 secciones por estado → crear entrada (estado inicial) → completar s_open → **submit con flujo 400** →
  **approve desde open 409** → **send** (sin firma) → review + **sellado** + s_open **LOCKED** + status DRAFT → completar
  s_review (**sello NO se recalcula**) → **approve sin/con contraseña errónea 401** → **approve firmado** → closed +
  SUBMITTED + **firma Part 11 registrada** (hash, método) → **transición tras finalizar 400**. **21/21 checks.** Datos de
  prueba hard-deleted (0 restantes). **`/security-review` sobre el diff: sin hallazgos.**
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4).

## Hecho en Fase 2.6.0 (Módulo de Bitácoras — núcleo de lectura)

Vista de consulta/auditoría de clase mundial sobre todo lo que produce la ejecución (2.4/2.5). El módulo 2.6 se
**diseñó completo** y se construye por sub-slices publicables (**2.6.0 ✅** · 2.6.1 personalización · 2.6.2
analítica/UX avanzada — ver DECISIONS 2026-06-10, 9 forks + 3 adiciones de modelo confirmados). Patrones: review by
exception (ISPE GAMP 5/EBR), §11.50/§11.70 Part 11, ALCOA+, saved-search/deep-link (Splunk/Kibana), grid state
serializable (AG Grid). Rama `feat/bitacoras-auditor`, 4 commits por capa.

- **Prisma** (migración aditiva `20260610051359_add_logbook_review_columns`): **`LogEntry.entryNumber`** (folio
  humano correlativo, backfill ORDENADO por `recordedAt` + secuencia propia), **`LogEntrySection.requiresSignature`**
  (estampado de la definición congelada + backfill — "firmas pendientes" en SQL puro),
  **`LogEntryValue.thresholdBand`** (enum WARN|CRIT, estampada al guardar; backfill `db:backfill-threshold-bands`
  que reusa la fuente única de contracts), índices `LogEntry(createdById)`/`LogEntry(currentStateKey)`/
  `LogEntryValue(thresholdBand)` (deuda de índices detectada y cerrada).
- **Contratos** (`@lyra/contracts/log-entries`): `logEntryListQuerySchema` v2 (búsqueda por folio/plantilla/nodo,
  nodo±descendientes, equipo, status, stateKey, turno/periodo/día operacional, rangos effectiveAt/recordedAt,
  autoría, firmas pendientes, banda de umbral, orden por whitelist NOT NULL + cursor keyset + take≤100);
  `LogEntryListItem` enriquecido (folio, versión, nodo, estado congelado con color, autoría, equipo + indicadores);
  `LogEntryStats`; timeline = unión discriminada CREATED/FIELD_CHANGE/TRANSITION/SECTION_SIGNED/SEALED; log de
  cambios paginado; relacionadas; veredicto de verificación `VALID`/`VALID_RECORD_CHANGED_AFTER`/`INVALID`.
  **Fuentes únicas nuevas**: `thresholdBandFor` (banda ISA-18.2) y `canonicalSignatureValues` (canonicalización v2:
  el payload firmado DESCARTA valores vacíos — elimina falsos INVALID; firmas pre-2.6 con nulls quedan no
  verificables, aceptado por no haber instalación productiva). `formatEntryFolio`. **+9 specs**.
- **Backend** (**CQRS-lite**: lado de lectura en **`LogbookQueryService`**, separado del de escritura):
  `GET /log-entries` (TODOS los filtros en SQL + ABAC siempre + keyset validado contra el orden + enriquecimiento por
  página 100% batched, cero N+1, payload sin valores), `GET /log-entries/stats` (KPIs, mismo `where`),
  `GET /log-entries/export` (CSV server-side del set completo, patrón auditoría: lotes keyset/tope 100k/
  `X-Export-Truncated`/BOM/`;` es-CL), `GET :id/timeline` (k-way merge multi-tabla con cursor `(at,id)` + eventos
  sintéticos), `GET :id/changes` (paginado con labels congelados), `GET :id/related` (mismo nodo+periodo / mismo
  turno), `POST :id/signatures/:sigId/verify` (recomputa hash canónico; REBOBINA `LogEntryFieldChange` a `signedAt`;
  auditado como acto de revisión). Escritura: `create` estampa `requiresSignature`; `saveSection` estampa
  `thresholdBand` y fija `changedAt = signedAt` (mismo reloj, clave para el rebobinado). `getDetail` gana
  `createdByName`/`equipmentName`; `mapEntry` expone el folio. **+12 tests**.
- **Web** (`features/logbook`): **`/bitacoras`** — barra KPI clicable (total/en curso/registradas/firmas
  pendientes/excepciones), filtros completos con chips ACTIVOS removibles + limpiar, atajos hoy/24h/7d/30d, grilla
  con folio + chip del estado con el COLOR congelado + indicadores review-by-exception por fila, orden servidor,
  "cargar más" por cursor, export CSV y **estado deep-linkeable en la URL** (fuente de verdad). **`/bitacoras/:id`**
  (record viewer read-only estilo EBR): cabecera de identidad con folio + **mini-stepper de la máquina de estados**,
  chips de dimensiones selladas, secciones con `FieldControl` readOnly + badges ISA-18.2, **panel de firmas §11.50
  con verificación de integridad on-demand** (veredicto explicado), **línea de tiempo unificada** paginada, **log de
  cambios** antes→después con motivo (estilo prototipo), relacionadas navegables y **vista de impresión** (`@media
  print` oculta el chrome del shell). `@lyra/ui Chip` gana `onRemove`. Ítem "Bitácoras" en sidebar/⌘K. i18n es-CL.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build` web
  (1618 KB JS; API NO se buildea por el watch) · `test` (**contracts 113** +9 · permissions 5 · **API 156** +12) en
  verde. **Smoke en vivo** (demo): plantilla con umbrales y sección con firma → entrada A CRIT firmada (folio
  asignado) + entrada B WARN con firma pendiente → filtros banda CRIT/WARN/ANY, firmas pendientes, búsqueda por folio
  `BIT-000016`, rama con/sin descendientes, paginación keyset, cursor de otro orden 400 → stats exactos → detalle
  enriquecido → timeline (CREATED+cambios+SECTION_SIGNED) → log de cambios → relacionadas → **verificación de firma
  VALID → editar valor → VALID_RECORD_CHANGED_AFTER (1 cambio)** → export CSV (BOM+`;`+cabeceras, no truncado).
  **22/22 checks.** Datos de prueba eliminados (15 entradas originales intactas).
- **Pendiente**: smoke **VISUAL** en navegador (ver BACKLOG §4). Sub-slices 2.6.1/2.6.2 diseñados en DECISIONS/BACKLOG.

## Hecho en Afinamiento #4 (2026-06-11 — rediseño del guardado por sección + garantía en servidor)

Sesión de **triage + investigación + diseño** de las 10 mejoras post-2.6.0 (registradas en BACKLOG §2; plan de fases
PROPUESTO en DECISIONS 2026-06-11) con UN entregable codificado: el **fix #4**. Rama `feat/afinamiento-llenado`.

- **Auditoría primero** (hallazgo documentado en DECISIONS): el backend YA gateaba la edición por sección (sin agujero
  de autorización); lo observado venía de (a) datos demo sin roles por sección y un solo rol en el sistema, (b) DTO
  sin el PORQUÉ del bloqueo + nombres de acciones ambiguos, y (c) un **gap real en `submit` sin flujo**: validaba solo
  las secciones del que envía y no exigía estado COMPLETED ⇒ podía **sellar** con secciones de otros roles incompletas
  y **eludir la firma de completitud de sección** (Part 11).
- **Contratos** (`@lyra/contracts/log-entries`): `LogEntrySectionStateDto` gana **`blockedReason`**
  (`ENTRY_CLOSED`|`WRONG_STATE`|`MISSING_ROLE`, enum extensible para 2.7), **`assignedRoleNames`** y
  **`readOnlyFieldKeys`** (override por campo). **+2 specs** (contracts **115**).
- **Backend** (`LogEntriesService`): `getDetail` computa motivo de bloqueo + nombres de roles (batched) + campos
  restringidos; `saveSection` responde 403 con el motivo REAL y el **override por campo ahora solo bloquea el CAMBIO**
  (un eco sin cambio ya no impedía guardar el resto de la sección — defecto preexistente detectado y corregido);
  **`submit` pasa a validación OBJETIVA** (todas las secciones con campos en COMPLETED + obligatorios de todas, espejo
  del guard (d) de `executeTransition`). **+5 tests** (API **161**).
- **Web** (`EntryFillPage`): chip de **progreso** "N de M secciones completadas" en cabecera; chip **"Asignada a:
  rol"** por sección; nota de bloqueo con el **motivo específico** (etapa del flujo con su nombre / rol faltante /
  registro enviado); campos reservados a otro rol en solo-lectura con nota (y EXCLUIDOS del payload de guardado);
  acciones renombradas a lo que hacen: **"Guardar avance"** y **"Completar sección"/"Completar y firmar"** con hint;
  **"Enviar y registrar"** y las transiciones se deshabilitan listando QUÉ secciones faltan (el backend re-valida).
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build` web ·
  `test` (**contracts 115** +2 · permissions 5 · **API 161** +5) en verde. **Smoke en vivo 22/22** (rol de prueba +
  plantilla con sección asignada y override por campo: MISSING_ROLE + assignedRoleNames + readOnlyFieldKeys expuestos;
  403 al guardar sin rol; 403 al CAMBIAR campo reservado y OK el eco; **submit con sección ajena incompleta 400**;
  con todo COMPLETED 200 SUBMITTED; ENTRY_CLOSED tras enviar). Datos de prueba eliminados (BD limpia verificada).
- **NO probado**: smoke VISUAL en navegador de la nueva UI (ver BACKLOG §4).

## Hecho en Fase 2.7.0 (2026-06-11 — Registro diferido / late entry GxP)

**Plan de fases 2.7→2.8→2.9 APROBADO TAL CUAL** por el dueño del producto al abrir la sesión; los **3 forks de 2.7.0
se resolvieron con la recomendación** (híbrido campo/entrada · motivo OBLIGATORIO · DECLARADO, no inferido — ver
DECISIONS 2026-06-11). Rama `feat/registro-diferido`. La mecánica temporal existente NO se tocó: se construyó la
marca y la UX encima de `recordedAt`/`effectiveAt`/`resolveEffectiveAt`/`ShiftResolver`.

- **Prisma** (migración aditiva `20260611183427_add_log_entry_origin`): enum `LogEntryOrigin` (ONLINE|DEFERRED) +
  `LogEntry.entryOrigin` (default ONLINE, indexado), `declaredEffectiveAt?`, `deferredReason?`,
  `deferredDeclaredById?/At?`.
- **Contratos**: `logEntryOriginSchema` + `deferralInputSchema` (fecha ISO con offset + motivo ≥5) + `deferred?` en
  create + `setDeferralRequestSchema` (declara/corrige/quita con null) + filtro `entryOrigin` en la list query +
  evento **`DEFERRED_DECLARED`** en la timeline + **`resolveEffectiveAt` gana el fallback intermedio**
  `campo → declarada → recordedAt` (4.º parámetro opcional, compatible). **+5 specs** (contracts **120**).
- **Backend** (`LogEntriesService`): `create` acepta `deferred` (estampa marca + dims desde la fecha declarada);
  **`setDeferral`** (`PUT /log-entries/:id/deferral`, `logentry:fill` + ABAC, SOLO DRAFT sin sellar) declara/corrige/
  quita recalculando `effectiveAt`+dims y auditando `logentry.deferral.declared|cleared`. **Híbrido fork 1**: si la
  versión tiene campo `EFFECTIVE_DATE`, el gesto LO ESCRIBE con las mismas guardas que `saveSection` (sin bypass de
  rol/estado), `FieldChange` con el motivo, bump de versión de sección, y preservando la **fecha civil** para campos
  DATE (del string ISO con offset). `LogbookQueryService`: filtro `entryOrigin` en el `where`, columnas CSV
  (Origen/Fecha evento declarada/Motivo diferido) y evento `DEFERRED_DECLARED` en la timeline (declaración vigente;
  correcciones en AuditLog+FieldChange). **Sin permisos nuevos** (catálogo sigue en 50). **+8 tests** (API **169**).
- **Web**: `/nueva-entrada` gana el **toggle "Registrar con otra fecha/hora"** (apagado por defecto: cero fricción;
  fecha/hora + motivo inline); el llenado muestra chip **"Diferida"** + fecha de captura junto a la efectiva + nota
  con la declaración y **`DeferralModal`** para declarar/corregir/quitar en borrador; `/bitacoras` gana **filtro
  "Origen"** (+ chip removible + deep-link) e indicador "Diferida" por fila (tooltip = motivo); el visor muestra chip +
  nota "evento ocurrió el X · declarado por Y — motivo" + evento en la timeline. Helpers `datetime-local.ts`
  (ISO con offset local ↔ `datetime-local`). i18n `logbook.deferral.*`/`origin.*` (es-CL).
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build`
  contracts+web (API no se buildea por el watch; typecheck+test sí) · `test` (**contracts 120** +5 · permissions 5 ·
  **API 169** +8) en verde. **Smoke en vivo 14/14**: default ONLINE · crear diferida (effectiveAt=declarada, dims) ·
  motivo corto 400 · filtro DEFERRED/ONLINE · corrección por PUT · timeline con evento+actor+motivo · quitar marca
  (vuelve a recordedAt) · submit sella la declarada y deferral post-sellado 400 · export CSV con columnas · campo
  EFFECTIVE_DATE escrito con fecha civil correcta (offset -04:00) + FieldChange con motivo · el campo MANDA al
  editarse. Datos de prueba LIMPIADOS (conteos verificados en BD).
- **NO probado**: smoke VISUAL en navegador del gesto/chips/filtro (ver BACKLOG §4).

## Hecho en Fase 2.7.1 (2026-06-11 — Período contable gobernado, #5)

**4 forks resueltos con la recomendación** (LAZY "ausencia=abierto" · sección dentro de `/calendario-operacional` ·
hard lock diferido · guarda en TODAS las mutaciones incl. transiciones, lecturas/verificación nunca — ver DECISIONS
2026-06-11). Rama `feat/periodo-gobernado`. La mecánica de dimensiones no se tocó: la guarda se monta sobre
`effectiveAt`/`periodKey`/`ShiftResolver`.

- **Prisma** (migración aditiva `20260611200225_add_operational_period`): modelo **`OperationalPeriod`**
  (`calendarId` FK `onDelete: Cascade` × `periodKey`, **`@@unique`** + índice `(calendarId,status)`) + enum
  **`PeriodStatus`** OPEN|CLOSING|CLOSED + cierre (`closedById/At/Reason`) y reapertura (`reopenedById/At/Reason`).
  **Modelo LAZY**: solo hay fila cuando el período NO está abierto. No toca `LogEntry`.
- **Contratos**: `@lyra/contracts/operational-periods` (DTO + `closePeriodRequest`/`reopenPeriodRequest`, motivo ≥5) +
  **`PERIOD_CLOSED`** sumado a `SECTION_BLOCKED_REASONS` + helper puro **`enumeratePeriodKeys`** en el contrato de
  calendario (enumera llaves de período del rango, para listar sin pre-generar). **+5 specs** (contracts **125**).
- **Backend**: `ShiftResolver` gana **`resolveWithCalendar`** (calendarId + resolución). **`OperationalPeriodService`**
  = guarda única `assertWritable(at, orgNodeId, perms)` (resuelve calendario×periodKey, 403 `PERIOD_CLOSED` salvo
  bypass) + `list` (derivados ∪ explícitos) + `close`/`reopen` auditados (`opsperiod.closed|reopened`). Inyectada en
  `create`/`saveSection`/`setDeferral`/`submit`/`executeTransition` sobre la `effectiveAt` que el write persistiría,
  **antes** de completitud/validación y re-auth (gate duro; en transición evita el círculo vicioso y no consume
  recovery codes). `getDetail`: si el actor sin excepción tiene una entrada en período cerrado, todas las secciones
  reportan `PERIOD_CLOSED` y no se ofrecen transiciones. `OperationalPeriodController` (`/operational-periods`
  list/close/reopen) gateado. **4 permisos nuevos** (catálogo **50→54**): `opsperiod:view/close/reopen/write-closed`
  (bypass = dato RBAC). **+11 tests** (API **180**: 9 del service + 2 de cableado/huella en LogEntries).
- **Web**: **`PeriodsSection`** en el detalle de `/calendario-operacional` (lista de períodos con estado/colores,
  cerrar/reabrir con modal de motivo, gateada por permiso) + capa de datos `operational-periods-api/queries` + caso
  **`PERIOD_CLOSED`** en la huella del llenado (`EntryFillPage`) + i18n `opsPeriod.*` y `logbook.fill.blockedPeriodClosed`.
- **Verificación**: `typecheck` (6 paquetes) · `lint` (0 errores; 1 warning preexistente OrgTree) · `build`
  contracts+web (API por watch: typecheck+test) · `test` (**contracts 125** +5 · permissions 5 · **API 180** +11) en
  verde. **Smoke en vivo 17/17** (rol+usuario temporal SIN bypass para el bloqueo + demo CON bypass para la excepción):
  list HTTP · create en período abierto · close→`PERIOD_CLOSED` en getDetail + sin transiciones · saveSection/setDeferral
  (fork 5)/create bloqueados 403 · bypass del demo escribe 200 · reopen→OPEN · saveSection tras reabrir 200 · AuditLog
  close+reopen. Datos LIMPIADOS (conteos en 0; AuditLog inmutable conserva su rastro por diseño).
- **NO probado**: la guarda de `executeTransition` quedó cubierta por **código + unit** (la plantilla de prueba no
  ofrecía transición disponible al usuario sin bypass para ejercitarla en vivo); smoke VISUAL en navegador del
  mantenedor de períodos y de la huella (ver BACKLOG §4).

## Hecho en Fase 2.7.1.1 (2026-06-11 — Calendario FISCAL transversal + período al estándar industrial)

Corrige un acoplamiento de diseño: el período contable era TRANSVERSAL pero vivía DENTRO del calendario de turnos.
Se DESACOPLA en la entidad `FiscalCalendar` (SAP company code / Maximo Organization / NetSuite subsidiaria).
Rama `feat/calendario-fiscal`. **4 forks finos resueltos** (DECISIONS 2026-06-11): pantalla propia · un fiscal por
config distinta + reasignar nodos · `periodStart/periodEnd` almacenados · unlock→CLOSED two-key + secuencialidad inversa.

- **Contratos**: `shared/date-utils` (helpers de fecha puros compartidos por ambos ejes); **`fiscal-calendar`**
  (`FiscalConfig`, `periodBoundsFor`/**`enumeratePeriods`** [rango contiguo `[start,end)`], `periodKeyForOperationalDate`,
  `validateFiscalCalendar`, DTOs CRUD, `requirePeriod`). `operational-calendar`: `resolveShift` PIERDE el período (solo
  `operationalDate`/`shiftCode`). `operational-periods`: tri-estado **OPEN→CLOSED→LOCKED** (CLOSING deprecado), `generate`,
  `lock`/`unlock`, `reopen` con `acknowledgeLaterClosed`, DTO `+= fiscalCalendarId/periodStart/periodEnd/isCurrent/locked*`.
  Permisos `+opsperiod:lock/unlock` (catálogo **54→56**). Tests contracts **139** (+período movido a fiscal spec).
- **Migración** (2 pasos + script por el EPERM de Windows): **M1** `add_fiscal_calendar` (estructural aditiva); script
  **`db:migrate-fiscal`** idempotente (dedup de configs por firma → 1 fiscal c/u, default desde el calendario de turnos
  default, reasigna nodos con firma ≠ default, remapea filas de período con `periodBoundsFor`); **M2**
  `decouple_fiscal_period_cleanup` (NOT NULL + drop de columnas legacy). En la BD real: 2 fiscales (fiscal-default **WEEK**
  + fiscal-mensual **MONTH**), TREATMENT PLANT reasignado a MONTH; el `periodKey` histórico (`2026-06-08` semanal) intacto.
- **Backend**: `FiscalCalendarModule` (CRUD gateado/auditado, default único, assignNodes) + **`FiscalResolver`** (token
  abstracto, path-walk por `OrgNode.fiscalCalendarId`, deriva el `periodKey` del `operationalDate`). `OperationalPeriodService`
  reescrito: `generate` idempotente contiguo (jamás degrada CLOSED/LOCKED), `close` con guarda **secuencial**, `lock`/`unlock`,
  `reopen` con secuencialidad inversa (bloquea si posterior LOCKED, exige acuse si posterior CLOSED), `list` por filas reales
  + `isCurrent`; `assertWritable` gana **LOCKED** (bloquea incl. bypass) y **`requirePeriod`** (sin fila ⇒ bloquea).
  `LogEntriesService` estampa `periodKey` vía `FiscalResolver` (`resolveDims` combina ambos ejes). Seed: FiscalCalendar
  default idempotente (no sobreescribe). **Fix de DI** (detectado en el smoke): `LogEntriesModule` importa `FiscalCalendarModule`.
  Tests API **187** (operational-periods reescrito a 16).
- **UI**: pantalla propia **`/calendario-fiscal`** (master-detail: config de período + `requirePeriod` + asignar nodos +
  **`FiscalPeriodsSection`** con botón **Generar**, filas agrupadas por año, badge **Actual**, acciones close/reopen/lock/unlock
  gateadas + acuse de secuencialidad inversa). `/calendario-operacional` pierde la config de período (solo turnos + ancla).
  nav + router + i18n `fiscalCal` (es-CL). Web build **1962 módulos**.
- **Verificación**: `typecheck`/`lint`/`build`/`test` verdes (contracts 139 · permissions 5 · API 187 · web 1962). **Smoke en
  vivo**: login demo → CRUD fiscal (create CUSTOM, validación 400, delete 204) → **generate** 2026 (12 meses, Actual=2026-06,
  idempotente) → **cierre secuencial** (409 fuera de orden, 201 en orden) → **lock/unlock** → **reopen inverso** (409 posterior
  LOCKED, 409 acuse con posterior CLOSED, 201 con acuse) → **guarda de escritura** (huella de lectura: CLOSED ⇒ demo con bypass
  NO bloqueado; **LOCKED ⇒ demo bloqueado pese al bypass** `PERIOD_CLOSED`) → **periodKey 2026-06-08 preservado**. Limpieza: 65
  períodos de prueba borrados (AuditLog inmutable conserva 37 rastros). **Side-effect del smoke**: la entrada demo
  `cmq7eglvm…` quedó con `fecha=2026-06-09` y `version` de sección +1 (un saveSection en estado OPEN; dato de demo, benigno).
- **Pendiente**: smoke **VISUAL** en navegador (mantenedor fiscal, generar, marca Actual, lock/unlock, modo claro) — BACKLOG §4.

## Hecho en Fase 2.7.1.1 — Afinamiento UX + Configuración del sistema (2026-06-11/12)

Iteración de inspección visual del dueño del producto sobre la pantalla fiscal recién construida. Rama
`feat/calendario-fiscal-ux`. Todo aditivo.

- **Panel fiscal a pestañas verticales** (General / Período / Nodos / Períodos) — descongestiona; cabecera
  (Guardar/Eliminar) **fija** y solo el contenido scrollea. Input de nombre a ancho completo.
- **Ayuda por tipo de período** (`PeriodKindHelp`): callout con explicación + ejemplo práctico (MENSUAL/SEMANAL/CICLO),
  en panel y drawer. Aclarado el MENSUAL con **meses de largo variable** (28/29/30/31): el período toma el largo real del
  mes; el día-ancla se limita a 1–28 para que el borde exista siempre. **+6 tests** de contrato (feb 28/29, 30/31, ancla 28).
- **Grilla de períodos** (`@lyra/ui` `Table`): **scroll INTERNO** (thead/footer sticky, altura acotada — la grilla es la
  que scrollea, no el panel), **orden por columnas** (período/rango/estado), filtro por año, confirmación al **Generar**
  (muestra cuántos períodos, idempotente), filas compactas, **fechas en formato regional**.
- **Historial por período** (`PeriodHistoryModal` + `GET /operational-periods/history`): timeline desde el AuditLog
  inmutable (quién/cuándo/motivo de close/reopen/lock/unlock). Estampa y muestra si la acción se ejecutó **con/ sin MFA**
  (`metadata.mfaVerified`), porque el ajuste puede cambiar después (registro auto-descriptivo).
- **Configuración del sistema** `/configuracion` (pantalla nueva, pestañas verticales por categoría): categoría
  **Seguridad** con **MFA por acción** de gobernanza de período (4 toggles independientes close/reopen/lock/unlock).
  Modelo `SystemSettings` singleton; gate en `OperationalPeriodService` vía `ReauthService` (step-up MFA) según la acción;
  el listado de períodos expone `requireReauth` como mapa para que la UI pida credenciales solo donde aplica. Permisos
  nuevos `module:settings:view` + `settings:manage` (catálogo **56→58**).
- **Formato regional centralizado** (`apps/watchlog-web/src/lib/format.ts`): `formatDateTime/Date/LocalDate/Number/Currency`
  leen el locale activo del i18n (es-CL, CLP por defecto). Regla del proyecto guardada en memoria. (Componentes previos aún
  formatean inline — migrar al tocarlos.)
- **Fix `@lyra/ui`**: `Toast` z-index 1000 (sobre modales/drawers) — los avisos de error ya no quedan difuminados bajo un modal.
- **Verificación**: typecheck/lint/build (web 1971) verdes; tests contracts **144** · permissions 5 · API **190**. Migraciones
  `add_system_settings` + `period_mfa_per_action`. **Smoke en vivo**: settings GET/PATCH per-acción; gate selectivo (solo
  reopen exige MFA → cerrar 201 / reabrir sin creds 401 / con password sin MFA 400); historial con `mfaVerified=false`;
  periodKey preservado; limpieza (0 períodos). **Pendiente**: smoke VISUAL del usuario (en curso).

## Próximo paso
**Fase 2.7.1.1 (núcleo + afinamiento UX) completa y publicada.** **Sesión siguiente: 2.7.2 — Ventana de edición configurable (#6)**: por plantilla
(fallback global) `{ancla RECORDED|EFFECTIVE, duración}`; fuera de ventana solo privilegio explícito con motivo
auditado; con período **gana la restricción MÁS estricta**. Extiende `blockedReason` con `EDIT_WINDOW_EXPIRED` (enum ya
extensible). Luego 2.7.3 matriz rol×sección×tiempo (#7).

**Mejora futura registrada (BACKLOG §2):** seguridad a nivel de nodo en el mantenedor de Estructura (ABAC
enterprise: asignar usuarios/roles a nodos desde el propio árbol, "quién accede a este nodo"). El modelo ya
existe; falta la UI node-centric, complementaria a la asignación de scope por usuario ya entregada.

**Puntos B/C/D de integración pendientes de análisis** (ver memoria `integration-pending.md`):
- B: CSV import/export de estructura
- C: API Keys (m2m para sistemas externos)
- D: Webhooks en cambios de estructura
