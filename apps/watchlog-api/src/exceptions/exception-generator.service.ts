import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  effectiveNumberBands,
  thresholdExceptionTrigger,
  thresholdTypeForTrigger,
  type ThresholdExceptionTrigger,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";

/** Cliente Prisma o de transacción (para reconciliar DENTRO de la tx del guardado/sello). */
type PrismaLike = PrismaService | Prisma.TransactionClient;

/** Campo de la versión congelada necesario para detectar excepciones de umbral. */
export interface ExceptionFieldDef {
  key: string;
  type: string;
  label: string | null;
  config: Record<string, unknown>;
}

/** Contexto CONGELADO de la entrada para denormalizar en la excepción. */
export interface ExceptionEntryContext {
  id: string;
  templateId: string | null;
  templateVersionId: string | null;
  orgNodeId: string;
  equipmentId: string | null;
  shiftCode: string | null;
  operatorId: string | null;
  sealedAt: Date | null;
}

/** Prefijo del `dedupeKey` de una excepción de UMBRAL (idempotencia por entrada+campo). */
const thresholdDedupeKey = (entryId: string, fieldKey: string, occurrenceRef?: string | null): string =>
  `thr:${entryId}:${fieldKey}:${occurrenceRef ?? ""}`;

/**
 * Generador de EXCEPCIONES operacionales (Fase 4.1) — etapa síncrona. Materializa
 * la banda de umbral (HOY efímera en `LogEntryValue.thresholdBand`) como una entidad
 * `LogEntryException` con estado y triage, reusando la FUENTE ÚNICA
 * `thresholdExceptionTrigger` (no un 2.º motor). Gobernanza por campo: CRIT siempre,
 * WARN opt-in (`config.warnRaisesException`).
 *
 * Fork 2 (DECISIONS 2026-06-16): materialización en DOS momentos con idempotencia —
 * PROVISIONAL al guardar la sección (el operador la ve mientras llena), FIRME al
 * sellar la entrada. Una excepción PROVISIONAL (status OPEN) se reconcilia en cada
 * guardado: si el valor vuelve a rango se RETIRA; si cambia de banda se actualiza.
 * Una vez triada (ACK/DISMISSED/CONVERTED/CORRECTED) queda CONGELADA (historia).
 *
 * @Global y delgado (solo Prisma) para que LogEntriesService lo inyecte sin ciclo
 * de DI (mismo patrón que NotificationEmitterService).
 */
@Injectable()
export class ExceptionGeneratorService {
  private readonly logger = new Logger(ExceptionGeneratorService.name);

  /** Reconcilia las excepciones de UMBRAL de los campos de UNA sección (al guardar). */
  async reconcileSection(
    client: PrismaLike,
    entry: ExceptionEntryContext,
    sectionKey: string,
    sectionLabel: string | null,
    fields: ExceptionFieldDef[],
    valuesByKey: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    for (const field of fields) {
      await this.reconcileField(client, entry, sectionKey, sectionLabel, field, valuesByKey[field.key], userId);
    }
  }

  /**
   * Reconcilia TODAS las secciones al SELLAR la entrada y estampa `entrySealedAt`
   * en las excepciones supervivientes (congela el contexto definitivo).
   */
  async reconcileEntryOnSeal(
    client: PrismaLike,
    entry: ExceptionEntryContext,
    sections: { key: string; label: string | null; fields: ExceptionFieldDef[] }[],
    valuesByKey: Record<string, unknown>,
    userId: string,
    sealedAt: Date,
  ): Promise<void> {
    for (const section of sections) {
      for (const field of section.fields) {
        await this.reconcileField(client, entry, section.key, section.label, field, valuesByKey[field.key], userId);
      }
    }
    await client.logEntryException.updateMany({
      where: { logEntryId: entry.id, entrySealedAt: null },
      data: { entrySealedAt: sealedAt },
    });
  }

