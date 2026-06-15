import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { MinioStorageService } from "./minio-storage.service";

/**
 * Almacenamiento de objetos (evidencia/adjuntos, Ola 3). Expone `StorageService`
 * (abstracto) cableado a la implementación MinIO. Global para que cualquier módulo
 * lo inyecte sin re-importar. Cambiar de backend = registrar otra clase aquí, sin
 * tocar a los consumidores. Mismo patrón que `EmailModule`.
 */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: MinioStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
