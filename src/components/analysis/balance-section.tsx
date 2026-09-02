"use client";

import { Scale } from "lucide-react";
import type { AnalysisBase } from "@/lib/analysis";
import {
  WEEKLY_SET_GUIDE,
  SET_GUIDE_SOURCE,
  SET_COUNT_CAVEAT,
  VOLUME_RATIOS,
} from "@/lib/training-guidelines";
import { BODY_PART_META } from "@/lib/constants";
import { cn } from "@/components/ui";

/** 부위별 주간 세트 vs 권장 범위 + 볼륨 배분 비율 */
export function BalanceSection({ base }: { base: AnalysisBase }) {
  const byPart = new Map(base.parts.map((p) => [p.part, p]));
  const rows = WEEKLY_SET_GUIDE.map((g) => {
    const cur = byPart.get(g.part)?.weeklySets ?? 0;
    const status: "low" | "ok" | "high" =
      cur < g.min ? "low" : cur > g.max ? "high" : "ok";
    return { ...g, cur, status };
  });
  const scaleMax = Math.max(24, ...rows.map((r) => r.cur));

  const { push, pull, legs, core } = base.pattern;
  const totalSets = push + pull + legs + core;
  const ratios = [
    { g: VOLUME_RATIOS[0], value: push > 0 ? pull / push : null },
    { g: VOLUME_RATIOS[1], value: totalSets > 0 ? legs / totalSets : null },
  ];

  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-1 flex items-center gap-1.5 font-bold">
        <Scale size={16} className="text-text-3" /> 부위별 균형 · 최근 4주
      </div>
      <p className="mb-3 text-[11px] text-text-3">
        주당 세트 수를 권장 범위(회색 띠)와 비교했어요
      </p>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.part}>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="font-semibold text-text-2">
                {r.part}
                {!r.strict && (
                  <span className="ml-1 text-[9px] font-normal text-text-3">참고</span>
                )}
              </span>
              <span className="tabular-nums text-text-3">
                <b
                  className={cn(
                    r.status === "low" && r.strict && "text-warn",
                    r.status === "low" && !r.strict && "text-text-2",
                    r.status === "ok" && "text-brand-strong",
                    r.status === "high" && "text-text-2"
                  )}
                >
                  {r.cur}
                </b>
                <span className="mx-0.5">/</span>
                {r.min}–{r.max}세트
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="absolute inset-y-0 bg-text-3/15"
                style={{
                  left: `${(r.min / scaleMax) * 100}%`,
                  width: `${((r.max - r.min) / scaleMax) * 100}%`,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, (r.cur / scaleMax) * 100)}%`,
                  background:
                    r.status === "low" && r.strict
                      ? "var(--warn)"
                      : BODY_PART_META[r.part].color,
                  opacity: r.status === "high" ? 0.55 : 1,
                }}
              />
            </div>
            {r.status === "low" && r.note && (
              <p className="mt-1 text-[10px] leading-snug text-text-3">{r.note}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {ratios.map(({ g, value }) => {
          if (value == null) return null;
          const warn = value < g.warnBelow;
          const inRange = value >= g.goodMin && value <= g.goodMax;
          return (
            <div key={g.key} className="rounded-app bg-surface-2 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-bold">{g.label}</span>
                <span className="shrink-0 text-[12px] font-black tabular-nums">
                  {g.key === "lowerShare"
                    ? `${Math.round(value * 100)}%`
                    : value.toFixed(2)}
                  <span
                    className={cn(
                      "ml-1.5 text-[10px] font-bold",
                      warn ? "text-warn" : inRange ? "text-brand-strong" : "text-text-3"
                    )}
                  >
                    {warn ? g.lowLabel : inRange ? "적정" : "참고"}
                  </span>
                </span>
              </div>
              {warn ? (
                <p className="mt-1 text-[11px] leading-snug text-text-2">{g.warnText}</p>
              ) : !inRange ? (
                <p className="mt-1 text-[11px] leading-snug text-text-3">{g.aboveText}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-snug text-text-3">
        기준: {SET_GUIDE_SOURCE}
        <br />
        {SET_COUNT_CAVEAT}
      </p>
    </section>
  );
}
