import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { SmtpEmailService } from "./smtp-email.service";
import { EmailConfigService } from "./email-config.service";
import { EmailController } from "./email.controller";

/**
 * Correo saliente. Expone `EmailService` (abstracto) cableado a la implementación
 * SMTP, y `EmailConfigService` (config del transporte en BD, editable sin reiniciar).
 * Global para que cualquier módulo lo inyecte sin re-importar. La pantalla de
 * configuración (`/settings/email`) la sirve `EmailController` (permiso `notification:config`).
 * Cambiar de proveedor = registrar otra clase aquí, sin tocar a los consumidores.
 */
@Global()
@Module({
  controllers: [EmailController],
  providers: [
    EmailConfigService,
    SmtpEmailService,
    // El token abstracto resuelve a la MISMA instancia SMTP (useExisting) para que
    // el controller pueda inyectar SmtpEmailService (verify/sendWith) sin duplicar.
    { provide: EmailService, useExisting: SmtpEmailService },
  ],
  exports: [EmailService, EmailConfigService, SmtpEmailService],
})
export class EmailModule {}
