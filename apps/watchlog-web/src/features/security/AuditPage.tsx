import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FilterX, ScrollText, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, Modal, Select, Table, useToast, type TableColumn } from "@lyra/ui";
import type { AuditFilters, AuditLogEntry } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { downloadBlob, fileStamp } from "../../lib/download.js";
import { exportAuditCsv } from "./security-api.js";
import { useAudit } from "./security-queries.js";
import shared from "./security-shared.module.css";
import styles from "./AuditPage.module.css";

/** Tipos de entidad conocidos para el filtro (coincidencia parcial en el backend). */
const ENTITY_TYPES = ["User", "Role", "OrgNode", "OrgLevel", "Equipment", "EquipmentCategory"] as const;

interface FilterForm {
  from: string;
  to: string;
  action: string;
  actor: string;
  entityType: string;
}

const EMPTY_FILTERS: FilterForm = { from: "", to: "", action: "", actor: "", entityType: "" };

/** Convierte el formulario (fechas locales) a filtros ISO para el backend. */
function toFilters(f: FilterForm): AuditFilters {
  return {
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : undefined,
    action: f.action.trim() || undefined,
    actor: f.actor.trim() || undefined,
    entityType: f.entityType || undefined,
  };
}

/** Fecha local en formato YYYY-MM-DD (para `<input type="date">`). */
function isoDay(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

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
  const toast = useToast();
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>({});
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  // Debounce: aplica los filtros 400 ms después del último cambio.
  useEffect(() => {
    const id = setTimeout(() => setApplied(toFilters(form)), 400);
    return () => clearTimeout(id);
  }, [form]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAudit(applied);

  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);
  const hasFilters = Object.values(form).some((v) => v !== "");

  function setField<K extends keyof FilterForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function presetDays(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setForm((f) => ({ ...f, from: isoDay(from), to: isoDay(to) }));
  }

  async function doExport() {
    setExporting(true);
    try {
      const blob = await exportAuditCsv(applied);
      downloadBlob(`auditoria-${fileStamp()}.csv`, blob);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setExporting(false);
    }
  }

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
        <div className={styles.presets}>
          <Button variant="secondary" onClick={() => presetDays(1)}>{t("security.audit.preset24h")}</Button>
          <Button variant="secondary" onClick={() => presetDays(7)}>{t("security.audit.preset7d")}</Button>
          <Button variant="secondary" onClick={() => presetDays(30)}>{t("security.audit.preset30d")}</Button>
          <Button variant="primary" leftIcon={<Download size={16} />} loading={exporting} onClick={doExport}>
            {t("security.audit.export")}
          </Button>
        </div>
      </div>

      {/* Barra de filtros para auditores */}
      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("security.audit.from")}</span>
          <Input type="date" value={form.from} max={form.to || undefined} onChange={(e) => setField("from", e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("security.audit.to")}</span>
          <Input type="date" value={form.to} min={form.from || undefined} onChange={(e) => setField("to", e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("security.audit.action")}</span>
          <Input value={form.action} placeholder={t("security.audit.actionPlaceholder")} onChange={(e) => setField("action", e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("security.audit.actor")}</span>
          <Input value={form.actor} placeholder={t("security.audit.actorPlaceholder")} onChange={(e) => setField("actor", e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("security.audit.entity")}</span>
          <Select value={form.entityType} onChange={(e) => setField("entityType", e.target.value)}>
            <option value="">{t("security.audit.allEntities")}</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
        </label>
        {hasFilters && (
          <Button variant="secondary" leftIcon={<FilterX size={16} />} onClick={() => setForm(EMPTY_FILTERS)}>
            {t("security.audit.clear")}
          </Button>
        )}
      </div>

      <div className={styles.resultInfo}>
        {t("security.audit.resultCount", { count: rows.length })}
        {hasNextPage ? "+" : ""}
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
