"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, Share2, ImagePlus, Route as RouteIcon, HeartPulse, Info } from "lucide-react";
import { Sheet, Button, cn, useToast } from "./ui";
import { RunRoute } from "./run-route";
import { RunMap } from "./run-map";
import { useBodyMetrics } from "@/lib/hooks";
import { isNativeApp } from "@/lib/native";
import { isHealthLinked, heartRateBetween, stepsInWindow } from "@/lib/health";
import { runMetrics, weightOn, KCAL_SOURCE, type RunMetrics } from "@/lib/running";
import { fmtClock, fmtKm, fmtPace } from "@/lib/run-tracker";
import { renderShareCard, shareImage, type ShareCardData } from "@/lib/share-card";
import type { RunRecord } from "@/lib/types";

/** 러닝 기록의 상세 지표(거리·시간·페이스·속도·케이던스·걸음·칼로리·심박) + 경로 + 지도 + 공유 카드 */
export function RunDetail({
  run,
  date,
  startedAt,
  endedAt,
  title,
  className,
}: {
  run: RunRecord;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string;
  className?: string;
}) {
  const { data: metricsList } = useBodyMetrics();
  const [hr, setHr] = useState<{ avg: number; max: number } | null>(null);
  const [hcSteps, setHcSteps] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Health Connect: 심박, (걸음 센서 기록이 없는 옛 러닝이면) 구간 걸음
  useEffect(() => {
    if (!startedAt || !endedAt || !isNativeApp() || !isHealthLinked()) return;
    let alive = true;
    void heartRateBetween(startedAt, endedAt)
      .then((r) => alive && setHr(r))
      .catch(() => {});
    if (run.steps == null)
      void stepsInWindow(startedAt, endedAt)
        .then((n) => alive && setHcSteps(n))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [startedAt, endedAt, run.steps]);

  const m = useMemo(() => {
    const elapsed =
      startedAt && endedAt ? (Date.parse(endedAt) - Date.parse(startedAt)) / 1000 : run.movingSec;
    return runMetrics(
      run,
      weightOn(metricsList, date),
      hcSteps != null ? { steps: hcSteps, elapsedSec: elapsed } : null
    );
  }, [run, metricsList, date, hcSteps, startedAt, endedAt]);

  const cells: { label: string; value: string; unit?: string }[] = [
    { label: "거리", value: fmtKm(m.meters), unit: "km" },
    { label: "시간", value: fmtClock(m.sec) },
    { label: "평균 페이스", value: fmtPace(m.paceSec) },
    { label: "평균 속도", value: m.speedKmh ? m.speedKmh.toFixed(1) : "--", unit: "km/h" },
    { label: "케이던스", value: m.cadence != null ? String(m.cadence) : "--", unit: "spm" },
    { label: "걸음", value: m.steps != null ? m.steps.toLocaleString("ko-KR") : "--" },
    { label: "칼로리", value: m.kcal != null ? String(m.kcal) : "--", unit: "kcal" },
  ];
  if (hr) cells.push({ label: "심박 평균·최고", value: `${hr.avg}·${hr.max}`, unit: "bpm" });

  const share: ShareCardData = { date, startedAt, title, metrics: m, route: run.route };

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 rounded-lg bg-surface-2/70 px-1.5 py-1.5">
            <div className="truncate text-[10px] font-semibold text-text-3">{c.label}</div>
            <div className="flex items-baseline gap-0.5">
              <span className="shrink-0 text-[14px] font-black tabular-nums text-text">{c.value}</span>
              {c.unit && <span className="truncate text-[9px] text-text-3">{c.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      {hr && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-text-3">
          <HeartPulse size={12} className="text-danger" /> 심박은 Health Connect(워치) 기록이에요
        </div>
      )}

      {run.route.length > 1 && <RunRoute route={run.route} className="mt-2 h-24 w-full" />}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {run.route.length > 1 && (
          <button
            onClick={() => setMapOpen(true)}
            className="flex items-center gap-1 text-xs font-bold text-brand active:scale-95"
          >
            <MapIcon size={13} /> 지도로 보기
          </button>
        )}
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 text-xs font-bold text-brand active:scale-95"
        >
          <Share2 size={13} /> 공유 카드
        </button>
        <button
          onClick={() => setInfoOpen(true)}
          className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-text-3 active:scale-95"
        >
          <Info size={12} /> 계산 방법
        </button>
      </div>

      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} title="달린 경로">
        {mapOpen && (
          <RunMap route={run.route} className="h-[60vh] w-full overflow-hidden rounded-app" />
        )}
      </Sheet>
      <RunShareSheet open={shareOpen} onClose={() => setShareOpen(false)} data={share} />
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title="지표 계산 방법">
        <MetricsInfo m={m} fromHealth={run.steps == null && hcSteps != null} />
      </Sheet>
    </div>
  );
}

