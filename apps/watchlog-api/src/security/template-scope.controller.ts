import { Controller, Get } from "@nestjs/common";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequireAnyPermission } from "../authz/authz.decorators";
import { TemplatesService } from "../templates/templates.service";

/**
 * Opciones para el selector de ALCANCE por plantilla (2.º eje ABAC, Fase 2.8).
 * Sirve tanto a la UI de usuarios como a la de roles, por eso se gatea con
 * cualquiera de los dos permisos de administración (OR) y NO con `template:view`
 * (asignar alcance no es administrar plantillas). Respeta el alcance de NODO del
 * admin que asigna (vía `TemplatesService.list`).
 */
@Controller("security/template-scope")
export class TemplateScopeController {
  constructor(private readonly templates: TemplatesService) {}

  @Get("options")
  @RequireAnyPermission("user:assign-scope", "role:manage")
  options(@CurrentUser() user: RequestUser) {
    return this.templates.listScopeOptions(user.id);
  }
}
