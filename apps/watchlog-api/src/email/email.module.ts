import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { SmtpEmailService } from "./smtp-email.service";

/**
 * Correo saliente. Expone `EmailService` (abstracto) cableado a la implementación
 * SMTP. Global para que cualquier módulo lo inyecte sin re-importar. Cambiar de
 * proveedor = registrar otra clase aquí, sin tocar a los consumidores.
 */
@Global()
@Module({
  providers: [{ provide: EmailService, useClass: SmtpEmailService }],
  exports: [EmailService],
})
export class EmailModule {}
