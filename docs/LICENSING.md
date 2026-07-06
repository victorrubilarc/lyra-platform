# Módulo de licenciamiento — Lyra WatchLog (especificación)

> **Qué es este documento.** La especificación técnica del **módulo de licenciamiento/activación**
> que hace cumplir el modelo de canal (ver [`estrategia-canal.md`](./estrategia-canal.md)): cada
> instalación on-premise solo funciona con una **llave firmada** por ITESICWS, con vencimiento,
> tope de instalaciones/nodos/usuarios y módulos habilitados. Es un **ítem de desarrollo cerrado**,
> aún no construido.
>
> Última actualización: **2026-07-06**. Estado: **L0 + L1 + L2 + L3 + L4 + L6 construidos** — el núcleo puro (firma/verificación
> Ed25519, huella, máquina de estados §5, linaje) existe como **`@lyra/licensing`** (`packages/licensing`, 50 tests), la
> API **vive la licencia en runtime** (L1: `LicenseService` + guard global + chequeo distribuido en el worker +
> auditoría; ver §4/§5), el **gating de módulos por entitlement está ACTIVO** (L2: catálogo canónico §5.1 +
> `@RequireModule`/`ModuleEntitlementGuard` + `GET /license/status` + ocultamiento en la web), la **emisión REAL
> existe** (L3: CLI `lyra-license` en `@lyra/licensing-cli` + custodia de la privada de PROD + ledger append-only +
> pública de PROD embebida por el build de release ⇒ **la imagen del primer tag post-L3 es distribuible**; ver §4/§6),
> la **renovación challenge-response con LINAJE ROTATORIO está ACTIVA** (L4: `renovacion.lreq` + `lyra-license
> renew` + rotación/`LINEAGE_MISMATCH` en runtime ⇒ **el clon de la instalación queda DETECTADO al renovar**; ver
> §4.1/§5) y la **UI de estado + avisos es REAL** (L6: banner global por estado + pestaña Licencia en Configuración +
> 3 eventos `license.*` por el motor de notificaciones a los administradores, con carve-out para que una licencia
> restringida no silencie su propia alarma; ver §5.2). Pendientes L5 (anti-tamper) y L2b (límites numéricos).
> Estimación total: ~80–160 HH.

---

## 1. Objetivo y principios

- **Hacer cumplir la licencia sin confiar en la honestidad del socio**: que una instalación no
  autorizada, vencida o fuera de límites **no funcione**.
- **Offline por diseño**: no requiere "llamar a casa". Muchas plantas industriales no dan salida a
  internet; el on-premise exige que la validación funcione sin conexión. (El *phone-home* es
  opcional y aditivo, §8.)
- **Firma asimétrica**: solo ITESICWS puede **emitir** licencias (clave privada); cualquier
  instalación puede **verificarlas** (clave pública embebida). El socio no puede fabricar ni alterar
  una licencia.
- **Disuasión, no bóveda** (honestidad): ningún candado que corre en la máquina del cliente es
  inviolable. El objetivo es subir el costo de piratear por encima del costo de pagar, y apoyarse en
  el **modelo de negocio** (updates + soporte indispensables) como lock final. Ver §7.
- **Separado del RBAC**: el licenciamiento gobierna **qué puede correr la INSTALACIÓN** (edición,
  módulos, límites). El RBAC/ABAC gobierna **qué puede hacer un USUARIO**. Son ejes distintos.

---

## 2. Modelo conceptual

```
        ITESICWS (emisor)                        Instalación del cliente (verificador)
   ┌───────────────────────┐                    ┌─────────────────────────────────────┐
   │  Clave PRIVADA (secreta)│                    │  Clave PÚBLICA (embebida en la app) │
   │        │                │   archivo de       │        │                            │
   │        ▼                │   licencia firmado │        ▼                            │
   │  Firma la licencia  ────┼───────────────────▶│  Verifica la firma al arrancar      │
   │  (CLI de emisión)       │  (license.lic)     │  y periódicamente → permite/bloquea │
   └───────────────────────┘                    └─────────────────────────────────────┘
```

- La **clave privada** vive solo en ITESICWS (idealmente en un HSM o un gestor de secretos, nunca en
  el repo ni en una imagen).
