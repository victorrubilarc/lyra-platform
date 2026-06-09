import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Eye, EyeOff, FileUp, ListChecks, Pencil, Plus, Search, Tag, Trash2, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, Select, Skeleton, Table, useToast, type TableColumn, type TableSort } from "@lyra/ui";
import type { ReferenceItem, ReferenceListDetail } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { downloadBlob, fileStamp } from "../../lib/download.js";
import { ConfirmDeleteModal } from "../templates/ConfirmDeleteModal.js";
import { ImportCsvModal } from "./ImportCsvModal.js";
import { ItemDrawer } from "./ItemDrawer.js";
import { exportReferenceListCsv } from "./reference-data-api.js";
import {
  useDeleteReferenceItem,
  useDeleteReferenceList,
  useReferenceList,
  useUpdateReferenceItem,
} from "./reference-data-queries.js";
import styles from "./ReferenceDataPage.module.css";

interface Props {
  listId: string | null;
  onEditList: () => void;
  onDeleted: () => void;
}

function metadataSummary(meta: ReferenceItem["metadata"]): string {
  if (!meta) return "—";
  const entries = Object.entries(meta);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

const norm = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type StatusFilter = "all" | "active" | "inactive";

/** Celda de metadata: chips clave:valor (máx. 3 + "+N"), o "—" si vacía. */
function MetadataCell({ meta }: { meta: ReferenceItem["metadata"] }) {
  if (!meta) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const entries = Object.entries(meta);
  if (entries.length === 0) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const shown = entries.slice(0, 3);
  const extra = entries.length - shown.length;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {shown.map(([k, v]) => (
        <Chip key={k} label={`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`} variant="default" size="sm" />
      ))}
      {extra > 0 && <Chip label={`+${extra}`} variant="default" size="sm" />}
    </span>
  );
}

function sortItems(items: ReferenceItem[], sort: TableSort): ReferenceItem[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (sort.key) {
      case "code":
        return a.code.localeCompare(b.code) * dir;
      case "label":
        return a.label.localeCompare(b.label) * dir;
      case "active":
        return (Number(a.active) - Number(b.active)) * dir;
      case "sortOrder":
      default:
        return ((a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)) as number) * dir;
    }
  });
}

