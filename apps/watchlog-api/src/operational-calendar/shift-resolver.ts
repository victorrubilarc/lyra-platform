import { Injectable } from "@nestjs/common";
import { resolveShift, type ShiftResolution } from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { toResolverCalendar } from "./operational-calendar.service";

/**
 * Interfaz abstracta del resolver de turnos (token DI, patrón `EmailService`/
 * `LlmProvider`). El resto de la plataforma depende de esta clase, nunca de la
 * implementación concreta. Es la pieza CRÍTICA que consumirán 2.4 (estampa
 * `operationalDate`/`shiftCode`/`periodKey` en `LogEntry`), 2.3 Rondas (programa por
 * turno) y Fase 5 (cambio de turno).
 *
 * La lógica de cálculo vive en la función pura `resolveShift` de `@lyra/contracts`
 * (testeada exhaustivamente, sin BD); este servicio solo RESUELVE qué calendario
 * aplica (por nodo, heredando por la ruta materializada; si no, el por defecto) y
 * delega.
 */
/** Resolución de turno junto con el calendario que la produjo (para la guarda de período). */
export interface ShiftResolutionWithCalendar {
  calendarId: string;
  resolution: ShiftResolution;
}

export abstract class ShiftResolver {
  /**
   * Resuelve un instante a sus dimensiones operacionales usando el calendario que
   * aplica al nodo dado (o el por defecto). null si no hay ningún calendario
   * configurado (degradación elegante: la entrada queda sin clasificar).
   */
  abstract resolve(at: Date, orgNodeId?: string | null): Promise<ShiftResolution | null>;

  /**
   * Igual que `resolve`, pero devuelve también el `calendarId` que aplicó. Lo usa la
   * gobernanza de períodos (Fase 2.7.1): el período se identifica por (calendario ×
   * periodKey), así que la guarda necesita saber qué calendario resolvió la fecha.
   */
  abstract resolveWithCalendar(at: Date, orgNodeId?: string | null): Promise<ShiftResolutionWithCalendar | null>;
}

@Injectable()
export class ShiftResolverService extends ShiftResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolve(at: Date, orgNodeId?: string | null): Promise<ShiftResolution | null> {
    const r = await this.resolveWithCalendar(at, orgNodeId);
    return r?.resolution ?? null;
  }

  async resolveWithCalendar(at: Date, orgNodeId?: string | null): Promise<ShiftResolutionWithCalendar | null> {
    const calendarId = await this.calendarIdForNode(orgNodeId);
    if (!calendarId) return null;
    const cal = await this.prisma.operationalCalendar.findFirst({
      where: { id: calendarId, deletedAt: null, active: true },
      include: { shifts: true },
    });
    if (!cal) return null;
    return { calendarId: cal.id, resolution: resolveShift(at, toResolverCalendar(cal)) };
  }

  /**
   * Determina qué calendario aplica a un nodo: el asignado al propio nodo o al
   * ancestro más cercano que tenga uno (usa la ruta materializada `path`); si
   * ninguno, el calendario por defecto.
   */
  private async calendarIdForNode(orgNodeId?: string | null): Promise<string | null> {
    if (orgNodeId) {
      const node = await this.prisma.orgNode.findUnique({ where: { id: orgNodeId }, select: { path: true } });
      if (node?.path) {
        // path = "/<id>/<id>/.../" (raíz → … → self). El nodo más profundo con
        // calendario asignado gana (el de path más largo).
        const ids = node.path.split("/").filter(Boolean);
        const assigned = await this.prisma.orgNode.findMany({
          where: { id: { in: ids }, operationalCalendarId: { not: null }, deletedAt: null },
          select: { operationalCalendarId: true, path: true },
        });
        if (assigned.length > 0) {
          assigned.sort((a, b) => a.path.length - b.path.length);
          return assigned[assigned.length - 1]!.operationalCalendarId;
        }
      }
    }
    const def = await this.prisma.operationalCalendar.findFirst({
      where: { isDefault: true, deletedAt: null, active: true },
      select: { id: true },
    });
    return def?.id ?? null;
  }
}
