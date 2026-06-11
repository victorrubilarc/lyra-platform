import {
  closePeriodRequestSchema,
  listOperationalPeriodsResponseSchema,
  operationalPeriodDtoSchema,
  reopenPeriodRequestSchema,
  type ClosePeriodRequest,
  type ListOperationalPeriodsResponse,
  type OperationalPeriodDto,
  type ReopenPeriodRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

export function fetchOperationalPeriods(calendarId: string): Promise<ListOperationalPeriodsResponse> {
  return apiJson(
    `/operational-periods?calendarId=${encodeURIComponent(calendarId)}`,
    listOperationalPeriodsResponseSchema,
  );
}

export function closeOperationalPeriod(
  calendarId: string,
  periodKey: string,
  dto: ClosePeriodRequest,
): Promise<OperationalPeriodDto> {
  closePeriodRequestSchema.parse(dto);
  return apiJson(
    `/operational-periods/close?calendarId=${encodeURIComponent(calendarId)}&periodKey=${encodeURIComponent(periodKey)}`,
    operationalPeriodDtoSchema,
    { method: "POST", body: dto },
  );
}

export function reopenOperationalPeriod(
  calendarId: string,
  periodKey: string,
  dto: ReopenPeriodRequest,
): Promise<OperationalPeriodDto> {
  reopenPeriodRequestSchema.parse(dto);
  return apiJson(
    `/operational-periods/reopen?calendarId=${encodeURIComponent(calendarId)}&periodKey=${encodeURIComponent(periodKey)}`,
    operationalPeriodDtoSchema,
    { method: "POST", body: dto },
  );
}
