import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatesService } from "./templates.service";
import type { AuditService } from "../audit/audit.service";
import type { ScopeService } from "../authz/scope.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

function makeService(overrides: Record<string, unknown> = {}, scopeImpl: Partial<ScopeService> = {}) {
  const prisma = {
    template: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "t1", ...data })),
      update: vi.fn().mockResolvedValue({ id: "t1" }),
    },
    templateVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "v1" }),
    },
    templateSection: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), create: vi.fn() },
    templateField: { create: vi.fn() },
    orgNode: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]) },
    role: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg({}))),
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = {
    getAccessibleNodeIds: vi.fn().mockResolvedValue(null),
    canAccessNode: vi.fn().mockResolvedValue(true),
    ...scopeImpl,
  } as unknown as ScopeService;
  return { service: new TemplatesService(prisma, audit, scope), prisma, audit, scope };
}

describe("TemplatesService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea una plantilla con una versión v1 en borrador y audita", async () => {
    const { service, prisma, audit } = makeService();
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "t1" } as never);
    await service.create("admin", { name: "Turno" }, ctx);
    expect(prisma.template.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          versions: { create: expect.objectContaining({ versionNumber: 1, status: "DRAFT" }) },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "template.created" }));
  });

  it("publica: congela el borrador y fija currentVersionId", async () => {
    const { service, prisma, audit } = makeService({
      template: {
        findFirst: vi.fn().mockResolvedValue({ id: "t1", name: "X" }),
        update: vi.fn().mockResolvedValue({ id: "t1" }),
      },
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "v1", versionNumber: 1, _count: { sections: 2 } }),
        update: vi.fn().mockResolvedValue({ id: "v1" }),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "t1" } as never);
    await service.publish("admin", "t1", {}, ctx);
    expect(prisma.templateVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v1" }, data: expect.objectContaining({ status: "PUBLISHED" }) }),
    );
    expect(prisma.template.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentVersionId: "v1", status: "PUBLISHED" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "template.published" }));
  });

  it("publicar sin borrador lanza BadRequest", async () => {
    const { service } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1" }) },
      templateVersion: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.publish("admin", "t1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publicar un borrador vacío (sin secciones) lanza BadRequest", async () => {
    const { service } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1" }) },
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue({ id: "v1", versionNumber: 1, _count: { sections: 0 } }),
      },
    });
    await expect(service.publish("admin", "t1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("elimina lógicamente (deletedAt) y audita", async () => {
    const update = vi.fn().mockResolvedValue({ id: "t1" });
    const { service, audit } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1", name: "X", deletedAt: null }), update },
    });
    await service.remove("t1", ctx);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "template.deleted" }));
  });

  it("remove lanza NotFound si la plantilla no existe", async () => {
    const { service } = makeService({ template: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(service.remove("ghost", ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("saveDraft deriva el dataType del tipo y persiste el semanticRole (capas 2 y 3)", async () => {
    const fieldCreate = vi.fn().mockResolvedValue({ id: "f1" });
    const tx = {
      template: { update: vi.fn().mockResolvedValue({}) },
      templateVersion: { update: vi.fn().mockResolvedValue({}) },
      templateSection: { deleteMany: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: "sec1" }) },
      templateField: { create: fieldCreate },
    };
    const { service } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1", name: "X", description: null, orgNodeId: null }) },
      templateVersion: { findFirst: vi.fn().mockResolvedValue({ id: "v1" }) },
      role: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx))),
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "t1" } as never);

    await service.saveDraft(
      "admin",
      "t1",
      {
        sections: [
          {
            key: "lectura",
            title: "Lectura",
            fields: [
              { key: "fecha", type: "DATE", label: "Fecha lectura", semanticRole: "EFFECTIVE_DATE" },
              { key: "turno", type: "SELECT", label: "Turno", config: { optionSource: { kind: "inline", items: [{ code: "dia", label: "Día" }] } } },
            ],
          },
        ],
      },
      ctx,
    );

    expect(fieldCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "fecha", dataType: "DATE", semanticRole: "EFFECTIVE_DATE" }) }),
    );
    expect(fieldCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "turno", dataType: "CODE", semanticRole: null }) }),
    );
  });

  it("listar aplica el alcance ABAC: oculta plantillas de nodos fuera de alcance", async () => {
    const templates = [
      { id: "t1", name: "A", description: null, orgNodeId: "n1", status: "DRAFT", currentVersionId: null, createdAt: new Date(), updatedAt: new Date(), versions: [{ id: "v1", versionNumber: 1, status: "DRAFT" }] },
      { id: "t2", name: "B", description: null, orgNodeId: "n2", status: "DRAFT", currentVersionId: null, createdAt: new Date(), updatedAt: new Date(), versions: [{ id: "v2", versionNumber: 1, status: "DRAFT" }] },
      { id: "t3", name: "C", description: null, orgNodeId: null, status: "DRAFT", currentVersionId: null, createdAt: new Date(), updatedAt: new Date(), versions: [{ id: "v3", versionNumber: 1, status: "DRAFT" }] },
    ];
    const { service } = makeService(
      {
        template: { findMany: vi.fn().mockResolvedValue(templates) },
        templateSection: { findMany: vi.fn().mockResolvedValue([]) },
        orgNode: { findMany: vi.fn().mockResolvedValue([{ id: "n1", name: "Planta", path: "/n1/" }]) },
      },
      { getAccessibleNodeIds: vi.fn().mockResolvedValue(new Set(["n1"])) },
    );
    const result = await service.list("u1", {});
    const ids = result.map((t) => t.id).sort();
    expect(ids).toEqual(["t1", "t3"]); // t2 (n2) oculta; t3 global visible
  });

  it("alcance por PLANTILLA (Fase 2.8): applyTemplateScope filtra el picker; el admin lo ignora", async () => {
    const templates = [
      { id: "t1", name: "A", description: null, orgNodeId: null, status: "PUBLISHED", currentVersionId: "v1", createdAt: new Date(), updatedAt: new Date(), versions: [{ id: "v1", versionNumber: 1, status: "PUBLISHED" }] },
      { id: "t2", name: "B", description: null, orgNodeId: null, status: "PUBLISHED", currentVersionId: "v2", createdAt: new Date(), updatedAt: new Date(), versions: [{ id: "v2", versionNumber: 1, status: "PUBLISHED" }] },
    ];
    const makeWithTemplateScope = () =>
      makeService(
        {
          template: { findMany: vi.fn().mockResolvedValue(templates) },
          templateSection: { findMany: vi.fn().mockResolvedValue([]) },
          orgNode: { findMany: vi.fn().mockResolvedValue([]) },
        },
        {
          getAccessibleNodeIds: vi.fn().mockResolvedValue(null), // sin restricción de nodo
          getAccessibleTemplateIds: vi.fn().mockResolvedValue(new Set(["t1"])), // allow-list = t1
        },
      );

    // Picker operacional: el eje de plantilla acota a t1 (AND con nodo).
    const picker = makeWithTemplateScope();
    const operational = await picker.service.list("u1", {}, { applyTemplateScope: true });
    expect(operational.map((t) => t.id)).toEqual(["t1"]);

    // Admin de plantillas: NO consulta el eje de plantilla; ve todas.
    const admin = makeWithTemplateScope();
    const all = await admin.service.list("u1", {});
    expect(all.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(admin.scope.getAccessibleTemplateIds).not.toHaveBeenCalled();
  });
});
