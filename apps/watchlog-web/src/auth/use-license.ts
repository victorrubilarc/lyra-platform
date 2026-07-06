import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  licenseStatusSchema,
  type LicensedModuleKey,
  type LicenseLimitUsage,
  type LicenseStatus,
} from "@lyra/contracts";
import { apiJson } from "../lib/api-client.js";
import { useAuthStore } from "./auth-store.js";

export const LICENSE_KEYS = {
  status: ["license", "status"] as const,
};

/** La licencia cambia rarísimo (re-chequeo del backend cada horas): caché largo. */
const LICENSE_STALE_MS = 5 * 60_000;

function fetchLicenseStatus(): Promise<LicenseStatus> {
  return apiJson("/license/status", licenseStatusSchema);
}

/**
 * Estado DELGADO de la licencia de la instalación (L2; lo enriquece la UI de
 * L6). Autenticado sin permiso: todo usuario lo necesita para saber qué
 * módulos mostrar. El backend nunca manda el payload (sin huella/linaje).
 */
export function useLicenseStatus() {
  const authenticated = useAuthStore((s) => s.status === "authenticated");
  return useQuery({
    queryKey: LICENSE_KEYS.status,
    queryFn: fetchLicenseStatus,
    enabled: authenticated,
    staleTime: LICENSE_STALE_MS,
  });
}

/** ¿El módulo está habilitado por la licencia? (para OCULTAR, igual que `can`). */
export type ModuleLicenseChecker = (key?: LicensedModuleKey) => boolean;

/**
 * Checker de ENTITLEMENT por módulo — el eje de la INSTALACIÓN, distinto y
 * ADICIONAL al `can(...)` del usuario (visible = módulo licenciado ∧ permiso).
 * Devuelve true cuando:
 *  - la ruta no declara módulo (transversal/core: nunca se gatea),
 *  - aún no llegó el DTO (no se oculta por adelantado: el candado REAL es el
 *    403 MODULE_NOT_LICENSED del backend; aquí solo se oculta),
 *  - `modules` es null (sin payload verificado: gobiernan los estados
 *    globales de L1, no el gate por módulo),
 *  - o la clave está dentro de `modules[]` de la licencia.
 */
export function useLicensedModules(): ModuleLicenseChecker {
  const { data } = useLicenseStatus();
  const modules = data?.modules ?? null;
  return useCallback(
    (key?: LicensedModuleKey) =>
      key === undefined || key === "core" || modules === null || modules.includes(key),
    [modules],
  );
}

/** Cupo de un tope numérico de la licencia, con el derivado que usa la UI. */
export interface LicenseQuota extends LicenseLimitUsage {
  /** Sin cupo para crear UNO más (inUse >= max): la UI deshabilita "crear" con hint. */
  atLimit: boolean;
}

/**
 * Cupos numéricos de la licencia (L2b): tope contratado + uso vivo de nodos y
 * usuarios nominados. `undefined` mientras no llegue el DTO o sin payload
 * verificado — entonces la UI NO deshabilita nada por adelantado (igual que
 * `useLicensedModules`): el candado real es el 403 `LICENSE_LIMIT_EXCEEDED`
 * del backend; aquí solo se avisa ANTES de chocar con él.
 */
export function useLicenseQuotas(): { nodes?: LicenseQuota; namedUsers?: LicenseQuota } {
  const { data } = useLicenseStatus();
  const limits = data?.limits;
  return useMemo(() => {
    if (!limits) return {};
    const quota = (u: LicenseLimitUsage): LicenseQuota => ({ ...u, atLimit: u.inUse >= u.max });
    return { nodes: quota(limits.nodes), namedUsers: quota(limits.namedUsers) };
  }, [limits]);
}
