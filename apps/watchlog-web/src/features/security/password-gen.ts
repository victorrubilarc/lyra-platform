/**
 * Genera una contraseña temporal robusta (el usuario la cambiará al primer
 * ingreso). Evita caracteres ambiguos (O/0, l/1) para dictado por canal seguro.
 * No es criptografía de producción: solo una temporal de un solo uso efectivo.
 */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*?";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(chars, 12)}${pick(symbols, 2)}`;
}
