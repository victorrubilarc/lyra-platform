import { describe, expect, it, vi } from "vitest";
import { ScopeService } from "./scope.service";
import type { PrismaService } from "../prisma/prisma.service";

interface ScopeRow {
  orgNodeId: string;
  includeDescendants: boolean;
  orgNode: { path: string };
}

function makePrisma(scopes: ScopeRow[], descendants: { id: string }[]): PrismaService {
  return {
    scope: { findMany: vi.fn().mockResolvedValue(scopes) },
    orgNode: { findMany: vi.fn().mockResolvedValue(descendants) },
  } as unknown as PrismaService;
}

describe("ScopeService (ABAC, dimensión 4)", () => {
  it("sin scopes => null (acceso a toda la estructura)", async () => {
    const service = new ScopeService(makePrisma([], []));
    expect(await service.getAccessibleNodeIds("u1")).toBeNull();
  });

  it("expande descendientes vía la ruta materializada", async () => {
    const prisma = makePrisma(
      [{ orgNodeId: "a", includeDescendants: true, orgNode: { path: "/a/" } }],
      [{ id: "a" }, { id: "a-1" }, { id: "a-1-x" }],
    );
    const service = new ScopeService(prisma);
    const ids = await service.getAccessibleNodeIds("u1");
    expect(ids).not.toBeNull();
    expect([...ids!].sort()).toEqual(["a", "a-1", "a-1-x"]);
  });

  it("sin descendientes solo incluye el nodo directo", async () => {
    const prisma = makePrisma(
      [{ orgNodeId: "b", includeDescendants: false, orgNode: { path: "/b/" } }],
      [],
    );
    const service = new ScopeService(prisma);
    const ids = await service.getAccessibleNodeIds("u1");
    expect([...ids!]).toEqual(["b"]);
    // No debe consultar descendientes si nadie hereda.
    expect(prisma.orgNode.findMany).not.toHaveBeenCalled();
  });

  it("canAccessNode respeta el alcance", async () => {
    const restricted = new ScopeService(
      makePrisma([{ orgNodeId: "b", includeDescendants: false, orgNode: { path: "/b/" } }], []),
    );
    expect(await restricted.canAccessNode("u1", "b")).toBe(true);
    expect(await restricted.canAccessNode("u1", "z")).toBe(false);

    const unrestricted = new ScopeService(makePrisma([], []));
    expect(await unrestricted.canAccessNode("u1", "cualquiera")).toBe(true);
  });
});
