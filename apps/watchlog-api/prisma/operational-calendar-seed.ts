/**
 * Calendario operacional de demo (SOLO desarrollo). Fuente única, idempotente por
 * `key`. Caso realista de minería: 3 turnos de 8 h que cubren 24 h, el día
 * operacional arranca en el turno A (07:00) y el periodo es mensual anclado al día 1.
 */
export interface SeedShift {
  code: string;
  label: string;
  startTime: string;
  durationMinutes: number;
}

export interface SeedCalendar {
  key: string;
  name: string;
  description: string;
  timezone: string;
  isDefault: boolean;
  dayStartShiftCode: string;
  periodKind: "MONTH" | "WEEK" | "CUSTOM";
  periodAnchorDay: number | null;
  shifts: SeedShift[];
}

export const DEMO_CALENDAR: SeedCalendar = {
  key: "mina-rajo",
  name: "Mina Rajo (3 turnos)",
  description: "Operación 24/7: turnos A/B/C de 8 h. El día de producción arranca a las 07:00.",
  timezone: "America/Santiago",
  isDefault: true,
  dayStartShiftCode: "A",
  periodKind: "MONTH",
  periodAnchorDay: 1,
  shifts: [
    { code: "A", label: "Mañana", startTime: "07:00", durationMinutes: 480 },
    { code: "B", label: "Tarde", startTime: "15:00", durationMinutes: 480 },
    { code: "C", label: "Noche", startTime: "23:00", durationMinutes: 480 },
  ],
};
