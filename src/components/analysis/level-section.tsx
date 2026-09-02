"use client";

import { useState } from "react";
import { Trophy, Info, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { AnalysisBase } from "@/lib/analysis";
import {
  judgeLift,
  LIFT_KEYS,
  LEVELS,
  LEVEL_KO,
  STANDARDS_META,
  type LevelVerdict,
  type Sex,
} from "@/lib/strength-standards";
import type { Profile } from "@/lib/types";
import { cn } from "@/components/ui";
import { josa } from "@/lib/utils";

/** 내 수준 — 같은 성별·체중·나이 기준과 비교 */
export function LevelSection({
  base,
  profile,
}: {
  base: AnalysisBase;
  profile: Profile | undefined;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const sex = (profile?.sex ?? null) as Sex | null;
  const bw = base.bodyweight;

  if (!sex || !bw) {
    const missing = [
      !sex ? "성별" : null,
      !bw ? "체중" : null,
    ].filter(Boolean) as string[];
    return (
      <section className="rounded-app border border-brand/30 bg-brand-soft/40 p-4">
        <div className="mb-1 flex items-center gap-1.5 font-bold">
          <Trophy size={16} className="text-brand-strong" /> 내 수준 비교
        </div>
        <p className="text-[12px] leading-snug text-text-2">
          <b>{missing.join("과 ")}</b>만 있으면 같은 조건의 리프터 기준과 비교해
          내가 입문·중급·상급 중 어디인지 알려드릴 수 있어요.
        </p>
        <div className="mt-2.5 flex gap-2">
          {!sex && (
            <Link
              href="/settings"
              className="flex flex-1 items-center justify-between rounded-app bg-surface px-3 py-2 text-[12px] font-semibold"
            >
              성별·나이 입력 <ArrowRight size={14} className="text-text-3" />
            </Link>
          )}
          {!bw && (
            <Link
              href="/stats"
              className="flex flex-1 items-center justify-between rounded-app bg-surface px-3 py-2 text-[12px] font-semibold"
            >
              체중 기록하기 <ArrowRight size={14} className="text-text-3" />
            </Link>
          )}
        </div>
      </section>
    );
  }

  // 표준이 있는 종목만 판정. 단 하루치 기록으로는 등급을 매기지 않는다.
  const verdicts: LevelVerdict[] = [];
  const pending: string[] = [];
  for (const [exId, liftKey] of Object.entries(LIFT_KEYS)) {
    const best = base.bests.get(exId);
    if (!best || best.best1RM <= 0) continue;
    if (best.dayCount < 2) {
      if (!pending.includes(best.nameKo)) pending.push(best.nameKo);
      continue;
    }
    const v = judgeLift(sex, liftKey, best.best1RM, bw, base.age);
    if (!v) continue;
    v.nameKo = best.nameKo; // 표준표 표기가 아니라 앱의 종목명을 쓴다
    // 같은 표준키가 중복되면(예: 오버헤드/밀리터리) 더 높은 기록만
    const prev = verdicts.findIndex((x) => x.liftKey === liftKey);
    if (prev >= 0) {
      if (v.e1rm > verdicts[prev].e1rm) verdicts[prev] = v;
    } else verdicts.push(v);
  }
  verdicts.sort((a, b) => b.percentile - a.percentile);
  const verdictsAgeAdjusted = verdicts.some((v) => v.ageAdjusted);

  if (verdicts.length === 0) {
    return (
      <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="mb-1 flex items-center gap-1.5 font-bold">
          <Trophy size={16} className="text-text-3" /> 내 수준 비교
        </div>
        <p className="text-[12px] leading-snug text-text-3">
          {pending.length > 0 ? (
            <>
              <b className="text-text-2">{pending.join(", ")}</b>
              {josa(pending[pending.length - 1], "은는").slice(-1)} 아직 하루치
              기록뿐이에요. 다른 날 한 번만 더 기록하면 바로 판정해드려요.
            </>
          ) : (
            <>
              기준표가 있는 종목(벤치프레스·백스쿼트·데드리프트·오버헤드프레스·바벨로우·풀업)을
              서로 다른 2일 이상 기록하면 또래 기준과 비교해드려요.
            </>
          )}
        </p>
      </section>
    );
  }

  // 종합은 기구·입력 편차가 작은 종목만으로 낸다(머신·덤벨은 등급을 왜곡함)
  const core = verdicts.filter((v) => !v.lowConfidence);
  const basis = core.length > 0 ? core : verdicts;
  const avgPct = Math.round(
    basis.reduce((n, v) => n + v.percentile, 0) / basis.length
  );
  // 대표 레벨 = 평균 백분위가 속한 구간
  const overall =
    avgPct >= 95 ? "elite" : avgPct >= 80 ? "advanced" : avgPct >= 50 ? "intermediate" : avgPct >= 20 ? "novice" : "beginner";
  const best = basis[0] ?? verdicts[0];
  const worst = basis[basis.length - 1] ?? verdicts[verdicts.length - 1];

  return (
    <section className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-0.5 flex items-center gap-1.5 font-bold">
        <Trophy size={16} className="text-brand" /> 내 수준
      </div>
      <p className="mb-3 text-[11px] text-text-3">
        {base.age != null ? `${base.age}세 ` : ""}
        {sex === "male" ? "남성" : "여성"} · {Math.round(bw)}kg 기준
        {verdictsAgeAdjusted ? " · 나이 보정 적용" : ""}
      </p>

      {/* 종합 */}
      <div className="mb-4 rounded-app bg-brand-soft/50 px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold text-text-2">
            {basis.length}개 종목 종합
            {core.length > 0 && verdicts.length > core.length && (
              <span className="ml-1 font-normal text-text-3">
                (참고 {verdicts.length - core.length}개 제외)
              </span>
            )}
          </span>
          <span className="text-xl font-black text-brand-strong">
            {LEVEL_KO[overall]}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-text-2">
          같은 조건에서 기록을 남기는 리프터 중 <b>상위 {100 - avgPct}%</b> 수준이에요.
          가장 강한 건 <b>{best.nameKo}</b>, 가장 아쉬운 건{" "}
          <b>{worst.nameKo}</b>
          {josa(worst.nameKo, "이에요").slice(worst.nameKo.length)}.
        </p>
      </div>

      <div className="space-y-3.5">
        {verdicts.map((v) => (
          <LiftRow
            key={v.liftKey}
            v={v}
            open={openKey === v.liftKey}
            onToggle={() => setOpenKey(openKey === v.liftKey ? null : v.liftKey)}
            bw={bw}
            sex={sex}
            age={base.age}
          />
        ))}
      </div>

      {pending.length > 0 && (
        <p className="mt-3 text-[11px] leading-snug text-text-3">
          {josa(pending.join(", "), "은는")} 하루치 기록뿐이라 아직 판정하지
          않았어요. 다른 날 한 번 더 기록하면 추가돼요.
        </p>
      )}

      {base.bodyweightAgeDays != null && base.bodyweightAgeDays > 90 && (
        <p className="mt-2 text-[11px] leading-snug text-warn">
          체중이 {base.bodyweightAgeDays}일 전 기록이에요. 지금 체중과 다르면 결과도
          달라져요.
        </p>
      )}

      <p className="mt-4 text-[10px] leading-snug text-text-3">
        기준: {STANDARDS_META.source} ·{" "}
        <a
          href={STANDARDS_META.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          출처
        </a>
        <br />
        {STANDARDS_META.levelMeaning}
        <br />
        {STANDARDS_META.caveats}
        <br />
        {STANDARDS_META.heightNote}
      </p>
    </section>
  );
}

function LiftRow({
  v,
  open,
  onToggle,
  bw,
  sex,
  age,
}: {
  v: LevelVerdict;
  open: boolean;
  onToggle: () => void;
  bw: number;
  sex: Sex;
  age: number | null;
}) {
  return (
    <div>
      <button onClick={onToggle} className="w-full text-left">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-bold">{v.nameKo}</span>
            {v.lowConfidence && (
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-text-3">
                참고
              </span>
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-text-3">
              {Math.round(v.e1rm)}kg
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                v.level === "elite" || v.level === "advanced"
                  ? "bg-brand text-white"
                  : v.level === "intermediate"
                  ? "bg-brand-soft text-brand-strong"
                  : "bg-surface-2 text-text-2"
              )}
            >
              {v.level ? LEVEL_KO[v.level] : "시작"}
            </span>
            <Info size={12} className="text-text-3" />
          </span>
        </div>

        {/* 수준 스펙트럼 */}
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-surface-2" />
          <div
            className="absolute top-2 left-0 h-1.5 rounded-full bg-brand/70"
            style={{ width: `${v.pos * 100}%` }}
          />
          {LEVELS.map((k, i) => (
            <span
              key={k}
              className="absolute top-[3px] h-3.5 w-[2px] rounded bg-border"
              style={{ left: `${(i / (LEVELS.length - 1)) * 100}%` }}
            />
          ))}
          <span
            className="absolute top-0.5 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full border-2 border-surface bg-brand shadow-[var(--shadow-pop)]"
            style={{ left: `${v.pos * 100}%` }}
          />
          <div className="absolute inset-x-0 top-4 flex justify-between text-[8px] font-semibold text-text-3">
            {LEVELS.map((k) => (
              <span key={k}>{LEVEL_KO[k]}</span>
            ))}
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-2 rounded-app bg-surface-2 px-3 py-2.5 text-[11px] leading-relaxed text-text-2">
          <div className="mb-1 font-bold text-text">판정 근거</div>
          {age != null ? `${age}세 ` : ""}
          {sex === "male" ? "남성" : "여성"} {Math.round(bw)}kg 기준{" "}
          <b>{v.nameKo}</b>의 구간은{" "}
          {LEVELS.map((k) => `${LEVEL_KO[k]} ${Math.round(v.levels[k])}kg`).join(" · ")}
          예요.
          <br />내 추정 1RM <b>{Math.round(v.e1rm)}kg</b>은{" "}
          {v.level ? (
            <>
              <b>{LEVEL_KO[v.level]}</b> 구간이고, 같은 조건 리프터 중{" "}
              <b>상위 {100 - v.percentile}%</b>에 해당해요.
            </>
          ) : (
            <>아직 입문 기준({Math.round(v.levels.beginner)}kg) 아래예요.</>
          )}
          {v.next && (
            <>
              <br />
              <b>{LEVEL_KO[v.next.level]}</b>까지 {Math.round(v.next.need - v.e1rm)}kg
              남았어요.
            </>
          )}
          {v.ageAdjusted && (
            <>
              <br />
              <span className="text-text-3">
                나이에 따른 기록 감소를 반영해 기준을 낮춰 비교했어요.
              </span>
            </>
          )}
          {v.note && (
            <>
              <br />
              <span className="text-text-3">※ {v.note}</span>
            </>
          )}
          {v.lowConfidence && (
            <>
              <br />
              <span className="text-text-3">
                기구·입력 방식에 따라 편차가 커서 <b>종합 등급 계산에서는 뺐어요</b>.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
