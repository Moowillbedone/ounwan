import type {
  BodyPart,
  BodyMetric,
  Exercise,
  Profile,
  WorkoutSession,
} from "./types";
import { estimate1RM, exerciseVolume, isSessionDone, dateKeyToDate } from "./utils";
import { liftKeyFor } from "./strength-standards";

/* ------------------------------------------------------------------ *
 * 분석 엔진 — '운동 종료까지 누른 세션'만 사용한다(캘린더 도장·통계와 동일 기준).
 * 서버 없이 로컬 데이터만으로 계산한다.
 * ------------------------------------------------------------------ */

export const ANALYSIS_WINDOW_DAYS = 28; // 최근 4주

/** 체중을 드는 종목 — 기록의 '무게'는 추가중량이므로 총중량 = 체중 + 추가중량 */
export const BODYWEIGHT_LIFTS = new Set([
  "pull-up",
  "chin-up",
  "wide-grip-pull-up",
]);

/** 밀기/당기기 분류 — 부위만으로는 알 수 없어 종목 슬러그/이름으로 판정 */
export type Pattern = "push" | "pull" | "legs" | "core" | "other";

const PULL_HINTS = [
  "row", "pull", "chin", "curl", "shrug", "face-pull", "pulldown", "deadlift",
  "good-morning", "hip-thrust", "leg-curl", "rear-delt", "reverse-fly",
];
const PUSH_HINTS = [
  "press", "push", "dip", "fly", "extension", "pushdown", "skull", "raise",
  "kickback",
];

export function classifyPattern(ex: Exercise | undefined): Pattern {
  if (!ex) return "other";
  const slug = ex.slug ?? ex.id ?? "";
  if (ex.bodyPart === "복근/코어") return "core";
  if (ex.bodyPart === "하체") return "legs";
  if (ex.bodyPart === "유산소" || ex.bodyPart === "전신") return "other";
  // 등/이두 계열은 당기기, 가슴/어깨/삼두는 밀기
  if (ex.bodyPart === "등") return "pull";
  if (PULL_HINTS.some((h) => slug.includes(h))) return "pull";
  if (PUSH_HINTS.some((h) => slug.includes(h))) return "push";
  if (ex.bodyPart === "가슴" || ex.bodyPart === "어깨") return "push";
  return "other";
}

export interface PartLoad {
  part: BodyPart;
  sets: number; // 완료 세트 수
  volume: number; // kg·회
  weeklySets: number; // 주당 환산
  sessions: number; // 이 부위를 자극한 세션 수
  weeklyFreq: number; // 주당 빈도
}

export interface LiftBest {
  exerciseId: string;
  nameKo: string;
  best1RM: number;
  topWeight: number;
  topReps: number;
  date: string;
  /** 이 종목을 기록한 서로 다른 날짜 수 — 1일치로는 등급을 매기지 않는다 */
  dayCount: number;
  /** 기록한 날짜들 — 같은 기준표를 쓰는 종목끼리 합칠 때 필요(dayCount만으론 합산 불가) */
  days: string[];
}

/** 최고기록 집계에서 빠진 이유 — 화면에서 사용자에게 그대로 설명한다 */
export type ExcludeReason =
  | "tracking" // 중량×횟수로 기록하지 않는 종목(시간·횟수만 등)
  | "no-bodyweight" // 맨몸 종목인데 체중을 몰라 환산 불가
  | "reps" // 완료 세트가 전부 13회 이상이라 1RM 추정 불가
  | "no-weight"; // 무게가 0인 기록만 있음

export interface ExcludedLift {
  exerciseId: string;
  nameKo: string;
  reason: ExcludeReason;
}

export interface AnalysisInput {
  sessions: WorkoutSession[];
  exMap: Map<string, Exercise>;
  metrics: BodyMetric[];
  profile: Profile | undefined;
  today: string; // YYYY-MM-DD (테스트 가능하도록 주입)
}

export interface AnalysisBase {
  doneSessions: WorkoutSession[];
  recentSessions: WorkoutSession[]; // 최근 4주
  weeks: number; // 분석에 쓴 주 수
  totalDays: number; // 완료한 총 운동 일수
  spanDays: number; // 첫 완료일~오늘
  parts: PartLoad[];
  pattern: { push: number; pull: number; legs: number; core: number }; // 세트 수
  upperLowerSets: { upper: number; lower: number };
  bests: Map<string, LiftBest>; // exerciseId → 최고 기록(전 기간)
  /** 기록은 있지만 최고기록 집계에서 빠진 종목 + 사유 */
  excluded: ExcludedLift[];
  frequency: { perWeek: number; avgDurationMin: number | null; totalSessions: number };
  bodyweight: number | null;
  /** 체중을 마지막으로 기록한 날짜(오래되면 비교가 흔들린다) */
  bodyweightDate: string | null;
  bodyweightAgeDays: number | null;
  age: number | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (dateKeyToDate(b).getTime() - dateKeyToDate(a).getTime()) / 86400000
  );
}

