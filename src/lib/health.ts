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

type HealthPlugin = typeof import("@capgo/capacitor-health").Health;

// 이 패키지는 불러올 때 window를 참조할 수 있어 필요할 때만 불러온다(정적 빌드 보호).
// ⚠️ Capacitor 플러그인 객체는 모든 속성(then 포함)을 네이티브 호출로 바꾸는 Proxy라서
//    async 함수에서 '그대로 반환'하면 Promise가 thenable로 착각해 영원히 기다린다.
//    그래서 플러그인을 반환하지 않고, 콜백 안에서 바로 쓰게 한다.
async function withHealth<T>(fn: (H: HealthPlugin) => Promise<T>): Promise<T> {
  const mod = await import("@capgo/capacitor-health");
  return fn(mod.Health);
}

/** 응답이 없으면 에러로 끝내기(무한 대기 방지) */
function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} 응답 없음`)), ms)),
  ]);
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
    const r = await timeout(withHealth((H) => H.isAvailable()), 8000, "Health Connect");
    if (r.available) return "available";
    return /install|update|provider/i.test(r.reason ?? "") ? "not-installed" : "unsupported";
  } catch {
    return "unsupported"; // 구버전 앱(플러그인 없음)
  }
}

/** 권한 요청 → 하나라도 허용되면 연결됨 */
export async function connectHealth(): Promise<boolean> {
  await withHealth((H) => H.requestAuthorization({ read: [...READ], write: [] }));
  // 결과는 Health Connect에 실제로 허용된 권한으로 다시 확인(권한 화면 결과 전달이 누락돼도 안전)
  return refreshLinked();
}

/** Health Connect에 허용된 읽기 권한이 있는지 확인해 연결 상태를 갱신 */
export async function refreshLinked(): Promise<boolean> {
  try {
    const r = await timeout(
      withHealth((H) => H.checkAuthorization({ read: [...READ], write: [] })),
      8000,
      "권한 확인"
    );
    const ok = (r.readAuthorized ?? []).length > 0;
    setLinked(ok);
    return ok;
  } catch {
    return isHealthLinked();
  }
}

export function disconnectHealth() {
  setLinked(false);
}

type Sample = { value: number; startDate: string; endDate: string };

async function read(dataType: (typeof READ)[number], start: Date, end: Date): Promise<Sample[]> {
  const { samples } = await timeout(
    withHealth((H) =>
      H.readSamples({
        dataType,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 0, // 0 = 전부
        ascending: true,
      })
    ),
    15000,
    "건강 데이터 읽기"
  );
  return samples as Sample[];
}

/** 설정 화면 미리보기: 최근 체중·오늘 걸음 수(데이터가 실제로 들어오는지 확인용) */
export async function healthPreview(): Promise<{
  weight: { kg: number; date: string } | null;
  stepsToday: number;
}> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const [w, steps] = await Promise.all([
    read("weight", start, end).catch(() => [] as Sample[]),
    stepsByDay(1).catch(() => [] as { date: string; steps: number }[]),
  ]);
  const last = w[w.length - 1];
  return {
    weight: last ? { kg: Math.round(last.value * 10) / 10, date: toDateKey(new Date(last.startDate)) } : null,
    stepsToday: steps[0]?.steps ?? 0,
  };
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