- La **clave pública** se compila dentro de la app (API). Aunque el socio la lea, con la pública
  **no puede firmar** — solo verificar.
- El **archivo de licencia** (`license.lic`) se le entrega al socio/cliente y se monta en la
  instalación (volumen Docker / variable / secreto). Si se altera una coma, la firma se rompe.

---

## 3. Contenido del archivo de licencia

El archivo es un **payload JSON firmado** (JWS/Ed25519, §4). Ejemplo del payload:

```json
{
  "licenseId": "lic_2026_ACME_001",
  "issuer": "ITESICWS",
  "issuedAt": "2026-07-01T00:00:00Z",
  "notBefore": "2026-07-01T00:00:00Z",
  "expiresAt": "2027-07-01T00:00:00Z",
  "graceDays": 14,

  "channelPartner": "SOCIO_XYZ",
  "customer": "Minera Acme",
  "installationId": "inst_acme_planta_norte",

  "edition": "professional",
  "modules": ["core", "incidents", "shift-handover", "notifications", "themes"],

  "limits": {
    "maxInstallations": 1,
    "maxNodes": 200,
    "maxNamedUsers": 80
  },

  "whiteLabel": true,
  "supportTier": "L2",
  "schemaVersion": 1,

  "fingerprint": "3f9c…(huella de máquina, node-lock)",
  "renewalCounter": 1,
  "nonce": "…(linaje rotatorio, capa 4)"
}
```

> **Nota (L0, 2026-07-04):** el payload **no lleva campo de algoritmo** (`signatureAlg` se eliminó del ejemplo
> original): el algoritmo vive SOLO en la cabecera JWS y el **verificador lo fija a EdDSA** — la cabecera del archivo
> no se obedece, se valida (mitiga la confusión de algoritmo, RFC 8725 §3.1). Se agregaron al esquema `fingerprint`
> (node-lock, capa 2) y los campos de **linaje** `renewalCounter`/`nonce` (capa 4).
>
> **Nota (L4, 2026-07-05):** el linaje está ACTIVO. En una **activación**, `renewalCounter=0` y `nonce` es un
> aleatorio inerte para el runtime. En una **renovación**, `renewalCounter = counter presentado + 1` y `nonce = el
> nonce PRESENTADO` en la solicitud — el *binding* que hace la respuesta **importable UNA sola vez y solo en la
> instalación que la pidió** (el nonce NUEVO lo genera la instalación LOCALMENTE al rotar y jamás viaja; ver §4.1).

**Campos clave:**
- `expiresAt` + `graceDays` → vencimiento y periodo de gracia (§5).
- `installationId` → ata la licencia a **esta** instalación (evita copiar la llave a otra).
- `modules` → qué módulos de producto están habilitados (gating de features de pago).
- `limits` → topes duros de instalaciones/nodos/usuarios (evita el sobre-despliegue).
- `edition` → paquete comercial (starter/professional/enterprise), mapea a `modules` + `limits`.
- `whiteLabel` → habilita el modo marca blanca completo.
- La **firma** va aparte (formato JWS: `header.payload.signature`), NO dentro del JSON.

---

## 4. Firma y verificación

- **Algoritmo: Ed25519** (firma asimétrica moderna: llaves pequeñas, rápida, soportada nativamente por
  el módulo `crypto` de Node ≥ 22). Formato de sobre: **JWS compacto** (`cabecera.payload.firma` en
  base64url). **Implementado en L0** como el paquete puro **`@lyra/licensing`** (`packages/licensing`):
  `signLicense`/`verifyLicense` (resultado tipado, alg fijado a EdDSA en el verificador),
  `deriveFingerprint` (huella canónica sha256 de señales del host, capa 2) y `evaluateLicense` + helpers
  (`isExpired`/`isWithinGrace`/`isModuleLicensed`/`exceedsLimits`) para la máquina de estados §5. Las
  llaves entran SIEMPRE por parámetro (puro y testeable); cero dependencias externas.
