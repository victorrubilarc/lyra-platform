import { createHash } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { canonicalSignaturePayload } from "@lyra/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { ReauthService } from "../auth/reauth.service";
import type { ScopeService } from "../authz/scope.service";
import type { EncryptionService } from "../crypto/encryption.service";
import type { ShiftResolver } from "../operational-calendar/shift-resolver";
import type { PrismaService } from "../prisma/prisma.service";
import { LogEntriesService } from "./log-entries.service";
import { LogbookQueryService } from "./logbook-query.service";

const ctx = { actorId: "u1", actorEmail: "u@x.cl", ip: null, userAgent: null };

/** sha256 REAL (los veredictos de verificación dependen del hash exacto). */
const enc = {
  sha256: (s: string) => createHash("sha256").update(s, "utf8").digest("hex"),
} as unknown as EncryptionService;

const baseEntry = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  entryNumber: 7,
  templateId: "t1",
  templateVersionId: "tv1",
  workflowDefinitionId: null,
  workflowDefinitionVersionId: null,
  orgNodeId: "n1",
  equipmentId: null,
  currentStateKey: null,
  status: "DRAFT",
  recordedAt: new Date("2026-06-10T10:00:00.000Z"),
  effectiveAt: new Date("2026-06-10T10:00:00.000Z"),
  shiftCode: "A",
  operationalDate: "2026-06-10",
  periodKey: "2026-06",
  sealedAt: null,
  createdById: "u1",
  updatedById: "u1",
  createdAt: new Date("2026-06-10T10:00:00.000Z"),
  updatedAt: new Date("2026-06-10T10:00:00.000Z"),
  deletedAt: null,
  ...over,
});

const listRow = (over: Record<string, unknown> = {}) => ({
  ...baseEntry(),
  template: { name: "Plantilla" },
  templateVersion: { versionNumber: 1 },
  orgNode: { name: "Proceso 1" },
  equipment: null,
  ...over,
});

/** Versión mínima congelada para labels (timeline / changes). */
const versionGraph = {
  id: "tv1",
  templateId: "t1",
  versionNumber: 1,
  status: "PUBLISHED",
  name: "X",
  description: null,
  workflowDefinitionId: null,
  workflowDefinitionVersionId: null,
  requireSignature: false,
  recurrenceKind: "NONE",
  recurrenceConfig: null,
  publishedAt: new Date(),
  sections: [
    {
      id: "sec-s1",
      key: "s1",
      title: "Sección 1",
      description: null,
      order: 1,
      requireSignature: false,
      editableInStateKey: null,
      roles: [],
      fields: [
        {
          id: "f-temp",
          key: "temp",
          type: "NUMBER",
          dataType: "NUMBER",
          semanticRole: null,
          label: "Temperatura",
          help: null,
          required: false,
          order: 1,
          config: {},
          visibleWhen: null,
          roles: [],
        },
      ],
    },
  ],
};

function makeServices(prismaOver: Record<string, unknown> = {}, scopeOver: Partial<ScopeService> = {}) {
  const prisma = {
    template: { findUnique: vi.fn().mockResolvedValue({ name: "Plantilla" }) },
    templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph) },
    workflowDefinitionVersion: { findUnique: vi.fn() },
    workflowState: { findMany: vi.fn().mockResolvedValue([]) },
    logEntry: {
      findFirst: vi.fn().mockResolvedValue(baseEntry()),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    logEntrySection: { findMany: vi.fn().mockResolvedValue([]) },
    logEntryValue: { findMany: vi.fn().mockResolvedValue([]) },
    logEntryFieldChange: { findMany: vi.fn().mockResolvedValue([]) },
    logEntryTransition: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    logEntrySignature: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    orgNode: {
      findFirst: vi.fn().mockResolvedValue({ path: "/n1/" }),
      findMany: vi.fn().mockResolvedValue([{ id: "n1", name: "Proceso 1", path: "/n1/" }]),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "u1", displayName: "Demo User", email: "u@x.cl" }]) },
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    referenceList: { findMany: vi.fn().mockResolvedValue([]) },
    ...prismaOver,
  } as unknown as PrismaService;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = {
    getAccessibleNodeIds: vi.fn().mockResolvedValue(null),
    canAccessNode: vi.fn().mockResolvedValue(true),
    ...scopeOver,
  } as unknown as ScopeService;
  const shiftResolver = { resolve: vi.fn().mockResolvedValue(null) } as unknown as ShiftResolver;
  const fiscalResolver = {
    resolvePeriodKey: vi.fn().mockResolvedValue(null),
  } as unknown as import("../fiscal-calendar/fiscal-resolver").FiscalResolver;
  const reauth = { verifyForSignature: vi.fn() } as unknown as ReauthService;
  const periods = {
    assertWritable: vi.fn().mockResolvedValue(undefined),
    isWriteBlockedForActor: vi.fn().mockResolvedValue(false),
  } as unknown as import("../operational-periods/operational-periods.service").OperationalPeriodService;
  const permissions = {
    getEffectivePermissions: vi.fn().mockResolvedValue(new Set<string>()),
  } as unknown as import("../authz/permission.service").PermissionService;

  const entries = new LogEntriesService(prisma, audit, scope, shiftResolver, fiscalResolver, reauth, enc, periods, permissions);
  const logbook = new LogbookQueryService(prisma, scope, audit, enc, entries);
  return { logbook, entries, prisma, audit, scope };
}

