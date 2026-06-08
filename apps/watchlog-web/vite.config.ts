import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El .env vive en la raíz del monorepo (compartido con el API). Vite solo
  // expone al cliente las variables con prefijo VITE_ (branding, no secretos).
  envDir: "../../",
  server: {
    port: 5173,
    // No derivar a 5174+ si 5173 está ocupado: el script predev (free-port)
    // libera el puerto antes de arrancar, así que aquí exigimos quedarnos en él.
    strictPort: true,
    proxy: {
      // En desarrollo, /api se redirige al backend NestJS.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
