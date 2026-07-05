import { describe, expect, it } from "vitest";

import { makePayload } from "./test-fixtures.js";
import type { LicensePayload } from "./types.js";

/**
 * T6 del PoC — clon perfecto de VM detectado por LINAJE ROTATORIO (capa 4).
 *
 * L0 solo DECLARA los campos de linaje (`renewalCounter`/`nonce` en
 * LicensePayload); el FLUJO challenge-response de renovación se construye en
 * L4. Este spec replica la lógica del PoC sobre los campos tipados para
 * dejar documentado (y protegido por test) el invariante que L4 debe honrar:
 * dos solicitudes con el MISMO linaje = sobre-despliegue detectado, y una
 * respuesta de renovación solo se puede importar UNA vez.
 */

/** Estado local de linaje de una instalación (lo persistirá L1/L4). */
interface LineageState {
  counter: number;
  nonce: string;
}

/** Solicitud de renovación (`solicitud.lreq`): presenta el linaje actual. */
const renewalRequest = (payload: Pick<LicensePayload, "licenseId">, state: LineageState) => ({
  licenseId: payload.licenseId,
  counter: state.counter,
  nonce: state.nonce,
});

/** Respuesta del emisor: atada al linaje presentado (importable UNA vez). */
interface RenewalResponse {
  expectedCounter: number;
  boundNonce: string;
  newExpiresAt: string;
}

/** La instalación solo importa una respuesta que calce con SU linaje actual. */
const importOk = (state: LineageState, response: RenewalResponse): boolean =>
  state.counter === response.expectedCounter && state.nonce === response.boundNonce;

describe("T6: clon perfecto de la VM + renovación de importación única (invariante para L4)", () => {
  const payload = makePayload({ renewalCounter: 1, nonce: "nonce-activacion-A" });

  it("el servidor A importa su renovación → OK, y rota su linaje localmente", () => {
    const estadoA: LineageState = { counter: payload.renewalCounter, nonce: payload.nonce };
    const solicitudA = renewalRequest(payload, estadoA);
    const respuestaA: RenewalResponse = {
      expectedCounter: solicitudA.counter,
      boundNonce: solicitudA.nonce,
      newExpiresAt: "2027-01-01T00:00:00Z",
    };
    expect(importOk(estadoA, respuestaA)).toBe(true);
  });

  it("el clon (copia byte a byte) no puede reutilizar la respuesta tras la rotación de A", () => {
    const estadoA: LineageState = { counter: 1, nonce: "nonce-activacion-A" };
    const estadoClon: LineageState = { ...estadoA }; // clon perfecto: mismo linaje

    // A renueva y rota: counter avanza y el nonce nuevo NUNCA sale de su máquina.
    estadoA.counter = 2;
    estadoA.nonce = "nonce-rotado-solo-en-A";
    const respuestaSiguiente: RenewalResponse = {
      expectedCounter: 2,
      boundNonce: estadoA.nonce,
      newExpiresAt: "2027-04-01T00:00:00Z",
    };

    expect(importOk(estadoClon, respuestaSiguiente)).toBe(false); // el clon quedó atrás
    expect(importOk(estadoA, respuestaSiguiente)).toBe(true);
  });

  it("el emisor recibe 2 solicitudes con el MISMO linaje → clon DETECTADO (evidencia contractual)", () => {
    const estadoA: LineageState = { counter: 1, nonce: "nonce-activacion-A" };
    const estadoClon: LineageState = { ...estadoA };
    const solicitudA = renewalRequest(payload, estadoA);
    const solicitudClon = renewalRequest(payload, estadoClon);

    const detectado =
      solicitudA.licenseId === solicitudClon.licenseId &&
      solicitudA.counter === solicitudClon.counter;
    expect(detectado).toBe(true);
  });
});
