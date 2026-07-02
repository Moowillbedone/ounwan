"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ChevronRight,
  Plus,
  Scale,
  Dumbbell,
  Trash2,
  Copy,
  ClipboardPaste,
} from "lucide-react";
import { Sheet, Button, Chip, EmptyState, IconButton, useToast, useConfirm } from "./ui";
import {
  useSessions,
  useBodyMetrics,
  useExerciseMap,
  useProfile,
  useDeleteSession,
  useSaveSession,
} from "@/lib/hooks";
import { newEmptySession } from "@/lib/repo";
import { BODY_PART_META } from "@/lib/constants";
import { fmtNum, fmtWeight, relativeDayLabel, dateKeyToDate, uid } from "@/lib/utils";
import {
  useClipboard,
  setClipboard,
  clearClipboard,
} from "@/lib/clipboard";
import type { WorkoutSession } from "@/lib/types";

export function DayDetailSheet({
  dateKey,
  onClose,
}: {
  dateKey: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: sessions } = useSessions();
  const { data: metrics } = useBodyMetrics();
  const { data: profile } = useProfile();
  const exMap = useExerciseMap();
  const delSession = useDeleteSession();
  const saveSession = useSaveSession();
  const clip = useClipboard();
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

  const doCopy = (s: WorkoutSession) => {
    setClipboard({
      sourceDate: s.date,
      title: s.title ?? null,
      exercises: s.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        note: e.note ?? null,
        trackingMode: e.trackingMode,
        restSeconds: e.restSeconds ?? null,
        sets: e.sets.map((x) => ({
          setType: x.setType,
          weight: x.weight,
          reps: x.reps,
          durationSec: x.durationSec ?? null,
          isCompleted: x.isCompleted,
        })),
      })),
    });
    const names = s.exercises
      .map((e) => exMap.get(e.exerciseId)?.nameKo)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    toast(`복사됨 · ${names}${s.exercises.length > 2 ? " 외" : ""} — 다른 날짜에 붙여넣기`);
  };

  const doDelete = async (s: WorkoutSession) => {
    const label =
      s.title ||
      s.bodyParts.join("·") ||
      `${s.exercises.length}개 운동`;
    if (confirm(`이 기록을 삭제할까요?\n(${label})\n삭제하면 되돌릴 수 없어요.`)) {
      await delSession.mutateAsync(s.id);
      toast("삭제됐어요");
    }
  };

  const doPaste = async () => {
    if (!clip) return;
    const idx = daySessions.length + 1;
    const base = newEmptySession(dateKey, idx);
    base.startedAt = null;
    base.title = clip.title || "복사한 운동";
    base.exercises = clip.exercises.map((e, i) => ({
      id: uid(),
      exerciseId: e.exerciseId,
      orderIndex: i,
      note: e.note ?? null,
      trackingMode: e.trackingMode,
      restSeconds: e.restSeconds ?? null,
      sets: e.sets.map((s) => ({
        id: uid(),
        setType: s.setType,
        weight: s.weight,
        reps: s.reps,
        durationSec: s.durationSec ?? null,
        isCompleted: s.isCompleted,
      })),
    }));
    await saveSession.mutateAsync(base);
    toast(`${title.split(" (")[0]}에 붙여넣었어요`);
  };

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
        <div className="space-y-2">
          {clip && (
            <div className="flex items-center gap-2">
              <Button variant="soft" className="flex-1" onClick={doPaste}>
                <ClipboardPaste size={18} /> 복사한 운동 붙여넣기
                {clip.title ? ` (${clip.title})` : ""}
              </Button>
              <IconButton
                onClick={() => {
                  clearClipboard();
                  toast("복사 취소됨");
                }}
                aria-label="복사 취소"
                className="text-text-3"
              >
                <Trash2 size={18} />
              </IconButton>
            </div>
          )}
          <Button size="lg" onClick={() => router.push(`/log?date=${dateKey}`)}>
            <Plus size={20} /> 이 날 운동 추가
          </Button>
        </div>
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
          desc={clip ? "복사한 운동을 붙여넣거나 새로 추가해보세요." : "이 날의 운동을 추가해보세요."}
        />
      ) : (
        <div className="space-y-3">
          {daySessions.map((s) => (
            <SessionSummaryCard
              key={s.id}
              session={s}
              exName={(id) => exMap.get(id)?.nameKo ?? "운동"}
              unit={unit}
              onOpen={() => router.push(`/log?id=${s.id}`)}
              onCopy={() => doCopy(s)}
              onDelete={() => doDelete(s)}
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
  onOpen,
  onCopy,
  onDelete,
}: {
  session: WorkoutSession;
  exName: (id: string) => string;
  unit: "kg" | "lb";
  onOpen?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-app border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="flex flex-1 min-w-0 items-center gap-1.5 text-left">
          <span className="flex flex-wrap items-center gap-1.5 min-w-0">
            {session.title && <span className="font-bold truncate">{session.title}</span>}
            {session.bodyParts.map((bp) => (
              <Chip key={bp} color={BODY_PART_META[bp].color}>
                {bp}
              </Chip>
            ))}
            {session.bodyParts.length === 0 && (
              <span className="text-sm text-text-3">기록 중…</span>
            )}
          </span>
          <ChevronRight size={18} className="text-text-3 shrink-0 ml-auto" />
        </button>
        {onCopy && (
          <IconButton onClick={onCopy} aria-label="복사" className="h-9 w-9 shrink-0">
            <Copy size={17} />
          </IconButton>
        )}
        {onDelete && (
          <IconButton
            onClick={onDelete}
            aria-label="삭제"
            className="h-9 w-9 shrink-0 text-danger hover:bg-danger/10"
          >
            <Trash2 size={17} />
          </IconButton>
        )}
      </div>

      <button onClick={onOpen} className="mt-2 w-full text-left">
        <div className="flex gap-4 text-sm text-text-2">
          <span>
            볼륨 <b className="text-text">{fmtNum(session.totalVolume)}</b>
            <span className="text-text-3">{unit === "lb" ? "lb·회" : "kg·회"}</span>
          </span>
          <span>
            세트 <b className="text-text">{session.totalSets}</b>
          </span>
          <span className="text-text-3">운동 {session.exercises.length}개</span>
        </div>
        <div className="mt-2 text-xs text-text-3 line-clamp-1">
          {session.exercises.map((e) => exName(e.exerciseId)).join(" · ") || "—"}
        </div>
      </button>
    </div>
  );
}
