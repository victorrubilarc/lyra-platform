import "./process-shim"; // DEBE ir primero: define `process` para react-grid-layout (ver archivo).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ApiError } from "./lib/api-client";
import { notifyForbidden } from "./lib/forbidden-notice";
import "./i18n/i18n";
import "./styles/main.css";

// Caché compartida: las "pestañas de trabajo" preservan su estado sin refrescos.
// `staleTime` evita refetch al re-abrir una pestaña recién vista.
//
// `queryCache.onError` da feedback transversal ante un 403: sin esto, una grilla
// sin permiso quedaba muda (KPIs 0/0/0, consola llena de 403). El aviso se emite
// una vez (con throttle) vía el puente `forbidden-notice` → toast (QA#6).
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) {
        notifyForbidden(error.message);
      }
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("No se encontró el elemento #root");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
