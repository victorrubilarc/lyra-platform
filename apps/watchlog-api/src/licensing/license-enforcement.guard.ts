import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { LicenseService } from "./license.service";
import { PENDING_ACTIVATION, RESTRICTED_STATUSES } from "./license-runtime";

/**
 * Métodos que NUNCA se bloquean por licencia: lectura y exportación quedan
 * garantizadas en cualquier estado (la licencia jamás secuestra datos —
 * LICENSING.md §5). Toda exportación del producto es GET (acta PDF, presigned
 * de adjuntos, export de auditoría), así que no necesita casos especiales.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Lista blanca EXPLÍCITA de rutas cuyas mutaciones (POST) siguen permitidas en
 * estado restringido — sin ellas ni siquiera se podría LEER:
 *  - /api/auth/* : login, refresh, logout, cambio de contraseña, MFA,
 *    forgot/reset. Son operaciones de SEGURIDAD del usuario, no operación de
 *    planta; bloquearlas dejaría fuera hasta al administrador que debe
 *    importar la licencia nueva.
 *  - /api/health : monitoreo (GET, incluido por claridad).
 * Nada de regex: prefijos/rutas literales, testeados en license-enforcement.guard.spec.
 */
export const LICENSE_WHITELIST_PREFIXES: readonly string[] = ["/api/auth/"];
export const LICENSE_WHITELIST_EXACT: readonly string[] = ["/api/health"];

/**
 * Guard GLOBAL de la máquina de estados de licencia (L1). Corre DESPUÉS de los
 * guards de authz (un 401 sigue siendo 401; el estado de licencia no se filtra
 * a anónimos) y lee el snapshot CACHEADO (costo ~0 por request).
 *
 *  - SOLO_LECTURA / BLOQUEADA / PENDIENTE_ACTIVACION ⇒ se bloquean las
 *    MUTACIONES (POST/PUT/PATCH/DELETE) salvo la lista blanca; la lectura y
 *    la exportación pasan siempre.
 *  - EN_GRACIA / POR_VENCER / LIMITE_EXCEDIDO no bloquean aquí (se registran
 *    en la evaluación; el enforcement fino por recurso/módulo es L2).
 *
 * Este guard es UNO de los puntos de la verificación DISTRIBUIDA, no EL punto:
 * los workers de fondo hacen su propio chequeo independiente re-verificando la
 * firma desde disco (LicenseService.workersOperational).
 */
@Injectable()
export class LicenseEnforcementGuard implements CanActivate {
  constructor(private readonly license: LicenseService) {}

  canActivate(context: ExecutionContext): boolean {
    const status = this.license.getEvaluation().status;
    if (!RESTRICTED_STATUSES.has(status)) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (READ_METHODS.has(req.method)) return true;

    const path = req.url.split("?")[0] ?? "";
    if (LICENSE_WHITELIST_EXACT.includes(path)) return true;
    if (LICENSE_WHITELIST_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;

    // Cuerpo con código legible por máquina para que la web (L6) distinga y
    // presente cada estado; el mensaje ya es apto para mostrarse.
    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "LICENSE_RESTRICTED",
      licenseStatus: status,
      message:
        status === PENDING_ACTIVATION
          ? "Instalación pendiente de activación: importa el archivo de licencia para operar. " +
            "La consulta de datos está disponible."
          : "La licencia está vencida o inválida: la instalación quedó en solo lectura. " +
            "Los datos siguen disponibles para consulta y exportación; contacta a tu proveedor para renovar.",
    });
  }
}
