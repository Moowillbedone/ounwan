"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  Plus,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Dumbbell,
  Minus,
  Timer,
  Pencil,
  History,
} from "lucide-react";
import { Button, IconButton, Sheet, useToast, EmptyState, cn } from "./ui";
import { LabelField } from "./label-field";
import { ExercisePicker } from "./exercise-picker";
import { startRest } from "@/lib/rest-timer";
import { useSaveSession, useProfile, useUpdateProfile, useExerciseMap } from "@/lib/hooks";
import { armFeedback } from "@/lib/feedback";
import * as repo from "@/lib/repo";
import {
  uid,
  nowISO,
  todayKey,
  estimate1RM,
  setsVolume,
  fmtWeight,
  fmtNum,
  fmtDuration,
  toDisplayWeight,
  fromDisplayWeight,
  relativeDayLabel,
} from "@/lib/utils";
import type {
  WorkoutSession,
  SessionExercise,
  WorkoutSet,
  Unit,
  Exercise,
  TrackingMode,
} from "@/lib/types";

const MEMO_MAX = 30;
const REST_PRESETS = [
  0, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540, 600,
];
const MODE_LABEL: Record<TrackingMode, string> = {
  weight_reps: "중량 + 횟수",
  reps: "횟수만",
  time: "시간만",
};

const SET_TYPES: {
  value: WorkoutSet["setType"];
  label: string;
  desc: string;
  badge: string;
  color: string;
}[] = [
  { value: "working", label: "본세트", desc: "정식 세트 · 볼륨에 집계돼요", badge: "●", color: "var(--brand)" },
  { value: "warmup", label: "웜업 (W)", desc: "준비운동 · 볼륨 집계에서 제외돼요", badge: "W", color: "var(--warn)" },
  { value: "drop", label: "드랍셋 (D)", desc: "무게를 줄여 곧바로 이어가는 세트", badge: "D", color: "var(--bp-arms)" },
  { value: "failure", label: "실패셋 (F)", desc: "더 못 들 때까지 수행한 세트", badge: "F", color: "var(--danger)" },
];

function defaultModeFor(category?: string): TrackingMode {
  if (category === "cardio" || category === "stretching") return "time";
  if (category === "bodyweight") return "reps";
  return "weight_reps";
}
function effectiveRest(ex: SessionExercise, exercise?: Exercise): number {
  return ex.restSeconds != null ? ex.restSeconds : exercise?.defaultRestSeconds ?? 90;
}

