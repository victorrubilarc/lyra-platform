import {
  closePeriodRequestSchema,
  createFiscalCalendarRequestSchema,
  fiscalCalendarSchema,
  generatePeriodsRequestSchema,
  listOperationalPeriodsResponseSchema,
  lockPeriodRequestSchema,
  operationalPeriodDtoSchema,
  reopenPeriodRequestSchema,
  unlockPeriodRequestSchema,
  updateFiscalCalendarRequestSchema,
  type AssignFiscalNodesRequest,
  type ClosePeriodRequest,
  type CreateFiscalCalendarRequest,
  type FiscalCalendarDto,
  type GeneratePeriodsRequest,
  type ListOperationalPeriodsResponse,
  type LockPeriodRequest,
  type OperationalPeriodDto,
  type ReopenPeriodRequest,
  type UnlockPeriodRequest,
  type UpdateFiscalCalendarRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

const detailSchema = fiscalCalendarSchema;

export function fetchFiscalCalendars(): Promise<FiscalCalendarDto[]> {
  return apiJson("/fiscal-calendars", z.array(fiscalCalendarSchema));
}

export function fetchFiscalCalendar(id: string): Promise<FiscalCalendarDto> {
  return apiJson(`/fiscal-calendars/${id}`, detailSchema);
}

export function createFiscalCalendar(dto: CreateFiscalCalendarRequest): Promise<FiscalCalendarDto> {
  createFiscalCalendarRequestSchema.parse(dto);
  return apiJson("/fiscal-calendars", detailSchema, { method: "POST", body: dto });
}

export function updateFiscalCalendar(id: string, dto: UpdateFiscalCalendarRequest): Promise<FiscalCalendarDto> {
  updateFiscalCalendarRequestSchema.parse(dto);
  return apiJson(`/fiscal-calendars/${id}`, detailSchema, { method: "PATCH", body: dto });
}

export function deleteFiscalCalendar(id: string): Promise<void> {
  return apiVoid(`/fiscal-calendars/${id}`, { method: "DELETE" });
}

export function setDefaultFiscalCalendar(id: string): Promise<FiscalCalendarDto> {
  return apiJson(`/fiscal-calendars/${id}/default`, detailSchema, { method: "POST" });
}

const assignNodesResponseSchema = z.object({ assignedNodeIds: z.array(z.string()) });

export function assignFiscalNodes(id: string, dto: AssignFiscalNodesRequest): Promise<{ assignedNodeIds: string[] }> {
  return apiJson(`/fiscal-calendars/${id}/nodes`, assignNodesResponseSchema, { method: "POST", body: dto });
}

// --- Períodos ---------------------------------------------------------------

const q = (fiscalCalendarId: string, periodKey?: string) =>
  `fiscalCalendarId=${encodeURIComponent(fiscalCalendarId)}${periodKey ? `&periodKey=${encodeURIComponent(periodKey)}` : ""}`;

export function fetchFiscalPeriods(fiscalCalendarId: string): Promise<ListOperationalPeriodsResponse> {
  return apiJson(`/operational-periods?${q(fiscalCalendarId)}`, listOperationalPeriodsResponseSchema);
}

export function generateFiscalPeriods(
  fiscalCalendarId: string,
  dto: GeneratePeriodsRequest,
): Promise<ListOperationalPeriodsResponse> {
  generatePeriodsRequestSchema.parse(dto);
  return apiJson(`/operational-periods/generate?${q(fiscalCalendarId)}`, listOperationalPeriodsResponseSchema, {
    method: "POST",
    body: dto,
  });
}

export function closeFiscalPeriod(
  fiscalCalendarId: string,
  periodKey: string,
  dto: ClosePeriodRequest,
): Promise<OperationalPeriodDto> {
  closePeriodRequestSchema.parse(dto);
  return apiJson(`/operational-periods/close?${q(fiscalCalendarId, periodKey)}`, operationalPeriodDtoSchema, {
    method: "POST",
    body: dto,
  });
}

export function reopenFiscalPeriod(
  fiscalCalendarId: string,
  periodKey: string,
  dto: ReopenPeriodRequest,
): Promise<OperationalPeriodDto> {
  reopenPeriodRequestSchema.parse(dto);
  return apiJson(`/operational-periods/reopen?${q(fiscalCalendarId, periodKey)}`, operationalPeriodDtoSchema, {
    method: "POST",
    body: dto,
  });
}

export function lockFiscalPeriod(
  fiscalCalendarId: string,
  periodKey: string,
  dto: LockPeriodRequest,
): Promise<OperationalPeriodDto> {
  lockPeriodRequestSchema.parse(dto);
  return apiJson(`/operational-periods/lock?${q(fiscalCalendarId, periodKey)}`, operationalPeriodDtoSchema, {
    method: "POST",
    body: dto,
  });
}

export function unlockFiscalPeriod(
  fiscalCalendarId: string,
  periodKey: string,
  dto: UnlockPeriodRequest,
): Promise<OperationalPeriodDto> {
  unlockPeriodRequestSchema.parse(dto);
  return apiJson(`/operational-periods/unlock?${q(fiscalCalendarId, periodKey)}`, operationalPeriodDtoSchema, {
    method: "POST",
    body: dto,
  });
}
