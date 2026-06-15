// Polyfill mínimo de `process` para el navegador.
//
// `react-grid-layout` / `react-draggable` (de origen CommonJS) referencian
// `process.env.NODE_ENV` en runtime (p. ej. su helper `log` al iniciar un arrastre).
// Vite NO define `process` en el navegador en modo dev ⇒ se lanza
// `ReferenceError: process is not defined` y el arrastre/redimensionado del lienzo
// queda muerto. En producción Vite ya reemplaza `process.env.NODE_ENV` al compilar,
// así que este shim solo actúa en dev. Debe importarse ANTES que cualquier código que
// cargue esas librerías (primer import de `main.tsx`).
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
if (typeof g.process === "undefined") {
  g.process = { env: { NODE_ENV: import.meta.env.MODE } };
}
