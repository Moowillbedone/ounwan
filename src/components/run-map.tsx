"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, Polyline, CircleMarker, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/lib/theme";

// 러닝 경로 지도(Leaflet + OpenStreetMap 타일, 키 불필요).
// live=true면 현재 위치를 따라가고, false면 전체 경로가 보이게 맞춘다.
// 인터넷이 없으면 타일만 비고 경로 선은 그대로 보인다.

// OpenStreetMap 기본 타일(키 불필요, 출처 표기 필수). CARTO는 이제 API 키가 필요해 교체.
// 다크 모드는 타일에 색 반전 필터를 씌워 어둡게 보이게 한다.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = "&copy; OpenStreetMap contributors";
const DARK_FILTER = "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)";

export function RunMap({
  route,
  live = false,
  className,
}: {
  route: [number, number][];
  live?: boolean;
  className?: string;
}) {
  const { resolved } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const tiles = useRef<TileLayer | null>(null);
  const line = useRef<Polyline | null>(null);
  const start = useRef<CircleMarker | null>(null);
  const here = useRef<CircleMarker | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const themeRef = useRef(resolved);
  themeRef.current = resolved;

  // 지도 생성(한 번) — leaflet은 window가 필요해서 브라우저에서만 불러온다
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true });
      m.attributionControl.setPrefix(false);
      const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#16c47f";
      line.current = L.polyline([], { color: brand, weight: 5, opacity: 0.95 }).addTo(m);
      start.current = L.circleMarker([0, 0], {
        radius: 6, color: brand, weight: 3, fillColor: "#fff", fillOpacity: 1,
      });
      here.current = L.circleMarker([0, 0], {
        radius: 7, color: "#fff", weight: 3, fillColor: brand, fillOpacity: 1,
      });
      map.current = m;
      setTiles(L, themeRef.current);
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      tiles.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTiles(L: typeof import("leaflet"), theme: string) {
    const m = map.current;
    if (!m) return;
    if (!tiles.current) {
      tiles.current = L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    }
    const c = tiles.current.getContainer();
    if (c) c.style.filter = theme === "dark" ? DARK_FILTER : "";
  }

  // 테마가 바뀌면 타일 교체
  useEffect(() => {
    if (!map.current) return;
    void import("leaflet").then((mod) => setTiles(mod.default, resolved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  // 경로가 바뀔 때마다 선·표시 갱신
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, live]);

  function draw() {
    const m = map.current;
    const r = routeRef.current;
    if (!m || !line.current || r.length === 0) return;
    line.current.setLatLngs(r);
    start.current?.setLatLng(r[0]).addTo(m);
    const last = r[r.length - 1];
    here.current?.setLatLng(last).addTo(m);
    if (live) {
      m.setView(last, Math.max(m.getZoom() || 0, 16), { animate: false });
    } else if (r.length > 1) {
      m.fitBounds(line.current.getBounds(), { padding: [24, 24] });
    } else {
      m.setView(last, 16);
    }
  }

  return <div ref={el} className={className} style={{ zIndex: 0 }} />;
}
