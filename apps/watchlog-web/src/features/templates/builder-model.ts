import {
  AlignLeft,
  Calendar,
  CalendarClock,
  CheckSquare,
  Hash,
  ListChecks,
  PenLine,
  TriangleAlert,
  Type,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import type {
  ComputedFieldConfig,
  CrossRule,
  EditWindowAnchor,
  EquipmentMode,
  FieldSemanticRole,
  FieldType,
  OrgNodeTree,
  SaveTemplateDraftRequest,
  TemplateDetail,
  TemplateNodeAssignmentInput,
  UpdateTemplateRequest,
  VisibleWhen,
} from "@lyra/contracts";

/** Aplana el árbol de nodos a opciones indentadas para un `<select>`. */
export interface NodeOption {
  id: string;
  label: string;
}
export function flattenNodeOptions(nodes: OrgNodeTree[], depth = 0): NodeOption[] {
  const out: NodeOption[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
    if (n.children.length) out.push(...flattenNodeOptions(n.children, depth + 1));
  }
  return out;
}

/** Metadatos de cada tipo de campo para la paleta del builder. */
export interface FieldTypeMeta {
  type: FieldType;
  labelKey: string;
  icon: LucideIcon;
  /** Tipo con editor completo en 2.1 (los 8 núcleo). */
  core: boolean;
}

export const FIELD_TYPE_META: readonly FieldTypeMeta[] = [
  { type: "NUMBER", labelKey: "templates.fieldTypes.number", icon: Hash, core: true },
  { type: "TEXT", labelKey: "templates.fieldTypes.text", icon: Type, core: true },
  { type: "TEXTAREA", labelKey: "templates.fieldTypes.textarea", icon: AlignLeft, core: true },
  { type: "SELECT", labelKey: "templates.fieldTypes.select", icon: CheckSquare, core: true },
  { type: "MULTISELECT", labelKey: "templates.fieldTypes.multiselect", icon: ListChecks, core: true },
  { type: "BOOLEAN", labelKey: "templates.fieldTypes.boolean", icon: ToggleRight, core: true },
  { type: "DATE", labelKey: "templates.fieldTypes.date", icon: Calendar, core: true },
  { type: "DATETIME", labelKey: "templates.fieldTypes.datetime", icon: CalendarClock, core: true },
  { type: "SEVERITY", labelKey: "templates.fieldTypes.severity", icon: TriangleAlert, core: false },
  { type: "SIGNATURE", labelKey: "templates.fieldTypes.signature", icon: PenLine, core: false },
];

export function fieldTypeMeta(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META.find((m) => m.type === type) ?? FIELD_TYPE_META[0]!;
}

/**
 * Presets de ancho (en columnas de 12) para el campo. Atajos comunes; el ajuste
 * fino (cualquier span 1..12) se hace arrastrando el borde de la card en el lienzo.
 * Compartido por la barra flotante del campo y el panel de configuración avanzada.
 */
export const WIDTH_PRESETS = [
  { span: 12, glyph: "1", labelKey: "templates.builder.widthFull" },
  { span: 8, glyph: "⅔", labelKey: "templates.builder.widthTwoThirds" },
  { span: 6, glyph: "½", labelKey: "templates.builder.widthHalf" },
  { span: 4, glyph: "⅓", labelKey: "templates.builder.widthThird" },
  { span: 3, glyph: "¼", labelKey: "templates.builder.widthQuarter" },
] as const;

// === Auto-layout por arrastre (Fase 2.1.5) ===================================
// El usuario no piensa en "12 columnas": arrastra un campo AL LADO de otro y
// comparten fila (ancho repartido solo), o a su propia línea (ancho completo). El
// ancho se DERIVA del arrastre; `colSpan` sigue siendo el almacenamiento. Una
// "fila" = corrida de campos consecutivos cuyos colSpan suman ≤12 (lo que la grilla
// CSS ya empaqueta). Tope de 4 por fila (mín. colSpan 3) para que sigan legibles.

export const GRID_TOTAL = 12;
export const ROW_MAX_FIELDS = 4;

// === Geometría en el LIENZO de posicionamiento libre (Fase 2.1.7) ============
// Cada campo tiene geometría EXPLÍCITA: gridX (columna 0..11), gridY (fila
// lógica), gridH (alto en filas); el ANCHO es colSpan (= w). El editor (lienzo
// react-grid-layout) la escribe al arrastrar/redimensionar; el render del
// llenado/visor la reproduce. Las plantillas LEGACY (sin geometría persistida)
// la derivan del orden + colSpan (idéntico a la vista anterior).

/** Alto por defecto (filas lógicas) según el control: textarea/firma ocupan 2. */
export function defaultFieldH(type: FieldType): number {
  return type === "TEXTAREA" || type === "SIGNATURE" ? 2 : 1;
}

const clampCol = (n: number) => Math.min(Math.max(Math.round(n || GRID_TOTAL), 1), GRID_TOTAL);

/**
 * Deriva geometría {gridX,gridY,gridH} empaquetando los campos por orden + colSpan
 * en filas de 12 (reproduce la vista previa a 2.1.7). Para plantillas legacy.
 */
export function deriveSectionGeometry(fields: EditField[]): EditField[] {
  let x = 0;
  let y = 0;
  return fields.map((f) => {
    const w = clampCol(f.colSpan);
    if (x + w > GRID_TOTAL) {
      x = 0;
      y += 1;
    }
    const placed = { ...f, gridX: x, gridY: y, gridH: f.gridH || defaultFieldH(f.type) };
    x += w;
    return placed;
  });
}

/** Primer `gridY` libre al final de la sección (para insertar un campo nuevo). */
export function nextFreeRow(fields: EditField[]): number {
  if (fields.length === 0) return 0;
  return Math.max(...fields.map((f) => f.gridY + f.gridH)) ;
}

/**
 * Compactación vertical (gravedad hacia arriba): reasigna `gridY` para que ningún
 * campo se encime, preservando la columna (`gridX`) y los que están lado a lado.
 * Se usa al AGREGAR/soltar un campo (el lienzo ya compacta al arrastrar/redimensionar).
 */
export function compactFields(fields: EditField[]): EditField[] {
  const sorted = [...fields].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const newY = new Map<string, number>();
  for (const f of sorted) {
    const w = f.colSpan;
    const h = f.gridH;
    let y = 0;
    const hits = (yy: number) =>
      placed.some((p) => f.gridX < p.x + p.w && f.gridX + w > p.x && yy < p.y + p.h && yy + h > p.y);
    while (hits(y)) y += 1;
    placed.push({ x: f.gridX, y, w, h });
    newY.set(f.uid, y);
  }
  return fields.map((f) => ({ ...f, gridY: newY.get(f.uid) ?? f.gridY }));
}

/** Reparte 12 columnas en n partes iguales (2→6,6; 3→4,4,4; 4→3,3,3,3). */
export function splitRow(n: number): number[] {
  if (n <= 1) return [GRID_TOTAL];
  const base = Math.floor(GRID_TOTAL / n);
  const rem = GRID_TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Rango `[start, end)` de la fila (corrida que suma ≤12) que contiene `index`. */
export function rowRangeOf(fields: EditField[], index: number): [number, number] {
  let start = 0;
  while (start < fields.length) {
    let sum = 0;
    let end = start;
    while (end < fields.length) {
      const next = sum + (fields[end]!.colSpan || GRID_TOTAL);
      if (end > start && next > GRID_TOTAL) break;
      sum = next;
      end += 1;
    }
    if (index >= start && index < end) return [start, end];
    start = end;
  }
  return [index, index + 1];
}

// === Modelo editable local ===================================================

export interface EditField {
  /** Id local estable para keys de React (no se envía al backend). */
  uid: string;
  key: string;
  type: FieldType;
  /** Rol semántico opcional (capa 3). En 2.1.1 el builder solo setea EFFECTIVE_DATE. */
  semanticRole: FieldSemanticRole | null;
  label: string;
  help: string | null;
  required: boolean;
  config: Record<string, unknown>;
  visibleWhen: VisibleWhen | null;
  /** Campo FORMULADO (Req-7): fórmula que deriva el valor (read-only). null = tecleado. */
  computed: ComputedFieldConfig | null;
  /** Ancho del campo en columnas de la grilla de 12 (Fase 2.1.3). Default 12. = w del lienzo. */
  colSpan: number;
  /** Geometría EXPLÍCITA en el lienzo (Fase 2.1.7): columna, fila lógica, alto en filas.
   *  Siempre concreta en el modelo del editor (se deriva al cargar si la plantilla es legacy). */
  gridX: number;
  gridY: number;
  gridH: number;
  roleIds: string[];
}

export interface EditSection {
  uid: string;
  key: string;
  title: string;
  description: string | null;
  requireSignature: boolean;
  /** Estado del flujo en que la sección es editable (clave). null = siempre. */
  editableInStateKey: string | null;
  roleIds: string[];
  fields: EditField[];
}

export interface EditState {
  name: string;
  description: string;
  /** Alcance de estructura (multi-nodo 2.8.0). Vacío = GLOBAL. Fuente de verdad. */
  nodeAssignments: TemplateNodeAssignmentInput[];
  requireSignature: boolean;
  /** Flujo reutilizable asignado a la versión (Fase 2.2). null = sin flujo. */
  workflowDefinitionId: string | null;
  workflowDefinitionVersionId: string | null;
  /** Ventana de edición (2.7.2), config del CONTENEDOR (gobernanza viva):
   * minutos null = hereda global · 0 = sin ventana · >0 = propia. */
  editWindowAnchor: EditWindowAnchor | null;
  editWindowMinutes: number | null;
  /** Modo de equipo (2.8.0.2), gobernanza del objeto de referencia EAM. */
  equipmentMode: EquipmentMode;
  /** Campos de resumen en la grilla de Bitácoras (2.8.1a) — pool ORDENADO de `key`,
   * gobernanza viva del contenedor. "El diseñador ofrece, el usuario dispone." */
  gridFieldKeys: string[];
  /** Reglas de validación CRUZADA (Req-7), parte de la versión INMUTABLE. */
  rules: CrossRule[];
  sections: EditSection[];
}

let uidCounter = 0;
export const nextUid = (): string => `u${(uidCounter += 1)}`;

/** Convierte un texto en una clave válida `^[a-zA-Z][a-zA-Z0-9_]*$`. */
export function slugifyKey(text: string, fallback: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "f_$1");
  return base.length > 0 ? base : fallback;
}

/** Asegura unicidad de una clave dentro de un conjunto ya usado. */
export function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let i = 2;
  while (used.has(key)) key = `${base}_${i++}`;
  used.add(key);
  return key;
}

