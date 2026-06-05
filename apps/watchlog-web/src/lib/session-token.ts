/**
 * Custodia del access token EN MEMORIA (nunca en localStorage/disco), según
 * docs/DECISIONS.md. Es un módulo plano (sin React) para que el cliente HTTP
 * lea el token sin acoplarse al árbol de componentes ni provocar ciclos.
 *
 * El refresh token vive en una cookie httpOnly que el navegador gestiona solo;
 * aquí únicamente guardamos el access token de vida corta y su expiración.
 */

let accessToken: string | null = null;
/** Epoch (ms) en que expira el access token actual; null si no hay sesión. */
let expiresAt: number | null = null;
/** Callback que dispara la app cuando la sesión deja de ser recuperable. */
let onSessionExpired: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getExpiresAt(): number | null {
  return expiresAt;
}

/** Fija el access token y calcula su expiración a partir de `expiresIn` (s). */
export function setAccessToken(token: string, expiresInSeconds: number): void {
  accessToken = token;
  expiresAt = Date.now() + expiresInSeconds * 1000;
}

/** Limpia el token en memoria (logout o refresh fallido). */
export function clearAccessToken(): void {
  accessToken = null;
  expiresAt = null;
}

/** Registra el handler que la app usa para reaccionar al cierre de sesión. */
export function setOnSessionExpired(cb: (() => void) | null): void {
  onSessionExpired = cb;
}

/** Marca la sesión como expirada: limpia el token y avisa a la app. */
export function notifySessionExpired(): void {
  clearAccessToken();
  onSessionExpired?.();
}
