"use client";

import { useEffect, useState } from "react";
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
  Bell,
  Smartphone,
} from "lucide-react";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { App } from "@capacitor/app";
import { checkForUpdate, installUpdate, type UpdateInfo } from "@/lib/updater";
import { Sheet, Button, Segmented, useToast, cn } from "@/components/ui";
import { LoginForm } from "@/components/onboarding";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useProfile, useUpdateProfile } from "@/lib/hooks";
import { playRestSound, armFeedback, REST_SOUNDS } from "@/lib/feedback";
import * as repo from "@/lib/repo";
import { APP_NAME } from "@/lib/constants";
import type { ThemePref, Unit } from "@/lib/types";
import { isNativeApp } from "@/lib/native";

export default function SettingsPage() {
  const { mode, user, configured, sync, signOut, syncNow } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const toast = useToast();
  const [loginOpen, setLoginOpen] = useState(false);

  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);

  const unit: Unit = profile?.unit ?? "kg";
  const weekMon = profile?.weekStartsMonday ?? true;

  const exportCsv = async () => {
    const sessions = await repo.listSessions();
    const exs = await repo.listExercises();
    const nameOf = new Map(exs.map((e) => [e.id, e.nameKo]));
    const rows = [
      ["날짜", "세션", "운동", "종목ID", "세트", "무게(kg)", "횟수", "시간(초)", "거리(km)", "세트유형", "완료", "종료됨"],
    ];
    for (const s of sessions.slice().reverse()) {
      for (const ex of s.exercises) {
        ex.sets.forEach((st, i) => {
          rows.push([
            s.date,
            s.title ?? "",
            nameOf.get(ex.exerciseId) ?? ex.exerciseId,
            ex.exerciseId,
            String(i + 1),
            String(st.weight),
            String(st.reps),
            st.durationSec ? String(st.durationSec) : "",
            st.distanceM ? String(st.distanceM / 1000) : "",
            st.setType,
            st.isCompleted ? "O" : "",
            s.endedAt ? "O" : "",
          ]);
        });
      }
    }
    const csv =
      "﻿" +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const fileName = `오운완_기록_${new Date().toISOString().slice(0, 10)}.csv`;
    // 안드로이드 앱: 웹뷰는 파일 다운로드를 못 하므로 앱 저장소에 쓰고 공유 시트로 넘긴다
    if (isNativeApp()) {
      try {
        const w = await Filesystem.writeFile({
          path: fileName,
          data: csv,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({ title: fileName, files: [w.uri], dialogTitle: "CSV 저장·공유" });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (!/cancel/i.test(msg)) toast("CSV를 공유하지 못했어요", "error");
      }
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
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

      {/* 신체 정보 — 분석 탭의 근력 기준 비교에 사용 */}
      <Section title="신체 정보">
        <p className="px-4 pb-1 pt-3 text-[11px] leading-snug text-text-3">
          분석 탭에서 <b className="text-text-2">같은 성별·나이·체중대의 기준</b>과
          비교할 때만 쓰여요. 입력하지 않아도 앱은 그대로 동작해요.
        </p>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">성별</span>
          <Segmented<string>
            value={profile?.sex ?? "none"}
            options={[
              { value: "male", label: "남성" },
              { value: "female", label: "여성" },
              { value: "none", label: "미입력" },
            ]}
            onChange={(v) =>
              updateProfile.mutate({
                sex: v === "none" ? null : (v as "male" | "female"),
              })
            }
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">출생연도</span>
          <NumField
            value={profile?.birthYear ?? null}
            placeholder="1989"
            suffix="년"
            min={1920}
            max={2020}
            onCommit={(v) => updateProfile.mutate({ birthYear: v })}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">키</span>
          <NumField
            value={profile?.heightCm ?? null}
            placeholder="175"
            suffix="cm"
            min={120}
            max={230}
            onCommit={(v) => updateProfile.mutate({ heightCm: v })}
          />
        </div>
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
          <span className="text-sm font-semibold">휴식 종료 알림</span>
          <Segmented<string>
            value={profile?.restAlert !== false ? "on" : "off"}
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            onChange={(v) => updateProfile.mutate({ restAlert: v === "on" })}
          />
        </div>
        {profile?.restAlert !== false && (
          <div className="px-4 py-3">
            <div className="mb-2 text-sm font-semibold">
              알림음{" "}
              <span className="text-xs font-normal text-text-3">(탭하면 미리듣기)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {REST_SOUNDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    armFeedback();
                    playRestSound(s.id);
                    updateProfile.mutate({ restSound: s.id });
                  }}
                  className={cn(
                    "rounded-app border py-2.5 text-center transition active:scale-95",
                    (profile?.restSound ?? "chime") === s.id
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-border text-text-2"
                  )}
                >
                  <div className="text-sm font-bold">{s.label}</div>
                  <div className="mt-0.5 text-[10px] text-text-3">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
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

      {/* 알림 · 앱 (안드로이드 앱 전용 기능) */}
      <Section title="알림 · 앱">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Bell size={16} className="text-text-3" /> 오늘 운동 알림
          </span>
          <Segmented<string>
            value={profile?.reminderEnabled ? "on" : "off"}
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            onChange={(v) => updateProfile.mutate({ reminderEnabled: v === "on" })}
          />
        </div>
        {profile?.reminderEnabled && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-text-2">알림 시간</span>
            <input
              type="time"
              value={profile?.reminderTime ?? "20:00"}
              onChange={(e) => e.target.value && updateProfile.mutate({ reminderTime: e.target.value })}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm font-semibold"
            />
          </div>
        )}
        <p className="px-4 py-2.5 text-[11px] leading-snug text-text-3">
          {native ? (
            <>운동을 끝낸 날은 울리지 않아요. 휴식 종료 알림은 앱이 백그라운드일 때 제시간에 울려요.</>
          ) : (
            <>알림은 안드로이드 앱(APK)에서만 울려요.</>
          )}
        </p>
        {native && <AppVersionRow />}
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

/** 숫자 입력(빈 값 허용) — blur/Enter에 커밋 */
function NumField({
  value,
  placeholder,
  suffix,
  min,
  max,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  suffix: string;
  min: number;
  max: number;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value != null ? String(value) : "");
  // 유효 범위에 들어오는 순간 바로 저장한다(blur만 믿으면 입력이 유실될 수 있음)
  const onChange = (raw: string) => {
    setDraft(raw);
    const t = raw.trim();
    if (t === "") {
      if (value != null) onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n >= min && n <= max) onCommit(Math.round(n));
  };
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (t === "") onCommit(null);
    else {
      const n = Number(t);
      if (Number.isFinite(n) && n >= min && n <= max) onCommit(Math.round(n));
    }
    setDraft(null);
  };
  return (
    <span className="flex items-center gap-1">
      <input
        inputMode="numeric"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-9 w-20 rounded-lg bg-surface-2 px-2 text-right text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-brand/40"
      />
      <span className="w-5 text-xs text-text-3">{suffix}</span>
    </span>
  );
}

/** 앱 버전 + 업데이트 확인·설치 */
function AppVersionRow() {
  const toast = useToast();
  const [version, setVersion] = useState<string>("");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    void App.getInfo().then((i) => setVersion(i.version)).catch(() => {});
  }, []);

  const check = async () => {
    setChecking(true);
    const r = await checkForUpdate();
    setChecking(false);
    setInfo(r);
    if (!r) toast("업데이트 정보를 가져오지 못했어요", "error");
    else if (!r.available) toast(`최신 버전이에요 (v${r.current})`);
  };
  const install = async () => {
    if (!info) return;
    try {
      setPct(0);
      const r = await installUpdate(info.url, setPct);
      if (r === "needs-permission") toast("설정에서 '이 출처 허용'을 켠 뒤 다시 눌러 주세요");
    } catch (e) {
      toast(String((e as Error)?.message ?? "업데이트를 받지 못했어요"), "error");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone size={16} className="text-text-3" /> 앱 버전
        <span className="font-normal text-text-3">v{version || "…"}</span>
      </span>
      {info?.available ? (
        <Button size="sm" onClick={install} disabled={pct != null}>
          {pct != null ? `받는 중 ${pct}%` : `v${info.latest} 설치`}
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={check} disabled={checking}>
          {checking ? "확인 중…" : "업데이트 확인"}
        </Button>
      )}
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
