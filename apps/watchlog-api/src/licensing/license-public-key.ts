/**
 * Clave PÚBLICA de verificación de licencias, EMBEBIDA como constante compilada.
 *
 * Regla de gobernanza (CLAUDE.md §Licenciamiento + docs/LICENSING.md §4): la
 * pública JAMÁS llega por variable de entorno ni por configuración — una pública
 * configurable sería un bypass trivial (el atacante la reemplaza por la suya y
 * se firma licencias con keygen). Solo puede cambiar recompilando la app.
 *
 * ⚠️ HOY esta constante es la pública del par DEV committeado en
 * `scripts/license/dev-keys/` (su privada NO es secreto: solo firma licencias
 * que aceptan builds de desarrollo). En L3/L5 el build de PRODUCCIÓN del CI la
 * REEMPLAZA por la pública real de emisión (cuya privada nace y vive bajo
 * custodia — HSM/gestor, jamás en repo/imagen/.env). Hasta entonces, ninguna
 * imagen construida desde este repo es apta para distribuirse comercialmente
 * (registrado en docs/BACKLOG.md §2(1)).
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEALkA4aPZTDvqCNs+D96OJR0ioDvaHFHc08sifu07x+Vk=
-----END PUBLIC KEY-----
`;
