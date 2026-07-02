import { describe, expect, it } from "vitest";
import {
  applicableChecklistRules,
  blockingChecklistsForClose,
  blockingChecklistsForMoment,
  summarizeChecklists,
  type WorkOrderChecklistMoment,
  type WorkOrderChecklistStatus,
} from "./checklists.js";

/** Regla de prueba con todos los ejes en "cualquiera" salvo lo que cada caso ajuste. */
function rule(over: Partial<Parameters<typeof applicableChecklistRules>[1][number]> = {}) {
  return {
    appliesToTypeIds: [] as string[],
    minCriticality: null as number | null,
    specialtyId: null as string | null,
    requiresPtw: null as boolean | null,
    active: true,
    ...over,
  };
}

const ctx = { typeId: "t1", criticality: 3, requiresPtw: false, specialtyIds: ["mec"] };

describe("applicableChecklistRules", () => {
  it("una regla sin condiciones aplica siempre", () => {
    expect(applicableChecklistRules(ctx, [rule()])).toHaveLength(1);
  });

  it("descarta reglas inactivas", () => {
    expect(applicableChecklistRules(ctx, [rule({ active: false })])).toHaveLength(0);
  });

  it("appliesToTypeIds filtra por tipo (vacío = todos)", () => {
    expect(applicableChecklistRules(ctx, [rule({ appliesToTypeIds: ["t1"] })])).toHaveLength(1);
    expect(applicableChecklistRules(ctx, [rule({ appliesToTypeIds: ["t2"] })])).toHaveLength(0);
  });

  it("minCriticality exige criticidad >= umbral", () => {
    expect(applicableChecklistRules(ctx, [rule({ minCriticality: 3 })])).toHaveLength(1);
    expect(applicableChecklistRules(ctx, [rule({ minCriticality: 4 })])).toHaveLength(0);
  });

  it("requiresPtw discrimina por el flag PTW de la OT (null = no discrimina)", () => {
    expect(applicableChecklistRules(ctx, [rule({ requiresPtw: false })])).toHaveLength(1);
    expect(applicableChecklistRules(ctx, [rule({ requiresPtw: true })])).toHaveLength(0);
    expect(applicableChecklistRules({ ...ctx, requiresPtw: true }, [rule({ requiresPtw: true })])).toHaveLength(1);
  });

  it("specialtyId exige que la OT tenga esa disciplina", () => {
    expect(applicableChecklistRules(ctx, [rule({ specialtyId: "mec" })])).toHaveLength(1);
    expect(applicableChecklistRules(ctx, [rule({ specialtyId: "elec" })])).toHaveLength(0);
  });
});

describe("blockingChecklistsForClose", () => {
  const cl = (mandatory: boolean, status: WorkOrderChecklistStatus) => ({ mandatory, status });

  it("bloquea sólo obligatorios que no estén APPROVED", () => {
    const list = [
      cl(true, "PENDING"),
      cl(true, "APPROVED"),
      cl(false, "PENDING"),
      cl(true, "REJECTED"),
      cl(true, "SUBMITTED"),
    ];
    const blocking = blockingChecklistsForClose(list);
    expect(blocking).toHaveLength(3); // PENDING + REJECTED + SUBMITTED obligatorios
    expect(blocking.every((c) => c.mandatory && c.status !== "APPROVED")).toBe(true);
  });

  it("no bloquea si todos los obligatorios están APPROVED", () => {
    expect(blockingChecklistsForClose([cl(true, "APPROVED"), cl(false, "PENDING")])).toHaveLength(0);
  });
});

describe("blockingChecklistsForMoment", () => {
  const cl = (moment: WorkOrderChecklistMoment, mandatory: boolean, status: WorkOrderChecklistStatus) => ({ moment, mandatory, status });

  it("sólo bloquea obligatorios no APPROVED DEL momento pedido", () => {
    const list = [
      cl("AUTHORIZATION", true, "PENDING"), // bloquea autorización
      cl("AUTHORIZATION", true, "APPROVED"),
      cl("CLOSURE", true, "PENDING"), // bloquea cierre, NO autorización
      cl("CLOSURE", false, "PENDING"),
    ];
    expect(blockingChecklistsForMoment(list, "AUTHORIZATION")).toHaveLength(1);
    expect(blockingChecklistsForMoment(list, "CLOSURE")).toHaveLength(1);
    expect(blockingChecklistsForMoment(list, "EXECUTION")).toHaveLength(0);
  });

  it("un CLOSURE aprobado no bloquea el cierre", () => {
    expect(blockingChecklistsForMoment([cl("CLOSURE", true, "APPROVED")], "CLOSURE")).toHaveLength(0);
  });
});

describe("summarizeChecklists", () => {
  it("cuenta total, aprobados, obligatorios y bloqueantes", () => {
    const s = summarizeChecklists([
      { mandatory: true, status: "APPROVED" },
      { mandatory: true, status: "PENDING" },
      { mandatory: false, status: "APPROVED" },
    ]);
    expect(s).toEqual({ total: 3, approved: 2, mandatory: 2, blocking: 1 });
  });
});
