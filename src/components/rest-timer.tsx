"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus, Timer } from "lucide-react";
import { fmtDuration } from "@/lib/utils";
import { vibrate, playRestSound } from "@/lib/feedback";
import { useProfile } from "@/lib/hooks";
import type { RestSound } from "@/lib/types";

export function RestTimer({
  endsAt,
  setEndsAt,
  onClose,
}: {
  endsAt: number | null;
  setEndsAt: (v: number | null) => void;
  onClose: () => void;
}) {
  const { data: profile } = useProfile();
  const alertRef = useRef(true);
  alertRef.current = profile?.restAlert !== false;
  const soundRef = useRef<RestSound>("chime");
  soundRef.current = profile?.restSound ?? "chime";
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
        // 종료 5초 전부터 매초 카운트다운 진동
        if (alertRef.current && rem >= 1 && rem <= 5) vibrate(70);
        lastRem.current = rem;
      }
      if (rem <= 0 && !buzzed.current) {
        buzzed.current = true;
        if (alertRef.current) {
          vibrate([120, 60, 120]);
          playRestSound(soundRef.current);
        }
      }
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [endsAt]);

  if (!endsAt) return null;
  const done = remaining <= 0;
  const total = 180; // 시각용 대략 최대
  const pct = Math.min(100, (remaining / total) * 100);

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 animate-slide-up">
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
                onClick={() => setEndsAt(endsAt - 15000)}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-2 active:scale-90"
                aria-label="15초 감소"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => setEndsAt(endsAt + 15000)}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-2 active:scale-90"
                aria-label="15초 추가"
              >
                <Plus size={16} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
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
