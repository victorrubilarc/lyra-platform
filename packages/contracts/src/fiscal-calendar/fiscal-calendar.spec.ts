import { describe, expect, it } from "vitest";
import {
  createFiscalCalendarRequestSchema,
  enumeratePeriodKeys,
  enumeratePeriods,
  periodBoundsFor,
  periodKeyForOperationalDate,
  validateFiscalCalendar,
  type FiscalConfig,
} from "./fiscal-calendar.js";

const MONTHLY: FiscalConfig = { periodKind: "MONTH", periodAnchorDay: 1 };
const WEEKLY: FiscalConfig = { periodKind: "WEEK", periodStartWeekday: 1 };
const FORTNIGHT: FiscalConfig = { periodKind: "CUSTOM", periodLengthDays: 14, periodAnchorDate: "2026-06-01" };

describe("periodKeyForOperationalDate — MONTH", () => {
  it("nombra el período por el mes en que arranca", () => {
    expect(periodKeyForOperationalDate("2026-06-15", MONTHLY)).toBe("2026-06");
  });

  it("con día-ancla 26 (mes 26→25): el día 25 pertenece al período anterior", () => {
    const anchored: FiscalConfig = { periodKind: "MONTH", periodAnchorDay: 26 };
    expect(periodKeyForOperationalDate("2026-06-25", anchored)).toBe("2026-05");
    expect(periodKeyForOperationalDate("2026-06-26", anchored)).toBe("2026-06");
  });
});

describe("periodKeyForOperationalDate — WEEK", () => {
  it("la llave semanal es la fecha de inicio de semana (lunes por defecto)", () => {
    // 2026-06-17 es miércoles; el lunes de esa semana es 2026-06-15.
    expect(periodKeyForOperationalDate("2026-06-17", WEEKLY)).toBe("2026-06-15");
  });

  it("dos días de la misma semana comparten llave", () => {
    expect(periodKeyForOperationalDate("2026-06-16", WEEKLY)).toBe(periodKeyForOperationalDate("2026-06-18", WEEKLY));
  });

  it("respeta un día de inicio de semana configurable (domingo)", () => {
    const sunday: FiscalConfig = { periodKind: "WEEK", periodStartWeekday: 7 };
    // 2026-06-17 (mié) → domingo previo 2026-06-14.
    expect(periodKeyForOperationalDate("2026-06-17", sunday)).toBe("2026-06-14");
  });
});

describe("periodKeyForOperationalDate — CUSTOM (ciclo de N días)", () => {
  it("el día ancla abre el ciclo", () => {
    expect(periodKeyForOperationalDate("2026-06-01", FORTNIGHT)).toBe("2026-06-01");
  });

  it("el último día del ciclo comparte llave con el inicio", () => {
    expect(periodKeyForOperationalDate("2026-06-14", FORTNIGHT)).toBe("2026-06-01");
  });

  it("el día siguiente arranca un ciclo nuevo", () => {
    expect(periodKeyForOperationalDate("2026-06-15", FORTNIGHT)).toBe("2026-06-15");
  });

  it("fechas anteriores al ancla retroceden ciclos completos", () => {
    expect(periodKeyForOperationalDate("2026-05-31", FORTNIGHT)).toBe("2026-05-18");
  });

  it("config CUSTOM incompleta devuelve null", () => {
    expect(periodKeyForOperationalDate("2026-06-01", { periodKind: "CUSTOM" })).toBeNull();
  });
});

describe("periodBoundsFor — rango contiguo [inicio, fin)", () => {
  it("MONTH: fin exclusivo = inicio del mes siguiente", () => {
    expect(periodBoundsFor("2026-06-15", MONTHLY)).toEqual({
      periodKey: "2026-06",
      periodStart: "2026-06-01",
      periodEnd: "2026-07-01",
    });
  });

  it("WEEK: rango de 7 días", () => {
    expect(periodBoundsFor("2026-06-17", WEEKLY)).toEqual({
      periodKey: "2026-06-15",
      periodStart: "2026-06-15",
      periodEnd: "2026-06-22",
    });
  });

  it("CUSTOM: rango del largo del ciclo", () => {
    expect(periodBoundsFor("2026-06-10", FORTNIGHT)).toEqual({
      periodKey: "2026-06-01",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-15",
    });
  });
});