export function ReferenceListDetailPanel({ listId, onEditList, onDeleted }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("referencelist:manage");

  const { data: list, isLoading, isError } = useReferenceList(listId);
  const updateItem = useUpdateReferenceItem();
  const deleteItem = useDeleteReferenceItem();
  const deleteList = useDeleteReferenceList();

  const [itemDrawer, setItemDrawer] = useState<{ mode: "create" | "edit"; item: ReferenceItem | null } | null>(null);
  const [toDeleteItem, setToDeleteItem] = useState<ReferenceItem | null>(null);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Estado de la grilla enterprise (buscador + filtro de estado + orden).
  const [itemSearch, setItemSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<TableSort>({ key: "sortOrder", direction: "asc" });

  const allItems = useMemo(() => list?.items ?? [], [list]);
  const activeCount = allItems.filter((i) => i.active).length;
  const visibleItems = useMemo(() => {
    let rows = allItems;
    if (statusFilter === "active") rows = rows.filter((i) => i.active);
    else if (statusFilter === "inactive") rows = rows.filter((i) => !i.active);
    const q = norm(itemSearch.trim());
    if (q) rows = rows.filter((i) => norm(`${i.code} ${i.label} ${metadataSummary(i.metadata)}`).includes(q));
    return sortItems(rows, sort);
  }, [allItems, statusFilter, itemSearch, sort]);

  if (!listId) {
    return (
      <div className={styles.detailEmpty}>
        <ListChecks size={40} />
        <p>{t("referenceData.detail.empty")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.detail}>
        <Skeleton height={28} width="40%" />
        <Skeleton height={16} width="70%" />
        <Skeleton height={120} width="100%" />
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className={styles.detailEmpty}>
        <TriangleAlert size={32} />
        <p>{t("referenceData.detail.loadError")}</p>
      </div>
    );
  }

  const detail: ReferenceListDetail = list;

  function toggleItemActive(item: ReferenceItem) {
    updateItem.mutate(
      { listId: detail.id, itemId: item.id, dto: { active: !item.active } },
      {
        onSuccess: () => toast.success(item.active ? t("referenceData.item.deactivated") : t("referenceData.item.activated")),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric")),
      },
    );
  }

  function saveOrder(item: ReferenceItem, value: number) {
    if (value === item.sortOrder) return;
    updateItem.mutate({ listId: detail.id, itemId: item.id, dto: { sortOrder: value } });
  }

  function confirmDeleteItem() {
    if (!toDeleteItem) return;
    deleteItem.mutate(
      { listId: detail.id, itemId: toDeleteItem.id },
      {
        onSuccess: () => {
          toast.success(t("referenceData.item.deleted"));
          setToDeleteItem(null);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric")),
      },
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportReferenceListCsv(detail.id);
      downloadBlob(`lista-${detail.key}-${fileStamp()}.csv`, blob);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setExporting(false);
    }
  }

  function confirmDeleteList() {
    deleteList.mutate(detail.id, {
      onSuccess: () => {
        toast.success(t("referenceData.list.deleted"));
        setDeleteListOpen(false);
        onDeleted();
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric")),
    });
  }

  const columns: TableColumn<ReferenceItem>[] = [
    {
      key: "code",
      header: t("referenceData.item.code"),
      width: 150,
      sortable: true,
      render: (row) => <span className={styles.codeCell}>{row.code}</span>,
    },
    {
      key: "label",
      header: t("referenceData.item.label"),
      sortable: true,
      render: (row) => <span style={{ opacity: row.active ? 1 : 0.55 }}>{row.label}</span>,
    },
    {
      key: "metadata",
      header: t("referenceData.item.metadata"),
      render: (row) => <MetadataCell meta={row.metadata} />,
    },
    {
      key: "sortOrder",
      header: t("referenceData.sortOrder"),
      width: 90,
      align: "center",
      sortable: true,
      render: (row) =>
        canManage ? (
          <input
            key={`${row.id}-${row.sortOrder}`}
            type="number"
            min={0}
            step={10}
            defaultValue={row.sortOrder}
            className={styles.inlineOrderInput}
            onBlur={(e) => saveOrder(row, Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={t("referenceData.sortOrder")}
          />
        ) : (
          row.sortOrder
        ),
    },
    {
      key: "active",
      header: t("referenceData.item.status"),
      width: 110,
      sortable: true,
      render: (row) =>
        row.active ? (
          <Chip label={t("referenceData.item.active")} variant="success" size="sm" />
        ) : (
          <Chip label={t("referenceData.item.inactive")} variant="default" size="sm" />
        ),
    },
    {
      key: "actions",
      header: "",
      width: 132,
      align: "right",
      render: (row) =>
        canManage ? (
          <div style={{ display: "inline-flex", gap: 4 }}>
            <Button
              variant="icon"
              aria-label={row.active ? t("referenceData.item.deactivate") : t("referenceData.item.activate")}
              title={row.active ? t("referenceData.item.deactivate") : t("referenceData.item.activate")}
              onClick={() => toggleItemActive(row)}
            >
              {row.active ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
            <Button variant="icon" aria-label={t("common.edit")} onClick={() => setItemDrawer({ mode: "edit", item: row })}>
              <Pencil size={16} />
            </Button>
            <Button variant="icon" aria-label={t("common.delete")} onClick={() => setToDeleteItem(row)}>
              <Trash2 size={16} />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderInfo}>
          <h2 className={styles.detailName}>
            <ListChecks size={20} />
            {detail.name}
          </h2>
          <span className={styles.detailKey}>{detail.key}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <Chip
              label={detail.source === "EXTERNAL" ? t("referenceData.source.external") : t("referenceData.source.manual")}
              variant={detail.source === "EXTERNAL" ? "info" : "default"}
              size="sm"
            />
            {detail.active ? (
              <Chip label={t("referenceData.active")} variant="success" size="sm" />
            ) : (
              <Chip label={t("referenceData.inactive")} variant="default" size="sm" />
            )}
            <Chip label={t("referenceData.itemCount", { count: detail.items.length })} variant="default" size="sm" />
          </div>
          {detail.description && <p className={styles.detailDesc}>{detail.description}</p>}
        </div>
        <Can perform="referencelist:manage">
          <div className={styles.detailActions}>
            <Button variant="secondary" leftIcon={<Pencil size={15} />} onClick={onEditList}>
              {t("common.edit")}
            </Button>
            <Button variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteListOpen(true)}>
              {t("common.delete")}
            </Button>
          </div>
        </Can>
      </div>

      <div className={styles.itemsHeader}>
        <span className={styles.itemsTitle}>
          {t("referenceData.detail.itemsTitle")}
          <span className={styles.itemsCount}>
            {t("referenceData.detail.itemsSummary", { active: activeCount, total: allItems.length })}
          </span>
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" leftIcon={<Download size={15} />} onClick={handleExport} loading={exporting}>
            {t("referenceData.csv.export")}
          </Button>
          <Can perform="referencelist:manage">
            <Button variant="secondary" leftIcon={<FileUp size={15} />} onClick={() => setImportOpen(true)}>
              {t("referenceData.csv.import")}
            </Button>
            <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setItemDrawer({ mode: "create", item: null })}>
              {t("referenceData.item.add")}
            </Button>
          </Can>
        </div>
      </div>

      <div className={styles.itemsToolbar}>
        <div className={styles.itemsSearch}>
          <Input
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder={t("referenceData.detail.searchItems")}
            aria-label={t("referenceData.detail.searchItems")}
            rightSlot={<Search size={15} color="var(--color-text-muted)" />}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label={t("referenceData.detail.statusFilter")}
          className={styles.statusSelect}
        >
          <option value="all">{t("referenceData.detail.statusAll")}</option>
          <option value="active">{t("referenceData.item.active")}</option>
          <option value="inactive">{t("referenceData.item.inactive")}</option>
        </Select>
      </div>

      <Table
        columns={columns}
        data={visibleItems}
        rowKey={(r) => r.id}
        sort={sort}
        onSort={(key, direction) => setSort({ key, direction })}
        paginated
        defaultPageSize={10}
        emptyState={
          <EmptyState
            icon={<Tag size={30} />}
            title={itemSearch.trim() || statusFilter !== "all" ? t("referenceData.detail.noItemsFiltered") : t("referenceData.detail.noItems")}
            description={itemSearch.trim() || statusFilter !== "all" ? undefined : t("referenceData.detail.noItemsDesc")}
          />
        }
      />

      <ImportCsvModal open={importOpen} listId={detail.id} listName={detail.name} onClose={() => setImportOpen(false)} />

      {itemDrawer && (
        <ItemDrawer
          open
          mode={itemDrawer.mode}
          listId={detail.id}
          item={itemDrawer.item}
          onClose={() => setItemDrawer(null)}
        />
      )}
      <ConfirmDeleteModal
        open={toDeleteItem !== null}
        title={t("referenceData.item.deleteTitle")}
        body={t("referenceData.item.deleteConfirm", { code: toDeleteItem?.code ?? "" })}
        loading={deleteItem.isPending}
        onConfirm={confirmDeleteItem}
        onClose={() => setToDeleteItem(null)}
      />
      <ConfirmDeleteModal
        open={deleteListOpen}
        title={t("referenceData.list.deleteTitle")}
        body={t("referenceData.list.deleteConfirm", { name: detail.name })}
        loading={deleteList.isPending}
        onConfirm={confirmDeleteList}
        onClose={() => setDeleteListOpen(false)}
      />
    </div>
  );
}
