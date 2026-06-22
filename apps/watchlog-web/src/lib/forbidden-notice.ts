/**
 * Puente módulo→React para avisar de respuestas 403 (sin acceso) detectadas por
 * el QueryCache global, que vive FUERA del árbol de React. Mismo patrón que
 * `session-token.ts`/`notifySessionExpired`: un componente montado dentro del
 * <ToastProvider> registra el handler con `setOnForbidden`; el QueryCache lo
 * dispara con `notifyForbidden`.
 *
 * Throttle: una página puede lanzar varias queries que fallan 403 a la vez; sin
 * acotar saldría una avalancha de toasts idénticos. Solo emitimos uno por ventana.
 */
let onForbidden: ((message?: string) => void) | null = null;

/** Ventana de silencio (ms) entre avisos de 403 para evitar avalanchas. */
const THROTTLE_MS = 4000;
let lastNotifiedAt = 0;

/** Registra el handler que la app usa para mostrar el aviso de "sin acceso". */
export function setOnForbidden(cb: ((message?: string) => void) | null): void {
  onForbidden = cb;
}

/** Avisa de un 403 (con throttle) si hay un handler registrado. */
export function notifyForbidden(message?: string): void {
  const now = Date.now();
  if (now - lastNotifiedAt < THROTTLE_MS) return;
  lastNotifiedAt = now;
  onForbidden?.(message);
}
