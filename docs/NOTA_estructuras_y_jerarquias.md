# Apunte — Estructuras organizacionales y jerarquías (para decidir y dominar el tema)

> **Para qué sirve este apunte.** Entender, con lenguaje claro y ejemplos, cómo los
> sistemas de clase mundial manejan "varias estructuras / varias jerarquías", para
> decidir qué construir en Lyra WatchLog **sin sobre-ingenierizar**. Fecha: 2026-06-23.

---

## 0. La idea en una frase (el modelo mental)

> **"Negocios distintos" y "vistas distintas del mismo negocio" son necesidades
> diferentes y se resuelven con mecanismos diferentes.**
> Confundirlas cuesta caro: si *aíslas* cuando deberías *agrupar*, **duplicas datos**;
> si *agrupas* cuando deberías *aislar*, **filtras datos entre clientes**.

Todo el resto del apunte desarrolla esa frase.

---

## 1. Los dos patrones (con nombres reales de la industria)

### Patrón 1 — Separación por dominio / aislamiento (mundos separados)
Varios **árboles independientes**; cada uno con sus niveles y **sus datos no se cruzan**.
Es para **clientes o negocios distintos** que comparten la instalación pero nada más.

- **Analogía:** carpetas separadas, una por cliente. Lo que metes en una no aparece en otra.
- **Cómo lo llaman:** ServiceNow → **Domain Separation**. SAP → *company code / controlling area*.
- **Ejemplo en tu mundo:** la estructura **Eiser** (`Contrato→Sitio→Host`) y la de **una
  minera** (`Faena→Planta→Área`). Distinta forma, distinta gente, cero relación. Un usuario
  de Eiser jamás debe ver un nodo ni un registro de la minera.

### Patrón 2 — Jerarquías alternativas / lentes (la misma operación, agrupada distinto)
**Un solo** conjunto de datos, **agrupado de varias formas a la vez**. El dato se registra
**una sola vez** y "rueda hacia arriba" distinto según quién mire.

- **Analogía:** las mismas fotos, etiquetadas para verlas por **fecha**, por **lugar** o por
  **persona**. No duplicas la foto; la miras por distintas etiquetas.
- **Cómo lo llaman:** SAP → **alternative / flexible hierarchies** (*cost center groups*).
  Maximo → **Systems**. Workday → **matrix / cost center orgs**. Data warehousing → *alternate
  hierarchies*.
- **Ejemplo en tu mundo:** el **mismo** incidente del servidor periferia de Eiser tiene que
  aparecer en el informe de **Santa Fe**, en el de **Laja** y en el de **Maderas** (regla
  RN-04). Eso **no es** una estructura aparte: es **una misma operación vista por la lente
  "planta"** y por la lente "organismo (SMA/DGA)".

| | **Patrón 1 — Aislamiento** | **Patrón 2 — Jerarquías alternativas** |
|---|---|---|
| Qué separa | Los **datos** (mundos estancos) | Solo la **forma de agrupar/ver** los mismos datos |
| El dato se registra… | una vez por mundo | **una sola vez**, total |
| Un nodo/ítem pertenece a… | exactamente **una** estructura | **una** jerarquía maestra + **muchas** alternativas |
| Para qué | clientes/negocios distintos | reportar/navegar/autorizar la misma operación |
| Costo | alto, casi irreversible | bajo-medio, aditivo |

---

## 2. El principio que comparten TODOS los sistemas serios

Los cinco que revisé (SAP, Maximo, Workday, ServiceNow, data warehouses) hacen lo mismo
conceptual:

1. **Hay UNA jerarquía maestra = fuente de verdad.** Cada cosa vive en **un solo lugar** ahí.
   - SAP la llama **"standard hierarchy"** y *obliga* a que contenga **todos** los centros de
     costo (no puede faltar ninguno).
   - Maximo la llama **"primary system"**; un activo pertenece a **una sola** jerarquía.
   - Workday la llama **"supervisory organization"**; al trabajador lo contratas ahí primero.

