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
import { KV } from "./db";
import {
  ensureSeeded,
  setCurrentOwner,
  migrateLocalDataTo,
} from "./repo";
import { LOCAL_OWNER } from "./constants";
import { fullSync, bindRealtime, onSyncState, type SyncState } from "./sync";

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
      await qc.invalidateQueries();
      bindRealtime(u.id);
      void fullSync();
    },
    [qc]
  );

  useEffect(() => {
    let unsubSync: (() => void) | undefined;
    (async () => {
      await ensureSeeded();
      const chosen = (await KV.get<boolean>("guestChosen")) ?? false;
      setGuestChosen(chosen);
      unsubSync = onSyncState(setSync);

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
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
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
