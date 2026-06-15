import { z } from "zod";
import {
  editWindowAnchorSchema,
  equipmentModeSchema,
  templateVersionSchema,
  type EditWindowAnchor,
  type TemplateFieldDto,
  type TemplateSectionDto,
} from "../templates/templates.js";
import {
  fieldDataTypeSchema,
  CONFORMITY_CODES,
  RATING_DEFAULT_MAX,
  isPresentationalType,
  isValidTextFormat,
  isValidTimeOfDay,
  effectiveNumberBands,
  riskLevelFor,
  type NumberFormat,
  type TextFormat,
  type VisibleWhen,
} from "../templates/field-types.js";
import { workflowVersionSchema } from "../workflows/workflows.js";

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN de una plantilla.
 *
 * Paradigma EBR/GxP (ver docs/DECISIONS.md 2026-06-09): definición versionada
 * inmutable (`TemplateVersion`) vs **ejecución relacional auditada** (`LogEntry`).
 * La SECCIÓN es la unidad atómica de permiso/llenado/concurrencia/firma. La
 * captura es multi-actor por fases: el operador A llena la sección 1 en T1, el
 * técnico B la sección 2 en T2, resuelto por `secciones × flujo × RBAC/ABAC`.
 *
 * Decisiones de modelo (forks confirmados por el usuario):
 *  - Valores en TABLA HIJA (`LogEntryValue`, 1 fila por campo) + historial
 *    (`LogEntryFieldChange` append-only). El valor de un campo de referencia se
 *    persiste como `code` estable, NO como label (dimensión de DW / FHIR Coding).
 *  - Secciones INSTANCIADAS como filas (portan estado/filledBy/version).
 *  - Concurrencia optimista POR SECCIÓN (`version` check-and-bump).
 *  - Sellado: `recordedAt` al crear (inmutable); `effectiveAt` + dimensiones de
 *    turno se recalculan mientras la entrada es editable y se CONGELAN al sellar
 *    (en la 1ª transición que sale del estado inicial, o al `submit` de una
 *    plantilla sin flujo). Ver `sealedAt`.
 *
 * EJECUCIÓN DE FLUJO + FIRMAS (Fase 2.5): las TRANSICIONES sobre el flujo
 * congelado (gateadas por rol-dato × ABAC × completitud) cambian `currentStateKey`
 * y recomputan qué secciones quedan editables/`LOCKED`. Las que lo exigen capturan
 * una FIRMA electrónica estilo 21 CFR Part 11 (§11.50/11.70/11.200): nombre
 * impreso del firmante, fecha/hora UTC, SIGNIFICADO y hash del snapshot firmado,
 * con re-autenticación (contraseña + MFA step-up si la transición lo pide).
 */

// === Enums ===================================================================

/** Ciclo de vida grueso de la entrada (independiente del estado configurable del flujo). */
export const LOG_ENTRY_STATUSES = ["DRAFT", "SUBMITTED", "VOID"] as const;
export const logEntryStatusSchema = z.enum(LOG_ENTRY_STATUSES);
export type LogEntryStatus = z.infer<typeof logEntryStatusSchema>;

/** Estado de completitud de una sección instanciada. */
export const LOG_ENTRY_SECTION_STATES = ["PENDING", "IN_PROGRESS", "COMPLETED", "LOCKED"] as const;
export const logEntrySectionStateSchema = z.enum(LOG_ENTRY_SECTION_STATES);
export type LogEntrySectionState = z.infer<typeof logEntrySectionStateSchema>;

/** Contexto de una firma electrónica: transición de flujo o completitud de sección. */
export const SIGNATURE_CONTEXTS = ["TRANSITION", "SECTION_COMPLETION"] as const;
export const signatureContextSchema = z.enum(SIGNATURE_CONTEXTS);
export type SignatureContext = z.infer<typeof signatureContextSchema>;

/** Componentes con que se re-autenticó la firma (§11.200: ID + ≥2 componentes). */
export const SIGNATURE_METHODS = ["PASSWORD", "PASSWORD_MFA"] as const;
export const signatureMethodSchema = z.enum(SIGNATURE_METHODS);
export type SignatureMethod = z.infer<typeof signatureMethodSchema>;

/**
 * Origen del registro (Fase 2.7.0, ALCOA+ "contemporaneous"): ONLINE = capturado
 * en el momento del evento; DEFERRED = registro tardío DECLARADO por el operador
 * (atestación, nunca inferido por diferencia de relojes). La entrada tardía es
 * legítima si queda identificada: fecha del evento vs captura, quién y por qué.
 */
export const LOG_ENTRY_ORIGINS = ["ONLINE", "DEFERRED"] as const;
export const logEntryOriginSchema = z.enum(LOG_ENTRY_ORIGINS);
export type LogEntryOrigin = z.infer<typeof logEntryOriginSchema>;

// === Entidades (forma de respuesta; fechas como ISO string) ==================

/** Valor actual de un campo (el `value` viaja como JSON arbitrario, tipado por dataType). */
export const logEntryValueSchema = z.object({
  fieldKey: z.string(),
  /** code/code[]/número/booleano/fecha ISO/etc. null = sin valor. */
  value: z.unknown().nullable(),
  updatedAt: z.string(),
  updatedById: z.string().nullable(),
});
export type LogEntryValueDto = z.infer<typeof logEntryValueSchema>;

/**
 * Manifestación de una firma electrónica (Part 11 §11.50): identifica al firmante
 * (nombre impreso), el SIGNIFICADO, el instante UTC y el hash del snapshot firmado
 * (record–signature linking §11.70). Es la entidad de primer orden enlazable a una
 * transición o a la completitud de una sección (`context`).
 */
export const logEntrySignatureSchema = z.object({
  id: z.string(),
  context: signatureContextSchema,
  /** Clave de la transición firmada (cuando `context = TRANSITION`). */
  transitionKey: z.string().nullable(),
  /** Clave de la sección firmada (cuando `context = SECTION_COMPLETION`). */
  sectionKey: z.string().nullable(),
  signerId: z.string().nullable(),
  /** Nombre impreso del firmante, capturado al firmar (§11.50). */
  signerName: z.string(),
  /** Significado de la firma ("Revisado", "Aprobado"…). */
  meaning: z.string(),
  method: signatureMethodSchema,
  /** SHA-256 del snapshot canónico firmado (integridad / no repudio). */
  payloadHash: z.string(),
  signedAt: z.string(),
});
export type LogEntrySignatureDto = z.infer<typeof logEntrySignatureSchema>;

/** Resumen de firma para mostrar junto a una sección (sin el hash). */
export const logEntrySignatureSummarySchema = z.object({
  signerName: z.string(),
  meaning: z.string(),
  signedAt: z.string(),
});
export type LogEntrySignatureSummaryDto = z.infer<typeof logEntrySignatureSummarySchema>;

/**
 * Por qué ESTE usuario no puede editar la sección ahora (la UI lo comunica tal
 * cual; el backend lo decide). Enum EXTENSIBLE: la gobernanza temporal (Fase 2.7)
 * seguirá sumando motivos (EDIT_WINDOW_EXPIRED en 2.7.2) sin romper a los consumidores.
 *  - ENTRY_CLOSED: la entrada ya fue enviada/anulada (registro sellado).
 *  - WRONG_STATE: la sección se edita en OTRO estado del flujo.
 *  - MISSING_ROLE: la sección está asignada a roles que el usuario no tiene.
 *  - PERIOD_CLOSED: la fecha efectiva del registro cae en un período contable
 *    cerrado/en cierre y el usuario no tiene el permiso de excepción (Fase 2.7.1).
 *  - EDIT_WINDOW_EXPIRED: la ventana de edición de la plantilla venció y el usuario
 *    no tiene el permiso de override (Fase 2.7.2). Con período cerrado Y ventana
 *    vencida gana la restricción MÁS estricta y se comunica PERIOD_CLOSED.
 */
export const SECTION_BLOCKED_REASONS = [
  "ENTRY_CLOSED",
  "WRONG_STATE",
  "MISSING_ROLE",
  "PERIOD_CLOSED",
  "EDIT_WINDOW_EXPIRED",
] as const;
export const sectionBlockedReasonSchema = z.enum(SECTION_BLOCKED_REASONS);
export type SectionBlockedReason = z.infer<typeof sectionBlockedReasonSchema>;

