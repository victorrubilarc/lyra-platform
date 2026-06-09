import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreateReferenceItemRequest,
  CreateReferenceListRequest,
  ReferenceImportReport,
  ReferenceImportRequest,
  ReferenceImportRow,
  ResolvedOption,
  UpdateReferenceItemRequest,
  UpdateReferenceListRequest,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import type { ReferenceItem, ReferenceList } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import type { Env } from "../config/env.schema";
import { toCsv } from "../common/csv";
import { parseCsv } from "../common/csv-parse";
import { PrismaService } from "../prisma/prisma.service";

/**
 * JSON canónico (claves ordenadas, recursivo) para comparar metadata por VALOR
 * en el diff del import — {a:1,b:2} y {b:2,a:1} son la misma metadata.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Datos de referencia / Listas (ReferenceList + ReferenceItem).
 *
 * Catálogo GOBERNADO (no versionado-inmutable como Template/Workflow): code
 * estable + activar/desactivar + sortOrder + borrado lógico de la lista. Ver
 * docs/DECISIONS.md (2026-06-09). El `code` es el valor que el llenado (Fase 2.4)
 * persiste, no el label. Un code en uso se desactiva, no se borra.
 *
 * La `key` de la lista es la clave de join que referencia el
 * `optionSource.referenceList.listKey` de un campo SELECT/MULTISELECT. Una lista
 * referenciada por una plantilla no se puede borrar (guard en `remove`).
 */
