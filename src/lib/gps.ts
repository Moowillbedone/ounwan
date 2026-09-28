import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { isNativeApp } from "./native";

// 위치 수집 추상화.
// - 앱(APK): background-geolocation 플러그인 → 포그라운드 서비스(알림 표시)로
//   화면이 꺼지거나 다른 앱으로 가도 계속 수집.
// - 브라우저/PWA: navigator.geolocation + 화면 꺼짐 방지(Wake Lock).
//   웹은 백그라운드에서 위치가 멈추므로 화면을 켜둬야 한다(플랫폼 한계).

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number; // m
  time: number; // epoch ms
}

export type GpsError = "denied" | "unavailable";

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export function gpsKeepsRunningInBackground(): boolean {
  return isNativeApp();
}

/** 위치 수집 시작. 반환값을 호출하면 중지. */
export async function startGps(
  onFix: (fix: GpsFix) => void,
  onError: (e: GpsError) => void
): Promise<() => void> {
  if (isNativeApp()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "오운완 러닝 기록 중",
        backgroundMessage: "화면이 꺼져도 거리를 계속 측정하고 있어요",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (loc, err) => {
        if (err) {
          onError(err.code === "NOT_AUTHORIZED" ? "denied" : "unavailable");
          return;
        }
        if (!loc) return;
        onFix({
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy,
          time: loc.time ?? Date.now(),
        });
      }
    );
    return () => {
      void BackgroundGeolocation.removeWatcher({ id });
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("unavailable");
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (p) =>
      onFix({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        time: p.timestamp || Date.now(),
      }),
    (e) => onError(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
  const releaseWake = await holdWakeLock();
  return () => {
    navigator.geolocation.clearWatch(watchId);
    releaseWake();
  };
}

/** 웹 전용: 기록 중 화면이 꺼지지 않게. 탭 복귀 시 자동으로 다시 잡는다. */
async function holdWakeLock(): Promise<() => void> {
  type Sentinel = { release: () => Promise<void> };
  const wl = (navigator as Navigator & {
    wakeLock?: { request: (t: "screen") => Promise<Sentinel> };
  }).wakeLock;
  if (!wl) return () => {};
  let sentinel: Sentinel | null = null;
  let active = true;
  const acquire = async () => {
    try {
      sentinel = await wl.request("screen");
    } catch {
      sentinel = null;
    }
  };
  const onVisible = () => {
    if (active && document.visibilityState === "visible") void acquire();
  };
  await acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
  };
}

/** 두 좌표 사이 거리(m) — 하버사인 */
export function haversineM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
