import type { LicenseStatus } from "@lyra/contracts";

/**
 * Presentación PURA del banner global de licencia (L6): mapea el DTO delgado de
 * `GET /license/status` a QUÉ banner mostrar, con qué tono, a quién y si se
 * puede descartar. Sin React ni i18n adentro (testeable como función); los
 * textos viven en i18n bajo `license.banner.*` y el componente interpola.
 *
 * Decisión L6a (audiencia):
 *  - VALIDA (y MODULO_NO_LICENCIADO, que nunca es estado global) ⇒ sin banner.
 *  - POR_VENCER / LIMITE_EXCEDIDO ⇒ solo administradores (`settings:manage`),
 *    descartables por sesión — son gestión, no afectan al operador.
 *  - EN_GRACIA ⇒ TODOS, prominente, descartable por sesión (reaparece).
 *  - SOLO_LECTURA / BLOQUEADA / PENDIENTE_ACTIVACION ⇒ TODOS y PERSISTENTES:
 *    explican por qué la app no deja escribir (el guard del backend ya bloquea).
 */
export type LicenseBannerTone = "info" | "warning" | "error";

export interface LicenseBannerPresentation {
  /** Sufijo de la clave i18n (`license.banner.<key>`). */
  key: "expiring" | "grace" | "readonly" | "blocked" | "lineage" | "pending" | "limits";
  tone: LicenseBannerTone;
  /** `admins` = solo usuarios con `settings:manage` (filtro de UI; el DTO es de todos). */
  audience: "all" | "admins";
  /** Descartable por SESIÓN. Los estados restringidos jamás se descartan. */
  dismissible: boolean;
  /** Días para interpolar ({{days}}): restantes al vencimiento o de gracia. */
  days?: number;
  /** Vencimiento crudo (ISO) para que el componente lo formatee por locale. */
  expiresAt?: string;
}

export function licenseBannerFor(
  status: LicenseStatus | undefined,
): LicenseBannerPresentation | null {
  if (!status) return null;
  switch (status.status) {
    case "POR_VENCER":
      return {
        key: "expiring",
        tone: "warning",
        audience: "admins",
        dismissible: true,
        days: status.daysToExpiry,
        expiresAt: status.expiresAt,
      };
    case "EN_GRACIA":
      return {
        key: "grace",
        tone: "warning",
        audience: "all",
        dismissible: true,
        days: status.graceDaysRemaining,
        expiresAt: status.expiresAt,
      };
    case "SOLO_LECTURA":
      return { key: "readonly", tone: "error", audience: "all", dismissible: false };
    case "BLOQUEADA":
      // LINEAGE_MISMATCH tiene texto humano PROPIO (spec §5, L4): "esta licencia
      // no corresponde a esta instalación", distinto de una firma inválida.
      return {
        key: status.reason === "LINEAGE_MISMATCH" ? "lineage" : "blocked",
        tone: "error",
        audience: "all",
        dismissible: false,
      };
    case "PENDIENTE_ACTIVACION":
      return { key: "pending", tone: "info", audience: "all", dismissible: false };
    case "LIMITE_EXCEDIDO":
      return { key: "limits", tone: "warning", audience: "admins", dismissible: true };
    default:
      // VALIDA (o un estado futuro desconocido): sin banner — no alarmar de más.
      return null;
  }
}
