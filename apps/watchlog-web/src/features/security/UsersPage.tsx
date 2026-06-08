import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, TriangleAlert, Users as UsersIcon } from "lucide-react";
import { Button, Chip, EmptyState, Input, ResizableSplit, Table, cx, type TableColumn } from "@lyra/ui";
import type { UserStatus, UserSummary } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { useUsers } from "./security-queries.js";
import { UserDetail } from "./UserDetail.js";
import { UserDrawer } from "./UserDrawer.js";
import shared from "./security-shared.module.css";
import styles from "./UsersPage.module.css";

const STATUS_VARIANT: Record<UserStatus, "success" | "default" | "error" | "info"> = {
  ACTIVE: "success",
  DISABLED: "default",
  LOCKED: "error",
  INVITED: "info",
};

export function UsersPage() {
  const { t } = useTranslation();
  const { data: users = [], isLoading, isError } = useUsers();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  const columns: TableColumn<UserSummary>[] = [
    {
      key: "user",
      header: t("security.users.colUser"),
      render: (u) => (
        <div className={styles.userCell}>
          <span className={styles.userName}>{u.displayName}</span>
          <span className={cx(shared.mono, styles.userMail)}>{u.email}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("security.users.colStatus"),
      width: 92,
      align: "right",
      render: (u) => <Chip label={t(`security.users.status.${u.status}`)} variant={STATUS_VARIANT[u.status]} />,
    },
  ];

  if (isError) {
    return (
      <div className={shared.errorBox}>
        <TriangleAlert size={16} />
        {t("security.users.loadError")}
      </div>
    );
  }

  return (
    <div className={shared.subpage} style={{ flex: 1, minHeight: 0 }}>
      <div className={shared.toolbar}>
        <div className={shared.toolbarInfo}>
          <h2 className={shared.toolbarTitle}>{t("security.users.title")}</h2>
          <p className={shared.toolbarSubtitle}>{t("security.users.subtitle")}</p>
        </div>
        <Can perform="user:create">
          <div className={shared.toolbarActions}>
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setDrawerOpen(true)}>
              {t("security.users.new")}
            </Button>
          </div>
        </Can>
      </div>

      <div className={styles.split}>
        <ResizableSplit
          storageKey="wl_security_users_split"
          defaultLeftWidth={380}
          minLeftWidth={280}
          left={
            <div className={styles.listPanel}>
              <div className={styles.searchBar}>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("security.users.search")}
                  rightSlot={<Search size={15} aria-hidden="true" />}
                />
              </div>
              <div className={styles.listScroll}>
                <Table
                  columns={columns}
                  data={filtered}
                  rowKey={(u) => u.id}
                  loading={isLoading}
                  onRowClick={(u) => setSelectedId(u.id)}
                  emptyState={
                    <EmptyState icon={<UsersIcon size={32} />} title={t("security.users.empty")} />
                  }
                />
              </div>
            </div>
          }
          right={<UserDetail userId={selectedId} />}
        />
      </div>

      <UserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
