import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "@lyra/ui";
import styles from "./ResizableSplit.module.css";

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** Clave de localStorage para persistir el ancho. Si se omite, no persiste. */
  storageKey?: string;
  /** Ancho inicial del panel izquierdo (px). */
  defaultLeftWidth?: number;
  /** Mínimo del panel izquierdo (px) — evita que colapse a un sliver invisible. */
  minLeftWidth?: number;
  /** Mínimo que se reserva al panel derecho (px) — el izquierdo no puede comerse todo. */
  minRightWidth?: number;
  /** Paso de las flechas del teclado (px). */
  keyStep?: number;
}

/**
 * Split horizontal redimensionable con el mouse/teclado/táctil.
 * El panel izquierdo tiene ancho explícito en px (auto-ajusta su contenido con
 * ellipsis, nunca recorta); el derecho ocupa el resto. Sin límites arbitrarios:
 * solo mínimos sensatos para que ningún panel desaparezca. En móvil (<768px)
 * los paneles se apilan y el divisor se oculta.
 */
export function ResizableSplit({
  left,
  right,
  storageKey,
  defaultLeftWidth = 300,
  minLeftWidth = 220,
  minRightWidth = 360,
  keyStep = 24,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (storageKey) {
      try {
        const saved = Number(localStorage.getItem(storageKey));
        if (Number.isFinite(saved) && saved > 0) return saved;
      } catch {
        /* localStorage no disponible */
      }
    }
    return defaultLeftWidth;
  });
  const [dragging, setDragging] = useState(false);

  /** Limita el ancho a [minLeftWidth, anchoContenedor − minRightWidth]. */
  const clamp = useCallback(
    (w: number) => {
      const el = containerRef.current;
      const max = el ? el.clientWidth - minRightWidth : Number.POSITIVE_INFINITY;
      return Math.max(minLeftWidth, Math.min(w, Math.max(minLeftWidth, max)));
    },
    [minLeftWidth, minRightWidth],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    setDragging(true);

    const onMove = (ev: globalThis.PointerEvent) => {
      setLeftWidth(clamp(startW + (ev.clientX - startX)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setLeftWidth((w) => clamp(w - keyStep));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setLeftWidth((w) => clamp(w + keyStep));
    }
  };

  // Persiste el ancho elegido.
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(Math.round(leftWidth)));
    } catch {
      /* localStorage no disponible */
    }
  }, [leftWidth, storageKey]);

  // Re-clampa si el contenedor cambia de tamaño (ventana, sidebar, etc.).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLeftWidth((w) => clamp(w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamp]);

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.left} style={{ width: leftWidth }}>
        {left}
      </div>
      <div
        className={cx(styles.handle, dragging && styles.handleActive)}
        onPointerDown={onPointerDown}
        onDoubleClick={() => setLeftWidth(defaultLeftWidth)}
        onKeyDown={onKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar paneles"
        tabIndex={0}
      />
      <div className={styles.right}>{right}</div>
    </div>
  );
}
