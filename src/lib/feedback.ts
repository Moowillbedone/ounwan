// 휴식 타이머 알림: 진동 + Web Audio 합성음
// - Web Audio는 시스템 출력(이어폰/스피커)과 볼륨·무음 설정을 그대로 따른다.
// - 오디오는 사용자 제스처 안에서 arm()으로 언락해야 iOS 등에서 재생된다.

import type { RestSound } from "./types";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** 사용자 제스처(세트 완료 탭 등) 안에서 호출 → 오디오 재생 언락 */
export function armFeedback() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* noop */
  }
}

export const REST_SOUNDS: { id: RestSound; label: string; desc: string }[] = [
  { id: "chime", label: "띵딩딩", desc: "부드러운 기본음" },
  { id: "beep", label: "삐빅삐빅", desc: "크고 선명한 알림" },
  { id: "arcade", label: "뾰로롱", desc: "밝고 큰 상승음" },
];

interface Note {
  f: number;
  t: number;
  dur: number;
  type?: OscillatorType;
  peak?: number;
}

const SOUND_NOTES: Record<RestSound, Note[]> = {
  // 기본: 부드러운 사인 상승 3음 (G5·B5·E6)
  chime: [
    { f: 784, t: 0, dur: 0.22, type: "sine", peak: 0.3 },
    { f: 988, t: 0.13, dur: 0.22, type: "sine", peak: 0.3 },
    { f: 1319, t: 0.26, dur: 0.26, type: "sine", peak: 0.32 },
  ],
  // 크고 선명한 알람: 사각파 3연타(음악과 겹쳐도 뚫고 들림)
  beep: [
    { f: 1047, t: 0, dur: 0.12, type: "square", peak: 0.5 },
    { f: 1047, t: 0.17, dur: 0.12, type: "square", peak: 0.5 },
    { f: 1319, t: 0.34, dur: 0.16, type: "square", peak: 0.55 },
  ],
  // 밝고 큰 상승음(도미솔도, 사각파)
  arcade: [
    { f: 523, t: 0, dur: 0.1, type: "square", peak: 0.42 },
    { f: 659, t: 0.09, dur: 0.1, type: "square", peak: 0.42 },
    { f: 784, t: 0.18, dur: 0.1, type: "square", peak: 0.42 },
    { f: 1047, t: 0.27, dur: 0.28, type: "square", peak: 0.5 },
  ],
};

/** 휴식 종료 알림음 재생(기본 chime). Web Audio라 시스템 출력·볼륨을 그대로 따른다. */
export function playRestSound(sound: RestSound = "chime") {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  const notes = SOUND_NOTES[sound] ?? SOUND_NOTES.chime;
  for (const { f, t, dur, type = "sine", peak = 0.3 } of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = f;
    const start = now + t;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }
}
