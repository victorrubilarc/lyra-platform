import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LicenseService } from "./license.service";

/**
 * Topes numéricos que la instalación puede medir desde adentro (L2b).
 * `maxInstallations` NO está: es un tope del EMISOR (se controla en el ledger
 * al emitir, LICENSING_PROCEDURE §3) — desde adentro no hay qué contar.
 */
export type EnforceableLimitKey = "maxNodes" | "maxNamedUsers";

/** Uso actual de los recursos gobernados por los topes (conteo VIVO). */
export interface LimitUsage {
  nodes: number;
  namedUsers: number;
}

/**
 * Enforcement de los límites numéricos de la licencia (Licenciamiento L2b,
 * LICENSING.md §5 fila LÍMITE EXCEDIDO). Lo llaman EXPLÍCITAMENTE los
 * servicios de creación (StructureService.createNode / provisionStructure,
 * UsersService.create / reactivación) — no es un guard HTTP a propósito: el
 * gate depende de datos del request y del estado previo (tamaño del lote,
 * ¿esta edición reactiva a un usuario?), no de metadata estática.
 *
 * Principios que hace cumplir:
 *  - Solo gobierna CREAR (y reactivar, que sube el conteo). Editar, borrar,
 *    leer y exportar lo existente JAMÁS pasan por aquí: una instalación que ya
 *    está sobre el tope (p. ej. tras un downgrade de edición) sigue operando
 *    con todo lo que tiene — la licencia nunca secuestra datos.
 *  - Precedencia: SIN payload verificado (PENDIENTE_ACTIVACION / BLOQUEADA)
 *    este chequeo NO opina — el guard global de L1 ya restringe toda mutación;
 *    un estado global no se enmascara como problema de límite.
 *  - Es OTRO punto de la verificación distribuida: cuenta FRESCO desde la BD
 *    en cada llamada (sin booleano cacheado) y es independiente del estado
 *    LIMITE_EXCEDIDO que `evaluateLicense` + los avisos de L6 calculan por su
 *    propia vía.
 */
@Injectable()
export class LicenseLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly license: LicenseService,
  ) {}

  /**
   * Conteo VIVO de los recursos gobernados (mismo criterio que
   * `LicenseService.collectActuals`): nodos con `deletedAt: null` de TODAS las
   * estructuras (el tope es de la INSTALACIÓN, no por estructura) y usuarios
   * ACTIVE (licencia named-user: el deshabilitado no consume cupo).
   */
  async currentUsage(): Promise<LimitUsage> {
    const [nodes, namedUsers] = await Promise.all([
      this.prisma.orgNode.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: "ACTIVE" } }),
    ]);
    return { nodes, namedUsers };
  }

  /**
   * Exige cupo para crear `requested` unidades más del recurso gobernado por
   * `limit`. Si `current + requested > max` ⇒ 403 con código legible por
   * máquina (`LICENSE_LIMIT_EXCEEDED` + limit/max/current/requested) para que
   * la web lo distinga del resto de 403 de licencia. Para lotes (p. ej. el
   * wizard de provisión) se llama UNA vez con el total ANTES de abrir la
   * transacción: o cabe el lote completo o no se crea nada.
   */
  async assertHeadroom(limit: EnforceableLimitKey, requested = 1): Promise<void> {
    const limits = this.license.verifiedLimits();
    if (limits === undefined) return;
    const max = limits[limit];
    const usage = await this.currentUsage();
    const current = limit === "maxNodes" ? usage.nodes : usage.namedUsers;
    if (current + requested <= max) return;

    const noun = limit === "maxNodes" ? "nodos de estructura" : "usuarios activos";
    const remedy =
      limit === "maxNodes"
        ? "elimina nodos que ya no uses"
        : "deshabilita usuarios que ya no uses";
    const available = Math.max(0, max - current);
    const batch =
      requested > 1
        ? ` La operación solicita ${requested} y ${available === 0 ? "no queda cupo" : `solo ${available === 1 ? "cabe 1" : `caben ${available}`}`}.`
        : "";
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "LICENSE_LIMIT_EXCEEDED",
      limit,
      max,
      current,
      requested,
      message:
        `La licencia de esta instalación permite hasta ${max} ${noun} y ya hay ${current} en uso.${batch} ` +
        `Todo lo existente sigue operando. Para crear más, contacta a tu proveedor para ampliar el plan, o ${remedy}.`,
    });
  }
}