beforeEach(() => vi.clearAllMocks());

describe("LogbookQueryService — list", () => {
  it("aplica ABAC y filtros en el where (SQL, nunca en cliente)", async () => {
    const { logbook, prisma } = makeServices(
      {},
      { getAccessibleNodeIds: vi.fn().mockResolvedValue(new Set(["n1", "n2"])) },
    );
    await logbook.list("u1", {
      status: "SUBMITTED",
      pendingSignature: true,
      thresholdBand: "ANY",
      q: "BIT-000007",
      shiftCode: "A",
    });

    const arg = (prisma.logEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const and = arg.where.AND as Record<string, unknown>[];
    expect(and).toContainEqual({ deletedAt: null });
    expect(and).toContainEqual({ orgNodeId: { in: ["n1", "n2"] } });
    expect(and).toContainEqual({ status: "SUBMITTED" });
    expect(and).toContainEqual({ shiftCode: "A" });
    expect(and).toContainEqual({ sections: { some: { requiresSignature: true, signatureId: null } } });
    expect(and).toContainEqual({ values: { some: { thresholdBand: { in: ["WARN", "CRIT"] } } } });
    // El folio "BIT-000007" busca además por entryNumber = 7.
    const orClause = and.find((c) => "OR" in c) as { OR: Record<string, unknown>[] };
    expect(orClause.OR).toContainEqual({ entryNumber: 7 });
  });

  it("filtra por entryOrigin (registro diferido 2.7.0) en el where", async () => {
    const { logbook, prisma } = makeServices();
    await logbook.list("u1", { entryOrigin: "DEFERRED" });
    const arg = (prisma.logEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.where.AND).toContainEqual({ entryOrigin: "DEFERRED" });
  });

  it("filtra una rama completa con includeDescendants (ruta materializada)", async () => {
    const { logbook, prisma } = makeServices();
    await logbook.list("u1", { orgNodeId: "n1", includeDescendants: true });
    const arg = (prisma.logEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.where.AND).toContainEqual({ orgNode: { path: { startsWith: "/n1/" } } });
  });

  it("pagina por keyset: take+1 detecta página siguiente y el cursor reanuda", async () => {
    const rows = [
      listRow({ id: "e3", entryNumber: 3, recordedAt: new Date("2026-06-10T12:00:00.000Z") }),
      listRow({ id: "e2", entryNumber: 2, recordedAt: new Date("2026-06-10T11:00:00.000Z") }),
      listRow({ id: "e1", entryNumber: 1, recordedAt: new Date("2026-06-10T10:00:00.000Z") }),
    ];
    const { logbook, prisma } = makeServices({
      logEntry: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    });
    const page = await logbook.list("u1", { take: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.entryNumber).toBe(3);
    expect(page.nextCursor).not.toBeNull();

    await logbook.list("u1", { take: 2, cursor: page.nextCursor! });
    const arg = (prisma.logEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    const keyset = (arg.where.AND as Record<string, unknown>[])[1];
    expect(keyset).toEqual({
      OR: [
        { recordedAt: { lt: new Date("2026-06-10T11:00:00.000Z") } },
        { recordedAt: new Date("2026-06-10T11:00:00.000Z"), id: { lt: "e2" } },
      ],
    });
  });

  it("rechaza un cursor que no corresponde al orden pedido", async () => {
    const { logbook } = makeServices();
    const first = await logbook.list("u1", { take: 1 });
    expect(first.nextCursor).toBeNull(); // sin filas no hay cursor
    const foreign = Buffer.from(JSON.stringify({ s: "recordedAt", d: "desc", v: "x", id: "e9" })).toString("base64url");
    await expect(logbook.list("u1", { sort: "entryNumber", dir: "asc", cursor: foreign })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("enriquece la fila con estado congelado e indicadores de excepción", async () => {
    const rows = [
      listRow({
        id: "e1",
        workflowDefinitionId: "wf1",
        workflowDefinitionVersionId: "wfv1",
        currentStateKey: "review",
      }),
    ];
    const { logbook } = makeServices({
      logEntry: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      workflowState: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ workflowDefinitionVersionId: "wfv1", key: "review", name: "En revisión", color: "#06B6D4" }]),
      },
      logEntrySection: {
        findMany: vi.fn().mockResolvedValue([
          { logEntryId: "e1", state: "COMPLETED", requiresSignature: true, signatureId: null },
          { logEntryId: "e1", state: "LOCKED", requiresSignature: false, signatureId: null },
        ]),
      },
      logEntrySignature: { findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn().mockResolvedValue([{ logEntryId: "e1", _count: { _all: 1 } }]) },
      logEntryTransition: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([{ logEntryId: "e1", _count: { _all: 2 } }]),
      },
      logEntryValue: {
        findMany: vi.fn().mockResolvedValue([
          { logEntryId: "e1", thresholdBand: "WARN" },
          { logEntryId: "e1", thresholdBand: "CRIT" },
        ]),
      },
    });
    const { items } = await logbook.list("u1", {});
    expect(items[0]).toMatchObject({
      currentStateName: "En revisión",
      currentStateColor: "#06B6D4",
      indicators: {
        sectionsTotal: 2,
        sectionsCompleted: 1,
        sectionsLocked: 1,
        pendingSignatures: 1,
        signaturesCount: 1,
        transitionsCount: 2,
        worstThresholdBand: "CRIT",
      },
    });
  });
});

describe("LogbookQueryService — stats", () => {
  it("agrega por status y cuenta excepciones con el MISMO where del listado", async () => {
    const { logbook, prisma } = makeServices({
      logEntry: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi
          .fn()
          .mockResolvedValueOnce(10) // total
          .mockResolvedValueOnce(3) // firmas pendientes
          .mockResolvedValueOnce(2) // CRIT
          .mockResolvedValueOnce(4), // WARN
        groupBy: vi.fn().mockResolvedValue([
          { status: "DRAFT", _count: { _all: 6 } },
          { status: "SUBMITTED", _count: { _all: 4 } },
        ]),
      },
    });
    const stats = await logbook.stats("u1", { status: "DRAFT" });
    expect(stats).toEqual({
      total: 10,
      byStatus: { DRAFT: 6, SUBMITTED: 4, VOID: 0 },
      pendingSignatures: 3,
      withCrit: 2,
      withWarn: 4,
    });
    expect(prisma.logEntry.count).toHaveBeenCalledTimes(4);
  });
});

