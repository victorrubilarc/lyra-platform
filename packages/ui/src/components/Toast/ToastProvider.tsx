import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "../../cx.js";
import styles from "./Toast.module.css";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastOptions {
  variant?: ToastVariant;
  /** Milisegundos visibles. Por defecto 4500. `0` = no se cierra solo. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "variant">> {
  id: number;
  message: string;
  duration: number;
}

interface ToastApi {
  toast: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, "variant">) => void;
  error: (message: string, options?: Omit<ToastOptions, "variant">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const DEFAULT_DURATION = 4500;
/** No apilar más de 2 toasts simultáneos (regla del Design System). */
const MAX_VISIBLE = 2;

/**
 * Proveedor de notificaciones tipo toast. Envuelve la app una vez y expone
 * `useToast()` para emitir avisos desde cualquier componente.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        message,
        variant: options?.variant ?? "info",
        duration: options?.duration ?? DEFAULT_DURATION,
      };
      setToasts((prev) => [...prev, item].slice(-MAX_VISIBLE));
      if (item.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration),
        );
      }
    },
    [dismiss],
  );

  // Limpia los timers pendientes al desmontar el provider.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (message, options) => push(message, { ...options, variant: "success" }),
      error: (message, options) => push(message, { ...options, variant: "error" }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className={styles.viewport} role="region" aria-label="Notificaciones">
            {toasts.map((t) => {
              const Icon = ICONS[t.variant];
              return (
                <div key={t.id} className={cx(styles.toast, styles[t.variant])} role="status">
                  <span className={styles.icon}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className={styles.message}>{t.message}</span>
                  <button
                    type="button"
                    className={styles.close}
                    onClick={() => dismiss(t.id)}
                    aria-label="Cerrar notificación"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/** Accede a la API de toasts. Debe usarse dentro de `<ToastProvider>`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
