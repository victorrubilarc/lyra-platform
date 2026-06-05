import { z } from "zod";

/** Estado de salud de un servicio. */
export const healthStatusSchema = z.object({
  /** `ok` = operativo · `degraded` = parcial · `down` = caído. */
  status: z.enum(["ok", "degraded", "down"]),
  /** Nombre del servicio que responde (ej. "watchlog-api"). */
  service: z.string(),
  /** Versión del servicio. */
  version: z.string(),
  /** Marca de tiempo ISO-8601. */
  timestamp: z.string(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
