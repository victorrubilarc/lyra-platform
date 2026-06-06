/** Usuario autenticado adjuntado a la request tras validar el access token. */
export interface RequestUser {
  id: string;
  email: string;
  /** Id de la sesión a la que pertenece el token (para revocación). */
  sessionId: string;
  /**
   * El rol del usuario exige MFA y aún no lo tiene activo: la sesión está
   * limitada al enrolamiento (lo hace cumplir `MfaEnrollmentGuard`). No degrada
   * el AAL: sin esto, operar solo con contraseña sería un downgrade.
   */
  mfaPending: boolean;
}

/** Claims del access token JWT. */
export interface AccessTokenClaims {
  sub: string; // userId
  email: string;
  sid: string; // sessionId
  /** Presente y true solo si la sesión está pendiente de enrolar MFA. */
  mfaPending?: boolean;
}
