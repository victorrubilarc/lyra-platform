import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClosePeriodRequest, ReopenPeriodRequest } from "@lyra/contracts";
import {
  closeOperationalPeriod,
  fetchOperationalPeriods,
  reopenOperationalPeriod,
} from "./operational-periods-api.js";

export const OPS_PERIOD_KEYS = {
  all: ["operational-periods"] as const,
  list: (calendarId: string) => ["operational-periods", "list", calendarId] as const,
};

export function useOperationalPeriods(calendarId: string | null) {
  return useQuery({
    queryKey: OPS_PERIOD_KEYS.list(calendarId ?? ""),
    queryFn: () => fetchOperationalPeriods(calendarId!),
    enabled: !!calendarId,
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, periodKey, dto }: { calendarId: string; periodKey: string; dto: ClosePeriodRequest }) =>
      closeOperationalPeriod(calendarId, periodKey, dto),
    onSuccess: (_data, { calendarId }) => qc.invalidateQueries({ queryKey: OPS_PERIOD_KEYS.list(calendarId) }),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, periodKey, dto }: { calendarId: string; periodKey: string; dto: ReopenPeriodRequest }) =>
      reopenOperationalPeriod(calendarId, periodKey, dto),
    onSuccess: (_data, { calendarId }) => qc.invalidateQueries({ queryKey: OPS_PERIOD_KEYS.list(calendarId) }),
  });
}
