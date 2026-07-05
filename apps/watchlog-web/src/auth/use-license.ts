import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  licenseStatusSchema,
  type LicensedModuleKey,
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
