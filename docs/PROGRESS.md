# Progreso — Lyra WatchLog

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
