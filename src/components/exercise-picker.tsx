"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Check, Link2 } from "lucide-react";
import { Sheet, Button, cn } from "./ui";
import {
  useExercises,
  useCreateExercise,
  useProfile,
  useUpdateProfile,
} from "@/lib/hooks";
import { BODY_PARTS, BODY_PART_META, EQUIPMENTS } from "@/lib/constants";
import { STANDARD_OPTIONS, standardNameKo } from "@/lib/strength-standards";
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
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(defaultName);
  const [part, setPart] = useState<BodyPart>("가슴");
  const [equip, setEquip] = useState<Exercise["equipment"]>("바벨");
  // 직접 만든 종목은 기준표(LIFT_KEYS)에 없어 수준 비교에서 빠진다 →
  // 만들 때 바로 연결해두면 첫 기록부터 비교된다.
  const [stdKey, setStdKey] = useState<string | null>(null);
  const [stdOpen, setStdOpen] = useState(false);

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
    if (stdKey) {
      updateProfile.mutate({
        exerciseStandards: { ...(profile?.exerciseStandards ?? {}), [ex.id]: stdKey },
      });
    }
    onCreated(ex.id);
    setName("");
    setStdKey(null);
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

      <label className="mt-4 mb-1.5 block text-sm font-semibold text-text-2">
        근력 기준표 연결 <span className="text-xs font-normal text-text-3">(선택)</span>
      </label>
      <button
        onClick={() => setStdOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-app border px-3 py-2.5 text-left transition",
          stdKey ? "border-brand bg-brand-soft/40" : "border-border"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Link2 size={15} className={stdKey ? "text-brand" : "text-text-3"} />
          <span className="truncate">
            {stdKey ? standardNameKo(stdKey) : "연결 안 함"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-text-3">
          {stdOpen ? "닫기" : "고르기"}
        </span>
      </button>
      <p className="mt-1 text-[11px] leading-snug text-text-3">
        동작이 사실상 같은 기준 종목에 연결하면 분석 탭 <b>수준 비교</b>에 잡혀요.
      </p>
      {stdOpen && (
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-app border border-border p-1.5">
          <button
            onClick={() => {
              setStdKey(null);
              setStdOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm",
              stdKey === null ? "bg-brand-soft/50 font-semibold" : "text-text-2"
            )}
          >
            연결 안 함
            {stdKey === null && <Check size={15} className="text-brand" />}
          </button>
          {STANDARD_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                setStdKey(o.key);
                setStdOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm",
                stdKey === o.key ? "bg-brand-soft/50 font-semibold" : "text-text-2"
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{o.nameKo}</span>
                {o.lowConfidence && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-text-3">
                    참고
                  </span>
                )}
              </span>
              {stdKey === o.key && <Check size={15} className="shrink-0 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
