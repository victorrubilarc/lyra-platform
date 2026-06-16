import {
  emailConfigSchema,
  emailTestResultSchema,
  updateEmailConfigRequestSchema,
  testEmailRequestSchema,
  type EmailConfigDto,
  type EmailTestResult,
  type UpdateEmailConfigRequest,
  type TestEmailRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

export function fetchEmailConfig(): Promise<EmailConfigDto> {
  return apiJson("/settings/email", emailConfigSchema);
}

export function saveEmailConfig(dto: UpdateEmailConfigRequest): Promise<EmailConfigDto> {
  updateEmailConfigRequestSchema.parse(dto);
  return apiJson("/settings/email", emailConfigSchema, { method: "PUT", body: dto });
}

export function verifyEmailConfig(dto: UpdateEmailConfigRequest): Promise<EmailTestResult> {
  return apiJson("/settings/email/verify", emailTestResultSchema, { method: "POST", body: dto });
}

export function testEmailConfig(dto: TestEmailRequest): Promise<EmailTestResult> {
  testEmailRequestSchema.parse(dto);
  return apiJson("/settings/email/test", emailTestResultSchema, { method: "POST", body: dto });
}
