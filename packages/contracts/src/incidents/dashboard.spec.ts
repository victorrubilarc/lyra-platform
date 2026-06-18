import { describe, expect, it } from "vitest";
import {
  defaultBucketForRange,
  defaultDashboardRange,
  incidentDashboardQuerySchema,
  paretoOrder,
  type DashboardDimensionSlice,
} from "./dashboard.js";

const day = 24 * 60 * 60 * 1000;
const T0 = new Date(Date.UTC(2026, 5, 17, 12, 0, 0)); // 2026-06-17 12:00 UTC

describe("incidencias 4.5 — dashboard (contratos + helpers puros)", () => {
  describe("defaultDashboardRange", () => {
    it("son los últimos 90 días terminando ahora", () => {
      const { from, to } = defaultDashboardRange(T0);
      expect(to.getTime()).toBe(T0.getTime());
      expect(to.getTime() - from.getTime()).toBe(90 * day);
    });
  });

  describe("defaultBucketForRange", () => {
    it("≤31 días ⇒ day", () => {
      expect(defaultBucketForRange(new Date(T0.getTime() - 30 * day), T0)).toBe("day");
    });
    it("≤182 días ⇒ week", () => {
      expect(defaultBucketForRange(new Date(T0.getTime() - 90 * day), T0)).toBe("week");
    });
    it(">182 días ⇒ month", () => {
      expect(defaultBucketForRange(new Date(T0.getTime() - 365 * day), T0)).toBe("month");
    });
    it("rango cero ⇒ no rompe (mínimo 1 día ⇒ day)", () => {
      expect(defaultBucketForRange(T0, T0)).toBe("day");
    });
  });

  describe("paretoOrder", () => {
    const slices: DashboardDimensionSlice[] = [
      { key: "a", label: "A", count: 10 },
      { key: "b", label: "B", count: 30 },
      { key: "c", label: "C", count: 60 },
    ];
    it("ordena desc por count y acumula el %", () => {
      const out = paretoOrder(slices);
      expect(out.map((s) => s.key)).toEqual(["c", "b", "a"]);
      expect(out[0]!.cumulativePct).toBe(60);
      expect(out[1]!.cumulativePct).toBe(90);
      expect(out[2]!.cumulativePct).toBe(100);
    });
    it("total 0 ⇒ % en 0 sin dividir por cero", () => {
      const out = paretoOrder([{ key: "x", label: "X", count: 0 }]);
      expect(out[0]!.cumulativePct).toBe(0);
    });
    it("no muta el arreglo de entrada", () => {
      const copy = [...slices];
      paretoOrder(slices);
      expect(slices).toEqual(copy);
    });
  });

  describe("incidentDashboardQuerySchema", () => {
    it("coacciona fechas, severidad, bucket y ventana desde strings de querystring", () => {
      const q = incidentDashboardQuerySchema.parse({
        createdFrom: "2026-01-01T00:00:00.000Z",
        createdTo: "2026-06-01T00:00:00.000Z",
        severity: "5",
        bucket: "week",
        recurrenceWindowDays: "45",
        orgNodeIds: "n1,n2",
      });
      expect(q.createdFrom).toBeInstanceOf(Date);
      expect(q.severity).toBe(5);
      expect(q.bucket).toBe("week");
      expect(q.recurrenceWindowDays).toBe(45);
      expect(q.orgNodeIds).toEqual(["n1", "n2"]);
    });
    it("todo opcional ⇒ objeto vacío válido", () => {
      expect(incidentDashboardQuerySchema.parse({})).toEqual({});
    });
    it("rechaza bucket inválido", () => {
      expect(() => incidentDashboardQuerySchema.parse({ bucket: "year" })).toThrow();
    });
  });
});