export function buildBase({
  sessions,
  exMap,
  metrics,
  profile,
  today,
}: AnalysisInput): AnalysisBase {
  const doneSessions = sessions
    .filter(isSessionDone)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentSessions = doneSessions.filter(
    (s) => daysBetween(s.date, today) < ANALYSIS_WINDOW_DAYS
  );

  const spanDays = doneSessions.length
    ? Math.max(1, daysBetween(doneSessions[0].date, today) + 1)
    : 0;

  // 최근 4주 실측 주 수(기록이 짧으면 그만큼만 나눠 과소평가를 막는다)
  const weeks = Math.max(
    1,
    Math.min(
      ANALYSIS_WINDOW_DAYS / 7,
      spanDays > 0 ? spanDays / 7 : ANALYSIS_WINDOW_DAYS / 7
    )
  );

  /* 부위별 부하 (최근 4주) */
  const partMap = new Map<BodyPart, { sets: number; volume: number; days: Set<string> }>();
  const pattern = { push: 0, pull: 0, legs: 0, core: 0 };

  for (const s of recentSessions) {
    for (const ex of s.exercises) {
      const meta = exMap.get(ex.exerciseId);
      const part = meta?.bodyPart;
      const doneSets = ex.sets.filter((x) => x.isCompleted).length;
      if (doneSets === 0) continue;
      if (part) {
        const cur = partMap.get(part) ?? { sets: 0, volume: 0, days: new Set<string>() };
        cur.sets += doneSets;
        cur.volume += exerciseVolume(ex);
        cur.days.add(s.date);
        partMap.set(part, cur);
      }
      const p = classifyPattern(meta);
      if (p === "push") pattern.push += doneSets;
      else if (p === "pull") pattern.pull += doneSets;
      else if (p === "legs") pattern.legs += doneSets;
      else if (p === "core") pattern.core += doneSets;
    }
  }

  const parts: PartLoad[] = [...partMap.entries()]
    .map(([part, v]) => ({
      part,
      sets: v.sets,
      volume: Math.round(v.volume),
      weeklySets: Math.round((v.sets / weeks) * 10) / 10,
      sessions: v.days.size,
      weeklyFreq: Math.round((v.days.size / weeks) * 10) / 10,
    }))
    .sort((a, b) => b.sets - a.sets);

  const upper = pattern.push + pattern.pull;
  const lower = pattern.legs;

  /* 체중(최신 기록 우선, 없으면 세션에 적힌 값) — 맨몸 종목 환산에 필요해 먼저 구한다 */
  const latestBw = [...metrics]
    .filter((m) => m.weight != null && !m.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const sessionBw = [...doneSessions]
    .reverse()
    .find((s) => s.bodyweight != null && s.bodyweight > 0)?.bodyweight;
  const bodyweight = latestBw?.weight ?? sessionBw ?? null;

  /* 종목별 최고 기록 (전 기간, 완료 세트만) */
  const bests = new Map<string, LiftBest>();
  const bestDays = new Map<string, Set<string>>();
  const excludeMap = new Map<string, ExcludeReason>();
  const markExcluded = (id: string, reason: ExcludeReason) => {
    if (!bests.has(id) && !excludeMap.has(id)) excludeMap.set(id, reason);
  };
  for (const s of doneSessions) {
    for (const ex of s.exercises) {
      if (ex.trackingMode && ex.trackingMode !== "weight_reps") {
        markExcluded(ex.exerciseId, "tracking");
        continue;
      }
      // 맨몸 종목은 '체중 + 추가중량'이 실제로 든 무게. 체중을 모르면 비교 불가라 건너뛴다.
      const isBw = BODYWEIGHT_LIFTS.has(ex.exerciseId);
      if (isBw && bodyweight == null) {
        markExcluded(ex.exerciseId, "no-bodyweight");
        continue;
      }
      const addBw = isBw ? bodyweight ?? 0 : 0;
      // reps ≤ 12만 사용. 그 이상은 1RM 추정 오차가 급격히 커진다.
      // 상한을 통계 탭(estimate1RM의 자체 상한 12)과 맞춰 탭 간 수치가 어긋나지 않게 한다.
      const done = ex.sets.filter(
        (x) => x.isCompleted && x.weight + addBw > 0 && x.reps > 0 && x.reps <= 12
      );
      if (done.length === 0) {
        const anyDone = ex.sets.some((x) => x.isCompleted);
        if (anyDone) {
          const hasWeight = ex.sets.some((x) => x.isCompleted && x.weight + addBw > 0);
          markExcluded(ex.exerciseId, hasWeight ? "reps" : "no-weight");
        }
        continue;
      }
      let best = 0;
      let topW = 0;
      let topR = 0;
      for (const st of done) {
        const w = st.weight + addBw;
        const e = estimate1RM(w, st.reps);
        if (e > best) {
          best = e;
          topW = w;
          topR = st.reps;
        }
      }
      const prev = bests.get(ex.exerciseId);
      const nameKo = exMap.get(ex.exerciseId)?.nameKo ?? "운동";
      const days = bestDays.get(ex.exerciseId) ?? new Set<string>();
      days.add(s.date);
      bestDays.set(ex.exerciseId, days);
      if (!prev) {
        bests.set(ex.exerciseId, {
          exerciseId: ex.exerciseId,
          nameKo,
          best1RM: best,
          topWeight: topW,
          topReps: topR,
          date: s.date,
          dayCount: 1,
          days: [...days],
        });
      } else {
        prev.dayCount = days.size;
        prev.days = [...days];
        if (best > prev.best1RM) {
          prev.best1RM = best;
          prev.topWeight = topW;
          prev.topReps = topR;
          prev.date = s.date;
        }
      }
    }
  }

  /* 빈도 · 평균 소요시간 */
  let durSum = 0;
  let durCount = 0;
  for (const s of recentSessions) {
    if (s.startedAt && s.endedAt) {
      const m = (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000;
      if (m > 0 && m < 360) {
        durSum += m;
        durCount++;
      }
    }
  }
  const recentDays = new Set(recentSessions.map((s) => s.date)).size;


  const age =
    profile?.birthYear != null
      ? dateKeyToDate(today).getFullYear() - profile.birthYear
      : null;

  return {
    doneSessions,
    recentSessions,
    weeks,
    totalDays: new Set(doneSessions.map((s) => s.date)).size,
    spanDays,
    parts,
    pattern,
    upperLowerSets: { upper, lower },
    bests,
    excluded: [...excludeMap.entries()]
      .filter(([id]) => !bests.has(id))
      .map(([exerciseId, reason]) => ({
        exerciseId,
        nameKo: exMap.get(exerciseId)?.nameKo ?? "운동",
        reason,
      })),
    frequency: {
      perWeek: Math.round((recentDays / weeks) * 10) / 10,
      avgDurationMin: durCount > 0 ? Math.round(durSum / durCount) : null,
      totalSessions: doneSessions.length,
    },
    bodyweight,
    bodyweightDate: latestBw?.date ?? null,
    bodyweightAgeDays: latestBw?.date ? daysBetween(latestBw.date, today) : null,
    age: age != null && age > 5 && age < 110 ? age : null,
  };
}

/** 같은 기준표에 묶인 종목 묶음 */
export interface StandardGroup {
  liftKey: string;
  /** 묶인 종목 중 최고 기록 — 등급 판정에 쓰는 대표값 */
  best: LiftBest;
  /** 묶인 종목 전체가 기록된 날짜 합집합 */
  days: Set<string>;
  members: LiftBest[];
}

/**
 * 종목별 최고기록을 '기준표 키' 단위로 묶는다.
 * 오버헤드/밀리터리프레스처럼 같은 기준을 쓰는 별칭이나, 사용자가 직접 연결한
 * 커스텀 종목이 각자 다른 날에 기록되면 종목별로는 '하루치'라 영영 판정이 안 됐다.
 * 날짜를 합집합으로 모아 그 문제를 없앤다.
 */
export function groupByStandard(
  bests: Map<string, LiftBest>,
  overrides?: Record<string, string>
): Map<string, StandardGroup> {
  const groups = new Map<string, StandardGroup>();
  for (const [exerciseId, b] of bests) {
    if (b.best1RM <= 0) continue;
    const liftKey = liftKeyFor(exerciseId, overrides);
    if (!liftKey) continue;
    const g = groups.get(liftKey);
    if (!g) {
      groups.set(liftKey, {
        liftKey,
        best: b,
        days: new Set(b.days),
        members: [b],
      });
    } else {
      for (const d of b.days) g.days.add(d);
      g.members.push(b);
      if (b.best1RM > g.best.best1RM) g.best = b;
    }
  }
  return groups;
}

/** 최근 N주 대비 이전 N주의 추정 1RM 변화율(정체 판정용) */
export function progressionOf(
  doneSessions: WorkoutSession[],
  exerciseId: string,
  today: string,
  windowDays = 42
): { changePct: number; from: number; to: number; points: number } | null {
  const pts: { date: string; e1rm: number }[] = [];
  for (const s of doneSessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      if (ex.trackingMode && ex.trackingMode !== "weight_reps") continue;
      let best = 0;
      for (const st of ex.sets)
        if (st.isCompleted) best = Math.max(best, estimate1RM(st.weight, st.reps));
      if (best > 0) pts.push({ date: s.date, e1rm: best });
    }
  }
  if (pts.length < 3) return null;
  pts.sort((a, b) => a.date.localeCompare(b.date));
  const cut = daysBetween(pts[0].date, today) > windowDays ? windowDays : null;
  const recent = cut
    ? pts.filter((p) => daysBetween(p.date, today) <= cut)
    : pts.slice(Math.ceil(pts.length / 2));
  const older = cut
    ? pts.filter((p) => daysBetween(p.date, today) > cut)
    : pts.slice(0, Math.ceil(pts.length / 2));
  if (recent.length === 0 || older.length === 0) return null;
  const avg = (a: { e1rm: number }[]) => a.reduce((n, p) => n + p.e1rm, 0) / a.length;
  const from = avg(older);
  const to = avg(recent);
  if (from <= 0) return null;
  return {
    changePct: Math.round(((to - from) / from) * 1000) / 10,
    from: Math.round(from * 10) / 10,
    to: Math.round(to * 10) / 10,
    points: pts.length,
  };
}
