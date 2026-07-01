"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Play, ListPlus } from "lucide-react";
import { Sheet, Button } from "./ui";
import { useRoutines, useExerciseMap } from "@/lib/hooks";
import { RoutineEditor } from "./routine-editor";

export function StartWorkoutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: routines } = useRoutines();
  const exMap = useExerciseMap();
  const [editorOpen, setEditorOpen] = useState(false);

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="운동 시작"
        footer={
          <Button size="lg" variant="secondary" onClick={() => setEditorOpen(true)}>
            <ListPlus size={18} /> 새 루틴 만들기
          </Button>
        }
      >
        {/* 빈 운동 */}
        <button
          onClick={() => go("/log")}
          className="flex w-full items-center gap-3 rounded-app border border-brand/30 bg-brand-soft/50 p-4 text-left active:scale-[0.99] transition"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white">
            <Dumbbell size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-bold">빈 운동으로 시작</span>
            <span className="block text-xs text-text-3">
              운동을 그때그때 추가하며 기록
            </span>
          </span>
        </button>

        {/* 내 루틴 */}
        <div className="mt-5 mb-2 text-xs font-bold text-text-3">
          내 루틴으로 시작
        </div>
        {routines && routines.length > 0 ? (
          <div className="space-y-2">
            {routines.map((r) => (
              <button
                key={r.id}
                onClick={() => go(`/log?routine=${r.id}`)}
                className="flex w-full items-center gap-3 rounded-app border border-border bg-surface p-3 text-left active:scale-[0.99] transition"
              >
                <span className="text-2xl">{r.emoji ?? "🔥"}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{r.name}</span>
                  <span className="block text-xs text-text-3 truncate">
                    {r.exercises
                      .map((e) => exMap.get(e.exerciseId)?.nameKo)
                      .filter(Boolean)
                      .join(" · ") || "운동 없음"}
                  </span>
                </span>
                <Play size={18} className="text-brand shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-app bg-surface-2 p-4 text-sm text-text-3">
            저장된 루틴이 없어요. 아래 <b>새 루틴 만들기</b>로 자주 하는 운동을 묶어두면
            다음부터 한 번에 불러올 수 있어요.
          </p>
        )}
      </Sheet>

      <RoutineEditor
        open={editorOpen}
        routine={null}
        onClose={() => setEditorOpen(false)}
      />
    </>
  );
}
