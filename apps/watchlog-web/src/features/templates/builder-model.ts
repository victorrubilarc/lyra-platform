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
  EditWindowAnchor,
  FieldSemanticRole,
  FieldType,
  OrgNodeTree,
  SaveTemplateDraftRequest,
  TemplateDetail,
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
  orgNodeId: string | null;
  requireSignature: boolean;
  /** Flujo reutilizable asignado a la versión (Fase 2.2). null = sin flujo. */
  workflowDefinitionId: string | null;
  workflowDefinitionVersionId: string | null;
  /** Ventana de edición (2.7.2), config del CONTENEDOR (gobernanza viva):
   * minutos null = hereda global · 0 = sin ventana · >0 = propia. */
  editWindowAnchor: EditWindowAnchor | null;
  editWindowMinutes: number | null;
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
    orgNodeId: detail.orgNodeId,
    requireSignature: detail.version.requireSignature,
    workflowDefinitionId: detail.version.workflowDefinitionId,
    workflowDefinitionVersionId: detail.version.workflowDefinitionVersionId,
    editWindowAnchor: detail.editWindowAnchor,
    editWindowMinutes: detail.editWindowMinutes,
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
    orgNodeId: state.orgNodeId,
    requireSignature: state.requireSignature,
    workflowDefinitionId: state.workflowDefinitionId,
    workflowDefinitionVersionId: state.workflowDefinitionVersionId,
    editWindowAnchor: state.editWindowAnchor,
    editWindowMinutes: state.editWindowMinutes,
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
        roleIds: f.roleIds,
      })),
    })),
  };
}

/** Conteo total de campos en el estado editable. */
export function totalFields(state: EditState): number {
  return state.sections.reduce((n, s) => n + s.fields.length, 0);
}
