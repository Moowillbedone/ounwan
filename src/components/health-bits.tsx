"use client";

import { useEffect, useState } from "react";
import { HeartPulse, Footprints } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { isHealthLinked, heartRateBetween, stepsByDay } from "@/lib/health";
import { dateKeyToDate, fmtNum } from "@/lib/utils";
import { cn } from "./ui";

/** 러닝 시간대의 평균·최고 심박(Health Connect 연결 + 워치 기록이 있을 때만) */
export function RunHeartRate({ startedAt, endedAt }: { startedAt?: string | null; endedAt?: string | null }) {
  const [hr, setHr] = useState<{ avg: number; max: number } | null>(null);
  useEffect(() => {
    if (!startedAt || !endedAt || !isNativeApp() || !isHealthLinked()) return;
    let alive = true;
    void heartRateBetween(startedAt, endedAt)
      .then((r) => alive && setHr(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [startedAt, endedAt]);
  if (!hr) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1 text-sm text-text-2">
      <HeartPulse size={14} className="text-danger" />
      심박 평균 <b className="text-text">{hr.avg}</b> · 최고 <b className="text-text">{hr.max}</b>
      <span className="text-text-3">bpm</span>
    </div>
  );
}

/** 통계 탭 걸음 수(오늘·7일) — Health Connect 연결 시에만 보인다 */
export function StepsCard() {
  const [days, setDays] = useState<{ date: string; steps: number }[] | null>(null);
  useEffect(() => {
    if (!isNativeApp() || !isHealthLinked()) return;
    void stepsByDay(7).then(setDays).catch(() => {});
  }, []);
  if (!days || days.every((d) => d.steps === 0)) return null;
  const today = days[days.length - 1].steps;
  const avg = Math.round(days.reduce((n, d) => n + d.steps, 0) / days.length);
  const max = Math.max(1, ...days.map((d) => d.steps));
  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-1.5 font-bold">
        <Footprints size={16} className="text-text-3" /> 걸음 수
        <span className="text-[11px] font-medium text-text-3">· Health Connect</span>
      </div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-2xl font-black">{fmtNum(today)}</span>
        <span className="text-xs text-text-3">오늘 · 7일 평균 {fmtNum(avg)}보</span>
      </div>
      <div className="flex h-16 items-end gap-1.5">
        {days.map((d, i) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn("w-full rounded-t-md", i === days.length - 1 ? "bg-brand" : "bg-brand/40")}
              style={{ height: `${Math.max(3, (d.steps / max) * 52)}px` }}
            />
            <span className="text-[9px] text-text-3">
              {["일", "월", "화", "수", "목", "금", "토"][dateKeyToDate(d.date).getDay()]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
