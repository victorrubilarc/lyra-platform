import { z } from "zod";

/**
 * Esquema de validación de variables de entorno. La aplicación NO arranca si
 * la configuración es inválida — fallar temprano y fuerte es la regla.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  REDIS_URL: z.string().optional(),

  // --- Autenticación (Fase 1) ---
  // Proveedores activos, separados por coma. "local" es el único implementado.
  AUTH_PROVIDERS: z.string().default("local"),
  // Secretos de firma JWT. En producción deben ser largos y aleatorios.
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET demasiado corto"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET demasiado corto"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900), // 15 min
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000), // 30 días
  // Clave AES-256-GCM (base64 de 32 bytes) para cifrar secretos en reposo (TOTP).
  APP_ENC_KEY: z.string().min(1, "APP_ENC_KEY es obligatoria"),
  // Cookie del refresh token. En producción Secure=true (HTTPS obligatorio).
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional(),

  // --- Admin de arranque (seed idempotente) ---
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}
