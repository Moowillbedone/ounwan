"use client";

import { Check, RefreshCw, CloudOff, Smartphone, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "./ui";

export function SyncPill() {
  const { mode, sync, syncNow, configured } = useAuth();

  if (mode === "guest") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-3">
        <Smartphone size={12} />
        {configured ? "이 기기 저장" : "로컬 저장"}
      </span>
    );
  }

  const map = {
    idle: { icon: Check, text: "동기화됨", cls: "text-brand-strong bg-brand-soft" },
    syncing: {
      icon: RefreshCw,
      text: "동기화 중",
      cls: "text-text-2 bg-surface-2",
    },
    offline: { icon: CloudOff, text: "오프라인", cls: "text-text-3 bg-surface-2" },
    error: {
      icon: AlertCircle,
      text: "재시도",
      cls: "text-warn bg-[color-mix(in_srgb,var(--warn)_15%,transparent)]",
    },
  } as const;
  const s = map[sync.status];
  const Icon = s.icon;

  return (
    <button
      onClick={syncNow}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-95",
        s.cls
      )}
    >
      <Icon size={12} className={sync.status === "syncing" ? "animate-spin" : ""} />
      {sync.pending > 0 && sync.status !== "syncing"
        ? `미저장 ${sync.pending}`
        : s.text}
    </button>
  );
}
