"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Footprints } from "lucide-react";
import { useRun, movingSecOf, fmtKm, fmtClock } from "@/lib/run-tracker";
import { cn } from "./ui";

/** 달리기 기록 중 다른 화면에 떠 있는 작은 알약. 탭하면 러닝 화면으로. (헤더 오른쪽 배지와 안 겹치게 헤더 아래) */
export function RunPill() {
  const run = useRun();
  const [, tick] = useState(0);
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [run?.status]);
  if (!run) return null;
  return (
    <Link
      href="/run"
      className={cn(
        "fixed right-3 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-[var(--shadow-pop)]",
        run.status === "running" ? "bg-brand text-white" : "bg-surface-2 text-text-2 border border-border"
      )}
    >
      <Footprints size={14} />
      {fmtKm(run.distanceM)}km · {fmtClock(movingSecOf(run))}
      {run.status === "paused" && " · 일시정지"}
    </Link>
  );
}
