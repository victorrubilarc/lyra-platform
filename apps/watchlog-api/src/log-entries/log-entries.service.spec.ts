import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogEntriesService } from "./log-entries.service";
import type { AuditService } from "../audit/audit.service";
import type { ReauthService } from "../auth/reauth.service";
import type { ScopeService } from "../authz/scope.service";
import type { EncryptionService } from "../crypto/encryption.service";
import type { ShiftResolver } from "../operational-calendar/shift-resolver";
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
  opts: { dims?: unknown; scope?: Partial<ScopeService>; reauth?: Partial<ReauthService> } = {},
) {
  const tx = {
    logEntryValue: { upsert: vi.fn().mockResolvedValue({}) },
    logEntryFieldChange: { create: vi.fn().mockResolvedValue({}) },
    logEntrySection: { update: vi.fn().mockResolvedValue({}) },
    logEntry: { update: vi.fn().mockResolvedValue({}) },
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
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(tx))),
    ...prismaOver,
  } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scope = { getAccessibleNodeIds: vi.fn().mockResolvedValue(null), canAccessNode: vi.fn().mockResolvedValue(true), ...opts.scope } as unknown as ScopeService;
  const shiftResolver = {
    resolve: vi.fn().mockResolvedValue(opts.dims ?? { operationalDate: "2026-06-09", shiftCode: "A", shiftLabel: "A", periodKind: "MONTH", periodKey: "2026-06" }),
  } as unknown as ShiftResolver;
  const reauth = {
    verifyForSignature: vi.fn().mockResolvedValue({ method: "PASSWORD", signerName: "Demo User" }),
    ...opts.reauth,
  } as unknown as ReauthService;
  const enc = { sha256: vi.fn().mockReturnValue("deadbeef") } as unknown as EncryptionService;
  return { service: new LogEntriesService(prisma, audit, scope, shiftResolver, reauth, enc), prisma, audit, shiftResolver, reauth, enc, tx };
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

  it("rechaza guardar en una entrada ya enviada", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue({ ...baseEntry, status: "SUBMITTED" }), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    });
    await expect(
      service.saveSection("u1", "e1", "s1", { expectedVersion: 0, values: [] }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it("sella effectiveAt + dimensiones y marca SUBMITTED", async () => {
    const update = vi.fn().mockResolvedValue({});
    const { service, audit } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue(entry), update, create: vi.fn(), findMany: vi.fn() },
      templateVersion: { findUnique: vi.fn().mockResolvedValue(versionGraph([section("s1", [field({ key: "obs", type: "TEXT", dataType: "STRING", label: "Obs" })])])) },
      logEntryValue: { findMany: vi.fn().mockResolvedValue([{ fieldKey: "obs", value: "ok" }]) },
    });
    vi.spyOn(service, "getDetail").mockResolvedValue({ id: "e1" } as never);

    await service.submit("u1", "e1", {}, ctx);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED", sealedAt: expect.any(Date), shiftCode: "A" }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "logentry.submitted" }));
  });

  it("rechaza submit en una entrada CON flujo (debe usar transiciones)", async () => {
    const { service } = makeService({
      logEntry: { findFirst: vi.fn().mockResolvedValue({ ...entry, workflowDefinitionVersionId: "wfv1", currentStateKey: "open" }), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    });
    await expect(service.submit("u1", "e1", {}, ctx)).rejects.toBeInstanceOf(BadRequestException);
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
