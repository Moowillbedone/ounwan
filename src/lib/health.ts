"use client";

import { registerPlugin } from "@capacitor/core";
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

/**
 * 걸음 합계(자체 네이티브 플러그인 HealthStepsPlugin.java).
 * 기록을 그냥 더하면 폰·워치가 같은 시간에 쓴 걸음이 중복돼 삼성 헬스보다 많게 나온다 →
 * Health Connect aggregate로 겹치는 구간을 걸러낸 합계를 쓴다. (모듈 최상위에서 등록 — async로 반환 금지)
 */
const HealthSteps = registerPlugin<{
  aggregate(o: { startDate: string; endDate: string }): Promise<{ steps: number }>;
}>("HealthSteps");

/** 걸음 합계 방식: 'merge'(시간대 병합 — 표시값) */
export let stepsMethod: "merge" = "merge";

/**
 * 폰·워치 걸음 '시간대 병합' — 삼성 헬스와 같은 방식.
 * - 단순 합산: 폰과 워치가 같은 시간에 센 걸음이 둘 다 들어가 많게 나온다.
 * - Health Connect aggregate: 겹치는 시간에 우선순위 앱/기기 하나만 남겨, 폰을 두고 워치만
 *   차고 걸은 시간 같은 걸 통째로 빼먹어 적게 나온다.
 * 그래서 ① 서로 겹치지 않는 기록끼리 '스트림'(대략 기기 하나)으로 묶고
 *        ② 스트림마다 1분 단위로 걸음을 나눠 담은 뒤
 *        ③ 같은 1분에서는 가장 많이 센 스트림 값만 쓴다.
 */
export function mergeSteps(samples: Sample[], start: Date, end: Date): number {
  const s0 = start.getTime();
  const e0 = end.getTime();
  const MIN = 60_000;
  const n = Math.max(1, Math.ceil((e0 - s0) / MIN));
  const recs = samples
    .map((x) => ({ a: Date.parse(x.startDate), b: Date.parse(x.endDate), v: x.value }))
    .filter((r) => isFinite(r.a) && r.v > 0)
    .map((r) => ({ ...r, b: isFinite(r.b) && r.b > r.a ? r.b : r.a }))
    .sort((p, q) => p.a - q.a || p.b - q.b);

  // ① 구간 분할: 앞선 스트림의 마지막 기록이 끝난 뒤 시작하면 같은 스트림에 넣는다
  const streams: { lastEnd: number; buckets: Float64Array }[] = [];
  for (const r of recs) {
    let st = streams.find((x) => x.lastEnd <= r.a);
    if (!st) {
      st = { lastEnd: -Infinity, buckets: new Float64Array(n) };
      streams.push(st);
    }
    st.lastEnd = Math.max(st.lastEnd, r.b);
    // ② 기록의 걸음을 겹치는 1분 칸들에 시간 비율대로 나눠 담기
    const a = Math.max(s0, r.a);
    const b = Math.min(e0, r.b);
    if (r.b === r.a) {
      const i = Math.floor((r.a - s0) / MIN);
      if (i >= 0 && i < n) st.buckets[i] += r.v;
      continue;
    }
    if (b <= a) continue;
    const rate = r.v / (r.b - r.a);
    for (let i = Math.floor((a - s0) / MIN); i < n && s0 + i * MIN < b; i++) {
      const lo = Math.max(a, s0 + i * MIN);
      const hi = Math.min(b, s0 + (i + 1) * MIN);
      if (hi > lo) st.buckets[i] += rate * (hi - lo);
    }
  }
  // ③ 1분마다 가장 큰 스트림 값
  let total = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const st of streams) if (st.buckets[i] > m) m = st.buckets[i];
    total += m;
  }
  return Math.round(total);
}

const SAMSUNG_HEALTH = "com.sec.android.app.shealth";

/**
 * 하루 걸음 계산.
 * - 삼성 헬스는 폰+워치를 이미 합친 걸음을 '그날 0시~24시 하루짜리 기록'으로 보낸다.
 *   삼성 기록이 있으면 그것만 쓴다(안드로이드 자체 폰 걸음 등 다른 출처는 삼성 값에 이미 포함 → 중복).
 * - 삼성이 없으면 여러 출처를 시간대 병합(mergeSteps).
 * - 창은 항상 '하루 전체'(0시~다음날 0시): 하루짜리 기록을 '지금 시각까지'로 잘라 비례 계산하면
 *   오후 2시에 하루 걸음의 14/24만 세는 과소 문제가 생긴다(R42).
 */
