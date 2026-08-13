"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus, Timer, GripVertical } from "lucide-react";
import { fmtDuration } from "@/lib/utils";
import { vibrate, fireRestNow } from "@/lib/feedback";
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

  // 바 위치(위/아래) — 드래그로 옮기고 가까운 가장자리에 스냅, localStorage에 기억
  const [pos, setPos] = useState<"top" | "bottom">("bottom");
  useEffect(() => {
    try {
      if (localStorage.getItem("ounwan-rest-pos") === "top") setPos("top");
    } catch {
      /* noop */
    }
  }, []);
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragLastY = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);

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
        if (alertRef.current) {
          vibrate([120, 60, 120]);
          // 포그라운드 1차 경로: 종료 순간 '지금 즉시' 재생(예약분과 겹쳐도 restFired로 1회만)
          if (typeof document !== "undefined" && document.visibilityState === "visible")
            fireRestNow(rest?.sound ?? "chime");
        }
      }
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  // 휴식 완료 6초 뒤 자동 정리 — 정리 직전, 아직 안 울렸으면 보장 재생 후 정리
  useEffect(() => {
    if (!endsAt) return;
    const t = setTimeout(() => {
      if (
        alertRef.current &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      )
        fireRestNow(rest?.sound ?? "chime");
      stopRest();
    }, Math.max(0, endsAt + 6000 - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  if (!endsAt) return null;
  const done = remaining <= 0;
  const total = 180; // 시각용 대략 최대
  const pct = Math.min(100, (remaining / total) * 100);

  const onGripDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragLastY.current = e.clientY;
    setDragY(0);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (dragY === null) return;
    dragLastY.current = e.clientY;
    setDragY(e.clientY - dragStartY.current);
  };
  const onGripEnd = () => {
    if (dragY === null) return;
    // 손가락이 놓인 세로 위치가 화면 위쪽 절반이면 상단, 아니면 하단으로 스냅
    const next = dragLastY.current < window.innerHeight / 2 ? "top" : "bottom";
    setPos(next);
    try {
      localStorage.setItem("ounwan-rest-pos", next);
    } catch {
      /* noop */
    }
    setDragY(null);
  };

  return (
    <div
      ref={barRef}
      className="fixed left-1/2 z-[60] w-[calc(100%-2rem)] max-w-[448px] animate-slide-up"
      style={{
        transform: `translateX(-50%) translateY(${dragY ?? 0}px)`,
        ...(pos === "top"
          ? { top: "calc(env(safe-area-inset-top) + 60px)", bottom: "auto" }
          : {
              top: "auto",
              bottom: immersive ? "1rem" : "calc(env(safe-area-inset-bottom) + 72px)",
            }),
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
        <div className="relative flex items-center gap-2 px-2 py-2.5">
          <span
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripEnd}
            onPointerCancel={onGripEnd}
            className={`flex h-9 w-5 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing ${
              done ? "text-white/70" : "text-text-3"
            }`}
            aria-label="드래그해서 위/아래로 이동"
            title="드래그해서 위/아래로 이동"
          >
            <GripVertical size={16} />
          </span>
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
