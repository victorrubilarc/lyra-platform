import { useCallback, useEffect, useRef, useState } from "react";
import { handoverSummaryStreamUrl } from "./shift-handover-api.js";

/** Cierre del stream del resumen por IA (Slice 3). */
export interface SummaryStreamDone {
  text: string;
  provider: string;
  generatedByAi: boolean;
  degraded: boolean;
}

interface StartOpts {
  generalStatus?: string;
  /** Trozo de texto recién llegado (se escribe en vivo en el editor). */
  onDelta: (text: string) => void;
  /** Cierre normal: el resumen quedó completo (persistir o degradar según `degraded`). */
  onDone: (done: SummaryStreamDone) => void;
  /** Falla de transporte (SSE no conectó / se cortó): el cockpit degradará. */
  onError: () => void;
}

/**
 * Resumen de turno por IA EN VIVO vía SSE (Slice 3). Abre un `EventSource` al endpoint del
 * handover y entrega los deltas token a token. `cancel()` cierra la conexión (el backend aborta
 * la generación con el proveedor al detectar el cierre). Maneja un solo stream a la vez.
 */
export function useSummaryStream(id: string): {
  streaming: boolean;
  start: (opts: StartOpts) => void;
  cancel: () => void;
} {
  const [streaming, setStreaming] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setStreaming(false);
  }, []);

  const start = useCallback(
    ({ generalStatus, onDelta, onDone, onError }: StartOpts) => {
      const url = handoverSummaryStreamUrl(id, generalStatus);
      if (!url || typeof EventSource === "undefined") {
        onError();
        return;
      }
      esRef.current?.close();
      const es = new EventSource(url);
      esRef.current = es;
      setStreaming(true);

      es.onmessage = (ev) => {
        let data: { type?: string; text?: string } & Partial<SummaryStreamDone>;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return; // keepalive / no-JSON: ignorar
        }
        if (data.type === "delta") {
          onDelta(data.text ?? "");
        } else if (data.type === "done") {
          close();
          onDone({
            text: data.text ?? "",
            provider: data.provider ?? "none",
            generatedByAi: !!data.generatedByAi,
            degraded: !!data.degraded,
          });
        }
      };
      es.onerror = () => {
        // EventSource reintenta solo; aquí cortamos y degradamos (no dejamos spinner colgado).
        close();
        onError();
      };
    },
    [id, close],
  );

  // Cierra el stream si el componente se desmonta a mitad (no se persiste parcial).
  useEffect(() => () => close(), [close]);

  return { streaming, start, cancel: close };
}
