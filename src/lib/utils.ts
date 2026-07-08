import type {
  Unit,
  WorkoutSet,
  WorkoutSession,
  SessionExercise,
  BodyPart,
} from "./types";

/** uuid (브라우저/Node 24 모두 지원) */
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** 로컬 타임존 기준 YYYY-MM-DD */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/**
 * 추정 1RM (estimated one-rep max).
 * - 1RM은 그 종목을 딱 1회 들 수 있는 최대 중량의 "추정치"로, 체중과는 무관하다.
 * - 여러 번 든 세트(예: 60kg×10)로부터 1회 최대치를 역산하므로 실제 1회 시도보다 높게 나온다(정상).
 * - 반복수가 많아질수록 공식 오차가 커져 12회로 상한을 두고, Epley·Brzycki 평균으로 보수적으로 추정.
 */
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  const r = Math.min(reps, 12); // 12회 초과는 신뢰도가 급락 → 상한
  const epley = weight * (1 + r / 30);
  const brzycki = weight * (36 / (37 - r));
  return (epley + brzycki) / 2;
}

/** kg ↔ 표시 단위 */
export const LB_PER_KG = 2.20462262;

export function toDisplayWeight(kg: number, unit: Unit): number {
  const v = unit === "lb" ? kg * LB_PER_KG : kg;
  return Math.round(v * 100) / 100;
}

export function fromDisplayWeight(v: number, unit: Unit): number {
  const kg = unit === "lb" ? v / LB_PER_KG : v;
  return Math.round(kg * 1000) / 1000;
}

export function fmtWeight(kg: number, unit: Unit): string {
  const v = toDisplayWeight(kg, unit);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
  return `${s}${unit}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 세트 배열의 볼륨(kg·reps) — 완료 세트만, 웜업 제외 */
export function setsVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => {
    if (!s.isCompleted || s.setType === "warmup") return sum;
    return sum + s.weight * s.reps;
  }, 0);
}

/** 운동 하나의 볼륨(kg·회) — '중량+횟수' 모드만 집계(횟수만/시간만은 0). 통계 전반 일관성용. */
export function exerciseVolume(ex: SessionExercise): number {
  if (ex.trackingMode && ex.trackingMode !== "weight_reps") return 0;
  return setsVolume(ex.sets);
}

export function bestSet1RM(sets: WorkoutSet[]): number {
  return sets.reduce((best, s) => {
    if (!s.isCompleted) return best;
    return Math.max(best, estimate1RM(s.weight, s.reps));
  }, 0);
}

/** 세션 파생값 재계산(부위/볼륨/세트수) — exerciseId→bodyPart 매핑 필요 */
export function recomputeSessionDerived(
  session: WorkoutSession,
  bodyPartOf: (exerciseId: string) => BodyPart | undefined
): Pick<WorkoutSession, "bodyParts" | "totalVolume" | "totalSets"> {
  const parts = new Set<BodyPart>();
  let volume = 0;
  let setCount = 0;
  for (const ex of session.exercises) {
    const bp = bodyPartOf(ex.exerciseId);
    const completed = ex.sets.filter((s) => s.isCompleted);
    // 부위는 '이 세션이 자극하는 부위'로 표기 → 계획(미완료)만 있어도 캘린더에 보이게
    if (bp && ex.sets.length > 0) parts.add(bp);
    volume += exerciseVolume(ex); // '중량+횟수' 모드만 집계(완료 세트)
    setCount += completed.length;
  }
  return {
    bodyParts: [...parts],
    totalVolume: Math.round(volume),
    totalSets: setCount,
  };
}

/** 초 → mm:ss */
export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 상대 날짜 라벨 */
export function relativeDayLabel(key: string): string {
  const t = todayKey();
  if (key === t) return "오늘";
  const diff = Math.round(
    (dateKeyToDate(t).getTime() - dateKeyToDate(key).getTime()) / 86400000
  );
  if (diff === 1) return "어제";
  if (diff > 1 && diff < 7) return `${diff}일 전`;
  const d = dateKeyToDate(key);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 연속기록(스트릭) 계산 — 운동한 날짜 집합 기준 */
/**
 * 실제로 '완료'된 운동 세션인지 판정.
 * [운동 시작]→[운동 종료]로 endedAt이 찍힌 세션만 완료로 본다.
 * (미래 요일에 미리 저장해둔 계획 세션이나 진행 중 세션은 제외 → 연속기록·통계 카운트에서 빠짐)
 */
export function isSessionDone(s: { endedAt?: string | null }): boolean {
  return !!s.endedAt;
}

/** 주(週) 시작 자정의 epoch(ms). weekStartsOn: 0=일요일, 1=월요일. 로컬 타임존 기준. */
function weekStartMs(key: string, weekStartsOn: 0 | 1): number {
  const d = dateKeyToDate(key);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 관대한 연속기록. 단위는 '일'이지만 휴식일로는 끊기지 않는다.
 * 끊김 조건은 오직 "운동 0회인 완결된 한 주(週)"가 생겼을 때뿐 —
 * 한 주에 한 번이라도 운동하면 그 주는 연속을 이어준다(주3회+휴식4일도 유지).
 * 진행 중인 이번 주는 아직 0회여도 깨지 않고 유예한다(주가 끝나야 판정).
 * weekStartsOn을 캘린더/잔디와 동일하게 넘겨 주 경계를 통일한다.
 */
export function computeStreak(
  dateKeys: Set<string>,
  weekStartsOn: 0 | 1 = 1
): { current: number; longest: number } {
  if (dateKeys.size === 0) return { current: 0, longest: 0 };
  const sorted = [...dateKeys].sort();
  const WEEK = 7 * 86400000;
  // 두 운동일 사이에 '통째로 빈 주'가 없으면 연결(같은 주=0, 인접 주=1 허용).
  // DST로 주 간격이 ±1시간 흔들려도 반올림으로 안전.
  const linked = (a: string, b: string) =>
    Math.round((weekStartMs(b, weekStartsOn) - weekStartMs(a, weekStartsOn)) / WEEK) <= 1;

  // 최장: 인접 운동일이 '연결'인 동안 이어지는 총 운동일 수의 최댓값
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = linked(sorted[i - 1], sorted[i]) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // 현재: 최근 운동이 이번 주(0) 또는 지난 주(1, 유예)에 있어야 살아있음.
  // 그 이전에 '완결된 빈 주'가 있으면(gap>=2) 끊긴 것.
  const lastKey = sorted[sorted.length - 1];
  const gapWeeks = Math.round(
    (weekStartMs(todayKey(), weekStartsOn) - weekStartMs(lastKey, weekStartsOn)) / WEEK
  );
  let current = 0;
  if (gapWeeks <= 1) {
    current = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
      if (linked(sorted[i - 1], sorted[i])) current += 1;
      else break;
    }
  }
  return { current, longest };
}
