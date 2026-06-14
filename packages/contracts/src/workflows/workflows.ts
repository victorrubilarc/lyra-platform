import { z } from "zod";

/**
 * Flujos reutilizables (Fase 2.2) — contratos compartidos back↔front.
 *
 * Un flujo es una MÁQUINA DE ESTADOS configurable (estados + transiciones), NO
 * un motor BPMN. Es un catálogo de primera clase (mantenedor propio estilo
 * Roles), referenciable por varias versiones de plantilla. La autorización por
 * transición es DATO (roles permitidos en cada transición), nunca claves
 * hardcodeadas; se honra en la EJECUCIÓN (2.5).
 *
 * Modelo: `WorkflowDefinition` (contenedor mutable) 1—N `WorkflowDefinitionVersion`
 * (INMUTABLE al publicar, patrón MMR de 21 CFR Part 11) → estados + transiciones.
 * La versión de plantilla CONGELA qué versión de flujo usa, para no alterar
 * registros históricos.
 *
 * En el contrato (cable/UI) las transiciones referencian estados por su CLAVE
 * estable (`fromStateKey`/`toStateKey`), igual que `editableInStateKey` y
 * `visibleWhen`. El backend resuelve clave↔FK al persistir.
 */

// Clave estable de definición: minúsculas, números y guiones (ej. `cierre-turno`).
export const workflowKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones");

// Clave estable de estado/transición dentro de una versión: identificador legible.
const nodeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letras, números y guión bajo; debe iniciar con letra");

export const workflowStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const workflowVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type WorkflowVersionStatus = z.infer<typeof workflowVersionStatusSchema>;

// === Entidades (forma de respuesta; fechas como ISO string) ==================

export const workflowStateSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  /** Estado de entrada del registro. Exactamente uno por versión. */
  isInitial: z.boolean(),
  /** Estado terminal (el registro queda cerrado). Al menos uno por versión. */
  isFinal: z.boolean(),
  /** Token de color del DS para el chip (opcional). */
  color: z.string().nullable(),
  /** SLA de PERMANENCIA: tiempo máximo de estadía en el estado, en MINUTOS canónicos
   *  (null = sin SLA). Tiempo calendario. Viaja en la versión congelada ⇒ histórico fiel. */
  maxStayMinutes: z.number().int().nullable(),
});
export type WorkflowStateDto = z.infer<typeof workflowStateSchema>;

export const workflowTransitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  /** Clave del estado origen. */
  fromStateKey: z.string(),
  /** Clave del estado destino. */
  toStateKey: z.string(),
  order: z.number().int(),
  /** Opt-in Part 11: exige firma electrónica al ejecutar la transición (2.5). */
  requireSignature: z.boolean(),
  /** Significado de la firma ("Revisado", "Aprobado"…). Solo si requireSignature. */
  signatureMeaning: z.string().nullable(),
  /** Step-up AAL: exige reconfirmar MFA para la transición (2.5). */
  requireMfa: z.boolean(),
  /** Roles autorizados a ejecutar la transición (autorización = dato). */
  roleIds: z.array(z.string()),
  /** Nombres de esos roles, resueltos en backend (RESPONSABLE por elemento). El
   *  builder los resuelve con su propia lista de roles (`roleNameOf`); el visor los
   *  recibe ya resueltos aquí para mostrar el responsable fuera del builder. []
   *  cuando el productor no resuelve nombres (p. ej. el mantenedor de flujos). */
  roleNames: z.array(z.string()),
});
export type WorkflowTransitionDto = z.infer<typeof workflowTransitionSchema>;

export const workflowVersionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  versionNumber: z.number().int(),
  status: workflowVersionStatusSchema,
  name: z.string(),
  description: z.string().nullable(),
  publishedAt: z.string().nullable(),
  states: z.array(workflowStateSchema),
  transitions: z.array(workflowTransitionSchema),
});
export type WorkflowVersionDto = z.infer<typeof workflowVersionSchema>;

export const workflowDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: workflowStatusSchema,
  currentVersionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowDefinitionDto = z.infer<typeof workflowDefinitionSchema>;

/** Ítem de listado: definición + conteos y números de versión para las cards. */
export const workflowListItemSchema = workflowDefinitionSchema.extend({
  stateCount: z.number().int(),
  transitionCount: z.number().int(),
  draftVersionNumber: z.number().int().nullable(),
  publishedVersionNumber: z.number().int().nullable(),
  /** Cuántas versiones de plantilla referencian este flujo (informativo). */
  usedByTemplateCount: z.number().int(),
});
export type WorkflowListItem = z.infer<typeof workflowListItemSchema>;

/** Detalle: definición + la versión que se edita/visualiza (borrador o publicada). */
export const workflowDetailSchema = workflowDefinitionSchema.extend({
  version: workflowVersionSchema,
  /** Hay una versión en borrador editable (distinta de la publicada). */
  hasDraft: z.boolean(),
});
export type WorkflowDetail = z.infer<typeof workflowDetailSchema>;

