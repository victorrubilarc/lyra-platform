import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationalCalendarService } from "./operational-calendar.service";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "admin", actorEmail: "a@x.cl", ip: null, userAgent: null };

const VALID_SHIFTS = [
  { code: "A", label: "Mañana", startTime: "07:00", durationMinutes: 480 },
  { code: "B", label: "Tarde", startTime: "15:00", durationMinutes: 480 },
  { code: "C", label: "Noche", startTime: "23:00", durationMinutes: 480 },
];

const validCreate = {
  key: "mina-rajo",
  name: "Mina Rajo",
  timezone: "America/Santiago",
  dayStartShiftCode: "A",
  periodKind: "MONTH" as const,
  periodAnchorDay: 1,
  shifts: VALID_SHIFTS,
};

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    operationalCalendar: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data, shifts: [] })),
      update: vi.fn().mockResolvedValue({ id: "c1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    operationalShift: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    orgNode: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as PrismaService;
  // $transaction: ejecuta el callback con el propio mock, o resuelve un arreglo de promesas.
  const bag = prisma as unknown as Record<string, unknown>;
  bag.$transaction = vi.fn().mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new OperationalCalendarService(prisma, audit), prisma, audit };
}

describe("OperationalCalendarService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea un calendario válido y registra auditoría", async () => {
    const { service, audit } = makeService({
      operationalCalendar: {
        create: vi.fn().mockResolvedValue({ id: "c1", key: "mina-rajo", shifts: [] }),
        findFirst: vi.fn().mockResolvedValue({ id: "c1", key: "mina-rajo", shifts: [] }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const cal = await service.create(validCreate, ctx);
    expect(cal.id).toBe("c1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opscalendar.created", entityType: "OperationalCalendar" }),
    );
  });

  it("marcar isDefault desmarca el resto en la creación", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { service } = makeService({
      operationalCalendar: {
        create: vi.fn().mockResolvedValue({ id: "c1", shifts: [] }),
        findFirst: vi.fn().mockResolvedValue({ id: "c1", shifts: [] }),
        updateMany,
      },
    });
    await service.create({ ...validCreate, isDefault: true }, ctx);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { isDefault: false } }));
  });

  it("rechaza una configuración inválida (solape) en backend", async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          ...validCreate,
          dayStartShiftCode: "A",
          shifts: [
            { code: "A", label: "M", startTime: "07:00", durationMinutes: 600 },
            { code: "B", label: "T", startTime: "12:00", durationMinutes: 600 },
          ],
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("traduce la clave duplicada (P2002) a BadRequest", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
    const { service } = makeService({
      operationalCalendar: { create: vi.fn().mockRejectedValue(p2002), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    await expect(service.create(validCreate, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("no permite eliminar el calendario por defecto", async () => {
    const { service } = makeService({
      operationalCalendar: { findFirst: vi.fn().mockResolvedValue({ id: "c1", isDefault: true, key: "k", name: "X" }) },
    });
    await expect(service.remove("c1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("borra lógicamente un calendario no-default, limpia nodos y audita", async () => {
    const calUpdate = vi.fn().mockResolvedValue({ id: "c1" });
    const nodeUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const { service, audit } = makeService({
      operationalCalendar: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", isDefault: false, key: "k", name: "X" }),
        update: calUpdate,
      },
      orgNode: { updateMany: nodeUpdateMany },
    });
    await service.remove("c1", ctx);
    expect(nodeUpdateMany).toHaveBeenCalledWith({ where: { operationalCalendarId: "c1" }, data: { operationalCalendarId: null } });
    expect(calUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "opscalendar.deleted" }));
  });

  it("setDefault desmarca los demás y marca el elegido", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({ id: "c1" });
    const { service } = makeService({
      operationalCalendar: {
        findFirst: vi.fn().mockResolvedValue({ id: "c1", shifts: [] }),
        updateMany,
        update,
      },
    });
    await service.setDefault("c1", ctx);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDefault: true, id: { not: "c1" } } }));
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isDefault: true } });
  });

  it("assignNodes valida que los nodos existan", async () => {
    const { service } = makeService({
      operationalCalendar: { findFirst: vi.fn().mockResolvedValue({ id: "c1" }) },
      orgNode: { count: vi.fn().mockResolvedValue(1), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    await expect(service.assignNodes("c1", { orgNodeIds: ["n1", "n2"] }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("preview resuelve un instante contra el calendario (madrugada → día op. anterior, turno C)", async () => {
    const { service } = makeService({
      operationalCalendar: {
        findFirst: vi.fn().mockResolvedValue({
          id: "c1",
          timezone: "UTC",
          dayStartShiftCode: "A",
          periodKind: "MONTH",
          periodAnchorDay: 1,
          periodStartWeekday: null,
          periodLengthDays: null,
          periodAnchorDate: null,
          shifts: VALID_SHIFTS.map((s, i) => ({ ...s, id: `s${i}`, calendarId: "c1", sortOrder: i })),
        }),
      },
    });
    const res = await service.preview("c1", new Date("2026-06-15T02:00:00Z"));
    expect(res.shiftCode).toBe("C");
    expect(res.operationalDate).toBe("2026-06-14");
    expect(res.periodKey).toBe("2026-06");
  });
});