export function daySteps(samples: Sample[], dayStart: Date, dayEnd: Date): number {
  const samsung = samples.filter((x) => x.sourceId === SAMSUNG_HEALTH);
  return mergeSteps(samsung.length ? samsung : samples, dayStart, dayEnd);
}

async function stepsBetween(start: Date, end: Date): Promise<number> {
  const samples = await read("steps", start, end);
  return daySteps(samples, start, end);
}

/** 진단용: Health Connect 공식 합계(aggregate) — 구버전 앱이면 null */
export async function stepsAggregate(start: Date, end: Date): Promise<number | null> {
  try {
    const r = await timeout(
      HealthSteps.aggregate({ startDate: start.toISOString(), endDate: end.toISOString() }),
      15000,
      "걸음 합계"
    );
    return Math.round(r.steps);
  } catch {
    return null;
  }
}
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

type Sample = { value: number; startDate: string; endDate: string; sourceId?: string };

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

export interface HealthPreview {
  weight: { kg: number; date: string } | null;
  stepsToday: number;
  // 진단용 — 데이터가 안 보일 때 원인(동기화 지연·출처·오류)을 가리기 위해
  steps7d: number;
  stepRecords7d: number;
  lastStepAt: string | null; // 가장 최근 걸음 기록 시각(ISO)
  sources: string[]; // 걸음 기록을 쓴 앱 패키지
  stepsMethod: "merge";
  stepsTodayRaw: number; // 진단: 오늘 기록 단순 합산(중복 포함)
  stepsTodayAggregate: number | null; // 진단: Health Connect 공식 합계
  streamsToday: number; // 진단: 오늘 겹치는 기록 흐름 수(≈기기 수)
  errors: string[];
}

function countStreams(samples: Sample[]): number {
  const ends: number[] = [];
  for (const x of [...samples].sort((p, q) => Date.parse(p.startDate) - Date.parse(q.startDate))) {
    const a = Date.parse(x.startDate);
    const b = Math.max(a, Date.parse(x.endDate));
    const i = ends.findIndex((e) => e <= a);
    if (i >= 0) ends[i] = b;
    else ends.push(b);
  }
  return ends.length;
}

/** 설정 화면 미리보기 + 진단: 최근 체중, 오늘·7일 걸음, 기록 수·출처, 오류 */
export async function healthPreview(): Promise<HealthPreview> {
  const now = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const errors: string[] = [];
  const msg = (what: string, e: unknown) => `${what}: ${String((e as Error)?.message ?? e)}`;

  const [w, st] = await Promise.all([
    read("weight", monthAgo, now).catch((e) => (errors.push(msg("체중", e)), [] as Sample[])),
    read("steps", weekStart, tomorrowStart).catch((e) => (errors.push(msg("걸음", e)), [] as Sample[])),
  ]);
  const last = w[w.length - 1];
  const lastStep = st[st.length - 1];
  const todaySamples = st.filter((x) => Date.parse(x.endDate || x.startDate) > todayStart.getTime());
  return {
    weight: last ? { kg: Math.round(last.value * 10) / 10, date: toDateKey(new Date(last.startDate)) } : null,
    stepsToday: daySteps(todaySamples, todayStart, tomorrowStart),
    stepsMethod,
    stepsTodayRaw: Math.round(todaySamples.reduce((n, x) => n + x.value, 0)),
    stepsTodayAggregate: await stepsAggregate(todayStart, tomorrowStart),
    streamsToday: countStreams(todaySamples),
    steps7d: Math.round(st.reduce((n, x) => n + x.value, 0)),
    stepRecords7d: st.length,
    lastStepAt: lastStep ? lastStep.endDate || lastStep.startDate : null,
    sources: [...new Set(st.map((x) => x.sourceId).filter(Boolean) as string[])],
    errors,
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
  const out: { date: string; steps: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    out.push({ date: toDateKey(start), steps: await stepsBetween(start, end) });
  }
  return out;
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

/**
 * 러닝 구간 걸음(걸음 센서 기록이 없는 옛 러닝용).
 * 삼성 헬스의 '하루 통째 기록'은 구간을 알 수 없어 빼고(2시간 넘는 기록 제외),
 * 휴대폰·워치의 짧은 기록만 시간대 병합한다. 없으면 null.
 */
export async function stepsInWindow(startISO: string, endISO: string): Promise<number | null> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!(end > start)) return null;
  const samples = await read("steps", start, end);
  const fine = samples.filter(
    (x) => Date.parse(x.endDate || x.startDate) - Date.parse(x.startDate) <= 2 * 60 * 60 * 1000
  );
  const n = mergeSteps(fine, start, end);
  return n > 0 ? n : null;
}
