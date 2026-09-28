import type { Exercise, WorkoutSession } from "./types";
import { dateKeyToDate, isSessionDone, toDateKey } from "./utils";

/* ------------------------------------------------------------------ *
 * 러닝·유산소 분석. 기준값은 모두 출처가 있고 화면에도 근거를 밝힌다.
 * - 유산소 권장량: WHO 2020 신체활동 가이드라인
 * - 거리 급증: Frandsen 외 2025 (BJSM) 5,200여 명 러너 코호트
 * - 능력 점수·예상 기록: Daniels & Gilbert VDOT 공식
 * ------------------------------------------------------------------ */

/** 러닝으로 보는 종목(러닝 분석·예상 기록 대상) */
export const RUN_SLUGS = new Set(["outdoor-running", "treadmill-running"]);

export const WHO_SOURCE =
  "WHO 2020 신체활동 가이드라인: 성인은 주 150~300분 중강도 또는 75~150분 고강도 유산소(섞으면 고강도 1분=중강도 2분), 근력 운동은 주 2일 이상.";
export const SPIKE_SOURCE =
  "Frandsen 외 2025(BJSM, 러너 5,200여 명 코호트): 한 번 달린 거리가 최근 30일 최장 거리보다 10% 넘게 길면 부상 위험이 높아졌어요. 주간 총량을 서서히 늘리는 것보다 '한 번에 확 늘리는 것'이 위험 신호였어요.";
export const VDOT_SOURCE =
  "Daniels & Gilbert의 VDOT 공식으로 거리·시간에서 달리기 능력 점수를 구하고, 같은 점수로 다른 거리의 예상 기록을 계산해요. 훈련 러닝은 전력 질주가 아니라서 실제 대회 기록보다 느리게 예측되는 게 보통이에요.";

export interface RunEntry {
  date: string;
  sessionId: string;
  meters: number;
  sec: number; // 0이면 시간 미입력
}

function isRunExercise(id: string, exMap: Map<string, Exercise>): boolean {
  return RUN_SLUGS.has(exMap.get(id)?.slug ?? id);
}

