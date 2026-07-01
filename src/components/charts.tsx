"use client";

// 의존성 없는 경량 SVG 차트

export interface Point {
  label: string; // 날짜 등
  value: number;
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
  const W = 320;
  const H = height;
  const padX = 10;
  const padTop = 22;
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
  const x = (i: number) => padX + (n === 1 ? (W - 2 * padX) / 2 : (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padTop + innerH - ((v - min) / range) * innerH;

  const linePts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPts = `${padX},${padTop + innerH} ${linePts} ${x(n - 1)},${padTop + innerH}`;
  const last = data[n - 1];
  const fmt = formatValue ?? ((v: number) => String(Math.round(v * 10) / 10));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height }}
    >
      <defs>
        <linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill="url(#lc-grad)" />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(d.value)}
          r={i === n - 1 ? 4 : 2.5}
          fill={i === n - 1 ? color : "var(--surface)"}
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* 최고점 표시 */}
      <text
        x={x(n - 1)}
        y={Math.max(12, y(last.value) - 8)}
        textAnchor="end"
        fontSize="12"
        fontWeight="700"
        fill="var(--text)"
      >
        {fmt(last.value)}
        {valueSuffix}
      </text>
      {/* 시작/끝 라벨 */}
      <text x={padX} y={H - 6} fontSize="10" fill="var(--text-3)">
        {data[0].label}
      </text>
      {n > 1 && (
        <text x={W - padX} y={H - 6} fontSize="10" fill="var(--text-3)" textAnchor="end">
          {last.label}
        </text>
      )}
    </svg>
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
