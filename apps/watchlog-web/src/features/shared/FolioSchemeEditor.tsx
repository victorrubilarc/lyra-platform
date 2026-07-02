import { useMemo } from "react";
import {
  FOLIO_RESETS,
  FOLIO_SCOPES,
  buildFolioSeqKey,
  folioSchemeWarnings,
  renderFolio,
  resolveFolioSchemeWith,
  scopeRendersSegment,
  type FolioReset,
  type FolioScheme,
  type FolioScope,
  type FolioUniquenessDomain,
  type ResolvedFolioScheme,
} from "@lyra/contracts";
import { Input, Select, Toggle } from "@lyra/ui";
import styles from "./folio-scheme-editor.module.css";

/** Rótulos del ámbito por entidad (el "tipo" es el tipo de OT o la plantilla). */
const SCOPE_LABELS: Record<"workorder" | "logentry", Record<FolioScope, string>> = {
  workorder: { global: "Serie única global", type: "Por tipo de OT", node: "Por nodo", structure: "Por estructura" },
  logentry: { global: "Serie única global", type: "Por plantilla", node: "Por nodo", structure: "Por estructura" },
};

const RESET_LABELS: Record<FolioReset, string> = {
  never: "Sin reinicio",
  annual: "Anual (reinicia cada año)",
};

interface Props {
  /** Esquema actual. null = NO personalizado (usa el comportamiento por defecto de la entidad). */
  value: FolioScheme | null;
  onChange: (value: FolioScheme | null) => void;
  entity: "workorder" | "logentry";
  /** Dominio de unicidad del folio renderizado (para avisos de colisión). */
  uniquenessDomain: FolioUniquenessDomain;
  /** Default de la entidad: completa los ejes omitidos y siembra al activar. */
  defaultScheme: ResolvedFolioScheme;
  /** Rótulo del toggle de activación (ej. "Personalizar folio"). */
  enableLabel: string;
  /** Texto cuando el folio propio está DESACTIVADO (explica el comportamiento por defecto). */
  fallbackHint: string;
  disabled?: boolean;
}

/**
 * Editor VISUAL reutilizable del esquema de FOLIO (prefijo · ámbito · reinicio · relleno ·
 * inicio · máscara) con VISTA PREVIA en vivo y avisos de colisión. Compartido por el
 * mantenedor de tipos de OT (folio de OT) y el Form Builder (folio-por-plantilla).
 * Motor puro en `@lyra/contracts` (`resolveFolioSchemeWith`/`renderFolio`/`folioSchemeWarnings`).
 */
