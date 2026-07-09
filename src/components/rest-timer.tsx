"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus, Timer } from "lucide-react";
import { fmtDuration } from "@/lib/utils";
import { vibrate } from "@/lib/feedback";
import { useProfile } from "@/lib/hooks";
import { useRestTimer, adjustRest, stopRest } from "@/lib/rest-timer";

// 전역 휴식 타이머 바. 앱셸에서 항상 마운트 → 화면 이동/재진입에도 유지된다.
// 소리 예약/취소는 rest-timer 스토어가 담당(여기선 표시 + 진동만).
export function RestTimer({ immersive }: { immersive?: boolean }) {
  const rest = useRestTimer();
  const endsAt = rest?.endsAt ?? null;
  const { data: profile } = useProfile();
  const alertRef = useRef(true);
  alertRef.current = profile?.restAlert !== false;
  const [remaining, setRemaining] = useState(0);
  const buzzed = useRef(false);
  const lastRem = useRef(-1);

  useEffect(() => {
    if (!endsAt) {
      lastRem.current = -1;
      return;
    }
    buzzed.current = false;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(rem);
      if (rem !== lastRem.current) {
        // 종료 5초 전부터 매초 카운트다운 진동(포그라운드)
        if (alertRef.current && rem >= 1 && rem <= 5) vibrate(70);
        lastRem.current = rem;
      }
      if (rem <= 0 && !buzzed.current) {
        buzzed.current = true;
        // 소리는 스토어가 예약함 → 여기선 진동만
        if (alertRef.current) vibrate([120, 60, 120]);
      }
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [endsAt]);

  // 휴식 완료 6초 뒤 자동 정리 — 전역 바가 '완료' 상태로 계속 남지 않도록
  useEffect(() => {
    if (!endsAt) return;
    const t = setTimeout(stopRest, Math.max(0, endsAt + 6000 - Date.now()));
    return () => clearTimeout(t);
  }, [endsAt]);

  if (!endsAt) return null;
  const done = remaining <= 0;
  const total = 180; // 시각용 대략 최대
  const pct = Math.min(100, (remaining / total) * 100);

  return (
    <div
      className="fixed left-1/2 z-50 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 animate-slide-up"
      style={{
        bottom: immersive ? "1rem" : "calc(env(safe-area-inset-bottom) + 72px)",
      }}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border shadow-[var(--shadow-pop)] ${
          done ? "border-brand bg-brand text-white" : "border-border bg-surface"
        }`}
      >
        {!done && (
          <div
            className="absolute inset-y-0 left-0 bg-brand-soft transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        )}
        <div className="relative flex items-center gap-3 px-3 py-2.5">
          <Timer size={20} className={done ? "text-white" : "text-brand"} />
          <div className="flex-1">
            <div className="text-[11px] font-semibold opacity-70">
              {done ? "휴식 완료! 다음 세트 준비" : "휴식 중"}
            </div>
            <div className="text-2xl font-black tabular-nums leading-none">
              {fmtDuration(remaining)}
            </div>
          </div>
          {!done && (
            <>
              <button
                onClick={() => adjustRest(-15000)}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-2 active:scale-90"
                aria-label="15초 감소"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => adjustRest(15000)}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-2 active:scale-90"
                aria-label="15초 추가"
              >
                <Plus size={16} />
              </button>
            </>
          )}
          <button
            onClick={stopRest}
            className={`grid h-9 w-9 place-items-center rounded-full active:scale-90 ${
              done ? "bg-white/20 text-white" : "bg-surface-2 text-text-2"
            }`}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
