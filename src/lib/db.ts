import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Routine,
  WorkoutSession,
  BodyMetric,
  Profile,
} from "./types";

// 로컬퍼스트 저장소. 세트는 세션 문서 내부에 임베드(개인 규모 → 조회는 세션 로드 후 계산).
export class OunwanDB extends Dexie {
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<WorkoutSession, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  profile!: Table<Profile, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("ounwan");
    this.version(1).stores({
      // 인덱스: 동기화(_dirty), 소유자/날짜 조회
      exercises: "id, ownerId, bodyPart, _dirty, updatedAt",
      routines: "id, ownerId, _dirty, updatedAt",
      sessions: "id, ownerId, date, _dirty, updatedAt",
      bodyMetrics: "id, ownerId, date, _dirty, updatedAt",
      profile: "id, _dirty, updatedAt",
      kv: "key",
    });
  }
}

let _db: OunwanDB | null = null;

/** 브라우저에서만 DB 인스턴스 생성(SSR 안전) */
export function getDB(): OunwanDB {
  if (typeof window === "undefined") {
    throw new Error("DB는 브라우저에서만 사용할 수 있습니다.");
  }
  if (!_db) _db = new OunwanDB();
  return _db;
}

export const KV = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await getDB().kv.get(key);
    return row?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await getDB().kv.put({ key, value });
  },
};
