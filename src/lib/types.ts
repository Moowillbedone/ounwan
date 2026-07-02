// 오운완 도메인 모델
// 로컬퍼스트: 모든 레코드는 sync 메타(updatedAt/deletedAt/_dirty)를 가진다.

export type BodyPart =
  | "가슴"
  | "등"
  | "어깨"
  | "하체"
  | "팔"
  | "복근/코어"
  | "유산소"
  | "전신";

export type Equipment =
  | "바벨"
  | "덤벨"
  | "머신"
  | "케이블"
  | "맨몸"
  | "스미스머신"
  | "케틀벨"
  | "밴드"
  | "기타";

export type ExerciseCategory =
  | "strength"
  | "cardio"
  | "bodyweight"
  | "stretching";

export type SetType = "working" | "warmup" | "drop" | "failure";

/** 기록 방식: 중량+횟수(기본) / 횟수만(맨몸) / 시간만(유산소·스트레칭) */
export type TrackingMode = "weight_reps" | "reps" | "time";

export type Unit = "kg" | "lb";
export type ThemePref = "system" | "light" | "dark";
export type RestSound = "chime" | "beep" | "arcade";

/** sync 공통 메타 */
export interface SyncMeta {
  updatedAt: string; // ISO
  deletedAt?: string | null; // 소프트 삭제
  _dirty?: 0 | 1; // 로컬 전용: 서버로 push 필요
}

export interface Exercise extends SyncMeta {
  id: string; // slug(빌트인) 또는 uuid(커스텀)
  ownerId: string | null; // null = 빌트인
  slug: string;
  nameKo: string;
  nameEn: string;
  bodyPart: BodyPart;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: Equipment;
  category: ExerciseCategory;
  isCompound: boolean;
  defaultRestSeconds: number;
  unilateral: boolean;
  isBuiltIn: boolean;
}

export interface RoutineExerciseRef {
  exerciseId: string;
  targetSets: number;
  targetReps?: number | null;
  note?: string | null;
}

export interface Routine extends SyncMeta {
  id: string;
  ownerId: string;
  name: string;
  folder?: string | null; // 헬스/홈/유산소 등
  emoji?: string | null;
  exercises: RoutineExerciseRef[]; // 순서 보존
  createdAt: string;
}

export interface WorkoutSet {
  id: string;
  setType: SetType;
  weight: number; // 저장은 항상 kg 기준
  reps: number;
  durationSec?: number | null; // 시간 기록 방식일 때 사용
  rpe?: number | null;
  isCompleted: boolean;
  completedAt?: string | null; // 세트 체크 시각(타임라인/실운동시간)
  restSeconds?: number | null;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroup?: number | null;
  note?: string | null; // 운동별 메모(자세·주의점 등, 30자 이내)
  trackingMode?: TrackingMode; // 기록 방식(미지정=weight_reps)
  restSeconds?: number | null; // 이 운동의 휴식시간(미지정=운동 기본값)
  sets: WorkoutSet[];
}

export interface WorkoutSession extends SyncMeta {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD (로컬 날짜)
  title?: string | null;
  label?: string | null; // 캘린더 셀에 표시되는 짧은 라벨(예: 상체A)
  labelColor?: string | null; // 라벨 텍스트 색(미지정=기본 그린)
  sessionIndexOfDay: number; // 1~3 (하루 다중 세션)
  routineId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  bodyweight?: number | null; // kg
  note?: string | null;
  exercises: SessionExercise[];
  // 파생 캐시(빠른 캘린더 조회용)
  bodyParts: BodyPart[]; // 이 세션에서 자극한 부위(중복 제거)
  totalVolume: number; // kg·reps 합
  totalSets: number;
}

export interface BodyMetric extends SyncMeta {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  weight?: number | null; // kg
  bodyFatPct?: number | null;
  muscleMass?: number | null;
  note?: string | null;
}

export interface Profile extends SyncMeta {
  id: string; // userId 또는 'local'
  displayName?: string | null;
  unit: Unit;
  theme: ThemePref;
  weekStartsMonday: boolean;
  restAlert?: boolean; // 휴식 종료 알림(소리·진동) — 미지정=켜짐
  restSound?: RestSound; // 휴식 종료 알림음 — 미지정=chime(기본)
  hiddenStats?: string[]; // 통계 '운동별 성장'에서 사용자가 숨긴 exerciseId 목록
  onboardedAt?: string | null;
}

/** 운동별 히스토리 조회용 파생 타입 */
export interface ExerciseHistoryPoint {
  date: string;
  sessionId: string;
  topSetWeight: number;
  topSetReps: number;
  best1RM: number;
  volume: number;
  sets: WorkoutSet[];
}

export interface PersonalRecord {
  exerciseId: string;
  maxWeight: number;
  maxWeightReps: number;
  best1RM: number;
  maxVolumeSession: number;
  achievedAt: string;
}
