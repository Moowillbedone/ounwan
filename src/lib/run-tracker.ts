"use client";

// 전역 달리기 기록 상태(모듈 스토어 + localStorage). rest-timer.ts와 같은 방식.
// 화면을 옮겨도 기록이 이어지고, 앱이 강제 종료되면 다음 실행 때 '중단됨'으로 복원해
// 이어 달리거나 그대로 저장할 수 있다.

import { useSyncExternalStore } from "react";
import { startGps, haversineM, type GpsFix, type GpsError } from "./gps";
import type { RunRecord } from "./types";

const KEY = "ounwan-run";

// GPS 잡음 필터 기준
const MAX_ACCURACY_M = 30; // 이보다 부정확한 위치는 버림
const MIN_STEP_M = 3; // 이보다 짧은 이동은 제자리 떨림으로 보고 누적 보류
const MAX_SPEED_MS = 12; // 43km/h 초과 = 튐(순간이동)으로 보고 버림
const ROUTE_STEP_M = 10; // 경로 저장 간격(용량 절약)
const PACE_WINDOW_SEC = 60; // 현재 페이스 계산 구간

export interface RunState {
  status: "running" | "paused";
  interrupted: boolean; // 앱 종료 등으로 기록이 끊겼다가 복원됨
  startedAt: string; // ISO
  movingMs: number; // resumedAt 이전까지 누적된 기록 시간
  resumedAt: number | null; // 달리는 중일 때 마지막 재개 시각(epoch ms)
  distanceM: number;
  splits: number[]; // km별 소요 시간(초)
  lastSplitSec: number; // 마지막 km 지점의 기록 시간(초)
  route: [number, number][];
  anchor: { lat: number; lng: number; sec: number; time: number } | null;
  recent: { s: number; d: number }[]; // 현재 페이스용 최근 (기록초, 거리)
  accuracy: number | null; // 마지막으로 받은 위치 정확도(m)
  lastFixAt: number | null;
  gpsError: GpsError | null;
}

function read(): RunState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunState;
    if (!s?.startedAt) return null;
    // 새로 켜졌는데 '달리는 중'으로 남아 있다 = 앱이 죽었던 것. 마지막 위치 시각까지만 인정.
    if (s.status === "running") {
      const until = s.lastFixAt ?? s.resumedAt ?? Date.now();
      s.movingMs += Math.max(0, until - (s.resumedAt ?? until));
      s.resumedAt = null;
      s.status = "paused";
      s.interrupted = true;
      s.anchor = null;
    }
    return s;
  } catch {
    return null;
  }
}

let state: RunState | null = read();
let listeners: Array<() => void> = [];
let stopWatcher: (() => void) | null = null;

function persist() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
function set(next: RunState | null) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

/** 지금까지의 기록 시간(초). 일시정지 구간 제외. */
export function movingSecOf(s: RunState, now = Date.now()): number {
  const ms = s.movingMs + (s.resumedAt != null ? now - s.resumedAt : 0);
  return Math.max(0, ms / 1000);
}

/** 최근 1분 기준 현재 페이스(초/km). 판단 불가하면 null. */
export function currentPaceOf(s: RunState): number | null {
  const r = s.recent;
  if (r.length < 2) return null;
  const a = r[0];
  const b = r[r.length - 1];
  const dd = b.d - a.d;
  if (dd < 20) return null;
  return (b.s - a.s) / (dd / 1000);
}