// === Validación de la máquina de estados (fuente única back↔front) ===========

/**
 * Severidad de un problema de la máquina:
 * - `error`: integridad estructural (claves duplicadas, transición a un estado
 *   inexistente). Rompería la persistencia ⇒ bloquea **guardar** y **publicar**.
 * - `pending`: regla de negocio del flujo completo (falta inicial/final,
 *   estado inalcanzable o trampa). Es válido tenerlos en un borrador a medio
 *   construir ⇒ NO bloquea guardar, pero sí **publicar**.
 */
export type MachineIssueSeverity = "error" | "pending";

export interface MachineIssue {
  message: string;
  severity: MachineIssueSeverity;
  /** Ruta Zod opcional para señalar el elemento problemático. */
  path?: (string | number)[];
}

interface StateLike {
  key: string;
  isInitial?: boolean;
  isFinal?: boolean;
}
interface TransitionLike {
  key: string;
  fromStateKey: string;
  toStateKey: string;
}

/**
 * Valida la integridad de una máquina de estados (registros operacionales /
 * Part 11): exactamente un estado inicial, ≥1 estado final, claves únicas,
 * transiciones que referencian estados existentes, alcanzabilidad desde el
 * inicial y ausencia de trampas (todo estado puede llegar a un final).
 *
 * Fuente ÚNICA de verdad: la usa el `superRefine` del contrato y el backend.
 */
export function validateWorkflowMachine(
  states: readonly StateLike[],
  transitions: readonly TransitionLike[],
): MachineIssue[] {
  const issues: MachineIssue[] = [];

  if (states.length === 0) {
    issues.push({ message: "El flujo debe tener al menos un estado", severity: "pending", path: ["states"] });
    return issues; // sin estados, el resto no aplica
  }

  // Claves de estado únicas (integridad).
  const stateKeys = new Set<string>();
  const dupStateKeys = new Set<string>();
  states.forEach((s) => {
    if (stateKeys.has(s.key)) dupStateKeys.add(s.key);
    stateKeys.add(s.key);
  });
  if (dupStateKeys.size > 0) {
    issues.push({
      message: `Clave de estado duplicada: ${[...dupStateKeys].join(", ")}`,
      severity: "error",
      path: ["states"],
    });
  }

  // Exactamente un estado inicial.
  const initial = states.filter((s) => s.isInitial);
  if (initial.length === 0) {
    issues.push({ message: "Debe haber exactamente un estado inicial", severity: "pending", path: ["states"] });
  } else if (initial.length > 1) {
    issues.push({
      message: `Solo puede haber un estado inicial (hay ${initial.length})`,
      severity: "pending",
      path: ["states"],
    });
  }

  // Al menos un estado final (el registro debe poder cerrarse).
  const finals = states.filter((s) => s.isFinal);
  if (finals.length === 0) {
    issues.push({ message: "Debe haber al menos un estado final", severity: "pending", path: ["states"] });
  }

  // Claves de transición únicas (integridad).
  const transitionKeys = new Set<string>();
  transitions.forEach((t, i) => {
    if (transitionKeys.has(t.key)) {
      issues.push({ message: `Clave de transición duplicada: ${t.key}`, severity: "error", path: ["transitions", i, "key"] });
    }
    transitionKeys.add(t.key);
  });

  // Las transiciones referencian estados existentes (integridad).
  transitions.forEach((t, i) => {
    if (!stateKeys.has(t.fromStateKey)) {
      issues.push({ message: `Transición "${t.key}": estado origen inexistente`, severity: "error", path: ["transitions", i, "fromStateKey"] });
    }
    if (!stateKeys.has(t.toStateKey)) {
      issues.push({ message: `Transición "${t.key}": estado destino inexistente`, severity: "error", path: ["transitions", i, "toStateKey"] });
    }
  });

  // Si la topología base es inconsistente, no calculamos alcanzabilidad.
  if (issues.length > 0 || initial.length !== 1) return issues;

  const initialKey = initial[0]!.key;

  // Alcanzabilidad: todo estado debe alcanzarse desde el inicial.
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const s of states) {
    forward.set(s.key, []);
    backward.set(s.key, []);
  }
  for (const t of transitions) {
    forward.get(t.fromStateKey)!.push(t.toStateKey);
    backward.get(t.toStateKey)!.push(t.fromStateKey);
  }

  const bfs = (start: string, adj: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };

  const reachable = bfs(initialKey, forward);
  const unreachable = states.filter((s) => !reachable.has(s.key)).map((s) => s.key);
  if (unreachable.length > 0) {
    issues.push({
      message: `Estado(s) inalcanzable(s) desde el inicial: ${unreachable.join(", ")}`,
      severity: "pending",
      path: ["states"],
    });
  }

  // Sin trampas: todo estado debe poder llegar a algún estado final.
  if (finals.length > 0) {
    const canReachFinal = new Set<string>();
    for (const f of finals) {
      for (const k of bfs(f.key, backward)) canReachFinal.add(k);
    }
    const traps = states.filter((s) => !canReachFinal.has(s.key)).map((s) => s.key);
    if (traps.length > 0) {
      issues.push({
        message: `Estado(s) sin salida hacia un final (trampa): ${traps.join(", ")}`,
        severity: "pending",
        path: ["states"],
      });
    }
  }

  return issues;
}