- **Emisión (ITESICWS) — ✅ construida en L3** (`packages/licensing-cli`, `@lyra/licensing-cli`, herramienta del
  EMISOR que **jamás llega a la imagen del cliente**): `pnpm license issue --request solicitud.lreq --customer …
  --channel-partner … --edition … --modules … --max-nodes … --max-named-users … --expires …` parsea la solicitud de
  activación (huella real → node-lock), valida la entrada (edición ∈ enum, módulos contra `LICENSED_MODULE_KEYS`,
  fechas ISO), firma con `signLicense` de `@lyra/licensing` (la CLI no re-implementa criptografía), **auto-verifica**
  (round-trip + huella) y produce `license.lic`, registrando la emisión en el **ledger** (JSONL append-only con
  cadena de hashes en `~/.lyra-license/ledger.jsonl` — control de banda por socio, `lyra-license ledger`). Además:
  `keygen` (genera el par de PROD con la privada CIFRADA) e `inspect` (QA del emisor). El flujo DEV
  (`pnpm license:dev`) es un envoltorio delgado de la MISMA implementación con el par DEV committeado.
- **Verificación (instalación) — ✅ construida en L1** (`apps/watchlog-api/src/licensing/`): al arrancar la
  API, `LicenseService` carga el archivo (`LICENSE_FILE`, def. `.license/license.lic`; en contenedor
  `/app/license/license.lic` montado como volumen), **verifica la firma con la clave pública EMBEBIDA como
  constante compilada** (`license-public-key.ts` — jamás por env; en el árbol de trabajo es la pública DEV y el
  build de RELEASE la reemplaza por la de PROD vía codegen, ver L3 abajo), deriva la **huella real** (`MachineSignalsCollector`: machine-id del HOST bind-monteado
  + cpuModel + osPlatform; MACs/hostname EXCLUIDOS por inestables bajo Docker) y evalúa con `evaluateLicense`
  + conteos reales (nodos / usuarios ACTIVE). Resultado → `LicenseSnapshot` **cacheado**, re-evaluado en cada
  arranque y cada `LICENSE_RECHECK_MINUTES` (def. 360 = 6 h) con `warnDays` = `LICENSE_WARN_DAYS` (def. 30).
  La identidad local (`installationId` + linaje L4) persiste en la tabla single-row **`LicenseInstallation`**
  (Postgres: el backup del runbook la respalda con los datos; clonar la BD clona el linaje = lo que L4 detecta).
  Sin archivo, el servicio escribe **`solicitud.lreq`** (installationId + huella) junto a la ruta de la
  licencia — deja lista la ceremonia de activación del runbook §2.
- **Custodia de la clave privada — ✅ construida en L3:** la privada de PROD vive **PKCS#8 CIFRADA**
  (aes-256-cbc + passphrase generada de alta entropía, guardada en el gestor de contraseñas del dueño) en
  `LYRA_LICENSE_HOME` (def. `~/.lyra-license/`), FUERA del repo/imagen/.env; la CLI la descifra SOLO en memoria al
  firmar (passphrase por prompt sin eco / `LYRA_LICENSE_PASSPHRASE` / `LYRA_LICENSE_PASSPHRASE_FILE`, nunca por
  flag). La **pública de PROD sí está committeada** (`scripts/license/prod-keys/` — no es secreto: viaja en cada
  imagen) y el **release la embebe en build** (`scripts/license/embed-public-key.mjs` reescribe
  `license-public-key.ts` antes del `docker build`; dev/CI siguen con la DEV). **Rotación (diferida, sin `kid`):**
  cuando haga falta, el verificador puede probar N públicas embebidas en orden — `verifyLicense` recibe el PEM por
  parámetro, así que es retrocompatible sin tocar el formato JWS (DECISIONS 2026-07-05 L3, decisión d).

### 4.1 Renovación challenge-response con linaje rotatorio (✅ construida en L4)

La renovación usa el **mismo baile por archivos** de la activación (air-gap intacto), con la capa 4 encima
(LICENSING_STRATEGY §4, patrón CodeMeter, PoC T6). Piezas:

- **Solicitud (lado producto):** mientras exista una licencia verificada, `LicenseService` deja/refresca
  **`renovacion.lreq`** junto a `license.lic` (misma carpeta): `{ type:"renewal", installationId, fingerprint,
  licenseId, renewalCounter, nonce }`. El `nonce` es el **linaje local** de `LicenseInstallation` — se genera en la
  máquina (init perezosa la primera vez) y **jamás viaja** salvo dentro de esta solicitud. Se escribe SIEMPRE que hay
  payload (no solo en POR_VENCER): un upgrade a mitad de ciclo usa la misma ceremonia. Idempotente entre re-evaluaciones.
