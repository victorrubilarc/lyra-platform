import { Injectable } from "@nestjs/common";
import { PasswordService } from "../../crypto/password.service";
import type {
  PasswordAuthProvider,
  UserCredentialRecord,
} from "./auth-provider";

/** Proveedor de autenticación local: email + contraseña Argon2id. */
@Injectable()
export class LocalAuthProvider implements PasswordAuthProvider {
  readonly name = "local";

  constructor(private readonly passwords: PasswordService) {}

  async verifyCredentials(user: UserCredentialRecord, password: string): Promise<boolean> {
    if (!user.passwordHash) {
      // Usuario sin contraseña local (solo-OIDC futuro): igualar timing y fallar.
      await this.passwords.verifyDummy(password);
      return false;
    }
    return this.passwords.verify(user.passwordHash, password);
  }

  async burnTiming(password: string): Promise<void> {
    await this.passwords.verifyDummy(password);
  }
}