/**
 * Estado de EJECUCIÓN de una sección (no su definición, que vive en la versión).
 * `editable` lo resuelve el backend para el usuario que pide el detalle =
 * (sección editable en el estado actual) × (rol con permiso de sección) × (ABAC).
 */
export const logEntrySectionStateDtoSchema = z.object({
  sectionKey: z.string(),
  state: logEntrySectionStateSchema,
  filledById: z.string().nullable(),
  filledByName: z.string().nullable(),
  filledAt: z.string().nullable(),
  /** Revisión para la concurrencia optimista por sección (check-and-bump). */
  version: z.number().int(),
  /** ¿Puede ESTE usuario editar la sección ahora? (decidido en backend). */
  editable: z.boolean(),
  /** Motivo de bloqueo cuando `editable = false` (null si es editable). */
  blockedReason: sectionBlockedReasonSchema.nullable(),
  /** Nombres de los roles-dato asignados a la sección ([] = abierta a cualquiera
   * con el permiso de llenado). Para que la UI muestre "Asignada a: X". */
  assignedRoleNames: z.array(z.string()),
  /** Campos cuyo override de rol (`TemplateFieldRole`) EXCLUYE a este usuario:
   * la UI los pinta solo-lectura; el backend ya rechaza su escritura con 403. */
  readOnlyFieldKeys: z.array(z.string()),
  /** Firma de completitud de la sección, si fue firmada (Part 11). null = sin firma. */
  signature: logEntrySignatureSummarySchema.nullable(),
});
export type LogEntrySectionStateDto = z.infer<typeof logEntrySectionStateDtoSchema>;

/**
 * Una transición REGISTRADA en el historial de ejecución del flujo (append-only).
 * Es la trazabilidad ALCOA+ de cómo avanzó el registro entre estados.
 */
export const logEntryTransitionSchema = z.object({
  id: z.string(),
  transitionKey: z.string(),
  /** Etiqueta legible de la transición (de la versión congelada del flujo). */
  label: z.string().nullable(),
  fromStateKey: z.string(),
  toStateKey: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
  /** Firma asociada a la transición, si la exigía. null = sin firma. */
  signature: logEntrySignatureSummarySchema.nullable(),
  occurredAt: z.string(),
});
export type LogEntryTransitionDto = z.infer<typeof logEntryTransitionSchema>;

/**
 * Transición que ESTE usuario puede ejecutar AHORA sobre la entrada (decidido en
 * backend: sale del estado actual × rol-dato autorizado). El frontend solo pinta
 * los botones a partir de esta lista; nunca decide la autorización.
 */
export const availableTransitionSchema = z.object({
  transitionKey: z.string(),
  label: z.string(),
  toStateKey: z.string(),
  /** Nombre legible del estado destino (para el botón / confirmación). */
  toStateName: z.string(),
  requireSignature: z.boolean(),
  signatureMeaning: z.string().nullable(),
  requireMfa: z.boolean(),
});
export type AvailableTransitionDto = z.infer<typeof availableTransitionSchema>;

/** Cabecera de la entrada: campos de SISTEMA intrínsecos (columnas indexadas). */
export const logEntrySchema = z.object({
  id: z.string(),
  /** Folio humano correlativo (Fase 2.6): referencia estable de auditoría/terreno. */
  entryNumber: z.number().int(),
  templateId: z.string(),
  templateVersionId: z.string(),
  // Flujo DENORMALIZADO (copiado al crear). null = plantilla sin flujo (form simple).
  workflowDefinitionId: z.string().nullable(),
  workflowDefinitionVersionId: z.string().nullable(),
  orgNodeId: z.string(),
  equipmentId: z.string().nullable(),
  /** Estado del flujo (clave); null = sin flujo. En 2.4 queda en el estado inicial. */
  currentStateKey: z.string().nullable(),
  status: logEntryStatusSchema,
  /** Marca de captura (commit), inmutable. */
  recordedAt: z.string(),
  /** Fecha efectiva de negocio (del campo EFFECTIVE_DATE, fallback recordedAt). */
  effectiveAt: z.string(),
  // Dimensiones operacionales estampadas vía ShiftResolver (nullable = sin calendario).
  shiftCode: z.string().nullable(),
  operationalDate: z.string().nullable(),
  periodKey: z.string().nullable(),
  /** Instante en que se congelaron effectiveAt + dimensiones (al enviar). null = aún DRAFT. */
  sealedAt: z.string().nullable(),
  /** Origen DECLARADO del registro (2.7.0): ONLINE contemporáneo / DEFERRED tardío. */
  entryOrigin: logEntryOriginSchema,
  /** Fecha/hora REAL del evento declarada al diferir (alimenta effectiveAt cuando
   * la plantilla no tiene campo EFFECTIVE_DATE). null = sin declaración. */
  declaredEffectiveAt: z.string().nullable(),
  /** Motivo del diferimiento (obligatorio al declarar; GxP late entry). */
  deferredReason: z.string().nullable(),
  /** Cuándo se declaró el diferimiento (huella ALCOA+). */
  deferredDeclaredAt: z.string().nullable(),
  /** --- Anulación de borrador (2.8.2, VOID) ---------------------------------
   * Anulación LÓGICA de un borrador (status=VOID): no es hard-delete (el AuditLog
   * inmutable conserva el rastro) y NO usa deletedAt (eso ocultaría hasta del filtro).
   * Quién/cuándo/por qué de la anulación; null = entrada no anulada. */
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  voidedById: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LogEntryDto = z.infer<typeof logEntrySchema>;

/**
 * Huella de la VENTANA DE EDICIÓN (2.7.2) que el backend resuelve para el actor:
 * la UI muestra proactivamente "Editable hasta <expiresAt>" y, si venció, por qué
 * está bloqueado y si este usuario puede hacer el override (con motivo auditado).
 * null en el detalle = sin ventana configurada (plantilla y global sin límite).
 */
export const editWindowInfoSchema = z.object({
  anchor: editWindowAnchorSchema,
  windowMinutes: z.number().int(),
  /** Instante en que vence/venció la ventana (ancla + duración), ISO UTC. */
  expiresAt: z.string(),
  expired: z.boolean(),
  /** ¿Puede ESTE usuario escribir fuera de ventana? (permiso de override). */
  canOverride: z.boolean(),
  /** ¿El override exige re-autenticación con MFA? (ajuste del sistema). */
  overrideRequiresMfa: z.boolean(),
});
export type EditWindowInfo = z.infer<typeof editWindowInfoSchema>;

/**
 * Detalle de llenado: cabecera + DEFINICIÓN congelada (la versión de plantilla,
 * para renderizar) + ESTADO de ejecución por sección + valores actuales. El
 * cliente une definición y ejecución por `sectionKey`/`fieldKey`.
 */
export const logEntryDetailSchema = logEntrySchema.extend({
  /** Definición congelada que se está llenando (secciones → campos → config). */
  version: templateVersionSchema,
  /** Versión de flujo CONGELADA (estados + transiciones) para render. null = sin flujo. */
  workflowVersion: workflowVersionSchema.nullable(),
  /** Nombre legible del estado actual del flujo (de la versión congelada). null = sin flujo. */
  currentStateName: z.string().nullable(),
  /** Nombre legible de la plantilla y ruta del nodo (cabecera de la pantalla). */
  templateName: z.string(),
  orgNodePath: z.string().nullable(),
  /** Nombre legible del autor y del equipo (cabecera del visor 2.6). */
  createdByName: z.string().nullable(),
  equipmentName: z.string().nullable(),
  /** Quién declaró el diferimiento (2.7.0). null = entrada en línea. */
  deferredDeclaredByName: z.string().nullable(),
  /** Quién anuló el borrador (2.8.2). null = entrada no anulada. */
  voidedByName: z.string().nullable(),
  /** Ventana de edición resuelta para el actor (2.7.2). null = sin ventana. */
  editWindow: editWindowInfoSchema.nullable(),
  sectionStates: z.array(logEntrySectionStateDtoSchema),
  values: z.array(logEntryValueSchema),
  /**
   * Lectura PREVIA por campo CONTADOR/acumulado (Ola 2), por `fieldKey`: el último
   * valor sellado del mismo equipo+campo. La UI muestra el delta (actual − previa).
   * Es PRESENTACIÓN (no se persiste). Ausente = sin lectura previa.
   */
  counterPreviousValues: z.record(z.number()).default({}),
  /** Transiciones que ESTE usuario puede ejecutar ahora (gateado en backend). */
  availableTransitions: z.array(availableTransitionSchema),
  /** Historial de transiciones ejecutadas (append-only, orden cronológico). */
  transitions: z.array(logEntryTransitionSchema),
  /** Firmas electrónicas capturadas en la entrada (transición + completitud). */
  signatures: z.array(logEntrySignatureSchema),
});
export type LogEntryDetail = z.infer<typeof logEntryDetailSchema>;

// === Opciones de objetos de REFERENCIA (Ola 2) ===============================
//
// El endpoint `GET /log-entries/references/:kind/options?nodeId&q` resuelve las
// opciones de un selector de entidad (equipo/usuario/nodo/turno) con ABAC en el
// backend. La UI las consume para `FieldControl` (Combobox/LookupPicker). Las
// claves (kind) son las `REFERENCE_ENTITIES` de field-types.

/** Una opción de referencia: `id` estable + rótulo visible (+ subrótulo: tag/ruta/correo/horario). */
export const referenceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  sublabel: z.string().nullable().optional(),
});
export type ReferenceOption = z.infer<typeof referenceOptionSchema>;

