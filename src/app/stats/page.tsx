"use client";

import { useMemo, useState } from "react";
import { Flame, TrendingUp, Scale, Trophy, Plus, SlidersHorizontal, Eye, EyeOff, Footprints } from "lucide-react";
import {
  useSessions,
  useExercises,
  useExerciseHistory,
  useBodyMetrics,
  useProfile,
  useUpdateProfile,
  useUpsertBodyMetric,
  useExerciseMap,
} from "@/lib/hooks";
import { LineChart, HBars } from "@/components/charts";
import { Sheet, Button, cn, EmptyState, IconButton } from "@/components/ui";
import { BODY_PART_META, BODY_PARTS } from "@/lib/constants";
import {
  computeStreak,
  fmtNum,
  fmtWeight,
  exerciseVolume,
  toDisplayWeight,
  fromDisplayWeight,
  todayKey,
  dateKeyToDate,
  isSessionDone,
  sessionDistance,
  paceSecPerKm,
} from "@/lib/utils";
import { fmtKm, fmtPace } from "@/lib/run-tracker";
import { runsOf } from "@/lib/running";
import { StepsCard } from "@/components/health-bits";
import type { BodyPart, Exercise, Unit } from "@/lib/types";

export default function StatsPage() {
  const { data: sessions } = useSessions();
  const { data: exercises } = useExercises();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const exMap = useExerciseMap();
  const unit: Unit = profile?.unit ?? "kg";

  const [bwOpen, setBwOpen] = useState(false);

  const weekStartsOn: 0 | 1 = profile?.weekStartsMonday === false ? 0 : 1;

  // 요약 (운동 일수·연속기록은 '완료(종료)한 날'만 카운트, 볼륨은 완료 세트 합계)
  const summary = useMemo(() => {
    const all = sessions ?? [];
    // 볼륨도 '완료(운동 종료)한 세션'만 합산(계획/미완료 세션 제외)
    const totalVol = all
      .filter(isSessionDone)
      .reduce((n, s) => n + s.totalVolume, 0);
    const doneDates = all.filter(isSessionDone).map((s) => s.date);
    const streak = computeStreak(new Set(doneDates), weekStartsOn);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = new Set(
      all
        .filter((s) => isSessionDone(s) && dateKeyToDate(s.date) >= weekAgo)
        .map((s) => s.date)
    ).size;
    return { count: new Set(doneDates).size, totalVol, streak, thisWeek };
  }, [sessions, weekStartsOn]);

  // 부위별 볼륨(최근 28일)
  const partVolume = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const m = new Map<BodyPart, number>();
    for (const s of sessions ?? []) {
      if (!isSessionDone(s)) continue; // 완료 세션만
      if (dateKeyToDate(s.date) < cutoff) continue;
      for (const ex of s.exercises) {
        const bp = exMap.get(ex.exerciseId)?.bodyPart;
        if (!bp) continue;
        m.set(bp, (m.get(bp) ?? 0) + exerciseVolume(ex)); // 중량+횟수 모드만
      }
    }
    return BODY_PARTS.map((bp) => ({
      label: bp,
      value: Math.round(m.get(bp) ?? 0),
      color: BODY_PART_META[bp].color,
    })).filter((d) => d.value > 0);
  }, [sessions, exMap]);

  // 훈련한 운동(빈도순) — 완료(운동 종료)한 세션만
  const trained = useMemo(() => {
    const freq = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (!isSessionDone(s)) continue;
      for (const ex of s.exercises)
        if (ex.sets.some((x) => x.isCompleted))
          freq.set(ex.exerciseId, (freq.get(ex.exerciseId) ?? 0) + 1);
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => exMap.get(id))
      .filter(Boolean) as Exercise[];
  }, [sessions, exMap]);

  // 1RM 측정 가능한 종목: 완료 세션에서 '중량+횟수 모드 + 중량>0' 완료세트가 있는 종목
  // (스트레칭·맨몸·횟수만/시간만은 자동 제외 → 볼륨/1RM 기준과 일치)
  const measurableIds = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions ?? []) {
      if (!isSessionDone(sess)) continue;
      for (const ex of sess.exercises) {
        if (ex.trackingMode && ex.trackingMode !== "weight_reps") continue;
        if (ex.sets.some((x) => x.isCompleted && x.weight > 0)) s.add(ex.exerciseId);
      }
    }
    return s;
  }, [sessions]);
  // 거리로 기록한 종목(러닝 등)은 아래 '러닝·유산소 거리'에서 따로 보여주므로 제외 안내에서 뺀다
  const distanceIds = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions ?? [])
      for (const ex of sess.exercises) if (ex.trackingMode === "distance") s.add(ex.exerciseId);
    return s;
  }, [sessions]);

  // 내용 기반 deps(참조 아님) — 프로필 리페치로 배열 참조가 바뀌어도 값이 같으면 재계산 안 함
  const hiddenKey = (profile?.hiddenStats ?? []).join(",");
  const hiddenIds = useMemo(
    () => new Set(profile?.hiddenStats ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hiddenKey]
  );
  // 그래프 대상이 될 수 있는 종목(측정 가능 & 훈련됨)
  const eligible = useMemo(
    () => trained.filter((e) => measurableIds.has(e.id)),
    [trained, measurableIds]
  );
  // 실제 노출(사용자가 숨긴 것 제외)
  const visibleTrained = useMemo(
    () => eligible.filter((e) => !hiddenIds.has(e.id)),
    [eligible, hiddenIds]
  );
  const nonMeasurableCount = trained.filter(
    (e) => !measurableIds.has(e.id) && !distanceIds.has(e.id)
  ).length;

  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedEx, setSelectedEx] = useState<string | null>(null);
  const activeEx =
    selectedEx && visibleTrained.some((e) => e.id === selectedEx)
      ? selectedEx
      : visibleTrained[0]?.id ?? null;
  const { data: history } = useExerciseHistory(activeEx);

  const updateProfile = useUpdateProfile();
  const toggleHidden = (id: string) => {
    const cur = profile?.hiddenStats ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    updateProfile.mutate({ hiddenStats: next });
  };

  const oneRMPoints = useMemo(
    () =>
      (history ?? []).map((h) => ({
        label: shortDate(h.date),
        value: h.best1RM,
        dateLabel: longDate(h.date),
        sub: `최고 ${fmtWeight(h.topSetWeight, unit)} × ${h.topSetReps}회`,
      })),
    [history, unit]
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
          label: shortDate(m.date),
          value: toDisplayWeight(m.weight!, unit),
          dateLabel: longDate(m.date),
        })),
    [metrics, unit]
  );

  // 거리(러닝·걷기·사이클 등) — '거리 + 시간' 방식 완료 세트와 GPS 러닝을 날짜별로 합산
  const distance = useMemo(() => {
    const done = (sessions ?? []).filter(isSessionDone);
    const byDate = new Map<string, number>();
    let bestPace: number | null = null;
    let longest = 0;
    for (const s of done) {
      const d = sessionDistance(s);
      if (d.meters <= 0) continue;
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + d.meters);
      longest = Math.max(longest, d.meters);
      // 최고 페이스는 1km 이상 기록만(짧은 기록의 튀는 값 제외)
      const p = d.meters >= 1000 ? paceSecPerKm(d.meters, d.sec) : null;
      if (p != null && (bestPace == null || p < bestPace)) bestPace = p;
    }
    if (byDate.size === 0) return null;
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    let week = 0,
      month = 0,
      total = 0;
    for (const [date, m] of byDate) {
      const d = dateKeyToDate(date);
      total += m;
      if (d >= weekAgo) week += m;
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += m;
    }
    const points = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-20)
      .map(([date, m]) => ({
        label: shortDate(date),
        value: Math.round(m / 10) / 100,
        dateLabel: longDate(date),
      }));
    return { week, month, total, bestPace, longest, points };
  }, [sessions]);

  // 이번 달 러닝(러닝·트레드밀만) 횟수와 평균 페이스(시간을 입력한 기록만)
  const runMonth = useMemo(() => {
    const now = new Date();
    const runs = runsOf(sessions ?? [], exMap).filter((r) => {
      const d = dateKeyToDate(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const timed = runs.filter((r) => r.sec > 0);
    const m = timed.reduce((n, r) => n + r.meters, 0);
    const sec = timed.reduce((n, r) => n + r.sec, 0);
    return { count: runs.length, avgPace: paceSecPerKm(m, sec) };
  }, [sessions, exMap]);

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
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold">운동별 성장 (추정 1RM)</div>
          {eligible.length > 0 && (
            <IconButton
              onClick={() => setFilterOpen(true)}
              aria-label="표시할 종목 필터"
              className="h-8 w-8 text-text-3"
            >
              <SlidersHorizontal size={16} />
            </IconButton>
          )}
        </div>
        {eligible.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-3">
            {trained.length === 0 || trained.every((e) => distanceIds.has(e.id))
              ? "근력 운동을 기록하면 성장 그래프가 그려져요"
              : "중량 운동을 기록하면 추정 1RM 성장이 그려져요"}
          </div>
        ) : visibleTrained.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-3">
            모든 종목을 숨겼어요. 우측 상단 필터에서 다시 켜보세요.
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {visibleTrained.slice(0, 12).map((e) => (
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
        {nonMeasurableCount > 0 && (
          <p className="mt-3 text-[11px] leading-snug text-text-3">
            중량이 없는 {nonMeasurableCount}개 종목(맨몸·스트레칭 등)은 1RM 측정이 어려워 제외했어요.
          </p>
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

      {/* 거리 기록(러닝 등) — 기록이 있을 때만 */}
      {distance && (
        <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 font-bold flex items-center gap-1.5">
            <Footprints size={16} className="text-text-3" /> 러닝·유산소 거리
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <PrStat label="최근 7일" value={`${fmtKm(distance.week)}km`} />
            <PrStat label="이번 달" value={`${fmtKm(distance.month)}km`} highlight />
            <PrStat label="누적" value={`${fmtKm(distance.total)}km`} />
          </div>
          {distance.points.length > 1 && (
            <LineChart data={distance.points} valueSuffix="km" />
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <PrStat label="최장 거리" value={`${fmtKm(distance.longest)}km`} />
            <PrStat label="최고 페이스" value={distance.bestPace != null ? fmtPace(distance.bestPace) : "—"} />
            <PrStat label="이번 달 러닝" value={`${runMonth.count}회`} />
            <PrStat label="이번 달 평균 페이스" value={runMonth.avgPace != null ? fmtPace(runMonth.avgPace) : "—"} />
          </div>
          <p className="mt-2 text-[11px] text-text-3">
            주간 거리 추이·부상 위험 체크·예상 기록은 <b className="text-text-2">분석</b> 탭에서 볼 수 있어요.
          </p>
        </section>
      )}

      {/* 걸음 수 — Health Connect 연결 시 */}
      <StepsCard />

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

      {/* 성장 그래프 종목 필터 */}
      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="성장 그래프에 표시할 종목"
      >
        <p className="mb-3 text-sm text-text-3">
          보고 싶은 종목만 남겨보세요. 숨긴 종목은 그래프 목록에서 빠져요.
        </p>
        <div className="space-y-1.5">
          {eligible.map((e) => {
            const hidden = hiddenIds.has(e.id);
            return (
              <button
                key={e.id}
                onClick={() => toggleHidden(e.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-app border px-3 py-2.5 text-left transition",
                  hidden
                    ? "border-border bg-surface text-text-3"
                    : "border-brand/40 bg-brand-soft/40 text-text"
                )}
              >
                <span className="font-semibold">{e.nameKo}</span>
                {hidden ? (
                  <EyeOff size={18} className="text-text-3" />
                ) : (
                  <Eye size={18} className="text-brand" />
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
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

// 그래프 축/리드아웃용 날짜 포맷
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function shortDate(key: string) {
  const d = dateKeyToDate(key);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
function longDate(key: string) {
  const d = dateKeyToDate(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
