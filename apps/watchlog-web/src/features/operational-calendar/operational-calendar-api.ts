import {
  assignCalendarNodesRequestSchema,
  createOperationalCalendarRequestSchema,
  operationalCalendarDetailSchema,
  operationalCalendarPreviewRequestSchema,
  operationalCalendarSchema,
  shiftResolutionSchema,
  updateOperationalCalendarRequestSchema,
  type AssignCalendarNodesRequest,
  type CreateOperationalCalendarRequest,
  type OperationalCalendar,
  type OperationalCalendarDetail,
  type ShiftResolution,
  type UpdateOperationalCalendarRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

export function fetchOperationalCalendars(): Promise<OperationalCalendar[]> {
  return apiJson("/operational-calendars", z.array(operationalCalendarSchema));
}

export function fetchOperationalCalendar(id: string): Promise<OperationalCalendarDetail> {
  return apiJson(`/operational-calendars/${id}`, operationalCalendarDetailSchema);
}

export function createOperationalCalendar(dto: CreateOperationalCalendarRequest): Promise<OperationalCalendarDetail> {
  createOperationalCalendarRequestSchema.parse(dto);
  return apiJson("/operational-calendars", operationalCalendarDetailSchema, { method: "POST", body: dto });
}

export function updateOperationalCalendar(
  id: string,
  dto: UpdateOperationalCalendarRequest,
): Promise<OperationalCalendarDetail> {
  updateOperationalCalendarRequestSchema.parse(dto);
  return apiJson(`/operational-calendars/${id}`, operationalCalendarDetailSchema, { method: "PATCH", body: dto });
}

export function deleteOperationalCalendar(id: string): Promise<void> {
  return apiVoid(`/operational-calendars/${id}`, { method: "DELETE" });
}

export function setDefaultCalendar(id: string): Promise<OperationalCalendarDetail> {
  return apiJson(`/operational-calendars/${id}/default`, operationalCalendarDetailSchema, { method: "POST" });
}

const assignNodesResponseSchema = z.object({ assignedNodeIds: z.array(z.string()) });

export function assignCalendarNodes(id: string, dto: AssignCalendarNodesRequest): Promise<{ assignedNodeIds: string[] }> {
  assignCalendarNodesRequestSchema.parse(dto);
  return apiJson(`/operational-calendars/${id}/nodes`, assignNodesResponseSchema, { method: "POST", body: dto });
}

/** Probador: resuelve un instante (ISO) contra el calendario guardado. */
export function previewCalendar(id: string, at: string): Promise<ShiftResolution> {
  const body = operationalCalendarPreviewRequestSchema.parse({ at });
  return apiJson(`/operational-calendars/${id}/preview`, shiftResolutionSchema, { method: "POST", body });
}
