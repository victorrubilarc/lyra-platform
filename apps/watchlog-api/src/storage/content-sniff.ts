/**
 * Sniffing de contenido por MAGIC BYTES (firmas literales, sin dependencias).
 * Origen: `sniffLogoContentType` del branding (OOBE S3), extraído y ampliado en
 * H1 "planta restrictiva ready" (2026-07-07) para validar TODOS los archivos que
 * entran por la API (hallazgo pre-pentest: los adjuntos validaban el mimetype
 * DECLARADO por el cliente ⇒ "stored malware delivery").
 *
 * Criterio (DECISIONS 2026-07-07 (c), sin sobre-ingeniería):
 * - Tipos con firma fuerte (imagen/PDF/audio/video comunes, zip): se sniffean.
 *   Si el cliente DECLARA imagen o PDF y los bytes no lo confirman ⇒ se rechaza.
 * - Ejecutables (PE/ELF/Mach-O) se rechazan SIEMPRE, sin importar el `accept`.
 * - No-sniffables (csv/txt/office…): se aceptan por mime declarado, pero JAMÁS
 *   se sirven inline (la descarga proxied fuerza `attachment` + `nosniff`, que
 *   es la mitigación que recomienda la OWASP File Upload Cheat Sheet).
 */

/** Content-type real derivado de los magic bytes; null = sin firma conocida. */
export function sniffContentType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && (ascii(buffer, 0, 6) === "GIF87a" || ascii(buffer, 0, 6) === "GIF89a")) return "image/gif";
  if (buffer.length >= 5 && ascii(buffer, 0, 5) === "%PDF-") return "application/pdf";
  if (buffer.length >= 12 && ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WAVE") return "audio/wav";
  if (buffer.length >= 3 && ascii(buffer, 0, 3) === "ID3") return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)) {
    return "audio/mpeg";
  }
  if (buffer.length >= 4 && ascii(buffer, 0, 4) === "OggS") return "audio/ogg";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(EBML_MAGIC)) return "video/webm";
  if (buffer.length >= 12 && ascii(buffer, 4, 8) === "ftyp") return "video/mp4";
  if (buffer.length >= 4 && ascii(buffer, 0, 2) === "PK" && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "application/zip";
  }
  return null;
}

/** Binarios ejecutables: PE/Windows (MZ), ELF/Linux, Mach-O/macOS (+ fat binary). */
export function isExecutable(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true; // MZ
  if (buffer[0] === 0x7f && ascii(buffer, 1, 4) === "ELF") return true;
  const be = buffer.readUInt32BE(0);
  return be === 0xfeedface || be === 0xfeedfacf || be === 0xcefaedfe || be === 0xcffaedfe || be === 0xcafebabe;
}

/**
 * Tipos que la API acepta servir INLINE (previsualización). Todo lo demás sale
 * `Content-Disposition: attachment` aunque el cliente pida inline — en especial
 * SVG/HTML/XML, que el navegador renderiza en nuestro origen (stored XSS).
 * Con `nosniff` el navegador respeta este content-type al pie de la letra.
 */
const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/webm",
  "video/mp4",
]);

export function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE.has(contentType.toLowerCase());
}

/**
 * ¿El mime DECLARADO afirma pertenecer a una familia que SIEMPRE es sniffable?
 * (imagen bitmap o PDF: firmas fuertes y son los tipos que se previsualizan).
 * Si afirma esto y los bytes no lo confirman, la subida se rechaza. SVG queda
 * fuera (texto XML, sin firma): se acepta como evidencia pero jamás inline.
 * Audio/video NO obligan (demasiados contenedores sin firma en la lista corta).
 */
export function declaredRequiresSniff(declared: string): boolean {
  const mime = declared.toLowerCase();
  if (mime === "application/pdf") return true;
  return mime.startsWith("image/") && mime !== "image/svg+xml";
}

/** Tipos office/OpenDocument basados en ZIP: los bytes dicen `application/zip`
 *  pero el declarado es más específico y se conserva. */
const ZIP_BASED = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

export function isZipBased(declared: string): boolean {
  return ZIP_BASED.has(declared.toLowerCase());
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString("latin1");
}