/** ¿Hay errores de integridad (bloquean guardar borrador y publicar)? */
export function hasBlockingMachineErrors(issues: readonly MachineIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

// === SLA de permanencia (Workflow SLA, 2026-06-13) ============================

/**
 * Veredicto de SLA de un estado:
 *  - `ok`: dentro del SLA (o sin SLA configurado).
 *  - `at-risk`: alcanzó el umbral de riesgo (≥ 80% del SLA) sin superarlo aún.
 *  - `breached`: superó el SLA (ATRASADO).
 * Dos niveles = estándar de monitoreo (at-risk vs breach). El filtro/KPI "Retrasadas"
 * cuenta solo `breached`; `at-risk` es señal proactiva de UI.
 */
export type SlaStatus = "ok" | "at-risk" | "breached";

/** Fracción del SLA a partir de la cual el estado se marca "en riesgo" (ámbar). */
export const SLA_AT_RISK_RATIO = 0.8;

export interface SlaEvaluation {
  status: SlaStatus;
  /** Tiempo transcurrido en el estado, en ms (≥ 0). */
  elapsedMs: number;
  /** Duración del SLA en ms; null = sin SLA. */
  slaMs: number | null;
  /** ms por encima del SLA cuando `breached`; 0 en otros casos. */
  overdueMs: number;
}

/**
 * Evalúa el SLA de permanencia: fuente ÚNICA back↔front del veredicto de atraso.
 * `sinceMs` = instante de entrada al estado; `slaMinutes` = SLA del estado (null =
 * sin SLA); `nowMs` = ahora. El cliente formatea las duraciones con lib/format
 * (regional); el backend lo usa para el cómputo de la grilla/diagrama.
 */
export function evaluateSla(sinceMs: number, slaMinutes: number | null, nowMs: number): SlaEvaluation {
  const elapsedMs = Math.max(0, nowMs - sinceMs);
  if (slaMinutes === null || slaMinutes <= 0) {
    return { status: "ok", elapsedMs, slaMs: null, overdueMs: 0 };
  }
  const slaMs = slaMinutes * 60_000;
  if (elapsedMs > slaMs) return { status: "breached", elapsedMs, slaMs, overdueMs: elapsedMs - slaMs };
  if (elapsedMs >= slaMs * SLA_AT_RISK_RATIO) return { status: "at-risk", elapsedMs, slaMs, overdueMs: 0 };
  return { status: "ok", elapsedMs, slaMs, overdueMs: 0 };
}

// === Requests ================================================================

export const createWorkflowRequestSchema = z.object({
  key: workflowKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});
export type CreateWorkflowRequest = z.infer<typeof createWorkflowRequestSchema>;

export const updateWorkflowRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateWorkflowRequest = z.infer<typeof updateWorkflowRequestSchema>;

// --- Save del borrador (máquina completa del builder) ------------------------
// El orden de estados/transiciones es el del arreglo (el backend asigna `order`).

export const draftStateInputSchema = z.object({
  key: nodeKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  isInitial: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  /** SLA de permanencia en MINUTOS canónicos (null/omitido = sin SLA). 1..525600 (365 d). */
  maxStayMinutes: z.number().int().min(1).max(525_600).nullable().optional(),
});
export type DraftStateInput = z.infer<typeof draftStateInputSchema>;

export const draftTransitionInputSchema = z.object({
  key: nodeKeySchema,
  label: z.string().trim().min(1).max(120),
  fromStateKey: nodeKeySchema,
  toStateKey: nodeKeySchema,
  requireSignature: z.boolean().optional(),
  signatureMeaning: z.string().trim().max(120).nullable().optional(),
  requireMfa: z.boolean().optional(),
  roleIds: z.array(z.string()).max(50).optional(),
});
export type DraftTransitionInput = z.infer<typeof draftTransitionInputSchema>;

export const saveWorkflowDraftRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    states: z.array(draftStateInputSchema).max(50),
    transitions: z.array(draftTransitionInputSchema).max(200),
  })
  .superRefine((body, ctx) => {
    // El borrador solo exige INTEGRIDAD (errores). Las reglas de máquina completa
    // (inicial/final/alcanzabilidad) se exigen al PUBLICAR, no al guardar — así se
    // puede guardar una máquina a medio construir.
    for (const issue of validateWorkflowMachine(body.states, body.transitions)) {
      if (issue.severity !== "error") continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path ?? [],
      });
    }
  });
export type SaveWorkflowDraftRequest = z.infer<typeof saveWorkflowDraftRequestSchema>;

export const publishWorkflowRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type PublishWorkflowRequest = z.infer<typeof publishWorkflowRequestSchema>;

export const workflowListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: workflowStatusSchema.optional(),
});
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;
