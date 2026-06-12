import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationalPeriodService } from "./operational-periods.service";
import type { AuditService } from "../audit/audit.service";
import type { ShiftResolver } from "../operational-calendar/shift-resolver";
import type { FiscalResolver } from "../fiscal-calendar/fiscal-resolver";
import type { PrismaService } from "../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import type { ReauthService } from "../auth/reauth.service";

const ctx = { actorId: "u1", actorEmail: "u@x.cl", ip: null, userAgent: null };

interface MakeOpts {
  fiscal?: unknown; // resultado de fiscalResolver.resolvePeriodKey (null = ungobernado)
  requirePeriod?: boolean;
  row?: Record<string, unknown> | null; // fila del período (findUnique)
  rows?: Record<string, unknown>[]; // findMany (list)
  earlierOpen?: Record<string, unknown> | null;
  laterLocked?: Record<string, unknown> | null;
  laterClosed?: Record<string, unknown> | null;
  cal?: Record<string, unknown>;
  requireMfa?: boolean; // SystemSettings.requireMfaForPeriodGovernance
}

const NO_CREDS = {} as const;

function make(opts: MakeOpts = {}) {
  const cal = opts.cal ?? {
    id: "f1",
    timezone: "UTC",
    requirePeriod: opts.requirePeriod ?? false,
    periodKind: "MONTH",
    periodAnchorDay: 1,
    periodStartWeekday: null,
    periodLengthDays: null,
    periodAnchorDate: null,
  };

  const prisma = {
    operationalPeriod: {
      findUnique: vi.fn().mockResolvedValue(opts.row ?? null),
      findMany: vi.fn().mockResolvedValue(opts.rows ?? []),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { status?: unknown } }) => {
        if (where.status === "OPEN") return Promise.resolve(opts.earlierOpen ?? null);
        if (where.status === "LOCKED") return Promise.resolve(opts.laterLocked ?? null);
        return Promise.resolve(opts.laterClosed ?? null); // status in [CLOSED, CLOSING]
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: "op1",
        fiscalCalendarId: "f1",
        periodKey: "2026-06",
        periodStart: "2026-06-01",
        periodEnd: "2026-07-01",
        ...data,
      })),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    fiscalCalendar: { findFirst: vi.fn().mockResolvedValue(cal) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const shiftResolver = {
    resolve: vi.fn().mockResolvedValue({ operationalDate: "2026-06-15", shiftCode: "A", shiftLabel: "A" }),
  } as unknown as ShiftResolver;

  const fiscalResolver = {
    resolvePeriodKey: vi
      .fn()
      .mockResolvedValue(
        opts.fiscal === undefined
          ? { fiscalCalendarId: "f1", fiscalCalendar: cal, periodKey: "2026-06" }
          : opts.fiscal,
      ),
  } as unknown as FiscalResolver;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const settings = {
    requireMfaForPeriodGovernance: vi.fn().mockResolvedValue(opts.requireMfa ?? false),
  } as unknown as SettingsService;
  const reauth = { verifyForSignature: vi.fn().mockResolvedValue({ method: "PASSWORD_MFA", signerName: "U" }) } as unknown as ReauthService;
  return {
    service: new OperationalPeriodService(prisma, shiftResolver, fiscalResolver, audit, settings, reauth),
    prisma,
    audit,
    reauth,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("OperationalPeriodService — guarda de escritura", () => {
  it("ungobernado (sin calendario fiscal) NUNCA bloquea", async () => {
    const { service } = make({ fiscal: null });
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set())).toBe(false);
  });

  it("período sin fila + requirePeriod=false ⇒ no bloquea", async () => {
    const { service } = make({ row: null });
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set())).toBe(false);
  });

  it("período sin fila + requirePeriod=true ⇒ bloquea (salvo bypass)", async () => {
    const { service } = make({ row: null, requirePeriod: true });
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set())).toBe(true);
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set(["opsperiod:write-closed"]))).toBe(false);
  });

  it("período CLOSED ⇒ bloquea salvo opsperiod:write-closed", async () => {
    const { service } = make({ row: { status: "CLOSED" } });
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set())).toBe(true);
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set(["opsperiod:write-closed"]))).toBe(false);
  });

  it("período LOCKED ⇒ bloquea a TODOS, incluido el bypass", async () => {
    const { service } = make({ row: { status: "LOCKED" } });
    expect(await service.isWriteBlockedForActor(new Date(), "n1", new Set(["opsperiod:write-closed"]))).toBe(true);
  });

  it("assertWritable lanza 403 si está cerrado y el actor no tiene la excepción", async () => {
    const { service } = make({ row: { status: "CLOSED" } });
    await expect(service.assertWritable(new Date(), "n1", new Set())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("OperationalPeriodService — generación", () => {
  it("genera solo las llaves faltantes (idempotente)", async () => {
    const { service, prisma } = make({ rows: [] });
    // findMany para 'existing' devuelve uno (junio ya existe) → solo crea el resto.
    (prisma.operationalPeriod.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ periodKey: "2026-06" }]) // existing
      .mockResolvedValueOnce([]); // list al final
    await service.generate("f1", 2026, ctx);
    const createArg = (prisma.operationalPeriod.createMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const keys = createArg.data.map((d: { periodKey: string }) => d.periodKey);
    expect(keys).toContain("2026-01");
    expect(keys).not.toContain("2026-06"); // ya existía: no se recrea
  });
});

describe("OperationalPeriodService — cierre secuencial", () => {
  it("close OPEN → CLOSED cuando no hay anterior abierto", async () => {
    const { service, audit } = make({ row: { id: "op1", status: "OPEN", periodStart: "2026-06-01" }, earlierOpen: null });
    const dto = await service.close("f1", "2026-06", "Cierre mensual", NO_CREDS, "u1", ctx);
    expect(dto.status).toBe("CLOSED");
    expect((audit.record as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opsperiod.closed" }),
    );
  });

  it("close BLOQUEA si un período anterior sigue abierto", async () => {
    const { service } = make({
      row: { id: "op1", status: "OPEN", periodStart: "2026-06-01" },
      earlierOpen: { periodKey: "2026-05", periodStart: "2026-05-01" },
    });
    await expect(service.close("f1", "2026-06", "Cierre", NO_CREDS, "u1", ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it("close falla si el período no está OPEN", async () => {
    const { service } = make({ row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" } });
    await expect(service.close("f1", "2026-06", "Cierre", NO_CREDS, "u1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("OperationalPeriodService — gate MFA (requireMfaForPeriodGovernance)", () => {
  it("con el ajuste APAGADO no re-autentica", async () => {
    const { service, reauth } = make({ row: { id: "op1", status: "OPEN", periodStart: "2026-06-01" }, requireMfa: false });
    await service.close("f1", "2026-06", "Cierre mensual", { password: "x" }, "u1", ctx);
    expect((reauth.verifyForSignature as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("con el ajuste ENCENDIDO re-autentica con step-up MFA antes de ejecutar", async () => {
    const { service, reauth } = make({ row: { id: "op1", status: "OPEN", periodStart: "2026-06-01" }, requireMfa: true });
    await service.close("f1", "2026-06", "Cierre mensual", { password: "p", mfaCode: "123456" }, "u1", ctx);
    expect((reauth.verifyForSignature as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "u1",
      { password: "p", mfaCode: "123456" },
      { requireMfa: true },
    );
  });

  it("si la re-autenticación falla, la acción NO procede", async () => {
    const { service, reauth } = make({ row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" }, requireMfa: true });
    (reauth.verifyForSignature as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("MFA inválido"));
    await expect(service.lock("f1", "2026-06", "Bloqueo", { password: "p" }, "u1", ctx)).rejects.toThrow("MFA inválido");
  });
});

describe("OperationalPeriodService — lock / unlock", () => {
  it("lock CLOSED → LOCKED", async () => {
    const { service } = make({ row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" } });
    const dto = await service.lock("f1", "2026-06", "Bloqueo definitivo", NO_CREDS, "u1", ctx);
    expect(dto.status).toBe("LOCKED");
  });

  it("lock falla si no está cerrado", async () => {
    const { service } = make({ row: { id: "op1", status: "OPEN", periodStart: "2026-06-01" } });
    await expect(service.lock("f1", "2026-06", "Bloqueo", NO_CREDS, "u1", ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("unlock LOCKED → CLOSED (two-key)", async () => {
    const { service } = make({ row: { id: "op1", status: "LOCKED", periodStart: "2026-06-01" } });
    const dto = await service.unlock("f1", "2026-06", "Reapertura autorizada", NO_CREDS, "u1", ctx);
    expect(dto.status).toBe("CLOSED");
  });
});

describe("OperationalPeriodService — reapertura con secuencialidad inversa", () => {
  it("reopen CLOSED → OPEN cuando no hay posteriores conflictivos", async () => {
    const { service } = make({ row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" } });
    const dto = await service.reopen("f1", "2026-06", "Ajuste autorizado", false, NO_CREDS, "u1", ctx);
    expect(dto.status).toBe("OPEN");
  });

  it("reopen BLOQUEA si un período posterior está LOCKED", async () => {
    const { service } = make({
      row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" },
      laterLocked: { periodKey: "2026-07", periodStart: "2026-07-01" },
    });
    await expect(service.reopen("f1", "2026-06", "Ajuste", false, NO_CREDS, "u1", ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it("reopen exige acuse si hay posteriores solo CLOSED", async () => {
    const { service } = make({
      row: { id: "op1", status: "CLOSED", periodStart: "2026-06-01" },
      laterClosed: { periodKey: "2026-07", periodStart: "2026-07-01" },
    });
    await expect(service.reopen("f1", "2026-06", "Ajuste", false, NO_CREDS, "u1", ctx)).rejects.toBeInstanceOf(ConflictException);
    // Con acuse, procede.
    const dto = await service.reopen("f1", "2026-06", "Ajuste", true, NO_CREDS, "u1", ctx);
    expect(dto.status).toBe("OPEN");
  });
});
