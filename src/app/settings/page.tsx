"use client";

import { useState } from "react";
import {
  LogIn,
  LogOut,
  RefreshCw,
  Download,
  Sun,
  Moon,
  Monitor,
  Check,
  User,
} from "lucide-react";
import { Sheet, Button, Segmented, useToast, cn } from "@/components/ui";
import { LoginForm } from "@/components/onboarding";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useProfile, useUpdateProfile } from "@/lib/hooks";
import { playRestDoneChime, armFeedback } from "@/lib/feedback";
import * as repo from "@/lib/repo";
import { APP_NAME } from "@/lib/constants";
import type { ThemePref, Unit } from "@/lib/types";

export default function SettingsPage() {
  const { mode, user, configured, sync, signOut, syncNow } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const [loginOpen, setLoginOpen] = useState(false);

  const unit: Unit = profile?.unit ?? "kg";
  const weekMon = profile?.weekStartsMonday ?? true;

  const exportCsv = async () => {
    const sessions = await repo.listSessions();
    const exs = await repo.listExercises();
    const nameOf = new Map(exs.map((e) => [e.id, e.nameKo]));
    const rows = [["날짜", "세션", "운동", "세트", "무게(kg)", "횟수", "세트유형", "완료"]];
    for (const s of sessions.slice().reverse()) {
      for (const ex of s.exercises) {
        ex.sets.forEach((st, i) => {
          rows.push([
            s.date,
            s.title ?? "",
            nameOf.get(ex.exerciseId) ?? ex.exerciseId,
            String(i + 1),
            String(st.weight),
            String(st.reps),
            st.setType,
            st.isCompleted ? "O" : "",
          ]);
        });
      }
    }
    const csv =
      "﻿" +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `오운완_기록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("CSV로 내보냈어요");
  };

  return (
    <div className="px-4 pt-4 space-y-5">
      <h1 className="text-2xl font-black">설정</h1>

      {/* 계정 */}
      <Section title="계정 · 동기화">
        {mode === "user" ? (
          <>
            <Row
              icon={<User size={18} />}
              label={user?.email ?? "로그인됨"}
              right={
                <span className="text-xs font-semibold text-brand-strong">
                  {sync.status === "syncing"
                    ? "동기화 중"
                    : sync.pending > 0
                    ? `미저장 ${sync.pending}`
                    : "동기화됨"}
                </span>
              }
            />
            <button
              onClick={syncNow}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-text-2 hover:bg-surface-2"
            >
              <RefreshCw size={18} className={sync.status === "syncing" ? "animate-spin" : ""} />
              지금 동기화
            </button>
            <button
              onClick={async () => {
                await signOut();
                toast("로그아웃됨");
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-danger hover:bg-surface-2"
            >
              <LogOut size={18} /> 로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={() => setLoginOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand-strong">
              <LogIn size={18} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">로그인하고 동기화 켜기</span>
              <span className="block text-xs text-text-3">
                {configured
                  ? "기기 간 기록을 안전하게 이어가요"
                  : "동기화 서버 미설정 — 지금은 로컬 저장"}
              </span>
            </span>
          </button>
        )}
      </Section>

      {/* 환경설정 */}
      <Section title="환경설정">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">무게 단위</span>
          <Segmented<Unit>
            value={unit}
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]}
            onChange={(v) => updateProfile.mutate({ unit: v })}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">주 시작 요일</span>
          <Segmented<string>
            value={weekMon ? "mon" : "sun"}
            options={[
              { value: "mon", label: "월요일" },
              { value: "sun", label: "일요일" },
            ]}
            onChange={(v) => updateProfile.mutate({ weekStartsMonday: v === "mon" })}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">휴식 종료 알림</div>
            <button
              onClick={() => {
                armFeedback();
                playRestDoneChime();
              }}
              className="mt-0.5 text-xs font-semibold text-brand"
            >
              소리 미리듣기 ♪
            </button>
          </div>
          <Segmented<string>
            value={profile?.restAlert !== false ? "on" : "off"}
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            onChange={(v) => updateProfile.mutate({ restAlert: v === "on" })}
          />
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 text-sm font-semibold">테마</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { v: "system", label: "시스템", icon: <Monitor size={16} /> },
                { v: "light", label: "라이트", icon: <Sun size={16} /> },
                { v: "dark", label: "다크", icon: <Moon size={16} /> },
              ] as { v: ThemePref; label: string; icon: React.ReactNode }[]
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => {
                  setTheme(t.v);
                  updateProfile.mutate({ theme: t.v });
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-app border py-2.5 text-xs font-semibold transition",
                  theme === t.v
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-border text-text-2"
                )}
              >
                {t.icon}
                {t.label}
                {theme === t.v && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* 데이터 */}
      <Section title="데이터">
        <button
          onClick={exportCsv}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-text-2 hover:bg-surface-2"
        >
          <Download size={18} /> CSV로 내보내기
        </button>
      </Section>

      <div className="pb-4 text-center text-xs text-text-3">
        {APP_NAME} · 바벨만 기억하는 게 아니라 내 몸까지 기억하는 운동 기록
        <br />
        v0.1 · 로컬퍼스트 PWA
      </div>

      <Sheet open={loginOpen} onClose={() => setLoginOpen(false)} title="로그인">
        <p className="mb-4 text-sm text-text-3 leading-relaxed">
          로그인하면 지금까지의 로컬 기록이 계정으로 옮겨지고, 다른 기기와
          자동으로 동기화돼요.
        </p>
        <LoginForm onDone={() => {}} />
      </Sheet>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 px-1 text-xs font-bold text-text-3">{title}</div>
      <div className="overflow-hidden rounded-app border border-border bg-surface divide-y divide-border">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-text-3">{icon}</span>
      <span className="flex-1 truncate text-sm font-semibold">{label}</span>
      {right}
    </div>
  );
}
