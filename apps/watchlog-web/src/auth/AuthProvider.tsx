import { useEffect, type ReactNode } from "react";
import { refreshAccessToken } from "../lib/api-client.js";
import {
  getExpiresAt,
  notifySessionExpired,
  setOnSessionExpired,
} from "../lib/session-token.js";
import { fetchSession } from "./auth-api.js";
import { useAuthStore } from "./auth-store.js";

/** Margen (ms) con que se refresca el token ANTES de que expire. */
const REFRESH_LEAD_MS = 30_000;
/** Piso de espera para no encadenar refrescos si la expiración ya pasó. */
const MIN_REFRESH_DELAY_MS = 5_000;

/**
 * Cablea el ciclo de vida de la sesión:
 *  1. Al arrancar, intenta rehidratar el access token desde la cookie de
 *     refresh y, si lo logra, carga el perfil (`/auth/me`).
 *  2. Mientras hay sesión, programa un refresh proactivo antes de cada
 *     expiración para evitar peticiones fallidas.
 *  3. Reacciona al cierre de sesión irrecuperable limpiando el estado.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setUnauthenticated = useAuthStore((s) => s.setUnauthenticated);
  const status = useAuthStore((s) => s.status);

  // 1) Bootstrap + handler de expiración.
  useEffect(() => {
    let active = true;
    setOnSessionExpired(() => useAuthStore.getState().clear());

    void (async () => {
      const ok = await refreshAccessToken();
      if (!active) return;
      if (!ok) {
        setUnauthenticated();
        return;
      }
      try {
        const session = await fetchSession();
        if (active) setSession(session);
      } catch {
        if (active) setUnauthenticated();
      }
    })();

    return () => {
      active = false;
      setOnSessionExpired(null);
    };
  }, [setSession, setUnauthenticated]);

  // 2) Refresh proactivo mientras la sesión esté activa.
  useEffect(() => {
    if (status !== "authenticated") return;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = (): void => {
      const expiresAt = getExpiresAt();
      if (!expiresAt) return;
      const delay = Math.max(expiresAt - Date.now() - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS);
      timer = setTimeout(() => {
        void refreshAccessToken().then((ok) => {
          if (ok) schedule();
          else notifySessionExpired();
        });
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, [status]);

  return <>{children}</>;
}
