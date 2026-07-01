"use client";

import { Suspense } from "react";
import { LogScreen } from "@/components/log-screen";

export default function LogPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-3">불러오는 중…</div>}>
      <LogScreen />
    </Suspense>
  );
}
