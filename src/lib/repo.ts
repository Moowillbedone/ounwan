import { getDB } from "./db";
import { BUILTIN_EXERCISES } from "@/data/exercises";
import { LOCAL_OWNER } from "./constants";
import {
  uid,
  nowISO,
  todayKey,
  estimate1RM,
  setsVolume,
  recomputeSessionDerived,
} from "./utils";
import type {
  Exercise,
  Routine,
  WorkoutSession,
  BodyMetric,
  Profile,
  ExerciseHistoryPoint,
  PersonalRecord,
  SessionExercise,
  WorkoutSet,
} from "./types";

// 현재 소유자(게스트='local' 또는 로그인 user.id)
let _owner = LOCAL_OWNER;
export function setCurrentOwner(id: string) {
  _owner = id;
}
export function currentOwner(): string {
  return _owner;
}

function touch<T extends { updatedAt: string; _dirty?: 0 | 1 }>(rec: T): T {
  rec.updatedAt = nowISO();
  rec._dirty = 1;
  return rec;
}

/** 첫 실행 시 빌트인 운동 시드(커스텀 운동은 보존) */
export async function ensureSeeded(): Promise<void> {
  const db = getDB();
  // 빌트인 id는 slug로 고정 → 개수가 모자라면 bulkPut(idempotent)
  const existingBuiltins = await db.exercises.filter((e) => e.isBuiltIn).count();
  if (existingBuiltins < BUILTIN_EXERCISES.length) {
    await db.exercises.bulkPut(BUILTIN_EXERCISES);
  }
}

/* ---------------- Profile ---------------- */

export async function getProfile(): Promise<Profile> {
  const db = getDB();
  const existing = await db.profile.get(_owner);
  if (existing) return existing;
  const fresh: Profile = {
    id: _owner,
    displayName: null,
    unit: "kg",
    theme: "system",
    weekStartsMonday: true,
    onboardedAt: null,
    updatedAt: nowISO(),
    _dirty: 1,
  };
  await db.profile.put(fresh);
  return fresh;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const db = getDB();
  const cur = await getProfile();
  const next = touch({ ...cur, ...patch, id: _owner });
  await db.profile.put(next);
  return next;
}

/* ---------------- Exercises ---------------- */

export async function listExercises(): Promise<Exercise[]> {
  const db = getDB();
  const all = await db.exercises.toArray();
  return all
    .filter((e) => !e.deletedAt && (e.isBuiltIn || e.ownerId === _owner))
    .sort((a, b) => a.nameKo.localeCompare(b.nameKo, "ko"));
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return getDB().exercises.get(id);
}

export async function createCustomExercise(
  input: Omit<
    Exercise,
    "id" | "ownerId" | "isBuiltIn" | "updatedAt" | "_dirty" | "slug"
  > & { slug?: string }
): Promise<Exercise> {
  const db = getDB();
  const id = uid();
  const ex: Exercise = {
    ...input,
    id,
    slug: input.slug ?? id,
    ownerId: _owner,
    isBuiltIn: false,
    updatedAt: nowISO(),
    _dirty: 1,
  };
  await db.exercises.put(ex);
  return ex;
}

/* ---------------- Routines ---------------- */

export async function listRoutines(): Promise<Routine[]> {
  const db = getDB();
  const all = await db.routines.where("ownerId").equals(_owner).toArray();
  return all
    .filter((r) => !r.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return getDB().routines.get(id);
}

export async function saveRoutine(
  input: Partial<Routine> & Pick<Routine, "name" | "exercises">
): Promise<Routine> {
  const db = getDB();
  const now = nowISO();
  const routine: Routine = {
    id: input.id ?? uid(),
    ownerId: _owner,
    name: input.name,
    folder: input.folder ?? null,
    emoji: input.emoji ?? null,
    exercises: input.exercises,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    _dirty: 1,
    deletedAt: null,
  };
  await db.routines.put(routine);
  return routine;
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = getDB();
  const r = await db.routines.get(id);
  if (!r) return;
  await db.routines.put(touch({ ...r, deletedAt: nowISO() }));
}

/* ---------------- Sessions ---------------- */

export async function listSessions(): Promise<WorkoutSession[]> {
  const db = getDB();
  const all = await db.sessions.where("ownerId").equals(_owner).toArray();
  return all
    .filter((s) => !s.deletedAt)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.sessionIndexOfDay - a.sessionIndexOfDay
    );
}

export async function getSessionsByDate(
  dateKey: string
): Promise<WorkoutSession[]> {
  const all = await listSessions();
  return all
    .filter((s) => s.date === dateKey)
    .sort((a, b) => a.sessionIndexOfDay - b.sessionIndexOfDay);
}

export async function getSession(
  id: string
): Promise<WorkoutSession | undefined> {
  return getDB().sessions.get(id);
}

/** 세션 저장(파생값 재계산 포함) */
export async function saveSession(session: WorkoutSession): Promise<WorkoutSession> {
  const db = getDB();
  const exMap = new Map((await listExercises()).map((e) => [e.id, e.bodyPart]));
  const derived = recomputeSessionDerived(session, (id) => exMap.get(id));
  const next: WorkoutSession = {
    ...session,
    ...derived,
    ownerId: _owner,
    updatedAt: nowISO(),
    _dirty: 1,
    deletedAt: session.deletedAt ?? null,
  };
  await db.sessions.put(next);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDB();
  const s = await db.sessions.get(id);
  if (!s) return;
  await db.sessions.put(touch({ ...s, deletedAt: nowISO() }));
}

