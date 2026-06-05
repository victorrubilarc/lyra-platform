import { Global, Module } from "@nestjs/common";
import { PasswordService } from "./password.service";
import { EncryptionService } from "./encryption.service";

/**
 * Primitivas criptográficas compartidas (hashing de contraseñas, cifrado de
 * secretos en reposo, hashing de tokens). Global para inyectarlas sin reimportar.
 */
@Global()
@Module({
  providers: [PasswordService, EncryptionService],
  exports: [PasswordService, EncryptionService],
})
export class CryptoModule {}
