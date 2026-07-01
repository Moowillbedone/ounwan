"use client";

import { toDateKey } from "@/lib/utils";

// 깃허브 잔디식 연속기록 히트맵.
// data: dateKey → level(0~4)
export function Heatmap({
  data,
  weeks = 15,
  onSelect,
}: {
  data: Map<string, number>;
  weeks?: number;
  onSelect?: (dateKey: string) => void;
}) {
  const today = new Date();
  // 이번 주 일요일까지 포함하도록 정렬(주 시작=일)
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // 이번 주 토요일
  const cols: Date[][] = [];
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - (weeks * 7 - 1));
  cursor.setDate(cursor.getDate() - cursor.getDay()); // 주의 시작(일요일)로 맞춤

  for (let w = 0; w < weeks; w++) {
    const col: Date[] = [];
    for (let d = 0; d < 7; d++) {
      col.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(col);
  }

  const levelColor = ["--grass-0", "--grass-1", "--grass-2", "--grass-3", "--grass-4"];
  const todayKey = toDateKey(today);

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-[3px]">
          {col.map((d, di) => {
            const key = toDateKey(d);
            const future = d > today;
            const lvl = future ? -1 : data.get(key) ?? 0;
            const isToday = key === todayKey;
            return (
              <button
                key={di}
                onClick={() => !future && onSelect?.(key)}
                disabled={future}
                aria-label={key}
                className="h-[13px] w-[13px] rounded-[3px] transition"
                style={{
                  background:
                    lvl < 0 ? "transparent" : `var(${levelColor[lvl]})`,
                  outline: isToday ? "1.5px solid var(--brand)" : "none",
                  outlineOffset: "1px",
                  cursor: future ? "default" : "pointer",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-3">
      <span>적음</span>
      {["--grass-0", "--grass-1", "--grass-2", "--grass-3", "--grass-4"].map((c) => (
        <span
          key={c}
          className="h-[11px] w-[11px] rounded-[3px]"
          style={{ background: `var(${c})` }}
        />
      ))}
      <span>많음</span>
    </div>
  );
}
