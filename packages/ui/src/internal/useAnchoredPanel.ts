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
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(r.width, 260);
    // Espacio REAL disponible para el panel a cada lado del trigger.
    const spaceBelow = vh - r.bottom - margin - gap;
    const spaceAbove = r.top - margin - gap;
    const absCap = Math.round(vh * 0.7);
    // Altura NATURAL (contenido completo) del panel. Se mide SIN el `maxHeight`
    // vigente: como la lista interna tiene su PROPIO overflow, el `scrollHeight`
    // del panel ya restringido = su alto actual, y al borrar el filtro el panel
    // se quedaba pequeño (no podía RECRECER). Quitar el tope un instante (en
    // useLayoutEffect, antes de pintar ⇒ sin parpadeo) deja medir el alto real.
    const el = panelRef.current;
    let natural = absCap;
    if (el) {
      const prevMaxHeight = el.style.maxHeight;
      el.style.maxHeight = "none";
      natural = el.scrollHeight;
      el.style.maxHeight = prevMaxHeight;
    }
    // Altura deseada acotada al tope (no a la medición previa del panel).
    const wantHeight = Math.min(natural, absCap);
    // Abre hacia arriba si no cabe abajo y arriba hay más espacio.
    const openUp = wantHeight > spaceBelow && spaceAbove > spaceBelow;
    const avail = openUp ? spaceAbove : spaceBelow;
    // La altura NUNCA excede el espacio disponible → jamás se sale del viewport.
    const maxHeight = Math.max(120, Math.min(wantHeight, avail));
    const left = Math.max(margin, Math.min(r.left, vw - width - margin));
    const next: CSSProperties = { position: "fixed", left, width, maxHeight, visibility: "visible" };
    if (openUp) next.bottom = vh - r.top + gap;
    else next.top = r.bottom + gap;
    setStyle(next);
  }, [triggerRef, panelRef]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({ position: "fixed", visibility: "hidden" });
      return;
    }
    compute();
    // Recalcula al hacer scroll/resize del DOCUMENTO o de un ancestro, pero NO
    // cuando el scroll proviene de DENTRO del propio panel (el scroll de la lista
    // no debe re-anclar ni re-medir el panel: causaba el encogimiento al arrastrar
    // la barra del selector).
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      compute();
    };
    const onResize = () => compute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, compute, ...deps]);

  return style;
}
