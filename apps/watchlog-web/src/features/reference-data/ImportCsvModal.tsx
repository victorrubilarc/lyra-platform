import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileUp, RotateCcw } from "lucide-react";
import { Button, Checkbox, Chip, Modal, Table, useToast, type ChipVariant, type TableColumn } from "@lyra/ui";
import type { ReferenceImportReport, ReferenceImportRow, ReferenceImportRowStatus } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { importReferenceListCsv } from "./reference-data-api.js";
import { REFERENCE_KEYS } from "./reference-data-queries.js";
import styles from "./ReferenceDataPage.module.css";

const STATUS_CHIP: Record<ReferenceImportRowStatus, { variant: ChipVariant; key: string }> = {
  create: { variant: "success", key: "referenceData.import.status.create" },
  update: { variant: "info", key: "referenceData.import.status.update" },
  unchanged: { variant: "default", key: "referenceData.import.status.unchanged" },
  deactivate: { variant: "warning", key: "referenceData.import.status.deactivate" },
  error: { variant: "error", key: "referenceData.import.status.error" },
};

interface ImportCsvModalProps {
  open: boolean;
  listId: string;
  listName: string;
  onClose: () => void;
}

/**
 * Import CSV en dos pasos (patrón dry-run enterprise): (1) elegir archivo →
 * dry-run en backend; (2) preview del reporte de diferencias → confirmar (commit,
 * re-validado en servidor). Con errores el confirmar queda deshabilitado.
 */
export function ImportCsvModal({ open, listId, listName, onClose }: ImportCsvModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [report, setReport] = useState<ReferenceImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setContent(null);
    setFileName("");
    setDeactivateMissing(false);
    setReport(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  function pickFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(typeof reader.result === "string" ? reader.result : null);
      setFileName(file.name);
      setReport(null);
    };
    reader.readAsText(file, "utf-8");
  }

  async function runImport(dryRun: boolean) {
    if (!content) return;
    setBusy(true);
    try {
      const r = await importReferenceListCsv(listId, { content, deactivateMissing, dryRun });
      setReport(r);
      if (r.applied) {
        toast.success(t("referenceData.import.applied", { creates: r.summary.creates, updates: r.summary.updates }));
        await qc.invalidateQueries({ queryKey: REFERENCE_KEYS.detail(listId) });
        await qc.invalidateQueries({ queryKey: REFERENCE_KEYS.list() });
        close();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const columns: TableColumn<ReferenceImportRow>[] = [
    {
      key: "line",
      header: t("referenceData.import.line"),
      width: 70,
      align: "center",
      render: (r) => (r.line > 0 ? r.line : "—"),
    },
    {
      key: "code",
      header: t("referenceData.item.code"),
      width: 140,
      render: (r) => <span className={styles.codeCell}>{r.code ?? "—"}</span>,
    },
    {
      key: "status",
      header: t("referenceData.import.rowStatus"),
      width: 130,
      render: (r) => {
        const c = STATUS_CHIP[r.status];
        return <Chip label={t(c.key)} variant={c.variant} size="sm" />;
      },
    },
    {
      key: "detail",
      header: t("referenceData.import.detail"),
      render: (r) =>
        r.status === "error" ? (
          <span style={{ color: "var(--color-error)", fontSize: 12 }}>{r.message}</span>
        ) : r.changes?.length ? (
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.changes.join(", ")}</span>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
  ];

  const hasErrors = (report?.summary.errors ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={t("referenceData.import.title", { name: listName })}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          {report && (
            <Button variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={reset} disabled={busy}>
              {t("referenceData.import.startOver")}
            </Button>
          )}
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {report ? (
            <Button variant="primary" onClick={() => runImport(false)} loading={busy} disabled={hasErrors}>
              {t("referenceData.import.confirm", {
                count: report.summary.creates + report.summary.updates + report.summary.deactivates,
              })}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => runImport(true)} loading={busy} disabled={!content}>
              {t("referenceData.import.analyze")}
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!report && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              {t("referenceData.import.help")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Button variant="secondary" leftIcon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>
                {t("referenceData.import.chooseFile")}
              </Button>
              <span style={{ fontSize: 13, color: fileName ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                {fileName || t("referenceData.import.noFile")}
              </span>
            </div>
            <Checkbox
              checked={deactivateMissing}
              onChange={setDeactivateMissing}
              label={t("referenceData.import.deactivateMissing")}
            />
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              {t("referenceData.import.deactivateMissingHint")}
            </p>
          </>
        )}

        {report && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip label={t("referenceData.import.sumCreates", { count: report.summary.creates })} variant="success" size="sm" />
              <Chip label={t("referenceData.import.sumUpdates", { count: report.summary.updates })} variant="info" size="sm" />
              <Chip label={t("referenceData.import.sumUnchanged", { count: report.summary.unchanged })} variant="default" size="sm" />
              {report.summary.deactivates > 0 && (
                <Chip label={t("referenceData.import.sumDeactivates", { count: report.summary.deactivates })} variant="warning" size="sm" />
              )}
              {hasErrors && (
                <Chip label={t("referenceData.import.sumErrors", { count: report.summary.errors })} variant="error" size="sm" />
              )}
            </div>
            {hasErrors && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-error)" }}>{t("referenceData.import.fixErrors")}</p>
            )}
            <Table
              columns={columns}
              data={report.rows}
              rowKey={(r) => `${r.line}-${r.code ?? ""}-${r.status}`}
              paginated
              defaultPageSize={8}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
