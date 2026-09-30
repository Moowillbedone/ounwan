"use client";

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeApp } from "./native";
import { dateKeyToDate } from "./utils";
import { fmtClock, fmtKm, fmtPace } from "./run-tracker";
import type { RunMetrics } from "./running";

// 러닝 공유 카드(재미용) — 캔버스로 1080×1350(4:5) 이미지를 그려 공유한다.
// 배경은 '경로'(짙은 초록 + 빛나는 경로선) 또는 사용자가 고른 사진.

export interface ShareCardData {
  date: string; // YYYY-MM-DD
  startedAt: string | null;
  title: string;
  metrics: RunMetrics;
  route: [number, number][];
}

const W = 1080;
const H = 1350;
const FONT = '"Pretendard", system-ui, -apple-system, "Segoe UI", sans-serif';
// 테마 색상별 카드 색(그린 / 연핑크)
function palette() {
  const pink =
    typeof document !== "undefined" && document.documentElement.getAttribute("data-accent") === "pink";
  return pink
    ? { brand: "#FF8FB8", glow: "rgba(255,143,184,0.65)", bg0: "#4A1530", bg1: "#12060C" }
    : { brand: "#34D399", glow: "rgba(52,211,153,0.65)", bg0: "#0E3B2B", bg1: "#050F0B" };
}

function dateLine(d: ShareCardData): string {
  const dt = dateKeyToDate(d.date);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  let s = `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(
    dt.getDate()
  ).padStart(2, "0")} (${wd})`;
  if (d.startedAt) {
    const t = new Date(d.startedAt);
    const h = t.getHours();
    s += ` ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  return s;
}

/** 경로를 상자 안에 비율 유지로 그린다 */
function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: [number, number][],
  box: { x: number; y: number; w: number; h: number },
  style: { color: string; width: number; glow: string }
) {
  if (route.length < 2) return;
  const midLat = route.reduce((n, p) => n + p[0], 0) / route.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const pts = route.map(([lat, lng]) => [lng * k, -lat]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1e-9;
  const spanY = Math.max(...ys) - minY || 1e-9;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * scale) / 2;
  const oy = box.y + (box.h - spanY * scale) / 2;
  const P = (p: number[]) => [ox + (p[0] - minX) * scale, oy + (p[1] - minY) * scale];

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = style.width * 3;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = P(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  const dot = (p: number[], fill: string) => {
    const [x, y] = P(p);
    ctx.beginPath();
    ctx.arc(x, y, style.width * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = style.width * 0.6;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  };
  dot(pts[0], "#ffffff");
  dot(pts[pts.length - 1], palette().brand);
  ctx.restore();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export async function renderShareCard(d: ShareCardData, photo: HTMLImageElement | null): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load(`900 100px ${FONT}`),
      document.fonts.load(`700 40px ${FONT}`),
      document.fonts.load(`500 30px ${FONT}`),
    ]);
  } catch {
    /* 기본 글꼴로 */
  }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // 배경
  if (photo) {
    drawCover(ctx, photo);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0.35)");
    g.addColorStop(0.3, "rgba(0,0,0,0.05)");
    g.addColorStop(0.55, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0.82)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawRoute(ctx, d.route, { x: 760, y: 60, w: 260, h: 260 }, {
      color: "#ffffff",
      width: 7,
      glow: "rgba(0,0,0,0.5)",
    });
  } else {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, palette().bg0);
    g.addColorStop(1, palette().bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 은은한 격자
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 90) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    drawRoute(ctx, d.route, { x: 110, y: 210, w: W - 220, h: 520 }, {
      color: palette().brand,
      width: 12,
      glow: palette().glow,
    });
  }

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";

  // 머리: 오운완 · 날짜
  ctx.font = `900 50px ${FONT}`;
  ctx.fillText("오운완", 72, 120);
  ctx.font = `500 30px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(`${dateLine(d)} · ${d.title}`, 72, 170);

  // 큰 거리
  const m = d.metrics;
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 210px ${FONT}`;
  const km = fmtKm(m.meters);
  ctx.fillText(km, 64, 960);
  const kmW = ctx.measureText(km).width;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillStyle = photo ? "#ffffff" : palette().brand;
  ctx.fillText("km", 64 + kmW + 18, 960);

  // 지표 3×2
  const cells: [string, string][] = [
    ["시간", fmtClock(m.sec)],
    ["평균 페이스", m.paceSec ? `${fmtPace(m.paceSec)}/km` : "--"],
    ["평균 속도", m.speedKmh ? `${m.speedKmh.toFixed(1)} km/h` : "--"],
    ["칼로리", m.kcal != null ? `${m.kcal} kcal` : "--"],
    ["평균 케이던스", m.cadence != null ? `${m.cadence} spm` : "--"],
    ["걸음", m.steps != null ? m.steps.toLocaleString("ko-KR") : "--"],
  ];
  const colW = (W - 144) / 3;
  cells.forEach(([label, value], i) => {
    const x = 72 + (i % 3) * colW;
    const y = 1070 + Math.floor(i / 3) * 140;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 50px ${FONT}`;
    ctx.fillText(value, x, y);
    ctx.fillStyle = "rgba(255,255,255,0.68)";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(label, x, y + 44);
  });

  // 구분선
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(72, 1000, W - 144, 2);

  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/jpeg", 0.92)
  );
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** 이미지 공유: 앱은 안드로이드 공유창, 웹은 공유 API 또는 다운로드 */
export async function shareImage(blob: Blob, fileName: string): Promise<"shared" | "downloaded"> {
  if (isNativeApp()) {
    const w = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title: "오운완 러닝", files: [w.uri], dialogTitle: "러닝 기록 공유" });
    return "shared";
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "오운완 러닝" });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
