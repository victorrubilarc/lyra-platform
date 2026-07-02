import { describe, expect, it } from "vitest";
import {
  activityDeviationLabel,
  activityEndDeviationDays,
  blockingActivitiesForClose,
  effectiveProgressPct,
  planNotFrozen,
  planReadyToFreeze,
  recordWorkActivityProgressRequestSchema,
  summarizeActivities,
  type WorkActivityStatus,
} from "./activities.js";

function act(over: { mandatory?: boolean; status?: WorkActivityStatus; progressPct?: number } = {}) {
  return { mandatory: over.mandatory ?? true, status: over.status ?? "PENDING", progressPct: over.progressPct ?? 0 };
}

describe("blockingActivitiesForClose", () => {
  it("bloquea las mandatory que no están cerradas (DONE/CANCELED)", () => {
    const rows = [
      act({ mandatory: true, status: "PENDING" }),
      act({ mandatory: true, status: "IN_PROGRESS" }),
      act({ mandatory: true, status: "BLOCKED" }),
      act({ mandatory: true, status: "DONE" }),
      act({ mandatory: true, status: "CANCELED" }),
      act({ mandatory: false, status: "PENDING" }),
    ];
    expect(blockingActivitiesForClose(rows)).toHaveLength(3);
  });

  it("no bloquea si todas las mandatory están cerradas", () => {
    expect(blockingActivitiesForClose([act({ status: "DONE" }), act({ status: "CANCELED" })])).toHaveLength(0);
  });
});

describe("planNotFrozen", () => {
  it("true cuando no hay planFrozenAt", () => {
    expect(planNotFrozen({ planFrozenAt: null })).toBe(true);
  });
  it("false cuando ya se congeló", () => {
    expect(planNotFrozen({ planFrozenAt: "2026-07-02T00:00:00.000Z" })).toBe(false);
  });
});

describe("planReadyToFreeze", () => {
  it("exige al menos una actividad no cancelada", () => {
    expect(planReadyToFreeze([])).toBe(false);
    expect(planReadyToFreeze([act({ status: "CANCELED" })])).toBe(false);
    expect(planReadyToFreeze([act({ status: "PENDING" })])).toBe(true);
  });
});

describe("summarizeActivities", () => {
  it("ignora canceladas en total y promedia el avance de las activas", () => {
    const s = summarizeActivities([
      act({ status: "DONE", progressPct: 100 }),
      act({ status: "IN_PROGRESS", progressPct: 50 }),
      act({ status: "CANCELED", progressPct: 0 }),
      act({ mandatory: true, status: "PENDING", progressPct: 0 }),
    ]);
    expect(s.total).toBe(3);
    expect(s.done).toBe(1);
    expect(s.blocking).toBe(2); // PENDING + IN_PROGRESS mandatory
    expect(s.progressPct).toBe(50); // (100+50+0)/3
  });
});

describe("activityEndDeviationDays", () => {
  it("null sin baseline o sin fecha a comparar", () => {
    expect(activityEndDeviationDays({ baselineEnd: null, plannedEnd: "2026-07-10T00:00:00Z", actualEnd: null })).toBeNull();
    expect(activityEndDeviationDays({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: null, actualEnd: null })).toBeNull();
  });
  it("positivo = atraso; el real gana sobre el plan", () => {
    expect(
      activityEndDeviationDays({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: "2026-07-13T00:00:00Z", actualEnd: null }),
    ).toBe(3);
    expect(
      activityEndDeviationDays({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: "2026-07-13T00:00:00Z", actualEnd: "2026-07-08T00:00:00Z" }),
    ).toBe(-2);
  });
});

describe("activityDeviationLabel", () => {
  it("null cuando no hay desviación o falta baseline", () => {
    expect(activityDeviationLabel({ baselineEnd: null, plannedEnd: "2026-07-10T00:00:00Z", actualEnd: null })).toBeNull();
    expect(activityDeviationLabel({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: "2026-07-10T00:00:00Z", actualEnd: null })).toBeNull();
  });
  it("atraso positivo y adelanto negativo, con singular/plural", () => {
    expect(activityDeviationLabel({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: "2026-07-13T00:00:00Z", actualEnd: null })).toBe("+3 días de atraso");
    expect(activityDeviationLabel({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: "2026-07-11T00:00:00Z", actualEnd: null })).toBe("+1 día de atraso");
    expect(activityDeviationLabel({ baselineEnd: "2026-07-10T00:00:00Z", plannedEnd: null, actualEnd: "2026-07-09T00:00:00Z" })).toBe("1 día de adelanto");
  });
});

describe("effectiveProgressPct", () => {
  it("DONE fuerza 100%", () => {
    expect(effectiveProgressPct({ status: "DONE" }, 40)).toBe(100);
    expect(effectiveProgressPct({ status: "DONE", progressPct: 20 }, 40)).toBe(100);
  });
  it("usa el % del request o conserva el actual", () => {
    expect(effectiveProgressPct({ progressPct: 60 }, 40)).toBe(60);
    expect(effectiveProgressPct({ status: "IN_PROGRESS" }, 40)).toBe(40);
  });
});

describe("recordWorkActivityProgressRequestSchema", () => {
  it("rechaza un avance vacío", () => {
    expect(recordWorkActivityProgressRequestSchema.safeParse({}).success).toBe(false);
  });
  it("acepta si trae al menos un dato de avance", () => {
    expect(recordWorkActivityProgressRequestSchema.safeParse({ status: "IN_PROGRESS" }).success).toBe(true);
    expect(recordWorkActivityProgressRequestSchema.safeParse({ progressPct: 50 }).success).toBe(true);
    expect(recordWorkActivityProgressRequestSchema.safeParse({ note: "avance de terreno" }).success).toBe(true);
  });
});
