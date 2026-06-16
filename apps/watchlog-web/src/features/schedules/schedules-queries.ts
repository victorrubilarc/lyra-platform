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

export const SCHEDULE_KEYS = {
  all: ["schedules"] as const,
  list: () => ["schedules", "list"] as const,
  occurrences: (q: OccurrenceQuery) => ["schedules", "occurrences", q] as const,
  stats: () => ["schedules", "stats"] as const,
  myRounds: (q: MyRoundsQuery) => ["schedules", "my-rounds", q] as const,
  myRoundsStats: () => ["schedules", "my-rounds", "stats"] as const,
  roleOptions: () => ["schedules", "role-options"] as const,
};

export function useSchedules() {
  return useQuery({ queryKey: SCHEDULE_KEYS.list(), queryFn: fetchSchedules });
}

export function useOccurrences(q: OccurrenceQuery = {}, enabled = true) {
  return useQuery({ queryKey: SCHEDULE_KEYS.occurrences(q), queryFn: () => fetchOccurrences(q), enabled });
}

export function useOccurrenceStats(enabled = true) {
  return useQuery({ queryKey: SCHEDULE_KEYS.stats(), queryFn: fetchOccurrenceStats, enabled });
}

export function useMyRounds(q: MyRoundsQuery = {}) {
  return useQuery({ queryKey: SCHEDULE_KEYS.myRounds(q), queryFn: () => fetchMyRounds(q) });
}

export function useMyRoundsStats(enabled = true) {
  return useQuery({ queryKey: SCHEDULE_KEYS.myRoundsStats(), queryFn: fetchMyRoundsStats, enabled });
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
