import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignCalendarNodesRequest,
  CreateOperationalCalendarRequest,
  UpdateOperationalCalendarRequest,
} from "@lyra/contracts";
import { useActiveStructureId } from "../structure/structure-queries.js";
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
  list: (structureId: string | null) => ["operational-calendars", "list", structureId] as const,
  detail: (id: string) => ["operational-calendars", "detail", id] as const,
};

export function useOperationalCalendars() {
  const structureId = useActiveStructureId();
  return useQuery({
    queryKey: OPS_CALENDAR_KEYS.list(structureId),
    queryFn: () => fetchOperationalCalendars(structureId),
  });
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
  const structureId = useActiveStructureId();
  return useMutation({
    // El calendario nuevo nace en la estructura activa (o la por defecto si null).
    mutationFn: (dto: CreateOperationalCalendarRequest) =>
      createOperationalCalendar({ structureId: structureId ?? undefined, ...dto }),
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
