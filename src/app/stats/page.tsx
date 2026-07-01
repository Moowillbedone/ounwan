"use client";

import { useMemo, useState } from "react";
import { Flame, TrendingUp, Scale, Trophy, Plus } from "lucide-react";
import {
  useSessions,
  useExercises,
  useExerciseHistory,
  useBodyMetrics,
  useProfile,
  useUpsertBodyMetric,
  useExerciseMap,
} from "@/lib/hooks";
import { LineChart, HBars } from "@/components/charts";
import { Sheet, Button, cn, EmptyState } from "@/components/ui";
import { BODY_PART_META, BODY_PARTS } from "@/lib/constants";
import {
  computeStreak,
  fmtNum,
  fmtWeight,
  setsVolume,
  toDisplayWeight,
  fromDisplayWeight,
  todayKey,
  dateKeyToDate,
} from "@/lib/utils";
import type { BodyPart, Exercise, Unit } from "@/lib/types";

export default function StatsPage() {
  const { data: sessions } = useSessions();
  const { data: exercises } = useExercises();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const exMap = useExerciseMap();
  const unit: Unit = profile?.unit ?? "kg";

  const [bwOpen, setBwOpen] = useState(false);

  // 요약
  const summary = useMemo(() => {
    const all = sessions ?? [];
    const totalVol = all.reduce((n, s) => n + s.totalVolume, 0);
    const streak = computeStreak(new Set(all.map((s) => s.date)));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = new Set(
      all.filter((s) => dateKeyToDate(s.date) >= weekAgo).map((s) => s.date)
    ).size;
    return { count: new Set(all.map((s) => s.date)).size, totalVol, streak, thisWeek };
  }, [sessions]);

  // 부위별 볼륨(최근 28일)
  const partVolume = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const m = new Map<BodyPart, number>();
    for (const s of sessions ?? []) {
      if (dateKeyToDate(s.date) < cutoff) continue;
      for (const ex of s.exercises) {
        const bp = exMap.get(ex.exerciseId)?.bodyPart;
        if (!bp) continue;
        m.set(bp, (m.get(bp) ?? 0) + setsVolume(ex.sets));
      }
    }
    return BODY_PARTS.map((bp) => ({
      label: bp,
      value: Math.round(m.get(bp) ?? 0),
      color: BODY_PART_META[bp].color,
    })).filter((d) => d.value > 0);
  }, [sessions, exMap]);

  // 훈련한 운동(빈도순)
  const trained = useMemo(() => {
    const freq = new Map<string, number>();
    for (const s of sessions ?? [])
      for (const ex of s.exercises)
        if (ex.sets.some((x) => x.isCompleted))
          freq.set(ex.exerciseId, (freq.get(ex.exerciseId) ?? 0) + 1);
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => exMap.get(id))
      .filter(Boolean) as Exercise[];
  }, [sessions, exMap]);

  const [selectedEx, setSelectedEx] = useState<string | null>(null);
  const activeEx = selectedEx ?? trained[0]?.id ?? null;
  const { data: history } = useExerciseHistory(activeEx);

  const oneRMPoints = useMemo(
    () =>
      (history ?? []).map((h) => ({
        label: `${dateKeyToDate(h.date).getMonth() + 1}.${dateKeyToDate(h.date).getDate()}`,
        value: h.best1RM,
      })),
    [history]
  );
  const pr = useMemo(() => {
    if (!history || history.length === 0) return null;
    let maxW = 0,
      best1RM = 0,
      maxVol = 0;
    for (const h of history) {
      maxW = Math.max(maxW, h.topSetWeight);
      best1RM = Math.max(best1RM, h.best1RM);
      maxVol = Math.max(maxVol, h.volume);
    }
    return { maxW, best1RM, maxVol };
  }, [history]);

  // 체중
  const bwPoints = useMemo(
    () =>
      (metrics ?? [])
        .filter((m) => m.weight != null)
        .map((m) => ({
          label: `${dateKeyToDate(m.date).getMonth() + 1}.${dateKeyToDate(m.date).getDate()}`,
          value: toDisplayWeight(m.weight!, unit),
        })),
    [metrics, unit]
  );

  const hasData = (sessions ?? []).length > 0;

  return (
    <div className="px-4 pt-4 space-y-5">
      <h1 className="text-2xl font-black">통계</h1>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-2">
        <Summary icon={<Flame size={16} />} label="연속기록" value={`${summary.streak.current}일`} sub={`최장 ${summary.streak.longest}일`} />
        <Summary icon={<TrendingUp size={16} />} label="이번 주" value={`${summary.thisWeek}회`} sub="운동 일수" />
        <Summary icon={<Trophy size={16} />} label="총 운동" value={`${summary.count}일`} />
        <Summary icon={<TrendingUp size={16} />} label="총 볼륨" value={fmtNum(summary.totalVol)} sub={unit === "lb" ? "lb·회" : "kg·회"} />
      </div>

      {/* 운동별 성장 */}
      <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 font-bold">운동별 성장 (추정 1RM)</div>
        {trained.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-3">
            운동을 기록하면 성장 그래프가 그려져요
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {trained.slice(0, 12).map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEx(e.id)}
                  className={cn(
                    "shrink-0 h-8 px-3 rounded-full text-sm font-semibold transition",
                    activeEx === e.id ? "bg-brand text-white" : "bg-surface-2 text-text-3"
                  )}
                >
                  {e.nameKo}
                </button>
              ))}
            </div>
            <LineChart data={oneRMPoints} valueSuffix="kg" />
            {pr && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <PrStat label="최고 중량" value={fmtWeight(pr.maxW, unit)} />
                <PrStat label="추정 1RM" value={`${Math.round(pr.best1RM)}kg`} highlight />
                <PrStat label="최고 볼륨" value={fmtNum(pr.maxVol)} />
              </div>
            )}
          </>
        )}
      </section>

      {/* 부위별 볼륨 */}
      <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 font-bold">부위별 볼륨 · 최근 4주</div>
        {partVolume.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-3">기록이 아직 없어요</div>
        ) : (
          <HBars data={partVolume} />
        )}
      </section>

      {/* 체중 추이 */}
      <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold flex items-center gap-1.5">
            <Scale size={16} className="text-text-3" /> 체중 추이
          </div>
          <Button size="sm" variant="soft" onClick={() => setBwOpen(true)}>
            <Plus size={16} /> 체중 기록
          </Button>
        </div>
        {bwPoints.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-3">
            체중을 기록하면 변화가 그려져요
          </div>
        ) : (
          <LineChart data={bwPoints} color="var(--bp-back)" valueSuffix={unit} />
        )}
      </section>

      {!hasData && (
        <EmptyState
          title="첫 운동을 기록해보세요"
          desc="기록이 쌓이면 여기에서 성장을 한눈에 볼 수 있어요."
        />
      )}

      <BodyweightSheet open={bwOpen} unit={unit} onClose={() => setBwOpen(false)} />
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-app border border-border bg-surface p-3">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-text-3">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-black">{value}</div>
      {sub && <div className="text-[11px] text-text-3">{sub}</div>}
    </div>
  );
}

function PrStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-app p-2",
        highlight ? "bg-brand-soft" : "bg-surface-2"
      )}
    >
      <div className="text-[11px] text-text-3">{label}</div>
      <div className={cn("text-sm font-bold", highlight && "text-brand-strong")}>
        {value}
      </div>
    </div>
  );
}

function BodyweightSheet({
  open,
  unit,
  onClose,
}: {
  open: boolean;
  unit: Unit;
  onClose: () => void;
}) {
  const upsert = useUpsertBodyMetric();
  const { data: metrics } = useBodyMetrics();
  const [val, setVal] = useState("");

  const submit = async () => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    await upsert.mutateAsync({
      date: todayKey(),
      patch: { weight: fromDisplayWeight(num, unit) },
    });
    setVal("");
    onClose();
  };

  const recent = (metrics ?? []).slice(-5).reverse();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="오늘 체중 기록"
      footer={
        <Button size="lg" onClick={submit} disabled={!val}>
          저장
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0.0"
          className="h-14 flex-1 rounded-app border border-border bg-surface-2 px-4 text-2xl font-bold tabular-nums outline-none focus:border-brand"
        />
        <span className="text-lg font-bold text-text-3">{unit}</span>
      </div>
      {recent.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-text-3">최근 기록</div>
          <div className="space-y-1">
            {recent.map((m) => (
              <div
                key={m.id}
                className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="text-text-2">
                  {dateKeyToDate(m.date).getMonth() + 1}.
                  {dateKeyToDate(m.date).getDate()}
                </span>
                <span className="font-semibold">
                  {m.weight != null ? fmtWeight(m.weight, unit) : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
