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
  /** Ancho del campo en columnas de la grilla de 12 (Fase 2.1.3). Default 12. */
  colSpan: number;
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
    sections: detail.version.sections.map((s) => ({
      uid: nextUid(),
      key: s.key,
      title: s.title,
      description: s.description,
      requireSignature: s.requireSignature,
      editableInStateKey: s.editableInStateKey,
      roleIds: s.roleIds,
      fields: s.fields.map((f) => ({
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
      })),
    })),
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