2. **Encima se "apilan" jerarquías alternativas** para reportar/agrupar/autorizar, **sin
   volver a cargar el dato**:
   - SAP: un centro de costo está en **un** nodo del estándar, pero en **cuantos grupos
     alternativos quieras** (por área de decisión, de responsabilidad, de gestión).
   - Maximo: una ubicación puede pertenecer a **varios "systems"** = varias jerarquías a la vez.
   - Workday: el **mismo** trabajador está a la vez en su org de management, su centro de costo
     (finanzas), su región y su org matricial (proyectos).

3. **El aislamiento (Patrón 1) es un mecanismo aparte y pesado.** ServiceNow lo reserva para el
   **modelo MSP** (una instancia, varios clientes con aislamiento total) y advierte: **se puede
   desactivar pero NO quitar** — agrega complejidad permanente.

> **Regla de oro que se repite:** una sola fuente de verdad; las "otras vistas" son **capas de
> agrupación encima**, nunca copias del dato.

---

## 3. Glosario — el lenguaje técnico, explicado con ejemplos

> Esta sección es para dominar la jerga. Cada término: qué es en una frase + ejemplo concreto.

- **Jerarquía (hierarchy).** Un árbol de cajas padre→hijo.
  *Ej:* `Contrato Eiser → Infraestructura → Santa Fe → SF-DB`.

- **Nodo (node).** Cada caja del árbol.
  *Ej:* `SF-DB` (el servidor Windows/SQL de Santa Fe) es un nodo.

- **Fuente única de verdad (single source of truth).** El dato se registra **una vez** en un
  lugar autoritativo; todo lo demás lo *referencia*, no lo copia.
  *Ej:* el incidente "API DGA caída 2 h" se registra **una vez**, aunque salga en 3 informes.

- **Multi-tenant vs single-tenant.** *Tenant* = inquilino. Multi-tenant = varios clientes
  comparten una instalación; single-tenant = una sola organización por instalación.
  *Ej:* Lyra WatchLog es **single-tenant** (se instala por empresa). Pero tú quieres meter
  **varios clientes** (Eiser, otra minera) *dentro* de tu instalación de dev → eso es
  **multi-cliente lógico**, que se logra con el Patrón 1.

- **Domain separation (separación por dominio).** Partir los datos en "dominios" lógicos dentro
  de **una** instancia, para simular multi-tenant.
  *Ej:* tus "estructuras aisladas" actuales = un dominio por cliente.

- **Jerarquía maestra / estándar / primaria (standard / primary hierarchy).** La jerarquía
  oficial que contiene **todo**, con cada ítem en **un solo lugar**. Es la fuente de verdad
  estructural.
  *Ej:* el árbol físico de Eiser (`Contrato→Sitio→Host`) es la maestra de ese cliente.

- **Jerarquía alternativa / grupo (alternative hierarchy / group).** Una agrupación **parcial**
  montada encima de la maestra; un mismo ítem puede estar en **muchas**.
  *Ej:* agrupar los 5 canales de Eiser por **organismo**: grupo "SMA" = {SF-SMA, MAD-SMA},
  grupo "DGA" = {SF-DGA, LAJ-DGA, MAD-DGA}. Los canales no se mueven del árbol; solo se etiquetan.

- **Dimensión (dimension).** Un **eje** por el que filtras o agrupas.
  *Ej:* "planta", "organismo", "proceso", "centro de costo" son dimensiones del mismo incidente.

- **Roll-up (consolidar hacia arriba).** Sumar/agregar subiendo por una jerarquía.
  *Ej:* "horas de caída del mes" por **planta** (roll-up por la lente planta) vs por **organismo**.

- **Drill-down (bajar al detalle).** Lo inverso del roll-up: del total al dato fino.
  *Ej:* del "% uptime de Santa Fe" → bajar a "qué incidentes de qué host lo causaron".

- **Jerarquía irregular / desbalanceada (ragged / unbalanced hierarchy).** Las ramas tienen
  **distinta profundidad** o se saltan niveles.
  *Ej:* en Eiser, **Santa Fe tiene 2 hosts y Laja 3** (desbalanceada); la **periferia** es casi
  hoja mientras las plantas tienen hosts debajo (irregular). Es normalísimo y la industria lo
  maneja sin drama.

