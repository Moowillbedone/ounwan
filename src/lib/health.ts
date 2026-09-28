"use client";

import { isNativeApp } from "./native";
import { toDateKey } from "./utils";
import * as repo from "./repo";

// Health Connect(안드로이드 건강 데이터 허브) 연동 — 앱 전용.
// 삼성 헬스가 Health Connect로 공유하도록 켜 두면 갤럭시 워치·스마트 체중계 기록이 여기로 들어온다.
// - 체중: 최근 30일 기록을 날짜별 최신값으로 가져와, 오운완에 체중이 없는 날만 채운다(직접 입력값 보존)
// - 걸음 수: 오늘·최근 7일
// - 심박: 러닝 시간대의 평균·최고 심박
// 권한은 기기 단위라서 '연결됨' 표시는 기기별(localStorage)로 둔다.

const KEY = "ounwan-health";
const READ = ["weight", "steps", "heartRate"] as const;

// 이 패키지는 불러올 때 window를 참조할 수 있어 필요할 때만 불러온다(정적 빌드 보호)
async function plugin() {
  const { Health } = await import("@capgo/capacitor-health");
  return Health;
}

export function isHealthLinked(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function setLinked(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export type HealthStatus = "unsupported" | "not-installed" | "available";

export async function healthStatus(): Promise<HealthStatus> {
  if (!isNativeApp()) return "unsupported";
  try {
    const r = await (await plugin()).isAvailable();
    if (r.available) return "available";
    return /install|update|provider/i.test(r.reason ?? "") ? "not-installed" : "unsupported";
  } catch {
    return "unsupported"; // 구버전 앱(플러그인 없음)
  }
}

/** 권한 요청 → 하나라도 허용되면 연결됨 */
export async function connectHealth(): Promise<boolean> {
  const H = await plugin();
  const r = await H.requestAuthorization({ read: [...READ], write: [] });
  const ok = (r.readAuthorized ?? []).length > 0;
  setLinked(ok);
  return ok;
}

export function disconnectHealth() {
  setLinked(false);
}

type Sample = { value: number; startDate: string; endDate: string };

async function read(dataType: (typeof READ)[number], start: Date, end: Date): Promise<Sample[]> {
  const H = await plugin();
  const { samples } = await H.readSamples({
    dataType,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: 0, // 0 = 전부
    ascending: true,
  });
  return samples as Sample[];
}

/** 최근 30일 체중을 가져와 체중이 비어 있는 날만 채운다. 채운 날 수를 반환. */
export async function importWeights(): Promise<number> {
  if (!isHealthLinked()) return 0;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const samples = await read("weight", start, end);
  const latestByDate = new Map<string, number>();
  for (const s of samples) latestByDate.set(toDateKey(new Date(s.startDate)), s.value); // 오름차순 → 마지막이 최신
  const existing = new Set(
    (await repo.listBodyMetrics()).filter((m) => m.weight != null).map((m) => m.date)
  );
  let added = 0;
  for (const [date, kg] of latestByDate) {
    if (existing.has(date) || !(kg > 0)) continue;
    await repo.upsertBodyMetric(date, { weight: Math.round(kg * 10) / 10 });
    added++;
  }
  return added;
}

/** 최근 7일 날짜별 걸음 수(오늘 포함) */
export async function stepsByDay(days = 7): Promise<{ date: string; steps: number }[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const samples = await read("steps", start, new Date());
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map.set(toDateKey(d), 0);
  }
  for (const s of samples) {
    const k = toDateKey(new Date(s.startDate));
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + s.value);
  }
  return [...map.entries()].map(([date, steps]) => ({ date, steps: Math.round(steps) }));
}

/** 시간 구간의 평균·최고 심박(워치가 없으면 null) */
export async function heartRateBetween(
  startISO: string,
  endISO: string
): Promise<{ avg: number; max: number } | null> {
  const samples = await read("heartRate", new Date(startISO), new Date(endISO));
  if (samples.length === 0) return null;
  const vals = samples.map((s) => s.value).filter((v) => v > 0);
  if (vals.length === 0) return null;
  return {
    avg: Math.round(vals.reduce((n, v) => n + v, 0) / vals.length),
    max: Math.round(Math.max(...vals)),
  };
}
