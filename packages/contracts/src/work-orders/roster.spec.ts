import { describe, expect, it } from "vitest";
import {
  applicableCompetencyRules,
  competencyValidityState,
  deriveWorkerReasons,
  evaluateWorkerStatus,
  personFullName,
  upsertPersonRequestSchema,
  workerStatusFromDetails,
  type WorkerBlockReason,
  type WorkerCompetencyRuleInput,
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

describe("applicableCompetencyRules", () => {
  const base = { appliesToTypeIds: [] as string[], minCriticality: null, specialtyId: null, requiresPtw: null, active: true };
  const ctx = { typeId: "t1", criticality: 3, requiresPtw: true, specialtyIds: ["s1"] };

  it("regla sin filtros aplica a cualquier OT", () => {
    expect(applicableCompetencyRules(ctx, [base])).toHaveLength(1);
  });
  it("descarta regla inactiva", () => {
    expect(applicableCompetencyRules(ctx, [{ ...base, active: false }])).toHaveLength(0);
  });
  it("filtra por tipo, criticidad, PTW y especialidad", () => {
    expect(applicableCompetencyRules(ctx, [{ ...base, appliesToTypeIds: ["otro"] }])).toHaveLength(0);
    expect(applicableCompetencyRules(ctx, [{ ...base, minCriticality: 4 }])).toHaveLength(0);
    expect(applicableCompetencyRules(ctx, [{ ...base, requiresPtw: false }])).toHaveLength(0);
    expect(applicableCompetencyRules(ctx, [{ ...base, specialtyId: "s9" }])).toHaveLength(0);
    expect(applicableCompetencyRules(ctx, [{ ...base, appliesToTypeIds: ["t1"], minCriticality: 3, requiresPtw: true, specialtyId: "s1" }])).toHaveLength(1);
  });
});

describe("competencyValidityState", () => {
  const now = Date.parse("2026-07-03T00:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  it("sin vencimiento ⇒ no_expiry", () => expect(competencyValidityState(null, now, 30)).toBe("no_expiry"));
  it("vencida ⇒ expired", () => expect(competencyValidityState(now - day, now, 30)).toBe("expired"));
  it("dentro de la ventana ⇒ expiring", () => expect(competencyValidityState(now + 10 * day, now, 30)).toBe("expiring"));
  it("fuera de la ventana ⇒ valid", () => expect(competencyValidityState(now + 60 * day, now, 30)).toBe("valid"));
});

describe("deriveWorkerReasons — causas rojas por persona (Ejes A/B)", () => {
  const now = Date.parse("2026-07-03T00:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  const rule = (over: Partial<WorkerCompetencyRuleInput> = {}): WorkerCompetencyRuleInput => ({
    competencyTypeId: "alt",
    competencyTypeName: "Trabajo en altura",
    mandatory: true,
    appliesToRosterRoleId: null,
    warningLeadDays: null,
    ...over,
  });

  it("competencia mandatoria ausente ⇒ COMPETENCY_MISSING (rojo)", () => {
    const d = deriveWorkerReasons({ rules: [rule()], personRosterRoleIds: [], competencies: [], restrictions: [], nowMs: now });
    expect(d.map((x) => x.reason)).toEqual(["COMPETENCY_MISSING"]);
    expect(workerStatusFromDetails(d).level).toBe("blocked");
  });

  it("competencia mandatoria vencida ⇒ COMPETENCY_EXPIRED (rojo) con fecha", () => {
    const d = deriveWorkerReasons({
      rules: [rule()],
      personRosterRoleIds: [],
      competencies: [{ competencyTypeId: "alt", expiresAtMs: now - day }],
      restrictions: [],
      nowMs: now,
    });
    expect(d[0]!.reason).toBe("COMPETENCY_EXPIRED");
    expect(d[0]!.expiresAt).toBe(new Date(now - day).toISOString());
    expect(workerStatusFromDetails(d).level).toBe("blocked");
  });

  it("competencia vigente ⇒ verde; por vencer ⇒ ámbar (aunque no sea mandatoria)", () => {
    expect(
      deriveWorkerReasons({ rules: [rule()], personRosterRoleIds: [], competencies: [{ competencyTypeId: "alt", expiresAtMs: now + 90 * day }], restrictions: [], nowMs: now }),
    ).toHaveLength(0);
    const soon = deriveWorkerReasons({
      rules: [rule({ mandatory: false })],
      personRosterRoleIds: [],
      competencies: [{ competencyTypeId: "alt", expiresAtMs: now + 5 * day }],
      restrictions: [],
      nowMs: now,
    });
    expect(soon[0]!.reason).toBe("COMPETENCY_EXPIRING");
    expect(workerStatusFromDetails(soon).level).toBe("warning");
  });

  it("regla acotada a un rol sólo aplica a quien tiene ese rol", () => {
    const scoped = [rule({ appliesToRosterRoleId: "entrant" })];
    expect(deriveWorkerReasons({ rules: scoped, personRosterRoleIds: ["vigia"], competencies: [], restrictions: [], nowMs: now })).toHaveLength(0);
    expect(deriveWorkerReasons({ rules: scoped, personRosterRoleIds: ["entrant"], competencies: [], restrictions: [], nowMs: now })).toHaveLength(1);
  });

  it("restricción activa ⇒ RESTRICTION_ACTIVE (rojo, Eje B) — ortogonal a la competencia", () => {
    const d = deriveWorkerReasons({
      rules: [],
      personRosterRoleIds: [],
      competencies: [],
      restrictions: [{ type: "MEDICAL", reason: "No apto por vigilancia de salud" }],
      nowMs: now,
    });
    expect(d[0]!.reason).toBe("RESTRICTION_ACTIVE");
    expect(workerStatusFromDetails(d).level).toBe("blocked");
  });

  it("competencia no-mandatoria ausente NO bloquea", () => {
    const d = deriveWorkerReasons({ rules: [rule({ mandatory: false })], personRosterRoleIds: [], competencies: [], restrictions: [], nowMs: now });
    expect(d).toHaveLength(0);
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
