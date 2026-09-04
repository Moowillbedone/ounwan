"use client";

import { Target } from "lucide-react";
import { groupByStandard, type AnalysisBase } from "@/lib/analysis";
import {
  WEEKLY_SET_GUIDE,
  STRENGTH_RATIOS,
  VOLUME_RATIOS,
} from "@/lib/training-guidelines";
import { judgeLift, LEVEL_KO, type Sex } from "@/lib/strength-standards";
import type { Profile } from "@/lib/types";
import { josa } from "@/lib/utils";

interface Action {
  weight: number; // 우선순위 점수(클수록 먼저)
  topic: string; // 같은 주제는 하나만 남긴다
  title: string;
  detail: string;
}

/**
 * '다음 4주에 뭘 먼저 할지'.
 * 원칙: 사람이 아니라 데이터에 라벨을 붙이고, 모든 문장에 숫자를 넣고,
 * 부상·통증 등 의학적 단정은 하지 않는다.
 */
export function ActionSection({
  base,
  profile,
}: {
  base: AnalysisBase;
  profile: Profile | undefined;
}) {
  const actions: Action[] = [];
  const sex = (profile?.sex ?? null) as Sex | null;
  const bw = base.bodyweight;

  /* 1) 근력비가 주의 구간인 종목 */
  const byLift = new Map<string, number>();
  for (const g of groupByStandard(base.bests, profile?.exerciseStandards).values()) {
    if (g.days.size < 2) continue;
    byLift.set(g.liftKey, g.best.best1RM);
  }
  for (const g of STRENGTH_RATIOS) {
    const a = byLift.get(g.numerator);
    const b = byLift.get(g.denominator);
    if (!a || !b) continue;
    const v = a / b;
    if (g.warnBelow != null && v < g.warnBelow && g.weakIfLow) {
      actions.push({
        weight: 100,
        topic: g.key,
        title: `${g.label} ${v.toFixed(2)}`,
        detail: g.weakIfLow,
      });
    } else if (g.warnAbove != null && v > g.warnAbove && g.weakIfHigh) {
      actions.push({
        weight: 100,
        topic: g.key,
        title: `${g.label} ${v.toFixed(2)}`,
        detail: g.weakIfHigh,
      });
    }
  }

  /* 2) 볼륨 배분이 경고 구간 */
  const { push, pull, legs, core } = base.pattern;
  const totalSets = push + pull + legs + core;
  if (push > 0 && pull / push < VOLUME_RATIOS[0].warnBelow) {
    actions.push({
      weight: 90,
      topic: "등",
      title: "당기기 볼륨 늘리기",
      detail: `등 ${pull}세트 vs 밀기 ${push}세트예요. ${VOLUME_RATIOS[0].warnText}`,
    });
  }
  if (totalSets > 0 && legs / totalSets < VOLUME_RATIOS[1].warnBelow) {
    actions.push({
      weight: 95,
      topic: "하체",
      title: "하체 비중 올리기",
      detail: `최근 4주 전체 ${totalSets}세트 중 하체가 ${legs}세트(${Math.round(
        (legs / totalSets) * 100
      )}%)예요. ${VOLUME_RATIOS[1].warnText}`,
    });
  }

  /* 3) 권장 하한 아래인 '핵심' 부위(간접 자극을 못 세는 부위는 제외) */
  const byPart = new Map(base.parts.map((p) => [p.part, p]));
  for (const g of WEEKLY_SET_GUIDE) {
    if (!g.strict) continue;
    const cur = byPart.get(g.part)?.weeklySets ?? 0;
    if (cur >= g.min) continue;
    actions.push({
      weight: 80 + (g.min - cur),
      topic: g.part,
      title: `${g.part} 세트 늘릴 여지`,
      detail: `최근 4주 주당 ${cur}세트로 권장 구간(${g.min}~${g.max}세트) 아래예요. 한 세션에 ${Math.ceil(
        (g.min - cur) / Math.max(1, base.frequency.perWeek)
      )}세트만 더해도 하한에 가까워져요.`,
    });
  }

  /* 4) 가장 백분위가 낮은 종목 = 가장 크게 움직일 수 있는 자리 */
  if (sex && bw) {
    let lowest: { name: string; pct: number; need: number; next: string } | null = null;
    for (const [liftKey, e1rm] of byLift) {
      const v = judgeLift(sex, liftKey, e1rm, bw, base.age);
      if (!v || !v.next) continue;
      if (!lowest || v.percentile < lowest.pct)
        lowest = {
          name: v.nameKo,
          pct: v.percentile,
          need: Math.max(0, v.next.need - v.e1rm),
          next: LEVEL_KO[v.next.level],
        };
    }
    if (lowest && lowest.need > 0) {
      actions.push({
        weight: 70,
        topic: `lift:${lowest.name}`,
        title: `${lowest.name} 한 단계 올리기`,
        detail: `현재 상위 ${100 - lowest.pct}% 구간으로 종목 중 가장 아래예요. ${
          Math.round(lowest.need)
        }kg만 더 올리면 ${lowest.next} 구간이에요.`,
      });
    }
  }

  /* 5) 아무 문제도 없으면 유지 메시지 */
  if (actions.length === 0) {
    actions.push({
      weight: 0,
      topic: "keep",
      title: "지금 리듬 유지하기",
      detail: `주 ${base.frequency.perWeek}회로 균형이 잘 잡혀 있어요. 무리해서 바꾸기보다 지금 볼륨을 유지하면서 무게를 조금씩 올리는 게 가장 확실해요.`,
    });
  }

  // 같은 주제(예: 하체 비중 / 하체 세트)는 가장 우선순위 높은 것만 남긴다
  const seen = new Set<string>();
  const top = actions
    .sort((a, b) => b.weight - a.weight)
    .filter((a) => (seen.has(a.topic) ? false : (seen.add(a.topic), true)))
    .slice(0, 3);

  return (
    <section className="rounded-app border border-brand/30 bg-brand-soft/40 p-4">
      <div className="mb-2 flex items-center gap-1.5 font-bold">
        <Target size={16} className="text-brand-strong" /> 다음 4주, 이것부터
      </div>
      <ol className="space-y-2.5">
        {top.map((a, i) => (
          <li key={a.title} className="flex gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-black text-white">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold">{a.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-text-2">
                {a.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10px] leading-snug text-text-3">
        {josa("우선순위", "은는")} 기록에서 계산한 참고 제안이에요. 통계적 비교일 뿐
        의학적 평가가 아니고, 통증이나 몸의 이상은 전문가와 상의하세요.
      </p>
    </section>
  );
}
