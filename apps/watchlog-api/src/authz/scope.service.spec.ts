import { describe, expect, it, vi } from "vitest";
import { ScopeService } from "./scope.service";
import type { PermissionService } from "./permission.service";
import type { PrismaService } from "../prisma/prisma.service";

interface ScopeRow {
  orgNodeId: string;
  includeDescendants: boolean;
  orgNode: { path: string };
}

/** PermissionService stub (sin permisos) — basta para los casos ABAC de este spec. */
function stubPermissions(): PermissionService {
  return { getEffectivePermissions: vi.fn().mockResolvedValue(new Set<string>()) } as unknown as PermissionService;
}

/** Construye ScopeService con el PermissionService stub (las pruebas solo ejercen ABAC). */
function makeScope(prisma: PrismaService): ScopeService {
  return new ScopeService(prisma, stubPermissions());
}

function makePrisma(scopes: ScopeRow[], descendants: { id: string }[]): PrismaService {
  return {
    scope: { findMany: vi.fn().mockResolvedValue(scopes) },
    orgNode: { findMany: vi.fn().mockResolvedValue(descendants) },
  } as unknown as PrismaService;
}

describe("ScopeService (ABAC, dimensión 4)", () => {
  it("sin scopes => null (acceso a toda la estructura)", async () => {
    const service = makeScope(makePrisma([], []));
    expect(await service.getAccessibleNodeIds("u1")).toBeNull();
  });

  it("expande descendientes vía la ruta materializada", async () => {
    const prisma = makePrisma(
      [{ orgNodeId: "a", includeDescendants: true, orgNode: { path: "/a/" } }],
      [{ id: "a" }, { id: "a-1" }, { id: "a-1-x" }],
    );
    const service = makeScope(prisma);
    const ids = await service.getAccessibleNodeIds("u1");
    expect(ids).not.toBeNull();
    expect([...ids!].sort()).toEqual(["a", "a-1", "a-1-x"]);
  });

  it("sin descendientes solo incluye el nodo directo", async () => {
    const prisma = makePrisma(
      [{ orgNodeId: "b", includeDescendants: false, orgNode: { path: "/b/" } }],
      [],
    );
    const service = makeScope(prisma);
    const ids = await service.getAccessibleNodeIds("u1");
    expect([...ids!]).toEqual(["b"]);
    // No debe consultar descendientes si nadie hereda.
    expect(prisma.orgNode.findMany).not.toHaveBeenCalled();
  });

  it("canAccessNode respeta el alcance", async () => {
    const restricted = makeScope(
      makePrisma([{ orgNodeId: "b", includeDescendants: false, orgNode: { path: "/b/" } }], []),
    );
    expect(await restricted.canAccessNode("u1", "b")).toBe(true);
    expect(await restricted.canAccessNode("u1", "z")).toBe(false);

    const unrestricted = makeScope(makePrisma([], []));
    expect(await unrestricted.canAccessNode("u1", "cualquiera")).toBe(true);
  });
});

function makeTemplatePrisma(rows: { templateId: string }[]): PrismaService {
  return {
    templateScope: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
}

describe("ScopeService — alcance por PLANTILLA (2.º eje ABAC)", () => {
  it("sin scopes de plantilla => null (semántica PERMISIVA: ve todas)", async () => {
    const service = makeScope(makeTemplatePrisma([]));
    expect(await service.getAccessibleTemplateIds("u1")).toBeNull();
  });

  it("con scopes => Set de ids (incluye propios + de roles, ya unidos por el OR)", async () => {
    const service = makeScope(makeTemplatePrisma([{ templateId: "t1" }, { templateId: "t2" }]));
    const ids = await service.getAccessibleTemplateIds("u1");
    expect(ids).not.toBeNull();
    expect([...ids!].sort()).toEqual(["t1", "t2"]);
  });

  it("canAccessTemplate: restringido respeta la allow-list; sin restricción todo pasa", async () => {
    const restricted = makeScope(makeTemplatePrisma([{ templateId: "t1" }]));
    expect(await restricted.canAccessTemplate("u1", "t1")).toBe(true);
    expect(await restricted.canAccessTemplate("u1", "t9")).toBe(false);

    const unrestricted = makeScope(makeTemplatePrisma([]));
    expect(await unrestricted.canAccessTemplate("u1", "cualquiera")).toBe(true);
  });

  it("assertTemplateInScope lanza 403 cuando la plantilla está fuera del alcance", async () => {
    const restricted = makeScope(makeTemplatePrisma([{ templateId: "t1" }]));
    await expect(restricted.assertTemplateInScope("u1", "t9")).rejects.toThrow();
    await expect(restricted.assertTemplateInScope("u1", "t1")).resolves.toBeUndefined();
  });
});

describe("ScopeService — visibilidad de plantilla por NODO (multi-nodo 2.8.0)", () => {
  const service = makeScope({} as unknown as PrismaService);

  it("usuario sin restricción de nodo (access=null) ve cualquier asignación", () => {
    expect(service.nodeAssignmentInScope({ orgNodeId: "x", includeDescendants: false, orgNodePath: "/x/" }, null)).toBe(true);
  });

  it("asignación directa: solo si el usuario alcanza ese nodo", () => {
    const access = { ids: new Set(["a"]), paths: new Set(["/a/"]) };
    expect(service.nodeAssignmentInScope({ orgNodeId: "a", includeDescendants: false, orgNodePath: "/a/" }, access)).toBe(true);
    expect(service.nodeAssignmentInScope({ orgNodeId: "b", includeDescendants: false, orgNodePath: "/b/" }, access)).toBe(false);
  });

  it("asignación con descendientes intersecta si el usuario alcanza un nodo BAJO la rama", () => {
    // El usuario solo alcanza un descendiente del nodo de la asignación.
    const access = { ids: new Set(["a-1"]), paths: new Set(["/a/a-1/"]) };
    expect(service.nodeAssignmentInScope({ orgNodeId: "a", includeDescendants: true, orgNodePath: "/a/" }, access)).toBe(true);
    // Sin descendientes, no alcanza la raíz de la rama => no visible.
    expect(service.nodeAssignmentInScope({ orgNodeId: "a", includeDescendants: false, orgNodePath: "/a/" }, access)).toBe(false);
  });

  it("el prefijo de ruta no colisiona entre hermanos (termina en /)", () => {
    const access = { ids: new Set(["ab"]), paths: new Set(["/ab/"]) };
    expect(service.nodeAssignmentInScope({ orgNodeId: "a", includeDescendants: true, orgNodePath: "/a/" }, access)).toBe(false);
  });

  it("isTemplateVisibleByNode: cero asignaciones = GLOBAL (visible siempre)", () => {
    const access = { ids: new Set(["a"]), paths: new Set(["/a/"]) };
    expect(service.isTemplateVisibleByNode([], access)).toBe(true);
    expect(service.isTemplateVisibleByNode([], null)).toBe(true);
  });

  it("isTemplateVisibleByNode: con asignaciones, basta que ALGUNA intersecte", () => {
    const access = { ids: new Set(["a"]), paths: new Set(["/a/"]) };
    expect(
      service.isTemplateVisibleByNode(
        [
          { orgNodeId: "z", includeDescendants: false, orgNodePath: "/z/" },
          { orgNodeId: "a", includeDescendants: false, orgNodePath: "/a/" },
        ],
        access,
      ),
    ).toBe(true);
    expect(
      service.isTemplateVisibleByNode([{ orgNodeId: "z", includeDescendants: false, orgNodePath: "/z/" }], access),
    ).toBe(false);
  });
});
