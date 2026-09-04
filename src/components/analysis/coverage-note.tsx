"use client";

import { useState } from "react";
import { ChevronDown, ListChecks, Link2 } from "lucide-react";
import { groupByStandard, type AnalysisBase } from "@/lib/analysis";
import { liftKeyFor, standardNameKo } from "@/lib/strength-standards";
import { useUpdateProfile } from "@/lib/hooks";
import type { Profile } from "@/lib/types";
import { cn, useToast } from "@/components/ui";
import { StandardLinkSheet } from "./standard-link-sheet";

const REASON_KO: Record<string, string> = {
  tracking: "중량×횟수로 기록한 세트가 없어요",
  "no-bodyweight": "맨몸 종목이라 체중 기록이 필요해요",
  reps: "완료 세트가 전부 13회 이상이라 1RM 추정이 어려워요 (12회 이하 세트가 하나만 있어도 계산돼요)",
  "no-weight": "무게가 0으로 기록돼 있어요",
};

interface Item {
  id: string;
  name: string;
  /** 사용자가 직접 기준표에 연결한 종목 */
  linked: boolean;
  /** 탭해서 연결을 걸거나 바꿀 수 있는 종목 */
  tappable: boolean;
}

/**
 * '왜 이 종목만 비교됐는지'를 앱이 직접 설명한다.
 * 조용히 빠지면 동기화 오류처럼 보이기 때문에, 빠진 종목과 사유를 모두 보여준다.
 * 기준표가 없는 종목(직접 만든 종목 등)은 여기서 바로 기준표에 연결할 수 있다.
 */
export function CoverageNote({
  base,
  profile,
}: {
  base: AnalysisBase;
  profile: Profile | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Item | null>(null);
  const updateProfile = useUpdateProfile();
  const toast = useToast();

  const overrides = profile?.exerciseStandards;

  // 판정은 '기준표 키' 단위로 묶여서 나가므로(별칭·연결된 커스텀 합산),
  // 여기서도 같은 묶음의 날짜 수를 봐야 수준 비교 화면과 말이 맞는다.
  const groupDays = new Map<string, number>();
  for (const g of groupByStandard(base.bests, overrides).values())
    for (const m of g.members) groupDays.set(m.exerciseId, g.days.size);

  const judged: Item[] = [];
  const oneDay: Item[] = [];
  const noStandard: Item[] = [];

  for (const [exId, b] of base.bests) {
    const linked = !!overrides?.[exId];
    const item: Item = { id: exId, name: b.nameKo, linked, tappable: true };
    if (!liftKeyFor(exId, overrides)) {
      noStandard.push(item);
    } else if ((groupDays.get(exId) ?? b.dayCount) < 2) {
      oneDay.push({ ...item, tappable: linked });
    } else {
      judged.push({ ...item, tappable: linked });
    }
  }
  const excluded = base.excluded;

  const totalSkipped = oneDay.length + noStandard.length + excluded.length;
  if (judged.length === 0 && totalSkipped === 0) return null;

  const setStandard = (exerciseId: string, liftKey: string | null) => {
    const cur = profile?.exerciseStandards ?? {};
    const next = { ...cur };
    if (liftKey) next[exerciseId] = liftKey;
    else delete next[exerciseId];
    updateProfile.mutate({ exerciseStandards: next });
    setLinkTarget(null);
    toast(
      liftKey
        ? `${standardNameKo(liftKey)} 기준으로 비교할게요`
        : "기준표 연결을 해제했어요"
    );
  };

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
            직접 만든 종목은 <b className="text-text-2">탭해서 기준표에 연결</b>하면
            지금까지의 기록까지 한 번에 비교돼요. (볼륨·균형·습관 분석에는{" "}
            <b className="text-text-2">모든 종목</b>이 들어가요.)
          </p>

          {judged.length > 0 && (
            <Group title="수준 비교됨" tone="ok" items={judged} onTap={setLinkTarget} />
          )}
          {oneDay.length > 0 && (
            <Group
              title="하루치 기록만 있어 대기 중"
              tone="wait"
              items={oneDay}
              onTap={setLinkTarget}
              desc="다른 날 한 번만 더 기록하면 바로 판정돼요"
            />
          )}
          {noStandard.length > 0 && (
            <Group
              title="기준표가 아직 없는 종목"
              tone="none"
              items={noStandard}
              onTap={setLinkTarget}
              desc="탭해서 동작이 같은 기준 종목(예: 데드리프트)에 연결하면 바로 비교돼요"
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

      <StandardLinkSheet
        open={!!linkTarget}
        exerciseName={linkTarget?.name ?? ""}
        current={linkTarget ? liftKeyFor(linkTarget.id, overrides) : null}
        onClose={() => setLinkTarget(null)}
        onSelect={(key) => linkTarget && setStandard(linkTarget.id, key)}
        onClear={() => linkTarget && setStandard(linkTarget.id, null)}
      />
    </section>
  );
}

function Group({
  title,
  tone,
  items,
  desc,
  onTap,
}: {
  title: string;
  tone: "ok" | "wait" | "none";
  items: Item[];
  desc?: string;
  onTap: (item: Item) => void;
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
        {items.map((it) => {
          const cls = cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            tone === "ok"
              ? "bg-brand-soft text-brand-strong"
              : "bg-surface-2 text-text-2",
            it.tappable && "active:scale-95 transition",
            tone === "none" && "border border-dashed border-border"
          );
          const inner = (
            <>
              {it.name}
              {(it.linked || tone === "none") && (
                <Link2 size={10} className="shrink-0 opacity-70" />
              )}
            </>
          );
          return it.tappable ? (
            <button
              key={it.id}
              onClick={() => onTap(it)}
              className={cls}
              aria-label={`${it.name} 기준표 연결`}
            >
              {inner}
            </button>
          ) : (
            <span key={it.id} className={cls}>
              {inner}
            </span>
          );
        })}
      </div>
      {desc && <p className="mt-1 text-text-3">{desc}</p>}
    </div>
  );
}
