import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Clock, Lock, Send, TriangleAlert } from "lucide-react";
import { Button, Card, Chip, EmptyState, Spinner, useToast } from "@lyra/ui";
import {
  isFieldVisible,
  validateFieldValue,
  type LogEntrySectionStateDto,
  type TemplateFieldDto,
  type TemplateSectionDto,
} from "@lyra/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { FieldControl } from "../templates/FieldControl.js";
import { LOG_ENTRY_KEYS, useLogEntry, useSaveLogEntrySection, useSubmitLogEntry } from "./log-entries-queries.js";
import styles from "./LogEntries.module.css";

type Draft = Record<string, unknown>;

/** Códigos permitidos inline (para validación inmediata; el catálogo de listas lo valida el backend). */
function inlineCodes(config: Record<string, unknown>): string[] | undefined {
  const src = config.optionSource as { kind?: string; items?: { code: string }[] } | undefined;
  if (src?.kind === "inline") return (src.items ?? []).map((i) => i.code);
  return undefined; // referenceList/external → sin restricción en cliente (servidor manda)
}

function fieldForValidation(f: TemplateFieldDto) {
  return { key: f.key, type: f.type, dataType: f.dataType, label: f.label, config: f.config };
}

export function EntryFillPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: entry, isLoading, isError } = useLogEntry(id);
  const save = useSaveLogEntrySection(id);
  const submit = useSubmitLogEntry(id);

  const [draft, setDraft] = useState<Draft>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Semilla del borrador local desde los valores del servidor (una vez por entrada).
  useEffect(() => {
    if (!entry) return;
    const seed: Draft = {};
    for (const v of entry.values) seed[v.fieldKey] = v.value;
    setDraft(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const setValue = (key: string, value: unknown) => setDraft((p) => ({ ...p, [key]: value }));

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Spinner />
      </div>
    );
  }
  if (isError || !entry) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.fill.loadError")} />
      </div>
    );
  }

  const isDraft = entry.status === "DRAFT";
  const stateBySection = new Map(entry.sectionStates.map((s) => [s.sectionKey, s]));

  function saveSection(section: TemplateSectionDto, st: LogEntrySectionStateDto, markComplete: boolean) {
    const visible = section.fields.filter((f) => isFieldVisible(f.visibleWhen, draft));
    const values = visible.map((f) => ({ fieldKey: f.key, value: draft[f.key] ?? null }));
    setSavingKey(section.key + (markComplete ? ":complete" : ""));
    save.mutate(
      { sectionKey: section.key, dto: { expectedVersion: st.version, values, markComplete } },
      {
        onSuccess: () => toast.success(markComplete ? t("logbook.fill.sectionCompleted") : t("logbook.fill.sectionSaved")),
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) {
            toast.error(t("logbook.fill.conflict"));
            void qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.detail(id) });
          } else toast.error(e instanceof ApiError ? e.message : t("common.errorGeneric"));
        },
        onSettled: () => setSavingKey(null),
      },
    );
  }

  function doSubmit() {
    submit.mutate(
      {},
      {
        onSuccess: () => toast.success(t("logbook.fill.submitted")),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : t("common.errorGeneric")),
      },
    );
  }

  return (
    <div className={styles.page}>
      <Button variant="secondary" className={styles.backBtn} onClick={() => navigate("/nueva-entrada")}>
        <ArrowLeft size={15} /> {t("logbook.fill.back")}
      </Button>

      {/* Cabecera: plantilla + nodo + estado + dimensiones estampadas */}
      <Card className={styles.entryHeader}>
        <div className={styles.entryHeadTop}>
          <div>
            <div className={styles.entryName}>{entry.templateName}</div>
            <div className={styles.entryNode}>{entry.orgNodePath ?? "—"}</div>
          </div>
          <Chip
            variant={entry.status === "SUBMITTED" ? "success" : entry.status === "VOID" ? "default" : "warning"}
            label={t(`logbook.status.${entry.status}`)}
          />
        </div>
        <div className={styles.dimsRow}>
          <span className={styles.dimChip}>
            <Clock size={13} /> {t("logbook.fill.effectiveAt")}: <b>{new Date(entry.effectiveAt).toLocaleString("es-CL")}</b>
          </span>
          {entry.shiftCode && (
            <span className={styles.dimChip}>
              <CalendarClock size={13} /> {t("logbook.fill.shift")}: <b>{entry.shiftCode}</b>
            </span>
          )}
          {entry.operationalDate && (
            <span className={styles.dimChip}>
              {t("logbook.fill.operationalDate")}: <b>{entry.operationalDate}</b>
            </span>
          )}
          {entry.periodKey && (
            <span className={styles.dimChip}>
              {t("logbook.fill.period")}: <b>{entry.periodKey}</b>
            </span>
          )}
        </div>
      </Card>

      {entry.status === "SUBMITTED" && (
        <div className={styles.sealedBanner}>
          <CheckCircle2 size={16} /> {t("logbook.fill.sealedBanner", { at: entry.sealedAt ? new Date(entry.sealedAt).toLocaleString("es-CL") : "" })}
        </div>
      )}

      {/* Secciones */}
      {entry.version.sections.map((section) => {
        const st = stateBySection.get(section.key);
        const editable = Boolean(st?.editable) && isDraft;
        const visible = section.fields.filter((f) => isFieldVisible(f.visibleWhen, draft));
        return (
          <Card key={section.key} className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <div className={styles.sectionTitle}>{section.title}</div>
                {section.description && <div className={styles.sectionDesc}>{section.description}</div>}
              </div>
              <div className={styles.sectionMeta}>
                {st && <Chip variant={st.state === "COMPLETED" ? "success" : st.state === "LOCKED" ? "default" : "warning"} label={t(`logbook.sectionState.${st.state}`)} />}
                {st?.filledByName && <span className={styles.filledBy}>{t("logbook.fill.filledBy", { name: st.filledByName })}</span>}
              </div>
            </div>

            {!editable && (
              <div className={styles.lockedNote}>
                <Lock size={13} /> {isDraft ? t("logbook.fill.notEditable") : t("logbook.fill.readonlySubmitted")}
              </div>
            )}

            <div>
              {visible.map((f) => {
                const errs = editable ? validateFieldValue(fieldForValidation(f), draft[f.key], { allowedCodes: inlineCodes(f.config) }).errors : [];
                return (
                  <div key={f.key}>
                    <FieldControl field={f} value={draft[f.key]} onChange={(v) => setValue(f.key, v)} readOnly={!editable} invalid={errs.length > 0} />
                    {errs.map((msg, i) => (
                      <div key={i} className={styles.fieldError}>
                        <AlertTriangle size={12} /> {msg}
                      </div>
                    ))}
                  </div>
                );
              })}
              {visible.length === 0 && <div className={styles.filledBy}>—</div>}
            </div>

            {editable && st && (
              <div className={styles.sectionFooter}>
                <Button variant="secondary" loading={savingKey === section.key} onClick={() => saveSection(section, st, false)}>
                  {t("logbook.fill.saveSection")}
                </Button>
                <Button variant="primary" loading={savingKey === section.key + ":complete"} onClick={() => saveSection(section, st, true)}>
                  <CheckCircle2 size={15} /> {t("logbook.fill.completeSection")}
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Enviar (sella) */}
      {isDraft && (
        <div className={styles.submitBar}>
          <Button variant="primary" loading={submit.isPending} onClick={doSubmit}>
            <Send size={15} /> {t("logbook.fill.submit")}
          </Button>
          <span className={styles.submitHint}>{t("logbook.fill.submitHint")}</span>
        </div>
      )}
    </div>
  );
}
