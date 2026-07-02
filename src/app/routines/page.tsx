"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Pencil, Trash2, Dumbbell, Sparkles } from "lucide-react";
import { Button, EmptyState, useToast, useConfirm } from "@/components/ui";
import { RoutineEditor } from "@/components/routine-editor";
import {
  useRoutines,
  useExercises,
  useSaveRoutine,
  useDeleteRoutine,
  useCreateExercise,
} from "@/lib/hooks";
import { BODY_PART_META } from "@/lib/constants";
import type { Routine, Exercise, BodyPart } from "@/lib/types";

/* ---------- 추천 분할 루틴 (사용자 설계 기반) ---------- */
const FOAM = "__foam_roller__"; // 폼롤러 스트레칭(커스텀 생성 대상)

interface SplitDay {
  name: string;
  emoji: string;
  slugs: string[];
}
interface SplitTemplate {
  key: string;
  title: string;
  emoji: string;
  dayLabels: string[];
  desc: string;
  days: SplitDay[];
}

const SPLITS: SplitTemplate[] = [
  {
    key: "no-split",
    title: "무분할",
    emoji: "🗓️",
    dayLabels: ["전신"],
    desc: "하루에 전신을 다 하는 구성",
    days: [
      {
        name: "무분할",
        emoji: "🗓️",
        slugs: [FOAM, "bench-press", "barbell-row", "military-press", "back-squat", "deadlift", "lying-leg-raise"],
      },
    ],
  },
  {
    key: "2-split",
    title: "2분할",
    emoji: "💪",
    dayLabels: ["상체", "하체"],
    desc: "상체 / 하체 번갈아",
    days: [
      {
        name: "2분할 · 상체",
        emoji: "💪",
        slugs: [FOAM, "cable-crossover", "bench-press", "straight-arm-pulldown", "barbell-row", "face-pull", "military-press", "side-lateral-raise", "barbell-curl", "skull-crusher"],
      },
      {
        name: "2분할 · 하체",
        emoji: "🦵",
        slugs: [FOAM, "leg-extension", "lying-leg-curl", "back-squat", "deadlift", "hip-thrust", "hanging-leg-raise"],
      },
    ],
  },
  {
    key: "3-split",
    title: "3분할",
    emoji: "🔥",
    dayLabels: ["가슴·등", "어깨·팔", "하체"],
    desc: "3일에 나눠서",
    days: [
      {
        name: "3분할 · 가슴·등",
        emoji: "🔥",
        slugs: [FOAM, "cable-crossover", "bench-press", "incline-bench-press", "chest-dips", "straight-arm-pulldown", "lat-pulldown", "barbell-row", "pull-up"],
      },
      {
        name: "3분할 · 어깨·팔",
        emoji: "💪",
        slugs: [FOAM, "face-pull", "military-press", "side-lateral-raise", "bent-over-lateral-raise", "barbell-curl", "hammer-curl", "skull-crusher", "triceps-pushdown"],
      },
      {
        name: "3분할 · 하체",
        emoji: "🦵",
        slugs: [FOAM, "leg-extension", "lying-leg-curl", "back-squat", "deadlift", "hip-thrust", "hanging-leg-raise"],
      },
    ],
  },
];

export default function RoutinesPage() {
  const router = useRouter();
  const { data: routines } = useRoutines();
  const { data: exercises } = useExercises();
  const saveRoutine = useSaveRoutine();
  const delRoutine = useDeleteRoutine();
  const createEx = useCreateExercise();
  const toast = useToast();
  const confirm = useConfirm();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const exMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    (exercises ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [exercises]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (r: Routine) => {
    setEditing(r);
    setEditorOpen(true);
  };

  const ensureFoam = async (): Promise<string> => {
    const existing = (exercises ?? []).find((e) => e.nameKo === "폼롤러 스트레칭");
    if (existing) return existing.id;
    const created = await createEx.mutateAsync({
      nameKo: "폼롤러 스트레칭",
      nameEn: "Foam Roller Stretch",
      bodyPart: "전신",
      primaryMuscle: "전신",
      secondaryMuscles: [],
      equipment: "기타",
      category: "stretching",
      isCompound: false,
      defaultRestSeconds: 0,
      unilateral: false,
    });
    return created.id;
  };

  const addSplit = async (sp: SplitTemplate) => {
    setAdding(sp.key);
    try {
      const foamId = await ensureFoam();
      const resolve = (slug: string): string | null =>
        slug === FOAM ? foamId : exMap.has(slug) ? slug : null;
      for (const day of sp.days) {
        const dayExercises = day.slugs
          .map((s) => {
            const id = resolve(s);
            return id ? { exerciseId: id, targetSets: s === FOAM ? 1 : 3 } : null;
          })
          .filter(Boolean) as { exerciseId: string; targetSets: number }[];
        await saveRoutine.mutateAsync({ name: day.name, emoji: day.emoji, exercises: dayExercises });
      }
      toast(`‘${sp.title}’ 루틴 ${sp.days.length}개가 추가됐어요`);
    } finally {
      setAdding(null);
    }
  };

  const list = routines ?? [];

  return (
    <div className="px-4 pt-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black">루틴</h1>
        {list.length > 0 && (
          <Button size="sm" onClick={openNew}>
            <Plus size={18} /> 새 루틴
          </Button>
        )}
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon={<Dumbbell size={40} />}
          title="아직 루틴이 없어요"
          desc="아래 추천 분할로 시작하거나, 직접 만들어보세요."
          action={
            <Button onClick={openNew}>
              <Plus size={18} /> 새 루틴 만들기
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 mb-6">
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
                  <span className="text-2xl shrink-0">{r.emoji ?? "🔥"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{r.name}</div>
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
                  <Button className="flex-1" onClick={() => router.push(`/log?routine=${r.id}`)}>
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

      {/* 추천 분할 루틴 (항상 노출) */}
      <div className="mt-2">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text-2">
          <Sparkles size={16} className="text-brand" /> 추천 분할 루틴
        </div>
        <div className="space-y-2">
          {SPLITS.map((sp) => (
            <button
              key={sp.key}
              onClick={() => addSplit(sp)}
              disabled={adding !== null}
              className="flex w-full items-center gap-3 rounded-app border border-border bg-surface p-3 text-left active:scale-[0.99] disabled:opacity-50"
            >
              <span className="text-2xl shrink-0">{sp.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 font-bold">
                  {sp.title}
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-3">
                    루틴 {sp.days.length}개
                  </span>
                </span>
                <span className="block text-xs text-text-3 truncate">
                  {sp.dayLabels.join(" · ")} · {sp.desc}
                </span>
              </span>
              <Plus size={18} className="text-brand shrink-0" />
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-text-3">
          분할을 누르면 해당 요일 루틴이 한 번에 추가돼요. (2분할=2개, 3분할=3개) 추가 후
          운동·세트는 자유롭게 편집할 수 있어요.
        </p>
      </div>

      <RoutineEditor open={editorOpen} routine={editing} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
