"use client";

import { App } from "@capacitor/app";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./native";

// 앱 안 업데이트. GitHub 릴리스 'apk-latest'의 버전(v1.N, N=versionCode)을
// 설치된 앱의 버전과 비교하고, 새 버전이면 앱이 직접 받아 설치 화면을 연다.

const RELEASE_API = "https://api.github.com/repos/Moowillbedone/ounwan/releases/tags/apk-latest";
export const RELEASE_PAGE = "https://github.com/Moowillbedone/ounwan/releases/tag/apk-latest";

interface AppUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  addListener(
    eventName: "progress",
    cb: (e: { percent: number }) => void
  ): Promise<PluginListenerHandle>;
}
export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

export interface UpdateInfo {
  current: string; // 설치된 버전 "1.8"
  latest: string; // 릴리스 버전 "1.9"
  url: string; // APK 다운로드 주소
  available: boolean;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNativeApp()) return null;
  try {
    const info = await App.getInfo();
    const cur = parseInt(info.build, 10) || 0;
    const res = await fetch(RELEASE_API, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      name?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const m = /v1\.(\d+)/.exec(j.name ?? "");
    const asset = j.assets?.find((a) => a.name.endsWith(".apk"));
    if (!m || !asset) return null;
    const latest = parseInt(m[1], 10);
    return {
      current: info.version,
      latest: `1.${latest}`,
      url: asset.browser_download_url,
      available: latest > cur,
    };
  } catch {
    return null;
  }
}

/**
 * 받기 → 설치 화면. '이 출처 허용'이 꺼져 있으면 설정 화면으로 보내고 false.
 * 업데이트 기능이 없는 구버전 앱이면 릴리스 페이지를 연다.
 */
export async function installUpdate(
  url: string,
  onProgress: (pct: number) => void
): Promise<"started" | "needs-permission" | "opened-page"> {
  try {
    const { allowed } = await AppUpdater.canInstall();
    if (!allowed) {
      await AppUpdater.openInstallSettings();
      return "needs-permission";
    }
    const sub = await AppUpdater.addListener("progress", (e) => onProgress(e.percent));
    try {
      await AppUpdater.downloadAndInstall({ url });
    } finally {
      void sub.remove();
    }
    return "started";
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/not implemented|UNIMPLEMENTED/i.test(msg)) {
      window.open(RELEASE_PAGE, "_blank");
      return "opened-page";
    }
    throw e;
  }
}
