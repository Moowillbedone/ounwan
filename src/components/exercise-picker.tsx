"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Check } from "lucide-react";
import { Sheet, Button, cn } from "./ui";
import { useExercises, useCreateExercise } from "@/lib/hooks";
import { BODY_PARTS, BODY_PART_META, EQUIPMENTS } from "@/lib/constants";
import type { BodyPart, Exercise } from "@/lib/types";

export function ExercisePicker({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (exerciseIds: string[]) => void;
}) {
  const { data: exercises } = useExercises();
  const [q, setQ] = useState("");
  const [part, setPart] = useState<BodyPart | "전체">("전체");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const list = (exercises ?? []).filter((e) => {
      if (part !== "전체" && e.bodyPart !== part) return false;
      if (q) {
        const t = q.toLowerCase();
        return (
          e.nameKo.toLowerCase().includes(t) ||
          e.nameEn.toLowerCase().includes(t) ||
          e.primaryMuscle.includes(q)
        );
      }
      return true;
    });
    return list;
  }, [exercises, q, part]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const confirm = () => {
    if (selected.length === 0) return;
    onConfirm(selected);
    setSelected([]);
    setQ("");
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={() => {
          setSelected([]);
          onClose();
        }}
        title="운동 추가"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setCreating(true)}
            >
              <Plus size={18} /> 새 운동 종목
            </Button>
            <Button
              className="flex-1"
              onClick={confirm}
              disabled={selected.length === 0}
            >
              {selected.length > 0 ? `${selected.length}개 추가` : "선택하세요"}
            </Button>
          </div>
        }
      >
        {/* 검색 */}
        <div className="sticky top-0 z-10 -mx-5 px-5 pb-2 bg-surface">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
            />
            <input
              autoFocus
              placeholder="운동 검색 (예: 벤치, 스쿼트)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-11 rounded-app border border-border bg-surface-2 pl-11 pr-3 text-[15px] outline-none focus:border-brand"
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {(["전체", ...BODY_PARTS] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPart(p)}
                className={cn(
                  "shrink-0 h-8 px-3 rounded-full text-sm font-semibold transition",
                  part === p
                    ? "bg-brand text-white"
                    : "bg-surface-2 text-text-3"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 목록 */}
        <div className="space-y-1 pt-1">
          {filtered.map((e) => {
            const on = selected.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => toggle(e.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-app p-2.5 text-left transition",
                  on ? "bg-brand-soft" : "hover:bg-surface-2"
                )}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${BODY_PART_META[e.bodyPart].color} 18%, transparent)`,
                    color: BODY_PART_META[e.bodyPart].color,
                  }}
                >
                  {e.bodyPart[0]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">
                    {e.nameKo}
                    {!e.isBuiltIn && (
                      <span className="ml-1 text-[10px] text-brand">내 운동</span>
                    )}
                  </span>
                  <span className="block text-xs text-text-3 truncate">
                    {e.equipment} · {e.primaryMuscle}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2 transition shrink-0",
                    on ? "border-brand bg-brand text-white" : "border-border"
                  )}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-text-3">
              검색 결과가 없어요.
              <br />
              <button
                onClick={() => setCreating(true)}
                className="mt-2 font-semibold text-brand"
              >
                “{q}” 새 운동으로 추가
              </button>
            </div>
          )}
        </div>
      </Sheet>

      <CreateExerciseSheet
        open={creating}
        defaultName={q}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setSelected((s) => [...s, id]);
        }}
      />
    </>
  );
}

function CreateExerciseSheet({
  open,
  defaultName,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createEx = useCreateExercise();
  const [name, setName] = useState(defaultName);
  const [part, setPart] = useState<BodyPart>("가슴");
  const [equip, setEquip] = useState<Exercise["equipment"]>("바벨");

  const submit = async () => {
    if (!name.trim()) return;
    const ex = await createEx.mutateAsync({
      nameKo: name.trim(),
      nameEn: name.trim(),
      bodyPart: part,
      primaryMuscle: part,
      secondaryMuscles: [],
      equipment: equip,
      category: part === "유산소" ? "cardio" : "strength",
      isCompound: false,
      defaultRestSeconds: part === "유산소" ? 0 : 90,
      unilateral: false,
    });
    onCreated(ex.id);
    setName("");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="내 운동 만들기"
      footer={
        <Button size="lg" onClick={submit} disabled={!name.trim()}>
          만들기
        </Button>
      }
    >
      <label className="block text-sm font-semibold text-text-2 mb-1">운동 이름</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="예: 케이블 풀오버"
        className="w-full h-12 rounded-app border border-border bg-surface-2 px-3 text-[15px] outline-none focus:border-brand"
      />
      <label className="block text-sm font-semibold text-text-2 mt-4 mb-1.5">부위</label>
      <div className="flex flex-wrap gap-1.5">
        {BODY_PARTS.map((p) => (
          <button
            key={p}
            onClick={() => setPart(p)}
            className={cn(
              "h-8 px-3 rounded-full text-sm font-semibold",
              part === p ? "bg-brand text-white" : "bg-surface-2 text-text-3"
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <label className="block text-sm font-semibold text-text-2 mt-4 mb-1.5">장비</label>
      <div className="flex flex-wrap gap-1.5">
        {EQUIPMENTS.map((eq) => (
          <button
            key={eq}
            onClick={() => setEquip(eq)}
            className={cn(
              "h-8 px-3 rounded-full text-sm font-semibold",
              equip === eq ? "bg-brand text-white" : "bg-surface-2 text-text-3"
            )}
          >
            {eq}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
