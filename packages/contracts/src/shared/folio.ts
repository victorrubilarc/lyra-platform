import { z } from "zod";

/**
 * FOLIO gapless configurable — motor PURO reutilizable por CUALQUIER entidad.
 *
 * Nació en el módulo de OT (fork W4) y aquí queda como pieza NEUTRAL (2026-07-02):
 * el mismo esquema numera órdenes de trabajo (`entity:"workorder"`) y documentos de
 * bitácora por plantilla (`entity:"logentry"`, folio-por-plantilla del dueño). El
 * contador atómico vive en el backend (`FolioCounter` + `FolioService`,
 * INSERT … ON CONFLICT … RETURNING); aquí vive todo lo DETERMINISTA: el esquema
 * configurable (JSON validado por Zod), la derivación de la CLAVE de secuencia (qué
 * entra al scope y al periodo) y el RENDER del folio humano ("OT-2026-0001").
 *
 * Los DEFAULTS por entidad (prefijo/scope/reset de arranque) NO viven aquí: cada
 * dominio los define (`DEFAULT_WORK_ORDER_FOLIO_SCHEME` en work-orders,
 * `DEFAULT_LOG_ENTRY_FOLIO_SCHEME` en log-entries) y los pasa a `resolveFolioSchemeWith`.
 *
 * Ejes independientes (diseño acordado, OT_DESIGN_ARCHITECTURE §4):
 *  - scope: qué comparte el correlativo → global | type | node | structure.
 *  - reset: cuándo parte de nuevo → never | annual (agrega el año a la clave).
 *
 * NOTA: sin `.default()` en el schema (gotcha TS2719 en DTOs embebidos); los
 * defaults se resuelven en `resolveFolioSchemeWith`.
 */

export const FOLIO_SCOPES = ["global", "type", "node", "structure"] as const;
export type FolioScope = (typeof FOLIO_SCOPES)[number];

export const FOLIO_RESETS = ["never", "annual"] as const;
export type FolioReset = (typeof FOLIO_RESETS)[number];

