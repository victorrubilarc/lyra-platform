import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Pencil, Plus, Search, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, Modal, Table, useToast, type TableColumn } from "@lyra/ui";
import type { RoleSummary } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { downloadText, fileStamp, toCsv } from "../../lib/download.js";
import { useDeleteRole, useRoles } from "./security-queries.js";
import { RoleDrawer } from "./RoleDrawer.js";
import shared from "./security-shared.module.css";

export function RolesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("role:manage");

  const { data: roles = [], isLoading, isError } = useRoles();
  const deleteRole = useDeleteRole();

  const [drawer, setDrawer] = useState<{ open: boolean; roleId: string | null }>({
    open: false,
    roleId: null,
  });
  const [toDelete, setToDelete] = useState<RoleSummary | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [roles, query]);

  function exportCsv() {
    const csv = toCsv(filtered, [
      { header: t("security.roles.colName"), value: (r) => r.name },
      { header: t("security.roles.key"), value: (r) => r.key },
      { header: t("security.roles.colDescription"), value: (r) => r.description ?? "" },
      { header: t("security.roles.colMfa"), value: (r) => (r.requireMfa ? "Sí" : "No") },
      { header: t("security.roles.colPerms"), value: (r) => r.permissionCount },
      { header: t("security.roles.colUsers"), value: (r) => r.userCount },
      { header: t("security.roles.system"), value: (r) => (r.isSystem ? "Sí" : "No") },
    ]);
    downloadText(`roles-${fileStamp()}.csv`, csv);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteRole.mutateAsync(toDelete.id);
      toast.success(t("security.roles.deleted"));
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  const columns: TableColumn<RoleSummary>[] = [
    {
      key: "name",
      header: t("security.roles.colName"),
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{r.name}</span>
          <span className={shared.mono} style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
            {r.key}
          </span>
        </div>
      ),
    },
    {
      key: "description",
      header: t("security.roles.colDescription"),
      render: (r) =>
        r.description ? (
          <span className={shared.muted}>{r.description}</span>
        ) : (
          <span className={shared.muted}>—</span>
        ),
    },
    {
      key: "requireMfa",
      header: t("security.roles.colMfa"),
      align: "center",
      width: 90,
      render: (r) =>
        r.requireMfa ? <Chip label={t("security.roles.mfaOn")} variant="info" /> : <span className={shared.muted}>—</span>,
    },
    {
      key: "permissionCount",
      header: t("security.roles.colPerms"),
      align: "center",
      width: 90,
      render: (r) => <span className={shared.mono}>{r.permissionCount}</span>,
    },
    {
      key: "userCount",
      header: t("security.roles.colUsers"),
      align: "center",
      width: 90,
      render: (r) => <span className={shared.mono}>{r.userCount}</span>,
    },
    {
      key: "system",
      header: "",
      width: 110,
      render: (r) =>
        r.isSystem ? (
          <Chip label={t("security.roles.system")} variant="default" />
        ) : null,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 96,
      render: (r) =>
        canManage ? (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
            <Button
              variant="icon"
              aria-label={t("common.edit")}
              onClick={() => setDrawer({ open: true, roleId: r.id })}
            >
              <Pencil size={16} />
            </Button>
            <Button
              variant="icon"
              aria-label={t("common.delete")}
              disabled={r.isSystem}
              onClick={() => setToDelete(r)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ) : null,
    },
  ];

  if (isError) {
    return (
      <div className={shared.errorBox}>
        <TriangleAlert size={16} />
        {t("security.roles.loadError")}
      </div>
    );
  }

  return (
    <div className={shared.subpage}>
      <div className={shared.toolbar}>
        <div className={shared.toolbarInfo}>
          <h2 className={shared.toolbarTitle}>{t("security.roles.title")}</h2>
          <p className={shared.toolbarSubtitle}>{t("security.roles.subtitle")}</p>
        </div>
        <div className={shared.toolbarActions}>
          <div className={shared.searchField}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("security.roles.search")}
              rightSlot={<Search size={15} aria-hidden="true" />}
            />
          </div>
          <Button variant="secondary" leftIcon={<Download size={16} />} onClick={exportCsv} disabled={filtered.length === 0}>
            {t("common.export")}
          </Button>
          <Can perform="role:manage">
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setDrawer({ open: true, roleId: null })}>
              {t("security.roles.new")}
            </Button>
          </Can>
        </div>
      </div>

      <Table
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={canManage ? (r) => setDrawer({ open: true, roleId: r.id }) : undefined}
        emptyState={<EmptyState icon={<ShieldCheck size={32} />} title={t("security.roles.empty")} />}
      />

      <RoleDrawer
        open={drawer.open}
        roleId={drawer.roleId}
        onClose={() => setDrawer({ open: false, roleId: null })}
      />

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        size="sm"
        title={t("security.roles.deleteTitle")}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleteRole.isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleteRole.isPending}>
              {t("common.delete")}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
          {t("security.roles.deleteConfirm", { name: toDelete?.name ?? "" })}
        </p>
        {toDelete && toDelete.userCount > 0 && (
          <div className={shared.errorBox} style={{ marginTop: 12 }}>
            <TriangleAlert size={16} />
            {t("security.roles.deleteUsersWarning", { count: toDelete.userCount })}
          </div>
        )}
      </Modal>
    </div>
  );
}
