"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertIcon, CheckIcon, CloseIcon, ShieldIcon } from "@/components/icons";

type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
};

type ToastContextValue = {
  push: (toast: { kind?: ToastKind; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastKind, { ring: string; icon: ReactNode }> = {
  success: {
    ring: "ring-emerald-200",
    icon: <CheckIcon className="h-5 w-5 text-emerald-600" />,
  },
  error: { ring: "ring-rose-200", icon: <AlertIcon className="h-5 w-5 text-rose-600" /> },
  info: { ring: "ring-brand-200", icon: <ShieldIcon className="h-5 w-5 text-brand-600" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    ({ kind = "success", title, description }) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, kind, title, description }].slice(-4));
      setTimeout(() => remove(id), 5200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ kind: "success", title, description }),
      error: (title, description) => push({ kind: "error", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2.5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-pop rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[var(--shadow-float)] ring-1 ring-inset backdrop-blur ${STYLES[toast.kind].ring}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5">{STYLES[toast.kind].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar aviso"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
    };
  }
  return context;
}