- **Emisión (lado emisor):** `pnpm license renew --request renovacion.lreq --expires <ISO>` — valida el linaje
  **contra el ledger**: una renovación ya registrada para ese `installationId` con el MISMO counter presentado =
  **dos solicitudes con el mismo linaje = CLON DETECTADO ⇒ SE DENIEGA** (exit ≠ 0) y se escala a humano; el override
  explícito `--force-duplicate` queda **marcado en el ledger** (evidencia contractual). Un counter desfasado o un
  `licenseId` que no calza también se deniegan; una huella distinta exige `--accept-new-fingerprint` (migración de
  hardware legítima, auditada). Sin flags comerciales, `renew` **hereda los términos de la última emisión** del
  ledger (mismo `licenseId`, misma edición/módulos/límites — cualquier flag = upgrade) y emite con
  `renewalCounter = presentado + 1` y `nonce = presentado`. Reusa `issueLicense`/`signLicense` — cero criptografía nueva.
- **Importación única (lado producto):** el helper puro **`evaluateLineage(payload, linajeLocal)`** (ADITIVO en L0;
  `signLicense`/`verifyLicense`/`evaluateLicense` siguen congelados) da tres veredictos:
  `CURRENT` (la licencia ya aceptada — incluye el caso retrocompatible counter 0 === 0: una licencia L3 sobre una
  instalación que jamás renovó evalúa EXACTAMENTE como antes de L4), `ROTATE` (respuesta legítima vista por primera
  vez ⇒ la app **rota su linaje**: persiste el counter y un nonce local FRESCO + `lastRenewalAt`, audita
  `license.renewed`) y `MISMATCH` (⇒ **BLOQUEADA con reason `LINEAGE_MISMATCH`** — restringido, jamás destructivo).
  Tras rotar, **ni la licencia anterior ni una respuesta re-importada calzan** en ninguna instalación. El chequeo es
  DISTRIBUIDO: el worker re-verifica firma desde disco **y** contrasta el linaje con el mismo helper.
- **Límite honesto (STRATEGY §4/§9):** un clon byte-a-byte es indistinguible hasta que los linajes divergen — la
  PRIMERA respuesta tras el clonado calza en ambas copias. La detección de esa ronda es del **EMISOR** (linaje
  repetido en el ledger); desde la siguiente renovación el clon ya no calza nunca más. Por eso el **ciclo corto**
  (30–90 días) es el parámetro comercial que hace que la detección ocurra seguido (política en PROCEDURE §4).

---

## 5. Comportamiento en runtime (máquina de estados)

| Estado | Condición | Comportamiento |
|---|---|---|
| **VÁLIDA** | Firma OK, vigente, dentro de límites | Funciona normal. |
| **POR VENCER** | Faltan ≤ N días para `expiresAt` | Funciona normal + **banner de aviso** a administradores (y notificación). |
| **EN GRACIA** | `expiresAt` pasó pero dentro de `graceDays` | Funciona + **aviso prominente** "licencia vencida, renovar en X días". No corta la operación (no dejar una planta a ciegas de golpe). |
| **VENCIDA / BLOQUEADA** | Pasó la gracia, o firma inválida, o falta el archivo, o el **linaje no calza** (`LINEAGE_MISMATCH`, L4: licencia anterior tras una renovación, respuesta re-importada o instalación clonada) | **Modo restringido**: bloquea el ingreso de datos nuevos y las funciones premium; permite **solo lectura/exportación** para no secuestrar los datos del cliente. Mensaje claro de renovación. |
| **LÍMITE EXCEDIDO** | Supera `maxNodes`/`maxNamedUsers`/`maxInstallations` | Bloquea **crear** por encima del límite (no rompe lo existente); avisa al admin. |
| **MÓDULO NO LICENCIADO** | Se usa un módulo fuera de `modules` | **✅ construido en L2:** las **MUTACIONES** del módulo se rechazan en el backend con `403 { code: "MODULE_NOT_LICENSED", module }`; la **lectura y exportación de sus datos SIGUEN disponibles** (GET pasa — jamás se secuestran datos, ni por downgrade de edición). La web además lo **oculta** (sidebar/Inicio/⌘K: visible = licenciado ∧ permiso). Aplica con la licencia OPERATIVA; es un eje distinto del permiso de usuario (ambos guards corren). |

