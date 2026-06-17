import { describe, expect, it } from "vitest";
import {
  blockingActionsForClose,
  hasOpenMandatoryActions,
  incidentActionCode,
  isOpenIncidentAction,
  type IncidentActionStatus,
} from "./actions.js";

const a = (mandatory: boolean, status: IncidentActionStatus) => ({ mandatory, status });

describe("incident actions — CAPA helpers", () => {
  it("isOpenIncidentAction: OPEN/IN_PROGRESS/DONE abiertas; VERIFIED/CANCELED no", () => {
    expect(isOpenIncidentAction("OPEN")).toBe(true);
    expect(isOpenIncidentAction("IN_PROGRESS")).toBe(true);
    expect(isOpenIncidentAction("DONE")).toBe(true);
    expect(isOpenIncidentAction("VERIFIED")).toBe(false);
    expect(isOpenIncidentAction("CANCELED")).toBe(false);
  });

  it("hasOpenMandatoryActions: solo cuenta obligatorias abiertas", () => {
    expect(hasOpenMandatoryActions([a(true, "OPEN")])).toBe(true);
    expect(hasOpenMandatoryActions([a(false, "OPEN")])).toBe(false);
    expect(hasOpenMandatoryActions([a(true, "VERIFIED")])).toBe(false);
    expect(hasOpenMandatoryActions([a(true, "CANCELED"), a(false, "OPEN")])).toBe(false);
  });

  describe("blockingActionsForClose", () => {
    it("sin verificación: DONE NO bloquea; OPEN/IN_PROGRESS sí", () => {
      const actions = [a(true, "OPEN"), a(true, "IN_PROGRESS"), a(true, "DONE"), a(true, "VERIFIED")];
      const blocking = blockingActionsForClose(actions, false);
      expect(blocking).toHaveLength(2); // OPEN + IN_PROGRESS
    });

    it("con verificación: DONE TAMBIÉN bloquea (solo VERIFIED libera)", () => {
      const actions = [a(true, "DONE"), a(true, "VERIFIED")];
      expect(blockingActionsForClose(actions, true)).toHaveLength(1); // el DONE
      expect(blockingActionsForClose(actions, false)).toHaveLength(0);
    });

    it("las no obligatorias nunca bloquean", () => {
      const actions = [a(false, "OPEN"), a(false, "DONE")];
      expect(blockingActionsForClose(actions, true)).toHaveLength(0);
    });
  });

  it("incidentActionCode: folio ACT-#### con padding", () => {
    expect(incidentActionCode(1)).toBe("ACT-0001");
    expect(incidentActionCode(42)).toBe("ACT-0042");
    expect(incidentActionCode(12345)).toBe("ACT-12345");
  });
});
