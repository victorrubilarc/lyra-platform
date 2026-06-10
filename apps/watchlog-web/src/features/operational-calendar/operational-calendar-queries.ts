import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignCalendarNodesRequest,
  CreateOperationalCalendarRequest,
  UpdateOperationalCalendarRequest,
} from "@lyra/contracts";
import {
  assignCalendarNodes,
  createOperationalCalendar,
  deleteOperationalCalendar,
  fetchOperationalCalendar,
  fetchOperationalCalendars,
  setDefaultCalendar,
  updateOperationalCalendar,
} from "./operational-calendar-api.js";

export const OPS_CALENDAR_KEYS = {
  all: ["operational-calendars"] as const,
  list: () => ["operational-calendars", "list"] as const,
  detail: (id: string) => ["operational-calendars", "detail", id] as const,
};

export function useOperationalCalendars() {
  return useQuery({ queryKey: OPS_CALENDAR_KEYS.list(), queryFn: fetchOperationalCalendars });
}

export function useOperationalCalendar(id: string | null) {
  return useQuery({
    queryKey: OPS_CALENDAR_KEYS.detail(id ?? ""),
    queryFn: () => fetchOperationalCalendar(id!),
    enabled: !!id,
  });
}

export function useCreateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOperationalCalendarRequest) => createOperationalCalendar(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPS_CALENDAR_KEYS.all }),
  });
}

export function useUpdateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOperationalCalendarRequest }) => updateOperationalCalendar(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: OPS_CALENDAR_KEYS.all });
      qc.setQueryData(OPS_CALENDAR_KEYS.detail(data.id), data);
    },
  });
}

export function useDeleteCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOperationalCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPS_CALENDAR_KEYS.all }),
  });
}

export function useSetDefaultCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefaultCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPS_CALENDAR_KEYS.all }),
  });
}

export function useAssignCalendarNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignCalendarNodesRequest }) => assignCalendarNodes(id, dto),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: OPS_CALENDAR_KEYS.detail(id) }),
  });
}