/** Esquema de folio persistido como JSON. Todo opcional: `{}`/null caen al default de la entidad. */
export const folioSchemeSchema = z
  .object({
    /** Prefijo humano del folio (ej. "OT", "RT"). */
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
 * Valida y resuelve un `folioScheme` crudo (JSON de BD) aplicando los `defaults` de la
 * entidad llamadora. null/undefined ⇒ default completo. Lanza ZodError si el JSON no es
 * un esquema válido.
 */
export function resolveFolioSchemeWith(raw: unknown, defaults: ResolvedFolioScheme): ResolvedFolioScheme {
  if (raw === null || raw === undefined) return defaults;
  const parsed = folioSchemeSchema.parse(raw);
  return {
    prefix: parsed.prefix ?? defaults.prefix,
    mask: parsed.mask ?? defaults.mask,
    padding: parsed.padding ?? defaults.padding,
    start: parsed.start ?? defaults.start,
    scope: parsed.scope ?? defaults.scope,
    reset: parsed.reset ?? defaults.reset,
  };
}

/** Contexto para derivar la clave de secuencia (ids según el scope + año de planta). */
export interface FolioSeqKeyContext {
  /** Entidad dueña de la secuencia (namespace de la clave). */
  entity: "workorder" | "logentry" | (string & {});
  /**
   * Id del "tipo" bajo scope `type`. Para OT = `WorkOrderType.id`; para bitácora =
   * `Template.id` (cada plantilla es su propia serie de documento).
   */
  typeId?: string | null;
  orgNodeId?: string | null;
  structureId?: string | null;
  /** Año calendario de la PLANTA (el llamador lo resuelve con su zona horaria). */
  year: number;
}

/**
 * Deriva la clave ÚNICA de secuencia: `"<entity>|<scope>[:<id>][|<year>]"`.
 * Ej.: scope=type + reset=annual → "logentry|type:ckx…|2026". Determinista: misma
 * entidad/tipo/año ⇒ misma clave ⇒ mismo contador. Lanza si el scope exige un id ausente.
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
 * Normaliza un código de ámbito (código de nodo/estructura) a un segmento seguro para
 * el folio: MAYÚSCULAS y sólo `[A-Z0-9]` (quita espacios, guiones, barras, tildes…).
 * Devuelve `null` si queda vacío. PURO. La UNICIDAD real la garantiza el contador por
 * ID (`buildFolioSeqKey`); este segmento es la etiqueta HUMANA que distingue el ámbito.
 */
export function normalizeFolioSegment(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const seg = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (Á→A)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return seg.length > 0 ? seg : null;
}

/**
 * Renderiza el folio humano a partir del correlativo asignado.
 *
 * El **ámbito** por nodo/estructura no sólo parte el contador: también aporta un
 * **segmento VISIBLE** al folio (`ctx.scopeCode`), para que dos series distintas se
 * distingan a simple vista (`RT-NORTE-2026-0001` vs `RT-SUR-2026-0001`). El llamador
 * (backend) resuelve el código del nodo/estructura y lo pasa ya normalizado; para
 * `global`/`type` no se pasa código (el prefijo es el discriminador). *(Diseño 2026-07-02
 * "el ámbito completo": elegir el ámbito define contador Y etiqueta.)*
 *
 * Con `mask` usa los tokens `{PREFIX}`/`{YYYY}`/`{SEQ}`/`{SCOPE}` (`{SCOPE}` = el código
 * de ámbito, vacío si no aplica); sin máscara, el formato canónico
 * "PREFIX[-SCOPE]-YYYY-SEQ" (reset anual) o "PREFIX[-SCOPE]-SEQ" (sin reinicio). El
 * padding nunca trunca: un correlativo más largo que el ancho se imprime completo.
 */
export function renderFolio(
  scheme: ResolvedFolioScheme,
  seq: number,
  ctx: { year: number; scopeCode?: string | null },
): string {
  const seqText = String(seq).padStart(scheme.padding, "0");
  const scopeCode = ctx.scopeCode || null;
  if (scheme.mask) {
    return scheme.mask
      .replaceAll("{PREFIX}", scheme.prefix)
      .replaceAll("{YYYY}", String(ctx.year))
      .replaceAll("{SEQ}", seqText)
      .replaceAll("{SCOPE}", scopeCode ?? "");
  }
  const parts = [scheme.prefix];
  if (scopeCode) parts.push(scopeCode);
  if (scheme.reset === "annual") parts.push(String(ctx.year));
  parts.push(seqText);
  return parts.join("-");
}

/** ¿El ámbito aporta un segmento VISIBLE al folio? Sólo nodo/estructura (transversales). */
export function scopeRendersSegment(scope: FolioScope): boolean {
  return scope === "node" || scope === "structure";
}

/**
 * Dominio de UNICIDAD del folio renderizado, para avisar de colisiones en el editor:
 *  - `"global"`: el folio debe ser único en TODA la entidad (caso OT: `WorkOrder.folio`
 *    es único global). Un scope por-tipo/nodo/estructura NO puede codificarse en el
 *    string renderizado (los tokens de máscara son sólo PREFIX/YYYY/SEQ), así que dos
 *    buckets producirían el mismo folio salvo que cada uno use PREFIJO distinto. Este
 *    es exactamente el bug corregido en `fix/ot-folio-global` (2026-07-02).
 *  - `"per-type"`: el folio se cualifica por su tipo (caso bitácora: cada `Template`
 *    es su propia serie de documento), así que scope=type nunca colisiona.
 */
export type FolioUniquenessDomain = "global" | "per-type";

/**
 * Avisos (no errores) sobre un esquema de folio, para mostrar en el editor. PURO.
 * Devuelve mensajes en español listos para la UI. No bloquea el guardado (el admin
 * puede saber lo que hace, ej. dar a cada tipo un prefijo propio).
 */
export function folioSchemeWarnings(
  scheme: ResolvedFolioScheme,
  domain: FolioUniquenessDomain,
): string[] {
  const warnings: string[] = [];
  const maskHasSeq = scheme.mask ? scheme.mask.includes("{SEQ}") : true;
  if (scheme.mask && !maskHasSeq) {
    warnings.push("La máscara no incluye el token {SEQ}: sin el correlativo, todos los folios serían iguales.");
  }
  // Ámbito por TIPO bajo unicidad global: el tipo NO se dibuja en el folio (a diferencia
  // de nodo/estructura, que sí aportan su código), así que dos tipos colisionan salvo
  // prefijo distinto. (Nodo/estructura ya no se avisan: el ámbito inyecta su segmento.)
  if (domain === "global" && scheme.scope === "type") {
    warnings.push(
      "Con ámbito por tipo y folio único global, dos tipos podrían generar el MISMO folio. " +
        "Asegúrate de que cada tipo use un prefijo distinto, o usa ámbito global.",
    );
  }
  // Con máscara propia, el ámbito por nodo/estructura sólo aparece si el diseñador pone
  // {SCOPE}; si falta, dos nodos/estructuras repetirían folio a la vista.
  if (scheme.mask && scopeRendersSegment(scheme.scope) && !scheme.mask.includes("{SCOPE}")) {
    warnings.push(
      "El ámbito por nodo/estructura no aparece en la máscara: agrega el token {SCOPE} " +
        "o dos nodos/estructuras podrían mostrar el mismo folio.",
    );
  }
  if (scheme.reset === "annual" && scheme.mask && !scheme.mask.includes("{YYYY}")) {
    warnings.push(
      "El reinicio anual está activo pero la máscara no incluye {YYYY}: al reiniciar el correlativo cada año, " +
        "podrían repetirse folios de años distintos.",
    );
  }
  return warnings;
}
