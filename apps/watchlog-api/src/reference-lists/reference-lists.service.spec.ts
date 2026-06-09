import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceListsService } from "./reference-lists.service";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    referenceList: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "l1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "l1", ...data })),
    },
    referenceItem: {
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "i1", ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "i1", ...data })),
      delete: vi.fn().mockResolvedValue({ id: "i1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new ReferenceListsService(prisma, audit), prisma, audit };
}

describe("ReferenceListsService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea una lista y registra auditoría", async () => {
    const { service, audit } = makeService();
    const list = await service.create({ key: "failure-modes", name: "Modos de falla" }, ctx);
    expect(list.key).toBe("failure-modes");
    expect(list.items).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "referencelist.created", entityType: "ReferenceList" }),
    );
  });

  it("traduce la clave duplicada (P2002) a BadRequest", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
    const { service } = makeService({
      referenceList: { create: vi.fn().mockRejectedValue(p2002) },
    });
    await expect(service.create({ key: "dup", name: "x" }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza crear ítem si la lista no existe", async () => {
    const { service } = makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createItem("ghost", { code: "VIB", label: "Vibración" }, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("traduce el code duplicado por lista (P2002) a BadRequest", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
    const { service } = makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue({ id: "l1" }) },
      referenceItem: { create: vi.fn().mockRejectedValue(p2002) },
    });
    await expect(
      service.createItem("l1", { code: "VIB", label: "x" }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("no permite borrar una lista en uso por una plantilla", async () => {
    const { service } = makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue({ id: "l1", key: "failure-modes", name: "X" }) },
      $queryRaw: vi.fn().mockResolvedValue([{ count: 2n }]),
    });
    await expect(service.remove("l1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("borra lógicamente una lista sin uso (set deletedAt) y audita", async () => {
    const update = vi.fn().mockResolvedValue({ id: "l1" });
    const { service, audit } = makeService({
      referenceList: {
        findFirst: vi.fn().mockResolvedValue({ id: "l1", key: "k", name: "X" }),
        update,
      },
      $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
    });
    await service.remove("l1", ctx);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "referencelist.deleted" }));
  });

  it("resuelve solo ítems activos como opciones {code,label,metadata}", async () => {
    const { service } = makeService({
      referenceList: {
        findFirst: vi.fn().mockResolvedValue({
          id: "l1",
          key: "failure-modes",
          items: [
            { code: "VIB", label: "Vibración", metadata: { isoCategory: "FM" } },
            { code: "LEAK", label: "Fuga", metadata: null },
          ],
        }),
      },
    });
    const opts = await service.resolve("failure-modes");
    expect(opts).toEqual([
      { code: "VIB", label: "Vibración", metadata: { isoCategory: "FM" } },
      { code: "LEAK", label: "Fuga", metadata: null },
    ]);
  });

  it("resolve lanza NotFound si la lista no existe", async () => {
    const { service } = makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.resolve("ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});
