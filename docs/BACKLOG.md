# Backlog / Estado abierto — Lyra WatchLog

> **Registro único y autoritativo de todo lo que está ABIERTO.** Nada se cierra "de
> palabra": si está pendiente (por hacer, por probar, por publicar) vive aquí hasta
> que se complete. `PROGRESS.md` narra lo **hecho**; este archivo lista lo **abierto**.
>
> **Regla:** al cerrar cada sesión, revisa y actualiza este archivo (ver §0). Última
> actualización: **2026-06-17** (**Fase 4.2a — Acciones CAPA ✅** — `feat/incidencias-capa`: tras la **auditoría del módulo de
> Incidencias** (core ya genérico/transversal; brecha P1 = seguimiento real → CAPA), gestión de acciones correctivas/preventivas/
> inmediatas. Entidad `IncidentAction` (folio ACT-####, mandatory, responsable persona+rol, plazo, status OPEN/IN_PROGRESS/DONE/
> VERIFIED/CANCELED, **verificación de eficacia** [no eficaz reabre], anulación sin borrado, `evidence` reservado); **bloqueo de
> cierre** por acción `mandatory` (verificación exigida si el tipo `requiresCapa`); 2 permisos `incident:action:manage`/`:verify`
> [cat. **83**]; bloque "Acciones" en el drawer + modales. Migración aditiva. Contracts 263 · API 234 · smoke
> `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 30/30. **Deuda:** subida de evidencia (Storage Ola 3) · picker de rol
> responsable en UI · firma Part 11 al verificar. **Siguiente: 4.2b — Investigación (5 Porqués).** Anterior:
> **Mantenedor de catálogos de incidencias [UI] ✅** — `feat/incidencias-catalogos-ui`: pantalla
> `/incidencias/catalogos` [ruta propia + botón en header de `/incidencias`, gate `incidentcatalog:manage`] con sub-pestañas
> Tipos/Categorías [buscador+estado+orden en 1 línea, GridPager arriba/abajo, crear/editar modal, toggle activo]; backend mínimo:
> guarda "flujo por defecto publicado" en `upsertType` + **409** al crear con key existente [`?create=true`, guarda cliente+server];
> swatches de color con tokens del DS; sin permisos nuevos [cat. 81], sin migración. Contracts 257 · API 234 · smoke
> `smoke-catalogos-incidencias.py` 16/16 + `smoke-incidencias.py` 30/30. **Siguiente: 4.2 — Investigación + CAPA.** Anterior:
> **Fase 4.1.1 — Excepciones operacionales [UI] ✅** — `feat/incidencias-excepciones-ui`: panel
> inline plegable de revisión en llenado/visor [resumen + lista accionable + selección múltiple], `ExceptionDetailDrawer` con
> triage (reconocer/corregir[GxP+reauth]/crear-asociar incidencia/descartar), `ConvertExceptionModal` con dedup, banner "advertir
> no bloquear" al completar con críticas, **bandeja global `/excepciones`** [KPIs + filtros + GridPager + menú], trazabilidad
> campo→excepción→incidencia [filtro `incidentId` nuevo], toggle `warnRaisesException` en el builder de NUMBER. Contracts 255 ·
> API 234 · smoke 39/39 + filtro live. **Siguiente: 4.1.2 — acción del motor de reglas (diferida, outbox).** Anterior:
> **Fase 4.1.0 — Excepciones operacionales [BACKEND] ✅** — `feat/incidencias-excepciones`: capa
> Bitácora→Excepción→Incidencia. `LogEntryException` + `IncidentExceptionLink` (migración aditiva); generación SÍNCRONA gobernada
> por campo (CRIT siempre / WARN opt-in `warnRaisesException`) reconciliada en guardar/sellar + purga en VOID; triage completo
> (ack/dismiss[crítica=permiso superior]/correct[GxP, preserva original]/convert→incidencia/associate/manual) + dedupe por sugerencia;
> ABAC + auditoría; 4 permisos [cat. **81**]. Contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39. **Siguiente: 4.1.1 — panel
> de excepciones en la bitácora (UI)** + 4.1.2 (acción del motor de reglas, diferida). Anterior: **Fase 4.0 — Núcleo de Incidencias ✅** — `feat/incidencias-nucleo`: módulo de incidencias
> operacionales/HSE que reusa `WorkflowDefinition`; 6 entidades aditivas, catálogos configurables, lista+kanban+detalle, ABAC,
> creación manual y desde bitácora, 9 permisos [cat. **77**], smoke 26/26. Plan por fases 4.1–4.5 aprobado [DECISIONS]. **Siguiente:
> Fase 4.1 — Excepciones operacionales.** Anterior: **Bloque N — Hardening de Notificaciones ✅** — `feat/notif-hardening`: **#1 config SMTP en BD**
> (pantalla en `/configuracion` tab "Correo saliente", permiso `notification:config` [cat. **68**]; `SystemSettings.email*`, `.env`
> fallback, **contraseña CIFRADA write-only**, sin reiniciar; presets + probar conexión/envío contra Mailpit; sender suprime si está
> apagado) **+ #2 editor de plantillas premium** (vista previa en vivo, diccionario de variables con descripción+ejemplo, insertar
> en cursor, **`{{entry.summary}}`** = campos de resumen de la bitácora). Migración aditiva. Contracts 255 · API 234 · smokes 8/8 +
> 17/17. **Siguiente: Fase 4 — Incidencias.** Anterior: **Bloque N — Notificaciones ✅** — `feat/notificaciones`: motor de avisos por CORREO premium,
> transactional outbox de 2 etapas + worker `@nestjs/schedule` (1.ª infra de cron); 5 entidades aditivas (`NotificationEvent`/
> `Outbox`/`Template`/`Subscription`/`Preference`); catálogo de eventos en código (4: ronda vencida/SLA/transición/firma) con
> variables whitelisteadas + render sin eval; emisión IN-TX en `executeTransition`; resolución de destinatarios con ABAC; sweeper
> que GENERA rondas antes de escanear vencidas; bandeja de salida (Req-1/5) + plantillas configurables + preferencias propias;
> 4 permisos (cat. **67**); migración aditiva; seed de 4 plantillas. Contracts 255 · API 234 · smoke 17/17. **Siguiente: Fase 4 —
> Incidencias.** Anterior: **Fase 2.3.1 — Worklist de rondas ✅** — `feat/rondas-worklist`: separa PLANIFICAR de
> EJECUTAR. Permiso nuevo **`round:execute`** (cat. **63**) gatea ver+ejecutar "Mis rondas"; start/skip se mueven de
> `schedule:manage` a `round:execute`. **`LogSchedule.responsibleRoleId?`** SINGLE nullable (FK Role SetNull) = rol responsable
> del worklist, leído EN VIVO (reasignar re-enruta pendientes); `null` = fallback nodo+turno. `GET /schedules/my-rounds`
> (+`/stats`) acota `PENDING ∩ nodos accesibles ∩ {responsable null|∈ mis roles}` con toggles overdueOnly/shiftOnly/includeUpcoming;
> `GET /schedules/role-options` (gate schedule:manage, decoplado de role:read). Web: página `/mis-rondas` (worklist operador) +
> `/rondas` relabelada "Programación de rondas" (sin ejecución, monitoreo read-only + selector de rol responsable) + widget en
> Inicio + badge de /bitacoras → mis-rondas. Migración aditiva. Contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 +
> `smoke-rondas.py` 21/21. **Siguiente: Notificaciones (correo).** Anterior:
> **Fase 2.3 — Programación de rondas ✅** — `feat/programacion-rondas`: `LogSchedule` (horario
> VIVO plantilla×nodo×recurrencia SHIFT/INTERVAL/CALENDAR) + `RoundOccurrence` (ocurrencias materializadas pendiente/cumplida/
> vencida[derivada]/omitida); la ENTRADA se crea al **iniciar la ronda** (reusa `LogEntriesService.create`, ligada por
> `logEntryId @unique`); generación lazy idempotente + botón Generar; página `/rondas` (KPIs + iniciar/omitir + horarios) + badge
> en `/bitacoras`; 2 permisos `schedule:view/manage` (cat. **62**); enumerador PURO testeado; migración aditiva. Contracts 249 ·
> API 234 · smoke 21/21. **Siguiente: a definir con el dueño.** Anterior:
> **Builder: formateo en vivo + paleta de elementos + modal "Ver más" ✅** —
> `feat/builder-formateo-paleta`: RUT al teclear · número/moneda/porcentaje con miles+decimales (`FormattedNumberInput`) ·
> máscara genérica `OT-#####` (`config.mask`) · «Decimales» expuesto · footer Aceptar/Cancelar en PROPIEDADES · paleta DOCKED a
> la izquierda con buscador + scroll al campo creado · modal "Ver más" con demo en vivo + caso de uso · "objeto"→"elemento".
> Contracts 239 · API 234. Anterior:
> **Pulidos de UX del Form Builder ✅** — `feat/builder-ux-pulidos`: mín/máx caracteres +
> contador en vivo en Texto/Párrafo; hover de info en el lienzo (`SectionCanvas`); footer Aceptar/Cancelar en el drawer
> avanzado [Cancelar = revierte por snapshot]; fix del Enter al crear ítems de lista [`LinesTextarea` conserva texto crudo];
> + fix preexistente del spec `logbook-query.service` [faltaba `storage` en el constructor]. Doc VIVO `FORM_GUIDE.md`
> actualizado. Contracts 239 · API 234. Anterior:
> **Catálogo de objetos premium · Ola 4 ✅** — `feat/objetos-ola4`: objetos ESTRUCTURADOS /
> repetibles, sin infra. Dos `FieldType` nuevos: `TABLE` (tabla repetible `layout=table` + grupo repetible `layout=cards`,
> valor `Array<Record<colKey,escalar>>`, filas dinámicas) y `MATRIX` (parámetro×turno, filas/columnas FIJAS + celda
> uniforme, `Record<rowKey,Record<colKey,escalar>>`). Columnas/ejes = sub-campos ESCALARES en config, congelados en la
> versión; **validación POR CELDA** reusando `validateFieldValue` del tipo de columna (SELECT de celda = opciones inline);
> `requiredFieldError` generaliza la obligatoriedad. Render único `RepeatableControl`/`MatrixControl` recursivos sobre
> `FieldControl` (modo `bare`) + paleta "Estructurados" + editores en el builder. Opacos a resumen/reglas en el MVP.
> Migración ALTER enum. Contracts 230 · API 234 · smoke 22/22. Pendiente: smoke VISUAL [§4]. Anterior:
> **Catálogo de objetos premium · Ola 3 ✅** — `feat/objetos-ola3`: adjuntos/terreno con
> infra MinIO. `StorageService` abstracto (token DI) + `MinioStorageService` (SDK `minio`, bucket idempotente). Un
> `FieldType ATTACHMENT` + presets → `dataType FILE_ARRAY` (valor `descriptor[]`); foto/cámara · archivo · nota de voz
> (`MediaRecorder`) · croquis (canvas→PNG) · escáner QR (`config.scan` sobre TEXT, `@zxing/browser`, NO archivo). Subida
> **PROXIED** (`@fastify/multipart`, choke-point) a `entries/{id}/{fieldKey}/…`; descriptor en `LogEntryValue.value` (NUNCA
> URL); descarga = **presigned GET** con la ABAC de `getDetail`; pertenencia por prefijo + delete-on-remove + VOID limpia
> huérfanos. Migración ALTER enum aditiva. Render único `AttachmentControl` + paleta "Evidencia / Terreno". Contracts 222 ·
> API 234 · smoke 26/26. Pendiente: smoke VISUAL [§4]. Anterior: **Catálogo de objetos premium · Ola 2 ✅** — `feat/objetos-ola2`: objetos de REFERENCIA
> (un tipo `REFERENCE` + `config.entity` equipo/usuario/nodo/turno, `dataType REFERENCE`) con resolución + validación ABAC
> server-side (`opts.allowedRefIds` espejo de `allowedCodes`; endpoint `GET /log-entries/references/:kind/options`); lectura
> con tolerancia (NUMBER + expected±tol que deriva bandas warn/crit); contador/acumulado (NUMBER + delta vs lectura previa
> sellada); matriz de riesgo (`RISK_MATRIX`/`dataType RISK`, ejes 2..7 + celda→severidad, ISO 31000). Migración ALTER enum
> aditiva. Render único FieldControl + paleta categoría "Referencia" + editores. Contracts 215 · API 234 · smoke 22/22.
> Pendiente: smoke VISUAL [§4]. Anterior: **Catálogo de objetos premium · Ola 1 ✅** — `feat/objetos-ola1`: +11 tipos
> (CONFORMITY/RATING/TIME/DURATION/RANGE + 6 de presentación), `displayAs` en SELECT/MULTISELECT y `format` en
> TEXT/NUMBER, dataType `LAYOUT`/`RANGE`, migración ALTER enum aditiva, render único FieldControl premium, paleta por
> presets, guardas LAYOUT en API. Contracts 204 · API 234 · smoke 21/21. Pendiente: smoke VISUAL [§4]. Anterior:
> **Fase 2.1.7 Diseñador visual de formularios ✅ FASE 1** — `feat/builder-visual-designer`:
> el modelo auto-fila era rígido (no se podía colocar/redimensionar libre). Se contradijo el píxel-absoluto puro (rompe el
> responsive de terreno) y el dueño aceptó **grilla responsiva de posicionamiento libre** (`react-grid-layout`): geometría
> EXPLÍCITA `{x,y,w,h}` por campo (columnas `TemplateField.gridX/gridY/gridH` NULLABLE, migración aditiva; `null`=legacy ⇒
> el editor la deriva del orden+colSpan), arrastrar/redimensionar cualquier campo, snapping, arrastrar desde la paleta.
> Editor 3 zonas (paleta · lienzo RGL · propiedades) + escritorio/tablet/móvil (preview con el MISMO `FieldGrid` data-driven
> + container-queries) + cuadrícula. Render único intacto; compat con plantillas viejas. Contracts 195 · API 234 · smoke
> `smoke-field-geometry.py` 14/14. **Diferido Fase 2/3** (historial, multi-sel, alinear/distribuir, capas, copiar/pegar,
> atajos, edición por breakpoint, zoom) + limpieza de huérfanos (BuilderFieldCard/FieldToolbar/AddFieldMenu/dnd-kit).
> Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.6 Builder motor de arrastre con dnd-kit ✅** — `feat/builder-dnd-kit`: el
> dueño reportó que tras 2.1.5 seguía sin poder mover un campo al lado de otro. Causa: (1) **bug** del DnD nativo (el drag
> solo arrancaba desde el grip, pero el ícono SVG dejaba el target sin `data-drag-handle` ⇒ casi nunca iniciaba); (2)
> **techo** del DnD nativo (sin reflow en vivo, fantasma gris). Se adoptó **dnd-kit** (core 6 + sortable 10 + utilities 3;
> MIT, on-prem, pointer/teclado/touch) y se reescribió el lienzo: nodo sortable = **celda** (reflow animado), tarjeta =
> **activador** (se agarra donde sea; rótulo/borde exentos), **`DragOverlay`** sigue al cursor, intención al-lado/fila **por
> píxeles** reusando el auto-layout de 2.1.5 (`applyDrop`/`splitRow`). Frontend puro (sigue `colSpan`; `FieldGrid` fuente
> única). Contracts 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.5 Builder auto-layout por arrastre ✅** — `feat/builder-autolayout`: por
> feedback del dueño (4 puntos): lienzo a **todo el ancho**; **auto-layout estilo Notion** (soltar al lado ⇒ comparten
> fila con ancho repartido solo; a su línea ⇒ ancho completo; el usuario NO piensa en columnas); se quita el menú "12/12"
> y el ajuste fino es un **divisor** del borde; **responsive 1/2/12** (móvil/tablet/escritorio). Frontend puro. Contracts
> 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.4 Builder canvas-first ✅** — `feat/builder-canvas`: por feedback del dueño
> ("estrecho y poco intuitivo vs Canva"), el editor pasa a **canvas-first** (lienzo a todo el ancho), la paleta es un
> popover "＋ Agregar", la config avanzada vive en un `Drawer`, y **se configura SOBRE el lienzo**: control REAL
> (WYSIWYG), rótulo/sección editables en el lugar, barra flotante contextual (ancho/obligatorio/mover/duplicar/eliminar).
> Frontend puro (no toca modelo/API). Fase 1; Fase 2 diferida (drag-desde-paleta, inline placeholder/opciones, colapsar,
> atajos, multi-sel). Contracts 195 · API 234 (sin cambio). Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.3 Editor de layout WYSIWYG ✅** — `feat/layout-editor-wysiwyg`: el editor del
> builder pasa a manipulación directa (arrastrar para reordenar dentro/entre secciones + redimensionar el borde); por
> feedback del dueño ("el panel de ancho era ciego"). Granularidad a **12 columnas**: reemplaza el enum `LayoutWidth` por
> `TemplateField.colSpan` 1..12 (migración `…_field_colspan`). Sin librería de DnD nueva (DnD nativo `ColumnsDrawer` +
> pointer-events `ResizableSplit`; el builder es de escritorio). `FieldGrid` numérico (fuente única intacta). Contracts
> 195 · API 234 · smoke 14/14. Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.1.2 Layout de formulario en grilla responsiva ✅** — `feat/layout-grilla`:
> ancho por campo `{FULL,HALF,THIRD}` en **columna `TemplateField.layoutWidth`** [versión inmutable, NO en `config`
> JSONB porque los config por tipo son Zod `.strict()`] + grilla CSS 12-col responsiva [THIRD→½ tablet, 1 col <768px]
> desde fuente de render ÚNICA `FieldGrid`/`FieldGridCell` [builder-preview + llenado + visor idénticos]. Presentación
> PURA y aditiva, default FULL = cero ruptura. Migración `…_add_field_layout_width`. Contracts 195 · API 234 · smoke
> 12/12. Pendiente: smoke VISUAL [§4]. Anterior: **Fase 2.8.2 VOID de borradores + ruta de edición ✅** — `feat/void-edicion`: `status=VOID`
> con motivo ≥5 auditado [NO `deletedAt`], autorización ownership + permiso nuevo `logentry:void` para ajenas [catálogo
> **59→60**], `buildWhere` excluye VOID por defecto [recuperable con `?status=VOID`], evento timeline VOIDED, banner en
> visor/llenado, **ruta de edición dedicada `/bitacoras/:id/editar`**. Cierra la deuda (b)(c) de 2.8.2 [la (a) ya estaba].
> Contracts 193 · API 234 · smoke 17/17. **Falta:** VOID GxP de entradas SELLADAS [firma §11.200 + transición inversa,
> con 2.5(a)]. Anterior: **Fase 2.8.0.2 Modo de equipo por PLANTILLA ✅** — gobernanza del objeto de referencia EAM:
> enum `EquipmentMode` `NONE|OPTIONAL|SUGGESTED|REQUIRED` en `Template` [contenedor mutable, default OPTIONAL = cero ruptura];
> backend AUTORIZA REQUIRED/NONE en `create`; `eligibleNodes` expone el modo; control en `TemplateBuilder`. Sin permisos
> nuevos [catálogo 59]. Tests contracts 151 · API 216 · smoke 17/17. 6 forks en DECISIONS. Pendiente: smoke VISUAL [§4].
> Anterior: **Fase 2.8.0 Plantillas MULTI-NODO ✅** — eje de NODO de la visibilidad de plantilla:
> entidad `TemplateNodeAssignment` [templateId × orgNodeId + `includeDescendants`, N:M] = fuente de verdad única; 3 modos
> [uno/varios/"todos los hijos de X"]; **0 asignaciones = GLOBAL** [permisivo]; `Template.orgNodeId` = nodo primario DERIVADO
> [deprecado, DROP en §3]. `ScopeService.getAccessibleNodes`+`isTemplateVisibleByNode`; selector de nodo al crear acotado a
> asignaciones ∩ ABAC [autoselección si 1, **obliga si >1**] vía `eligibleNodesForTemplate` + `assertNodeAllowedForTemplate`
> [**cierra el diferido (a) de 2.4**]. UI en `TemplateBuilder` [reusa `ScopeTreePicker`] + `NewEntryPage`. **Sin permisos
> nuevos — catálogo 59.** Tests contracts 149 · API **213**. **+ 2.8.0.1 Equipo OPCIONAL al crear** (objeto de referencia
> EAM: nodo + equipo del nodo; `eligibleNode.equipment` + `assertEquipmentInNode`; modal con selector de equipo; smoke 18/18).
> **+ fix re-binding de flujo** al guardar plantilla (preexistente 2.2). Siguiente recomendado: **2.8.0.2 modo de equipo por
> plantilla** (gobernanza, opción B) · **2.8.1 UX de acceso nodo↔grilla** (fusiona 2.6.1 SavedView) o **2.7.3 matriz
> rol×sección×tiempo**. Deuda abierta: **2.8.2** [VOID de borradores + ruta de edición propia] y el DROP de `Template.orgNodeId` [§3]).

---

## 0. Definición de "sesión cerrada de forma segura" (checklist)

Antes de declarar una sesión completa, TODO esto debe estar hecho o registrado aquí:

- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde.
- [ ] Smoke en vivo de lo construido (y registrado qué se probó y qué **no**, en §4).
- [ ] Docs actualizados: `PROGRESS.md`, los docs afectados y **este `BACKLOG.md`**.
- [ ] Si se completó una funcionalidad de cara al usuario: **`docs/USER_GUIDE.md`** actualizado
      (sección redactada + índice marcado ✅) y, de paso, 1–2 secciones antiguas (✍️) rellenadas.
- [ ] Commit(s) descriptivos.
- [ ] **Publicación decidida y ejecutada** (§1): push de la rama y/o merge a `main` y
      push de `main`. Un commit que solo vive en este disco **es trabajo en riesgo**.
- [ ] Toda decisión nueva en `DECISIONS.md`; toda deuda nueva en §3 de este archivo.

> Si algo queda a medias, no se borra del checklist: se mueve a la sección
> correspondiente de este backlog con el detalle exacto para retomarlo.

---

## 1. Git: ramas y commits SIN publicar (riesgo de pérdida) 🔴

> Estado al 2026-06-10 (todo publicado). Verificar con:
> `git rev-list --count origin/main..main` (debe dar 0) y `git branch --no-merged main`.

