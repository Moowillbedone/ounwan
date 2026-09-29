"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// 꾹 눌러 끌어서 순서 바꾸기(터치·마우스 공용).
// - 항목을 꾹 누르면(손잡이는 짧게) 떠오르고, 손가락을 따라 움직이며 다른 항목이 비켜선다.
// - 화면 위/아래 가장자리로 끌면 자동 스크롤.
// - scope로 목록을 구분한다(예: 전체 목록 'root', 슈퍼세트 묶음 안 'g:3').
// ⚠️ 누른 요소가 드래그 중 DOM에서 빠지면 터치 이벤트가 더 이상 window로 오지 않는다 →
//    화면을 '접은 모드'로 바꿀 때도 누른 요소(카드 머리)는 그대로 두고 내용만 숨겨야 한다.

export interface DragInfo {
  scope: string;
  from: number;
  to: number;
  dy: number;
}

interface Geo {
  tops: number[];
  heights: number[];
  gap: number;
  container: HTMLElement | null; // null = window
  grab: number;
}

const LONG_PRESS_MS = 330;
const HANDLE_MS = 80;
const MOVE_TOLERANCE = 8;
const EDGE = 90;
const MAX_SPEED = 16;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}
const viewTop = (c: HTMLElement | null) => (c ? c.getBoundingClientRect().top : 0);
const viewBottom = (c: HTMLElement | null) =>
  c ? c.getBoundingClientRect().bottom : window.innerHeight;
const scrollTopOf = (c: HTMLElement | null) => (c ? c.scrollTop : window.scrollY);
const scrollByY = (c: HTMLElement | null, d: number) => {
  if (c) c.scrollTop += d;
  else window.scrollBy(0, d);
};
/** 화면 좌표 → 스크롤 내용 좌표 */
const toContent = (c: HTMLElement | null, clientY: number) =>
  clientY - viewTop(c) + scrollTopOf(c);

const isInteractive = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("button, input, textarea, select, a, [data-no-drag]");

