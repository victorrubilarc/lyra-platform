import {
  systemSettingsSchema,
  updateSystemSettingsRequestSchema,
  type SystemSettingsDto,
  type UpdateSystemSettingsRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

export function fetchSystemSettings(): Promise<SystemSettingsDto> {
  return apiJson("/settings", systemSettingsSchema);
}

export function updateSystemSettings(dto: UpdateSystemSettingsRequest): Promise<SystemSettingsDto> {
  updateSystemSettingsRequestSchema.parse(dto);
  return apiJson("/settings", systemSettingsSchema, { method: "PATCH", body: dto });
}
