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

  // URL pública de la web (single-tenant). Se usa para construir enlaces que se
  // envían por correo (ej. restablecimiento de contraseña). En prod, el dominio
  // real detrás de Caddy; en dev, el servidor de Vite.
  APP_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  // Vida del token de restablecimiento de contraseña, en segundos (def. 30 min).
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(1800),
  // Tope de filas por import CSV de listas de referencia (def. 5000; un CSV de
  // 5k filas ≈ 400 KB, bajo el bodyLimit de 1 MB de Fastify). Catálogos mayores
  // van por el sync de Orígenes de Datos (Fase 3), no por archivo.
  REFERENCE_IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(5000),

  // --- Correo saliente (SMTP) ---
  // Interfaz abstracta EmailService → implementación SMTP (nodemailer). En dev se
  // usa Mailpit (localhost:1025). On-premise: cualquier relay SMTP del cliente.
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  // TLS implícito (puerto 465). Para STARTTLS (587) o Mailpit (1025) va en false.
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Lyra WatchLog <no-reply@watchlog.local>"),

  // --- Inteligencia Artificial (Fase 5 · Slice 2) ---
  // La IA se administra desde la app (tab "Inteligencia Artificial" en /configuracion,
  // config en BD cifrada). Estas variables son SOLO FALLBACK de arranque (si nunca se
  // guardó config en BD). provider: none | anthropic | openai-compatible.
  AI_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AI_PROVIDER: z.enum(["none", "anthropic", "openai-compatible"]).default("none"),
  AI_MODEL: z.string().optional(),
  // Solo para openai-compatible: endpoint local (Ollama/vLLM/LM Studio).
  AI_BASE_URL: z.string().optional(),
  // API key del proveedor (Anthropic / OpenAI-compatible). En BD va cifrada; aquí solo fallback.
  AI_API_KEY: z.string().optional(),

  // --- Object storage (MinIO / S3, adjuntos de evidencia — Ola 3) ---
  // Interfaz abstracta StorageService → implementación MinIO (SDK `minio`). On-prem,
  // sin SaaS. El navegador NUNCA recibe credenciales ni accede directo: la API es el
  // choke-point de subida (proxied) y firma las descargas (presigned GET de vida corta).
  // ENDPOINT como URL (http(s)://host:puerto): el servicio deriva host/puerto/TLS.
  MINIO_ENDPOINT: z.string().url().default("http://localhost:9000"),
  MINIO_ACCESS_KEY: z.string().default("watchlog"),
  MINIO_SECRET_KEY: z.string().default("watchlogsecret"),
  MINIO_BUCKET: z.string().default("watchlog-evidence"),
  MINIO_REGION: z.string().default("us-east-1"),
  // Vida (segundos) de las URLs prefirmadas de descarga (def. 5 min: suficiente
  // para abrir/descargar, corto para no dejar enlaces reusables).
  MINIO_PRESIGN_TTL: z.coerce.number().int().positive().default(300),

  // --- Admin de arranque (seed idempotente) ---
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),

  // --- Licenciamiento (L1) ---
  // Ruta del archivo de licencia firmado (license.lic). En contenedor se monta
  // como volumen (/app/license/license.lic); en dev lo genera `pnpm license:dev`.
  // Si no existe, la app ARRANCA en PENDIENTE_ACTIVACION (degradada, jamás crashea)
  // y escribe `solicitud.lreq` junto a esta ruta para la ceremonia de activación.
  LICENSE_FILE: z.string().default(".license/license.lic"),
  // Re-evaluación periódica de la licencia, en minutos (def. 360 = 6 h).
  LICENSE_RECHECK_MINUTES: z.coerce.number().int().positive().default(360),
  // Umbral en días para el estado POR_VENCER (aviso previo al vencimiento).
  LICENSE_WARN_DAYS: z.coerce.number().int().positive().default(30),
  // Archivo del machine-id (señal dominante de la huella node-lock). Bajo Docker
  // DEBE ser el del HOST, bind-monteado ro por el compose (¡no el del contenedor!).
  LICENSE_MACHINE_ID_FILE: z.string().default("/etc/machine-id"),
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
