import { create } from "zustand";
import type { SessionInfo } from "@lyra/contracts";

/** Estado de autenticación de la sesión actual (en React). */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  /** Perfil + permisos efectivos + alcance que entrega el backend. */
  session: SessionInfo | null;
  /** Reemplaza la sesión tras login/refresh/me. */
  setSession: (session: SessionInfo) => void;
  /** Marca la sesión como no autenticada (logout o refresh fallido). */
  clear: () => void;
  /** Marca el arranque como resuelto sin sesión. */
  setUnauthenticated: () => void;
}

/**
 * Store de sesión. El access token NO vive aquí (está en memoria en
 * session-token.ts); este store solo guarda lo que la UI necesita renderizar:
 * usuario, permisos efectivos y alcance.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  setSession: (session) => set({ session, status: "authenticated" }),
  clear: () => set({ session: null, status: "unauthenticated" }),
  setUnauthenticated: () => set({ status: "unauthenticated" }),
}));