describe("LogbookQueryService — timeline", () => {
  it("fusiona cambios + transiciones + sintéticos en orden DESC y pagina", async () => {
    const { logbook } = makeServices({
      logEntry: {
        findFirst: vi.fn().mockResolvedValue(baseEntry({ sealedAt: new Date("2026-06-10T12:00:00.000Z") })),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      logEntryFieldChange: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "c2",
            fieldKey: "temp",
            before: 10,
            after: 20,
            reason: null,
            changedById: "u1",
            changedAt: new Date("2026-06-10T11:30:00.000Z"),
          },
          {
            id: "c1",
            fieldKey: "temp",
            before: null,
            after: 10,
            reason: null,
            changedById: "u1",
            changedAt: new Date("2026-06-10T10:30:00.000Z"),
          },
        ]),
      },
      logEntryTransition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "tr1",
            transitionKey: "send",
            fromStateKey: "open",
            toStateKey: "review",
            actorId: "u1",
            actorEmail: "u@x.cl",
            reason: null,
            signatureId: null,
            occurredAt: new Date("2026-06-10T12:00:00.000Z"),
          },
        ]),
        findFirst: vi.fn(),
        groupBy: vi.fn(),
      },
    });

    const page = await logbook.timeline("u1", "e1", {});
    // SEALED y TRANSITION son simultáneos (mismo instante en la misma tx): el
    // desempate es por id (estable para el cursor), no por tipo de evento.
    expect(page.events.map((e) => e.kind)).toEqual(["TRANSITION", "SEALED", "FIELD_CHANGE", "FIELD_CHANGE", "CREATED"]);
    expect(page.events.map((e) => e.at)).toEqual([...page.events.map((e) => e.at)].sort().reverse());
    expect(page.nextCursor).toBeNull();

    const small = await logbook.timeline("u1", "e1", { take: 2 });
    expect(small.events).toHaveLength(2);
    expect(small.nextCursor).not.toBeNull();
  });

  it("una entrada DIFERIDA emite el evento DEFERRED_DECLARED con quién/cuándo/por qué (2.7.0)", async () => {
    const { logbook } = makeServices({
      logEntry: {
        findFirst: vi.fn().mockResolvedValue(
          baseEntry({
            entryOrigin: "DEFERRED",
            declaredEffectiveAt: new Date("2026-06-09T22:30:00.000Z"),
            deferredReason: "Sin señal en terreno",
            deferredDeclaredById: "u1",
            deferredDeclaredAt: new Date("2026-06-10T10:00:00.000Z"),
          }),
        ),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
    });

    const page = await logbook.timeline("u1", "e1", {});
    const deferredEvent = page.events.find((e) => e.kind === "DEFERRED_DECLARED");
    expect(deferredEvent).toMatchObject({
      kind: "DEFERRED_DECLARED",
      actorName: "Demo User",
      declaredEffectiveAt: "2026-06-09T22:30:00.000Z",
      reason: "Sin señal en terreno",
    });
  });
});

