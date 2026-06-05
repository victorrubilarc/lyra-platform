/** Usuario autenticado adjuntado a la request tras validar el access token. */
export interface RequestUser {
  id: string;
  email: string;
  /** Id de la sesión a la que pertenece el token (para revocación). */
  sessionId: string;
}

/** Claims del access token JWT. */
export interface AccessTokenClaims {
  sub: string; // userId
  email: string;
  sid: string; // sessionId
}
