"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  Plus,
  Check,
  Trash2,
  GripVertical,
  MoreVertical,
  Dumbbell,
  Minus,
  Timer,
  Pencil,
} from "lucide-react";
import { Button, IconButton, Sheet, useToast, EmptyState, cn } from "./ui";
import { ExercisePicker } from "./exercise-picker";
import { RestTimer } from "./rest-timer";
import { useSaveSession, useProfile, useExerciseMap } from "@/lib/hooks";
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
const REST_PRESETS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
const MODE_LABEL: Record<TrackingMode, string> = {
  weight_reps: "중량 + 횟수",
  reps: "횟수만",
  time: "시간만",
};

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
  const exMap = useExerciseMap();
  const unit: Unit = profile?.unit ?? "kg";

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
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
      const meta = exMap.get(ex.exerciseId);
      const rest = effectiveRest(ex, meta);
      if (rest > 0) setRestEndsAt(Date.now() + rest * 1000);
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
  const elapsedSec = session.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000))
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
            <span
              className={`tabular-nums ${session.startedAt ? "text-brand font-semibold" : ""}`}
            >
              {session.startedAt ? `⏱ ${fmtDuration(elapsedSec)}` : "시작 전"}
            </span>
            <span>볼륨 {fmtNum(liveVolume)}</span>
            <span>{liveSets}세트</span>
          </div>
        </div>
        {session.startedAt ? (
          <Button size="sm" onClick={finish}>
            운동 완료
          </Button>
        ) : (
          <Button size="sm" onClick={startWorkout} disabled={session.exercises.length === 0}>
            운동 시작
          </Button>
        )}
      </header>

      <div className="px-3 pt-3 space-y-3">
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
          .map((ex) => (
            <ExerciseLogCard
              key={ex.id}
              ex={ex}
              exercise={exMap.get(ex.exerciseId)}
              unit={unit}
              lastPerf={lastPerf.current[ex.exerciseId]}
              onPatchSet={(setId, patch) => patchSet(ex.id, setId, patch)}
              onPatchExercise={(patch) => patchExercise(ex.id, patch)}
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
      <RestTimer
        endsAt={restEndsAt}
        setEndsAt={setRestEndsAt}
        onClose={() => setRestEndsAt(null)}
      />
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
  onPatchSet,
  onPatchExercise,
  onToggle,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  ex: SessionExercise;
  exercise?: Exercise;
  unit: Unit;
  lastPerf?: { exercise: SessionExercise; date: string };
  onPatchSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onPatchExercise: (patch: Partial<SessionExercise>) => void;
  onToggle: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
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
        <GripVertical size={18} className="text-text-3/50 shrink-0" />
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
              <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
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
            value={ex.note ?? ""}
            maxLength={MEMO_MAX}
            onChange={(e) => onPatchExercise({ note: e.target.value })}
            placeholder="메모 (예: 견갑 고정, 반동 없이)"
            className="w-full bg-transparent text-xs text-text-2 outline-none placeholder:text-text-3/70"
          />
          {ex.note && (
            <span className="shrink-0 text-[10px] tabular-nums text-text-3/60">
              {ex.note.length}/{MEMO_MAX}
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
        {mode === "time" && <span className="text-center">시간(초)</span>}
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

      {/* 휴식시간 선택 시트 */}
      <Sheet open={restOpen} onClose={() => setRestOpen(false)} title="휴식 시간">
        <p className="mb-3 text-sm text-text-3">
          이 운동의 세트 완료 후 자동으로 시작할 휴식 시간을 정해요.
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
  const timeField = (
    <Stepper
      value={set.durationSec && set.durationSec > 0 ? String(set.durationSec) : ""}
      placeholder={prev?.durationSec ? String(prev.durationSec) : "0"}
      onInput={(v) => {
        const n = parseInt(v, 10);
        onPatch({ durationSec: isNaN(n) ? 0 : Math.max(0, n) });
      }}
      onBump={(dir) => onPatch({ durationSec: Math.max(0, (set.durationSec ?? 0) + dir * 15) })}
    />
  );

  return (
    <div
      className={cn(
        "grid items-center gap-1 rounded-lg py-1 transition",
        cols,
        set.isCompleted && "bg-brand-soft/60"
      )}
    >
      <button
        onClick={() => {
          const order: WorkoutSet["setType"][] = ["working", "warmup", "drop", "failure"];
          const next = order[(order.indexOf(set.setType) + 1) % order.length];
          onPatch({ setType: next });
        }}
        className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-text-2"
        title="세트 유형 변경"
      >
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
          onContextMenu={(e) => {
            e.preventDefault();
            onRemove();
          }}
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
