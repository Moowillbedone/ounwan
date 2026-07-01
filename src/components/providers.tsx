"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { scheduleSync } from "@/lib/sync";
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
    const onFocus = () => scheduleSync(300);
    const onOnline = () => scheduleSync(300);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleSync(300);
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
