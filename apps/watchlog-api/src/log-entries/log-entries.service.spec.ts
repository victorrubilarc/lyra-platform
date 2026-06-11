import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogEntriesService } from "./log-entries.service";
import type { AuditService } from "../audit/audit.service";
import type { ReauthService } from "../auth/reauth.service";
import type { ScopeService } from "../authz/scope.service";
import type { EncryptionService } from "../crypto/encryption.service";
import type { ShiftResolver } from "../operational-calendar/shift-resolver";
import type { FiscalResolver } from "../fiscal-calendar/fiscal-resolver";
import type { OperationalPeriodService } from "../operational-periods/operational-periods.service";
import type { PermissionService } from "../authz/permission.service";
import type { PrismaService } from "../prisma/prisma.service";

const ctx = { actorId: "u1", actorEmail: "u@x.cl", ip: null, userAgent: null };

type Field = Record<string, unknown>;
const field = (over: Field): Field => ({
  id: "f-" + over.key,
  semanticRole: null,
  help: null,
  required: false,
  order: 1,
  config: {},
  visibleWhen: null,
  roles: [],
  ...over,
});
const section = (key: string, fields: Field[], over: Field = {}): Field => ({
  id: "sec-" + key,
  key,
  title: key,
  description: null,
  order: 1,
  requireSignature: false,
  editableInStateKey: null,
  roles: [],
  fields,
  ...over,
});
const versionGraph = (sections: Field[], over: Field = {}): Field => ({
  id: "v1",
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
  sections,
  ...over,
});

function makeService(
  prismaOver: Record<string, unknown> = {},
  opts: {
    dims?: unknown;
    fiscal?: unknown;
    scope?: Partial<ScopeService>;
    reauth?: Partial<ReauthService>;
    periods?: Partial<OperationalPeriodService>;
    perms?: string[];
  } = {},
) {
  const tx = {
    logEntryValue: { upsert: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) },
    logEntryFieldChange: { create: vi.fn().mockResolvedValue({}) },
    logEntrySection: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    logEntry: { update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: "e1" }) },
    logEntryTransition: { create: vi.fn().mockResolvedValue({ id: "tr1" }) },
    logEntrySignature: { create: vi.fn().mockResolvedValue({ id: "sig1" }) },
  };
  const prisma = {
    template: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue({ name: "Plantilla" }) },
    templateVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
    workflowState: { findFirst: vi.fn().mockResolvedValue(null) },
    workflowDefinitionVersion: { findUnique: vi.fn() },
    logEntry: { create: vi.fn().mockResolvedValue({ id: "e1" }), findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    logEntrySection: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() },
    logEntryValue: { findMany: vi.fn().mockResolvedValue([]) },
    logEntryTransition: { findMany: vi.fn().mockResolvedValue([]) },
    logEntrySignature: { findMany: vi.fn().mockResolvedValue([]) },
    referenceList: { findMany: vi.fn().mockResolvedValue([]) },
    orgNode: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]) },
    equipment: { count: vi.fn().mockResolvedValue(1) },
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    role: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx))),
    ...prismaOver,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = { getAccessibleNodeIds: vi.fn().mockResolvedValue(null), canAccessNode: vi.fn().mockResolvedValue(true), ...opts.scope } as unknown as ScopeService;
  const shiftResolver = {
    resolve: vi.fn().mockResolvedValue(opts.dims ?? { operationalDate: "2026-06-09", shiftCode: "A", shiftLabel: "A" }),
  } as unknown as ShiftResolver;
  const fiscalResolver = {
    resolvePeriodKey: vi.fn().mockResolvedValue(opts.fiscal ?? { fiscalCalendarId: "fc1", periodKey: "2026-06" }),
  } as unknown as FiscalResolver;
  const reauth = {
    verifyForSignature: vi.fn().mockResolvedValue({ method: "PASSWORD", signerName: "Demo User" }),
    ...opts.reauth,
  } as unknown as ReauthService;
  const enc = { sha256: vi.fn().mockReturnValue("deadbeef") } as unknown as EncryptionService;
  const periods = {
    assertWritable: vi.fn().mockResolvedValue(undefined),
    isWriteBlockedForActor: vi.fn().mockResolvedValue(false),
    ...opts.periods,
  } as unknown as OperationalPeriodService;
  const permissions = {
    getEffectivePermissions: vi.fn().mockResolvedValue(new Set(opts.perms ?? [])),
  } as unknown as PermissionService;
  return {
    service: new LogEntriesService(prisma, audit, scope, shiftResolver, fiscalResolver, reauth, enc, periods, permissions),
    prisma,
    audit,
    shiftResolver,
    reauth,
    enc,
    periods,
    permissions,
    tx,
  };
}

