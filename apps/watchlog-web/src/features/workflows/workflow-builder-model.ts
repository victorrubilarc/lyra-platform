import type { SaveWorkflowDraftRequest, WorkflowDetail } from "@lyra/contracts";

/**
 * Modelo editable local del builder de flujos (máquina de estados). Las claves
 * de estado/transición son estables (se generan al crear y se preservan); las
 * transiciones referencian estados por clave (igual que el contrato/cable).
 */

export interface EditWorkflowState {
  uid: string;
  key: string;
  name: string;
  description: string | null;
  isInitial: boolean;
  isFinal: boolean;
  color: string | null;
  /** SLA de permanencia en MINUTOS canónicos (null = sin SLA). Tiempo calendario. */
  maxStayMinutes: number | null;
  /** La clave fue fijada por el usuario (deja de seguir al nombre). Solo local. */
  keyLocked: boolean;
}

export interface EditWorkflowTransition {
  uid: string;
  key: string;
  label: string;
  fromStateKey: string;
  toStateKey: string;
  requireSignature: boolean;
  signatureMeaning: string | null;
  requireMfa: boolean;
  roleIds: string[];
}

export interface EditWorkflow {
  name: string;
  description: string;
  states: EditWorkflowState[];
  transitions: EditWorkflowTransition[];
}

let uidCounter = 0;
export const nextUid = (): string => `w${(uidCounter += 1)}`;

/** Convierte un texto en una clave válida `^[a-zA-Z][a-zA-Z0-9_]*$`. */
export function slugifyKey(text: string, fallback: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "s_$1");
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

export function detailToEditWorkflow(detail: WorkflowDetail): EditWorkflow {
  return {
    name: detail.name,
    description: detail.description ?? "",
    states: detail.version.states.map((s) => ({
      uid: nextUid(),
      key: s.key,
      name: s.name,
      description: s.description,
      isInitial: s.isInitial,
      isFinal: s.isFinal,
      color: s.color,
      maxStayMinutes: s.maxStayMinutes,
      // Estados ya existentes: preservar su clave (no auto-renombrar al editar el nombre).
      keyLocked: true,
    })),
    transitions: detail.version.transitions.map((t) => ({
      uid: nextUid(),
      key: t.key,
      label: t.label,
      fromStateKey: t.fromStateKey,
      toStateKey: t.toStateKey,
      requireSignature: t.requireSignature,
      signatureMeaning: t.signatureMeaning,
      requireMfa: t.requireMfa,
      roleIds: t.roleIds,
    })),
  };
}

export function collectStateKeys(wf: EditWorkflow): Set<string> {
  return new Set(wf.states.map((s) => s.key));
}

export function collectTransitionKeys(wf: EditWorkflow): Set<string> {
  return new Set(wf.transitions.map((t) => t.key));
}

export function editWorkflowToDraftRequest(wf: EditWorkflow): SaveWorkflowDraftRequest {
  return {
    name: wf.name.trim() || "Sin título",
    description: wf.description.trim() || null,
    states: wf.states.map((s) => ({
      key: s.key,
      name: s.name.trim() || s.key,
      description: s.description?.trim() ? s.description.trim() : null,
      isInitial: s.isInitial,
      isFinal: s.isFinal,
      color: s.color,
      maxStayMinutes: s.maxStayMinutes,
    })),
    transitions: wf.transitions.map((t, i) => ({
      key: t.key,
      label: t.label.trim() || `Transición ${i + 1}`,
      fromStateKey: t.fromStateKey,
      toStateKey: t.toStateKey,
      requireSignature: t.requireSignature,
      signatureMeaning: t.signatureMeaning?.trim() ? t.signatureMeaning.trim() : null,
      requireMfa: t.requireMfa,
      roleIds: t.roleIds,
    })),
  };
}
