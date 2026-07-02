import type { SupabaseClient } from "@supabase/supabase-js";
import { getDB, KV } from "./db";
import { getSupabase } from "./supabase";
import type { SyncMeta } from "./types";

// 동기화 대상 테이블(빌트인 운동 제외 — 커스텀만)
const TABLES = ["profile", "exercises", "routines", "sessions", "bodyMetrics"] as const;
type SyncTable = (typeof TABLES)[number];

// Dexie 테이블명 → Supabase 테이블명
const REMOTE: Record<SyncTable, string> = {
  profile: "profiles",
  exercises: "exercises",
  routines: "routines",
  sessions: "sessions",
  bodyMetrics: "body_metrics",
};

type AnyRec = SyncMeta & { id: string; ownerId?: string | null; isBuiltIn?: boolean };

let syncing = false;
let onRemoteChange: (() => void) | null = null;
/** pull로 원격 변경이 로컬에 반영되면 호출됨(React Query invalidate 연결용) */
export function setOnRemoteChange(cb: () => void) {
  onRemoteChange = cb;
}
let listeners: Array<(s: SyncState) => void> = [];
export type SyncState = {
  status: "idle" | "syncing" | "error" | "offline";
  lastSyncedAt: string | null;
  pending: number;
};
let state: SyncState = { status: "idle", lastSyncedAt: null, pending: 0 };

export function onSyncState(cb: (s: SyncState) => void): () => void {
  listeners.push(cb);
  cb(state);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

async function countDirty(userId: string): Promise<number> {
  const db = getDB();
  let n = 0;
  for (const t of TABLES) {
    const rows = (await db.table(t).where("_dirty").equals(1).toArray()) as AnyRec[];
    n += rows.filter((r) => t === "exercises" ? !r.isBuiltIn : true).length;
  }
  return n;
}

async function pushTable(sb: SupabaseClient, t: SyncTable, userId: string) {
  const db = getDB();
  let rows = (await db.table(t).where("_dirty").equals(1).toArray()) as AnyRec[];
  if (t === "exercises") rows = rows.filter((r) => !r.isBuiltIn);
  // 소유자 일치하는 것만
  rows = rows.filter((r) => (r.ownerId ?? userId) === userId || t === "profile");
  if (rows.length === 0) return;

  const payload = rows.map((r) => ({
    id: r.id,
    owner_id: userId,
    data: r,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt ?? null,
  }));

  const { error } = await sb.from(REMOTE[t]).upsert(payload, { onConflict: "id" });
  if (error) throw error;

  // 성공 → dirty 해제
  await db.transaction("rw", db.table(t), async () => {
    for (const r of rows) {
      const cur = (await db.table(t).get(r.id)) as AnyRec | undefined;
      // push 이후 로컬이 다시 수정됐다면(updatedAt 변동) 건드리지 않음
      if (cur && cur.updatedAt === r.updatedAt) {
        await db.table(t).update(r.id, { _dirty: 0 });
      }
    }
  });
}

async function pullTable(sb: SupabaseClient, t: SyncTable, userId: string): Promise<number> {
  const db = getDB();
  const cursorKey = `pull:${t}:${userId}`;
  const since = (await KV.get<string>(cursorKey)) ?? "1970-01-01T00:00:00.000Z";

  const { data, error } = await sb
    .from(REMOTE[t])
    .select("id,data,updated_at,deleted_at")
    .eq("owner_id", userId)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  let written = 0;
  await db.transaction("rw", db.table(t), async () => {
    for (const row of data) {
      const remote = row.data as AnyRec;
      // 원격 타임스탬프를 표준 ISO(...Z)로 정규화 → nowISO()로 만든 로컬 값과
      // 포맷 일치(PostgREST는 ...+00:00 로 돌려줌). 비교/정렬 안정화.
      remote.updatedAt = new Date(row.updated_at).toISOString();
      remote.deletedAt = row.deleted_at
        ? new Date(row.deleted_at).toISOString()
        : null;
      remote._dirty = 0;
      remote.ownerId = userId;
      const local = (await db.table(t).get(remote.id)) as AnyRec | undefined;
      // last-write-wins: 시각을 epoch(ms)로 비교(문자열 포맷 불일치 방지).
      if (!local || Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) {
        await db.table(t).put(remote);
        written++;
      }
    }
  });
  // updated_at 오름차순이므로 마지막 행이 최대값 → 정밀도 손실 없이 커서 저장.
  await KV.set(cursorKey, data[data.length - 1].updated_at);
  return written;
}

/** 전체 동기화: push → pull */
export async function fullSync(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  if (syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    emit({ status: "offline" });
    return;
  }

  syncing = true;
  emit({ status: "syncing" });
  try {
    for (const t of TABLES) await pushTable(sb, t, userId);
    let pulled = 0;
    for (const t of TABLES) pulled += await pullTable(sb, t, userId);
    emit({
      status: "idle",
      lastSyncedAt: new Date().toISOString(),
      pending: await countDirty(userId),
    });
    // 원격 변경이 로컬에 반영됐으면 UI 갱신
    if (pulled > 0 && onRemoteChange) onRemoteChange();
  } catch (e) {
    console.error("[sync] 실패", e);
    emit({ status: "error", pending: await countDirty(userId).catch(() => 0) });
  } finally {
    syncing = false;
  }
}

// 디바운스된 백그라운드 push (기록 직후)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(delay = 1500) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void fullSync();
  }, delay);
}

let realtimeBound = false;
/** 로그인 후 실시간 구독(다른 기기 변경 → pull). 리플리케이션 미설정 시 조용히 무동작. */
export function bindRealtime(userId: string) {
  const sb = getSupabase();
  if (!sb || realtimeBound) return;
  realtimeBound = true;
  const ch = sb.channel("ounwan-sync");
  for (const t of TABLES) {
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: REMOTE[t],
        filter: `owner_id=eq.${userId}`,
      },
      () => scheduleSync(800)
    );
  }
  ch.subscribe();
}
