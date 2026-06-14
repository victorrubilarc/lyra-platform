# Registro de decisiones — Lyra WatchLog

Formato: fecha · decisión · motivo. Las más recientes arriba.

---

### 2026-06-13 · Workflow SLA + atrasos — ✅ IMPLEMENTADO (forks resueltos)

Implementación del plan aprobado abajo. **SLA por ESTADO** (`WorkflowState.maxStayMinutes` nullable, minutos canónicos,
migración aditiva). 4 forks resueltos con el dueño (recomendación aceptada en los 4):

1. **Unidad del SLA = Min / Horas / Días** (UI), almacenado en **minutos canónicos** (espejo de la ventana de edición 2.7.2,
   con "Días" añadido porque los SLA operacionales suelen medirse en días). `slaDurationField` propio.
2. **Tiempo CALENDARIO** en el MVP (horas hábiles = futuro, requiere el calendario operacional/turnos → BACKLOG §3).
3. **Estampar `LogEntry.currentStateSince`** (columna aditiva, seteada al crear = `recordedAt` y en cada transición =
   `occurredAt`): evita la subconsulta `MAX(transición)` y es semántica de primera clase. El filtro/KPI **"Retrasadas"** se
   computa con un **JOIN raw** `LogEntry→WorkflowState` (`currentStateSince + maxStayMinutes < now()`), intersectado con el
   `where`+ABAC del listado (mismo patrón que la búsqueda por contenido 2.8.1a ⇒ cero fuga). A escala = endurecimiento Fase 7.
4. **Dos niveles de alerta** (estándar de monitoreo at-risk vs breach): estado actual **`at-risk` (ámbar)** al alcanzar el
   **80%** del SLA (`SLA_AT_RISK_RATIO`), **`breached` (rojo)** al superarlo; tramos pasados sobre su SLA = ámbar. El **filtro
   `delayedOnly`/KPI** cuenta solo **breached** (vencido, no en riesgo) para mantenerlo crítico.
5. **Superficie completa de "Retrasadas"** (espejo de `exceptionsOnly`): flag `delayedOnly`, KPI en `stats`, bucket en
   `/facets`, indicador "Atraso" por fila + columna, y **vista de SISTEMA** "Retrasadas".
6. **Responsable en el VISOR** (sin migración): la versión de flujo CONGELADA expuesta en el detalle resuelve `roleNames` por
   transición (backend); el `WorkflowDiagram` usa `roleNameOf` (builder) o cae a `tr.roleNames` (visor).

Helper puro **`evaluateSla`** en `@lyra/contracts` (workflows) = fuente única back↔front del veredicto de SLA; el cliente
formatea duraciones con `lib/format` (regional). El SLA viaja en la versión congelada ⇒ los registros históricos conservan su SLA.

---

### 2026-06-13 · Diagrama de flujo premium + plan SLA/atrasos — ✅ (visual) / 📋 (SLA aprobado, pendiente)

**Hecho (visual, sin modelo):** `WorkflowDiagram` reusable en visor/grilla (modo REGISTRO) y mantenedor de flujos (modo
DEFINICIÓN). Layout HORIZONTAL izq→der (estándar BPMN/Jira) con **puertos distribuidos** (anclajes repartidos por el borde
según el nodo opuesto) y **aristas de retorno ORTOGONALES por canal inferior** (no cruzan el flujo; estilo Sugiyama). Color
por estado (paleta por defecto si el estado no tiene color). "Dónde estás ahora" (glow pulsante + banner), "siguiente paso"
(aristas/nodos animados), **tiempos reales del registro** (duración por tramo + en estado actual). Tooltips premium. Modal
expandible (tamaño `xl` en `@lyra/ui`). **Responsable por elemento** (rol que ejecuta cada transición; el del estado = unión de
sus salientes) en nodo (definición) + tooltips; el builder pasa el resolver de nombres de rol (sin migración).

**Aprobado por el dueño (a implementar en sesión propia "Workflow SLA + atrasos"):**
- **SLA por ESTADO** (decisión del dueño): `WorkflowState.maxStayMinutes` nullable (migración aditiva) + campo en el
  `WorkflowBuilder` (minutos/horas, espejo de la ventana de edición) + contrato. Tiempo CALENDARIO en el MVP (horas hábiles =
  futuro, requiere el calendario operacional).
