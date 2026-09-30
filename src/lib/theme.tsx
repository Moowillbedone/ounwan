"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Accent, ThemePref } from "./types";
import { ACCENT_KEY, THEME_KEY } from "./constants";

interface ThemeCtx {
  theme: ThemePref;
  resolved: "light" | "dark";
  setTheme: (t: ThemePref) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

// 브라우저 상단바 색(홈 화면 앱·아이폰 Safari) — 테마 배경과 맞춘다
const BAR: Record<Accent, { light: string; dark: string }> = {
  green: { light: "#f6f7f9", dark: "#0a0e13" },
  pink: { light: "#fff5f8", dark: "#140c10" },
};

function apply(theme: ThemePref, accent: Accent): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  if (accent === "pink") root.setAttribute("data-accent", "pink");
  else root.removeAttribute("data-accent");
  const bar = BAR[accent];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media") ?? "";
    m.content = media.includes("dark") ? bar.dark : media.includes("light") ? bar.light : dark ? bar.dark : bar.light;
  });
  return dark ? "dark" : "light";
}

function readAccent(): Accent {
  try {
    return localStorage.getItem(ACCENT_KEY) === "pink" ? "pink" : "green";
  } catch {
    return "green";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [accent, setAccentState] = useState<Accent>("green");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemePref) || "system";
    const a = readAccent();
    setThemeState(stored);
    setAccentState(a);
    setResolved(apply(stored, a));

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const t = (localStorage.getItem(THEME_KEY) as ThemePref) || "system";
      if (t === "system") setResolved(apply("system", readAccent()));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
    setResolved(apply(t, readAccent()));
  }, []);

  const setAccent = useCallback((a: Accent) => {
    try {
      localStorage.setItem(ACCENT_KEY, a);
    } catch {
      /* noop */
    }
    setAccentState(a);
    setResolved(apply((localStorage.getItem(THEME_KEY) as ThemePref) || "system", a));
  }, []);

  return (
    <Ctx.Provider value={{ theme, resolved, setTheme, accent, setAccent }}>{children}</Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
