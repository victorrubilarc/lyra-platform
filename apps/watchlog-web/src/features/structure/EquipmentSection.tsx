import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Pencil, Plus, Tags, Trash2, Wrench } from "lucide-react";
import { Button, Chip, EmptyState, Modal, Table, useToast } from "@lyra/ui";
import type { Equipment } from "@lyra/contracts";
import type { TableColumn, TableSort } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { usePermissions } from "../../auth/use-permissions.js";
import {
  useDeleteEquipment,
  useEquipmentByNode,
  useEquipmentCategories,
  useUpdateEquipment,
} from "./equipment-queries.js";
import { EquipmentDrawer, type EquipmentDrawerMode } from "./EquipmentDrawer.js";
import { CategoriesDrawer } from "./CategoriesDrawer.js";
import styles from "./NodeDetail.module.css";

/** Color de la escala de severidad/criticidad 1–5 del Design System. */
function criticalityColor(level: number): string {
  return `var(--color-sev-${Math.min(Math.max(level, 1), 5)})`;
}

/** Celda editable inline del orden en informes de un equipo. */
function EquipmentOrderCell({ eq, editable }: { eq: Equipment; editable: boolean }) {
  const updateEquipment = useUpdateEquipment();
  const [value, setValue] = useState(String(eq.reportOrder));

  useEffect(() => {
    setValue(String(eq.reportOrder));
  }, [eq.reportOrder]);

  function commit() {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 0 || n === eq.reportOrder) {
      setValue(String(eq.reportOrder));
      return;
    }
    updateEquipment.mutate({ id: eq.id, dto: { reportOrder: n } });
  }

  if (!editable) return <span className={styles.orderReadonly}>{eq.reportOrder}</span>;

  return (
    <input
      className={styles.orderInput}
      type="number"
      min={0}
      step={10}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label="Orden en informes"
    />
  );
}

function sortEquipment(list: Equipment[], sort: TableSort): Equipment[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp: number;
    switch (sort.key) {
      case "reportOrder":
        cmp = a.reportOrder - b.reportOrder;
        break;
      case "code":
        cmp = (a.code ?? "").localeCompare(b.code ?? "");
        break;
      case "tag":
        cmp = (a.tag ?? "").localeCompare(b.tag ?? "");
        break;
      case "criticality":
        cmp = (a.criticality ?? 0) - (b.criticality ?? 0);
        break;
      default:
        cmp = a.name.localeCompare(b.name);
    }
    if (cmp === 0 && sort.key !== "name") cmp = a.name.localeCompare(b.name);
    return cmp * dir;
  });
}

interface EquipmentSectionProps {
  orgNodeId: string;
  /** Oculta el título "EQUIPOS" (cuando ya lo comunica una pestaña encima). */
  hideTitle?: boolean;
}

