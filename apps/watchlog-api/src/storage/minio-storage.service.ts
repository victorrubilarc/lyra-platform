import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";
import type { Env } from "../config/env.schema";
import { StorageService, type StoredObjectStat } from "./storage.service";

/**
 * Implementación MinIO/S3 de `StorageService` (SDK oficial `minio`). On-premise:
 * el contenedor `minio` del docker-compose; en prod, cualquier almacén S3-compat
 * del cliente. El bucket se crea de forma IDEMPOTENTE al arrancar.
 *
 * El `ENDPOINT` llega como URL (http(s)://host:puerto); aquí se deriva host/puerto/TLS.
 */
@Injectable()
export class MinioStorageService extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly region: string;
  private readonly presignTtl: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
    const endpoint = new URL(this.config.get("MINIO_ENDPOINT", { infer: true }));
    this.bucket = this.config.get("MINIO_BUCKET", { infer: true });
    this.region = this.config.get("MINIO_REGION", { infer: true });
    this.presignTtl = this.config.get("MINIO_PRESIGN_TTL", { infer: true });
    const useSSL = endpoint.protocol === "https:";
    this.client = new MinioClient({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port) || (useSSL ? 443 : 80),
      useSSL,
      accessKey: this.config.get("MINIO_ACCESS_KEY", { infer: true }),
      secretKey: this.config.get("MINIO_SECRET_KEY", { infer: true }),
      region: this.region,
    });
  }

  /** Crea el bucket si no existe (idempotente). Falla el arranque si no hay storage. */
  async onModuleInit(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket).catch((err) => {
      this.logger.error(`No se pudo contactar el storage de objetos: ${(err as Error).message}`);
      throw err;
    });
    if (!exists) {
      await this.client.makeBucket(this.bucket, this.region);
      this.logger.log(`Bucket de evidencia creado: ${this.bucket}`);
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, body, body.length, { "Content-Type": contentType });
  }

  async statObject(key: string): Promise<StoredObjectStat | null> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      return { size: stat.size, contentType: stat.metaData?.["content-type"] ?? "application/octet-stream" };
    } catch (err) {
      if ((err as { code?: string }).code === "NotFound") return null;
      throw err;
    }
  }

  async removeObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async listObjects(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = this.client.listObjectsV2(this.bucket, prefix, true);
      stream.on("data", (obj) => {
        if (obj.name) keys.push(obj.name);
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return keys;
  }

  async removePrefix(prefix: string): Promise<void> {
    const keys = await this.listObjects(prefix);
    if (keys.length > 0) await this.client.removeObjects(this.bucket, keys);
  }

  async presignedGetUrl(
    key: string,
    downloadName: string,
    opts?: { inline?: boolean },
  ): Promise<{ url: string; expiresAt: string }> {
    const safe = downloadName.replace(/["\\\r\n]/g, "_");
    const disposition = opts?.inline ? "inline" : "attachment";
    const url = await this.client.presignedGetObject(this.bucket, key, this.presignTtl, {
      "response-content-disposition": `${disposition}; filename="${safe}"`,
    });
    return { url, expiresAt: new Date(Date.now() + this.presignTtl * 1000).toISOString() };
  }
}
