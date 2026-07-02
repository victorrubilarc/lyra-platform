import { z } from "zod";

/**
 * FOLIO gapless configurable (fork W4) — formateo y claves de secuencia PUROS.
 *
 * El contador atómico vive en el backend (`FolioCounter` + `FolioService`,
 * INSERT … ON CONFLICT … RETURNING); aquí vive todo lo DETERMINISTA: el esquema
 * configurable (`folioScheme` del `WorkOrderType`, JSON validado por Zod), la
 * derivación de la CLAVE de secuencia (qué entra al scope y al periodo) y el
 * RENDER del folio humano ("OT-2026-0001"). Reutilizable por el folio-por-plantilla
 * del dueño (BACKLOG 2026-06-30): la clave lleva el nombre de la ENTIDAD.
 *
 * Ejes independientes (diseño acordado, OT_DESIGN_ARCHITECTURE §4):
 *  - scope: qué comparte el correlativo → global | type | node | structure.
 *  - reset: cuándo parte de nuevo → never | annual (agrega el año a la clave).
 *
 * NOTA: sin `.default()` en el schema (gotcha TS2719 en DTOs embebidos); los
 * defaults se resuelven en `resolveFolioScheme`.
 */

export const FOLIO_SCOPES = ["global", "type", "node", "structure"] as const;
export type FolioScope = (typeof FOLIO_SCOPES)[number];

export const FOLIO_RESETS = ["never", "annual"] as const;
export type FolioReset = (typeof FOLIO_RESETS)[number];

/** `WorkOrderType.folioScheme` (JSON). Todo opcional: `{}`/null caen al default OT. */
export const folioSchemeSchema = z
  .object({
    /** Prefijo humano del folio (ej. "OT"). */
    prefix: z.string().trim().min(1).max(12).optional(),
    /**
     * Máscara opcional con tokens `{PREFIX}` `{YYYY}` `{SEQ}` (ej. "{PREFIX}/{YYYY}/{SEQ}").
     * Si falta, se usa el formato canónico "PREFIX-YYYY-SEQ" (o "PREFIX-SEQ" si reset=never).
     */
    mask: z.string().trim().min(1).max(64).optional(),
    /** Ancho mínimo del correlativo (relleno con ceros). */
    padding: z.number().int().min(1).max(10).optional(),
    /** Primer valor de la secuencia (default 1). */
    start: z.number().int().min(1).max(1_000_000).optional(),
    scope: z.enum(FOLIO_SCOPES).optional(),
    reset: z.enum(FOLIO_RESETS).optional(),
  })
  .strict();
export type FolioScheme = z.infer<typeof folioSchemeSchema>;

/** Esquema con defaults resueltos (listo para derivar clave y renderizar). */
export interface ResolvedFolioScheme {
  prefix: string;
  mask: string | null;
  padding: number;
  start: number;
  scope: FolioScope;
  reset: FolioReset;
}

/**
 * Default OT: **serie ÚNICA GLOBAL** con reinicio ANUAL → "OT-2026-0001", "OT-2026-0002"…
 * (estándar SAP PM / Maximo: un solo rango de número de OT). *Corrección 2026-07-02:* el
 * default de W4 era `scope: "type"`, pero el folio renderizado NO incluye el tipo y
 * `WorkOrder.folio` es único GLOBAL ⇒ dos tipos distintos colisionaban en "OT-2026-0001".
 * `global` numera una sola serie por año, siempre única. Si un cliente quiere serie por
 * tipo, debe usar una `mask` que incluya el tipo (`folioScheme` por `WorkOrderType`).
 */
export const DEFAULT_WORK_ORDER_FOLIO_SCHEME: ResolvedFolioScheme = {
  prefix: "OT",
  mask: null,
  padding: 4,
  start: 1,
  scope: "global",
  reset: "annual",
};

