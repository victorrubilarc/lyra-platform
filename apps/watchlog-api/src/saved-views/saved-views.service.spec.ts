import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SavedViewsService } from "./saved-views.service";

function makeService(over: Record<string, unknown> = {}) {
  const savedView = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "v1", createdAt: new Date(), updatedAt: new Date(), ...data }),
    ),
    update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "v1", userId: "u1", module: "LOGBOOK", name: "x", config: {}, isDefault: false, createdAt: new Date(), updatedAt: new Date(), ...data }),
    ),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    ...over,
  };
  const prisma = {
    savedView,
    // $transaction(callback) ejecuta el callback con el mismo mock como tx.
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({ savedView })),
  } as unknown as PrismaService;
  return { service: new SavedViewsService(prisma), savedView };
}

beforeEach(() => vi.clearAllMocks());

describe("SavedViewsService", () => {
  it("list filtra por dueño + módulo y ordena default primero", async () => {
    const { service, savedView } = makeService();
    await service.list("u1", "LOGBOOK");
    expect(savedView.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", module: "LOGBOOK" },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  });

  it("create con isDefault desmarca las demás defaults del usuario+módulo (en la tx)", async () => {
    const { service, savedView } = makeService();
    await service.create("u1", { module: "LOGBOOK", name: "Turno A", config: {} as never, isDefault: true });
    expect(savedView.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", module: "LOGBOOK", isDefault: true },
      data: { isDefault: false },
    });
    expect(savedView.create).toHaveBeenCalled();
  });

  it("create sin isDefault NO toca otras vistas", async () => {
    const { service, savedView } = makeService();
    await service.create("u1", { module: "LOGBOOK", name: "Turno A", config: {} as never });
    expect(savedView.updateMany).not.toHaveBeenCalled();
  });

  it("update exige OWNERSHIP (404 si no es del usuario)", async () => {
    const { service, savedView } = makeService({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(service.update("u1", "ajena", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    expect(savedView.update).not.toHaveBeenCalled();
  });

  it("remove exige OWNERSHIP (404 si no es del usuario)", async () => {
    const { service, savedView } = makeService({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(service.remove("u1", "ajena")).rejects.toBeInstanceOf(NotFoundException);
    expect(savedView.delete).not.toHaveBeenCalled();
  });

  it("update que marca default desmarca la default previa", async () => {
    const { service, savedView } = makeService({
      findFirst: vi.fn().mockResolvedValue({ id: "v1", userId: "u1", module: "LOGBOOK", isDefault: false }),
    });
    await service.update("u1", "v1", { isDefault: true });
    expect(savedView.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", module: "LOGBOOK", isDefault: true },
      data: { isDefault: false },
    });
  });
});