- **Diagrama (registro):** si el estado actual excede su SLA ⇒ **alerta roja** en el nodo (anillo pulsante + "Atrasado hace X ·
  SLA Y"); tramos pasados sobre SLA ⇒ badge ámbar.
- **Grilla:** indicador/columna "Atraso" ("⚠ En *Estado* hace 3 d · SLA 1 d") + filtro/faceta/KPI "Retrasadas"
  (`delayedOnly`). Backend computa: `status=DRAFT AND (now − inicio_en_estado_actual) > SLA_del_estado_actual` (inicio = última
  transición o `recordedAt`; SLA = estado actual de la versión congelada). A escala = endurecimiento Fase 7.
- **Responsable en el VISOR (registro):** exponer `roleNames` en la transición de la versión congelada (resolución backend, sin
  migración) para mostrar el responsable también fuera del builder.

---

### 2026-06-13 · Fase 2.8.1c — Peek lateral + facetas con conteo + review-by-exception + "Mi turno" — ✅ IMPLEMENTADO

**Cierre (cierra TODA la 2.8.1):** `GET /log-entries/facets` (5 dimensiones, conteos de hermanos, reusa `buildWhere`+ABAC),
`GET /log-entries/my-shift` (resuelve turno/día + autor vía `ShiftResolver`), `exceptionsOnly` en la query. Web: `FacetsPanel`
(panel lateral toggleable, clic = toggle de filtro → URL/SavedView), `PeekDrawer` (vistazo INSTANTÁNEO desde la fila, sin
round-trip; "Abrir ficha completa"; el clic en la fila abre el peek), realce por excepción en la fila (`rowClassName` en
`@lyra/ui` Table), vista de sistema "Mi turno", filtro de **equipo** en UI (cierra el pendiente 2.6.1). **Refinamiento sobre
el fork 2:** el peek se arma desde la fila (más rápido que reusar `getDetail`); el detalle completo se abre aparte. Extraído
`formatSummaryValue` a `logbook-cells` (compartido) y corregida la fecha de columnas a `lib/format` (regional, dejó de
hardcodear `es-CL`). Sin permisos nuevos (59). Tests contracts 163 · API 227. Smoke `scripts/smoke-facets-peek.py` **11/11**
(facetas, hermanos, exceptionsOnly acota, my-shift, ABAC de los 3 usuarios). **Pendiente: smoke VISUAL del dueño.**

---

### 2026-06-13 · Fase 2.8.1c — Peek lateral + facetas con conteo + review-by-exception + "Mi turno" — 📋 FORKS RESUELTOS

Tercer y último sub-slice de 2.8.1 (grilla orientada a contenido). El dueño aprobó avanzar con mi criterio, estándar
enterprise/premium. **5 forks resueltos:**

1. **Facetas = endpoint nuevo `GET /log-entries/facets`** (no extender `/stats`: responsabilidad distinta), server-side,
   reusando `buildWhere(userId, query)` (mismo where + ABAC ⇒ cero fuga). **Conteos de HERMANOS** (Kibana/Splunk): cada
   faceta se computa con el where SIN su propio criterio de dimensión ⇒ elegir un valor no anula las demás opciones.
   Dimensiones: `status`, `stateKey` (estado del flujo — el `<select>` deja de poblarse solo con el lote cargado),
   `templateId`, `equipmentId`, `band` (WARN/CRIT). COUNT exacto + tope de buckets; rollups/aproximado = Fase 7 (BACKLOG §3).
2. **Peek lateral = Drawer que reusa `getDetail`** (mismo endpoint del visor, misma autorización), vista REDUCIDA
   (cabecera + valores readOnly + indicadores) + "Abrir ficha completa" → `/bitacoras/:id`. **El clic en la fila abre el
   PEEK** (antes navegaba al visor); el botón "Editar" se mantiene. Hojear rápido sin salir de la lista (ServiceNow).
3. **"Mi turno" = backend resuelve los filtros** (`ShiftResolver.resolve(now, null)` con el calendario por defecto, porque
   el usuario abarca varios nodos): `createdById = yo` + `operationalDate` + `shiftCode` vigentes. Degradación: sin
   calendario ⇒ `createdById = yo` + `operationalDate = hoy` (sin shift). El cliente pide los filtros y los aplica (no
   acopla la grilla al motor). Cierra el diferido de 2.8.1b.
4. **Facetas ↔ URL/SavedView:** clic en un valor de faceta hace toggle del filtro correspondiente, reflejado en la URL ⇒
   capturable en una `SavedView`. **MVP single-select por faceta** (coherente con los filtros actuales single); multi-select
   por faceta = aditivo posterior (requiere volver multi esos filtros, como se hizo con nodos).
5. **Review-by-exception en capas:** (a) **realce visual por FILA** (tinte/borde sutil por la peor banda — solo semántica,
   regla de marca) reforzando los indicadores existentes; (b) **flag `exceptionsOnly`** opt-in en la query = OR de lo
   accionable (umbral WARN/CRIT **OR** firma pendiente; ambos queryables). "Fuera de ventana/período" NO es columna
   filtrable directa (se computa) ⇒ queda fuera del flag (se ve en el peek/visor).

**Sin permisos nuevos** (todo bajo `logentry:view` + ABAC). Pendiente: implementación + smoke.

---

### 2026-06-13 · Fase 2.8.1b — Vistas guardadas + gestor de columnas + multi-sort — ✅ IMPLEMENTADO

**Cierre:** entregado todo lo confirmado. `SavedView` (entidad genérica, migración `20260613130000`, índice único
parcial), `SavedViewsModule` CRUD ownership-gated, multi-sort keyset lexicográfico (cursor multi-columna, no pierde
filas en empates), `Table` column-aware en `@lyra/ui` (orden/ocultar/anclar sticky/anchos/densidad + badge de prioridad),
gestor de columnas (`ColumnsDrawer`), selector de vistas (`ViewBar`: sistema en código + personales + dirty + Guardar
como/Actualizar/Predeterminada/Eliminar), última vista en localStorage, y **columnas de VALOR individuales por plantilla**
(con 1 plantilla filtrada). **Recortes entregados como tales:** resize de columnas ✅ (grip de arrastre) / **autosize
diferido**; **"Mi turno" diferida a 2.8.1c** (requiere `ShiftResolver`); **orden global por columnas de valor diferido a
Fase 7** (rompería keyset). Sin permisos nuevos (catálogo 59). Tests contracts 163 · API 224. Smoke `scripts/smoke-saved-views.py`
**24/24** (CRUD, default único, ownership 404, validación, multi-sort + cursor reanuda/rechaza orden incongruente).
**Pendiente: smoke VISUAL del dueño.**

---

### 2026-06-13 · Fase 2.8.1b — Vistas guardadas + gestor de columnas + multi-sort — 📋 FORKS RESUELTOS

Segundo sub-slice del plan 2.8.1: **el usuario dispone**. Tras 2.8.1a (la plantilla *ofrece* el pool `gridFieldKeys`),
aquí el usuario elige qué ver, en qué orden, lo guarda y lo reusa. **5 forks resueltos con el dueño (confirmados):**

1. **Modelo de `SavedView` = entidad GENÉRICA de PLATAFORMA** con `module` discriminador (`"LOGBOOK"` hoy; reusable por
   Incidencias Fase 4) + **`config jsonb`** validado por Zod (`{filters, search, sort[], columns{order,hidden[],pinned{left,right},
   widths}, density}`) — NO columnas por atributo (universo abierto, mar de NULLs; misma razón que `TemplateField.config`).
   **`isDefault` único por `(userId, module)` vía índice único PARCIAL** `WHERE "isDefault"` (Postgres; migración a mano).
   **Alcance: solo personal ahora**; compartir por rol DIFERIDO pero aditivo (slots `scope`/`sharedRoleId` a futuro, sin
   romper). **Sin permisos nuevos (catálogo sigue en 59):** una vista es DATO PERSONAL del usuario (como favoritos/ui-store,
   pero server-side para cross-device); el backend autoriza por **ownership** (`userId === session.user.id`) + acceso al módulo
   (`logentry:view`, ya existe); el front solo refleja. No inflar RBAC con una preferencia de UI. Refs: SAP Fiori *variants*
   (personal+default), ServiceNow *personal list views*.

2. **Vistas de SISTEMA en CÓDIGO, no BD** (no migrables). Constantes que producen un grid-state. Selector con grupo "Sistema"
   (solo lectura; "Guardar como…" las bifurca a personal) + grupo "Mis vistas". Entrego las 3 expresables con filtros
   existentes: **"Firmas pendientes"** (`pendingSignature`), **"Excepciones"** (`thresholdBand=ANY`), **"Últimas 24h"** (preset
   effective 1d). **"Mi turno" DIFERIDA a 2.8.1c** (necesita resolver turno/persona actual vía `ShiftResolver` — es motor, no
   filtro; no se entrega a medias).

3. **Gestor de columnas = separar render de configuración.** El `Table` de `@lyra/ui` evoluciona a **column-aware** (props
   controladas: orden, ocultas, ancladas izq/der, anchos; emite cambios) = reusable por Incidencias. La **UI de gestión** vive
   en panel/Drawer aparte ("Columnas": checklist + drag reorder + toggles de anclar) que alimenta esas props. Reorder = drag
   nativo HTML5 (sin dep). Pin = sticky. **Anchos manuales + persistencia ahora; resize-drag/autosize = stretch goal** (si el
   contexto da; si no, 2.8.1c). **Columnas de VALOR por plantilla (nivel 2/3) solo con 1 plantilla filtrada** (claves homogéneas
   → ofrece sus `gridFieldKeys` como columnas); con 0 o ≥2 plantillas cae a la línea "Resumen" (= Fiori smart columns,
   coherente con 2.8.1a).

4. **"Última vista" efímera en localStorage** (id de la última vista aplicada / estado ad-hoc por usuario-dispositivo); vistas
   nombradas en BD. Espejo de `ui-store`/`workspace-store`. **Multi-sort — objeción técnica (cito *Use The Index, Luke*):** la
   paginación keyset exige tupla INDEXADA; hoy solo `recordedAt/effectiveAt/entryNumber` tienen índice keyset `(col,id)`.
   ⇒ **multi-sort server-side LIMITADO a esas 3 columnas indexadas** (lista ordenada, máx 2–3 claves). **Orden por columnas de
   VALOR = solo client-side sobre el lote cargado** (≤100, etiquetado "orden del lote visible"), NUNCA global. **Orden global
   por valores arbitrarios = Fase 7** (columnas de orden denormalizadas / OpenSearch; ya en BACKLOG §3, no se improvisa).

5. **Deep-link/URL ↔ SavedView:** la URL sigue siendo el estado canónico en runtime; la vista es un snapshot nombrado. Aplicar
   una vista ESCRIBE su config en la URL/estado y marca "vista activa = X" (efímero); deep-link sin vista = estado desde params
   (como hoy). Tras aplicar, tocar filtros marca la vista **"modificada" (dirty)** → "Actualizar vista" / "Guardar como nueva"
   (patrón dirty de Fiori variants). **Separación (ServiceNow/Fiori):** la URL lleva *qué datos* (filtros+búsqueda+sort) =
   compartible; **columnas+densidad** (*cómo lo veo yo*) viven en la vista/localStorage, **NO en la URL** (verbosa, impersonal).

**Recortes declarados** (para que el slice sea cerrable en una sesión): resize/autosize de columnas = stretch; "Mi turno" y
orden global por valores = slices posteriores. Si el contexto se llena, consolido y se parte. Ver BACKLOG §2.

---

### 2026-06-13 · Afinamiento UX de la grilla de Bitácoras (QA del dueño) — ✅ IMPLEMENTADO

Tras el smoke visual de 2.8.1a el dueño pidió un overhaul de UX de la grilla. Es **frontend** (salvo un cambio chico de
backend para multi-nodo); las **Vistas Guardadas** (`SavedView`, backend nuevo) quedan para **2.8.1b** (su propia sesión).

1. **Defecto de 2.8.1a — párrafos del Resumen desbordados.** Un valor TEXTAREA largo se renderizaba `nowrap` sin tope y
   rompía la fila. Fix: el Resumen apila "etiqueta: valor" y **trunca cada valor con ellipsis** (texto completo en el `title`).
   Además se **muestran todos los candidatos con valor** (no solo 3; el pool ya está acotado a 6).
2. **Filtros: barra PRIMARIA + "Más filtros" en `Drawer`** (acordado). 4 filtros de mayor uso visibles (Buscar, Nodo,
   Plantilla, Estado) + presets; el resto en un panel lateral con **badge** del nº de filtros activos. Patrón SAP Fiori.
3. **Filtro de nodo MULTI-NODO real** (acordado, toca backend): el listado acepta **`orgNodeIds`** (CSV→arreglo; `orgNodeId`
   legacy se mantiene). `buildWhere`: con `includeDescendants` = **OR de prefijos de ruta** por nodo; sin él `orgNodeId IN`.
   El **ABAC sigue en AND aparte** (filtrar por un nodo fuera de alcance no amplía lo visible). UI: `MultiSelect` de `@lyra/ui`.
4. **Paginador DISCRETO numerado, ARRIBA y ABAJO** (pedido). Keyset/cursor para escala: el servidor trae lotes de **100** y la
   grilla **pagina ese lote en el cliente** (rango "X–Y de N", selector 10/25/50, **inicio « ‹ números › » fin**); "siguiente"
   en la última página trae el lote siguiente del servidor si lo hay. No se hizo paginación numerada server-side (incompatible
   con keyset; offset+count se evaluará si el volumen lo exige).
5. **Pulidos pedidos:** botón **"Actualizar"** (refetch lista+KPIs, ícono girando); **KPI cards** centradas con **contorno
   premium** (borde + realce + glow del acento en hover, sin sombras negras); **lista enmarcada** en card contenida; `<select>`
   "por pág." discreto (sin outline blanco nativo, flecha propia, foco con acento).

Verde: typecheck/lint (0 err) · API **217** (+1 test multi-nodo) · contracts 154 · build web · **smoke 25/25**
(`scripts/smoke-grid-content.py` + filtro multi-nodo). **Pendiente: re-confirmación VISUAL del dueño.**

---

### 2026-06-12 · Fase 2.8.1a — Bitácoras: grilla orientada a contenido (MVP) — ✅ IMPLEMENTADO

Primer sub-slice del plan 2.8.1 (ver entrada de plan más abajo). Resuelve la queja del dueño: la grilla es ciega
al contenido. Entrega: campos candidatos de resumen marcados en la plantilla + **línea Resumen** + columna **Equipo**
+ **búsqueda por contenido**. **6 forks resueltos con el dueño (4 vía recomendación aceptada, 3 por criterio técnico):**

1. **`showInGrid` vive en el CONTENEDOR mutable, NO en el campo versionado** (recomendación mía aceptada, corrige el
   plan que nombró `TemplateField.showInGrid`). `TemplateField` vive en `TemplateVersion` **inmutable (MMR Part 11)**:
   poner ahí el flag obligaría a clonar borrador + republicar una versión CONTROLADA solo por un *hint* de
   visualización ⇒ ensucia el historial GxP y fuerza re-aprobación por algo no sustantivo. Decisión: `Template.gridFieldKeys
   String[]` (lista ORDENADA de `key` estables — el mismo `key` que usa `LogEntryValue.fieldKey` en todo el sistema),
   guardado con **"Guardar configuración"** vía `PATCH /templates/:id` (espejo exacto de `equipmentMode`/`editWindow`):
   se aplica en vivo a todas las versiones/entradas SIN republicar (lo que el dueño pidió). Key huérfano (campo
   renombrado/eliminado) = inofensivo (se ignora; se poda al publicar). La parte "viva/reactiva" real (qué columnas ve
   CADA usuario) la cubre el USUARIO en 2.8.1b (SavedView); el nivel plantilla solo *ofrece* el pool ⇒ versionarlo no aporta.
2. **Tope del pool = 6 candidatos.** Pool ilimitado = columnas/valores ilimitados que batch-cargar + Resumen
   ininteligible. 6 cubre el default de 2–3 con holgura (Fiori smart columns son acotadas). Validado en contrato + backend.
3. **Default = LÍNEA "Resumen" compuesta**, NO columnas individuales. La grilla mezcla entradas de muchas plantillas;
   columnas por-campo solo tienen sentido con UNA plantilla filtrada (claves homogéneas) — como Fiori. Una celda
   "Resumen" por fila (`Temp 78 °C · Presión 9 bar`, primeros 3 candidatos de SU plantilla) funciona en lista
   heterogénea (cada fila se resume a sí misma). Columnas individuales = 2.8.1b (con gestor de columnas + SavedView).
4. **Búsqueda por contenido acotada a los candidatos `showInGrid`** ("lo que ves es lo que buscas"). `EXISTS` sobre
   `LogEntryValue` de los campos candidatos, `value::text ILIKE %q%`, **dentro del mismo `buildWhere`** (AND con ABAC,
   OR con el `q` actual folio/plantilla/nodo). Índice GIN trigram (`pg_trgm`) sobre `(value::text)` para mantenerla
   rápida on-prem. **Limitación honesta del MVP:** busca el valor ALMACENADO (texto/número/**code**); para SELECT de
   lista de referencia el `code` no matchea el label (búsqueda por label = deuda, requeriría denormalizar el label).
5. **Backend sin N+1** (criterio): extiende `enrich()` (batched por página) con 3 queries — `gridFieldKeys` de las
   plantillas distintas + `LogEntryValue` de `logEntryId ∈ página AND fieldKey ∈ unión(candidatos)` + meta de campo
   CONGELADA (`TemplateField` por `templateVersionId` distintos, para label/unidad/tipo/banda) + resolución batched
   code→label de listas de referencia. **Formato regional**: el backend manda valor ESTRUCTURADO + meta (no string
   pre-formateado); el CLIENTE formatea números/fechas con `lib/format.ts` (regla regional). Contrato:
   `summaryValues: { fieldKey, label, dataType, value, unit?, optionLabel?, thresholdBand }[]` en `LogEntryListItem`.
6. **Columna Equipo + ABAC** (criterio): `Equipment.tag` (único) + `name` ⇒ display **`TAG · Nombre`** (Maximo asset
   num + descripción); orden EAM **Folio · Plantilla · Nodo · Equipo · Resumen · Estado · …**. Los valores se
   batch-cargan SOLO para los `pageIds` ya filtrados por node+template ABAC en `buildWhere`; la búsqueda por contenido
   vive DENTRO del mismo `where` ⇒ cero fuga de contenido fuera de alcance (confirmado por smoke).

**Afinamiento QA del dueño (smoke visual, 2026-06-13) — 2 ajustes:** (a) **mostrar TODOS los candidatos con valor**, no
los primeros 3. El dueño marcó 6 campos y solo veía 3 (el `slice(0,3)` del default) ⇒ "no se reflejan". Como el pool ya
está acotado a 6, la línea Resumen muestra todos los marcados que tengan valor (la elección/orden por usuario sigue para
2.8.1b). (b) **búsqueda por contenido CASE-INSENSITIVE**: el `string_contains` de Prisma sobre JSON era sensible a
mayúsculas (`"Conforme"` no encontraba el code `conforme`). Reemplazado por un `$queryRaw` con **`ILIKE` sobre `value::text`**
(usa el índice GIN trigram), resuelto a un set de ids que se intersecta con el ABAC del `where` externo. Persiste la deuda
de buscar por **label** del SELECT (hoy matchea el code: `"No conforme"` no encuentra `no_conforme`).

---

### 2026-06-12 · Plan de Fase 2.8.1 — Bitácoras: grilla ORIENTADA A CONTENIDO + personalización — 📋 ACORDADO (no implementado)

El dueño detectó el problema raíz de `/bitacoras`: la grilla es **ciega al contenido**. Muestra metadatos (folio, plantilla,
nodo, estado, fechas, autor, indicadores) pero **ningún dato del negocio** que la bitácora capturó (temperatura, presión,
"operó normal", equipo) ⇒ es imposible *reconocer ni encontrar* un registro por su contenido. Analizado cómo lo resuelven los
sistemas líderes (SAP Fiori, j5/Hexagon Operations Logbook, IBM Maximo, ServiceNow, Splunk/Kibana, EBR/Körber PAS-X). **Patrón
común que a nosotros nos falta:** (1) un **descriptor/resumen legible** por registro, (2) **valores de negocio clave** como
columnas, (3) **búsqueda por contenido** + **facetas con conteo**, (4) **peek/expand** para ver detalle sin salir, (5)
**personalización = vistas guardadas + gestor de columnas**, (6) **review-by-exception**.

**Diseño acordado (mi mejor propuesta, aprobada por el dueño):**
- **Columnas en 3 niveles:** metadatos [hoy] · **valores de negocio/Resumen** [lo que falta] · **Equipo** [EAM, ya existe].
- **Descriptor — fork resuelto con el dueño:** la **PLANTILLA marca el *pool* de campos candidatos** (toggle por campo
  `showInGrid`, gobernanza viva, sin republicar) y **el USUARIO elige cuáles ver** (columnas individuales o una línea
  "Resumen" compuesta), con un default sensato (primeros 2–3). Lema: *"el diseñador ofrece, el usuario dispone"* (= SAP Fiori
  smart columns + variants). Preferencia explícita del dueño: marcar en la plantilla TODOS los candidatos, a gusto del usuario.
- **Personalización (absorbe 2.6.1):** entidad **`SavedView`** de PLATAFORMA (`module` discriminador, reusable por Incidencias
  Fase 4; config {filtros, búsqueda, orden, columnas{orden,ocultas,ancladas,anchos}, densidad}; una default por usuario+módulo;
  vistas de sistema EN CÓDIGO) + **gestor de columnas** (evoluciona el `Table` de `@lyra/ui`) + densidad + recordar última vista.
- **Buscar y encontrar:** búsqueda sobre VALORES de campo + **facetas con conteo** (estilo Splunk) + **vistazo (peek)** lateral
  reusando `getDetail` (estilo ServiceNow) + **resaltado por excepción** (estilo EBR/MES).
- **Entrega en 3 sub-slices** (sesión cerrable cada una): **2.8.1a** contenido reconocible (MVP: `showInGrid` + Resumen/valores
  + Equipo + búsqueda por contenido) → **2.8.1b** SavedView + gestor de columnas + multi-sort → **2.8.1c** peek + facetas +
  review-by-exception. La "Parte A" del #9 (acceso nodo↔grilla: mis nodos/recientes/favoritos) se intercala en a/b.
- **Adiciones de modelo (aditivas):** `TemplateField.showInGrid` (flag, gobernanza viva) + entidad `SavedView`. El backend ya
  guarda `LogEntryValue`; solo falta exponer los valores seleccionados en el listado de forma acotada y eficiente.
- **Arrancar por 2.8.1a** (es lo que tiene "atado" al dueño hoy; bajo riesgo, alto impacto). Ver BACKLOG §2.

---

### 2026-06-12 · Afinamiento UX del TemplateBuilder (vistas + guardado de gobernanza) — ✅ IMPLEMENTADO

Iteración de UX del dueño sobre el builder de plantillas (tras 2.8.0.2). Cuatro decisiones:

1. **El guardado de la CONFIGURACIÓN/gobernanza se separa del borrador, con su propio botón explícito (NO autosave).**
   El dueño observó que cambiar un ajuste (modo de equipo, ventana de edición) y volver atrás no guardaba, pero tampoco
   quería publicar. El builder mezclaba todo en "Guardar borrador" (que crea/clona una versión). **Decisión:** la
   gobernanza viva del contenedor (identidad, alcance de nodos, ventana de edición, modo de equipo) se guarda con
   **"Guardar configuración"** vía `PATCH /templates/:id` (`useUpdateTemplate`), **en vivo, sin crear borrador ni
   publicar**; la DEFINICIÓN (secciones/campos/flujo) sigue por "Guardar borrador"→"Publicar". Para que no se pisen, se
   **quitaron** del payload del borrador (`editStateToDraftRequest`) los campos de gobernanza (nodeAssignments,
   editWindow*, equipmentMode) y se creó `editStateToConfigRequest`. Descartado el autosave (el dueño lo rechazó): un
   botón explícito es más predecible para un ajuste. Solo en EDICIÓN (el PATCH exige un id; la creación es un modal aparte).
2. **El FLUJO se queda en Diseño, NO en Configuración** (honestidad técnica): el flujo es **definición versionada**
   (`PATCH` no lo acepta; cambiarlo exige publicar). Ponerlo bajo "Guardar configuración" mentiría sobre el "se aplica
   sin publicar".
3. **Layout en riel vertical premium** (2 secciones: **Configuración** [por defecto] · **Diseño**) en vez de tabs
   horizontales. Configuración tiene 2 sub-pestañas (**Identidad y gobernanza** | **Alcance y acceso**); Diseño absorbe la
   **Vista previa** como sub-pestaña (Editor | Vista previa). La barra del builder se hace **sticky** bajo el topbar
   global (offset `--wl-sticky-top`) para no perder las acciones al hacer scroll. Sin permisos nuevos.
4. **`ScopeTreePicker` + `Toast` (`@lyra/ui`) más prolijos** (componentes compartidos ⇒ mejoran también Seguridad y todos
   los avisos): el árbol deja de teñir la fila seleccionada (el check ya lo indica) y alinea el toggle "Incluye
   descendientes" a la derecha; el resumen de seleccionados pasa a panel con cabecera (cuenta + Limpiar) y chips debajo.
   El Toast gana barra de acento por variante + glow del color (no sombra negra) + badge del icono, para que no pase
   desapercibido. Verde: typecheck/lint (0 err)/build/test (API 216 · contracts 151). **Smoke VISUAL ✅** (dueño).

**Nota operativa (no es código):** la plantilla demo «Bitácora de Turno — Demo Completa» tenía su versión PUBLICADA (v5)
con `config = {}` en todos los campos por una republicación antigua (código previo a los arreglos). Se verificó con
round-trips (crear/editar/publicar) que el código ACTUAL conserva la config; se restauró el dato copiando la config de la
v2 (que la conserva) a la versión publicada. El seeder `scripts/demo-bitacora.py` es idempotente por nombre (no re-siembra).

---

### 2026-06-12 · Fase 2.8.0.2 — Modo de equipo por PLANTILLA (gobernanza, "opción B") — ✅ IMPLEMENTADO

Capa de **gobernanza** sobre la mecánica EAM de 2.8.0.1: el TIPO de registro (la plantilla) declara cómo se trata el equipo
y el backend lo **AUTORIZA**. Patrón **notification-type de SAP PM / WO-type de Maximo**: el tipo de registro decide si el
objeto de referencia es obligatorio (una mantención/inspección exige equipo; un turno/área lo deja opcional u oculto). **6
forks resueltos con el dueño** (recomendación primero, fundada):

1. **Dónde vive `equipmentMode` → en `Template` (contenedor MUTABLE), NO en `TemplateVersion`.** Es **gobernanza VIVA**:
   cambiarlo aplica de inmediato a entradas nuevas sin republicar la versión, espejo exacto de la ventana de edición 2.7.2 y
   del notification-type de SAP (master data configurable, no parte congelada del documento). No re-validamos históricos
   (el equipo ya quedó o no estampado), así que congelarlo no aportaría.
2. **Enum `NONE | OPTIONAL | SUGGESTED | REQUIRED`** (el dueño pidió incluir SUGGESTED). **OPTIONAL y SUGGESTED son
   idénticos en el BACKEND** (permisivos, sin enforcement); SUGGESTED solo cambia la UX (autoselecciona el equipo único,
   "recomendado", pero permite "(sin equipo)"). NONE oculta; REQUIRED obliga. Extensible de forma aditiva.
3. **Enforcement de REQUIRED en `create`/materialización** (no en submit/transición). `equipmentId` es un dato de creación
   (se estampa una vez, como `orgNodeId`; no se edita por sección ni después). En modo compose la materialización ES un
   create ⇒ el gate corre ahí. Hacerlo en submit dejaría borradores huérfanos sin equipo con dims/período ya estampados.
   La **"huella"** del faltante NO es un `blockedReason` de sección (corre antes de que existan secciones): vive en el modal
   de creación (el front fuerza la selección, gateado por el `equipmentMode` que `eligibleNodes` expone) + 400 del backend.
4. **Default de migración = OPTIONAL** (no NONE): preserva EXACTAMENTE el comportamiento contextual de 2.8.0.1 en plantillas
   ya publicadas (cero ruptura). NONE habría ocultado el equipo = regresión. Migración aditiva sin backfill destructivo.
5. **UI**: control "Equipo en la entrada" en el `TemplateBuilder` (junto al alcance de nodo / ventana de edición), gate
   `template:edit` (sin permiso nuevo, catálogo sigue en **59**). En el modal de creación: REQUIRED quita "(sin equipo)" y
   obliga (botón Continuar deshabilitado sin equipo; aviso si el nodo no tiene equipos activos); SUGGESTED empuja; NONE no
   muestra equipo (y `eligibleNodes` no consulta equipos).
6. **No re-validar al sellar** si un equipo REQUIRED se da de baja luego: el equipo se estampa al crear (existe+activo+nodo);
   el histórico queda **intacto** (igual que `shiftCode`/`periodKey`). "Bloquear sellado si el objeto de referencia se retiró"
   queda diferido (BACKLOG) por si un cliente lo exige.

**Implementación.** Contrato: `EQUIPMENT_MODES`/`equipmentModeSchema` + `equipmentMode` en `templateSchema`/list/detail y en
create/update/saveDraft (opcional) + en `templateEligibleNodesSchema`. Prisma: enum `EquipmentMode` + `Template.equipmentMode
@default(OPTIONAL)`, migración aditiva `20260612180000_add_template_equipment_mode`. Backend: `TemplatesService` persiste/mapea/
audita (before/after de gobernanza); `LogEntriesService.assertEquipmentForMode` (gate duro en `create`: REQUIRED sin equipo →
400, NONE con equipo → 400) + previewNew solo valida consistencia de NONE (REQUIRED no bloquea al componer); `eligibleNodes`
expone `equipmentMode` y omite equipos si NONE. Web: control en builder + lógica del modal en `NewEntryPage`. Verde:
typecheck/lint (0 err)/build · tests **contracts 151** (+2) · **API 216** (+3) · smoke en vivo **17/17**
(`smoke-template-equipment-mode.py`, crea plantilla+equipo, recorre los 4 modos, **crea+limpia por ID** vía psql cascade;
AuditLog inmutable conserva el rastro). Pendiente: smoke VISUAL. **NO probado en vivo con operador/supervisor/mantenedor** por
separado: el gate corre en `create` ANTES de los chequeos de rol ⇒ es independiente del rol (cubierto por unit tests).

---

### 2026-06-12 · Fase 2.8.0.1 — Equipo OPCIONAL al crear entrada (objeto de referencia EAM) — ✅ IMPLEMENTADO

Tras el selector de nodo (2.8.0), el dueño observó que un nodo puede tener equipos y pidió poder **tagear la bitácora a
una máquina concreta**. Se investigó el estándar industrial antes de decidir (respaldo en el chat): EAM/CMMS modelan un
**objeto de referencia de dos ejes** — **ubicación funcional** [nuestro nodo] + **activo/equipo** — donde SAP PM permite
equipo *o* ubicación (opcional según lo que se reporta) y al elegir el equipo **deriva la ubicación donde está instalado**;
Maximo lleva **ambos** en el registro. **ISO 14224** fundamenta el grano: la analítica de confiabilidad (RCM/RCA, modos de
falla por clase) requiere el dato a nivel de **equipo/ítem mantenible**, no solo de área — registrar el equipo es lo que
habilita la analítica y el motor de incidencias (Fase 4). Las bitácoras de turno comerciales (j5/Hexagon) taggean la entrada
a la unidad/activo. El modelo de Lyra **ya contemplaba** `LogEntry.equipmentId` (create/previewNew lo aceptaban desde 2.4);
solo faltaba exponerlo.

**Decisión (con el dueño): implementar AHORA el "opción A" (equipo OPCIONAL contextual) y AGENDAR el "opción B" (modo de
equipo por plantilla).** Fundamento: A no es un atajo, es la **mecánica del objeto de referencia** (nodo siempre + equipo
opcional instalado en ese nodo, con el backend validando consistencia), que es exactamente cómo SAP capa el modelo (el campo
existe siempre; la obligatoriedad por tipo de registro se añade después). B (`equipmentMode` por plantilla:
`ninguno/opcional/requerido`, patrón notification-type de SAP / WO-type de Maximo) es el end-state de gobernanza y queda como
slice propio con migración + control en el TemplateBuilder (BACKLOG §2, 2.8.0.2).

**Implementación (A).** Contrato: `eligibleEquipmentSchema` + `equipment[]` dentro de `eligibleNodeSchema`. Backend:
`eligibleNodesForTemplate` carga los equipos ACTIVOS por nodo (1 query, agrupados); **`assertEquipmentInNode`** en
`create`/`previewNew` valida que el equipo exista, esté activo y **pertenezca al nodo** de la entrada (defensa en profundidad
— el front ya ofrece solo los del nodo). Web: el modal "Elige el nodo" gana un selector de **equipo opcional** (Combobox,
"(sin equipo)") que aparece solo si el nodo elegido tiene equipos; el modal ahora se abre también cuando hay **1 nodo con
equipos** (antes solo con >1 nodo). `equipmentId` viaja por compose→create (y previewNew). i18n es-CL. Verde: typecheck/lint
(0 err)/web build · tests API 213 · smoke en vivo **18/18** (`smoke-template-multinode.py` +3: elegibles con equipo, preview
con equipo del nodo 200, equipo de otro nodo 400). Pendiente: smoke VISUAL.

---

### 2026-06-12 · Fase 2.8.0 — Plantillas MULTI-NODO (eje de NODO de la visibilidad de plantilla) — ✅ IMPLEMENTADO

Hoy `Template.orgNodeId` ataba cada plantilla a **un solo nodo** (o global). Se introduce la asignación N:M
**plantilla × nodo** con 3 modos (un nodo / varios / "todos los hijos de X" incl. nodos futuros), que gobierna la
**visibilidad por nodo** (picker + grilla admin) y, al CREAR una entrada, ofrece un selector de nodo acotado a
(asignaciones de la plantilla ∩ nodos accesibles del usuario) — resolviendo también el diferido (a) de 2.4 (plantillas
globales sin nodo al crear). **Es el eje de NODO** (no confundir con el alcance por PLANTILLA de 2.8, que limita QUÉ
plantillas ve un USUARIO/ROL); ambos se mantienen ORTOGONALES y combinan en AND. **6 forks resueltos con el dueño:**

1. **Modelo = entidad nueva `TemplateNodeAssignment` (templateId × orgNodeId + `includeDescendants`), N:M aditiva, FUENTE
   DE VERDAD ÚNICA de la visibilidad por nodo.** `Template.orgNodeId` se **conserva como "nodo primario" DERIVADO**
   (deprecado): se calcula = el nodo cuando hay UNA sola asignación de nodo simple, `null` en global/varios/rama; nunca se
   edita por separado ⇒ **sin drift posible**. Se decidió NO dropear la columna ahora (rompería contratos/web a mitad de
   feature); su DROP queda como **deuda técnica** en BACKLOG §3. Fundamento: una sola fuente de verdad normalizada en la ruta
   de autorización (lo que un auditor exige), retirando la columna de la LÓGICA hoy y del ESQUEMA después — patrón SAP PM /
   Maximo (la disponibilidad por sitio/ubicación es una relación N:M; cualquier "principal" es derivado, no verdad paralela).
2. **Semántica "global" = CERO asignaciones** (sin filas = visible en todo nodo), consistente con la semántica **PERMISIVA**
   ya adoptada en ambos ejes ABAC ("ausencia = sin restricción") y con SAP/Maximo (app sin restricción de sitio = disponible
   en todos). Migración **sin backfill de globales** (las `orgNodeId=null` → 0 filas), cero ruptura. *"Todos los hijos de X"*
   (1 fila `includeDescendants=true`) es DISTINTO de global: subárbol explícito sin abrir a toda la organización.
3. **Combinación con el ABAC de nodo del usuario:** la plantilla es visible si el usuario no tiene restricción, o es global,
   o **ALGUNA** asignación intersecta `getAccessibleNodes`. Intersección de `(M, incDesc)`: `M ∈ accesibles`, **o** (si
   `incDesc`) algún nodo accesible es descendiente de M (`path.startsWith(M.path)`, ruta materializada con "/" final ⇒ sin
   colisión entre hermanos). En **AND** con el eje de PLANTILLA (2.8), sin cambios en ese eje.
4. **Selector de nodo al crear = FORZAR elección (decisión del dueño).** Opciones = `expand(asignaciones) ∩ accesibles`
   (global = todos los accesibles). 1 nodo ⇒ autoselección (cero fricción, como hoy); **>1 ⇒ el operador DEBE elegir** (sin
   default silencioso): correctitud sobre comodidad, una entrada estampada en el nodo equivocado corrompe la bitácora y es
   difícil de revertir (sellado). **El backend AUTORIZA** la membresía en `create` y en `previewNew` (`assertNodeAllowedForTemplate`);
   el front solo la ofrece. Endpoint `GET /log-entries/templates/:id/nodes` (gate `logentry:create`) sirve los elegibles.
5. **Entradas YA creadas = histórico intacto** (confirmado por diseño). Las entradas estampan su `orgNodeId` (sellado
   ALCOA+); quitar/cambiar una asignación gobierna la **creación y la visibilidad de la plantilla**, NO reescribe entradas.
   La grilla `/bitacoras` sigue filtrando por el ABAC de nodo del USUARIO, no por las asignaciones actuales de la plantilla.
6. **UI = en el TemplateBuilder (decisión del dueño), gate `template:edit`.** Sección "Alcance de estructura (nodos)" que
   **reutiliza `ScopeTreePicker`** (mismo shape `{orgNodeId, includeDescendants}`) con un nuevo prop `defaultIncludeDescendants`
   (default `true` en seguridad; `false` aquí = "solo este nodo", más preciso). 0 filas = aviso "GLOBAL". El alta rápida
   (`CreateTemplateModal`) mantiene 0/1 nodo y el multi-nodo completo se edita en el builder. `NewEntryPage` autoselecciona
   (1) o abre un modal de elección (>1, `Combobox` searchable). `TemplatesPage`/picker muestran "Global / N nodos / nodo (y
   subnodos)".

**Implementación.** Migración aditiva `20260612170000_add_template_node_assignment` (tabla + `@@unique([templateId,orgNodeId])`
+ índice + **backfill** 1 fila `incDesc=false` por plantilla con `orgNodeId`; globales → 0 filas; verificado 3→3, 0 globales).
Contratos: `templateNodeAssignmentInput/Schema` + `nodeAssignments` en detail/list + en create/update/saveDraft requests
(`orgNodeId` marcado `@deprecated`) + `eligibleNodeSchema`/`templateEligibleNodesSchema` en log-entries. `ScopeService`:
`getAccessibleNodes` (ids + rutas, fuente única de la que cuelga `getAccessibleNodeIds`/`canAccessNode`), `nodeAssignmentInScope`,
`isTemplateVisibleByNode` (puros). `TemplatesService.list/getDetail/create/updateMeta/saveDraft` filtran/persistten/derivan por
asignaciones (audit before/after del set); `updateMeta` pasó a transacción por atomicidad. `LogEntriesService.create/previewNew`
validan membresía; `eligibleNodesForTemplate` + endpoint. Web: `ScopeTreePicker` (prop nuevo), `TemplateBuilder`, `NewEntryPage`
(selector), `TemplatesPage`, builder-model, api/queries, i18n es-CL. Verde: typecheck (todos) · lint (0 err, 1 warn preexistente
OrgTree) · web build · tests **API 213** (+8: visibilidad por nodo/elegibles/rechazo) · contracts 149. **Smoke en vivo 15/15**
(`scripts/smoke-template-multinode.py`: persistencia 1-nodo/rama/global, elegibles 1 vs 31, previewNew 200/400, picker filtrado
por alcance de nodo del operador restringido; CREA plantilla + ajusta scope y **limpia TODO por ID**). Pendiente: smoke VISUAL.

---

### 2026-06-12 · Fase 2.8 — Afinamiento (QA del dueño) — ✅ IMPLEMENTADO

Cuatro correcciones tras probar 2.8 en pantalla:

1. **Selectores premium + bug de anclaje (todos los selectores).** El panel flotante se **encogía
   progresivamente al arrastrar su propia barra de scroll**. Causa: `useAnchoredPanel` escuchaba `scroll` en
   **captura** (catchea el scroll INTERNO del panel) y `maxHeight` se **realimentaba** de `panel.scrollHeight`
   ya recortado. Fix: (a) ignorar los eventos de scroll cuyo `target` está dentro del panel; (b) `maxHeight` con
   **tope absoluto por viewport** (no de la medición previa) ⇒ converge sin encoger. Además, rediseño visual de
   `Combobox` y `MultiSelect` a estándar premium (iconos **Lucide** en vez de glifos ASCII, `ChevronDown` animado,
   `Search` en el buscador, panel con glass/sombra/anim, estados de opción con acento). Dual-theme vía tokens.
2. **Fuga del filtro de Bitácoras.** El `<Combobox>` de "Plantilla" en `/bitacoras` se poblaba con
   `useTemplates` (`GET /templates`, alcance solo de NODO) ⇒ ofrecía plantillas fuera del alcance de plantilla.
   Nuevo `GET /log-entries/filter-templates` (`logentry:view`) acotado por el **mismo alcance que la grilla**
   (nodo × plantilla). La grilla ya filtraba bien (era solo el selector).
3. **Editor de rol a pestañas.** El alcance por plantilla quedaba sepultado al final de la matriz de permisos.
   `RoleDrawer` reorganizado a **pestañas (Datos / Permisos / Alcance)** y drawer más ancho (760px).
4. **Acceso por rol desde la PLANTILLA (vista recíproca).** Pedido del dueño: asignar roles directamente desde
   la pantalla de Plantillas. `GET/PUT /templates/:id/role-scope` con `TemplateAccessModal` (MultiSelect de
   roles). **`setRoleScope` reemplaza SOLO las filas `TemplateScope` de esa plantilla con `roleId` no nulo** ⇒
   "sin sacar de lo que existe en los roles": el resto del alcance de cada rol y las asignaciones por usuario
   quedan intactos. **Gate = `template:edit`** (decisión): quien diseña la plantilla ya gobierna su nodo
   (visibilidad por nodo), así que gobernar también su audiencia por rol es coherente y permite hacerlo "directo"
   en Plantillas sin exigir permisos de admin de seguridad; si se requiere separación estricta, se puede regatear.
   Auditado (`template.rolescope.assigned`).

Verde: typecheck (6) · lint (0 err, 1 warn preexistente OrgTree) · web build · API **205** · smokes en vivo
**14/14** (2.8) + **8/8** (afinamiento: filtro con alcance, role-scope desde plantilla, garantía de no-borrado del
resto del alcance del rol). Pendiente: smoke VISUAL del dueño (selectores premium + pestañas del rol + modal de acceso).

---

### 2026-06-12 · Fase 2.8 — Alcance por PLANTILLA (2.ª dimensión ABAC) — ✅ IMPLEMENTADO

Hoy quien tiene `module:logbook:view`/`logentry:create` + alcance de **nodo** ve/usa **todas** las plantillas y entradas de
ese nodo, sin importar a qué plantillas tiene privilegio (detectado en vivo en la demo 2.8.2; SECURITY §2.4 ya lo contemplaba).
Se agrega la **2.ª dimensión de alcance de datos**: limitar **qué plantillas** ve/usa cada usuario y filtrar con eso el
**picker** de `/nueva-entrada` y la **grilla/stats/export** de `/bitacoras`. Los **roles por sección** (ya implementados)
limitan QUÉ edita dentro de una plantilla, NO su visibilidad — son ejes distintos, no se mezclan. **6 forks resueltos con el
dueño (recomendación primero):**

1. **Modelo — entidad aparte `TemplateScope`, NO extender `Scope`.** El `Scope` de nodo es intrínsecamente jerárquico
   (`orgNodeId` obligatorio + `includeDescendants` + ruta materializada + únicos `[user,node]`/`[role,node]`). Meter
   `templateId` XOR `orgNodeId` obligaría a `orgNodeId` nullable (rompe los únicos: PG trata NULLs como distintos) y a
   arrastrar `includeDescendants` sin sentido. Son ejes **ortogonales que combinan en AND** — el patrón de SAP PM/Maximo
   (alcance por sitio/planta ≠ autorización por tipo de objeto; el perfil las combina). Tabla dedicada espejo del patrón
   polimórfico: `TemplateScope { userId?|roleId? (XOR), templateId, @@unique([userId,templateId]), @@unique([roleId,templateId]) }`,
   set plano sin descendientes. Migración 100% **aditiva**, no toca `Scope`.
2. **Semántica por defecto — PERMISIVA: "sin scope de plantilla = ve TODAS".** Idéntica al contrato del scope de nodo
   (`null` = sin restricción) y a SAP (sin restricción de valor = '*') / Maximo (grupo sin data-restriction ve todo lo que la
   app permite). El *least privilege* se cumple en la capa de **permiso** (`logentry:create`/`logbook:view`) y de **nodo**;
   el scope de plantilla es un estrechamiento **opcional adicional**. Ventaja decisiva: **migración sin backfill, cero
   ruptura** (todo sigue igual hasta que un admin asigne) y **consistencia** con el otro eje. Deny-by-default queda como flag
   configurable a futuro si un cliente lo exige (registrado en BACKLOG).
3. **Combinación nodo × plantilla — AND ("gana la más estricta").** Ve T si: (nodo) `T.orgNodeId ∈ accesibles` ∨
   `T.orgNodeId null` (global) ∨ `nodos=null`; **Y** (plantilla) `plantillas=null` ∨ `T.id ∈ accesibles`. Las **globales**
   pasan el eje de nodo siempre, pero **sí** quedan sujetas al eje de plantilla (si hay allow-list y no están, no se ven).
4. **Granularidad — plantilla individual.** No hay categorías de plantilla hoy; introducirlas es otra feature. Asignación
   plana, precisa, mínima superficie. La semántica permisiva mitiga "plantilla nueva no cubierta". Categorías/etiquetas como
   agrupador → BACKLOG.
5. **Superficies — solo las OPERACIONALES; el admin `/plantillas` queda fuera.** El scope de plantilla gobierna uso/visibilidad
   operacional (llenar/ver entradas), no la administración. Como el picker y el admin comparten `TemplatesService.list`, se
   parametriza con `applyTemplateScope` (default `false` = admin **idéntico**; el picker pasa `true`). Se filtra además
   `LogbookQueryService.list/stats/export` (por `LogEntry.templateId`) y se gatea por `assertTemplateInScope` en
   getDetail/saveSection/submit/transition (defensa en profundidad: bloquea también el fill por API directa).
6. **UI + asignación — por usuario Y por rol (decisión del dueño), permiso reutilizado.** Sección "Plantillas" hermana de
   "Estructura organizacional" en la pestaña *Alcance* del detalle de usuario + sección nueva en el detalle de rol (selector
   plano searchable, reutiliza primitivos premium). Endpoints **separados** `PUT /security/users/:id/template-scope` (gate
   `user:assign-scope`) y `PUT /security/roles/:id/template-scope` (gate `role:manage`), guardado independiente + audit
   propio (`user.templatescope.assigned` / `role.templatescope.assigned`). `GET /security/template-scope/options` (gate
   `user:assign-scope` OR `role:manage`) sirve la lista de plantillas asignables sin exigir `template:view`. **Sin permisos
   nuevos** — catálogo se queda en **59**. El read-time une scopes de usuario + de sus roles (espejo de `getAccessibleNodeIds`).

---

### 2026-06-12 · Fase 2.8.2 (parcial) — No crear borradores huérfanos + arreglos de la demo — ✅ IMPLEMENTADO

Durante la prueba en vivo de la ventana de edición, el dueño detectó que **elegir una plantilla creaba un `LogEntry`
de inmediato** (entrar y salir dejaba un borrador vacío). Se resolvió el frente (a) de la deuda 2.8.2 **diferir la creación**:
- **`GET /log-entries/new`** (permiso `logentry:create`): arma el MISMO `LogEntryDetail` que produciría crear+abrir pero
  **sin persistir** (`id:""`). Se refactorizó `getDetail` en `buildDetail(entry|sintético, …)` (tipo `EntrySource` = Pick),
  reusando TODA la lógica de editabilidad/dimensiones/ventana/transiciones — **cero duplicación en el cliente**.
- **Modo COMPOSE** en `EntryFillPage` (ruta `/nueva-entrada/comenzar/:templateId`): carga el preview; el **primer guardado
  real** materializa la entrada (`createLogEntry` con el diferido declarado) y pasa a edición **sin remontar** (preserva el
  borrador; URL vía `replaceState`). **Creación ÚNICA por `ref`**: si la acción falla tras crear, cambia a la entrada real
  para no duplicar al reintentar. `NewEntryPage` solo navega (no crea).
- Diferido (b)(c) de 2.8.2 (VOID de borradores con contenido + ruta de edición propia fuera de `/nueva-entrada`) **siguen abiertos**.

**Arreglos surgidos de la demo (multi-actor por rol + flujo + firma):**
- **`GET /log-entries/templates`** (permiso `logentry:create`, ABAC): el picker de "Nueva entrada" listaba plantillas con
  `GET /templates` (exige `template:view`, permiso de ADMIN de plantillas) → un Operador no podía. El llenado de bitácora
  no debe requerir acceso al módulo de Plantillas: endpoint propio del módulo de bitácoras.
- Ítem de menú **"Nueva entrada" gateado por `logentry:create`** (antes `module:logbook:view`): quien solo llena/revisa
  (Mantenedor, Supervisor) no lo ve; llega a las entradas por **Bitácoras → Editar**.
- Botón **"Volver" contextual**: una entrada existente vuelve a Bitácoras; una entrada nueva sin crear, al picker.
- Indicador **"secciones completadas" cuenta `COMPLETED` + `LOCKED`**: una sección LOCKED se completó antes de sellarse al
  avanzar el flujo (la guarda de completitud no deja avanzar sin completar), así un registro aprobado muestra **M/M**, no 0/M.

Tests: contracts 149 · API 200 (verde tras ajustar el assert del indicador). Demo de capacidades creada con `scripts/demo-bitacora.py`
(3 roles + 3 usuarios + flujo + plantilla de 3 secciones; **fuera del commit**, es seeder de demo). **Pendiente
(registrado en BACKLOG):** alcance por PLANTILLA (filtrar picker+grilla, Fase 2.8) y re-probar la demo con ownership
estricto por campo.

---

### 2026-06-12 · Fase 2.7.2 — Afinamiento UX (QA del dueño) — ✅ IMPLEMENTADO

Iteración visual tras probar 2.7.2 en el navegador:
- **Duración en MINUTOS u HORAS** (pedido del dueño): se cambió la unidad canónica de almacenamiento de **horas a
  MINUTOS** (`editWindowHours`→`editWindowMinutes` en `Template` y `SystemSettings`; migración `…_edit_window_minutes`
  renombra + **convierte ×60** + check 0..525600 = 365 d). La UI ofrece **número + selector de unidad** (Minutos/Horas)
  vía componente reutilizable `EditWindowDurationField` (normaliza a minutos; vacío = sin límite). `editWindowDeadline`
  pasa a `×60_000`. Motivo: granularidad operacional real (correcciones de minutos), sin ambigüedad (una sola unidad
  canónica; la UI presenta la cómoda). Extensible a "días" después.
- **Banner PROMINENTE de ventana en el llenado** (antes era un chip gris perdido entre las dimensiones): franja de
  ancho completo bajo la cabecera — **info (cian)** "editable hasta X" cuando vigente, **warning (ámbar)** cuando
  vencida (con override: "indica un motivo…"; sin override: "solo lectura"). El chip viejo se eliminó.
- **Fix de alineación** del ítem "Sellada" en el visor (`/bitacoras`): cada ítem de `viewerMetaRow` es `inline-flex`
  (ícono ✓ no se separa de su texto al envolver). Aclaración: **"Sellada"** = instante en que se congelaron
  effectiveAt + dimensiones (1ª transición con flujo, o submit sin flujo).
- **Aprendizaje operacional**: el cleanup de un smoke borró (lógico) la plantilla real del dueño por filtrar el listado
  por nombre. Regla: los smokes limpian **solo por ID de lo que el propio script creó**, nunca por filtro sobre el
  listado. La plantilla se restauró (deletedAt → null; sin pérdida de versiones/secciones).

---

### 2026-06-12 · Fase 2.7.2 — Ventana de edición configurable (#6) — ✅ IMPLEMENTADO Y PUBLICADO

Segundo eslabón de la **gobernanza temporal** (tras 2.7.0 registro diferido y 2.7.1/2.7.1.1 período gobernado):
un plazo configurable para corregir un registro; vencido, solo se edita con privilegio explícito y motivo auditado.
Se investigó el estándar antes de codear (MHRA GxP Data Integrity 2018 / FDA DI Q&A: *contemporaneous* + corrección
tardía **justificada y atribuida**, sin número normativo; SAP OB52 y Odoo lock dates = config **viva**, no congelada
en el documento; Maximo rechaza por fecha; eLogbooks comerciales con ventanas/amendments configurables + audit trail).
**5 forks resueltos, todos con la opción recomendada aprobada por el dueño ("avanza"):**

1. **Dónde se configura = columnas en `Template` (contenedor mutable) + fallback en `SystemSettings`.** La ventana es
   **gobernanza VIVA** (patrón SAP OB52 / Odoo): cambiar la política aplica de inmediato a TODAS las entradas, sin
   republicar la versión. Congelarla en `TemplateVersion` obligaría a clonar versión por cada ajuste y dejaría
   entradas viejas con ventanas obsoletas (un auditor lo objetaría). La integridad no la da congelar la política sino
   **auditar cada override**. Fallback en `SystemSettings` (singleton de gobernanza, ya con UI en `/configuracion`),
   NO en `PasswordPolicy` (dominio auth). Duración en **horas enteras** (1–8760); `editWindowHours` tri-estado:
   `null`=hereda global · `0`=sin ventana (explícito) · `>0`=propia.
2. **Ancla = ambas configurables por plantilla, default `RECORDED`.** Con `RECORDED` (desde `recordedAt` inmutable) el
   operador SIEMPRE tiene la ventana completa desde que crea la entrada — un **registro diferido legítimo (2.7.0) no
   nace vencido**. `EFFECTIVE` (desde la fecha del evento) queda para plantillas estrictas; quien la elige acepta que
   los diferidos largos requieren override. La guarda con ancla EFFECTIVE usa la `effectiveAt` **persistida** (no la
   prospectiva): editar el campo de fecha efectiva no puede "reabrir" la ventana en el mismo guardado.
3. **Override = permiso nuevo `logentry:write-expired` (catálogo 58→59) + MOTIVO obligatorio + MFA configurable.**
   Nombre espejo de `opsperiod:write-closed` (ambos = "escribir pasada una guarda temporal"). **Diferencia GxP frente
   al bypass de período (silencioso): aquí el motivo es OBLIGATORIO** (≥5, patrón `deferredReason`) en CADA escritura
   fuera de ventana → `AuditLog` (evento dedicado `logentry.editwindow.override`) + `LogEntryFieldChange.reason`. Sin
   motivo ⇒ 400 aunque se tenga el permiso. MFA opt-in vía `SystemSettings.requireMfaEditWindowOverride` + `ReauthService`
   (mismo patrón por-acción de períodos; `mfaVerified` estampado en la auditoría).
4. **Composición con período = guardas independientes en AND ("gana la más estricta"), cada una con SU bypass.**
   Escribible solo si AMBAS lo permiten: `logentry:write-expired` no salva un período cerrado y `opsperiod:write-closed`
   no salva una ventana vencida; LOCKED bloquea a todos. **Precedencia del `blockedReason`** (del menos al más accionable
   por el usuario): `ENTRY_CLOSED` → `PERIOD_CLOSED` → `EDIT_WINDOW_EXPIRED` → `WRONG_STATE`/`MISSING_ROLE`. La guarda de
   período se evalúa ANTES (su 403 precede). `getDetail` expone `editWindow {anchor, windowHours, expiresAt, expired,
   canOverride, overrideRequiresMfa}` para la huella proactiva ("Editable hasta X").
5. **Alcance temporal = `saveSection` + `setDeferral` + `submit` SÍ; `create` y `executeTransition` NO.** La ventana
   gobierna la **corrección de DATOS**, no el avance del flujo: incluir `executeTransition` obligaría a dar el override
   a todos los aprobadores (un ciclo revisión→aprobación legítimamente excede 48h), vaciando el permiso — SAP/Maximo
   bloquean *posteos* por período (eso ya lo hace la guarda de período, que SÍ aplica a transiciones), no aprobaciones.
   `create` NO porque con RECORDED la ventana nace con la entrada y con EFFECTIVE bloquear la creación contradiría el
   diferido declarado de 2.7.0. `setDeferral` SÍ (muta `effectiveAt` = corrección de dato); `submit` SÍ (sellar tarde un
   borrador abandonado es la finalización tardía que GxP flaguea). El **nudge 2.7.0(a)** (aviso suave sin guarda) se
   **difiere de nuevo** (UX pura; queda en BACKLOG).

**Implementación.** Migración aditiva `20260612025159_add_edit_window`: enum `EditWindowAnchor` (RECORDED|EFFECTIVE);
`Template.editWindowAnchor/Hours` nullable; `SystemSettings.editWindowAnchor` (default RECORDED) + `editWindowHours`
(null) + `requireMfaEditWindowOverride`; check constraints 0..8760 h. Contratos: `EDIT_WINDOW_ANCHORS`,
`editWindowHoursSchema`, `EDIT_WINDOW_EXPIRED` en `SECTION_BLOCKED_REASONS`, `editWindowInfoSchema` en el detalle,
`overrideReason`+creds en save/deferral/submit, y **fuente única back↔front** `resolveEditWindow` / `editWindowDeadline`
/ `isEditWindowExpired` (borde no inclusivo: en el límite aún se edita). Backend `LogEntriesService.assertEditWindowWritable`
(en saveSection/setDeferral/submit) + huella en `getDetail`; `SettingsService.editWindowSettings()` en una lectura;
`LogEntriesModule` importa `SettingsModule`. Web: control en el `TemplateBuilder`, pestaña "Bitácoras" en `/configuracion`,
chip "Editable hasta X" + `EditWindowOverrideModal` (motivo + creds) interceptando guardar/completar/enviar/diferir;
`EntryFillPage` migrada a `lib/format.ts`. Tests: contracts **149** (+5), API **200** (+10). Smoke en vivo **21/21**
(round-trip settings, ventana propia EFFECTIVE/24h, diferida 3d ⇒ vencida, 400 sin motivo / 200 con motivo + FieldChange
+ AuditLog dedicado, usuario sin permiso ⇒ 403 + EDIT_WINDOW_EXPIRED, MFA exigido sin enrolar ⇒ rechazo, vigente ⇒ huella
+ canal normal intacto; datos creados y LIMPIADOS, conteos en 0). **Siguiente: 2.7.3 matriz rol×sección×tiempo.**

---

### 2026-06-12 · Fase 2.7.1.1 — Afinamiento UX + Configuración del sistema — ✅ IMPLEMENTADO Y PUBLICADO

Iteración de inspección visual del dueño sobre la pantalla fiscal. Decisiones tomadas en la sesión:
- **MFA de gobernanza de período = POR ACCIÓN** (no un flag único): pedido del dueño para flexibilidad (p. ej. exigir MFA
  solo al reabrir/bloquear, no al cerrar). `SystemSettings` con 4 booleanos; gate per-action vía `ReauthService`.
- **Configuración del sistema = pantalla propia `/configuracion`** (no dentro de la política de seguridad), con **pestañas
  verticales por categoría** (scaffold enterprise para crecer). Permisos `module:settings:view` + `settings:manage` (→58).
- **El historial de período estampa `mfaVerified`** (si la acción se re-autenticó con MFA en ESE momento): el ajuste puede
  cambiar después, así que el registro de auditoría debe ser auto-descriptivo (no derivarse del ajuste actual).
- **Grilla = el componente que scrollea/pagina** (thead/footer sticky, altura acotada), no el panel; **orden por columnas**
  como en el resto del sistema; **historial por período** (drill-down al AuditLog).
- **Período MENSUAL con meses de largo variable**: confirmado correcto — el período es `[ancla mes M, ancla mes M+1)`, toma
  el largo real (28/29/30/31); el día-ancla se acota a 1–28 para que el borde exista en todos los meses (patrón SAP).
- **Regla permanente: formato regional** para fechas/números/monedas (helper único `lib/format.ts` que lee el locale activo;
  CLP por defecto). Fix transversal `@lyra/ui`: `Toast` z-index sobre modales/drawers.

---

### 2026-06-11 · Fase 2.7.1.1 — Calendario FISCAL transversal + período al estándar industrial — ✅ IMPLEMENTADO Y PUBLICADO

Tras revisar la pantalla de 2.7.1, el dueño del producto pidió alinear los períodos al estándar de los grandes
sistemas ("la más potente", entre NetSuite y Maximo) y **detectó un acoplamiento de diseño correcto**: el período
contable es **transversal**, pero hoy vive DENTRO del calendario de turnos. Se investigó el estándar (SAP OB52 /
fiscal year variant a nivel de sociedad; NetSuite accounting periods Open/Closed/Locked + Set Up Full Year + cierre
secuencial + Override Period Restrictions; Maximo financial periods a nivel de ORGANIZACIÓN, contiguos, rango From/To,
validación por fecha).

**Corrección estructural (la decisión central):** **DESACOPLAR** el período del calendario de turnos. Hoy
`OperationalCalendar` empaqueta turnos + `periodKind`/ancla y `OperationalPeriod` se scopea por `calendarId` ⇒ el mes
contable queda fragmentado por calendario de turno. El estándar es claro: el período fiscal es **transversal a la
organización** (SAP = company code; Maximo = Organization; NetSuite = subsidiaria), separado del *factory/shift
calendar*. Se introduce **`FiscalCalendar`** (entidad transversal: `periodKind` MONTH/WEEK/CUSTOM + ancla, con
**default** y asignación por nodo opcional — mismo patrón de resolución por ruta que `OperationalCalendar`, simétrico).
`OperationalCalendar` se queda **solo con turnos + ancla del día operacional**. La fecha efectiva resuelve **dos ejes
independientes**: `(operationalDate, shiftCode)` del calendario de turnos y `periodKey` del **calendario fiscal**.

**4 forks resueltos (los 4 con la recomendación):**
1. **Modelo base = backbone Maximo + tri‑estado NetSuite.** Períodos con **rango `periodStart`/`periodEnd`** (día
   operacional, derivado del calendario FISCAL), **contiguos sin huecos**, validación por fecha; estado
   **OPEN → CLOSED → LOCKED**. No se copian los "períodos especiales 13–16" de SAP (ajustes de GL de cierre de año,
   fuera del alcance de una bitácora operacional).
2. **Generación EXPLÍCITA.** Acción "Generar períodos" (año/rango) que **materializa filas contiguas** desde la config
   del calendario fiscal (espejo de *Set Up Full Year* / generate de Maximo), **idempotente** (jamás degrada un
   CLOSED/LOCKED). Reemplaza la lista sintética LAZY (ventana −400/+45d) que confundía. UI agrupa por año, marca el
   período **Actual**.
3. **Fecha sin período generado = ABIERTA por defecto + flag opt‑in `requirePeriod`** (en el FiscalCalendar). El rechazo
   estricto de Maximo al pie de la letra trabaría el terreno; default permisivo (seguro), flag activa el rigor estricto.
4. **Cierre SECUENCIAL + LOCKED duro.** No se cierra un período si hay uno anterior abierto. OPEN → **CLOSED**
   (reversible; bypass `opsperiod:write-closed` aún postea) → **LOCKED** (bloquea a TODOS, incl. bypass; reabrir exige
   permiso superior). Permisos nuevos **`opsperiod:lock` / `opsperiod:unlock`** (catálogo **54→56**); `opsperiod:reopen`
   queda para el reabrir soft.

**Plan de implementación (2.7.1.1, su propia sesión):** migración (nueva `FiscalCalendar` + asignación por nodo;
**mover** `periodKind`/`periodAnchorDay`/`periodStartWeekday`/`periodLengthDays`/`periodAnchorDate` de `OperationalCalendar`
a `FiscalCalendar`, seedeando un fiscal default desde la config de período existente para que el `periodKey` ya estampado
en `LogEntry` quede consistente; `OperationalPeriod` re‑scopeada a `fiscalCalendarId × periodKey`, += `periodStart`/
`periodEnd`; `PeriodStatus` += `LOCKED`, CLOSING deprecado; `FiscalCalendar.requirePeriod`). Resolver: split en eje
turno (OperationalCalendar) y eje período (FiscalCalendar) — `LogEntry` estampa `shiftCode`/`operationalDate` del primero
y `periodKey` del segundo. `enumeratePeriods` (start/end contiguos) en `@lyra/contracts`. `OperationalPeriodService`:
`generate` idempotente, `close` con guarda secuencial, `lock`/`unlock`, `list` por filas generadas agrupadas por año +
"Actual"; `assertWritable` gana LOCKED (bloquea incl. bypass) y `requirePeriod`. Permisos `opsperiod:lock`/`unlock` +
seed + invalidar caché authz. UI: mantenedor de calendario fiscal (probablemente pantalla/sección propia, separada de
turnos) + `PeriodsSection` con "Generar" y acciones close/reopen/lock/unlock gateadas. **Supersede** la presentación LAZY
y el scope-por-turno de 2.7.1 (el modelo de cierre/guarda se conserva y se endurece). El `periodKey` sigue siendo la
identidad estampada (histórico intacto).

**4 forks finos resueltos (2026-06-11, en la sesión de construcción; los 4 con la recomendación):**
1. **Mantenedor fiscal = PANTALLA PROPIA `/calendario-fiscal`** (no sección dentro de `/calendario-operacional`).
   SAP (company code) / Maximo (Organization) / NetSuite (subsidiaria) separan el período fiscal del *shift calendar*;
   re-meterlo en la pantalla de turnos re-acopla lo que el refactor desacopla y genera ambigüedad ("¿períodos de qué
   calendario?"). Costo bajo (ruta + nav + permiso de módulo).
2. **Migración: un `FiscalCalendar` por cada config de período DISTINTA en uso** (dedup por firma
   `periodKind`+ancla), no un fiscal global único. Verificado en BD: 3 calendarios con **2 configs** — default
   `planta-eagon` = WEEK (SECADO/ELABORACION), `mina-rajo` = MONTH (**TREATMENT PLANT**), `calendario` = MONTH (sin
   nodo). El default fiscal sale del calendario de turnos default (WEEK); cada fiscal no-default se **re-asigna a los
   mismos nodos** que hoy resuelven a su calendario de turnos. Así el `periodKey` ya estampado (`2026-06-08`, llave
   semanal, 23 entradas) y el de TREATMENT PLANT (MONTH) se preservan EXACTOS. Un fiscal global único habría cambiado
   TREATMENT PLANT de MONTH→WEEK (histórico inconsistente).
3. **`periodStart`/`periodEnd` ALMACENADOS** en las filas materializadas (set al "Generar", calculados por
   `enumeratePeriods` puro; `periodEnd` exclusivo = inicio del siguiente). La generación explícita ya materializa filas
   (Maximo), así que el costo de columna es cero y habilita "Actual" por SQL indexado (`periodStart <= hoy < periodEnd`),
   cierre secuencial por orden y validación de contigüidad. La función pura sigue siendo la fuente de verdad; único
   escritor = `generate` idempotente que jamás altera CLOSED/LOCKED.
4. **Reapertura de LOCKED = two-key + secuencialidad inversa graduada.** `unlock` (`opsperiod:unlock`) lleva
   LOCKED→**CLOSED** (no directo a OPEN); un segundo paso deliberado `reopen` (`opsperiod:reopen`) lleva CLOSED→OPEN
   (espejo NetSuite, defensa en profundidad para lo más sensible). Reabrir un CLOSED se **BLOQUEA** si existe un período
   POSTERIOR **LOCKED** (no se reabre detrás de un lock duro); se **ADVIERTE + permite con motivo** si los posteriores
   están solo CLOSED (cultura de corrección ALCOA+, equilibra UX vs. consistencia).

**Implementación (notas de construcción):** migración en **2 pasos + script TS** por el EPERM de Windows con el watch:
M1 estructural aditiva (FiscalCalendar + `OrgNode.fiscalCalendarId?` + `OperationalPeriod += fiscalCalendarId?/periodStart?/
periodEnd?/locked*` + `PeriodStatus += LOCKED`), script idempotente `db:migrate-fiscal` (dedup de firmas → fiscales,
reasignación de nodos, remapeo de filas con `enumeratePeriods`), M2 cleanup (drop columnas de período de
`OperationalCalendar`, `fiscalCalendarId` NOT NULL, swap del `@@unique`). Split del resolver: `resolveShift` pierde el
período; nuevo `FiscalResolver` (token abstracto, path-walk por `OrgNode.fiscalCalendarId`) provee `periodKey`.

---

### 2026-06-11 · Fase 2.7.1 — Período contable gobernado (`OperationalPeriod`) — IMPLEMENTADO (forks resueltos)

Segundo slice de la gobernanza temporal (#5). Los períodos (`periodKey` que ya estampa el `ShiftResolver`)
pueden CERRARSE; toda escritura cuya `effectiveAt` caiga en período no abierto se bloquea con
`blockedReason = PERIOD_CLOSED` salvo permiso de excepción configurable. Rama `feat/periodo-gobernado`.
**4 forks resueltos con el dueño del producto (los 4 con la recomendación):**

1. **Materialización LAZY ("ausencia = ABIERTO", patrón lock-date de Odoo).** No se pre-generan filas: un
   período sin fila se trata como OPEN; cerrar/poner en cierre crea/actualiza la fila con motivo+permiso+
   auditoría; reabrir la vuelve a OPEN (conserva el rastro de reapertura). El mantenedor LISTA los períodos
   recientes DERIVADOS de la config del calendario (helper puro `enumeratePeriodKeys`, ventana −400/+45 días)
   unidos con las filas explícitas. Motivo: `periodKey` es ilimitado y puede ser null (entradas sin calendario
   = **ungobernadas, nunca bloqueadas**); generar filas exigiría un scheduler y rangos arbitrarios, contrario al
   on-prem simple. El período se identifica por **(calendarId × periodKey)** porque la llave es calendar-specific.
2. **Mantenedor como SECCIÓN dentro de `/calendario-operacional`** (no pantalla propia). Los períodos derivan de
   la config del calendario (periodKind/ancla); co-ubicarlos mantiene el modelo mental. Promovible a pantalla
   propia si aparece un perfil contable dedicado.
3. **Hard lock irreversible DIFERIDO.** Solo soft-close + reapertura auditada en 2.7.1. La irreversibilidad por
   diseño choca con ALCOA+ (cultura de corrección) y con el eje "mejor UX" (un clic sin retorno); NetSuite/SAP
   casi nunca hacen lock duro real. Se deja el slot conceptual (`lockLevel`) para adoptarlo barato después.
4. **La guarda aplica a TODAS las mutaciones, incluidas las transiciones de flujo; las lecturas y la verificación
   de firma NUNCA se bloquean.** Una transición ES una transacción que muta y puede sellar dimensiones (Maximo
   rechaza por fecha). El estado **CLOSING** permite que los flujos en vuelo de roles privilegiados continúen
   (patrón SAP OB52); CLOSING y CLOSED bloquean por igual a los no privilegiados (difieren en intención).
5. **(confirmado por diseño, no fork) Registro diferido en período cerrado → `PERIOD_CLOSED`.** `setDeferral`
   recalcula `effectiveAt` y pasa por la MISMA guarda: declarar/corregir una fecha de evento en período cerrado
   se rechaza con el mismo motivo visible.

**Roles privilegiados = DATO, nada hardcodeado:** el permiso **`opsperiod:write-closed`** (clave RBAC asignable a
roles, patrón authorization group de SAP OB52) habilita el bypass de la guarda. Catálogo **50→54**:
`opsperiod:view/close/reopen/write-closed` (`reopen` separado de `close` por ser más sensible, patrón SAP/NetSuite).

**Implementación:** migración aditiva `20260611200225_add_operational_period` (`OperationalPeriod` calendarId×
periodKey + enum `PeriodStatus` OPEN|CLOSING|CLOSED + cierre/reapertura, FK `onDelete: Cascade`, índice
(calendarId,status)). Contrato `@lyra/contracts/operational-periods` (DTOs + `closePeriodRequest`/`reopenPeriodRequest`
con motivo ≥5) + `PERIOD_CLOSED` sumado a `SECTION_BLOCKED_REASONS` (enum extensible que dejó listo el Afinamiento #4) +
helper puro `enumeratePeriodKeys` en el contrato de calendario. `ShiftResolver` gana `resolveWithCalendar` (devuelve
`calendarId` + resolución) como fuente única para la guarda. `OperationalPeriodService.assertWritable(at, orgNodeId,
perms)` = guarda única invocada en `create`/`saveSection`/`setDeferral`/`submit`/`executeTransition` sobre la
`effectiveAt` que el write persistiría; en `getDetail`, si el actor sin excepción tiene una entrada en período cerrado,
TODAS las secciones reportan `PERIOD_CLOSED` y no se ofrecen transiciones (huella proactiva, patrón Afinamiento #4).
La guarda se evalúa ANTES de la completitud/validación de campos y del re-auth (gate duro; evita el círculo vicioso de
"complete las secciones" en período cerrado y no consume códigos de recuperación). `OperationalPeriodController`
(`/operational-periods` list/close/reopen) gateado y auditado (`opsperiod.closed|reopened` con before/after). Web:
`PeriodsSection` en el detalle del calendario (lista con estado, cerrar/reabrir con modal de motivo) + caso
`PERIOD_CLOSED` en la huella del llenado + i18n `opsPeriod`. **Degradación elegante:** `periodKey` null (sin calendario)
⇒ ungobernado ⇒ nunca bloquea. Tests: contracts **125** (+5) · API **180** (+11). Smoke en vivo **17/17** (rol+usuario
temporal SIN bypass para observar el bloqueo + demo CON bypass para la excepción; datos creados y LIMPIADOS, conteos
verificados; la guarda de `executeTransition` quedó cubierta por código+unit — la plantilla de prueba no ofrecía
transición al usuario sin bypass). **Siguiente: 2.7.2 ventana de edición.**

---

### 2026-06-11 · Plan de fases post-2.6.0 APROBADO + Fase 2.7.0 Registro diferido — IMPLEMENTADO (forks resueltos)

El dueño del producto **APROBÓ tal cual** el plan de fases propuesto abajo (2.7 Gobernanza temporal → 2.8
Alcance+acceso → 2.9 Plantillas inteligentes; #10 IA-ready transversal; 2.8.0 multi-nodo adelantable si Eagon lo
exige). Esta sesión ejecutó **2.7.0 — Registro diferido (#1)** (rama `feat/registro-diferido`). **3 forks resueltos
con el dueño del producto:**

1. **Dónde se declara la fecha del evento → HÍBRIDO (a).** Si la versión congelada tiene campo
   `semanticRole = EFFECTIVE_DATE`, el gesto **escribe ESE campo** (sigue siendo la única fuente viva) aplicando las
   MISMAS guardas que `saveSection` (sección editable en el estado × rol de sección × override de rol por campo — sin
   bypass), con `LogEntryFieldChange` auditado (el motivo del diferimiento queda como `reason`) y **bump de la
   `version` de la sección** (editores concurrentes ven 409). Si NO existe, la fecha declarada vive a nivel de entrada
   (`LogEntry.declaredEffectiveAt`) y entra a `resolveEffectiveAt` como **fallback intermedio**:
   `campo → declarada → recordedAt`. Motivo: exigir el campo en la plantilla (opción b) rompía la degradación elegante
   y obligaba a re-versionar plantillas publicadas; la cadena de prioridad mantiene UNA fuente resuelta por entrada.
   Detalle de exactitud: para campos DATE se preserva la **fecha civil** del operador tomándola del string ISO con
   offset (no de la conversión UTC, que puede correr un día).
2. **Motivo del diferimiento → OBLIGATORIO** (mín. 5 caracteres, contrato + backend). Práctica GxP de late entry
   (MHRA Data Integrity 2018, FDA DI Q&A 2018, ALCOA+ *contemporaneous*): la anotación tardía se identifica CON
   justificación. Hacerlo configurable hoy sería parametrizar por parametrizar; relajarlo después es aditivo
   (lo contrario dejaría históricos sin motivo).
3. **Diferido DECLARADO, no inferido.** `entryOrigin` es una **atestación del operador** (línea confirmada por el
   dueño del producto): inferir por diferencia de relojes produce falsos positivos (drift, guardados lentos, TZ) y
   convierte una declaración de integridad en una adivinanza. Complemento registrado en BACKLOG para 2.7.2: *nudge*
   suave de UI (no guarda de servidor) si `effectiveAt` difiere mucho de `recordedAt` sin declaración.

**Implementación:** migración aditiva `20260611183427_add_log_entry_origin` (`LogEntryOrigin` ONLINE|DEFERRED default
ONLINE + `declaredEffectiveAt?` + `deferredReason?` + `deferredDeclaredById?/At?` + índice). Contratos: enum +
`deferralInputSchema` + `deferred?` en create + `setDeferralRequestSchema` (PUT declara/corrige/quita con null) +
filtro `entryOrigin` en la list query + evento `DEFERRED_DECLARED` en la timeline + `resolveEffectiveAt` con 4.º
parámetro opcional (compatible). Backend: `create` acepta `deferred`; **`setDeferral`** (`PUT /log-entries/:id/deferral`,
permiso `logentry:fill` + ABAC, SOLO en DRAFT sin sellar — el sellado congela el origen) recalcula `effectiveAt` +
dimensiones vía `ShiftResolver` y audita `logentry.deferral.declared|cleared` (before/after); quitar la marca NO toca
el campo de fecha (es dato visible del canal normal). El evento de timeline refleja la declaración VIGENTE; las
correcciones quedan en AuditLog + FieldChange. Export CSV gana columnas Origen / Fecha evento declarada / Motivo
diferido. **Sin permisos nuevos** (declarar el diferido es parte de llenar; las guardas privilegiadas llegan con
2.7.1/2.7.2). Web: toggle "Registrar con otra fecha/hora" en `/nueva-entrada` (apagado por defecto = cero fricción),
`DeferralModal` en el llenado (declarar/corregir/quitar en borrador), chip/indicador "Diferida" + ambas fechas en
llenado/grilla/visor, filtro "Origen" + chip removible en `/bitacoras`, evento en la timeline del visor.
Tests: contracts **120** (+5) · API **169** (+8). Smoke en vivo **14/14** (datos creados y LIMPIADOS, conteos
verificados en BD).

---

### 2026-06-11 · Revisión del dueño del producto: 10 mejoras post-2.6.0 — triage, auditoría del #4 y plan de fases (APROBADO el 2026-06-11; ver la entrada de arriba)

El dueño del producto entregó **10 mejoras** tras una revisión exhaustiva en el navegador (texto íntegro en
`docs/BACKLOG.md` §2 "Mejoras post-2.6.0" y en `docs/NEXT_SESSION.md`). Esta sesión hizo triage + investigación +
diseño, y ejecutó SOLO el fix **#4** (abajo). El plan de fases queda **PROPUESTO, pendiente de visto bueno**; no se
codea ninguna fase grande sin aprobación (CLAUDE.md).

**Auditoría del #4 (hallazgo real, documentado ANTES de declarar bug):**
- El backend **SÍ gatea** la edición por sección en el servidor (`LogEntriesService.saveSection`): editabilidad =
  (sección editable en `currentStateKey`) × (rol-dato `TemplateSectionRole` + override por campo `TemplateFieldRole`)
  × ABAC, con 403. **No hay agujero de autorización.**
- Lo que el usuario observó tiene 3 causas reales: **(a) datos** — la plantilla de prueba publicada tiene 0 roles por
  sección y `editableInStateKey` null, y el sistema demo tiene UN solo rol (Administrador) que tienen los 3 usuarios ⇒
  nunca hay nada que gatear (una sección sin roles queda abierta a cualquiera con `logentry:fill`, degradación
  elegante POR DISEÑO); **(b) UX** — el DTO solo exponía `editable: boolean` sin el PORQUÉ, la UI no muestra a qué rol
  está asignada cada sección ni qué falta para completar/avanzar, y los nombres "Guardar sección"/"Guardar y
  completar" no describen el efecto; **(c) un gap REAL en `submit` (forms sin flujo)** — validaba completitud solo
  sobre las secciones editables POR EL QUE ENVÍA (predicado relativo al usuario) y NO exigía secciones en estado
  COMPLETED ⇒ un actor podía SELLAR la entrada con secciones de otros roles incompletas y, peor, **sin capturar la
  firma de completitud de sección** (`TemplateSection.requireSignature` se podía eludir por la vía submit). Con
  flujo, `executeTransition` ya validaba objetivo (guard d); el submit sin flujo quedó asimétrico desde 2.5.

**Fix #4 implementado (esta sesión):**
1. **`submit` (sin flujo) pasa a validación OBJETIVA**: exige TODAS las secciones con campos en `COMPLETED` y valida
   todos los obligatorios/valores (predicado objetivo, espejo del guard (d) de `executeTransition`). Cierra la elusión
   de la firma de sección (Part 11) y la asimetría con flujo. Enviar = sellar el registro completo (GxP commit).
2. **Contrato aditivo**: `LogEntrySectionStateDto` gana `blockedReason` (`ENTRY_CLOSED` | `WRONG_STATE` |
   `MISSING_ROLE` | null), `assignedRoleNames: string[]` (nombres de los roles-dato de la sección) y
   `readOnlyFieldKeys: string[]` (campos cuyo override de rol excluye al usuario). El enum nace EXTENSIBLE a
   propósito: la Fase de gobernanza temporal le sumará `PERIOD_CLOSED`/`EDIT_WINDOW_EXPIRED` (#7) sin migración.
3. **UI del llenado autoexplicativa**: barra de progreso de secciones en cabecera ("N de M completadas"); por sección,
   chip de asignación de rol y motivo de bloqueo específico (no más "no editable" genérico); campos con override en
   solo-lectura visible; acciones renombradas a lo que HACEN: "Guardar avance" (persiste sin completar) y "Completar
   sección" / "Completar y firmar" (marca COMPLETED + firma si corresponde), con hint; "Enviar y registrar" se
   deshabilita listando qué secciones faltan (el backend re-valida siempre).

**Plan de fases PROPUESTO (espera visto bueno; sub-slices publicables):**
- **Fase 2.7 — Gobernanza temporal del registro** (#5 + #6 + #1 + #7, interdependientes; toca la INTEGRIDAD del
  registro auditable):
  - **2.7.0 Registro diferido (#1):** el modelo temporal YA existe (`recordedAt` vs `effectiveAt`); falta la UX de
    gesto mínimo ("Registrar con otra fecha/hora"), la marca explícita de entrada diferida (`entryOrigin`
    ONLINE|DEFERRED declarado, no inferido) + motivo, y su huella en grilla/visor/timeline. GxP: la entrada tardía es
    legítima si queda IDENTIFICADA como tal con fecha de evento vs fecha de registro y quién (ALCOA+ contemporaneous;
    el backdating se vuelve fraude solo cuando se OCULTA).
  - **2.7.1 Período gobernado (#5):** entidad NUEVA `OperationalPeriod` (calendario × `periodKey`) con estado
    `OPEN`/`CLOSING`/`CLOSED`, cierre y **reapertura con motivo + permiso + auditoría**; guardas de ESCRITURA: toda
    mutación (crear/guardar/transicionar) cuya `effectiveAt` caiga en período no abierto se bloquea salvo rol
    privilegiado configurable. Referentes destilados: SAP OB52 (intervalos abiertos por grupo de autorización — roles
    privilegiados pueden postear en período en cierre), NetSuite (reapertura con justificación obligatoria y
    re-cierre; "Allow Non-G/L Changes" = edición parcial configurable en período cerrado), Odoo (lock date "soft" con
    excepciones por usuario+motivo auditadas vs **hard lock irreversible**, que adoptamos como opción de
    configuración), Maximo (transacción rechazada si `actualdate` no cae en período financiero activo).
  - **2.7.2 Ventana de edición (#6):** config por plantilla (fallback global) `{ancla: RECORDED|EFFECTIVE, duración}`;
    fuera de ventana solo roles con privilegio explícito y motivo (corrección excepcional auditada, patrón GxP).
    Convive con 2.7.1: **gana la restricción más estricta**.
  - **2.7.3 Permisos sección × tiempo (#7):** matriz administrable rol × sección × ventana temporal aplicada en
    servidor; extiende el `blockedReason` de hoy para que la UI diga SIEMPRE por qué ("Período cerrado", "Fuera de
    ventana", "Asignada a otro rol").
- **Fase 2.8 — Alcance de plantilla + acceso** (#2 + #9; absorbe el diferido (a) de 2.4 y la 2.6.1 planificada):
  - **2.8.0 Multi-nodo (#2):** N:M `TemplateNodeAssignment` (`orgNodeId` + `includeDescendants`) que reemplaza el
    `Template.orgNodeId` único (migración: 1 fila por plantilla existente; 0 filas = global). Cubre los 3 modos
    pedidos (uno / varios / "todos los hijos de X" con herencia a nodos futuros vía path). Al crear entrada: selector
    de nodo filtrado por asignación ∩ ABAC cuando resuelve >1.
  - **2.8.1 UX de acceso (#9 + 2.6.1):** se presentarán 2–3 alternativas con pros/contras ANTES de implementar
    (entrada por nodo vs selector en flujo vs vista global con filtros persistentes — patrones Maximo Start
    Center/"mis activos", j5 listas configurables por estación, Shiftconnector). La 2.6.1 (SavedView + gestor de
    columnas) SE FUSIONA aquí: "filtros persistentes" de #9 y SavedView son la misma pieza.
- **Fase 2.9 — Plantillas inteligentes** (#3 + #8):
  - **2.9.0 Layouts (#3):** modo de presentación por versión (CLÁSICO | PESTAÑAS | WIZARD | COLAPSABLE) + grilla
    responsiva de campos (ancho 1/1, 1/2, 1/3) + separadores/ayudas, todo DATO en la `TemplateVersion`. Referentes:
    NN/g (wizard para proceso secuencial, tabs para acceso aleatorio, accordion reduce visibilidad — el modo lo
    decide el CREADOR según naturaleza), Salesforce Dynamic Forms / page layouts, ServiceNow form sections.
  - **2.9.1 Motor de reglas (#8):** reglas condición→acción como DATO VERSIONADO en la `TemplateVersion`
    (mostrar/ocultar, habilitar/deshabilitar, exigir, calcular, validar entre campos), evaluadas por la MISMA fuente
    única back↔front (generaliza `visibleWhen` + `validateFieldValue` + umbrales ISA-18.2 ya existentes). Referentes:
    ServiceNow **UI Policies** (condición→acción declarativa no-code; con **Data Policies** como espejo server-side =
    exactamente nuestra arquitectura cliente-UX/servidor-garantía) y Salesforce **Validation Rules** (fórmula → error
    bloqueante) + Dynamic Forms (visibilidad condicional por campo/sección). Extensible a acciones futuras
    (notificar, escalar, gatillar incidente — gancho Fase 4).
- **#10 IA-ready = restricción TRANSVERSAL de diseño, no fase**: cada fase deja metadatos estructurados y enumerados
  (dimensiones estampadas, `entryOrigin`, períodos con clave estable, `blockedReason`, reglas como datos versionados)
  que son exactamente el substrato que un LLM necesita para búsqueda en lenguaje natural/resúmenes vía la interfaz
  `LlmProvider` ya abstracta. Se documenta por fase.

**Orden recomendado entre fases: 2.7 → 2.8 → 2.9** (coincide con la inclinación del usuario, con fundamento): (a) la
gobernanza temporal cambia la semántica del CAMINO DE ESCRITURA — mientras antes exista, menos datos nacen bajo
reglas laxas (retrofit barato hoy: `periodKey` ya se estampa); (b) el registro diferido (#1) es EL bloqueador
operacional de adopción (las entradas atrasadas son lo habitual en operación real); (c) #7 necesita período+ventana
para existir y #4 ya dejó el `blockedReason` listo para extenderlo. Contraste honesto: **2.8.0 multi-nodo es barato y
auto-contenido** — si el piloto Eagon lo necesita para estructurar sus bitácoras antes, puede adelantarse como slice
suelto sin romper el orden. 2.6.2 (analítica) queda intercalable tras 2.8; 2.3 Rondas se reevalúa tras 2.7 (sinergia
con período/turnos).

---

### 2026-06-10 · Fase 2.6 Módulo de Bitácoras — diseño COMPLETO + slicing; 2.6.0 (núcleo de lectura) IMPLEMENTADO

Vista de consulta/auditoría sobre todo lo que produce la ejecución (2.4/2.5). El módulo se **diseñó completo de una
vez** (contratos + modelo + arquitectura) y se construye por **sub-slices publicables**: **2.6.0 núcleo de lectura ✅**
(esta sesión) · **2.6.1 personalización** (SavedView server-side como concepto de PLATAFORMA + gestor de columnas +
densidad + última vista) · **2.6.2 analítica/UX avanzada** (facetas con conteo, agrupación con subtotales, peek panel,
sparklines, ⌘K profundo, export con columnas de valores por plantilla). Patrones aplicados: **review by exception**
(ISPE GAMP 5 / EBR — indicadores por fila y vista de excepciones), **§11.50 manifestación de firma** y **§11.70
record–signature linking** (verificación), **ALCOA+** (audit trail unificado), saved searches/list variants
(Splunk/Kibana/SAP/Maximo — 2.6.1), estado de grilla serializable (AG Grid columnState → shape del deep-link y del
futuro `SavedView.config`), event frames de PI (panel de relacionadas). **9 forks confirmados por el usuario:**

1. **`/bitacoras` = pantalla nueva del módulo logbook** (sidebar propio como el prototipo); backend en el MISMO
   `LogEntriesModule` (mismo agregado/autorización), pero **CQRS-lite**: lado de lectura en `LogbookQueryService`
   separado del de escritura (`LogEntriesService`, que ya iba en ~1000 líneas); comparte sus helpers internos.
2. **Timeline fusionada en BACKEND** (`GET :id/timeline`): k-way merge de cambios+transiciones+firmas de sección+
   eventos sintéticos CREATED/SEALED con cursor `(at, id)`. Motivo: orden autoritativo del servidor y paginación
   multi-tabla imposible de hacer bien en cliente; patrón audit trail viewer de Veeva/MasterControl; reusable Fase 4.
   El desempate a igual instante es por `id` (estable para el cursor), no por tipo de evento.
3. **Verificación de integridad ON-DEMAND** (botón por firma) y **AUDITADA** (`logentry.signature.verified`): la
   verificación es un acto de revisión GxP. Veredicto tri-estado: `VALID` (hash coincide con valores actuales) /
   `VALID_RECORD_CHANGED_AFTER` (coincide al REBOBINAR `LogEntryFieldChange` a `signedAt` ⇒ firma íntegra, registro
   editado después — legítimo en flujos multi-estado) / `INVALID` (no reconstruible ⇒ investigar).
4. **Log de cambios por campo = endpoint paginado aparte** (`GET :id/changes`): es append-only y sin tope; el detalle
   queda liviano. En el visor van timeline (narrativa) Y log de cambios (tabla fina) como paneles separados.
5. **SIN permiso nuevo de "auditor"**: `logentry:view` + ABAC ya definen el alcance (el alcance es atributo, no clave
   nueva — NIST SP 800-162); "ver todo" = rol sin restricción de scope; la autoría es FILTRO, no frontera (el logbook
   es registro compartido del turno por diseño). Si un cliente exige "solo mis entradas", será dimensión de scope.
6. **Export CSV WIDE** (1 fila/entrada: columnas de sistema + indicadores), espejo exacto del patrón de
   `/security/audit/export` (lotes keyset, tope 100k, `X-Export-Truncated`, BOM, `;` es-CL). Variante "con columnas de
   valores" SOLO al filtrar por una plantilla → 2.6.2; formato LONG (BI) diferido hasta demanda real.
7. **Vistas guardadas: server-side desde 2.6.1 como plataforma** (`SavedView` con discriminador `module`, config =
   {filters, search, sort, columns{order,hidden,pinned,widths}, density}); vistas de SISTEMA en código (versionables,
   i18n, imborrables por construcción), no en BD. Compartir por rol DIFERIDO (columna aditiva futura).
8. **Facetas con conteo → 2.6.2**; en 2.6.0 ya hay KPIs (`GET /log-entries/stats`: groupBy acotados con el MISMO
   `where` del listado). **Sin virtualización**: cursor keyset + "cargar más" de 50 (un humano filtra, no pagina 5k).
9. **Slicing aprobado** con 2 ajustes: deep-link básico y CSS de impresión SUBEN a 2.6.0.

**Modelo (migración aditiva `20260610051359_add_logbook_review_columns`, las 3 adiciones confirmadas):**
- **`LogEntry.entryNumber`** — folio humano correlativo (`BIT-000123`, helper `formatEntryFolio`); backfill ORDENADO
  por `recordedAt` con secuencia propia (un SERIAL directo asignaría en orden físico). Patrón WO number Maximo.
- **`LogEntrySection.requiresSignature`** — estampado de la definición congelada al instanciar (+backfill): "firmas
  pendientes" pasa a ser `EXISTS (requiresSignature AND signatureId IS NULL)` en SQL, sin join a la definición.
- **`LogEntryValue.thresholdBand`** (enum WARN|CRIT) — banda ISA-18.2 estampada al guardar (la validación ya la
  computa; fuente única `thresholdBandFor` en contracts, también usada por el badge en UI y el backfill
  `db:backfill-threshold-bands`). Habilita filtros/KPIs de excepción sin re-evaluar configs.
- Índices nuevos: `LogEntry(createdById)`, `LogEntry(currentStateKey)`, `LogEntryValue(thresholdBand)` (deuda
  detectada: autoría y estado de flujo sin índice).

**Canonicalización de firma v2 (decisión técnica importante):** el mapa `values` firmado podía contener claves con
`null` SIN fila en BD (inputs vacíos de `saveSection`) ⇒ ambigüedad "clave-con-null" vs "clave-ausente" que produciría
falsos `INVALID` al verificar. `canonicalSignaturePayload` ahora **descarta los valores vacíos**
(`canonicalSignatureValues`, fuente única) y `LogEntryFieldChange.changedAt` se estampa con el MISMO reloj que
`signedAt` (antes lo ponía la BD ⇒ el rebobinado no podía excluir con exactitud los cambios del propio guardado
firmado). **Efecto:** las firmas creadas ANTES de 2.6 cuyo payload contenía nulls verificarían `INVALID`; aceptado
explícitamente porque no existe ninguna instalación productiva (solo datos de demo/smoke). Desde 2.6 el hash es
estable y verificable.

**Decisiones de UI:** filtro de nodo con `Combobox` aplanado + checkbox "incluir descendientes" (el `ScopeTreePicker`
es un editor multi-selección de scope, control equivocado para UN nodo de filtro); el select de "estado del flujo" se
puebla con los estados PRESENTES en el set cargado (self-narrowing honesto hasta las facetas de 2.6.2); atajos "turno
actual" / "este periodo" DIFERIDOS (requieren resolver el calendario en cliente o facetas; hoy van hoy/24h/7d/30d);
filtro de EQUIPO en contrato pero sin UI (2.6.1). `@lyra/ui Chip` gana `onRemove` (chips de filtros activos,
reutilizable por Incidencias). La URL es la fuente de verdad de la grilla (deep-link; base del `SavedView` de 2.6.1).
Orden servidor solo por la whitelist NOT NULL (`recordedAt`/`effectiveAt`/`entryNumber`) — keyset correcto sin ramas
de nulos; el multi-sort de columnas arbitrarias queda para el gestor de columnas (2.6.1) si se justifica.

Tests: contracts **113** (+9) · API **156** (+12). Smoke en vivo **22/22** (datos de prueba creados y LIMPIADOS).
Rama `feat/bitacoras-auditor`.

---

### 2026-06-10 · Fase 2.5 Ejecución de flujo + firmas electrónicas Part 11 — IMPLEMENTADO (forks resueltos)

Cierra el bucle de ejecución abierto en 2.4: motor de transiciones + firmas estilo **21 CFR Part 11**
(§11.50/11.70/11.200, ALCOA+, NIST 800-63B step-up). Migración aditiva `20260610035255_add_log_entry_execution`
(`LogEntryTransition` + `LogEntrySignature`). Backend `executeTransition` (rama `feat/ejecucion-flujo`). **5 forks
confirmados por el usuario** con su motivo:

1. **Firma = tabla dedicada `LogEntrySignature` POLIMÓRFICA** (`context` TRANSITION|SECTION_COMPLETION, check XOR), no
   embebida. Motivo: §11.50/11.70 piden la firma como entidad de primer orden enlazable; cubre tanto la firma de
   transición como la de completitud de sección (`LogEntrySection.signatureId` la anticipaba); mismo patrón XOR que
   Scope/ExternalReference.
2. **Se hashea un snapshot canónico (SHA-256) + metadatos; PKI/sello de tiempo cualificado → Fase 7.** `canonicalSignaturePayload`
   (claves ordenadas recursivamente, determinista) en `@lyra/contracts` = fuente única. Se guarda SOLO el hash (el snapshot es
   reconstruíble desde `LogEntryValue`/`LogEntryFieldChange`). Da integridad/no repudio sin sobre-ingeniería.
3. **Re-auth: firma ⇒ significado + contraseña (§11.200, 2.º componente); MFA step-up SOLO si `requireMfa`** de la transición.
   Las secciones no portan flag de MFA ⇒ su firma de completitud es solo-contraseña. Encapsulado en `ReauthService` (módulo
   auth, reutilizable por Fase 4 / notificaciones con acción firmada).
4. **`status` reconciliado, sin enum nuevo:** `currentStateKey` = verdad del flujo; al entrar a un estado `isFinal` ⇒
   `status=SUBMITTED` (el sellado ya ocurrió en la 1ª transición); `VOID` reservado a anulación. `status` sigue para
   índices/listados gruesos. Evita doble fuente de verdad y migración de enum.
5. **Reversa/anulación de transición (corrección GxP) DIFERIDA** (modelo append-only ya la soporta como transición inversa
   con motivo + firma). Mantiene el alcance en "ejecutar + firmar"; registrada en BACKLOG §2/§3.

**Sellado reconciliado:** movido de `submit` (2.4) a la **1ª transición que sale del estado inicial**; `submit` queda como
finalización SOLO de plantillas sin flujo (degradación elegante). `saveSection` respeta `sealedAt` (no recalcula dimensiones
tras sellar). **Recomputo de secciones** en cada transición: no editable en el nuevo estado ⇒ `LOCKED` (preserva
completitud/firma/autoría); editable y estaba `LOCKED` ⇒ reapertura a `PENDING` (rework). **Gancho** `onTransitionExecuted`
(no-op) = punto único para el bus de eventos/outbox → Notificaciones y umbral→incidencia (Fase 4). Permiso nuevo
`logentry:transition` (catálogo **50**; QUIÉN puede cada transición sigue siendo dato `WorkflowTransitionRole`). El motor
vive en `LogEntriesService` (no en un servicio aparte) para reusar la maquinaria de secciones/valores/validación/sellado
sin duplicarla. Tests: contracts 104, API 144. Smoke en vivo 21/21. `/security-review` sin hallazgos. **Deuda registrada:**
throttle de re-auth de firma (defensa en profundidad), recovery code consumido antes del commit de la tx (operacional).

---

### 2026-06-10 · Fase 2.4 Llenado (Nueva entrada) multi-actor — IMPLEMENTADO (forks resueltos)

Primer slice de EJECUCIÓN: tablas `LogEntry*` (aditivas, migración `20260610011231_add_log_entry`) +
backend `/log-entries` + pantalla de llenado web. Paradigma EBR/GxP: definición versionada inmutable
(`TemplateVersion`) vs ejecución relacional auditada. **4 forks confirmados por el usuario** con su motivo:

1. **Valores en TABLA HIJA** (`LogEntryValue`, 1 fila por campo) **+ historial append-only**
   (`LogEntryFieldChange`), NO un blob JSONB en la cabecera. Motivo: la auditoría por campo (antes/después,
   Part 11) es natural por fila; la concurrencia optimista por sección queda limpia; reporta por columna;
   y habilita el guard real de "code en uso" de Listas. El `value` por fila es JSONB tipado por `dataType`.
   El valor de un campo de referencia se persiste como **`code` estable, no label** (dimensión de DW / FHIR Coding).
2. **Secciones INSTANCIADAS** (`LogEntrySection` con estado/filledBy/firma/`version`), no derivadas de la
   versión. Motivo: la sección porta ESTADO de ejecución (completitud, autoría, firma, revisión de
   concurrencia) que NO se puede derivar de la plantilla. Los campos siguen viviendo en la versión congelada
   (no se instancian); solo se instancian secciones + valores.
3. **Concurrencia optimista POR SECCIÓN** (`version` Int, check-and-bump → `ConflictException` 409). Motivo:
   coincide con el paradigma "sin bloqueo global, multi-actor por secciones"; el operador A y el técnico B
   editan secciones distintas en paralelo sin pisarse. Por entrada serializaría; por campo sería sobre-ingeniería.
   La autorización por sección = `(editable en `currentStateKey`) × (rol de sección, dato `TemplateSectionRole`
   + override por campo `TemplateFieldRole`) × (ABAC `orgNodeId`)`. Validación 100% en servidor
   (`validateFieldValue`, fuente única reusada por el cliente para feedback inmediato).
4. **Sellado: `recordedAt` al crear (inmutable); `effectiveAt` + dimensiones (turno/día operacional/periodo,
   vía `ShiftResolver`) se RECALCULAN en cada guardado mientras la entrada es DRAFT y se CONGELAN al ENVIAR**
   (`sealedAt`, `status=SUBMITTED`). Motivo: el campo `EFFECTIVE_DATE` puede llenarse a mitad de camino; sellar
   al crear estamparía el turno con la hora equivocada. Sellar al enviar es el momento "commit" GxP. Degradación
   elegante: sin calendario → dimensiones null; sin campo `EFFECTIVE_DATE` → `effectiveAt = recordedAt`.

**`workflowDefinitionVersionId` DENORMALIZADO** en `LogEntry` (copiado al crear): la entrada vive su ciclo bajo
la versión de flujo que congeló su `TemplateVersion`, aunque el flujo publique v(n+1) después.

**Límite del slice (acordado):** la entrada permanece en su **estado inicial**; el motor de TRANSICIONES y las
firmas Part 11 son **2.5**. En plantillas multi-estado solo se llenan en 2.4 las secciones del estado inicial;
las plantillas sin flujo se llenan completas (degradación elegante). `LogEntryTransition` queda modelado; su
tabla se crea en 2.5 (mismo criterio con que `LogEntry` se difirió a 2.4).

**DRY de UI:** se extrajo `FieldControl` (control de campo interactivo + solo-lectura) como fuente única que
reusan la vista previa del Form Builder y el llenado, para que nunca diverjan.

**Seguimientos registrados** (BACKLOG): selector de nodo para plantillas GLOBALES al crear entrada (hoy se usa
el nodo de la plantilla; las globales requieren `orgNodeId`); re-seed del borrador local al resolver un 409
(hoy se recarga la query pero el borrador conserva los valores intentados); motor de transiciones/firmas (2.5).

---

### 2026-06-09 · Fase 2.3.0 Calendario operacional — IMPLEMENTADO (forks resueltos)

Implementada la decisión de abajo. **Forks confirmados por el usuario** y su justificación:

1. **Forma del modelo = entidad padre + hijos** (`OperationalCalendar` 1—N `OperationalShift`), no
   JSON embebido. Los turnos necesitan identidad estable (`code`), orden y validación individual;
   reusa el patrón `ReferenceList`/`ReferenceItem`. El guardado **reemplaza los turnos en bloque**
   (set pequeño y cohesivo, mismo criterio que estados/transiciones de un flujo).
2. **Catálogo VIVO (como Listas), NO versionado-inmutable.** La inmutabilidad histórica la dará el
   **estampado** de `operationalDate`/`shiftCode`/`periodKey` en `LogEntry` al sellar (2.4); el cambio
   queda en `AuditLog` (before/after). Registrada como mejora futura "shift definitions con vigencia"
   por si un cliente necesita re-resolver timestamps históricos con definiciones de su época.
3. **Sin solapes (error duro) + huecos permitidos.** Un instante cae en ≤1 turno (clave de dimensión
   única); pero una operación de turno único es válida: una lectura fuera de turno resuelve
   `shiftCode=null` conservando su `operationalDate`. Validación por "pintado" de minutos en un círculo
   de 1440 (cubre también suma de duraciones > 24 h).
4. **TZ = UTC + `Intl` nativo** (sin luxon/date-fns-tz, requisito on-prem). Se guarda UTC; el resolver
   convierte a hora de pared local del sitio con `Intl.DateTimeFormat` (DST correcto: los límites de
   turno son hora de pared). El probador convierte hora-de-sitio→UTC con el offset de la TZ.
5. **Periodo HÍBRIDO** (flexible multi-industria, no scheduler): `MONTH` + `anchorDay` (1..28; mes
   26→25), `WEEK` + `startWeekday` (llave = fecha de inicio de semana), `CUSTOM` = ciclo de N días
   operacionales desde una fecha ancla (quincena 14, ciclo 28, rosters; llave = fecha de inicio del
   ciclo). **Fuera de alcance (BACKLOG):** calendario fiscal 4-4-5 (meses de largo variable) y rotación
   de cuadrillas / turno distinto por día de semana (sería el scheduler genérico que la decisión excluyó).
6. **Asignación por nodo = FK `OrgNode.operationalCalendarId` + resolución por ruta materializada**
   (nodo → ancestro más cercano con calendario → `isDefault`) + picker mínimo sobre el árbol existente
   (no toca la pantalla de Estructura). Exactamente un calendario `isDefault` (mantenido en tx; el
   default no se puede borrar).

**Entregado:** `@lyra/contracts/operational-calendar` (schemas + DTOs + `validateOperationalCalendar`
fuente única + **`resolveShift` función PURA** `timestamp→(operationalDate, shiftCode, periodKey)`, 30
specs incl. DST Santiago / borde de mes / ciclo CUSTOM / WEEK / huecos). 4 permisos (catálogo **45**).
Migración aditiva `20260609233155_add_operational_calendar`. Backend `OperationalCalendarModule` (CRUD
gateado/auditado + `preview`) + **`ShiftResolver`** (clase abstracta = token DI, patrón `EmailService`;
elige el calendario por nodo y delega en `resolveShift`; exportado para 2.4/2.3/Fase 5). Web
`/calendario-operacional` (master-detail + editor de turnos con **timeline 24 h** + selector de ancla +
periodo + **probador** en vivo + asignación de nodos). Seed demo `mina-rajo`. Tests: contracts 76, API
119. Smoke en vivo OK (preview DST, validación de solape 400, borrar default 400, ciclo create/setDefault/
assign/delete + limpieza). **Pendiente: smoke VISUAL** (BACKLOG §4).

### 2026-06-09 · Calendario operacional (turnos + periodo contable) — dimensiones derivadas, NO campos (aprobado)

Inquietud del usuario (correcta) antes de 2.4: **turno, periodo contable y fecha** son **estructurales/contextuales**,
como el nodo de la estructura organizacional — una plantilla los *puede* usar o no, pero **no son campos que el
operador escribe**. Investigado el estándar y aprobada la solución + el orden.

**Cómo lo hace la industria:** un **Calendario Operacional / Shift Calendar** como **configuración de primera clase**,
separado del formulario. SAP PP/PM (*factory calendar* + *shift definitions/sequences*), MES (Wonderware/AVEVA,
Rockwell: módulo "Shift Calendar" con *production day*), **ISA-95 Parte 2** (*resource/operations calendars*),
historiadores PI/AVEVA (*shift reports*/event frames). Es el patrón **dimensión de Fecha + Turno del Data Warehouse**:
el *hecho* (la lectura) recibe claves de Fecha/Turno/Periodo **derivadas del timestamp al cargar**. Concepto central:
**"día de producción" ≠ "día civil"** — el día operacional arranca en el cambio de turno (p. ej. 07:00), por eso el
**mes contable puede empezar en el 2.º turno del día 1** (caso que planteó el usuario).

**Decisión (extiende el modelo de campos de sistema de 2.1.1):** los campos de sistema son **intrínsecos, DERIVADOS,
no tipeados**. Ya existen `recordedAt` (commit, UTC) y `effectiveAt` (hora de negocio, del campo con rol
`EFFECTIVE_DATE`). **Turno y Periodo son dos dimensiones más, derivadas de `effectiveAt`** (fallback `recordedAt`):

1. **Módulo de configuración `OperationalCalendar`** (mantenedor hermano de Estructura/Seguridad/Listas): **turnos**
   (`code` A/B/C, label, `startTime`, `durationMinutes` — la duración resuelve el cruce de medianoche sin
   ambigüedad), **ancla del día operacional** (a qué hora/turno empieza el día de producción), **definición del
   periodo** (`MONTH`/`WEEK`/`CUSTOM` + ancla; el "mes de producción" va del inicio del día operacional del día 1 al
   del 1 del mes siguiente), **TZ del sitio** (se guarda UTC, se resuelve en la TZ para que los límites de turno
   caigan bien). Alcance: un calendario por defecto (single-tenant), **asignable por nodo modelado** sin
   sobre-ingeniería al inicio.
2. **`ShiftResolver`** (servicio tras interfaz, patrón `LlmProvider`/`EmailService`): `timestamp → (operationalDate,
   shiftCode, periodKey)`. Fuente única consumida por 2.4 (estampa), 2.3 Rondas (programa por turno) y Fase 5
   (cambio de turno).
3. **En `LogEntry` (2.4):** columnas **indexadas, inmutables, nullable** `shiftCode?`, `operationalDate?`,
   `periodKey?` estampadas por el resolver al sellar la entrada → reportabilidad por turno/periodo sin recalcular y
   offline-friendly. **Opt-in / degradación elegante:** sin calendario configurado quedan en null y la plantilla que
   no lo necesita los ignora (igual que anclar a un nodo o marcar `EFFECTIVE_DATE` es opcional).

**Orden de fases (aprobado por el usuario): `2.3.0` ANTES de `2.4`.** El calendario es **pura configuración** (bajo
riesgo, como las Listas) y es el **cimiento compartido** de 2.4 (estampado), 2.3 Rondas (programación por turno) y
Fase 5. Hacerlo primero ⇒ la **primera entrada real ya nace clasificada** por turno/periodo (sin backfills) y se evita
diseñar el `LogEntry` dos veces. Re-slicing: **2.3.0 Calendario operacional → 2.4 Llenado → 2.3 Rondas → 2.5 …**
(ver BACKLOG §2). NO es un scheduler genérico; se mantiene simple y anclado a la práctica industrial.

### 2026-06-09 · Datos de referencia — Import/Export CSV de ítems (implementado)

Primer quick-win del roadmap industrial (ver entrada "mirada crítica"). Patrón **dry-run enterprise** (SAP LSMW /
Salesforce Data Loader): el archivo NUNCA se aplica a ciegas. Forks confirmados por el usuario (4/4 con la opción
recomendada):

- **Metadata APLANADA en columnas `metadata.<clave>`** (Excel-friendly; la unión de claves de todos los ítems,
  orden alfabético; valores no-string → JSON en la celda). Round-trip: lo exportado se reimporta tal cual.
- **Upsert por `code` + `deactivateMissing` OPT-IN**: por defecto solo crea/actualiza (ausentes intactos); con el
  checkbox los ítems activos ausentes del archivo se **desactivan** (nunca DELETE — gobernanza del catálogo).
- **Export con `;` / import auto-detecta `;` o `,`**: Excel es-CL usa `;` como separador de listas; `toCsv` ganó
  parámetro de delimitador (default `,` → el export de Auditoría queda intacto). Parser RFC 4180 propio
  (`common/csv-parse.ts`, sin dependencias): comillas dobladas, delimitadores/saltos DENTRO de celda, BOM, CRLF/LF.
- **Tope `REFERENCE_IMPORT_MAX_ROWS=5000` por env** (env.schema + .env.example): 5k filas ≈ 400 KB < bodyLimit
  1 MB de Fastify; catálogos mayores van por el sync de Fase 3. El CSV viaja como TEXTO en el body JSON (el cliente
  lo lee con FileReader) → **sin dependencia multipart**.
- **Flujo en 2 fases**: `POST /reference-lists/:id/import` con `dryRun:true` parsea + valida (cabecera: code/label
  requeridos, columnas desconocidas → 400 claro; por fila: longitudes, duplicados en archivo, active/sortOrder,
  metadata con inferencia de tipos y JSON inválido → error con **nº de línea**) y devuelve el **reporte de diff**
  (create/update/unchanged/deactivate/error + `changes` por campo) SIN escribir. El commit **re-valida todo** (no
  confía en ningún preview), con errores **no aplica nada**, escribe en **transacción** y audita
  (`referencelist.imported` con el summary). Comparación de metadata por **JSON canónico** (claves ordenadas).
- **Export** `GET /reference-lists/:id/export` (gate `referencelist:view`; el import gate `referencelist:manage`):
  CSV BOM UTF-8 + `Content-Disposition` fechado, mismo molde que Auditoría.
- **Web**: botones Exportar/Importar en el panel de detalle; modal de 2 pasos (archivo + checkbox → analizar →
  summary en chips + tabla paginada del reporte → aplicar, deshabilitado con errores).
- **Verificado**: typecheck/lint/build web (1927 módulos)/test (**contracts 46** +2 · **API 110** +13: 6 del parser,
  7 de import/export) + **smoke en vivo** (export de `failure-modes` con metadata aplanada; dry-run con fila errónea
  → BD intacta; commit → metadata persistida; re-import idéntico → todo `unchanged`; `deactivateMissing` desactiva
  el ausente). Datos de prueba limpiados (hard-delete de la lista smoke).

### 2026-06-09 · Datos de referencia — mirada crítica industrial (roadmap; análisis pedido por el usuario)

Revisión contra lo que exige la industria multi-rubro (minería, madera/remanufactura, energía, manufactura),
anclada en **ISO 14224** (taxonomías jerárquicas de equipos/fallas), **Reference Data Management** (IBM/Informatica:
atributos tipados, jerarquías, mapeos, vigencia), **FHIR ValueSet/ConceptMap** (codes inactivos, crosswalks) y la
práctica de SAP/Oracle (LOVs dependientes, validez por fechas). Conclusión: **la base es correcta** (code estable +
metadata jsonb + gobernanza activar/desactivar cubren el 80%), y los gaps reales son **aditivos** (no exigen
re-migrar). Prioridades fijadas (implementación: cada una en su sesión, BACKLOG §2):

1. **Import/export CSV masivo de ítems** (ALTA — el gap más real): una planta carga cientos/miles de codes desde
   Excel/ERP; el alta uno-a-uno no escala. Export ya tiene patrón (Auditoría RFC 4180); import = upsert por `code`
   con dry-run/reporte de difs. **Primer quick-win candidato.**
2. **Jerarquía de ítems** (`parentId` self-FK, ALTA-MEDIA): ISO 14224 es jerárquico (categoría→subcategoría→modo);
   áreas→subáreas; especies→productos madereros. Aditivo; el picker gana agrupación/árbol.
3. **Listas dependientes / cascada** (MEDIA, **diseñar con 2.4**): filtrar opciones por el valor de OTRO campo
   (subárea según área; modo de falla según clase del equipo). Modelable como
   `optionSource.referenceList.filter: { byFieldKey, metadataKey }` — necesita el motor de llenado para validarse.
4. **Atributos tipados por lista** (MEDIA): hoy la metadata es key-value libre (flexible pero sin gobierno);
   RDM define el **esquema de atributos por dominio**. `ReferenceList.metadataSchema` (jsonb) que valida los ítems
   al guardar → reportes consistentes sin basura.
5. **Vigencia por ítem** (`validFrom`/`validTo`, MEDIA): contratistas, normativas, reactivos con caducidad. Aditivo;
   el resolve filtra por fecha efectiva.
6. **Mapeo de códigos externos por ítem** (MEDIA-ALTA pero **atada a Fase 3**): el code interno ≠ el ID de SAP/MES
   (patrón ConceptMap/crosswalk). Tabla `ReferenceItemMapping(systemKey, externalCode)` o reuso de
   `ExternalReference`; se decide junto al motor de sync (`source=EXTERNAL`).
7. **Deprecación con reemplazo** (`replacedByCode`, BAJA-MEDIA): cuando un code se retira, los reportes puentean al
   sucesor (patrón SCD/ConceptMap).
8. **Resolve server-side con búsqueda+paginación** (MEDIA, con 2.4/Fase 3): hoy el resolve trae la lista completa
   (correcto hasta ~1k ítems); para 5k+ el picker debe buscar en servidor.
9. **i18n de labels** (Fase 7) y **presentación semántica por ítem** (color/icono/abreviatura — la metadata ya puede
   llevarlo hoy; se formaliza si se repite el patrón).

**Decisión:** NO se migra nada ahora (todo es aditivo cuando toque); se registra el roadmap priorizado en BACKLOG §2.
El orden recomendado: CSV import/export (sesión propia) → jerarquía → tipado de metadata; cascada y resolve paginado
se diseñan con 2.4; mapeos externos con Fase 3.

### 2026-06-09 · UI — fix de recorte de paneles flotantes + primitivo `LookupPicker` (patrón Value Help)

Hallazgo del smoke visual del usuario: el panel del `Combobox` en la **vista previa** del Form Builder se salía del
viewport (siempre abría hacia abajo). Fix en `@lyra/ui`: **`panelPlacement`** compartido — el panel abre hacia
**arriba** cuando no hay espacio debajo y **acota su altura** al espacio disponible; aplicado a `Combobox` y
`MultiSelect` (mismo defecto latente).

Además, segundo pedido: un objeto de selección **más potente que un combo** para listas grandes. Investigado el
patrón de las grandes plataformas — **SAP Fiori "Value Help Dialog"**, **Salesforce Lookup**, **Oracle popup LOV**,
Dynamics lookup — el patrón común es: trigger compacto → **diálogo con búsqueda + tabla** (columnas ricas, paginada)
→ selección **borrador** con checkbox que se aplica **al confirmar** (en single, el clic confirma y cierra) →
selección vigente visible como **tokens removibles con ×** bajo el campo. Nuevo primitivo **`LookupPicker`** en
`@lyra/ui` (compone Modal + Table + Input + Checkbox existentes; columnas código/etiqueta/detalle, sortable +
paginada + búsqueda sin acentos). **Aplicación:** en la vista previa, un MULTISELECT ligado a una **Lista de
Referencia** usa `LookupPicker` (la metadata aparece como columna de detalle — ahí se justifica la tabla); el
MULTISELECT inline corto mantiene el `MultiSelect` y el SELECT mantiene `Combobox` (más ágil para selección única).
En 2.4, la elección del widget podrá hacerse configurable por campo (capa de presentación).

### 2026-06-09 · Datos de referencia — endurecimiento UX (grilla enterprise + `Combobox`)

Pulido pedido por el usuario tras 2.x, antes de avanzar de fase. Decisiones:
- **Grilla de ítems enterprise** (no una tabla básica): buscador (code/label/metadata), **filtro de estado**
  (todos/activos/inactivos), **columnas ordenables** (code/label/orden/estado), **paginación** (10/pág), conteo
  "activos · total", y **metadata como chips**. El orden inline ahora **remonta** (`key` por `id+sortOrder`) para
  reflejar el valor del servidor tras editar. Reusa el `Table` de `@lyra/ui` (ya soportaba sort/paginación).
- **Nuevo primitivo `@lyra/ui`: `Combobox`** (single-select buscable con panel **portal**, navegación por teclado
  flechas+Enter, Escape, limpiable, **reposiciona en scroll/resize**). Era un hueco real del design system: existían
  `MultiSelect` (múltiple) y `Select` (nativo, listas cortas) pero no un **autocomplete de selección única** para
  catálogos grandes. **Motivo (objeción del usuario):** un `<select>` nativo no escala a una Lista de Referencia
  larga; el selector debe ser un objeto premium buscable.
- **Aplicación:** en el Form Builder el **selector de Lista** usa `Combobox`; en la **vista previa**, un campo SELECT
  bound a una lista usa `Combobox` y un MULTISELECT usa el `MultiSelect` primitivo (antes pintaba TODAS las opciones
  como chips → se rompía con listas largas). Ambos buscables, premium y consistentes con el resto de la app.

### 2026-06-09 · Fase 2.x — Datos de referencia / Listas (`ReferenceList`/`ReferenceItem`) (implementado)

Hace REAL el `optionSource.referenceList` que 2.1.1 dejó modelado. Investigación de respaldo: **FHIR
ValueSet/CodeSystem**, **Reference/Master Data Management**, **dimensión de Data Warehouse** (guardar code,
no label), **ISO 14224** (taxonomía de fallas como code-list). Decisiones de ejecución (plan + 3 forks
aprobados por el usuario):

- **Catálogo GOBERNADO, NO versionado-inmutable** (a diferencia de Template/Workflow). Es un mantenedor vivo
  estilo `Equipment`/`Role`: `ReferenceList` (key único estable + name + description + `source` MANUAL|EXTERNAL
  + active + sortOrder + **borrado lógico** `deletedAt`) 1—N `ReferenceItem` (`code` estable **único por lista** +
  label + active + sortOrder + **metadata jsonb** enriquecido). **Resuelve la ambigüedad** de la entrada de diseño
  2026-06-09 ("activa/versionable"): el versionado-inmutable **no** aplica aquí; la integridad histórica la dará el
  llenado (2.4) guardando el **code estable**, no una versión de la lista. Migración aditiva
  `20260609205303_add_reference_data` (`migrate deploy`, esquiva el EPERM del DLL con el watch).
- **El valor se persiste como `code` estable, no el label** (regla de oro de reportabilidad = dimensión DW /
  FHIR Coding; ya documentada en 2.1.1). Un **code en uso se DESACTIVA, no se borra** (fork confirmado): en la UI
  la acción gobernada del ítem es activar/desactivar; el **hard-delete de ítem** existe en el backend para limpiar
  errores de captura, pero el **guard de "code en uso" real** (valores de `LogEntry`) se incorpora en **2.4** (hoy
  no hay ejecución que consultar). El `resolve` devuelve solo ítems **activos**.
- **`listKey` por CLAVE, no FK** (coherente con `editableInStateKey` de 2.2): el `optionSource.referenceList.listKey`
  vive en el `config` JSONB del campo y referencia `ReferenceList.key`. La integridad se valida en backend
  (`TemplatesService.saveDraft`: la lista debe existir y estar viva) — **espejo de la validación del binding de
  flujo**. Mantiene config JSONB + degradación elegante (un SELECT inline sigue igual). Una lista **referenciada
  por una plantilla no se borra** (guard en `ReferenceListsService.remove`, consulta JSONB de `TemplateField.config`),
  espejo del guard "en uso" de Flujos. *Nota:* el conteo es **conservador** (cuenta campos de versiones aunque la
  plantilla esté con borrado lógico), mismo comportamiento ya registrado para Flujos (BACKLOG §3).
- **Módulo propio de sidebar** (fork confirmado): `/datos-referencia`, hermano de Estructura/Seguridad/Flujos.
  **4 permisos nuevos** (catálogo 37→**41**): `module:referencedata:view/manage` + `referencelist:view/manage`. El
  `resolve` y la lectura se gatean por `referencelist:view` (lo necesitan también los editores de plantillas para
  el preview); el seed los asigna al rol admin iterando el catálogo (sin código nuevo).
- **UI = mantenedor master-detail** (molde Equipos/Roles, `ResizableSplit`): lista de Listas + panel de detalle
  con grilla de ítems (activar/desactivar, orden inline, editar, eliminar) y drawers de lista/ítem (editor de
  metadata key-value que infiere número/booleano/texto). En el **Form Builder**, SELECT/MULTISELECT gana un selector
  de **fuente de opciones** (inline vs Lista de Referencia); la **vista previa resuelve** las opciones desde la lista
  (muestra label, valor = code). Reusa primitivos `@lyra/ui` existentes (Select/Table/Drawer/Chip); sin componentes nuevos.
- **Frontera con Fase 3/2.4 (intacta):** el **sync** que alimenta/materializa una lista desde ERP/MES/RRHH es Fase 3
  (`source=EXTERNAL` solo modelado). El **llenado** que guarda codes en vivo es 2.4. Seed demo (dev): `failure-modes`
  (ISO 14224, con metadata) + `shifts`.
- **Verificado:** typecheck (6 paquetes) · lint (0 errores; 1 warning preexistente en OrgTree) · build web (1921
  módulos; API NO se buildea por el watch) · test (**contracts 44** +5 · permissions 5 · **API 97** +8 de
  `ReferenceListsService`). **Smoke en vivo** (demo): CRUD lista/ítem; key duplicada 400; code duplicado por lista
  400; resolve (excluye inactivos, conserva metadata); binding en `saveDraft` (listKey inexistente 400 / válido 200);
  lista EN USO no se borra 400. Datos de prueba ad-hoc limpiados (hard-delete); las 2 listas del seed quedan como
  demo dev-only.

### 2026-06-09 · Eventos de dominio + Webhooks salientes (diseño; implementación diferida)

Necesidad planteada por el usuario: el sistema debe poder **empujar datos** (bitácoras, incidencias, transiciones,
etc.) a **sistemas externos vía webhooks**. Decisión de diseño: introducir un **backbone de EVENTOS DE DOMINIO**
con **patrón outbox** que es la **fuente común** tanto de las **Notificaciones** (sumidero a personas) como de los
**Webhooks salientes** (sumidero máquina-a-máquina). Aún NO se programa.

- **Eventos de dominio** versionados: `logentry.created`, `logentry.transitioned`, `incident.created`,
  `incident.transitioned`, `task.*`, `structure.*`, etc. Se persisten en una tabla **outbox** (misma transacción
  que el cambio → entrega "at-least-once" garantizada) y un worker los despacha **asíncrono**.
- **Webhooks salientes** (patrón Stripe/GitHub): **`WebhookSubscription`** (URL endpoint, tipos de evento
  suscritos, **secreto** para firma **HMAC** del payload, headers custom, activo, **credencial cifrada en reposo**)
  + **`WebhookDelivery`** (log de intentos, status, **reintentos con backoff**, **replay** manual). Payload JSON
  estable y versionado. On-prem friendly: solo HTTP POST saliente (egress + secretos). Auditado.
- **Relación con lo demás:** comparte el backbone con la **Mensajería/Notificaciones** (ver entrada siguiente) — un
  mismo evento alimenta reglas de notificación y/o suscripciones de webhook. **Amplía el punto "D: Webhooks"** de la
  integración pendiente (estaba acotado a cambios de estructura; ahora es transversal a bitácoras/incidencias/flujos).
  Es el **espejo SALIENTE** de la Fase 3 (Orígenes de datos = entrante); puede vivir en Fase 3 o en un módulo de
  integración propio. Se construye **con/después de Fase 2.5** (cuando existen los eventos de transición).
  Refs: Stripe/GitHub webhooks (HMAC + reintentos + replay), patrón transactional outbox.

### 2026-06-09 · Plataforma de Mensajería / Notificaciones multicanal (diseño; implementación diferida)

Necesidad planteada por el usuario: una transición de flujo (y, por extensión, incidencias/turnos) debe poder
**notificar** — correo (con enlace para **aprobar/rechazar**), **WhatsApp**, **SMS**, in-app — de forma
**configurable y enterprise**, con **mantenedor de plantillas de mensaje**. Decisión: es un **subsistema de
plataforma transversal**, NO una feature de flujos; se reutilizará en Flujos (2.5), **Incidencias (Fase 4,
SLA/escalamiento)** y **Cambio de turno (Fase 5)**. Aún NO se programa. Pilares (estándar tipo ServiceNow/Jira/
Camunda + EBR/GxP):

- **Abstracción de canal enchufable** (`NotificationChannel`: EMAIL/SMS/WHATSAPP/IN_APP/WEBHOOK) detrás de una
  interfaz, **igual patrón que `EmailService`/`LlmProvider`** (token DI). **Reutiliza el `EmailService` +
  `SmtpEmailService` ya existentes** (Fase 1, nodemailer/Mailpit). SMS/WhatsApp = proveedores **opcionales**
  (Twilio / Meta Cloud API) — nunca obligatorios (respeta on-prem / sin SaaS forzado).
- **Mantenedor de `NotificationTemplate`** (canal, asunto, cuerpo con **variables de merge**, i18n, versionable):
  mismo molde de mantenedor de la casa.
- **Disparo declarativo = DATO, POR TRANSICIÓN:** se configura en **cuáles** transiciones se gatilla mensaje y en
  cuáles no, y **qué** mensaje. Campo **aditivo** `notifications` en `WorkflowTransition` = lista **0..N** de
  {plantilla, canal(es), destinatarios, condición opcional}. Coherente con "roles por transición = dato".
  Resolución de **destinatarios** por roles→usuarios / usuarios / el asignado / **cadenas de escalamiento**.
- **Acciones desde el mensaje (aprobar/rechazar)**: **token de acción firmado, single-use, con TTL y alcance**
  (entry+transición+usuario+nonce), reusando el patrón de `PasswordResetToken` (se guarda el hash). **Restricción
  Part 11:** si la transición exige firma, el enlace **NO** aprueba de un clic — aterriza en una página que
  **re-autentica (MFA step-up) y captura el significado**; el "un clic" solo aplica a transiciones **sin** firma y
  **siempre auditado**. Es superficie de auth → **requiere security review** al implementarse.
- **Entrega asíncrona** (cola + reintentos), **estado/auditoría de envío**, **rate-limit**, **preferencias/opt-out**
  por usuario y canal.
- **Secuenciación**: el *motor de disparo* necesita la **ejecución de transiciones (Fase 2.5)** (antes no hay
  evento que notificar). Se construye **con/después de 2.5** como módulo de plataforma; el **mantenedor de
  plantillas** puede adelantarse. El campo `notifications` en `WorkflowTransition` se añade de forma **aditiva**
  cuando toque (no ahora). Ya parcialmente anticipado en BACKLOG §3 ("notificaciones SMTP SLA/escalamiento").

### 2026-06-09 · Fase 2.2 — Flujos reutilizables (`WorkflowDefinition`) (implementado)

Implementación del fork 4 (flujos REUTILIZABLES) fijado el 2026-06-09. Un flujo es una **máquina de estados
configurable** (estados + transiciones), **NO BPMN**, integrada al RBAC dim. 3 (la autorización por transición es
DATO). Solo lado **DEFINICIÓN**: la ejecución (LogEntry/transiciones en vivo/firmas) sigue diferida a 2.4/2.5.
Investigación de respaldo: FSM declarativa (XState / Step Functions Standard, no orquestador BPMN), ciclo de vida
de registro controlado (21 CFR Part 11 / GAMP 5 / ALCOA+), validación de máquina (1 inicial, ≥1 final,
alcanzabilidad, sin trampas). Decisiones de ejecución (aprobadas por el usuario, plan + 3 forks):

- **Versionado/congelable estilo Template.** `WorkflowDefinition` (contenedor mutable) 1—N
  `WorkflowDefinitionVersion` (INMUTABLE al publicar) → `WorkflowState` + `WorkflowTransition` +
  `WorkflowTransitionRole` (roles permitidos por transición = dato, mismo patrón que `TemplateSectionRole`).
  El builder edita SIEMPRE un borrador; publicar congela; editar publicada **clona** un borrador nuevo (espejo
  exacto de `TemplatesService`). Flags por transición `requireSignature`+`signatureMeaning` y `requireMfa`
  (step-up AAL) **modelados** y se honran en ejecución (2.5).
- **`editableInStateKey` de sección por CLAVE, no FK** (objeción aceptada): la versión de plantilla congela una
  versión de flujo; la sección referencia un estado *dentro de esa versión* por su `key` estable, igual que
  `visibleWhen` referencia campos. Un FK a `WorkflowState.id` acoplaría a IDs de una versión concreta sin ganar
  integridad (la da el congelamiento de la versión). Coherente con la intención ya documentada en 2.1.
- **FK desde `TemplateVersion`** (reemplaza las columnas string de 2.1): `workflowDefinitionId` →
  `WorkflowDefinition`, `workflowDefinitionVersionId` → `WorkflowDefinitionVersion`, ambas **`onDelete: Restrict`**
  (un registro histórico no queda sin su flujo; el borrado del flujo es lógico vía `deletedAt`). Aditivo: las
  columnas existían en null (no había editor), así que añadir el FK no toca datos. `WorkflowsService.remove`
  además **bloquea** borrar un flujo en uso por una versión de plantilla.
- **Binding flujo↔plantilla validado en backend** (`TemplatesService.saveDraft`): el flujo debe existir, estar
  **PUBLICADO** y la versión a congelar debe ser su `currentVersionId` vigente; cada `editableInStateKey` de
  sección debe ser una clave de estado de esa versión. Sin flujo (`null`) ⇒ ninguna sección puede declarar
  estado (**degradación elegante**: form simple). El binding se preserva al clonar borrador.
- **Validación de la máquina = fuente única** `validateWorkflowMachine` en `@lyra/contracts` (1 inicial exacto,
  ≥1 final, claves únicas, refs válidas, alcanzabilidad desde el inicial, sin trampas). La usa el `superRefine`
  del contrato, el backend (defensa en profundidad, al guardar y al publicar) **y** el builder web (feedback en
  vivo + deshabilita publicar si es inválida). Se confirmó el fork: **≥1 estado final exigido para publicar**.
- **Permisos** (catálogo 33 → **37**): `module:workflows:view/manage` (módulo/sidebar, mi adición por
  consistencia con los demás módulos — aprobada en el fork) + `workflow:view/manage` (acción, coarse estilo
  Roles). La autorización **por transición** NO es clave de catálogo: vive en `WorkflowTransitionRole`. Seed los
  asigna al rol admin (itera el catálogo, sin código nuevo).
- **UI = editor declarativo, NO canvas BPMN** (fork confirmado): mantenedor `features/workflows` (lista estilo
  Plantillas + `WorkflowBuilder` con listas de estados/transiciones + roles por transición + validación FSM en
  vivo). El Form Builder gana: selector de flujo publicado, mapeo sección→estado y editor de override de rol por
  campo (`TemplateFieldRole`, que ya persistía en backend desde 2.1).
- **Editor del override por campo (`TemplateFieldRole`)**: el modelo y el persistir ya existían (2.1); 2.2 agrega
  solo el editor UI (multiselect de roles por campo; vacío = hereda la sección).
- **Refinamiento UX (mismo día, pulido del builder a pedido del usuario):** la validación de la máquina se
  clasifica por **severidad** — `error` (integridad: claves duplicadas, transición a estado inexistente) **bloquea
  guardar Y publicar** (banner rojo); `pending` (falta inicial/final, inalcanzable, trampa) **solo bloquea
  publicar** (banner ámbar "pendiente de conectar"). Así un borrador a medio construir **se puede guardar** (antes
  el `superRefine`/backend exigían la máquina completa al guardar → no se podía guardar WIP). El contrato y
  `WorkflowsService.saveDraft` ahora solo exigen INTEGRIDAD; **`publish` sigue exigiendo la máquina completa**.
  Helper `hasBlockingMachineErrors`. Además: header de columna **fijo (sticky `top:58px`** = alto del topbar de la
  app, que es el contenedor sticky; el `.tabsBar` no lo es) para no perder "Agregar estado/transición" en listas
  largas, y **tabla resumen** de transiciones (etiqueta · desde→hacia · firma · MFA · roles), **plegable y plegada
  por defecto**. **Nuevo primitivo `@lyra/ui`: `MultiSelect`** (token-picker con búsqueda + chips + panel portal
  acotado con scroll / seleccionar-todos / limpiar / conteo) que **reemplaza las listas planas de checkboxes de
  roles** (no escalaban con catálogos grandes) en: roles por transición del flujo, y en el Form Builder los roles
  de sección y el override de rol por campo. Tests: contracts 39, API 89.
- **Verificado:** typecheck/lint (0 errores; 1 warning preexistente en OrgTree)/build web (1911 módulos)/test
  (contracts 39 · permissions 5 · API 89) en verde. **Smoke en vivo** (demo): flujo crear→borrador→máquina
  inválida (sin final / inalcanzable) 400→publicar (congela)→listar→borrar 204; binding plantilla↔flujo (estado de
  sección válido persiste; estado inexistente 400; versión no vigente 400; flujo EN USO no se borra 400); severidad
  (guardar con pendiente 200 / publicar con pendiente 400 / guardar con error de integridad 400). Datos de
  prueba limpiados (hard-delete). Migración `20260609163822_add_workflow_definition` aplicada con `migrate deploy`.

### 2026-06-09 · Fase 2.1.1 — Endurecimiento de modelo (ADITIVO): campo en 3 capas + `optionSource` (implementado)

Implementación del endurecimiento de modelo fijado el mismo día (ver entrada siguiente), ANTES del llenado (2.4)
y mientras no hay datos de ejecución. Todo aditivo/no destructivo. Decisiones de ejecución (aprobadas por el usuario):

- **`dataType` (capa 2) DERIVADO, no editable.** Enum Prisma `FieldDataType` (12 valores, MAYÚSCULAS coherente con
  `FieldType`; incluye TIME/FILE/GEO/COMPUTED sin productor aún, forward-compat de la taxonomía). El backend lo deriva
  del `type` al guardar (fuente única `deriveDataType` en `@lyra/contracts`); la UI no lo muestra ni lo envía. Mapeo:
  NUMBER→NUMBER, TEXT/TEXTAREA→STRING, SELECT→**CODE**, MULTISELECT→**CODE_ARRAY**, BOOLEAN→BOOLEAN, DATE→DATE,
  DATETIME→DATETIME, **SEVERITY→CODE** (escala cerrada {1..5} = dimensión reportable, lista de sistema implícita),
  **SIGNATURE→REFERENCE** (el valor referencia la firma/identidad del firmante; ejecución en 2.5).
- **`semanticRole` (capa 3) nullable, sin miembro `NONE`.** Enum `FieldSemanticRole?` (EFFECTIVE_DATE/TITLE/
  PRIMARY_EQUIPMENT/SEVERITY_DRIVER); null = sin rol (más limpio que un `NONE` redundante). En 2.1.1 **solo
  `EFFECTIVE_DATE` tiene editor y comportamiento** (promueve `LogEntry.effectiveAt` en 2.4). **A lo sumo un campo
  por versión** puede ser `EFFECTIVE_DATE`: validado en el contrato (`saveTemplateDraftRequestSchema.superRefine`) y
  en el backend; la UI desmarca los demás al marcar uno.
- **`optionSource` discriminado reemplaza `options[]`** en SELECT/MULTISELECT: `inline` (`{code,label}[]`, único
  editable hoy — `value`→`code`), `referenceList` (`listKey` string; entidad `ReferenceList` + FK en 2.x, mismo patrón
  que `WorkflowDefinition` en 2.2) y `external` (`sourceKey`; Orígenes de Datos Fase 3) **modelados** sin resolución.
  **Sin migración SQL:** los `config` son JSONB; el helper `upgradeFieldConfig` (en contracts) sube el shape legacy
  `{options:[{value,label}]}` → `{optionSource:{kind:'inline',items:[{code,label}]}}` al **leer** (`mapVersion`),
  **escribir** (`preprocess` Zod + en `saveDraft`) y **clonar** (`ensureDraft`). Idempotente. **El valor de una
  referencia se persiste como `code` estable, no el label** (reportabilidad = dimensión DW / FHIR Coding).
- **Migración aditiva `20260609155007_add_field_layers`:** crea los 2 enums, agrega `dataType`/`semanticRole` a
  `TemplateField` **nullable**, **backfillea `dataType` desde el `type`** existente (CASE), y luego `dataType SET NOT
  NULL`. No altera ni borra datos (había 14 filas de smokes visuales previos; quedaron backfilleadas). Aplicada con
  `migrate deploy` (no regenera cliente → evita el EPERM del rename del DLL del engine con el watch del API vivo).
- **`LogEntry` se DIFIERE 100% a 2.4** (recomendación del agente, aprobada). Crear tablas nuevas es aditivo; un
  esqueleto sin la lógica de llenado se validaría mal (riesgo de re-migrar). Los campos de sistema + `effectiveAt`
  quedan como **diseño** en DATA_MODEL/DECISIONS; 2.1.1 endurece solo el lado DEFINICIÓN.
- **Form Builder (cambios mínimos):** el editor de opciones inline ahora escribe `optionSource.inline.items`
  (`code`/`label`); toggle **"Fecha efectiva del registro"** (`Checkbox`) en campos DATE/DATETIME que conmuta
  `semanticRole`; `dataType` oculto/derivado. Dual theme, i18n es-CL, 44px. **Verificado:** typecheck/lint/build/test
  (contracts 23, API 78) en verde + **smoke en vivo** (crear → guardar con SELECT optionSource + DATE effectiveDate →
  leer `dataType` derivado/`semanticRole`/`optionSource` normalizado → legacy `options[]` se sube a inline → 2×
  EFFECTIVE_DATE ⇒ 400 → borrar 204; datos de prueba limpiados).

### 2026-06-09 · Fase 2 — Modelo de campo en 3 capas, campos de sistema, y DATOS DE REFERENCIA (dirección aprobada)

Sesión de diseño pedida por el usuario antes de seguir, con investigación de industria (FHIR Questionnaire/SDC,
Reference Data Management, dimensiones de data warehouse, taxonomías de form builders). Aprobado: (1) modelo de
datos de referencia con **Listas gobernadas + `optionSource`** guardando el **code** estable; (2) hacer primero
un **endurecimiento de modelo 2.1.1** (aditivo) antes de 2.2 Flujos. Aún NO se programa.

**Principio rector — un campo son 3 capas separadas** (como FHIR `item.type` + `answerOption/answerValueSet`):
1. **Presentación/widget** (cómo se ve: selector, radio, slider, matriz…).
2. **Tipo de dato** (cómo se almacena/valida/reporta: string, number+unidad, boolean, date/time, **code** =
   referencia única, **code[]**, **reference** = id de entidad, file, geo, **computed**).
3. **Rol semántico** opcional (qué significa para el sistema: `effectiveDate`, `title`, `primaryEquipment`,
   `severityDriver`…). El almacenamiento/reporte sigue al **tipo de dato**, no al widget. La UI sigue simple;
   el MODELO lleva `dataType` + `optionSource` + `semanticRole?`.

**Campos de SISTEMA vs CONTENIDO (Tema 1 — reportabilidad temporal):**
- **Intrínsecos** en cada `LogEntry` (Fase 2.4), capturados SIEMPRE, como **columnas indexadas** inmutables/
  auditadas: `recordedAt` (commit), `createdBy`, `orgNode`, `equipo?`, versión, estado, periodo/turno?, firmas.
  La trazabilidad temporal NO es opcional ni un "campo que se agrega": es estructural.
- **Fecha efectiva de negocio** (hora de lectura/evento ≠ captura): es un campo DATE/DATETIME/TIME con
  **rol `effectiveDate`** → la plataforma lo promueve a una columna `effectiveAt` indexada. Si la plantilla no
  marca ninguno, `effectiveAt` cae a `recordedAt`. "Estructural donde importa, opcional donde no", vía rol.

**DATOS DE REFERENCIA (Tema 2 — el diferenciador). `optionSource` discriminado** reemplaza el `options[]`
literal de SELECT/MULTISELECT:
- `inline` — `{code,label}[]` en el campo (caso trivial; lo actual, solo envuelto).
- `referenceList` — FK a una **Lista de Referencia** interna gobernada (RECOMENDADO para lo reutilizable/reportable).
- `external` — endpoint de Orígenes de Datos (Fase 3), resuelto en backend/cacheado, **materializable** (sync)
  en una Lista de Referencia.

Entidades nuevas (módulo propio "Datos de referencia / Listas", hermano de Estructura/Seguridad):
- **`ReferenceList`**: `key`, `name`, `description`, `source` (MANUAL | EXTERNAL), activa/versionable.
- **`ReferenceItem`**: `code` (**clave estable**), `label`, `active`, `sortOrder`, **`metadata` jsonb** (atributos
  enriquecidos: falla→{categoríaISO, severidadDefault}; contratista→{rut, vigencia}; químico→{CAS}…).

**Regla de oro de reportabilidad (patrón dimensión de DW / FHIR Coding):** el valor de la entrada almacena el
**`code` estable, NO el label**. Los reportes unen valor→`ReferenceItem` y traen label + metadata → agrupar/
filtrar por atributos enriquecidos. Labels cambian sin romper histórico; un code en uso **no se borra** (se
desactiva). Permiso `referencelist:manage`, auditado. **Persistencia = eficiencia + offline en terreno** (no se
machaca la API en cada render). En **Fase 3**, un endpoint externo alimenta/sincroniza una Lista (ERP/MES/RRHH).

**Taxonomía de OBJETOS (Tema 3) — roadmap incremental** (enum aditivo en Postgres; `config`+`dataType`+
`optionSource` cubren las necesidades):
- Alto valor próximo: **Conforme/No conforme/N.A.** (tri-estado de inspección), **lookup/picker de referencia**
  (single/multi), **picker de Equipo/Usuario/Nodo** (`reference`), **grupo repetible / tabla-matriz**, **campo
  calculado/fórmula**, **bloque de instrucción**, **TIME** + `effectiveDate`.
- Evidencia (MinIO; modelar ahora, construir hacia Fase 7): adjunto, **foto**, **código de barras/QR**, **GPS**.
- Ligeros: escala/Likert, slider %, rating, email, teléfono, URL, auto-numérico.

**Qué FIJAR en 2.1.1 (aditivo, ANTES del llenado 2.4, para no migrar con datos):** `options[]`→`optionSource`
(`inline` ahora; `referenceList`/`external` modelados), agregar `dataType` (derivable del tipo) y `semanticRole?`
al campo, y dejar definido que el valor de una referencia se guarda como **code**. El mantenedor de Listas es su
propia sesión; el sync externo es Fase 3. **Re-slicing:** 2.1.1 endurecer modelo → 2.2 Flujos → **2.x Datos de
referencia** (antes/junto al llenado) → 2.3 Rondas → 2.4 Llenado (guarda code/refs + fechas sistema/efectiva) →
expansiones de tipos → Fase 3 alimenta/sincroniza listas. Refs: FHIR ValueSet/answerValueSet, IBM Reference Data
Management, dimensión de data warehouse (code vs label), ISO 14224 (taxonomías como code lists), ISA-95 (master data).

### 2026-06-09 · Fase 2.1 — Plantillas: modelo de DEFINICIÓN + contratos + Form Builder (implementado)

Implementación de 2.1 sobre la arquitectura fijada el mismo día (ver entrada siguiente). Decisiones de
ejecución tomadas con el usuario (4 forks, todos con la opción recomendada):

- **Umbrales del campo NÚMERO = bandas estilo ISA-18.2.** `config` lleva `min`/`max` (rango válido duro) +
  bandas opcionales `warnLow/warnHigh` (advertencia) y `critLow/critHigh` (crítico). El cruce del rango
  crítico **alimentará** la creación de incidencia en Fase 4. Es más rico que el `min/max` único del
  prototipo y diferencia a Lyra de un Forms genérico. Retro-compatible.
- **Tablas de EJECUCIÓN diferidas a 2.4.** En 2.1 se migra SOLO el lado **definición** (`Template`,
  `TemplateVersion`, `TemplateSection`, `TemplateField`, joins `TemplateSectionRole`/`TemplateFieldRole`).
  Las tablas `LogEntry*` se diseñan en contratos pero se migran cuando se construya el llenado (2.4), donde
  su forma se valida con lógica real. **Agregar tablas nuevas es aditivo/no destructivo** ⇒ no contradice
  "diseñar el modelo completo desde el inicio" (lo que esa regla evita son los `ALTER` destructivos).
- **`WorkflowDefinition` como entidad llega en 2.2.** En 2.1 la versión referencia el flujo por **columnas**
  (`workflowDefinitionId`/`workflowDefinitionVersionId` nullable, sin FK) y la sección guarda
  `editableInStateKey` (clave de estado, sin FK). La entidad y su FK se añaden con su mantenedor en 2.2.
  Firma (`requireSignature` en versión y sección) y recurrencia (`recurrenceKind`/`recurrenceConfig`) van
  como columnas opt-in modeladas; sus editores en 2.3/2.5.
- **Tipos de campo = 8 núcleo con editor + SEVERITY/SIGNATURE modelados.** El enum `FieldType` tiene los 10;
  el builder edita los 8 núcleo (NUMBER/TEXT/TEXTAREA/SELECT/MULTISELECT/BOOLEAN/DATE/DATETIME). Agregar más
  valores al enum en Postgres es aditivo (no re-migra).
- **Permiso por sección editable ahora; override por campo modelado.** El builder asigna **roles por
  sección** (join `TemplateSectionRole`). El override por campo (`TemplateFieldRole`) existe en el modelo;
  su editor llega en 2.2 junto al binding sección→estado del flujo.

**Inmutabilidad / versionado (patrón MMR de 21 CFR Part 11):** el builder edita SIEMPRE una versión en
**BORRADOR**. Publicar congela esa versión (`PUBLISHED`, `publishedAt/By`) y fija `Template.currentVersionId`.
Editar una plantilla publicada **clona** la versión publicada en un nuevo borrador `v(n+1)` (las publicadas
nunca se mutan). Verificado en smoke en vivo (crear→borrador→publicar v1→editar→clona borrador v2→borrar).

**`config` como JSONB validado por unión Zod** (`fieldConfigSchemaFor(type)`), no columnas por atributo: el
universo de tipos/config es abierto y heterogéneo; columnas serían un mar de NULLs. La validación de config
**contra el tipo** se aplica en backend (request `saveDraft`) — verificado: opciones en un NÚMERO ⇒ 400.

**Claves estables de sección/campo:** se generan al crear (slug único) y se preservan; el `visibleWhen`
(condicional) referencia por clave, estable entre recargas. **Alcance ABAC al listar:** plantillas globales
(sin nodo) visibles para todos; las ancladas a un nodo, solo si está en el alcance del usuario (reusa
`ScopeService`). **Nuevo primitivo `@lyra/ui`: `Textarea`** (los demás componentes se reusaron; los del
builder son de dominio y viven en `features/templates`).

### 2026-06-09 · Fase 2 — Arquitectura enterprise del Form Builder (forks CONFIRMADOS por el usuario)

> Diseño de fondo pedido por el usuario para que el módulo de plantillas/bitácoras marque diferencia con
> sistemas tipo "Forms" genéricos. Anclado a **registros electrónicos GxP / 21 CFR Part 11** (batch records),
> **máquinas de estado** (no BPMN pesado) y a la auth RBAC/ABAC ya existente. Los 4 forks quedaron
> **confirmados el 2026-06-09** (ver al final). Aún NO se programa.

**Paradigma (la idea que rompe con "un form plano"):** un formulario **no** es una lista de campos que se
llena de una vez; es un **proceso = documento vivo** compuesto de **secciones**, donde cada sección tiene
**dueño** (rol/permiso), **momento** (estado del flujo en que es editable) y **estado de completitud/firma**.
El **registro** (entrada de bitácora) instancia una **versión** de la plantilla y avanza por un **flujo de
estados configurable**; en cada estado se habilitan/bloquean secciones para ciertos roles. *Quién llena qué y
cuándo* **emerge** de `secciones × flujo × RBAC/ABAC`, sin lógica a medida. Es el paradigma del **registro
electrónico por lotes (EBR/GxP)** aplicado a bitácoras operacionales.

**Elegancia clave — la maquinaria enterprise es OPT-IN (degradación elegante):** una plantilla con **una
sección, un estado, sin firma** se comporta como un form simple tipo Google Forms. Secciones múltiples, flujo,
permisos por sección y firmas se activan **solo cuando se configuran**. Así no complejizamos lo simple.

**La SECCIÓN es la unidad atómica** de: permiso de llenado, asignación a estado del flujo, completitud,
bloqueo y firma. Resuelve el requisito "varios usuarios llenan distintas secciones en distintos instantes":
el operador A llena la Sección 1 en T1 (atribuida `filledBy/At`, opcionalmente firmada → bloqueada), el
técnico B llena la Sección 2 en T2. **No hay bloqueo global del formulario**; la concurrencia es por sección
(concurrencia optimista con revisión por sección). "Distintos permisos por instante" = la editabilidad de una
sección es función de **(estado del flujo) × (rol/permiso) × (alcance ABAC)**.

**Definición (config versionada) vs Ejecución (relacional + auditada):**
- *Definición:* `Template` + **`TemplateVersion` inmutable** (al publicar se congela: secciones, campos,
  flujo y config de firma). Las entradas referencian una **versión** concreta → editar la plantilla luego no
  altera registros históricos (auditabilidad). Campos con `type`, `required`, validaciones (min/max/umbral/
  unidad/regex), visibilidad condicional, orden, sección.
- *Ejecución:* `LogEntry` (versión, alcance/nodo/equipo, periodo/turno opcional, `currentState`),
  `LogEntrySection` (estado pending/in_progress/completed/locked + `filledBy/At` + firma), `LogEntryValue`
  (valor actual) con **historial por campo** (reusar `AuditLog` quién/qué/cuándo/antes-después),
  `LogEntryTransition` (log del flujo: from→to, actor, motivo, firma).

**Flujo = máquina de estados configurable, integrada al RBAC dim. 3 (workflows):** estados + transiciones;
cada transición guarda **roles/permiso permitidos como DATO** (no hardcodeado) + flags `requireSignature?`,
`requireMfa?` (step-up AAL para acciones críticas). Entrar a un estado recomputa qué secciones son editables.
Esto reusa la dimensión 3 de permisos ya diseñada (`docs/SECURITY.md` §2). **No** se usa un motor BPMN: una
máquina de estados liviana y declarativa basta.

**Firmas electrónicas (diferenciador enterprise, estilo Part 11):** opcionales por completitud de sección y
por transición. Registran `userId`, timestamp UTC, **significado** ("Revisado"/"Aprobado") y **hash del
payload firmado**; re-autenticación (contraseña/MFA step-up) configurable. Junto con la auditoría append-only
ya existente → registros con validez probatoria (minería/farma/energía). Es lo que separa esto de un Forms
genérico.

**Validación y umbrales:** el backend valida valores contra las reglas de la versión al guardar y como
**guardas de transición** (p. ej. no se puede "enviar" si faltan secciones obligatorias). Los umbrales marcan
lecturas fuera de rango y **modelan** una regla que, en **Fase 4 (motor de incidencias)**, disparará una
incidencia. En Fase 2 solo se modela la regla; **la creación de la incidencia se integra en Fase 4**.

**Cómo atacarlo sin perder el hilo (un objetivo por sesión; el MODELO se diseña completo desde el inicio para
no migrar después):**
1. **Plantillas: modelo + contratos + Form Builder (estructura).** `Template`/`TemplateVersion` + secciones +
   campos (tipos núcleo) + validaciones básicas + **vista previa** + **borrador/publicar con versión
   inmutable**. Flujo y firma quedan **modelados en contratos** aunque su editor UI venga después. Sin llenado.
2. **Editor de flujo + permisos de sección** (definición): estados/transiciones, asignar secciones a estados y
   roles, config de firma.
3. **Llenado (Nueva entrada) multi-actor:** secciones editables según estado+rol; guardar con validación
   backend + auditoría por campo + concurrencia por sección.
4. **Ejecución de flujo + firmas:** transiciones gateadas, firma electrónica (re-auth/MFA), bloqueo/desbloqueo
   de secciones, log de transiciones.
5. **Bitácoras: listado + detalle + línea de tiempo + log de cambios** (vista de auditor del registro vivo).
6. **(cruce Fase 4)** reglas que disparan incidencias.

**Permisos nuevos (catálogo `@lyra/contracts`, asignación = dato):** `template:view/create/edit/publish/delete`,
`logentry:view/create/fill`, y transiciones vía datos de la transición (roles permitidos) en lugar de claves
hardcodeadas. Confirmar en el diseño detallado.

**Forks CONFIRMADOS por el usuario (2026-06-09) — definen el modelo:**
1. **Captura temporal = AMBAS, completas.** (a) registro **colaborativo por fases** (secciones llenadas por
   distintos usuarios en distintos momentos) **y** (b) **rondas/lecturas programadas recurrentes** por
   turno/periodo. ⇒ Se modela **`LogPeriod`/programación** (turno/intervalo/calendario): una plantilla puede
   declararse **recurrente** y cada ocurrencia genera/abre un `LogEntry` ligado a su periodo; además el
   registro admite llenado colaborativo por secciones. Investigar estándar de **rondas/turnos** (ISA-95, shift
   handover) antes de modelar el calendario; mantenerlo simple (no un scheduler genérico).
2. **Firmas electrónicas estilo Part 11 = SÍ**, configurables por plantilla/transición (opt-in), con re-auth /
   **MFA step-up** reutilizando el MFA ya implementado. Diferenciador para auditorías.
3. **Granularidad = SECCIÓN por defecto + OVERRIDE por campo** donde se justifique. El modelo de permisos de
   llenado se resuelve a nivel sección, con posibilidad de afinar por campo.
4. **Flujo = DEFINICIONES REUTILIZABLES.** `WorkflowDefinition` es **entidad de primera clase** (catálogo de
   flujos: estados + transiciones + roles/permiso + firma), referenciada por las versiones de plantilla
   (varias plantillas pueden compartir un flujo). Mantenedor propio (estilo Roles). La **ejecución** sigue
   normalizada (`LogEntry.currentState`, `LogEntrySection`, `LogEntryTransition`). La versión de plantilla
   **congela** qué `WorkflowDefinition` (y versión de éste) usa, para no alterar registros históricos.

**Ajuste al modelo por los forks:** entidades nuevas respecto a la propuesta inicial → **`WorkflowDefinition`**
(catálogo reutilizable, versionado/congelable) y **`LogPeriod`/config de recurrencia** (rondas/turnos). El
slicing por sesión se reordena en BACKLOG §2 para incluir un mantenedor de **Flujos** (2.2) y la
**Programación de rondas** (2.3) antes del llenado.

### 2026-06-08 · Reset de contraseña por administrador (contraseña temporal, estilo AD)

Hueco detectado en la UI de Seguridad: no había forma de que un admin restableciera la contraseña de un
usuario existente (solo existía el self-service por correo y el alta con temporal). Se implementó la
**variante A** (aprobada por el usuario), que es el patrón de **Active Directory / helpdesk** y el más
adecuado para terreno industrial (no asume que el operador tenga correo):

**El admin fija/genera una contraseña temporal** → el backend la valida contra la política, marca
`forcePasswordChange = true` (el usuario la cambia al primer ingreso), **revoca TODAS las sesiones** del
objetivo (la cuenta pudo verse comprometida), invalida enlaces de reset pendientes y **audita**
(`auth.password.admin_reset`). **No toca el MFA** — contraseña y segundo factor son factores distintos
(coherente con el reset self-service y con el reset de MFA, que tampoco se cruzan). El admin ve la temporal
un instante; es de un solo uso efectivo por el cambio forzado. Fundamento: NIST 800-63B + práctica AD.

- **Permiso nuevo `user:reset-password`** (catálogo 25→**26**), **separado** de `user:edit` — igual que
  `user:reset-mfa` está separado — para poder dar "reset" a soporte sin edición completa. Asignación = dato
  en BD (seed lo agrega al rol admin).
- **Backend**: `AuthService.adminResetPassword` (reusa `policy`/`passwords`/`tokens`/`resets`/`audit`) +
  `POST /security/users/:id/reset-password` (`AdminResetPasswordRequest`). **3 tests** nuevos.
- **UI**: subsección "Contraseña" en la pestaña *Seguridad* del detalle (gateada por `user:reset-password`)
  + `ResetPasswordModal` (temporal con generador/mostrar-una-vez + aviso de revocación de sesiones y cambio
  forzado). Helper `generateTempPassword` compartido con el alta (sin duplicar).
- **Variante B (enlace por correo) descartada como default**, registrada como opción futura cuando haya SMTP
  y el usuario tenga correo: preserva privacidad (el admin no ve la clave) pero no sirve a operadores sin
  buzón. Ver BACKLOG.

### 2026-06-08 · Modelo de usuario alineado a SCIM + costura de federación (diseño; implementación diferida a v2)

Decisión de **diseño** (sin migraciones aún) sobre qué datos tendrá `User` y cómo dejar lista la
identidad federada (AD / OIDC / SAML) para la próxima versión, de modo que activarla sea **aditivo** y no
un refactor. Anclado a estándares: **SCIM 2.0** (RFC 7643/7644 — el esquema que Entra ID/Okta/Google/
JumpCloud usan para aprovisionar), **OIDC Core §5.1** (claims) e **inetOrgPerson** (LDAP/AD).

**Catálogo de datos de usuario (referencia SCIM, priorizado para este producto industrial):** identidad/login
(`userName` login estable + `externalId` del IdP, separados del email de contacto que puede cambiar), nombre
(`givenName`/`familyName` además de `displayName`), contacto (`emails[]` con primario, `phoneNumbers[]` —
clave para notificaciones/escalamiento HSE), empleo/organización (`employeeNumber`, `title`/cargo,
`department`, `manager`, `costCenter`), ubicación/sitio (encaja con el **scope ABAC** = nodo de estructura),
locale/i18n (`preferredLanguage`, `timezone` — sellos de tiempo por turno), ciclo de vida (`active` —ya
existe `status`—, validez `validFrom`/`validTo` para contratistas, `userType`), avatar y auditoría
(`created`/`lastLogin`, ya presentes).

**Costura de federación (lo crítico, decidido a nivel de diseño):**
1. **`User` = principal canónico; identidades enganchadas aparte.** Patrón Keycloak/Auth0/Entra: tabla
   **`UserIdentity`** (`userId`, `provider` ∈ {LOCAL, OIDC, SAML, LDAP}, `providerKey` = instancia,
   `subject`/`externalId` estable del IdP, `claims jsonb`, `linkedAt`). Permite **account linking** (password
   local + cuenta OIDC del mismo usuario) sin duplicar. Es la contraparte de datos de la "auth enchufable"
   (DECISIONS 2026-06-05).
2. **Atribución de origen + *mastering* de atributos.** Cuando el IdP es dueño de `displayName`/`email`/
   `department`, esos campos pasan a **solo-lectura** en la UI (sincronizados por SCIM/JIT). Marca por
   usuario/campo quién manda (`authProvider`/`managedExternally`) para que un sync no pise ediciones locales.
3. **Password y MFA opcionales/delegados.** Usuario federado **sin `passwordHash`** (debe ser nullable) y su
   AAL/MFA puede venir del IdP → `mfaMode` debe poder **deferir** al proveedor (no exigir TOTP propio si el
   IdP ya hizo MFA).
4. **Grupos del IdP → roles** vía tabla de mapeo (el RBAC ya es 100% dato).

**Plan de implementación (cuándo):**
- **No ahora:** SCIM completo sería sobre-ingeniería (CLAUDE.md) — la mitad de los campos no los consume
  ningún módulo todavía.
- **Set lean a agregar cuando se justifique (barato, alto valor, ya usable por bitácoras/notificaciones):**
  `username` (login estable, opcional, ≠ email), `firstName`/`lastName`, `phone`, `jobTitle`, `employeeId`,
  `preferredLanguage`/`timezone`. Mapean 1:1 a SCIM/OIDC.
- **Diseñar listo, implementar en v2:** `UserIdentity` + `authProvider` en `User` (default `LOCAL`) +
  `passwordHash` nullable + reglas de mastering → activar un proveedor = migración aditiva, sin tocar `User`.
- **Diferir a v2:** SCIM inbound, JIT provisioning, mapeo grupo→rol, validez por fechas de contratistas,
  multi-email/multi-phone, MFA delegada.

Registrado en BACKLOG §2 (Identidad/Federación v2) y §3 (deuda: `passwordHash` nullable, separar login de email).

### 2026-06-08 · UI de Seguridad (usuarios/roles/política/auditoría) sobre `/security/*`

Consume el backend de seguridad ya existente (RBAC/ABAC, política, MFA, reset de admin, auditoría). Decisiones (aprobadas tras propuesta):

**Navegación: sub-rutas anidadas + match por prefijo (UNA pestaña por módulo).** `/seguridad` es un `SecurityLayout` con barra de sub-tabs y `Outlet`; las sub-secciones son rutas anidadas reales (`/seguridad/{usuarios,roles,politica,auditoria}`), deep-linkables y gateadas cada una por su permiso (`user:read`/`role:read`/`security:policy:manage`/`audit:read`). El índice redirige a la primera sub-tab permitida. Para que el shell (pestañas/breadcrumb/sidebar) trate todo `/seguridad/*` como **un** módulo se añadieron helpers `routeForPath` (coincidencia por prefijo más largo) e `isRouteActive` en `navigation.ts`, y se ajustaron AppShell/WorkspaceTabs/Topbar/Sidebar. **Motivo:** deep-linking y breadcrumbs por área sin ensuciar la tira de pestañas con 4 entradas; patrón reutilizable para futuros módulos con sub-secciones (Plantillas, etc.).

**UX de usuarios: master-detail** (mismo patrón que Estructura, `ResizableSplit`). Lista a la izquierda; panel derecho con secciones independientes que guardan por separado contra los endpoints atómicos del backend: datos básicos (`PATCH :id`), roles (`PUT :id/roles`), alcance de datos (`PUT :id/scope`) y MFA (estado + reset `POST :id/mfa/reset`). **Selector de alcance (ABAC dim. 4):** árbol de la estructura con checkbox por nodo + toggle "incluye descendientes" por entrada. La vista node-centric/por-rol (asignar desde el propio árbol, "quién accede a este nodo") queda como ítem ABAC enterprise futuro (BACKLOG §2).

**Contrato de auditoría añadido** (`auditLogEntrySchema` + `AuditLogEntry` en `@lyra/contracts`): el `GET /security/audit` retornaba filas Prisma crudas sin tipo compartido. Se tipó el controller y se mapea `occurredAt`→ISO string (forma de respuesta idéntica en el cable; solo se formaliza). `before`/`after`/`metadata` son `unknown` (snapshots JSON). Paginación por cursor de `id` (UI con `useInfiniteQuery` + "cargar más").

**`scopeEntrySchema`: se quitó `.default(true)` de `includeDescendants` (campo explícito).** El default hacía que el tipo de **entrada** Zod (`includeDescendants?`) difiriera del de **salida**, y los helpers tipados del cliente (`apiJson`) infieren el de entrada → conflicto "dos tipos distintos con el mismo nombre". Hacerlo explícito (la UI siempre lo envía) alinea input/output y es más estricto. **Motivo:** correctitud de tipos extremo a extremo sin castings.

**Nuevo primitivo `@lyra/ui`: `Checkbox`** (CSS Module sobre tokens, dual theme, área táctil 44px, estado **indeterminado** para selección de grupo). Lo exige la matriz de permisos (agrupada por `group`/`dimension` del catálogo) y reutilizado en scope/roles.

**Hallazgo (honestidad técnica): el permiso `user:disable` no está enforced.** El cambio de `status` (ACTIVE↔DISABLED) viaja por `PATCH :id`, gateado por `user:edit`, no por `user:disable`; el permiso del catálogo queda sin guard que lo exija. La UI gatea el control de estado por `user:edit`; `user:disable` se registra como deuda en BACKLOG §3 (decidir: separar endpoint o retirar la clave). No se tocó el backend "cerrado" en esta sesión más allá del tipado de auditoría.

### 2026-06-08 · Módulo Equipos: modelo `Equipment` integration-ready + `ExternalReference` polimórfica (modelo) + catálogo de categorías

Cierre del módulo de Estructura. Reemplaza el placeholder "Equipos — próximamente" del nivel final por un CRUD real. Decisiones (aprobadas por el usuario tras propuesta):

**Modelo `Equipment` integration-ready (entidad separada, NO 4.º nivel de OrgNode).** Patrón SAP PM: Functional Location (OrgNode) 1:N Equipment. Campos: identidad (`name`, `code?` corto interno, **`tag?` @unique** = assetTag estable, clave de negocio/reportes), clasificación (`categoryId?` → catálogo configurable), `manufacturer/model/serialNumber`, `criticality?` (Int **1–5**, RCM/ISO 14224, reusa la escala Severidad 1–5 del DS), `active` (estado operacional) **+** `deletedAt` (borrado lógico — son conceptos distintos), `reportOrder` (orden en informes por nodo), y **`orgNodeId`** (FK a OrgNode). Decisiones de criterio que difieren del enunciado inicial y fueron aceptadas:
- **`orgNodeId`, no `processId`:** el DB no puede forzar "último nivel" (los niveles son configurables y un Proceso podría ganar hijos); el modelo admite cualquier nodo y la **UI** muestra la sección Equipos solo en el nivel final. Nombre consistente con `Scope.orgNodeId` / `ExternalReference`.
- **Sin `abbreviation`** (redundante con `code`) y **sin `externalCode` plano** en Equipment: los mapeos van por `ExternalReference`. El `externalCode` plano de OrgNode queda como deuda a migrar a `ExternalReference` (BACKLOG §3).
- **`criticality` acotada por check constraint** (`1..5` o NULL), análogo al check del Scope.

**Clasificación = catálogo configurable `EquipmentCategory`, NO enum ni texto libre.** Mismo espíritu que `OrgLevel`: `name`, `code?`, `isoRef?` (alineación **opcional** a ISO 14224, sin forzarla), `description?`, `reportOrder`, `active`. Texto libre rompería consistencia/reportes; un enum hardcodeado violaría "nunca hardcodear lo configurable" (madera ≠ minería) y obligaría a migrar por cliente. Se entrega con seed inicial editable **+ drawer de gestión** (molde `LevelsDrawer`) gateado por permiso nuevo `equipmentcategory:manage`, para que "configurable" sea real desde ya.

**`ExternalReference` polimórfica: modelo ahora, UI/motor en Fase 3.** Dueño `orgNodeId?` **XOR** `equipmentId?` (**check constraint raw SQL**, mismo patrón que `Scope` — validado en BD: ambos-nulos→falla, uno→OK, ambos→falla). Campos `systemType` (String, catálogo configurable que se define en Fase 3 — no enum), `externalId` (WebID/NodeId/Equipment Number), `externalPath` (PI AF/OPC browse path), `endpoint`, `metadata jsonb`, `enabled`. **Se descartó construir UI de mapeos esta sesión:** sin el motor de Fase 3 no se puede validar un WebID/NodeId ni probar conectividad → sería UI desechable (lo que CLAUDE.md prohíbe). El costo real a evitar era el modelo polimórfico + backfill, que queda resuelto. Un equipo mapea a varios sistemas a la vez ⇒ el `externalCode` único no bastaba.

**Permisos nuevos** (catálogo `@lyra/contracts`, asignación = dato en BD): `equipment:view/create/edit/delete` + `equipmentcategory:manage` (total catálogo: 20→25).

**Guard nuevo en `deleteNode`:** bloquea borrar un nodo con equipos activos (simétrico al bloqueo por hijos), evitando equipos huérfanos.

**Equipos NO es módulo de sidebar:** vive dentro de `/estructura` (en `NodeDetail` del nivel final), gateado por `module:structure:view`; las acciones gatean el CRUD interno. Sin cambios de navegación.

### 2026-06-08 · Estructura: UX de layout responsivo, splitter propio, `description` y `reportOrder`

Sesión de pulido de UX del mantenedor de Estructura (continuación). Decisiones:

**Workspace full-width y responsivo (token-first).** Se eliminaron los `max-width` (1320/1400px) y `margin:0 auto` que dejaban el contenido flotando con márgenes vacíos en monitores anchos, y el **doble padding** (shell + page). El padding del workspace pasa a tokens de layout nuevos en `@lyra/ui` (`--layout-content-pad-x/y`, `--layout-tree-width`) con breakpoints explícitos: mobile <768px (apilado), tablet/desktop, wide >1920px (padding y árbol crecen). Motivo: usar todo el ancho disponible en cualquier resolución; cambios en una sola fuente de verdad.

**Splitter de paneles propio, NO `react-resizable-panels`.** Se probó la librería (v4) y se descartó: aplica el `className` a un **div anidado** mientras su contenedor externo (con `overflow:hidden` y tamaño propio) **recortaba** el contenido del árbol (nombres invisibles, scroll horizontal), además de imponer topes de redimensionado arbitrarios. Se reemplazó por **`ResizableSplit`** (en `@lyra/ui`, ~120 líneas, sin dependencia): ancho izquierdo explícito en px, panel derecho `flex:1`, divisor con **pointer events + teclado (flechas) + táctil**, doble clic para resetear, ancho persistido en `localStorage`, re-clamp con `ResizeObserver`. Sin topes arbitrarios; solo mínimos sensatos (220px izq / 360px der) para que ningún panel colapse. **Promovido a `packages/ui`** para reúso (regla del monorepo). Motivo: control total del DOM/CSS = contenido siempre ajustado (ellipsis, no recorte) y comportamiento "inteligente" sin pelear con el modelo de la librería; bundle −32 KB.

**`description` (uso del nodo) en `OrgNode`, full-stack.** Campo `String?` (máx. 500). Se muestra como **segunda línea** en el árbol (truncada) y en la grilla de hijos (bajo el nombre), y en el header del detalle. Descripciones de demo (planta de remanufactura de madera, referencia tipo ITI) en **un módulo único** `prisma/structure-descriptions.ts` consumido por el seed (nodos nuevos) y por un **backfill no destructivo** (`db:backfill-descriptions`, solo `description IS NULL`).

**`reportOrder` (orden en informes) por nodo, relativo a hermanos.** Campo `Int @default(0)`. `getTree` ordena por `(reportOrder asc, name asc)` → afecta árbol y grilla. Decisiones de UX confirmadas con el usuario: **edición inline** en la grilla (input numérico por fila, persiste en blur/Enter) y **orden por defecto** por este campo. Orden inicial **escalonado** (10,20,30…) por grupo de hermanos vía helper único `prisma/report-order.ts` (seed + backfill `db:backfill-report-order`, no destructivo). Honesto: el escalonado inicial es **alfabético**, no el flujo físico real de la planta; el usuario lo ajusta desde la grilla.

**Grilla de hijos ordenable.** El `Table` de `@lyra/ui` ya era **controlado** (emite `onSort`, el padre ordena); `NodeDetail` ahora mantiene estado de sort y ordena los hijos localmente (columnas nombre/orden/código/cód. externo). Densidad de tabla reducida (padding `14→10`, `th 10→8`) con `min-height:44px` por fila para preservar el área táctil de terreno.

**Dev server fijado al puerto 5173.** `strictPort:true` en `vite.config` + script `predev` (`scripts/free-port.mjs`) que mata lo que ocupe 5173 antes de arrancar (cross-platform). Motivo: Vite derivaba a 5174+ en silencio y el usuario "no encontraba" la app.

### 2026-06-07 · Estructura v2: layout master-detail + Menu portal + Equipment como entidad separada

**Layout master-detail de dos paneles** (árbol izquierda, detalle derecha) adoptado como patrón estándar para la gestión de jerarquías. Es el patrón de SAP PM (Functional Location / Equipment), IBM Maximo (Asset/Location), Figma (Layers + Properties), VS Code (Explorer + Editor). Ventajas sobre el árbol + menú contextual: sin menús recortados por `overflow:hidden`, más espacio para atributos futuros, navegación por breadcrumb, acciones visibles y contextualizadas.

**Menu portal**: `@lyra/ui/Menu` migrado a `createPortal(panel, document.body)` con `position:fixed`. Solución estándar de la industria (Radix UI, Headless UI, Floating UI) para menus/tooltips/popovers que necesitan escapar de cualquier contexto de apilamiento CSS. El detector de click-fuera usa `panelRef` adicional al `triggerRef`.

**Equipos ≠ 4.º nivel de OrgNode**: los equipos industriales (máquinas) son una entidad operacional distinta de la jerarquía organizacional/funcional. Mezclarlos en OrgNode crearía columnas condicionales (code / externalCode / type / abbreviation / sortOrder / active solo tienen sentido para Equipo). El patrón correcto (SAP PM): Functional Location (OrgNode) 1:N Equipment. El modelo `Equipment` se implementará en sesión posterior con su propia migración, endpoints y grid en NodeDetail.

### 2026-06-07 · Fase 1 (UI): Estructura organizacional — árbol sin librería, MoveModal con ruta materializada
Árbol de nodos implementado como componente recursivo **sin dependencia de librería de árboles**
(custom `OrgTree` + `NodeBranch` en `features/structure/`). Justificación:
- Las estructuras industriales esperadas son de decenas a ~300 nodos: no se justifica virtual scrolling ni lazy loading.
- El árbol tiene comportamientos de dominio específicos (acciones por nodo gateadas por permiso, `Chip` de nivel, reparentado) que no encajan limpiamente en la mayoría de librerías.
- Coste marginal de un árbol recursivo manual es bajo dadas las capacidades ya existentes.

**Reparentado (MoveNodeModal):** se usa el campo `path` (ruta materializada) del backend para pre-deshabilitar en la UI los nodos que no pueden ser padre (el propio nodo y sus descendientes, con `path.startsWith(node.path)`). El backend sigue siendo la fuente de verdad con `assertValidReparent`; la UI mejora el UX sin relajar la seguridad.

**Componentes nuevos en `@lyra/ui`:** `Chip` (badge genérico, 6 variantes), `Table` (sortable, skeleton, dual theme), `Select` (mismo patrón que `Input`). `NodeTag`/`NodeTree` descartados — acoplan el DS al dominio.

**DELETE /structure/levels/:id** añadido al backend (bloquea si hay nodos activos — simétrico al DELETE de nodo que bloquea si tiene hijos).

### 2026-06-06 · Fase 1 (UI): tema claro / oscuro / auto en el workspace (revierte "dark-only v1")
A pedido del producto se incorpora **modo claro/oscuro/auto** en el workspace, **revirtiendo** la regla
de identidad "Dark mode … No hay modo claro en v1" (actualizada en `CLAUDE.md`). Implementación:
- **Token-first, sin tocar componentes**: el tema EFECTIVO se aplica como `data-theme="dark|light"` en
  `<html>`; los tokens se redefinen por tema en `packages/ui/src/tokens/index.css`
  (`[data-theme="dark"]` / `[data-theme="light"]`). Se definió una **paleta clara completa** (fondos,
  bordes, texto, glass, glows, sombras) y dos tokens de interacción nuevos: `--color-hover` (superficies
  hover/activas) y `--color-chrome` (fondo translúcido de sidebar/topbar/pestañas). Se barrieron los
  `rgba(255,255,255,…)` en duro de los componentes del workspace y se reemplazaron por tokens.
- **Preferencia** (`dark`/`light`/`auto`) en `theme-store` (Zustand + persist, `localStorage`,
  no secreto). `auto` resuelve con `prefers-color-scheme` y reacciona a cambios del sistema
  (`use-theme-controller`). Default = **oscuro**. Selector en el top bar y en la command palette (⌘K).
- **La entrada/login es SIEMPRE oscura** (experiencia de marca): `AuthLayout` fuerza `data-theme="dark"`
  en su raíz, por eso el tema solo afecta al workspace.
- **Pestañas de trabajo**: más estilo + animación sobria (línea de acento de marca al activarse,
  entrada `tabIn` fade/slide, se "conectan" al contenido); respeta `prefers-reduced-motion`.
**Pendiente:** QA visual del modo claro en navegador (BACKLOG §4). El default sigue oscuro.

### 2026-06-06 · Fase 1 (UI): App Shell / Workspace premium ANTES de los módulos
Antes de construir la UI de Estructura/Seguridad se construye un **shell de aplicación premium**
(el "área de trabajo"), porque es el marco donde viven todos los módulos y retrofitearlo después
obliga a re-alojar pantallas y, sobre todo, a meter i18n y pestañas en todo lo ya hecho.
- **Secuencia:** shell primero (una sesión enfocada) → luego Estructura nace dentro de él. Los
  primitivos de `@lyra/ui` que faltan (Tabs, Drawer, Modal, Menu, Tooltip, Skeleton, Breadcrumb,
  EmptyState, Toggle) se construyen aquí y se reutilizan en todos los módulos (no es trabajo perdido).
- **Paradigma de navegación: pestañas de trabajo ACOTADAS** (no MDI ilimitado). Tira de pestañas
  fijables (tope ~6); **cada pestaña es una ruta** y el estado se preserva por la **caché de TanStack
  Query** (con `staleTime`), no manteniendo árboles de componentes vivos. Logra el "no salir y entrar"
  sin **datos rancios/memoria** (el "ojo con los refrescos" del usuario) ni la hostilidad del MDI en
  **tablet/terreno con guantes**. Colapsa con gracia en pantallas chicas.
  - **Descartado:** MDI completo (memoria creciente, estancamiento, malo en tablet).
- **i18n-ready desde ahora** (no diferido a Fase 7): capa ligera con **es-CL por defecto** + selector
  de idioma visible; **todos los strings como claves**. Los catálogos de otros idiomas se llenan en
  Fase 7, pero no hay que retrofitear pantallas. On-prem, sin SaaS.
- **Recursos premium del shell:** sidebar colapsable (completo ↔ riel de íconos, persistido),
  **command palette ⌘K** (saltar a módulos/acciones/nodos), top bar con breadcrumbs + búsqueda +
  notificaciones + **menú de perfil** (Mi seguridad/MFA, Preferencias, Logout) + cambio de idioma +
  **toggle de densidad** (cómodo/compacto), **favoritos + recientes**, skeleton loaders + updates
  optimistas. Estado de UI (sidebar/densidad/idioma/pestañas) en `localStorage` (nunca tokens/secretos).
- **Tooling propuesto (a confirmar al implementar):** `react-i18next` (estándar, offline, plural/
  interpolación) y `cmdk` (headless, lo estilizamos con tokens Lyra) — ambos locales, sin SaaS.

### 2026-06-06 · Fase 1 (Auth): MFA self-service — política por rol + enrolamiento forzado
Segundo factor TOTP con enrolamiento **self-service** (el secreto solo lo conoce el dispositivo del
usuario; el admin NUNCA enrola por él). Estándar NIST 800-63B / OWASP ASVS v4 §2. Decisiones:
- **Política de requerimiento** en dos piezas: campo **`Role.requireMfa`** (granularidad por rol) +
  modo global **`PasswordPolicy.mfaMode`** = `OPTIONAL | REQUIRED_BY_ROLE | REQUIRED_FOR_ALL`. El piso
  es **OPCIONAL** (nadie forzado, pero cualquiera puede auto-enrolarse): **se descartó un modo
  "deshabilitado"** que impidiera el enrolamiento voluntario por ser un anti-feature de seguridad.
  Requerimiento **derivado**: `required = ALL || (BY_ROLE && algúnRol.requireMfa)`.
- **Enrolamiento forzado con enforcement en backend (no solo UI).** Análogo a `forcePasswordChange`,
  pero `forcePasswordChange` hoy solo redirige en la UI; para MFA eso **degradaría el AAL** (operar con
  solo-contraseña vía API). Se añadió un claim **`mfaPending`** al access token (recalculado en cada
  emisión/rotación) y un **`MfaEnrollmentGuard`** global que bloquea (**403 `MFA_ENROLLMENT_REQUIRED`**)
  todo salvo lo marcado con **`@AllowPendingEnrollment`** (me, logout, mfa/setup, mfa/verify,
  change-password). Al verificar, un `/auth/refresh` limpia el claim. *Pendiente registrado:* dar el
  mismo enforcement de backend a `forcePasswordChange` (hoy solo UI).
- **Throttle del 2.º factor** (faltaba; NIST §5.2.2 / ASVS §2.2.1): contador **propio** en
  `User.mfaFailedCount`/`mfaLockedUntil`, **separado** del lockout de contraseña (si se compartiera, una
  contraseña correcta reiniciaría el tope del 2.º factor). Tras `maxFailedAttempts` bloquea
  `lockoutMinutes`. Se fijó **ventana TOTP ±1** (RFC 6238) para desfase de reloj.
- **Reset de MFA por admin** (dispositivo perdido): `POST /security/users/:id/mfa/reset`, permiso nuevo
  **`user:reset-mfa`** (catálogo, no hardcodeado). Borra el factor y **revoca TODAS las sesiones** del
  objetivo (evita sesión rancia con el AAL anterior); si el rol sigue exigiendo MFA, cae al gate en el
  próximo login. El admin **no** enrola por el usuario.
- **Sesiones:** auto-activar / auto-desactivar mantienen la sesión actual; **reset de admin revoca
  todo**. Un factor **exigido por política no se puede auto-desactivar** (`disableMfa` lanza 403 si el
  rol lo requiere; solo el admin lo restablece). El reset de **contraseña** sigue sin tocar MFA.
- **Recovery codes:** 10, hasheados, single-use (ya existían); se añadió **regenerar** con
  reconfirmación de contraseña (invalida los anteriores). Se muestran **una sola vez** (copiar/descargar).
- **Frontend:** página de seguridad del perfil (`/perfil/seguridad`) y gate full-screen `/activar-mfa`
  comparten un `MfaEnrollFlow` (QR con **`qrcode.react`** desde el `otpauth://` del backend → verificar →
  códigos). `ProtectedRoute` prioriza cambio de contraseña y luego enrolamiento de MFA.
**Alcance:** el **reset de admin y la lectura de estado** se entregan como **backend + contratos** ahora;
su **UI vive en la pantalla de Seguridad/usuarios** (sesión posterior), para no construir UI desechable.
**Residual honesto:** no se implementa anti-replay del mismo OTP dentro de su ventana (deuda menor).

### 2026-06-06 · Fase 1 (Auth): recuperación de contraseña self-service
Reset por correo siguiendo NIST 800-63B y OWASP ASVS §2.5 / Forgot Password Cheat Sheet.
- **Token**: aleatorio de 256 bits, se guarda **solo el hash SHA-256** (`PasswordResetToken`),
  **single-use** (`usedAt`) y **TTL corto** (`PASSWORD_RESET_TTL`, def. 30 min). Al pedir uno nuevo
  —o al cambiar la contraseña por cualquier vía— los pendientes se invalidan.
- **`POST /auth/forgot-password`**: respuesta **neutra siempre** (`{ok:true}`), sin enumeración de
  usuarios; el correo se envía **en segundo plano** para no filtrar por *timing*. **Rate-limit** por
  correo y por IP (contadores en `CacheService`); superar el tope no cambia la respuesta.
- **`POST /auth/reset-password`**: valida token (hash, no usado, no expirado) con **mensaje genérico**
  ("inválido o expirado"), impone la **política** (complejidad + historial), **revoca TODAS las
  sesiones** (`TokenService.revokeAllForUser`), limpia lockout/`forcePasswordChange`, **no toca MFA**
  (quien controle el correo sigue sin pasar el 2º factor) y **no auto-loguea** (redirige a `/login`).
- **Correo tras una interfaz abstracta `EmailService`** (token DI, patrón tipo `LlmProvider`) con
  implementación SMTP (**nodemailer**); en dev usa **Mailpit**. Sin SaaS obligatorio (on-premise).
  Se envía además una **notificación de seguridad** "tu contraseña fue cambiada".
- **Frontend**: `/recuperar-contrasena` (pedir correo + confirmación neutra) y nueva
  `/restablecer-contrasena?token=…`. **Endurecimiento del token en URL**: se borra de la URL al montar
  (`history.replaceState`) y `<meta name="referrer">` para no filtrarlo por *referer*.
- **Auditoría** append-only: `reset_requested` (con `delivered`), `reset_completed`, `reset_failed`,
  `reset_throttled`.
**Pendiente registrado (mejora transversal, NO en esta sesión):** rechazo de **contraseñas
comprometidas** (NIST 800-63B §5.1.1.2, ej. HIBP k-anonymity o lista local). Aplica a todo seteo de
contraseña (change/force/reset); se diseñará pluggable y apagado por defecto para respetar on-premise.

### 2026-06-05 · Fase 1 (UI): co-branding de la empresa licenciataria + entrada premium
La pantalla de acceso co-marca **producto (Lyra WatchLog) + empresa licenciataria**. Como es
single-tenant on-premise, la identidad del cliente (nombre, rubro, logo) se configura **por entorno**
(`VITE_LICENSEE_NAME/INDUSTRY/LOGO_URL`, `envDir` apunta al `.env` raíz), nunca hardcodeada; sin logo
se usa un **monograma** de iniciales (con fallback automático si el logo falla al cargar). El logo se
muestra sobre **placa clara** para legibilidad de cualquier color. Se añadió un gráfico vectorial
animado propio (constelación Lyra + telemetría operacional) y animaciones de entrada
(`prefers-reduced-motion` respetado).
**Bug corregido en tokens:** los componentes usaban `--space-*`, `--text-*`, `--transition-*` que NO
existían en `@lyra/ui/tokens` (solo `--spacing-*`), por lo que el espaciado y la tipografía colapsaban.
Se agregaron esos tokens (fuente de verdad), mejorando toda la app.

### 2026-06-05 · Fase 1 (UI): login estándar y recuperación asistida (reset self-service PENDIENTE)
El login incorpora lo estándar: mostrar/ocultar contraseña, **recordar correo** (nunca la contraseña),
**¿olvidaste tu contraseña?** y, en el segundo factor, opción de **código de recuperación** (fiel:
`assertSecondFactor` ya acepta TOTP o recovery code). La recuperación de contraseña es **asistida por
administrador** (patrón on-premise estándar) porque el **reset self-service por correo es backend no
implementado** (endpoints + SMTP) y, por regla, requiere aprobación antes de codear. No se simula envío
de correo.
**Decisión de diseño MFA (estándar de industria):** el enrolamiento de MFA es **self-service del
usuario** (el secreto TOTP solo lo conoce su dispositivo); el administrador NO "activa" MFA por usuario
con un booleano, sino que define la **política de requerimiento** (deshabilitado/opcional/requerido,
idealmente por rol) y puede **resetear** el MFA de un usuario (dispositivo perdido). Ver NIST 800-63B y
OWASP ASVS v4 (§2). Pendiente de implementar (próxima sesión de auth).

### 2026-06-05 · Regla permanente: criterio y honestidad técnica
Se añadió a `CLAUDE.md` la regla de **no complacer a la primera**: contrastar mis propuestas con el
estándar de la industria y objetar con fundamento cuando convenga. Motivo: mejores decisiones de
producto/seguridad.

### 2026-06-05 · Fase 1 (UI): arquitectura del frontend de autenticación
Sesión enfocada **solo en Login + cimientos** (no las 3 pantallas a la vez), para cerrar por módulo según CLAUDE.md. Decisiones:
- **Access token en memoria** (`src/lib/session-token.ts`, módulo plano sin React, nunca en localStorage) + **refresh proactivo** ~30 s antes de expirar (`AuthProvider`). El refresh token va en cookie httpOnly; al arrancar la app se intenta un refresh silencioso para rehidratar la sesión.
- **Cliente HTTP central** (`src/lib/api-client.ts`): añade `Authorization: Bearer` + `credentials:"include"`; ante un **401 con token vigente** hace **un** refresh transparente (coalescido) y reintenta; si falla, marca la sesión como expirada. CSRF de doble envío (`wl_csrf` cookie → header `x-csrf-token`) en refresh/logout.
- **Estado de sesión** en Zustand (`auth-store.ts`): solo `status` + `SessionInfo` (usuario, permisos, scope), no el token.
- **Cliente de permisos** en paquete nuevo **`@lyra/permissions`** (TS puro: `can`/`canAll`/`canAny`/`createPermissionChecker`, tipado con `PermissionKey`). El hook React (`usePermissions`) y el componente `<Can>` viven en la web y lo consumen. La UI **solo oculta/deshabilita**; el backend decide.
- **Componentes premium** en **`@lyra/ui`** con **CSS Modules sobre tokens** (Button, Input, FormField, Card, Spinner, Toast). Área táctil 44px, dark-mode, Lucide.
**Motivo:** patrón resistente a XSS (token efímero en memoria) y a robo de refresh; límites de paquete limpios y reutilizables por el ecosistema Lyra; cumple "permisos nunca hardcodeados" reusando el catálogo de `@lyra/contracts`.

### 2026-06-05 · Fase 1: estrategia de tokens (access en memoria + refresh httpOnly rotativo)
Access JWT corto (15 min) por header `Authorization: Bearer`, guardado **en memoria** en el front. Refresh token opaco en cookie `httpOnly`/`Secure`/`SameSite=Strict`, del que solo se guarda el **hash SHA-256** en BD. **Rotación con familia y detección de reuso**: si un refresh ya rotado se reutiliza, se revoca toda la familia + sesión.
**Motivo:** resistente a XSS (el access no es robable desde JS persistente) y a robo de refresh (rotación + reuso ⇒ revocación). Patrón estándar de la industria.

### 2026-06-05 · Fase 1: CSRF de doble envío en endpoints con cookie
`refresh` y `logout` (que confían en la cookie) exigen un header `x-csrf-token` igual a una cookie CSRF **no httpOnly** que el SPA reenvía. Las llamadas normales usan Bearer (no vulnerables a CSRF).
**Motivo:** defensa en profundidad sobre `SameSite=Strict`.

### 2026-06-05 · Fase 1: catálogo de permisos como código, asignaciones como dato
Las **claves** de permiso (4D) viven en `@lyra/contracts` (las referencian los guards y las siembra el seed). La **asignación** rol→permiso y rol→usuario es 100% dato en BD, editable desde la UI.
**Motivo:** cumple "permisos nunca hardcodeados" sin perder el tipado/validación de las claves. Lo prohibido es hardcodear roles/reglas, no la existencia de las claves.

### 2026-06-05 · Fase 1: alcance de datos (Scope) con sujeto polimórfico
Tabla `Scope` con `userId?` **o** `roleId?` (check constraint que exige exactamente uno) + `orgNodeId` + `includeDescendants`. El alcance efectivo de un usuario = unión de sus scopes propios y los de sus roles, expandiendo descendientes vía la **ruta materializada** `OrgNode.path`.
**Motivo:** flexibilidad (alcance por usuario y por rol) sin multiplicar tablas; el `path` permite resolver descendientes en una sola query indexada.

### 2026-06-05 · Fase 1: AuditLog inmutable por trigger Postgres
Además de no exponer update/delete en la app, un trigger `BEFORE UPDATE OR DELETE` rechaza toda mutación de `AuditLog`.
**Motivo:** la inmutabilidad la garantiza la base, no solo la confianza en el código (requisito de auditoría).

### 2026-06-05 · Fase 1: MFA TOTP completo en backend; lockout en BD
Enrolamiento TOTP end-to-end (setup/verify/disable + recovery codes hasheados, secreto cifrado con `APP_ENC_KEY`). El **lockout por fuerza bruta** usa un contador persistente en `User` (`failedLoginCount`/`lockedUntil`), no Redis, que queda como acelerador opcional de caché.
**Motivo:** MFA listo de punta a punta para cuando llegue la UI; contador en BD = durable, testeable y sin depender de Redis on-prem.

### 2026-06-05 · Fase 1: ajustes de tooling (dotenv-cli, otplib v12, fastify directo)
Scripts Prisma cargan el `.env` raíz vía `dotenv-cli` (monorepo). `otplib` fijado a v12 (API `authenticator` síncrona; v13 es una reescritura async incompatible). `fastify` añadido como dependencia directa del API (los tipos no estaban expuestos por transitividad).
**Motivo:** que `pnpm db:migrate/seed` funcione sin fricción y evitar romper el código con una mayor de otplib.

### 2026-06-05 · Fase 0: andamiaje del monorepo
Se construye la base: pnpm workspaces, NestJS+Prisma+Postgres, React+Vite+Tailwind v4, Docker (dev/prod) + Caddy, tokens del Design System en `@lyra/ui`, contratos en `@lyra/contracts`, API con healthchecks.
**Motivo:** establecer cimientos correctos y verificables antes de la lógica de negocio.

### 2026-06-05 · Nombre del producto: **Lyra WatchLog**
Marca paraguas *Lyra*; producto *WatchLog* ("watch" = turno de guardia + vigilar; "log" = bitácora/registro). Codename interno *Sheliak* opcional.
**Motivo:** memorable y autoexplicativo en B2B industrial; "Sheliak" no convencía comercialmente.

### 2026-06-05 · Backend: NestJS + Prisma + PostgreSQL
**Motivo:** madurez, modularidad (seguridad/incidencias/orígenes), Guards para autorización en servidor, tipado fuerte, migraciones versionadas estándar. Se descarta Drizzle al no necesitar RLS (single-tenant).

### 2026-06-05 · Despliegue single-tenant on-premise (sin multi-tenant)
Un cliente = un stack Docker + su BD. Sin `tenant_id` ni RLS.
**Motivo:** cautela; evita la complejidad SaaS (cobros, infra). El modelo de datos se mantiene limpio por si se evalúa SaaS a futuro, pero no se construye ahora.

### 2026-06-05 · Autenticación enchufable (local + ranura OIDC/LDAP)
Auth local (Argon2id, refresh rotativo, lockout, MFA TOTP opcional) tras una abstracción; OIDC (Azure/Entra, Google…) y LDAP se activan por configuración por despliegue. Keycloak descartado para el MVP.
**Motivo:** clientes distintos tendrán necesidades distintas; la abstracción evita "casarse" con un método y no obliga a reescribir.

### 2026-06-05 · IA abstracta en el backend
Interfaz `LlmProvider` con implementaciones nube (Anthropic/OpenAI/Gemini/Deepseek) o local (Ollama/vLLM).
**Motivo:** agnóstico al proveedor; on-premise puede requerir modelo local. **Hallazgo del prototipo:** llamaba a la IA desde el frontend (fuga de API key) — se mueve al backend.

### 2026-06-05 · Monorepo con pnpm workspaces (sin Turborepo aún)
**Motivo:** simplicidad; se evaluará Turborepo cuando el repo crezca (varias apps del ecosistema).

### 2026-06-05 · Tailwind v4 cableado a los tokens Lyra
**Motivo:** el Design System es token-first; Tailwind v4 (`@theme`) mapea los tokens CSS sin duplicarlos.

## Recomendaciones registradas para incorporar (fase de endurecimiento u oportuna)
Mover IA/orígenes al backend (hecho como principio) · adjuntos/evidencias en MinIO · firma con validez probatoria (hash+timestamp) · respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) · healthchecks (hechos) · rate-limit + CSP/HSTS · exportación CSV/PDF · notificaciones SMTP (SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · **modo offline terreno (PWA) como fase posterior** · retención/borrado lógico · tests de lógica crítica desde Fase 1.
