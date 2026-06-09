import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceListsService } from "./reference-lists.service";
import type { AuditService } from "../audit/audit.service";
import type { Env } from "../config/env.schema";
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
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "i1", ...data })),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "i1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({ id: "i1" }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
    ...overrides,
  } as unknown as PrismaService;
  // $transaction ejecuta el callback con el propio mock (sirve de tx).
  const bag = prisma as unknown as Record<string, unknown>;
  if (!bag.$transaction) {
    bag.$transaction = vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  }
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const config = { get: vi.fn().mockReturnValue(5000) } as unknown as ConfigService<Env, true>;
  return { service: new ReferenceListsService(prisma, audit, config), prisma, audit, config };
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

describe("ReferenceListsService — export/import CSV", () => {
  beforeEach(() => vi.clearAllMocks());

  const listRow = { id: "l1", key: "fallas", name: "Fallas", deletedAt: null };
  const dbItems = [
    { id: "i1", listId: "l1", code: "VIB", label: "Vibración", active: true, sortOrder: 10, metadata: { isoCategory: "ELP" } },
    { id: "i2", listId: "l1", code: "LEAK", label: "Fuga", active: true, sortOrder: 20, metadata: null },
  ];

  it("exporta con ';', metadata aplanada y BOM", async () => {
    const { service } = makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue({ ...listRow, items: dbItems }) },
    });
    const { filename, csv } = await service.exportCsv("l1");
    expect(filename).toMatch(/^lista-fallas-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("code;label;active;sortOrder;metadata.isoCategory");
    expect(lines[1]).toBe("VIB;Vibración;true;10;ELP");
    expect(lines[2]).toBe("LEAK;Fuga;true;20;");
  });

  function importSetup(items = dbItems) {
    return makeService({
      referenceList: { findFirst: vi.fn().mockResolvedValue(listRow) },
      referenceItem: {
        findMany: vi.fn().mockResolvedValue(items),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });
  }

  const csvBody =
    "code;label;active;sortOrder;metadata.isoCategory\r\n" +
    "VIB;Vibración;true;10;ELP\r\n" + // sin cambios
    "LEAK;Fuga externa;true;20;ELU\r\n" + // update (label + metadata)
    "OVHT;Sobrecalentamiento;;30;OHE\r\n"; // create

  it("dry-run calcula el diff (create/update/unchanged) SIN escribir", async () => {
    const { service, prisma, audit } = importSetup();
    const report = await service.importCsv("l1", { content: csvBody, dryRun: true }, ctx);
    expect(report.applied).toBe(false);
    expect(report.summary).toEqual({ creates: 1, updates: 1, unchanged: 1, deactivates: 0, errors: 0 });
    const upd = report.rows.find((r) => r.code === "LEAK");
    expect(upd?.status).toBe("update");
    expect(upd?.changes).toEqual(expect.arrayContaining(["label", "metadata"]));
    const p = prisma as unknown as { referenceItem: { createMany: ReturnType<typeof vi.fn> }; $transaction: ReturnType<typeof vi.fn> };
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("commit aplica en transacción y audita el resumen", async () => {
    const { service, prisma, audit } = importSetup();
    const report = await service.importCsv("l1", { content: csvBody, dryRun: false }, ctx);
    expect(report.applied).toBe(true);
    const p = prisma as unknown as { referenceItem: { createMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
    expect(p.referenceItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ code: "OVHT", label: "Sobrecalentamiento", active: true, sortOrder: 30 })],
    });
    expect(p.referenceItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i2" } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "referencelist.imported", entityId: "l1" }),
    );
  });

  it("deactivateMissing marca para desactivar los activos ausentes", async () => {
    const { service } = importSetup();
    const onlyVib = "code;label\r\nVIB;Vibración\r\n";
    const report = await service.importCsv("l1", { content: onlyVib, dryRun: true, deactivateMissing: true }, ctx);
    expect(report.summary.deactivates).toBe(1);
    expect(report.rows.find((r) => r.status === "deactivate")?.code).toBe("LEAK");
  });

  it("reporta errores por fila (code faltante, duplicado, active inválido, JSON inválido) y NO aplica ni en commit", async () => {
    const { service, prisma } = importSetup();
    const bad =
      "code;label;active;metadata.spec\r\n" +
      ";Sin code;true;\r\n" +
      "VIB;Vibración;quizás;\r\n" +
      "DUP;Uno;;\r\n" +
      "DUP;Dos;;\r\n" +
      'X1;Json malo;;"{roto"\r\n';
    const report = await service.importCsv("l1", { content: bad, dryRun: false }, ctx);
    expect(report.applied).toBe(false);
    expect(report.summary.errors).toBe(4);
    expect(report.rows.find((r) => r.line === 2)?.message).toMatch(/code requerido/);
    expect(report.rows.find((r) => r.line === 3)?.message).toMatch(/active inválido/);
    expect(report.rows.find((r) => r.line === 5)?.message).toMatch(/duplicado/);
    expect(report.rows.find((r) => r.line === 6)?.message).toMatch(/JSON inválido/);
    const p = prisma as unknown as { $transaction: ReturnType<typeof vi.fn> };
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza cabecera sin code/label y columnas desconocidas", async () => {
    const { service } = importSetup();
    await expect(service.importCsv("l1", { content: "label\r\nx\r\n", dryRun: true }, ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.importCsv("l1", { content: "code;label;sorpresa\r\nA;a;x\r\n", dryRun: true }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza más filas que REFERENCE_IMPORT_MAX_ROWS", async () => {
    const { service, config } = importSetup();
    (config.get as ReturnType<typeof vi.fn>).mockReturnValue(2);
    const big = "code;label\r\nA;a\r\nB;b\r\nC;c\r\n";
    await expect(service.importCsv("l1", { content: big, dryRun: true }, ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