| Qué | Dónde | Estado | Acción pendiente |
|---|---|---|---|
| **Fase 1: Login + branding + reset de contraseña + docs + rutina** | `main` | ✅ publicado en `origin/main` | ninguna |
| **Fase 1: MFA self-service** | `main` (fusionado desde `feat/auth-mfa-self-service`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Estructura v2 + externalCode + Table fix** | `main` | ✅ publicado (`f84cbd8`) | ninguna |
| **Estructura UX: layout responsivo, ResizableSplit, description, reportOrder, fix puerto** | `main` | ✅ publicado (`5170f70`) | ninguna |
| **Docs cierre + fix header responsivo del detalle** | `main` | ✅ publicado (`91a4bd6`) | ninguna |
| **Módulo Equipos** (CRUD + categorías + `ExternalReference` modelo) | `main` (fusionado desde `feat/equipos`) | ✅ fusionado y publicado en `origin/main` (`a299ab6`) | ninguna |
| **UI de Seguridad** (usuarios/roles/política/auditoría + reset MFA) | `main` (fusionado desde `feat/seguridad-ui`) | ✅ fusionado y publicado en `origin/main` (`a6f8b10`) | ninguna |
| **Fase 2.1 Plantillas** (modelo definición + contratos + Form Builder) | `main` (fusionado desde `feat/plantillas`) | ✅ fusionado y publicado en `origin/main` (`a440f54`) | ninguna |
| **Fase 2.1.1 Endurecimiento de modelo** (campo en 3 capas + `optionSource`) | `main` (fusionado desde `feat/plantillas-2.1.1`) | ✅ fusionado y publicado en `origin/main` (`365e31f`) | ninguna |
| **Fase 2.2 Flujos reutilizables** (`WorkflowDefinition` + mantenedor + binding) | `main` (fusionado desde `feat/workflows`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.x Datos de referencia** (`ReferenceList`/`ReferenceItem` + mantenedor + binding) | `main` (fusionado desde `feat/datos-referencia`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Datos de referencia — UX enterprise** (grilla orden/búsqueda/paginación + `Combobox` + selectores premium) | `main` (fusionado desde `feat/datos-referencia-ux`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fix recorte de paneles + `LookupPicker`** (flip-up/clamp + diálogo tabla con tokens) | `main` (fusionado desde `feat/datos-referencia-lookup`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Import/Export CSV de Listas** (dry-run→commit + export `;` es-CL) | `main` (fusionado desde `feat/listas-csv`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3.0 Calendario operacional** (`OperationalCalendar`/`OperationalShift` + `ShiftResolver` + mantenedor) | `main` (fusionado desde `feat/calendario-operacional`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.4 Llenado (Nueva entrada)** (`LogEntry*` + `/log-entries` + `FieldControl` + pantalla de llenado) | `main` (fusionado desde `feat/llenado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.5 Ejecución de flujo + firmas Part 11** (`LogEntryTransition`/`LogEntrySignature` + `executeTransition` + `ReauthService` + modales de firma) | `main` (fusionado desde `feat/ejecucion-flujo`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.6.0 Módulo de Bitácoras — núcleo de lectura** (folio + estampados + `LogbookQueryService` + `/bitacoras` + record viewer + verificación de firmas) | `main` (fusionado desde `feat/bitacoras-auditor`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Afinamiento #4** (triage 10 mejoras + guardado por sección autoexplicativo + `submit` objetivo + motivos de bloqueo) | `main` (fusionado desde `feat/afinamiento-llenado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.0 Registro diferido** (`entryOrigin` + `setDeferral` + gesto mínimo + huella grilla/visor/timeline) | `main` (fusionado desde `feat/registro-diferido`) | ✅ fusionado y publicado en `origin/main` |
| **Fase 2.7.1 Período contable gobernado** (`OperationalPeriod` + guarda `assertWritable` + cierre/reapertura auditada + mantenedor) | `main` (fusionado desde `feat/periodo-gobernado`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.1.1 Calendario FISCAL transversal** (`FiscalCalendar` + `FiscalResolver` + período materializado OPEN→CLOSED→LOCKED + generate/lock/unlock + pantalla `/calendario-fiscal`) | `main` (fusionado desde `feat/calendario-fiscal`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.1.1 Afinamiento UX + Configuración** (panel a pestañas + grilla scroll/orden + historial por período c/MFA estampado + `/configuracion` MFA por acción + formato regional + fix Toast z-index) | `main` (fusionado desde `feat/calendario-fiscal-ux`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.7.2 Ventana de edición configurable** (`Template.editWindow*` + `SystemSettings` global/MFA + guarda `assertEditWindowWritable` + override `logentry:write-expired` con motivo + huella `editWindow` + UI builder/`/configuracion`/llenado) | `main` (fusionado desde `feat/ventana-edicion`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8 Alcance por PLANTILLA (2.º eje ABAC)** (`TemplateScope` + `getAccessibleTemplateIds`/`assertTemplateInScope` + filtro picker/grilla + `PUT users\|roles/:id/template-scope` + options + `TemplateScopePicker`) | `main` (fusionado desde `feat/alcance-plantilla`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8 Afinamiento** (fix anclaje de selectores + Combobox/MultiSelect premium + filtro de Bitácoras con alcance `GET /log-entries/filter-templates` + RoleDrawer a pestañas + acceso por rol desde la plantilla `GET/PUT /templates/:id/role-scope` + `TemplateAccessModal`) | `feat/afinamiento-2.8` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.0 Plantillas MULTI-NODO** (`TemplateNodeAssignment` N:M + `getAccessibleNodes`/`isTemplateVisibleByNode` + selector de nodo al crear `eligibleNodesForTemplate` + `assertNodeAllowedForTemplate` + UI builder/NewEntryPage) | `feat/plantillas-multinodo` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fix re-binding de flujo al guardar plantilla** (el builder reenviaba la versión de flujo congelada; ahora ata la vigente — bug preexistente 2.2 detectado en el smoke visual de 2.8.0) | `main` (commit directo) | ✅ publicado en `origin/main` (`2a58d9f`) | ninguna |
| **Fase 2.8.0.1 Equipo OPCIONAL al crear entrada** (`eligibleNode.equipment` + `assertEquipmentInNode` + selector de equipo en el modal de creación) | `feat/equipo-opcional-entrada` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.0.2 Modo de equipo por PLANTILLA** (`EquipmentMode` en `Template` + `assertEquipmentForMode` en `create` + `equipmentMode` en `eligibleNodes` + control en `TemplateBuilder`/`NewEntryPage`) | `feat/modo-equipo-plantilla` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Afinamiento UX TemplateBuilder** ("Guardar configuración" `PATCH` separado del borrador + `editStateToConfigRequest` + riel vertical/sub-pestañas + barra sticky + `ScopeTreePicker`/`Toast` premium) | `feat/builder-vistas-config` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.1a Bitácoras grilla orientada a contenido** (`Template.gridFieldKeys` gobernanza viva + `summaryValues`/`equipmentTag` en el listado batched + búsqueda por contenido `pg_trgm` + checklist en builder + columnas Equipo/Resumen) | `feat/bitacoras-grilla-contenido` → `main` | ✅ fusionado y publicado en `origin/main` (`4a3a7a9`) | ninguna |
| **Afinamiento UX grilla de Bitácoras** (fix párrafos + filtros primarios+Drawer + filtro multi-nodo `orgNodeIds` + paginador discreto arriba/abajo + Actualizar + KPIs premium) | `feat/grilla-ux` → `main` | ✅ fusionado y publicado en `origin/main` (`6b06662`) | ninguna |
| **Fase 2.8.1b Vistas guardadas + gestor de columnas + multi-sort** (`SavedView` ownership-gated + `SavedViewsModule` + `Table` column-aware en `@lyra/ui` + `ColumnsDrawer`/`ViewBar` + multi-sort keyset + columnas de valor por plantilla) | `feat/bitacoras-vistas-guardadas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.1c Peek + facetas + review-by-exception + Mi turno** (`/facets` conteos de hermanos + `/my-shift` + `exceptionsOnly` + `FacetsPanel`/`PeekDrawer` + `rowClassName` en `@lyra/ui` + filtro de equipo en UI) | `feat/bitacoras-peek-facetas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Workflow SLA + atrasos** (`WorkflowState.maxStayMinutes` + `LogEntry.currentStateSince` + `evaluateSla` + `roleNames` en versión congelada + `delayedOnly`/`stats.delayed`/`facets.delayed` + vista sistema "Retrasadas" + `SlaDurationField` builder + alertas diagrama/grilla) | `feat/workflow-sla-atrasos` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Motor de reglas — primer corte (Req-7)** (`@lyra/contracts/rules` AST seguro + formulados + cruzadas + `TemplateField.computed`/`TemplateVersion.rules` + recálculo autoritativo/estampado en API + `ExpressionEditor`/`RulesEditor`/preview en vivo) | `feat/motor-reglas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.8.2 VOID de borradores + ruta de edición** (`status=VOID` + `voidedAt/voidReason/voidedById` + `POST /void` ownership/`logentry:void` + `buildWhere` excluye VOID + evento timeline VOIDED + `VoidEntryModal`/banner + ruta `/bitacoras/:id/editar`) | `feat/void-edicion` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.1.2 Layout de formulario en grilla responsiva** (enum `LayoutWidth` + columna `TemplateField.layoutWidth` + migración `…_add_field_layout_width` + `FieldGrid`/`FieldGridCell` compartido + selector en `BuilderConfigPanel` + cableo de PreviewForm/EntryFillPage/EntryViewerPage) | `feat/layout-grilla` → `main` | ✅ fusionado y publicado en `origin/main` (`a74a320`) | ninguna |
| **Fase 2.1.3 Editor de layout WYSIWYG (12 col + arrastre)** (reemplaza enum `LayoutWidth` por `TemplateField.colSpan` 1..12 + migración `…_field_colspan` + `FieldGrid` numérico + `BuilderFieldCard` con DnD nativo reorder y resize pointer/teclado + presets en `BuilderConfigPanel` + `moveFieldBefore`) | `feat/layout-editor-wysiwyg` → `main` | ✅ fusionado y publicado en `origin/main` (`d84240d`) | ninguna |
| **Fase 2.1.4 Builder canvas-first (config en el lienzo)** (lienzo full-width + `AddFieldMenu` popover + config en `Drawer` + control real WYSIWYG + rótulo/sección inline + `FieldToolbar` flotante + `addFieldAt`/`duplicateField`; frontend puro) | `feat/builder-canvas` → `main` | ✅ fusionado y publicado en `origin/main` (`3f3ccbc`/`a654646`) | ninguna |
| **Fase 2.1.5 Builder auto-layout por arrastre (Notion)** (ancho completo + soltar-al-lado/a-su-línea con ancho auto `splitRow`/`rowRangeOf`/`applyDrop` + divisor de borde `resizeDivider` + quitar menú "12/12" + responsive 1/2/12 + indicadores de soltado; frontend puro) | `feat/builder-autolayout` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.1.6 Builder motor de arrastre con dnd-kit (Canva-grade)** (adopta `@dnd-kit/core`6+`sortable`10+`utilities`3; nodo sortable = celda con reflow animado; tarjeta = activador; `DragOverlay` sigue al cursor; intención al-lado/fila por píxeles reusando `applyDrop`/`splitRow`; `SectionDropArea` droppable de sección; arregla el bug del grip-SVG; frontend puro) | `feat/builder-dnd-kit` → `main` | ✅ fusionado y publicado en `origin/main` (`20e236b`) | ninguna |
| **Fase 2.1.7 Diseñador visual de formularios (lienzo libre)** (geometría `TemplateField.gridX/gridY/gridH` nullable + migración `…_add_field_grid_geometry` + contratos + 3 map sites API; `react-grid-layout` en `SectionCanvas` + `FieldPalette` + `FieldPropertiesPanel`; `FieldGrid` data-driven + container-queries; deriva legacy del orden+colSpan; smoke geometría 14/14) | `feat/builder-visual-designer` → `main` | ✅ fusionado y publicado en `origin/main` (`85cd2c4`) | ninguna |
| **Catálogo de objetos premium · Ola 1** (+11 `FIELD_TYPES` + `LAYOUT`/`RANGE` dataType + migración `…_add_ola1_field_types` ALTER enum; `displayAs` SELECT/MULTISELECT + `format` TEXT/NUMBER + tri-estado/rating/time/duration/range + presentación LAYOUT; `validateFieldValue`/`isEmptyValue`/helpers; guardas LAYOUT en API; FieldControl premium + paleta presets + editores config + lib/format; contracts 204 · API 234 · smoke 21/21) | `feat/objetos-ola1` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 2** (+`REFERENCE`/`RISK_MATRIX` FieldType + `RISK` dataType + migración `…_add_ola2_field_types` ALTER enum; selectores de referencia con ABAC server-side `GET /references/:kind/options` + `opts.allowedRefIds`; tolerancia NUMBER `deriveToleranceBands`; contador `resolveCounterPreviousValues`/delta; `riskLevelFor`; FieldControl render único + paleta "Referencia" + editores; contracts 215 · API 234 · smoke 22/22) | `feat/objetos-ola2` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 3** (+`ATTACHMENT` FieldType + `FILE_ARRAY` dataType + migración `…_add_ola3_field_types` ALTER enum; `StorageService`/`MinioStorageService` (SDK minio) + `StorageModule` @Global + env MINIO_*; subida PROXIED `@fastify/multipart` + endpoints `POST/GET :id/attachments/…`; descriptor jsonb + presigned GET con ABAC; pertenencia por prefijo + delete-on-remove + VOID limpia; `AttachmentControl`/`QrScanButton` (@zxing) + paleta "Evidencia / Terreno" + `apiUpload`; contracts 222 · API 234 · smoke 26/26) | `feat/objetos-ola3` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Catálogo de objetos premium · Ola 4** (+`TABLE`/`MATRIX` FieldType + `TABLE`/`MATRIX` dataType + migración `…_add_ola4_field_types` ALTER enum; `tableFieldConfigSchema`/`matrixFieldConfigSchema` con columnas/ejes = sub-campos escalares; `validateFieldValue` casos TABLE/MATRIX POR CELDA + `requiredFieldError`/`countCompleteTableRows`/`isEmptyMatrixValue`; opacos a resumen/reglas; `RepeatableControl`/`MatrixControl` recursivos sobre `FieldControl` modo `bare` + `TableConfigEditor`/`MatrixConfigEditor` + paleta "Estructurados"; contracts 230 · API 234 · smoke 22/22) | `feat/objetos-ola4` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **FORM_GUIDE.md — mapa de capacidades del formulario (doc VIVO)** (catálogo de objetos + transversales en lenguaje simple, 7 partes por objeto; regla de doc vivo en §0.3 + cierre de CLAUDE.md + memoria) | `docs/form-guide` → `main` | ✅ fusionado y publicado en `origin/main` (`9421959`) | ninguna |
| **Pulidos de UX del Form Builder** (mín/máx caracteres + contador `CharCounter` en Texto/Párrafo; hover de info en `SectionCanvas`; footer Aceptar/Cancelar en el drawer con revert por snapshot; fix Enter en listas `LinesTextarea`; fix preexistente del spec `logbook-query.service` [storage]; FORM_GUIDE actualizado; contracts 239 · API 234) | `feat/builder-ux-pulidos` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Builder: formateo en vivo + paleta de elementos + modal "Ver más"** (RUT al teclear · número/moneda/porcentaje miles+decimales `FormattedNumberInput` · máscara genérica `config.mask`/`applyMask` · «Decimales» expuesto · footer Aceptar/Cancelar en PROPIEDADES + snapshot · paleta DOCKED `FieldPalette` + scroll `scrollToUid` · modal `FieldInfoModal`+`field-info.ts` con demo en vivo · "objeto"→"elemento") | `feat/builder-formateo-paleta` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Bloque N Hardening (config SMTP en BD + editor de plantillas)** (`SystemSettings.email*` + migración `…_add_email_config` aditiva; `EmailConfigService` [getPublic/getResolved/resolveFrom/set, password AES write-only] + `SmtpEmailService` refactor [BD+cache+firma+verify/sendWith] + `EmailController` `GET/PUT/test/verify settings/email` + permiso `notification:config` [cat. **68**]; sender SUPPRESSED si apagado; web tab "Correo saliente" en `/configuracion` [presets+pistas+probar]; editor con vista previa en vivo + diccionario + insertar-en-cursor + `{{entry.summary}}`; contracts 255 · API 234 · smoke `smoke-email-config.py` 8/8 + `smoke-notificaciones.py` 17/17) | `feat/notif-hardening` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3 Programación de rondas** (`LogSchedule`+`RoundOccurrence` + enum `RoundOccurrenceStatus` + migración `…_add_round_scheduling`; `enumerateOccurrences` puro + config por kind + 2 permisos `schedule:view/manage`; módulo API `schedules/` [CRUD/generate/start/skip/occurrences/stats] + hook de cierre en `LogEntriesService` + `ShiftResolver.calendarForNode`; página `/rondas` + `ScheduleDrawer` + badge en `/bitacoras` + menú/i18n; contracts 249 · API 234 · smoke 21/21) | `feat/programacion-rondas` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 2.3.1 Worklist de rondas (separar planificar/ejecutar)** (permiso `round:execute` [cat. 63] + `LogSchedule.responsibleRoleId?` [FK Role SetNull] + migración `…_add_schedule_responsible_role`; `GET /schedules/my-rounds`+`/stats` [responsabilidad EN VIVO por rol ∩ ABAC ∩ turno] + `role-options` + start/skip re-gateados; web `/mis-rondas` [MyRoundsPage] + `/rondas` relabel "Programación de rondas" [monitoreo read-only + selector de rol] + widget Inicio + badge→mis-rondas + nav/i18n; contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 + `smoke-rondas.py` 21/21) | `feat/rondas-worklist` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Bloque N Notificaciones (motor de avisos por correo)** (5 entidades `Notification*` + 4 enums + migración `…_add_notifications` [aditiva]; catálogo `NOTIFICATION_EVENTS` [4] + render sin eval + 4 permisos [cat. **67**]; `@nestjs/schedule`; API `notifications/` [emitter in-tx en `executeTransition`, channel/EmailChannel, resolver ABAC, worker sweeper/dispatcher/sender con backoff, service CRUD+bandeja, `POST /run`]; sweeper GENERA rondas antes de escanear vencidas + SLA breaches; seed 4 plantillas; web `/notificaciones` [Correo saliente/Plantillas/Mis preferencias] + `/mis-notificaciones` + nav/topbar/i18n; contracts 255 · API 234 · smoke `smoke-notificaciones.py` 17/17) | `feat/notificaciones` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.0 Núcleo de Incidencias** (6 entidades `Incident`/`IncidentType`/`IncidentCategory`/`IncidentComment`/`IncidentActivity`/`IncidentTransition` + 3 enums + migración `…_add_incidents` aditiva; `@lyra/contracts/incidents` + 9 permisos [cat. **77**]; `IncidentsService` [ABAC por nodo, workflow reusado + reauth Part 11, catálogos, SLA derivado] + controller + módulo; seed flujo `incidencia-operacional` + 13 tipos + 13 categorías; web `features/incidents/` [/incidencias lista+kanban+GridPager, drawer detalle+stepper+transiciones, modal crear, botón "Reportar incidencia" en el visor] + nav/i18n; contracts 255 · API 234 · smoke `smoke-incidencias.py` 26/26) | `feat/incidencias-nucleo` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.1.0 Excepciones (BACKEND)** (2 entidades `LogEntryException`/`IncidentExceptionLink` + 3 enums + migración `…_add_log_entry_exceptions` aditiva; `@lyra/contracts/incidents/exceptions` + `thresholdExceptionTrigger` + config `warnRaisesException` en NUMBER/TABLE/MATRIX + 4 permisos [cat. **81**]; `ExceptionGeneratorService` @Global [generación síncrona reconciliada en saveSection/seal + purga en VOID, 13.º arg de LogEntriesService] + `ExceptionsService`/controller/module [triage ack/dismiss/correct/convert/associate/manual + dedupe + ABAC + auditoría]; contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39) | `feat/incidencias-excepciones` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Fase 4.1.1 Excepciones (UI)** (filtro `incidentId` en `exceptionListQuerySchema`+`buildWhere`; web `features/exceptions/` [api/queries/presentation + `ExceptionCard`/`ExceptionDetailDrawer`/`ConvertExceptionModal`/`ExceptionReviewPanel`/`ExceptionsPage`]; panel inline en EntryFillPage/EntryViewerPage + banner "advertir no bloquear" al completar con críticas; bandeja global `/excepciones` + ruta + nav `nav.exceptions`; trazabilidad en `IncidentDetailDrawer`; toggle `warnRaisesException` en `BuilderConfigPanel` [NUMBER umbral+tolerancia]; i18n es-CL; contracts 255 · API 234 · smoke 39/39 + filtro incidentId live) | `feat/incidencias-excepciones-ui` → `main` | ✅ fusionado y publicado en `origin/main` (`3565749`) | ninguna |
| **Fase 4.1.2 Acción del motor de reglas (diferida, outbox)** (`action?` en `crossRuleSchema` + `ruleActionSchema` + `ruleActionKind`/`ruleHasAction` + `validateRulesDesign` exige WARN; `assertRuleActionsValid` server; migración `…_add_rule_action_outbox` [tabla `RuleActionOutbox` + enum + `LogEntryException.sectionKey/fieldKey` nullable]; `RuleActionEmitterService` @Global in-tx en submit/executeTransition + `RuleActionWorkerService` @Cron/`runOnce` + `POST /rule-actions/run` [gate `incident:create`]; `ExceptionGeneratorService.createRuleException`; reusa `IncidentsService.create` con originType=RULE + link; UI selector de acción en `RulesEditor` + excepción RULE sin Corregir; contracts 257 · API 234 · smoke `smoke-reglas-incidencias.py` 21/21 + `smoke-excepciones.py` 39/39) | `feat/incidencias-reglas-accion` → `main` | ✅ fusionado y publicado en `origin/main` (`36bdda9`) | ninguna |
| **Incidencias: equipo/activo + fecha del evento en el alta** (`GET /incidents/equipment-options` ABAC; `Incident.occurredAt` nullable + migración `…_add_incident_occurred_at`; create() hereda equipo de la bitácora de origen; modal con selector Equipo [cascada nodo] + Fecha del evento; detalle muestra "Ocurrió"; smoke `smoke-incidencias.py` 30/30) | `feat/incidencias-equipo-fecha` → `main` | ✅ fusionado y publicado en `origin/main` (`900ad89`) | ninguna |
| **Mantenedor de catálogos de incidencias (Tipos + Categorías) [UI]** (web `features/incidents/` [`CatalogsPage` + `IncidentTypeModal`/`IncidentCategoryModal` + `catalogs.module.css`]; `incidents-api`/`-queries` con upserts + `includeInactive` + hooks admin; ruta `/incidencias/catalogos` + botón header [gate `incidentcatalog:manage`, no en sidebar]; backend: guarda "flujo publicado" en `upsertType` + 409 al crear con key existente vía `?create=true`; swatches de color de tokens DS; sin permisos nuevos cat. 81; sin migración; smoke `smoke-catalogos-incidencias.py` 16/16 + `smoke-incidencias.py` 30/30) | `feat/incidencias-catalogos-ui` → `main` | ✅ fusionado y publicado en `origin/main` (`9b0d436`) | ninguna |

| **Fase 4.2a Acciones CAPA** (`IncidentAction` + 3 enums + migración `…_add_incident_actions` aditiva; `@lyra/contracts/incidents/actions` con DTO/requests/enums + helpers `hasOpenMandatoryActions`/`blockingActionsForClose`/`incidentActionCode`; 2 permisos `incident:action:manage`/`:verify` [cat. **83**]; `IncidentActionsService` [CRUD+complete+verify+cancel, ABAC heredada, timeline+auditoría] + 6 endpoints + guarda `assertNoBlockingActions` en `transition`; web `IncidentActionsBlock` + modales + api/queries + meta; contracts 263 · API 234 · smoke `smoke-incidencias-capa.py` 23/23 + `smoke-incidencias.py` 30/30) | `feat/incidencias-capa` → `main` | ✅ fusionado y publicado en `origin/main` | ninguna |

**Estado:** **nada vive solo en local.** `main` = `origin/main`.

**Convención propuesta (a confirmar):** trabajar cada módulo en rama `feat/<modulo>`;
al cerrar la sesión → push de la rama + merge a `main` + push de `main`. Así `origin/main`
nunca queda más de una sesión atrás.

---

## 2. Pendiente por HACER (módulos / submódulos)

### Incidencias — Fase 4 (plan por fases; 4.0/4.1/4.2a ✅)
- [ ] **4.2a · Deuda (no bloqueante):** subida de **archivos de evidencia** a la acción (columna `evidence Json?` ya reservada;
      reusará `StorageService` Ola 3, proxied + presigned GET con ABAC) · **picker de rol responsable** en la UI (el modelo/contrato/
      API ya soportan `responsibleRoleId`; falta un endpoint de role-options del módulo + el selector) · **firma Part 11** al verificar
      eficacia (GxP) · evaluar pasar el `IncidentDetailDrawer` a **pestañas** cuando entren Investigación + evidencia.
- [ ] **4.2b · Investigación (5 Porqués)** configurable por tipo/severidad (honra `requiresInvestigation`). **← siguiente.**
- [ ] **4.3 · Reportabilidad configurable** (autoridad/plazo; genérico, no solo HSE Chile) — §14 de la auditoría.
- [ ] **4.4 · SLA/notificaciones/escalamiento** (depende del épico de **notificaciones avanzadas**) + unificar el criterio de
      "vencida" (`dueAt` vs `maxStayMinutes`, hoy desalineados — §21 de la auditoría).
- [ ] **4.5 · Dashboard/analítica** (MTTR, reincidencia, CAPA vencidas).
- [ ] **Mejoras menores de la auditoría:** campos universales en el alta (medida inmediata, impactos) · dedup entre incidencias ·
      separar seed núcleo neutro vs paquetes verticales por industria (la arquitectura ya lo permite como datos).

### Form Builder — FORMATEO EN VIVO de campos (acordado con el dueño 2026-06-15)
- [x] **A · Quick wins ✅** (`feat/builder-formateo-paleta`): RUT al teclear (`formatRutLive`); número/moneda/porcentaje con
      miles+decimales (`FormattedNumberInput` + `Intl.NumberFormat`); «Decimales» expuesto en NUMBER.
- [x] **B · Máscara de texto genérica ✅** (`config.mask` + `applyMask`: `#/A/*`+literales, p. ej. `OT-#####`). *Diferido:*
      aplicar la máscara también al valor que llega del escáner QR.
- [ ] **Deuda de limpieza:** borrar `BuilderFieldCard.tsx` + `BuilderFieldOverlay` (CÓDIGO MUERTO de la era dnd-kit 2.1.6; el
      lienzo real es `SectionCanvas` desde 2.1.7). No lo importa nadie. Quitarlo evita volver a editar el componente equivocado.
- [ ] **Pulido del modal "Ver más" (diferido):** placeholder/valor de ejemplo precargado en la demo en vivo del elemento.

### Form Builder — CATÁLOGO DE OBJETOS PREMIUM (olas 1–5) — acordado con el dueño (2026-06-15)
El set actual (NUMBER, TEXT, TEXTAREA, SELECT, MULTISELECT, BOOLEAN, DATE, DATETIME, SEVERITY,
SIGNATURE) es el núcleo; el dueño pidió **TODOS** los objetos que ofrecen los sistemas de este tipo,
a nivel **premium/enterprise**. El `prototipo.tsx` ya dibuja varios (radio, checklist, slider, foto,
GPS, tabla, activo/QR). Se entrega por **OLAS** (una por sesión; cerrar cada una).

**ESTÁNDAR PREMIUM (obligatorio por objeto — "terminado" = cumple TODO):** identidad Lyra WatchLog
(solo tokens, Sora/Inter, Lucide, glow no sombras negras, claro+oscuro); componentes en `packages/ui`
(reusar Input/Select/Combobox/LookupPicker/Checkbox/Toggle/Drawer/Modal/Chip/Table; primitivo nuevo
documentado si falta); anatomía común (etiqueta/ayuda/obligatorio/error/readOnly); estados completos
(default/hover/focus-visible/activo/disabled/**inválido**/**vacío**/**cargando**/**readOnly premium**);
a11y AA + teclado + foco visible + táctil ≥44px; validación clara + formato regional (`lib/format.ts`);
listas largas virtualizadas/paginadas; WYSIWYG fiel (control real); render ÚNICO (FieldControl). Si no
llega al nivel, NO se publica: queda aquí con lo que falta.

- [x] **Ola 1 — objetos SIN infra ✅ (2026-06-15, `feat/objetos-ola1` → `main`).** Tri-estado `CONFORMITY` ·
      radio/segmentos/casillas/multiselección-modal vía `displayAs` (SELECT/MULTISELECT) · valoración `RATING`
      (estrellas/numérica/Likert) · `TIME` · `DURATION` (minutos) · `RANGE` {from,to} · RUT/correo/teléfono/URL
      (`TEXT+format`) · porcentaje/moneda (`NUMBER+format`) · presentación `HEADING/STATIC_TEXT/DIVIDER/NOTICE/
      PROCEDURE_LINK/REFERENCE_IMAGE` (`dataType LAYOUT`, el llenado los ignora). 5 forks resueltos (DECISIONS
      2026-06-15). Paleta = presets por categoría. Sin permisos nuevos (catálogo 60). Contracts 204 · API 234 ·
      smoke 21/21. **Pendiente: smoke VISUAL del dueño** (§4). **Deuda fina:** RANGE es el único valor no-escalar
      ({from,to}); revisar export/línea Resumen si se necesita mostrarlo. La imagen de referencia es por URL (el
      upload de imágenes propias es Ola 3/MinIO).
- [x] **Ola 2 — objetos de referencia ✅ (2026-06-15, `feat/objetos-ola2` → `main`).** Selector de equipo/activo
      (ISO 14224) · usuario/responsable · nodo de estructura · turno — **un tipo `REFERENCE` + `config.entity`**,
      `dataType REFERENCE`, opciones + validación ABAC server-side (`GET /log-entries/references/:kind/options`;
      `opts.allowedRefIds`). Lectura con tolerancia (NUMBER + expected±tol → bandas derivadas), contador/acumulado
      (NUMBER + delta vs lectura previa sellada), matriz de riesgo (`RISK_MATRIX`/`dataType RISK`, ejes 2..7 +
      celda→severidad, ISO 31000). 6 forks resueltos (DECISIONS 2026-06-15). Sin permisos nuevos (catálogo 60).
      Contracts 215 · API 234 · smoke 22/22. **Pendiente: smoke VISUAL** (§4). **Deuda:** crew como entidad (hoy TURNO =
      `OperationalShift`); usuario filtrado por alcance de nodo; contador no-decreciente y delta cross-entry sin smoke en
      vivo (requieren entrada sellada previa); estampar el delta del contador como `computed` si se necesita reportar;
      banda de umbral para `RISK_MATRIX` (review-by-exception); resolver id→label de REFERENCE en la grilla/summary.
- [x] **Ola 3 — adjuntos/terreno ✅ (2026-06-15, `feat/objetos-ola3` → `main`).** Foto/cámara · archivo ·
      nota de voz (`MediaRecorder`) · croquis (canvas→PNG) · **escáner QR/código** (`config.scan` sobre TEXT,
      `@zxing/browser`, NO es archivo). Un `FieldType ATTACHMENT` + presets → `dataType FILE_ARRAY` (valor =
      `descriptor[]`). `StorageService` abstracto (token DI) + `MinioStorageService` (SDK `minio`, bucket
      idempotente). Subida **PROXIED** (`@fastify/multipart`, choke-point de validación) a
      `entries/{id}/{fieldKey}/…`; descriptor `{id,key,filename,size,contentType,checksum,uploadedAt,uploadedById}`
      en `LogEntryValue.value` (NUNCA URL); descarga = **presigned GET** con la ABAC de `getDetail`. Pertenencia
      verificada por prefijo + existencia (análogo a `allowedRefIds`); delete-on-remove; VOID limpia huérfanos.
      Migración `…_add_ola3_field_types` (ALTER enum). Render único `AttachmentControl` + paleta "Evidencia /
      Terreno". 4 forks resueltos (DECISIONS 2026-06-15). Sin permisos nuevos (catálogo 60). Contracts 222 · API
      234 · smoke 26/26. **Pendiente: smoke VISUAL** (§4). **Deuda:** antivirus (ClamAV) · object-lock/WORM ·
      thumbnails/lightbox · retención automática · **sweeper de subidas abandonadas** (hoy solo VOID/delete-on-remove
      limpian) · **presigned directo** (escala; hoy proxied) · escáner solo cámara (sin REFERENCE(equipment)-scan) ·
      adjuntos a nivel de REGISTRO/TRANSICIÓN (Req-2 b/c; hoy solo a nivel de CAMPO) · ocultar la `key` cruda del
      descriptor en el detalle (hoy round-trip al cliente; inofensivo: el presign+ABAC es la guarda real).
- [x] **Ola 4 — estructurados ✅ (2026-06-15, `feat/objetos-ola4` → `main`).** **Tabla/grilla repetible**
      (columnas = sub-campos escalares, valor `Array<Record<colKey,escalar>>`, validación POR CELDA, agregar/quitar/
      reordenar) · **grupo/sección repetible** (mismo tipo `TABLE` + `config.layout=cards`) · **matriz parámetro×turno**
      (tipo `MATRIX`, filas/columnas FIJAS configuradas + celda uniforme, `Record<rowKey,Record<colKey,escalar>>`). 4 forks
      resueltos (DECISIONS 2026-06-15): 2 tipos (TABLE+MATRIX) · matriz con columnas configuradas (sin ShiftResolver) ·
      celda solo escalares · sin agregados. `requiredFieldError` generaliza la obligatoriedad (TABLE ≥ filas completas /
      MATRIX ≥1 celda). Opacos a resumen/reglas. Render `RepeatableControl`/`MatrixControl` recursivos sobre `FieldControl`
      (modo `bare`); paleta categoría "Estructurados". Migración ALTER enum. **Sin permisos nuevos (catálogo 60).** Contracts
      230 · API 234 · smoke 22/22. **Pendiente: smoke VISUAL** (§4). **+ Pulido (`fix/objetos-pulido`, 2026-06-15):** ✅ poda
      de filas vacías al guardar (`pruneEmptyTableRows`; maxRows ya no cuenta vacías + jsonb limpio) · ✅ catálogo de celda
      SELECT por lista de referencia RECHAZADO en el diseño (cierra el hueco de validación). **+ (`feat/tablas-umbral-reglas`,
      2026-06-15):** ✅ **umbral por celda numérica → review-by-exception/grilla** (`thresholdBandFor` estampa la PEOR banda de
      las celdas de TABLE/MATRIX) · ✅ **agregados de columna en el motor de reglas** (nodo AST `col` + `sum/avg/min/max/count`
      sobre una columna, en campos calculados y reglas cruzadas; operando "Columna de tabla" en el editor). **Deuda restante:**
      condiciones por FILA del motor (`any/all`: "si alguna fila estado=fuera ⇒ alerta") · resumen "N filas" en la grilla ·
      export CSV de tablas · agregado como COLUMNA visible (pie de tabla) · obligatoriedad fina de MATRIZ (completa / por
      fila-columna; hoy solo ≥1 celda) · `minRows` cuando la tabla NO es obligatoria · REFERENCE/ATTACHMENT/RANGE/RISK en
      celda · tabla ANIDADA · columnas de la matriz desde el calendario operacional en vivo (ShiftResolver) · pulido fino
      sticky/scroll/táctil en tablet.
- [ ] **Ola 5 — origen de datos (Fase 3).** Lectura autocompletada desde tag SCADA/PI/OPC (modelar + stub).

### Incidencias (Fase 4) — fases siguientes (plan aprobado 2026-06-16, DECISIONS)
- [x] **4.0 — Núcleo ✅** (`feat/incidencias-nucleo`): Incident + catálogos + manual + link desde entrada + workflow reusado +
      lista/kanban + ABAC + auditoría + navegación bitácora↔incidencia.
- [~] **4.1 — Excepciones operacionales desde bitácoras.** `LogEntryException` + `IncidentExceptionLink`; detección desde umbral/
      valor inválido/crítico (reusa `thresholdBand`/reglas); panel de excepciones en la bitácora; convertir/asociar/agrupar/descartar
      con motivo/corregir valor con trazabilidad (preserva original); deduplicación por sugerencia; **acción "abrir incidencia" del
      motor de reglas vía evento DIFERIDO** (reusa el outbox transaccional del Bloque N).
  - [x] **4.1.0 — BACKEND ✅** (`feat/incidencias-excepciones`): modelo + migración aditiva + generación síncrona gobernada por
        campo (CRIT siempre / WARN opt-in `warnRaisesException`) reconciliada en guardar/sellar + purga en VOID + triage
        (ack/dismiss[crítica=permiso superior]/correct[GxP]/convert/associate/manual) + dedupe (sugerencia) + ABAC + auditoría +
        4 permisos (cat. **81**). Smoke `smoke-excepciones.py` 39/39. **Deuda fina 4.1.0:** excepción por CELDA de TABLE/MATRIX (hoy
        a nivel de campo) · Part 11 `payloadHash` de la corrección (deuda compartida con 4.0) · `thresholdType=invalid` aún no se
        materializa (tier 1 = validación dura que bloquea guardar; reservado para la regla del motor 4.1.2).
  - [x] **4.1.1 — UI: panel de excepciones en la bitácora ✅** (`feat/incidencias-excepciones-ui`): panel inline plegable en
        llenado/visor (resumen "N críticas · N advertencias · N posibles inválidos" + lista accionable con selección múltiple),
        `ExceptionDetailDrawer` (reconocer/corregir[GxP, reauth si sellada]/crear-asociar incidencia/descartar[crítica=permiso
        superior]), `ConvertExceptionModal` (incidencia nueva o asociar a existente + sugerencia de dedup), banner "advertir no
        bloquear" al completar con críticas, **bandeja GLOBAL `/excepciones`** (KPIs + filtros 1 línea + GridPager arriba/abajo +
        menú, gate `module:incidents:view`), trazabilidad campo→excepción→incidencia en el detalle de la incidencia (filtro
        **`incidentId`** nuevo en `GET /exceptions`), toggle **`warnRaisesException`** en el builder de NUMBER (umbral + tolerancia),
        i18n es-CL · tokens Lyra. Contracts 255 · API 234 · smoke `smoke-excepciones.py` 39/39 (sin regresión; filtro incidentId
        verificado en vivo). **Deuda 4.1.1:** toggle `warnRaisesException` por CELDA de TABLE/MATRIX (requiere antes un editor de
        umbrales por columna, que el builder aún NO expone) · conteo de excepciones abiertas por entrada en la grilla `/bitacoras`
        (hoy se reusa el indicador `worstThresholdBand`; el conteo exige que el listado devuelva el dato) · `CorrectModal` usa la
        config mínima del campo (unidad), sin bandas/opciones completas (el backend valida igual). **Pendiente: smoke VISUAL del dueño.**
  - [x] **4.1.2 — Acción del motor de reglas (diferida vía outbox) ✅** (`feat/incidencias-reglas-accion`). `action?` en `CrossRule`
        (`none|raiseException|openIncident{tipo/categoría/severidad}`, congelada en la versión, sin migración de reglas) + regla con
        acción ⇒ WARN (validateRulesDesign + server). Tabla DEDICADA `RuleActionOutbox` (no se reusa NotificationEvent); emisión
        IN-TX al sellar (submit/executeTransition, `dedupeKey rule:{entryId}:{ruleKey}`); `RuleActionWorkerService` (@Cron + `POST
        /rule-actions/run`) crea la excepción RULE (idempotente) y abre incidencia originType=RULE + link CONVERTED, atribuida al
        actor que selló (reusa IncidentsService.create + ExceptionGeneratorService.createRuleException). `LogEntryException.sectionKey/
        fieldKey` NULLABLE (regla no ata campo; sin "Corregir"). UI: selector de acción en `RulesEditor`. Migración aditiva. Contracts
        257 · API 234 · smoke `smoke-reglas-incidencias.py` 21/21 + `smoke-excepciones.py` 39/39. **Con esto la Fase 4.1 queda
        COMPLETA.** *Diferido:* `thresholdType=invalid` (tier 1 = validación dura que bloquea guardar; no lo produce este corte).
        **Pendiente: smoke VISUAL del dueño.**
- [ ] **Incidencias — extras del alta (opcionales, NO mínimo; evaluación 2026-06-16).** Tras cerrar equipo/activo + fecha del evento,
      quedan como mejoras NO mínimas del formulario de creación: **matriz de riesgo** (probabilidad×consecuencia) en el alta (el modelo
      ya tiene `riskProbability/riskConsequence`; hoy solo en update); **asignar responsable** al crear (hoy se asigna después);
      **flag "reportable"** editable en el modal (hoy default por tipo); **evidencia/adjuntos** a nivel incidencia (→ 4.2, MinIO patrón
      Ola 3). Decidir cuáles entran al alta vs. triage/investigación.
- [x] **Incidencias — MANTENEDOR de catálogos (tipos + categorías) [UI] ✅ (2026-06-17, `feat/incidencias-catalogos-ui`).** Pantalla
      `/incidencias/catalogos` (ruta propia; acceso por botón "Catálogos" en el header de `/incidencias`, gate `incidentcatalog:manage`;
      NO en el sidebar para no doble-resaltar el padre, patrón `/seguridad/*`). Sub-pestañas **Tipos** / **Categorías** con buscador +
      filtro activo/inactivo + orden (1 línea) + `GridPager` arriba/abajo + crear/editar (modal) + toggle activo/inactivo. **Tipo:**
      nombre/key(solo crear)/descripción/color(swatches de tokens DS)/flujo publicado/flags investigación·CAPA·reportable/orden.
      **Categoría:** nombre/key(solo crear)/descripción/tipo(o transversal)/orden. **Backend mínimo:** guarda "flujo por defecto debe
      estar PUBLICADO" en `upsertType`; **rechazo 409** al crear con key existente (query `?create=true`, guarda cliente+server). Sin
      permisos nuevos (cat. 81), sin migración. Contracts 257 · API 234 · smoke `smoke-catalogos-incidencias.py` 16/16 +
      `smoke-incidencias.py` 30/30 (sin regresión); guarda DRAFT verificada en vivo. **Pendiente: smoke VISUAL del dueño.**
- [ ] **4.2 — Investigación + CAPA.** `IncidentInvestigation` (5 Porqués + causa inmediata/básica/raíz + lección) + `IncidentAction`
      (CAPA con responsable/plazo/evidencia/**verificación de eficacia**/reapertura); bloqueo de cierre si hay CAPA obligatorias
      abiertas; **registro Part 11 con `payloadHash` para incidencias** (hoy 4.0 exige re-auth pero no persiste la firma criptográfica);
      adjuntos a nivel de incidencia (MinIO, patrón Ola 3).
- [ ] **4.3 — HSE Chile / minería.** Clasificación (near-miss/CTP/STP/enf. profesional/ambiental/derrame/daño) + potencial de gravedad
      fino + flags reportables (SERNAGEOMIN/mutualidad) + DIAT/DIEP (registro/adjunto) + **IF/IG** (requiere fuente de **HH trabajadas**,
      que HOY no existe) + ICAM como plantilla de investigación (evaluar reuso del form-builder).
- [ ] **4.4 — SLA + Notificaciones + Escalamiento.** SLA por estado/tipo/severidad + escalamiento + integración Bloque N (creación/
      asignación/cambio de estado/SLA/crítica/CAPA vencida). **← roza el épico de notificaciones avanzadas** (abajo).
- [ ] **4.5 — Dashboard e indicadores** (por tipo/estado/severidad/nodo/equipo/turno/origen + tendencias + reincidencias + MTTR + SLA +
      CAPA + IF/IG + heatmap + export).
- [ ] **Deuda fina 4.0:** equipo en el modal de creación (hoy solo en edición; el modelo lo soporta) · `incident:export` (CSV) ·
      facetas/SavedView/peek/multi-sort en la lista (hoy filtros + paginación; el resto de la grilla premium = follow-up) · drag&drop
      en el kanban (hoy clic para abrir + transición por botón con guarda server-side) · resolver id→label de `originLogEntryNumber`
      sin query extra · vistas semilla guardadas (Mis/Críticas/Vencidas…).

### Notificaciones (Bloque N) — deuda diferida (registrada 2026-06-16)
- [ ] **Digest / batching** (resumen diario/horario por usuario). El modelo ya tiene `NotificationPreference.mode IMMEDIATE|DIGEST|OFF`;
      el MVP solo entrega IMMEDIATE (DIGEST se trata como entrega inmediata). Falta la ventana de batch + render de resumen + su tick.
- [ ] **UI de SUSCRIPCIONES** (watchers). El modelo `NotificationSubscription` + endpoints (`GET/POST/DELETE /notifications/subscriptions`,
      `notification:admin`) + la resolución por suscripción YA existen y se honran; falta la pantalla (pestaña en `/notificaciones`).
- [ ] **🎯 NOTIFICACIONES AVANZADAS — épico (requerimiento del dueño 2026-06-16).** Prompt enterprise listo en
      **`docs/prompts/notificaciones-avanzadas.md`** (pégalo en una sesión nueva). Personalización a la medida de cada bitácora/flujo:
      **(1)** disparo **por TRANSICIÓN** configurable en el builder de flujos (¿envía? · qué plantilla · a quién), DATO en
      `WorkflowTransition` congelado en la versión; **(2)** **listas de distribución** (rol/usuarios/autor/rol-del-estado/alcance/
      correos externos con gobernanza); **(3)** **plantillas por bitácora** (`NotificationTemplate.templateId?`, override de la genérica
      con fallback); **(4)** **variables de campo `{{campo.<key>}}`** con **VERSIONADO** (keys estables, valores de la versión congelada
      de la entrada, degradación elegante) — expande el `{{entry.summary}}` actual; **(5)** **defaults a nivel de sistema**
      (`SystemSettings`); **(6)** **canal IN-APP (la campanita)** en el Topbar (contador + dropdown + marcar leídas; poll vs SSE). **ÉPICO
      grande: plan POR FASES** (A=email por transición/bitácora/campos/defaults · B=in-app). Ver memoria [[notif-advanced-requirement]].
- [ ] **`round.overdue` sin rol responsable → fan-out por NODO para correo.** DECISIÓN CONSCIENTE del MVP: cuando `LogSchedule.responsibleRoleId`
      es null, el correo se resuelve **solo por suscripciones** (no se hace fan-out automático a todos los que alcanzan el nodo, para evitar
      tormentas de avisos). El worklist in-app SÍ muestra esas rondas a todos los que alcanzan el nodo. Si se quiere el fan-out por nodo en
      correo, requiere un reverse-ABAC acotado (quién alcanza el nodo). **A confirmar con el dueño.**
- [ ] **Escalamiento por TIERS** (recordatorio diario / a un superior si sigue vencida), estilo PagerDuty escalation policy. Hoy = 1 aviso por
      ocurrencia/breach por destinatario (dedup).
- [ ] **Smoke en vivo de `entry.transition` / `entry.sla.breached` / `entry.signature.pending`.** Los resolvers están typecheck+wired y comparten
      el pipeline (dispatcher/sender/render/ABAC/dedup/opt-out) ya probado end-to-end vía `round.overdue` (smoke 17/17). Falta un smoke que
      siembre una entrada + flujo + transición real y verifique el correo (necesita plantilla publicada con workflow + secciones completas).
- [ ] **Canal in-app / SMS.** La interfaz `NotificationChannel` ya abstrae el canal (solo `EmailChannel` implementado); `NotificationOutbox.channel`
      reserva el modelo. Implementar otros canales no toca el motor.
- [ ] **Escala del worker.** Hoy lote por tick + `@nestjs/schedule`; a escala alta, mover a BullMQ tras la misma interfaz de canal (swap Fase 7).

### Transversal — Manual de uso (`docs/USER_GUIDE.md`)
- [ ] **Backfill INCREMENTAL del manual de uso** (decidido 2026-06-14 con el dueño). Existe
      `docs/USER_GUIDE.md` (documento VIVO) con el **índice completo de funcionalidades** (las pendientes
      marcadas ✍️) y la 1.ª sección redactada (Bitácoras ▸ Anular / Editar, 2.8.2). **Pendiente:** redactar
      las secciones ✍️ de lo ya construido (Fases 1 y 2) a razón de **1–2 por sesión**, además de documentar
      cada funcionalidad NUEVA al cerrar su sesión (ya es regla en `CLAUDE.md` y en §0). NO requiere su propia
      sesión: avanza pegado al trabajo normal.

### Fase 1 — Seguridad + Estructura (en curso)
- [x] **App Shell / Workspace premium** ✅ (2026-06-06). Sidebar colapsable, top bar (breadcrumbs/
      búsqueda ⌘K/densidad/idioma/notificaciones/perfil), pestañas de trabajo acotadas, command palette
      (cmdk), favoritos/recientes, i18n-ready (react-i18next, es-CL), estado en localStorage, +9 primitivos
      `@lyra/ui`. **Pendiente solo el smoke visual** (ver §4).
- [x] **UI Estructura organizacional** ✅ (2026-06-07). Árbol expandible con CRUD de nodos y gestión de
      niveles. `@lyra/ui` ampliado con `Chip`, `Table`, `Select`. Backend: `DELETE /structure/levels/:id`.
- [x] **externalCode en OrgNode** ✅ (2026-06-07). Campo de integración ERP/CMMS/SCADA: migración,
      contratos, backend (service + buildTree), UI (drawer + detalle). i18n. Build limpio.
- [x] **Estructura UX** ✅ (2026-06-08). Workspace full-width + responsivo (tokens de layout +
      breakpoints); **`ResizableSplit`** propio en `@lyra/ui` (reemplaza `react-resizable-panels`);
      **`description`** y **`reportOrder`** en `OrgNode` (full-stack, con backfills no destructivos);
      grilla de hijos ordenable + edición inline del orden; densidad de tabla; dev server fijado a 5173;
      fix responsivo del header del detalle. **Smoke visual ✅** (confirmado por el usuario).
- [x] **Módulo Equipos** ✅ (2026-06-08). CRUD de `Equipment` integration-ready (tag único, categoría,
      criticidad 1–5, estado/baja lógica, orden), catálogo configurable `EquipmentCategory` + drawer de
      gestión, `ExternalReference` polimórfica (modelo + contratos; UI/motor en Fase 3). Migración con
      check constraints, 5 permisos nuevos, guard en `deleteNode`, grilla en `NodeDetail`, seed demo.
      **Estructura organizacional CERRADA.** Ver DECISIONS 2026-06-08.
- [x] **UI Seguridad** ✅ (2026-06-08) sobre `/security/*` — ver PROGRESS y DECISIONS 2026-06-08:
  - [x] Usuarios: listado, alta (contraseña temporal), edición, asignar roles, asignar alcance (scope)
        vía árbol con "incluye descendientes".
  - [x] Roles/permisos: CRUD de roles + matriz de permisos (catálogo de `@lyra/contracts`, agrupada),
        editar `requireMfa` por rol; system no borrable.
  - [x] Política de seguridad: editar contraseñas + bloqueo + **`mfaMode`** global.
  - [x] **MFA de admin**: estado de MFA por usuario + **resetear MFA**
        (`POST /security/users/:id/mfa/reset`, permiso `user:reset-mfa`). *Backend ✅ + UI ✅.*
  - [x] **Reset de contraseña por admin** ✅ (2026-06-08, variante A estilo AD): contraseña temporal +
        cambio forzado + revoca sesiones + auditoría, sin tocar MFA. Permiso nuevo `user:reset-password`
        (catálogo 26), `POST /security/users/:id/reset-password`, UI en pestaña *Seguridad*. Ver DECISIONS.
  - [ ] **Reset de contraseña por enlace (variante B)** — opción futura: el admin dispara el flujo
        self-service por correo (el admin no ve la clave). Requiere SMTP + buzón del usuario. **Prioridad: baja**
        (complementa la variante A ya entregada).
  - [x] Lectura de auditoría (`/security/audit`) con paginación por cursor y diff before/after.
  - **Añadidos**: contrato `auditLogEntrySchema`, primitivo `@lyra/ui` `Checkbox`, navegación por sub-rutas
    anidadas (`routeForPath`/`isRouteActive`). **Pendiente solo el smoke visual** (ver §4).
- [x] **Ampliar `@lyra/ui`** ✅ Fase Shell: Toggle/Tooltip/Menu/Modal/Drawer/Skeleton/Breadcrumb/EmptyState.
      ✅ Fase Estructura (2026-06-07): Chip, Table, Select. Pendiente: nada para esta fase.

### Mejoras futuras de Estructura (enterprise, post-Seguridad)
- [x] **Alcance por plantillas (2.ª dimensión ABAC) ✅ (2026-06-12, `feat/alcance-plantilla` → `main`).** Entidad
      aparte **`TemplateScope`** (`userId|roleId` XOR + `templateId`, sin descendientes), eje ORTOGONAL al `Scope` de
      nodo que combina en **AND**. Semántica **PERMISIVA** (sin scope = ve todas; migración aditiva sin backfill).
      Filtra el **picker** `GET /log-entries/templates` (`applyTemplateScope`) y la **grilla/stats/export** de
      `/bitacoras`; `assertTemplateInScope` en todas las rutas de lectura/llenado de entrada (defensa en profundidad).
      El admin `/plantillas` **NO** se filtra. Asignación por **usuario** (`PUT users/:id/template-scope`) **y rol**
      (`PUT roles/:id/template-scope`), UI `TemplateScopePicker` en pestaña *Alcance* + `RoleDrawer`. Sin permisos
      nuevos (catálogo 59). Tests contracts 149 · API 205. Smoke 14/14. Ver DECISIONS/PROGRESS 2026-06-12.
  - [ ] **Deuda 2.8 (aditiva):** **(a)** flag de instalación/rol "scope ESTRICTO de plantilla" (deny-by-default) si un
        cliente lo exige; **(b)** **agrupador de plantillas** (categorías/etiquetas) para asignar alcance por grupo
        (hoy es por plantilla individual; SAP/Maximo scopean por tipo de objeto); **(c)** smoke VISUAL en navegador.
- [ ] **Demo de capacidades — re-probar con "ownership estricto por campo" (pedido 2026-06-12).** La plantilla
      demo «Bitácora de Turno — Demo Completa» quedó con la sección 2 **compartida** (Operador + Mantenedor) y
      solo `estado_mecanico` reservado. El usuario quiere luego cambiarla a **estricta** (override de rol en
      CADA campo → cada quien edita solo lo suyo) y volver a recorrer el flujo. Es solo config de la plantilla
      (republica v3); aplica a entradas nuevas. Script `scripts/demo-bitacora.py`.
- [ ] **Seguridad a nivel de nodo en el mantenedor de Estructura (ABAC enterprise).** Volver a
      `/estructura` para incorporar gestión de **alcance de datos por nodo** (asignar usuarios/roles a
      nodos con herencia a descendientes) desde el propio árbol/detalle, al estilo de los grandes
      softwares industriales (SAP PM, Maximo): permisos efectivos por rama, vista de "quién tiene acceso
      a este nodo", scoping visual. El **modelo backend ya existe** (`Scope` polimórfico user|role +
      `includeDescendants` + ruta materializada; ver DECISIONS 2026-06-05). Falta la **UI** y conectarla
      con la pantalla de Seguridad. Pedido explícito del usuario (2026-06-08). **Prioridad: media**, tras
      la UI de Seguridad base.

### Identidad / Federación (v2 — diseño aprobado, implementación diferida)
> Diseño registrado el 2026-06-08 (ver DECISIONS). El objetivo es que activar proveedores externos
> (AD/OIDC/SAML) sea **aditivo**. Anclado a **SCIM 2.0** (RFC 7643/7644), **OIDC Core §5.1**, inetOrgPerson.
- [ ] **Set lean de campos de usuario (SCIM-alineado), a agregar cuando se justifique.** `username`
      (login estable, opcional, ≠ email), `firstName`/`lastName`, `phone`, `jobTitle`, `employeeId`,
      `preferredLanguage`/`timezone`. Migración + contratos + UI (pestaña *Datos* del detalle de usuario).
      Alto valor para bitácoras/notificaciones; mapean 1:1 a SCIM/OIDC. **Prioridad: media** (su propia sesión).
- [ ] **Costura de federación (v2): tabla `UserIdentity`** (`userId`, `provider` LOCAL|OIDC|SAML|LDAP,
      `providerKey`, `subject`/`externalId`, `claims jsonb`, `linkedAt`) + `authProvider` en `User`
      (default LOCAL) + reglas de *mastering* de atributos (campos gobernados por el IdP = solo-lectura en UI).
      Permite account linking. **No tocar la tabla `User` ahora**; es migración aditiva al activar un IdP.
- [ ] **SCIM inbound + JIT provisioning + mapeo grupo→rol** (el RBAC ya es 100% dato). **v2.**
- [ ] **MFA delegada al IdP**: `mfaMode` debe poder *deferir* al proveedor (no exigir TOTP propio si el IdP
      ya hizo MFA / AAL suficiente). **v2.**
- [ ] **Validez por fechas para contratistas** (`validFrom`/`validTo`, `userType`) + multi-email/multi-phone.
      **v2 / cuando lo pida un cliente.**

### Módulos intermedios (antes de Fase 2)
- [x] **Módulo Equipos** ✅ (2026-06-08) — ver el ítem cerrado arriba en "Fase 1 — Seguridad + Estructura"
      y DECISIONS 2026-06-08. La descripción original (decisiones a tomar) se conserva abajo como
      referencia histórica de lo decidido.
- [ ] ~~**Módulo Equipos**~~ *(cerrado — texto original conservado como referencia)* Modelo `Equipment`
      (name, code, externalCode, description, reportOrder, type, abbreviation, active, processId FK a
      OrgNode de nivel Proceso/último), migración, contratos (schema + create/update DTOs), service +
      endpoints `GET/POST/PATCH/DELETE /structure/equipment` (gateados por permisos nuevos
      `equipment:view/create/edit/delete` en el catálogo de `@lyra/contracts`), y **grid CRUD en
      `NodeDetail`** al seleccionar un nodo de último nivel — reemplaza el placeholder
      "Equipos — próximamente". Reusar `Table` (sortable + edición inline de orden, igual que hijos),
      `NodeDrawer`-style para alta/edición, descripción como 2ª línea. Seed/backfill de equipos de
      ejemplo opcional. **Antes de codear: confirmar el modelo de `Equipment` con el usuario**
      (¿qué `type`/categorías?, ¿abbreviation obligatoria?, ¿activo/baja lógica?).
  - **Integración (diseño integration-ready, decisión a tomar antes de codear):** la plataforma es
    industrial y conversará con historiadores/MES/EAM (PI System vía **PI Web API**: *WebID* opaco +
    *PI AF path*; **OPC UA**: *NodeId* + namespace/BrowseName; **SAP PM**: Equipment Number / Functional
    Location; **IBM Maximo**: Asset Num; lenguaje de intercambio **ISA-95** Physical Asset). Un equipo
    mapea a **varios** sistemas a la vez ⇒ el `externalCode` único **no basta**. Propuesta a evaluar:
    entidad genérica **`ExternalReference`** (o `SystemLink`) **polimórfica** (dueño `orgNodeId?` **o**
    `equipmentId?` con check constraint, **mismo patrón que `Scope`**) con campos `systemType`/`systemKey`
    (catálogo configurable, NO enum hardcodeado), `externalId` (WebID/NodeId/EquipmentNumber, estable),
    `externalPath` (AF/browse path, legible pero frágil), `endpoint`/namespace, `metadata jsonb`,
    `enabled`/`syncDirection`. Identidad estable de Lyra hacia afuera: el `id` (cuid) ya es inmutable;
    evaluar además un `tag`/assetTag de negocio estable. **El MOTOR de integración (conectar/leer/sync)
    es Fase 3 (Orígenes de datos), NO esta sesión** — aquí solo el modelo de datos + (opcional) UI mínima
    de referencias, para no migrar después. Decidir con el usuario: ¿se crea `ExternalReference` ahora
    (modelo + UI mínima) o solo se deja diseñada y se difiere a Fase 3? Refs: PI Web API WebID, OPC UA
    NodeId, ISA-95/OPC UA companion, ISO 14224 (taxonomía de equipos para confiabilidad).

### Requerimientos del dueño 2026-06-14 (registrados, sin planificar fecha) 🆕
> Capturados el 2026-06-14. Pendientes de plan/aprobación por sesión. Análisis y referencias de industria abajo.

- [x] **2.1.2 — Layout de formulario en GRILLA responsiva ✅ (2026-06-14, `feat/layout-grilla` → `main`).** Ancho por
      campo (columna dedicada en la versión inmutable) + grilla CSS responsiva desde una fuente de render ÚNICA
      `FieldGrid`/`FieldGridCell` (builder-preview + llenado + visor idénticos). Aditivo, default = cero ruptura; NO toca
      validación/umbral/condicional/permisos. **Superado por 2.1.3** (granularidad enum→colSpan 12 + editor WYSIWYG).
- [x] **2.1.3 — Editor de layout WYSIWYG (12 col + arrastre) ✅ (2026-06-14, `feat/layout-editor-wysiwyg` → `main`).**
      Por feedback del dueño (el panel de ancho era "ciego"): el editor del builder pasa a **manipulación directa**
      (arrastrar para reordenar dentro/entre secciones + redimensionar el borde; estándar ServiceNow/Power Apps/Fiori).
      Granularidad a **12 columnas** (`TemplateField.colSpan` 1..12 reemplaza el enum `LayoutWidth`; migración
      `20260614180000_field_colspan`). Sin librería de DnD nueva (DnD nativo `ColumnsDrawer` + pointer-events
      `ResizableSplit`; el builder es de escritorio). Accesible (flechas ↑↓ + handle `role=slider` ← →). Smoke API 14/14.
- [x] **2.1.4 — Builder canvas-first con configuración EN EL LIENZO ✅ (2026-06-14, `feat/builder-canvas` → `main`).**
      Por feedback del dueño (estrecho/poco intuitivo vs Canva): lienzo a todo el ancho (artboard), paleta → popover
      "＋ Agregar campo", config avanzada → `Drawer`; **se configura sobre el lienzo** (control REAL WYSIWYG, rótulo/
      sección inline, barra flotante contextual con ancho/obligatorio/mover/duplicar/eliminar/más opciones). Frontend
      puro. Nuevos `AddFieldMenu`/`FieldToolbar`; `BuilderFieldCard` reescrito; `addFieldAt`/`duplicateField`.
- [x] **2.1.5 — Builder auto-layout por arrastre (Notion) + ancho completo + responsive ✅ (2026-06-14,
      `feat/builder-autolayout` → `main`).** El usuario ya NO piensa en "columnas": arrastra un campo al lado de otro ⇒
      comparten fila (ancho repartido solo); a su propia línea ⇒ ancho completo (`splitRow`/`rowRangeOf`/`applyDrop`).
      Lienzo a todo el ancho; ajuste fino = divisor del borde (`resizeDivider`); se quitó el menú "12/12"; responsive
      móvil 1 / tablet 2 / escritorio 12 col (terreno). Frontend puro.
  - [ ] **2.1.4/2.1.5 Fase 2 (diferida):** arrastrar DESDE la paleta a una posición (drag-to-add); edición inline de
        placeholder/ayuda/opciones; **colapsar secciones**; atajos de teclado + copiar/pegar; multi-selección de campos.
  - [ ] **Deuda 2.1.x (aditiva, si surge caso real):** el editor de layout AVANZADO (posicionamiento absoluto, plantillas
        de layout wizard/pestañas/colapsable) es **2.9.0** (otra sesión), NO aquí. Eventual DnD táctil del builder en
        tablet (hoy es de escritorio; reordenar por teclado ya está con las flechas/barra).
- [ ] **Adjuntos / evidencias en formularios (Req-2).** Subir archivos/fotos. Los grandes (Maximo, SAP DMS, ServiceNow,
      Veeva/MasterControl, j5) lo hacen en **3 niveles** y conviene soportar: **(a) tipo de campo "archivo/foto"** (adjunto
      como dato del formulario), **(b) adjuntos a nivel de REGISTRO** (evidencia general), **(c) adjuntos en la TRANSICIÓN**
      (evidencia al aprobar/rechazar). MVP recomendado: (a)+(b). Storage = **MinIO** (ya está en docker). Requiere pipeline
      de subida (límite de tamaño/tipo, antivirus opcional, URLs firmadas, retención), inmutabilidad al sellar (GxP), audit.
      Ya estaba en §3 como Fase 7; **el dueño lo quiere en plantillas** ⇒ se puede adelantar. **Fase 2 (form builder) + MinIO.**
- [ ] **Notificaciones / Mensajería en TRANSICIONES (Req-1) + pantalla de correo saliente súper configurable (Req-5).**
      Al disparar una transición, **notificar** por canal (mail / SMS / WhatsApp) a roles/usuarios. Quién lo hace:
      **ServiceNow** (notifications + Flow Designer), **Jira** (automation rules), **Camunda** (listeners/connectors),
      **SAP/Maximo** (workflow notifications / escalations + communication templates). Requiere un **MOTOR de
      notificaciones**: canales detrás de una interfaz abstracta (ya existe `EmailService` como molde), **plantillas de
      mensaje**, **resolución de destinatarios** (rol→usuarios), opt-in **por transición** (config en la versión del flujo).
      **Alcance del canal (decisión dueño 2026-06-14): SOLO MAIL.** **SMS y WhatsApp quedan FUERA DE ALCANCE**
      (rompían el on-prem puro: exigían pasarela externa Twilio / Meta WhatsApp Business API). El motor se diseña con
      canales detrás de interfaz abstracta por si en el futuro se reabren, pero **no se construyen** SMS/WhatsApp.
      **Req-5 = pantalla dedicada** de correo saliente
      (SMTP host/puerto/seguridad/auth a BD + perfiles de remitente + editor de plantillas + **botón "enviar prueba"** +
      cola/reintentos), estilo WP Mail SMTP / Odoo "servidores de correo saliente" / settings de GitLab/Jira. Este motor
      lo **reutiliza Incidencias (Fase 4: SLA/escalamiento)** ⇒ es pieza FUNDACIONAL. **Nuevo bloque transversal
      "Notificaciones" (entre Fase 3 y 4; recomendado construirlo antes de Fase 4).**
- [ ] **API de datos por plantilla (Req-3) — salida OUTBOUND.** Exponer las entradas de una plantilla a sistemas externos.
      Recomendación (criterio): **NO** generar un endpoint físico por plantilla (pesadilla de mantención); sí un **único
      motor de API** versionado, **filtrable por `templateId`**, con **API Keys** de máquina (M2M), **scoping por key** (qué
      plantillas/nodos), **rate-limit**, paginación keyset y esquema estable (OpenAPI). Un "endpoint propio por plantilla"
      se ofrece como **alias/URL de conveniencia** sobre ese motor. Patrón: Table API de ServiceNow / Salesforce, API por
      base de Airtable. **Fase 3 (integración, eje OUTBOUND; el inbound SCADA/PI ya es Fase 3).** Ver memoria
      `integration-pending` (API Keys/Webhooks).
- [ ] **Webhooks salientes desde plantillas (Req-4).** Empujar datos a otros sistemas ante eventos (entrada creada/sellada/
      transición). Quién y cómo: **Stripe** (diseño canónico: payload **firmado HMAC**, **reintentos con backoff**, tipos de
      evento, **idempotencia**, log de entregas, rotación de secreto), **GitHub/Shopify** (igual), consumidos por
      **Zapier/Make/n8n**; **ServiceNow** vía outbound REST/business rules. Requiere: **bus de eventos** (ya dejamos el gancho
      `onTransitionExecuted` no-op), **suscripciones** (por plantilla o globales), **firma HMAC**, **cola de reintentos**,
      **log de entregas** + reintento manual. On-prem friendly (solo HTTP POST saliente). Lo difícil = entrega confiable
      (cola+reintentos+idempotencia). **Fase 3 (integración OUTBOUND), junto a Req-3.**
- [ ] **Asistente IA: consulta de bitácoras en LENGUAJE NATURAL (RAG) (Req-6, dueño 2026-06-14).** Preguntar en lenguaje
      natural ("¿qué fallas tuvo la bomba 2 este mes?") y que el asistente responda **citando los folios** de respaldo.
      Técnica = **RAG** (Retrieval-Augmented Generation): (1) **indexar** entradas + base de conocimiento como
      **embeddings**; (2) ante la pregunta, **recuperar** los fragmentos relevantes; (3) el **LLM** redacta la respuesta
      SOLO con eso (con citas), reduciendo alucinación. Piezas: pipeline de ingest/re-index (entradas son inmutables GxP),
      **vector store = `pgvector`** (extensión de Postgres ⇒ **on-prem**, sin servicio nuevo), `LlmProvider` **abstracto**
      (modelo local tipo Ollama/llama.cpp **o** API; CLAUDE.md ya exige la interfaz abstracta), prompt+citas.
      **CRÍTICO de seguridad:** el recuperador DEBE aplicar el **MISMO ABAC** que la grilla — el asistente solo "ve" lo
      que el usuario puede ver (nada de fuga vía IA). Quién lo hace así: Glean, Danswer/Onyx, Azure AI Search + RAG.
      **Fase 6 (Asistente IA), sobre la base de conocimiento; apoyado en la interfaz LLM de Fase 5.**
- [ ] **Inteligencia PREDICTIVA de fallos (Req-6b, dueño 2026-06-14).** Que el sistema **discierna patrones y prediga
      posibles fallos** desde el histórico de bitácoras. Dos niveles, NO confundir:
      **(A) "Insights" asistidos por IA (alcanzable antes):** el LLM razona sobre el histórico recuperado (RAG) y sugiere
      causas probables / patrones / recomendaciones, **con citas**. Extiende el asistente Req-6. **Fase 6.**
      **(B) Predicción ML real (anomalías / predicción de falla):** modelos sobre series de tiempo + datos estructurados
      (los campos numéricos con umbral + equipo + **modos de falla ISO 14224** que YA capturamos son el sustrato; FMEA).
      **Objeción honesta (criterio):** la predicción ML seria **necesita VOLUMEN e historial** (no se predice con semanas
      de datos) + etiquetado + entrenamiento/validación + MLOps ⇒ es un esfuerzo **grande y posterior**. Recomendación:
      capturar datos ya (en curso), entregar (A) en Fase 6, y (B) como **fase posterior/piloto** cuando haya historial.
      Quién: mantenimiento predictivo de IBM Maximo (MAS/Predict), GE/AVEVA Predictive Analytics, SAP PdMS.
      **Fase 6 (insights) + fase posterior (ML real).**

- [~] **Motor de REGLAS DE NEGOCIO y validaciones por plantilla (Req-7, dueño 2026-06-14).**
      **PRIMER CORTE ✅ (2026-06-14, `feat/motor-reglas` → `main`):** expresión SEGURA (AST tipo JSONLogic, evaluador puro,
      sin `eval`) en `@lyra/contracts/rules` = fuente única back↔front; **campos FORMULADOS** (`TemplateField.computed`,
      read-only, valor estampado al guardar / congela al sellar, ÷0 e inputs nulos ⇒ vacío, umbral ISA-18.2 sobre el
      calculado, recálculo autoritativo en servidor); **validación CRUZADA** (`TemplateVersion.rules`, ERROR bloquea /
      WARN informa); ciclos/refs detectados al guardar el diseño; UI builder (ExpressionEditor + sub-pestaña Reglas) +
      preview/llenado en vivo. Smoke 20/20. **PENDIENTE 2.º corte:** **(1)** límites dinámicos (min/max según otro campo o
      lista); **(2)** acciones que disparan otros módulos (abrir incidencia → Fase 4, notificar → bloque Notificaciones,
      exigir firma, marcar para revisión, autocompletar); **(3)** lookups a metadata de listas de referencia (exige
      resolución server-side; rompe pureza del evaluador — pasar pre-resuelto); **(4)** tablas **DMN** para matrices de
      decisión (clase equipo × lectura → severidad); **(5)** obligatoriedad/visibilidad condicional con el motor completo
      (hoy `visibleWhen` es el struct simple); **(6) deuda fina:** un formulado en una sección ya firmada se recomputa
      mientras la entrada no esté sellada (puede invalidar la firma de esa sección → §11.70 lo marca CHANGED_AFTER);
      evaluar "congelar formulados al completar/firmar la sección" o `LogEntryValue.computed Boolean` para filtrar por SQL.
      **Texto original del requerimiento abajo (referencia):**
- [ ] ~~Motor de REGLAS DE NEGOCIO (texto original, conservado como referencia).~~ Que la plantilla deje de ser
      "formulario tonto": reglas configurables declarativas `cuando (condición) → entonces (acción)`. **Ya hay base**
      (obligatorios, rangos min/max, **umbral ISA-18.2**, formato, **`visibleWhen`** condicional, validación 100% en backend
      con fuente única `validateFieldValue` reusada en cliente). Falta el **motor** que agregue: **(1)** validación
      **cruzada** entre campos (si A>B ⇒ error), **(2)** **obligatoriedad/visibilidad condicional** (extiende visibleWhen),
      **(3)** **campos calculados / FORMULADOS** (valor derivado de otros campos + constantes + listas; read-only; auto-actualiza;
      ej. `horas = fin − inicio`, `consumo = lect_final − lect_inicial`, `eficiencia = salida/entrada`, promedios/totales,
      "días desde última mantención"). Detalles: **mismo** motor de expresión seguro; **se ESTAMPA el valor al guardar**
      (registro histórico fijo y reportable, marcado como derivado; recalcula en DRAFT, congela al sellar — GxP);
      **dependencias** (saber qué campos lo alimentan para recalcular); **el umbral ISA-18.2 puede aplicar al valor
      calculado** (ej. eficiencia calculada dispara WARN); manejar **división por cero / inputs nulos** (⇒ vacío) y
      **referencias circulares** (detectar y bloquear); formato regional vía `lib/format`. Cómo lo hacen: Salesforce
      formula fields, Airtable/Notion formulas, ServiceNow calculated fields, hojas de cálculo. **(4)** **límites
      dinámicos** (min/max según otro campo o lista de
      referencia), **(5)** **acciones**: mensaje error/advertencia/info, exigir firma, **abrir incidencia** (→Fase 4),
      **notificar** (→bloque Notificaciones), bloquear envío/transición, marcar para revisión, autocompletar.
      **Cómo lo hacen los grandes:** ServiceNow (Business Rules + UI/Data Policies declarativas + Flow Designer);
      Salesforce (Validation Rules por fórmula + Flows + campos fórmula); SAP **BRFplus**; **Camunda/DMN decision tables**
      (estándar OMG, lógica de decisión declarativa = ideal para matrices "clase de equipo × lectura → severidad");
      Maximo (conditional expressions + automation scripts); Power Apps (business rules declarativas). **Decisión de
      arquitectura clave (criterio):** reglas **DECLARATIVAS first** + **lenguaje de expresión SEGURO y sandboxeado**
      (whitelist tipo JSONLogic/CEL, **NUNCA `eval`/JS arbitrario** — seguridad + on-prem + auditable), evaluado **idéntico
      en cliente y servidor** (extiende la fuente única actual); **NO** scripting libre (sobre-ingeniería + riesgo). Las
      reglas viajan en la **versión INMUTABLE** de la plantilla (cambiar una regla = nueva versión auditada, GxP). Evaluar
      **DMN** para las tablas de decisión complejas. **Encaje por capas:** el NÚCLEO (condiciones + cálculo + validación
      cruzada + fuente única) es **Fase 2** (expande el form engine); las **acciones que disparan** incidencia/
      notificación se cablean cuando existan esos módulos (Fase 4 / Notificaciones).

### Fases siguientes (roadmap, ver PROGRESS §tabla)
- [ ] **Fase 2** — Plantillas / Form Builder + Bitácoras. **Arquitectura enterprise definida en DECISIONS
      2026-06-09** ("formulario = proceso/documento vivo de secciones"; captura multi-actor por fases;
      definición versionada vs ejecución auditada; flujo = máquina de estados configurable integrada al RBAC
      dim. 3; firmas estilo Part 11 opt-in). **El modelo se diseña completo desde el inicio** (secciones +
      flujo + versionado + firma) para no migrar; la UI/comportamiento se construye por sesiones:
  - [x] **2.1 Plantillas: modelo + contratos + Form Builder (estructura).** ✅ (2026-06-09). `Template` 1—N
        `TemplateVersion` inmutable (MMR Part 11) + **secciones** + campos núcleo (número con min/max/**umbral
        ISA-18.2**/unidad, texto, textarea, select/multiselect, booleano, fecha/datetime) + SEVERITY/SIGNATURE
        modelados + validación de config por tipo en backend + permiso por sección (override por campo en el
        modelo) + **vista previa** + **borrador/publicar** (congela versión, editar publicada clona borrador).
        Referencias a `WorkflowDefinition`/firma/recurrencia como columnas (editores 2.2/2.3). 7 permisos
        nuevos (catálogo 33). `@lyra/ui`: `Textarea`. **Sin llenado.** Ver PROGRESS y DECISIONS 2026-06-09.
        **Pendiente: smoke VISUAL** (ver §4).
  - [x] **2.1.1 Endurecimiento de modelo (ADITIVO, antes del llenado 2.4).** ✅ (2026-06-09). Campo en **3 capas**:
        `type` (presentación) + **`dataType`** derivado (enum `FieldDataType`, 12 valores; `deriveDataType`) +
        **`semanticRole?`** (enum `FieldSemanticRole?`, nullable; solo `EFFECTIVE_DATE` con editor/comportamiento,
        ≤1 por versión). `options[]` → **`optionSource`** discriminado (`inline` editable; `referenceList`/`external`
        modelados, sin resolución; `upgradeFieldConfig` sube el shape legacy sin migración SQL). Valor de referencia =
        **`code` estable** (documentado). Migración aditiva `20260609155007_add_field_layers` (backfill de `dataType`
        desde `type`). Form Builder: editor inline `code/label` + toggle "Fecha efectiva". **`LogEntry` diferido 100%
        a 2.4** (solo diseño en DATA_MODEL/DECISIONS; crear tablas nuevas es aditivo). Tests: contracts 23, API 78.
        Smoke en vivo OK. **Pendiente: smoke VISUAL** (§4). Ver PROGRESS y DECISIONS 2026-06-09.
  - [x] **2.x Datos de referencia / Listas (módulo nuevo, hermano de Estructura/Seguridad).** ✅ (2026-06-09).
        Mantenedor de **`ReferenceList`** + **`ReferenceItem`** (`code` estable + `label` + `active` + `sortOrder` +
        **`metadata` jsonb**), catálogo **gobernado** (NO versionado-inmutable). 4 permisos nuevos
        (`module:referencedata:view/manage` + `referencelist:view/manage`, catálogo **41**), auditado. Binding REAL
        de SELECT/MULTISELECT a una lista (`optionSource.referenceList.listKey` por clave, validado en
        `saveDraft`); la vista previa **resuelve** opciones (muestra label, guarda code). Guard "en uso" al borrar
        lista. Mantenedor master-detail `/datos-referencia` + Form Builder (selector de fuente inline↔lista). Seed
        demo `failure-modes` (ISO 14224) + `shifts`. Tests: contracts 44, API 97. El **sync desde APIs externas**
        sigue en **Fase 3** (`source=EXTERNAL` solo modelado); el **hard-delete de ítem con code en uso** se guarda
        cuando exista `LogEntry` (2.4). Ver DECISIONS/PROGRESS 2026-06-09. **Pendiente: smoke VISUAL** (§4).
  - [ ] **Datos de referencia — roadmap industrial** (análisis crítico 2026-06-09, ver DECISIONS; todo ADITIVO,
        cada ítem en su sesión):
    - [x] **Import/export CSV masivo de ítems** ✅ (2026-06-09). Export `;` es-CL + metadata aplanada
          `metadata.<clave>`; import dry-run→commit con upsert por `code`, errores por línea, `deactivateMissing`
          opt-in (nunca borra), tope `REFERENCE_IMPORT_MAX_ROWS` (env), transaccional + auditado. Parser RFC 4180
          propio con auto-detección de delimitador. Web: Exportar/Importar + modal con preview del diff. Tests:
          contracts 46, API 110. Ver DECISIONS/PROGRESS 2026-06-09. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Jerarquía de ítems** (`parentId` self-FK) — ALTA-MEDIA (ISO 14224 es jerárquico; áreas→subáreas;
          especies→productos). El picker gana agrupación/árbol.
    - [ ] **Listas dependientes / cascada** (`optionSource.referenceList.filter {byFieldKey, metadataKey}`) —
          MEDIA, **diseñar con 2.4** (subárea según área; modo de falla según clase de equipo).
    - [ ] **Atributos tipados por lista** (`ReferenceList.metadataSchema` jsonb que valida ítems) — MEDIA
          (gobierno RDM: metadata consistente para reportes).
    - [ ] **Vigencia por ítem** (`validFrom`/`validTo`; resolve filtra por fecha) — MEDIA (contratistas, normativas).
    - [ ] **Mapeo de códigos externos por ítem** (crosswalk/ConceptMap; `systemKey`+`externalCode`) — con **Fase 3**
          (motor de sync `source=EXTERNAL`).
    - [ ] **Deprecación con reemplazo** (`replacedByCode`) — BAJA-MEDIA (reportes puente al sucesor).
    - [ ] **Resolve server-side con búsqueda+paginación** para listas 5k+ — MEDIA, con 2.4/Fase 3 (hoy el resolve
          completo es correcto hasta ~1k ítems).
    - [ ] **i18n de labels** (Fase 7) · **presentación semántica por ítem** (color/icono/abreviatura) — formalizar
          si el patrón se repite (la metadata ya puede llevarlo).
  - [x] **2.2 Flujos reutilizables (`WorkflowDefinition`):** ✅ (2026-06-09). Mantenedor propio (catálogo estilo
        Plantillas) — `WorkflowDefinition` 1—N `WorkflowDefinitionVersion` (inmutable) → estados + transiciones +
        **roles por transición (dato)** + firma/`signatureMeaning`/MFA opt-in; versionado/congelable. `validateWorkflowMachine`
        (fuente única: contrato+backend+builder). FK desde `TemplateVersion` (reemplaza columnas string, `onDelete:
        Restrict`). Binding validado en backend (flujo publicado + versión vigente + `editableInStateKey` ∈ estados).
        Web: `WorkflowBuilder` declarativo + Form Builder (asignar flujo, sección→estado, override de rol por campo
        `TemplateFieldRole`). 4 permisos nuevos (catálogo **37**). Tests: contracts 36, API 88. Ver DECISIONS/PROGRESS.
        **Pendiente: smoke VISUAL** (§4).
  - [x] **2.3.0 Calendario operacional (turnos + periodo contable)** ✅ (2026-06-09). `OperationalCalendar` 1—N
        `OperationalShift` (catálogo VIVO, no versionado) + `PeriodKind` MONTH(anchorDay)/WEEK(startWeekday)/CUSTOM
        (ciclo N días). **`resolveShift`** función pura (`Intl`, sin deps) `timestamp→(operationalDate, shiftCode,
        periodKey)` + **`validateOperationalCalendar`** (sin solapes, huecos OK) = fuentes únicas. **`ShiftResolver`**
        (token DI, patrón EmailService) exportado para 2.4/2.3/Fase 5. FK `OrgNode.operationalCalendarId` + resolución
        por path. 4 permisos (catálogo **45**). Migración aditiva `…_add_operational_calendar`. Web
        `/calendario-operacional` (editor turnos + timeline 24 h + ancla + periodo + **probador** en vivo + nodos).
        Seed `mina-rajo`. Tests: contracts 76, API 119. Smoke en vivo OK. Ver DECISIONS/PROGRESS 2026-06-09.
        **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos del Calendario operacional (aditivos, cuando un cliente lo pida):** calendario fiscal **4-4-5**
          (meses de largo variable, retail/finanzas); **rotación de cuadrillas / turno distinto por día de semana**
          (sería un scheduler); **shift definitions con vigencia** (`validFrom`/`validTo`) para re-resolver timestamps
          históricos con la definición de su época (hoy el catálogo es vivo + estampado en `LogEntry` preserva el
          histórico). Ver DECISIONS 2026-06-09 (forks 2 y 5).
  - [x] **2.3 Programación de rondas ✅ (2026-06-15, `feat/programacion-rondas` → `main`).** Renombrada `LogPeriod` →
        **`LogSchedule`** (horario) + **`RoundOccurrence`** (ocurrencia) tras objetar el nombre (choca con `OperationalPeriod`).
        Horario VIVO (plantilla×nodo×recurrencia SHIFT/INTERVAL/CALENDAR, apoyado en `OperationalCalendar`/`ShiftResolver`) que
        genera ocurrencias materializadas (PENDING/COMPLETED/SKIPPED/CANCELED); la ENTRADA se crea al **iniciar** (reusa
        `LogEntriesService.create`, ligada por `RoundOccurrence.logEntryId @unique`); generación lazy idempotente + botón Generar,
        "vencida" DERIVADA. Página `/rondas` + badge en `/bitacoras`. 2 permisos `schedule:view/manage` (cat. 62). Enumerador PURO
        testeado. Contracts 249 · API 234 · smoke 21/21. **Deuda diferida:** multi-nodo/descendientes · fan-out por equipo (Route) ·
        anclaje a cierre real (floating) · completion-requirement (no abrir la próxima hasta cerrar la anterior) · escalamiento/
        notificación de vencidas (→ Notificaciones) · cron `@nestjs/schedule` · picker de plantilla/nodo propio del planificador
        (hoy reusa el de `logentry:create`) · COMPLETED-on-seal sin smoke en vivo (cubierto por el hook + unit; sellar es
        template-dependiente). **Pendiente: smoke VISUAL** (§4).
  - [x] **2.3.1 Rondas: separar PLANIFICAR de EJECUTAR ✅ (2026-06-16, `feat/rondas-worklist` → `main`).** Permiso nuevo
        **`round:execute`** (cat. 63) gatea ver+ejecutar **"Mis rondas"** (`/mis-rondas`, worklist del operador con toggles
        Pendientes/Mi turno/Vencidas/Próximas + Iniciar/Continuar/Omitir); start/skip se MOVIERON de `schedule:manage` a
        `round:execute`. **`LogSchedule.responsibleRoleId?`** SINGLE nullable (FK Role SetNull) = rol responsable, leído EN VIVO
        (reasignar re-enruta pendientes); `null` = fallback nodo+turno. `/rondas` relabelada **"Programación de rondas"** (CRUD +
        monitoreo read-only + selector de rol responsable), widget en Inicio, badge de /bitacoras → mis-rondas. `GET
        /schedules/my-rounds`+`/stats` (responsabilidad por rol ∩ ABAC ∩ turno) + `role-options` (decoplado de role:read).
        Migración aditiva. Contracts 249 · API 234 · smoke `smoke-mis-rondas.py` 18/18 + `smoke-rondas.py` 21/21. 4 forks en
        DECISIONS 2026-06-16. **Pendiente: smoke VISUAL** (§4). **Deuda diferida:** rol responsable MULTI (hoy single);
        notificar al rol responsable de su ronda vencida (→ Notificaciones); shiftOnly resuelve el turno del calendario por
        defecto (no per-nodo del usuario).
    - [ ] **RONDAS · Route (fan-out por EQUIPO) — pendiente prioritario (pedido 2026-06-16).** Hoy un `LogSchedule` apunta a
          **UN** nodo y opcionalmente **UN** equipo ⇒ para abrir una ronda por activo hay que crear **un horario por equipo**
          (funciona, pero N horarios que mantener). **A construir:** un horario que cubra **varios equipos** de un nodo (todos /
          por categoría / lista) y, en cada ocurrencia, haga **fan-out** = abrir **una `RoundOccurrence` por equipo** (cada una
          con su `equipmentId`, su entrada y su firma). Patrón *Route/Operator Round* de SAP PM (route + measurement points) /
          Maximo (route + asset list) / j5. **Caso de uso real:** 5 estanques de combustible (equipos) chequeados cada hora ⇒ con
          Route = 1 horario → 5 rondas/hora automáticamente, en vez de 5 horarios. Decidir al planificar: selección de equipos
          (categoría/tag/lista) · una entrada por equipo (recomendado, trazabilidad EAM/ISO 14224) vs una entrada con
          sub-secciones por equipo · migración (`LogSchedule` gana el criterio de equipos o tabla puente). **Workaround actual:**
          `scripts/seed-demo-estanques.py` (1 horario por estanque).
    - [ ] **RONDAS · ESCALABILIDAD del planificador a millones de ocurrencias (detectado 2026-06-16).** Hoy es MVP client-side:
          **(a)** `GET /schedules` devuelve TODOS los horarios sin paginar (OK a cientos; pesado a miles en multi-sitio) —
          falta paginación/orden/búsqueda server-side. **(b)** La grilla de **Ocurrencias** carga `take: 500` y pagina/busca/ordena
          en el CLIENTE ⇒ con millones de `RoundOccurrence` **solo se ven las primeras 500**. **(c)** Los filtros (equipo/área/
          bitácoras) se derivan de los datos cargados ⇒ con paginación server-side quedarían incompletos. **A construir (patrón ya
          probado en Bitácoras `LogbookQueryService`):** keyset/cursor + filtros + orden + búsqueda **server-side** para ocurrencias
          (y horarios al crecer); **endpoint de FACETAS** para poblar los dropdowns completos (como `/log-entries/facets`); el
          selector de EQUIPO como **value-help con typeahead server-side** sobre el catálogo de equipos en alcance (no derivado de la
          página). Mientras el volumen sea bajo (config + demos) el MVP basta; agendar antes de un cliente con alto volumen.
    - [ ] **RONDAS · "RUN MODE" — ejecución guiada de la ronda (UX premium del OPERADOR). Retomar DESPUÉS de Notificaciones,
          con PLAN DETALLADO (idea capturada 2026-06-16, pedido del dueño).** Hoy al "Iniciar" se cae en la pantalla genérica de
          llenado; lo potente es un **modo a pantalla completa, paso a paso**, pensado para hacerse caminando en terreno
          (tablet/guantes). **Alcance #1 (recomendado, frontend, reusa `FieldControl`/secciones — NO reinventa validación):**
          una cosa a la vez (sección/equipo por pantalla) · **barra de progreso** ("3 de 8") · botón gigante Siguiente · áreas
          táctiles enormes + teclado numérico grande · swipe entre equipos · **resumen final** (qué quedó fuera de rango) antes de
          sellar. Patrón apps móviles SAP PM / Maximo / j5. **Complementos de alto impacto:** **(A)** "**Todo conforme**" por
          excepción (pre-llena lo esperado, el operador solo toca lo anómalo — velocidad en rondas rutinarias; review-by-exception
          en CAPTURA); **(B)** **escanear el equipo → abre su ronda** (reusa el escáner QR de Ola 3 `@zxing` + endpoint resolver
          equipo→ocurrencia); **(C)** **tendencia/lectura anterior en línea** al capturar un número (valor previo + mini-sparkline +
          delta; extiende el contador/delta de Ola 2). **Estratégica aparte (mayor esfuerzo, su propio proyecto):** **modo OFFLINE**
          (PWA offline-first: descargar mis rondas → llenar sin señal → sincronizar con manejo de conflictos GxP) — alto valor en
          faena minera sin cobertura. **Nota de criterio:** es UX del FLUJO DE LLENADO (no de la pantalla de rondas) ⇒ tratarlo como
          su PROPIA sesión con plan/forks (un objetivo por sesión). **Al retomar: redactar el plan detallado del Run Mode (forks,
          alcance, mockup en texto) y esperar visto bueno antes de codear.**
  - [x] **2.4 Llenado (Nueva entrada) multi-actor** ✅ (2026-06-10). Tablas `LogEntry`/`LogEntrySection`/
        `LogEntryValue`/`LogEntryFieldChange` (aditivas). Secciones editables por estado+rol (dato `TemplateSectionRole`
        + override por campo) × ABAC; validación 100% en servidor (`validateFieldValue` = fuente única reusada en
        cliente); **concurrencia optimista por sección** (409); auditoría por campo. Estampa `recordedAt` (inmutable),
        `effectiveAt` (recalcula en DRAFT, congela al enviar) y vía `ShiftResolver` `shiftCode`/`operationalDate`/
        `periodKey` (nullable = degradación elegante). `workflowDefinitionVersionId` DENORMALIZADO. Web: `FieldControl`
        compartido + `/nueva-entrada` (picker) + `/nueva-entrada/:id` (llenado). 4 permisos (catálogo **49**). Tests:
        contracts 97, API 129. Ver DECISIONS/PROGRESS 2026-06-10. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos de 2.4 (seguimientos, aditivos):** **(a) ✅ RESUELTO en 2.8.0** — selector de NODO al crear (para
          globales y multi-nodo): `NewEntryPage` ofrece los nodos elegibles (asignaciones ∩ ABAC), autoselecciona si hay
          1 y obliga si >1; el backend valida la membresía. **(b)** re-seed del borrador local al resolver un **409** (hoy se recarga la query pero el
          borrador conserva los valores intentados; falta refrescar el editor con lo del servidor sin perder lo no
          guardado). **(c)** edición de una entrada ya enviada (`logentry:edit`/anulación con motivo) — hoy SUBMITTED es
          inmutable. **(d)** hard-delete real de ítem de Lista con `code` en uso (ahora ya hay `LogEntryValue` para
          consultarlo, deuda registrada en 2.x).
  - [x] **2.5 Ejecución de flujo + firmas electrónicas (Part 11)** ✅ (2026-06-10). Motor `executeTransition`
        (rol-dato `WorkflowTransitionRole` × ABAC × completitud de secciones del estado de origen), firmas
        `LogEntrySignature` polimórficas (TRANSITION|SECTION_COMPLETION, check XOR) con re-auth `ReauthService`
        (contraseña + MFA step-up condicional) y hash del snapshot canónico (§11.50/11.70/11.200), recomputo de
        secciones (LOCKED/reapertura), sellado reconciliado a la 1ª transición (submit queda para forms sin flujo),
        `status` terminal SUBMITTED, historial `LogEntryTransition`. Permiso `logentry:transition` (catálogo **50**).
        Gancho `onTransitionExecuted` (no-op) para el bus de eventos/Fase 4. Web: `TransitionModal`/`SectionSignModal`
        + barra de transiciones + timeline. Migración `…_add_log_entry_execution`. Tests: contracts 104, API 144.
        Smoke en vivo 21/21. `/security-review` sin hallazgos. Ver DECISIONS/PROGRESS 2026-06-10. **Pendiente: smoke VISUAL** (§4).
    - [ ] **Diferidos de 2.5 (aditivos):** **(a)** **reversa/anulación de transición** (corrección GxP) — transición
          inversa con motivo obligatorio + su propia firma; el modelo append-only ya la soporta (fork 5 diferido).
          **(b)** guarda de completitud **configurable por transición** (hoy exige COMPLETED todas las secciones del
          estado de origen con campos). **(c)** re-seed del editor al transicionar desde otra pestaña (concurrencia de
          estado, espejo del 409 de sección). **(d)** anulación de entrada (`VOID`): **borradores ✅ en 2.8.2** (motivo
          auditado, `status=VOID`, sin firma); **falta la anulación de una entrada SELLADA** (firma §11.200 + transición
          inversa) — va junto con (a).
  - [x] **2.6.0 Módulo de Bitácoras — núcleo de lectura** ✅ (2026-06-10). Diseño COMPLETO del módulo + slicing en
        DECISIONS 2026-06-10 (9 forks + 3 adiciones de modelo confirmados). Migración aditiva
        `…_add_logbook_review_columns` (folio `entryNumber` con backfill ordenado, `requiresSignature` estampado,
        `thresholdBand` ISA-18.2 estampada + `db:backfill-threshold-bands`, índices createdById/currentStateKey).
        `LogbookQueryService` (CQRS-lite): list con filtros completos en SQL + ABAC + keyset, stats, export CSV
        server-side, timeline ALCOA+ fusionada en backend, changes paginado, related, **verificación de integridad de
        firma** (§11.70, veredicto tri-estado, auditada; canonicalización v2 del payload — descarta valores vacíos —
        y `changedAt` estampado con el reloj de la firma). Web `/bitacoras` (KPIs + filtros + chips + grilla con color
        de estado congelado + indicadores + cursor + deep-link + export) y `/bitacoras/:id` (record viewer EBR:
        mini-stepper, FieldControl readOnly + badges de umbral, panel de firmas con verificación, timeline, log de
        cambios, relacionadas, impresión). `Chip.onRemove` en @lyra/ui. Tests: contracts 113, API 156. Smoke 22/22.
        **Pendiente: smoke VISUAL** (§4).
  - [ ] **2.6.1 Bitácoras — Personalización** **← siguiente recomendada.** `SavedView` server-side como concepto de
        PLATAFORMA (`module` discriminador; config = {filters, search, sort, columns{order,hidden,pinned,widths},
        density}; CRUD del dueño; UNA default por usuario+módulo; **vistas de sistema en código**, no en BD: "Mi
        turno", "Firmas pendientes", "Excepciones", "Últimas 24h"; deep-link a vista; compartir por rol DIFERIDO) +
        **gestor de columnas** (mostrar/ocultar/reordenar drag/pin izq-der/redimensionar/autosize — evolución del
        `Table` de @lyra/ui, reusable por Incidencias Fase 4) + densidad por grilla + recordar última vista (efímero
        localStorage, nombradas en BD). Incluir aquí: **filtro de EQUIPO en UI** (contrato ya lo soporta) y
        **multi-sort** si el gestor lo justifica.
  - [ ] **2.6.2 Bitácoras — Analítica/UX avanzada**: **facetas con conteo por valor** (estilo Splunk/Kibana; de paso
        el select de "estado del flujo" deja de poblarse solo con el set cargado), agrupación con subtotales
        (por plantilla/nodo/turno/estado), peek/quick-look (Drawer lateral sin salir del listado), hover cards,
        copiar al portapapeles (folio/valor), mini-tendencias/sparklines de campos numéricos en el periodo,
        atajos de teclado + ⌘K profundo (abrir vista guardada), atajos "turno actual"/"este periodo" (requieren
        resolver el calendario o facetas), **export con columnas de valores al filtrar por UNA plantilla**,
        contador de cambios por campo inline en sección (popover). Formato LONG de export diferido hasta demanda BI.
  - [ ] **2.7 (cruce Fase 4)** reglas de umbral que disparan incidencias (con el motor de incidencias).
        *Nota 2026-06-11: con el plan post-2.6.0 los números 2.7/2.8/2.9 se reasignan a las fases nuevas (abajo);
        este cruce umbral→incidencia pasa a vivir dentro de la Fase 4.*
  - [ ] **MEJORAS POST-2.6.0 (revisión del dueño del producto, 2026-06-11)** — 10 mejoras registradas; texto
        íntegro en el historial de git de `docs/NEXT_SESSION.md` (commit `db17981`); triage + plan de fases en
        DECISIONS 2026-06-11 (**APROBADO TAL CUAL por el dueño del producto el 2026-06-11**; orden 2.7 → 2.8 → 2.9):
    - [x] **#4 Rediseño "Guardar sección"/"Guardar y completar" + garantía por sección en servidor** ✅
          (2026-06-11, esta sesión). Auditado ANTES de declarar bug: el backend ya gateaba (sin agujero); causas
          reales = datos demo sin roles por sección + DTO sin "porqué" + gap REAL en `submit` sin flujo (sellaba
          sin secciones COMPLETED ⇒ eludía la firma de sección). Ver DECISIONS 2026-06-11.
    - [ ] **Fase 2.7 — Gobernanza temporal del registro** (interdependientes; alta prioridad por integridad):
      - [x] **2.7.0 (#1) Registro diferido** ✅ (2026-06-11, `feat/registro-diferido` → `main`). `entryOrigin`
            ONLINE|DEFERRED DECLARADO + `declaredEffectiveAt`/`deferredReason` (obligatorio)/declarante +
            `PUT :id/deferral` + cadena `campo → declarada → recordedAt` en `resolveEffectiveAt` + huella en
            llenado/grilla (filtro+chip)/visor/timeline (`DEFERRED_DECLARED`) + export CSV. 3 forks resueltos en
            DECISIONS 2026-06-11. Tests: contracts 120 · API 169. Smoke 14/14. **Pendiente: smoke VISUAL** (§4).
        - [ ] **Diferidos de 2.7.0 (aditivos):** **(a)** *nudge* suave de UI cuando `effectiveAt` difiere mucho de
              `recordedAt` sin declaración (invita a declarar; NO guarda de servidor — diseñar con 2.7.2);
              **(b)** KPI/faceta "Diferidas" en `/bitacoras` (hoy hay filtro+chip; el conteo llega natural con las
              facetas de 2.6.2); **(c)** al QUITAR la marca el campo `EFFECTIVE_DATE` escrito por el gesto se
              conserva (decisión: es dato del canal normal) — reevaluar si confunde en la práctica.
      - [x] **2.7.1 (#5) Período contable gobernado** ✅ (2026-06-11, `feat/periodo-gobernado` → `main`). Entidad
            `OperationalPeriod` (calendario × periodKey) OPEN/CLOSING/CLOSED, **modelo LAZY** (ausencia=abierto), cierre/
            reapertura con motivo+permiso+auditoría (`opsperiod.closed|reopened`), guarda única `assertWritable` por
            `effectiveAt` en create/saveSection/setDeferral/submit/executeTransition (`PERIOD_CLOSED`), bypass DATO
            `opsperiod:write-closed` (catálogo **54**), huella proactiva en getDetail + mantenedor en
            `/calendario-operacional`. 4 forks resueltos en DECISIONS 2026-06-11. Tests: contracts 125 · API 180.
            Smoke 17/17. **Pendiente: smoke VISUAL** (§4) + guarda de executeTransition live (cubierta por código+unit).
        - [ ] **Diferidos de 2.7.1 (aditivos):** **(b)** KPI/indicador de períodos cerrados en `/bitacoras`; **(c)**
              vista "¿qué entradas caen en este período?" desde el mantenedor. *(El hard lock pasó a 2.7.1.1 como LOCKED.)*
      - [ ] **2.7.1.1 (#5b) Calendario FISCAL transversal + período al estándar industrial** **← siguiente (APROBADO,
            DECISIONS 2026-06-11).** Corrige el acoplamiento detectado por el dueño del producto: el período contable es
            **transversal**, hoy vive dentro del calendario de turnos. **Desacoplar** en entidad **`FiscalCalendar`**
            (transversal, default + asignación por nodo; `OperationalCalendar` se queda solo con turnos). Modelo
            **Maximo + tri‑estado NetSuite**: períodos con rango From/To contiguos, **generación explícita** ("Generar
            períodos" idempotente), estado **OPEN→CLOSED→LOCKED** (LOCKED duro bloquea incl. bypass; reabrir con
            `opsperiod:unlock`), **cierre secuencial**, fecha sin período = abierta por defecto + flag `requirePeriod`.
            `OperationalPeriod` re‑scopeada a `fiscalCalendarId × periodKey`. Permisos `opsperiod:lock`/`unlock`
            (catálogo **54→56**). Supersede la presentación LAZY y el scope-por-turno de 2.7.1 (modelo de cierre/guarda
            se conserva y endurece). El `periodKey` estampado no se rompe (se migra la config de período). 4 forks +
            corrección estructural resueltos en DECISIONS 2026-06-11. **Su propia sesión.**
      - [x] **2.7.2 (#6) Ventana de edición configurable** ✅ (2026-06-12, `feat/ventana-edicion` → `main`).
            `{ancla RECORDED|EFFECTIVE, duración}` en `Template` (gobernanza VIVA, sin republicar) + fallback global en
            `SystemSettings`; fuera de ventana solo **`logentry:write-expired`** (catálogo **59**) + **motivo auditado**
            (evento dedicado `logentry.editwindow.override` + `FieldChange.reason`) + MFA opt-in (`requireMfaEditWindowOverride`
            vía `ReauthService`). En **AND** con el período ("gana la más estricta", cada guarda con su bypass);
            `blockedReason` extendido con `EDIT_WINDOW_EXPIRED` (precedencia ENTRY_CLOSED→PERIOD_CLOSED→EDIT_WINDOW_EXPIRED→
            reglas de sección). Guarda en `saveSection`/`setDeferral`/`submit` (NO create ni executeTransition); huella
            `editWindow` en `getDetail`. Fuente única `resolveEditWindow`/`editWindowDeadline`/`isEditWindowExpired`. 5 forks
            resueltos (DECISIONS 2026-06-12). Tests contracts 149 · API 200. Smoke 21/21. **Pendiente: smoke VISUAL** (§4).
        - [ ] **Diferidos de 2.7.2 (aditivos):** **(a)** *nudge* suave de UI cuando `effectiveAt` difiere mucho de
              `recordedAt` sin declaración (heredado de 2.7.0(a); UX pura, NO guarda de servidor); **(b)** KPI/faceta
              "Editadas fuera de ventana" en `/bitacoras` (el conteo llega natural con las facetas de 2.6.2; el dato ya
              está en AuditLog `logentry.editwindow.override`).
      - [ ] **2.7.3 (#7) Permisos sección × tiempo**: matriz administrable rol×sección×ventana aplicada en
            servidor; extiende `blockedReason` (+PERIOD_CLOSED, +EDIT_WINDOW_EXPIRED) para que la UI siempre
            diga POR QUÉ.
    - [ ] **Fase 2.8 — Alcance de plantilla + acceso** (absorbe diferido (a) de 2.4 y la 2.6.1 planificada):
      - [x] **2.8.0 (#2) Plantillas multi-nodo** ✅ (2026-06-12, `feat/plantillas-multinodo` → `main`). N:M
            **`TemplateNodeAssignment`** (nodo + `includeDescendants`) = fuente de verdad única de la visibilidad por
            nodo; `Template.orgNodeId` = nodo primario DERIVADO (deprecado, DROP en §3). 3 modos (uno/varios/"todos los
            hijos de X"); **0 asignaciones = GLOBAL** (permisivo). `ScopeService.getAccessibleNodes`+`isTemplateVisibleByNode`;
            selector de nodo al crear **acotado a asignaciones ∩ ABAC** (autoselección si 1, **obliga si >1**),
            `assertNodeAllowedForTemplate` en create/previewNew (**cierra el diferido (a) de 2.4**), endpoint
            `GET /log-entries/templates/:id/nodes`. UI en `TemplateBuilder` (reusa `ScopeTreePicker`) + `NewEntryPage`.
            Sin permisos nuevos (catálogo 59). Tests API **213** (+8). Smoke 15/15. 6 forks en DECISIONS 2026-06-12.
            **Smoke VISUAL ✅** (confirmado por el dueño 2026-06-12).
      - [x] **2.8.0.1 Equipo OPCIONAL al crear entrada (objeto de referencia EAM)** ✅ (2026-06-12,
            `feat/equipo-opcional-entrada` → `main`). Tras elegir el nodo, selector de **equipo opcional** instalado en ese
            nodo (patrón SAP PM/Maximo ubicación+activo; grano ISO 14224 para confiabilidad/Fase 4). `eligibleNodesForTemplate`
            devuelve los equipos activos por nodo; `assertEquipmentInNode` valida pertenencia en create/previewNew; el modal
            de creación se abre también con 1 nodo si tiene equipos. El **equipo se muestra en la cabecera del llenado**.
            `LogEntry.equipmentId` ya existía (2.4). Smoke 18/18 + **VISUAL ✅** (confirmado por el dueño). Ver DECISIONS 2026-06-12.
      - [x] **2.8.0.2 Modo de equipo por PLANTILLA (gobernanza, "opción B") ✅ (2026-06-12, `feat/modo-equipo-plantilla` →
            `main`).** Enum **`EquipmentMode`** `NONE|OPTIONAL|SUGGESTED|REQUIRED` en **`Template`** (contenedor MUTABLE =
            gobernanza viva, default OPTIONAL = cero ruptura). OPTIONAL≡SUGGESTED en backend (permisivos; SUGGESTED solo
            empuja en UI). Enforcement en **`create`/materialización** (`assertEquipmentForMode`: REQUIRED sin equipo → 400,
            NONE con equipo → 400); `previewNew` solo valida NONE. `eligibleNodes` expone `equipmentMode` y omite equipos si
            NONE. Control en `TemplateBuilder` (gate `template:edit`) + lógica del modal en `NewEntryPage`. Sin permisos
            nuevos (catálogo 59). Migración `20260612180000_add_template_equipment_mode`. 6 forks en DECISIONS 2026-06-12.
            Tests contracts **151** · API **216**. Smoke **17/17** (`scripts/smoke-template-equipment-mode.py`, crea+limpia
            por ID). **Pendiente: smoke VISUAL** (§4). Deuda diferida: re-validar al sellar si el equipo REQUIRED se da de baja.
      - [ ] **2.8.1 Bitácoras — Grilla ORIENTADA A CONTENIDO + personalización (#9 + 2.6.1 fusionadas).** **PLAN ACORDADO
            con el dueño (2026-06-12, ver DECISIONS).** Problema raíz detectado por el dueño: la grilla de `/bitacoras` es
            **ciega al contenido** (solo metadatos: folio/plantilla/nodo/estado/fechas/autor) ⇒ no se puede *reconocer ni
            encontrar* un registro por su negocio (temperatura, presión, "operó normal", equipo). Síntesis del estándar
            (SAP Fiori smart columns+variants · j5/Hexagon línea de resumen · Maximo descripción+activo+saved queries ·
            ServiceNow peek+facetas · Splunk facetas con conteo+búsqueda por contenido · EBR/PAS-X review-by-exception).
            **Modelo de columnas en 3 niveles:** (1) metadatos [hoy] · (2) **valores de negocio/Resumen** [lo que falta] ·
            (3) **Equipo** [EAM, ya existe]. **Descriptor (fork resuelto):** la PLANTILLA marca el *pool* de campos
            candidatos (toggle **`showInGrid`** por campo, gobernanza viva) y el USUARIO elige cuáles ver (columnas o línea
            "Resumen") con default sensato — "el diseñador ofrece, el usuario dispone". **Entregar en 3 sub-slices:**
        - [x] **2.8.1a — Contenido reconocible (MVP) ✅ (2026-06-13, `feat/bitacoras-grilla-contenido` → `main`).** Pool de
              candidatos = **`Template.gridFieldKeys String[]`** (gobernanza VIVA del contenedor, `PATCH` "Guardar
              configuración", **NO** `TemplateField.showInGrid` — corrige el plan: poner el flag en la versión inmutable
              forzaría republicar una versión GxP por un hint de visualización; ver DECISIONS). Cap 6 + sin dup +
              `assertGridFieldKeysExist`. Listado expone `summaryValues[]` (batched, cero N+1, code→label, banda umbral) +
              `equipmentTag`; default = línea **Resumen** (3); columna **Equipo** `TAG·Nombre`; **búsqueda por contenido**
              (`EXISTS` sobre candidatos + `pg_trgm` GIN). MISMO where/ABAC ⇒ sin fuga. UI builder (checklist) + `LogbookPage`.
              Sin permisos nuevos (59). Tests contracts 154 · API 216 · smoke 21/21. **Deuda:** búsqueda por LABEL del SELECT
              (hoy matchea el code) · smoke VISUAL.
        - [x] **2.8.1b — Vistas guardadas + gestor de columnas + multi-sort ✅ (2026-06-13, `feat/bitacoras-vistas-guardadas`
              → `main`).** `SavedView` genérica (`module` + `config jsonb`, **ownership-gated**, default único por `(userId,module)`
              vía índice único parcial, migración `20260613130000`) + `SavedViewsModule` CRUD + vistas de SISTEMA en código
              (Firmas pendientes/Excepciones/Últimas 24h) + `Table` column-aware en `@lyra/ui` (orden/ocultar/anclar sticky/anchos/
              densidad + badge prioridad + resize grip) + `ColumnsDrawer` + `ViewBar` (dirty/Guardar como/Actualizar/Predeterminada/
              Eliminar) + última vista localStorage + **multi-sort keyset lexicográfico** (`sorts` CSV, máx 3 indexadas) +
              **columnas de VALOR individuales por plantilla** (con 1 plantilla filtrada). Sin permisos nuevos (catálogo 59). Tests
              contracts 163 · API 224. Smoke 24/24 (`scripts/smoke-saved-views.py`). Ver DECISIONS/PROGRESS 2026-06-13.
          - [ ] **Diferidos de 2.8.1b (aditivos):** **(a)** compartir vistas por ROL (slots `scope`/`sharedRoleId`, aditivo);
                **(b)** **autosize** de columnas (doble-clic mide contenido; hoy hay resize manual); **(c)** vista de sistema
                **"Mi turno"** (requiere `ShiftResolver` para resolver turno/persona actual → 2.8.1c); **(d)** **orden global por
                columnas de VALOR** (hoy solo client-side del lote; global = Fase 7, rompería keyset/denormalización); **(e)** smoke
                VISUAL del dueño.
        - [x] **2.8.1c — Peek + facetas + review-by-exception + "Mi turno" ✅ (2026-06-13, `feat/bitacoras-peek-facetas` →
              `main`).** `GET /log-entries/facets` (5 dims, **conteos de HERMANOS** reusando `buildWhere`+ABAC) + `GET
              /log-entries/my-shift` (`ShiftResolver`) + `exceptionsOnly`. Web: `FacetsPanel` (clic = toggle de filtro → URL/
              SavedView), `PeekDrawer` (vistazo INSTANTÁNEO desde la fila + "Abrir ficha completa"; clic en fila = peek), realce
              por excepción (`rowClassName` en `@lyra/ui` Table), vista de sistema "Mi turno", **filtro de equipo en UI**
              (cierra pendiente de 2.6.1). Sin permisos nuevos (59). Tests contracts 163 · API 227. Smoke 11/11
              (`scripts/smoke-facets-peek.py`). **2.8.1 COMPLETA.** Ver DECISIONS/PROGRESS 2026-06-13.
          - [ ] **Diferidos de 2.8.1c (aditivos):** **(a)** **multi-select por faceta** (requiere volver multi esos filtros,
                como se hizo con nodos); **(b)** facetas/COUNT **a escala** sin COUNT exacto (Redis/rollups) = Fase 7 (§3);
                **(c)** peek con más detalle (valores por sección reusando `getDetail`, hoy muestra resumen+metadatos+indicadores);
                **(d)** smoke VISUAL del dueño.
      - [ ] **Workflow SLA + atrasos (APROBADO por el dueño 2026-06-13, su propia sesión).** Diagrama de flujo premium ya
            entregado (visor/grilla + builder, horizontal+puertos+canal de retorno, dónde-estás/siguiente-paso, tiempos reales,
            responsable por elemento). **Falta (requiere modelo):** **SLA por ESTADO** `WorkflowState.maxStayMinutes` (migración
            aditiva) + campo en `WorkflowBuilder` (min/horas) + contrato → **alerta de atraso** en el diagrama (estado actual
            sobre SLA = anillo rojo; tramos pasados sobre SLA = ámbar) + **grilla**: indicador/columna "Atraso" + filtro/faceta/
            KPI "Retrasadas" (`delayedOnly`, backend: `status=DRAFT AND now−inicio_estado_actual > SLA_estado_actual`). +
            exponer `roleNames` en la transición de la versión congelada para el responsable en el VISOR. Ver DECISIONS 2026-06-13.
        - [ ] **Parte A del #9 (acceso nodo↔grilla):** selector de nodo ágil "mis nodos"/recientes/favoritos + filtros
              persistentes. Intercalable en 2.8.1a/b (presentar micro-alternativa al llegar). El backend ya guarda
              `LogEntryValue`; solo falta exponerlo acotado. Adiciones de modelo: `TemplateField.showInGrid` + `SavedView` (aditivas).
      - [x] **2.8.2 Creación de entrada SIN borradores huérfanos + descarte de borrador** ✅ (deuda de UX/integridad
            detectada 2026-06-11, CERRADA en 2 cortes). **(a) ✅ 2026-06-12** (`feat/ventana-edicion-ux`): persistencia
            diferida — elegir plantilla NO crea nada (`GET /log-entries/new` arma el detalle sin persistir); la entrada
            se materializa en el **primer guardado real** (modo compose). **(b)(c) ✅ 2026-06-14** (`feat/void-edicion`):
            **anulación de borrador** (`POST /log-entries/:id/void`, `status=VOID`, motivo ≥5 auditado, ownership o
            `logentry:void` para ajenas, ABAC; NUNCA borrado físico — ALCOA+; `buildWhere` excluye VOID por defecto,
            recuperable con `?status=VOID`) + **ruta de edición dedicada** `/bitacoras/:id/editar`. Ver DECISIONS/PROGRESS
            2026-06-14. **Falta (corte posterior):** VOID GxP de entradas **SELLADAS** (firma §11.200 + transición
            inversa, junto a la reversa de transición de 2.5(a)).
    - [ ] **Fase 2.9 — Plantillas inteligentes**:
      - [ ] **2.9.0 (#3) Layouts modernos**: modo por versión (clásico/pestañas/wizard/colapsable) + grilla
            responsiva de campos (1/1, 1/2, 1/3) + separadores/ayudas, como DATO de la versión.
      - [ ] **2.9.1 (#8) Motor de reglas de negocio**: condición→acción como dato versionado (mostrar/ocultar,
            habilitar, exigir, calcular, validar entre campos), misma fuente única back↔front (generaliza
            `visibleWhen`/`validateFieldValue`); admin visual sin código; extensible a notificar/escalar/incidente.
    - [ ] **#10 IA-ready**: restricción TRANSVERSAL de diseño (no fase): metadatos estructurados + reglas como
          datos + claves estables; documentar por fase qué habilita. La IA sigue detrás de `LlmProvider`.
  - [ ] **Expansión de tipos de campo (incremental, cada uno pequeño).** Alto valor industrial: **Conforme/No
        conforme/N.A.** (tri-estado), **lookup/picker de referencia** (single/multi, tras 2.x), **picker de
        Equipo/Usuario/Nodo** (`reference`), **grupo repetible / tabla-matriz**, **campo calculado/fórmula**,
        **bloque de instrucción**, **TIME**. Evidencia (MinIO; modelar ahora, construir hacia Fase 7): adjunto,
        **foto**, **código de barras/QR**, **GPS**. Ligeros: escala/Likert, slider %, rating, email, teléfono,
        URL, auto-numérico. El enum `FieldType` crece de forma aditiva. Ver DECISIONS 2026-06-09 (taxonomía).
  - **Permisos nuevos** (catálogo `@lyra/contracts`): `template:view/create/edit/publish/delete`,
    `workflow:view/manage`, `logentry:view/create/fill`, transiciones por dato. **Forks confirmados**
    (ver DECISIONS 2026-06-09): ambas capturas (colaborativa + rondas), firmas Part 11 opt-in, granularidad
    sección+override, flujos reutilizables.
- [ ] **Fase 3** — Orígenes de datos.
- [ ] **Fase 4** — Motor de incidencias (workflow HSE). **Alcance ampliado a modelar desde el inicio** (escenario
      planteado por el usuario 2026-06-09): una **regla de negocio en un campo de bitácora** (umbral ISA-18.2 ya
      modelado en `TemplateField.config`) **dispara una incidencia** (`AutoIncidentRule`) en un **modelo aparte**
      (`Incident`), con su **propio flujo** (reutiliza `WorkflowDefinition` de 2.2). La incidencia puede generar
      **N tareas** (`IncidentTask`/`WorkItem`) **asignables a uno o varios responsables**, **cada tarea con su propio
      flujo**, y cada una capaz de **generar sus propios registros de avance / bitácoras**. Requisitos clave a diseñar:
  - **Procedencia/trazabilidad bidireccional**: `Incident.sourceLogEntryId` (+ campo/valor que disparó), y enlaces
    `Incident → IncidentTask → (registros de avance)`. La **entrada de bitácora original queda atada** a la
    incidencia y a todos los registros derivados (línea de tiempo navegable en ambos sentidos).
  - **Tareas con flujo propio**: `IncidentTask` instancia su `WorkflowDefinition` (definición inmutable vs ejecución
    auditada, igual patrón que `LogEntry`); asignación multi-responsable; firmas/MFA por transición ya disponibles.
  - **Reutilización**: NO duplicar el motor de máquina de estados ni el de definición/ejecución; todo cuelga de
    `WorkflowDefinition` + el patrón de 2.x. La taxonomía de campos (evidencia foto/QR/GPS, etc.) se comparte.
  - **El disparo concreto** (crear la incidencia al cruzar el umbral) es el **cruce Fase 2.7 ↔ Fase 4**; en Fase 2
    solo se modela la regla en el campo. Ver DECISIONS 2026-06-09 (umbrales) y la sección Incidencias de DATA_MODEL.
- [ ] **Fase 5** — Cambio de turno + IA (resumen).
- [ ] **Fase 6** — Base de conocimiento + Dashboard + Asistente IA.
- [ ] **Fase 7** — Endurecimiento (ver §3 y §5).
- [ ] **Plataforma: Eventos de dominio + Webhooks salientes** (módulo transversal; diseño en DECISIONS 2026-06-09).
      **Backbone de eventos** (`logentry.*`, `incident.*`, `task.*`, `structure.*`) con **patrón outbox**
      (entrega at-least-once) que alimenta tanto Notificaciones como **Webhooks salientes** para **empujar datos
      de bitácoras/incidencias/otros a sistemas externos**. `WebhookSubscription` (URL, eventos suscritos, **secreto
      HMAC** cifrado, headers, activo) + `WebhookDelivery` (intentos, status, **reintentos backoff**, **replay**),
      entrega asíncrona/auditada. Espejo SALIENTE de Fase 3 (entrante). **Amplía** el punto "D: Webhooks" de la
      integración pendiente (ya no solo estructura). Se construye **con/después de 2.5**.
- [ ] **Plataforma: Mensajería / Notificaciones multicanal** (módulo transversal; diseño en DECISIONS 2026-06-09).
      Notificar **POR TRANSICIÓN** (se configura cuáles disparan y cuál mensaje; 0..N por transición): **correo** con
      enlace **aprobar/rechazar**, **WhatsApp**, **SMS**, **in-app**; **mantenedor de plantillas de mensaje**
      (`NotificationTemplate`, variables de merge, i18n).
      Reutiliza el `EmailService`/`SmtpEmailService` ya existentes; proveedores SMS/WhatsApp **opcionales**
      (Twilio/Meta) — sin SaaS obligatorio. Disparo = **dato** (campo aditivo `notifications` en
      `WorkflowTransition`); destinatarios por roles/usuarios/asignado/**escalamiento**; **token de acción**
      firmado single-use/TTL (patrón `PasswordResetToken`) con **restricción Part 11** (si la transición exige
      firma, el enlace re-autentica + captura significado, no aprueba "a ciegas" → **security review**); entrega
      **asíncrona** (cola/reintentos/estado de envío/rate-limit/opt-out). **Se construye con/después de Fase 2.5**
      (necesita el evento de transición); compartido con **Fase 4 (SLA/escalamiento de incidencias)** y **Fase 5**.
      El mantenedor de plantillas puede adelantarse. **Prioridad: alta dentro de 2.5+.**

---

## 3. Deuda técnica / seguridad REGISTRADA (no perder)

> Items con fundamento ya discutidos; aquí para que no se diluyan en `DECISIONS.md`.

- [ ] **DROP de `Template.orgNodeId` (deprecado tras 2.8.0).** Con `TemplateNodeAssignment` como fuente de verdad de
      la visibilidad por nodo, `Template.orgNodeId` quedó como "nodo primario" DERIVADO (no editable por separado; sin
      drift). Limpieza mecánica pendiente: quitar la columna de la lógica restante (proyección/audit), del contrato
      (`templateSchema.orgNodeId` y los `@deprecated` en create/update/saveDraft), de la web que aún lo lea, y migración
      de DROP. **No urgente** (la columna es inerte). Ver DECISIONS 2026-06-12 (fork 1).
- [ ] **`OrgNode.externalCode` plano → migrar a `ExternalReference`.** El campo único `externalCode`
      de OrgNode (Fase Estructura) quedó como atajo de un solo sistema; con `ExternalReference`
      polimórfica ya disponible, debe unificarse ahí (un nodo puede mapear a varios sistemas). Migración
      de datos no destructiva + ajustar UI del nodo. **Hacer junto con el motor de integración (Fase 3).**
- [ ] **`ExternalReference`: UI de mapeos + catálogo de `systemType`.** Modelo y contratos ya existen
      (2026-06-08); la **UI** de gestión de referencias externas y el catálogo configurable de sistemas
      (`systemType`) se construyen en **Fase 3 (Orígenes de datos)** junto al motor de conexión/sync.
- [ ] **`User.passwordHash` debe ser nullable + separar login de email (preparación de federación).** Hoy
      el login es el email y la contraseña local es obligatoria; un usuario federado (AD/OIDC) no tendrá
      contraseña local y su login estable puede no ser el email. Hacer `passwordHash` nullable y prever
      `username` como login estable evita una migración dolorosa en v2. Ref: DECISIONS 2026-06-08
      (federación). **Prioridad: media**, junto con el set lean de campos.
- [ ] **`user:disable` sin enforcement.** El cambio de `status` (ACTIVE↔DISABLED) viaja por
      `PATCH /security/users/:id` gateado por `user:edit`; el permiso `user:disable` del catálogo no lo
      exige ningún guard. Decidir: (a) separar endpoint/guard de habilitar/deshabilitar, o (b) retirar la
      clave. La UI hoy gatea el toggle de estado por `user:edit`. Ref: DECISIONS 2026-06-08. **Prioridad: baja.**
- [ ] **`forcePasswordChange` con enforcement solo en UI.** Hoy `ProtectedRoute` redirige,
      pero el backend no bloquea otros endpoints. Igualarlo al gate de MFA (claim + guard).
      Ref: `SECURITY.md` §7 (residual). **Prioridad: media-alta** (auditoría).
- [ ] **Rechazo de contraseñas comprometidas** (NIST 800-63B §5.1.1.2; HIBP k-anonymity o
      lista local). Pluggable y **apagado por defecto** (on-premise). Aplica a change/force/
      reset. Ref: `DECISIONS.md` 2026-06-06 (reset). **Fase 7 / transversal.**
- [ ] **Anti-replay del mismo OTP** dentro de su ventana de validez (TOTP). Deuda menor.
      Ref: `SECURITY.md` §7.
- [ ] **`mfaMode = REQUIRED_BY_ROLE`: cambiar `requireMfa` no invalida tokens vigentes.** El
      gate se aplica al siguiente refresh (≤15 min). Decidir si se fuerza (revocar sesiones
      de los miembros del rol al activar el requisito) o se acepta la latencia. **Prioridad: baja.**
- [ ] **Bundle web grande** (~743 KB JS): code-splitting / `manualChunks`. **Fase 7.**
- [ ] **Ranura OIDC/LDAP**: diseñada, `AuthProvider` listo; se activa cuando un cliente lo pida.
- [ ] **Flujos (`WorkflowDefinition`) — gaps de gobernanza (no afectan integridad).** La integridad histórica
      ya está garantizada (inmutabilidad de versiones publicadas + FK `onDelete: Restrict` + guard "en uso" en
      `remove` + validación FSM). Falta el **gobierno/UX proactivo**, registrado el 2026-06-09:
  - **Aviso proactivo de impacto al editar/publicar un flujo en uso.** Hoy, si una versión nueva elimina/renombra
    un estado que plantillas vivas usan en `editableInStateKey`, la incompatibilidad **solo se detecta cuando esa
    plantilla se re-vincula** (400 en `TemplatesService.saveDraft`). Falta un "⚠️ N plantillas usan el estado *X*"
    en el momento de editar/publicar el flujo, y/o un visor de **"¿qué plantillas usan este flujo?"**. **Prioridad:
    media; cobra más valor junto con la ejecución 2.5.**
  - **Concurrencia optimista en el builder de flujos** (igual que se hará en el llenado por sección): dos admins
    editando el mismo borrador → hoy *last-write-wins* (reemplazo total). Añadir revisión/`updatedAt` check. **Prioridad: baja.**
  - **El conteo "en uso" es conservador**: cuenta `TemplateVersion` en borrador e incluso de plantillas con borrado
    lógico. Evaluar acotar a publicadas/activas si molesta en la práctica. **Prioridad: baja.**

- [ ] **Verificación de firmas — nota de compatibilidad (2.6).** La canonicalización v2 del payload (descarta
      valores vacíos) hace que firmas creadas ANTES de 2.6 cuyo mapa firmado contenía claves con `null` verifiquen
      `INVALID`. Hoy solo existían datos de demo/smoke (aceptado en DECISIONS 2026-06-10). Si alguna vez se migra una
      instalación con firmas v1 reales, implementar verificación dual (intentar v1 y v2). **Prioridad: informativa.**
- [ ] **Firmas/re-auth (Fase 2.5) — deuda de endurecimiento (no afecta integridad).** Registrada el 2026-06-10
      tras `/security-review` (sin hallazgos explotables):
  - **Throttle de re-auth de firma**: `ReauthService.verifyForSignature` no tiene contador propio de fallos. No es
    explotable en la práctica (el actor re-autentica su PROPIA contraseña en una sesión ya autenticada), pero como
    defensa en profundidad conviene reutilizar el lockout de contraseña o un contador dedicado. **Prioridad: baja.**
  - **Recovery code consumido antes del commit**: en el step-up MFA con código de recuperación, `assertSecondFactor`
    consume el código antes de la transacción de la transición; si la tx falla después, el código queda gastado.
    Mover la verificación MFA dentro de la tx o compensar. **Prioridad: baja** (operacional, no de seguridad).
  - **PKI / sello de tiempo cualificado**: hoy la firma es hash SHA-256 + metadatos (integridad/no repudio interno).
    Firma criptográfica con validez probatoria externa (PAdES/sello cualificado) **diferida a Fase 7**.

### Recomendaciones de endurecimiento (Fase 7, ya registradas)
Respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) ·
rate-limit global + CSP/HSTS (Caddy) · exportación CSV/PDF · notificaciones SMTP
(SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · modo offline
terreno (PWA) · retención/borrado lógico · adjuntos/evidencias en MinIO · firma con validez
probatoria (hash+timestamp). Ref: `DECISIONS.md` (sección de recomendaciones).

#### Escalabilidad de la grilla de Bitácoras a MILLONES de registros (consulta del dueño 2026-06-13)
Análisis hecho el 2026-06-13. **Resuelto ya (no es Fase 7):** índices COMPUESTOS para keyset
(`LogEntry(recordedAt,id)` + `(effectiveAt,id)`, migración `20260613120000_add_logentry_keyset_indexes`)
— el orden por defecto `recordedAt desc` no tenía índice. Lo que **sí** es Fase 7 (endurecimiento), con su
implementación esperada:
- [ ] **KPIs/stats sin `COUNT` exacto a escala** (el cuello de botella real). Hoy `stats()` hace 5 conteos sobre el
      set filtrado, 2 con semi-join a `LogEntryValue`/`LogEntrySection`. Implementación: **caché corta en Redis**
      (`CacheService` ya existe) por hash de filtros, y/o **rollups materializados** (tabla/vista materializada de
      conteos por día×nodo×plantilla×estado refrescada por job o trigger), con *fallback* a conteo en vivo para
      filtros ad-hoc; opción de conteos **aproximados**. KPIs bajo demanda si se prefiere.
- [ ] **Búsqueda por contenido full-text** (hoy `ILIKE` sobre `value::text` con índice GIN trgm + cap de 5.000 ids).
      Implementación in-Postgres: **columna `tsvector`** denormalizada de los valores `gridFieldKeys`, GIN + `@@`
      con ranking, mantenida por trigger/al guardar; o, a gran escala, **OpenSearch** (indexa entradas → ids →
      hidrata de Postgres) — solo si un cliente lo exige (rompe la simplicidad on-prem).
- [ ] **Particionado por tiempo de `LogEntry`** (+ `LogEntryValue`/`LogEntryFieldChange`). Implementación:
      `PARTITION BY RANGE (recordedAt)` mensual (PK compuesta con `recordedAt`), creación/*drop* de particiones por
      `pg_partman` o job; **partition pruning** por filtros de fecha + archivado barato de particiones viejas.
      Migración no trivial (raw SQL, Prisma no gestiona particiones). El modelo ya estampa `recordedAt`/
      `operationalDate`/`periodKey` (partition-ready). Acompaña **retención/archivado**.
- [ ] **Paginador absoluto** (saltar a "página N de millones") queda DESCARTADO con keyset (no random-access);
      a escala el patrón es FILTRAR (ya hay filtros potentes + multi-nodo). El paginador actual es relativo a la
      ventana cargada (lotes de 100). Solo si un cliente lo exige se evaluaría offset+count (no escala).
- [ ] **Export CSV** capado a 100.000 filas (`EXPORT_MAX_ROWS`, marca `truncated`) — revisar a demanda.
- [ ] **"Retrasadas" (Workflow SLA) a escala** (2026-06-13). Hoy `delayedEntryIds()` resuelve los ids vencidos con un
      JOIN raw `LogEntry→WorkflowState` (cap **5.000**) intersectado con el `where`+ABAC del listado (cero fuga, MVP
      correcto). A escala: **materializar el atraso** (columna/flag `isDelayed` denormalizado o vista materializada
      refrescada por job, ya que el vencimiento depende de `now()`), o un índice parcial sobre DRAFT; integrar con la
      caché de KPIs de arriba. El `currentStateSince` ya está estampado (partition/index-ready).
- [ ] **SLA en HORAS HÁBILES** (Workflow SLA, futuro). Hoy el atraso es tiempo CALENDARIO. Las horas hábiles requieren
      acoplar el calendario operacional/turnos (`OperationalCalendar`/`ShiftResolver`) al cómputo de `evaluateSla`
      (descontar no-laborables). Solo si un cliente lo pide.

---

## 4. Pendiente por PROBAR (gaps de verificación)

> Lo construido puede estar "verde en tests" pero no ejercido en condiciones reales.

- [ ] **Notificaciones — hardening — smoke VISUAL** (se verificó typecheck/lint/build + smokes 8/8 y 17/17; falta el clic).
      **`/configuracion` ▸ Correo saliente** (gate `notification:config`): elegir un preset (Gmail/Mailpit…) que rellena host/puerto
      + muestra su pista; guardar (la clave no se muestra, queda "configurada"); **Probar conexión** y **Enviar prueba** (verlo en
      MAILPIT `:8025`); apagar "Correo activado". **`/notificaciones` ▸ Plantillas**: insertar variables en el cursor del asunto/
      cuerpo desde el diccionario (con descripción+ejemplo), ver la **vista previa en vivo** actualizarse, y comprobar que
      `{{entry.summary}}` aparece en el catálogo de los eventos de entrada. Verificar claro+oscuro, 44px, tokens Lyra.
- [ ] **Notificaciones (Bloque N) — smoke VISUAL en navegador** (se verificó typecheck/lint/build + smoke API 17/17; falta el
      clic). **`/notificaciones`** (gate `module:notifications:view`): pestaña **Correo saliente** (filtrar por estado/buscar,
      abrir un correo → vista previa HTML en iframe, reintentar uno FAILED), **Plantillas** (elegir una, insertar variables con
      los chips, editar asunto/cuerpos, guardar; intentar una variable no permitida → toast de error), **Mis preferencias**
      (apagar/encender un evento). **`/mis-notificaciones`** desde el menú de perfil (todo usuario). Verificar claro+oscuro, 44px,
      tokens Lyra. Generar correos reales: dejar una ronda vencer (o usar `POST /notifications/run`) y verlos en MAILPIT (`:8025`).
- [ ] **Catálogo de objetos · Ola 4 (estructurados) — smoke VISUAL en navegador** (se verificó typecheck/lint/build +
      smoke API round-trip 22/22; falta el clic). Por cada objeto: agregarlo desde la paleta (categoría **Estructurados**),
      configurarlo en el builder (columnas: rótulo/tipo/obligatoria + opciones inline de un SELECT; minRows/maxRows; layout
      tabla vs tarjetas; ejes y celda de la matriz), y en una entrada: **Tabla repetible** (agregar/quitar/reordenar fila a
      44px, scroll horizontal con encabezado/1ª columna sticky en tablet, celda inválida marca borde rojo, total de filas
      ≥ min al completar), **Grupo repetible** (tarjetas "agregar otro" apiladas), **Matriz parámetro×turno** (cabeceras
      read-only, celdas editables, 1ª columna sticky). Verificar estados (vacío/inválido/readOnly del visor), claro+oscuro,
      44px, responsive. App en `:5173`.
- [ ] **Catálogo de objetos · Ola 3 (adjuntos/terreno) — smoke VISUAL en navegador** (se verificó typecheck/lint/build +
      smoke API/MinIO 26/26; falta el clic). Por cada objeto de **Evidencia / Terreno**: agregarlo desde la paleta, verlo
      en el lienzo (marcador "se sube al llenar"), configurarlo (multiple/maxCount/maxSizeMb/accept/cámara), y en una
      entrada: **Foto** (capturar con cámara en tablet / subir de galería; miniatura/descarga), **Archivo** (PDF), **Nota
      de voz** (grabar con `MediaRecorder` + detener + reproducir/descargar), **Croquis** (dibujar en el lienzo→guardar
      PNG), **Escáner QR** (apuntar la cámara, decodifica y rellena el TAG). Verificar: **VISTA PREVIA al hacer clic** (botón
      "Ver" / ítem clicable abre el modal: imagen en lightbox, audio/video reproducibles, PDF en iframe, otros → abrir en
      pestaña), descarga (presigned), quitar un adjunto, estados (busy/error/inválido/vacío/readOnly), claro+oscuro, 44px,
      responsive. App en `:5173`.
- [ ] **Catálogo de objetos · Ola 2 — smoke VISUAL en navegador** (selectores de referencia equipo/usuario/nodo/turno con
      dropdown/modal, tolerancia objetivo±tol, contador con delta, matriz de riesgo clicable + heatmap del editor).
- [ ] **Catálogo de objetos · Ola 1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build + smoke API
      round-trip 21/21; falta el clic). Por cada objeto nuevo: agregarlo desde la paleta (categorías Básicos/
      Selección/Evaluación/Presentación), verlo en el lienzo (WYSIWYG), configurarlo (format/displayAs/rating
      estilo+máx/conformidad N.A./aviso variante+texto/encabezado nivel/enlace/imagen URL), y llenarlo en una
      entrada. Revisar **estados** (default/hover/focus/inválido/vacío/readOnly), **claro y oscuro**, áreas
      táctiles 44px y **responsive** (tablet 2 col / móvil 1). Casos: tri-estado colores; estrellas/likert;
      duración HH:MM y rango mín–máx; RUT/correo/% con su validación; multiselección MODAL (LookupPicker);
      objetos de presentación (encabezado/aviso/separador/enlace/imagen) que NO piden dato. App en `:5173`.

- [ ] **App Shell — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + que el dev
      sirve; falta el clic): colapsar/expandir sidebar, abrir/cerrar/fijar pestañas (sin refrescos),
      ⌘K (saltar, densidad, idioma, tema, logout), cambiar idioma y densidad, menú de perfil, favoritos.
- [ ] **Estructura — smoke VISUAL en navegador** (actualizado tras master-detail v2): navegar a
      `/estructura`, seleccionar un nodo (panel derecho aparece con breadcrumb + hijos), navegar
      via breadcrumb, usar acciones del header (editar/mover/eliminar), CRUD de hijos inline desde
      la tabla del panel derecho, verificar botón "Equipos — próximamente" en el nivel Proceso,
      abrir `LevelsDrawer`, modo claro y oscuro. App en `:5173`.
- [x] **Estructura UX 2026-06-08 — smoke VISUAL** ✅ (confirmado por el usuario): splitter, 2ª línea de
      descripción en árbol y grilla, orden de columnas, edición inline del orden, full-width y
      comportamiento en iPad (tras el fix del header que aplastaba la descripción). Pendiente menor no
      bloqueante: QA explícito de **modo claro** en esta pantalla (se cubre en el ítem "Modo claro — QA
      visual" más abajo).
- [ ] **Equipos — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): seleccionar un nodo de nivel Proceso → aparece la grilla de equipos; alta/edición vía
      `EquipmentDrawer` (tag, categoría, criticidad, toggle de estado); edición inline del orden; abrir
      `CategoriesDrawer` (crear/editar/activar/eliminar categoría); borrar equipo (modal); chips de
      criticidad (colores Severidad 1–5) y de estado; modo claro y oscuro. App en `:5173`.
- [x] **Seguridad — smoke VISUAL en navegador** ✅ (2026-06-09, confirmado por el usuario): sub-tabs
      `/seguridad/{usuarios,roles,politica,auditoria}` (deep-link + breadcrumb + una sola pestaña), alta de
      usuario, detalle con pestañas (datos/roles/**scope** con buscador/**Seguridad**: reset de contraseña +
      **reset de MFA**, MFA self-service probado en vivo), CRUD de roles + **matriz de permisos** con buscador
      + `requireMfa`, **política** (incl. `mfaMode`), **auditoría** filtrable + export CSV, búsquedas y
      exportaciones. Pendiente menor no bloqueante: QA explícito de **modo claro** (ítem propio más abajo).
- [ ] **Plantillas 2.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): `/plantillas` (grilla, buscador, filtro de estado, estados vacíos), crear plantilla
      (modal → builder), builder (agregar sección, agregar campos núcleo desde la paleta, configurar etiqueta/
      obligatorio, NÚMERO con unidad+min/max+**bandas de umbral**, opciones de select, **condicional por
      booleano**, **roles por sección**, firma Part 11 opt-in, reordenar con flechas, borrar), **vista previa**
      (incl. número fuera de rango), **Guardar borrador** y **Publicar** (confirmación + versión congelada),
      editar publicada (crea borrador v2), borrar plantilla; modo claro. App en `:5173`.
- [ ] **Plantillas 2.1.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): en el builder, agregar un SELECT/MULTISELECT y editar opciones inline (verificar que cada
      línea genera un `code` estable + `label`); marcar el toggle **"Fecha efectiva del registro"** en un campo
      DATE/DATETIME y comprobar que al marcar otro se **desmarca el anterior**; vista previa del SELECT usando los
      codes; guardar/publicar; modo claro. App en `:5173`.
- [ ] **Flujos 2.2 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API; falta el
      clic): `/flujos` (grilla, buscador, filtro de estado, estados vacíos), crear flujo (modal → builder), builder
      (agregar estados, marcar inicial único/final, color; agregar transiciones from→to, etiqueta, roles permitidos,
      toggles firma+significado / MFA; **banner de validación FSM en vivo**; publicar deshabilitado si es inválida),
      **Guardar borrador** y **Publicar** (congela versión), editar publicada (clona borrador), borrar (bloqueado si
      en uso); en el **Form Builder**: asignar un flujo publicado, mapear secciones→estados editables, editar el
      **override de rol por campo**; modo claro. App en `:5173`.
- [ ] **Fase 2.1.7 Diseñador visual de formularios (lienzo libre, react-grid-layout) — smoke VISUAL en navegador**
      (typecheck/lint/build OK; smoke geometría 14/14; falta el clic): en el **builder** (`/plantillas/:id`, Diseño ▸
      Editor) hay **3 zonas**: PALETA (izq, buscador + categorías), LIENZO (centro), PROPIEDADES (der). **(1)** Arrastra un
      objeto de la paleta a una **posición** del lienzo (o clic = al final). **(2)** Mueve un campo existente **libremente**.
      **(3)** Redimensiónalo desde los **handles** (lados/esquina): ancho Y alto, CUALQUIER campo (incluido uno solo en su
      fila). **(4)** Guarda borrador, **recarga** ⇒ la posición/tamaño se mantienen. Selecciona un campo ⇒ el panel derecho
      edita rótulo/obligatorio/ancho/alto/posición y **"Opciones avanzadas"** abre el Drawer (umbral/opciones/condicional/
      fórmula/roles). **Cuadrícula** on/off. **Dispositivo escritorio/tablet/móvil**: en tablet/móvil se ve el **preview
      responsivo** (sin cortes; móvil 1 col, tablet 2). Verifica **lienzo ≈ llenado (`/nueva-entrada/:id`) ≈ visor
      (`/bitacoras/:id`)** y que una **plantilla antigua** abre igual que antes (geometría derivada). Modo claro y oscuro.
      App en `:5173`. **NOTA Fase 2/3 (no esperar aún):** deshacer/rehacer, multi-selección/marquee, alinear/distribuir,
      capas, copiar/pegar, atajos de teclado, edición por breakpoint.
- [ ] **Workflow SLA + atrasos — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API
      20/20; falta el clic): en el **builder de flujos** (`/flujos/:id`), por estado el campo **"Tiempo máximo de
      estadía"** (Min/Horas/**Días**, vacío = sin SLA), guardar borrador y publicar (el SLA persiste). En el **diagrama
      del registro** (visor `/bitacoras/:id` + peek ⎇): un estado actual vencido muestra **anillo rojo + "Atrasado hace
      X · SLA Y"**, uno cerca del SLA **ámbar "En riesgo"**, y un tramo pasado sobre su SLA un **badge ámbar**; tooltips
      con SLA + **responsable** (que ahora aparece también en el visor, no solo en el builder). En la **grilla
      `/bitacoras`**: KPI **"Retrasadas"**, faceta **"Retrasadas"** (toggle), badge **"Atraso"** en la celda de estado +
      columna "Atraso" (activable en el gestor de columnas), y la **vista de sistema "Retrasadas"**; modo claro. Para
      verlo en vivo: poner un SLA corto a un estado con registros DRAFT antiguos. App en `:5173`.
- [ ] **Datos de referencia 2.x — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por
      API; falta el clic): `/datos-referencia` (lista de Listas + buscador), crear lista (drawer: key/nombre/descr/
      activo/orden), seleccionar lista → grilla de ítems; agregar ítem (code/label/orden + **metadata key-value**),
      **activar/desactivar** ítem, **orden inline**, editar, eliminar (modal); editar/eliminar lista (bloqueada si en
      uso). En el **Form Builder**: en un SELECT/MULTISELECT cambiar la fuente a **Lista de Referencia**, elegir
      `failure-modes`, y verificar que la **vista previa resuelve** las opciones (muestra label, guarda code); guardar/
      publicar; modo claro. App en `:5173`. **(UX enterprise 2026-06-09)** verificar además: en la grilla de ítems el
      **buscador**, el **filtro de estado**, el **ordenamiento por columnas**, la **paginación** y la metadata en
      chips; en el Form Builder el **selector de Lista buscable (`Combobox`)** y que el **SELECT/MULTISELECT de la
      vista previa** sean buscables y escalen con una lista larga. **(Lookup 2026-06-09)** verificar además: el
      `Combobox` cerca del borde inferior abre **hacia arriba** (no se corta); el MULTISELECT con Lista abre el
      **`LookupPicker`** (diálogo con tabla código/etiqueta/metadata, búsqueda, selección con checkbox + confirmar,
      single clic en fila; tokens removibles con × bajo el campo). **(CSV 2026-06-09)** verificar además:
      **Exportar** descarga un CSV que Excel es-CL abre en columnas (`;` + BOM, metadata aplanada); **Importar**
      (elegir archivo → analizar → reporte con chips/tabla, error con nº de línea → aplicar; checkbox de
      desactivar ausentes; con errores el botón Aplicar queda deshabilitado).
- [ ] **Calendario operacional 2.3.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build + smoke
      por API; falta el clic): `/calendario-operacional` (lista + buscador + badge predeterminado), crear calendario
      (drawer key/nombre/TZ), editar turnos en filas (agregar/eliminar) y ver el **timeline 24 h** con cobertura/
      huecos + marcador del turno ancla, **banner de validación en vivo** (solape → rojo), elegir turno ancla del
      día, cambiar periodo MONTH/WEEK/CUSTOM (campos condicionales), usar el **probador** (datetime → turno/día
      operacional/periodo en vivo, incl. madrugada y hueco), **Guardar** (deshabilitado si inválido o sin cambios),
      hacer predeterminado, asignar nodos (modal sobre el árbol), eliminar (bloqueado si es el default); modo claro.
      App en `:5173`.
- [ ] **Llenado 2.4 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por API 15/15;
      falta el clic): `/nueva-entrada` (grilla de plantillas publicadas, crear entrada), pantalla de llenado
      (cabecera con estado + chips de turno/día operacional/periodo/fecha efectiva; secciones como cards; campo NÚMERO
      con bandas de umbral; SELECT/MULTISELECT resolviendo Lista; validación inmediata por campo; **Guardar sección** y
      **Guardar y completar**; **Enviar y registrar** → banner de sellado; secciones de solo-lectura tras enviar);
      probar **concurrencia** (dos pestañas guardando la misma sección → toast de conflicto + recarga); modo claro.
      App en `:5173`.
- [ ] **Bitácoras 2.6.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por API
      22/22; falta el clic): `/bitacoras` (KPIs clicables y que respetan filtros; barra de filtros: búsqueda con
      debounce, nodo con incluir-descendientes, plantilla, status, estado de flujo, turno, día operacional, rangos
      con atajos hoy/24h/7d/30d, banda de umbral, mis entradas, firmas pendientes; chips activos removibles +
      limpiar; grilla: folio mono, chip de estado con color congelado, indicadores por fila con tooltips, orden por
      folio/efectiva/captura, cargar más; **deep-link**: copiar la URL con filtros y abrirla en otra pestaña;
      exportar CSV y abrirlo en Excel es-CL); `/bitacoras/:id` (cabecera con folio + mini-stepper del flujo, chips de
      dimensiones, secciones read-only con labels de Listas resueltos + badges de umbral, panel de firmas §11.50 +
      **verificar integridad** [VALID y VALID_RECORD_CHANGED_AFTER tras editar], timeline unificada + cargar más,
      log de cambios antes→después, relacionadas navegables, **imprimir** [solo contenido, sin chrome]); ítem
      "Bitácoras" en sidebar y ⌘K; modo claro y oscuro; tablet. App en `:5173`.
- [ ] **Registro diferido 2.7.0 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web + smoke por
      API 14/14; falta el clic): en `/nueva-entrada` el toggle "Registrar con otra fecha/hora" (apagado por defecto;
      al activarlo aparecen fecha/hora + motivo; crear sin motivo válido muestra el aviso); crear una entrada diferida
      → en el llenado: chip "Diferida", fecha de captura junto a la efectiva, nota con la declaración y el motivo,
      "Editar diferimiento" (corregir fecha/motivo y QUITAR la marca); con una plantilla CON campo fecha efectiva
      verificar que el gesto lo deja escrito en el formulario; en `/bitacoras`: filtro "Origen", chip removible,
      indicador "Diferida" en la fila (tooltip = motivo), export CSV con las columnas nuevas; en `/bitacoras/:id`:
      chip + nota "el evento ocurrió el… · declarado por…" + evento "Registro diferido declarado" en la timeline;
      modo claro y oscuro. App en `:5173`.
- [ ] **Período contable gobernado 2.7.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web +
      smoke por API 17/17; falta el clic): en `/calendario-operacional` → detalle de un calendario → sección
      "Períodos contables": lista de períodos recientes con estado (Abierto/En cierre/Cerrado), cerrar un período
      (modal con estado destino CLOSING/CLOSED + motivo obligatorio), ver el chip pasar a Cerrado + "Cerrado por…",
      reabrir (modal de motivo) → vuelve a Abierto; con un usuario SIN `opsperiod:write-closed`: en el llenado de una
      entrada cuya fecha cae en el período cerrado, todas las secciones muestran "Período cerrado" (solo lectura) y no
      hay botones de transición; con permiso de excepción, sí puede escribir; modo claro y oscuro. App en `:5173`.
- [ ] **Período gobernado 2.7.1 — guarda de `executeTransition` en vivo** (cubierta por código + unit test; el smoke
      por API no la ejerció en vivo porque la plantilla de prueba no ofrecía una transición disponible al usuario sin
      bypass). Verificar con una plantilla CON flujo + un estado con transición de rol abierto + período cerrado:
      executeTransition debe dar 403 `PERIOD_CLOSED` (la guarda corre antes de la completitud y del re-auth).
- [ ] **Calendario FISCAL 2.7.1.1 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API completo OK; falta
      el clic): en **`/calendario-fiscal`** → crear un calendario fiscal (tipo de período MONTH/WEEK/CUSTOM), editar
      config + toggle "Exigir período generado", asignar nodos; en la sección "Períodos contables": botón **Generar**
      (elige año → materializa filas agrupadas por año, badge **Actual**), cerrar un período (secuencial: el botón falla
      con motivo si hay un anterior abierto), bloquear (CLOSED→LOCKED), desbloquear, reabrir (con aviso de
      secuencialidad inversa si hay posteriores cerrados); verificar que `/calendario-operacional` ya **no** muestra
      config de período (solo turnos + ancla); modo claro y oscuro. App en `:5173`. **Nota**: el smoke por API dejó una
      entrada demo (`cmq7eglvm…`) con `fecha=2026-06-09` y `version` de sección +1 (benigno).
- [ ] **Ventana de edición 2.7.2 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API 21/21 OK; falta
      el clic): en el **`TemplateBuilder`** → control "Ventana de edición" en la metadata (heredar global / sin ventana /
      propia con horas+ancla RECORDED|EFFECTIVE), guardar y publicar; en **`/configuracion` → pestaña Bitácoras** → fijar
      ventana global (horas, ancla, toggle "Exigir MFA al editar fuera de ventana"). En `/nueva-entrada/:id`: con ventana
      VIGENTE, chip "Editable hasta <fecha>" y guardado normal sin fricción; con ventana VENCIDA y permiso de override,
      aviso de ventana vencida + cada acción (Guardar avance / Completar(+firma) / Enviar / declarar diferido) abre el
      **`EditWindowOverrideModal`** pidiendo motivo (≥5) y, si el ajuste lo exige, contraseña + MFA; sin el permiso, las
      secciones quedan en solo-lectura con el motivo "la ventana de edición venció el <fecha>". Verificar fechas con
      formato regional (`lib/format.ts`); modo claro y oscuro. App en `:5173`.
- [ ] **Modo de equipo por plantilla 2.8.0.2 — smoke VISUAL en navegador** (typecheck/lint/build + smoke por API 17/17 OK;
      falta el clic): en el **`TemplateBuilder`** → control "Equipo en la entrada" (No usar / Opcional / Sugerido /
      Obligatorio), guardar y publicar. En `/nueva-entrada` con esa plantilla: **Obligatorio** → el modal de creación obliga
      a elegir equipo (sin "(sin equipo)"; Continuar deshabilitado hasta elegir; aviso si el nodo no tiene equipos activos);
      **Sugerido** → autoselecciona el equipo único + hint "recomendado", pero permite "(sin equipo)"; **No usar** → no se
      muestra el selector de equipo; **Opcional** → comportamiento previo. Verificar que al crear con Obligatorio sin equipo
      el backend devuelve el aviso; modo claro y oscuro. App en `:5173`.
- [ ] **Afinamiento #4 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build + smoke por API 22/22;
      falta el clic): en `/nueva-entrada/:id` con una plantilla cuyas secciones tengan roles asignados y un campo con
      override: chip "N de M secciones completadas" en cabecera; chip "Asignada a: <rol>" por sección; sección ajena
      bloqueada con el motivo real ("asignada a X" / "se completa en la etapa Y" / "ya fue registrada"); campo
      reservado en solo-lectura con nota; botones "Guardar avance" y "Completar sección"/"Completar y firmar" con
      hint; "Enviar y registrar" deshabilitado listando las secciones que faltan (y habilitado al completar todas);
      transiciones deshabilitadas con la misma guía; modo claro. App en `:5173`.
- [ ] **Ejecución de flujo + firmas 2.5 — smoke VISUAL en navegador** (se verificó typecheck/lint/test/build web +
      smoke por API 21/21; falta el clic): abrir una entrada con flujo en `/nueva-entrada/:id` → chip de estado del
      flujo en cabecera; completar la sección del estado inicial; **barra de transiciones** (botones gateados por
      `availableTransitions`); ejecutar una transición **sin firma** (reason opcional) → verificar cambio de estado,
      sección anterior **LOCKED**, banner/sello; ejecutar una transición **con firma** → **`TransitionModal`** muestra
      el significado + firmante y pide contraseña (y MFA si la transición lo exige) → verificar chip "Firmado" e
      **historial de transiciones**; una sección con `requireSignature` → **`SectionSignModal`** al completar; estado
      final → sin transiciones; modo claro. App en `:5173`.
- [ ] **Modo claro — QA visual** (nuevo): revisar que TODO el workspace se vea premium en **claro**
      (contraste WCAG, glass, glows, severidades, tablas futuras, drawers/modales) y que `auto` siga al
      sistema. El default es oscuro; el login es siempre oscuro. Ref: DECISIONS 2026-06-06.
- [ ] **MFA en el navegador real** (se probó por API/curl, no la UI): escanear el
      QR con una app real, copiar/descargar recovery codes, ver el **redirect del gate**
      `/activar-mfa`, y `/perfil/seguridad` (activar/regenerar/desactivar). *Backend ✅ en vivo.*
- [ ] **`COOKIE_SECURE` solo-HTTPS en producción**: no ejercido (dev es HTTP en localhost).
      Requiere entorno HTTPS. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **`httpOnly` frente a `document.cookie`**: flag presente, no ejecutado como ataque real
      en navegador. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Access 15 min → refresh transparente** al expirar: probado por unit/código, no
      cronometrado en vivo. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Build de imágenes de producción** (`docker-compose.prod.yml` + Caddy TLS): no
      construido aún. **Fase 7.**

---

## 5. Cómo retomar (arranque de sesión)

1. Lee `CLAUDE.md` + `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS,
   AUTH_FLOW) **y este BACKLOG.md**.
2. Confirma el objetivo único de la sesión (un módulo/submódulo).
3. Revisa §1 (git): si hay trabajo sin publicar de la sesión anterior, **resuélvelo primero**.
4. Al cerrar, ejecuta el checklist §0 y actualiza este archivo.
