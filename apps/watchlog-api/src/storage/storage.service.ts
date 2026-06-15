/**
 * Interfaz abstracta de almacenamiento de objetos (evidencia/adjuntos). El resto
 * de la aplicación depende de esta clase (token de inyección), nunca de una
 * implementación concreta, de modo que el backend de storage (MinIO on-prem, S3,
 * etc.) se cambia sin tocar la lógica de negocio. Mismo patrón que `EmailService`.
 *
 * El navegador NUNCA recibe credenciales del bucket ni accede directo: la API es
 * el choke-point de subida (proxied, valida tamaño/tipo/auditoría) y firma las
 * descargas (presigned GET de vida corta) tras decidir la ABAC server-side.
 */
export interface StoredObjectStat {
  size: number;
  contentType: string;
}

/** Clase abstracta usada como token DI. La implementación viva la registra el módulo. */
export abstract class StorageService {
  /** Sube un objeto (sobrescribe si la key existe). `body` ya validado por el llamador. */
  abstract putObject(key: string, body: Buffer, contentType: string): Promise<void>;

  /** Metadata del objeto, o null si no existe. */
  abstract statObject(key: string): Promise<StoredObjectStat | null>;

  /** Elimina un objeto (idempotente: no falla si no existe). */
  abstract removeObject(key: string): Promise<void>;

  /** Elimina todos los objetos bajo un prefijo (limpieza de una entrada/campo). */
  abstract removePrefix(prefix: string): Promise<void>;

  /**
   * URL prefirmada de descarga (GET) de vida corta (TTL configurado). `downloadName`
   * fuerza el nombre de archivo en el navegador (Content-Disposition: attachment).
   * Devuelve también el instante de expiración (ISO) para informarlo al cliente.
   */
  abstract presignedGetUrl(key: string, downloadName: string): Promise<{ url: string; expiresAt: string }>;
}
