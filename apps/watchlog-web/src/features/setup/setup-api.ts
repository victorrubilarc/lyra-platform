import {
  setupContextSchema,
  setupFinalizeResponseSchema,
  setupLicenseImportResponseSchema,
  setupStatusSchema,
  type SetupContextDto,
  type SetupFinalizeRequest,
  type SetupFinalizeResponse,
  type SetupLicenseImportResponse,
  type SetupStatusDto,
} from "@lyra/contracts";
import { apiBlob, apiJson } from "../../lib/api-client.js";

/** Header del token de instalación (un solo uso; espejo del backend). */
const TOKEN_HEADER = "x-setup-token";

/** ¿La instalación está virgen? Público y mínimo: un booleano, nada más. */
export function fetchSetupStatus(): Promise<SetupStatusDto> {
  return apiJson("/setup/status", setupStatusSchema);
}

/** Contexto del wizard; valida el token de paso (403 si es inválido/bloqueado). */
export function fetchSetupContext(token: string): Promise<SetupContextDto> {
  return apiJson("/setup/context", setupContextSchema, { headers: { [TOKEN_HEADER]: token } });
}

/** Descarga `solicitud.lreq` (ceremonia de activación) como blob. */
export function downloadActivationRequest(token: string): Promise<Blob> {
  return apiBlob("/setup/license-request", { headers: { [TOKEN_HEADER]: token } });
}

/** Sube el contenido de `license.lic`; el backend verifica ANTES de persistir. */
export function importSetupLicense(
  token: string,
  content: string,
): Promise<SetupLicenseImportResponse> {
  return apiJson("/setup/license", setupLicenseImportResponseSchema, {
    method: "POST",
    body: { content },
    headers: { [TOKEN_HEADER]: token },
  });
}

/** Finalización atómica: crea el admin real y cierra el asistente para siempre. */
export function finalizeSetup(
  token: string,
  dto: SetupFinalizeRequest,
): Promise<SetupFinalizeResponse> {
  return apiJson("/setup/finalize", setupFinalizeResponseSchema, {
    method: "POST",
    body: dto,
    headers: { [TOKEN_HEADER]: token },
  });
}
