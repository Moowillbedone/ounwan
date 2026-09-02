import type { BodyPart } from "./types";

/* ------------------------------------------------------------------ *
 * 훈련량·균형 기준값. 모든 수치는 출처가 있고, 화면에도 근거를 함께 밝힌다.
 * 근거 등급이 낮은 항목은 strict=false로 두고 '경고'가 아닌 '제안' 톤으로 쓴다.
 * ------------------------------------------------------------------ */

export interface SetGuideline {
  part: BodyPart;
  min: number;
  max: number;
  /** true = 미달 시 경고, false = 부드러운 제안(간접 자극분을 못 세거나 근거가 약한 부위) */
  strict: boolean;
  note?: string;
}

/** 근비대 기준 주간 '직접' 세트 권장 범위 */
export const WEEKLY_SET_GUIDE: SetGuideline[] = [
  { part: "가슴", min: 10, max: 20, strict: true },
  { part: "등", min: 10, max: 22, strict: true },
  { part: "하체", min: 10, max: 22, strict: true },
  {
    part: "어깨",
    min: 8,
    max: 18,
    strict: false,
    note: "프레스 동작에서 전면삼각이 함께 자극돼요. 직접 세트는 측면·후면 위주로 채우면 좋아요.",
  },
  {
    part: "팔",
    min: 8,
    max: 18,
    strict: false,
    note: "로우·풀에서 이두, 프레스에서 삼두가 함께 자극돼요. 직접 세트가 적어도 결핍은 아니에요.",
  },
  {
    part: "복근/코어",
    min: 6,
    max: 15,
    strict: false,
    note: "코어는 용량 연구 근거가 약해요(외삽치). 스쿼트·데드리프트에서도 체간이 쓰여요.",
  },
];

export const SET_GUIDE_SOURCE =
  "하한은 Schoenfeld 2017 용량-반응 메타분석, 상한은 Pelland 2025의 효율 구간에서 잡은 설계 기준이에요(연구가 권고한 상한이 아니라 '이 이상은 효율이 떨어진다'는 의미).";

export const SET_COUNT_CAVEAT =
  "이 앱은 종목의 주 부위만 세요(간접 자극은 미포함). 어깨·팔·코어가 낮게 보이는 건 대체로 정상이에요.";

/** 볼륨 배분 비율 — 한쪽 방향으로만 경고한다(반대쪽은 문제로 보지 않음) */
export interface VolumeRatioGuide {
  key: string;
  label: string;
  lowLabel: string;
  goodMin: number;
  goodMax: number;
  warnBelow: number;
  warnText: string;
  /** 권장 위쪽을 벗어났을 때의 '중립' 설명 — 경고가 아니다 */
  aboveText: string;
  source: string;
}

export const VOLUME_RATIOS: VolumeRatioGuide[] = [
  {
    key: "pullPush",
    label: "당기기 : 밀기 볼륨",
    lowLabel: "당기기 부족",
    goodMin: 0.8,
    goodMax: 1.3,
    warnBelow: 0.7,
    warnText:
      "밀기(가슴·어깨) 대비 당기기(등)가 적어요. 등 볼륨을 늘리면 어깨 앞뒤 균형과 자세에 도움이 돼요.",
    aboveText:
      "당기기가 밀기보다 많은 편이에요. 이건 문제로 보지 않아요(자세에는 오히려 유리해요).",
    source: "밀기/당기기 볼륨 균형 통설 + 로우:벤치 근력비(Baker & Newton 2004)",
  },
  {
    key: "lowerShare",
    label: "하체 볼륨 비중",
    lowLabel: "하체 회피",
    goodMin: 0.25,
    goodMax: 0.4,
    warnBelow: 0.2,
    warnText:
      "전체 저항운동 중 하체 비중이 낮아요. 하체는 가장 큰 근육이라 비중이 20% 아래로 떨어지면 전체 성장이 더뎌져요.",
    aboveText: "하체 비중이 높은 편이에요. 상체 볼륨이 충분한지만 확인해보세요.",
    source: "하체 볼륨 비중 0.25~0.40 권장(경고 임계 0.20)",
  },
];

/** 근력 비율 — 종목 간 e1RM 비교로 '무엇이 약한지'를 짚는다 */
export interface StrengthRatioGuide {
  key: string;
  numerator: string; // 표준 lift key
  denominator: string;
  label: string;
  goodMin: number;
  goodMax: number;
  /** 이 값 미만이면 분자 쪽이 약점 */
  warnBelow?: number;
  /** 이 값 초과면 분모 쪽이 약점 */
  warnAbove?: number;
  weakIfLow: string;
  weakIfHigh: string;
  source: string;
}

export const STRENGTH_RATIOS: StrengthRatioGuide[] = [
  {
    key: "rowBench",
    numerator: "barbell-row",
    denominator: "bench-press",
    label: "바벨로우 : 벤치프레스",
    goodMin: 0.85,
    goodMax: 1.05,
    warnBelow: 0.75,
    weakIfLow: "미는 힘에 비해 당기는 힘이 뒤처져요. 등 운동의 무게를 올릴 여지가 커요.",
    weakIfHigh: "",
    source:
      "StrengthLevel 기준표에서 계산한 로우/벤치 비율(체중·레벨 전반 0.86~0.93). 흔히 인용되는 Baker & Newton(2004) 98%는 바벨로우가 아니라 '체중 포함 웨이티드 풀업' 기준이라 그대로 쓰지 않았어요.",
  },
  {
    key: "deadSquat",
    numerator: "deadlift",
    denominator: "back-squat",
    label: "데드리프트 : 백스쿼트",
    goodMin: 1.1,
    goodMax: 1.3,
    warnBelow: 1.0,
    warnAbove: 1.45,
    weakIfLow: "스쿼트 대비 데드리프트가 낮아요. 힌지 패턴(후면사슬)이 약점일 수 있어요.",
    weakIfHigh: "데드리프트에 비해 스쿼트가 낮아요. 무릎 지배 하체 운동을 보강해보세요.",
    source: "파워리프팅 대회 데이터 분석(남 ≈1.18 / 여 ≈1.22) + StrengthLevel 기준표 계산",
  },
  {
    key: "ohpBench",
    numerator: "overhead-press",
    denominator: "bench-press",
    label: "오버헤드프레스 : 벤치프레스",
    goodMin: 0.6,
    goodMax: 0.7,
    warnBelow: 0.55,
    weakIfLow: "수평 프레스에 비해 수직 프레스가 뒤처져요. 대개 오버헤드 종목 빈도가 낮아서예요.",
    weakIfHigh: "",
    source: "StrengthLevel 기준표 계산값(남녀 모두 0.59~0.68 구간)",
  },
  {
    key: "benchSquat",
    numerator: "bench-press",
    denominator: "back-squat",
    label: "벤치프레스 : 백스쿼트",
    goodMin: 0.6,
    goodMax: 0.8,
    warnAbove: 0.95,
    weakIfLow: "",
    weakIfHigh: "상체에 비해 하체 근력이 낮아요. 스쿼트 계열의 강도를 올릴 여지가 커요.",
    source: "일반 트레이니 분포 ≈0.73(StrengthLevel). 파워리프터는 더 낮아요(남 ≈0.69 / 여 ≈0.59) — 스쿼트를 전문적으로 훈련하기 때문이에요.",
  },
];

/** 1RM 추정 신뢰 한계 — 이보다 작은 변화는 노이즈로 본다 */
export const E1RM_NOISE_PCT = 5;
