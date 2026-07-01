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
} from "lucide-react";
import { Button, IconButton, useToast, EmptyState, cn } from "./ui";
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
} from "@/lib/types";

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
  const lastPerf = useRef<Record<string, { sets: WorkoutSet[]; date: string }>>({});
  const prBest = useRef<Record<string, number>>({}); // exerciseId → best 1RM 기존
  const [, forceTick] = useState(0);

  const idParam = params.get("id");
  const dateParam = params.get("date");
  const routineParam = params.get("routine");

  // 초기 세션 구성
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
            const lp = await repo.getLastPerformance(ref.exerciseId);
            if (lp) lastPerf.current[ref.exerciseId] = { sets: lp.sets, date: lp.session.date };
            exs.push(buildExercise(ref.exerciseId, i, lp?.sets, ref.targetSets));
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
        if (lp) lastPerf.current[eid] = { sets: lp.sets, date: lp.session.date };
      }
      if (prBest.current[eid] === undefined) {
        const pr = await repo.getPersonalRecord(eid);
        prBest.current[eid] = pr?.best1RM ?? 0;
      }
    }
    forceTick((n) => n + 1);
  }

  // 자동 저장(디바운스) — 운동이 1개 이상일 때만
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session || session.exercises.length === 0) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      saveSession.mutate(session);
    }, 700);
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // 경과 시간 표시용 tick
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
        buildExercise(eid, base + i, lastPerf.current[eid]?.sets)
      );
      return { ...s, exercises: [...s.exercises, ...added] };
    });
  };

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
          : {
              ...e,
              sets: e.sets.map((st) => (st.id === setId ? { ...st, ...patch } : st)),
            }
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
      // 휴식 타이머
      const meta = exMap.get(ex.exerciseId);
      const rest = meta?.defaultRestSeconds ?? 90;
      if (rest > 0) setRestEndsAt(Date.now() + rest * 1000);
      // PR 체크
      if (st.weight > 0 && st.reps > 0) {
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

  const finish = () => {
    if (session && session.exercises.length > 0) {
      saveSession.mutate({ ...session, endedAt: nowISO() });
    }
    router.push("/");
  };

  const close = () => {
    if (session && session.exercises.length > 0) saveSession.mutate(session);
    router.back();
  };

  if (!session) {
    return <div className="p-6 text-text-3">불러오는 중…</div>;
  }

  const liveVolume = session.exercises.reduce((n, e) => n + setsVolume(e.sets), 0);
  const liveSets = session.exercises.reduce(
    (n, e) => n + e.sets.filter((x) => x.isCompleted).length,
    0
  );
  const elapsedSec = session.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000))
    : 0;

  const d = session.date;

  return (
    <div className="min-h-dvh pb-40">
      {/* 상단바 */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface/95 px-2 py-2 backdrop-blur-md">
        <IconButton onClick={close} aria-label="닫기">
          <X size={22} />
        </IconButton>
        <div className="flex-1 min-w-0">
          <input
            value={session.title ?? ""}
            onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
            placeholder={`${relativeDayLabel(d)} 운동`}
            className="w-full bg-transparent text-base font-bold outline-none placeholder:text-text-3"
          />
          <div className="flex gap-3 text-xs text-text-3">
            <span className="tabular-nums">{fmtDuration(elapsedSec)}</span>
            <span>볼륨 {fmtNum(liveVolume)}</span>
            <span>{liveSets}세트</span>
          </div>
        </div>
        <Button size="sm" onClick={finish}>
          완료
        </Button>
      </header>

      {/* 운동 목록 */}
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
  prevSets?: WorkoutSet[],
  targetSets?: number
): SessionExercise {
  let sets: WorkoutSet[];
  if (prevSets && prevSets.length > 0) {
    sets = prevSets.map((s) => ({
      id: uid(),
      setType: s.setType,
      weight: s.weight,
      reps: s.reps,
      isCompleted: false,
    }));
  } else {
    const n = targetSets && targetSets > 0 ? targetSets : 1;
    sets = Array.from({ length: n }, () => ({
      id: uid(),
      setType: "working" as const,
      weight: 0,
      reps: 0,
      isCompleted: false,
    }));
  }
  return { id: uid(), exerciseId, orderIndex, sets };
}

/* ---------- 운동 카드 ---------- */

function ExerciseLogCard({
  ex,
  exercise,
  unit,
  lastPerf,
  onPatchSet,
  onToggle,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  ex: SessionExercise;
  exercise?: Exercise;
  unit: Unit;
  lastPerf?: { sets: WorkoutSet[]; date: string };
  onPatchSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onToggle: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const isCardio = exercise?.category === "cardio";
  const prevSummary = lastPerf
    ? lastPerf.sets
        .filter((s) => s.setType !== "warmup")
        .slice(0, 4)
        .map((s) => `${fmtWeight(s.weight, unit).replace(unit, "")}×${s.reps}`)
        .join(", ")
    : null;

  return (
    <div className="rounded-app border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
        <GripVertical size={18} className="text-text-3/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{exercise?.nameKo ?? "운동"}</div>
          {prevSummary && (
            <div className="text-[11px] text-text-3 truncate">
              지난 {relativeDayLabel(lastPerf!.date)} · {prevSummary}
            </div>
          )}
        </div>
        <div className="relative">
          <IconButton onClick={() => setMenu((m) => !m)} aria-label="메뉴">
            <MoreVertical size={18} />
          </IconButton>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-10 z-20 w-36 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
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

      {/* 세트 헤더 */}
      <div className="grid grid-cols-[28px_1fr_1fr_44px] items-center gap-1 px-3 pb-1 text-[11px] font-semibold text-text-3">
        <span className="text-center">세트</span>
        <span className="text-center">{isCardio ? "거리/속도" : unit.toUpperCase()}</span>
        <span className="text-center">{isCardio ? "시간(분)" : "횟수"}</span>
        <span></span>
      </div>

      <div className="px-2 pb-2">
        {ex.sets.map((st, i) => (
          <SetRow
            key={st.id}
            index={i + 1}
            set={st}
            prev={lastPerf?.sets[i]}
            unit={unit}
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
    </div>
  );
}

/* ---------- 세트 행 ---------- */

function SetRow({
  index,
  set,
  prev,
  unit,
  onPatch,
  onToggle,
  onRemove,
}: {
  index: number;
  set: WorkoutSet;
  prev?: WorkoutSet;
  unit: Unit;
  onPatch: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const step = unit === "lb" ? 5 : 2.5;
  const dispWeight = set.weight > 0 ? String(toDisplayWeight(set.weight, unit)) : "";
  const prevWeight = prev ? toDisplayWeight(prev.weight, unit) : null;

  const changeWeight = (v: string) => {
    const num = parseFloat(v);
    onPatch({ weight: isNaN(num) ? 0 : fromDisplayWeight(num, unit) });
  };
  const bumpWeight = (dir: number) => {
    const cur = set.weight > 0 ? toDisplayWeight(set.weight, unit) : prevWeight ?? 0;
    const next = Math.max(0, Math.round((cur + dir * step) * 100) / 100);
    onPatch({ weight: fromDisplayWeight(next, unit) });
  };
  const changeReps = (v: string) => {
    const num = parseInt(v, 10);
    onPatch({ reps: isNaN(num) ? 0 : Math.max(0, num) });
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[28px_1fr_1fr_44px] items-center gap-1 rounded-lg py-1 transition",
        set.isCompleted && "bg-brand-soft/60"
      )}
    >
      <button
        onClick={() => {
          if (set.setType === "working") onPatch({ setType: "warmup" });
          else if (set.setType === "warmup") onPatch({ setType: "drop" });
          else if (set.setType === "drop") onPatch({ setType: "failure" });
          else onPatch({ setType: "working" });
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

      {/* 무게 */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => bumpWeight(-1)}
          className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
          tabIndex={-1}
        >
          <Minus size={13} />
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={dispWeight}
          onChange={(e) => changeWeight(e.target.value)}
          placeholder={prevWeight != null ? String(prevWeight) : "0"}
          className="h-9 w-full min-w-0 rounded-md bg-surface-2 text-center text-[15px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40 placeholder:text-text-3/60"
        />
        <button
          onClick={() => bumpWeight(1)}
          className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
          tabIndex={-1}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* 횟수 */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPatch({ reps: Math.max(0, set.reps - 1) })}
          className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
          tabIndex={-1}
        >
          <Minus size={13} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={set.reps > 0 ? String(set.reps) : ""}
          onChange={(e) => changeReps(e.target.value)}
          placeholder={prev ? String(prev.reps) : "0"}
          className="h-9 w-full min-w-0 rounded-md bg-surface-2 text-center text-[15px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40 placeholder:text-text-3/60"
        />
        <button
          onClick={() => onPatch({ reps: set.reps + 1 })}
          className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-3 active:bg-surface-2"
          tabIndex={-1}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* 완료 토글 */}
      <div className="flex items-center justify-center">
        <button
          onClick={onToggle}
          onContextMenu={(e) => {
            e.preventDefault();
            onRemove();
          }}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border-2 transition active:scale-90",
            set.isCompleted
              ? "border-brand bg-brand text-white"
              : "border-border text-text-3"
          )}
          aria-label="세트 완료"
        >
          <Check size={16} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
