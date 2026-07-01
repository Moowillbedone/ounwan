"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Pencil, Trash2, Dumbbell, Sparkles } from "lucide-react";
import { Button, EmptyState, useToast, useConfirm, cn } from "@/components/ui";
import { RoutineEditor } from "@/components/routine-editor";
import { useRoutines, useExercises, useSaveRoutine, useDeleteRoutine } from "@/lib/hooks";
import { BODY_PART_META } from "@/lib/constants";
import type { Routine, Exercise, BodyPart } from "@/lib/types";

export default function RoutinesPage() {
  const router = useRouter();
  const { data: routines } = useRoutines();
  const { data: exercises } = useExercises();
  const saveRoutine = useSaveRoutine();
  const delRoutine = useDeleteRoutine();
  const toast = useToast();
  const confirm = useConfirm();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);

  const exMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    (exercises ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [exercises]);

  const starters = useMemo(
    () => buildStarters(exercises ?? []),
    [exercises]
  );

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (r: Routine) => {
    setEditing(r);
    setEditorOpen(true);
  };

  const addStarter = async (s: StarterTemplate) => {
    await saveRoutine.mutateAsync({
      name: s.name,
      emoji: s.emoji,
      exercises: s.exerciseIds.map((id) => ({ exerciseId: id, targetSets: 3 })),
    });
    toast(`‘${s.name}’ 루틴이 추가됐어요`);
  };

  const list = routines ?? [];

  return (
    <div className="px-4 pt-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black">루틴</h1>
        <Button size="sm" onClick={openNew}>
          <Plus size={18} /> 새 루틴
        </Button>
      </header>

      {list.length === 0 ? (
        <>
          <EmptyState
            icon={<Dumbbell size={40} />}
            title="아직 루틴이 없어요"
            desc="자주 하는 운동을 루틴으로 저장하면, 다음엔 한 번에 불러와요."
            action={
              <Button onClick={openNew}>
                <Plus size={18} /> 직접 만들기
              </Button>
            }
          />
          {starters.length > 0 && (
            <div className="mt-2">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text-2">
                <Sparkles size={16} className="text-brand" /> 추천 루틴으로 빠르게 시작
              </div>
              <div className="space-y-2">
                {starters.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => addStarter(s)}
                    className="flex w-full items-center gap-3 rounded-app border border-border bg-surface p-3 text-left active:scale-[0.99]"
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <span className="flex-1">
                      <span className="block font-bold">{s.name}</span>
                      <span className="block text-xs text-text-3 truncate">
                        {s.exerciseIds
                          .map((id) => exMap.get(id)?.nameKo)
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Plus size={18} className="text-brand shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const parts = [
              ...new Set(
                r.exercises
                  .map((e) => exMap.get(e.exerciseId)?.bodyPart)
                  .filter(Boolean) as BodyPart[]
              ),
            ];
            return (
              <div
                key={r.id}
                className="rounded-app border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{r.emoji ?? "🔥"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{r.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {parts.map((bp) => (
                        <span
                          key={bp}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${BODY_PART_META[bp].color} 15%, transparent)`,
                            color: BODY_PART_META[bp].color,
                          }}
                        >
                          {bp}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1.5 text-xs text-text-3 line-clamp-1">
                      {r.exercises
                        .map((e) => exMap.get(e.exerciseId)?.nameKo)
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => router.push(`/log?routine=${r.id}`)}
                  >
                    <Play size={16} /> 이 루틴으로 시작
                  </Button>
                  <Button variant="secondary" onClick={() => openEdit(r)} aria-label="편집">
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (confirm(`‘${r.name}’ 루틴을 삭제할까요?`)) {
                        await delRoutine.mutateAsync(r.id);
                        toast("삭제됨");
                      }
                    }}
                    aria-label="삭제"
                    className="text-danger"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RoutineEditor
        open={editorOpen}
        routine={editing}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

/* ---- 추천 스타터 루틴 (라이브러리에서 복합운동 자동 선별) ---- */
interface StarterTemplate {
  name: string;
  emoji: string;
  exerciseIds: string[];
}

function buildStarters(exercises: Exercise[]): StarterTemplate[] {
  if (exercises.length === 0) return [];
  const pick = (
    parts: BodyPart[],
    n: number,
    opts: { compound?: boolean; muscle?: string } = {}
  ): string[] => {
    const match = (e: Exercise) =>
      parts.includes(e.bodyPart) &&
      (opts.compound ? e.isCompound : true) &&
      (opts.muscle ? e.primaryMuscle.includes(opts.muscle) : true);
    const pool = exercises.filter(match);
    const fallback = exercises.filter(
      (e) => parts.includes(e.bodyPart) && (opts.muscle ? e.primaryMuscle.includes(opts.muscle) : true)
    );
    const src = pool.length >= n ? pool : fallback.length > 0 ? fallback : exercises.filter((e) => parts.includes(e.bodyPart));
    return src.slice(0, n).map((e) => e.id);
  };
  const templates: StarterTemplate[] = [
    {
      name: "밀기 (가슴·어깨·삼두)",
      emoji: "💪",
      exerciseIds: [
        ...pick(["가슴"], 2, { compound: true }),
        ...pick(["어깨"], 2, { compound: true }),
        ...pick(["팔"], 1, { muscle: "삼두" }),
      ],
    },
    {
      name: "당기기 (등·이두)",
      emoji: "🔙",
      exerciseIds: [
        ...pick(["등"], 3, { compound: true }),
        ...pick(["팔"], 2, { muscle: "이두" }),
      ],
    },
    { name: "하체 데이", emoji: "🦵", exerciseIds: pick(["하체"], 5, { compound: true }) },
  ];
  return templates.filter((t) => t.exerciseIds.length > 0);
}