export const referenceOptionsResultSchema = z.object({
  kind: z.enum(["equipment", "user", "orgNode", "shift"]),
  options: z.array(referenceOptionSchema),
});
export type ReferenceOptionsResult = z.infer<typeof referenceOptionsResultSchema>;

/** Query del endpoint de opciones de referencia (nodo de la entrada + búsqueda). */
export const referenceOptionsQuerySchema = z.object({
  nodeId: z.string().trim().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});
export type ReferenceOptionsQuery = z.infer<typeof referenceOptionsQuerySchema>;

// === Listado enterprise (Fase 2.6 — módulo de Bitácoras) =====================

/** Banda de umbral ISA-18.2 en que cayó un valor numérico (estampada al guardar). */
export const THRESHOLD_BANDS = ["WARN", "CRIT"] as const;
export const thresholdBandSchema = z.enum(THRESHOLD_BANDS);
export type ThresholdBand = z.infer<typeof thresholdBandSchema>;

/**
 * Indicadores de "review by exception" (ISPE GAMP 5 / EBR): lo que un revisor
 * necesita ver SIN abrir el registro. Los computa el backend por página (batched).
 */
export const logEntryIndicatorsSchema = z.object({
  sectionsTotal: z.number().int(),
  sectionsCompleted: z.number().int(),
  sectionsLocked: z.number().int(),
  /** Secciones que exigen firma y aún no la tienen. */
  pendingSignatures: z.number().int(),
  signaturesCount: z.number().int(),
  transitionsCount: z.number().int(),
  /** Peor banda de umbral entre los valores de la entrada (null = todo en rango). */
  worstThresholdBand: thresholdBandSchema.nullable(),
});
export type LogEntryIndicators = z.infer<typeof logEntryIndicatorsSchema>;

/**
 * Valor de NEGOCIO de la entrada expuesto en la grilla (2.8.1a) — para que la
 * bitácora sea reconocible por su contenido, no solo por metadatos. El backend
 * manda el valor ESTRUCTURADO + su meta CONGELADA (label/unidad/tipo/banda); el
 * CLIENTE formatea números/fechas con la configuración regional (lib/format), por
 * eso `value` NO viene pre-formateado. `optionLabel` resuelve code→label de listas.
 */
export const logEntrySummaryValueSchema = z.object({
  fieldKey: z.string(),
  /** Label CONGELADO del campo en la versión de ESTA entrada. */
  label: z.string(),
  dataType: fieldDataTypeSchema,
  /** code / número / booleano / fecha ISO / etc. null = vacío. */
  value: z.unknown(),
  /** Unidad de medida del campo numérico (de la config congelada). null = sin unidad. */
  unit: z.string().nullable(),
  /** Label resuelto para SELECT de lista de referencia (el `value` guarda el code). null = no aplica. */
  optionLabel: z.string().nullable(),
  /** Banda de umbral ISA-18.2 estampada (null = en rango / no aplica). */
  thresholdBand: thresholdBandSchema.nullable(),
});
export type LogEntrySummaryValue = z.infer<typeof logEntrySummaryValueSchema>;

/** Ítem del listado de Bitácoras: cabecera + contexto legible + indicadores. LIGERO
 * a propósito: NO incluye secciones ni valores COMPLETOS (eso vive en el detalle). Sí
 * lleva los `summaryValues` ACOTADOS (campos `showInGrid` de la plantilla) para la
 * línea "Resumen" — el diseñador ofrece el pool, el usuario dispone (2.8.1b). */
export const logEntryListItemSchema = logEntrySchema.extend({
  templateName: z.string(),
  templateVersionNumber: z.number().int(),
  orgNodeName: z.string(),
  orgNodePath: z.string().nullable(),
  equipmentName: z.string().nullable(),
  /** Tag del equipo (EAM asset num, estable). null = sin equipo / sin tag. */
  equipmentTag: z.string().nullable(),
  createdByName: z.string().nullable(),
  /** Nombre y color del estado del flujo (de la versión CONGELADA). null = sin flujo. */
  currentStateName: z.string().nullable(),
  currentStateColor: z.string().nullable(),
  /** Momento de entrada al estado actual (Workflow SLA). Base del cómputo de atraso.
   *  null = sin flujo / pre-migración. El cliente formatea la antigüedad con lib/format. */
  currentStateSince: z.string().nullable(),
  /** SLA de permanencia del estado actual, en MINUTOS (de la versión congelada).
   *  null = el estado actual no tiene SLA. */
  currentStateMaxStayMinutes: z.number().int().nullable(),
  indicators: logEntryIndicatorsSchema,
  /** Valores de resumen (campos candidatos de la plantilla, en su orden). Vacío = sin candidatos. */
  summaryValues: z.array(logEntrySummaryValueSchema),
});
export type LogEntryListItem = z.infer<typeof logEntryListItemSchema>;

/** Respuesta paginada por cursor (keyset) del listado. */
export const logEntryListResponseSchema = z.object({
  items: z.array(logEntryListItemSchema),
  /** Cursor opaco para la página siguiente; null = no hay más. */
  nextCursor: z.string().nullable(),
});
export type LogEntryListResponse = z.infer<typeof logEntryListResponseSchema>;

/**
 * KPIs del listado (barra superior). Respetan EXACTAMENTE los mismos filtros que
 * el listado (mismo `where` en backend); patrón Splunk/Kibana de resumen del set.
 */
export const logEntryStatsSchema = z.object({
  total: z.number().int(),
  byStatus: z.object({
    DRAFT: z.number().int(),
    SUBMITTED: z.number().int(),
    VOID: z.number().int(),
  }),
  /** Entradas con ≥1 sección que exige firma y no la tiene. */
  pendingSignatures: z.number().int(),
  /** Entradas con ≥1 valor en banda crítica / de advertencia (excepciones). */
  withCrit: z.number().int(),
  withWarn: z.number().int(),
  /** Entradas ATRASADAS (Workflow SLA): DRAFT con el estado actual sobre su SLA. */
  delayed: z.number().int(),
});
export type LogEntryStats = z.infer<typeof logEntryStatsSchema>;

/**
 * Facetas con conteo (Fase 2.8.1c, estilo Splunk/Kibana). Cada dimensión lista sus
 * valores presentes con el conteo de entradas, calculado con el MISMO where + ABAC
 * del listado pero EXCLUYENDO el propio criterio de esa dimensión (conteos de
 * "hermanos": elegir un valor no anula las demás opciones de la faceta).
 */
export const logEntryFacetBucketSchema = z.object({
  value: z.string(),
  /** Etiqueta legible ya resuelta (nombre de plantilla/estado/equipo; el valor crudo si no aplica). */
  label: z.string(),
  count: z.number().int(),
  /** Color congelado del estado del flujo (solo la faceta de estado lo trae). */
  color: z.string().nullable().optional(),
});
export type LogEntryFacetBucket = z.infer<typeof logEntryFacetBucketSchema>;