export function LogScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const saveSession = useSaveSession();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const exMap = useExerciseMap();
  const unit: Unit = profile?.unit ?? "kg";

  // 종목별 공유 메모(exerciseId→메모): 같은 종목이면 날짜가 달라도 연동
  const exerciseNotes = profile?.exerciseNotes ?? {};
  const commitExerciseNote = (exerciseId: string, text: string) => {
    const t = text.trim();
    const cur = profile?.exerciseNotes ?? {};
    if ((cur[exerciseId] ?? "") === t) return;
    const next = { ...cur };
    if (t) next[exerciseId] = t;
    else delete next[exerciseId];
    updateProfile.mutate({ exerciseNotes: next });
  };

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const lastPerf = useRef<Record<string, { exercise: SessionExercise; date: string }>>({});
  const prBest = useRef<Record<string, number>>({});
  const [, forceTick] = useState(0);

  const idParam = params.get("id");
  const dateParam = params.get("date");
  const routineParam = params.get("routine");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (idParam) {
        const s = await repo.getSession(idParam);
        if (s && alive) {
          setSession(s);
          await primeHistory(s.exercises.map((e) => e.exerciseId), idParam);
        }
        return;
      }
      const date = dateParam || todayKey();
      const existing = await repo.getSessionsByDate(date);
      const idx = existing.length + 1;
      const s = repo.newEmptySession(date, idx);
      if (routineParam) {
        const r = await repo.getRoutine(routineParam);
        if (r) {
          s.title = r.name;
          s.routineId = r.id;
          const exs: SessionExercise[] = [];
          for (let i = 0; i < r.exercises.length; i++) {
            const ref = r.exercises[i];
            const meta = await repo.getExercise(ref.exerciseId);
            const lp = await repo.getLastPerformance(ref.exerciseId);
            if (lp)
              lastPerf.current[ref.exerciseId] = {
                exercise: lp.exercise,
                date: lp.session.date,
              };
            exs.push(
              buildExercise(
                ref.exerciseId,
                i,
                lp?.exercise,
                ref.targetSets,
                defaultModeFor(meta?.category)
              )
            );
          }
          s.exercises = exs;
        }
      }
      if (alive) setSession(s);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, dateParam, routineParam]);

  async function primeHistory(exerciseIds: string[], excludeId?: string) {
    for (const eid of exerciseIds) {
      if (!lastPerf.current[eid]) {
        const lp = await repo.getLastPerformance(eid, excludeId);
        if (lp) lastPerf.current[eid] = { exercise: lp.exercise, date: lp.session.date };
      }
      if (prBest.current[eid] === undefined) {
        const pr = await repo.getPersonalRecord(eid);
        prBest.current[eid] = pr?.best1RM ?? 0;
      }
    }
    forceTick((n) => n + 1);
  }

  // 자동 저장(디바운스)
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session || session.exercises.length === 0) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => saveSession.mutate(session), 700);
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    const iv = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const update = useCallback((fn: (s: WorkoutSession) => WorkoutSession) => {
    setSession((prev) => (prev ? fn(prev) : prev));
  }, []);

  const addExercises = async (ids: string[]) => {
    await primeHistory(ids);
    update((s) => {
      const base = s.exercises.length;
      const added = ids.map((eid, i) =>
        buildExercise(
          eid,
          base + i,
          lastPerf.current[eid]?.exercise,
          undefined,
          defaultModeFor(exMap.get(eid)?.category)
        )
      );
      return { ...s, exercises: [...s.exercises, ...added] };
    });
  };

  const patchExercise = (exId: string, patch: Partial<SessionExercise>) =>
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) => (e.id !== exId ? e : { ...e, ...patch })),
    }));

  const removeExercise = (exId: string) =>
    update((s) => ({
      ...s,
      exercises: s.exercises
        .filter((e) => e.id !== exId)
        .map((e, i) => ({ ...e, orderIndex: i })),
    }));

  // 운동 순서 변경(위/아래로 한 칸)
  const moveExercise = (exId: string, dir: -1 | 1) =>
    update((s) => {
      const sorted = [...s.exercises].sort((a, b) => a.orderIndex - b.orderIndex);
      const i = sorted.findIndex((e) => e.id === exId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return s;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      return { ...s, exercises: sorted.map((e, idx) => ({ ...e, orderIndex: idx })) };
    });

  // 이 종목의 '가장 최근 실제 수행'(완료 세트가 있는 최신 세션)을 현재 세트에 불러오기
  const loadLatest = async (exId: string, exerciseId: string) => {
    // 현재 세션 제외(로드 중이라 session이 아직 null일 수 있어 idParam도 함께)
    const lp = await repo.getLastPerformance(exerciseId, idParam || session?.id);
    if (!lp) {
      toast("이 종목의 최근 실제 기록이 없어요");
      return;
    }
    const src = lp.exercise;
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id !== exId
          ? e
          : {
              ...e,
              trackingMode: src.trackingMode ?? e.trackingMode,
              restSeconds: src.restSeconds ?? e.restSeconds,
              sets: src.sets.map((st) => ({
                id: uid(),
                setType: st.setType,
                weight: st.weight,
                reps: st.reps,
                durationSec: st.durationSec ?? null,
                restSeconds: st.restSeconds ?? null,
                isCompleted: false,
              })),
            }
      ),
    }));
    toast(
      `${exMap.get(exerciseId)?.nameKo ?? "운동"} · ${relativeDayLabel(
        lp.session.date
      )} 기록을 불러왔어요`
    );
  };

  const patchSet = (exId: string, setId: string, patch: Partial<WorkoutSet>) =>
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id !== exId
          ? e
          : { ...e, sets: e.sets.map((st) => (st.id === setId ? { ...st, ...patch } : st)) }
      ),
    }));

  const addSet = (exId: string) =>
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) => {
        if (e.id !== exId) return e;
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [
            ...e.sets,
            {
              id: uid(),
              setType: "working",
              weight: last?.weight ?? 0,
              reps: last?.reps ?? 0,
              durationSec: last?.durationSec ?? (e.trackingMode === "time" ? 0 : null),
              restSeconds: last?.restSeconds ?? null,
              isCompleted: false,
            },
          ],
        };
      }),
    }));

  const removeSet = (exId: string, setId: string) =>
    update((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id !== exId ? e : { ...e, sets: e.sets.filter((st) => st.id !== setId) }
      ),
    }));

  const toggleComplete = (exId: string, setId: string) => {
    const ex = session?.exercises.find((e) => e.id === exId);
    const st = ex?.sets.find((x) => x.id === setId);
    if (!ex || !st) return;
    const nextCompleted = !st.isCompleted;
    patchSet(exId, setId, {
      isCompleted: nextCompleted,
      completedAt: nextCompleted ? nowISO() : null,
    });
    if (nextCompleted) {
      update((s) => (s.startedAt ? s : { ...s, startedAt: nowISO() }));
      armFeedback(); // 제스처 안에서 오디오 언락(휴식 종료음 대비)
      const meta = exMap.get(ex.exerciseId);
      // 이 세트에 개별 휴식이 지정돼 있으면 우선, 없으면 종목 기본 휴식
      const rest = st.restSeconds != null ? st.restSeconds : effectiveRest(ex, meta);
      // 전역 휴식 타이머 시작 → 화면 이동/재진입에도 유지·알람
      if (rest > 0)
        startRest(rest, profile?.restSound ?? "chime", profile?.restAlert !== false);
      // PR은 '중량+횟수' 방식만
      const mode = ex.trackingMode ?? "weight_reps";
      if (mode === "weight_reps" && st.weight > 0 && st.reps > 0) {
        const oneRM = estimate1RM(st.weight, st.reps);
        const prev = prBest.current[ex.exerciseId] ?? 0;
        if (oneRM > prev + 0.01 && prev > 0) {
          prBest.current[ex.exerciseId] = oneRM;
          toast(`${meta?.nameKo ?? "운동"} 신기록! 추정 1RM ${Math.round(oneRM)}kg`, "pr");
        } else if (prev === 0) {
          prBest.current[ex.exerciseId] = oneRM;
        }
      }
    }
  };

  const startWorkout = () => update((s) => ({ ...s, startedAt: nowISO() }));

  // 완료된 운동을 이어서: 완료 시점까지의 경과시간에서 이어서 진행
  const resumeWorkout = () => {
    update((s) => {
      const st = s.startedAt ? new Date(s.startedAt).getTime() : Date.now();
      const en = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      const frozenMs = Math.max(0, en - st);
      return {
        ...s,
        startedAt: new Date(Date.now() - frozenMs).toISOString(),
        endedAt: null,
      };
    });
    setResumeOpen(false);
  };

  const finish = () => {
    if (session && session.exercises.length > 0) {
      const stamps = session.exercises
        .flatMap((e) => e.sets)
        .filter((x) => x.isCompleted && x.completedAt)
        .map((x) => x.completedAt as string)
        .sort();
      const startedAt = session.startedAt ?? stamps[0] ?? nowISO();
      saveSession.mutate({ ...session, startedAt, endedAt: nowISO() });
    }
    router.push("/");
  };

  const close = () => {
    if (session && session.exercises.length > 0) saveSession.mutate(session);
    router.back();
  };

  if (!session) return <div className="p-6 text-text-3">불러오는 중…</div>;

  const liveVolume = session.exercises.reduce(
    (n, e) =>
      n + (e.trackingMode && e.trackingMode !== "weight_reps" ? 0 : setsVolume(e.sets)),
    0
  );
  const liveSets = session.exercises.reduce(
    (n, e) => n + e.sets.filter((x) => x.isCompleted).length,
    0
  );
  const startedMs = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const endedMs = session.endedAt ? new Date(session.endedAt).getTime() : null;
  const notStarted = startedMs === null;
  const finished = startedMs !== null && endedMs !== null; // 완료됨 → 시간 고정
  const ticking = startedMs !== null && endedMs === null; // 진행 중 → 흐름
  const elapsedSec =
    startedMs !== null
      ? Math.max(
          0,
          Math.floor(((finished ? (endedMs as number) : Date.now()) - startedMs) / 1000)
        )
      : 0;

  return (
    <div className="min-h-dvh pb-40">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface/95 px-2 py-2 backdrop-blur-md">
        <IconButton onClick={close} aria-label="닫기">
          <X size={22} />
        </IconButton>
        <div className="flex-1 min-w-0">
          <input
            value={session.title ?? ""}
            onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
            placeholder={`${relativeDayLabel(session.date)} 운동`}
            className="w-full bg-transparent text-base font-bold outline-none placeholder:text-text-3"
          />
          <div className="flex gap-3 text-xs text-text-3">
            <span className={cn("tabular-nums", ticking && "text-brand font-semibold")}>
              {notStarted
                ? "시작 전"
                : `⏱ ${fmtDuration(elapsedSec)}${finished ? " · 완료" : ""}`}
            </span>
            <span>볼륨 {fmtNum(liveVolume)}</span>
            <span>{liveSets}세트</span>
          </div>
        </div>
        {notStarted && (
          <Button size="sm" onClick={startWorkout} disabled={session.exercises.length === 0}>
            운동 시작
          </Button>
        )}
        {ticking && (
          <Button size="sm" onClick={finish}>
            운동 완료
          </Button>
        )}
        {finished && (
          <Button size="sm" variant="secondary" onClick={() => setResumeOpen(true)}>
            운동 이어서
          </Button>
        )}
      </header>

      <div className="px-3 pt-3 space-y-3">
        {/* 캘린더 라벨 */}
        <LabelField
          value={session.label}
          color={session.labelColor}
          onChangeLabel={(v) => update((s) => ({ ...s, label: v }))}
          onChangeColor={(c) => update((s) => ({ ...s, labelColor: c }))}
          placeholder="캘린더 라벨 (예: 상체A)"
        />

        {session.exercises.length === 0 && (
          <EmptyState
            icon={<Dumbbell size={40} />}
            title="운동을 추가해 시작하세요"
            desc="지난 기록이 있으면 무게·횟수까지 자동으로 불러와요."
          />
        )}

        {session.exercises
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((ex, i, arr) => (
            <ExerciseLogCard
              key={ex.id}
              ex={ex}
              exercise={exMap.get(ex.exerciseId)}
              unit={unit}
              lastPerf={lastPerf.current[ex.exerciseId]}
              note={exerciseNotes[ex.exerciseId] ?? ex.note ?? ""}
              onCommitNote={(t) => commitExerciseNote(ex.exerciseId, t)}
              isFirst={i === 0}
              isLast={i === arr.length - 1}
              onMoveUp={() => moveExercise(ex.id, -1)}
              onMoveDown={() => moveExercise(ex.id, 1)}
              onPatchSet={(setId, patch) => patchSet(ex.id, setId, patch)}
              onPatchExercise={(patch) => patchExercise(ex.id, patch)}
              onLoadLatest={() => loadLatest(ex.id, ex.exerciseId)}
              onToggle={(setId) => toggleComplete(ex.id, setId)}
              onAddSet={() => addSet(ex.id)}
              onRemoveSet={(setId) => removeSet(ex.id, setId)}
              onRemoveExercise={() => removeExercise(ex.id)}
            />
          ))}

        <Button
          variant="secondary"
          size="lg"
          onClick={() => setPickerOpen(true)}
          className="mt-1"
        >
          <Plus size={20} /> 운동 추가
        </Button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={addExercises}
      />
      <Sheet open={resumeOpen} onClose={() => setResumeOpen(false)} title="운동 이어서 하기">
        <p className="text-sm leading-relaxed text-text-2">
          이 운동은 이미 <b>완료</b>됐어요. 완료 시점의 시간(⏱ {fmtDuration(elapsedSec)})에서
          이어서 다시 시작할까요?
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setResumeOpen(false)}>
            취소
          </Button>
          <Button className="flex-1" onClick={resumeWorkout}>
            이어서 하기
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ---------- 헬퍼 ---------- */

