import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseActivationRequest, readActivationRequest } from "./request.js";
import { makeRequestFixture } from "./test-fixtures.js";

describe("solicitud.lreq (validación de entrada de la CLI)", () => {
  let dir: string;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("acepta la solicitud EXACTA que escribe LicenseService en L1", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-req-"));
    const path = join(dir, "solicitud.lreq");
    writeFileSync(path, JSON.stringify(makeRequestFixture(), null, 2), "utf8");
    const parsed = readActivationRequest(path);
    expect(parsed.installationId).toBe("inst_test_fixture");
    expect(parsed.fingerprint).toBe("0123456789abcdef0123456789abcdef");
  });

  it("rechaza producto ajeno, huella malformada y campos faltantes", () => {
    expect(() =>
      parseActivationRequest(makeRequestFixture({ product: "otro-producto" }), "req"),
    ).toThrow(/product/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ fingerprint: "XYZ" }), "req"),
    ).toThrow(/fingerprint/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ installationId: " " }), "req"),
    ).toThrow(/installationId/);
    expect(() => parseActivationRequest("no-es-objeto", "req")).toThrow(/objeto/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ generatedAt: "ayer" }), "req"),
    ).toThrow(/generatedAt/);
  });
});
