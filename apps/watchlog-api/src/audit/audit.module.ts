import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/** Auditoría inmutable. Global: cualquier módulo puede registrar eventos. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