export const logEntryFacetsSchema = z.object({
  status: z.array(logEntryFacetBucketSchema),
  state: z.array(logEntryFacetBucketSchema),
  template: z.array(logEntryFacetBucketSchema),
  equipment: z.array(logEntryFacetBucketSchema),
  /** Banda de umbral: buckets WARN / CRIT (excepciones). */
  band: z.array(logEntryFacetBucketSchema),
  /** Conteo de entradas ATRASADAS (Workflow SLA) en el set filtrado (faceta toggle). */
  delayed: z.number().int(),
});
export type LogEntryFacets = z.infer<typeof logEntryFacetsSchema>;

/**
 * Filtros de la vista de sistema "Mi turno" RESUELTOS por el backend (Fase 2.8.1c):
 * el turno/día operacional vigentes (vía `ShiftResolver`, calendario por defecto) +
 * el autor = el usuario actual. `shiftCode` null = sin calendario resuelto
 * (degradación elegante: solo autor + día de hoy).
 */
export const myShiftFilterSchema = z.object({
  createdById: z.string(),
  operationalDate: z.string(),
  shiftCode: z.string().nullable(),
});
export type MyShiftFilter = z.infer<typeof myShiftFilterSchema>;

// === Requests ================================================================

/**
 * Declaración de registro DIFERIDO (gesto "Registrar con otra fecha/hora").
 * El motivo es OBLIGATORIO (práctica GxP de late entry: la anotación tardía se
 * identifica con justificación — MHRA Data Integrity 2018 / FDA DI Q&A 2018).
 */
export const deferralInputSchema = z.object({
  /** Fecha/hora REAL del evento (ISO 8601 con offset). */
  effectiveAt: z.string().datetime({ offset: true }),
  /** Motivo del diferimiento. */
  reason: z.string().trim().min(5).max(500),
});
export type DeferralInput = z.infer<typeof deferralInputSchema>;

/**
 * Query de la VISTA PREVIA de una entrada nueva (Fase 2.8.2): arma el detalle sin
 * persistir, para abrir el formulario en modo compose. Materializa recién al
 * primer guardado. Mismos campos que identifican el contexto de creación.
 */
export const previewLogEntryQuerySchema = z.object({
  templateId: z.string().min(1),
  orgNodeId: z.string().optional(),
  equipmentId: z.string().optional(),
});
export type PreviewLogEntryQuery = z.infer<typeof previewLogEntryQuerySchema>;

export const createLogEntryRequestSchema = z.object({
  templateId: z.string().min(1),
  /** Nodo de la entrada. Si se omite, hereda el de la plantilla (debe existir uno). */
  orgNodeId: z.string().nullable().optional(),
  /** Equipo opcional al que refiere el registro. */
  equipmentId: z.string().nullable().optional(),
  /** Declarar la entrada como registro DIFERIDO desde su creación (2.7.0). */
  deferred: deferralInputSchema.nullable().optional(),
});
export type CreateLogEntryRequest = z.infer<typeof createLogEntryRequestSchema>;

/**
 * Nodo elegible para CREAR una entrada con una plantilla (Fase 2.8.0): pertenece
 * a la intersección de las asignaciones de la plantilla (expandidas por subárbol)
 * con el alcance de NODO del usuario. La web autoselecciona si hay exactamente 1
 * y OBLIGA a elegir si hay más de 1 (sin default silencioso); el backend re-valida
 * la membresía al crear.
 */
/**
 * Equipo (activo) instalado en un nodo, para tagear OPCIONALMENTE la entrada a una
 * máquina concreta (Fase 2.8.0.1). Patrón EAM "objeto de referencia" (SAP PM /
 * Maximo): ubicación funcional [nodo] + activo [equipo]; el grano por equipo habilita
 * la analítica de confiabilidad (ISO 14224) y el motor de incidencias (Fase 4).
 */
export const eligibleEquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string().nullable(),
});
export type EligibleEquipment = z.infer<typeof eligibleEquipmentSchema>;

export const eligibleNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Ruta legible (nombres) del nodo, para desambiguar en el selector. */
  path: z.string(),
  /** Equipos activos del nodo (vacío = ninguno). El equipo en la entrada es OPCIONAL. */
  equipment: z.array(eligibleEquipmentSchema),
});
export type EligibleNode = z.infer<typeof eligibleNodeSchema>;

export const templateEligibleNodesSchema = z.object({
  templateId: z.string(),
  /**
   * Modo de equipo de la plantilla (2.8.0.2): gobierna cómo el modal de creación
   * trata el equipo (oculto/opcional/sugerido/requerido). El backend AUTORIZA REQUIRED
   * en `create`; el front solo lo refleja. NONE ⇒ los nodos no traen equipos.
   */
  equipmentMode: equipmentModeSchema,
  nodes: z.array(eligibleNodeSchema),
});
export type TemplateEligibleNodes = z.infer<typeof templateEligibleNodesSchema>;

/**
 * Motivo del override de ventana de edición (2.7.2). OBLIGATORIO al escribir fuera
 * de ventana aunque se tenga el permiso (GxP: la corrección excepcional se
 * identifica CON justificación — MHRA Data Integrity 2018 / FDA DI Q&A 2018).
 */
const editWindowOverrideReasonSchema = z.string().trim().min(5).max(500);

/** Declara, corrige o quita (null) el diferimiento de una entrada en borrador. */
export const setDeferralRequestSchema = z.object({
  deferred: deferralInputSchema.nullable(),
  /** Motivo del override, requerido SOLO si la ventana de edición venció (2.7.2). */
  overrideReason: editWindowOverrideReasonSchema.optional(),
  /** Re-auth del override (solo si el ajuste de MFA para override está activo). */
  password: z.string().min(1).max(200).optional(),
  mfaCode: z.string().trim().min(1).max(20).optional(),
});
export type SetDeferralRequest = z.infer<typeof setDeferralRequestSchema>;

/**
 * Anula (descarta) un borrador (2.8.2). El motivo es OBLIGATORIO (≥5): un borrador
 * no es un registro firmado Part 11, pero ALCOA+ exige registrar POR QUÉ se descartó
 * (MHRA Data Integrity 2018). No re-auth/firma para un borrador (eso se reserva a
 * acciones sobre registros sellados, §11.200). Sin hard-delete: status pasa a VOID.
 */
export const voidLogEntryRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type VoidLogEntryRequest = z.infer<typeof voidLogEntryRequestSchema>;

/** Un valor que el cliente envía al guardar una sección. */
export const logEntryValueInputSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  value: z.unknown().nullable(),
});
export type LogEntryValueInput = z.infer<typeof logEntryValueInputSchema>;

export const saveLogEntrySectionRequestSchema = z.object({
  /** Revisión que el cliente cree vigente (concurrencia optimista por sección). */
  expectedVersion: z.number().int().min(0),
  values: z.array(logEntryValueInputSchema).max(500),
  /** Marca la sección como COMPLETED (exige obligatorios visibles llenos). */
  markComplete: z.boolean().optional(),
  /**
   * Contraseña para firmar la completitud, SOLO si la sección exige firma
   * (`TemplateSection.requireSignature`) y se está completando. También re-autentica
   * el override fuera de ventana cuando el ajuste de MFA lo exige (2.7.2). El backend
   * re-verifica; nunca se confía en el cliente.
   */
  password: z.string().min(1).max(200).optional(),
  /** Segundo factor para el override fuera de ventana (si el ajuste lo exige). */
  mfaCode: z.string().trim().min(1).max(20).optional(),
  /** Motivo del override, requerido SOLO si la ventana de edición venció (2.7.2). */
  overrideReason: editWindowOverrideReasonSchema.optional(),
});
export type SaveLogEntrySectionRequest = z.infer<typeof saveLogEntrySectionRequestSchema>;

