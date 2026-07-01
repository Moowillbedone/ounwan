"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ThemePref } from "./types";
import { THEME_KEY } from "./constants";

interface ThemeCtx {
  theme: ThemePref;
  resolved: "light" | "dark";
  setTheme: (t: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function apply(theme: ThemePref): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemePref) || "system";
    setThemeState(stored);
    setResolved(apply(stored));

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const t = (localStorage.getItem(THEME_KEY) as ThemePref) || "system";
      if (t === "system") setResolved(apply("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  return (
    <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
