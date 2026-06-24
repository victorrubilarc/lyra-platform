import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLogScheduleRequest, UpdateLogScheduleRequest, OccurrenceQuery, MyRoundsQuery } from "@lyra/contracts";
import {
  createSchedule,
  deleteSchedule,
  fetchMyRounds,
  fetchMyRoundsStats,
  fetchOccurrenceStats,
  fetchOccurrences,
  fetchScheduleRoleOptions,
  fetchSchedules,
  generateSchedules,
  skipOccurrence,
  startOccurrence,
  updateSchedule,
} from "./schedules-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const SCHEDULE_KEYS = {
  all: ["schedules"] as const,
  list: (structureId: string | null) => ["schedules", "list", structureId] as const,
  occurrences: (q: OccurrenceQuery, structureId: string | null) => ["schedules", "occurrences", q, structureId] as const,
  stats: (structureId: string | null) => ["schedules", "stats", structureId] as const,
  myRounds: (q: MyRoundsQuery, structureId: string | null) => ["schedules", "my-rounds", q, structureId] as const,
  myRoundsStats: (structureId: string | null) => ["schedules", "my-rounds", "stats", structureId] as const,
  roleOptions: () => ["schedules", "role-options"] as const,
};

export function useSchedules() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: SCHEDULE_KEYS.list(structureId), queryFn: () => fetchSchedules(structureId) });
}

export function useOccurrences(q: OccurrenceQuery = {}, enabled = true) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: SCHEDULE_KEYS.occurrences(q, structureId), queryFn: () => fetchOccurrences(q, structureId), enabled });
}

export function useOccurrenceStats(enabled = true) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: SCHEDULE_KEYS.stats(structureId), queryFn: () => fetchOccurrenceStats(structureId), enabled });
}

export function useMyRounds(q: MyRoundsQuery = {}) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: SCHEDULE_KEYS.myRounds(q, structureId), queryFn: () => fetchMyRounds(q, structureId) });
}

export function useMyRoundsStats(enabled = true) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: SCHEDULE_KEYS.myRoundsStats(structureId), queryFn: () => fetchMyRoundsStats(structureId), enabled });
}

export function useScheduleRoleOptions(enabled = true) {
  return useQuery({ queryKey: SCHEDULE_KEYS.roleOptions(), queryFn: fetchScheduleRoleOptions, enabled });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: SCHEDULE_KEYS.all });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLogScheduleRequest) => createSchedule(dto),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateLogScheduleRequest }) => updateSchedule(id, dto),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteSchedule(id), onSuccess: () => invalidateAll(qc) });
}

export function useGenerateSchedules() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (scheduleId?: string) => generateSchedules(scheduleId), onSuccess: () => invalidateAll(qc) });
}

export function useStartOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, equipmentId }: { id: string; equipmentId?: string | null }) => startOccurrence(id, equipmentId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSkipOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => skipOccurrence(id, reason),
    onSuccess: () => invalidateAll(qc),
  });
}