function onFix(fix: GpsFix) {
  const s = state;
  if (!s) return;
  const base = { ...s, accuracy: fix.accuracy, lastFixAt: Date.now(), gpsError: null };
  if (s.status !== "running" || fix.accuracy > MAX_ACCURACY_M) {
    set(base);
    return;
  }
  const sec = movingSecOf(s);
  if (!s.anchor) {
    set({
      ...base,
      anchor: { lat: fix.lat, lng: fix.lng, sec, time: fix.time },
      route: s.route.length ? s.route : [[fix.lat, fix.lng]],
    });
    return;
  }
  const d = haversineM(s.anchor.lat, s.anchor.lng, fix.lat, fix.lng);
  const dt = (fix.time - s.anchor.time) / 1000;
  if (dt <= 0 || d < Math.max(MIN_STEP_M, fix.accuracy * 0.5) || d / dt > MAX_SPEED_MS) {
    set(base);
    return;
  }

  const prevDist = s.distanceM;
  const distanceM = prevDist + d;

  // km 지점을 지났으면 앵커~현재 사이를 선형 보간해 통과 시각을 구한다
  const splits = [...s.splits];
  let lastSplitSec = s.lastSplitSec;
  while (distanceM >= (splits.length + 1) * 1000) {
    const mark = (splits.length + 1) * 1000;
    const frac = (mark - prevDist) / d;
    const crossSec = s.anchor.sec + frac * (sec - s.anchor.sec);
    splits.push(Math.round(crossSec - lastSplitSec));
    lastSplitSec = crossSec;
  }

  const route = [...s.route];
  const lastPt = route[route.length - 1];
  if (!lastPt || haversineM(lastPt[0], lastPt[1], fix.lat, fix.lng) >= ROUTE_STEP_M) {
    route.push([fix.lat, fix.lng]);
  }

  const recent = [...s.recent, { s: sec, d: distanceM }].filter(
    (p) => sec - p.s <= PACE_WINDOW_SEC
  );

  set({
    ...base,
    distanceM,
    splits,
    lastSplitSec,
    route,
    recent,
    anchor: { lat: fix.lat, lng: fix.lng, sec, time: fix.time },
  });
}

function onGpsError(e: GpsError) {
  if (state) set({ ...state, gpsError: e });
}

async function ensureWatcher() {
  if (stopWatcher) return;
  stopWatcher = () => {}; // 중복 시작 방지(비동기 등록 중)
  try {
    stopWatcher = await startGps(onFix, onGpsError);
  } catch {
    stopWatcher = null;
    onGpsError("unavailable");
  }
}
function releaseWatcher() {
  stopWatcher?.();
  stopWatcher = null;
}

export function startRun() {
  set({
    status: "running",
    interrupted: false,
    startedAt: new Date().toISOString(),
    movingMs: 0,
    resumedAt: Date.now(),
    distanceM: 0,
    splits: [],
    lastSplitSec: 0,
    route: [],
    anchor: null,
    recent: [],
    accuracy: null,
    lastFixAt: null,
    gpsError: null,
  });
  void ensureWatcher();
}

export function pauseRun() {
  const s = state;
  if (!s || s.status !== "running") return;
  // 멈춘 동안 걸어간 거리는 세지 않도록 앵커를 비운다(재개 시 새로 잡음)
  set({
    ...s,
    status: "paused",
    movingMs: s.movingMs + (Date.now() - (s.resumedAt ?? Date.now())),
    resumedAt: null,
    anchor: null,
    recent: [],
  });
}

export function resumeRun() {
  const s = state;
  if (!s || s.status !== "paused") return;
  set({ ...s, status: "running", interrupted: false, resumedAt: Date.now(), anchor: null });
  void ensureWatcher();
}

/** 기록 종료 → 저장용 결과 반환(상태는 비움). */
export function finishRun(): { startedAt: string; endedAt: string; record: RunRecord } | null {
  const s = state;
  if (!s) return null;
  releaseWatcher();
  const movingSec = Math.round(movingSecOf(s));
  const out = {
    startedAt: s.startedAt,
    endedAt: new Date().toISOString(),
    record: {
      distanceM: Math.round(s.distanceM),
      movingSec,
      splits: s.splits,
      route: simplifyRoute(s.route),
    },
  };
  set(null);
  return out;
}

export function discardRun() {
  releaseWatcher();
  set(null);
}

/** 화면 진입 시: 달리는 중인데 수집기가 없으면(새로고침 등) 다시 붙인다. */
export function reattachRun() {
  if (state?.status === "running") void ensureWatcher();
}

function simplifyRoute(route: [number, number][], max = 1500): [number, number][] {
  const stride = Math.max(1, Math.ceil(route.length / max));
  const out: [number, number][] = [];
  route.forEach((p, i) => {
    if (i % stride === 0 || i === route.length - 1) {
      out.push([Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
    }
  });
  return out;
}

export function useRun(): RunState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    () => state,
    () => null
  );
}

/* ---------- 표시용 포맷 ---------- */

export function fmtKm(m: number): string {
  return (m / 1000).toFixed(2);
}

/** 초/km → 5'32" */
export function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "--'--\"";
  const t = Math.round(secPerKm);
  return `${Math.floor(t / 60)}'${String(t % 60).padStart(2, "0")}"`;
}

/** 초 → 1:02:03 / 12:34 */
export function fmtClock(sec: number): string {
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}