- **Ruta materializada (materialized path).** Guardar en cada nodo su ruta completa de ancestros
  (`"/idA/idB/idC/"`) para encontrar descendientes con un simple "empieza-con".
  *Ej:* es justo lo que usa `OrgNode.path` en WatchLog hoy; por eso el ABAC por nodo y la herencia
  de calendarios funcionan rápido y **no chocan entre estructuras** (los ids son únicos).

- **Tabla puente (bridge table).** Una tabla que conecta cada nodo con **todos** sus
  subordinados a cualquier nivel, para hacer roll-ups limpios sobre jerarquías irregulares.
  *Ej:* si mañana necesitas reportes que sumen por ramas de profundidad variable, esta es la
  técnica estándar (en vez de hacer joins frágiles nivel por nivel).

- **Aplanado (flattening).** Copiar los datos de los ancestros en cada fila para reportar fácil
  ("nivel1, nivel2, nivel3" como columnas).
  *Ej:* una vista de reporte donde cada incidente ya trae `planta`, `sitio`, `host` en columnas.

- **Organización matricial (matrix organization).** Pertenecer a **varias** jerarquías paralelas
  a la vez, cada una con un propósito.
  *Ej (Workday):* una persona reporta a su jefe (línea sólida) y a la vez está en un proyecto con
  otro líder (línea punteada).

- **Red / múltiples padres (network hierarchy).** Un nodo con **más de un padre**.
  *Ej (Maximo network systems):* una bomba que sirve a dos áreas y "cuelga" de ambas.

- **ABAC / alcance (scope).** Autorización por **atributo de dato**: a qué **nodos** puede
  acceder un usuario. (Ya lo usas: `Scope` + `includeDescendants`.)
  *Ej:* el analista de Santa Fe solo ve el subárbol de `SF`.

---

## 4. Cómo lo hace cada sistema (resumen accionable)

| Sistema | Patrón 1 (aislamiento) | Patrón 2 (alternativas) | Lección |
|---|---|---|---|
| **SAP** | *company code / controlling area* | **standard hierarchy** (contiene todo) + **cost center groups** (muchos, parciales) | El estándar es obligatorio y completo; las alternativas son libres y para reporte/autorización |
| **IBM Maximo** | (instancias/sites) | **Systems**: una ubicación en varias jerarquías; *network* permite varios padres | Activo = 1 jerarquía; Ubicación = varias |
| **Workday** | tenant | **supervisory** (1, maestra) + **cost center / region / matrix** (paralelas) | El mismo trabajador en varias orgs, cada una con un fin |
| **ServiceNow** | **Domain Separation** (MSP, aislamiento total) | (campos/grupos lógicos para lo liviano) | Aislamiento solo si lo necesitas; es irreversible y pesado |
| **Data warehouse** | (esquemas/tenants) | **alternate / ragged hierarchies**, *roll-ups*, *bridge tables* | Una fuente de verdad, múltiples roll-ups; nunca duplicar |

---

## 5. Dónde está hoy Lyra WatchLog (honesto)

- **Lo construido = Patrón 1 (aislamiento por estructura).** Es el patrón correcto para
  **"modelar varios clientes/negocios en una instalación de dev"** (Eiser + otros).
- **Está a medias:** hoy la "estructura activa" filtra la **configuración** (árbol, niveles,
  calendarios) y los **selectores de nodo** (ya arreglados). **NO** filtra aún los **listados
  operacionales** (grillas de bitácoras, incidencias, dashboards, rondas, handovers): con otra
  estructura activa **se siguen viendo registros de otra**. En lenguaje ServiceNow: *el dominio
  todavía no está "enforced" en todas las consultas*. Completarlo **no es sobre-ingeniería**: es
  cerrar el patrón (el aislamiento o es total, o no es aislamiento).
- **No existe el Patrón 2** (jerarquías alternativas). Y el caso que lo pediría es el **informe
  mensual de Eiser** (RN-04: un incidente compartido en 3 informes). Hasta que ese reporte se
  construya, el Patrón 2 sería **especulativo**.

---

## 6. Árbol de decisión (úsalo para decidir)