/** Construye una versión de flujo congelada (estados + transiciones) para los tests. */
function wfVersion(over: Record<string, unknown> = {}) {
  return {
    id: "wfv1",
    workflowDefinitionId: "wf1",
    versionNumber: 1,
    status: "PUBLISHED",
    name: "Cierre",
    description: null,
    publishedAt: new Date(),
    states: [
      { id: "st-open", key: "open", name: "Abierto", description: null, order: 1, isInitial: true, isFinal: false, color: null },
      { id: "st-rev", key: "review", name: "En revisión", description: null, order: 2, isInitial: false, isFinal: false, color: null },
      { id: "st-closed", key: "closed", name: "Cerrado", description: null, order: 3, isInitial: false, isFinal: true, color: null },
    ],
    transitions: [
      { id: "t-send", key: "send", label: "Enviar a revisión", order: 1, requireSignature: false, signatureMeaning: null, requireMfa: false, fromState: { key: "open" }, toState: { key: "review" }, roles: [] },
      { id: "t-appr", key: "approve", label: "Aprobar", order: 2, requireSignature: true, signatureMeaning: "Aprobado", requireMfa: false, fromState: { key: "review" }, toState: { key: "closed" }, roles: [{ roleId: "supervisor" }] },
    ],
    ...over,
  };
}

