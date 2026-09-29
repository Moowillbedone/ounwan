import type { SessionExercise, WorkoutSession } from "./types";
import { uid } from "./utils";

/**
 * 같은 날의 운동(세션) 여러 개를 하나로 합친다. 첫 세션(하루 순서가 가장 빠른 것)을 남기고
 * 나머지의 운동을 순서대로 이어 붙인다. 합쳐진 뒤 나머지 세션은 호출한 쪽에서 삭제한다.
 * - 슈퍼세트 묶음 번호는 겹치지 않게 다시 매긴다.
 * - 옛 GPS 기록(세션 단위 run)은 그 세션의 러닝 운동으로 옮긴다.
 * - 운동 시간은 각 세션 시간의 합을 유지한다(아침·저녁 운동을 합쳐도 사이 시간이 운동 시간이 되지 않게).
 */
export function mergeSessions(
  list: WorkoutSession[],
  opts: { title: string | null; label?: string | null; labelColor?: string | null }
): WorkoutSession {
  const sorted = [...list].sort((a, b) => a.sessionIndexOfDay - b.sessionIndexOfDay);
  const base = sorted[0];
  const exercises: SessionExercise[] = [];
  let group = 0;

  for (const s of sorted) {
    const exs = [...s.exercises].sort((a, b) => a.orderIndex - b.orderIndex).map((e) => ({ ...e }));
    if (s.run && !exs.some((e) => e.run)) {
      const run = {
        ...s.run,
        startedAt: s.run.startedAt ?? s.startedAt ?? null,
        endedAt: s.run.endedAt ?? s.endedAt ?? null,
      };
      const target = exs.find((e) => e.trackingMode === "distance");
      if (target) {
        target.gps = true;
        target.run = run;
      } else {
        exs.push({
          id: uid(),
          exerciseId: "outdoor-running",
          orderIndex: exs.length,
          trackingMode: "distance",
          gps: true,
          run,
          sets: [
            {
              id: uid(),
              setType: "working",
              weight: 0,
              reps: 0,
              durationSec: s.run.movingSec,
              distanceM: s.run.distanceM,
              isCompleted: true,
              completedAt: s.endedAt ?? null,
            },
          ],
        });
      }
    }
    const gmap = new Map<number, number>();
    for (const e of exs) {
      let g = e.supersetGroup ?? null;
      if (g != null) {
        if (!gmap.has(g)) gmap.set(g, ++group);
        g = gmap.get(g)!;
      }
      exercises.push({ ...e, supersetGroup: g, orderIndex: exercises.length });
    }
  }

  const starts = sorted.map((s) => s.startedAt).filter((x): x is string => !!x).map(Date.parse);
  const startedAt = starts.length ? new Date(Math.min(...starts)).toISOString() : null;
  let endedAt: string | null = null;
  const ended = sorted.filter((s) => s.endedAt);
  if (ended.length) {
    const total = sorted.reduce(
      (n, s) =>
        s.startedAt && s.endedAt ? n + Math.max(0, Date.parse(s.endedAt) - Date.parse(s.startedAt)) : n,
      0
    );
    const lastEnd = Math.max(...ended.map((s) => Date.parse(s.endedAt!)));
    endedAt =
      startedAt && total > 0
        ? new Date(Date.parse(startedAt) + total).toISOString()
        : new Date(lastEnd).toISOString();
  }

  const notes = sorted.map((s) => s.note?.trim()).filter(Boolean);
  return {
    ...base,
    title: opts.title?.trim() || null,
    label: opts.label !== undefined ? opts.label : base.label ?? null,
    labelColor: opts.labelColor !== undefined ? opts.labelColor : base.labelColor ?? null,
    exercises,
    startedAt,
    endedAt,
    run: null,
    bodyweight: sorted.find((s) => s.bodyweight != null)?.bodyweight ?? null,
    note: notes.length ? notes.join("\n") : null,
  };
}
