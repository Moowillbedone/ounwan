"use client";

// 전역 휴식 타이머 상태(모듈 스토어 + localStorage).
// 화면을 벗어나도(다른 탭으로 이동/재진입) 타이머가 유지되고 종료음도 예약된 채 살아있음.
// - 종료음은 startRest 시점(세트 완료 제스처)에 Web Audio 타임라인에 예약됨(R10 방식).
//   SPA 네비게이션은 모듈 상태·예약음 모두 유지. 새로고침 시 시각 타이머는 복원되나
//   오디오 컨텍스트는 사라져 소리는 재예약되지 않음(제스처 없이는 언락 불가).

import { useSyncExternalStore } from "react";
import { scheduleRestSound, cancelScheduledRestSound } from "./feedback";
import type { RestSound } from "./types";

const KEY = "ounwan-rest";
const EXPIRE_GRACE_MS = 120_000; // 종료 후 2분 지난 잔여 상태는 정리

export interface RestState {
  endsAt: number;
  sound: RestSound;
  alert: boolean; // 소리/진동 알림 사용 여부(Profile.restAlert)
}

function read(): RestState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RestState;
    if (!s?.endsAt || s.endsAt < Date.now() - EXPIRE_GRACE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

let state: RestState | null = read();
let listeners: Array<() => void> = [];

function persist() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
function emit() {
  listeners.forEach((l) => l());
}

/** 휴식 시작(세트 완료 제스처 안에서 호출). 종료음을 오디오 타임라인에 예약. */
export function startRest(seconds: number, sound: RestSound, alert = true) {
  cancelScheduledRestSound();
  state = { endsAt: Date.now() + seconds * 1000, sound, alert };
  persist();
  if (alert && seconds > 0) scheduleRestSound(sound, seconds);
  emit();
}

/** +/-초 조정 → 예약음 취소 후 새 종료시각으로 재예약. */
export function adjustRest(deltaMs: number) {
  if (!state) return;
  const endsAt = state.endsAt + deltaMs;
  cancelScheduledRestSound();
  state = { ...state, endsAt };
  persist();
  const remain = (endsAt - Date.now()) / 1000;
  if (state.alert && remain > 0) scheduleRestSound(state.sound, remain);
  emit();
}

/** 휴식 종료/닫기 → 예약음 취소, 상태 제거. */
export function stopRest() {
  cancelScheduledRestSound();
  state = null;
  persist();
  emit();
}

export function useRestTimer(): RestState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          state = read();
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    () => state,
    () => null
  );
}
