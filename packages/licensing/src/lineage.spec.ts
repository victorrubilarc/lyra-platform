import { describe, expect, it } from "vitest";

import { evaluateLineage, type LocalLineage } from "./lineage.js";
import { makePayload } from "./test-fixtures.js";

/**
 * T6 del PoC — clon perfecto de VM detectado por LINAJE ROTATORIO (capa 4).
 *
 * Desde L4 este spec testea el helper REAL (`evaluateLineage`), no una
 * simulación: la respuesta de renovación viaja atada al linaje PRESENTADO
 * (payload.renewalCounter = presentado + 1, payload.nonce = nonce presentado)
 * y solo se puede importar UNA vez y SOLO en esa instalación. El nonce nuevo
 * lo genera la instalación LOCALMENTE al rotar y nunca sale de su máquina.
 */

describe("evaluateLineage — retrocompatibilidad L3 (counter = 0)", () => {
  it("licencia counter=0 sobre instalación que jamás renovó → CURRENT (evalúa como antes de L4)", () => {
    const local: LocalLineage = { renewalCounter: 0, nonce: null };
    expect(evaluateLineage(makePayload({ renewalCounter: 0, nonce: "n-emision" }), local)).toBe(
      "CURRENT",
    );
  });

  it("counter=0 con nonce local ya inicializado (escribió renovacion.lreq) sigue CURRENT", () => {
    const local: LocalLineage = { renewalCounter: 0, nonce: "nonce-local-inicializado" };
    expect(evaluateLineage(makePayload({ renewalCounter: 0, nonce: "n-emision" }), local)).toBe(
      "CURRENT",
    );
  });

  it("re-importar la licencia de ACTIVACIÓN (counter=0) tras renovar NO resetea el linaje → MISMATCH", () => {
    const local: LocalLineage = { renewalCounter: 2, nonce: "nonce-actual" };
    expect(evaluateLineage(makePayload({ renewalCounter: 0, nonce: "n-emision" }), local)).toBe(
      "MISMATCH",
    );
  });
});

describe("evaluateLineage — renovación de importación única (T6)", () => {
  it("respuesta atada al linaje presentado → ROTATE (se acepta UNA vez)", () => {
    const local: LocalLineage = { renewalCounter: 0, nonce: "nonce-presentado-A" };
    const renovada = makePayload({ renewalCounter: 1, nonce: "nonce-presentado-A" });
    expect(evaluateLineage(renovada, local)).toBe("ROTATE");
  });

  it("tras rotar, la MISMA respuesta queda CURRENT (idempotente entre reinicios)", () => {
    // La rotación (efecto de L1): counter := payload.counter, nonce := fresco local.
    const rotado: LocalLineage = { renewalCounter: 1, nonce: "nonce-fresco-solo-local" };
    const renovada = makePayload({ renewalCounter: 1, nonce: "nonce-presentado-A" });
    expect(evaluateLineage(renovada, rotado)).toBe("CURRENT");
  });

  it("la licencia ANTERIOR ya no calza tras rotar → MISMATCH", () => {
    const rotado: LocalLineage = { renewalCounter: 1, nonce: "nonce-fresco-solo-local" };
    const anterior = makePayload({ renewalCounter: 0, nonce: "n-emision" });
    expect(evaluateLineage(anterior, rotado)).toBe("MISMATCH");
  });

  it("re-importar una respuesta VIEJA tras otra renovación → MISMATCH", () => {
    const local: LocalLineage = { renewalCounter: 2, nonce: "nonce-actual" };
    const respuestaVieja = makePayload({ renewalCounter: 1, nonce: "nonce-presentado-A" });
    expect(evaluateLineage(respuestaVieja, local)).toBe("MISMATCH");
  });

  it("counter+1 pero nonce que NO es el presentado (respuesta de OTRA instalación) → MISMATCH", () => {
    const local: LocalLineage = { renewalCounter: 1, nonce: "nonce-de-A" };
    const ajena = makePayload({ renewalCounter: 2, nonce: "nonce-de-B" });
    expect(evaluateLineage(ajena, local)).toBe("MISMATCH");
  });

  it("una renovada (counter>0) en una instalación SIN nonce local (jamás pidió renovar) → MISMATCH", () => {
    // Cubre mover una licencia renovada a una instalación fresca con la misma huella.
    const fresca: LocalLineage = { renewalCounter: 0, nonce: null };
    const renovada = makePayload({ renewalCounter: 1, nonce: "nonce-presentado-A" });
    expect(evaluateLineage(renovada, fresca)).toBe("MISMATCH");
  });

  it("salto de counter (+2) → MISMATCH; counter negativo o no entero → MISMATCH", () => {
    const local: LocalLineage = { renewalCounter: 0, nonce: "nonce-A" };
    expect(evaluateLineage(makePayload({ renewalCounter: 2, nonce: "nonce-A" }), local)).toBe(
      "MISMATCH",
    );
    expect(evaluateLineage(makePayload({ renewalCounter: -1, nonce: "nonce-A" }), local)).toBe(
      "MISMATCH",
    );
    expect(evaluateLineage(makePayload({ renewalCounter: 1.5, nonce: "nonce-A" }), local)).toBe(
      "MISMATCH",
    );
  });
});

describe("T6 end-to-end: clon perfecto de la VM (narrativa del PoC sobre el helper real)", () => {
  it("A renueva y rota; el clon (copia byte a byte) queda atrás y el emisor ve el linaje repetido", () => {
    // Estado tras la activación + primera solicitud de renovación de A.
    const estadoA: LocalLineage = { renewalCounter: 0, nonce: "nonce-activacion-A" };
    const estadoClon: LocalLineage = { ...estadoA }; // clon perfecto: mismo linaje

    // La respuesta del emisor viene atada al linaje presentado por A.
    const respuestaA = makePayload({ renewalCounter: 1, nonce: "nonce-activacion-A" });
    expect(evaluateLineage(respuestaA, estadoA)).toBe("ROTATE");

    // A rota: counter avanza y el nonce nuevo NUNCA sale de su máquina.
    const estadoARotado: LocalLineage = { renewalCounter: 1, nonce: "nonce-rotado-solo-en-A" };

    // Honestidad (STRATEGY §4): la PRIMERA respuesta también calzaría en el
    // clon (linajes idénticos hasta divergir) — la detección de esa ronda es
    // del EMISOR: dos solicitudes con el MISMO linaje (counter=0 repetido).
    expect(evaluateLineage(respuestaA, estadoClon)).toBe("ROTATE");
    const solicitudA = { counter: estadoA.renewalCounter, nonce: estadoA.nonce };
    const solicitudClon = { counter: estadoClon.renewalCounter, nonce: estadoClon.nonce };
    expect(solicitudA.counter).toBe(solicitudClon.counter); // ← la evidencia contractual

    // Desde la SIGUIENTE renovación el clon ya no calza nunca más:
    const respuestaSiguiente = makePayload({ renewalCounter: 2, nonce: "nonce-rotado-solo-en-A" });
    expect(evaluateLineage(respuestaSiguiente, estadoARotado)).toBe("ROTATE");
    expect(evaluateLineage(respuestaSiguiente, estadoClon)).toBe("MISMATCH");
    expect(evaluateLineage(respuestaA, estadoARotado)).toBe("CURRENT"); // la vigente sigue OK
  });
});
