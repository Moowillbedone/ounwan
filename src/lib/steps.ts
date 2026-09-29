"use client";

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./native";

// 러닝 중 걸음 센서(StepCounterPlugin.java) — 앱 전용. 값은 '부팅 후 누적 걸음'.
// 구버전 앱(플러그인 없음)·센서 없는 기기·권한 거부면 조용히 꺼진 채로 둔다(걸음·케이던스만 비어 보임).
// ⚠️ 플러그인 객체(Proxy)를 async 함수에서 그대로 반환하지 말 것(then 호출로 영원히 대기) — health.ts 참고.

interface StepCounterPlugin {
  start(): Promise<{ started: boolean; reason?: string }>;
  stop(): Promise<void>;
  read(): Promise<{ steps?: number }>;
  addListener(event: "step", cb: (e: { steps: number }) => void): Promise<PluginListenerHandle>;
}
const StepCounter = registerPlugin<StepCounterPlugin>("StepCounter");

/** 센서 켜기 → 끄는 함수 반환(실패하면 아무것도 안 하는 함수) */
export async function startStepSensor(onSteps: (total: number) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const sub = await StepCounter.addListener("step", (e) => onSteps(e.steps));
    const r = await StepCounter.start();
    if (!r.started) {
      void sub.remove();
      return () => {};
    }
    return () => {
      void sub.remove();
      void StepCounter.stop().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/** 지금 센서 누적값(모르면 null) */
export async function readStepSensor(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const r = await Promise.race([
      StepCounter.read(),
      new Promise<{ steps?: number }>((res) => setTimeout(() => res({}), 1500)),
    ]);
    return typeof r.steps === "number" ? r.steps : null;
  } catch {
    return null;
  }
}
