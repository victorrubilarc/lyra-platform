import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Metadatos de versión inyectados en tiempo de build (para que el usuario sepa qué
 * versión usa y de cuándo es). En PRODUCCIÓN los provee el release (Docker build-args
 * desde el tag git): `VITE_APP_VERSION` (ej. v0.1.6), `VITE_GIT_SHA`, `VITE_BUILD_DATE`.
 * En DESARROLLO caen a "dev" + el commit local + el instante del arranque de Vite.
 */
function gitShaFallback(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
const APP_VERSION = process.env.VITE_APP_VERSION || "dev";
const GIT_SHA = process.env.VITE_GIT_SHA || gitShaFallback();
const BUILD_DATE = process.env.VITE_BUILD_DATE || new Date().toISOString();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __GIT_SHA__: JSON.stringify(GIT_SHA),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  // El .env vive en la raíz del monorepo (compartido con el API). Vite solo
  // expone al cliente las variables con prefijo VITE_ (branding, no secretos).
  envDir: "../../",
  // Los paquetes internos del monorepo (@lyra/*) se consumen DESDE SU FUENTE
  // (exports → src). Sin esto, Vite los pre-empaqueta como dependencias y NO
  // recarga (HMR) los cambios al editar su código → la web queda servida con una
  // versión vieja del paquete. Excluirlos fuerza el transform en caliente con HMR.
  optimizeDeps: {
    exclude: ["@lyra/ui", "@lyra/contracts", "@lyra/permissions"],
  },
  server: {
    port: 5173,
    // No derivar a 5174+ si 5173 está ocupado: el script predev (free-port)
    // libera el puerto antes de arrancar, así que aquí exigimos quedarnos en él.
    strictPort: true,
    // El watcher debe seguir los cambios en packages/* (symlinks de pnpm) para
    // que editar un componente de @lyra/ui recargue la web en caliente.
    watch: {
      ignored: ["!**/packages/**"],
    },
    proxy: {
      // En desarrollo, /api se redirige al backend NestJS.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
