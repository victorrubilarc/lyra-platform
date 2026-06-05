import { describe, expect, it } from "vitest";
import { can, canAll, canAny, createPermissionChecker } from "./index.js";

const granted = ["module:security:view", "user:read", "user:create"];

describe("permisos — funciones puras", () => {
  it("can: detecta presencia y ausencia", () => {
    expect(can(granted, "user:read")).toBe(true);
    expect(can(granted, "user:create")).toBe(true);
    expect(can(granted, "user:disable")).toBe(false);
  });

  it("canAll: exige todos; lista vacía es true", () => {
    expect(canAll(granted, ["user:read", "user:create"])).toBe(true);
    expect(canAll(granted, ["user:read", "user:disable"])).toBe(false);
    expect(canAll(granted, [])).toBe(true);
  });

  it("canAny: basta uno; lista vacía es false", () => {
    expect(canAny(granted, ["user:disable", "user:read"])).toBe(true);
    expect(canAny(granted, ["user:disable", "role:manage"])).toBe(false);
    expect(canAny(granted, [])).toBe(false);
  });
});

describe("createPermissionChecker", () => {
  it("reusa el mismo conjunto y responde igual que las funciones puras", () => {
    const checker = createPermissionChecker(granted);
    expect(checker.can("module:security:view")).toBe(true);
    expect(checker.canAll(["user:read", "user:create"])).toBe(true);
    expect(checker.canAny(["nope", "user:read"])).toBe(true);
    expect(checker.granted.has("user:read")).toBe(true);
  });

  it("acepta un Set sin volver a copiarlo en cada chequeo", () => {
    const checker = createPermissionChecker(new Set(granted));
    expect(checker.can("user:read")).toBe(true);
    expect(checker.can("user:disable")).toBe(false);
  });
});