```
¿Lo que quiero separar comparte la MISMA operación/datos?
│
├── NO  → son CLIENTES / NEGOCIOS distintos
│        → PATRÓN 1 (aislamiento) — ya lo tienes.
│        → ¿habrá DATOS REALES (bitácoras/incidencias) en ≥2 estructuras?
│             ├── SÍ  → COMPLETAR el aislamiento (filtrar listados por estructura activa). Acotado.
│             └── NO  → son esqueletos de prueba → DÉJALO como está (el leak casi no molesta).
│
└── SÍ  → es la MISMA operación vista de varias formas (planta/organismo/proceso/costo)
         → PATRÓN 2 (jerarquías alternativas).
         → ¿tengo YA un reporte/navegación concreta que lo exija (ej. informe Eiser)?
              ├── SÍ  → diséñalo bien con 2–3 lentes reales (no antes).
              └── NO  → NO lo construyas todavía (sería sobre-ingeniería).
```

> **Nota clave:** casi seguro necesitarás **los dos** con el tiempo, pero para **cosas
> distintas**: aislamiento para multi-cliente, alternativas para reportería dentro de un
> cliente. SAP/Maximo/Workday corren ambos a la vez. No son competidores.

---

## 7. Reglas anti-sobre-ingeniería (respaldadas por la industria)

1. **No actives aislamiento "por si acaso".** Es casi irreversible y agrega complejidad
   permanente (ServiceNow). Úsalo solo para clientes/negocios realmente separados.
2. **No crees jerarquías alternativas sin una pregunta de reporte concreta.** En SAP/Maximo
   existen *porque la reportería las exigió*, no preventivamente.
3. **Una sola fuente de verdad.** Nunca dupliques el dato para "verlo de otra forma": eso se
   resuelve con agrupaciones/roll-ups encima, no con copias.
4. **El aislamiento es todo-o-nada.** Si lo usas para separar clientes, debe enforcearse en
   **todas** las consultas (config, selectores **y** listados). A medias = falsa sensación de
   seguridad.

---

## 8. Mi recomendación (resumen)

- **Quédate con el Patrón 1 (ya está).** Es lo correcto para tu objetivo de dev.
- **Completa el aislamiento** (filtrar listados por estructura activa) **solo si** vas a tener
  **datos reales en ≥2 estructuras**. Es trabajo acotado.
- **Congela el Patrón 2** (jerarquías alternativas) hasta que el **informe de Eiser** (u otro
  reporte real) lo pida; ahí lo diseñamos con 2–3 lentes concretas.

---

## Fuentes

- SAP — Standard vs Cost Center Group:
  https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/b3438d89db5040508a3873ad6c6e55bc/7776f04d698745869171aae5c57438d8.html
- SAP — Flexible hierarchies:
  https://community.sap.com/t5/enterprise-resource-planning-blogs-by-sap/using-flexible-hierarchies-instead-of-standard-hierarchies-for-cost-and/ba-p/13565975
- Workday — Organization management (datasheet):
  https://www.workday.com/content/dam/web/en-us/documents/datasheets/organization-management-in-workday-datasheet-en-us.pdf
- ServiceNow Domain Separation — Kanini: https://kanini.com/blog/servicenow-domain-separation/
- ServiceNow Domain Separation — Metron Labs:
  https://hub.metronlabs.com/what-is-servicenow-domain-separation-and-when-should-you-use-it/
- IBM Maximo — Systems: https://www.ibm.com/docs/en/maximo-eam-saas?topic=locations-systems
- Maximo — Location systems: https://maximosecrets.com/2022/07/01/location-types-and-location-systems-2/
- Data warehouse — Ragged hierarchies:
  https://bigbear.ai/blog/data-warehouse-design-techniques-ragged-hierarchical-dimensions/

---

# Anexo A — Plan Enterprise (L1→L4) con alcance, esfuerzo e INVENTARIO COMPLETO

> Construido sobre una **auditoría del código** (2026-06-23), no de memoria, para garantizar
> que NADA de lo ya construido queda afuera. Dos dimensiones de aislamiento que se combinan en AND:
> **(1) ABAC por nodo** (`ScopeService.getAccessibleNodeIds`, por usuario) y **(2) filtro por
> estructura activa** (el workspace del selector).

## L1 — Aislamiento COMPLETO (Enterprise base) · esfuerzo ~3–5 días

