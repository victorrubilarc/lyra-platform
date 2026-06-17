import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { deepLinkForEntity, type InboxItem } from "@lyra/contracts";
import { Menu, MenuItem, MenuLabel, MenuSeparator, cx } from "@lyra/ui";
import {
  useInbox,
  useInboxUnreadCount,
  useMarkAllInboxRead,
  useMarkInboxRead,
} from "../features/notifications/notifications-queries.js";
import { useInboxRealtime } from "../features/notifications/use-inbox-realtime.js";
import { useAuth } from "../auth/use-auth.js";
import { formatRelativeTime } from "../lib/format.js";
import styles from "./AppShell.module.css";

/** Cuántas notificaciones recientes muestra el dropdown (la bandeja completa va en /mis-notificaciones). */
const PREVIEW_COUNT = 8;

/**
 * Campanita del Topbar: badge de no leídas + dropdown con las notificaciones in-app
 * recientes (navegables a su entidad), marcar todas como leídas y "ver todas". El
 * contador se mantiene en tiempo real por SSE (`useInboxRealtime`) con poll de
 * respaldo (`useInboxUnreadCount`). Dato del DUEÑO: solo muestra las suyas.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const enabled = Boolean(user);

  useInboxRealtime(enabled);
  const unreadQ = useInboxUnreadCount(enabled);
  const inboxQ = useInbox({ limit: PREVIEW_COUNT }, enabled);
  const markRead = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();

  const unread = unreadQ.data?.unread ?? 0;
  const items = inboxQ.data?.items ?? [];

  function open(item: InboxItem) {
    if (!item.readAt) markRead.mutate(item.id);
    const link = deepLinkForEntity(item.relatedEntityType, item.relatedEntityId);
    navigate(link ?? "/mis-notificaciones");
  }

  return (
    <Menu
      ariaLabel={t("topbar.notifications")}
      minWidth={340}
      trigger={
        <span className={styles.bellTrigger}>
          <Bell size={18} aria-hidden="true" />
          {unread > 0 && (
            <span className={styles.bellBadge} aria-label={String(unread)}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      }
    >
      <div className={styles.notifHead}>
        <MenuLabel>{t("topbar.notifications")}</MenuLabel>
        {unread > 0 && (
          <button type="button" className={styles.notifMarkAll} onClick={() => markAll.mutate()}>
            {t("topbar.markAllRead")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className={styles.notifEmpty}>{t("topbar.noNotifications")}</div>
      ) : (
        items.map((it) => (
          <MenuItem
            key={it.id}
            onSelect={() => open(it)}
            icon={<span className={cx(styles.notifDot, it.readAt && styles.notifDotRead)} />}
          >
            <span className={styles.notifRow}>
              <span className={styles.notifSubject}>{it.subject}</span>
              {it.preview && <span className={styles.notifPreview}>{it.preview}</span>}
              <span className={styles.notifTime}>{formatRelativeTime(it.sentAt ?? it.createdAt)}</span>
            </span>
          </MenuItem>
        ))
      )}

      <MenuSeparator />
      <MenuItem icon={<Bell size={16} />} onSelect={() => navigate("/mis-notificaciones")}>
        {t("topbar.viewAll")}
      </MenuItem>
    </Menu>
  );
}
