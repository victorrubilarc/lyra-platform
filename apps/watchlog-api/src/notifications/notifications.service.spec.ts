import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

// La bitácora del ámbito: nombre (para «Ámbito») + campos de la versión publicada
// (whitelist de comodines `campo.<key>`). El servicio llama a template.findUnique dos
// veces (nombre y luego currentVersion); el mock devuelve ambos en un mismo objeto.
const LOGBOOK = {
  id: "lb1",
  name: "Bitácora de Turno",
  currentVersion: { sections: [{ fields: [{ key: "temp", label: "Temperatura" }, { key: "estado", label: "Estado" }] }] },
};

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    template: { findUnique: vi.fn().mockResolvedValue(LOGBOOK) },
    notificationTemplate: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "nt1", updatedAt: new Date(), ...data })),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new NotificationsService(prisma, audit), prisma, audit };
}

const baseTemplate = {
  eventKey: "entry.transition" as const,
  locale: "es-CL",
  templateId: "lb1",
  subject: "Folio {{entry.folio}}",
  bodyText: "Estado {{entry.toState}}",
  bodyHtml: "<p>{{entry.toState}}</p>",
};

describe("NotificationsService — plantillas por bitácora (notif. avanzadas Fase A)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("createTemplate", () => {
    it("acepta comodines de campo válidos de la bitácora y crea la plantilla ad-hoc", async () => {
      const { service, prisma } = makeService();
      const dto = { ...baseTemplate, bodyText: "T {{campo.temp}} {{entry.toState}}" };
      const out = await service.createTemplate(dto, "u1", ctx);
      expect(out.templateId).toBe("lb1");
      expect(out.templateName).toBe("Bitácora de Turno");
      expect((prisma.notificationTemplate.create as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it("rechaza un comodín de campo que no existe en la bitácora (whitelist)", async () => {
      const { service } = makeService();
      const dto = { ...baseTemplate, subject: "X {{campo.no_existe}}" };
      await expect(service.createTemplate(dto, "u1", ctx)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("409 si ya existe una plantilla para ese evento/locale/bitácora", async () => {
      const { service } = makeService({
        template: { findUnique: vi.fn().mockResolvedValue(LOGBOOK) },
        notificationTemplate: {
          findFirst: vi.fn().mockResolvedValue({ id: "dup" }),
          create: vi.fn(),
        },
      });
      await expect(service.createTemplate(baseTemplate, "u1", ctx)).rejects.toBeInstanceOf(ConflictException);
    });

    it("400 si la bitácora del ámbito no existe", async () => {
      const { service } = makeService({ template: { findUnique: vi.fn().mockResolvedValue(null) } });
      await expect(service.createTemplate(baseTemplate, "u1", ctx)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("deleteTemplate", () => {
    it("no borra la plantilla GENÉRICA (templateId null) → 400", async () => {
      const { service, prisma } = makeService({
        notificationTemplate: {
          findUnique: vi.fn().mockResolvedValue({ id: "g1", isSystem: true, templateId: null, eventKey: "x", subject: "s" }),
          delete: vi.fn(),
        },
      });
      await expect(service.deleteTemplate("g1", ctx)).rejects.toBeInstanceOf(BadRequestException);
      expect((prisma.notificationTemplate.delete as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("borra una plantilla AD-HOC (por bitácora) y la audita", async () => {
      const { service, prisma, audit } = makeService({
        notificationTemplate: {
          findUnique: vi.fn().mockResolvedValue({ id: "a1", isSystem: false, templateId: "lb1", eventKey: "entry.transition", subject: "s" }),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      });
      await service.deleteTemplate("a1", ctx);
      expect((prisma.notificationTemplate.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ where: { id: "a1" } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "notification.template.deleted" }));
    });
  });
});