### L1a — Cerrar fugas REALES de ABAC por nodo (URGENTE: afectan a usuarios acotados HOY)
- 🔴 **`equipment.service.search()`** — búsqueda GLOBAL **sin ABAC**: un usuario acotado ve
  equipos de otras estructuras. (`equipment.service.ts` ~106).
- 🟠 **`equipment.service.listByNode()`** — no valida que el nodo sea accesible (`~91`).
- Barrer cualquier otro endpoint de "búsqueda/options" global que no pase por `ScopeService`.

### L1b — Filtro por ESTRUCTURA ACTIVA en TODOS los listados operacionales
Patrón: backend acepta `structureId` y lo intersecta con los nodos accesibles; frontend pasa
`useActiveStructureId()` en queryKey + query (igual que ya hacen calendarios/estructura).

**Backend (services/endpoints a tocar):**
- `incidents`: `list`, `stats`, `openSlaBreachedCount`, `getDetail` (assert), dashboard `build`.
- `incident-actions` / `incident-investigation` / `incident-reports`: heredan del incidente padre
  (assert estructura del incidente).
- `log-entries`: `list`, `stats`, **`exportCsv`** (export masivo), `getDetail`, `create` (assert).
- `exceptions`: `list`, `getDetail`, `summaryForEntry`.
- `schedules`: `list`, `listOccurrences`, `listMyRounds`.
- `shift-handover`: `list`, `compile`, **`exportActa`** (PDF).
- `operational-periods`: vía log-entries.

**Frontend (pantallas a cablear con `activeStructureId`):**
- `incidents/IncidentsPage`, `incidents/IncidentDashboardPage`.
- `logbook/LogbookPage` (grilla `useLogbookList`).
- `exceptions/ExceptionsPage`.
- `shift-handover/ShiftHandoverPage` (lista `useHandovers`).
- `schedules/MyRoundsPage`, `schedules/SchedulesPage` (occurrences).
- `notifications/*` (inbox/outbox): **DECIDIR** — hoy es por ownership; evaluar si los eventos
  llevan contexto de nodo y deben acotarse (probable: dejar inbox por ownership; outbox es admin).

**Hardening (lectura por id + exports):** en `getDetail`/exports, validar que la estructura del
nodo del registro coincide con la activa (o que el nodo es accesible) → 403/404 si no.

### ⛔ NO TOCAR — catálogos COMPARTIDOS por decisión (el audit los sobre-marcó)
Filtrarlos por estructura **rompería** el diseño "catálogos compartidos":
- `templates` (list/detail), `workflows`, `reference-data`, `roles`, `users`, `settings`,
  `audit` (log global de admin), `saved-views` (ownership).
- Ya correctos (filtran por estructura porque DEBEN): `operational-calendar`, `fiscal-calendar`,
  `structure` (árbol/niveles/estructuras).
- Selectores ya correctos (usan `useAccessibleOrgTree`): `CreateIncidentModal`, `LogbookPage`,
  `ShiftHandoverPage`. Los de administración siguen con `useOrgTree` (correcto).

### Verificación (lo que garantiza "no dejar nada afuera")
Smoke que, con un usuario **acotado a la estructura A**, recorre **CADA** listado operacional
(incidencias, dashboard, bitácoras, excepciones, handover, rondas, mis-rondas, equipos/search) y
confirma **0 registros de la estructura B**; y un admin **sin scope** cambiando de estructura
activa ve **solo** la activa. Un solo smoke que barre todo = prueba de cobertura.

## L2 — Gobierno (Enterprise management) · esfuerzo medio
- **Rol acotado a nodo** (modelo `Scope.roleId` YA existe; exponer UI/API). Ver
  `role-node-scope-requirement`. Permite "Rol Analista-TI → estructura TI" una vez.
- **Administración delegada por estructura**: permisos para administrar SOLO la propia estructura
  (el líder de TI no toca Industrial). Patrón ServiceNow domain-separation.
- **Ciclo de vida de estructura**: activar / archivar / reordenar desde la UI.

## L3 — Premium (experiencia) · esfuerzo medio
- **Contexto inconfundible**: ícono + color de acento por estructura (paleta Lyra) + badge "estás
  en: TI" siempre visible.
