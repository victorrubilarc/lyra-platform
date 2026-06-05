import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Hashing de contraseñas con Argon2id (OWASP ASVS). Encapsula los parámetros de
 * coste y un verify "dummy" para que un login contra un usuario inexistente
 * tarde lo mismo que uno real (evita enumeración de usuarios por timing).
 */
@Injectable()
export class PasswordService {
  // Parámetros alineados con la guía de OWASP para Argon2id.
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  /**
   * Hash precomputado para el verify dummy. Se calcula de forma perezosa la
   * primera vez y se reutiliza; su único fin es consumir tiempo de CPU.
   */
  private dummyHash: string | null = null;

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  /** Verifica una contraseña contra su hash Argon2id. */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash malformado u otro error: tratar como no coincidente, sin filtrar.
      return false;
    }
  }

  /**
   * Ejecuta un verify "a la nada" para igualar el tiempo de respuesta cuando el
   * usuario no existe o no tiene contraseña local. Devuelve siempre false.
   */
  async verifyDummy(plain: string): Promise<boolean> {
    if (this.dummyHash === null) {
      this.dummyHash = await argon2.hash("dummy-password-for-timing", this.options);
    }
    return this.verify(this.dummyHash, plain);
  }
}
