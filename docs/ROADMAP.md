# Roadmap / Estado por fase — Lyra WatchLog (documento VIVO)

> **Vista rápida de qué está hecho y qué falta en cada fase.** Es un documento **VIVO**:
> se actualiza al **cerrar cada sesión** (junto a `PROGRESS.md` y `BACKLOG.md`). El detalle
> fino de cada pendiente vive en `BACKLOG.md`; aquí está el resumen scaneable.
>
> Última actualización: **2026-06-14**. Leyenda: ✅ hecho · 🔄 en curso/parcial · ⬜ pendiente.

## Resumen por fase

| Fase | Módulo | Estado | Qué FALTA (resumen — detalle en BACKLOG) |
|---|---|---|---|
| **0** | Cimientos (monorepo, Docker, design system, contratos, health) | ✅ | Imágenes de prod (→ Fase 7). |
| **1** | Seguridad (auth + RBAC/ABAC 4D) · Estructura · Equipos · AuditLog | ✅ | UI de **alcance por nodo** en el árbol de Estructura · **reset por enlace** (variante B) · **federación/SCIM** v2 (diseñado, diferido) · campos de usuario SCIM-alineados. |
| **2** | Plantillas / Form Builder + Bitácoras | 🔄 | Ver desglose 2.x abajo. |
| **3** | Orígenes de datos (entrada SCADA/PI/OPC) + **API saliente** (Req-3) + **Webhooks** (Req-4) | ⬜ | Todo. Motor de integración inbound + API M2M por plantilla + webhooks firmados (HMAC, reintentos). |
| **N** | **Notificaciones** (bloque transversal, SOLO mail) | ⬜ | Motor de notificaciones + plantillas de mensaje + resolución de destinatarios + pantalla de correo saliente (Req-1/Req-5). Fundacional para Fase 4. SMS/WhatsApp **fuera de alcance**. |
| **4** | Motor de incidencias (kanban + workflow) | ⬜ | Todo. Aquí se cablean las **acciones de reglas** que abren incidencia (2.º corte del motor). |
| **5** | Cambio de turno + IA (resumen de turno) | ⬜ | Todo. Interfaz `LlmProvider` abstracta. |
| **6** | Base de conocimiento + Dashboard + **Asistente IA RAG** (Req-6) + insights | ⬜ | Todo. RAG con `pgvector` on-prem + ABAC en el recuperador. Predicción ML real = fase posterior. |
| **7** | Endurecimiento (backups, observabilidad, exportación, rate-limit, **adjuntos/MinIO**, i18n, offline) | ⬜ | Todo. Nota: **adjuntos (Req-2)** el dueño los quiere adelantar a Fase 2. |

## Desglose Fase 2 (en curso)

| Ítem | Estado | Qué FALTA |
|---|---|---|
| 2.1 Form Builder (secciones/campos/umbral ISA-18.2/borrador-publicar) | ✅ | — |
| 2.1.1 Modelo de campo en 3 capas (type/dataType/semanticRole) | ✅ | — |
| 2.1.2 **Layout de formulario en GRILLA** (ancho por campo) | ✅ | `feat/layout-grilla`: columna de ancho + grilla responsiva (`FieldGrid` compartido). Superado por 2.1.3. |
| 2.1.3 **Editor de layout WYSIWYG** (12 col + arrastre) | ✅ | `feat/layout-editor-wysiwyg`: `TemplateField.colSpan` 1..12 (reemplaza el enum); lienzo del builder con reordenar/redimensionar arrastrando (DnD nativo + pointer-events, sin lib nueva). Smoke 14/14. |
| 2.1.4 **Builder canvas-first** (config en el lienzo) | ✅ (Fase 1) | `feat/builder-canvas`: lienzo full-width, paleta→popover "＋", config avanzada→`Drawer`, control REAL WYSIWYG, rótulo/sección inline, barra flotante contextual. Frontend puro. Falta smoke visual. |
| 2.1.5 **Builder auto-layout por arrastre** (Notion) | ✅ | `feat/builder-autolayout`: ancho completo + soltar-al-lado/a-su-línea con ancho automático (`splitRow`/`applyDrop`) + divisor de borde + sin menú "12 col" + responsive móvil1/tablet2/escritorio12. Frontend puro. Fase 2 (drag-desde-paleta, colapsar, atajos) diferida. Falta smoke visual. |
| 2.2 Flujos reutilizables (`WorkflowDefinition`) | ✅ | — |
| 2.x Datos de referencia / Listas | ✅ | Roadmap industrial: jerarquía, cascada, metadata tipada, vigencia, crosswalk (con Fase 3). |
| 2.3.0 Calendario operacional (turnos + día operacional) | ✅ | 4-4-5, rotación de cuadrillas, vigencia de turnos (diferidos). |
| 2.3 **Programación de rondas** (`LogPeriod`) | ⬜ | Recurrencia que abre `LogEntry` por ocurrencia (ISA-95 / shift handover). |
| 2.4 Llenado multi-actor | ✅ | Re-seed de borrador al 409 (diferido). |
| 2.5 Ejecución de flujo + firmas Part 11 | ✅ | Reversa/anulación de transición · completitud configurable por transición (diferidos). |
| 2.6.0 Bitácoras — núcleo de lectura | ✅ | — |
| 2.6.1/2.8.1 Personalización (SavedView, columnas, multi-sort, facetas, peek, "Mi turno") | ✅ | Compartir vista por rol · autosize · facetas a escala (Fase 7). |
| 2.6.2 Analítica/UX avanzada | 🔄 | Agrupación con subtotales · sparklines · ⌘K profundo · export con valores. |
| 2.7.0 Registro diferido (ALCOA+ late entry) | ✅ | — |
| 2.7.1 / 2.7.1.1 Período contable + Calendario FISCAL | ✅ | — |
| 2.7.2 Ventana de edición configurable | ✅ | — |
| 2.7.3 **Matriz rol×sección×tiempo** | ⬜ | Matriz administrable aplicada en servidor + `blockedReason` ampliado. |
| 2.8 Alcance por PLANTILLA (2.º eje ABAC) | ✅ | Flag deny-by-default opt-in · agrupador de plantillas (categorías). |
| 2.8.0 Plantillas multi-nodo + 2.8.0.1/2 Equipo (EAM) | ✅ | DROP de `Template.orgNodeId` (deprecado). |
| **2.8.2 VOID de borradores + ruta de edición propia** | ✅ | Anular DRAFT (`status=VOID`, motivo ≥5, auditado, `logentry:void` para ajenas) + ruta `/bitacoras/:id/editar`. **Falta:** VOID GxP de entradas SELLADAS (firma §11.200 + transición inversa, junto a la reversa de 2.5). |
| Adjuntos / evidencias en formularios (Req-2, MinIO) | ⬜ | Campo archivo/foto + adjuntos a nivel de registro; el dueño lo quiere en Fase 2. |
| 2.9.1 **Motor de reglas de negocio (Req-7)** | 🔄 | **Primer corte ✅** (expresión segura + formulados + validación cruzada). **2.º corte:** límites dinámicos · acciones (incidencia→F4 / notificación) · lookups a listas · **DMN** · `visibleWhen` rico. |

## Pendiente transversal
- **Smokes VISUALES del dueño** (BACKLOG §4): grilla 2.8.1, diagrama de flujo, SLA/atrasos, **motor de reglas**, **VOID + ruta de edición (2.8.2)**.
- Mantener este documento al cerrar cada sesión.
