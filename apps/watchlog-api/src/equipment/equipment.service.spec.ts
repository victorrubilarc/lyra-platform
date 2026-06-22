import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentService } from "./equipment.service";
import type { AuditService } from "../audit/audit.service";
import type { ScopeService } from "../authz/scope.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    orgNode: { count: vi.fn().mockResolvedValue(1) },
    equipmentCategory: {
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    equipment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "eq1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "eq1", ...data })),
    },
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = {
    getAccessibleNodeIds: vi.fn().mockResolvedValue(null), // null = sin restricción
  } as unknown as ScopeService;
  return { service: new EquipmentService(prisma, audit, scope), prisma, audit, scope };
}

describe("EquipmentService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea un equipo válido y registra auditoría", async () => {
    const { service, audit } = makeService();
    const eq = await service.create(
      { name: "Moldurera", orgNodeId: "n1", categoryId: "cat-1" },
      ctx,
    );
    expect(eq.name).toBe("Moldurera");
    expect(eq.orgNodeId).toBe("n1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "equipment.created", entityType: "Equipment" }),
    );
  });

  it("rechaza crear si el nodo no existe", async () => {
    const { service } = makeService({ orgNode: { count: vi.fn().mockResolvedValue(0) } });
    await expect(service.create({ name: "X", orgNodeId: "nope" }, ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rechaza crear si la categoría no existe", async () => {
    const { service } = makeService({
      equipmentCategory: { count: vi.fn().mockResolvedValue(0) },
    });
    await expect(
      service.create({ name: "X", orgNodeId: "n1", categoryId: "ghost" }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("traduce el conflicto de tag único (P2002) a BadRequest", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
    });
    const { service } = makeService({
      orgNode: { count: vi.fn().mockResolvedValue(1) },
      equipmentCategory: { count: vi.fn().mockResolvedValue(1) },
      equipment: { create: vi.fn().mockRejectedValue(p2002) },
    });
    await expect(
      service.create({ name: "X", orgNodeId: "n1", tag: "DUP" }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("borra lógicamente (set deletedAt) y audita", async () => {
    const update = vi.fn().mockResolvedValue({ id: "eq1" });
    const { service, audit } = makeService({
      equipment: {
        findFirst: vi.fn().mockResolvedValue({ id: "eq1", name: "X", deletedAt: null }),
        update,
      },
    });
    await service.delete("eq1", ctx);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "eq1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "equipment.deleted" }),
    );
  });

  it("delete lanza NotFound si el equipo no existe", async () => {
    const { service } = makeService({
      equipment: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.delete("ghost", ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("no permite borrar una categoría en uso", async () => {
    const { service } = makeService({
      equipmentCategory: { findUnique: vi.fn().mockResolvedValue({ id: "c1", name: "Motor" }) },
      equipment: { count: vi.fn().mockResolvedValue(3) },
    });
    await expect(service.deleteCategory("c1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("borra una categoría sin equipos asociados", async () => {
    const del = vi.fn().mockResolvedValue({ id: "c1" });
    const { service, audit } = makeService({
      equipmentCategory: {
        findUnique: vi.fn().mockResolvedValue({ id: "c1", name: "Motor" }),
        delete: del,
      },
      equipment: { count: vi.fn().mockResolvedValue(0) },
    });
    await service.deleteCategory("c1", ctx);
    expect(del).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "equipment.category.deleted" }),
    );
  });

  it("listByNode filtra equipos vivos del nodo, ordenados", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ equipment: { findMany } });
    await service.listByNode("n1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgNodeId: "n1", deletedAt: null } }),
    );
  });

  it("searchAccessible ignora términos de menos de 2 caracteres", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeService({ equipment: { findMany } });
    expect(await service.searchAccessible("u1", "a")).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("searchAccessible devuelve [] si el usuario no alcanza ningún nodo (ABAC)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service, scope } = makeService({ equipment: { findMany } });
    (scope.getAccessibleNodeIds as ReturnType<typeof vi.fn>).mockResolvedValue(new Set());
    expect(await service.searchAccessible("u1", "weinig")).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("searchAccessible acota a los nodos accesibles y busca por nombre/tag/código", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "eq1", name: "Moldurera Weinig 1" }]);
    const { service, scope } = makeService({ equipment: { findMany } });
    (scope.getAccessibleNodeIds as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["n1", "n2"]));
    const res = await service.searchAccessible("u1", "weinig");
    expect(res).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          orgNodeId: { in: ["n1", "n2"] },
          OR: expect.arrayContaining([
            { name: { contains: "weinig", mode: "insensitive" } },
          ]),
        }),
      }),
    );
  });
});
