/**
 * Abstracción de proveedores de autenticación. El MVP implementa solo el
 * proveedor local (email + contraseña Argon2id). OIDC/LDAP se enchufan en
 * fases posteriores registrando nuevos proveedores SIN tocar el orquestador
 * (AuthService) ni la emisión de sesiones/tokens, que son agnósticos.
 */
export interface AuthProvider {
  /** Identificador estable usado en AUTH_PROVIDERS (ej. "local", "oidc"). */
  readonly name: string;
}

/** Usuario mínimo que un proveedor de contraseña necesita para verificar. */
export interface UserCredentialRecord {
  id: string;
  passwordHash: string | null;
}

/**
 * Proveedor basado en contraseña. Verifica credenciales contra un usuario ya
 * cargado por el orquestador (que decide lockout, estado y MFA por separado).
 */
export interface PasswordAuthProvider extends AuthProvider {
  /** ¿La contraseña coincide con la del usuario? */
  verifyCredentials(user: UserCredentialRecord, password: string): Promise<boolean>;
  /**
   * Consume tiempo de CPU equivalente a un verify real cuando el usuario no
   * existe o no tiene contraseña local. Evita enumeración por timing.
   */
  burnTiming(password: string): Promise<void>;
}
