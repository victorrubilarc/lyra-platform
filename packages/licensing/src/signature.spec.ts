import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { fromBase64Url, toBase64Url } from "./jws.js";
import { signLicense, verifyLicense } from "./signature.js";
import { makeKeyPairPem, makePayload } from "./test-fixtures.js";
import type { LicensePayload } from "./types.js";

const issuer = makeKeyPairPem(); // ITESICWS: privada de emisión + pública embebida

describe("firma y verificación Ed25519 (capa 1) — paridad con el PoC", () => {
  it("T1: licencia legítima → ok con el payload íntegro (linaje incluido)", () => {
    const payload = makePayload();
    const lic = signLicense(payload, issuer.privateKeyPem);
    expect(lic.split(".")).toHaveLength(3);

    const result = verifyLicense(lic, issuer.publicKeyPem);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
      // Los campos de linaje (capa 4) sobreviven el viaje firma→verificación.
      expect(result.payload.renewalCounter).toBe(1);
      expect(result.payload.nonce).toBe("nonce-inicial-0001");
    }
  });

  it("T2: payload adulterado (maxInstallations 1→100) reusando la firma → INVALID_SIGNATURE", () => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [header, body, signature] = lic.split(".") as [string, string, string];
    const abierto = JSON.parse(fromBase64Url(body).toString("utf8")) as LicensePayload;
    abierto.limits.maxInstallations = 100; // "me regalo 99 instalaciones"
    const adulterada = `${header}.${toBase64Url(JSON.stringify(abierto))}.${signature}`;

    const result = verifyLicense(adulterada, issuer.publicKeyPem);
    expect(result).toMatchObject({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it("T3: keygen — el atacante firma con SU propia clave privada → INVALID_SIGNATURE", () => {
    const pirata = makeKeyPairPem();
    const forjada = signLicense(makePayload(), pirata.privateKeyPem);

    const result = verifyLicense(forjada, issuer.publicKeyPem);
    expect(result).toMatchObject({ ok: false, reason: "INVALID_SIGNATURE" });
  });
});

describe("bordes de formato (entrada corrupta, sin excepciones tragadas)", () => {
  it("texto que no es un JWS → MALFORMED_JWS", () => {
    expect(verifyLicense("esto no es una licencia", issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "MALFORMED_JWS",
    });
  });

  it("JWS truncado (2 segmentos) o con segmento vacío → MALFORMED_JWS", () => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [header, body] = lic.split(".") as [string, string, string];
    expect(verifyLicense(`${header}.${body}`, issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "MALFORMED_JWS",
    });
    expect(verifyLicense(`${header}..firma`, issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "MALFORMED_JWS",
    });
  });

  it("cabecera que no es JSON → MALFORMED_JWS", () => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [, body, signature] = lic.split(".") as [string, string, string];
    const rota = `${toBase64Url("no-json")}.${body}.${signature}`;
    expect(verifyLicense(rota, issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "MALFORMED_JWS",
    });
  });

  it("firma truncada/corrupta con formato válido → INVALID_SIGNATURE", () => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [header, body, signature] = lic.split(".") as [string, string, string];
    const corta = `${header}.${body}.${signature.slice(0, 10)}`;
    expect(verifyLicense(corta, issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "INVALID_SIGNATURE",
    });
  });

  it("alg distinto de EdDSA en la cabecera → UNSUPPORTED_ALG (RFC 8725: el verificador fija el alg)", () => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [, body, signature] = lic.split(".") as [string, string, string];
    for (const alg of ["RS256", "none"]) {
      const conAlgAjeno = `${toBase64Url(JSON.stringify({ alg, typ: "JWT" }))}.${body}.${signature}`;
      expect(verifyLicense(conAlgAjeno, issuer.publicKeyPem)).toMatchObject({
        ok: false,
        reason: "UNSUPPORTED_ALG",
      });
    }
  });
});

describe("bordes de payload (firmado pero inservible)", () => {
  /** Firma un cuerpo arbitrario con la clave real (firma VÁLIDA, contenido malo). */
  const signRaw = (rawBody: string): string => {
    const lic = signLicense(makePayload(), issuer.privateKeyPem);
    const [header] = lic.split(".") as [string, string, string];
    // Reconstruye el JWS a mano firmando header.rawBody con node:crypto.
    const body = toBase64Url(rawBody);
    const signature = sign(
      null,
      Buffer.from(`${header}.${body}`),
      createPrivateKey(issuer.privateKeyPem),
    );
    return `${header}.${body}.${toBase64Url(signature)}`;
  };

  it("payload firmado que no es JSON → INVALID_PAYLOAD", () => {
    expect(verifyLicense(signRaw("esto no es json"), issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "INVALID_PAYLOAD",
    });
  });

  it("payload JSON al que le falta un campo obligatorio → INVALID_PAYLOAD con detalle", () => {
    const incompleto = { ...makePayload() } as Record<string, unknown>;
    delete incompleto.licenseId;
    const result = verifyLicense(signRaw(JSON.stringify(incompleto)), issuer.publicKeyPem);
    expect(result).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    if (!result.ok) expect(result.detail).toContain("licenseId");
  });

  it("payload JSON escalar (no objeto) → INVALID_PAYLOAD", () => {
    expect(verifyLicense(signRaw('"hola"'), issuer.publicKeyPem)).toMatchObject({
      ok: false,
      reason: "INVALID_PAYLOAD",
    });
  });
});

describe("llaves incorrectas = error explícito del llamador (lanza, no estado)", () => {
  it("firmar/verificar con una clave que no es Ed25519 → lanza", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecPriv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const ecPub = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => signLicense(makePayload(), ecPriv)).toThrow(/Ed25519/);
    expect(() => verifyLicense("a.b.c", ecPub)).toThrow(/Ed25519/);
  });

  it("PEM inválido → lanza (misconfiguración, no un estado de licencia)", () => {
    expect(() => signLicense(makePayload(), "no soy un PEM")).toThrow();
    expect(() => verifyLicense("a.b.c", "no soy un PEM")).toThrow();
  });
});
