import { Module } from "@nestjs/common";
import { FolioService } from "./folio.service";

/**
 * Motor de folio gapless (fork W4). Sin controller: es un servicio de dominio que
 * los módulos consumidores (OT hoy; plantillas después) importan y ejecutan DENTRO
 * de sus propias transacciones. Prisma llega por el módulo global.
 */
@Module({
  providers: [FolioService],
  exports: [FolioService],
})
export class FolioModule {}
