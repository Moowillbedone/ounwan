"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { isNativeApp, NATIVE_AUTH_REDIRECT } from "./native";
import { KV } from "./db";
import {
  ensureSeeded,
  setCurrentOwner,
  migrateLocalDataTo,
  clearCopiedTitles,
  migrateExerciseNotes,
} from "./repo";
import { LOCAL_OWNER } from "./constants";
import {
  fullSync,
  bindRealtime,
  onSyncState,
  setOnRemoteChange,
  type SyncState,
} from "./sync";

/** 로그인 링크를 요청한 시각(앱에서 콜백 유효성 확인용) */
export const LOGIN_PENDING_KEY = "ounwan-login-pending";

/** Supabase 인증 에러(영문)를 사용자용 한국어 안내로 */
export function authErrorKo(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit"))
    return "메일 발송 한도를 넘었어요. 1시간쯤 뒤에 한 번만 다시 시도해 주세요.";
  if (m.includes("expired") || m.includes("invalid"))
    return "로그인 링크가 만료됐거나 이미 사용됐어요. 새 링크를 받아 주세요.";
  if (m.includes("email") && m.includes("valid"))
    return "이메일 주소를 다시 확인해 주세요.";
  if (m.includes("network") || m.includes("fetch"))
    return "인터넷 연결을 확인해 주세요.";
  return message;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthCtx {
  ready: boolean;
  configured: boolean;
  mode: "guest" | "user";
  user: AuthUser | null;
  guestChosen: boolean;
  sync: SyncState;
  chooseGuest: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  syncNow: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guestChosen, setGuestChosen] = useState(false);
  const [sync, setSync] = useState<SyncState>({
    status: "idle",
    lastSyncedAt: null,
    pending: 0,
  });
  const configured = isSupabaseConfigured();
  const handledRef = useRef<string | null>(null);

  const handleSignedIn = useCallback(
    async (u: AuthUser) => {
      if (handledRef.current === u.id) return;
      handledRef.current = u.id;
      setCurrentOwner(u.id);
      const migKey = `migrated:${u.id}`;
      const done = await KV.get<boolean>(migKey);
      if (!done) {
        await migrateLocalDataTo(u.id);
        await KV.set(migKey, true);
      }
      setUser(u);
      // 과거 데이터 정리·이관(로컬에 이미 있는 데이터, dirty로 표시됨)
      await clearCopiedTitles();
      await migrateExerciseNotes(); // 세션별 메모 → 종목 공유 메모
      await qc.invalidateQueries();
      bindRealtime(u.id);
      // 원격 pull 후에도 한 번 더 정리·이관(다른 기기에서 온 데이터 대비) → 변경분 재푸시
      void fullSync().then(async () => {
        const changed = (await clearCopiedTitles()) + (await migrateExerciseNotes());
        if (changed) {
          await qc.invalidateQueries();
          void fullSync();
        }
      });
    },
    [qc]
  );

  useEffect(() => {
    let unsubSync: (() => void) | undefined;
    (async () => {
      await ensureSeeded();
      await clearCopiedTitles(); // 게스트(로컬) 데이터의 과거 '복사한 운동' 제목 정리
      await migrateExerciseNotes(); // 세션별 메모 → 종목 공유 메모 이관
      const chosen = (await KV.get<boolean>("guestChosen")) ?? false;
      setGuestChosen(chosen);
      unsubSync = onSyncState(setSync);
      // 다른 기기에서 pull된 최신 데이터를 즉시 화면에 반영
      setOnRemoteChange(() => {
        void qc.invalidateQueries();
      });

      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        const su = data.session?.user;
        if (su) {
          await handleSignedIn({ id: su.id, email: su.email ?? null });
        }
        sb.auth.onAuthStateChange(async (_evt, session) => {
          const nu = session?.user;
          if (nu) {
            await handleSignedIn({ id: nu.id, email: nu.email ?? null });
          } else {
            handledRef.current = null;
            setCurrentOwner(LOCAL_OWNER);
            setUser(null);
            await qc.invalidateQueries();
          }
        });
      }
      setReady(true);
    })();
    return () => {
      if (unsubSync) unsubSync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseGuest = useCallback(async () => {
    await KV.set("guestChosen", true);
    setGuestChosen(true);
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const sb = getSupabase();
    if (!sb) return { error: "동기화 서버가 설정되지 않았습니다." };
    // 앱: 직접 로그인 링크를 요청한 경우에만 콜백을 받는다(외부에서 위조한 링크 차단용 표시)
    try {
      localStorage.setItem(LOGIN_PENDING_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      // 안드로이드 앱에서는 메일 링크가 브라우저가 아닌 앱으로 돌아오도록 전용 주소 사용
      options: {
        emailRedirectTo: isNativeApp() ? NATIVE_AUTH_REDIRECT : window.location.origin,
      },
    });
    return error ? { error: authErrorKo(error.message) } : {};
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return { error: "동기화 서버가 설정되지 않았습니다." };
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    handledRef.current = null;
    setCurrentOwner(LOCAL_OWNER);
    setUser(null);
    await qc.invalidateQueries();
  }, [qc]);

  const syncNow = useCallback(() => {
    void fullSync();
  }, []);

  const mode: "guest" | "user" = user ? "user" : "guest";

  return (
    <Ctx.Provider
      value={{
        ready,
        configured,
        mode,
        user,
        guestChosen,
        sync,
        chooseGuest,
        signInWithEmail,
        signInWithGoogle,
        signOut,
        syncNow,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
