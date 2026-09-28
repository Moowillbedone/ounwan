"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { useProfile, useSessions } from "@/lib/hooks";
import { isNativeApp, WidgetBridge, NATIVE_AUTH_REDIRECT } from "@/lib/native";
import { getSupabase } from "@/lib/supabase";
import { computeStreak, dayGrassLevel, isSessionDone, toDateKey } from "@/lib/utils";
import { useToast } from "./ui";

const OPEN_PREFIX = "com.ounwan.app://open";
const WIDGET_DAYS = 120; // 위젯 잔디가 그릴 수 있는 최대 기간(약 17주)

/**
 * 안드로이드 앱(APK)에서만 동작하는 연결부. 브라우저/PWA에서는 아무것도 하지 않는다.
 * 1) 기록이 바뀔 때마다 홈 화면 위젯에 요약(연속기록·잔디)을 보낸다.
 * 2) 위젯 버튼·로그인 메일 링크로 앱이 열리면 해당 화면 이동/로그인 처리.
 */
export function NativeBridge() {
  const router = useRouter();
  const toast = useToast();
  const { data: sessions } = useSessions();
  const { data: profile } = useProfile();

  // 1) 위젯 요약 전송 — 잔디 단계·연속기록은 홈 화면과 같은 함수로 계산
  useEffect(() => {
    if (!isNativeApp() || !sessions) return;
    const weekStartsOn: 0 | 1 = profile?.weekStartsMonday === false ? 0 : 1;
    const byDate = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!isSessionDone(s)) continue;
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    const since = new Date();
    since.setDate(since.getDate() - WIDGET_DAYS);
    const sinceKey = toDateKey(since);
    const days: Record<string, number> = {};
    for (const [date, arr] of byDate) {
      if (date >= sinceKey) days[date] = dayGrassLevel(arr);
    }
    const streak = computeStreak(new Set(byDate.keys()), weekStartsOn).current;
    const payload = { v: 1, streak, weekStartsOn, days, updatedAt: Date.now() };
    void WidgetBridge.update({ data: JSON.stringify(payload) }).catch(() => {});
  }, [sessions, profile?.weekStartsMonday]);

  // 2) 앱을 연 URL 처리(위젯 버튼 / 로그인 콜백)
  useEffect(() => {
    if (!isNativeApp()) return;
    const handle = async (url: string) => {
      if (url.startsWith(NATIVE_AUTH_REDIRECT)) {
        const sb = getSupabase();
        if (!sb) return;
        const u = new URL(url.replace(NATIVE_AUTH_REDIRECT, "https://callback.local/"));
        const params = new URLSearchParams(u.hash.replace(/^#/, ""));
        u.searchParams.forEach((v, k) => params.set(k, v));
        const err = params.get("error_description");
        if (err) {
          toast(`로그인 실패: ${err}`, "error");
          return;
        }
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const code = params.get("code");
        const { error } = access_token && refresh_token
          ? await sb.auth.setSession({ access_token, refresh_token })
          : code
          ? await sb.auth.exchangeCodeForSession(code)
          : { error: new Error("로그인 정보가 없어요") };
        toast(error ? `로그인 실패: ${error.message}` : "로그인 완료!", error ? "error" : "info");
        if (!error) router.push("/");
        return;
      }

      if (url.startsWith(OPEN_PREFIX)) {
        const path = url.slice(OPEN_PREFIX.length) || "/";
        router.push(path.startsWith("/") ? path : `/${path}`);
      }
    };

    const sub = App.addListener("appUrlOpen", ({ url }) => void handle(url));
    // 앱을 켠 URL은 페이지가 새로고침돼도 다시 반환되므로 한 번만 처리
    void App.getLaunchUrl().then((r) => {
      if (!r?.url) return;
      const seenKey = `ounwan-launch:${r.url}`;
      try {
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, "1");
      } catch {
        /* noop */
      }
      void handle(r.url);
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [router, toast]);

  return null;
}