export function defaultFieldConfig(type: FieldType): Record<string, unknown> {
  switch (type) {
    case "SELECT":
    case "MULTISELECT":
      return { optionSource: { kind: "inline", items: [{ code: "opcion_1", label: "Opción 1" }] } };
    default:
      return {};
  }
}

/** Mapea el detalle del backend al modelo editable local. */
export function detailToEditState(detail: TemplateDetail): EditState {
  return {
    name: detail.name,
    description: detail.description ?? "",
    nodeAssignments: detail.nodeAssignments.map((a) => ({
      orgNodeId: a.orgNodeId,
      includeDescendants: a.includeDescendants,
    })),
    requireSignature: detail.version.requireSignature,
    workflowDefinitionId: detail.version.workflowDefinitionId,
    workflowDefinitionVersionId: detail.version.workflowDefinitionVersionId,
    editWindowAnchor: detail.editWindowAnchor,
    editWindowMinutes: detail.editWindowMinutes,
    equipmentMode: detail.equipmentMode,
    gridFieldKeys: detail.gridFieldKeys,
    rules: detail.version.rules.map((r) => ({ ...r })),
    sections: detail.version.sections.map((s) => {
      // Geometría: si ALGÚN campo no la trae (plantilla legacy), se deriva TODA la
      // sección del orden + colSpan (vista idéntica a la anterior). Si la trae, se usa.
      const legacy = s.fields.some((f) => f.gridX == null || f.gridY == null);
      let x = 0;
      let y = 0;
      const fields = s.fields.map((f) => {
        const base = {
          uid: nextUid(),
          key: f.key,
          type: f.type,
          semanticRole: f.semanticRole,
          label: f.label,
          help: f.help,
          required: f.required,
          config: f.config,
          visibleWhen: f.visibleWhen,
          computed: f.computed,
          colSpan: f.colSpan,
          roleIds: f.roleIds,
        };
        if (legacy) {
          const w = clampCol(f.colSpan);
          if (x + w > GRID_TOTAL) {
            x = 0;
            y += 1;
          }
          const placed = { ...base, gridX: x, gridY: y, gridH: f.gridH ?? defaultFieldH(f.type) };
          x += w;
          return placed;
        }
        return { ...base, gridX: f.gridX!, gridY: f.gridY!, gridH: f.gridH ?? defaultFieldH(f.type) };
      });
      return {
        uid: nextUid(),
        key: s.key,
        title: s.title,
        description: s.description,
        requireSignature: s.requireSignature,
        editableInStateKey: s.editableInStateKey,
        roleIds: s.roleIds,
        fields,
      };
    }),
  };
}

