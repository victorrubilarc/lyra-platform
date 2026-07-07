import { createHash } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  BRANDING_LOGO_MAX_BYTES,
  setupThemeModeSchema,
  type BrandingDto,
  type BrandingLogoContentType,
} from "@lyra/contracts";
import { AuditService } from "../audit/audit.service";
import { LicenseService } from "../licensing/license.service";
import { PrismaService } from "../prisma/prisma.service";
import { sniffContentType } from "../storage/content-sniff";

const SINGLETON_ID = "system";

/** Quién sube/quita el logo (JWT en /configuracion; `system@setup` en el wizard). */
export interface BrandingActor {
  id?: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

export interface LogoUpload {
  buffer: Buffer;
  filename?: string;
  /** Flag de @fastify/multipart: el stream superó el tope duro del borde. */
  truncated?: boolean;
}

/**
 * Branding RUNTIME de la instalación (OOBE S3, BACKLOG §2(5) → épico §2(2)).
 *
 * `getBranding()` alimenta un endpoint PÚBLICO (el login lo necesita SIN
 * sesión): devuelve SOLO lo presentable — nombre visible, si hay logo, el modo
 * de tema por defecto y el gate `whiteLabel` del payload de licencia VERIFICADO
 * (L6d). Nada de licencia/installationId/huella/versión sale por aquí.
 *
 * El logo vive EN LA BD (bytes, decisión 2026-07-06 — NO MinIO): es un
 * singleton ≤512KB pre-auth y `pg_dump` lo respalda con el resto de la
 * identidad. La validación es por MAGIC BYTES (PNG/JPEG/WebP); SVG se rechaza
 * (XSS por scripts embebidos, sin sanitizador no se sirve).
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
  ) {}

  /** DTO público de branding: la lista COMPLETA de lo que un anónimo puede saber. */
  async getBranding(): Promise<BrandingDto> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: {
        companyDisplayName: true,
        defaultThemeMode: true,
        logoContentType: true,
        logoUpdatedAt: true,
      },
    });
    const themeMode = setupThemeModeSchema.safeParse(row?.defaultThemeMode);
    return {
      companyName: row?.companyDisplayName ?? null,
      hasLogo: row?.logoContentType != null,
      // Token opaco de caché: cambia con cada subida (la web arma ?v=<logoVersion>).
      logoVersion:
        row?.logoContentType != null && row.logoUpdatedAt
          ? row.logoUpdatedAt.getTime().toString(36)
          : null,
      defaultThemeMode: themeMode.success ? themeMode.data : null,
      // L6d cableado: whiteLabel del payload VERIFICADO; sin payload no se afirma.
      whiteLabel: this.license.isWhiteLabelEnabled(),
    };
  }

  /** Bytes del logo para servir (null si no hay). El ETag es el sha256 del contenido. */
  async getLogo(): Promise<{ data: Buffer; contentType: string; etag: string } | null> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { logoData: true, logoContentType: true },
    });
    if (!row?.logoData || !row.logoContentType) return null;
    const data = Buffer.from(row.logoData);
    return {
      data,
      contentType: row.logoContentType,
      etag: `"${createHash("sha256").update(data).digest("hex")}"`,
    };
  }

  /**
   * Sube/reemplaza el logo. El tipo REAL se deriva de los magic bytes (el
   * content-type declarado por el cliente no se confía); tope 512KB. Auditado.
   */
  async setLogo(upload: LogoUpload, actor: BrandingActor): Promise<void> {
    if (upload.truncated || upload.buffer.length > BRANDING_LOGO_MAX_BYTES) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        code: "BRANDING_LOGO_TOO_LARGE",
        message: `El logo supera el máximo de ${Math.floor(BRANDING_LOGO_MAX_BYTES / 1024)} KB.`,
      });
    }
    const contentType = sniffLogoContentType(upload.buffer);
    if (contentType === null) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        code: "BRANDING_LOGO_UNSUPPORTED_TYPE",
        message:
          "Formato de logo no soportado: sube una imagen PNG, JPEG o WebP. " +
          "SVG no está permitido por seguridad.",
      });
    }

    const before = await this.logoAuditShape();
    const now = new Date();
    // Copia a Uint8Array<ArrayBuffer>: el tipo Bytes de Prisma no acepta Buffer
    // (su ArrayBufferLike admite SharedArrayBuffer).
    const logoData = Uint8Array.from(upload.buffer);
    await this.prisma.systemSettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        logoData,
        logoContentType: contentType,
        logoUpdatedAt: now,
        updatedById: actor.id,
      },
      update: {
        logoData,
        logoContentType: contentType,
        logoUpdatedAt: now,
        ...(actor.id !== undefined ? { updatedById: actor.id } : {}),
      },
    });
    await this.audit.record({
      action: "branding.logo.updated",
      actorId: actor.id,
      actorEmail: actor.email,
      entityType: "SystemSettings",
      entityId: SINGLETON_ID,
      before,
      after: { hasLogo: true, contentType, sizeBytes: upload.buffer.length },
      metadata: upload.filename !== undefined ? { filename: upload.filename } : undefined,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  /** Quita el logo (idempotente: sin logo no hace nada ni audita en falso). */
  async removeLogo(actor: BrandingActor): Promise<void> {
    const before = await this.logoAuditShape();
    if (!before.hasLogo) return;
    await this.prisma.systemSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        logoData: null,
        logoContentType: null,
        logoUpdatedAt: null,
        ...(actor.id !== undefined ? { updatedById: actor.id } : {}),
      },
    });
    await this.audit.record({
      action: "branding.logo.removed",
      actorId: actor.id,
      actorEmail: actor.email,
      entityType: "SystemSettings",
      entityId: SINGLETON_ID,
      before,
      after: { hasLogo: false, contentType: null, sizeBytes: null },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  /** Foto auditable del logo actual (jamás los bytes: solo tipo y tamaño). */
  private async logoAuditShape(): Promise<{
    hasLogo: boolean;
    contentType: string | null;
    sizeBytes: number | null;
  }> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { logoData: true, logoContentType: true },
    });
    return {
      hasLogo: row?.logoContentType != null,
      contentType: row?.logoContentType ?? null,
      sizeBytes: row?.logoData ? row.logoData.length : null,
    };
  }
}

/**
 * Deriva el content-type REAL desde los magic bytes; null = no permitido para un
 * LOGO (lista cerrada PNG/JPEG/WebP: se sirve inline pre-auth). SVG (texto XML)
 * jamás calza — rechazo por diseño. El sniffing vive en el helper compartido
 * `storage/content-sniff.ts` (H1 lo extendió a los adjuntos de evidencia).
 */
export function sniffLogoContentType(buffer: Buffer): BrandingLogoContentType | null {
  const sniffed = sniffContentType(buffer);
  return sniffed === "image/png" || sniffed === "image/jpeg" || sniffed === "image/webp"
    ? (sniffed as BrandingLogoContentType)
    : null;
}
