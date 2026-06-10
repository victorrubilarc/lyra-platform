import { describe, expect, it } from "vitest";
import {
  createOperationalCalendarRequestSchema,
  isoWeekdayOf,
  resolveShift,
  validateOperationalCalendar,
  type ShiftResolverCalendar,
} from "./operational-calendar.js";

/** Calendario minero 3×8h en UTC (para aislar la lógica de la conversión de TZ). */
const MINING_UTC: ShiftResolverCalendar = {
  timezone: "UTC",
  shifts: [
    { code: "A", label: "Mañana", startTime: "07:00", durationMinutes: 480 },
    { code: "B", label: "Tarde", startTime: "15:00", durationMinutes: 480 },
    { code: "C", label: "Noche", startTime: "23:00", durationMinutes: 480 },
  ],
  dayStartShiftCode: "A",
  periodKind: "MONTH",
  periodAnchorDay: 1,
};

describe("resolveShift — turno y día operacional", () => {
  it("resuelve un turno diurno simple (10:00 → A, mismo día)", () => {
    const r = resolveShift(new Date("2026-06-15T10:00:00Z"), MINING_UTC);
    expect(r.shiftCode).toBe("A");
    expect(r.operationalDate).toBe("2026-06-15");
    expect(r.periodKey).toBe("2026-06");
  });

  it("la madrugada (02:00) pertenece al día operacional ANTERIOR, turno noche", () => {
    const r = resolveShift(new Date("2026-06-15T02:00:00Z"), MINING_UTC);
    expect(r.shiftCode).toBe("C"); // turno C cruza medianoche (23:00→07:00)
    expect(r.operationalDate).toBe("2026-06-14");
    expect(r.shiftLabel).toBe("Noche");
  });

  it("el inicio exacto del turno ancla (07:00) abre un nuevo día operacional", () => {
    const r = resolveShift(new Date("2026-06-15T07:00:00Z"), MINING_UTC);
    expect(r.shiftCode).toBe("A");
    expect(r.operationalDate).toBe("2026-06-15");
  });

  it("un minuto antes del ancla (06:59) sigue en el día operacional anterior", () => {
    const r = resolveShift(new Date("2026-06-15T06:59:00Z"), MINING_UTC);
    expect(r.shiftCode).toBe("C");
    expect(r.operationalDate).toBe("2026-06-14");
  });

  it("las 23:30 caen en el turno noche del mismo día operacional", () => {
    const r = resolveShift(new Date("2026-06-15T23:30:00Z"), MINING_UTC);
    expect(r.shiftCode).toBe("C");
    expect(r.operationalDate).toBe("2026-06-15");
  });
});

describe("resolveShift — borde de turno semiabierto [inicio, fin)", () => {
  // Dos turnos 12 h contiguos: A 08:00–20:00, B 20:00–08:00.
  const TWELVE: ShiftResolverCalendar = {
    timezone: "UTC",
    shifts: [
      { code: "A", label: "Día", startTime: "08:00", durationMinutes: 720 },
      { code: "B", label: "Noche", startTime: "20:00", durationMinutes: 720 },
    ],
    dayStartShiftCode: "A",
    periodKind: "MONTH",
    periodAnchorDay: 1,
  };

  it("el instante EXACTO del cambio (20:00:00) pertenece al turno SIGUIENTE (B), sin solape", () => {
    expect(resolveShift(new Date("2026-06-15T20:00:00Z"), TWELVE).shiftCode).toBe("B");
  });

  it("un segundo antes (19:59:59) sigue en el turno anterior (A)", () => {
    expect(resolveShift(new Date("2026-06-15T19:59:59Z"), TWELVE).shiftCode).toBe("A");
  });

  it("el cambio del día (08:00:00) abre el turno A; 07:59:59 aún es B", () => {
    expect(resolveShift(new Date("2026-06-15T08:00:00Z"), TWELVE).shiftCode).toBe("A");
    expect(resolveShift(new Date("2026-06-15T07:59:59Z"), TWELVE).shiftCode).toBe("B");
  });

  it("dos turnos contiguos (fin = inicio del siguiente) NO se consideran solape", () => {
    expect(
      validateOperationalCalendar({
        timezone: "UTC",
        dayStartShiftCode: "A",
        periodKind: "MONTH",
        shifts: [
          { code: "A", startTime: "08:00", durationMinutes: 720 },
          { code: "B", startTime: "20:00", durationMinutes: 720 },
        ],
      }),
    ).toEqual([]);
  });
});

