"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight, Plus, Scale, Dumbbell } from "lucide-react";
import { Sheet, Button, Chip, EmptyState } from "./ui";
import { useSessions, useBodyMetrics, useExerciseMap, useProfile } from "@/lib/hooks";
import { BODY_PART_META } from "@/lib/constants";
import { fmtNum, fmtWeight, relativeDayLabel, dateKeyToDate } from "@/lib/utils";
import type { WorkoutSession } from "@/lib/types";

export function DayDetailSheet({
  dateKey,
  onClose,
}: {
  dateKey: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: sessions } = useSessions();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const exMap = useExerciseMap();
  const unit = profile?.unit ?? "kg";

  const daySessions = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.date === dateKey)
        .sort((a, b) => a.sessionIndexOfDay - b.sessionIndexOfDay),
    [sessions, dateKey]
  );
  const bw = useMemo(
    () => (metrics ?? []).find((m) => m.date === dateKey)?.weight ?? null,
    [metrics, dateKey]
  );

  if (!dateKey) return null;
  const d = dateKeyToDate(dateKey);
  const title = `${d.getMonth() + 1}월 ${d.getDate()}일 (${
    ["일", "월", "화", "수", "목", "금", "토"][d.getDay()]
  })`;

  return (
    <Sheet
      open={!!dateKey}
      onClose={onClose}
      title={
        <span className="flex items-baseline gap-2">
          {title}
          <span className="text-sm font-medium text-text-3">
            {relativeDayLabel(dateKey)}
          </span>
        </span>
      }
      footer={
        <Button
          size="lg"
          onClick={() => router.push(`/log?date=${dateKey}`)}
        >
          <Plus size={20} /> 이 날 운동 추가
        </Button>
      }
    >
      {bw != null && (
        <div className="mb-3 flex items-center gap-2 text-sm text-text-2">
          <Scale size={16} className="text-text-3" />
          체중 <b className="text-text">{fmtWeight(bw, unit)}</b>
        </div>
      )}

      {daySessions.length === 0 ? (
        <EmptyState
          icon={<Dumbbell size={40} />}
          title="아직 기록이 없어요"
          desc="이 날의 운동을 추가해보세요."
        />
      ) : (
        <div className="space-y-3">
          {daySessions.map((s) => (
            <SessionSummaryCard
              key={s.id}
              session={s}
              exName={(id) => exMap.get(id)?.nameKo ?? "운동"}
              unit={unit}
              onClick={() => router.push(`/log?id=${s.id}`)}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function SessionSummaryCard({
  session,
  exName,
  unit,
  onClick,
}: {
  session: WorkoutSession;
  exName: (id: string) => string;
  unit: "kg" | "lb";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-app border border-border bg-surface p-4 text-left active:scale-[0.99] transition"
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {session.title && (
            <span className="font-bold">{session.title}</span>
          )}
          {session.bodyParts.map((bp) => (
            <Chip key={bp} color={BODY_PART_META[bp].color}>
              {bp}
            </Chip>
          ))}
          {session.bodyParts.length === 0 && (
            <span className="text-sm text-text-3">기록 중…</span>
          )}
        </div>
        <ChevronRight size={18} className="text-text-3 shrink-0" />
      </div>

      <div className="mt-2 flex gap-4 text-sm text-text-2">
        <span>
          볼륨 <b className="text-text">{fmtNum(session.totalVolume)}</b>
          <span className="text-text-3">{unit === "lb" ? "lb·" : "kg·"}회</span>
        </span>
        <span>
          세트 <b className="text-text">{session.totalSets}</b>
        </span>
        <span className="text-text-3">
          운동 {session.exercises.length}개
        </span>
      </div>

      <div className="mt-2 text-xs text-text-3 line-clamp-1">
        {session.exercises.map((e) => exName(e.exerciseId)).join(" · ") || "—"}
      </div>
    </button>
  );
}