describe("periodBoundsFor — MONTH con meses de largo variable (28/29/30/31)", () => {
  // El período mensual NO es de 30 días: toma el largo real del mes, acotado por el
  // día-ancla del mes siguiente. El ancla ≤ 28 garantiza que el borde existe siempre.
  it("febrero NO bisiesto = 28 días (ancla 1)", () => {
    expect(periodBoundsFor("2026-02-15", MONTHLY)).toEqual({
      periodKey: "2026-02",
      periodStart: "2026-02-01",
      periodEnd: "2026-03-01", // exclusivo → último día inclusive = 28-feb
    });
  });

  it("febrero BISIESTO = 29 días (ancla 1, 2028)", () => {
    expect(periodBoundsFor("2028-02-15", MONTHLY)).toEqual({
      periodKey: "2028-02",
      periodStart: "2028-02-01",
      periodEnd: "2028-03-01", // último día inclusive = 29-feb
    });
  });

  it("meses de 31 y 30 días conservan su largo real", () => {
    expect(periodBoundsFor("2026-01-10", MONTHLY).periodEnd).toBe("2026-02-01"); // enero 31 días
    expect(periodBoundsFor("2026-04-10", MONTHLY).periodEnd).toBe("2026-05-01"); // abril 30 días
  });

  it("ancla 28: el período cruza el fin de mes corto sin perder días", () => {
    const anchored: FiscalConfig = { periodKind: "MONTH", periodAnchorDay: 28 };
    // El 27-feb pertenece al período que arrancó el 28-ene.
    expect(periodBoundsFor("2026-02-27", anchored)).toEqual({
      periodKey: "2026-01",
      periodStart: "2026-01-28",
      periodEnd: "2026-02-28",
    });
    // El 28-feb abre el período de febrero (28-feb → 28-mar).
    expect(periodBoundsFor("2026-02-28", anchored)).toEqual({
      periodKey: "2026-02",
      periodStart: "2026-02-28",
      periodEnd: "2026-03-28",
    });
  });

  it("cobertura contigua sin huecos cruzando febrero", () => {
    const periods = enumeratePeriods(MONTHLY, "2026-01-15", "2026-03-10");
    expect(periods.map((p) => p.periodKey)).toEqual(["2026-01", "2026-02", "2026-03"]);
    // El fin de enero = inicio de febrero, y fin de febrero = inicio de marzo (sin huecos).
    expect(periods[0]!.periodEnd).toBe(periods[1]!.periodStart);
    expect(periods[1]!.periodEnd).toBe(periods[2]!.periodStart);
    expect(periods[1]!.periodStart).toBe("2026-02-01");
    expect(periods[2]!.periodStart).toBe("2026-03-01");
  });
});

describe("enumeratePeriods — contigüidad", () => {
  it("devuelve períodos contiguos sin huecos (fin de uno = inicio del siguiente)", () => {
    const periods = enumeratePeriods(MONTHLY, "2026-01-15", "2026-03-10");
    expect(periods.map((p) => p.periodKey)).toEqual(["2026-01", "2026-02", "2026-03"]);
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i]!.periodStart).toBe(periods[i - 1]!.periodEnd);
    }
  });

  it("incluye períodos de borde completos (anclados al día-ancla)", () => {
    const anchored: FiscalConfig = { periodKind: "MONTH", periodAnchorDay: 26 };
    const periods = enumeratePeriods(anchored, "2026-01-25", "2026-01-26");
    expect(periods.map((p) => p.periodKey)).toEqual(["2025-12", "2026-01"]);
    expect(periods[0]!.periodStart).toBe("2025-12-26");
    expect(periods[0]!.periodEnd).toBe("2026-01-26");
  });

  it("enumeratePeriodKeys deriva las llaves de enumeratePeriods", () => {
    expect(enumeratePeriodKeys(MONTHLY, "2026-01-15", "2026-03-10")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("validateFiscalCalendar", () => {
  it("acepta config MONTH válida", () => {
    expect(validateFiscalCalendar(MONTHLY)).toEqual([]);
  });

  it("rechaza día-ancla mensual fuera de 1..28", () => {
    expect(validateFiscalCalendar({ periodKind: "MONTH", periodAnchorDay: 31 }).length).toBeGreaterThan(0);
  });

  it("CUSTOM requiere largo de ciclo y fecha ancla", () => {
    expect(validateFiscalCalendar({ periodKind: "CUSTOM" }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("createFiscalCalendarRequestSchema", () => {
  it("acepta un calendario fiscal mensual válido", () => {
    const r = createFiscalCalendarRequestSchema.safeParse({
      key: "fiscal-mensual",
      name: "Fiscal Mensual",
      timezone: "America/Santiago",
      periodKind: "MONTH",
      periodAnchorDay: 1,
      requirePeriod: false,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza TZ inválida", () => {
    expect(
      createFiscalCalendarRequestSchema.safeParse({
        key: "x",
        name: "x",
        timezone: "Mars/Olympus",
        periodKind: "MONTH",
      }).success,
    ).toBe(false);
  });

  it("rechaza key con mayúsculas", () => {
    expect(
      createFiscalCalendarRequestSchema.safeParse({
        key: "Fiscal",
        name: "x",
        timezone: "UTC",
        periodKind: "MONTH",
      }).success,
    ).toBe(false);
  });
});