function buildExercise(
  exerciseId: string,
  orderIndex: number,
  prevEx?: SessionExercise,
  targetSets?: number,
  defaultMode: TrackingMode = "weight_reps"
): SessionExercise {
  const mode = prevEx?.trackingMode ?? defaultMode;
  let sets: WorkoutSet[];
  if (prevEx && prevEx.sets.length > 0) {
    sets = prevEx.sets.map((s) => ({
      id: uid(),
      setType: s.setType,
      weight: s.weight,
      reps: s.reps,
      durationSec: s.durationSec ?? null,
      restSeconds: s.restSeconds ?? null,
      isCompleted: false,
    }));
  } else {
    const n = targetSets && targetSets > 0 ? targetSets : 1;
    sets = Array.from({ length: n }, () => ({
      id: uid(),
      setType: "working" as const,
      weight: 0,
      reps: 0,
      durationSec: mode === "time" ? 0 : null,
      isCompleted: false,
    }));
  }
  return {
    id: uid(),
    exerciseId,
    orderIndex,
    trackingMode: mode,
    restSeconds: prevEx?.restSeconds ?? null,
    note: null,
    sets,
  };
}

function prevSummaryText(
  prevEx: SessionExercise | undefined,
  mode: TrackingMode,
  unit: Unit
): string | null {
  if (!prevEx) return null;
  const working = prevEx.sets.filter((s) => s.setType !== "warmup");
  if (working.length === 0) return null;
  const parts = working.slice(0, 4).map((s) => {
    if (mode === "time") return fmtDuration(s.durationSec ?? 0);
    if (mode === "reps") return `${s.reps}회`;
    return `${fmtWeight(s.weight, unit).replace(unit, "")}×${s.reps}`;
  });
  return parts.join(", ");
}

