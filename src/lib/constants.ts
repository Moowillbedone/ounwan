import type { BodyPart, Equipment } from "./types";

export const APP_NAME = "오운완";
export const LOCAL_OWNER = "local"; // 게스트 모드 owner id

export const BODY_PARTS: BodyPart[] = [
  "가슴",
  "등",
  "어깨",
  "하체",
  "팔",
  "복근/코어",
  "유산소",
  "전신",
];

interface BodyPartMeta {
  label: BodyPart;
  color: string; // css var 값
  emoji: string;
}

export const BODY_PART_META: Record<BodyPart, BodyPartMeta> = {
  가슴: { label: "가슴", color: "var(--bp-chest)", emoji: "💪" },
  등: { label: "등", color: "var(--bp-back)", emoji: "🔙" },
  어깨: { label: "어깨", color: "var(--bp-shoulder)", emoji: "🏔️" },
  하체: { label: "하체", color: "var(--bp-legs)", emoji: "🦵" },
  팔: { label: "팔", color: "var(--bp-arms)", emoji: "💪" },
  "복근/코어": { label: "복근/코어", color: "var(--bp-core)", emoji: "🎯" },
  유산소: { label: "유산소", color: "var(--bp-cardio)", emoji: "🔥" },
  전신: { label: "전신", color: "var(--bp-full)", emoji: "⚡" },
};

export function bodyPartColor(bp: BodyPart): string {
  return BODY_PART_META[bp]?.color ?? "var(--text-3)";
}

export const EQUIPMENTS: Equipment[] = [
  "바벨",
  "덤벨",
  "머신",
  "케이블",
  "맨몸",
  "스미스머신",
  "케틀벨",
  "밴드",
  "기타",
];

export const SET_TYPE_META = {
  working: { label: "본세트", short: "", color: "var(--text)" },
  warmup: { label: "웜업", short: "W", color: "var(--warn)" },
  drop: { label: "드랍", short: "D", color: "var(--bp-arms)" },
  failure: { label: "실패", short: "F", color: "var(--danger)" },
} as const;

// 표준 원판(kg) — 플레이트 계산기
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const BAR_WEIGHT_KG = 20;

export const THEME_KEY = "ounwan-theme";
