"use client";

// 전역 달리기 기록 상태(모듈 스토어 + localStorage). rest-timer.ts와 같은 방식.
// 화면을 옮겨도 기록이 이어지고, 앱이 강제 종료되면 다음 실행 때 '중단됨'으로 복원해
// 이어 달리거나 그대로 저장할 수 있다.

import { useSyncExternalStore } from "react";
import { startGps, haversineM, type GpsFix, type GpsError } from "./gps";
import type { RunRecord } from "./types";
import { speak, spokenDuration } from "./voice";
import { startStepSensor, readStepSensor } from "./steps";

const KEY = "ounwan-run";

// GPS 잡음 필터 기준
const MAX_ACCURACY_M = 30; // 이보다 부정확한 위치는 버림
const MIN_STEP_M = 3; // 이보다 짧은 이동은 제자리 떨림으로 보고 누적 보류
const MAX_SPEED_MS = 12; // 43km/h 초과 = 튐(순간이동)으로 보고 버림
const ROUTE_STEP_M = 10; // 경로 저장 간격(용량 절약)
const PACE_WINDOW_SEC = 60; // 현재 페이스 계산 구간
const CADENCE_WINDOW_SEC = 60; // 현재 케이던스 계산 구간

/** 운동 기록 화면에서 시작한 러닝이면, 끝났을 때 결과를 넣을 세션·운동 */
export interface RunLink {
  sessionId: string;
  exId: string;
}

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
  /** 달리는 중 위치 업데이트 사이 최장 공백(초) — 화면 꺼짐 중 수집이 끊겼는지 자가 점검용 */
  maxGapSec?: number;
  link?: RunLink | null;
  // 걸음 센서(앱 전용): 달리는 구간의 센서 증가분만 더한다
  steps?: number;
  stepLast?: number | null; // 마지막 센서 누적값(일시정지·재개 직후엔 null → 다음 값이 기준)
  stepRecent?: { s: number; n: number }[]; // 현재 케이던스용 최근 (기록초, 걸음)
  stepsOk?: boolean; // 센서 값을 한 번이라도 받았는지
  /** 실내(트레드밀) 모드: GPS 거리 대신 걸음 × 보폭으로 거리 추정(끝낼 때 실제 값 입력) */
  indoor?: boolean;
  strideM?: number; // 실내 모드 보폭(m/걸음)
}

const STRIDE_KEY = "ounwan-stride";

/** 실내 러닝 보폭(m/걸음): 지난번 입력으로 배운 값 → 키 × 0.6 → 1.0m */
export function strideFor(heightCm?: number | null): number {
  try {
    const v = Number(localStorage.getItem(STRIDE_KEY));
    if (v >= 0.4 && v <= 2.2) return v;
  } catch {
    /* noop */
  }
  return heightCm && heightCm > 100 ? (heightCm / 100) * 0.6 : 1.0;
}