export const submitLogEntryRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
  /** Motivo del override, requerido SOLO si la ventana de edición venció (2.7.2). */
  overrideReason: editWindowOverrideReasonSchema.optional(),
  /** Re-auth del override (solo si el ajuste de MFA para override está activo). */
  password: z.string().min(1).max(200).optional(),
  mfaCode: z.string().trim().min(1).max(20).optional(),
});
export type SubmitLogEntryRequest = z.infer<typeof submitLogEntryRequestSchema>;

/**
 * Ejecuta una transición de flujo sobre la entrada. Las credenciales de re-auth
 * (`password`/`mfaCode`) SOLO se exigen si la transición pide firma (`requireSignature`)
 * y/o MFA step-up (`requireMfa`); el backend re-verifica siempre, nunca el cliente.
 */
export const executeTransitionRequestSchema = z.object({
  transitionKey: z.string().min(1).max(64),
  /** Motivo / nota de la transición (queda en el historial). */
  reason: z.string().trim().max(500).optional(),
  /** Contraseña para re-autenticar la firma (§11.200). Requerida si hay firma. */
  password: z.string().min(1).max(200).optional(),
  /** Segundo factor (TOTP o código de recuperación). Requerido si `requireMfa`. */
  mfaCode: z.string().trim().min(1).max(20).optional(),
});
export type ExecuteTransitionRequest = z.infer<typeof executeTransitionRequestSchema>;

/** Booleano que llega como string por query param ("true"/"false"). */
const queryBool = z
  .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
  .optional();

/** Campos por los que el backend acepta ordenar (whitelist; todos NOT NULL para
 * que el cursor keyset sea correcto sin ramas de nulos). Son EXACTAMENTE los que
 * tienen índice keyset `(col,id)`: ordenar por columnas de VALOR a escala rompería
 * el keyset (full scan) y se difiere a Fase 7 (columnas denormalizadas/OpenSearch). */
export const LOG_ENTRY_SORT_FIELDS = ["recordedAt", "effectiveAt", "entryNumber"] as const;
export const logEntrySortFieldSchema = z.enum(LOG_ENTRY_SORT_FIELDS);
export type LogEntrySortField = z.infer<typeof logEntrySortFieldSchema>;

/** Una clave de orden (campo indexado + dirección). Base del multi-sort (2.8.1b). */
export const logEntrySortKeySchema = z.object({
  field: logEntrySortFieldSchema,
  dir: z.enum(["asc", "desc"]),
});
export type LogEntrySortKey = z.infer<typeof logEntrySortKeySchema>;

/** Serializa el multi-sort a/desde la query CSV `campo:dir,campo:dir` (URL-friendly). */
export function sortKeysToParam(keys: LogEntrySortKey[]): string {
  return keys.map((k) => `${k.field}:${k.dir}`).join(",");
}
export function sortKeysFromParam(raw: string): LogEntrySortKey[] {
  const out: LogEntrySortKey[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const [field, dir] = part.split(":");
    const f = logEntrySortFieldSchema.safeParse(field);
    if (!f.success || seen.has(f.data)) continue; // sin duplicados de campo
    out.push({ field: f.data, dir: dir === "asc" ? "asc" : "desc" });
    seen.add(f.data);
  }
  return out;
}

/**
 * Normaliza el orden EFECTIVO de una query a una lista de claves (multi-sort).
 * Precedencia: `sorts` (multi) → `sort`/`dir` (legacy single) → default. Fuente
 * única back↔front para que el cursor keyset y el ORDER BY coincidan exactamente.
 */
export function resolveSortKeys(query: {
  sorts?: LogEntrySortKey[];
  sort?: LogEntrySortField;
  dir?: "asc" | "desc";
}): LogEntrySortKey[] {
  if (query.sorts && query.sorts.length > 0) return query.sorts.slice(0, 3);
  return [{ field: query.sort ?? "recordedAt", dir: query.dir ?? "desc" }];
}

/**
 * Query del listado de Bitácoras (Fase 2.6). TODOS los filtros se aplican en
 * backend (con ABAC); el cliente solo refleja este contrato. Paginación keyset
 * (`cursor` opaco) + orden por whitelist.
 */
export const logEntryListQuerySchema = z.object({
  /** Búsqueda: folio (numérico) o coincidencia parcial en plantilla / nodo. */
  q: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().optional(),
  /** Nodo de la estructura (1 solo); con `includeDescendants` filtra toda la rama. @deprecated usar orgNodeIds. */
  orgNodeId: z.string().optional(),
  /**
   * Filtro MULTI-NODO (2.8.1b-UX): varios nodos a la vez. Llega como CSV en la query
   * (`a,b,c`) y se normaliza a arreglo. `includeDescendants` aplica a TODOS los nodos
   * (la rama de cada uno). Tiene precedencia sobre `orgNodeId`. ABAC se aplica aparte.
   */
  orgNodeIds: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
      z.array(z.string()).max(100),
    )
    .optional(),
  includeDescendants: queryBool,
  equipmentId: z.string().optional(),
  status: logEntryStatusSchema.optional(),
  /** Estado del flujo (clave de la versión congelada). */
  stateKey: z.string().optional(),
  shiftCode: z.string().optional(),
  periodKey: z.string().optional(),
  /** Día operacional exacto (YYYY-MM-DD). */
  operationalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Rangos ISO 8601 inclusivos sobre la fecha efectiva y la de captura. */
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  effectiveTo: z.string().datetime({ offset: true }).optional(),
  recordedFrom: z.string().datetime({ offset: true }).optional(),
  recordedTo: z.string().datetime({ offset: true }).optional(),
  createdById: z.string().optional(),
  /** Origen del registro (2.7.0): ONLINE / DEFERRED. */
  entryOrigin: logEntryOriginSchema.optional(),
  /** Solo entradas con ≥1 sección que exige firma y no la tiene. */
  pendingSignature: queryBool,
  /** Excepciones de umbral: CRIT / WARN exactos, o ANY (cualquier banda). */
  thresholdBand: z.enum(["WARN", "CRIT", "ANY"]).optional(),
  /** Review-by-exception (2.8.1c): solo lo accionable = umbral WARN/CRIT OR firma pendiente. */
  exceptionsOnly: queryBool,
  /** Workflow SLA (2026-06-13): solo entradas ATRASADAS = DRAFT con el estado actual
   *  por encima de su SLA de permanencia (now − currentStateSince > maxStayMinutes). */
  delayedOnly: queryBool,
  /** Orden legacy single (back-compat con deep-links previos a 2.8.1b). */
  sort: logEntrySortFieldSchema.optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  /**
   * Multi-sort (2.8.1b): lista ordenada de claves indexadas, llega como CSV
   * `campo:dir,campo:dir`. Tiene PRECEDENCIA sobre `sort`/`dir`. Máx 3 claves; el
   * keyset encadena la tupla completa (lexicográfico) para no perder filas en empates.
   */
  sorts: z
    .preprocess(
      (v) => (typeof v === "string" ? sortKeysFromParam(v) : v),
      z.array(logEntrySortKeySchema).max(3),
    )
    .optional(),
  /** Cursor keyset opaco devuelto por la página anterior. */
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});
export type LogEntryListQuery = z.infer<typeof logEntryListQuerySchema>;

/** Filtros del listado que maneja la UI (sin paginación ni orden). */
export type LogEntryListFilters = Omit<LogEntryListQuery, "cursor" | "take" | "sort" | "dir" | "sorts">;

// === Línea de tiempo / audit trail unificado (Fase 2.6) ======================

/** Paginación de timeline / log de cambios. */
export const timelineQuerySchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

/**
 * Evento del audit trail unificado de una entrada (ALCOA+): la fusión cronológica
 * de creación, cambios por campo, transiciones (con su firma), firmas de sección
 * y sellado. La arma el BACKEND (orden autoritativo + paginación multi-tabla).
 */
