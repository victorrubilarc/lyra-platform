import { describe, expect, it } from "vitest";
import {
  closePeriodRequestSchema,
  generatePeriodsRequestSchema,
  lockPeriodRequestSchema,
  periodStatusSchema,
  reopenPeriodRequestSchema,
  unlockPeriodRequestSchema,
  yearRange,
} from "./operational-periods.js";

describe("operational-periods contract", () => {
  it("acepta los cuatro estados de gobernanza (CLOSING deprecado, retenido para parseo)", () => {
    expect(periodStatusSchema.safeParse("OPEN").success).toBe(true);
    expect(periodStatusSchema.safeParse("CLOSED").success).toBe(true);
    expect(periodStatusSchema.safeParse("LOCKED").success).toBe(true);
    expect(periodStatusSchema.safeParse("CLOSING").success).toBe(true);
    expect(periodStatusSchema.safeParse("FROZEN").success).toBe(false);
  });

  it("cerrar exige motivo de longitud mínima", () => {
    expect(closePeriodRequestSchema.safeParse({ reason: "Cierre contable mensual" }).success).toBe(true);
    expect(closePeriodRequestSchema.safeParse({ reason: "no" }).success).toBe(false);
  });

  it("lock/unlock exigen motivo", () => {
    expect(lockPeriodRequestSchema.safeParse({ reason: "Bloqueo definitivo del período" }).success).toBe(true);
    expect(lockPeriodRequestSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(unlockPeriodRequestSchema.safeParse({ reason: "Reapertura autorizada por gerencia" }).success).toBe(true);
  });

  it("reabrir exige motivo y acepta el acuse de posteriores cerrados", () => {
    expect(reopenPeriodRequestSchema.safeParse({ reason: "Ajuste posterior autorizado" }).success).toBe(true);
    expect(
      reopenPeriodRequestSchema.safeParse({ reason: "Ajuste posterior autorizado", acknowledgeLaterClosed: true })
        .success,
    ).toBe(true);
    expect(reopenPeriodRequestSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("generar exige un año válido", () => {
    expect(generatePeriodsRequestSchema.safeParse({ year: 2026 }).success).toBe(true);
    expect(generatePeriodsRequestSchema.safeParse({ year: 1999 }).success).toBe(false);
  });

  it("yearRange produce el rango civil del año", () => {
    expect(yearRange(2026)).toEqual({ fromDate: "2026-01-01", toDate: "2026-12-31" });
  });
});
