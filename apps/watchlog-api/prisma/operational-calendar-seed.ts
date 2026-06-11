/**
 * Calendario operacional de demo (SOLO desarrollo). Fuente única, idempotente por
 * `key`. Caso realista de minería: 3 turnos de 8 h que cubren 24 h, el día
 * operacional arranca en el turno A (07:00). El PERÍODO contable se desacopló al
 * calendario FISCAL en 2.7.1.1 (ver `DEMO_FISCAL_CALENDAR`).
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
  shifts: SeedShift[];
}

export const DEMO_CALENDAR: SeedCalendar = {
  key: "mina-rajo",
  name: "Mina Rajo (3 turnos)",
  description: "Operación 24/7: turnos A/B/C de 8 h. El día de producción arranca a las 07:00.",
  timezone: "America/Santiago",
  isDefault: true,
  dayStartShiftCode: "A",
  shifts: [
    { code: "A", label: "Mañana", startTime: "07:00", durationMinutes: 480 },
    { code: "B", label: "Tarde", startTime: "15:00", durationMinutes: 480 },
    { code: "C", label: "Noche", startTime: "23:00", durationMinutes: 480 },
  ],
};

/**
 * Calendario FISCAL por defecto de demo (SOLO desarrollo). Transversal, mensual anclado
 * al día 1 (mismo período que usaba el calendario de turnos antes del desacople).
 */
export interface SeedFiscalCalendar {
  key: string;
  name: string;
  description: string;
  timezone: string;
  isDefault: boolean;
  periodKind: "MONTH" | "WEEK" | "CUSTOM";
  periodAnchorDay: number | null;
}

export const DEMO_FISCAL_CALENDAR: SeedFiscalCalendar = {
  key: "fiscal-default",
  name: "Calendario fiscal predeterminado (mensual)",
  description: "Período contable mensual anclado al día 1. Transversal a toda la organización.",
  timezone: "America/Santiago",
  isDefault: true,
  periodKind: "MONTH",
  periodAnchorDay: 1,
};
