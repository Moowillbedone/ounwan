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

/** 통계 탭 걸음 수(최근 14일) — 막대를 누르면 그날 걸음 수. Health Connect 연결 시에만 보인다 */
export function StepsCard() {
  const [days, setDays] = useState<{ date: string; steps: number }[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (!isNativeApp() || !isHealthLinked()) return;
    void stepsByDay(14).then(setDays).catch(() => {});
  }, []);
  if (!days || days.every((d) => d.steps === 0)) return null;
  const idx = sel ?? days.length - 1;
  const cur = days[idx];
  const recent7 = days.slice(-7);
  const avg = Math.round(recent7.reduce((n, d) => n + d.steps, 0) / recent7.length);
  const max = Math.max(1, ...days.map((d) => d.steps));
  const dt = dateKeyToDate(cur.date);
  const wd = ["일", "월", "화", "수", "목", "금", "토"];
  const label = idx === days.length - 1 ? "오늘" : `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${wd[dt.getDay()]})`;
  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-1.5 font-bold">
        <Footprints size={16} className="text-text-3" /> 걸음 수
        <span className="text-[11px] font-medium text-text-3">· Health Connect</span>
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums">{fmtNum(cur.steps)}</span>
        <span className="text-xs font-semibold text-brand-strong">{label}</span>
        <span className="ml-auto text-xs text-text-3">7일 평균 {fmtNum(avg)}보</span>
      </div>
      <div className="flex h-20 items-end gap-1">
        {days.map((d, i) => {
          const on = i === idx;
          const day = dateKeyToDate(d.date);
          return (
            <button
              key={d.date}
              onClick={() => setSel(i)}
              aria-label={`${d.date} ${d.steps}보`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className={cn("w-full rounded-t-md transition", on ? "bg-brand" : "bg-brand/35")}
                style={{ height: `${Math.max(3, (d.steps / max) * 56)}px` }}
              />
              <span className={cn("text-[9px] leading-none", on ? "font-bold text-brand-strong" : "text-text-3")}>
                {i % 2 === (days.length - 1) % 2 || on ? wd[day.getDay()] : "·"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-text-3">막대를 누르면 그날 걸음 수가 보여요 · 최근 14일</p>
    </section>
  );
}
