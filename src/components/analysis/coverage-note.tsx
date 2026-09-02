"use client";

import { useState } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import type { AnalysisBase } from "@/lib/analysis";
import { LIFT_KEYS } from "@/lib/strength-standards";
import { cn } from "@/components/ui";

const REASON_KO: Record<string, string> = {
  tracking: "중량×횟수로 기록한 세트가 없어요",
  "no-bodyweight": "맨몸 종목이라 체중 기록이 필요해요",
  reps: "완료 세트가 전부 13회 이상이라 1RM 추정이 어려워요 (12회 이하 세트가 하나만 있어도 계산돼요)",
  "no-weight": "무게가 0으로 기록돼 있어요",
};

/**
 * '왜 이 종목만 비교됐는지'를 앱이 직접 설명한다.
 * 조용히 빠지면 동기화 오류처럼 보이기 때문에, 빠진 종목과 사유를 모두 보여준다.
 */
export function CoverageNote({ base }: { base: AnalysisBase }) {
  const [open, setOpen] = useState(false);

  const judged: string[] = [];
  const oneDay: string[] = [];
  const noStandard: string[] = [];

  for (const [exId, b] of base.bests) {
    if (!LIFT_KEYS[exId]) {
      noStandard.push(b.nameKo);
    } else if (b.dayCount < 2) {
      oneDay.push(b.nameKo);
    } else {
      judged.push(b.nameKo);
    }
  }
  const excluded = base.excluded;

  const totalSkipped = oneDay.length + noStandard.length + excluded.length;
  if (judged.length === 0 && totalSkipped === 0) return null;

  return (
    <section className="rounded-app border border-border bg-surface shadow-[var(--shadow-card)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ListChecks size={15} className="shrink-0 text-text-3" />
          <span className="text-[13px] font-bold">비교에 쓰인 종목</span>
          <span className="shrink-0 text-[11px] text-text-3">
            {judged.length}개 비교 · {totalSkipped}개 제외
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-text-3 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-[11px] leading-relaxed">
          <p className="text-text-3">
            수준 비교는 <b className="text-text-2">공개된 기준표가 있는 종목</b>만
            할 수 있어요. 기록이 안 들어온 게 아니라, 비교할 기준이 없는 거예요.
            (볼륨·균형·습관 분석에는 <b className="text-text-2">모든 종목</b>이
            들어가요.)
          </p>

          {judged.length > 0 && (
            <Group title="수준 비교됨" tone="ok" items={judged} />
          )}
          {oneDay.length > 0 && (
            <Group
              title="하루치 기록만 있어 대기 중"
              tone="wait"
              items={oneDay}
              desc="다른 날 한 번만 더 기록하면 바로 판정돼요"
            />
          )}
          {noStandard.length > 0 && (
            <Group
              title="기준표가 아직 없는 종목"
              tone="none"
              items={noStandard}
              desc="같은 부위의 기준 종목(예: 백스쿼트·데드리프트·벤치프레스)을 한 번 기록하면 그 부위도 비교돼요"
            />
          )}
          {excluded.length > 0 && (
            <div>
              <div className="mb-1 font-bold text-text-2">계산에서 빠진 기록</div>
              <ul className="space-y-1">
                {excluded.map((e) => (
                  <li key={e.exerciseId} className="text-text-3">
                    <b className="text-text-2">{e.nameKo}</b> —{" "}
                    {REASON_KO[e.reason] ?? "계산할 수 없는 기록이에요"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  tone,
  items,
  desc,
}: {
  title: string;
  tone: "ok" | "wait" | "none";
  items: string[];
  desc?: string;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1 font-bold",
          tone === "ok" ? "text-brand-strong" : "text-text-2"
        )}
      >
        {title} <span className="font-normal text-text-3">{items.length}개</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((n) => (
          <span
            key={n}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              tone === "ok"
                ? "bg-brand-soft text-brand-strong"
                : "bg-surface-2 text-text-2"
            )}
          >
            {n}
          </span>
        ))}
      </div>
      {desc && <p className="mt-1 text-text-3">{desc}</p>}
    </div>
  );
}