function MetricsInfo({ m, fromHealth }: { m: RunMetrics; fromHealth: boolean }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-text-2">
      <p>
        <b className="text-text">평균 페이스·속도</b> — 일시정지를 뺀 기록 시간과 GPS 거리로 계산해요.
      </p>
      <p>
        <b className="text-text">걸음·케이던스</b> —{" "}
        {fromHealth
          ? "이 기록은 걸음 센서 값이 없어서 Health Connect의 그 시간대 걸음(휴대폰·워치)으로 계산했어요. 일시정지 시간도 포함돼요."
          : "러닝 중 휴대폰 걸음 센서가 센 걸음이에요(일시정지 구간 제외). 케이던스는 1분당 걸음 수(spm)예요."}{" "}
        값이 &lsquo;--&rsquo;이면 걸음 센서 권한(신체 활동)이 없거나, 이 기능 전 기록이에요.
      </p>
      <p>
        <b className="text-text">칼로리</b> — {KCAL_SOURCE}{" "}
        {m.weightAssumed
          ? "체중 기록이 없어 70kg로 계산했어요(통계 탭에서 체중을 기록하면 반영)."
          : `체중 ${m.weightKg}kg 기준이에요.`}
      </p>
    </div>
  );
}

/** 공유 카드 미리보기 + 배경(경로/내 사진) 선택 + 공유 */
export function RunShareSheet({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: ShareCardData;
}) {
  const toast = useToast();
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const key = JSON.stringify([data.date, data.startedAt, data.metrics, data.route.length, data.title]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made: string | null = null;
    void renderShareCard(data, photo)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch(() => toast("공유 카드를 만들지 못했어요", "error"));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photo, key]);

  const pickPhoto = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    const u = URL.createObjectURL(f);
    img.onload = () => setPhoto(img);
    img.onerror = () => toast("사진을 열지 못했어요", "error");
    img.src = u;
  };

  const doShare = async () => {
    if (!blob) return;
    setBusy(true);
    try {
      const r = await shareImage(blob, `ounwan-run-${data.date}.jpg`);
      if (r === "downloaded") toast("이미지를 저장했어요");
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!/cancel|abort/i.test(msg)) toast("공유하지 못했어요", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="러닝 공유 카드"
      footer={
        <Button size="lg" onClick={doShare} disabled={!blob || busy}>
          <Share2 size={18} /> 공유하기
        </Button>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
        <button
          onClick={() => setPhoto(null)}
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-full text-sm font-semibold transition",
            !photo ? "bg-surface text-brand shadow-[var(--shadow-card)]" : "text-text-3"
          )}
        >
          <RouteIcon size={14} /> 경로 배경
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-full text-sm font-semibold transition",
            photo ? "bg-surface text-brand shadow-[var(--shadow-card)]" : "text-text-3"
          )}
        >
          <ImagePlus size={14} /> {photo ? "사진 바꾸기" : "내 사진 배경"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pickPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="mx-auto aspect-[4/5] w-full max-w-[360px] overflow-hidden rounded-app bg-surface-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="러닝 공유 카드 미리보기" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-text-3">만드는 중…</div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-text-3">
        사진은 휴대폰 안에서만 합성돼요(어디에도 올라가지 않아요).
      </p>
    </Sheet>
  );
}