/** 완료한 세션에서 러닝 기록만 뽑는다(거리 방식 세트 합, 없으면 GPS run 필드). 날짜순. */
export function runsOf(sessions: WorkoutSession[], exMap: Map<string, Exercise>): RunEntry[] {
  const out: RunEntry[] = [];
  for (const s of sessions) {
    if (!isSessionDone(s)) continue;
    let meters = 0;
    let sec = 0;
    for (const ex of s.exercises) {
      if (ex.trackingMode !== "distance" || !isRunExercise(ex.exerciseId, exMap)) continue;
      for (const st of ex.sets) {
        if (!st.isCompleted) continue;
        meters += st.distanceM ?? 0;
        sec += st.durationSec ?? 0;
      }
    }
    if (meters === 0 && s.run) {
      meters = s.run.distanceM;
      sec = s.run.movingSec;
    }
    if (meters > 0) out.push({ date: s.date, sessionId: s.id, meters, sec });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function shiftKey(key: string, days: number): string {
  const d = dateKeyToDate(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/**
 * 최근 7일 WHO 기준 활동량.
 * 유산소 분: 유산소 종목의 완료 세트 시간(러닝은 고강도, 그 외는 중강도로 보수적으로 집계).
 * 근력 일수: 근력·맨몸 종목 완료 세트가 있는 날 수.
 */
export function whoWeek(
  sessions: WorkoutSession[],
  exMap: Map<string, Exercise>,
  today: string
) {
  const from = shiftKey(today, -6);
  let vigorousMin = 0;
  let moderateMin = 0;
  const strengthDays = new Set<string>();
  for (const s of sessions) {
    if (!isSessionDone(s) || !inRange(s.date, from, today)) continue;
    for (const ex of s.exercises) {
      const meta = exMap.get(ex.exerciseId);
      const done = ex.sets.filter((x) => x.isCompleted);
      if (done.length === 0) continue;
      if (meta?.category === "cardio") {
        const min = done.reduce((n, x) => n + (x.durationSec ?? 0), 0) / 60;
        if (isRunExercise(ex.exerciseId, exMap)) vigorousMin += min;
        else moderateMin += min;
      } else if (meta?.category === "strength" || meta?.category === "bodyweight") {
        strengthDays.add(s.date);
      }
    }
  }
  // GPS 러닝만 있고 세트 시간이 비어 있는 옛 기록 보정
  const runs = runsOf(sessions, exMap).filter((r) => inRange(r.date, from, today));
  const runSetMin = vigorousMin;
  const runGpsMin = runs.reduce((n, r) => n + r.sec / 60, 0);
  if (runSetMin === 0 && runGpsMin > 0) vigorousMin = runGpsMin;

  vigorousMin = Math.round(vigorousMin);
  moderateMin = Math.round(moderateMin);
  return {
    vigorousMin,
    moderateMin,
    equivalentMin: moderateMin + vigorousMin * 2, // 중강도 환산
    strengthDays: strengthDays.size,
  };
}

/** 가장 최근 러닝이 '최근 30일 최장 거리' 대비 얼마나 긴지(급증 확인) */
export function latestSpike(runs: RunEntry[]) {
  if (runs.length === 0) return null;
  const last = runs[runs.length - 1];
  const from = shiftKey(last.date, -30);
  const prior = runs.filter((r) => r.date >= from && r.date < last.date);
  if (prior.length === 0) return { last, longestPrior: null, ratio: null };
  const longestPrior = Math.max(...prior.map((r) => r.meters));
  return { last, longestPrior, ratio: last.meters / longestPrior };
}

/** 주간 러닝 거리(최근 n주, 주 시작 요일 기준). 오래된 주 → 이번 주 순서 */
export function weeklyKm(
  runs: RunEntry[],
  today: string,
  weekStartsOn: 0 | 1,
  weeks = 8
): { weekStart: string; km: number }[] {
  const t = dateKeyToDate(today);
  const start = new Date(t);
  start.setDate(start.getDate() - ((t.getDay() - weekStartsOn + 7) % 7));
  const out: { weekStart: string; km: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = new Date(start);
    ws.setDate(ws.getDate() - w * 7);
    const wsKey = toDateKey(ws);
    const weKey = shiftKey(wsKey, 6);
    const m = runs.filter((r) => inRange(r.date, wsKey, weKey)).reduce((n, r) => n + r.meters, 0);
    out.push({ weekStart: wsKey, km: Math.round(m / 100) / 10 });
  }
  return out;
}

/* ---------------- VDOT (Daniels & Gilbert) ---------------- */

/** 거리(m)·시간(초)으로 VDOT. 공식이 맞는 범위(약 3~42km, 3.5분 이상)만 계산. */
export function vdotOf(meters: number, sec: number): number | null {
  if (meters < 3000 || meters > 42500 || sec < 210) return null;
  const t = sec / 60;
  const v = meters / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct =
    0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const vdot = vo2 / pct;
  return isFinite(vdot) && vdot > 0 ? vdot : null;
}

/** 같은 VDOT로 해당 거리를 달리는 예상 시간(초) — 이분 탐색 */
export function predictSec(vdot: number, meters: number): number {
  let lo = 210;
  let hi = 60 * 60 * 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = vdotOf(meters, mid) ?? 0;
    // 시간이 길수록 VDOT가 낮아진다
    if (v > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** 최근 90일 러닝 중 VDOT가 가장 높은 기록(시간 입력된 3km 이상) */
export function bestVdot(runs: RunEntry[], today: string) {
  const from = shiftKey(today, -90);
  let best: { vdot: number; run: RunEntry } | null = null;
  for (const r of runs) {
    if (r.date < from || r.sec <= 0) continue;
    const v = vdotOf(r.meters, r.sec);
    if (v != null && (!best || v > best.vdot)) best = { vdot: v, run: r };
  }
  return best;
}

export const PREDICT_DISTANCES = [
  { label: "5km", meters: 5000 },
  { label: "10km", meters: 10000 },
  { label: "하프", meters: 21097.5 },
  { label: "풀코스", meters: 42195 },
];
