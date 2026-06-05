import {
  changePasswordRequestSchema,
  loginResponseSchema,
  mfaChallengeRequestSchema,
  sessionInfoSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type MfaChallengeRequest,
  type SessionInfo,
} from "@lyra/contracts";
import { apiJson, apiVoid } from "../lib/api-client.js";
import { clearAccessToken, setAccessToken } from "../lib/session-token.js";

/**
 * Llamadas al módulo de autenticación (`/auth/*`). Donde el backend entrega un
 * access token, este módulo lo deposita en la custodia en memoria.
 */

/** Paso 1 del login: email + contraseña (+ TOTP si la cuenta ya lo exige). */
export async function login(dto: LoginRequest): Promise<LoginResponse> {
  const res = await apiJson("/auth/login", loginResponseSchema, { method: "POST", body: dto });
  if (res.result === "authenticated") setAccessToken(res.accessToken, res.expiresIn);
  return res;
}

/** Paso 2 del login cuando se exigió MFA: mfaToken + código TOTP/recovery. */
export async function completeMfaChallenge(dto: MfaChallengeRequest): Promise<LoginResponse> {
  mfaChallengeRequestSchema.parse(dto);
  const res = await apiJson("/auth/mfa/challenge", loginResponseSchema, {
    method: "POST",
    body: dto,
  });
  if (res.result === "authenticated") setAccessToken(res.accessToken, res.expiresIn);
  return res;
}

/** Perfil + permisos efectivos de la sesión vigente. */
export function fetchSession(): Promise<SessionInfo> {
  return apiJson("/auth/me", sessionInfoSchema);
}

/** Cierra la sesión en el backend (revoca el refresh) y limpia el token local. */
export async function logout(): Promise<void> {
  try {
    await apiVoid("/auth/logout", { method: "POST", csrf: true });
  } finally {
    clearAccessToken();
  }
}

/** Cambia la contraseña del propio usuario (incluye el cambio forzado). */
export function changePassword(dto: ChangePasswordRequest): Promise<void> {
  changePasswordRequestSchema.parse(dto);
  return apiVoid("/auth/change-password", { method: "POST", body: dto });
}