describe("resolveShift — borde de mes (el mes arranca en el cambio de turno)", () => {
  it("la madrugada del día 1 aún pertenece al mes anterior", () => {
    const r = resolveShift(new Date("2026-07-01T02:00:00Z"), MINING_UTC);
    expect(r.operationalDate).toBe("2026-06-30");
    expect(r.periodKey).toBe("2026-06");
  });

  it("el turno ancla del día 1 abre el nuevo mes contable", () => {
    const r = resolveShift(new Date("2026-07-01T08:00:00Z"), MINING_UTC);
    expect(r.operationalDate).toBe("2026-07-01");
    expect(r.periodKey).toBe("2026-07");
  });

  it("MONTH con día-ancla 26 (mes 26→25): el día 25 pertenece al periodo anterior", () => {
    const cal: ShiftResolverCalendar = { ...MINING_UTC, periodAnchorDay: 26 };
    expect(resolveShift(new Date("2026-06-25T10:00:00Z"), cal).periodKey).toBe("2026-05");
    expect(resolveShift(new Date("2026-06-26T10:00:00Z"), cal).periodKey).toBe("2026-06");
  });
});

describe("resolveShift — huecos (operación de turno único)", () => {
  const DAY_ONLY: ShiftResolverCalendar = {
    timezone: "UTC",
    shifts: [{ code: "D", label: "Día", startTime: "08:00", durationMinutes: 600 }], // 08:00–18:00
    dayStartShiftCode: "D",
    periodKind: "MONTH",
    periodAnchorDay: 1,
  };

  it("una lectura en horario de turno resuelve el turno", () => {
    const r = resolveShift(new Date("2026-06-15T12:00:00Z"), DAY_ONLY);
    expect(r.shiftCode).toBe("D");
    expect(r.operationalDate).toBe("2026-06-15");
  });

  it("una lectura en el hueco resuelve shiftCode=null pero conserva su día operacional", () => {
    const r = resolveShift(new Date("2026-06-15T03:00:00Z"), DAY_ONLY);
    expect(r.shiftCode).toBeNull();
    expect(r.shiftLabel).toBeNull();
    expect(r.operationalDate).toBe("2026-06-14"); // antes del ancla (08:00) → día anterior
  });
});

describe("resolveShift — sin turno ancla (día operacional = día civil)", () => {
  it("sin dayStartShiftCode, la madrugada queda en el mismo día civil", () => {
    const cal: ShiftResolverCalendar = { ...MINING_UTC, dayStartShiftCode: null };
    const r = resolveShift(new Date("2026-06-15T02:00:00Z"), cal);
    expect(r.operationalDate).toBe("2026-06-15");
    expect(r.shiftCode).toBe("C");
  });
});

describe("resolveShift — periodo WEEK", () => {
  const WEEKLY = (startWeekday: number): ShiftResolverCalendar => ({
    ...MINING_UTC,
    periodKind: "WEEK",
    periodStartWeekday: startWeekday,
  });

  it("la llave semanal es la fecha de inicio de semana (lunes por defecto)", () => {
    const r = resolveShift(new Date("2026-06-17T10:00:00Z"), WEEKLY(1));
    expect(isoWeekdayOf(r.periodKey!)).toBe(1); // arranca en lunes
  });

  it("dos lecturas de la misma semana comparten llave", () => {
    const cal = WEEKLY(1);
    const a = resolveShift(new Date("2026-06-16T10:00:00Z"), cal).periodKey;
    const b = resolveShift(new Date("2026-06-18T10:00:00Z"), cal).periodKey;
    expect(a).toBe(b);
  });

  it("respeta un día de inicio de semana configurable (domingo)", () => {
    const r = resolveShift(new Date("2026-06-17T10:00:00Z"), WEEKLY(7));
    expect(isoWeekdayOf(r.periodKey!)).toBe(7); // arranca en domingo
  });
});

describe("resolveShift — periodo CUSTOM (ciclo de N días)", () => {
  const FORTNIGHT: ShiftResolverCalendar = {
    ...MINING_UTC,
    periodKind: "CUSTOM",
    periodLengthDays: 14,
    periodAnchorDate: "2026-06-01",
  };

  it("el día ancla abre el ciclo", () => {
    expect(resolveShift(new Date("2026-06-01T10:00:00Z"), FORTNIGHT).periodKey).toBe("2026-06-01");
  });

  it("el último día del ciclo comparte llave con el inicio", () => {
    expect(resolveShift(new Date("2026-06-14T10:00:00Z"), FORTNIGHT).periodKey).toBe("2026-06-01");
  });

  it("el día siguiente arranca un ciclo nuevo", () => {
    expect(resolveShift(new Date("2026-06-15T10:00:00Z"), FORTNIGHT).periodKey).toBe("2026-06-15");
  });

  it("fechas anteriores al ancla retroceden ciclos completos", () => {
    expect(resolveShift(new Date("2026-05-31T10:00:00Z"), FORTNIGHT).periodKey).toBe("2026-05-18");
  });
});

