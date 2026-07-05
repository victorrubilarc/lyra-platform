/**
 * Helpers internos de codificación del JWS compacto (`header.payload.firma`
 * en base64url, RFC 7515). NO forman parte de la API pública del paquete.
 */

export const toBase64Url = (data: Buffer | string): string =>
  Buffer.from(data).toString("base64url");

export const fromBase64Url = (segment: string): Buffer =>
  Buffer.from(segment, "base64url");
