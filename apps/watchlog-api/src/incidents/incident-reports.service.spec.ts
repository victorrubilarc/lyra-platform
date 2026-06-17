import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentReportsService } from "./incident-reports.service";
import type { AuditService } from "../audit/audit.service";
import type { ScopeService } from "../authz/scope.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };
const OPEN_INCIDENT = { id: "inc1", orgNodeId: "n1", lifecycle: "OPEN", typeId: "t1", severity: 4 };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    incident: { findUnique: vi.fn().mockResolvedValue(OPEN_INCIDENT) },
    incidentType: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    reportingObligation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    incidentReport: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "rep1", number: 1, createdAt: new Date(), updatedAt: new Date(), ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "rep1", number: 1, incidentId: "inc1", obligationId: "o1", obligationName: "Ob", authorityName: null, mandatory: true, createdAt: new Date(), updatedAt: new Date(), ...data })),
    },
    incidentActivity: { create: vi.fn().mockResolvedValue(undefined) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = { canAccessNode: vi.fn().mockResolvedValue(true) } as unknown as ScopeService;
  return { service: new IncidentReportsService(prisma, audit, scope), prisma, audit, scope };
}

describe("IncidentReportsService (Fase 4.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("materializeForIncident", () => {
    it("crea un reporte por cada obligación aplicable que aún no existe", async () => {
      const { service, prisma } = makeService({
        reportingObligation: {
          findMany: vi.fn().mockResolvedValue([
            { id: "o1", name: "Grave", authorityName: "Autoridad", appliesToTypeIds: [], minSeverity: 4, mandatory: true, active: true, defaultDueMinutes: 1440 },
            { id: "o2", name: "Ambiental", authorityName: null, appliesToTypeIds: ["otro"], minSeverity: null, mandatory: false, active: true, defaultDueMinutes: null },
          ]),
        },
        incidentReport: {
          findMany: vi.fn().mockResolvedValue([]), // ninguno existe
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "x", number: 1, createdAt: new Date(), updatedAt: new Date(), ...data })),
        },
        incidentActivity: { create: vi.fn() },
      });
      // o2 no aplica (tipo "otro" ≠ "t1"); solo o1 (transversal, minSeverity 4 ≤ severidad 4)
      const created = await service.materializeForIncident("u1", "inc1", ctx);
      expect(created).toBe(1);
      expect((prisma.incidentReport.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it("es idempotente: no duplica un reporte ya materializado de la misma obligación", async () => {
      const { service, prisma } = makeService({
        reportingObligation: {
          findMany: vi.fn().mockResolvedValue([
            { id: "o1", name: "Grave", authorityName: null, appliesToTypeIds: [], minSeverity: null, mandatory: true, active: true, defaultDueMinutes: 60 },
          ]),
        },
        incidentReport: {
          findMany: vi.fn().mockResolvedValue([{ obligationId: "o1" }]), // ya existe
          create: vi.fn(),
        },
        incidentActivity: { create: vi.fn() },
      });
      const created = await service.materializeForIncident("u1", "inc1", ctx);
      expect(created).toBe(0);
      expect((prisma.incidentReport.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });
  });

  describe("submit", () => {
    it("rechaza enviar un reporte que no está pendiente", async () => {
      const { service } = makeService({
        incidentReport: { findUnique: vi.fn().mockResolvedValue({ id: "rep1", incidentId: "inc1", status: "SUBMITTED" }) },
      });
      await expect(service.submit("u1", "rep1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("marca SUBMITTED con folio externo y registra timeline + auditoría", async () => {
      const { service, audit, prisma } = makeService({
        incidentReport: {
          findUnique: vi.fn().mockResolvedValue({ id: "rep1", incidentId: "inc1", status: "PENDING", obligationName: "Ob" }),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "rep1", number: 1, incidentId: "inc1", obligationId: "o1", obligationName: "Ob", authorityName: null, mandatory: true, externalFolio: "FOLIO-9", createdAt: new Date(), updatedAt: new Date(), ...data })),
          findMany: vi.fn().mockResolvedValue([]),
        },
        incidentActivity: { create: vi.fn() },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      });
      const dto = await service.submit("u1", "rep1", { externalFolio: "FOLIO-9" }, ctx);
      expect(dto.status).toBe("SUBMITTED");
      expect(dto.externalFolio).toBe("FOLIO-9");
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "incident.report.submitted" }));
      expect((prisma.incidentActivity.create as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("rechaza duplicar un reporte (no anulado) de la misma obligación", async () => {
      const { service } = makeService({
        reportingObligation: { findFirst: vi.fn().mockResolvedValue({ id: "o1", name: "Ob", active: true, authorityName: null, mandatory: false, defaultDueMinutes: null }) },
        incidentReport: { findFirst: vi.fn().mockResolvedValue({ id: "dup" }) },
      });
      await expect(service.create("u1", "inc1", { obligationId: "o1" }, ctx)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("upsertObligation", () => {
    it("409 si failIfExists y la clave ya existe", async () => {
      const { service } = makeService({
        reportingObligation: { findUnique: vi.fn().mockResolvedValue({ id: "o1" }) },
      });
      await expect(
        service.upsertObligation({ key: "dup", name: "X" }, ctx, true),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