**Principios de degradación (importantes por regulación/ética):**
- Nunca **borrar** ni **secuestrar** datos por licencia vencida: en el peor caso, **solo lectura +
  exportación**. Los datos son del cliente.
- La operación crítica no se corta **de golpe**: hay aviso previo (POR VENCER) y gracia.
- Todo cambio de estado de licencia se **audita** (`AuditLog`) y notifica a administradores.

**Enforcement construido en L1 (cómo se aplica esta tabla en runtime):**
- **`LicenseEnforcementGuard` GLOBAL** (4.º guard, corre tras JWT/permisos): en estados **restringidos**
  (SOLO_LECTURA · BLOQUEADA · PENDIENTE_ACTIVACION) bloquea las **MUTACIONES** (POST/PUT/PATCH/DELETE) con
  `403 { code: "LICENSE_RESTRICTED", licenseStatus }`; **GET/HEAD/OPTIONS pasan SIEMPRE** (toda exportación del
  producto es GET: acta PDF, presigned de adjuntos, export de auditoría). **Lista blanca explícita** (constante
  testeada, sin regex): prefijo `/api/auth/` (login/refresh/logout/contraseña/MFA — sin ellos ni se podría leer)
  y `/api/health` exacto. EN_GRACIA / POR_VENCER / LIMITE_EXCEDIDO **no** bloquean en L1 (se registran; el
  enforcement fino "no crear por encima del límite" y el gating por módulo son L2).
- **`PENDIENTE_ACTIVACION`** = variante presentable de BLOQUEADA cuando **no hay archivo de licencia**
  (instalación recién desplegada): mismo enforcement, estado/mensaje propio. Es un estado del RUNTIME de la API
  (`LicenseRuntimeStatus`), NO del enum puro de `@lyra/licensing` (no hay payload que evaluar).
- **Verificación DISTRIBUIDA, no un solo `if`:** además del guard HTTP, el **worker de notificaciones** re-verifica
  la firma **desde disco** en cada tick (`LicenseService.workersOperational`) y en estados restringidos NO genera
  trabajo operacional nuevo (avisos/barridos SLA). Dos rutas de código independientes; el acta PDF NO se bloquea
  a propósito (es EXPORTACIÓN — bloquearla violaría "jamás secuestrar datos").
- Cambio de estado ⇒ `AuditLog` `license.state.changed` (actor `system@license`, antes/después) + log nítido al
  arranque (estado · motivo · licenseId · cliente · edición · vencimiento · huella). La notificación a
  administradores y el banner son REALES desde L6 (§5.2).

### 5.1 Gating de módulos por entitlement (✅ construido en L2)

**Catálogo canónico de claves de módulo** — vive en **`@lyra/contracts`** (`src/licensing/modules.ts`,
`LICENSED_MODULE_KEYS`): es el vocabulario compartido de backend y web. NO vive en `@lyra/licensing` a propósito
(el web lo necesita y esa librería es server-only + se hornea en L5); el payload sigue siendo dato LIBRE
(`LicenseModule = string`): una licencia futura puede traer claves que un build viejo no conoce sin romper nada.
Regla de CLAUDE.md: **todo módulo nuevo de producto registra su clave aquí** (y etiqueta su controlador y su ruta).

Claves (13): `core` · `structure` · `templates` · `logbook` · `schedules` · `incidents` · `exceptions` ·
`work-orders` · `shift-handover` · `notifications` · `themes` · `ai` · `dashboards`.

**Mapeo módulo → superficie del producto** (decorator `@RequireModule` a nivel de CONTROLADOR + etiqueta
`module` en el registro `SIDEBAR_ROUTES` de la web):

