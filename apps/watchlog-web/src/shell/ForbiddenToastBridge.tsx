import { useEffect } from "react";
import { useToast } from "@lyra/ui";
import { setOnForbidden } from "../lib/forbidden-notice.js";

/**
 * Conecta el aviso de 403 del QueryCache global (que vive fuera de React) con el
 * sistema de toasts. Debe montarse DENTRO de <ToastProvider>. Al recibir un 403
 * muestra un aviso claro de "sin acceso" en vez de dejar la pantalla muda (QA#6).
 */
export function ForbiddenToastBridge() {
  const toast = useToast();
  useEffect(() => {
    setOnForbidden((message) => {
      toast.error(
        message && message !== "Forbidden"
          ? message
          : "Sin acceso: no tienes permiso para ver este contenido.",
      );
    });
    return () => setOnForbidden(null);
  }, [toast]);
  return null;
}