export function useDragSort(onDrop: (scope: string, from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const refFns = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const geo = useRef<Geo | null>(null);
  const live = useRef<DragInfo | null>(null);
  const pointerY = useRef(0);
  const raf = useRef<number | null>(null);
  const busy = useRef(false);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const recompute = () => {
    const d = live.current;
    const g = geo.current;
    if (!d || !g) return;
    const visualTop = toContent(g.container, pointerY.current) - g.grab;
    const dy = visualTop - g.tops[d.from];
    const center = visualTop + g.heights[d.from] / 2;
    let to = d.from;
    for (let i = d.from + 1; i < g.tops.length; i++)
      if (center > g.tops[i] + g.heights[i] / 2) to = i;
    for (let i = d.from - 1; i >= 0; i--) if (center < g.tops[i] + g.heights[i] / 2) to = i;
    const next = { ...d, dy, to };
    live.current = next;
    setDrag(next);
  };

  const stopLoop = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const loop = () => {
    const g = geo.current;
    if (!live.current || !g) return;
    const y = pointerY.current;
    const top = Math.max(0, viewTop(g.container));
    const bottom = Math.min(window.innerHeight, viewBottom(g.container));
    let v = 0;
    if (y < top + EDGE) v = -Math.ceil(((top + EDGE - y) / EDGE) * MAX_SPEED);
    else if (y > bottom - EDGE) v = Math.ceil(((y - (bottom - EDGE)) / EDGE) * MAX_SPEED);
    if (v) {
      const before = scrollTopOf(g.container);
      scrollByY(g.container, v);
      if (scrollTopOf(g.container) !== before) recompute();
    }
    raf.current = requestAnimationFrame(loop);
  };

  // 드래그 시작 직후(접은 모드로 다시 그려진 뒤) 위치 측정
  useLayoutEffect(() => {
    if (!drag || geo.current) return;
    const keyOf = (i: number) => `${drag.scope}:${i}`;
    const first = els.current.get(keyOf(drag.from));
    if (!first) return;
    const container = scrollParent(first);
    // 끌고 있는 항목이 손가락 바로 아래 오도록 스크롤을 맞춘다(접으면서 위치가 크게 바뀌므로)
    const r = first.getBoundingClientRect();
    const grab = r.height / 2;
    scrollByY(container, r.top - (pointerY.current - grab));
    const tops: number[] = [];
    const heights: number[] = [];
    for (let i = 0; ; i++) {
      const el = els.current.get(keyOf(i));
      if (!el || !el.isConnected) break;
      const rect = el.getBoundingClientRect();
      tops.push(toContent(container, rect.top));
      heights.push(rect.height);
    }
    const gap = tops.length > 1 ? tops[1] - (tops[0] + heights[0]) : 0;
    geo.current = { tops, heights, gap, container, grab };
    recompute();
    stopLoop();
    raf.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  useEffect(() => stopLoop, []);

  /** 항목 요소 등록(같은 key면 같은 함수 → 매 렌더마다 다시 붙지 않음) */
  const itemRef = (scope: string, index: number) => {
    const key = `${scope}:${index}`;
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) els.current.set(key, el);
        else if (els.current.get(key) && !els.current.get(key)!.isConnected) els.current.delete(key);
      };
      refFns.current.set(key, fn);
    }
    return fn;
  };

  /** 항목 이동 스타일: 끄는 항목은 손가락을 따라, 사이 항목은 한 칸 비켜선다 */
  const itemStyle = (scope: string, index: number): CSSProperties => {
    const d = drag;
    const g = geo.current;
    if (!d || d.scope !== scope || !g) return {};
    if (index === d.from)
      return {
        transform: `translateY(${d.dy}px) scale(1.02)`,
        zIndex: 40,
        position: "relative",
        boxShadow: "0 12px 28px rgba(0,0,0,0.22)",
        transition: "box-shadow 150ms",
      };
    const shift = g.heights[d.from] + g.gap;
    let y = 0;
    if (d.from < d.to && index > d.from && index <= d.to) y = -shift;
    if (d.to < d.from && index >= d.to && index < d.from) y = shift;
    return { transform: `translateY(${y}px)`, transition: "transform 160ms ease" };
  };

  /**
   * 누르기 시작 핸들러. handle=true면 손잡이(짧게 눌러도 시작).
   * 버튼·입력칸을 누른 경우는 무시한다(그 요소는 접은 모드에서 사라질 수 있음).
   */
  const pressProps = (scope: string, index: number, handle = false) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!handle && isInteractive(e.target)) return;
      if (busy.current || live.current) return;
      busy.current = true;
      const touch = e.pointerType === "touch";
      const sx = e.clientX;
      const sy = e.clientY;
      pointerY.current = sy;
      let active = false;

      const activate = () => {
        active = true;
        try {
          navigator.vibrate?.(15);
        } catch {
          /* noop */
        }
        const d = { scope, from: index, to: index, dy: 0 };
        geo.current = null;
        live.current = d;
        setDrag(d);
      };
      const timer = window.setTimeout(activate, handle ? HANDLE_MS : LONG_PRESS_MS);

      const move = (x: number, y: number) => {
        pointerY.current = y;
        if (!active) {
          if (Math.hypot(x - sx, y - sy) > MOVE_TOLERANCE) end(false);
          return;
        }
        recompute();
      };
      const onPointerMove = (ev: PointerEvent) => {
        if (!touch) move(ev.clientX, ev.clientY);
      };
      const onTouchMove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;
        if (active && ev.cancelable) ev.preventDefault(); // 끄는 동안 화면 스크롤 막기
        move(t.clientX, t.clientY);
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      // 터치는 드래그가 시작되면 브라우저가 pointercancel을 보낼 수 있어 터치 이벤트로 끝을 판단
      const onPointerCancel = () => {
        if (!touch || !active) end(false);
      };

      function end(drop: boolean) {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onCancel);
        busy.current = false;
        if (!active) return;
        const d = live.current;
        live.current = null;
        geo.current = null;
        stopLoop();
        setDrag(null);
        if (drop && d && d.to !== d.from) onDropRef.current(d.scope, d.from, d.to);
        // 손을 뗀 직후 따라오는 click(카드 열기 등)은 삼킨다
        const stop = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener("click", stop, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", stop, true), 400);
      }
      function onPointerUp() {
        if (!touch) end(true);
        else if (!active) end(false);
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onCancel);
    },
    // 꾹 누를 때 뜨는 글자 선택·메뉴 막기
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { WebkitTouchCallout: "none", touchAction: handle ? "none" : undefined } as CSSProperties,
  });

  return { drag, itemRef, itemStyle, pressProps };
}

/** 배열에서 from 위치 항목을 to 위치로 옮긴 새 배열 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
