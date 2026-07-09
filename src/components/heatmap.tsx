"use client";

import { toDateKey, todayKey } from "@/lib/utils";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const LEVEL_COLOR = ["--grass-0", "--grass-1", "--grass-2", "--grass-3", "--grass-4"];
const CELL = 16;
const GAP = 3;
const PITCH = CELL + GAP;
const LABEL_W = 20;

function ariaFor(key: string, tKey: string, lvl: number): string {
  const when = key === tKey ? "오늘" : key;
  if (lvl < 0) return `${when} · 예정`;
  return lvl > 0 ? `${when} · 운동 ${lvl}단계` : `${when} · 미기록`;
}

// 깃허브 잔디식 히트맵. data: dateKey → level(1~4, 없으면 미기록).
// 주 시작 요일을 프로필과 통일(weekStartsOn: 0=일, 1=월)해 월 캘린더와 축을 맞춘다.
export function Heatmap({
  data,
  weeks = 15,
  weekStartsOn = 1,
  onSelect,
}: {
  data: Map<string, number>;
  weeks?: number;
  weekStartsOn?: 0 | 1;
  onSelect?: (dateKey: string) => void;
}) {
  const today = new Date();
  const tKey = todayKey();

  // 그리드 끝 = 이번 주의 마지막 요일(주 시작 기준)
  const end = new Date(today);
  end.setDate(end.getDate() + ((weekStartsOn + 6 - end.getDay() + 7) % 7));

  // 시작 커서 = end에서 (weeks*7-1)일 전 → 그 주의 시작 요일로 정렬
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - (weeks * 7 - 1));
  cursor.setDate(cursor.getDate() - ((cursor.getDay() - weekStartsOn + 7) % 7));

  const cols: Date[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: Date[] = [];
    for (let d = 0; d < 7; d++) {
      col.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(col);
  }

  // 월 라벨: 각 컬럼 첫 셀(주 시작일)의 월이 바뀌는 지점에 표시
  const monthMarks: { ci: number; label: string }[] = [];
  let prevMonth = -1;
  cols.forEach((col, ci) => {
    const m = col[0].getMonth();
    if (m !== prevMonth) {
      monthMarks.push({ ci, label: `${m + 1}월` });
      prevMonth = m;
    }
  });

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: LABEL_W + cols.length * PITCH }}>
        {/* 월 라벨 */}
        <div className="relative h-4" style={{ marginLeft: LABEL_W }}>
          {monthMarks.map(({ ci, label }) => (
            <span
              key={ci}
              className="absolute top-0 whitespace-nowrap text-[10px] leading-none text-text-3"
              style={{ left: ci * PITCH }}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex" style={{ gap: GAP }}>
          {/* 요일 라벨(월·수·금) */}
          <div className="flex flex-col" style={{ gap: GAP, width: LABEL_W }}>
            {Array.from({ length: 7 }).map((_, r) => {
              const wd = (weekStartsOn + r) % 7;
              const show = wd === 1 || wd === 3 || wd === 5;
              return (
                <div
                  key={r}
                  className="flex items-center text-[9px] leading-none text-text-3"
                  style={{ height: CELL }}
                >
                  {show ? WEEKDAY[wd] : ""}
                </div>
              );
            })}
          </div>

          {/* 잔디 격자 */}
          <div className="flex" style={{ gap: GAP }}>
            {cols.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap: GAP }}>
                {col.map((d, di) => {
                  const key = toDateKey(d);
                  const future = d > today;
                  const lvl = future ? -1 : data.get(key) ?? 0;
                  const isToday = key === tKey;
                  const unloggedToday = isToday && lvl <= 0;
                  return (
                    <button
                      key={di}
                      onClick={() => !future && onSelect?.(key)}
                      disabled={future}
                      aria-label={ariaFor(key, tKey, lvl)}
                      title={key}
                      className="rounded-[3px] transition"
                      style={{
                        width: CELL,
                        height: CELL,
                        background: future
                          ? "transparent"
                          : unloggedToday
                          ? "var(--brand-soft)"
                          : `var(${LEVEL_COLOR[lvl]})`,
                        border: future ? "1px dashed var(--border)" : "none",
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
        </div>
      </div>
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-3">
      <span>가벼움</span>
      {["--grass-1", "--grass-2", "--grass-3", "--grass-4"].map((c) => (
        <span
          key={c}
          className="h-[11px] w-[11px] rounded-[3px]"
          style={{ background: `var(${c})` }}
        />
      ))}
      <span>빡셈</span>
    </div>
  );
}
