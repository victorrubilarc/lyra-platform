import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Posiciona un panel flotante (portal, `position: fixed`) anclado a un trigger,
 * MIDIENDO la altura real del panel para decidir si abre hacia abajo o hacia
 * arriba (flip) y acotando su altura al espacio disponible — nunca se corta
 * fuera del viewport. Patrón Floating UI: se mide en `useLayoutEffect` (antes de
 * pintar) por lo que no hay parpadeo. Recalcula en scroll/resize y cuando cambian
 * las `deps` (p. ej. la cantidad de ítems filtrados altera la altura).
 *
 * El panel parte oculto (`visibility: hidden`) hasta tener una posición válida.
 */
export function useAnchoredPanel(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = [],
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });

  const compute = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.max(r.width, 260);
    // Altura natural del panel (sin el clamp) para decidir la dirección.
    const panelH = panelRef.current?.scrollHeight ?? 0;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    // Abre hacia arriba solo si abajo no alcanza para el panel y arriba hay más sitio.
    const openUp = panelH > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(panelH || Infinity, openUp ? spaceAbove : spaceBelow));
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    const next: CSSProperties = { position: "fixed", left, width, maxHeight, visibility: "visible" };
    if (openUp) next.bottom = window.innerHeight - r.top + gap;
    else next.top = r.bottom + gap;
    setStyle(next);
  }, [triggerRef, panelRef]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({ position: "fixed", visibility: "hidden" });
      return;
    }
    compute();
    const onMove = () => compute();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, compute, ...deps]);

  return style;
}
