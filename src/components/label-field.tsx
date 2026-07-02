"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { cn } from "./ui";
import { LABEL_COLORS, DEFAULT_LABEL_COLOR } from "@/lib/constants";

/** 메모 라벨 입력 + 색상 선택(태그 아이콘 탭 → 팔레트). 라벨은 blur 시 커밋. */
export function LabelField({
  value,
  color,
  onChangeLabel,
  onChangeColor,
  placeholder,
}: {
  value?: string | null;
  color?: string | null;
  onChangeLabel: (v: string) => void;
  onChangeColor: (c: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const c = color || DEFAULT_LABEL_COLOR;

  return (
    <div className="rounded-lg bg-surface-2/60 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="라벨 색상 선택"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full active:scale-90"
        >
          <Tag size={15} style={{ color: c }} />
        </button>
        <input
          value={text}
          maxLength={6}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onChangeLabel(text.trim())}
          placeholder={placeholder ?? "라벨 (예: 상체A)"}
          className="w-full bg-transparent text-sm font-bold outline-none placeholder:font-normal placeholder:text-text-3/70"
          style={{ color: text ? c : undefined }}
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-0.5">
          {LABEL_COLORS.map((lc) => (
            <button
              key={lc.value}
              type="button"
              aria-label={lc.name}
              onClick={() => {
                onChangeColor(lc.value);
                setOpen(false);
              }}
              className={cn(
                "h-6 w-6 rounded-full transition",
                c === lc.value ? "ring-2 ring-text ring-offset-2 ring-offset-surface" : ""
              )}
              style={{ background: lc.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
