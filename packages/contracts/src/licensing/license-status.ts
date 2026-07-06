import { z } from "zod";

/**
 * DTO DELGADO del estado de licencia para la web (L2; cimiento del banner L6).
 *
 * Mínimo privilegio (DECISIONS 2026-07-05): se mapea desde el
 * `LicenseSnapshot` del backend y expone SOLO lo que la UI necesita para
 * decidir qué mostrar. JAMÁS viaja el payload completo: sin huella, sin
 * linaje (renewalCounter/nonce), sin installationId, sin customer/partner.
 */

/**
 * Estados posibles del runtime (los 7 de la máquina de estados de
 * `@lyra/licensing` + PENDIENTE_ACTIVACION, el estado runtime de L1 para
 * «no hay archivo de licencia»). Espejo de `LicenseRuntimeStatus` de la API.
 */
export const licenseRuntimeStatusSchema = z.enum([
  "VALIDA",
  "POR_VENCER",
  "EN_GRACIA",
  "SOLO_LECTURA",
  "LIMITE_EXCEDIDO",
  "MODULO_NO_LICENCIADO",
  "BLOQUEADA",
  "PENDIENTE_ACTIVACION",
]);
export type LicenseRuntimeStatusDto = z.infer<typeof licenseRuntimeStatusSchema>;

export const licenseStatusSchema = z.object({
  status: licenseRuntimeStatusSchema,
  /** Motivo legible-por-máquina (ej. EXPIRED_IN_GRACE, LICENSE_FILE_MISSING). */
  reason: z.string().optional(),
  /** Paquete comercial (starter/professional/enterprise); ausente sin licencia. */
  edition: z.string().optional(),
  /**
   * Módulos habilitados por la licencia. `null` = NO hay payload verificado
   * (PENDIENTE_ACTIVACION / BLOQUEADA por firma): el front entonces NO oculta
   * por módulo (solo aplica permisos) — el guard global del backend ya
   * restringe las mutaciones. Strings LIBRES a propósito: una licencia más
   * nueva puede traer claves que este build no conoce y el DTO no debe romper.
   */
  modules: z.array(z.string()).nullable(),
  /** Vencimiento (ISO 8601) de la licencia verificada, si la hay. */
  expiresAt: z.string().optional(),
  /** Días (enteros) hasta el vencimiento; negativo si ya venció. */
  daysToExpiry: z.number().int().optional(),
  /**
   * Días (enteros ≥ 0) que quedan de la ventana de gracia. SOLO viaja en
   * EN_GRACIA (decisión L6a): la spec §5 exige "renovar en X días" y con
   * `daysToExpiry` negativo la UI no puede saber cuándo termina la gracia.
   * Es un número de PRESENTACIÓN derivado — mínimo privilegio intacto (sin
   * huella/linaje/identidad).
   */
  graceDaysRemaining: z.number().int().min(0).optional(),
});
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;
