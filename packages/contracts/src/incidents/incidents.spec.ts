import { describe, expect, it } from "vitest";
import { incidentCode } from "./incidents.js";

describe("incidentCode", () => {
  it("formatea el correlativo como INC-#### con relleno a 4 dígitos", () => {
    expect(incidentCode(1)).toBe("INC-0001");
    expect(incidentCode(42)).toBe("INC-0042");
    expect(incidentCode(1234)).toBe("INC-1234");
  });

  it("no trunca cuando el correlativo supera 4 dígitos", () => {
    expect(incidentCode(12345)).toBe("INC-12345");
  });
});
