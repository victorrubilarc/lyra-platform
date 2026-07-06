import { describe, expect, it } from "vitest";
import type { LicenseStatus } from "@lyra/contracts";
import { licenseBannerFor } from "./license-banner.js";

function dto(over: Partial<LicenseStatus>): LicenseStatus {
  return { status: "VALIDA", modules: ["core"], ...over } as LicenseStatus;
}

describe("licenseBannerFor (presentación del banner L6)", () => {
  it("VALIDA (o sin DTO) no muestra nada", () => {
    expect(licenseBannerFor(undefined)).toBeNull();
    expect(licenseBannerFor(dto({}))).toBeNull();
  });

  it("POR_VENCER: aviso warning SOLO admins, descartable, con días y vencimiento", () => {
    const p = licenseBannerFor(
      dto({ status: "POR_VENCER", daysToExpiry: 12, expiresAt: "2026-10-01T00:00:00Z" }),
    );
    expect(p).toEqual({
      key: "expiring",
      tone: "warning",
      audience: "admins",
      dismissible: true,
      days: 12,
      expiresAt: "2026-10-01T00:00:00Z",
    });
  });

  it("EN_GRACIA: prominente para TODOS, descartable por sesión, con días de gracia", () => {
    const p = licenseBannerFor(
      dto({ status: "EN_GRACIA", daysToExpiry: -5, graceDaysRemaining: 9, expiresAt: "2026-06-30T00:00:00Z" }),
    );
    expect(p).toMatchObject({ key: "grace", tone: "warning", audience: "all", dismissible: true, days: 9 });
  });

  it("estados restringidos: TODOS y NUNCA descartables", () => {
    expect(licenseBannerFor(dto({ status: "SOLO_LECTURA", reason: "EXPIRED_BEYOND_GRACE" }))).toMatchObject({
      key: "readonly",
      tone: "error",
      audience: "all",
      dismissible: false,
    });
    expect(licenseBannerFor(dto({ status: "BLOQUEADA", reason: "INVALID_SIGNATURE", modules: null }))).toMatchObject({
      key: "blocked",
      dismissible: false,
    });
    expect(licenseBannerFor(dto({ status: "PENDIENTE_ACTIVACION", reason: "LICENSE_FILE_MISSING", modules: null }))).toMatchObject({
      key: "pending",
      tone: "info",
      dismissible: false,
    });
  });

  it("BLOQUEADA por LINEAGE_MISMATCH tiene texto humano propio (L4)", () => {
    const p = licenseBannerFor(dto({ status: "BLOQUEADA", reason: "LINEAGE_MISMATCH" }));
    expect(p?.key).toBe("lineage");
    expect(p?.dismissible).toBe(false);
  });

  it("LIMITE_EXCEDIDO: warning solo admins, descartable", () => {
    expect(licenseBannerFor(dto({ status: "LIMITE_EXCEDIDO", reason: "LIMITS_EXCEEDED" }))).toMatchObject({
      key: "limits",
      audience: "admins",
      dismissible: true,
    });
  });
});
