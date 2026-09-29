"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Timer,
  Plus,
  Scale,
  Dumbbell,
  Trash2,
  Copy,
  ClipboardPaste,
  CalendarArrowDown,
  Footprints,
  Combine,
} from "lucide-react";
import { Sheet, Button, Chip, EmptyState, IconButton, useToast, useConfirm, cn } from "./ui";
import { LabelField } from "./label-field";
import { RunHeartRate } from "./health-bits";
import { RunDetail } from "./run-detail";
import { StartWorkoutSheet } from "./start-workout";
import { sessionRuns } from "@/lib/running";
import { mergeSessions } from "@/lib/merge";
import { fmtKm, fmtClock, fmtPace } from "@/lib/run-tracker";
import {
  useSessions,
  useBodyMetrics,
  useExerciseMap,
  useProfile,
  useDeleteSession,
  useSaveSession,
  useUpdateProfile,
} from "@/lib/hooks";
import { newEmptySession } from "@/lib/repo";
import { BODY_PART_META } from "@/lib/constants";
import {
  fmtNum,
  fmtWeight,
  fmtElapsedKo,
  relativeDayLabel,
  dateKeyToDate,
  uid,
  todayKey,
  sessionDistance,
  paceSecPerKm,
} from "@/lib/utils";
import {
  useClipboard,
  setClipboard,
  clearClipboard,
  clipSessions,
  type WorkoutClip,
} from "@/lib/clipboard";
import type { DayLabel, WorkoutSession } from "@/lib/types";

type SessionClip = Omit<WorkoutClip, "day">;

/** 세션 → 클립(복사본). 완료 여부는 담되 붙여넣을 때 초기화한다. */
function toClip(s: WorkoutSession): SessionClip {
  return {
    sourceDate: s.date,
    title: s.title ?? null,
    label: s.label ?? null,
    labelColor: s.labelColor ?? null,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      note: e.note ?? null,
      trackingMode: e.trackingMode,
      restSeconds: e.restSeconds ?? null,
      supersetGroup: e.supersetGroup ?? null,
      gps: e.gps || undefined,
      sets: e.sets.map((x) => ({
        setType: x.setType,
        weight: x.weight,
        reps: x.reps,
        durationSec: x.durationSec ?? null,
        distanceM: x.distanceM ?? null,
        restSeconds: x.restSeconds ?? null,
        isCompleted: x.isCompleted,
      })),
    })),
  };
}

