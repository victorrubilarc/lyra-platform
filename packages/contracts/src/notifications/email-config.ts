import { z } from "zod";

/**
 * Configuración del CORREO SALIENTE (SMTP) — Bloque N (hardening). Se persiste en
 * BD (`SystemSettings`), con el `.env` como fallback de arranque, y se administra
 * desde `/configuracion` (tab "Correo saliente", permiso `notification:config`). La
 * **contraseña SMTP es write-only**: nunca vuelve a la UI (solo `passwordSet`); se
 * guarda CIFRADA en reposo. Fuente única back↔front.
 */

/** Config PÚBLICA (la que ve la UI): sin la contraseña, con indicadores de estado. */
export const emailConfigSchema = z.object({
  enabled: z.boolean(),
  /** Atajo well-known de nodemailer (gmail/outlook365/…); vacío = SMTP manual host/port. */
  service: z.string(),
  host: z.string(),
  port: z.number().int(),
  secure: z.boolean(),
  user: z.string(),
  fromName: z.string(),
  fromEmail: z.string(),
  /** ¿Hay contraseña guardada (en BD o env)? La contraseña real nunca se devuelve. */
  passwordSet: z.boolean(),
  /** De dónde sale la config vigente: BD (guardada) o variables de entorno. */
  source: z.enum(["db", "env"]),
});
export type EmailConfigDto = z.infer<typeof emailConfigSchema>;

/** Payload para GUARDAR / PROBAR la config. `password` vacío = no cambiar la guardada. */
export const updateEmailConfigRequestSchema = z.object({
  enabled: z.boolean(),
  service: z.string().trim().max(60).optional().default(""),
  host: z.string().trim().max(255).optional().default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().max(255).optional().default(""),
  /** Vacío/ausente = conservar la contraseña guardada. */
  password: z.string().max(255).optional(),
  fromName: z.string().trim().max(120).optional().default(""),
  fromEmail: z.string().trim().max(255).optional().default(""),
});
export type UpdateEmailConfigRequest = z.infer<typeof updateEmailConfigRequestSchema>;

/** Probar el ENVÍO con los valores del formulario (sin guardar): exige un destinatario. */
export const testEmailRequestSchema = updateEmailConfigRequestSchema.extend({
  to: z.string().trim().email(),
});
export type TestEmailRequest = z.infer<typeof testEmailRequestSchema>;

/** Resultado de "probar conexión" / "probar envío": ok o el error real del SMTP. */
export const emailTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type EmailTestResult = z.infer<typeof emailTestResultSchema>;
