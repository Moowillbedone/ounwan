"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Play, ListPlus, Settings2, Footprints, Activity } from "lucide-react";
import { Sheet, Button } from "./ui";
import { useRoutines, useExerciseMap } from "@/lib/hooks";
import { RoutineEditor } from "./routine-editor";
import { dateKeyToDate, todayKey } from "@/lib/utils";

/**
 * 운동 시작/추가 시트. date가 있으면 캘린더에서 '이 날 운동 추가'로 연 것 → 그 날짜에 추가.
 * GPS 달리기: 오늘이면 바로 러닝 화면, 다른 날이면 'GPS 러닝' 종목이 든 운동을 만들어 두고
 * 그날 운동 화면에서 측정을 시작한다.
 */
export function StartWorkoutSheet({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date?: string | null;
}) {
  const router = useRouter();
  const { data: routines } = useRoutines();
  const exMap = useExerciseMap();
  const [editorOpen, setEditorOpen] = useState(false);

  const go = (path: string) => {
    onClose();
    router.push(path);
  };
  const forDate = date ?? null;
  const isToday = !forDate || forDate === todayKey();
  const q = forDate ? `date=${forDate}` : "";
  const dd = forDate ? dateKeyToDate(forDate) : null;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={dd && !isToday ? `${dd.getMonth() + 1}월 ${dd.getDate()}일 운동 추가` : "운동 시작"}
        footer={
          <Button size="lg" variant="secondary" onClick={() => setEditorOpen(true)}>
            <ListPlus size={18} /> 새 루틴 만들기
          </Button>
        }
      >
        {/* 빈 운동 */}
        <button
          onClick={() => go(q ? `/log?${q}` : "/log")}
          className="flex w-full items-center gap-3 rounded-app border border-brand/30 bg-brand-soft/50 p-4 text-left active:scale-[0.99] transition"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white">
            <Dumbbell size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-bold">{isToday ? "빈 운동으로 시작" : "빈 운동 추가"}</span>
            <span className="block text-xs text-text-3">
              운동을 그때그때 추가하며 기록
            </span>
          </span>
        </button>

        {/* GPS 달리기 */}
        <button
          onClick={() => go(isToday ? "/run" : `/log?${q}&gps=1`)}
          className="mt-2 flex w-full items-center gap-3 rounded-app border border-border bg-surface p-4 text-left active:scale-[0.99] transition"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Footprints size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-bold">{isToday ? "GPS 달리기 시작" : "GPS 러닝 추가"}</span>
            <span className="block text-xs text-text-3">
              {isToday
                ? "GPS로 거리·페이스·케이던스·1km 구간 기록"
                : "그날 운동 화면에서 'GPS 달리기 시작'을 눌러 측정해요"}
            </span>
          </span>
        </button>

        {/* 실내 러닝(트레드밀) */}
        <button
          onClick={() => go(isToday ? "/run?indoor=1" : `/log?${q}&indoor=1`)}
          className="mt-2 flex w-full items-center gap-3 rounded-app border border-border bg-surface p-4 text-left active:scale-[0.99] transition"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Activity size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-bold">{isToday ? "실내 러닝 시작" : "실내 러닝 추가"}</span>
            <span className="block text-xs text-text-3">
              {isToday
                ? "트레드밀 · 시간·걸음·케이던스, 끝나고 거리 입력"
                : "그날 운동 화면에서 '실내 러닝 시작'을 눌러 측정해요"}
            </span>
          </span>
        </button>

        {/* 내 루틴 */}
        <div className="mt-5 mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-text-3">내 루틴으로 시작</span>
          {routines && routines.length > 0 && (
            <button
              onClick={() => go("/routines")}
              className="flex items-center gap-1 text-xs font-semibold text-text-3 active:text-brand"
            >
              <Settings2 size={13} /> 루틴 관리
            </button>
          )}
        </div>
        {routines && routines.length > 0 ? (
          <div className="space-y-2">
            {routines.map((r) => (
              <button
                key={r.id}
                onClick={() => go(`/log?routine=${r.id}${q ? `&${q}` : ""}`)}
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