/** 실내 러닝을 끝내며 입력한 실제 거리로 보폭을 배운다(다음 추정이 정확해짐) */
export function learnStride(meters: number, steps: number | null | undefined) {
  if (!steps || steps < 200 || meters <= 0) return;
  const v = meters / steps;
  if (v < 0.4 || v > 2.2) return;
  try {
    localStorage.setItem(STRIDE_KEY, String(Math.round(v * 1000) / 1000));
  } catch {
    /* noop */
  }
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
      s.stepLast = null;
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

/** 센서 누적값을 받아 달린 걸음을 더한다(재부팅으로 값이 줄면 기준만 다시 잡음) */
function withSteps(s: RunState, total: number): RunState {
  const last = s.stepLast ?? null;
  const add = last != null && total >= last ? total - last : 0;
  const steps = (s.steps ?? 0) + add;
  const sec = movingSecOf(s);
  const stepRecent = [...(s.stepRecent ?? []), { s: sec, n: steps }].filter(
    (p) => sec - p.s <= CADENCE_WINDOW_SEC
  );
  const next = { ...s, steps, stepLast: total, stepRecent, stepsOk: true };
  if (s.indoor) {
    // 실내: 거리 = 걸음 × 보폭(추정), 현재 페이스도 이 값으로
    next.distanceM = steps * (s.strideM ?? 1);
    next.recent = [...s.recent, { s: sec, d: next.distanceM }].filter((p) => sec - p.s <= PACE_WINDOW_SEC);
  }
  return next;
}

function onStepSensor(total: number) {
  const s = state;
  if (!s || s.status !== "running") return; // 멈춘 동안 걸음은 세지 않음
  set(withSteps(s, total));
}

/** 최근 1분 기준 현재 케이던스(걸음/분). 판단 불가하면 null. */
export function currentCadenceOf(s: RunState): number | null {
  const r = s.stepRecent ?? [];
  if (r.length < 2) return null;
  const a = r[0];
  const b = r[r.length - 1];
  if (b.s - a.s < 15) return null;
  return ((b.n - a.n) / (b.s - a.s)) * 60;
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
  const now = Date.now();
  // 달리는 중 연속된 두 위치 사이 공백(일시정지·재개 직후 첫 위치는 제외)
  const gap =
    s.status === "running" && s.lastFixAt != null && s.resumedAt != null && s.lastFixAt >= s.resumedAt
      ? (now - s.lastFixAt) / 1000
      : 0;
  const base = {
    ...s,
    accuracy: fix.accuracy,
    lastFixAt: now,
    gpsError: null,
    maxGapSec: Math.max(s.maxGapSec ?? 0, Math.round(gap)),
  };
  if (s.indoor) return; // 실내: 위치는 쓰지 않음(위치 서비스는 화면이 꺼져도 앱이 살아 있게 하려고 켜 둠)
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

  // 새로 완주한 km마다 음성 안내(구간 페이스·총 시간)
  for (let k = s.splits.length; k < splits.length; k++) {
    void speak(
      `${k + 1}킬로미터. 구간 페이스 ${spokenDuration(splits[k])}. 총 시간 ${spokenDuration(
        splits.slice(0, k + 1).reduce((n, x) => n + x, 0)
      )}.`
    );
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

let stopSteps: (() => void) | null = null;

async function ensureWatcher() {
  if (!stopSteps) {
    stopSteps = () => {};
    void startStepSensor(onStepSensor).then((stop) => {
      // 그사이 기록이 끝났으면 바로 끈다
      if (stopSteps && state) stopSteps = stop;
      else stop();
    });
  }
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
  stopSteps?.();
  stopSteps = null;
}

export function startRun(link: RunLink | null = null, indoor?: { strideM: number }) {
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
    link,
    steps: 0,
    stepLast: null,
    stepRecent: [],
    stepsOk: false,
    indoor: !!indoor,
    strideM: indoor?.strideM,
  });
  void ensureWatcher();
  void speak(indoor ? "실내 러닝을 시작합니다" : "러닝을 시작합니다");
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
  // 멈춘 순간까지의 걸음을 마저 더하고, 재개 전까지는 세지 않음
  void readStepSensor().then((v) => {
    const cur = state;
    if (!cur || cur.status !== "paused") return;
    set({ ...(v != null ? withSteps(cur, v) : cur), stepLast: null, stepRecent: [] });
  });
  void speak("일시정지");
}

export function resumeRun() {
  const s = state;
  if (!s || s.status !== "paused") return;
  set({
    ...s,
    status: "running",
    interrupted: false,
    resumedAt: Date.now(),
    anchor: null,
    stepLast: null,
    stepRecent: [],
  });
  void ensureWatcher();
  void speak("다시 달립니다");
}

export interface RunResult {
  startedAt: string;
  endedAt: string;
  record: RunRecord;
  link: RunLink | null;
}

/** 기록 종료 → 저장용 결과 반환(상태는 비움). */
export async function finishRun(): Promise<RunResult | null> {
  let s = state;
  if (!s) return null;
  if (s.status === "running") {
    const v = await readStepSensor(); // 마지막 걸음까지
    if (v != null && state) s = withSteps(state, v);
  }
  if (!s) return null;
  releaseWatcher();
  const movingSec = Math.round(movingSecOf(s));
  const endedAt = new Date().toISOString();
  const out: RunResult = {
    startedAt: s.startedAt,
    endedAt,
    link: s.link ?? null,
    record: {
      distanceM: Math.round(s.distanceM),
      movingSec,
      splits: s.splits,
      route: simplifyRoute(s.route),
      startedAt: s.startedAt,
      endedAt,
      steps: s.stepsOk ? Math.round(s.steps ?? 0) : null,
      ...(s.indoor ? { indoor: true } : {}),
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
