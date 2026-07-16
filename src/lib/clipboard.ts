"use client";

import { useSyncExternalStore } from "react";
import type { SetType, TrackingMode } from "./types";

// 운동 복사/붙여넣기용 클립보드 (localStorage 기반, 탭/새로고침에도 유지)
export interface ClipSet {
  setType: SetType;
  weight: number;
  reps: number;
  durationSec?: number | null;
  restSeconds?: number | null;
  isCompleted: boolean;
}
export interface ClipExercise {
  exerciseId: string;
  note?: string | null;
  trackingMode?: TrackingMode;
  restSeconds?: number | null;
  sets: ClipSet[];
}
export interface WorkoutClip {
  sourceDate: string;
  title: string | null;
  label?: string | null;
  labelColor?: string | null;
  exercises: ClipExercise[];
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
