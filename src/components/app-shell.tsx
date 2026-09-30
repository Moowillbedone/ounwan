"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Sparkles,
  BarChart3,
  Settings,
  Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ToastProvider, cn, Spinner } from "./ui";
import { OnboardingGate } from "./onboarding";
import { StartWorkoutSheet } from "./start-workout";
import { RestTimer } from "./rest-timer";
import { RunPill } from "./run-pill";
import { NativeBridge } from "./native-bridge";
import { UpdateBanner } from "./update-banner";
import { APP_NAME } from "@/lib/constants";
import { useProfile } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";

const TABS = [
  { href: "/", label: "캘린더", icon: CalendarDays },
  { href: "/analysis", label: "분석", icon: Sparkles },
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
  const immersive = pathname.startsWith("/log") || pathname.startsWith("/run");
  const [startOpen, setStartOpen] = useState(false);

  if (!ready) return <Splash />;

  const needGate = configured && !user && !guestChosen;

  return (
    <ToastProvider>
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px] overflow-x-clip bg-bg text-text shadow-[0_0_60px_rgba(0,0,0,0.06)]">
        {needGate ? (
          <div className="pt-[env(safe-area-inset-top)]">
            <OnboardingGate />
          </div>
        ) : (
          <>
            {!immersive && <UpdateBanner />}
            <IosInstallHint />
            {/* 아이폰 홈 화면 앱은 화면이 상태바(노치) 아래까지 올라오므로 그만큼 내려서 시작 */}
            <main className={cn(!immersive && "pb-[86px] pt-[env(safe-area-inset-top)]")}>{children}</main>
            {!immersive && (
              <BottomNav
                onStartClick={() => setStartOpen(true)}
                startActive={startOpen}
              />
            )}
            <StartWorkoutSheet open={startOpen} onClose={() => setStartOpen(false)} />
            {/* 휴식 타이머는 전역 — 화면을 옮겨도 유지 */}
            <RestTimer immersive={immersive} />
            {/* 달리기 기록 중이면 다른 화면에서도 현재 상태를 보여주고 탭하면 복귀 */}
            {!pathname.startsWith("/run") && <RunPill />}
            <AccentSync />
          </>
        )}
        {/* 앱 전용 연결부 — 로그인 화면에서도 떠 있어야 메일 링크(로그인 콜백)를 받을 수 있다 */}
        <NativeBridge />
      </div>
      <DesktopHint appName={APP_NAME} />
    </ToastProvider>
  );
}

/**
 * 아이폰 Safari로 열었을 때: '홈 화면에 추가'하면 앱처럼(전체 화면·아이콘) 쓸 수 있다고 안내.
 * 이미 홈 화면 앱으로 열었거나 닫기를 누르면 다시 안 보인다.
 */
function IosInstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      setShow(ios && !standalone && localStorage.getItem("ounwan-ios-hint") !== "off");
    } catch {
      /* noop */
    }
  }, []);
  if (!show) return null;
  return (
    <div className="mx-4 mt-[calc(env(safe-area-inset-top)+12px)] flex items-start gap-2 rounded-app border border-brand/30 bg-brand-soft/60 px-3 py-2.5 text-[13px] leading-snug text-text-2">
      <span className="flex-1">
        📲 아래 <b>공유 버튼(□↑) → 홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.
      </span>
      <button
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem("ounwan-ios-hint", "off");
          } catch {
            /* noop */
          }
        }}
        className="shrink-0 text-xs font-bold text-text-3"
      >
        닫기
      </button>
    </div>
  );
}

/** 계정에 저장된 테마 색상을 이 기기에 적용(다른 기기에서 바꿨거나 새 기기에 로그인했을 때) */
function AccentSync() {
  const { data: profile } = useProfile();
  const { accent, setAccent } = useTheme();
  const saved = profile?.accent;
  useEffect(() => {
    if (saved && saved !== accent) setAccent(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  return null;
}

/** 데스크톱 프리뷰에서 '모바일 앱'임을 알려주는 힌트 */
function DesktopHint({ appName }: { appName: string }) {
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-10 hidden text-xs text-text-3 lg:block">
      {appName} · 모바일 앱형 웹
    </div>
  );
}