/** Estado del flujo al que, al ENTRAR, se emite el folio (si el tipo no declara otro). */
export const DEFAULT_WORK_ORDER_FOLIO_STATE_KEY = "aprobada";

/**
 * Valida y resuelve un `folioScheme` crudo (JSON de BD) aplicando los defaults OT.
 * null/undefined ⇒ default completo. Lanza ZodError si el JSON no es un esquema válido.
 */
export function resolveFolioScheme(raw: unknown): ResolvedFolioScheme {
  if (raw === null || raw === undefined) return DEFAULT_WORK_ORDER_FOLIO_SCHEME;
  const parsed = folioSchemeSchema.parse(raw);
  return {
    prefix: parsed.prefix ?? DEFAULT_WORK_ORDER_FOLIO_SCHEME.prefix,
    mask: parsed.mask ?? null,
    padding: parsed.padding ?? DEFAULT_WORK_ORDER_FOLIO_SCHEME.padding,
    start: parsed.start ?? DEFAULT_WORK_ORDER_FOLIO_SCHEME.start,
    scope: parsed.scope ?? DEFAULT_WORK_ORDER_FOLIO_SCHEME.scope,
    reset: parsed.reset ?? DEFAULT_WORK_ORDER_FOLIO_SCHEME.reset,
  };
}

/** Contexto para derivar la clave de secuencia (ids según el scope + año de planta). */
export interface FolioSeqKeyContext {
  /** Entidad dueña de la secuencia (namespace de la clave). */
  entity: "workorder" | (string & {});
  typeId?: string | null;
  orgNodeId?: string | null;
  structureId?: string | null;
  /** Año calendario de la PLANTA (el llamador lo resuelve con su zona horaria). */
  year: number;
}

/**
 * Deriva la clave ÚNICA de secuencia: `"<entity>|<scope>[:<id>][|<year>]"`.
 * Ej.: scope=type + reset=annual → "workorder|type:ckx…|2026". Determinista: misma
 * OT/tipo/año ⇒ misma clave ⇒ mismo contador. Lanza si el scope exige un id ausente.
 */
export function buildFolioSeqKey(scheme: ResolvedFolioScheme, ctx: FolioSeqKeyContext): string {
  let scopePart: string;
  switch (scheme.scope) {
    case "global":
      scopePart = "global";
      break;
    case "type":
      if (!ctx.typeId) throw new Error("folioScheme scope 'type' requiere typeId");
      scopePart = `type:${ctx.typeId}`;
      break;
    case "node":
      if (!ctx.orgNodeId) throw new Error("folioScheme scope 'node' requiere orgNodeId");
      scopePart = `node:${ctx.orgNodeId}`;
      break;
    case "structure":
      if (!ctx.structureId) throw new Error("folioScheme scope 'structure' requiere structureId");
      scopePart = `structure:${ctx.structureId}`;
      break;
  }
  const parts = [ctx.entity, scopePart];
  if (scheme.reset === "annual") parts.push(String(ctx.year));
  return parts.join("|");
}

/**
 * Renderiza el folio humano a partir del correlativo asignado. Con `mask` usa los
 * tokens `{PREFIX}`/`{YYYY}`/`{SEQ}`; sin máscara, el formato canónico
 * "PREFIX-YYYY-SEQ" (reset anual) o "PREFIX-SEQ" (sin reinicio). El padding nunca
 * trunca: un correlativo más largo que el ancho se imprime completo.
 */
export function renderFolio(scheme: ResolvedFolioScheme, seq: number, ctx: { year: number }): string {
  const seqText = String(seq).padStart(scheme.padding, "0");
  if (scheme.mask) {
    return scheme.mask
      .replaceAll("{PREFIX}", scheme.prefix)
      .replaceAll("{YYYY}", String(ctx.year))
      .replaceAll("{SEQ}", seqText);
  }
  return scheme.reset === "annual"
    ? `${scheme.prefix}-${ctx.year}-${seqText}`
    : `${scheme.prefix}-${seqText}`;
}
