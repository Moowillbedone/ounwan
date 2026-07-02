"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import * as repo from "./repo";
import { scheduleSync } from "./sync";
import type {
  WorkoutSession,
  Routine,
  BodyMetric,
  Profile,
  Exercise,
} from "./types";

export const qk = {
  profile: ["profile"] as const,
  exercises: ["exercises"] as const,
  routines: ["routines"] as const,
  sessions: ["sessions"] as const,
  bodyMetrics: ["bodyMetrics"] as const,
  history: (id: string) => ["history", id] as const,
  pr: (id: string) => ["pr", id] as const,
  lastPerf: (id: string) => ["lastPerf", id] as const,
};

/* -------- Queries -------- */

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: repo.getProfile });
}

export function useExercises() {
  return useQuery({ queryKey: qk.exercises, queryFn: repo.listExercises });
}

export function useRoutines() {
  return useQuery({ queryKey: qk.routines, queryFn: repo.listRoutines });
}

export function useSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: repo.listSessions });
}

export function useBodyMetrics() {
  return useQuery({ queryKey: qk.bodyMetrics, queryFn: repo.listBodyMetrics });
}

export function useExerciseHistory(exerciseId: string | null) {
  return useQuery({
    queryKey: qk.history(exerciseId ?? ""),
    queryFn: () => repo.getExerciseHistory(exerciseId!),
    enabled: !!exerciseId,
    // 운동 전환 시 이전 데이터를 유지해 차트/PR 영역 높이가 줄었다 늘어나는 깜빡임 방지
    placeholderData: keepPreviousData,
  });
}

/* -------- Mutations -------- */

function useInvalidateAfterWrite() {
  const qc = useQueryClient();
  return async (keys: readonly (readonly unknown[])[]) => {
    await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
    scheduleSync();
  };
}

export function useSaveSession() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (s: WorkoutSession) => repo.saveSession(s),
    onSuccess: () => inv([qk.sessions, ["history"], ["pr"], ["lastPerf"]]),
  });
}

export function useDeleteSession() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (id: string) => repo.deleteSession(id),
    onSuccess: () => inv([qk.sessions, ["history"], ["pr"], ["lastPerf"]]),
  });
}

export function useSaveRoutine() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (
      r: Partial<Routine> & Pick<Routine, "name" | "exercises">
    ) => repo.saveRoutine(r),
    onSuccess: () => inv([qk.routines]),
  });
}

export function useDeleteRoutine() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (id: string) => repo.deleteRoutine(id),
    onSuccess: () => inv([qk.routines]),
  });
}

export function useUpsertBodyMetric() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: ({
      date,
      patch,
    }: {
      date: string;
      patch: Partial<Pick<BodyMetric, "weight" | "bodyFatPct" | "muscleMass" | "note">>;
    }) => repo.upsertBodyMetric(date, patch),
    onSuccess: () => inv([qk.bodyMetrics]),
  });
}

export function useCreateExercise() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (
      input: Parameters<typeof repo.createCustomExercise>[0]
    ) => repo.createCustomExercise(input),
    onSuccess: () => inv([qk.exercises]),
  });
}

export function useUpdateProfile() {
  const inv = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => repo.updateProfile(patch),
    onSuccess: () => inv([qk.profile]),
  });
}

/** exerciseId → Exercise 빠른 맵 */
export function useExerciseMap(): Map<string, Exercise> {
  const { data } = useExercises();
  const map = new Map<string, Exercise>();
  (data ?? []).forEach((e) => map.set(e.id, e));
  return map;
}
