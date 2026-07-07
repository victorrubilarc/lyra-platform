import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateSystemSettingsRequest } from "@lyra/contracts";
import { BRANDING_KEYS } from "../../branding.js";
import { fetchSystemSettings, updateSystemSettings } from "./settings-api.js";

const SETTINGS_KEY = ["system-settings"] as const;

export function useSystemSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchSystemSettings });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateSystemSettingsRequest) => updateSystemSettings(dto),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
      // La identidad (nombre/tema por defecto) viaja también en el branding
      // público (OOBE S3): se refresca para que Topbar/título reaccionen al tiro.
      void qc.invalidateQueries({ queryKey: BRANDING_KEYS.branding });
    },
  });
}
