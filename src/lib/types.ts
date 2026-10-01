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

/** 기록 방식: 중량+횟수(기본) / 횟수만(맨몸) / 시간만(스트레칭 등) / 거리+시간(달리기·걷기·사이클 등) */
export type TrackingMode = "weight_reps" | "reps" | "time" | "distance";

export type Unit = "kg" | "lb";
export type ThemePref = "system" | "light" | "dark";
/** 테마 색상: 기본 그린 / 연핑크 */
export type Accent = "green" | "pink";
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
  durationSec?: number | null; // 시간·거리 기록 방식일 때 사용
  distanceM?: number | null; // 거리 기록 방식일 때 사용(m 단위 저장, 화면은 km)
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
  /** GPS로 측정하는 종목(러닝 화면에서 기록 → 결과가 이 운동의 세트·run에 들어온다) */
  gps?: boolean;
  /** 실내(트레드밀) 측정 — gps와 함께 켜짐. GPS 없이 시간·걸음으로 재고 거리는 끝낼 때 입력 */
  indoor?: boolean;
  run?: RunRecord | null; // GPS 측정 결과(경로·구간·걸음)
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
  run?: RunRecord | null; // (구버전) GPS 달리기 기록 — 지금은 운동(SessionExercise.run)에 저장
  // 파생 캐시(빠른 캘린더 조회용)
  bodyParts: BodyPart[]; // 이 세션에서 자극한 부위(중복 제거)
  totalVolume: number; // kg·reps 합
  totalSets: number;
}

/**
 * GPS 달리기 기록. 세션 문서(JSONB) 안에 들어가므로 DB 스키마 변경 없이 동기화된다.
 * 경로는 저장 용량을 위해 단순화한 [위도, 경도] 목록.
 */
export interface RunRecord {
  distanceM: number; // 총 거리(m)
  movingSec: number; // 일시정지 제외 기록 시간(초)
  splits: number[]; // 1km마다 걸린 시간(초) — 완주한 km만
  route: [number, number][]; // 단순화한 경로 [lat, lng]
  startedAt?: string | null; // 달리기 시작·끝 시각(ISO) — 심박 조회 구간
  endedAt?: string | null;
  steps?: number | null; // 휴대폰 걸음 센서로 센 걸음(일시정지 구간 제외). 없으면 null
  indoor?: boolean; // 실내(트레드밀) 러닝: 경로 없음, 거리는 사용자가 입력(걸음 기반 추정값으로 시작)
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
  accent?: Accent; // 테마 색상(미지정=그린) — 계정에 저장돼 다른 기기에서도 같은 색
  weekStartsMonday: boolean;
  restAlert?: boolean; // 휴식 종료 알림(소리·진동) — 미지정=켜짐
  restSound?: RestSound; // 휴식 종료 알림음 — 미지정=chime(기본)
  reminderEnabled?: boolean; // 오늘 운동 알림(앱 전용) — 미지정=꺼짐
  reminderTime?: string; // "HH:MM" — 미지정=20:00
  // 분석 탭 근력 기준 비교용 신체 정보(선택 입력)
  sex?: "male" | "female" | null;
  birthYear?: number | null;
  heightCm?: number | null;
  hiddenStats?: string[]; // 통계 '운동별 성장'에서 사용자가 숨긴 exerciseId 목록
  /**
   * 근력 기준표 수동 연결(exerciseId → 기준표 키).
   * 커스텀 종목이나 별칭 종목처럼 빌트인 매핑(LIFT_KEYS)에 없는 종목을
   * 사용자가 직접 기준 종목에 붙일 때 쓴다. 빌트인 시드(ensureSeeded)가
   * 덮어쓰지 못하도록 Exercise가 아니라 프로필에 둔다.
   */
  exerciseStandards?: Record<string, string>;
  exerciseNotes?: Record<string, string>; // 종목별 공유 메모(exerciseId→메모) — 날짜 무관 연동
  /**
   * 하루 대표 라벨(날짜 "YYYY-MM-DD" → 라벨·색). 하루에 운동이 여러 개일 때
   * 캘린더에 개별 운동 라벨 대신 이 라벨을 보여준다. 프로필 문서로 기기 간 동기화.
   */
  dayLabels?: Record<string, DayLabel>;
  onboardedAt?: string | null;
}

export interface DayLabel {
  label: string;
  color?: string | null;
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
