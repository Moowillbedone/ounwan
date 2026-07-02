"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Plus,
  Scale,
  Dumbbell,
  Trash2,
  Copy,
  ClipboardPaste,
  CalendarArrowDown,
} from "lucide-react";
import { Sheet, Button, Chip, EmptyState, IconButton, useToast, useConfirm } from "./ui";
import { LabelField } from "./label-field";
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
import { fmtNum, fmtWeight, relativeDayLabel, dateKeyToDate, uid, todayKey } from "@/lib/utils";
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
  const [moveTarget, setMoveTarget] = useState<WorkoutSession | null>(null);
  const [moveDate, setMoveDate] = useState<string>(() => todayKey());

  // 대상 날짜의 다음 세션 인덱스(기존 max+1) — 이동/붙여넣기로 갭이 생겨도 충돌 없음
  const nextIndexForDate = (date: string, excludeId?: string) => {
    const idxs = (sessions ?? [])
      .filter((s) => s.date === date && s.id !== excludeId)
      .map((s) => s.sessionIndexOfDay);
    return (idxs.length ? Math.max(...idxs) : 0) + 1;
  };

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
      label: s.label ?? null,
      labelColor: s.labelColor ?? null,
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

  const openMove = (s: WorkoutSession) => {
    setMoveTarget(s);
    setMoveDate(todayKey());
  };

  const doMove = async () => {
    if (!moveTarget || !moveDate) return;
    if (moveDate === moveTarget.date) {
      toast("이미 그 날짜예요");
      setMoveTarget(null);
      return;
    }
    await saveSession.mutateAsync({
      ...moveTarget,
      date: moveDate,
      sessionIndexOfDay: nextIndexForDate(moveDate, moveTarget.id),
    });
    const dd = dateKeyToDate(moveDate);
    toast(`${dd.getMonth() + 1}월 ${dd.getDate()}일로 이동했어요`);
    setMoveTarget(null);
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
    if (!clip || !dateKey) return;
    const idx = nextIndexForDate(dateKey);
    const base = newEmptySession(dateKey, idx);
    base.startedAt = null;
    base.title = clip.title || "복사한 운동";
    base.label = clip.label ?? null;
    base.labelColor = clip.labelColor ?? null;
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
    <>
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
              onMove={() => openMove(s)}
              onDelete={() => doDelete(s)}
              onSetLabel={(label) => saveSession.mutate({ ...s, label: label || null })}
              onSetLabelColor={(color) => saveSession.mutate({ ...s, labelColor: color })}
            />
          ))}
        </div>
      )}
    </Sheet>

    <Sheet
      open={!!moveTarget}
      onClose={() => setMoveTarget(null)}
      title="다른 날짜로 이동"
      footer={
        <Button size="lg" className="w-full" onClick={doMove}>
          <CalendarArrowDown size={20} /> 여기로 이동
        </Button>
      }
    >
      <p className="mb-3 text-sm text-text-3">
        복사가 아니라 <b className="text-text-2">이동</b>이에요. 원래 날짜에서는
        사라지고 선택한 날짜로 옮겨져요.
      </p>
      {moveTarget && (
        <div className="mb-4 rounded-app border border-border bg-surface-2 px-3 py-2.5 text-sm">
          <div className="font-semibold">
            {moveTarget.title ||
              moveTarget.bodyParts.join("·") ||
              `${moveTarget.exercises.length}개 운동`}
          </div>
          <div className="mt-0.5 text-xs text-text-3">
            {(() => {
              const d = dateKeyToDate(moveTarget.date);
              return `현재 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            })()}
          </div>
        </div>
      )}
      <label className="mb-1 block text-sm font-semibold text-text-2">
        이동할 날짜
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={moveDate}
          onChange={(e) => setMoveDate(e.target.value)}
          className="flex-1 rounded-app border border-border bg-surface px-3 py-3 text-base"
        />
        <Button variant="soft" onClick={() => setMoveDate(todayKey())}>
          오늘
        </Button>
      </div>
    </Sheet>
    </>
  );
}

export function SessionSummaryCard({
  session,
  exName,
  unit,
  onOpen,
  onCopy,
  onMove,
  onDelete,
  onSetLabel,
  onSetLabelColor,
}: {
  session: WorkoutSession;
  exName: (id: string) => string;
  unit: "kg" | "lb";
  onOpen?: () => void;
  onCopy?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onSetLabel?: (label: string) => void;
  onSetLabelColor?: (color: string) => void;
}) {
  return (
    <div className="rounded-app border border-border bg-surface p-4">
      {onSetLabel && (
        <div className="mb-2">
          <LabelField
            value={session.label}
            color={session.labelColor}
            onChangeLabel={(v) => onSetLabel(v)}
            onChangeColor={(c) => onSetLabelColor?.(c)}
            placeholder="라벨 (예: 상체A) — 캘린더에 표시"
          />
        </div>
      )}
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
        {onMove && (
          <IconButton onClick={onMove} aria-label="다른 날짜로 이동" className="h-9 w-9 shrink-0">
            <CalendarArrowDown size={17} />
          </IconButton>
        )}
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