export const logEntryTimelineEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CREATED"),
    id: z.string(),
    at: z.string(),
    actorName: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("FIELD_CHANGE"),
    id: z.string(),
    at: z.string(),
    actorName: z.string().nullable(),
    fieldKey: z.string(),
    /** Etiqueta del campo en la versión congelada (null si ya no existe). */
    fieldLabel: z.string().nullable(),
    sectionKey: z.string().nullable(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    reason: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("TRANSITION"),
    id: z.string(),
    at: z.string(),
    actorName: z.string().nullable(),
    transitionKey: z.string(),
    label: z.string().nullable(),
    fromStateKey: z.string(),
    toStateKey: z.string(),
    fromStateName: z.string().nullable(),
    toStateName: z.string().nullable(),
    reason: z.string().nullable(),
    signature: logEntrySignatureSummarySchema.nullable(),
  }),
  z.object({
    kind: z.literal("SECTION_SIGNED"),
    id: z.string(),
    at: z.string(),
    sectionKey: z.string(),
    sectionTitle: z.string().nullable(),
    signerName: z.string(),
    meaning: z.string(),
    method: signatureMethodSchema,
  }),
  z.object({
    kind: z.literal("SEALED"),
    id: z.string(),
    at: z.string(),
  }),
  z.object({
    /** Declaración (vigente) de registro diferido: quién, cuándo y por qué (2.7.0). */
    kind: z.literal("DEFERRED_DECLARED"),
    id: z.string(),
    at: z.string(),
    actorName: z.string().nullable(),
    declaredEffectiveAt: z.string(),
    reason: z.string().nullable(),
  }),
  z.object({
    /** Anulación del borrador (2.8.2): quién, cuándo y por qué se descartó. */
    kind: z.literal("VOIDED"),
    id: z.string(),
    at: z.string(),
    actorName: z.string().nullable(),
    reason: z.string().nullable(),
  }),
]);
export type LogEntryTimelineEvent = z.infer<typeof logEntryTimelineEventSchema>;

export const logEntryTimelineResponseSchema = z.object({
  events: z.array(logEntryTimelineEventSchema),
  nextCursor: z.string().nullable(),
});
export type LogEntryTimelineResponse = z.infer<typeof logEntryTimelineResponseSchema>;

/** Cambio de campo del log de auditoría fino (endpoint paginado propio). */
export const logEntryFieldChangeDtoSchema = z.object({
  id: z.string(),
  fieldKey: z.string(),
  fieldLabel: z.string().nullable(),
  sectionKey: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
});
export type LogEntryFieldChangeDto = z.infer<typeof logEntryFieldChangeDtoSchema>;

export const logEntryChangesResponseSchema = z.object({
  items: z.array(logEntryFieldChangeDtoSchema),
  nextCursor: z.string().nullable(),
});
export type LogEntryChangesResponse = z.infer<typeof logEntryChangesResponseSchema>;

/** Entradas relacionadas (contexto operacional, estilo event frames de PI). */
export const relatedLogEntriesSchema = z.object({
  /** Mismo nodo + mismo periodo contable. */
  samePeriod: z.array(logEntryListItemSchema),
  /** Mismo día operacional + mismo turno (cualquier nodo alcanzable). */
  sameShift: z.array(logEntryListItemSchema),
});
export type RelatedLogEntries = z.infer<typeof relatedLogEntriesSchema>;

// === Verificación de integridad de firma (Fase 2.6, §11.70) ==================

/**
 * Veredicto de la verificación: el backend recomputa el hash canónico con los
 * valores ACTUALES y, si no coincide, con los valores REBOBINADOS al instante de
 * la firma (revirtiendo el historial `LogEntryFieldChange` posterior).
 *  - VALID: el hash coincide con el estado actual (nada cambió desde la firma).
 *  - VALID_RECORD_CHANGED_AFTER: la firma es íntegra respecto de lo firmado, pero
 *    el registro fue editado DESPUÉS (legítimo en flujos multi-estado; el detalle
 *    de qué cambió está en el log de cambios).
 *  - INVALID: no coincide ni rebobinando ⇒ el contenido firmado no es reconstruible
 *    (alteración o pérdida de historial). Debe investigarse.
 */
export const SIGNATURE_VERIFY_VERDICTS = ["VALID", "VALID_RECORD_CHANGED_AFTER", "INVALID"] as const;
export const signatureVerifyVerdictSchema = z.enum(SIGNATURE_VERIFY_VERDICTS);
export type SignatureVerifyVerdict = z.infer<typeof signatureVerifyVerdictSchema>;

export const signatureVerifyResultSchema = z.object({
  signatureId: z.string(),
  verdict: signatureVerifyVerdictSchema,
  /** Hash almacenado al firmar. */
  payloadHash: z.string(),
  /** Nº de cambios de campo posteriores a la firma (contexto del veredicto). */
  changesAfterSignature: z.number().int(),
  verifiedAt: z.string(),
});
export type SignatureVerifyResult = z.infer<typeof signatureVerifyResultSchema>;

// === Lógica compartida (fuente única backend + frontend) =====================

/** ¿Está vacío el valor (a efectos de "obligatorio")? */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  // Valor ESTRUCTURADO (p. ej. RANGE {from,to}): vacío si TODOS sus campos lo están.
  // (0/false NO son vacíos; un objeto sin claves se considera vacío.)
  if (typeof value === "object") {
    const vals = Object.values(value as Record<string, unknown>);
    return vals.every((v) => v === null || v === undefined || (typeof v === "string" && v.trim() === ""));
  }
  return false;
}

/**
 * Visibilidad condicional de un campo dada la foto de valores por clave. Espejo
 * del `showIf` del prototipo: visible si no hay condición, o si el campo
 * referenciado es igual al valor esperado. Fuente única (la usa el backend para
 * no exigir/validar campos ocultos y el frontend para mostrarlos).
 */
export function isFieldVisible(
  visibleWhen: VisibleWhen | null | undefined,
  valuesByKey: Record<string, unknown>,
): boolean {
  if (!visibleWhen) return true;
  const current = valuesByKey[visibleWhen.fieldKey];
  // Comparación laxa por valor (los selects guardan code string; números/booleanos directos).
  return current === visibleWhen.equals;
}

/** Resultado de validar un único valor de campo. */
export interface FieldValueValidation {
  errors: string[];
  warnings: string[];
}

/** Forma mínima de un campo para validar su valor (subconjunto del DTO). */
export interface FieldForValidation {
  key: string;
  type: TemplateFieldDto["type"];
  dataType: TemplateFieldDto["dataType"];
  label: string;
  config: Record<string, unknown>;
}

/** Opciones de validación: códigos/ids permitidos resueltos por el backend (catálogos/entidades vivas). */
export interface ValidateFieldValueOptions {
  /** Conjunto de `code` válidos para SELECT/MULTISELECT (inline o lista resuelta). */
  allowedCodes?: ReadonlySet<string> | readonly string[];
  /**
   * Conjunto de `id` válidos para un campo REFERENCE (entidad existe + activa +
   * EN ALCANCE ABAC), resuelto server-side. Espejo de `allowedCodes`: si está
   * presente y el id no pertenece, el valor se rechaza (fuera de alcance).
   */
  allowedRefIds?: ReadonlySet<string> | readonly string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida un valor de campo contra su tipo/config. NO decide "obligatorio" (eso lo
 * resuelve el llamador con `isEmptyValue` + completitud): aquí, un valor vacío es
 * válido. Devuelve errores (rechazan el guardado) y advertencias (bandas de
 * umbral ISA-18.2: se registran pero no bloquean; disparan incidencia en Fase 4).
 *
 * Es la FUENTE ÚNICA de validación de valor: el backend la ejecuta como verdad,
 * el frontend la reutiliza para feedback inmediato.
 */
export function validateFieldValue(
  field: FieldForValidation,
  value: unknown,
  opts: ValidateFieldValueOptions = {},
): FieldValueValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Objetos de PRESENTACIÓN (HEADING/NOTICE/…): no son dato, nunca se validan.
  if (isPresentationalType(field.type)) return { errors, warnings };
  if (isEmptyValue(value)) return { errors, warnings };

  const allowed =
    opts.allowedCodes instanceof Set
      ? opts.allowedCodes
      : opts.allowedCodes
        ? new Set(opts.allowedCodes as readonly string[])
        : undefined;
  const allowedRefs =
    opts.allowedRefIds instanceof Set
      ? opts.allowedRefIds
      : opts.allowedRefIds
        ? new Set(opts.allowedRefIds as readonly string[])
        : undefined;

