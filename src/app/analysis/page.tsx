"use client";

import { useMemo } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useSessions, useBodyMetrics, useProfile, useExerciseMap } from "@/lib/hooks";
import { todayKey } from "@/lib/utils";
import { buildBase } from "@/lib/analysis";
import { EmptyState } from "@/components/ui";
import { LevelSection } from "@/components/analysis/level-section";
import { CoverageNote } from "@/components/analysis/coverage-note";
import { ActionSection } from "@/components/analysis/action-section";
import { StrengthRatioSection } from "@/components/analysis/strength-ratio-section";
import { BalanceSection } from "@/components/analysis/balance-section";
import { HabitSection } from "@/components/analysis/habit-section";

export default function AnalysisPage() {
  const { data: sessions } = useSessions();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const exMap = useExerciseMap();
  const today = todayKey();

  const base = useMemo(
    () =>
      buildBase({
        sessions: sessions ?? [],
        exMap,
        metrics: metrics ?? [],
        profile,
        today,
      }),
    [sessions, exMap, metrics, profile, today]
  );

  const hasData = base.doneSessions.length > 0;

  return (
    <div className="px-4 pt-4 pb-2">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">분석</h1>
          <p className="mt-0.5 text-xs text-text-3">
            완료한 운동 기록만으로 계산해요
          </p>
        </div>
        <Sparkles size={22} className="text-brand" />
      </header>

      {!hasData ? (
        <EmptyState
          icon={<Sparkles size={40} />}
          title="아직 분석할 기록이 없어요"
          desc="운동을 시작하고 [운동 완료]까지 누르면, 그 기록으로 내 수준과 약점을 짚어드려요."
        />
      ) : (
        <div className="space-y-4">
          {base.doneSessions.length < 3 && (
            <div className="flex items-start gap-2 rounded-app border border-warn/30 bg-warn/10 px-3 py-2.5">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[12px] leading-snug text-text-2">
                완료한 운동이 <b>{base.doneSessions.length}회</b>뿐이라 분석이
                거칠어요. 기록이 쌓일수록 정확해져요.
              </p>
            </div>
          )}

          <LevelSection base={base} profile={profile} />
          <CoverageNote base={base} profile={profile} />
          <ActionSection base={base} profile={profile} />
          <StrengthRatioSection base={base} profile={profile} />
          <BalanceSection base={base} />
          <HabitSection base={base} />
        </div>
      )}
    </div>
  );
}
