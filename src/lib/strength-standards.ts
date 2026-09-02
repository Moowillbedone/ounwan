import raw from "@/data/strength-standards.json";

/* ------------------------------------------------------------------ *
 * 근력 표준 비교
 * 데이터 출처와 한계는 data/strength-standards.json의 meta에 기록되어 있고,
 * 화면에도 반드시 함께 노출한다(백분위의 모집단이 '일반 인구'가 아님).
 * ------------------------------------------------------------------ */

export type Sex = "male" | "female";
export type LevelKey = "beginner" | "novice" | "intermediate" | "advanced" | "elite";

export const LEVELS: LevelKey[] = [
  "beginner",
  "novice",
  "intermediate",
  "advanced",
  "elite",
];

export const LEVEL_KO: Record<LevelKey, string> = {
  beginner: "입문",
  novice: "초급",
  intermediate: "중급",
  advanced: "상급",
  elite: "엘리트",
};

/** 각 레벨의 백분위(모집단=기록을 남기는 리프터) */
export const LEVEL_PCT: Record<LevelKey, number> = {
  beginner: 5,
  novice: 20,
  intermediate: 50,
  advanced: 80,
  elite: 95,
};

export interface StdRow {
  bw: number;
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}
export interface LiftStd {
  key: string;
  nameKo: string;
  note?: string;
  rows: StdRow[];
}
export interface StandardsFile {
  meta: {
    source: string;
    sourceUrl: string;
    levelMeaning: string;
    caveats: string;
    ageBasis: string;
    heightNote: string;
    updated: string;
  };
  ageFactors: { age: number; factor: number }[];
  male: LiftStd[];
  female: LiftStd[];
}

const DATA = raw as unknown as StandardsFile;
export const STANDARDS_META = DATA.meta;

/** 앱의 종목 id → 표준표 키. 표준이 없는 종목은 비교하지 않는다. */
export const LIFT_KEYS: Record<string, string> = {
  "bench-press": "bench-press",
  "back-squat": "back-squat",
  deadlift: "deadlift",
  "overhead-press": "overhead-press",
  "military-press": "overhead-press",
  "barbell-row": "barbell-row",
  "pendlay-row": "barbell-row",
  "pull-up": "pull-up",
  "chin-up": "pull-up",
  "wide-grip-pull-up": "pull-up",
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** 체중에 맞춰 브라켓 사이를 선형보간한 기준값 */
export function standardFor(
  sex: Sex,
  liftKey: string,
  bodyweightKg: number
): { lift: LiftStd; levels: Record<LevelKey, number> } | null {
  const lift = DATA[sex]?.find((l) => l.key === liftKey);
  if (!lift || lift.rows.length === 0) return null;
  const rows = [...lift.rows].sort((a, b) => a.bw - b.bw);
  const bw = Math.max(rows[0].bw, Math.min(rows[rows.length - 1].bw, bodyweightKg));
  let lo = rows[0];
  let hi = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (bw >= rows[i].bw && bw <= rows[i + 1].bw) {
      lo = rows[i];
      hi = rows[i + 1];
      break;
    }
  }
  const t = hi.bw === lo.bw ? 0 : (bw - lo.bw) / (hi.bw - lo.bw);
  const levels = {} as Record<LevelKey, number>;
  for (const k of LEVELS) levels[k] = Math.round(lerp(lo[k], hi[k], t) * 10) / 10;
  return { lift, levels };
}

/**
 * 마스터스 연령계수(23~40세=1.0, 41세부터 McCulloch).
 * 공식 정의는 "기록 × 계수 = 오픈 환산"이므로,
 * 기준표에 적용할 때는 **기준 ÷ 계수**로 낮춰야 방향이 맞다.
 */
export function ageFactor(age: number | null): number {
  if (age == null) return 1;
  const pts = [...DATA.ageFactors].sort((a, b) => a.age - b.age);
  if (pts.length === 0) return 1;
  if (age <= pts[0].age) return pts[0].factor;
  if (age >= pts[pts.length - 1].age) return pts[pts.length - 1].factor;
  for (let i = 0; i < pts.length - 1; i++) {
    if (age >= pts[i].age && age <= pts[i + 1].age) {
      const t = (age - pts[i].age) / (pts[i + 1].age - pts[i].age);
      return lerp(pts[i].factor, pts[i + 1].factor, t);
    }
  }
  return 1;
}

export interface LevelVerdict {
  liftKey: string;
  nameKo: string;
  e1rm: number;
  levels: Record<LevelKey, number>; // 나이 보정이 적용된 기준값
  level: LevelKey | null; // null = 입문 기준 미만
  /** 스펙트럼 상 위치 0~1 (입문 시작 ~ 엘리트) — 게이지용 */
  pos: number;
  /** 대략적인 백분위(구간 내 선형보간) */
  percentile: number;
  next: { level: LevelKey; need: number } | null;
  note?: string;
  ageAdjusted: boolean;
}

/** 추정 1RM을 기준표와 비교해 레벨 판정 */
export function judgeLift(
  sex: Sex,
  liftKey: string,
  e1rm: number,
  bodyweightKg: number,
  age: number | null
): LevelVerdict | null {
  const std = standardFor(sex, liftKey, bodyweightKg);
  if (!std || e1rm <= 0) return null;
  const f = ageFactor(age);
  const levels = {} as Record<LevelKey, number>;
  // 나이가 많을수록 계수가 커지고, 기준을 그만큼 낮춘다(나눗셈)
  for (const k of LEVELS) levels[k] = Math.round((std.levels[k] / f) * 10) / 10;

  let level: LevelKey | null = null;
  for (const k of LEVELS) if (e1rm >= levels[k]) level = k;

  // 스펙트럼 위치: 각 레벨을 등간격 구간으로 두고 그 안에서 선형보간
  const idx = level ? LEVELS.indexOf(level) : -1;
  let pos: number;
  let percentile: number;
  if (idx < 0) {
    const t = Math.max(0, Math.min(1, e1rm / (levels.beginner || 1)));
    pos = t * (1 / (LEVELS.length - 1)) * 0.6;
    percentile = Math.round(t * LEVEL_PCT.beginner);
  } else if (idx === LEVELS.length - 1) {
    pos = 1;
    percentile = LEVEL_PCT.elite;
  } else {
    const a = levels[LEVELS[idx]];
    const b = levels[LEVELS[idx + 1]];
    const t = b > a ? Math.max(0, Math.min(1, (e1rm - a) / (b - a))) : 0;
    pos = (idx + t) / (LEVELS.length - 1);
    percentile = Math.round(
      lerp(LEVEL_PCT[LEVELS[idx]], LEVEL_PCT[LEVELS[idx + 1]], t)
    );
  }

  const nextKey = idx + 1 < LEVELS.length ? LEVELS[idx + 1] : null;
  return {
    liftKey,
    nameKo: std.lift.nameKo,
    e1rm: Math.round(e1rm * 10) / 10,
    levels,
    level,
    pos: Math.max(0, Math.min(1, pos)),
    percentile: Math.max(0, Math.min(99, percentile)),
    next: nextKey ? { level: nextKey, need: levels[nextKey] } : null,
    note: std.lift.note,
    ageAdjusted: Math.abs(f - 1) > 0.001,
  };
}
