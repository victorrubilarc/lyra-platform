import { describe, expect, it } from "vitest";
import {
  evaluateWorkerStatus,
  personFullName,
  upsertPersonRequestSchema,
  type WorkerBlockReason,
} from "./roster.js";

describe("evaluateWorkerStatus", () => {
  it("sin causas ⇒ verde (ok) — comportamiento S1", () => {
    expect(evaluateWorkerStatus({}).level).toBe("ok");
    expect(evaluateWorkerStatus({ reasons: [] }).level).toBe("ok");
  });

  it("una causa de aviso ⇒ ámbar (warning)", () => {
    const r: WorkerBlockReason[] = ["COMPETENCY_EXPIRING"];
    expect(evaluateWorkerStatus({ reasons: r }).level).toBe("warning");
  });

  it("cualquier causa bloqueante ⇒ rojo (blocked), aun mezclada con avisos", () => {
    expect(evaluateWorkerStatus({ reasons: ["COMPETENCY_EXPIRED"] }).level).toBe("blocked");
    expect(evaluateWorkerStatus({ reasons: ["COMPETENCY_EXPIRING", "NOT_AUTHORIZED"] }).level).toBe("blocked");
    expect(evaluateWorkerStatus({ reasons: ["COMPANY_NOT_ACCREDITED"] }).level).toBe("blocked");
    expect(evaluateWorkerStatus({ reasons: ["RESTRICTION_ACTIVE"] }).level).toBe("blocked");
  });

  it("preserva las causas en el resultado (para explicar el bloqueo)", () => {
    const reasons: WorkerBlockReason[] = ["COMPETENCY_MISSING", "COMPANY_NOT_ACCREDITED"];
    expect(evaluateWorkerStatus({ reasons }).reasons).toEqual(reasons);
  });
});

describe("personFullName", () => {
  it("canoniza a 'Apellido, Nombre' (orden alfabético) y recorta espacios", () => {
    expect(personFullName("  Juan ", " Pérez ")).toBe("Pérez, Juan");
  });
});

describe("upsertPersonRequestSchema", () => {
  const base = { kind: "INTERNAL" as const, firstName: "Ana", lastName: "Soto" };

  it("acepta una persona propia sin empresa", () => {
    expect(upsertPersonRequestSchema.safeParse(base).success).toBe(true);
  });

  it("exige empresa contratista cuando la persona es CONTRACTOR", () => {
    expect(upsertPersonRequestSchema.safeParse({ ...base, kind: "CONTRACTOR" }).success).toBe(false);
    expect(upsertPersonRequestSchema.safeParse({ ...base, kind: "CONTRACTOR", contractorCompanyId: "c1" }).success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    expect(upsertPersonRequestSchema.safeParse({ ...base, firstName: "" }).success).toBe(false);
  });
});