describe("LogbookQueryService — verificación de integridad de firma", () => {
  const signedAt = new Date("2026-06-10T11:00:00.000Z");

  function signature(values: Record<string, unknown>, over: Record<string, unknown> = {}) {
    const payload = canonicalSignaturePayload({
      entryId: "e1",
      templateVersionId: "tv1",
      context: "SECTION_COMPLETION",
      transitionKey: null,
      sectionKey: "s1",
      fromStateKey: null,
      toStateKey: null,
      signerId: "u1",
      meaning: "Sección completada y firmada",
      signedAt: signedAt.toISOString(),
      values,
    });
    return {
      id: "sig1",
      logEntryId: "e1",
      context: "SECTION_COMPLETION",
      transitionKey: null,
      sectionKey: "s1",
      signerId: "u1",
      signerName: "Demo User",
      meaning: "Sección completada y firmada",
      method: "PASSWORD",
      payloadHash: createHash("sha256").update(payload, "utf8").digest("hex"),
      signedAt,
      ...over,
    };
  }

  it("VALID cuando el hash coincide con los valores actuales", async () => {
    const { logbook, audit } = makeServices({
      logEntrySignature: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn().mockResolvedValue(signature({ temp: 42 })) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "temp", value: 42 }]) },
    });
    const result = await logbook.verifySignature("u1", "e1", "sig1", ctx);
    expect(result.verdict).toBe("VALID");
    expect(result.changesAfterSignature).toBe(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "logentry.signature.verified", entityId: "sig1" }),
    );
  });

  it("VALID_RECORD_CHANGED_AFTER cuando el rebobinado reconstruye lo firmado", async () => {
    const { logbook } = makeServices({
      logEntrySignature: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn().mockResolvedValue(signature({ temp: 42 })) },
      // Hoy el valor es 50; el cambio 42→50 ocurrió DESPUÉS de firmar.
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "temp", value: 50 }]) },
      logEntryFieldChange: {
        findMany: vi.fn().mockResolvedValue([
          { id: "c9", fieldKey: "temp", before: 42, after: 50, changedById: "u1", changedAt: new Date("2026-06-10T12:00:00.000Z"), reason: null },
        ]),
      },
    });
    const result = await logbook.verifySignature("u1", "e1", "sig1", ctx);
    expect(result.verdict).toBe("VALID_RECORD_CHANGED_AFTER");
    expect(result.changesAfterSignature).toBe(1);
  });

  it("INVALID cuando el contenido firmado no es reconstruible", async () => {
    const { logbook } = makeServices({
      logEntrySignature: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(signature({ temp: 42 }, { payloadHash: "0".repeat(64) })),
      },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "temp", value: 42 }]) },
    });
    const result = await logbook.verifySignature("u1", "e1", "sig1", ctx);
    expect(result.verdict).toBe("INVALID");
  });

  it("404 si la firma no pertenece a la entrada", async () => {
    const { logbook } = makeServices();
    await expect(logbook.verifySignature("u1", "e1", "ajena", ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("una firma de TRANSICIÓN recupera from/to desde su transición", async () => {
    const transitionSig = (() => {
      const payload = canonicalSignaturePayload({
        entryId: "e1",
        templateVersionId: "tv1",
        context: "TRANSITION",
        transitionKey: "approve",
        sectionKey: null,
        fromStateKey: "review",
        toStateKey: "closed",
        signerId: "u1",
        meaning: "Aprobado",
        signedAt: signedAt.toISOString(),
        values: { temp: 42 },
      });
      return {
        id: "sig2",
        logEntryId: "e1",
        context: "TRANSITION",
        transitionKey: "approve",
        sectionKey: null,
        signerId: "u1",
        signerName: "Demo User",
        meaning: "Aprobado",
        method: "PASSWORD_MFA",
        payloadHash: createHash("sha256").update(payload, "utf8").digest("hex"),
        signedAt,
      };
    })();
    const { logbook } = makeServices({
      logEntrySignature: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn().mockResolvedValue(transitionSig) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "temp", value: 42 }]) },
      logEntryTransition: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ fromStateKey: "review", toStateKey: "closed" }),
      },
    });
    const result = await logbook.verifySignature("u1", "e1", "sig2", ctx);
    expect(result.verdict).toBe("VALID");
  });
});
