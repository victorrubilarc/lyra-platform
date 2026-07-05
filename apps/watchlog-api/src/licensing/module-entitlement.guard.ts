import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { CORE_MODULE_KEY, type LicensedModuleKey } from "@lyra/contracts";
import { LicenseService } from "./license.service";
import { READ_METHODS } from "./license-enforcement.guard";

/** Clave de metadata del módulo licenciable exigido por un controlador/handler. */
export const REQUIRED_MODULE_KEY = "requiredLicensedModule";

/**
 * Declara a qué MÓDULO LICENCIABLE pertenece un controlador (o un handler
 * puntual). El gate es de ENTITLEMENT (eje de la INSTALACIÓN: `modules[]` de
 * la licencia), distinto y ADICIONAL al RBAC del usuario (`@RequirePermission`)
 * — ambos guards corren y ambos deben pasar. Las claves salen del catálogo
 * canónico de `@lyra/contracts` (tipado: un string suelto no compila).
 */
export const RequireModule = (key: LicensedModuleKey): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_MODULE_KEY, key);

/**
 * Guard GLOBAL de entitlement por módulo (L2; 5.º guard, tras el de la máquina
 * de estados de L1). Con la licencia OPERATIVA pero un módulo fuera de
 * `modules[]` (ej. downgrade de edición no vencida):
 *
 *  - Se bloquean las MUTACIONES (POST/PUT/PATCH/DELETE) del módulo con
 *    `403 { code: "MODULE_NOT_LICENSED", module }`.
 *  - GET/HEAD/OPTIONS pasan SIEMPRE: la lectura y la exportación de los datos
 *    de un módulo no licenciado quedan garantizadas (la licencia JAMÁS
 *    secuestra datos — LICENSING.md §5, fila MÓDULO NO LICENCIADO).
 *  - `core` y los endpoints sin `@RequireModule` no se gatean nunca.
 *  - Sin payload VERIFICADO (PENDIENTE_ACTIVACION / BLOQUEADA por firma) este
 *    guard NO opina: el guard global de L1 ya restringe esas situaciones con
 *    su propio código (`LICENSE_RESTRICTED`) — así un estado global nunca se
 *    enmascara como problema de módulo.
 *
 * Lee el snapshot CACHEADO del LicenseService (costo ~0 por request) y es otro
 * punto de la verificación DISTRIBUIDA (no reemplaza al guard de L1 ni al
 * chequeo del worker).
 */
@Injectable()
export class ModuleEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly license: LicenseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const moduleKey = this.reflector.getAllAndOverride<LicensedModuleKey | undefined>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (moduleKey === undefined || moduleKey === CORE_MODULE_KEY) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (READ_METHODS.has(req.method)) return true;

    // Sin payload verificado no hay entitlement que evaluar: gobierna el guard
    // de estados de L1 (que ya bloqueó o bloqueará con LICENSE_RESTRICTED).
    if (this.license.getEvaluation().licensedModules === undefined) return true;

    if (this.license.isModuleLicensed(moduleKey)) return true;

    throw new ForbiddenException({
      statusCode: 403,
      error: "Forbidden",
      code: "MODULE_NOT_LICENSED",
      module: moduleKey,
      message:
        "Este módulo no está incluido en la licencia de la instalación. Sus datos siguen " +
        "disponibles para consulta y exportación; contacta a tu proveedor para ampliar la edición.",
    });
  }
}
