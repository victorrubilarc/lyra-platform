import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { BrandingService, sniffLogoContentType } from "./branding.service";

/**
 * Branding runtime (OOBE S3). Se afirma: (1) el DTO PÚBLICO es mínimo (lista
 * cerrada de claves — nada de licencia/huella se filtra a anónimos), (2) el
 * gate whiteLabel viene del payload verificado (L6d), (3) la validación del
 * logo es por MAGIC BYTES con SVG rechazado y tope de tamaño, (4) subir/quitar
 * audita y quitar es idempotente.
 */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("resto-del-png"),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jfif")]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "latin1"),
  Buffer.from("vp8 "),
]);
const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);

interface Row {
  companyDisplayName?: string | null;
  defaultThemeMode?: string | null;
  logoData?: Uint8Array | null;
  logoContentType?: string | null;
  logoUpdatedAt?: Date | null;
}

function build(opts: { row?: Row | null; whiteLabel?: boolean } = {}) {
  const prisma = {
    systemSettings: {
      findUnique: vi.fn(async () => opts.row ?? null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const license = { isWhiteLabelEnabled: vi.fn(() => opts.whiteLabel ?? false) };
  return {
    service: new BrandingService(prisma as never, audit as never, license as never),
    prisma,
    audit,
    license,
  };
}

const ACTOR = { id: "u1", email: "admin@demo.cl" };

describe("sniffLogoContentType (magic bytes)", () => {
  it("reconoce PNG, JPEG y WebP por sus bytes reales", () => {
    expect(sniffLogoContentType(PNG)).toBe("image/png");
    expect(sniffLogoContentType(JPEG)).toBe("image/jpeg");
    expect(sniffLogoContentType(WEBP)).toBe("image/webp");
  });

  it("rechaza SVG (XSS), texto arbitrario y buffers vacíos", () => {
    expect(sniffLogoContentType(SVG)).toBeNull();
    expect(sniffLogoContentType(Buffer.from("MZ\x90\x00exe"))).toBeNull();
    expect(sniffLogoContentType(Buffer.alloc(0))).toBeNull();
    // RIFF sin WEBP (p. ej. un .wav) tampoco pasa.
    expect(
      sniffLogoContentType(
        Buffer.concat([Buffer.from("RIFF????WAVE", "latin1"), Buffer.alloc(4)]),
      ),
    ).toBeNull();
  });
});

describe("BrandingService.getBranding (DTO público mínimo)", () => {
  it("expone EXACTAMENTE las claves presentables, nada más (mínimo privilegio)", async () => {
    const { service } = build({
      row: {
        companyDisplayName: "Minera Demo",
        defaultThemeMode: "light",
        logoContentType: "image/png",
        logoUpdatedAt: new Date("2026-07-06T12:00:00Z"),
      },
      whiteLabel: true,
    });
    const dto = await service.getBranding();
    expect(Object.keys(dto).sort()).toEqual([
      "companyName",
      "defaultThemeMode",
      "hasLogo",
      "logoVersion",
      "whiteLabel",
    ]);
    expect(dto).toMatchObject({
      companyName: "Minera Demo",
      defaultThemeMode: "light",
      hasLogo: true,
      whiteLabel: true,
    });
    expect(dto.logoVersion).toBeTruthy();
  });

  it("sin fila: todo null/false (instalación sin personalizar) y whiteLabel del gate L6d", async () => {
    const { service, license } = build({ row: null, whiteLabel: false });
    const dto = await service.getBranding();
    expect(dto).toEqual({
      companyName: null,
      hasLogo: false,
      logoVersion: null,
      defaultThemeMode: null,
      whiteLabel: false,
    });
    expect(license.isWhiteLabelEnabled).toHaveBeenCalled();
  });

  it("defaultThemeMode anómalo en BD se sanea a null (jamás revienta)", async () => {
    const { service } = build({ row: { defaultThemeMode: "neon" } });
    expect((await service.getBranding()).defaultThemeMode).toBeNull();
  });
});

describe("BrandingService.setLogo (validación en el borde)", () => {
  it("acepta un PNG válido: upsert con el content-type REAL + auditoría", async () => {
    const { service, prisma, audit } = build({ row: null });
    await service.setLogo({ buffer: PNG, filename: "logo.png" }, ACTOR);
    const call = (prisma.systemSettings.upsert.mock.calls as unknown[][])[0]?.[0] as {
      update: { logoContentType: string };
    };
    expect(call.update.logoContentType).toBe("image/png");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branding.logo.updated",
        after: expect.objectContaining({ contentType: "image/png", hasLogo: true }),
      }),
    );
  });

  it("rechaza el tipo por MAGIC BYTES (SVG con content-type mentiroso incluido)", async () => {
    const { service, prisma } = build({ row: null });
    await expect(service.setLogo({ buffer: SVG, filename: "logo.png" }, ACTOR)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.setLogo({ buffer: Buffer.from("no soy imagen") }, ACTOR),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BRANDING_LOGO_UNSUPPORTED_TYPE" }),
    });
    expect(prisma.systemSettings.upsert).not.toHaveBeenCalled();
  });

  it("rechaza sobre 512KB y streams truncados por el borde Fastify", async () => {
    const { service } = build({ row: null });
    const big = Buffer.concat([PNG, Buffer.alloc(512 * 1024)]);
    await expect(service.setLogo({ buffer: big }, ACTOR)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BRANDING_LOGO_TOO_LARGE" }),
    });
    await expect(service.setLogo({ buffer: PNG, truncated: true }, ACTOR)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BRANDING_LOGO_TOO_LARGE" }),
    });
  });
});

describe("BrandingService.removeLogo", () => {
  it("quita el logo existente y lo audita (before/after sin bytes)", async () => {
    const { service, prisma, audit } = build({
      row: { logoData: Uint8Array.from(PNG), logoContentType: "image/png" },
    });
    await service.removeLogo(ACTOR);
    expect(prisma.systemSettings.update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branding.logo.removed",
        before: expect.objectContaining({ hasLogo: true, contentType: "image/png" }),
        after: expect.objectContaining({ hasLogo: false }),
      }),
    );
  });

  it("es idempotente: sin logo no escribe ni audita en falso", async () => {
    const { service, prisma, audit } = build({ row: null });
    await service.removeLogo(ACTOR);
    expect(prisma.systemSettings.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("BrandingService.getLogo", () => {
  it("null sin logo; con logo devuelve bytes + ETag fuerte (sha256 citado)", async () => {
    const { service: sin } = build({ row: null });
    expect(await sin.getLogo()).toBeNull();

    const { service: con } = build({
      row: { logoData: Uint8Array.from(PNG), logoContentType: "image/png" },
    });
    const logo = await con.getLogo();
    expect(logo?.contentType).toBe("image/png");
    expect(logo?.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(Buffer.compare(logo!.data, PNG)).toBe(0);
  });
});
