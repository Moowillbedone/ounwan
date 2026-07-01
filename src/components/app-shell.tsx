"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Dumbbell, BarChart3, Settings, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ToastProvider, cn, Spinner } from "./ui";
import { OnboardingGate } from "./onboarding";
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

function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="relative grid grid-cols-5 h-[62px]">
        {TABS.slice(0, 2).map((t) => (
          <TabBtn key={t.href} {...t} active={pathname === t.href} />
        ))}
        {/* 중앙 기록 FAB */}
        <div className="flex items-start justify-center">
          <button
            onClick={() => router.push("/log")}
            aria-label="운동 기록 시작"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_6px_20px_rgba(22,196,127,0.5)] active:scale-90 transition"
          >
            <Plus size={28} strokeWidth={2.6} />
          </button>
        </div>
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

  if (!ready) return <Splash />;

  const needGate = configured && !user && !guestChosen;

  return (
    <ToastProvider>
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px] bg-bg text-text shadow-[0_0_60px_rgba(0,0,0,0.06)]">
        {needGate ? (
          <OnboardingGate />
        ) : (
          <>
            <main className={cn(!immersive && "pb-[86px]")}>{children}</main>
            {!immersive && <BottomNav />}
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
