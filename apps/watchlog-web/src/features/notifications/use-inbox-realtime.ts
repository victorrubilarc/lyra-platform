import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { inboxStreamUrl } from "./notifications-api.js";
import { NOTIF_KEYS } from "./notifications-queries.js";

/**
 * Tiempo real de la campanita: abre un `EventSource` al stream SSE del usuario y, al
 * recibir un nudge `{ type:"inbox", unread }`, actualiza el contador y refetchea la
 * lista. El poll de `useInboxUnreadCount` queda como FALLBACK (proxies que cortan SSE,
 * navegadores sin soporte): si SSE no conecta, el contador igual se mantiene fresco.
 *
 * `EventSource` reconecta solo ante caídas. Se reabre si cambia `enabled` (login/logout).
 */
export function useInboxRealtime(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const url = inboxStreamUrl();
    if (!url || typeof EventSource === "undefined") return;

    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; unread?: number };
        if (data.type === "inbox" && typeof data.unread === "number") {
          qc.setQueryData(NOTIF_KEYS.inboxUnread(), { unread: data.unread });
          void qc.invalidateQueries({ queryKey: NOTIF_KEYS.inbox() });
        }
      } catch {
        // Mensaje no-JSON (p. ej. heartbeat): se ignora.
      }
    };
    // Los errores de SSE no son fatales: EventSource reintenta y el poll cubre el hueco.
    es.onerror = () => {};

    return () => es.close();
  }, [enabled, qc]);
}
