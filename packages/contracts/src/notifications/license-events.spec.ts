import { describe, expect, it } from "vitest";
import {
  allowedVariablesForEvent,
  isNotificationEventKey,
  notificationEventDef,
} from "./events.js";

/**
 * Eventos de LICENCIA del catálogo (L6): existen, con el origen correcto, y sus
 * variables respetan el mínimo privilegio (jamás licenseId/customer/huella/linaje).
 */
describe("eventos de licencia (L6)", () => {
  const KEYS = ["license.state.changed", "license.expiring", "license.restricted"] as const;

  it("las tres claves existen en el catálogo con grupo license", () => {
    for (const key of KEYS) {
      expect(isNotificationEventKey(key)).toBe(true);
      expect(notificationEventDef(key)?.group).toBe("license");
    }
  });

  it("state.changed es tx (lo emite la transición en caliente); los otros dos son derived (barrido)", () => {
    expect(notificationEventDef("license.state.changed")?.origin).toBe("tx");
    expect(notificationEventDef("license.expiring")?.origin).toBe("derived");
    expect(notificationEventDef("license.restricted")?.origin).toBe("derived");
  });

  it("mínimo privilegio: ninguna variable expone identidad de la licencia ni de la instalación", () => {
    const forbidden = ["licenseId", "customer", "fingerprint", "installationId", "nonce", "renewalCounter"];
    for (const key of KEYS) {
      for (const name of allowedVariablesForEvent(key)) {
        for (const bad of forbidden) {
          expect(name.toLowerCase()).not.toContain(bad.toLowerCase());
        }
      }
    }
  });

  it("state.changed expone el de→a de la transición", () => {
    const vars = allowedVariablesForEvent("license.state.changed");
    expect(vars.has("license.fromStatus")).toBe(true);
    expect(vars.has("license.toStatus")).toBe(true);
    expect(vars.has("license.daysLeft")).toBe(true);
  });
});
