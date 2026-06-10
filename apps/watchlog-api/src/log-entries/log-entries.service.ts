import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AvailableTransitionDto,
  CreateLogEntryRequest,
  ExecuteTransitionRequest,
  FieldForValidation,
  LogEntryDetail,
  LogEntrySectionState,
  LogEntrySectionStateDto,
  LogEntrySignatureDto,
  LogEntrySignatureSummaryDto,
  LogEntryTransitionDto,
  LogEntryValueDto,
  SaveLogEntrySectionRequest,
  SignatureContext,
  SignatureMethod,
  SubmitLogEntryRequest,
  TemplateVersionDto,
  WorkflowVersionDto,
} from "@lyra/contracts";
import {
  availableTransitionsFor,
  canonicalSignaturePayload,
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  resolveEffectiveAt,
  thresholdBandFor,
  upgradeFieldConfig,
  validateFieldValue,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { ReauthService } from "../auth/reauth.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { EncryptionService } from "../crypto/encryption.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { PrismaService } from "../prisma/prisma.service";

/** Significado por defecto de la firma de completitud de sección (las secciones no
 * portan un campo de significado; las transiciones sí vía `signatureMeaning`). */
const SECTION_SIGNATURE_MEANING = "Sección completada y firmada";

/** Versión completa (secciones → campos → roles) para renderizar y validar. */
export const versionInclude = {
  sections: {
    orderBy: { order: "asc" },
    include: {
      roles: { select: { roleId: true } },
      fields: {
        orderBy: { order: "asc" },
        include: { roles: { select: { roleId: true } } },
      },
    },
  },
} satisfies Prisma.TemplateVersionInclude;

export type VersionWithGraph = Prisma.TemplateVersionGetPayload<{ include: typeof versionInclude }>;
export type LogEntryRow = Prisma.LogEntryGetPayload<Record<string, never>>;

/** Versión de flujo CONGELADA (estados + transiciones → roles) para ejecutar/render. */
export const workflowVersionInclude = {
  states: { orderBy: { order: "asc" } },
  transitions: {
    orderBy: { order: "asc" },
    include: {
      fromState: { select: { key: true } },
      toState: { select: { key: true } },
      roles: { select: { roleId: true } },
    },
  },
} satisfies Prisma.WorkflowDefinitionVersionInclude;

export type WorkflowVersionWithGraph = Prisma.WorkflowDefinitionVersionGetPayload<{
  include: typeof workflowVersionInclude;
}>;

/** Vista normalizada de un campo de la versión (para validar/autorizar). */
interface FieldDef {
  key: string;
  sectionKey: string;
  type: FieldForValidation["type"];
  dataType: FieldForValidation["dataType"];
  label: string;
  required: boolean;
  config: Record<string, unknown>;
  visibleWhen: { fieldKey: string; equals: string | number | boolean } | null;
  /** Override de roles por campo (vacío = hereda la sección). */
  roleIds: string[];
}

/** Evento de dominio emitido al ejecutar una transición (gancho de plataforma). */
export interface TransitionEvent {
  logEntryId: string;
  transitionKey: string;
  fromStateKey: string;
  toStateKey: string;
  toIsFinal: boolean;
  actorId: string;
}

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN auditada de una plantilla.
 *
 * La autorización (RBAC dim. 1–2) la deciden los guards del controller; este
 * service decide lo que es DATO: editabilidad por SECCIÓN = (sección editable en
 * el estado actual) × (rol con permiso de sección) × (ABAC sobre el nodo), con
 * override de rol por campo. Valida el 100% de los valores en servidor, audita
 * por campo (antes/después) y estampa las dimensiones operacionales vía
 * `ShiftResolver`. Concurrencia optimista por sección (`version` check-and-bump).
 *
 * EJECUCIÓN DE FLUJO (Fase 2.5): `executeTransition` valida en backend (a) la
 * transición sale del estado actual, (b) el usuario tiene un rol-dato autorizado,
 * (c) ABAC sobre el nodo, (d) completitud de las secciones del estado de origen;
 * aplica el cambio de estado, recomputa qué secciones quedan editables/`LOCKED`,
 * sella las dimensiones en la 1ª salida del estado inicial y, si la transición lo
 * exige, captura una FIRMA electrónica Part 11 con re-autenticación (`ReauthService`).
 * Esta lógica vive aquí (no en un servicio aparte) para reusar toda la maquinaria
 * de secciones/valores/validación/sellado sin exponerla ni duplicarla.
 */
@Injectable()
export class LogEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly shiftResolver: ShiftResolver,
    private readonly reauth: ReauthService,
    private readonly enc: EncryptionService,
  ) {}

  // --- Crear (abrir) una entrada ---------------------------------------------

  async create(userId: string, dto: CreateLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const template = await this.prisma.template.findFirst({ where: { id: dto.templateId, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    if (template.status !== "PUBLISHED" || !template.currentVersionId) {
      throw new BadRequestException("La plantilla debe estar publicada para registrar entradas");
    }

    const orgNodeId = dto.orgNodeId ?? template.orgNodeId;
    if (!orgNodeId) {
      throw new BadRequestException("Debe indicar un nodo de la estructura para la entrada");
    }
    await this.assertNodeExists(orgNodeId);
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
    if (dto.equipmentId) await this.assertEquipmentExists(dto.equipmentId);

    const version = await this.prisma.templateVersion.findFirst({
      where: { id: template.currentVersionId },
      include: versionInclude,
    });
    if (!version) throw new BadRequestException("La plantilla no tiene una versión publicada válida");

    // Estado inicial del flujo congelado (si la versión tiene flujo).
    const currentStateKey = await this.initialStateKey(version.workflowDefinitionVersionId);

    const recordedAt = new Date();
    // Sin valores aún → effectiveAt = recordedAt; se recalcula al guardar/enviar.
    const dims = await this.shiftResolver.resolve(recordedAt, orgNodeId);

    const created = await this.prisma.logEntry.create({
      data: {
        templateId: template.id,
        templateVersionId: version.id,
        workflowDefinitionId: version.workflowDefinitionId,
        workflowDefinitionVersionId: version.workflowDefinitionVersionId,
        orgNodeId,
        equipmentId: dto.equipmentId ?? null,
        currentStateKey,
        status: "DRAFT",
        recordedAt,
        effectiveAt: recordedAt,
        shiftCode: dims?.shiftCode ?? null,
        operationalDate: dims?.operationalDate ?? null,
        periodKey: dims?.periodKey ?? null,
        createdById: userId,
        updatedById: userId,
        sections: {
          // `requiresSignature` se ESTAMPA desde la definición congelada (2.6):
          // así "firmas pendientes" es un filtro SQL sin join a la definición.
          create: version.sections.map((s) => ({
            sectionKey: s.key,
            state: "PENDING" as const,
            requiresSignature: s.requireSignature,
          })),
        },
      },
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.created",
      entityType: "LogEntry",
      entityId: created.id,
      after: { templateId: template.id, templateVersionId: version.id, orgNodeId },
    });
    return this.getDetail(userId, created.id);
  }

  // --- Detalle ---------------------------------------------------------------

  async getDetail(userId: string, id: string): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    await this.assertNodeInScope(userId, entry.orgNodeId);

    const version = await this.loadVersion(entry.templateVersionId);
    const template = await this.prisma.template.findUnique({ where: { id: entry.templateId } });
    const [sectionRows, valueRows, transitionRows, signatureRows, wfVersion, equipment] = await Promise.all([
      this.prisma.logEntrySection.findMany({ where: { logEntryId: id } }),
      this.prisma.logEntryValue.findMany({ where: { logEntryId: id } }),
      this.prisma.logEntryTransition.findMany({ where: { logEntryId: id }, orderBy: { occurredAt: "asc" } }),
      this.prisma.logEntrySignature.findMany({ where: { logEntryId: id }, orderBy: { signedAt: "asc" } }),
      entry.workflowDefinitionVersionId ? this.loadWorkflowVersion(entry.workflowDefinitionVersionId) : Promise.resolve(null),
      entry.equipmentId
        ? this.prisma.equipment.findUnique({ where: { id: entry.equipmentId }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    const roleIds = await this.userRoleIds(userId);
    const actorNames = await this.namesByUserId([
      entry.createdById,
      ...sectionRows.map((s) => s.filledById),
      ...transitionRows.map((t) => t.actorId),
    ]);
    const editable = entry.status === "DRAFT";
    const sigById = new Map(signatureRows.map((s) => [s.id, s]));

    const sectionStates: LogEntrySectionStateDto[] = version.sections.map((def) => {
      const row = sectionRows.find((r) => r.sectionKey === def.key);
      const sig = row?.signatureId ? sigById.get(row.signatureId) : undefined;
      return {
        sectionKey: def.key,
        state: row?.state ?? "PENDING",
        filledById: row?.filledById ?? null,
        filledByName: row?.filledById ? (actorNames.get(row.filledById) ?? null) : null,
        filledAt: row?.filledAt?.toISOString() ?? null,
        version: row?.version ?? 0,
        editable:
          editable &&
          this.isSectionEditableForUser(
            def.key,
            def.editableInStateKey,
            def.roles.map((r) => r.roleId),
            entry.currentStateKey,
            roleIds,
          ),
        signature: sig ? this.signatureSummary(sig) : null,
      };
    });

    const values: LogEntryValueDto[] = valueRows.map((v) => ({
      fieldKey: v.fieldKey,
      value: (v.value ?? null) as unknown,
      updatedAt: v.updatedAt.toISOString(),
      updatedById: v.updatedById,
    }));

    // Transiciones que ESTE usuario puede ejecutar ahora (solo si sigue editable).
    const labelByKey = new Map((wfVersion?.transitions ?? []).map((t) => [t.key, t.label]));
    const availableTransitions: AvailableTransitionDto[] =
      editable && wfVersion
        ? availableTransitionsFor(
            wfVersion.transitions.map((t) => ({
              key: t.key,
              label: t.label,
              fromStateKey: t.fromState.key,
              toStateKey: t.toState.key,
              requireSignature: t.requireSignature,
              signatureMeaning: t.signatureMeaning,
              requireMfa: t.requireMfa,
              roleIds: t.roles.map((r) => r.roleId),
            })),
            wfVersion.states.map((s) => ({ key: s.key, name: s.name })),
            entry.currentStateKey,
            roleIds,
          )
        : [];

    const transitions: LogEntryTransitionDto[] = transitionRows.map((t) => ({
      id: t.id,
      transitionKey: t.transitionKey,
      label: labelByKey.get(t.transitionKey) ?? null,
      fromStateKey: t.fromStateKey,
      toStateKey: t.toStateKey,
      actorId: t.actorId,
      actorName: t.actorId ? (actorNames.get(t.actorId) ?? null) : null,
      reason: t.reason,
      signature: t.signatureId ? (this.signatureSummary(sigById.get(t.signatureId)) ?? null) : null,
      occurredAt: t.occurredAt.toISOString(),
    }));

    const signatures: LogEntrySignatureDto[] = signatureRows.map((s) => ({
      id: s.id,
      context: s.context,
      transitionKey: s.transitionKey,
      sectionKey: s.sectionKey,
      signerId: s.signerId,
      signerName: s.signerName,
      meaning: s.meaning,
      method: s.method,
      payloadHash: s.payloadHash,
      signedAt: s.signedAt.toISOString(),
    }));

    const currentStateName =
      wfVersion && entry.currentStateKey
        ? (wfVersion.states.find((s) => s.key === entry.currentStateKey)?.name ?? entry.currentStateKey)
        : null;

    return {
      ...this.mapEntry(entry, template?.name ?? "—"),
      orgNodePath: await this.nodePath(entry.orgNodeId),
      createdByName: entry.createdById ? (actorNames.get(entry.createdById) ?? null) : null,
      equipmentName: equipment?.name ?? null,
      version: this.mapVersion(version),
      workflowVersion: wfVersion ? this.mapWorkflowVersion(wfVersion) : null,
      currentStateName,
      sectionStates,
      values,
      availableTransitions,
      transitions,
      signatures,
    };
  }

  // --- Guardar una sección ---------------------------------------------------

  async saveSection(
    userId: string,
    id: string,
    sectionKey: string,
    dto: SaveLogEntrySectionRequest,
    ctx: AuditContext,
  ): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue enviada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);

    const version = await this.loadVersion(entry.templateVersionId);
    const sectionDef = version.sections.find((s) => s.key === sectionKey);
    if (!sectionDef) throw new NotFoundException("Sección no encontrada en la versión");

    const roleIds = await this.userRoleIds(userId);
    if (
      !this.isSectionEditableForUser(
        sectionDef.key,
        sectionDef.editableInStateKey,
        sectionDef.roles.map((r) => r.roleId),
        entry.currentStateKey,
        roleIds,
      )
    ) {
      throw new ForbiddenException("No puede editar esta sección en el estado actual");
    }

    const sectionRow = await this.prisma.logEntrySection.findUnique({
      where: { logEntryId_sectionKey: { logEntryId: id, sectionKey } },
    });
    if (!sectionRow) throw new NotFoundException("Sección no instanciada");
    if (sectionRow.version !== dto.expectedVersion) {
      throw new ConflictException("La sección fue modificada por otra persona. Recargue para ver los cambios.");
    }

    const fieldsByKey = new Map(sectionDef.fields.map((f) => [f.key, this.toFieldDef(f, sectionKey)]));

    // Solo se aceptan campos de ESTA sección.
    for (const input of dto.values) {
      if (!fieldsByKey.has(input.fieldKey)) {
        throw new BadRequestException(`El campo "${input.fieldKey}" no pertenece a la sección`);
      }
    }

    // Override de rol por campo: si un campo declara roles y el usuario no los
    // tiene, no puede modificar SU valor (granularidad por campo, fork 3).
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (def.roleIds.length > 0 && !def.roleIds.some((r) => roleIds.has(r))) {
        throw new ForbiddenException(`No tiene permiso para editar el campo "${def.label}"`);
      }
    }

    // Snapshot de TODOS los valores actuales (para visibilidad y fecha efectiva).
    const existing = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });
    const valuesByKey: Record<string, unknown> = {};
    for (const v of existing) valuesByKey[v.fieldKey] = (v.value ?? null) as unknown;
    for (const input of dto.values) valuesByKey[input.fieldKey] = input.value ?? null;

    // Validación 100% en servidor (tipo/rango/umbral/formato/catálogo), saltando
    // campos ocultos por visibleWhen. Los obligatorios solo se exigen al completar.
    const allowed = await this.resolveAllowedCodes([...fieldsByKey.values()]);
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
      const res = validateFieldValue(def, input.value, { allowedCodes: allowed.get(def.key) });
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }

    if (dto.markComplete) {
      for (const def of fieldsByKey.values()) {
        if (!def.required) continue;
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        if (isEmptyValue(valuesByKey[def.key])) errors.push(`${def.label}: obligatorio`);
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "La sección tiene errores de validación", errors });
    }

    const now = new Date();
    const newState = dto.markComplete ? "COMPLETED" : "IN_PROGRESS";

    // Firma de completitud de sección (Part 11), si la sección la exige y se está
    // completando. Las secciones no portan flag de MFA → re-auth por contraseña.
    // La re-autenticación va ANTES de la transacción (no contamina la tx con I/O
    // de auth); si falla, lanza y nada se persiste.
    const mustSign = Boolean(dto.markComplete) && sectionDef.requireSignature;
    const reauth = mustSign
      ? await this.reauth.verifyForSignature(userId, { password: dto.password }, { requireMfa: false })
      : null;

    await this.prisma.$transaction(async (tx) => {
      for (const input of dto.values) {
        const def = fieldsByKey.get(input.fieldKey)!;
        const before = existing.find((e) => e.fieldKey === input.fieldKey);
        const beforeVal = (before?.value ?? null) as unknown;
        const afterVal = input.value ?? null;
        if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue; // sin cambio real

        // Banda ISA-18.2 ESTAMPADA al guardar (review-by-exception 2.6): la
        // validación ya la computó; persistirla evita re-evaluar configs al listar.
        const band = thresholdBandFor(def, afterVal);
        await tx.logEntryValue.upsert({
          where: { logEntryId_fieldKey: { logEntryId: id, fieldKey: input.fieldKey } },
          create: {
            logEntryId: id,
            sectionKey,
            fieldKey: input.fieldKey,
            dataType: def.dataType,
            value: this.toJson(afterVal),
            thresholdBand: band,
            updatedById: userId,
          },
          update: { value: this.toJson(afterVal), thresholdBand: band, updatedById: userId },
        });
        await tx.logEntryFieldChange.create({
          data: {
            logEntryId: id,
            fieldKey: input.fieldKey,
            before: this.toJson(beforeVal),
            after: this.toJson(afterVal),
            changedById: userId,
            // Mismo instante que la firma de completitud (si la hay): el rebobinado
            // de la verificación de integridad excluye con `> signedAt` exactamente
            // los cambios de ESTE guardado (no se puede confiar en el reloj de BD).
            changedAt: now,
          },
        });
      }

      // Snapshot canónico de TODOS los valores actuales (incluye los recién guardados).
      let signatureId: string | null = null;
      if (mustSign && reauth) {
        const signature = await this.createSignature(tx, {
          entry,
          context: "SECTION_COMPLETION",
          sectionKey,
          meaning: SECTION_SIGNATURE_MEANING,
          signerId: userId,
          signerName: reauth.signerName,
          method: reauth.method,
          valuesByKey,
          signedAt: now,
        });
        signatureId = signature.id;
      }

      await tx.logEntrySection.update({
        where: { id: sectionRow.id },
        data: {
          version: { increment: 1 },
          state: newState,
          filledById: userId,
          filledAt: now,
          ...(signatureId ? { signatureId } : {}),
        },
      });

      // Recalcula effectiveAt + dimensiones SOLO mientras la entrada no esté sellada
      // (el sellado lo congela la 1ª transición o el submit de un form sin flujo).
      if (!entry.sealedAt) {
        const effectiveAt = resolveEffectiveAt(
          version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
          valuesByKey,
          entry.recordedAt,
        );
        const dims = await this.shiftResolver.resolve(effectiveAt, entry.orgNodeId);
        await tx.logEntry.update({
          where: { id },
          data: {
            effectiveAt,
            shiftCode: dims?.shiftCode ?? null,
            operationalDate: dims?.operationalDate ?? null,
            periodKey: dims?.periodKey ?? null,
            updatedById: userId,
          },
        });
      } else {
        await tx.logEntry.update({ where: { id }, data: { updatedById: userId } });
      }
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.section.saved",
      entityType: "LogEntry",
      entityId: id,
      metadata: { sectionKey, complete: Boolean(dto.markComplete), signed: mustSign, warnings: warnings.length },
    });
    return this.getDetail(userId, id);
  }

  // --- Enviar (finaliza un form SIN flujo; sella las dimensiones) -------------

  async submit(userId: string, id: string, _dto: SubmitLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue finalizada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);

    // Degradación elegante: `submit` finaliza SOLO plantillas sin flujo. Con flujo,
    // la finalización ocurre al transicionar a un estado final (executeTransition).
    if (entry.workflowDefinitionVersionId) {
      throw new BadRequestException("Esta plantilla tiene flujo: avance la entrada con una transición");
    }

    const version = await this.loadVersion(entry.templateVersionId);
    const roleIds = await this.userRoleIds(userId);
    const valuesByKey = await this.loadValuesByKey(id);

    // Valida obligatorios + valores de las secciones editables para el usuario.
    const errors = await this.collectCompletionErrors(version, valuesByKey, (section) =>
      this.isSectionEditableForUser(
        section.key,
        section.editableInStateKey,
        section.roles.map((r) => r.roleId),
        entry.currentStateKey,
        roleIds,
      ),
    );
    if (errors.length > 0) {
      throw new BadRequestException({ message: "No se puede enviar: faltan datos o hay errores", errors });
    }

    const sealedAt = new Date();
    const seal = await this.computeSeal(entry, version, valuesByKey);
    await this.prisma.logEntry.update({
      where: { id },
      data: { status: "SUBMITTED", sealedAt, ...seal, updatedById: userId },
    });
    await this.audit.record({
      ...ctx,
      action: "logentry.submitted",
      entityType: "LogEntry",
      entityId: id,
      after: { effectiveAt: seal.effectiveAt.toISOString(), shiftCode: seal.shiftCode, periodKey: seal.periodKey },
    });
    return this.getDetail(userId, id);
  }

  // --- Ejecutar una transición de flujo (Fase 2.5) ---------------------------

  async executeTransition(
    userId: string,
    id: string,
    dto: ExecuteTransitionRequest,
    ctx: AuditContext,
  ): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue finalizada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId); // guarda (c) ABAC
    if (!entry.workflowDefinitionVersionId || !entry.currentStateKey) {
      throw new BadRequestException("La entrada no tiene un flujo configurado");
    }

    const wfVersion = await this.loadWorkflowVersion(entry.workflowDefinitionVersionId);
    const transition = wfVersion.transitions.find((t) => t.key === dto.transitionKey);
    if (!transition) throw new NotFoundException("Transición no encontrada en el flujo");

    // (a) la transición sale del estado actual.
    if (transition.fromState.key !== entry.currentStateKey) {
      throw new ConflictException("La transición no parte del estado actual de la entrada");
    }

    // (b) el usuario tiene un rol-dato autorizado (vacío = abierta al permiso base).
    const roleIds = await this.userRoleIds(userId);
    const allowedRoleIds = transition.roles.map((r) => r.roleId);
    if (allowedRoleIds.length > 0 && !allowedRoleIds.some((r) => roleIds.has(r))) {
      throw new ForbiddenException("No tiene un rol autorizado para ejecutar esta transición");
    }

    // (d) completitud: las secciones editables en el estado de ORIGEN deben estar
    // marcadas COMPLETED y sin errores de validación (defensa en profundidad).
    const version = await this.loadVersion(entry.templateVersionId);
    const valuesByKey = await this.loadValuesByKey(id);
    const sectionRows = await this.prisma.logEntrySection.findMany({ where: { logEntryId: id } });
    const fromStateKey = entry.currentStateKey;
    const editableInFrom = (section: VersionWithGraph["sections"][number]): boolean =>
      isSectionEditableInState(section.editableInStateKey, fromStateKey);

    const errors = await this.collectCompletionErrors(version, valuesByKey, editableInFrom);
    for (const section of version.sections) {
      if (!editableInFrom(section) || section.fields.length === 0) continue;
      const row = sectionRows.find((r) => r.sectionKey === section.key);
      if (!row || row.state !== "COMPLETED") errors.push(`Sección "${section.title}" sin completar`);
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "No se puede avanzar: hay secciones incompletas o con errores", errors });
    }

    // Firma (si la transición la exige): re-auth ANTES de la transacción. El
    // step-up MFA se aplica solo si la transición lo pide (requireMfa).
    const reauth = transition.requireSignature
      ? await this.reauth.verifyForSignature(
          userId,
          { password: dto.password, mfaCode: dto.mfaCode },
          { requireMfa: transition.requireMfa },
        )
      : null;

    const now = new Date();
    const fromState = wfVersion.states.find((s) => s.key === transition.fromState.key)!;
    const toState = wfVersion.states.find((s) => s.key === transition.toState.key)!;
    // Sellado: la 1ª transición que sale del estado inicial congela las dimensiones.
    const seal = !entry.sealedAt && fromState.isInitial ? await this.computeSeal(entry, version, valuesByKey) : null;
    // Reconciliación de status: terminal ⇒ SUBMITTED; si no, sigue DRAFT (trabajo en curso).
    const nextStatus = toState.isFinal ? "SUBMITTED" : "DRAFT";

    await this.prisma.$transaction(async (tx) => {
      let signatureId: string | null = null;
      if (transition.requireSignature && reauth) {
        const sig = await this.createSignature(tx, {
          entry,
          context: "TRANSITION",
          transitionKey: transition.key,
          fromStateKey: fromState.key,
          toStateKey: toState.key,
          meaning: transition.signatureMeaning ?? transition.label,
          signerId: userId,
          signerName: reauth.signerName,
          method: reauth.method,
          valuesByKey,
          signedAt: now,
        });
        signatureId = sig.id;
      }

      await tx.logEntryTransition.create({
        data: {
          logEntryId: id,
          workflowDefinitionVersionId: entry.workflowDefinitionVersionId!,
          transitionKey: transition.key,
          fromStateKey: fromState.key,
          toStateKey: toState.key,
          actorId: userId,
          actorEmail: ctx.actorEmail ?? null,
          reason: dto.reason ?? null,
          signatureId,
          occurredAt: now,
        },
      });

      // Recomputa la editabilidad objetiva de cada sección en el NUEVO estado.
      for (const section of version.sections) {
        const row = sectionRows.find((r) => r.sectionKey === section.key);
        if (!row) continue;
        const editableNow = isSectionEditableInState(section.editableInStateKey, toState.key);
        const next = this.nextSectionState(row.state, editableNow);
        if (next !== row.state) {
          await tx.logEntrySection.update({ where: { id: row.id }, data: { state: next } });
        }
      }

      await tx.logEntry.update({
        where: { id },
        data: {
          currentStateKey: toState.key,
          status: nextStatus,
          updatedById: userId,
          ...(seal ? { sealedAt: now, ...seal } : {}),
        },
      });
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.transition.executed",
      entityType: "LogEntry",
      entityId: id,
      after: {
        transition: transition.key,
        from: fromState.key,
        to: toState.key,
        signed: transition.requireSignature,
        sealed: Boolean(seal),
        status: nextStatus,
      },
    });

    // Gancho de evento de dominio (Notificaciones / umbral→incidencia engancharán aquí).
    this.onTransitionExecuted({
      logEntryId: id,
      transitionKey: transition.key,
      fromStateKey: fromState.key,
      toStateKey: toState.key,
      toIsFinal: toState.isFinal,
      actorId: userId,
    });

    return this.getDetail(userId, id);
  }

  // --- Helpers (los marcados "interno" los comparte LogbookQueryService) ------

  /** Interno: carga la entrada viva o lanza 404. */
  async loadEntry(id: string): Promise<LogEntryRow> {
    const entry = await this.prisma.logEntry.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException("Entrada no encontrada");
    return entry;
  }

  /** Interno: versión de plantilla congelada con su grafo completo. */
  async loadVersion(versionId: string): Promise<VersionWithGraph> {
    const version = await this.prisma.templateVersion.findUnique({ where: { id: versionId }, include: versionInclude });
    if (!version) throw new NotFoundException("Versión de plantilla no encontrada");
    return version;
  }

  /** Interno: versión de flujo congelada con estados y transiciones. */
  async loadWorkflowVersion(versionId: string): Promise<WorkflowVersionWithGraph> {
    const version = await this.prisma.workflowDefinitionVersion.findUnique({
      where: { id: versionId },
      include: workflowVersionInclude,
    });
    if (!version) throw new NotFoundException("Versión de flujo no encontrada");
    return version;
  }

  /** Interno: foto plana de los valores actuales de la entrada (fieldKey → value). */
  async loadValuesByKey(id: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });
    const map: Record<string, unknown> = {};
    for (const v of rows) map[v.fieldKey] = (v.value ?? null) as unknown;
    return map;
  }

  /**
   * Recolecta errores de validación de las secciones que cumplen `predicate`:
   * obligatorios vacíos (visibles) + valores inválidos por tipo/rango/catálogo.
   * Fuente compartida por `submit` (form sin flujo) y la guarda de completitud de
   * `executeTransition`. Salta campos ocultos por `visibleWhen`.
   */
  private async collectCompletionErrors(
    version: VersionWithGraph,
    valuesByKey: Record<string, unknown>,
    predicate: (section: VersionWithGraph["sections"][number]) => boolean,
  ): Promise<string[]> {
    const errors: string[] = [];
    for (const section of version.sections) {
      if (!predicate(section)) continue;
      const defs = section.fields.map((f) => this.toFieldDef(f, section.key));
      const allowed = await this.resolveAllowedCodes(defs);
      for (const def of defs) {
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        const val = valuesByKey[def.key];
        if (def.required && isEmptyValue(val)) {
          errors.push(`${def.label}: obligatorio`);
          continue;
        }
        errors.push(...validateFieldValue(def, val, { allowedCodes: allowed.get(def.key) }).errors);
      }
    }
    return errors;
  }

  /** Calcula effectiveAt + dimensiones de turno a partir de los valores actuales. */
  private async computeSeal(
    entry: LogEntryRow,
    version: VersionWithGraph,
    valuesByKey: Record<string, unknown>,
  ): Promise<{ effectiveAt: Date; shiftCode: string | null; operationalDate: string | null; periodKey: string | null }> {
    const effectiveAt = resolveEffectiveAt(
      version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
      valuesByKey,
      entry.recordedAt,
    );
    const dims = await this.shiftResolver.resolve(effectiveAt, entry.orgNodeId);
    return {
      effectiveAt,
      shiftCode: dims?.shiftCode ?? null,
      operationalDate: dims?.operationalDate ?? null,
      periodKey: dims?.periodKey ?? null,
    };
  }

  /**
   * Próximo estado de una sección al recomputar editabilidad tras una transición:
   * no editable ⇒ LOCKED (preserva completitud/firma/autoría); editable y estaba
   * LOCKED ⇒ se reabre a PENDING (rework, conserva los valores); en otro caso se
   * mantiene el estado actual.
   */
  private nextSectionState(current: LogEntrySectionState, editableNow: boolean): LogEntrySectionState {
    if (!editableNow) return "LOCKED";
    return current === "LOCKED" ? "PENDING" : current;
  }

  /**
   * Crea una firma electrónica (Part 11): hashea el snapshot canónico (record–
   * signature linking §11.70) y persiste la manifestación (§11.50). Corre dentro
   * de la transacción de la acción firmada (transición o completitud de sección).
   */
  private async createSignature(
    tx: Prisma.TransactionClient,
    args: {
      entry: LogEntryRow;
      context: SignatureContext;
      transitionKey?: string | null;
      sectionKey?: string | null;
      fromStateKey?: string | null;
      toStateKey?: string | null;
      meaning: string;
      signerId: string;
      signerName: string;
      method: SignatureMethod;
      valuesByKey: Record<string, unknown>;
      signedAt: Date;
    },
  ): Promise<{ id: string }> {
    const payloadHash = this.enc.sha256(
      canonicalSignaturePayload({
        entryId: args.entry.id,
        templateVersionId: args.entry.templateVersionId,
        context: args.context,
        transitionKey: args.transitionKey ?? null,
        sectionKey: args.sectionKey ?? null,
        fromStateKey: args.fromStateKey ?? null,
        toStateKey: args.toStateKey ?? null,
        signerId: args.signerId,
        meaning: args.meaning,
        signedAt: args.signedAt.toISOString(),
        values: args.valuesByKey,
      }),
    );
    return tx.logEntrySignature.create({
      data: {
        logEntryId: args.entry.id,
        context: args.context,
        transitionKey: args.transitionKey ?? null,
        sectionKey: args.sectionKey ?? null,
        signerId: args.signerId,
        signerName: args.signerName,
        meaning: args.meaning,
        method: args.method,
        payloadHash,
        signedAt: args.signedAt,
      },
      select: { id: true },
    });
  }

  private signatureSummary(
    sig: Prisma.LogEntrySignatureGetPayload<Record<string, never>> | undefined,
  ): LogEntrySignatureSummaryDto | null {
    if (!sig) return null;
    return { signerName: sig.signerName, meaning: sig.meaning, signedAt: sig.signedAt.toISOString() };
  }

  /**
   * Gancho de evento de dominio: una transición se ejecutó. Punto de extensión
   * ÚNICO para el futuro bus de eventos/outbox → Notificaciones por transición y
   * regla umbral→incidencia (Fase 4). Hoy es no-op intencional: la transición ya
   * queda auditada, así que no se pierde nada. Ver docs/BACKLOG.md.
   */
  protected onTransitionExecuted(_event: TransitionEvent): void {
    /* TODO(plataforma de eventos / Fase 4): publicar al outbox `logentry.transition.executed`. */
  }

  private async initialStateKey(workflowDefinitionVersionId: string | null): Promise<string | null> {
    if (!workflowDefinitionVersionId) return null;
    const initial = await this.prisma.workflowState.findFirst({
      where: { workflowDefinitionVersionId, isInitial: true },
      select: { key: true },
    });
    return initial?.key ?? null;
  }

  private toFieldDef(
    f: VersionWithGraph["sections"][number]["fields"][number],
    sectionKey: string,
  ): FieldDef {
    return {
      key: f.key,
      sectionKey,
      type: f.type,
      dataType: f.dataType,
      label: f.label,
      required: f.required,
      config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
      visibleWhen: (f.visibleWhen as FieldDef["visibleWhen"]) ?? null,
      roleIds: f.roles.map((r) => r.roleId),
    };
  }

  private toFieldDtoLite(f: VersionWithGraph["sections"][number]["fields"][number]) {
    return { key: f.key, semanticRole: f.semanticRole } as TemplateVersionDto["sections"][number]["fields"][number];
  }

  /**
   * Resuelve el conjunto de `code` válidos para los campos SELECT/MULTISELECT
   * (inline desde el config; referenceList consultando los ítems activos). Para
   * `external` (Fase 3) no hay catálogo resoluble: se deja sin restricción.
   */
  private async resolveAllowedCodes(fields: FieldDef[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    const listKeyByField = new Map<string, string>();
    const listKeys = new Set<string>();

    for (const f of fields) {
      if (f.type !== "SELECT" && f.type !== "MULTISELECT") continue;
      const source = f.config.optionSource as { kind?: string; items?: { code: string }[]; listKey?: string } | undefined;
      if (source?.kind === "inline") {
        result.set(f.key, new Set((source.items ?? []).map((i) => i.code)));
      } else if (source?.kind === "referenceList" && source.listKey) {
        listKeyByField.set(f.key, source.listKey);
        listKeys.add(source.listKey);
      }
    }

    if (listKeys.size > 0) {
      const lists = await this.prisma.referenceList.findMany({
        where: { key: { in: [...listKeys] }, deletedAt: null },
        select: { key: true, items: { where: { active: true }, select: { code: true } } },
      });
      const codesByKey = new Map(lists.map((l) => [l.key, new Set(l.items.map((i) => i.code))]));
      for (const [fieldKey, listKey] of listKeyByField) {
        result.set(fieldKey, codesByKey.get(listKey) ?? new Set());
      }
    }
    return result;
  }

  private isSectionEditableForUser(
    _sectionKey: string,
    editableInStateKey: string | null,
    sectionRoleIds: string[],
    currentStateKey: string | null,
    userRoleIds: Set<string>,
  ): boolean {
    if (!isSectionEditableInState(editableInStateKey, currentStateKey)) return false;
    // Sin roles declarados = cualquier usuario con permiso de llenado puede.
    if (sectionRoleIds.length > 0 && !sectionRoleIds.some((r) => userRoleIds.has(r))) return false;
    return true;
  }

  private async userRoleIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return new Set(rows.map((r) => r.roleId));
  }

  /** Interno: nombre legible por id de usuario (displayName o email). */
  async namesByUserId(ids: (string | null)[]): Promise<Map<string, string>> {
    const real = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (real.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  /** Interno (lo comparte LogbookQueryService): cabecera de la entrada como DTO. */
  mapEntry(e: LogEntryRow, templateName: string) {
    return {
      id: e.id,
      entryNumber: e.entryNumber,
      templateId: e.templateId,
      templateVersionId: e.templateVersionId,
      workflowDefinitionId: e.workflowDefinitionId,
      workflowDefinitionVersionId: e.workflowDefinitionVersionId,
      orgNodeId: e.orgNodeId,
      equipmentId: e.equipmentId,
      currentStateKey: e.currentStateKey,
      status: e.status,
      recordedAt: e.recordedAt.toISOString(),
      effectiveAt: e.effectiveAt.toISOString(),
      shiftCode: e.shiftCode,
      operationalDate: e.operationalDate,
      periodKey: e.periodKey,
      sealedAt: e.sealedAt?.toISOString() ?? null,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      templateName,
    };
  }

  private mapVersion(version: VersionWithGraph): TemplateVersionDto {
    return {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      workflowDefinitionId: version.workflowDefinitionId,
      workflowDefinitionVersionId: version.workflowDefinitionVersionId,
      requireSignature: version.requireSignature,
      recurrenceKind: version.recurrenceKind,
      recurrenceConfig: version.recurrenceConfig ?? null,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      sections: version.sections.map((s) => ({
        id: s.id,
        key: s.key,
        title: s.title,
        description: s.description,
        order: s.order,
        requireSignature: s.requireSignature,
        editableInStateKey: s.editableInStateKey,
        roleIds: s.roles.map((r) => r.roleId),
        fields: s.fields.map((f) => ({
          id: f.id,
          key: f.key,
          type: f.type,
          dataType: f.dataType,
          semanticRole: f.semanticRole,
          label: f.label,
          help: f.help,
          required: f.required,
          order: f.order,
          config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
          visibleWhen: (f.visibleWhen as TemplateVersionDto["sections"][number]["fields"][number]["visibleWhen"]) ?? null,
          roleIds: f.roles.map((r) => r.roleId),
        })),
      })),
    };
  }

  private mapWorkflowVersion(version: WorkflowVersionWithGraph): WorkflowVersionDto {
    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      states: version.states.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        description: s.description,
        order: s.order,
        isInitial: s.isInitial,
        isFinal: s.isFinal,
        color: s.color,
      })),
      transitions: version.transitions.map((t) => ({
        id: t.id,
        key: t.key,
        label: t.label,
        fromStateKey: t.fromState.key,
        toStateKey: t.toState.key,
        order: t.order,
        requireSignature: t.requireSignature,
        signatureMeaning: t.signatureMeaning,
        requireMfa: t.requireMfa,
        roleIds: t.roles.map((r) => r.roleId),
      })),
    };
  }

  private async assertNodeExists(orgNodeId: string): Promise<void> {
    const exists = await this.prisma.orgNode.count({ where: { id: orgNodeId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El nodo indicado no existe");
  }

  private async assertEquipmentExists(equipmentId: string): Promise<void> {
    const exists = await this.prisma.equipment.count({ where: { id: equipmentId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El equipo indicado no existe");
  }

  /** Interno: ABAC — 403 si el nodo de la entrada está fuera del alcance del usuario. */
  async assertNodeInScope(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("La entrada está fuera de su alcance");
    }
  }

  private async nodePath(orgNodeId: string): Promise<string | null> {
    return (await this.nodePaths(new Set([orgNodeId]))).get(orgNodeId) ?? null;
  }

  /** Interno: rutas legibles ("Planta › Área › Proceso") por id de nodo. */
  async nodePaths(nodeIds: Set<string>): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (nodeIds.size === 0) return result;
    const all = await this.prisma.orgNode.findMany({ select: { id: true, name: true, path: true } });
    const nameById = new Map(all.map((n) => [n.id, n.name]));
    const pathById = new Map(all.map((n) => [n.id, n.path]));
    for (const id of nodeIds) {
      const path = pathById.get(id);
      if (!path) continue;
      const names = path.split("/").filter(Boolean).map((nid) => nameById.get(nid) ?? "—");
      result.set(id, names.join(" › "));
    }
    return result;
  }
}
