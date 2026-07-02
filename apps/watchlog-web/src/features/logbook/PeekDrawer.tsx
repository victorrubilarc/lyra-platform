import { useTranslation } from "react-i18next";
import { ExternalLink, GitBranch, History, Lock, PenLine, TriangleAlert } from "lucide-react";
import { Button, Chip, Drawer } from "@lyra/ui";
import { entryFolioLabel, type LogEntryListItem } from "@lyra/contracts";
import { formatDateTime } from "../../lib/format.js";
import { formatSummaryValue } from "./logbook-cells.js";
import styles from "./Logbook.module.css";

interface Props {
  row: LogEntryListItem | null;
  onClose: () => void;
  onOpenFull: (id: string) => void;
  onEdit: (id: string) => void;
  onViewFlow: (id: string) => void;
  canEdit: boolean;
}

/**
 * Vistazo (peek) lateral — Fase 2.8.1c (estilo ServiceNow). Quick-look INSTANTÁNEO:
 * se arma con los datos que la fila YA trae (cero round-trip), para hojear el negocio
 * sin salir de la lista. La ficha completa (detalle con `getDetail`) se abre aparte.
 */
export function PeekDrawer({ row, onClose, onOpenFull, onEdit, onViewFlow, canEdit }: Props) {
  const { t } = useTranslation();

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row ? entryFolioLabel(row) : ""}
      footer={
        row ? (
          <div className={styles.peekFooter}>
            {row.currentStateName && (
              <Button variant="secondary" leftIcon={<GitBranch size={14} />} onClick={() => onViewFlow(row.id)}>
                {t("logbook.peek.viewFlow")}
              </Button>
            )}
            {canEdit && row.status === "DRAFT" && (
              <Button variant="secondary" leftIcon={<PenLine size={14} />} onClick={() => onEdit(row.id)}>
                {t("logbook.list.editEntry")}
              </Button>
            )}
            <Button variant="primary" leftIcon={<ExternalLink size={14} />} onClick={() => onOpenFull(row.id)}>
              {t("logbook.peek.openFull")}
            </Button>
          </div>
        ) : null
      }
    >
      {row && (
        <div className={styles.peek}>
          {/* Cabecera: plantilla + estado del flujo + estado del registro */}
          <div className={styles.peekHead}>
            <div className={styles.peekTitleRow}>
              <span className={styles.peekTemplate}>{row.templateName}</span>
              <span className={styles.cellSub}>v{row.templateVersionNumber}</span>
            </div>
            <div className={styles.peekChips}>
              {row.currentStateName && (
                <span
                  className={styles.stateChip}
                  style={{
                    color: row.currentStateColor ?? "var(--color-accent, #6366f1)",
                    borderColor: `color-mix(in srgb, ${row.currentStateColor ?? "#6366f1"} 45%, transparent)`,
                    background: `color-mix(in srgb, ${row.currentStateColor ?? "#6366f1"} 12%, transparent)`,
                  }}
                >
                  {row.currentStateName}
                </span>
              )}
              <Chip
                variant={row.status === "SUBMITTED" ? "success" : row.status === "VOID" ? "default" : "warning"}
                label={t(`logbook.status.${row.status}`)}
              />
              {row.entryOrigin === "DEFERRED" && (
                <span className={`${styles.indicator} ${styles.indicatorWarn}`} title={row.deferredReason ?? undefined}>
                  <History size={12} /> {t("logbook.origin.DEFERRED")}
                </span>
              )}
            </div>
          </div>

          {/* Valores de negocio (lo que hace reconocible el registro) */}
          {row.summaryValues.length > 0 && (
            <section className={styles.peekSection}>
              <h4 className={styles.peekSectionTitle}>{t("logbook.list.summary")}</h4>
              <dl className={styles.peekValues}>
                {row.summaryValues.map((sv) => (
                  <div key={sv.fieldKey} className={styles.peekValueRow}>
                    <dt>{sv.label}</dt>
                    <dd
                      className={
                        sv.thresholdBand === "CRIT"
                          ? styles.summaryCrit
                          : sv.thresholdBand === "WARN"
                            ? styles.summaryWarn
                            : undefined
                      }
                    >
                      <strong>{formatSummaryValue(sv)}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Metadatos */}
          <section className={styles.peekSection}>
            <dl className={styles.peekValues}>
              <Meta label={t("logbook.list.node")} value={row.orgNodeName} hint={row.orgNodePath} />
              {(row.equipmentTag || row.equipmentName) && (
                <Meta
                  label={t("logbook.list.equipment")}
                  value={[row.equipmentTag, row.equipmentName].filter(Boolean).join(" · ")}
                />
              )}
              <Meta label={t("logbook.list.shift")} value={[row.shiftCode, row.operationalDate].filter(Boolean).join(" · ") || "—"} />
              <Meta label={t("logbook.list.effectiveAt")} value={formatDateTime(row.effectiveAt)} />
              <Meta label={t("logbook.list.recordedAt")} value={formatDateTime(row.recordedAt)} />
              <Meta label={t("logbook.list.author")} value={row.createdByName ?? "—"} />
            </dl>
          </section>

          {/* Indicadores de review-by-exception */}
          <section className={styles.peekSection}>
            <div className={styles.peekIndicators}>
              <span className={styles.indicator}>
                {row.indicators.sectionsCompleted}/{row.indicators.sectionsTotal} {t("logbook.peek.sections")}
              </span>
              {row.indicators.pendingSignatures > 0 && (
                <span className={`${styles.indicator} ${styles.indicatorWarn}`}>
                  <PenLine size={12} /> {row.indicators.pendingSignatures} {t("logbook.peek.pendingSig")}
                </span>
              )}
              {row.indicators.sectionsLocked > 0 && (
                <span className={styles.indicator}>
                  <Lock size={12} /> {row.indicators.sectionsLocked}
                </span>
              )}
              {row.indicators.transitionsCount > 0 && (
                <span className={styles.indicator}>
                  <GitBranch size={12} /> {row.indicators.transitionsCount}
                </span>
              )}
              {row.indicators.worstThresholdBand && (
                <span
                  className={`${styles.indicator} ${row.indicators.worstThresholdBand === "CRIT" ? styles.indicatorCrit : styles.indicatorWarn}`}
                >
                  <TriangleAlert size={12} /> {t(`logbook.band.${row.indicators.worstThresholdBand}`)}
                </span>
              )}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Meta({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className={styles.peekValueRow}>
      <dt>{label}</dt>
      <dd title={hint ?? undefined}>{value}</dd>
    </div>
  );
}
