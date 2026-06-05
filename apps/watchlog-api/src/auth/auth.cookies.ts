import type { FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";

/** Nombres de cookies y header CSRF usados por el flujo de auth. */
export const REFRESH_COOKIE = "wl_refresh";
export const CSRF_COOKIE = "wl_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Ruta a la que se limita la cookie de refresh (solo endpoints de auth). */
const AUTH_PATH = "/api/auth";

interface CookieOpts {
  secure: boolean;
  domain?: string;
  refreshTtlSeconds: number;
}

/**
 * Fija la cookie httpOnly del refresh token y la cookie CSRF (legible por el
 * SPA para el patrón de doble envío). Devuelve el token CSRF generado.
 */
export function setAuthCookies(reply: FastifyReply, refreshToken: string, opts: CookieOpts): string {
  const csrfToken = randomBytes(24).toString("base64url");

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "strict",
    path: AUTH_PATH,
    domain: opts.domain,
    maxAge: opts.refreshTtlSeconds,
  });

  // CSRF: NO httpOnly (el SPA debe leerla para reenviarla como header).
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: opts.secure,
    sameSite: "strict",
    path: "/",
    domain: opts.domain,
    maxAge: opts.refreshTtlSeconds,
  });

  return csrfToken;
}

/** Borra las cookies de auth (logout). */
export function clearAuthCookies(reply: FastifyReply, opts: { domain?: string }): void {
  reply.clearCookie(REFRESH_COOKIE, { path: AUTH_PATH, domain: opts.domain });
  reply.clearCookie(CSRF_COOKIE, { path: "/", domain: opts.domain });
}
