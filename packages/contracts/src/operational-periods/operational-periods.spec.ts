import { describe, expect, it } from "vitest";
import {
  closePeriodRequestSchema,
  periodStatusSchema,
  reopenPeriodRequestSchema,
} from "./operational-periods.js";
import { enumeratePeriodKeys, type ShiftResolverCalendar } from "../operational-calendar/operational-calendar.js";

describe("operational-periods contract", () => {
  it("acepta los tres estados de gobernanza", () => {
    expect(periodStatusSchema.safeParse("OPEN").success).toBe(true);
    expect(periodStatusSchema.safeParse("CLOSING").success).toBe(true);
    expect(periodStatusSchema.safeParse("CLOSED").success).toBe(true);
    expect(periodStatusSchema.safeParse("FROZEN").success).toBe(false);
  });

  it("cerrar exige estado destino válido y motivo de longitud mínima", () => {
    expect(closePeriodRequestSchema.safeParse({ status: "CLOSED", reason: "Cierre contable mensual" }).success).toBe(
      true,
    );
    // OPEN no es un destino de cierre.
    expect(closePeriodRequestSchema.safeParse({ status: "OPEN", reason: "Cierre contable" }).success).toBe(false);
    // Motivo demasiado corto.
    expect(closePeriodRequestSchema.safeParse({ status: "CLOSED", reason: "no" }).success).toBe(false);
  });

  it("reabrir exige motivo", () => {
    expect(reopenPeriodRequestSchema.safeParse({ reason: "Ajuste posterior autorizado" }).success).toBe(true);
    expect(reopenPeriodRequestSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("enumeratePeriodKeys", () => {
  const monthly: ShiftResolverCalendar = {
    timezone: "America/Santiago",
    shifts: [],
    dayStartShiftCode: null,
    periodKind: "MONTH",
    periodAnchorDay: 1,
  };

  it("devuelve las llaves de período DISTINTAS del rango, en orden", () => {
    const keys = enumeratePeriodKeys(monthly, "2026-01-15", "2026-03-10");
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("respeta el día-ancla (el mes arranca en el día configurado)", () => {
    const anchored: ShiftResolverCalendar = { ...monthly, periodAnchorDay: 26 };
    // 2026-01-25 cae en el período que arranca el 26-dic (2025-12); el 26-ene abre 2026-01.
    const keys = enumeratePeriodKeys(anchored, "2026-01-25", "2026-01-26");
    expect(keys).toEqual(["2025-12", "2026-01"]);
  });
});