/** Claves de sección ya usadas en el estado (para generar nuevas únicas). */
export function collectSectionKeys(state: EditState): Set<string> {
  return new Set(state.sections.map((s) => s.key));
}

/** Claves de campo ya usadas en TODO el template (únicas globalmente → conditional). */
export function collectFieldKeys(state: EditState): Set<string> {
  const keys = new Set<string>();
  state.sections.forEach((s) => s.fields.forEach((f) => keys.add(f.key)));
  return keys;
}

/**
 * Construye el request de guardado desde el modelo editable. Las claves son
 * estables (se generan al crear secciones/campos); aquí solo se envían tal cual.
 */
export function editStateToDraftRequest(state: EditState): SaveTemplateDraftRequest {
  return {
    name: state.name.trim() || "Sin título",
    description: state.description.trim() || null,
    requireSignature: state.requireSignature,
    // Flujo: enviamos solo la DEFINICIÓN; el backend ata SIEMPRE su versión
    // publicada vigente (`resolveWorkflowBinding` exige la actual). Reenviar la
    // versión congelada de una versión anterior rompía al editar una plantilla
    // cuyo flujo fue republicado ("Solo puede asignarse la versión publicada
    // vigente del flujo"). null = el binding se resuelve a la versión vigente.
    workflowDefinitionId: state.workflowDefinitionId,
    workflowDefinitionVersionId: null,
    // NOTA: el alcance de nodos, la ventana de edición y el modo de equipo son
    // GOBERNANZA VIVA del contenedor y se guardan por `editStateToConfigRequest`
    // (PATCH), NO por el borrador — así "Guardar borrador" y "Guardar configuración"
    // no se pisan ni mezclan sus semánticas (definición versionada vs ajuste vivo).
    // Reglas cruzadas (Req-7): viajan en la versión inmutable junto a las secciones.
    rules: state.rules,
    sections: state.sections.map((s, si) => ({
      key: s.key,
      title: s.title.trim() || `Sección ${si + 1}`,
      description: s.description?.trim() ? s.description.trim() : null,
      requireSignature: s.requireSignature,
      // Solo se envía el estado si hay un flujo asignado (degradación elegante).
      editableInStateKey: state.workflowDefinitionId ? s.editableInStateKey : null,
      roleIds: s.roleIds,
      fields: s.fields.map((f, fi) => ({
        key: f.key,
        type: f.type,
        semanticRole: f.semanticRole,
        label: f.label.trim() || `Campo ${fi + 1}`,
        help: f.help?.trim() ? f.help.trim() : null,
        required: f.required,
        config: f.config,
        visibleWhen: f.visibleWhen,
        computed: f.computed,
        colSpan: f.colSpan,
        // Geometría EXPLÍCITA del lienzo (2.1.7): se persiste en la versión inmutable.
        gridX: f.gridX,
        gridY: f.gridY,
        gridH: f.gridH,
        roleIds: f.roleIds,
      })),
    })),
  };
}

/**
 * Construye el request de CONFIGURACIÓN/gobernanza (PATCH /templates/:id): identidad
 * + alcance de nodos + ventana de edición + modo de equipo. Es config VIVA del
 * contenedor: se aplica de inmediato a las entradas nuevas, sin crear borrador ni
 * publicar. NO incluye el flujo (definición versionada) ni las secciones.
 */
export function editStateToConfigRequest(state: EditState): UpdateTemplateRequest {
  return {
    name: state.name.trim() || "Sin título",
    description: state.description.trim() || null,
    nodeAssignments: state.nodeAssignments,
    editWindowAnchor: state.editWindowAnchor,
    editWindowMinutes: state.editWindowMinutes,
    equipmentMode: state.equipmentMode,
    // Campos de resumen de grilla (2.8.1a): solo keys que aún existen en la versión
    // (poda de huérfanos al guardar). El backend revalida; el cap (6) lo cuida la UI.
    gridFieldKeys: state.gridFieldKeys.filter((k) => collectFieldKeys(state).has(k)),
  };
}

/** Conteo total de campos en el estado editable. */
export function totalFields(state: EditState): number {
  return state.sections.reduce((n, s) => n + s.fields.length, 0);
}