describe("LogEntriesService — create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("instancia secciones, estampa dimensiones vía ShiftResolver y audita", async () => {
    const { service, prisma, audit, shiftResolver } = makeService({
      template: {
        findFirst: vi.fn().mockResolvedValue({ id: "t1", status: "PUBLISHED", currentVersionId: "v1", orgNodeId: "n1" }),
        findUnique: vi.fn().mockResolvedValue({ name: "Turno" }),
      },
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    await service.create("u1", { templateId: "t1" }, ctx);

    expect(shiftResolver.resolve).toHaveBeenCalled();
    expect(prisma.logEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          shiftCode: "A",
          operationalDate: "2026-06-09",
          periodKey: "2026-06",
          sections: { create: [expect.objectContaining({ sectionKey: "s1", state: "PENDING" })] },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.created" }));
  });

  it("rechaza si la plantilla no está publicada", async () => {
    const { service } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1", status: "DRAFT", currentVersionId: null }) },
    });
    await expect(service.create("u1", { templateId: "t1" }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza si la plantilla global no aporta nodo", async () => {
    const { service } = makeService({
      template: { findFirst: vi.fn().mockResolvedValue({ id: "t1", status: "PUBLISHED", currentVersionId: "v1", orgNodeId: null }) },
    });
    await expect(service.create("u1", { templateId: "t1" }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("guarda de período (2.7.1): create propaga el rechazo y NO persiste si el período está cerrado", async () => {
    const { service, prisma } = makeService(
      {
        template: {
          findFirst: vi.fn().mockResolvedValue({ id: "t1", status: "PUBLISHED", currentVersionId: "v1", orgNodeId: "n1" }),
          findUnique: vi.fn().mockResolvedValue({ name: "Turno" }),
        },
        templateVersion: {
          findFirst: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
        },
      },
      { periods: { assertWritable: vi.fn().mockRejectedValue(new ForbiddenException("Período cerrado")) } },
    );
    await expect(service.create("u1", { templateId: "t1" }, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.logEntry.create).not.toHaveBeenCalled();
  });
});

describe("LogEntriesService — saveSection", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseEntry = { id: "e1", status: "DRAFT", orgNodeId: "n1", templateVersionId: "v1", currentStateKey: null, recordedAt: new Date() };

  function setup(prismaOver: Record<string, unknown> = {}) {
    return makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(baseEntry), update: vi.fn().mockResolvedValue({}), create: vi.fn(), findMany: vi.fn() },
      templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "temp", type: "NUMBER", dataType: "NUMBER", label: "Temp", config: { min: 0, max: 100 } })])])) },
      ...prismaOver,
    });
  }

  it("detecta conflicto de concurrencia (expectedVersion ≠ version actual)", async () => {
    const { service } = setup({
      logEntrySection: { findUnique: vi.fn().mockResolvedValue({ id: "ls1", version: 5 }), update: vi.fn() },
    });
    await expect(
      service.saveSection("u1", "e1", "s1", { expectedVersion: 3, values: [] }, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rechaza un valor fuera de rango (validación en servidor)", async () => {
    const { service } = setup({
      logEntrySection: { findUnique: vi.fn().mockResolvedValue({ id: "ls1", version: 0 }), update: vi.fn() },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await expect(
      service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [{ fieldKey: "temp", value: 150 }] }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("persiste el valor, escribe historial, sube version y recalcula dimensiones", async () => {
    const { service, tx } = setup({
      logEntrySection: { findUnique: vi.fn().mockResolvedValue({ id: "ls1", version: 0 }), update: vi.fn() },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([]) },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    await service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [{ fieldKey: "temp", value: 42 }] }, ctx);

    expect(tx.logEntryValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ fieldKey: "temp", dataType: "NUMBER", value: 42 }) }),
    );
    expect(tx.logEntryFieldChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fieldKey: "temp", before: expect.anything(), after: 42 }) }),
    );
    expect(tx.logEntrySection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 }, state: "IN_PROGRESS" }) }),
    );
    expect(tx.logEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shiftCode: "A", periodKey: "2026-06" }) }),
    );
  });

  it("prohíbe editar una sección cuyo rol el usuario no tiene", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(baseEntry), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      templateVersion: {
        findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [], { roles: [{ roleId: "supervisor" }] })])),
      },
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "operador" }]) },
    });
    await expect(
      service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [] }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("override por campo: bloquea CAMBIAR un campo reservado a otro rol, pero un eco sin cambio no bloquea la sección", async () => {
    const make = () =>
      makeService({
        logEntry: { findFirst: vi.fn().mockResolvedValue(baseEntry), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
        templateVersion: {
          findUnique: vi.fn().mockResolvedValue(
            versionGraph([
              section("s1", [
                field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" }),
                field({ key: "vb", type: "TEXT", dataType: "STRING", label: "VB", roles: [{ roleId: "supervisor" }] }),
              ]),
            ]),
          ),
        },
        logEntrySection: { findUnique: vi.fn().mockResolvedValue({ id: "ls1", version: 0 }), update: vi.fn() },
        logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "vb", value: "firmado" }]) },
        userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "operador" }]) },
      });

    // Intento de CAMBIO del campo reservado → 403.
    const a = make();
    await expect(
      a.service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [{ fieldKey: "vb", value: "alterado" }] }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Eco del mismo valor (cliente que reenvía la sección completa) → guarda OK.
    const b = make();
    vi.spyOn(b.service, "getDetail").mockResolvedValue({ id: "e1" } as never);
    await b.service.saveSection(
      "u1", "e1", "s1",
      { expectedVersion: 0, values: [{ fieldKey: "obs", value: "nota" }, { fieldKey: "vb", value: "firmado" }] },
      ctx,
    );
    expect(b.tx.logEntryValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ fieldKey: "obs" }) }),
    );
  });

  it("rechaza guardar en una entrada ya enviada", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue({ ...baseEntry, status: "SUBMITTED" }), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    });
    await expect(
      service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [] }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("LogEntriesService — getDetail (motivos de bloqueo #4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expone blockedReason MISSING_ROLE + assignedRoleNames + readOnlyFieldKeys para el usuario sin el rol", async () => {
    const { service } = makeService({
      logEntry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "e1", entryNumber: 7, status: "DRAFT", orgNodeId: "n1", templateId: "t1", templateVersionId: "v1",
          workflowDefinitionId: null, workflowDefinitionVersionId: null, currentStateKey: null, equipmentId: null,
          recordedAt: new Date(), effectiveAt: new Date(), shiftCode: null, operationalDate: null, periodKey: null,
          sealedAt: null, createdById: "u1", createdAt: new Date(), updatedAt: new Date(),
        }),
        update: vi.fn(), create: vi.fn(), findMany: vi.fn(),
      },
      templateVersion: {
        findUnique: vi.fn().mockResolvedValue(
          versionGraph([
            section("s_libre", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })]),
            section(
              "s_super",
              [
                field({ key: "vb", type: "TEXT", dataType: "STRING", label: "VB" }),
                field({ key: "nota", type: "TEXT", dataType: "STRING", label: "Nota", roles: [{ roleId: "supervisor" }] }),
              ],
              { roles: [{ roleId: "supervisor" }] },
            ),
          ]),
        ),
      },
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "operador" }]) },
      role: { findMany: vi.fn().mockResolvedValue([{ id: "supervisor", name: "Supervisor" }]) },
    });

    const detail = await service.getDetail("u1", "e1");

    const libre = detail.sectionStates.find((s) => s.sectionKey === "s_libre")!;
    expect(libre.editable).toBe(true);
    expect(libre.blockedReason).toBeNull();
    expect(libre.assignedRoleNames).toEqual([]);

    const superv = detail.sectionStates.find((s) => s.sectionKey === "s_super")!;
    expect(superv.editable).toBe(false);
    expect(superv.blockedReason).toBe("MISSING_ROLE");
    expect(superv.assignedRoleNames).toEqual(["Supervisor"]);
    // El override por campo también se refleja (la UI lo pinta read-only).
    expect(superv.readOnlyFieldKeys).toEqual(["nota"]);
  });

  it("expone ENTRY_CLOSED cuando la entrada ya fue enviada", async () => {
    const { service } = makeService({
      logEntry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "e1", entryNumber: 7, status: "SUBMITTED", orgNodeId: "n1", templateId: "t1", templateVersionId: "v1",
          workflowDefinitionId: null, workflowDefinitionVersionId: null, currentStateKey: null, equipmentId: null,
          recordedAt: new Date(), effectiveAt: new Date(), shiftCode: null, operationalDate: null, periodKey: null,
          sealedAt: new Date(), createdById: "u1", createdAt: new Date(), updatedAt: new Date(),
        }),
        update: vi.fn(), create: vi.fn(), findMany: vi.fn(),
      },
      templateVersion: {
        findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
      },
    });

    const detail = await service.getDetail("u1", "e1");
    expect(detail.sectionStates[0]!.editable).toBe(false);
    expect(detail.sectionStates[0]!.blockedReason).toBe("ENTRY_CLOSED");
  });

  it("expone PERIOD_CLOSED en una entrada en borrador cuyo período está cerrado y el actor no tiene excepción (2.7.1)", async () => {
    const { service } = makeService(
      {
        logEntry: {
          findFirst: vi.fn().mockResolvedValue({
            id: "e1", entryNumber: 8, status: "DRAFT", orgNodeId: "n1", templateId: "t1", templateVersionId: "v1",
            workflowDefinitionId: null, workflowDefinitionVersionId: null, currentStateKey: null, equipmentId: null,
            recordedAt: new Date(), effectiveAt: new Date(), shiftCode: null, operationalDate: null, periodKey: "2026-06",
            sealedAt: null, createdById: "u1", createdAt: new Date(), updatedAt: new Date(),
          }),
          update: vi.fn(), create: vi.fn(), findMany: vi.fn(),
        },
        templateVersion: {
          findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
        },
      },
      { periods: { isWriteBlockedForActor: vi.fn().mockResolvedValue(true) } },
    );

    const detail = await service.getDetail("u1", "e1");
    expect(detail.sectionStates[0]!.editable).toBe(false);
    expect(detail.sectionStates[0]!.blockedReason).toBe("PERIOD_CLOSED");
  });
});

