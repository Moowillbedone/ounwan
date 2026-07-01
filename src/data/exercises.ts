import type { Exercise } from "@/lib/types";
import raw from "./exercises.json";

// 빌트인 운동 라이브러리(151종). 모든 유저 공통이므로 서버 동기화 대상이 아니라 로컬 시드로만 사용.
const SEED_STAMP = "2024-01-01T00:00:00.000Z";

interface RawExercise {
  slug: string;
  nameKo: string;
  nameEn: string;
  bodyPart: Exercise["bodyPart"];
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: Exercise["equipment"];
  category: Exercise["category"];
  isCompound: boolean;
  defaultRestSeconds: number;
  unilateral: boolean;
}

export const BUILTIN_EXERCISES: Exercise[] = (raw as RawExercise[]).map((r) => ({
  id: r.slug,
  ownerId: null,
  slug: r.slug,
  nameKo: r.nameKo,
  nameEn: r.nameEn,
  bodyPart: r.bodyPart,
  primaryMuscle: r.primaryMuscle,
  secondaryMuscles: r.secondaryMuscles ?? [],
  equipment: r.equipment,
  category: r.category,
  isCompound: r.isCompound,
  defaultRestSeconds: r.defaultRestSeconds,
  unilateral: r.unilateral,
  isBuiltIn: true,
  updatedAt: SEED_STAMP,
  _dirty: 0,
}));

export const BUILTIN_COUNT = BUILTIN_EXERCISES.length;
