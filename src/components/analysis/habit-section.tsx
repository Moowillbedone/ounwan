"use client";

import { CalendarCheck, Timer, Repeat } from "lucide-react";
import type { AnalysisBase } from "@/lib/analysis";
import { josa } from "@/lib/utils";

/** 운동 습관 — 빈도·지속시간·총 기록 */
export function HabitSection({ base }: { base: AnalysisBase }) {
  const { frequency, totalDays, parts } = base;
  const partFreq = parts.filter((p) => p.part !== "유산소" && p.part !== "전신");
  const lowFreq = partFreq.filter((p) => p.weeklyFreq < 1.5 && p.sets >= 4);

  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 font-bold">운동 습관 · 최근 4주</div>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Repeat size={13} />}
          label="주당 빈도"
          value={`${frequency.perWeek}`}
          sub="회"
        />
        <Stat
          icon={<Timer size={13} />}
          label="평균 시간"
          value={frequency.avgDurationMin != null ? `${frequency.avgDurationMin}` : "—"}
          sub={frequency.avgDurationMin != null ? "분" : ""}
        />
        <Stat
          icon={<CalendarCheck size={13} />}
          label="총 완료"
          value={`${totalDays}`}
          sub="일"
        />
      </div>

      <p className="mt-3 text-[12px] leading-snug text-text-2">
        {frequency.perWeek >= 3 ? (
          <>
            주 <b>{frequency.perWeek}회</b>는 근력·근비대 모두에 충분한 빈도예요.
            지금 리듬을 유지하는 게 가장 큰 무기예요.
          </>
        ) : frequency.perWeek >= 2 ? (
          <>
            주 <b>{frequency.perWeek}회</b>로 꾸준히 하고 있어요. 같은 볼륨이라면
            빈도 자체보다 <b>주간 총량</b>이 더 중요하니, 늘리기 어렵다면 한 세션의
            세트를 채우는 것도 방법이에요.
          </>
        ) : (
          <>
            최근 4주 기준 주 <b>{frequency.perWeek}회</b>예요. 주 2회 이상으로
            나누면 한 번에 몰아치는 부담이 줄어 총 볼륨을 채우기 쉬워져요.
          </>
        )}
      </p>

      {lowFreq.length > 0 && (
        <p className="mt-1.5 text-[12px] leading-snug text-text-3">
          {josa(lowFreq.map((p) => p.part).join(", "), "은는")} 주{" "}
          {lowFreq[0].weeklyFreq}회 수준이라, 같은 세트 수를 두 번에 나누면 한
          세션 부담이 줄어요.
        </p>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-app bg-surface-2 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold text-text-3">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span className="text-lg font-black">{value}</span>
        <span className="text-[10px] text-text-3">{sub}</span>
      </div>
    </div>
  );
}
