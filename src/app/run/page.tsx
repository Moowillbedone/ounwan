"use client";

import { Suspense } from "react";
import { RunScreen } from "@/components/run-screen";

export default function RunPage() {
  return (
    <Suspense fallback={<div className="p-6 text-text-3">불러오는 중…</div>}>
      <RunScreen />
    </Suspense>
  );
}
