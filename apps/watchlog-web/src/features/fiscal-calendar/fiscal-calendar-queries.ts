import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignFiscalNodesRequest,
  ClosePeriodRequest,
  CreateFiscalCalendarRequest,
  GeneratePeriodsRequest,
  LockPeriodRequest,
  ReopenPeriodRequest,
  UnlockPeriodRequest,
  UpdateFiscalCalendarRequest,
} from "@lyra/contracts";
import { useActiveStructureId } from "../structure/structure-queries.js";
import {
  assignFiscalNodes,
  closeFiscalPeriod,
  createFiscalCalendar,
  deleteFiscalCalendar,
  fetchFiscalCalendar,
  fetchFiscalCalendars,
  fetchFiscalPeriods,
  fetchPeriodHistory,
  generateFiscalPeriods,
  lockFiscalPeriod,
  reopenFiscalPeriod,
  setDefaultFiscalCalendar,
  unlockFiscalPeriod,
  updateFiscalCalendar,
} from "./fiscal-calendar-api.js";

export const FISCAL_KEYS = {
  all: ["fiscal-calendars"] as const,
  list: (structureId: string | null) => ["fiscal-calendars", "list", structureId] as const,
  detail: (id: string) => ["fiscal-calendars", "detail", id] as const,
  periods: (id: string) => ["fiscal-periods", id] as const,
};

export function useFiscalCalendars() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: FISCAL_KEYS.list(structureId), queryFn: () => fetchFiscalCalendars(structureId) });
}

export function useFiscalCalendar(id: string | null) {
  return useQuery({
    queryKey: FISCAL_KEYS.detail(id ?? ""),
    queryFn: () => fetchFiscalCalendar(id!),
    enabled: !!id,
  });
}

export function useCreateFiscalCalendar() {
  const qc = useQueryClient();
  const structureId = useActiveStructureId();
  return useMutation({
    mutationFn: (dto: CreateFiscalCalendarRequest) =>
      createFiscalCalendar({ structureId: structureId ?? undefined, ...dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_KEYS.all }),
  });
}

export function useUpdateFiscalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateFiscalCalendarRequest }) => updateFiscalCalendar(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: FISCAL_KEYS.all });
      qc.setQueryData(FISCAL_KEYS.detail(data.id), data);
    },
  });
}

export function useDeleteFiscalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFiscalCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_KEYS.all }),
  });
}

export function useSetDefaultFiscalCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefaultFiscalCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FISCAL_KEYS.all }),
  });
}

export function useAssignFiscalNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignFiscalNodesRequest }) => assignFiscalNodes(id, dto),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: FISCAL_KEYS.detail(id) }),
  });
}

// --- Períodos ---------------------------------------------------------------

export function useFiscalPeriods(fiscalCalendarId: string | null) {
  return useQuery({
    queryKey: FISCAL_KEYS.periods(fiscalCalendarId ?? ""),
    queryFn: () => fetchFiscalPeriods(fiscalCalendarId!),
    enabled: !!fiscalCalendarId,
  });
}

export function usePeriodHistory(fiscalCalendarId: string, periodKey: string | null) {
  return useQuery({
    queryKey: ["fiscal-period-history", fiscalCalendarId, periodKey],
    queryFn: () => fetchPeriodHistory(fiscalCalendarId, periodKey!),
    enabled: !!periodKey,
  });
}

function invalidatePeriods(qc: ReturnType<typeof useQueryClient>, fiscalCalendarId: string) {
  return qc.invalidateQueries({ queryKey: FISCAL_KEYS.periods(fiscalCalendarId) });
}

export function useGenerateFiscalPeriods() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fiscalCalendarId, dto }: { fiscalCalendarId: string; dto: GeneratePeriodsRequest }) =>
      generateFiscalPeriods(fiscalCalendarId, dto),
    onSuccess: (_d, { fiscalCalendarId }) => invalidatePeriods(qc, fiscalCalendarId),
  });
}

export function useCloseFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fiscalCalendarId, periodKey, dto }: { fiscalCalendarId: string; periodKey: string; dto: ClosePeriodRequest }) =>
      closeFiscalPeriod(fiscalCalendarId, periodKey, dto),
    onSuccess: (_d, { fiscalCalendarId }) => invalidatePeriods(qc, fiscalCalendarId),
  });
}

export function useReopenFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fiscalCalendarId, periodKey, dto }: { fiscalCalendarId: string; periodKey: string; dto: ReopenPeriodRequest }) =>
      reopenFiscalPeriod(fiscalCalendarId, periodKey, dto),
    onSuccess: (_d, { fiscalCalendarId }) => invalidatePeriods(qc, fiscalCalendarId),
  });
}

export function useLockFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fiscalCalendarId, periodKey, dto }: { fiscalCalendarId: string; periodKey: string; dto: LockPeriodRequest }) =>
      lockFiscalPeriod(fiscalCalendarId, periodKey, dto),
    onSuccess: (_d, { fiscalCalendarId }) => invalidatePeriods(qc, fiscalCalendarId),
  });
}

export function useUnlockFiscalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fiscalCalendarId, periodKey, dto }: { fiscalCalendarId: string; periodKey: string; dto: UnlockPeriodRequest }) =>
      unlockFiscalPeriod(fiscalCalendarId, periodKey, dto),
    onSuccess: (_d, { fiscalCalendarId }) => invalidatePeriods(qc, fiscalCalendarId),
  });
}