export function newEmptySession(dateKey = todayKey(), indexOfDay = 1): WorkoutSession {
  return {
    id: uid(),
    ownerId: _owner,
    date: dateKey,
    title: null,
    sessionIndexOfDay: indexOfDay,
    routineId: null,
    startedAt: nowISO(),
    endedAt: null,
    bodyweight: null,
    note: null,
    exercises: [],
    bodyParts: [],
    totalVolume: 0,
    totalSets: 0,
    updatedAt: nowISO(),
    _dirty: 1,
    deletedAt: null,
  };
}

/* ---------------- 파생 조회 (핵심) ---------------- */

/**
 * 운동별 "실제 최근 수행기록"을 반환.
 * stale-weight 버그 방지: 루틴 기본값이 아닌, 가장 최근 실제 세션의 세트를 준다.
 */
export async function getLastPerformance(
  exerciseId: string,
  excludeSessionId?: string
): Promise<{ session: WorkoutSession; sets: WorkoutSet[] } | null> {
  const sessions = await listSessions(); // 최신순
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    const ex = s.exercises.find(
      (e) => e.exerciseId === exerciseId && e.sets.some((x) => x.isCompleted)
    );
    if (ex) return { session: s, sets: ex.sets };
  }
  return null;
}

/** 운동별 진척 히스토리(차트/최근기록) */
export async function getExerciseHistory(
  exerciseId: string
): Promise<ExerciseHistoryPoint[]> {
  const sessions = await listSessions();
  const points: ExerciseHistoryPoint[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const done = ex.sets.filter((x) => x.isCompleted);
      if (done.length === 0) continue;
      let top = done[0];
      let best1RM = 0;
      for (const st of done) {
        if (st.weight > top.weight) top = st;
        best1RM = Math.max(best1RM, estimate1RM(st.weight, st.reps));
      }
      points.push({
        date: s.date,
        sessionId: s.id,
        topSetWeight: top.weight,
        topSetReps: top.reps,
        best1RM: Math.round(best1RM * 10) / 10,
        volume: Math.round(setsVolume(ex.sets)),
        sets: ex.sets,
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPersonalRecord(
  exerciseId: string
): Promise<PersonalRecord | null> {
  const hist = await getExerciseHistory(exerciseId);
  if (hist.length === 0) return null;
  let pr: PersonalRecord = {
    exerciseId,
    maxWeight: 0,
    maxWeightReps: 0,
    best1RM: 0,
    maxVolumeSession: 0,
    achievedAt: hist[0].date,
  };
  for (const p of hist) {
    if (p.topSetWeight > pr.maxWeight) {
      pr.maxWeight = p.topSetWeight;
      pr.maxWeightReps = p.topSetReps;
      pr.achievedAt = p.date;
    }
    pr.best1RM = Math.max(pr.best1RM, p.best1RM);
    pr.maxVolumeSession = Math.max(pr.maxVolumeSession, p.volume);
  }
  return pr;
}

/* ---------------- Body metrics ---------------- */

export async function listBodyMetrics(): Promise<BodyMetric[]> {
  const db = getDB();
  const all = await db.bodyMetrics.where("ownerId").equals(_owner).toArray();
  return all
    .filter((m) => !m.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function upsertBodyMetric(
  dateKey: string,
  patch: Partial<Pick<BodyMetric, "weight" | "bodyFatPct" | "muscleMass" | "note">>
): Promise<BodyMetric> {
  const db = getDB();
  const all = await db.bodyMetrics.where("ownerId").equals(_owner).toArray();
  const existing = all.find((m) => m.date === dateKey && !m.deletedAt);
  const rec: BodyMetric = {
    id: existing?.id ?? uid(),
    ownerId: _owner,
    date: dateKey,
    weight: patch.weight ?? existing?.weight ?? null,
    bodyFatPct: patch.bodyFatPct ?? existing?.bodyFatPct ?? null,
    muscleMass: patch.muscleMass ?? existing?.muscleMass ?? null,
    note: patch.note ?? existing?.note ?? null,
    updatedAt: nowISO(),
    _dirty: 1,
    deletedAt: null,
  };
  await db.bodyMetrics.put(rec);
  return rec;
}

/* ---------------- 로그인 시 로컬→계정 데이터 이관 ---------------- */

export async function migrateLocalDataTo(userId: string): Promise<number> {
  const db = getDB();
  let moved = 0;
  const reassign = async (
    table: "routines" | "sessions" | "bodyMetrics" | "exercises"
  ) => {
    const rows = await db.table(table).where("ownerId").equals(LOCAL_OWNER).toArray();
    for (const r of rows) {
      r.ownerId = userId;
      r.updatedAt = nowISO();
      r._dirty = 1;
      await db.table(table).put(r);
      moved++;
    }
  };
  await reassign("routines");
  await reassign("sessions");
  await reassign("bodyMetrics");
  // 커스텀 운동만 이관
  const customEx = await db.exercises
    .where("ownerId")
    .equals(LOCAL_OWNER)
    .toArray();
  for (const e of customEx) {
    e.ownerId = userId;
    e.updatedAt = nowISO();
    e._dirty = 1;
    await db.exercises.put(e);
    moved++;
  }
  // 로컬 프로필 → 계정 프로필 승격(계정 프로필 없을 때만)
  const localProfile = await db.profile.get(LOCAL_OWNER);
  const acctProfile = await db.profile.get(userId);
  if (localProfile && !acctProfile) {
    await db.profile.put({ ...localProfile, id: userId, _dirty: 1, updatedAt: nowISO() });
  }
  return moved;
}
