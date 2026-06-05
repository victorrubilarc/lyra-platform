import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  isPermissionKey,
} from "./permissions.js";

describe("catálogo de permisos", () => {
  it("no tiene claves duplicadas", () => {
    const unique = new Set(ALL_PERMISSION_KEYS);
    expect(unique.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("todas las claves siguen la convención recurso:accion", () => {
    for (const def of PERMISSION_CATALOG) {
      expect(def.key).toMatch(/^[a-z]+(:[a-z0-9->]+)+$/);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it("reconoce claves válidas y rechaza desconocidas", () => {
    expect(isPermissionKey("user:create")).toBe(true);
    expect(isPermissionKey("user:explode")).toBe(false);
  });
});