describe("resolveShift — zona horaria y DST (America/Santiago)", () => {
  const SCL: ShiftResolverCalendar = { ...MINING_UTC, timezone: "America/Santiago" };

  it("invierno (UTC-4): 02:00 local pertenece al día operacional anterior, turno C", () => {
    // 2026-06-15 02:00 en Santiago (UTC-4) = 06:00Z.
    const r = resolveShift(new Date("2026-06-15T06:00:00Z"), SCL);
    expect(r.shiftCode).toBe("C");
    expect(r.operationalDate).toBe("2026-06-14");
  });

  it("verano (UTC-3): el límite de turno sigue siendo hora de pared (07:00 local = A)", () => {
    // 2026-01-15 07:30 en Santiago (UTC-3) = 10:30Z.
    const r = resolveShift(new Date("2026-01-15T10:30:00Z"), SCL);
    expect(r.shiftCode).toBe("A");
    expect(r.operationalDate).toBe("2026-01-15");
  });
});

describe("validateOperationalCalendar", () => {
  const valid = {
    timezone: "UTC",
    dayStartShiftCode: "A",
    periodKind: "MONTH" as const,
    periodAnchorDay: 1,
    shifts: [
      { code: "A", startTime: "07:00", durationMinutes: 480 },
      { code: "B", startTime: "15:00", durationMinutes: 480 },
      { code: "C", startTime: "23:00", durationMinutes: 480 },
    ],
  };

  it("acepta un calendario 24/7 válido", () => {
    expect(validateOperationalCalendar(valid)).toEqual([]);
  });

  it("permite huecos (un solo turno diurno es válido)", () => {
    expect(
      validateOperationalCalendar({
        timezone: "UTC",
        dayStartShiftCode: "D",
        periodKind: "MONTH",
        shifts: [{ code: "D", startTime: "08:00", durationMinutes: 600 }],
      }),
    ).toEqual([]);
  });

  it("rechaza turnos que se solapan", () => {
    const errors = validateOperationalCalendar({
      ...valid,
      shifts: [
        { code: "A", startTime: "07:00", durationMinutes: 480 }, // 07–15
        { code: "B", startTime: "14:00", durationMinutes: 480 }, // 14–22 (solapa 14–15)
      ],
    });
    expect(errors.some((e) => e.includes("solapan"))).toBe(true);
  });

  it("rechaza códigos de turno duplicados", () => {
    const errors = validateOperationalCalendar({
      ...valid,
      shifts: [
        { code: "A", startTime: "07:00", durationMinutes: 60 },
        { code: "A", startTime: "10:00", durationMinutes: 60 },
      ],
    });
    expect(errors.some((e) => e.includes("duplicado"))).toBe(true);
  });

  it("rechaza un turno ancla inexistente", () => {
    const errors = validateOperationalCalendar({ ...valid, dayStartShiftCode: "Z" });
    expect(errors.some((e) => e.includes("ancla"))).toBe(true);
  });

  it("rechaza una zona horaria inválida", () => {
    const errors = validateOperationalCalendar({ ...valid, timezone: "Mars/Olympus" });
    expect(errors.some((e) => e.includes("Zona horaria"))).toBe(true);
  });

  it("CUSTOM requiere largo de ciclo y fecha ancla", () => {
    const errors = validateOperationalCalendar({
      timezone: "UTC",
      dayStartShiftCode: "A",
      periodKind: "CUSTOM",
      shifts: [{ code: "A", startTime: "07:00", durationMinutes: 480 }],
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("createOperationalCalendarRequestSchema", () => {
  it("acepta un calendario válido completo", () => {
    const r = createOperationalCalendarRequestSchema.safeParse({
      key: "mina-rajo",
      name: "Mina Rajo",
      timezone: "America/Santiago",
      dayStartShiftCode: "A",
      periodKind: "MONTH",
      periodAnchorDay: 1,
      shifts: [
        { code: "A", label: "Mañana", startTime: "07:00", durationMinutes: 480 },
        { code: "B", label: "Tarde", startTime: "15:00", durationMinutes: 480 },
        { code: "C", label: "Noche", startTime: "23:00", durationMinutes: 480 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un key con mayúsculas", () => {
    expect(
      createOperationalCalendarRequestSchema.safeParse({
        key: "Mina Rajo",
        name: "x",
        timezone: "UTC",
        periodKind: "MONTH",
      }).success,
    ).toBe(false);
  });

  it("propaga los errores de validación cruzada (solape) como issues", () => {
    const r = createOperationalCalendarRequestSchema.safeParse({
      key: "mina-rajo",
      name: "Mina Rajo",
      timezone: "UTC",
      periodKind: "MONTH",
      shifts: [
        { code: "A", label: "M", startTime: "07:00", durationMinutes: 600 },
        { code: "B", label: "T", startTime: "12:00", durationMinutes: 600 },
      ],
    });
    expect(r.success).toBe(false);
  });
});