| Clave | Backend (controladores) | Web (rutas) |
|---|---|---|
| `core` (JAMÁS se gatea) | auth, health, security, settings, saved-views, calendarios (operacional/fiscal/períodos), workflows (motor compartido por plantillas E incidencias) | Inicio, Seguridad, Configuración, Flujos, Calendarios, perfil |
| `structure` | structure, equipment | /estructura |
| `templates` | templates, reference-lists | /plantillas, /datos-referencia |
| `logbook` | log-entries | /bitacoras, /nueva-entrada |
| `schedules` | schedules | /rondas, /mis-rondas |
| `incidents` | incidents | /incidencias (+catálogos) |
| `exceptions` | exceptions, rule-actions (worker de reglas: sin el módulo NO materializa excepciones nuevas — las órdenes quedan PENDING, nunca se descartan) | /excepciones |
| `work-orders` | work-orders, persons, competencies | /ordenes-trabajo (+catálogos) |
| `shift-handover` | shift-handover | /cambio-turno |
| `notifications` | notifications, email (SMTP); el worker tampoco genera/despacha/envía sin el módulo | /notificaciones, campanita, tile |
| `themes` | theme | pestaña temas |
| `ai` | ai (config IA) | pestaña IA |
| `dashboards` | (solo GETs analíticos — el gate de mutación no aplica) | /panorama, /incidencias/dashboard |

**Semántica del guard (`ModuleEntitlementGuard`, 5.º guard global, tras el de estados de L1):**
- Módulo NO licenciado ⇒ mutaciones (POST/PUT/PATCH/DELETE) `403 { code: "MODULE_NOT_LICENSED", module }`;
  **GET/HEAD/OPTIONS pasan SIEMPRE** (lectura + exportación garantizadas: la licencia jamás secuestra datos).
- Aplica **aun con la licencia VÁLIDA** (downgrade de edición no vencida). `core` y endpoints sin decorator no
  se gatean nunca.
- **Precedencia:** SIN payload verificado (PENDIENTE_ACTIVACION / BLOQUEADA) este guard NO opina — el guard
  global de L1 ya restringe con `LICENSE_RESTRICTED`; un estado global nunca se enmascara como problema de módulo.
- **Defensa en profundidad:** el gate por módulo es ADICIONAL al RBAC (`@RequirePermission`) — ambos corren.
  Y es DISTRIBUIDO: además del guard HTTP, los workers (notificaciones, acciones de regla) re-chequean el
  entitlement (`LicenseService.moduleOperational`).

**DTO delgado + endpoint (`GET /api/license/status`, autenticado sin permiso):** la web consume
`{ status, reason?, edition?, modules[] | null, expiresAt?, daysToExpiry?, graceDaysRemaining? }`
(`licenseStatusSchema` en `@lyra/contracts`), **mapeado campo a campo desde el snapshot** (`toLicenseStatus`) —
JAMÁS el payload: sin huella, sin linaje, sin installationId, sin customer/licenseId (mínimo privilegio, testeado).
`graceDaysRemaining` (entero ≥0) viaja SOLO en EN_GRACIA (decisión L6a: la spec §5 exige "renovar en X días" y con
`daysToExpiry` negativo la UI no puede calcular el fin de la gracia; es un derivado de presentación).
`modules: null` = sin payload verificado ⇒ el front NO oculta por módulo (gobiernan los estados globales). Este DTO
alimenta el banner de L6 (§5.2). La web oculta con `useLicensedModules()` en el registro de navegación (sidebar,
Inicio, ⌘K, campanita): **visible = módulo licenciado ∧ permiso del usuario**; el candado real sigue siendo el 403
del backend.

### 5.2 UI de estado + avisos a administradores (✅ construido en L6)

**Banner global (web, shell bajo el Topbar):** `LicenseBanner` alimentado por `useLicenseStatus`; el mapeo
estado→presentación es la función PURA `licenseBannerFor` (testeada). Audiencia y comportamiento (decisión L6a):

| Estado | Quién lo ve | Tono | Descartable |
|---|---|---|---|
| VALIDA | nadie (sin banner) | — | — |
| POR_VENCER | solo admins (`settings:manage`, filtro de UI) | warning | ✅ por sesión |
| EN_GRACIA | todos (prominente: "renovar en X días" con `graceDaysRemaining`) | warning | ✅ por sesión |
| SOLO_LECTURA · BLOQUEADA · PENDIENTE_ACTIVACION | todos (explican el porqué del solo-lectura) | error / info | ❌ persistente |
| LIMITE_EXCEDIDO | solo admins | warning | ✅ por sesión |