  switch (field.type) {
    case "NUMBER": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        errors.push(`${field.label}: debe ser un número`);
        break;
      }
      const c = field.config as {
        min?: number;
        max?: number;
        decimals?: number;
        format?: NumberFormat;
      };
      // Porcentaje: el valor está acotado a 0..100 (la unidad es el % implícito).
      if (c.format === "percent") {
        if (n < 0 || n > 100) errors.push(`${field.label}: el porcentaje debe estar entre 0 y 100`);
      }
      if (typeof c.min === "number" && n < c.min) errors.push(`${field.label}: por debajo del mínimo (${c.min})`);
      if (typeof c.max === "number" && n > c.max) errors.push(`${field.label}: por encima del máximo (${c.max})`);
      if (typeof c.decimals === "number") {
        const factor = 10 ** c.decimals;
        if (Math.round(n * factor) !== n * factor) {
          errors.push(`${field.label}: máximo ${c.decimals} decimal(es)`);
        }
      }
      // Bandas de umbral (advertencia, no bloquean). EFECTIVAS: derivadas de
      // `expected ± tolerance` (Ola 2) o las explícitas warn/crit del config.
      const b = effectiveNumberBands(field.config);
      if (typeof b.critLow === "number" && n < b.critLow) warnings.push(`${field.label}: bajo crítico`);
      else if (typeof b.warnLow === "number" && n < b.warnLow) warnings.push(`${field.label}: bajo advertencia`);
      if (typeof b.critHigh === "number" && n > b.critHigh) warnings.push(`${field.label}: alto crítico`);
      else if (typeof b.warnHigh === "number" && n > b.warnHigh) warnings.push(`${field.label}: alto advertencia`);
      break;
    }
    case "TEXT":
    case "TEXTAREA": {
      if (typeof value !== "string") {
        errors.push(`${field.label}: debe ser texto`);
        break;
      }
      const c = field.config as { minLength?: number; maxLength?: number; pattern?: string; format?: TextFormat };
      if (typeof c.minLength === "number" && value.length < c.minLength)
        errors.push(`${field.label}: mínimo ${c.minLength} caracteres`);
      if (typeof c.maxLength === "number" && value.length > c.maxLength)
        errors.push(`${field.label}: máximo ${c.maxLength} caracteres`);
      if (c.pattern) {
        try {
          if (!new RegExp(c.pattern).test(value)) errors.push(`${field.label}: formato inválido`);
        } catch {
          /* patrón inválido en la plantilla: ignora la validación de formato */
        }
      }
      // Formato semántico (Ola 1): RUT (dígito verificador) / correo / teléfono / URL.
      if (c.format && !isValidTextFormat(c.format, value)) {
        const msg: Record<TextFormat, string> = {
          rut: "RUT inválido (verifique el dígito verificador)",
          email: "correo electrónico inválido",
          phone: "teléfono inválido",
          url: "URL inválida",
        };
        errors.push(`${field.label}: ${msg[c.format]}`);
      }
      break;
    }
    case "SELECT": {
      if (typeof value !== "string") {
        errors.push(`${field.label}: selección inválida`);
        break;
      }
      if (allowed && !allowed.has(value)) errors.push(`${field.label}: opción fuera del catálogo`);
      break;
    }
    case "MULTISELECT": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        errors.push(`${field.label}: selección múltiple inválida`);
        break;
      }
      if (new Set(value as string[]).size !== value.length) errors.push(`${field.label}: opciones repetidas`);
      if (allowed) {
        for (const code of value as string[]) {
          if (!allowed.has(code)) {
            errors.push(`${field.label}: opción fuera del catálogo (${code})`);
            break;
          }
        }
      }
      break;
    }
    case "BOOLEAN": {
      if (typeof value !== "boolean") errors.push(`${field.label}: debe ser verdadero/falso`);
      break;
    }
    case "DATE": {
      if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value)))
        errors.push(`${field.label}: fecha inválida (YYYY-MM-DD)`);
      break;
    }
    case "DATETIME": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        errors.push(`${field.label}: fecha y hora inválidas`);
      break;
    }
    case "SEVERITY": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 5) errors.push(`${field.label}: severidad fuera de rango (1–5)`);
      break;
    }
    case "SIGNATURE": {
      // La firma electrónica (Part 11) se captura en la ejecución de flujo (2.5).
      errors.push(`${field.label}: la firma se realiza al ejecutar el flujo`);
      break;
    }
    // --- Ola 1 ---------------------------------------------------------------
    case "CONFORMITY": {
      if (typeof value !== "string") {
        errors.push(`${field.label}: selección inválida`);
        break;
      }
      const allowNa = (field.config as { allowNa?: boolean }).allowNa !== false;
      const valid = CONFORMITY_CODES.filter((c) => allowNa || c !== "NA");
      if (!(valid as readonly string[]).includes(value)) errors.push(`${field.label}: opción fuera del catálogo`);
      break;
    }
    case "RATING": {
      const n = typeof value === "number" ? value : Number(value);
      const max = (field.config as { max?: number }).max ?? RATING_DEFAULT_MAX;
      if (!Number.isInteger(n) || n < 1 || n > max) errors.push(`${field.label}: valoración fuera de rango (1–${max})`);
      break;
    }
    case "TIME": {
      if (typeof value !== "string" || !isValidTimeOfDay(value)) errors.push(`${field.label}: hora inválida (HH:MM)`);
      break;
    }
    case "DURATION": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 0) errors.push(`${field.label}: duración inválida`);
      break;
    }
    case "RANGE": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${field.label}: rango inválido`);
        break;
      }
      const r = value as { from?: unknown; to?: unknown };
      const from = r.from === null || r.from === undefined || r.from === "" ? null : Number(r.from);
      const to = r.to === null || r.to === undefined || r.to === "" ? null : Number(r.to);
      if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to))) {
        errors.push(`${field.label}: el rango debe contener números`);
        break;
      }
      if (from !== null && to !== null && from > to) errors.push(`${field.label}: el mínimo no puede superar al máximo`);
      const rc = field.config as { min?: number; max?: number };
      for (const v of [from, to]) {
        if (v === null) continue;
        if (typeof rc.min === "number" && v < rc.min) errors.push(`${field.label}: por debajo del mínimo (${rc.min})`);
        if (typeof rc.max === "number" && v > rc.max) errors.push(`${field.label}: por encima del máximo (${rc.max})`);
      }
      break;
    }
    // --- Ola 2 ---------------------------------------------------------------
    case "REFERENCE": {
      // El valor es el `id` de la entidad referida. La existencia/actividad/
      // alcance (ABAC) se resuelve SERVER-SIDE en `allowedRefs` (espejo de los
      // catálogos); aquí solo se valida la forma y la pertenencia al set.
      if (typeof value !== "string") {
        errors.push(`${field.label}: referencia inválida`);
        break;
      }
      if (allowedRefs && !allowedRefs.has(value)) errors.push(`${field.label}: referencia fuera de alcance o inexistente`);
      break;
    }
    case "RISK_MATRIX": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${field.label}: riesgo inválido`);
        break;
      }
      const rv = value as { probability?: unknown; consequence?: unknown };
      const hasP = rv.probability !== null && rv.probability !== undefined && rv.probability !== "";
      const hasC = rv.consequence !== null && rv.consequence !== undefined && rv.consequence !== "";
      if (!hasP || !hasC) {
        errors.push(`${field.label}: indique probabilidad y consecuencia`);
        break;
      }
      // `riskLevelFor` valida que (probabilidad, consecuencia) caigan en los ejes
      // de la matriz configurada; null = fuera de rango / matriz inválida.
      if (!riskLevelFor(field.config, value)) errors.push(`${field.label}: combinación de riesgo fuera de la matriz`);
      break;
    }
  }
  return { errors, warnings };
}

/**
 * Banda de umbral ISA-18.2 en que cae un valor NUMÉRICO según el config del campo
 * (misma semántica que las advertencias de `validateFieldValue`: crítico domina a
 * advertencia). FUENTE ÚNICA del estampado de `LogEntryValue.thresholdBand` en
 * backend y de los badges de excepción en el frontend.
 */