/** 클립 → 새 세션(계획 상태). 복사본 태그 없이 원래 제목·라벨만 유지. */
function fromClip(c: SessionClip, date: string, indexOfDay: number): WorkoutSession {
  const base = newEmptySession(date, indexOfDay);
  base.startedAt = null;
  base.title = c.title && c.title !== "복사한 운동" ? c.title : null;
  base.label = c.label ?? null;
  base.labelColor = c.labelColor ?? null;
  base.exercises = c.exercises.map((e, i) => ({
    id: uid(),
    exerciseId: e.exerciseId,
    orderIndex: i,
    note: e.note ?? null,
    trackingMode: e.trackingMode,
    restSeconds: e.restSeconds ?? null,
    supersetGroup: e.supersetGroup ?? null,
    gps: e.gps || undefined,
    // GPS 러닝은 측정 결과 대신 '측정 전' 상태로
    sets: (e.gps ? [] : e.sets).map((st) => ({
      id: uid(),
      setType: st.setType,
      weight: st.weight,
      reps: st.reps,
      durationSec: st.durationSec ?? null,
      distanceM: st.distanceM ?? null,
      restSeconds: st.restSeconds ?? null,
      isCompleted: false, // 복사 시 '완료' 진행상황은 빼고 계획(무게·횟수·거리·휴식)만
    })),
  }));
  return base;
}

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
  const updateProfile = useUpdateProfile();
  const clip = useClipboard();
  const unit = profile?.unit ?? "kg";
  const [moveTarget, setMoveTarget] = useState<WorkoutSession | null>(null);
  const [moveDate, setMoveDate] = useState<string>(() => todayKey());
  const [addOpen, setAddOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSel, setMergeSel] = useState<string[]>([]);
  const [mergeTitle, setMergeTitle] = useState("");

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

  // 그날의 합계 — 잔디·통계와 동일하게 '운동 종료까지 누른 세션'만 집계한다.
  // 하루 다중 세션이면 시간·볼륨을 모두 합산.
  const dayStats = useMemo(() => {
    let durationSec = 0;
    let volume = 0;
    let doneCount = 0;
    let meters = 0;
    for (const s of daySessions) {
      if (!s.endedAt) continue;
      doneCount++;
      volume += s.totalVolume;
      const dist = sessionDistance(s);
      meters += dist.meters;
      // 타이머 경과시간과, 러닝처럼 직접 입력한 시간 중 긴 쪽(타이머 없이 기록만 입력한 경우 대비)
      const elapsed = s.startedAt
        ? (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
        : 0;
      const d = Math.max(elapsed, dist.sec);
      if (d > 0) durationSec += d;
    }
    return { durationSec, volume, doneCount, meters };
  }, [daySessions]);

  const bw = useMemo(
    () => (metrics ?? []).find((m) => m.date === dateKey)?.weight ?? null,
    [metrics, dateKey]
  );
  // 있는 항목만 칩으로 (운동 시간 · 총 볼륨 · 체중)
  const dayChips = useMemo(() => {
    const out: {
      icon: React.ReactNode;
      label: string;
      value: string;
      sub?: string;
    }[] = [];
    if (dayStats.durationSec > 0)
      out.push({
        icon: <Timer size={13} />,
        label: "운동 시간",
        value: fmtElapsedKo(dayStats.durationSec),
        sub: dayStats.doneCount > 1 ? `${dayStats.doneCount}회 합계` : undefined,
      });
    if (dayStats.meters > 0)
      out.push({
        icon: <Footprints size={13} />,
        label: "거리",
        value: fmtKm(dayStats.meters),
        sub: "km",
      });
    // 러닝만 한 날엔 '볼륨 0'을 굳이 보여주지 않음
    if (dayStats.doneCount > 0 && (dayStats.volume > 0 || dayStats.meters === 0))
      out.push({
        icon: <Dumbbell size={13} />,
        label: "총 볼륨",
        value: fmtNum(dayStats.volume),
        sub: unit === "lb" ? "lb·회" : "kg·회",
      });
    if (bw != null)
      out.push({
        icon: <Scale size={13} />,
        label: "체중",
        value: fmtWeight(bw, unit),
      });
    return out;
  }, [dayStats, bw, unit]);

  if (!dateKey) return null;
  const d = dateKeyToDate(dateKey);
  const title = `${d.getMonth() + 1}월 ${d.getDate()}일 (${
    ["일", "월", "화", "수", "목", "금", "토"][d.getDay()]
  })`;

  const doCopy = (s: WorkoutSession) => {
    setClipboard(toClip(s));
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

  // 하루 대표 라벨(프로필에 날짜별 저장 → 기기 간 동기화)
  const dayLabel: DayLabel | null = dateKey ? profile?.dayLabels?.[dateKey] ?? null : null;
  const setDayLabel = (date: string, patch: Partial<DayLabel>) => {
    const all = { ...(profile?.dayLabels ?? {}) };
    const next: DayLabel = { label: all[date]?.label ?? "", color: all[date]?.color ?? null, ...patch };
    // 라벨을 지우면 항목 삭제(색만 고른 상태는 라벨 입력 전까지 유지)
    if (!next.label && "label" in patch) delete all[date];
    else all[date] = next;
    updateProfile.mutate({ dayLabels: all });
  };

  // 그날 운동 전부 + 대표 라벨을 한 번에 복사
  const doCopyDay = () => {
    if (!dateKey || daySessions.length === 0) return;
    setClipboard({
      sourceDate: dateKey,
      title: null,
      exercises: [],
      day: { sessions: daySessions.map(toClip), dayLabel },
    });
    toast(`하루 전체 복사됨 · 운동 ${daySessions.length}개 — 다른 날짜에 붙여넣기`);
  };

  const sessionName = (s: WorkoutSession) =>
    s.title || s.label || s.bodyParts.join("·") || `${s.exercises.length}개 운동`;

  const openMerge = () => {
    setMergeSel(daySessions.map((s) => s.id));
    setMergeTitle(
      dayLabel?.label ||
        daySessions
          .map((s) => s.title || s.label)
          .filter(Boolean)
          .join(" + ")
    );
    setMergeOpen(true);
  };

  // 선택한 운동들을 하나로(첫 운동에 이어 붙이고 나머지는 삭제)
  const doMerge = async () => {
    const picked = daySessions.filter((s) => mergeSel.includes(s.id));
    if (picked.length < 2) return;
    if (
      !confirm(
        `운동 ${picked.length}개를 하나로 합칠까요?\n합친 뒤에는 다시 나눌 수 없어요.\n(걱정되면 '하루 전체 복사'로 먼저 복사해 두세요)`
      )
    )
      return;
    // 캘린더 라벨: 하루 대표 라벨이 있으면 그것, 없으면 합친 이름(비우면 첫 운동 라벨 유지)
    const name = mergeTitle.trim();
    const merged = mergeSessions(picked, {
      title: name,
      label: dayLabel?.label || name || undefined,
      labelColor: dayLabel?.label ? dayLabel.color ?? null : undefined,
    });
    await saveSession.mutateAsync(merged);
    for (const s of picked) if (s.id !== merged.id) await delSession.mutateAsync(s.id);
    setMergeOpen(false);
    toast(`운동 ${picked.length}개를 하나로 합쳤어요 · 운동 ${merged.exercises.length}개`);
  };

  const doPaste = async () => {
    if (!clip || !dateKey) return;
    const items = clipSessions(clip);
    let idx = nextIndexForDate(dateKey);
    for (const c of items) await saveSession.mutateAsync(fromClip(c, dateKey, idx++));
    // 하루 복사본의 대표 라벨은, 붙여넣는 날에 대표 라벨이 없을 때만 가져온다
    const dl = clip.day?.dayLabel;
    if (dl?.label && !profile?.dayLabels?.[dateKey]) setDayLabel(dateKey, dl);
    toast(
      `${title.split(" (")[0]}에 ${items.length > 1 ? `운동 ${items.length}개를 ` : ""}붙여넣었어요`
    );
  };

  const clipDesc = (() => {
    if (!clip) return "";
    if (clip.day) {
      const name = clip.day.dayLabel?.label ? ` · ${clip.day.dayLabel.label}` : "";
      return `하루 붙여넣기 · 운동 ${clip.day.sessions.length}개${name}`;
    }
    return `복사한 운동 붙여넣기${clip.title ? ` (${clip.title})` : ""}`;
  })();

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
              <Button variant="soft" className="min-w-0 flex-1" onClick={doPaste}>
                <ClipboardPaste size={18} className="shrink-0" />
                <span className="min-w-0 truncate">{clipDesc}</span>
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
          <Button size="lg" onClick={() => setAddOpen(true)}>
            <Plus size={20} /> 이 날 운동 추가
          </Button>
        </div>
      }
    >
      {dayChips.length > 0 && (
        <div className="mb-3 flex gap-2">
          {dayChips.map((c) => (
            <DayStat key={c.label} {...c} grow={dayChips.length > 1} />
          ))}
        </div>
      )}

      {/* 운동이 2개 이상인 날: 하루 대표 라벨(캘린더 표시) + 하루 전체 복사 */}
      {dateKey && (daySessions.length >= 2 || dayLabel) && (
        <div className="mb-3 rounded-app border border-border bg-surface-2/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="min-w-0 text-xs font-bold text-text-3">
              하루 대표 라벨 · 캘린더에 표시
            </span>
            <span className="flex shrink-0 gap-1.5">
              {daySessions.length >= 2 && (
                <button
                  onClick={openMerge}
                  className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-strong active:scale-95"
                >
                  <Combine size={13} /> 합치기
                </button>
              )}
              {daySessions.length > 0 && (
                <button
                  onClick={doCopyDay}
                  className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-strong active:scale-95"
                >
                  <Copy size={13} /> 전체 복사
                </button>
              )}
            </span>
          </div>
          <LabelField
            key={`${dateKey}:${dayLabel?.label ?? ""}`}
            value={dayLabel?.label}
            color={dayLabel?.color}
            onChangeLabel={(v) => setDayLabel(dateKey, { label: v })}
            onChangeColor={(c) => setDayLabel(dateKey, { color: c })}
            placeholder="예: 전신A (비우면 운동별 라벨 표시)"
          />
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

    <StartWorkoutSheet open={addOpen} onClose={() => setAddOpen(false)} date={dateKey} />

    <Sheet
      open={mergeOpen}
      onClose={() => setMergeOpen(false)}
      title="운동 하나로 합치기"
      footer={
        <Button size="lg" onClick={doMerge} disabled={mergeSel.length < 2}>
          <Combine size={20} />{" "}
          {mergeSel.length < 2 ? "2개 이상 골라주세요" : `${mergeSel.length}개 합치기`}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-text-3">
        고른 운동들을 <b className="text-text-2">위에서부터 순서대로</b> 한 운동 기록으로 이어 붙여요.
        세트·완료 기록·GPS 러닝은 그대로 옮겨지고, 순서는 합친 뒤 꾹 눌러 바꿀 수 있어요.
      </p>
      <div className="space-y-1.5">
        {daySessions.map((s) => {
          const on = mergeSel.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() =>
                setMergeSel((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))
              }
              className={cn(
                "flex w-full items-center gap-3 rounded-app border px-3 py-2.5 text-left transition",
                on ? "border-brand bg-brand-soft/50" : "border-border"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{sessionName(s)}</span>
                  {s.endedAt && (
                    <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      완료
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-text-3">
                  {s.exercises.map((e) => exMap.get(e.exerciseId)?.nameKo ?? "운동").join(" · ") || "운동 없음"}
                </span>
              </span>
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                  on ? "border-brand bg-brand text-white" : "border-border"
                )}
              >
                {on && <Check size={13} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mb-1 mt-4 block text-sm font-semibold text-text-2">합친 운동 이름</label>
      <input
        value={mergeTitle}
        onChange={(e) => setMergeTitle(e.target.value)}
        placeholder="예: 전신 A"
        maxLength={40}
        className="w-full rounded-app border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-brand"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-text-3">
        운동 시간은 각 운동 시간을 더한 값으로 유지돼요. 하나라도 완료된 운동이 있으면 합친 운동도
        완료로 남아요.
      </p>
    </Sheet>
    </>
  );
}

/** 날짜 시트 상단 요약 칩 (운동 시간 · 총 볼륨 · 체중) */
function DayStat({
  icon,
  label,
  value,
  sub,
  grow,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  grow?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-app bg-surface-2 px-3 py-2 ${
        grow ? "flex-1" : ""
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold text-text-3">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span className="truncate text-sm font-black text-text">{value}</span>
        {sub && <span className="shrink-0 text-[10px] text-text-3">{sub}</span>}
      </div>
    </div>
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
  const dist = sessionDistance(session);
  const runs = sessionRuns(session);
  // 근력 등 거리 방식이 아닌 운동이 있는지(러닝만 있는 세션이면 볼륨 요약은 생략)
  const hasOther = session.exercises.some(
    (e) => !e.gps && (e.trackingMode ?? "weight_reps") !== "distance"
  );
  const manualDistOnly = runs.length === 0 && dist.meters > 0 && !hasOther;
  const showVolume = hasOther || (runs.length === 0 && !manualDistOnly);
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
            {/* 캘린더 도장과 같은 기준: 운동 종료까지 누른 세션만 '완료' */}
            {session.endedAt ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                <Check size={11} strokeWidth={3} /> 완료
              </span>
            ) : session.startedAt ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-brand/60 px-1.5 py-0.5 text-[10px] font-bold text-brand-strong">
                진행 중
              </span>
            ) : null}
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

      {manualDistOnly && (
        <button onClick={onOpen} className="mt-2 w-full text-left">
          <div className="flex gap-4 text-sm text-text-2">
            <span>
              거리 <b className="text-text">{fmtKm(dist.meters)}</b>
              <span className="text-text-3">km</span>
            </span>
            {dist.sec > 0 && (
              <span>
                시간 <b className="text-text">{fmtClock(dist.sec)}</b>
              </span>
            )}
            {dist.sec > 0 && (
              <span>
                페이스 <b className="text-text">{fmtPace(paceSecPerKm(dist.meters, dist.sec))}</b>
              </span>
            )}
          </div>
          <RunHeartRate startedAt={session.startedAt} endedAt={session.endedAt} />
        </button>
      )}
      {showVolume && (
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
      )}
      {runs.map((r) => (
        <div key={r.key} className="mt-2">
          {(runs.length > 1 || hasOther) && (
            <div className="mb-1 flex items-center gap-1 text-xs font-bold text-text-2">
              <Footprints size={13} className="text-brand" /> GPS 러닝
            </div>
          )}
          <RunDetail
            run={r.run}
            date={session.date}
            startedAt={r.startedAt}
            endedAt={r.endedAt}
            title={runs.length === 1 && !hasOther && session.title ? session.title : "GPS 러닝"}
          />
        </div>
      ))}
    </div>
  );
}
