import {
  aiConfigSchema,
  aiTestResultSchema,
  updateAiConfigRequestSchema,
  type AiConfigDto,
  type AiTestResult,
  type UpdateAiConfigRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

export function fetchAiConfig(): Promise<AiConfigDto> {
  return apiJson("/settings/ai", aiConfigSchema);
}

export function saveAiConfig(dto: UpdateAiConfigRequest): Promise<AiConfigDto> {
  updateAiConfigRequestSchema.parse(dto);
  return apiJson("/settings/ai", aiConfigSchema, { method: "PUT", body: dto });
}

export function testAiConfig(dto: UpdateAiConfigRequest): Promise<AiTestResult> {
  updateAiConfigRequestSchema.parse(dto);
  return apiJson("/settings/ai/test", aiTestResultSchema, { method: "POST", body: dto });
}