`LINEAGE_MISMATCH` tiene texto humano propio ("esta licencia no corresponde a esta instalación — contacta a tu
proveedor"). Textos por i18n (`license.banner.*`), tokens del DS, "tu proveedor" (jamás ITESICWS — marca blanca).
El banner INFORMA; el candado real sigue siendo el guard del backend (L1/L2).

**Detalle en Configuración › Licencia** (`?tab=license`, deep link del banner y de la campanita): solo lectura —
estado + motivo humanizado, edición, módulos (chips), vencimiento + días y las instrucciones de renovación del
runbook §4 en texto guía. Gate = `module:settings:view` (SIN permiso nuevo, decisión L6b: el DTO ya es visible para
todo autenticado). NO expone ni sube archivos de licencia.

**Avisos por el motor de notificaciones (Bloque N — cierra el pendiente L1(iii)):** 3 eventos del catálogo
(plantillas default en el seed; preferencias por canal EMAIL/INAPP como todos):
- `license.state.changed` (tx): transición EN CALIENTE detectada por `LicenseService.refresh` (incluida la vuelta a
  VALIDA). En el arranque no emite (spamearía cada reinicio); ese caso lo cubren los derived.
- `license.expiring` (derived): POR_VENCER re-avisa por SEMANA ISO; EN_GRACIA por DÍA (cadencia en la dedupeKey).
- `license.restricted` (derived, diario): SOLO_LECTURA / BLOQUEADA / PENDIENTE_ACTIVACION / LIMITE_EXCEDIDO.

**Destinatarios** = usuarios con un rol que concede `settings:manage` (permiso CONFIGURABLE, sin roles hardcodeados)
∪ suscripciones explícitas, SIN filtro ABAC de nodo (la licencia es de la instalación). El payload del evento
CONGELA el estado presentable (multi-instancia: el dispatcher que lo toma puede tener otro snapshot local) y JAMÁS
lleva licenseId/customer/huella/linaje; el deep link de la campanita usa el id fijo `"system"`.

**Carve-out del worker (clave):** en estados restringidos el motor pausa el trabajo operacional
(`workersOperational`, L1), pero las tres etapas procesan IGUAL los eventos `license.*` — sin esto, la licencia
restringida silenciaría su propia alarma. Los eventos de licencia tampoco se gatean por el módulo `notifications`
(avisar la licencia es función de sistema, no una feature comprada).

**Gate latente de marca blanca (decisión L6d):** `LicenseService.isWhiteLabelEnabled()` lee `whiteLabel` del payload
verificado; hoy sin efecto visible y sin viajar al DTO — el épico de marca blanca (BACKLOG §2(2)) lo cablea después.

---

## 6. Emisión y ciclo de vida (proceso ITESICWS)

1. Se acuerda una instalación con el socio → generas `installationId` y emites `license.lic` con la
   CLI (vencimiento según ciclo pactado, `modules`/`limits` según edición comprada).
2. El socio la despliega (monta el archivo en el stack).
3. **Renovación (✅ real desde L4):** la instalación entrega su `renovacion.lreq` (con linaje) y emites con
   `lyra-license renew` (valida el linaje contra el ledger — clon detectado se deniega; hereda los términos; ver
   §4.1). El socio la reemplaza; la app la toma en el próximo arranque o recarga y **rota su linaje**.
4. **Upgrade de edición/módulos:** nueva licencia con más `modules` o `limits`.
5. **Baja:** no renuevas → la instalación entra en POR VENCER → GRACIA → BLOQUEADA (solo lectura).

---

## 7. Anti-tamper / anti-auto-parcheo (capas de disuasión)

El riesgo real que preocupa al negocio: que el socio (o su dev) **edite el código** para saltarse el
chequeo. No se puede volver imposible al 100%, pero se encarece por capas:

| Capa | Qué hace |
|---|---|
| **1. No entregar código fuente** (la principal) | Se entregan **imágenes Docker compiladas** (bundle minificado), no el repo. El módulo de licencia crítico puede compilarse a **bytecode V8** (`bytenode`) o binario nativo (Node SEA / Bun) para que no sea texto editable. |
| **2. Firma asimétrica** | Aunque vean el `license.lic`, no pueden emitir uno válido ni extender el vencimiento (no tienen la clave privada). |
| **3. Verificación distribuida** | El chequeo NO es un solo `if` desactivable: se reparte (arranque, gating de módulos, generación del acta PDF, tareas programadas). Hay que romperlos todos. |
| **4. Marca blanca = config, no código** | El socio personaliza por **temas/config en runtime**, nunca tocando fuente. Nunca necesita ni recibe el código. |
| **5. Disuasivo económico (el lock real)** | Un binario parcheado queda **congelado**: sin parches de seguridad, sin updates, sin módulos nuevos, sin soporte. En industria regulada es inaceptable para el cliente final. Renovar sale más barato que mantener un fork pirata. |
| **6. Legal** | Contrato de canal + auditoría de instalaciones + prohibición de descompilar (§6 de estrategia-canal). |

> **Verdad de fondo:** el candado técnico frena el ~95% (sobre-despliegue casual, copiar la llave,
> "instalé 12 pagando 8"). El 5% restante (un experto decidido con tiempo) lo cubre el modelo de
> negocio (dependencia de updates/soporte) y el contrato. No prometer "imposible de piratear".

---

## 8. Opcionales aditivos (fase 2, si se justifica)

- **Activación / fingerprint de instalación:** al primer arranque, la app deriva una huella
  (installationId + características del entorno) y la liga a la licencia, para que el mismo
  `license.lic` no sirva copiado a otra máquina.
- **Phone-home opcional:** si el cliente permite salida a internet, la instalación puede reportar
  latido (heartbeat) a un servicio de ITESICWS (conteo real de instalaciones activas, revocación
  remota). **Nunca obligatorio** — debe funcionar 100% offline si no hay red.
- **Revocación:** lista de `licenseId` revocados distribuida en updates (para casos de fraude).

---

## 9. Alcance de desarrollo y estimación

| Sub-ítem | HH aprox. |
|---|---|
| Formato de licencia + firma/verificación (Ed25519, JWS) — **✅ hecho en L0 (`@lyra/licensing`)** | 15–25 |
| CLI de emisión + custodia de clave privada — **✅ hecho en L3** (`@lyra/licensing-cli`: keygen/issue/inspect/ledger; privada PROD cifrada bajo custodia; pública PROD embebida por el release ⇒ imagen vendible; ledger hash-chain; CLI 22 tests + smoke-emisión 20/20) | 10–20 |
| `LicenseService` + máquina de estados + caché + re-evaluación — **✅ hecho en L1** (+ guard global, señales estables bajo Docker, `LicenseInstallation`, auditoría, `solicitud.lreq`, licencia dev `pnpm license:dev`, smoke 28/28) | 20–35 |
| Renovación challenge-response + linaje rotatorio (detección de clon) — **✅ hecho en L4** (`renovacion.lreq` + `lyra-license renew` + `evaluateLineage`/rotación/`LINEAGE_MISMATCH`; ciclo corto como política del runbook; smoke-renovación 29/29 — PoC T6 en vivo) | 10–20 |
| Gating de módulos por entitlement (backend + web) — **✅ hecho en L2** (catálogo canónico en contracts, `@RequireModule`/guard 5.º, `GET /license/status` DTO delgado, ocultamiento sidebar/Inicio/⌘K, workers module-aware; smoke 23/23) — **+ UI de estado/avisos ✅ hecha en L6** (banner por estado + pestaña Licencia en Configuración + 3 eventos `license.*` al Bloque N con carve-out del worker y destinatarios por `settings:manage`; smoke-avisos 25/25; ver §5.2) | 15–30 |
| Enforcement de límites (nodos/usuarios/instalaciones) | 10–20 |
| Empaquetado anti-tamper (bytecode/native del módulo crítico) | 10–30 |
| **Total** | **~80–160 HH** |

Fase 2 (fingerprint/phone-home/revocación): +40–80 HH si se pide.

---

## 10. Qué NO hace (límites honestos)

- No es DRM inviolable: es disuasión + firma + modelo de negocio (§7).
- No secuestra datos: licencia vencida = solo lectura/exportación, nunca borrado.
- No requiere internet (offline por diseño); el phone-home es opcional.
- No reemplaza el RBAC/ABAC: gobierna la **instalación**, no al **usuario**.
