import { describe, expect, it } from "vitest";
import {
  criticalityDimensionLabel,
  workOrderDashboardQuerySchema,
} from "./dashboard.js";
import {
  defaultBucketForRange,
  defaultDashboardRange,
  paretoOrder,
} from "../incidents/dashboard.js";

describe("work-orders/dashboard — helpers puros", () => {
  it("criticalityDimensionLabel formatea C1..C5", () => {
    expect(criticalityDimensionLabel(1)).toBe("C1");
    expect(criticalityDimensionLabel(5)).toBe("C5");
  });

  it("reusa defaultDashboardRange: 90 días hacia atrás", () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    const { from, to } = defaultDashboardRange(now);
    expect(to).toEqual(now);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(90);
  });

  it("reusa defaultBucketForRange: day/week/month por largo", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const plus = (d: number) => new Date(base.getTime() + d * 86_400_000);
    expect(defaultBucketForRange(base, plus(20))).toBe("day");
    expect(defaultBucketForRange(base, plus(120))).toBe("week");
    expect(defaultBucketForRange(base, plus(300))).toBe("month");
  });

  it("reusa paretoOrder: ordena desc y acumula % (80/20)", () => {
    const out = paretoOrder([
      { key: "a", label: "A", count: 1 },
      { key: "b", label: "B", count: 7 },
      { key: "c", label: "C", count: 2 },
    ]);
    expect(out.map((s) => s.key)).toEqual(["b", "c", "a"]);
    expect(out[0]?.cumulativePct).toBe(70);
    expect(out[2]?.cumulativePct).toBe(100);
  });

  it("paretoOrder no divide por cero cuando total = 0", () => {
    const out = paretoOrder([{ key: "a", label: "A", count: 0 }]);
    expect(out[0]?.cumulativePct).toBe(0);
  });
});

describe("work-orders/dashboard — query schema", () => {
  it("coacciona fechas y CSV de nodos", () => {
    const q = workOrderDashboardQuerySchema.parse({
      createdFrom: "2026-06-01T00:00:00.000Z",
      criticality: "5",
      orgNodeIds: "n1, n2 ,n3",
    });
    expect(q.createdFrom).toBeInstanceOf(Date);
    expect(q.criticality).toBe(5);
    expect(q.orgNodeIds).toEqual(["n1", "n2", "n3"]);
  });

  it("rechaza criticidad fuera de 1..5", () => {
    expect(() => workOrderDashboardQuerySchema.parse({ criticality: 7 })).toThrow();
  });

  it("acepta un query vacío (todos los filtros opcionales)", () => {
    expect(workOrderDashboardQuerySchema.parse({})).toEqual({});
  });
});
