import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowsService } from "./workflows.service";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    workflowDefinition: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "wf1", ...data })),
      update: vi.fn().mockResolvedValue({ id: "wf1" }),
    },
    workflowDefinitionVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "v1" }),
    },
    workflowState: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), create: vi.fn() },
    workflowTransition: { create: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    templateVersion: { count: vi.fn().mockResolvedValue(0) },
    role: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg({}))),
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new WorkflowsService(prisma, audit), prisma, audit };
}

describe("WorkflowsService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea un flujo con borrador v1 y un estado inicial/final mínimo, y audita", async () => {
    const { service, prisma, audit } = makeService({
      workflowDefinition: {
        findUnique: vi.fn().mockResolvedValue(null), // no existe la key
        create: vi.fn().mockResolvedValue({ id: "wf1", key: "cierre-turno", name: "Cierre" }),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "wf1" } as never);
    await service.create("admin", { key: "cierre-turno", name: "Cierre" }, ctx);
    expect(prisma.workflowDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "cierre-turno",
          status: "DRAFT",
          versions: { create: expect.objectContaining({ versionNumber: 1, status: "DRAFT" }) },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow.created" }));
  });

  it("rechaza crear con una clave ya existente", async () => {
    const { service } = makeService({
      workflowDefinition: { findUnique: vi.fn().mockResolvedValue({ id: "wf0" }) },
    });
    await expect(service.create("admin", { key: "cierre-turno", name: "X" }, ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("publica: valida la máquina, congela el borrador y fija currentVersionId", async () => {
    const draft = {
      id: "v1",
      versionNumber: 1,
      states: [
        { key: "a", isInitial: true, isFinal: false },
        { key: "b", isInitial: false, isFinal: true },
      ],
      transitions: [{ key: "t", fromState: { key: "a" }, toState: { key: "b" } }],
    };
    const { service, prisma, audit } = makeService({
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue({ id: "wf1", name: "X" }),
        update: vi.fn().mockResolvedValue({ id: "wf1" }),
      },
      workflowDefinitionVersion: {
        findFirst: vi.fn().mockResolvedValue(draft),
        update: vi.fn().mockResolvedValue({ id: "v1" }),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "wf1" } as never);
    await service.publish("admin", "wf1", {}, ctx);
    expect(prisma.workflowDefinitionVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v1" }, data: expect.objectContaining({ status: "PUBLISHED" }) }),
    );
    expect(prisma.workflowDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentVersionId: "v1", status: "PUBLISHED" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow.published" }));
  });

  it("publicar una máquina inválida (sin estado final) lanza BadRequest", async () => {
    const draft = {
      id: "v1",
      versionNumber: 1,
      states: [{ key: "a", isInitial: true, isFinal: false }],
      transitions: [],
    };
    const { service } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1" }) },
      workflowDefinitionVersion: { findFirst: vi.fn().mockResolvedValue(draft) },
    });
    await expect(service.publish("admin", "wf1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publicar sin borrador lanza BadRequest", async () => {
    const { service } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1" }) },
      workflowDefinitionVersion: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.publish("admin", "wf1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("saveDraft crea estados y resuelve las claves de transición a FK", async () => {
    const stateCreate = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: `st-${data.key}`, ...data }));
    const transitionCreate = vi.fn().mockResolvedValue({ id: "tr1" });
    const tx = {
      workflowDefinition: { update: vi.fn().mockResolvedValue({}) },
      workflowDefinitionVersion: { update: vi.fn().mockResolvedValue({}) },
      workflowState: { deleteMany: vi.fn().mockResolvedValue({}), create: stateCreate },
      workflowTransition: { create: transitionCreate },
    };
    const { service } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1", name: "X", description: null }) },
      workflowDefinitionVersion: { findFirst: vi.fn().mockResolvedValue({ id: "v1" }) },
      role: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx))),
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "wf1" } as never);

    await service.saveDraft(
      "wf1",
      {
        states: [
          { key: "draft", name: "Borrador", isInitial: true },
          { key: "closed", name: "Cerrado", isFinal: true },
        ],
        transitions: [{ key: "close", label: "Cerrar", fromStateKey: "draft", toStateKey: "closed" }],
      },
      ctx,
    );

    expect(stateCreate).toHaveBeenCalledTimes(2);
    expect(transitionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromStateId: "st-draft", toStateId: "st-closed" }) }),
    );
  });

  it("saveDraft rechaza una máquina inválida (estado inalcanzable)", async () => {
    const { service } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1", name: "X" }) },
    });
    await expect(
      service.saveDraft(
        "wf1",
        {
          states: [
            { key: "draft", name: "Borrador", isInitial: true },
            { key: "closed", name: "Cerrado", isFinal: true },
            { key: "orphan", name: "Huérfano", isFinal: true },
          ],
          transitions: [{ key: "close", label: "Cerrar", fromStateKey: "draft", toStateKey: "closed" }],
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("no permite eliminar un flujo en uso por una plantilla", async () => {
    const { service } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1", key: "k", name: "X" }) },
      templateVersion: { count: vi.fn().mockResolvedValue(2) },
    });
    await expect(service.remove("wf1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("elimina lógicamente un flujo sin uso y audita", async () => {
    const update = vi.fn().mockResolvedValue({ id: "wf1" });
    const { service, audit } = makeService({
      workflowDefinition: { findFirst: vi.fn().mockResolvedValue({ id: "wf1", key: "k", name: "X" }), update },
      templateVersion: { count: vi.fn().mockResolvedValue(0) },
    });
    await service.remove("wf1", ctx);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow.deleted" }));
  });

  it("remove lanza NotFound si el flujo no existe", async () => {
    const { service } = makeService({ workflowDefinition: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.remove("ghost", ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});
