"use client";

import { useSyncExternalStore } from "react";
import type { DayLabel, SetType, TrackingMode } from "./types";

// 운동 복사/붙여넣기용 클립보드 (localStorage 기반, 탭/새로고침에도 유지)
export interface ClipSet {
  setType: SetType;
  weight: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
  restSeconds?: number | null;
  isCompleted: boolean;
}
export interface ClipExercise {
  exerciseId: string;
  note?: string | null;
  trackingMode?: TrackingMode;
  restSeconds?: number | null;
  supersetGroup?: number | null; // 슈퍼세트 묶음(복사 시 유지)
  gps?: boolean; // GPS 러닝 종목(붙여넣으면 측정 전 상태로)
  sets: ClipSet[];
}
export interface WorkoutClip {
  sourceDate: string;
  title: string | null;
  label?: string | null;
  labelColor?: string | null;
  exercises: ClipExercise[];
  /** 하루 전체 복사일 때: 그날의 운동들(각각 한 세션) + 하루 대표 라벨 */
  day?: {
    sessions: Omit<WorkoutClip, "day">[];
    dayLabel?: DayLabel | null;
  };
}

/** 붙여넣을 세션 목록 — 단일 복사면 1개, 하루 전체 복사면 그날의 모든 운동 */
export function clipSessions(clip: WorkoutClip): Omit<WorkoutClip, "day">[] {
  return clip.day ? clip.day.sessions : [clip];
}

const KEY = "ounwan-clip";

function read(): WorkoutClip | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

let cached: WorkoutClip | null = read();
let listeners: Array<() => void> = [];
function emit() {
  listeners.forEach((l) => l());
}

export function setClipboard(clip: WorkoutClip) {
  localStorage.setItem(KEY, JSON.stringify(clip));
  cached = clip;
  emit();
}
export function clearClipboard() {
  localStorage.removeItem(KEY);
  cached = null;
  emit();
}

export function useClipboard(): WorkoutClip | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cached = read();
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => cached,
    () => null
  );
}
