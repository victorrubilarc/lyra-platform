import { Injectable } from "@nestjs/common";
import { periodKeyForOperationalDate, type FiscalConfig } from "@lyra/contracts";
import type { FiscalCalendar } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Config de período de una fila de calendario fiscal (lo que consume la derivación). */
export function toFiscalConfig(cal: FiscalCalendar): FiscalConfig {
  return {
    periodKind: cal.periodKind,
    periodAnchorDay: cal.periodAnchorDay,
    periodStartWeekday: cal.periodStartWeekday,
    periodLengthDays: cal.periodLengthDays,
    periodAnchorDate: cal.periodAnchorDate,
  };
}

/** Resultado de resolver el período de un día operacional contra el calendario fiscal de un nodo. */
export interface FiscalResolution {
  fiscalCalendarId: string;
  fiscalCalendar: FiscalCalendar;
  periodKey: string;
}

/**
 * Resolver del eje PERÍODO (token DI abstracto, patrón `ShiftResolver`/`EmailService`).
 * Desacoplado del resolver de turnos (Fase 2.7.1.1): el calendario de turnos produce el
 * `operationalDate` (día de producción) y ESTE resolver lo mapea al `periodKey` del
 * calendario FISCAL que aplica al nodo. La separación honra que el período es transversal
 * (SAP company code / Maximo Organization / NetSuite subsidiaria), distinto del shift calendar.
 */
export abstract class FiscalResolver {
  /**
   * Mapea un día operacional ("YYYY-MM-DD") al período del calendario fiscal del nodo.
   * null si no hay día operacional (sin calendario de turnos), sin calendario fiscal, o
   * la config no permite derivar la llave (ungobernado: nunca bloquea).
   */
  abstract resolvePeriodKey(operationalDate: string | null, orgNodeId?: string | null): Promise<FiscalResolution | null>;

  /** Calendario fiscal que aplica a un nodo (o el por defecto). null si no hay ninguno. */
  abstract resolveFiscalCalendar(orgNodeId?: string | null): Promise<FiscalCalendar | null>;
}

@Injectable()
export class FiscalResolverService extends FiscalResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolvePeriodKey(operationalDate: string | null, orgNodeId?: string | null): Promise<FiscalResolution | null> {
    if (operationalDate == null) return null;
    const cal = await this.resolveFiscalCalendar(orgNodeId);
    if (!cal) return null;
    const periodKey = periodKeyForOperationalDate(operationalDate, toFiscalConfig(cal));
    if (periodKey == null) return null;
    return { fiscalCalendarId: cal.id, fiscalCalendar: cal, periodKey };
  }

  /**
   * Determina qué calendario fiscal aplica a un nodo: el asignado al propio nodo o al
   * ancestro más cercano que tenga uno (ruta materializada `path`); si ninguno, el por
   * defecto. Espejo exacto del path-walk de `ShiftResolver`, sobre `fiscalCalendarId`.
   */
  async resolveFiscalCalendar(orgNodeId?: string | null): Promise<FiscalCalendar | null> {
    let fiscalCalendarId: string | null = null;
    if (orgNodeId) {
      const node = await this.prisma.orgNode.findUnique({ where: { id: orgNodeId }, select: { path: true } });
      if (node?.path) {
        const ids = node.path.split("/").filter(Boolean);
        const assigned = await this.prisma.orgNode.findMany({
          where: { id: { in: ids }, fiscalCalendarId: { not: null }, deletedAt: null },
          select: { fiscalCalendarId: true, path: true },
        });
        if (assigned.length > 0) {
          assigned.sort((a, b) => a.path.length - b.path.length);
          fiscalCalendarId = assigned[assigned.length - 1]!.fiscalCalendarId;
        }
      }
    }
    if (fiscalCalendarId) {
      const cal = await this.prisma.fiscalCalendar.findFirst({
        where: { id: fiscalCalendarId, deletedAt: null, active: true },
      });
      if (cal) return cal;
    }
    return this.prisma.fiscalCalendar.findFirst({ where: { isDefault: true, deletedAt: null, active: true } });
  }
}
