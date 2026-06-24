import {
  logScheduleSchema,
  roundOccurrenceSchema,
  createLogScheduleRequestSchema,
  updateLogScheduleRequestSchema,
  type LogScheduleDto,
  type RoundOccurrenceDto,
  type CreateLogScheduleRequest,
  type UpdateLogScheduleRequest,
  type OccurrenceQuery,
  type MyRoundsQuery,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

/** Anexa `structureId` (estructura activa; aislamiento L1b) a un querystring. */
function structParam(qs: URLSearchParams, structureId?: string | null): string {
  if (structureId) qs.set("structureId", structureId);
  return qs.toString() ? `?${qs.toString()}` : "";
}

export function fetchSchedules(structureId?: string | null): Promise<LogScheduleDto[]> {
  return apiJson(`/schedules${structParam(new URLSearchParams(), structureId)}`, z.array(logScheduleSchema));
}

export function createSchedule(dto: CreateLogScheduleRequest): Promise<LogScheduleDto> {
  createLogScheduleRequestSchema.parse(dto);
  return apiJson("/schedules", logScheduleSchema, { method: "POST", body: dto });
}

export function updateSchedule(id: string, dto: UpdateLogScheduleRequest): Promise<LogScheduleDto> {
  updateLogScheduleRequestSchema.parse(dto);
  return apiJson(`/schedules/${id}`, logScheduleSchema, { method: "PATCH", body: dto });
}

export function deleteSchedule(id: string): Promise<void> {
  return apiVoid(`/schedules/${id}`, { method: "DELETE" });
}

const generateResultSchema = z.object({ generated: z.number().int() });

export function generateSchedules(scheduleId?: string): Promise<{ generated: number }> {
  return apiJson("/schedules/generate", generateResultSchema, { method: "POST", body: scheduleId ? { scheduleId } : {} });
}

export function fetchOccurrences(q: OccurrenceQuery = {}, structureId?: string | null): Promise<RoundOccurrenceDto[]> {
  const qs = new URLSearchParams();
  if (q.status) qs.set("status", q.status);
  if (q.overdueOnly) qs.set("overdueOnly", "true");
  if (q.todayOnly) qs.set("todayOnly", "true");
  if (q.orgNodeId) qs.set("orgNodeId", q.orgNodeId);
  if (q.templateId) qs.set("templateId", q.templateId);
  if (q.scheduleId) qs.set("scheduleId", q.scheduleId);
  return apiJson(`/schedules/occurrences${structParam(qs, structureId)}`, z.array(roundOccurrenceSchema));
}

const occurrenceStatsSchema = z.object({ pending: z.number().int(), overdue: z.number().int(), today: z.number().int() });
export type OccurrenceStats = z.infer<typeof occurrenceStatsSchema>;

export function fetchOccurrenceStats(structureId?: string | null): Promise<OccurrenceStats> {
  return apiJson(`/schedules/occurrences/stats${structParam(new URLSearchParams(), structureId)}`, occurrenceStatsSchema);
}

// --- Worklist del operador ("Mis rondas", 2.3.1) ---------------------------

export function fetchMyRounds(q: MyRoundsQuery = {}, structureId?: string | null): Promise<RoundOccurrenceDto[]> {
  const qs = new URLSearchParams();
  if (q.overdueOnly) qs.set("overdueOnly", "true");
  if (q.shiftOnly) qs.set("shiftOnly", "true");
  if (q.includeUpcoming) qs.set("includeUpcoming", "true");
  return apiJson(`/schedules/my-rounds${structParam(qs, structureId)}`, z.array(roundOccurrenceSchema));
}

export function fetchMyRoundsStats(structureId?: string | null): Promise<OccurrenceStats> {
  return apiJson(`/schedules/my-rounds/stats${structParam(new URLSearchParams(), structureId)}`, occurrenceStatsSchema);
}

const roleOptionSchema = z.object({ id: z.string(), name: z.string() });
export type RoleOption = z.infer<typeof roleOptionSchema>;

export function fetchScheduleRoleOptions(): Promise<RoleOption[]> {
  return apiJson("/schedules/role-options", z.array(roleOptionSchema));
}

const startResultSchema = z.object({ logEntryId: z.string() });

export function startOccurrence(id: string, equipmentId?: string | null): Promise<{ logEntryId: string }> {
  return apiJson(`/schedules/occurrences/${id}/start`, startResultSchema, {
    method: "POST",
    body: equipmentId ? { equipmentId } : {},
  });
}

export function skipOccurrence(id: string, reason: string): Promise<RoundOccurrenceDto> {
  return apiJson(`/schedules/occurrences/${id}/skip`, roundOccurrenceSchema, { method: "POST", body: { reason } });
}
