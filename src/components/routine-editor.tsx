"use client";

import { useEffect, useState } from "react";
import { Trash2, ChevronUp, ChevronDown, Plus, Minus, CalendarDays } from "lucide-react";
import { Sheet, Button, useToast } from "./ui";
import { ExercisePicker } from "./exercise-picker";
import { useSaveRoutine, useExerciseMap, useSessions } from "@/lib/hooks";
import { BODY_PART_META } from "@/lib/constants";
import { relativeDayLabel } from "@/lib/utils";
import type { Routine, RoutineExerciseRef, WorkoutSession } from "@/lib/types";

const EMOJIS = ["🔥", "💪", "🦵", "🏋️", "⚡", "🎯", "🌅", "🌙", "🏃", "🧘"];

export function RoutineEditor({
  open,
  routine,
  onClose,
}: {
  open: boolean;
  routine: Routine | null; // null = 새 루틴
  onClose: () => void;
}) {
  const saveRoutine = useSaveRoutine();
  const exMap = useExerciseMap();
  const toast = useToast();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔥");
  const [items, setItems] = useState<RoutineExerciseRef[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const { data: sessions } = useSessions();

  useEffect(() => {
    if (open) {
      setName(routine?.name ?? "");
      setEmoji(routine?.emoji ?? "🔥");
      setItems(routine?.exercises ?? []);
    }
  }, [open, routine]);

  const addExercises = (ids: string[]) =>
    setItems((prev) => [
      ...prev,
      ...ids
        .filter((id) => !prev.some((p) => p.exerciseId === id))
        .map((id) => ({ exerciseId: id, targetSets: 3 })),
    ]);

  const move = (i: number, dir: number) =>
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const setTarget = (i: number, delta: number) =>
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i ? { ...it, targetSets: Math.max(1, it.targetSets + delta) } : it
      )
    );

  const remove = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  // 캘린더(과거 세션)에서 운동 구성 불러오기
  const importFromSession = (s: WorkoutSession) => {
    setItems((prev) => {
      const existing = new Set(prev.map((p) => p.exerciseId));
      const added = s.exercises
        .filter((e) => !existing.has(e.exerciseId))
        .map((e) => ({ exerciseId: e.exerciseId, targetSets: Math.max(1, e.sets.length) }));
      return [...prev, ...added];
    });
    if (!name.trim() && (s.label || s.title)) setName((s.label || s.title) as string);
    setCalOpen(false);
    toast(`${s.exercises.length}개 운동을 불러왔어요`);
  };

  const importable = (sessions ?? []).filter((s) => s.exercises.length > 0).slice(0, 40);

  const save = async () => {
    if (!name.trim()) {
      toast("루틴 이름을 입력하세요.", "error");
      return;
    }
    if (items.length === 0) {
      toast("운동을 1개 이상 추가하세요.", "error");
      return;
    }
    await saveRoutine.mutateAsync({
      id: routine?.id,
      createdAt: routine?.createdAt,
      name: name.trim(),
      emoji,
      exercises: items,
    });
    toast("루틴 저장 완료");
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={routine ? "루틴 편집" : "새 루틴"}
        footer={
          <Button size="lg" onClick={save}>
            저장
          </Button>
        }
      >
        <div className="flex gap-2 mb-3">
          <select
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="h-12 w-14 rounded-app border border-border bg-surface-2 text-center text-xl outline-none"
          >
            {EMOJIS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="루틴 이름 (예: 등·이두 데이)"
            className="h-12 flex-1 rounded-app border border-border bg-surface-2 px-3 text-[15px] outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-2">
          {items.map((it, i) => {
            const ex = exMap.get(it.exerciseId);
            return (
              <div
                key={it.exerciseId}
                className="flex items-center gap-2 rounded-app border border-border bg-surface p-2.5"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: ex
                      ? `color-mix(in srgb, ${BODY_PART_META[ex.bodyPart].color} 18%, transparent)`
                      : "var(--surface-2)",
                    color: ex ? BODY_PART_META[ex.bodyPart].color : "var(--text-3)",
                  }}
                >
                  {ex ? ex.bodyPart[0] : "?"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{ex?.nameKo ?? "운동"}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      onClick={() => setTarget(i, -1)}
                      className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-text-2"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-xs text-text-2 tabular-nums w-12 text-center">
                      {it.targetSets}세트
                    </span>
                    <button
                      onClick={() => setTarget(i, 1)}
                      className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-text-2"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col">
                  <button
                    onClick={() => move(i, -1)}
                    className="grid h-6 w-7 place-items-center text-text-3 disabled:opacity-30"
                    disabled={i === 0}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    className="grid h-6 w-7 place-items-center text-text-3 disabled:opacity-30"
                    disabled={i === items.length - 1}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="grid h-8 w-8 place-items-center rounded-full text-danger active:scale-90"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 space-y-2">
          <Button variant="secondary" size="lg" onClick={() => setPickerOpen(true)}>
            <Plus size={18} /> 운동 추가
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setCalOpen(true)}>
            <CalendarDays size={18} /> 캘린더에서 불러오기
          </Button>
        </div>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={addExercises}
      />

      <Sheet open={calOpen} onClose={() => setCalOpen(false)} title="캘린더에서 불러오기">
        <p className="mb-3 text-sm text-text-3">
          과거에 기록한 날의 운동 구성을 그대로 루틴에 불러와요.
        </p>
        {importable.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-3">불러올 기록이 없어요</div>
        ) : (
          <div className="space-y-2">
            {importable.map((s) => (
              <button
                key={s.id}
                onClick={() => importFromSession(s)}
                className="w-full rounded-app border border-border bg-surface p-3 text-left active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">
                    {s.label || s.title || `${relativeDayLabel(s.date)} 운동`}
                  </span>
                  <span className="shrink-0 text-xs text-text-3">
                    {relativeDayLabel(s.date)} · 운동 {s.exercises.length}개
                  </span>
                </div>
                <div className="mt-1 text-xs text-text-3 line-clamp-1">
                  {s.exercises
                    .map((e) => exMap.get(e.exerciseId)?.nameKo)
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
