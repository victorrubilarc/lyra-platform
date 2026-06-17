import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Inbox, SlidersHorizontal } from "lucide-react";
import { InboxPanel } from "./InboxPanel.js";
import { PreferencesPanel } from "./PreferencesPanel.js";
import styles from "./NotificationsPage.module.css";

type Tab = "inbox" | "prefs";

/**
 * "Mis notificaciones" — bandeja IN-APP del usuario (campanita "ver todas") +
 * preferencias de aviso PROPIAS. Accesible a todo usuario autenticado (dato
 * personal, sin permiso de catálogo).
 */
export function MyNotificationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("inbox");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <Bell size={22} /> {t("notifications.myTitle")}
          </h1>
          <p className={styles.subtitle}>{t("notifications.mySubtitle")}</p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          className={tab === "inbox" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab("inbox")}
        >
          <Inbox size={16} /> {t("notifications.tabs.inbox")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "prefs"}
          className={tab === "prefs" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setTab("prefs")}
        >
          <SlidersHorizontal size={16} /> {t("notifications.tabs.prefs")}
        </button>
      </div>

      {tab === "inbox" ? (
        <InboxPanel />
      ) : (
        <div className={styles.panel}>
          <PreferencesPanel />
        </div>
      )}
    </div>
  );
}