describe("LogEntriesService — submit", () => {
  beforeEach(() => vi.clearAllMocks());

  const entry = { id: "e1", status: "DRAFT", orgNodeId: "n1", templateVersionId: "v1", currentStateKey: null, recordedAt: new Date() };

  it("rechaza si falta un obligatorio visible", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(entry), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs", required: true })])])) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await expect(service.submit("u1", "e1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sella effectiveAt + dimensiones y marca SUBMITTED (todas las secciones COMPLETED)", async () => {
    const update = vi.fn().mockResolvedValue({});
    const { service, audit } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(entry), update, create: vi.fn(), findMany: vi.fn() },
      templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "obs", value: "ok" }]) },
      logEntrySection: { findMany: vi.fn().mockResolvedValue([{ id: "ls1", sectionKey: "s1", state: "COMPLETED" }]), findUnique: vi.fn(), update: vi.fn() },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    await service.submit("u1", "e1", {}, ctx);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED", sealedAt: expect.any(Date), shiftCode: "A" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.submitted" }));
  });

  it("rechaza enviar con una sección sin COMPLETAR aunque sus valores sean válidos (#4)", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(entry), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "obs", value: "ok" }]) },
      logEntrySection: { findMany: vi.fn().mockResolvedValue([{ id: "ls1", sectionKey: "s1", state: "IN_PROGRESS" }]), findUnique: vi.fn(), update: vi.fn() },
    });
    await expect(service.submit("u1", "e1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("la validación de envío es OBJETIVA: exige también las secciones asignadas a OTROS roles (#4)", async () => {
    // El que envía no tiene el rol "supervisor" de s2; antes del fix esa sección
    // se saltaba y la entrada se sellaba incompleta (eludiendo incluso su firma).
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(entry), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      templateVersion: {
        findUnique: vi.fn().mockResolvedValue(
          versionGraph([
            section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })]),
            section("s2", [field({ key: "vb", type: "TEXT", dataType: "STRING", label: "VB", required: true })], { roles: [{ roleId: "supervisor" }] }),
          ]),
        ),
      },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "obs", value: "ok" }]) },
      logEntrySection: {
        findMany: vi.fn().mockResolvedValue([
          { id: "ls1", sectionKey: "s1", state: "COMPLETED" },
          { id: "ls2", sectionKey: "s2", state: "PENDING" },
        ]),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "operador" }]) },
    });
    await expect(service.submit("u1", "e1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza submit en una entrada CON flujo (debe usar transiciones)", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue({ ...entry, workflowDefinitionVersionId: "wfv1", currentStateKey: "open" }), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    });
    await expect(service.submit("u1", "e1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("LogEntriesService — registro diferido (2.7.0)", () => {
  beforeEach(() => vi.clearAllMocks());

  const publishedTemplate = {
    findFirst: vi.fn().mockResolvedValue({ id: "t1", status: "PUBLISHED", currentVersionId: "v1", orgNodeId: "n1" }),
    findUnique: vi.fn().mockResolvedValue({ name: "Turno" }),
  };
  const deferred = { effectiveAt: "2026-06-10T22:30:00.000Z", reason: "Sin señal en terreno" };

  it("create DIFERIDA sin campo EFFECTIVE_DATE: marca origen, declara fecha y estampa dims desde la declarada", async () => {
    const { service, prisma, shiftResolver, audit } = makeService({
      template: publishedTemplate,
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    await service.create("u1", { templateId: "t1", deferred }, ctx);

    expect(shiftResolver.resolve).toHaveBeenCalledWith(new Date(deferred.effectiveAt), "n1");
    expect(prisma.logEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryOrigin: "DEFERRED",
          declaredEffectiveAt: new Date(deferred.effectiveAt),
          effectiveAt: new Date(deferred.effectiveAt),
          deferredReason: deferred.reason,
          deferredDeclaredById: "u1",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "logentry.created", after: expect.objectContaining({ entryOrigin: "DEFERRED" }) }),
    );
  });

  it("create DIFERIDA con campo EFFECTIVE_DATE: el gesto ESCRIBE el campo (DATE conserva la fecha civil) con FieldChange", async () => {
    const { service, tx } = makeService({
      template: publishedTemplate,
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue(
          versionGraph([
            section("s1", [field({ key: "fechaEvento", type: "DATE", dataType: "DATE", label: "Fecha del evento", semanticRole: "EFFECTIVE_DATE" })]),
          ]),
        ),
      },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    // -04:00: el instante UTC cae al día siguiente; la fecha CIVIL del operador debe conservarse.
    await service.create("u1", { templateId: "t1", deferred: { effectiveAt: "2026-06-10T23:30:00-04:00", reason: "Turno sin acceso" } }, ctx);

    expect(tx.logEntry.create).toHaveBeenCalled();
    expect(tx.logEntryValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ fieldKey: "fechaEvento", value: "2026-06-10" }) }),
    );
    expect(tx.logEntryFieldChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fieldKey: "fechaEvento", after: "2026-06-10", reason: "Turno sin acceso" }) }),
    );
    expect(tx.logEntrySection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { version: { increment: 1 } } }),
    );
  });

  it("rechaza diferir si el campo EFFECTIVE_DATE está reservado a otro rol (sin bypass del override)", async () => {
    const { service } = makeService({
      template: publishedTemplate,
      templateVersion: {
        findFirst: vi.fn().mockResolvedValue(
          versionGraph([
            section("s1", [
              field({ key: "fechaEvento", type: "DATETIME", dataType: "DATETIME", label: "Fecha del evento", semanticRole: "EFFECTIVE_DATE", roles: [{ roleId: "supervisor" }] }),
            ]),
          ]),
        ),
      },
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "operador" }]) },
    });
    await expect(service.create("u1", { templateId: "t1", deferred }, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  const draftEntry = {
    id: "e1", status: "DRAFT", orgNodeId: "n1", templateVersionId: "v1", currentStateKey: null,
    recordedAt: new Date("2026-06-11T10:00:00.000Z"), sealedAt: null,
    entryOrigin: "ONLINE", declaredEffectiveAt: null, deferredReason: null,
  };

  function setupDeferral(entryOver: Record<string, unknown> = {}) {
    const m = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue({ ...draftEntry, ...entryOver }), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      templateVersion: {
        findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])),
      },
    });
    vi.spyOn(m.service, "getDetail").mockResolvedValue({ id: "e1" } as never);
    return m;
  }

  it("setDeferral declara sobre un borrador: actualiza marca + effectiveAt + dims y audita", async () => {
    const { service, tx, audit, shiftResolver } = setupDeferral();

    await service.setDeferral("u1", "e1", { deferred }, ctx);

    expect(shiftResolver.resolve).toHaveBeenCalledWith(new Date(deferred.effectiveAt), "n1");
    expect(tx.logEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryOrigin: "DEFERRED",
          declaredEffectiveAt: new Date(deferred.effectiveAt),
          effectiveAt: new Date(deferred.effectiveAt),
          deferredReason: deferred.reason,
          shiftCode: "A",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.deferral.declared" }));
  });

  it("setDeferral con null QUITA la marca y vuelve a recordedAt (sin campo de fecha)", async () => {
    const { service, tx, audit } = setupDeferral({
      entryOrigin: "DEFERRED",
      declaredEffectiveAt: new Date("2026-06-10T22:30:00.000Z"),
      deferredReason: "x",
    });

    await service.setDeferral("u1", "e1", { deferred: null }, ctx);

    expect(tx.logEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryOrigin: "ONLINE",
          declaredEffectiveAt: null,
          deferredReason: null,
          effectiveAt: new Date("2026-06-11T10:00:00.000Z"),
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.deferral.cleared" }));
  });

  it("rechaza declarar/quitar en una entrada sellada o enviada (origen inmutable)", async () => {
    const sealed = setupDeferral({ sealedAt: new Date() });
    await expect(sealed.service.setDeferral("u1", "e1", { deferred }, ctx)).rejects.toBeInstanceOf(BadRequestException);

    const submitted = setupDeferral({ status: "SUBMITTED" });
    await expect(submitted.service.setDeferral("u1", "e1", { deferred: null }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("LogEntriesService — executeTransition", () => {
  beforeEach(() => vi.clearAllMocks());

  // Plantilla con 2 secciones, cada una editable en un estado del flujo.
  const flowTemplate = () =>
    versionGraph(
      [
        section("s_open", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })], { editableInStateKey: "open" }),
        section("s_review", [field({ key: "vb", type: "TEXT", dataType: "STRING", label: "VB" })], { editableInStateKey: "review" }),
      ],
      { workflowDefinitionId: "wf1", workflowDefinitionVersionId: "wfv1" },
    );

  const flowEntry = (over: Record<string, unknown> = {}) => ({
    id: "e1", status: "DRAFT", orgNodeId: "n1", templateId: "t1", templateVersionId: "v1",
    workflowDefinitionId: "wf1", workflowDefinitionVersionId: "wfv1", currentStateKey: "open",
    recordedAt: new Date(), sealedAt: null, ...over,
  });

  function setupFlow(over: { entry?: Record<string, unknown>; sections?: unknown[]; roles?: string[]; reauth?: Partial<ReauthService> } = {}) {
    const m = makeService(
      {
        logEntry: { findFirst: vi.fn().mockResolvedValue(flowEntry(over.entry)), update: vi.fn().mockResolvedValue({}), create: vi.fn(), findMany: vi.fn() },
        templateVersion: { findUnique: vi.fn().mockResolvedValue(flowTemplate()) },
        workflowDefinitionVersion: { findUnique: vi.fn().mockResolvedValue(wfVersion()) },
        logEntrySection: {
          findMany: vi.fn().mockResolvedValue(
            over.sections ?? [
              { id: "ls-open", sectionKey: "s_open", state: "COMPLETED" },
              { id: "ls-rev", sectionKey: "s_review", state: "PENDING" },
            ],
          ),
          update: vi.fn(),
        },
        logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "obs", value: "ok" }, { fieldKey: "vb", value: "ok" }]) },
        userRole: { findMany: vi.fn().mockResolvedValue((over.roles ?? []).map((roleId) => ({ roleId }))) },
      },
      { reauth: over.reauth },
    );
    vi.spyOn(m.service, "getDetail").mockResolvedValue({ id: "e1" } as never);
    return m;
  }

  it("rechaza si la entrada no tiene flujo", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(flowEntry({ workflowDefinitionVersionId: null, currentStateKey: null })), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    });
    await expect(service.executeTransition("u1", "e1", { transitionKey: "send" }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza una transición inexistente", async () => {
    const { service } = setupFlow();
    await expect(service.executeTransition("u1", "e1", { transitionKey: "nope" }, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rechaza una transición que no sale del estado actual", async () => {
    const { service } = setupFlow();
    // "approve" sale de "review", pero la entrada está en "open".
    await expect(service.executeTransition("u1", "e1", { transitionKey: "approve" }, ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rechaza si el usuario no tiene un rol-dato autorizado", async () => {
    const { service } = setupFlow({ entry: { currentStateKey: "review" }, sections: [{ id: "ls-rev", sectionKey: "s_review", state: "COMPLETED" }], roles: [] });
    await expect(service.executeTransition("u1", "e1", { transitionKey: "approve", password: "x" }, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rechaza si una sección del estado de origen está incompleta", async () => {
    const { service } = setupFlow({ sections: [{ id: "ls-open", sectionKey: "s_open", state: "IN_PROGRESS" }, { id: "ls-rev", sectionKey: "s_review", state: "PENDING" }] });
    await expect(service.executeTransition("u1", "e1", { transitionKey: "send" }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("transición sin firma: persiste, sella al salir del inicial, no firma, sigue DRAFT", async () => {
    const { service, tx, reauth, audit } = setupFlow();
    await service.executeTransition("u1", "e1", { transitionKey: "send", reason: "listo" }, ctx);

    expect(reauth.verifyForSignature).not.toHaveBeenCalled();
    expect(tx.logEntrySignature.create).not.toHaveBeenCalled();
    expect(tx.logEntryTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ transitionKey: "send", fromStateKey: "open", toStateKey: "review", reason: "listo" }) }),
    );
    expect(tx.logEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStateKey: "review", status: "DRAFT", sealedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.transition.executed" }));
  });

  it("transición con firma: re-autentica, crea la firma y finaliza (SUBMITTED) al llegar a final", async () => {
    const { service, tx, reauth } = setupFlow({
      entry: { currentStateKey: "review", sealedAt: new Date() },
      sections: [{ id: "ls-rev", sectionKey: "s_review", state: "COMPLETED" }],
      roles: ["supervisor"],
    });
    await service.executeTransition("u1", "e1", { transitionKey: "approve", password: "Demo!Pass" }, ctx);

    expect(reauth.verifyForSignature).toHaveBeenCalledWith("u1", expect.objectContaining({ password: "Demo!Pass" }), { requireMfa: false });
    expect(tx.logEntrySignature.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ context: "TRANSITION", transitionKey: "approve", meaning: "Aprobado", method: "PASSWORD" }) }),
    );
    expect(tx.logEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentStateKey: "closed", status: "SUBMITTED" }) }),
    );
  });

  it("propaga requireMfa de la transición al step-up de re-auth", async () => {
    const wf = wfVersion();
    (wf.transitions[1] as Record<string, unknown>).requireMfa = true;
    const { service, reauth } = setupFlow({
      entry: { currentStateKey: "review", sealedAt: new Date() },
      sections: [{ id: "ls-rev", sectionKey: "s_review", state: "COMPLETED" }],
      roles: ["supervisor"],
    });
    // Sobrescribe la versión de flujo con requireMfa = true en "approve".
    (service as unknown as { prisma: { workflowDefinitionVersion: { findUnique: ReturnType<typeof vi.fn> } } }).prisma.workflowDefinitionVersion.findUnique.mockResolvedValue(wf);

    await service.executeTransition("u1", "e1", { transitionKey: "approve", password: "x", mfaCode: "123456" }, ctx);
    expect(reauth.verifyForSignature).toHaveBeenCalledWith("u1", expect.objectContaining({ mfaCode: "123456" }), { requireMfa: true });
  });
});
