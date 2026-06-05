import { useCallback } from "react";
import { logout as logoutRequest, fetchSession } from "./auth-api.js";
import { useAuthStore } from "./auth-store.js";

/** Acceso ergonómico a la sesión y a las acciones de auth de uso común. */
export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  /** Cierra sesión en el backend y limpia el estado local. */
  const signOut = useCallback(async () => {
    await logoutRequest();
    clear();
  }, [clear]);

  /** Recarga `/auth/me` (p. ej. tras cambiar la contraseña o roles propios). */
  const refreshSession = useCallback(async () => {
    const next = await fetchSession();
    setSession(next);
    return next;
  }, [setSession]);

  return {
    status,
    session,
    user: session?.user ?? null,
    isAuthenticated: status === "authenticated",
    signOut,
    refreshSession,
  };
}
