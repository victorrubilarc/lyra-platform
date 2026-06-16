import { describe, it, expect } from "vitest";
import {
  enumerateOccurrences,
  recurrenceConfigSchemaFor,
  createLogScheduleRequestSchema,
  type EnumerableShift,
} from "./schedules.js";

const TZ = "America/Santiago"; // UTC-4 en invierno austral (junio), UTC-3 en verano
const SHIFTS: EnumerableShift[] = [
  { code: "A", startTime: "08:00", durationMinutes: 720 }, // 08:00–20:00
  { code: "B", startTime: "20:00", durationMinutes: 720 }, // 20:00–08:00 (cruza medianoche)
];

describe("enumerateOccurrences · SHIFT", () => {
  it("emite el inicio de cada turno por día, incluido el que cruza medianoche", () => {
    // 2026-06-15 es invierno austral ⇒ UTC-4. A=08:00 local = 12:00Z; B=20:00 = 00:00Z (día sig.)
    const from = new Date("2026-06-15T00:00:00Z");
    const to = new Date("2026-06-16T00:00:00Z");
    const slots = enumerateOccurrences(
      { kind: "SHIFT", config: {}, dueWindowMinutes: 720, timezone: TZ, shifts: SHIFTS },
      from,
      to,
    );
    const iso = slots.map((s) => s.scheduledFor.toISOString());
    // En [00:00Z, 24:00Z) caen: B del 14 (00:00Z), A del 15 (12:00Z). (B del 15 = 00:00Z del 16, fuera.)
    expect(iso).toContain("2026-06-15T12:00:00.000Z");
    expect(iso).toContain("2026-06-15T00:00:00.000Z");
    expect(slots.every((s) => s.dueAt.getTime() - s.scheduledFor.getTime() === 720 * 60_000)).toBe(true);
  });

  it("filtra por shiftCodes", () => {
    const slots = enumerateOccurrences(
      { kind: "SHIFT", config: { shiftCodes: ["A"] }, dueWindowMinutes: 60, timezone: TZ, shifts: SHIFTS },
      new Date("2026-06-15T00:00:00Z"),
      new Date("2026-06-18T00:00:00Z"),
    );
    expect(slots.length).toBe(3); // A de los días 15, 16, 17
    expect(slots.every((s) => s.shiftCode === "A")).toBe(true);
  });
});

describe("enumerateOccurrences · INTERVAL", () => {
  it("emite cada everyMinutes desde el ancla, dentro del rango", () => {
    const slots = enumerateOccurrences(
      { kind: "INTERVAL", config: { everyMinutes: 360, anchorTime: "00:00" }, dueWindowMinutes: 360, timezone: TZ },
      new Date("2026-06-15T04:00:00Z"),
      new Date("2026-06-16T04:00:00Z"),
    );
    // 00:00 local = 04:00Z (UTC-4). cada 6h: 04:00,10:00,16:00,22:00Z,... 24h ⇒ 4 slots.
    expect(slots.length).toBe(4);
    expect(slots[0]!.scheduledFor.toISOString()).toBe("2026-06-15T04:00:00.000Z");
    expect(slots[1]!.scheduledFor.toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(slots.every((s) => s.shiftCode === null)).toBe(true);
  });
});

describe("enumerateOccurrences · CALENDAR", () => {
  it("emite las horas dadas solo en los weekdays seleccionados", () => {
    // 2026-06-15 = lunes (ISO 1). Pedimos solo lunes (1) y miércoles (3) a las 08:00.
    const slots = enumerateOccurrences(
      { kind: "CALENDAR", config: { times: ["08:00"], weekdays: [1, 3] }, dueWindowMinutes: 120, timezone: TZ },
      new Date("2026-06-15T00:00:00Z"),
      new Date("2026-06-21T00:00:00Z"), // lun 15 .. dom 21
    );
    // lun 15 y mié 17 ⇒ 2 slots, ambos a las 08:00 local = 12:00Z.
    expect(slots.length).toBe(2);
    expect(slots.map((s) => s.scheduledFor.toISOString())).toEqual([
      "2026-06-15T12:00:00.000Z",
      "2026-06-17T12:00:00.000Z",
    ]);
  });

  it("respeta daysOfMonth", () => {
    const slots = enumerateOccurrences(
      { kind: "CALENDAR", config: { times: ["12:00"], daysOfMonth: [1, 15] }, dueWindowMinutes: 60, timezone: TZ },
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(slots.length).toBe(2); // 1 y 15 de junio
  });
});

describe("enumerateOccurrences · bordes", () => {
  it("NONE no genera nada", () => {
    expect(enumerateOccurrences({ kind: "NONE", config: {}, dueWindowMinutes: 60, timezone: TZ }, new Date(0), new Date(1e12))).toEqual([]);
  });
  it("rango vacío/invertido no genera nada", () => {
    const at = new Date("2026-06-15T00:00:00Z");
    expect(enumerateOccurrences({ kind: "SHIFT", config: {}, dueWindowMinutes: 60, timezone: TZ, shifts: SHIFTS }, at, at)).toEqual([]);
  });
});

describe("validación de config por kind", () => {
  it("SHIFT acepta config vacía y rechaza claves extra", () => {
    expect(recurrenceConfigSchemaFor("SHIFT").safeParse({}).success).toBe(true);
    expect(recurrenceConfigSchemaFor("SHIFT").safeParse({ bogus: 1 }).success).toBe(false);
  });
  it("INTERVAL exige everyMinutes en rango", () => {
    expect(recurrenceConfigSchemaFor("INTERVAL").safeParse({ everyMinutes: 60 }).success).toBe(true);
    expect(recurrenceConfigSchemaFor("INTERVAL").safeParse({ everyMinutes: 1 }).success).toBe(false);
  });
  it("createLogScheduleRequest rechaza NONE y config que no calza con el kind", () => {
    const base = { templateId: "t1", orgNodeId: "n1", dueWindowMinutes: 720 };
    expect(createLogScheduleRequestSchema.safeParse({ ...base, recurrenceKind: "NONE", recurrenceConfig: {} }).success).toBe(false);
    expect(createLogScheduleRequestSchema.safeParse({ ...base, recurrenceKind: "INTERVAL", recurrenceConfig: {} }).success).toBe(false);
    expect(
      createLogScheduleRequestSchema.safeParse({ ...base, recurrenceKind: "SHIFT", recurrenceConfig: { shiftCodes: ["A"] } }).success,
    ).toBe(true);
  });
});
