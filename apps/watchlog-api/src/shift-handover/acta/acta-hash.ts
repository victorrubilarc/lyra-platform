import { createHash } from "node:crypto";
import type { ShiftHandoverDetail } from "@lyra/contracts";

/**
 * Hash de integridad del acta (Fase 5 — Slice 4, fork e). Determinista: se calcula
 * de una representación CANÓNICA (claves ordenadas) del snapshot congelado + las dos
 * firmas Part 11 + el resumen firmado. Dos exportaciones de la misma entrega firmada
 * producen el mismo hash (AC-PDF-1/AC-PDF-5) sin persistir nada (fork b: on-demand).
 *
 * Es la semilla del payloadHash de firma que el BACKLOG dejaba pendiente: aquí el
 * documento ya queda verificable por folio + hash. Si más adelante se persiste el
 * artefacto en MinIO, este mismo hash sirve de clave de integridad.
 */

/** Serialización JSON con claves ordenadas recursivamente (estable/canónica). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Subconjunto inmutable que define la identidad del acta (lo que se firma/congela). */
export function actaCanonicalPayload(detail: ShiftHandoverDetail): Record<string, unknown> {
  return {
    code: detail.code,
    orgNodeId: detail.orgNodeId,
    operationalDay: detail.operationalDay,
    shiftCode: detail.shiftCode,
    generalStatus: detail.generalStatus,
    summaryText: detail.summaryText,
    summaryProvider: detail.summaryProvider,
    cockpit: detail.cockpit,
    items: detail.items,
    signOut: detail.signOut,
    acknowledgement: detail.acknowledgement,
    ackState: detail.ackState,
  };
}

/** SHA-256 (hex, minúsculas) del payload canónico del acta. */
export function actaIntegrityHash(detail: ShiftHandoverDetail): string {
  const json = JSON.stringify(canonicalize(actaCanonicalPayload(detail)));
  return createHash("sha256").update(json, "utf8").digest("hex");
}