@Injectable()
export class ReferenceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // --- Listas ----------------------------------------------------------------

  /** Lista todas las listas vivas con su conteo de ítems. */
  async list(): Promise<(ReferenceList & { itemCount: number })[]> {
    const lists = await this.prisma.referenceList.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    });
    return lists.map(({ _count, ...l }) => ({ ...l, itemCount: _count.items }));
  }

  /** Detalle de una lista con sus ítems ordenados. */
  async getDetail(id: string): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const list = await this.prisma.referenceList.findFirst({
      where: { id, deletedAt: null },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
    });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    return list;
  }

  async create(dto: CreateReferenceListRequest, ctx: AuditContext): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const list = await this.prisma.referenceList
      .create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description ?? null,
          source: dto.source ?? "MANUAL",
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateKey(err, dto.key);
      });
    await this.audit.record({ ...ctx, action: "referencelist.created", entityType: "ReferenceList", entityId: list.id, after: { ...list } });
    return { ...list, items: [] };
  }

  async update(id: string, dto: UpdateReferenceListRequest, ctx: AuditContext): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const before = await this.prisma.referenceList.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Lista de referencia no encontrada");
    const list = await this.prisma.referenceList.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description === undefined ? undefined : dto.description,
        source: dto.source ?? undefined,
        active: dto.active === undefined ? undefined : dto.active,
        sortOrder: dto.sortOrder === undefined ? undefined : dto.sortOrder,
      },
    });
    await this.audit.record({ ...ctx, action: "referencelist.updated", entityType: "ReferenceList", entityId: id, before: { ...before }, after: { ...list } });
    return this.getDetail(id);
  }

  /**
   * Borrado lógico de la lista. Se bloquea si alguna plantilla referencia su
   * `key` desde un campo (`optionSource.referenceList.listKey`), para no dejar
   * configuraciones colgando (integridad, espejo del guard de Flujos).
   */
  async remove(id: string, ctx: AuditContext): Promise<void> {
    const list = await this.prisma.referenceList.findFirst({ where: { id, deletedAt: null } });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");

    const usedBy = await this.countTemplateFieldsUsing(list.key);
    if (usedBy > 0) {
      throw new BadRequestException(
        `La lista está en uso por ${usedBy} campo${usedBy === 1 ? "" : "s"} de plantilla y no puede eliminarse. Desactívela si ya no debe usarse.`,
      );
    }

    await this.prisma.referenceList.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "referencelist.deleted", entityType: "ReferenceList", entityId: id, before: { key: list.key, name: list.name } });
  }

  // --- Ítems -----------------------------------------------------------------

  async createItem(listId: string, dto: CreateReferenceItemRequest, ctx: AuditContext): Promise<ReferenceItem> {
    const list = await this.prisma.referenceList.findFirst({ where: { id: listId, deletedAt: null } });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    const item = await this.prisma.referenceItem
      .create({
        data: {
          listId,
          code: dto.code,
          label: dto.label,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
          metadata: this.toJsonInput(dto.metadata),
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateCode(err, dto.code);
      });
    await this.audit.record({ ...ctx, action: "referencelist.item.created", entityType: "ReferenceItem", entityId: item.id, after: { ...item } });
    return item;
  }

  async updateItem(listId: string, itemId: string, dto: UpdateReferenceItemRequest, ctx: AuditContext): Promise<ReferenceItem> {
    const before = await this.prisma.referenceItem.findFirst({ where: { id: itemId, listId } });
    if (!before) throw new NotFoundException("Ítem no encontrado");
    const item = await this.prisma.referenceItem
      .update({
        where: { id: itemId },
        data: {
          code: dto.code ?? undefined,
          label: dto.label ?? undefined,
          active: dto.active === undefined ? undefined : dto.active,
          sortOrder: dto.sortOrder === undefined ? undefined : dto.sortOrder,
          metadata: dto.metadata === undefined ? undefined : this.toJsonInput(dto.metadata),
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateCode(err, dto.code ?? before.code);
      });
    await this.audit.record({ ...ctx, action: "referencelist.item.updated", entityType: "ReferenceItem", entityId: itemId, before: { ...before }, after: { ...item } });
    return item;
  }

  /**
   * Elimina (HARD) un ítem. La acción gobernada en la UI es DESACTIVAR
   * (`active=false`) — un code en uso no se borra. El hard-delete existe para
   * limpiar errores de captura mientras no haya ejecución; el guard de "code en
   * uso" real (valores de LogEntry) se incorpora en Fase 2.4.
   */
  async removeItem(listId: string, itemId: string, ctx: AuditContext): Promise<void> {
    const item = await this.prisma.referenceItem.findFirst({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException("Ítem no encontrado");
    await this.prisma.referenceItem.delete({ where: { id: itemId } });
    await this.audit.record({ ...ctx, action: "referencelist.item.deleted", entityType: "ReferenceItem", entityId: itemId, before: { code: item.code, label: item.label } });
  }

  // --- Resolución (Form Builder y, en 2.4, el llenado) -----------------------

  /**
   * Resuelve los ítems ACTIVOS de una lista (por id o por key) como opciones
   * {code, label, metadata} ordenadas. Es lo que consume el preview del Form
   * Builder y el llenado. La lista debe existir y estar viva.
   */
  async resolve(idOrKey: string): Promise<ResolvedOption[]> {
    const list = await this.prisma.referenceList.findFirst({
      where: { deletedAt: null, OR: [{ id: idOrKey }, { key: idOrKey }] },
      include: { items: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
    });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    return list.items.map((i) => ({
      code: i.code,
      label: i.label,
      metadata: (i.metadata as ResolvedOption["metadata"]) ?? null,
    }));
  }

  // --- Export CSV ------------------------------------------------------------

  /**
   * Exporta los ítems de una lista a CSV (RFC 4180, BOM UTF-8, delimitador ";"
   * para Excel es-CL). Metadata APLANADA: una columna `metadata.<clave>` por cada
   * clave presente en algún ítem (valores no-string van como JSON en la celda).
   * El archivo exportado se reimporta tal cual (round-trip).
   */
  async exportCsv(id: string): Promise<{ filename: string; csv: string }> {
    const list = await this.getDetail(id);
    const metaKeys = [
      ...new Set(list.items.flatMap((i) => (i.metadata && typeof i.metadata === "object" ? Object.keys(i.metadata) : []))),
    ].sort();

    const columns = [
      { header: "code", value: (i: ReferenceItem) => i.code },
      { header: "label", value: (i: ReferenceItem) => i.label },
      { header: "active", value: (i: ReferenceItem) => String(i.active) },
      { header: "sortOrder", value: (i: ReferenceItem) => i.sortOrder },
      ...metaKeys.map((key) => ({
        header: `metadata.${key}`,
        value: (i: ReferenceItem) => {
          const v = i.metadata && typeof i.metadata === "object" ? (i.metadata as Record<string, unknown>)[key] : undefined;
          if (v === undefined || v === null) return "";
          return typeof v === "string" ? v : JSON.stringify(v);
        },
      })),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `lista-${list.key}-${stamp}.csv`, csv: toCsv(list.items, columns, ";") };
  }

  // --- Import CSV (dry-run / commit) ------------------------------------------

  /**
   * Importa ítems desde CSV con UPSERT por `code` (patrón dry-run enterprise):
   * valida todo y calcula el diff contra la BD (create/update/unchanged y, con
   * `deactivateMissing`, deactivate de los ausentes — nunca borra). Con `dryRun`
   * solo reporta; el commit re-valida (no confía en ningún preview) y NO escribe
   * si hay errores. Aplica en transacción y audita el resumen.
   */
  async importCsv(id: string, dto: ReferenceImportRequest, ctx: AuditContext): Promise<ReferenceImportReport> {
    const list = await this.prisma.referenceList.findFirst({ where: { id, deletedAt: null } });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");

    let parsed;
    try {
      parsed = parseCsv(dto.content);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "CSV malformado");
    }
    if (parsed.rows.length === 0) throw new BadRequestException("El archivo está vacío");

    const maxRows = this.config.get("REFERENCE_IMPORT_MAX_ROWS", { infer: true });
    const dataRows = parsed.rows.slice(1);
    if (dataRows.length > maxRows) {
      throw new BadRequestException(`El archivo supera el tope de ${maxRows} filas (tiene ${dataRows.length}).`);
    }

    // Cabecera: columnas base + metadata.<clave>; cualquier otra es un error claro.
    const header = parsed.rows[0]!.map((h) => h.trim());
    const baseCols = new Set(["code", "label", "active", "sortOrder"]);
    const metaKeys: { key: string; index: number }[] = [];
    const unknown: string[] = [];
    const colIndex = new Map<string, number>();
    header.forEach((name, index) => {
      if (baseCols.has(name)) colIndex.set(name, index);
      else if (name.startsWith("metadata.") && name.length > "metadata.".length) {
        metaKeys.push({ key: name.slice("metadata.".length), index });
      } else if (name !== "") {
        unknown.push(name);
      }
    });
    if (!colIndex.has("code") || !colIndex.has("label")) {
      throw new BadRequestException('La cabecera debe incluir las columnas "code" y "label".');
    }
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Columnas desconocidas: ${unknown.join(", ")}. Use code, label, active, sortOrder y metadata.<clave>.`,
      );
    }
    const metadataDeclared = metaKeys.length > 0;

    const existing = await this.prisma.referenceItem.findMany({ where: { listId: id } });
    const byCode = new Map(existing.map((i) => [i.code, i]));

    const rows: ReferenceImportRow[] = [];
    const seen = new Set<string>();
    const creates: Prisma.ReferenceItemCreateManyInput[] = [];
    const updates: { id: string; data: Prisma.ReferenceItemUpdateInput }[] = [];

    dataRows.forEach((cells, idx) => {
      const line = idx + 2; // la cabecera es la línea 1
      if (cells.every((c) => c.trim() === "")) return; // fila en blanco: se ignora

      const cell = (name: string): string => {
        const i = colIndex.get(name);
        return i === undefined ? "" : (cells[i] ?? "").trim();
      };

      const code = cell("code");
      const label = cell("label");
      const problems: string[] = [];
      if (!code) problems.push("code requerido");
      else if (code.length > 120) problems.push("code supera 120 caracteres");
      if (!label) problems.push("label requerido");
      else if (label.length > 200) problems.push("label supera 200 caracteres");
      if (code && seen.has(code)) problems.push(`code duplicado en el archivo: ${code}`);

      const active = this.parseBoolCell(cell("active"), problems);
      const sortOrder = this.parseOrderCell(cell("sortOrder"), problems);
      const metadata = metadataDeclared ? this.parseMetadataCells(cells, metaKeys, problems) : undefined;

      if (problems.length > 0) {
        rows.push({ line, code: code || undefined, status: "error", message: problems.join("; ") });
        return;
      }
      seen.add(code);

      const current = byCode.get(code);
      if (!current) {
        creates.push({
          listId: id,
          code,
          label,
          active: active ?? true,
          sortOrder: sortOrder ?? 0,
          metadata: metadata === undefined || metadata === null ? Prisma.JsonNull : (metadata as Prisma.InputJsonValue),
        });
        rows.push({ line, code, status: "create" });
        return;
      }

      const changes: string[] = [];
      if (label !== current.label) changes.push("label");
      if (active !== undefined && active !== current.active) changes.push("active");
      if (sortOrder !== undefined && sortOrder !== current.sortOrder) changes.push("sortOrder");
      if (metadata !== undefined && canonicalJson(metadata) !== canonicalJson(current.metadata)) changes.push("metadata");

      if (changes.length === 0) {
        rows.push({ line, code, status: "unchanged" });
        return;
      }
      updates.push({
        id: current.id,
        data: {
          label,
          active: active === undefined ? undefined : active,
          sortOrder: sortOrder === undefined ? undefined : sortOrder,
          metadata:
            metadata === undefined ? undefined : metadata === null ? Prisma.JsonNull : (metadata as Prisma.InputJsonValue),
        },
      });
      rows.push({ line, code, status: "update", changes });
    });

    // Sincronización opt-in: los ACTIVOS que no vienen en el archivo se desactivan.
    const deactivateIds: string[] = [];
    if (dto.deactivateMissing) {
      for (const item of existing) {
        if (item.active && !seen.has(item.code)) {
          deactivateIds.push(item.id);
          rows.push({ line: 0, code: item.code, status: "deactivate" });
        }
      }
    }

    const summary = {
      creates: creates.length,
      updates: updates.length,
      unchanged: rows.filter((r) => r.status === "unchanged").length,
      deactivates: deactivateIds.length,
      errors: rows.filter((r) => r.status === "error").length,
    };

    // Dry-run, o commit con errores: no se escribe nada.
    if (dto.dryRun || summary.errors > 0) {
      return { summary, rows, applied: false };
    }

    await this.prisma.$transaction(async (tx) => {
      if (creates.length > 0) await tx.referenceItem.createMany({ data: creates });
      for (const u of updates) {
        await tx.referenceItem.update({ where: { id: u.id }, data: u.data });
      }
      if (deactivateIds.length > 0) {
        await tx.referenceItem.updateMany({ where: { id: { in: deactivateIds } }, data: { active: false } });
      }
    });
    await this.audit.record({
      ...ctx,
      action: "referencelist.imported",
      entityType: "ReferenceList",
      entityId: id,
      metadata: { listKey: list.key, ...summary, deactivateMissing: dto.deactivateMissing ?? false },
    });
    return { summary, rows, applied: true };
  }

  /** Celda booleana: vacía = sin cambio (update) / default (create). */
  private parseBoolCell(raw: string, problems: string[]): boolean | undefined {
    if (raw === "") return undefined;
    const v = raw.toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    problems.push(`active inválido: "${raw}" (use true/false)`);
    return undefined;
  }

  /** Celda de orden: vacía = sin cambio / default. Entero 0..100000. */
  private parseOrderCell(raw: string, problems: string[]): number | undefined {
    if (raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      problems.push(`sortOrder inválido: "${raw}" (entero entre 0 y 100000)`);
      return undefined;
    }
    return n;
  }

  /**
   * Reconstruye la metadata desde las columnas `metadata.<clave>`. Inferencia de
   * tipos igual que el editor key-value de la UI (true/false → booleano, numérico
   * → número, JSON para objetos/arreglos, resto texto). Celdas vacías = clave
   * ausente; sin ninguna clave → null (sin metadata).
   */
  private parseMetadataCells(
    cells: string[],
    metaKeys: { key: string; index: number }[],
    problems: string[],
  ): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const { key, index } of metaKeys) {
      const raw = (cells[index] ?? "").trim();
      if (raw === "") continue;
      if (raw === "true") out[key] = true;
      else if (raw === "false") out[key] = false;
      else if (/^-?\d+(\.\d+)?$/.test(raw)) out[key] = Number(raw);
      else if (raw.startsWith("{") || raw.startsWith("[")) {
        try {
          out[key] = JSON.parse(raw);
        } catch {
          problems.push(`metadata.${key}: JSON inválido`);
        }
      } else out[key] = raw;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  // --- Helpers ---------------------------------------------------------------

  /** Cuenta los campos de plantilla que referencian una lista por su `key`. */
  private async countTemplateFieldsUsing(key: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "TemplateField"
      WHERE "config"->'optionSource'->>'kind' = 'referenceList'
        AND "config"->'optionSource'->>'listKey' = ${key}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private toJsonInput(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private mapDuplicateKey(err: unknown, key: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe una lista con la clave "${key}".`);
    }
    return err;
  }

  private mapDuplicateCode(err: unknown, code: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe un ítem con el código "${code}" en esta lista.`);
    }
    return err;
  }
}
