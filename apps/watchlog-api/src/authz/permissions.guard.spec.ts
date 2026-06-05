import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from "./authz.decorators";
import { PermissionsGuard } from "./permissions.guard";
import type { PermissionService } from "./permission.service";

function makeContext(user: { id: string } | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: string[] | undefined, mode: "all" | "any" = "all"): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, "getAllAndOverride").mockImplementation((key: unknown) => {
    if (key === PERMISSIONS_KEY) return required;
    if (key === PERMISSIONS_MODE_KEY) return mode;
    return undefined;
  });
  return reflector;
}

function makePermissions(held: string[]): PermissionService {
  return {
    getEffectivePermissions: async () => new Set(held),
  } as unknown as PermissionService;
}

describe("PermissionsGuard", () => {
  it("permite cuando no hay permisos requeridos", async () => {
    const guard = new PermissionsGuard(makeReflector(undefined), makePermissions([]));
    expect(await guard.canActivate(makeContext({ id: "u1" }))).toBe(true);
  });

  it("permite (modo all) cuando el usuario tiene TODOS los permisos", async () => {
    const guard = new PermissionsGuard(
      makeReflector(["user:read", "user:create"]),
      makePermissions(["user:read", "user:create", "role:read"]),
    );
    expect(await guard.canActivate(makeContext({ id: "u1" }))).toBe(true);
  });

  it("deniega (modo all) cuando falta algún permiso", async () => {
    const guard = new PermissionsGuard(
      makeReflector(["user:read", "user:create"]),
      makePermissions(["user:read"]),
    );
    await expect(guard.canActivate(makeContext({ id: "u1" }))).rejects.toThrow(ForbiddenException);
  });

  it("permite (modo any) con al menos un permiso", async () => {
    const guard = new PermissionsGuard(
      makeReflector(["a", "b"], "any"),
      makePermissions(["b"]),
    );
    expect(await guard.canActivate(makeContext({ id: "u1" }))).toBe(true);
  });

  it("deniega si no hay usuario autenticado", async () => {
    const guard = new PermissionsGuard(makeReflector(["user:read"]), makePermissions([]));
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(ForbiddenException);
  });
});