- **Vista ejecutiva cross-estructura**: rol gerencial que ve KPIs consolidados de todas, mientras
  los operadores siguen acotados.
- Switcher pulido + asistente "crear nueva área" (niveles + árbol base).

## L4 — Cuando el negocio lo pida
- **Jerarquías alternativas** (Patrón 2) para reportería (ej. informe Eiser RN-04).
- **SSO/SCIM** con mapeo grupo→estructura.

> **Orden recomendado:** L1 (convierte demo→enterprise, sin fugas) → L2 (lo hace manejable por
> departamentos) → L3 (diferenciador premium) → L4 (a demanda). NO adelantar L4.

---

# Anexo B — Prompt para la próxima sesión (L1)

```
OBJETIVO (una sola cosa): completar el AISLAMIENTO por estructura organizacional (Nivel L1 del
plan en docs/NOTA_estructuras_y_jerarquias.md, Anexo A) para que la plataforma sea enterprise:
ningún usuario/estructura vea datos de otra, en NINGUNA pantalla. Caso guía: una empresa con
departamentos Industrial / TI / Logística, cada uno su estructura, sin fugas entre ellos.

ARRANQUE (rutina del proyecto):
1. Lee CLAUDE.md y docs/: PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, BACKLOG.
2. Lee memorias: multi-org-structure-requirement, org-views-vs-isolation, role-node-scope-requirement.
3. Lee docs/NOTA_estructuras_y_jerarquias.md (Anexo A = este plan e inventario).
4. Confirma en 2 líneas el plan antes de codear.

REGLA INNEGOCIABLE — COBERTURA TOTAL (esto es lo que el dueño exige):
RE-AUDITA el código tú mismo; NO confíes ciegamente en el inventario del Anexo A. Enumera CADA
endpoint/servicio que lista/agrega/exporta datos operacionales (apps/watchlog-api/src) y CADA
grilla/pantalla operacional (apps/watchlog-web/src). Entrega la lista y marca, por cada uno,
estado antes/después. Que NO quede ningún módulo sin revisar (deja constancia incluso de los que
ya están correctos).

ALCANCE L1:
- L1a (URGENTE, fugas reales de ABAC por nodo hoy): equipment.search() NO aplica ScopeService;
  equipment.listByNode() no valida nodo accesible. Cerrarlos.
- L1b (filtro por estructura activa en listados operacionales): patrón backend acepta structureId
  ∩ nodos accesibles; frontend pasa useActiveStructureId() en queryKey + query (igual a
  operational-calendar). Aplicar a: incidents (list/stats/dashboard/getDetail), log-entries
  (list/stats/exportCsv/getDetail/create), exceptions, schedules (list/occurrences/my-rounds),
  shift-handover (list/compile/exportActa), incident actions/investigation/reports (vía incidente).
- Hardening by-id y EXPORTS (CSV bitácoras, PDF acta): mismo filtro.

NO TOCAR (catálogos COMPARTIDOS por decisión — filtrarlos rompe el diseño): templates, workflows,
reference-data, roles, users, settings, audit, saved-views. Decidir explícitamente notifications
(inbox = ownership; ¿outbox/eventos por nodo?). Ya correctos: operational/fiscal calendar, structure.

DECISIONES A RESOLVER EN EL PLAN (con recomendación):
- ¿Cómo conoce el backend la "estructura activa"? (querystring structureId del front, como
  calendarios) y cómo se combina con el ABAC por nodo (AND).
- ¿Usuario acotado con estructura activa "ajena" ⇒ lista vacía? (sí, por intersección).
- ¿by-id de otra estructura ⇒ 403 o 404?

CIERRE (rituales): rama feat/aislamiento-estructura; tipado estricto; pnpm typecheck && lint &&
build verdes; SMOKE que con usuario acotado a estructura A barre TODOS los listados y confirma 0
registros de B (+ admin cambiando estructura activa); actualiza PROGRESS/BACKLOG/DECISIONS (+
USER_GUIDE si aplica); registra la decisión del patrón structureId en DECISIONS; commit + push.
NO hacer L2/L3/L4 en esta sesión.
```

