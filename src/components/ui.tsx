"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { X } from "lucide-react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- Button ---------------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type BtnSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 font-semibold rounded-app transition active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none";
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-brand text-white shadow-[0_4px_14px_rgba(22,196,127,0.35)]",
  secondary: "bg-surface-2 text-text border border-border",
  ghost: "text-text-2 hover:bg-surface-2",
  danger: "bg-danger text-white",
  soft: "bg-brand-soft text-brand-strong",
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-14 px-5 text-base w-full",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
}) {
  return (
    <button
      className={cn(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...props}
    />
  );
}

export function IconButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-text-2 transition active:scale-90 hover:bg-surface-2",
        className
      )}
      {...props}
    />
  );
}

/* ---------------- Card ---------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-app bg-surface border border-border shadow-[var(--shadow-card)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ---------------- Bottom Sheet ---------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="animate-sheet relative w-full max-w-[480px] rounded-t-3xl bg-surface max-h-[88vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div className="text-lg font-bold">{title}</div>
          <IconButton onClick={onClose} aria-label="닫기">
            <X size={20} />
          </IconButton>
        </div>
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border absolute top-2 left-1/2 -translate-x-1/2" />
        <div className="overflow-y-auto px-5 pb-4 flex-1">{children}</div>
        {footer && (
          <div className="px-5 pt-3 pb-4 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full bg-surface-2 p-1 gap-1 text-sm",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3.5 h-8 rounded-full font-semibold transition",
            value === o.value
              ? "bg-surface text-text shadow-sm"
              : "text-text-3"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Chip ---------------- */

export function Chip({
  color,
  children,
  className,
}: {
  color?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className
      )}
      style={
        color
          ? { backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }
          : undefined
      }
    >
      {children}
    </span>
  );
}

/* ---------------- Spinner ---------------- */

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-border border-t-brand"
      style={{ width: size, height: size }}
    />
  );
}

/* ---------------- Empty ---------------- */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="mb-3 text-text-3">{icon}</div>}
      <div className="font-bold text-text">{title}</div>
      {desc && <div className="mt-1 text-sm text-text-3 leading-relaxed">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Toast ---------------- */

type Toast = { id: number; msg: string; kind: "info" | "pr" | "error" };
const ToastCtx = createContext<{ show: (msg: string, kind?: Toast["kind"]) => void } | null>(
  null
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.floor(performance.now() % 1000);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[60] flex w-full max-w-[420px] -translate-x-1/2 flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-slide-down pointer-events-none rounded-full px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-pop)] max-w-full",
              t.kind === "pr"
                ? "bg-brand text-white"
                : t.kind === "error"
                ? "bg-danger text-white"
                : "bg-text text-[var(--bg)]"
            )}
          >
            {t.kind === "pr" && "🏆 "}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast within ToastProvider");
  return c.show;
}

/* ---------------- Confirm ---------------- */

export function useConfirm() {
  // 간단 confirm 래퍼 (프로토타입)
  return useCallback((msg: string) => window.confirm(msg), []);
}
