"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Pause,
  Play,
  Square,
  Footprints,
  Satellite,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { isVoiceOn, setVoiceOn, speak } from "@/lib/voice";
import { Button, Card, IconButton, cn, useToast } from "./ui";
import {
  useRun,
  startRun,
  pauseRun,
  resumeRun,
  finishRun,
  discardRun,
  reattachRun,
  movingSecOf,
  currentPaceOf,
  currentCadenceOf,
  fmtKm,
  fmtPace,
  fmtClock,
  type RunState,
  type RunResult,
  type RunLink,
} from "@/lib/run-tracker";
import { gpsKeepsRunningInBackground, openLocationSettings } from "@/lib/gps";
import { useSaveSession } from "@/lib/hooks";
import { getSession, getSessionsByDate, newEmptySession } from "@/lib/repo";
import { toDateKey, uid } from "@/lib/utils";
import type { SessionExercise, WorkoutSet, WorkoutSession } from "@/lib/types";
import { RunMap } from "./run-map";

export const RUN_EXERCISE_ID = "outdoor-running";

function runSet(r: RunResult): WorkoutSet {
  return {
    id: uid(),
    setType: "working",
    weight: 0,
    reps: 0,
    durationSec: r.record.movingSec,
    distanceM: r.record.distanceM,
    isCompleted: true,
    completedAt: r.endedAt,
  };
}

/** GPS 러닝 종목(운동 기록 화면의 카드). 측정 결과는 세트(거리·시간)와 run(경로·걸음)에 담긴다. */
export function gpsExercise(orderIndex: number, r?: RunResult): SessionExercise {
  return {
    id: uid(),
    exerciseId: RUN_EXERCISE_ID,
    orderIndex,
    trackingMode: "distance",
    gps: true,
    run: r ? r.record : null,
    sets: r ? [runSet(r)] : [],
  };
}

/**
 * 러닝 결과 저장. 운동 기록 화면에서 시작한 러닝(link)이면 그 운동 카드에 넣고,
 * 아니면 새 'GPS 러닝' 세션을 만든다. 돌아갈 화면 경로를 반환.
 */
async function saveRunResult(
  r: RunResult,
  save: (s: WorkoutSession) => Promise<unknown>
): Promise<{ path: string; session: WorkoutSession }> {
  if (r.link) {
    const s = await getSession(r.link.sessionId);
    if (s && !s.deletedAt) {
      const exs = [...s.exercises];
      const i = exs.findIndex((e) => e.id === r.link!.exId);
      if (i >= 0)
        exs[i] = {
          ...exs[i],
          trackingMode: "distance",
          gps: true,
          run: r.record,
          sets: [runSet(r)],
        };
      else exs.push(gpsExercise(exs.length, r));
      const onlyRun = exs.length === 1;
      const next: WorkoutSession = {
        ...s,
        exercises: exs,
        startedAt: s.startedAt ?? r.startedAt,
        // 러닝만 있는 운동이면 러닝이 끝난 때 운동도 끝(다른 운동이 있으면 운동 화면에서 마무리)
        endedAt: onlyRun ? s.endedAt ?? r.endedAt : s.endedAt,
      };
      await save(next);
      return { path: onlyRun ? "/" : `/log?id=${s.id}`, session: next };
    }
  }
  const date = toDateKey(new Date(r.startedAt));
  const sameDay = await getSessionsByDate(date);
  const idx = sameDay.reduce((m, s) => Math.max(m, s.sessionIndexOfDay), 0) + 1;
  const session = newEmptySession(date, idx);
  session.title = "GPS 러닝"; // 거리는 세트에 있으므로 제목엔 넣지 않음(수정 시 어긋남 방지)
  session.startedAt = r.startedAt;
  session.endedAt = r.endedAt;
  session.exercises = [gpsExercise(0, r)];
  await save(session);
  return { path: "/", session };
}

