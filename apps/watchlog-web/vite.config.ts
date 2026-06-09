import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
