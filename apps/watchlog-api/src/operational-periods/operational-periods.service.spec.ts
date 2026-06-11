import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationalPeriodService } from "./operational-periods.service";
import type { AuditService } from "../audit/audit.service";
import type { ShiftResolver } from "../operational-calendar/shift-resolver";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "u1", actorEmail: "u@x.cl", ip: null, userAgent: null };

function make(opts: { resolution?: unknown; periodRow?: unknown } = {}) {
  const prisma = {
    operationalPeriod: {
      findUnique: vi.fn().mockResolvedValue(opts.periodRow ?? null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockImplementation(({ create, update, where }) => ({
        id: "op1",
        calendarId: where.calendarId_periodKey.calendarId,
        periodKey: where.calendarId_periodKey.periodKey,
        closedById: "u1",
        closedAt: new Date(),
        reopenedById: null,
        ...(create ?? update),
      })),
      update: vi.fn().mockImplementation(({ data, where }) => ({
        id: "op1",
        calendarId: where.calendarId_periodKey.calendarId,
        periodKey: where.calendarId_periodKey.periodKey,
        closedById: "u1",
        closedAt: new Date(),
        reopenedById: "u1",
        reopenedAt: new Date(),
        ...data,
      })),
    },
    operationalCalendar: {
      findFirst: vi.fn().mockResolvedValue({ id: "cal1", shifts: [] }),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const shiftResolver = {
    resolveWithCalendar: vi
      .fn()
      .mockResolvedValue(
        opts.resolution === undefined
          ? { calendarId: "cal1", resolution: { periodKey: "2026-06" } }
          : opts.resolution,
      ),
  } as unknown as ShiftResolver;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new OperationalPeriodService(prisma, shiftResolver, audit), prisma, audit };
}

beforeEach(() => vi.clearAllMocks());

describe("OperationalPeriodService — guarda de escritura", () => {
  it("ungobernado (sin calendario / sin periodKey) NUNCA bloquea", async () => {
    const { service } = make({ resolution: null });
    expect(await service.isWriteBlocked(new Date(), "n1")).toBe(false);
    const noKey = make({ resolution: { calendarId: "cal1", resolution: { periodKey: null } } });
    expect(await noKey.service.isWriteBlocked(new Date(), "n1")).toBe(false);
  });

  it("período sin fila = OPEN ⇒ no bloquea", async () => {
    const { service } = make({ periodRow: null });
    expect(await service.isWriteBlocked(new Date(), "n1")).toBe(false);
  });

  it("período CLOSED ⇒ bloquea", async () => {
    const { service } = make({ periodRow: { status: "CLOSED" } });
    expect(await service.isWriteBlocked(new Date(), "n1")).toBe(true);
  });

  it("período CLOSING también bloquea (a los no privilegiados)", async () => {
    const { service } = make({ periodRow: { status: "CLOSING" } });
    expect(await service.isWriteBlocked(new Date(), "n1")).toBe(true);
  });

  it("assertWritable lanza 403 si está cerrado y el actor no tiene la excepción", async () => {
    const { service } = make({ periodRow: { status: "CLOSED" } });
    await expect(service.assertWritable(new Date(), "n1", new Set())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("assertWritable deja pasar al actor con opsperiod:write-closed aunque esté cerrado", async () => {
    const { service } = make({ periodRow: { status: "CLOSED" } });
    await expect(
      service.assertWritable(new Date(), "n1", new Set(["opsperiod:write-closed"])),
    ).resolves.toBeUndefined();
  });
});

describe("OperationalPeriodService — cierre / reapertura", () => {
  it("close upsertea el período y audita", async () => {
    const { service, prisma, audit } = make();
    const dto = await service.close("cal1", "2026-06", { status: "CLOSED", reason: "Cierre mensual" }, "u1", ctx);
    expect(dto.status).toBe("CLOSED");
    expect((prisma.operationalPeriod.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((audit.record as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opsperiod.closed" }),
    );
  });

  it("reopen falla si el período ya está abierto (sin fila)", async () => {
    const { service } = make({ periodRow: null });
    await expect(service.reopen("cal1", "2026-06", { reason: "Reapertura" }, "u1", ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("reopen vuelve a OPEN y audita cuando hay fila cerrada", async () => {
    const { service, audit } = make({ periodRow: { status: "CLOSED" } });
    const dto = await service.reopen("cal1", "2026-06", { reason: "Ajuste autorizado" }, "u1", ctx);
    expect(dto.status).toBe("OPEN");
    expect((audit.record as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opsperiod.reopened" }),
    );
  });
});