export function thresholdBandFor(field: FieldForValidation, value: unknown): ThresholdBand | null {
  if (field.type !== "NUMBER" || isEmptyValue(value)) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // Bandas EFECTIVAS: derivadas de `expected ± tolerance` (Ola 2) o explícitas.
  const c = effectiveNumberBands(field.config);
  if (typeof c.critLow === "number" && n < c.critLow) return "CRIT";
  if (typeof c.critHigh === "number" && n > c.critHigh) return "CRIT";
  if (typeof c.warnLow === "number" && n < c.warnLow) return "WARN";
  if (typeof c.warnHigh === "number" && n > c.warnHigh) return "WARN";
  return null;
}

/** Folio legible de una entrada (referencia humana estable, ej. "BIT-000123"). */
export function formatEntryFolio(entryNumber: number, prefix = "BIT"): string {
  return `${prefix}-${String(entryNumber).padStart(6, "0")}`;
}

/**
 * Deriva la fecha efectiva de una versión a partir de sus valores. Cadena de
 * prioridad (fuente única para el estampado en backend): el valor del campo con
 * `semanticRole = EFFECTIVE_DATE` → la fecha DECLARADA a nivel de entrada
 * (registro diferido 2.7.0) → `recordedAt`. El campo, cuando existe y tiene un
 * valor válido, SIEMPRE manda (una sola fuente por entrada, sin ambigüedad).
 */
export function resolveEffectiveAt(
  sections: Pick<TemplateSectionDto, "fields">[],
  valuesByKey: Record<string, unknown>,
  recordedAt: Date,
  declaredEffectiveAt?: Date | null,
): Date {
  const fallback = declaredEffectiveAt ?? recordedAt;
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.semanticRole !== "EFFECTIVE_DATE") continue;
      const raw = valuesByKey[field.key];
      if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return new Date(parsed);
      }
      return fallback;
    }
  }
  return fallback;
}

// === Ventana de edición (Fase 2.7.2 — fuente única back↔front) ===============

/** Ventana de edición EFECTIVA (ya resuelta la herencia plantilla→global). */
export interface EditWindowConfig {
  anchor: EditWindowAnchor;
  windowMinutes: number;
}

/**
 * Resuelve la ventana de edición efectiva: la plantilla manda; null hereda el
 * global. `minutes` 0 o null final = SIN ventana (se edita sin límite temporal).
 * Es gobernanza VIVA (patrón SAP OB52 / Odoo lock dates): cambiar la config
 * aplica de inmediato a todas las entradas, sin republicar plantillas.
 */
export function resolveEditWindow(
  template: { editWindowAnchor: EditWindowAnchor | null; editWindowMinutes: number | null },
  globalConfig: { editWindowAnchor: EditWindowAnchor; editWindowMinutes: number | null },
): EditWindowConfig | null {
  const minutes = template.editWindowMinutes ?? globalConfig.editWindowMinutes;
  if (minutes === null || minutes <= 0) return null;
  return { anchor: template.editWindowAnchor ?? globalConfig.editWindowAnchor, windowMinutes: minutes };
}

/**
 * Instante en que vence la ventana: ancla (RECORDED = captura inmutable;
 * EFFECTIVE = fecha del evento vigente) + duración configurada (minutos).
 */
export function editWindowDeadline(config: EditWindowConfig, recordedAt: Date, effectiveAt: Date): Date {
  const base = config.anchor === "EFFECTIVE" ? effectiveAt : recordedAt;
  return new Date(base.getTime() + config.windowMinutes * 60_000);
}

/** ¿Está vencida la ventana en `now`? (vencida = ya NO se edita por el canal normal). */
export function isEditWindowExpired(deadline: Date, now: Date): boolean {
  return now.getTime() > deadline.getTime();
}

/** ¿Es la sección editable en el estado de flujo dado? (parte de la editabilidad). */
export function isSectionEditableInState(
  editableInStateKey: string | null,
  currentStateKey: string | null,
): boolean {
  // null = editable siempre (form simple). Con flujo, solo en su estado declarado.
  if (editableInStateKey === null) return true;
  return editableInStateKey === currentStateKey;
}

// === Ejecución de flujo (fuente única back↔front) ============================

/** Forma mínima de una transición de la versión congelada para decidir disponibilidad. */
export interface TransitionForAvailability {
  key: string;
  label: string;
  fromStateKey: string;
  toStateKey: string;
  requireSignature: boolean;
  signatureMeaning: string | null;
  requireMfa: boolean;
  /** Roles autorizados (dato). Vacío = cualquiera con el permiso base de transición. */
  roleIds: readonly string[];
}

/** Forma mínima de un estado para resolver su nombre legible. */
export interface StateForAvailability {
  key: string;
  name: string;
}

/**
 * Transiciones que un usuario puede ejecutar AHORA: las que salen del estado
 * actual y cuyo conjunto de roles autorizados intersecta los roles del usuario
 * (o no declara roles = abierta a cualquiera con el permiso base). FUENTE ÚNICA:
 * el backend la ejecuta como verdad (gatea la ejecución), el frontend la reusa
 * para pintar SOLO los botones permitidos. No reemplaza la verificación de ABAC
 * ni de firma, que el backend aplica al ejecutar.
 */
export function availableTransitionsFor(
  transitions: readonly TransitionForAvailability[],
  states: readonly StateForAvailability[],
  currentStateKey: string | null,
  userRoleIds: ReadonlySet<string> | readonly string[],
): AvailableTransitionDto[] {
  if (currentStateKey === null) return [];
  const roles = userRoleIds instanceof Set ? userRoleIds : new Set(userRoleIds as readonly string[]);
  const nameByKey = new Map(states.map((s) => [s.key, s.name]));
  return transitions
    .filter((t) => t.fromStateKey === currentStateKey)
    .filter((t) => t.roleIds.length === 0 || t.roleIds.some((r) => roles.has(r)))
    .map((t) => ({
      transitionKey: t.key,
      label: t.label,
      toStateKey: t.toStateKey,
      toStateName: nameByKey.get(t.toStateKey) ?? t.toStateKey,
      requireSignature: t.requireSignature,
      signatureMeaning: t.signatureMeaning,
      requireMfa: t.requireMfa,
    }));
}

/** Datos que entran al snapshot canónico que se firma (record–signature linking §11.70). */
export interface SignaturePayloadInput {
  entryId: string;
  templateVersionId: string;
  context: SignatureContext;
  /** Transición (TRANSITION) o sección (SECTION_COMPLETION) firmada. */
  transitionKey?: string | null;
  sectionKey?: string | null;
  fromStateKey?: string | null;
  toStateKey?: string | null;
  signerId: string;
  meaning: string;
  signedAt: string;
  /** Foto de los valores firmados (fieldKey → value), relevante al contexto. */
  values: Record<string, unknown>;
}

/**
 * Forma canónica del mapa de valores firmado: descarta las entradas vacías
 * (null/undefined). Elimina la ambigüedad "clave presente con null" vs "clave
 * ausente" entre el mapa en memoria al firmar y el reconstruido desde
 * `LogEntryValue`/`LogEntryFieldChange` al VERIFICAR (Fase 2.6). Sin esto, una
 * firma podría dar falso INVALID por pura representación.
 */
export function canonicalSignatureValues(valuesByKey: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(valuesByKey)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Serializa el payload de firma de forma DETERMINISTA (claves ordenadas en todo
 * nivel, valores vacíos descartados vía `canonicalSignatureValues`) para que su
 * SHA-256 sea estable e independiente del orden de inserción y de la
 * representación de "vacío". Es la pieza que ata la firma a un contenido exacto:
 * el mismo input siempre produce el mismo hash (no repudio / integridad).
 * Fuente única back↔front (firmar y VERIFICAR pasan por aquí).
 */
export function canonicalSignaturePayload(input: SignaturePayloadInput): string {
  return stableStringify({
    entryId: input.entryId,
    templateVersionId: input.templateVersionId,
    context: input.context,
    transitionKey: input.transitionKey ?? null,
    sectionKey: input.sectionKey ?? null,
    fromStateKey: input.fromStateKey ?? null,
    toStateKey: input.toStateKey ?? null,
    signerId: input.signerId,
    meaning: input.meaning,
    signedAt: input.signedAt,
    values: canonicalSignatureValues(input.values),
  });
}

/** JSON con claves ordenadas recursivamente (canonicalización determinista). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
