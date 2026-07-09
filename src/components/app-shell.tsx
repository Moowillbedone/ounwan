"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell, BarChart3, Settings, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ToastProvider, cn, Spinner } from "./ui";
import { OnboardingGate } from "./onboarding";
import { StartWorkoutSheet } from "./start-workout";
import { RestTimer } from "./rest-timer";
import { APP_NAME } from "@/lib/constants";

const TABS = [
  { href: "/", label: "캘린더", icon: CalendarDays },
  { href: "/routines", label: "루틴", icon: Dumbbell },
  { href: "/stats", label: "통계", icon: BarChart3 },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

function Splash() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg">
      <div className="text-4xl font-black tracking-tight text-brand animate-pop">
        오운완
      </div>
      <Spinner />
    </div>
  );
}

function BottomNav({
  onStartClick,
  startActive,
}: {
  onStartClick: () => void;
  startActive: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 h-[62px]">
        {TABS.slice(0, 2).map((t) => (
          <TabBtn key={t.href} {...t} active={pathname === t.href} />
        ))}
        {/* 중앙 '운동' — 다른 탭과 동일 스타일, 시작 시트 열려 있을 때 활성 */}
        <button
          onClick={onStartClick}
          aria-label="운동"
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95",
            startActive ? "text-brand" : "text-text-3"
          )}
        >
          <Plus size={22} strokeWidth={startActive ? 2.6 : 2} />
          운동
        </button>
        {TABS.slice(2).map((t) => (
          <TabBtn key={t.href} {...t} active={pathname === t.href} />
        ))}
      </div>
    </nav>
  );
}

function TabBtn({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition",
        active ? "text-brand" : "text-text-3"
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.6 : 2} />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, configured, user, guestChosen } = useAuth();
  const pathname = usePathname();
  const immersive = pathname.startsWith("/log");
  const [startOpen, setStartOpen] = useState(false);

  if (!ready) return <Splash />;

  const needGate = configured && !user && !guestChosen;

  return (
    <ToastProvider>
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px] overflow-x-clip bg-bg text-text shadow-[0_0_60px_rgba(0,0,0,0.06)]">
        {needGate ? (
          <OnboardingGate />
        ) : (
          <>
            <main className={cn(!immersive && "pb-[86px]")}>{children}</main>
            {!immersive && (
              <BottomNav
                onStartClick={() => setStartOpen(true)}
                startActive={startOpen}
              />
            )}
            <StartWorkoutSheet open={startOpen} onClose={() => setStartOpen(false)} />
            {/* 휴식 타이머는 전역 — 화면을 옮겨도 유지 */}
            <RestTimer immersive={immersive} />
          </>
        )}
      </div>
      <DesktopHint appName={APP_NAME} />
    </ToastProvider>
  );
}

/** 데스크톱 프리뷰에서 '모바일 앱'임을 알려주는 힌트 */
function DesktopHint({ appName }: { appName: string }) {
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-10 hidden text-xs text-text-3 lg:block">
      {appName} · 모바일 앱형 웹
    </div>
  );
}
