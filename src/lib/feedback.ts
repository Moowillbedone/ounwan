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

function emitNotes(
  c: AudioContext,
  sound: RestSound,
  base: number,
  collect?: { osc: OscillatorNode; gain: GainNode }[]
) {
  const notes = SOUND_NOTES[sound] ?? SOUND_NOTES.chime;
  for (const { f, t, dur, type = "sine", peak = 0.3 } of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = f;
    const start = base + t;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    collect?.push({ osc, gain });
  }
}

/** 휴식 종료 알림음 즉시 재생(미리듣기 등). */
export function playRestSound(sound: RestSound = "chime") {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  emitNotes(c, sound, c.currentTime);
}

// --- 백그라운드 대응: 종료음을 오디오 타임라인에 예약 + 무음 keep-alive로 컨텍스트 유지 ---
let scheduled: { osc: OscillatorNode; gain: GainNode }[] = [];
let keepAlive: { osc: OscillatorNode; gain: GainNode } | null = null;

function startKeepAlive(stopAt: number) {
  const c = getCtx();
  if (!c) return;
  stopKeepAlive();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 440;
  gain.gain.value = 0.00015; // 사실상 무음(약 -76dB) — 컨텍스트만 살려둠
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  try {
    if (stopAt) osc.stop(stopAt);
  } catch {
    /* noop */
  }
  keepAlive = { osc, gain };
}
function stopKeepAlive() {
  if (!keepAlive) return;
  try {
    keepAlive.osc.stop();
  } catch {
    /* noop */
  }
  try {
    keepAlive.osc.disconnect();
    keepAlive.gain.disconnect();
  } catch {
    /* noop */
  }
  keepAlive = null;
}

/** 종료음을 delaySec 뒤에 울리도록 오디오 타임라인에 예약(백그라운드에서도 발화). */
export function scheduleRestSound(sound: RestSound, delaySec: number) {
  cancelScheduledRestSound();
  const c = getCtx();
  if (!c || delaySec <= 0) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const base = c.currentTime + delaySec;
  emitNotes(c, sound, base, scheduled);
  startKeepAlive(base + 3);
}

/** 예약된 종료음 취소(휴식 조정/스킵/종료 시). */
export function cancelScheduledRestSound() {
  for (const { osc, gain } of scheduled) {
    try {
      osc.stop();
    } catch {
      /* noop */
    }
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* noop */
    }
  }
  scheduled = [];
  stopKeepAlive();
}
