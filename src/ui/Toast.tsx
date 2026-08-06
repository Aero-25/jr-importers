import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'warn' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  warn: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5" />,
  error: <XCircle className="h-5 w-5" />,
  warn: <AlertTriangle className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success/40 text-success',
  error: 'border-danger/40 text-danger',
  warn: 'border-warn/40 text-warn',
  info: 'border-info/40 text-info',
};

/** Errors stay until dismissed; everything else clears itself. */
const TTL: Record<ToastTone, number> = { success: 3500, info: 4000, warn: 6000, error: 0 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, detail }]);

      const ttl = TTL[tone];
      if (ttl > 0) window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push('success', title, detail),
      error: (title, detail) => push('error', title, detail),
      warn: (title, detail) => push('warn', title, detail),
      info: (title, detail) => push('info', title, detail),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          // `assertive` would interrupt a screen reader mid-sentence; these are
          // confirmations, not alarms.
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex animate-fade-up items-start gap-3 rounded-lg border bg-surface p-3 shadow-lift',
                TONE_STYLES[toast.tone],
              )}
            >
              <span aria-hidden className="mt-0.5 shrink-0">
                {ICONS[toast.tone]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 text-xs text-ink-muted">{toast.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}
