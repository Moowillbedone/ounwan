"use client";

import { isNativeApp } from "./native";

// 러닝 음성 안내. 앱은 안드로이드 음성 엔진(화면이 꺼져도 동작), 브라우저는 Web Speech.
// 켜고 끄기는 기기별 설정(localStorage) — 기본 켜짐.

const KEY = "ounwan-run-voice";

export function isVoiceOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVoiceOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* noop */
  }
}

export async function speak(text: string) {
  if (!isVoiceOn()) return;
  try {
    if (isNativeApp()) {
      // 이 패키지는 불러오는 순간 window를 참조해서, 정적 빌드(서버)에서 깨지지 않게 필요할 때 불러온다
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.speak({ text, lang: "ko-KR", rate: 1.0, volume: 1.0, category: "playback" });
      return;
    }
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    synth.speak(u);
  } catch {
    /* 음성 엔진이 없으면 조용히 무시 */
  }
}

/** 초 → "5분 32초" / "1시간 3분" (음성용) */
export function spokenDuration(sec: number): string {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}
