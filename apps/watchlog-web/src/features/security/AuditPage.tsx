import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Modal, Table, type TableColumn } from "@lyra/ui";
import type { AuditLogEntry } from "@lyra/contracts";
import { useAudit } from "./security-queries.js";
import shared from "./security-shared.module.css";
import styles from "./AuditPage.module.css";

/** Formatea una fecha ISO a hora local es-CL. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

/** Color del chip según el verbo de la acción (creación/edición/borrado/seguridad). */
function actionVariant(action: string): "success" | "warning" | "error" | "info" | "default" {
  if (/\.(created|enabled)$/.test(action)) return "success";
  if (/\.(deleted|disabled|failed|locked|reset|admin_reset)$/.test(action)) return "error";
  if (/\.(updated|assigned|regenerated)$/.test(action)) return "warning";
  if (action.startsWith("auth.")) return "info";
  return "default";
}

export function AuditPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAudit();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);

  const columns: TableColumn<AuditLogEntry>[] = [
    {
      key: "occurredAt",
      header: t("security.audit.when"),
      width: 170,
      render: (r) => <span className={shared.mono}>{formatDateTime(r.occurredAt)}</span>,
    },
    {
      key: "action",
      header: t("security.audit.action"),
      render: (r) => <Chip label={r.action} variant={actionVariant(r.action)} />,
    },
    {
      key: "actor",
      header: t("security.audit.actor"),
      render: (r) =>
        r.actorEmail ? (
          <span className={shared.mono}>{r.actorEmail}</span>
        ) : (
          <span className={shared.muted}>{t("security.audit.system")}</span>
        ),
    },
    {
      key: "entity",
      header: t("security.audit.entity"),
      render: (r) =>
        r.entityType ? (
          <span>
            {r.entityType}
            {r.entityId ? <span className={shared.muted}> · {r.entityId.slice(0, 10)}…</span> : null}
          </span>
        ) : (
          <span className={shared.muted}>—</span>
        ),
    },
    {
      key: "ip",
      header: t("security.audit.ip"),
      width: 130,
      render: (r) => <span className={shared.mono}>{r.ip ?? "—"}</span>,
    },
  ];

  if (isError) {
    return (
      <div className={shared.errorBox}>
        <TriangleAlert size={16} />
        {t("security.audit.loadError")}
      </div>
    );
  }

  return (
    <div className={shared.subpage}>
      <div className={shared.toolbar}>
        <div className={shared.toolbarInfo}>
          <h2 className={shared.toolbarTitle}>{t("security.audit.title")}</h2>
          <p className={shared.toolbarSubtitle}>{t("security.audit.subtitle")}</p>
        </div>
      </div>

      <Table
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setSelected(r)}
        emptyState={
          <EmptyState icon={<ScrollText size={32} />} title={t("security.audit.empty")} />
        }
      />

      {hasNextPage && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button
            variant="secondary"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
          >
            {t("security.audit.loadMore")}
          </Button>
        </div>
      )}

      <AuditDetailModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

interface AuditDetailModalProps {
  entry: AuditLogEntry | null;
  onClose: () => void;
}

function AuditDetailModal({ entry, onClose }: AuditDetailModalProps) {
  const { t } = useTranslation();
  if (!entry) return null;

  const renderJson = (value: unknown) =>
    value == null ? (
      <span className={shared.muted}>—</span>
    ) : (
      <pre className={styles.json}>{JSON.stringify(value, null, 2)}</pre>
    );

  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      size="lg"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ScrollText size={18} />
          {t("security.audit.detailTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div className={styles.detailGrid}>
        <span className={styles.detailKey}>{t("security.audit.action")}</span>
        <span>{entry.action}</span>
        <span className={styles.detailKey}>{t("security.audit.when")}</span>
        <span className={shared.mono}>{formatDateTime(entry.occurredAt)}</span>
        <span className={styles.detailKey}>{t("security.audit.actor")}</span>
        <span className={shared.mono}>{entry.actorEmail ?? t("security.audit.system")}</span>
        <span className={styles.detailKey}>{t("security.audit.entity")}</span>
        <span>
          {entry.entityType ?? "—"}
          {entry.entityId ? <span className={shared.muted}> · {entry.entityId}</span> : null}
        </span>
        <span className={styles.detailKey}>{t("security.audit.ip")}</span>
        <span className={shared.mono}>{entry.ip ?? "—"}</span>
        <span className={styles.detailKey}>{t("security.audit.userAgent")}</span>
        <span className={shared.mono} style={{ wordBreak: "break-all" }}>
          {entry.userAgent ?? "—"}
        </span>
      </div>

      <div className={styles.diffGrid}>
        <div>
          <div className={styles.diffLabel}>{t("security.audit.before")}</div>
          {renderJson(entry.before)}
        </div>
        <div>
          <div className={styles.diffLabel}>{t("security.audit.after")}</div>
          {renderJson(entry.after)}
        </div>
      </div>

      {entry.metadata != null && (
        <div>
          <div className={styles.diffLabel}>{t("security.audit.metadata")}</div>
          {renderJson(entry.metadata)}
        </div>
      )}
    </Modal>
  );
}
