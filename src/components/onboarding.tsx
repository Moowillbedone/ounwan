"use client";

import { useState } from "react";
import { CalendarDays, Zap, RefreshCw, Mail, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Spinner } from "./ui";

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const { signInWithEmail, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!configured) {
    return (
      <p className="text-sm text-text-3 leading-relaxed">
        아직 동기화 서버가 연결되지 않았어요. 지금은 이 기기에만 저장되는
        <b> 게스트 모드</b>로 사용할 수 있어요.
      </p>
    );
  }

  if (sent) {
    return (
      <div className="text-center py-4">
        <CheckCircle2 className="mx-auto text-brand" size={40} />
        <p className="mt-3 font-bold">메일함을 확인하세요</p>
        <p className="mt-1 text-sm text-text-3">
          <b>{email}</b> 로 로그인 링크를 보냈어요.
          <br />
          링크를 누르면 자동으로 동기화가 시작돼요.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (!email.includes("@")) {
      setErr("이메일 형식을 확인하세요.");
      return;
    }
    setSending(true);
    setErr(null);
    const { error } = await signInWithEmail(email.trim());
    setSending(false);
    if (error) setErr(error);
    else {
      setSent(true);
      onDone?.();
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Mail
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full h-12 rounded-app border border-border bg-surface-2 pl-11 pr-3 text-[15px] outline-none focus:border-brand"
        />
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button size="lg" onClick={submit} disabled={sending}>
        {sending ? <Spinner size={18} /> : "로그인 링크 받기"}
      </Button>
      <p className="text-center text-xs text-text-3">
        비밀번호 없이 이메일 링크로 로그인해요.
      </p>
    </div>
  );
}

export function OnboardingGate() {
  const { chooseGuest } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-16 pb-10">
      <div className="flex-1">
        <div className="text-5xl font-black tracking-tight text-brand">오운완</div>
        <p className="mt-3 text-xl font-bold leading-snug">
          오늘 운동, 완료.
          <br />
          가장 빠르게 기록하고
          <br />
          잔디로 쌓는 습관.
        </p>

        <div className="mt-10 space-y-5">
          <Feature
            icon={<Zap className="text-brand" />}
            title="2탭이면 세트 입력 끝"
            desc="지난 기록을 그대로 불러와 무게·횟수만 톡톡."
          />
          <Feature
            icon={<CalendarDays className="text-brand" />}
            title="잔디 캘린더로 한눈에"
            desc="운동한 날이 초록으로 물들어요. 연속기록도 자동."
          />
          <Feature
            icon={<RefreshCw className="text-brand" />}
            title="기기 간 자동 동기화"
            desc="로그인하면 폰·태블릿 어디서나 기록이 이어져요."
          />
        </div>
      </div>

      <div className="space-y-3">
        {showLogin ? (
          <div className="rounded-app border border-border bg-surface p-4">
            <LoginForm />
          </div>
        ) : (
          <Button size="lg" onClick={() => setShowLogin(true)}>
            이메일로 시작 (동기화 켜기)
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={() => void chooseGuest()}>
          게스트로 먼저 둘러보기
        </Button>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3.5">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-app bg-brand-soft">
        {icon}
      </div>
      <div>
        <div className="font-bold">{title}</div>
        <div className="text-sm text-text-3 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