export function RunScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const run = useRun();
  const toast = useToast();
  const save = useSaveSession();
  const [, tick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [native, setNative] = useState(false);
  const [voice, setVoice] = useState(true);

  useEffect(() => {
    setNative(gpsKeepsRunningInBackground());
    setVoice(isVoiceOn());
    reattachRun();
  }, []);

  // 운동 기록 화면의 'GPS 러닝' 카드에서 온 경우 → 끝나면 그 카드에 기록
  const sessionParam = params.get("session");
  const exParam = params.get("ex");
  const link: RunLink | null =
    sessionParam && exParam ? { sessionId: sessionParam, exId: exParam } : null;
  const [linkName, setLinkName] = useState<string | null>(null);
  const activeLink = run ? run.link ?? null : link;
  useEffect(() => {
    if (!activeLink) {
      setLinkName(null);
      return;
    }
    void getSession(activeLink.sessionId).then((s) =>
      setLinkName(s ? s.title || s.label || "오늘 운동" : null)
    );
  }, [activeLink?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 달리는 중에는 1초마다 시간·페이스 표시 갱신
  useEffect(() => {
    if (run?.status !== "running") return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [run?.status]);

  const onFinish = async () => {
    if (!run) return;
    const short = run.distanceM < 50;
    const ok = window.confirm(
      short
        ? "거리가 50m도 안 돼요. 그래도 기록을 저장할까요?"
        : "달리기를 끝내고 기록을 저장할까요?"
    );
    if (!ok) return;
    setSaving(true);
    try {
      const result = await finishRun();
      if (!result) return;
      const km = (result.record.distanceM / 1000).toFixed(2);
      const { path } = await saveRunResult(result, (x) => save.mutateAsync(x));
      toast(
        result.link ? `러닝 ${km}km를 운동 기록에 넣었어요!` : `러닝 ${km}km 저장 완료!`,
        "pr"
      );
      router.push(path);
    } catch {
      toast("저장에 실패했어요. 다시 시도해 주세요.", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    if (window.confirm("이번 달리기 기록을 지울까요? 되돌릴 수 없어요.")) discardRun();
  };

  return (
    <div className="min-h-dvh bg-bg pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <header className="sticky top-0 z-20 flex items-center gap-1 bg-bg/90 px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 backdrop-blur">
        <IconButton
          onClick={() => router.push(activeLink ? `/log?id=${activeLink.sessionId}` : "/")}
          aria-label="뒤로"
        >
          <ChevronLeft size={22} />
        </IconButton>
        <h1 className="text-lg font-bold">러닝</h1>
        <button
          onClick={() => {
            const next = !voice;
            setVoiceOn(next);
            setVoice(next);
            if (next) void speak("음성 안내를 켰어요");
          }}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold active:scale-95",
            voice ? "bg-brand-soft text-brand-strong" : "bg-surface-2 text-text-3"
          )}
          aria-label="음성 안내 켜기/끄기"
        >
          {voice ? <Volume2 size={14} /> : <VolumeX size={14} />}
          음성 안내 {voice ? "켜짐" : "꺼짐"}
        </button>
      </header>

      {linkName && (
        <div className="mx-5 mt-1 rounded-app bg-brand-soft/60 px-3 py-2 text-center text-[13px] text-text-2">
          <b className="text-brand-strong">{linkName}</b>의 GPS 러닝으로 기록돼요
        </div>
      )}
      {!run ? <IdleView native={native} /> : <ActiveView run={run} />}

      <div className="px-5 pt-6">
        {!run && (
          <Button size="lg" onClick={() => startRun(link)}>
            <Play size={20} /> 달리기 시작
          </Button>
        )}
        {run?.status === "running" && (
          <Button size="lg" variant="secondary" onClick={() => pauseRun()}>
            <Pause size={20} /> 일시정지
          </Button>
        )}
        {run?.status === "paused" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" onClick={() => resumeRun()} disabled={saving}>
                <Play size={20} /> 계속 달리기
              </Button>
              <Button size="lg" variant="danger" onClick={onFinish} disabled={saving}>
                <Square size={18} /> 종료·저장
              </Button>
            </div>
            <button
              onClick={onDiscard}
              className="w-full py-2 text-sm font-semibold text-text-3 active:text-danger"
            >
              기록 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IdleView({ native }: { native: boolean }) {
  return (
    <div className="px-5 pt-6 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-soft text-brand">
        <Footprints size={38} />
      </div>
      <p className="mt-4 text-xl font-black">GPS로 거리·페이스 측정</p>
      <p className="mt-2 text-sm leading-relaxed text-text-3">
        1km마다 구간 기록과 음성 안내가 나오고, 끝나면 캘린더에 <b>러닝 세션</b>으로 저장돼요.
      </p>
      <div
        className={cn(
          "mt-5 rounded-app p-3 text-left text-[13px] leading-relaxed",
          native ? "bg-brand-soft/60 text-text-2" : "bg-warn/10 text-text-2"
        )}
      >
        {native ? (
          <>
            📱 <b>앱 모드</b> — 화면을 끄고 주머니에 넣어도 계속 기록돼요. 기록 중에는 알림창에
            &lsquo;오운완 러닝 기록 중&rsquo;이 표시돼요.
          </>
        ) : (
          <>
            🌐 <b>브라우저 모드</b> — 웹은 화면이 꺼지면 위치가 멈춰요. 화면을 켜둔 채로
            달리거나, 오운완 안드로이드 앱(APK)을 쓰면 화면을 꺼도 기록돼요.
          </>
        )}
      </div>
    </div>
  );
}

function ActiveView({ run }: { run: RunState }) {
  const sec = movingSecOf(run);
  const avgPace = run.distanceM >= 50 ? sec / (run.distanceM / 1000) : null;
  const curPace = run.status === "running" ? currentPaceOf(run) : null;
  const cadence = run.status === "running" ? currentCadenceOf(run) : null;

  return (
    <div className="px-5">
      {run.interrupted && (
        <div className="mt-2 flex items-start gap-2 rounded-app bg-warn/10 p-3 text-[13px] text-text-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
          앱이 종료돼서 기록이 멈췄어요. 이어서 달리거나 지금까지의 기록을 저장할 수 있어요.
        </div>
      )}
      <GpsBanner run={run} />
      {(run.maxGapSec ?? 0) >= 30 && (
        <div className="mt-2 flex items-start gap-2 rounded-app bg-warn/10 p-3 text-[12px] leading-snug text-text-2">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
          기록 중 위치가 최대 {run.maxGapSec}초 동안 끊겼어요(그 구간은 직선으로 이어져요). 휴대폰 설정 → 앱 →
          오운완 → 배터리를 &lsquo;제한 없음&rsquo;으로 바꾸면 화면이 꺼져도 끊기지 않아요.
        </div>
      )}

      <div className="pt-4 text-center">
        <div className="text-[64px] font-black leading-none tracking-tight tabular-nums">
          {fmtKm(run.distanceM)}
        </div>
        <div className="mt-1 text-sm font-semibold text-text-3">킬로미터</div>
        {run.status === "paused" && (
          <div className="mt-2 inline-block rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-text-2">
            일시정지됨
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <Stat label="시간" value={fmtClock(sec)} />
        <Stat label="평균 페이스" value={fmtPace(avgPace)} />
        <Stat label="현재 페이스" value={fmtPace(curPace)} />
      </div>
      {run.stepsOk && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <Stat label="케이던스(걸음/분)" value={cadence != null ? String(Math.round(cadence)) : "--"} />
          <Stat label="걸음" value={Math.round(run.steps ?? 0).toLocaleString("ko-KR")} />
        </div>
      )}

      {run.route.length > 0 && (
        <Card className="mt-5 p-3">
          <RunMap route={run.route} live={run.status === "running"} className="h-56 w-full overflow-hidden rounded-lg" />
        </Card>
      )}

      {run.splits.length > 0 && (
        <Card className="mt-4 divide-y divide-border">
          {run.splits.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-semibold text-text-2">{i + 1}km</span>
              <span className="font-bold tabular-nums">{fmtPace(s)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app bg-surface p-3 border border-border">
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-text-3">{label}</div>
    </div>
  );
}

function GpsBanner({ run }: { run: RunState }) {
  if (run.gpsError === "denied") {
    return (
      <div className="mt-2 rounded-app bg-danger/10 p-3 text-[13px] text-text-2">
        📍 위치 권한이 꺼져 있어요. 휴대폰 설정 → 앱 → 오운완(또는 브라우저) → 권한에서 위치를
        &lsquo;허용&rsquo;으로 바꿔 주세요.
        {gpsKeepsRunningInBackground() && (
          <button
            onClick={() => void openLocationSettings()}
            className="mt-2 block rounded-full bg-danger px-3 py-1.5 text-xs font-bold text-white"
          >
            권한 설정 열기
          </button>
        )}
      </div>
    );
  }
  if (run.gpsError === "unavailable" && run.accuracy == null) {
    return (
      <div className="mt-2 rounded-app bg-danger/10 p-3 text-[13px] text-text-2">
        📍 위치를 가져올 수 없어요. 휴대폰의 위치(GPS)가 켜져 있는지 확인해 주세요.
      </div>
    );
  }
  const acc = run.accuracy;
  const label =
    acc == null ? "GPS 찾는 중…" : acc <= 10 ? "GPS 좋음" : acc <= 30 ? "GPS 보통" : "GPS 약함";
  const tone =
    acc == null ? "text-text-3" : acc <= 10 ? "text-brand" : acc <= 30 ? "text-warn" : "text-danger";
  return (
    <div className="mt-2 flex justify-center">
      <span className={cn("flex items-center gap-1 text-xs font-bold", tone)}>
        <Satellite size={13} /> {label}
        {acc != null && <span className="font-medium text-text-3">(±{Math.round(acc)}m)</span>}
      </span>
    </div>
  );
}
