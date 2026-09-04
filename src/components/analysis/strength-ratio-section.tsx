"use client";

import { useState } from "react";
import { Activity, Info } from "lucide-react";
import { groupByStandard, type AnalysisBase } from "@/lib/analysis";
import { STRENGTH_RATIOS, type StrengthRatioGuide } from "@/lib/training-guidelines";
import type { Profile } from "@/lib/types";
import { cn } from "@/components/ui";

interface RatioRow {
  g: StrengthRatioGuide;
  value: number;
  low: boolean;
  high: boolean;
  inRange: boolean;
  a: { e1rm: number; nameKo: string };
  b: { e1rm: number; nameKo: string };
}

/** 종목 간 근력비로 '무엇이 약한지' 짚기 */
export function StrengthRatioSection({
  base,
  profile,
}: {
  base: AnalysisBase;
  profile: Profile | undefined;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // 표준 lift key → 내 최고 e1RM (별칭·사용자가 연결한 커스텀 종목은 한 묶음)
  const byLift = new Map<string, { e1rm: number; nameKo: string }>();
  for (const g of groupByStandard(base.bests, profile?.exerciseStandards).values()) {
    if (g.days.size < 2) continue; // 하루치로는 비교하지 않음
    byLift.set(g.liftKey, { e1rm: g.best.best1RM, nameKo: g.best.nameKo });
  }

  const rows: RatioRow[] = [];
  for (const g of STRENGTH_RATIOS) {
    const a = byLift.get(g.numerator);
    const b = byLift.get(g.denominator);
    if (!a || !b || b.e1rm <= 0) continue;
    const value = a.e1rm / b.e1rm;
    rows.push({
      g,
      value,
      low: g.warnBelow != null && value < g.warnBelow,
      high: g.warnAbove != null && value > g.warnAbove,
      inRange: value >= g.goodMin && value <= g.goodMax,
      a,
      b,
    });
  }

  if (rows.length === 0) return null;

  const weak = rows.filter((r) => r.low || r.high);
  const offRange = rows.filter((r) => !r.inRange && !r.low && !r.high);

  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-1 flex items-center gap-1.5 font-bold">
        <Activity size={16} className="text-text-3" /> 약점 진단 · 종목 간 근력비
      </div>
      <p className="mb-3 text-[11px] leading-snug text-text-3">
        {weak.length > 0
          ? `${weak.length}개 비율이 주의 구간이에요. 아래 설명을 참고하세요.`
          : offRange.length > 0
          ? `경고 수준은 없어요. ${offRange.length}개가 이상 범위를 살짝 벗어난 정도예요.`
          : "비교 가능한 비율이 모두 이상 범위예요. 균형이 잘 잡혀 있어요."}
      </p>

      <div className="space-y-2">
        {rows.map(({ g, value, low, high, inRange, a, b }) => (
          <div key={g.key} className="rounded-app bg-surface-2 px-3 py-2.5">
            <button
              onClick={() => setOpenKey(openKey === g.key ? null : g.key)}
              className="w-full text-left"
            >
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-[12px] font-bold">
                <span className="truncate">{g.label}</span>
                <Info size={11} className="shrink-0 text-text-3" />
              </span>
              <span className="shrink-0 text-[12px] font-black tabular-nums">
                {value.toFixed(2)}
                <span
                  className={cn(
                    "ml-1.5 text-[10px] font-bold",
                    low || high ? "text-warn" : inRange ? "text-brand-strong" : "text-text-3"
                  )}
                >
                  {low || high ? "주의" : inRange ? "적정" : "살짝 밖"}
                </span>
              </span>
            </div>
            <div className="mt-0.5 text-[10px] tabular-nums text-text-3">
              {Math.round(a.e1rm)}kg ÷ {Math.round(b.e1rm)}kg · 권장 {g.goodMin}–
              {g.goodMax}
            </div>
            {(low || high) && (
              <p className="mt-1 text-[11px] leading-snug text-text-2">
                {low ? g.weakIfLow : g.weakIfHigh}
              </p>
            )}
            </button>
            {openKey === g.key && (
              <p className="mt-2 border-t border-border pt-2 text-[10px] leading-relaxed text-text-3">
                <b className="text-text-2">근거</b> · {g.source}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-snug text-text-3">
        추정 1RM은 12회 이하 완료 세트로만 계산해요(그 이상은 오차가 커져요). 추정
        오차가 ±5% 정도라, 경계에 걸친 값은 참고만 하세요.
      </p>
    </section>
  );
}