  /**
   * Purga las excepciones PROVISIONALES (OPEN/ACKNOWLEDGED, sin artefacto aguas
   * abajo) de una entrada anulada (VOID). Las ya triadas (DISMISSED/CONVERTED/
   * CORRECTED) se conservan: representan decisiones/auditoría/incidencias reales.
   */
  async purgeProvisionalForEntry(client: PrismaLike, entryId: string): Promise<void> {
    await client.logEntryException.deleteMany({
      where: { logEntryId: entryId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    });
  }

  /**
   * Materializa una excepción de REGLA cruzada (Fase 4.1.2, triggerKind=RULE). A
   * diferencia de las de umbral NO ata un campo único (`sectionKey`/`fieldKey` =
   * null) ni se reconcilia en vivo: se crea al SELLAR (hecho firme), de forma
   * idempotente por `dedupeKey = rule:{entryId}:{ruleKey}`. La invoca el WORKER
   * diferido (no el camino crítico del sello). Devuelve el id y si la creó.
   */
  async createRuleException(
    client: PrismaLike,
    entry: ExceptionEntryContext,
    rule: { key: string; name?: string | null; message: string; severity: string },
    triggeredValues: Prisma.InputJsonValue,
    actorId: string | null,
  ): Promise<{ id: string; created: boolean }> {
    const dedupeKey = `rule:${entry.id}:${rule.key}`;
    const existing = await client.logEntryException.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (existing) return { id: existing.id, created: false };

    const thresholdType = thresholdTypeForTrigger("RULE", rule.severity);
    const row = await client.logEntryException.create({
      data: {
        logEntryId: entry.id,
        templateId: entry.templateId,
        templateVersionId: entry.templateVersionId,
        sectionKey: null,
        sectionLabel: null,
        fieldKey: null,
        fieldLabel: rule.name?.trim() || rule.key,
        fieldType: null,
        unit: null,
        originalValue: triggeredValues,
        bandsSnapshot: Prisma.DbNull,
        triggerKind: "RULE",
        thresholdType,
        ruleKey: rule.key,
        ruleVersionId: entry.templateVersionId,
        ruleSeverity: rule.severity,
        detail: rule.message,
        orgNodeId: entry.orgNodeId,
        equipmentId: entry.equipmentId,
        shiftCode: entry.shiftCode,
        operatorId: entry.operatorId,
        entrySealedAt: entry.sealedAt,
        dedupeKey,
        createdById: actorId,
      },
      select: { id: true },
    });
    return { id: row.id, created: true };
  }

  /** Núcleo: crea / actualiza / retira la excepción de umbral de un campo. */
  private async reconcileField(
    client: PrismaLike,
    entry: ExceptionEntryContext,
    sectionKey: string,
    sectionLabel: string | null,
    field: ExceptionFieldDef,
    value: unknown,
    userId: string,
  ): Promise<void> {
    const trigger = thresholdExceptionTrigger(
      { key: field.key, label: field.label ?? field.key, type: field.type as never, dataType: "NUMBER" as never, config: field.config },
      value,
    );
    const dedupeKey = thresholdDedupeKey(entry.id, field.key);
    const existing = await client.logEntryException.findUnique({ where: { dedupeKey } });

    if (!trigger) {
      // El valor volvió a rango: retira la PROVISIONAL (OPEN). Si ya fue triada, se respeta.
      if (existing && existing.status === "OPEN") {
        await client.logEntryException.delete({ where: { id: existing.id } });
      }
      return;
    }

    const bands = effectiveNumberBands(field.config);
    const thresholdType = thresholdTypeForTrigger(trigger);
    const unit = (field.config as { unit?: string }).unit ?? null;
    const detail = this.describe(trigger, field.label ?? field.key, value, unit);

    if (!existing) {
      await client.logEntryException.create({
        data: {
          logEntryId: entry.id,
          templateId: entry.templateId,
          templateVersionId: entry.templateVersionId,
          sectionKey,
          sectionLabel,
          fieldKey: field.key,
          fieldLabel: field.label,
          fieldType: field.type,
          unit,
          originalValue: this.toJson(value),
          bandsSnapshot: this.bandsJson(bands),
          triggerKind: trigger,
          thresholdType,
          detail,
          orgNodeId: entry.orgNodeId,
          equipmentId: entry.equipmentId,
          shiftCode: entry.shiftCode,
          operatorId: entry.operatorId,
          entrySealedAt: entry.sealedAt,
          dedupeKey,
          createdById: userId,
        },
      });
      return;
    }

    // Existe y SIGUE disparando: refresca la PROVISIONAL (banda/valor pueden cambiar).
    // Una excepción ya triada queda CONGELADA (no se toca).
    if (existing.status === "OPEN") {
      await client.logEntryException.update({
        where: { id: existing.id },
        data: {
          originalValue: this.toJson(value),
          bandsSnapshot: this.bandsJson(bands),
          triggerKind: trigger,
          thresholdType,
          detail,
          fieldLabel: field.label,
          unit,
          updatedById: userId,
        },
      });
    }
  }

  private describe(
    trigger: ThresholdExceptionTrigger,
    label: string,
    value: unknown,
    unit: string | null,
  ): string {
    const sev = trigger === "THRESHOLD_CRIT" ? "crítico" : "de advertencia";
    const v = typeof value === "object" ? "valor estructurado" : String(value);
    return `«${label}»: valor ${sev} (${v}${unit ? ` ${unit}` : ""}) fuera de umbral`;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return (value ?? null) as Prisma.InputJsonValue;
  }

  private bandsJson(bands: {
    warnLow?: number;
    warnHigh?: number;
    critLow?: number;
    critHigh?: number;
  }): Prisma.InputJsonValue {
    return {
      warnLow: bands.warnLow ?? null,
      warnHigh: bands.warnHigh ?? null,
      critLow: bands.critLow ?? null,
      critHigh: bands.critHigh ?? null,
    };
  }

  constructor(private readonly prisma: PrismaService) {
    void this.prisma; // reservado para usos fuera de tx; hoy siempre recibe `client`.
  }
}
