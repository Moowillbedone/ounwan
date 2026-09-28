"use client";

import { useMemo } from "react";
import { Footprints, HeartPulse, Dumbbell, TriangleAlert, CircleCheck } from "lucide-react";
import type { Exercise, Profile, WorkoutSession } from "@/lib/types";
import {
  runsOf,
  whoWeek,
  latestSpike,
  weeklyKm,
  bestVdot,
  predictSec,
  PREDICT_DISTANCES,
  WHO_SOURCE,
  SPIKE_SOURCE,
  VDOT_SOURCE,
} from "@/lib/running";
import { fmtKm, fmtPace, fmtClock } from "@/lib/run-tracker";
import { dateKeyToDate, paceSecPerKm, toDateKey } from "@/lib/utils";
import { cn } from "@/components/ui";

const WHO_MIN = 150; // 중강도 환산 주간 하한
const WHO_MORE = 300; // 추가 이점 구간

/** 러닝·유산소 분석 — WHO 권장량, 주간 거리, 거리 급증 위험, 예상 기록 */
export function RunningSection({
  sessions,
  exMap,
  profile,
  today,
}: {
  sessions: WorkoutSession[];
  exMap: Map<string, Exercise>;
  profile: Profile | undefined;
  today: string;
}) {
  const weekStartsOn: 0 | 1 = profile?.weekStartsMonday === false ? 0 : 1;
  const data = useMemo(() => {
    const runs = runsOf(sessions, exMap);
    return {
      runs,
      who: whoWeek(sessions, exMap, today),
      spike: latestSpike(runs),
      weeks: weeklyKm(runs, today, weekStartsOn),
      best: bestVdot(runs, today),
    };
  }, [sessions, exMap, today, weekStartsOn]);
  const { runs, who, spike, weeks, best } = data;

  const whoPct = Math.min(100, Math.round((who.equivalentMin / WHO_MIN) * 100));
  const maxWeek = Math.max(1, ...weeks.map((w) => w.km));

  // 다음 러닝 권장 상한: 최근 30일(오늘 포함) 최장 거리 × 1.1
  const nextCap = useMemo(() => {
    if (runs.length === 0) return null;
    const d = dateKeyToDate(today);
    d.setDate(d.getDate() - 30);
    const fromKey = toDateKey(d);
    const recent = runs.filter((r) => r.date >= fromKey);
    if (recent.length === 0) return null;
    return Math.max(...recent.map((r) => r.meters)) * 1.1;
  }, [runs, today]);

  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-1.5 font-bold">
        <Footprints size={16} className="text-brand" /> 러닝·유산소
      </div>

      {/* WHO 권장량 */}
      <div className="rounded-app bg-surface-2 p-3">
        <div className="flex items-center justify-between text-[12px] font-bold text-text-2">
          <span className="flex items-center gap-1">
            <HeartPulse size={13} className="text-danger" /> 최근 7일 유산소
          </span>
          <span className="tabular-nums">
            <b className="text-text">{who.equivalentMin}</b> / {WHO_MIN}분
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full", whoPct >= 100 ? "bg-brand" : "bg-warn")}
            style={{ width: `${whoPct}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] leading-snug text-text-2">
          {who.equivalentMin >= WHO_MORE ? (
            <>권장량의 상단(주 300분 환산)까지 채웠어요. 건강 이점은 충분히 챙기고 있어요.</>
          ) : who.equivalentMin >= WHO_MIN ? (
            <>WHO 권장량을 채웠어요. 300분(환산)까지는 늘릴수록 이점이 더 있어요.</>
          ) : (
            <>
              WHO 권장량까지 <b>{WHO_MIN - who.equivalentMin}분</b>(중강도 환산) 남았어요.
              러닝은 1분이 2분으로 계산돼서 약 <b>{Math.ceil((WHO_MIN - who.equivalentMin) / 2)}분</b>만 더
              달리면 돼요.
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] text-text-3">
          러닝 {who.vigorousMin}분(×2) + 기타 유산소 {who.moderateMin}분 ·{" "}
          <Dumbbell size={11} className="inline -mt-0.5" /> 근력 운동 {who.strengthDays}일
          {who.strengthDays >= 2 ? " (권장 주 2일 충족)" : " (권장 주 2일)"}
        </p>
      </div>

      {runs.length === 0 ? (
        <p className="mt-3 text-[12px] leading-snug text-text-3">
          러닝을 <b>거리 + 시간</b>으로 기록하거나 GPS로 달리면 주간 거리, 거리 급증 체크,
          예상 기록을 보여드려요.
        </p>
      ) : (
        <>
          {/* 주간 거리 */}
          <div className="mt-4">
            <div className="mb-2 text-[12px] font-bold text-text-2">주간 러닝 거리 · 최근 8주</div>
            <div className="flex h-24 items-end gap-1.5">
              {weeks.map((w, i) => (
                <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] tabular-nums text-text-3">
                    {w.km > 0 ? w.km : ""}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t-md",
                      i === weeks.length - 1 ? "bg-brand" : "bg-brand/40"
                    )}
                    style={{ height: `${Math.max(w.km > 0 ? 6 : 2, (w.km / maxWeek) * 64)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 text-[9px] text-text-3">
              {weeks.map((w, i) => (
                <span key={w.weekStart} className="flex-1 text-center">
                  {i === weeks.length - 1
                    ? "이번주"
                    : `${dateKeyToDate(w.weekStart).getMonth() + 1}/${dateKeyToDate(w.weekStart).getDate()}`}
                </span>
              ))}
            </div>
          </div>

          {/* 거리 급증 체크 */}
          {spike && (
            <div
              className={cn(
                "mt-4 flex items-start gap-2 rounded-app px-3 py-2.5",
                spike.ratio != null && spike.ratio > 1.1 ? "bg-warn/10" : "bg-brand-soft/50"
              )}
            >
              {spike.ratio != null && spike.ratio > 1.1 ? (
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
              ) : (
                <CircleCheck size={16} className="mt-0.5 shrink-0 text-brand" />
              )}
              <p className="text-[12px] leading-snug text-text-2">
                {spike.ratio == null ? (
                  <>
                    최근 30일 안에 비교할 러닝이 없어요. 이번 <b>{fmtKm(spike.last.meters)}km</b>를
                    기준으로, 한 번에 늘리는 거리는 <b>10% 이내</b>로 잡아 보세요.
                  </>
                ) : spike.ratio > 1.1 ? (
                  <>
                    마지막 러닝(<b>{fmtKm(spike.last.meters)}km</b>)이 최근 30일 최장(
                    {fmtKm(spike.longestPrior!)}km)보다 <b>{Math.round((spike.ratio - 1) * 100)}%</b>{" "}
                    길었어요. 부상 위험이 올라가는 구간이라, 다음 며칠은 짧고 편하게 달려 주세요.
                  </>
                ) : (
                  <>
                    마지막 러닝이 최근 30일 최장 거리 대비 <b>+10% 이내</b>예요. 안전하게 늘리고
                    있어요.
                  </>
                )}
                {nextCap != null && (
                  <span className="mt-0.5 block text-text-3">
                    다음 장거리 권장 상한: 약 <b className="text-text-2">{fmtKm(nextCap)}km</b>
                  </span>
                )}
              </p>
            </div>
          )}

          {/* 능력 점수·예상 기록 */}
          <div className="mt-4">
            <div className="mb-2 text-[12px] font-bold text-text-2">예상 기록 · 최근 90일 최고 러닝 기준</div>
            {best ? (
              <>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-brand">{best.vdot.toFixed(1)}</span>
                  <span className="text-[11px] text-text-3">
                    VDOT · {dateKeyToDate(best.run.date).getMonth() + 1}/
                    {dateKeyToDate(best.run.date).getDate()} {fmtKm(best.run.meters)}km{" "}
                    {fmtClock(best.run.sec)} (
                    {fmtPace(paceSecPerKm(best.run.meters, best.run.sec))}/km)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {PREDICT_DISTANCES.map((d) => (
                    <div key={d.label} className="rounded-app bg-surface-2 px-1 py-2">
                      <div className="text-[10px] font-semibold text-text-3">{d.label}</div>
                      <div className="mt-0.5 text-[13px] font-extrabold tabular-nums">
                        {fmtClock(predictSec(best.vdot, d.meters))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[12px] text-text-3">
                3km 이상을 <b>시간과 함께</b> 기록하면 예상 기록을 계산해요.
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-4 space-y-1 border-t border-border pt-3 text-[10.5px] leading-snug text-text-3">
        <p>
          <b className="text-text-2">근거</b> · {WHO_SOURCE}
        </p>
        {runs.length > 0 && <p>{SPIKE_SOURCE}</p>}
        {runs.length > 0 && <p>{VDOT_SOURCE}</p>}
      </div>
    </section>
  );
}