export function EquipmentSection({ orgNodeId, hideTitle }: EquipmentSectionProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();

  const canCreate = perms.can("equipment:create");
  const canEdit = perms.can("equipment:edit");
  const canDelete = perms.can("equipment:delete");
  const canManageCategories = perms.can("equipmentcategory:manage");

  const { data: equipment = [], isLoading, isError } = useEquipmentByNode(orgNodeId);
  const { data: categories = [] } = useEquipmentCategories();
  const deleteEquipment = useDeleteEquipment();

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const [sort, setSort] = useState<TableSort>({ key: "reportOrder", direction: "asc" });
  const sorted = useMemo(() => sortEquipment(equipment, sort), [equipment, sort]);

  const [drawer, setDrawer] = useState<{ open: boolean; mode: EquipmentDrawerMode; eq: Equipment | null }>({
    open: false,
    mode: "create",
    eq: null,
  });
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Equipment | null>(null);

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteEquipment.mutateAsync({ id: toDelete.id, orgNodeId });
      toast.success(t("equipment.deleted"));
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  const columns: TableColumn<Equipment>[] = [
    {
      key: "name",
      header: t("equipment.name"),
      sortable: true,
      width: 260,
      render: (row) => (
        <div className={styles.childNameCell}>
          <span className={styles.childNameText} style={{ fontWeight: 500 }}>{row.name}</span>
          {row.description && <span className={styles.childDesc}>{row.description}</span>}
        </div>
      ),
    },
    {
      key: "reportOrder",
      header: t("equipment.reportOrder"),
      width: 90,
      sortable: true,
      align: "center",
      render: (row) => <EquipmentOrderCell eq={row} editable={canEdit} />,
    },
    {
      key: "code",
      header: t("equipment.code"),
      width: 100,
      sortable: true,
      render: (row) =>
        row.code ? <code className={styles.code}>{row.code}</code> : <span className={styles.nullText}>—</span>,
    },
    {
      key: "tag",
      header: t("equipment.tag"),
      width: 180,
      sortable: true,
      render: (row) =>
        row.tag ? <code className={styles.code}>{row.tag}</code> : <span className={styles.nullText}>—</span>,
    },
    {
      key: "category",
      header: t("equipment.category"),
      width: 130,
      render: (row) =>
        row.categoryId && categoryName.get(row.categoryId) ? (
          <Chip label={categoryName.get(row.categoryId)!} variant="default" size="sm" />
        ) : (
          <span className={styles.nullText}>—</span>
        ),
    },
    {
      key: "criticality",
      header: t("equipment.criticality"),
      width: 90,
      sortable: true,
      align: "center",
      render: (row) =>
        row.criticality != null ? (
          <span
            title={`${t("equipment.criticality")} ${row.criticality}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              background: criticalityColor(row.criticality),
            }}
          >
            {row.criticality}
          </span>
        ) : (
          <span className={styles.nullText}>—</span>
        ),
    },
    {
      key: "active",
      header: t("equipment.status"),
      width: 110,
      align: "center",
      render: (row) =>
        row.active ? (
          <Chip label={t("equipment.active")} variant="success" size="sm" />
        ) : (
          <Chip label={t("equipment.inactive")} variant="default" size="sm" />
        ),
    },
    {
      key: "_actions",
      header: "",
      width: 72,
      align: "right",
      render: (row) => (
        <span className={styles.rowActions}>
          {canEdit && (
            <Button variant="icon" aria-label={t("common.edit")} onClick={() => setDrawer({ open: true, mode: "edit", eq: row })}>
              <Pencil size={14} />
            </Button>
          )}
          {canDelete && (
            <Button variant="icon" aria-label={t("common.delete")} onClick={() => setToDelete(row)}>
              <Trash2 size={14} />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader} style={hideTitle ? { justifyContent: "flex-end" } : undefined}>
        {!hideTitle && <h3 className={styles.sectionTitle}>{t("equipment.title")}</h3>}
        <div style={{ display: "flex", gap: 8 }}>
          {canManageCategories && (
            <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
              <Tags size={14} />
              {t("equipment.manageCategories")}
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" onClick={() => setDrawer({ open: true, mode: "create", eq: null })}>
              <Plus size={14} />
              {t("equipment.add")}
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <EmptyState icon={<AlertTriangle size={28} />} title={t("equipment.loadError")} />
      ) : (
        <Table
          columns={columns}
          data={sorted}
          rowKey={(e) => e.id}
          loading={isLoading}
          skeletonRows={4}
          sort={sort}
          onSort={(key, direction) => setSort({ key, direction })}
          paginated
          defaultPageSize={10}
          emptyState={
            <EmptyState
              icon={<Wrench size={32} color="var(--color-text-muted)" />}
              title={t("equipment.empty")}
              description={canCreate ? t("equipment.emptyCreate") : t("equipment.emptyDesc")}
              action={
                canCreate ? (
                  <Button variant="primary" onClick={() => setDrawer({ open: true, mode: "create", eq: null })}>
                    <Plus size={14} />
                    {t("equipment.add")}
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <EquipmentDrawer
        open={drawer.open}
        mode={drawer.mode}
        equipment={drawer.eq}
        orgNodeId={orgNodeId}
        categories={categories}
        onClose={() => setDrawer((s) => ({ ...s, open: false }))}
      />

      <CategoriesDrawer open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        size="sm"
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-error)" }}>
            <AlertTriangle size={18} />
            {t("equipment.deleteTitle")}
          </span>
        }
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleteEquipment.isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleteEquipment.isPending}>
              {t("equipment.deleteConfirm")}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
          {t("equipment.deleteWarning", { name: toDelete?.name ?? "" })}
        </p>
      </Modal>
    </section>
  );
}
