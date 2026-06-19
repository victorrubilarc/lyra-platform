import { describe, expect, it } from "vitest";
import type { ShiftResolverCalendar } from "../operational-calendar/operational-calendar.js";
import {
  buildDeterministicSummary,
  isHandoverItemOpen,
  resolveHandoverWindow,
  shiftHandoverCode,
  type HandoverCockpit,
} from "./shift-handover.js";

// Calendario de prueba: día 08:00–20:00 (A), noche 20:00–08:00 (B), TZ fija sin DST.
const CAL: ShiftResolverCalendar = {
  timezone: "America/Santiago",
  shifts: [
    { code: "A", label: "Turno Día", startTime: "08:00", durationMinutes: 720 },
    { code: "B", label: "Turno Noche", startTime: "20:00", durationMinutes: 720 },
  ],
  dayStartShiftCode: "A",
};

describe("shiftHandoverCode", () => {
  it("formatea el folio con padding", () => {
    expect(shiftHandoverCode(1)).toBe("SH-0001");
    expect(shiftHandoverCode(1234)).toBe("SH-1234");
  });
});

describe("resolveHandoverWindow", () => {
  it("resuelve el turno saliente, su ventana y el turno entrante (turno día)", () => {
    // 14:00 local Santiago ≈ 17:00Z (UTC-3 en invierno chileno; el helper resuelve DST).
    const at = new Date("2026-06-18T17:00:00Z");
    const w = resolveHandoverWindow(at, CAL);
    expect(w.shiftCode).toBe("A");
    expect(w.incomingShiftCode).toBe("B");
    expect(w.operationalDay).toBe("2026-06-18");
    // La ventana del turno A contiene al instante.
    expect(w.windowStart.getTime()).toBeLessThanOrEqual(at.getTime());
    expect(w.windowEnd.getTime()).toBeGreaterThan(at.getTime());
    // Duración 12 h.
    expect(w.windowEnd.getTime() - w.windowStart.getTime()).toBe(12 * 60 * 60 * 1000);
  });

  it("el turno entrante del nocturno es el diurno", () => {
    const at = new Date("2026-06-19T02:00:00Z"); // 22:00 local Santiago (UTC-4 invierno) ⇒ turno B
    const w = resolveHandoverWindow(at, CAL);
    expect(w.shiftCode).toBe("B");
    expect(w.incomingShiftCode).toBe("A");
  });

  it("sin turnos cae al día operacional completo", () => {
    const empty: ShiftResolverCalendar = { timezone: "America/Santiago", shifts: [], dayStartShiftCode: null };
    const w = resolveHandoverWindow(new Date("2026-06-18T17:00:00Z"), empty);
    expect(w.shiftCode).toBeNull();
    expect(w.incomingShiftCode).toBeNull();
    expect(w.windowEnd.getTime() - w.windowStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isHandoverItemOpen", () => {
  it("OPEN y CARRIED están abiertos; CLOSED no", () => {
    expect(isHandoverItemOpen("OPEN")).toBe(true);
    expect(isHandoverItemOpen("CARRIED")).toBe(true);
    expect(isHandoverItemOpen("CLOSED")).toBe(false);
  });
});

describe("buildDeterministicSummary", () => {
  const cockpit: HandoverCockpit = {
    scope: {
      orgNodeId: "n1",
      nodeName: "Molienda",
      shiftCode: "A",
      shiftLabel: "Turno Día",
      incomingShiftCode: "B",
      incomingShiftLabel: "Turno Noche",
      operationalDay: "2026-06-18",
      windowStart: "2026-06-18T11:00:00Z",
      windowEnd: "2026-06-18T23:00:00Z",
      timezone: "America/Santiago",
    },
    generatedAt: "2026-06-18T20:00:00Z",
    counts: {},
    entries: [
      { id: "e1", folio: "#1", templateName: "Ronda", status: "SEALED", byName: "Ana", at: "2026-06-18T12:00:00Z", severity: null },
    ],
    exceptions: [
      { id: "x1", kind: "critical", detail: "Temp 99°C", status: "OPEN", fieldLabel: "Temp", at: "2026-06-18T13:00:00Z", incidentId: null },
    ],
    incidents: [
      { id: "i1", folio: "INC-0001", title: "Fuga", typeName: "Falla", severity: 5, stateName: "Abierta", dueAt: null, critical: true, overdue: true },
    ],
    followups: [
      { id: "a1", kind: "ACTION", code: "ACT-0001", title: "Cambiar sello", incidentFolio: "INC-0001", incidentId: "i1", dueAt: null, status: "OPEN", overdue: true },
    ],
    rounds: [
      { id: "r1", name: "Ronda A", templateName: "Ronda", status: "OVERDUE", scheduledFor: "2026-06-18T12:00:00Z", dueAt: "2026-06-18T13:00:00Z" },
    ],
  };

  it("produce un brief con todas las secciones y los pendientes", () => {
    const txt = buildDeterministicSummary(cockpit, [{ title: "Reapriete pernos polín 14" }], {
      generalStatus: "OPERATIONAL_WITH_OBSERVATIONS",
    });
    expect(txt).toContain("Turno Día");
    expect(txt).toContain("Molienda");
    expect(txt).toContain("Operativo con observaciones");
    expect(txt).toContain("1 crítica(s)");
    expect(txt).toContain("plazo vencido");
    expect(txt).toContain("Reapriete pernos polín 14");
  });

  it("sin pendientes lo declara explícitamente", () => {
    const txt = buildDeterministicSummary({ ...cockpit, incidents: [] }, []);
    expect(txt).toContain("Sin pendientes adicionales");
    expect(txt).toContain("Sin incidencias activas");
  });
});
