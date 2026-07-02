// 휴식 타이머 알림: 진동 + Web Audio 합성음
// - Web Audio는 시스템 출력(이어폰/스피커)과 볼륨·무음 설정을 그대로 따른다.
// - 오디오는 사용자 제스처 안에서 arm()으로 언락해야 iOS 등에서 재생된다.

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

/** 휴식 종료 알림음 "띵딩딩~" (상승하는 3음) */
export function playRestDoneChime() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  // G5 · B5 · E6
  const notes = [
    { f: 784, t: 0 },
    { f: 988, t: 0.13 },
    { f: 1319, t: 0.26 },
  ];
  for (const { f, t } of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = now + t;
    const dur = 0.22;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }
}
