"use client";

// 지도 타일 없이 경로 모양만 SVG로 그린다(외부 지도 의존성·키 없음).
export function RunRoute({
  route,
  className,
}: {
  route: [number, number][];
  className?: string;
}) {
  if (route.length < 2) return null;
  const W = 300;
  const H = 160;
  const PAD = 10;
  const lat0 = (route[0][0] * Math.PI) / 180;
  // 위도·경도를 평면 미터 좌표로(등장방형 투영, 짧은 거리에서 충분)
  const pts = route.map(([lat, lng]) => [lng * Math.cos(lat0), -lat] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1e-9;
  const spanY = Math.max(...ys) - minY || 1e-9;
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const xy = pts.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [sx, sy] = xy[0];
  const [ex, ey] = xy[xy.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="달린 경로">
      <path
        d={d}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={sx} cy={sy} r={5} fill="var(--surface)" stroke="var(--brand)" strokeWidth={3} />
      <circle cx={ex} cy={ey} r={5} fill="var(--brand)" />
    </svg>
  );
}
