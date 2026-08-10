"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { scheduleSync } from "@/lib/sync";
import { reanchorRest } from "@/lib/feedback";
import { AppShell } from "./app-shell";

function GlobalEffects() {
  useEffect(() => {
    // 서비스워커 등록(오프라인 셸) — 개발 중 HMR 간섭 방지 위해 프로덕션만
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {});
    }
    // 포그라운드 복귀 시: 동기화 + 휴식 종료음 재앵커(서스펜드됐던 오디오 되살려 제때 울리게)
    const onFocus = () => {
      scheduleSync(300);
      reanchorRest();
    };
    const onOnline = () => scheduleSync(300);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleSync(300);
        reanchorRest();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            gcTime: 1000 * 60 * 30,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <GlobalEffects />
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
