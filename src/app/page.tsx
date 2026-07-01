"use client";

import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useSessions, useBodyMetrics, useProfile } from "@/lib/hooks";
import { toDateKey, todayKey, fmtNum, computeStreak } from "@/lib/utils";
import { BODY_PART_META } from "@/lib/constants";
import { Heatmap, HeatmapLegend } from "@/components/heatmap";
import { DayDetailSheet } from "@/components/day-detail";
import { SyncPill } from "@/components/sync-pill";
import type { WorkoutSession, BodyPart } from "@/lib/types";

export default function HomePage() {
  const { data: sessions } = useSessions();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weekStartsOn = profile?.weekStartsMonday === false ? 0 : 1;

  const byDate = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>();
    for (const s of sessions ?? []) {
      const arr = m.get(s.date) ?? [];
      arr.push(s);
      m.set(s.date, arr);
    }
    return m;
  }, [sessions]);

  const bwByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of metrics ?? []) if (b.weight != null) m.set(b.date, b.weight);
    return m;
  }, [metrics]);

  // 잔디 레벨: 하루 총 세트수 기준
  const heatData = useMemo(() => {
    const m = new Map<string, number>();
    for (const [date, arr] of byDate) {
      const sets = arr.reduce((n, s) => n + s.totalSets, 0);
      const lvl = sets === 0 ? 1 : sets < 9 ? 1 : sets < 17 ? 2 : sets < 25 ? 3 : 4;
      m.set(date, Math.max(1, lvl));
    }
    return m;
  }, [byDate]);

  const streak = useMemo(
    () => computeStreak(new Set(byDate.keys())),
    [byDate]
  );

  // 이번 달 통계
  const monthStats = useMemo(() => {
    let days = 0;
    let volume = 0;
    let sets = 0;
    for (const [date, arr] of byDate) {
      const d = new Date(date);
      if (isSameMonth(d, monthCursor)) {
        days++;
        volume += arr.reduce((n, s) => n + s.totalVolume, 0);
        sets += arr.reduce((n, s) => n + s.totalSets, 0);
      }
    }
    return { days, volume, sets };
  }, [byDate, monthCursor]);

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn });
    return eachDayOfInterval({ start, end });
  }, [monthCursor, weekStartsOn]);

  const weekdayLabels =
    weekStartsOn === 1
      ? ["월", "화", "수", "목", "금", "토", "일"]
      : ["일", "월", "화", "수", "목", "금", "토"];

  const monthLabel = `${monthCursor.getFullYear()}년 ${monthCursor.getMonth() + 1}월`;

  return (
    <div className="px-4 pt-4">
      {/* 헤더 */}
      <header className="flex items-center justify-between mb-4">
        <div className="text-2xl font-black tracking-tight text-brand">오운완</div>
        <SyncPill />
      </header>

      {/* 스트릭 + 월 통계 */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <StatBox
          highlight
          label="연속기록"
          value={
            <span className="flex items-center gap-1">
              <Flame size={18} className="text-brand" />
              {streak.current}
            </span>
          }
          sub="일째"
        />
        <StatBox label="이번 달 운동" value={monthStats.days} sub="일" />
        <StatBox
          label="이번 달 볼륨"
          value={fmtNum(monthStats.volume)}
          sub={profile?.unit === "lb" ? "lb·회" : "kg·회"}
        />
      </div>

      {/* 월 캘린더 */}
      <section className="rounded-app bg-surface border border-border shadow-[var(--shadow-card)] p-3 mb-5">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="font-bold">{monthLabel}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonthCursor((m) => addMonths(m, -1))}
              className="h-8 w-8 grid place-items-center rounded-full hover:bg-surface-2 text-text-2"
              aria-label="이전 달"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setMonthCursor(startOfMonth(new Date()))}
              className="h-8 px-3 rounded-full text-sm font-semibold hover:bg-surface-2 text-brand"
            >
              오늘
            </button>
            <button
              onClick={() => setMonthCursor((m) => addMonths(m, 1))}
              className="h-8 w-8 grid place-items-center rounded-full hover:bg-surface-2 text-text-2"
              aria-label="다음 달"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-text-3 mb-1">
          {weekdayLabels.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {grid.map((day) => {
            const key = toDateKey(day);
            const inMonth = isSameMonth(day, monthCursor);
            const isToday = key === todayKey();
            const daySessions = byDate.get(key);
            const parts: BodyPart[] = daySessions
              ? [...new Set(daySessions.flatMap((s) => s.bodyParts))]
              : [];
            const hasBw = bwByDate.has(key);
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className="flex flex-col items-center gap-1 py-1 rounded-xl active:bg-surface-2 transition"
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold ${
                    isToday
                      ? "bg-brand text-white"
                      : inMonth
                      ? "text-text"
                      : "text-text-3/50"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {parts.slice(0, 3).map((bp) => (
                    <span
                      key={bp}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: BODY_PART_META[bp].color }}
                    />
                  ))}
                  {parts.length === 0 && hasBw && (
                    <span className="h-1.5 w-1.5 rounded-full bg-text-3/40" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 잔디 히트맵 */}
      <section className="rounded-app bg-surface border border-border shadow-[var(--shadow-card)] p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold">연속기록 잔디</div>
          <span className="text-xs text-text-3">
            최장 {streak.longest}일
          </span>
        </div>
        <Heatmap data={heatData} weeks={15} onSelect={setSelectedDay} />
        <div className="mt-3 flex justify-end">
          <HeatmapLegend />
        </div>
      </section>

      <DayDetailSheet dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-app border p-3 ${
        highlight
          ? "border-brand/30 bg-brand-soft/50"
          : "border-border bg-surface"
      }`}
    >
      <div className="text-[11px] font-semibold text-text-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span className="text-xl font-black">{value}</span>
        {sub && <span className="text-[11px] text-text-3">{sub}</span>}
      </div>
    </div>
  );
}
