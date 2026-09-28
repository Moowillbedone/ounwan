import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// NEXT_PUBLIC_ 값은 빌드 타임에 인라인됨(정적 익스포트).
// 미설정 시 null → 앱은 게스트(로컬 전용) 모드로 완전 동작.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (typeof window === "undefined") return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "ounwan-auth",
        // 안드로이드 앱: PKCE — 메일 링크가 앱으로 돌아올 때 토큰 대신 1회용 code만 오고,
        // 이 앱이 보관한 verifier가 있어야 세션으로 바뀐다. 다른 앱이 com.ounwan.app:// 링크를
        // 가로채거나 위조해도(남의 계정 토큰 주입 등) 쓸 수 없다.
        flowType: Capacitor.isNativePlatform() ? "pkce" : "implicit",
      },
    });
  }
  return _client;
}
