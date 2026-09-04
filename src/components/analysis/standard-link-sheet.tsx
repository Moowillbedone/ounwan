"use client";

import { Check, Link2Off } from "lucide-react";
import { Sheet, Button, cn } from "@/components/ui";
import { STANDARD_OPTIONS } from "@/lib/strength-standards";

/**
 * 종목 하나를 근력 기준표에 연결하는 시트.
 * 커스텀 종목은 id가 uuid라 빌트인 매핑(LIFT_KEYS)에 절대 안 걸린다 →
 * 여기서 고른 값이 Profile.exerciseStandards에 저장돼 수준 비교에 들어간다.
 */
export function StandardLinkSheet({
  open,
  exerciseName,
  current,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  exerciseName: string;
  current: string | null;
  onClose: () => void;
  onSelect: (liftKey: string) => void;
  onClear: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="기준표 연결"
      footer={
        current ? (
          <Button variant="ghost" size="lg" onClick={onClear}>
            <Link2Off size={18} /> 연결 해제
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm leading-snug text-text-3">
        <b className="text-text-2">{exerciseName}</b>을(를) 어떤 종목의 기준으로
        비교할지 고르세요. 고르면 <b className="text-text-2">지금까지 쌓인 기록도
        그대로 소급 반영</b>돼요. 동작이 사실상 같은 종목에만 연결하는 게 정확해요.
      </p>
      <div className="space-y-1.5">
        {STANDARD_OPTIONS.map((o) => {
          const on = current === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onSelect(o.key)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-app border px-3 py-2.5 text-left transition",
                on
                  ? "border-brand bg-brand-soft/50 text-text"
                  : "border-border text-text-2"
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{o.nameKo}</span>
                {o.lowConfidence && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-text-3">
                    참고
                  </span>
                )}
              </span>
              {on && <Check size={16} className="shrink-0 text-brand" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-text-3">
        ‘참고’ 표시는 기구·입력 방식에 따라 편차가 커서 종합 등급 계산에서는 빠지는
        종목이에요.
      </p>
    </Sheet>
  );
}
