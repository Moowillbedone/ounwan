import type { Unit, WorkoutSet, WorkoutSession, BodyPart } from "./types";

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

/** Epley 1RM 추정 */
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
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
    if (bp && completed.length > 0) parts.add(bp);
    // 볼륨은 '중량+횟수' 방식만 집계(횟수만/시간만은 0)
    if (!ex.trackingMode || ex.trackingMode === "weight_reps") {
      volume += setsVolume(ex.sets);
    }
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
export function computeStreak(dateKeys: Set<string>): {
  current: number;
  longest: number;
} {
  if (dateKeys.size === 0) return { current: 0, longest: 0 };
  const sorted = [...dateKeys].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = dateKeyToDate(k);
    if (prev && (d.getTime() - prev.getTime()) / 86400000 === 1) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }
  // 현재 스트릭: 오늘 또는 어제부터 역방향 연속
  let current = 0;
  const cursor = dateKeyToDate(todayKey());
  if (!dateKeys.has(toDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // 오늘 안 했으면 어제부터
  }
  while (dateKeys.has(toDateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}
