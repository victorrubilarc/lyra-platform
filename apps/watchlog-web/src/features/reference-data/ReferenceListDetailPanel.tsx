import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ListChecks, Pencil, Plus, Tag, Trash2, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Skeleton, Table, useToast, type TableColumn } from "@lyra/ui";
import type { ReferenceItem, ReferenceListDetail } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { ConfirmDeleteModal } from "../templates/ConfirmDeleteModal.js";
import { ItemDrawer } from "./ItemDrawer.js";
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
      width: 140,
      render: (row) => <span className={styles.codeCell}>{row.code}</span>,
    },
    {
      key: "label",
      header: t("referenceData.item.label"),
      render: (row) => <span style={{ opacity: row.active ? 1 : 0.55 }}>{row.label}</span>,
    },
    {
      key: "metadata",
      header: t("referenceData.item.metadata"),
      render: (row) => (
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{metadataSummary(row.metadata)}</span>
      ),
    },
    {
      key: "sortOrder",
      header: t("referenceData.sortOrder"),
      width: 90,
      align: "center",
      render: (row) =>
        canManage ? (
          <input
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
        <span className={styles.itemsTitle}>{t("referenceData.detail.itemsTitle")}</span>
        <Can perform="referencelist:manage">
          <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setItemDrawer({ mode: "create", item: null })}>
            {t("referenceData.item.add")}
          </Button>
        </Can>
      </div>

      <Table
        columns={columns}
        data={detail.items}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyState icon={<Tag size={30} />} title={t("referenceData.detail.noItems")} description={t("referenceData.detail.noItemsDesc")} />
        }
      />

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
