import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, RefreshCw, Search } from "lucide-react";
import { deepLinkForEntity, type InboxItem } from "@lyra/contracts";
import { Button, Card, GridPager, Input, Select, cx, useToast } from "@lyra/ui";
import { formatRelativeTime } from "../../lib/format.js";
import { useInbox, useMarkAllInboxRead, useMarkInboxRead } from "./notifications-queries.js";
import styles from "./NotificationsPage.module.css";

type Filter = "all" | "unread";

/**
 * Bandeja IN-APP completa (la campanita "ver todas"): lista navegable de las
 * notificaciones del usuario con filtro leídas/no-leídas + búsqueda, marcar una o
 * todas como leídas, y paginación arriba/abajo. Dato del DUEÑO (ownership).
 */
export function InboxPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const list = useInbox({
    ...(filter === "unread" ? { unreadOnly: true } : {}),
    ...(debounced ? { q: debounced } : {}),
    limit: 100,
  });
  const markRead = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();

  const items = list.data?.items ?? [];
  const unread = list.data?.unread ?? 0;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageSafe = Math.min(page, pages - 1);
  const pageItems = items.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);

  const pager = (
    <GridPager
      page={pageSafe}
      pages={pages}
      total={items.length}
      pageSize={pageSize}
      unit={t("notifications.inbox.unit")}
      onPage={setPage}
      onPageSize={(n) => { setPageSize(n); setPage(0); }}
    />
  );

  function open(item: InboxItem) {
    if (!item.readAt) markRead.mutate(item.id);
    navigate(deepLinkForEntity(item.relatedEntityType, item.relatedEntityId) ?? "/mis-notificaciones");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        <form
          onSubmit={(e) => { e.preventDefault(); setDebounced(q.trim()); setPage(0); }}
          style={{ display: "flex", gap: 8 }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("notifications.inbox.search")} rightSlot={<Search size={16} />} />
        </form>
        <Select value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}>
          <option value="all">{t("notifications.inbox.filterAll")}</option>
          <option value="unread">{t("notifications.inbox.filterUnread")}</option>
        </Select>
        <div className={styles.spacer} />
        {unread > 0 && (
          <Button
            variant="secondary"
            leftIcon={<CheckCheck size={16} />}
            onClick={() => markAll.mutate(undefined, {
              onSuccess: () => toast.success(t("notifications.inbox.allRead")),
              onError: () => toast.error(t("common.error")),
            })}
          >
            {t("topbar.markAllRead")}
          </Button>
        )}
        <Button variant="secondary" onClick={() => list.refetch()} leftIcon={<RefreshCw size={16} />}>
          {t("common.refresh")}
        </Button>
      </div>

      {pager}

      <Card>
        {list.isLoading ? (
          <div className={styles.empty}>{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>{t("notifications.inbox.empty")}</div>
        ) : (
          <div className={styles.inboxList}>
            {pageItems.map((it) => (
              <div
                key={it.id}
                className={cx(styles.inboxRow, !it.readAt && styles.inboxRowUnread)}
                role="button"
                tabIndex={0}
                onClick={() => open(it)}
                onKeyDown={(e) => { if (e.key === "Enter") open(it); }}
              >
                <span className={cx(styles.notifDot, it.readAt && styles.notifDotRead)} />
                <div className={styles.inboxRowMain}>
                  <span className={styles.inboxRowSubject}>{it.subject}</span>
                  {it.preview && <span className={styles.inboxRowPreview}>{it.preview}</span>}
                </div>
                <span className={styles.inboxRowTime}>{formatRelativeTime(it.sentAt ?? it.createdAt)}</span>
                {!it.readAt && (
                  <button
                    type="button"
                    className={styles.inboxReadBtn}
                    title={t("notifications.inbox.markRead")}
                    aria-label={t("notifications.inbox.markRead")}
                    onClick={(e) => { e.stopPropagation(); markRead.mutate(it.id); }}
                  >
                    <Check size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {items.length > 0 && pager}
    </div>
  );
}
