"use client";

import { useRef, useState } from "react";

// 의존성 없는 경량 SVG 차트

export interface Point {
  label: string; // 축에 쓰는 짧은 날짜 (예: 8.20)
  value: number;
  dateLabel?: string; // 리드아웃용 자세한 날짜 (예: 8월 20일 (수))
  sub?: string; // 부가 정보 (예: 최고 60kg × 8회)
}

export function LineChart({
  data,
  height = 160,
  color = "var(--brand)",
  valueSuffix = "",
  formatValue,
}: {
  data: Point[];
  height?: number;
  color?: string;
  valueSuffix?: string;
  formatValue?: (v: number) => string;
}) {
  // 선택된 점(탭한 지점). null이면 마지막 점을 기본으로 읽어준다.
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const W = 320;
  const H = height;
  const padX = 12;
  const padTop = 14;
  const padBottom = 20;

  if (data.length === 0) {
    return (
      <div
        className="grid place-items-center text-sm text-text-3"
        style={{ height }}
      >
        데이터가 아직 없어요
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerH = H - padTop - padBottom;
  const n = data.length;
  const x = (i: number) =>
    padX + (n === 1 ? (W - 2 * padX) / 2 : (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padTop + innerH - ((v - min) / range) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPts = `${padX},${padTop + innerH} ${linePts} ${x(n - 1)},${padTop + innerH}`;
  const fmt = formatValue ?? ((v: number) => String(Math.round(v * 10) / 10));

  // 선택 인덱스(범위를 벗어나면 마지막 점으로 안전하게 되돌림)
  const idx = active != null && active >= 0 && active < n ? active : n - 1;
  const cur = data[idx];

  // 탭/드래그한 x좌표에서 가장 가까운 점 찾기 (점이 작아도 어디를 눌러도 잡히게)
  const pick = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - svgX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActive(best);
  };

  return (
    <div>
      {/* 리드아웃 — 선택한 점의 날짜·수치. 손가락에 가리지 않게 그래프 위에 고정 */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-semibold text-text-2">
          {cur.dateLabel ?? cur.label}
          {active == null && n > 1 && (
            <span className="ml-1 font-normal text-text-3">· 최근</span>
          )}
        </span>
        <span className="shrink-0 text-sm font-black tabular-nums">
          {cur.sub && (
            <span className="mr-1.5 text-[10px] font-semibold text-text-3">
              {cur.sub}
            </span>
          )}
          {fmt(cur.value)}
          {valueSuffix}
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative cursor-pointer select-none"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => {
          if (e.buttons > 0) pick(e.clientX); // 손가락으로 문지르면 이어서 스크럽
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          style={{ height }}
          role="img"
          aria-label="추이 그래프"
        >
          <defs>
            <linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPts} fill="url(#lc-grad)" />

          {/* 선택 지점 세로 가이드 */}
          <line
            x1={x(idx)}
            y1={padTop - 6}
            x2={x(idx)}
            y2={padTop + innerH}
            stroke={color}
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />

          <polyline
            points={linePts}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {data.map((d, i) => {
            const on = i === idx;
            return (
              <circle
                key={i}
                cx={x(i)}
                cy={y(d.value)}
                r={on ? 5 : 2.5}
                fill={on ? color : "var(--surface)"}
                stroke={on ? "var(--surface)" : color}
                strokeWidth={on ? 2.5 : 2}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* 시작/끝 라벨 */}
          <text x={padX} y={H - 6} fontSize="10" fill="var(--text-3)">
            {data[0].label}
          </text>
          {n > 1 && (
            <text
              x={W - padX}
              y={H - 6}
              fontSize="10"
              fill="var(--text-3)"
              textAnchor="end"
            >
              {data[n - 1].label}
            </text>
          )}
        </svg>
      </div>

      {active == null && n > 1 && (
        <p className="mt-1 text-center text-[10px] text-text-3">
          점을 탭하면 그날의 날짜와 수치를 볼 수 있어요
        </p>
      )}
    </div>
  );
}

export function HBars({
  data,
  suffix = "",
}: {
  data: { label: string; value: number; color: string }[];
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-semibold text-text-2">
            {d.label}
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
            <div
              className="h-full rounded-md transition-[width] duration-500"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color,
                minWidth: d.value > 0 ? "6px" : 0,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-text-2">
            {d.value.toLocaleString("ko-KR")}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}
