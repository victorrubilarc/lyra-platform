import type { Readable } from "node:stream";

/**
 * Interfaz abstracta de almacenamiento de objetos (evidencia/adjuntos). El resto
 * de la aplicación depende de esta clase (token de inyección), nunca de una
 * implementación concreta, de modo que el backend de storage (MinIO on-prem, S3,
 * etc.) se cambia sin tocar la lógica de negocio. Mismo patrón que `EmailService`.
 *
 * El navegador NUNCA recibe credenciales del bucket ni accede directo: la API es
 * el choke-point en AMBOS sentidos — subida proxied (valida tamaño/tipo/auditoría)
 * y descarga proxied (`getObject` streaming tras decidir la ABAC server-side).
 * El storage no necesita exposición de red alguna fuera del compose.
 */
export interface StoredObjectStat {
  size: number;
  contentType: string;
}

export interface StoredObject extends StoredObjectStat {
  stream: Readable;
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

  /** Lista las keys de los objetos bajo un prefijo (recursivo). */
  abstract listObjects(prefix: string): Promise<string[]>;

  /**
   * Contenido de un objeto como stream (descarga PROXIED por la API), con su
   * metadata. Lanza si el objeto no existe (el llamador ya resolvió/validó la
   * key desde datos persistidos). El stream se entrega tal cual a la respuesta
   * HTTP: no se bufferiza el archivo completo en memoria.
   */
  abstract getObject(key: string): Promise<StoredObject>;
}
