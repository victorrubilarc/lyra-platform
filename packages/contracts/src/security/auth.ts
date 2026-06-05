import { z } from "zod";

/**
 * Contratos de autenticación compartidos entre la API y la Web.
 * La validación se aplica SIEMPRE en el backend; el frontend reusa estos
 * mismos esquemas para feedback inmediato (no como fuente de verdad).
 */

/** Email normalizado: recortado y en minúsculas. */
export const emailSchema = z.string().trim().toLowerCase().email("Email inválido");

/** Código TOTP de 6 dígitos (o recovery code alfanumérico). */
export const totpCodeSchema = z
  .string()
  .trim()
  .min(6, "El código debe tener al menos 6 caracteres")
  .max(16, "Código demasiado largo");

/** Credenciales de login local. El segundo factor es opcional en el primer paso. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
  /** Código de segundo factor (TOTP o recovery), si la cuenta tiene MFA activo. */
  totp: totpCodeSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Resumen del usuario autenticado que consume la UI. */
export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  mfaEnabled: z.boolean(),
  /** Obliga a cambiar la contraseña antes de operar (admin de arranque, reset). */
  forcePasswordChange: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * Alcance de datos efectivo del usuario (dimensión 4, ABAC).
 * `null` = sin restricción (acceso a toda la estructura). Un arreglo = limitado
 * a esos nodos (ya expandidos con descendientes por el backend).
 */
export const effectiveScopeSchema = z.object({
  orgNodeIds: z.array(z.string()).nullable(),
});
export type EffectiveScope = z.infer<typeof effectiveScopeSchema>;

/**
 * Respuesta de `/auth/me` y del login exitoso: perfil + permisos efectivos +
 * alcance + el access token (que el front guarda EN MEMORIA, nunca en disco).
 * El refresh token NO viaja aquí: va en cookie httpOnly.
 */
export const sessionInfoSchema = z.object({
  user: authUserSchema,
  /** Claves de permiso efectivas (unión de los roles). La UI solo oculta con esto. */
  permissions: z.array(z.string()),
  scope: effectiveScopeSchema,
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** Respuesta del login: o bien sesión iniciada, o bien se exige segundo factor. */
export const loginResponseSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.literal("authenticated"),
    accessToken: z.string(),
    /** Vida del access token en segundos (para programar el refresh en el front). */
    expiresIn: z.number().int().positive(),
    session: sessionInfoSchema,
  }),
  z.object({
    result: z.literal("mfa_required"),
    /** Challenge corto que el front reenvía junto al TOTP para completar el login. */
    mfaToken: z.string(),
  }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Segundo paso del login cuando se exigió MFA. */
export const mfaChallengeRequestSchema = z.object({
  mfaToken: z.string().min(1),
  totp: totpCodeSchema,
});
export type MfaChallengeRequest = z.infer<typeof mfaChallengeRequestSchema>;

/** Respuesta de `/auth/refresh`: nuevo access token (el refresh rota vía cookie). */
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// --- MFA / TOTP (enrolamiento) ---

/** Inicio de enrolamiento MFA: el backend devuelve el secreto y el URI otpauth. */
export const mfaSetupResponseSchema = z.object({
  /** Secreto en base32 para mostrar manualmente. */
  secret: z.string(),
  /** URI `otpauth://` para generar el QR en el cliente. */
  otpauthUrl: z.string(),
});
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

/** Confirmación del enrolamiento: el usuario prueba un código del autenticador. */
export const mfaVerifyRequestSchema = z.object({
  totp: totpCodeSchema,
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

/** Al activar MFA se entregan códigos de recuperación de un solo uso. */
export const mfaActivatedResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type MfaActivatedResponse = z.infer<typeof mfaActivatedResponseSchema>;

/** Desactivar MFA exige reconfirmar la contraseña. */
export const mfaDisableRequestSchema = z.object({
  password: z.string().min(1),
});
export type MfaDisableRequest = z.infer<typeof mfaDisableRequestSchema>;

/** Cambio de contraseña del propio usuario. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