export function FolioSchemeEditor({
  value,
  onChange,
  entity,
  uniquenessDomain,
  defaultScheme,
  enableLabel,
  fallbackHint,
  disabled,
}: Props) {
  const enabled = value !== null;
  const scopeLabels = SCOPE_LABELS[entity];

  // Esquema resuelto (con defaults de la entidad) para la vista previa y los avisos.
  const resolved = useMemo(() => resolveFolioSchemeWith(value ?? {}, defaultScheme), [value, defaultScheme]);
  const year = new Date().getFullYear();

  // El ámbito por nodo/estructura inyecta un segmento visible (código del nodo/estructura).
  // En la vista previa usamos un marcador ilustrativo del ámbito elegido.
  const scopeSample = resolved.scope === "node" ? "NODO" : resolved.scope === "structure" ? "ESTRUCT" : null;
  const showsSegment = scopeRendersSegment(resolved.scope);

  const preview = useMemo(() => {
    try {
      return [
        renderFolio(resolved, resolved.start, { year, scopeCode: scopeSample }),
        renderFolio(resolved, resolved.start + 1, { year, scopeCode: scopeSample }),
      ];
    } catch {
      return null;
    }
  }, [resolved, year, scopeSample]);

  const seqKeyExample = useMemo(() => {
    try {
      return buildFolioSeqKey(resolved, {
        entity,
        typeId: "‹id›",
        orgNodeId: "‹nodo›",
        structureId: "‹estructura›",
        year,
      });
    } catch (e) {
      return (e as Error).message;
    }
  }, [resolved, entity, year]);

  const warnings = useMemo(() => folioSchemeWarnings(resolved, uniquenessDomain), [resolved, uniquenessDomain]);

  function toggle(on: boolean) {
    if (on) {
      // Materializa el default como esquema explícito y editable (sin la máscara).
      onChange({
        prefix: defaultScheme.prefix,
        padding: defaultScheme.padding,
        start: defaultScheme.start,
        scope: defaultScheme.scope,
        reset: defaultScheme.reset,
      });
    } else {
      onChange(null);
    }
  }

  function update(patch: Partial<FolioScheme>) {
    onChange({ ...(value ?? {}), ...patch });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toggleRow}>
        <Toggle checked={enabled} onChange={toggle} disabled={disabled} aria-label={enableLabel} />
        <div>
          <div className={styles.toggleLabel}>{enableLabel}</div>
          {!enabled && <div className={styles.muted}>{fallbackHint}</div>}
        </div>
      </div>

      {enabled && (
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Prefijo</span>
            <Input
              value={value?.prefix ?? ""}
              mono
              maxLength={12}
              disabled={disabled}
              placeholder={defaultScheme.prefix}
              onChange={(e) => update({ prefix: e.target.value.toUpperCase() || undefined })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Ámbito de la serie</span>
            <Select
              value={value?.scope ?? defaultScheme.scope}
              disabled={disabled}
              onChange={(e) => update({ scope: e.target.value as FolioScope })}
            >
              {FOLIO_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {scopeLabels[s]}
                </option>
              ))}
            </Select>
            {showsSegment && (
              <span className={styles.muted}>
                El folio incluirá el <strong>código</strong> del {resolved.scope === "node" ? "nodo" : "la estructura"} (o su clave
                si no tiene código) para distinguir cada serie: <code>{scopeSample}</code>.
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Reinicio</span>
            <Select
              value={value?.reset ?? defaultScheme.reset}
              disabled={disabled}
              onChange={(e) => update({ reset: e.target.value as FolioReset })}
            >
              {FOLIO_RESETS.map((r) => (
                <option key={r} value={r}>
                  {RESET_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Relleno (ceros)</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={value?.padding != null ? String(value.padding) : ""}
              disabled={disabled}
              placeholder={String(defaultScheme.padding)}
              onChange={(e) => {
                const n = Number(e.target.value);
                update({ padding: e.target.value.trim() && Number.isFinite(n) ? n : undefined });
              }}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Correlativo inicial</span>
            <Input
              type="number"
              min={1}
              value={value?.start != null ? String(value.start) : ""}
              disabled={disabled}
              placeholder={String(defaultScheme.start)}
              onChange={(e) => {
                const n = Number(e.target.value);
                update({ start: e.target.value.trim() && Number.isFinite(n) ? n : undefined });
              }}
            />
          </label>

          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Máscara (opcional)</span>
            <Input
              value={value?.mask ?? ""}
              mono
              disabled={disabled}
              placeholder="{PREFIX}/{YYYY}/{SEQ}"
              onChange={(e) => update({ mask: e.target.value.trim() || undefined })}
            />
            <span className={styles.muted}>
              Tokens: <code>{"{PREFIX}"}</code> <code>{"{YYYY}"}</code> <code>{"{SEQ}"}</code>
              {showsSegment && <> <code>{"{SCOPE}"}</code> (código del ámbito)</>}. Vacío = formato estándar
              (PREFIJO{showsSegment ? "-ÁMBITO" : ""}-AÑO-N.º).
            </span>
          </label>
        </div>
      )}

      <div className={styles.preview}>
        <span className={styles.previewLabel}>Vista previa</span>
        {enabled && preview ? (
          <div className={styles.previewFolios}>
            <span className={styles.folioChip}>{preview[0]}</span>
            <span className={styles.folioChip}>{preview[1]}</span>
            <span className={styles.previewNote}>…</span>
          </div>
        ) : (
          <div className={styles.muted}>{fallbackHint}</div>
        )}
        {enabled && showsSegment && (
          <div className={styles.muted}>
            <code>{scopeSample}</code> es un ejemplo: en cada registro se reemplaza por el código real del{" "}
            {resolved.scope === "node" ? "nodo" : "la estructura"}.
          </div>
        )}
        {enabled && <div className={styles.seqKey}>Clave de secuencia: <code>{seqKeyExample}</code></div>}
      </div>

      {enabled &&
        warnings.map((w, i) => (
          <div key={i} className={styles.warning}>
            {w}
          </div>
        ))}
    </div>
  );
}