/* ---------- 운동 카드 ---------- */

function ExerciseLogCard({
  ex,
  exercise,
  unit,
  lastPerf,
  note,
  onCommitNote,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onPatchSet,
  onPatchExercise,
  onLoadLatest,
  onToggle,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  ex: SessionExercise;
  exercise?: Exercise;
  unit: Unit;
  lastPerf?: { exercise: SessionExercise; date: string };
  note: string;
  onCommitNote: (text: string) => void;
  onLoadLatest: () => void;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatchSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onPatchExercise: (patch: Partial<SessionExercise>) => void;
  onToggle: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [restTab, setRestTab] = useState<"all" | "perset">("all");
  const [restSetId, setRestSetId] = useState<string | null>(null);
  // 종목 공유 메모: 입력 중엔 로컬, blur 시 커밋. 외부(다른 날짜/기기)에서 바뀌면 동기화
  const [memo, setMemo] = useState(note);
  useEffect(() => setMemo(note), [note]);
  const mode: TrackingMode = ex.trackingMode ?? "weight_reps";
  const rest = effectiveRest(ex, exercise);
  const prevSummary = prevSummaryText(lastPerf?.exercise, mode, unit);

  const cols =
    mode === "weight_reps"
      ? "grid-cols-[26px_1fr_1fr_40px]"
      : "grid-cols-[26px_1fr_40px]";

  return (
    <div className="rounded-app border border-border bg-surface shadow-[var(--shadow-card)]">
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 px-3 pt-3">
        <div className="flex shrink-0 flex-col -my-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="위로 이동"
            className="grid h-5 w-6 place-items-center rounded text-text-3 active:text-brand disabled:opacity-20"
          >
            <ChevronUp size={17} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="아래로 이동"
            className="grid h-5 w-6 place-items-center rounded text-text-3 active:text-brand disabled:opacity-20"
          >
            <ChevronDown size={17} />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{exercise?.nameKo ?? "운동"}</div>
          {prevSummary && (
            <div className="text-[11px] text-text-3 truncate">
              지난 {relativeDayLabel(lastPerf!.date)} · {prevSummary}
            </div>
          )}
        </div>
        {/* 휴식 시간 칩 */}
        <button
          onClick={() => setRestOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 h-8 text-xs font-semibold text-text-2 active:scale-95"
        >
          <Timer size={14} className="text-brand" />
          {rest === 0 ? "휴식 끔" : fmtDuration(rest)}
        </button>
        <div className="relative shrink-0">
          <IconButton onClick={() => setMenu((m) => !m)} aria-label="메뉴" className="h-8 w-8">
            <MoreVertical size={18} />
          </IconButton>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
                <button
                  onClick={() => {
                    onLoadLatest();
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                >
                  <History size={15} className="text-brand" /> 최신 기록 불러오기
                </button>
                <div className="my-1 border-t border-border" />
                <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold text-text-3">
                  기록 방식
                </div>
                {(Object.keys(MODE_LABEL) as TrackingMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onPatchExercise({ trackingMode: m });
                      setMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                  >
                    {MODE_LABEL[m]}
                    {mode === m && <Check size={15} className="text-brand" />}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  onClick={() => {
                    onRemoveExercise();
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-surface-2"
                >
                  <Trash2 size={15} /> 운동 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 메모 */}
      <div className="px-3 pt-1.5 pb-1">
        <div className="flex items-center gap-1.5 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
          <Pencil size={13} className="shrink-0 text-text-3" />
          <input
            value={memo}
            maxLength={MEMO_MAX}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => onCommitNote(memo)}
            placeholder="메모 (같은 종목끼리 공유 · 예: 견갑 고정)"
            className="w-full bg-transparent text-xs text-text-2 outline-none placeholder:text-text-3/70"
          />
          {memo && (
            <span className="shrink-0 text-[10px] tabular-nums text-text-3/60">
              {memo.length}/{MEMO_MAX}
            </span>
          )}
        </div>
      </div>

      {/* 세트 헤더 */}
      <div className={cn("grid items-center gap-1 px-3 pb-1 text-[11px] font-semibold text-text-3", cols)}>
        <span className="text-center">세트</span>
        {mode === "weight_reps" && (
          <>
            <span className="text-center">{unit.toUpperCase()}</span>
            <span className="text-center">횟수</span>
          </>
        )}
        {mode === "reps" && <span className="text-center">횟수</span>}
        {mode === "time" && <span className="text-center">시간 (분·초)</span>}
        <span />
      </div>

      <div className="px-2 pb-2">
        {ex.sets.map((st, i) => (
          <SetRow
            key={st.id}
            index={i + 1}
            set={st}
            prev={lastPerf?.exercise.sets[i]}
            unit={unit}
            mode={mode}
            cols={cols}
            onPatch={(patch) => onPatchSet(st.id, patch)}
            onToggle={() => onToggle(st.id)}
            onRemove={() => onRemoveSet(st.id)}
          />
        ))}
        <button
          onClick={onAddSet}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold text-text-2 hover:bg-surface-2"
        >
          <Plus size={16} /> 세트 추가
        </button>
      </div>

      {/* 휴식시간 선택 시트 — 전체 / 세트별 */}
      <Sheet open={restOpen} onClose={() => setRestOpen(false)} title="휴식 시간">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
          {(["all", "perset"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setRestTab(t);
                if (t === "perset" && !restSetId) setRestSetId(ex.sets[0]?.id ?? null);
              }}
              className={cn(
                "h-8 rounded-full text-sm font-semibold transition",
                restTab === t
                  ? "bg-surface text-brand shadow-[var(--shadow-card)]"
                  : "text-text-3"
              )}
            >
              {t === "all" ? "전체" : "세트별"}
            </button>
          ))}
        </div>

        {restTab === "all" ? (
          <>
            <p className="mb-3 text-sm text-text-3">
              세트 완료 후 자동으로 시작할 <b className="text-text-2">공통 휴식</b>이에요.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {REST_PRESETS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => {
                    onPatchExercise({ restSeconds: sec });
                    setRestOpen(false);
                  }}
                  className={cn(
                    "h-12 rounded-app border text-sm font-bold transition",
                    rest === sec
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-border text-text-2"
                  )}
                >
                  {sec === 0 ? "끄기" : fmtDuration(sec)}
                </button>
              ))}
            </div>
          </>
        ) : (
          (() => {
            const targetId =
              ex.sets.find((s) => s.id === restSetId)?.id ?? ex.sets[0]?.id ?? null;
            const target = ex.sets.find((s) => s.id === targetId);
            const cur = target?.restSeconds ?? null;
            const targetIdx = ex.sets.findIndex((s) => s.id === targetId) + 1;
            return (
              <>
                <p className="mb-3 text-sm text-text-3">
                  특정 세트만 다른 휴식을 줄 수 있어요. 지정 안 한 세트는{" "}
                  <b className="text-text-2">{rest === 0 ? "휴식 끔" : fmtDuration(rest)}</b>
                  (전체)을 따라요.
                </p>
                {/* 세트 선택 */}
                <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                  {ex.sets.map((s, i) => {
                    const custom = s.restSeconds != null;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setRestSetId(s.id)}
                        className={cn(
                          "relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border font-bold transition",
                          s.id === targetId
                            ? "border-brand bg-brand-soft text-brand-strong"
                            : "border-border text-text-2"
                        )}
                      >
                        {custom && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />
                        )}
                        <span className="text-sm leading-none">{i + 1}</span>
                        <span className="mt-1 text-[9px] font-semibold leading-none text-text-3">
                          {custom ? fmtDuration(s.restSeconds!) : "기본"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* 선택 세트 휴식 프리셋 */}
                {targetId && (
                  <>
                    <div className="mb-2 text-xs font-bold text-text-2">
                      {targetIdx}세트 휴식
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => onPatchSet(targetId, { restSeconds: null })}
                        className={cn(
                          "h-12 rounded-app border text-sm font-bold transition",
                          cur === null
                            ? "border-brand bg-brand-soft text-brand-strong"
                            : "border-border text-text-2"
                        )}
                      >
                        기본값
                      </button>
                      {REST_PRESETS.map((sec) => (
                        <button
                          key={sec}
                          onClick={() => onPatchSet(targetId, { restSeconds: sec })}
                          className={cn(
                            "h-12 rounded-app border text-sm font-bold transition",
                            cur === sec
                              ? "border-brand bg-brand-soft text-brand-strong"
                              : "border-border text-text-2"
                          )}
                        >
                          {sec === 0 ? "끄기" : fmtDuration(sec)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()
        )}
      </Sheet>
    </div>
  );
}

/* ---------- 세트 행 ---------- */

function SetRow({
  index,
  set,
  prev,
  unit,
  mode,
  cols,
  onPatch,
  onToggle,
  onRemove,
}: {
  index: number;
  set: WorkoutSet;
  prev?: WorkoutSet;
  unit: Unit;
  mode: TrackingMode;
  cols: string;
  onPatch: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const step = unit === "lb" ? 5 : 2.5;

  const weightField = (
    <Stepper
      value={set.weight > 0 ? String(toDisplayWeight(set.weight, unit)) : ""}
      placeholder={prev && prev.weight > 0 ? String(toDisplayWeight(prev.weight, unit)) : "0"}
      decimal
      onInput={(v) => {
        const n = parseFloat(v);
        onPatch({ weight: isNaN(n) ? 0 : fromDisplayWeight(n, unit) });
      }}
      onBump={(dir) => {
        const cur =
          set.weight > 0
            ? toDisplayWeight(set.weight, unit)
            : prev
            ? toDisplayWeight(prev.weight, unit)
            : 0;
        const next = Math.max(0, Math.round((cur + dir * step) * 100) / 100);
        onPatch({ weight: fromDisplayWeight(next, unit) });
      }}
    />
  );
  const repsField = (
    <Stepper
      value={set.reps > 0 ? String(set.reps) : ""}
      placeholder={prev && prev.reps > 0 ? String(prev.reps) : "0"}
      onInput={(v) => {
        const n = parseInt(v, 10);
        onPatch({ reps: isNaN(n) ? 0 : Math.max(0, n) });
      }}
      onBump={(dir) => onPatch({ reps: Math.max(0, set.reps + dir) })}
    />
  );
  const dur = set.durationSec ?? 0;
  const prevDur = prev?.durationSec ?? 0;
  const timeInputCls =
    "h-9 w-full min-w-0 rounded-md bg-surface-2 text-center text-[15px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40 placeholder:text-text-3/60";
  const timeField = (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        value={dur > 0 ? String(Math.floor(dur / 60)) : ""}
        placeholder={prevDur > 0 ? String(Math.floor(prevDur / 60)) : "0"}
        onChange={(e) => {
          const m = Math.max(0, parseInt(e.target.value, 10) || 0);
          onPatch({ durationSec: m * 60 + (dur % 60) });
        }}
        className={timeInputCls}
      />
      <span className="shrink-0 text-xs text-text-3">분</span>
      <input
        type="number"
        inputMode="numeric"
        value={dur > 0 ? String(dur % 60) : ""}
        placeholder={prevDur > 0 ? String(prevDur % 60) : "0"}
        onChange={(e) => {
          const s = Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0));
          onPatch({ durationSec: Math.floor(dur / 60) * 60 + s });
        }}
        className={timeInputCls}
      />
      <span className="shrink-0 text-xs text-text-3">초</span>
    </div>
  );

  return (
    <>
    <div
      className={cn(
        "grid items-center gap-1 rounded-lg py-1 transition",
        cols,
        set.isCompleted && "bg-brand-soft/60"
      )}
    >
      <button
        onClick={() => setOptionsOpen(true)}
        className="relative grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-text-2 active:bg-surface-2"
        title="세트 유형 · 삭제"
      >
        {set.restSeconds != null && (
          <span
            className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-brand"
            title={`이 세트 휴식 ${set.restSeconds === 0 ? "끔" : fmtDuration(set.restSeconds)}`}
          />
        )}
        {set.setType === "working" ? (
          index
        ) : (
          <span
            className={cn(
              "text-[11px]",
              set.setType === "warmup" && "text-warn",
              set.setType === "drop" && "text-bp-arms",
              set.setType === "failure" && "text-danger"
            )}
          >
            {set.setType === "warmup" ? "W" : set.setType === "drop" ? "D" : "F"}
          </span>
        )}
      </button>

      {mode === "weight_reps" && (
        <>
          {weightField}
          {repsField}
        </>
      )}
      {mode === "reps" && repsField}
      {mode === "time" && timeField}

      <div className="flex items-center justify-center">
        <button
          onClick={onToggle}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border-2 transition active:scale-90",
            set.isCompleted ? "border-brand bg-brand text-white" : "border-border text-text-3"
          )}
          aria-label="세트 완료"
        >
          <Check size={16} strokeWidth={3} />
        </button>
      </div>
    </div>

    <Sheet
      open={optionsOpen}
      onClose={() => setOptionsOpen(false)}
      title={`${index}세트 설정`}
    >
      <div className="mb-2 text-sm font-bold text-text-2">세트 유형</div>
      <div className="space-y-1.5">
        {SET_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              onPatch({ setType: t.value });
              setOptionsOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-app border p-3 text-left transition",
              set.setType === t.value ? "border-brand bg-brand-soft/50" : "border-border"
            )}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
              style={{
                background: `color-mix(in srgb, ${t.color} 18%, transparent)`,
                color: t.color,
              }}
            >
              {t.badge}
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t.label}</span>
              <span className="block text-xs text-text-3">{t.desc}</span>
            </span>
            {set.setType === t.value && <Check size={16} className="text-brand" />}
          </button>
        ))}
      </div>
      <Button
        variant="danger"
        size="lg"
        className="mt-4"
        onClick={() => {
          onRemove();
          setOptionsOpen(false);
        }}
      >
        <Trash2 size={18} /> 이 세트 삭제
      </Button>
    </Sheet>
    </>
  );
}

function Stepper({
  value,
  placeholder,
  decimal,
  onInput,
  onBump,
}: {
  value: string;
  placeholder: string;
  decimal?: boolean;
  onInput: (v: string) => void;
  onBump: (dir: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onBump(-1)}
        tabIndex={-1}
        className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
      >
        <Minus size={13} />
      </button>
      <input
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full min-w-0 rounded-md bg-surface-2 text-center text-[15px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40 placeholder:text-text-3/60"
      />
      <button
        onClick={() => onBump(1)}
        tabIndex={-1}
        className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
