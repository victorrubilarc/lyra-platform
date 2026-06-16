import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { PreferencesPanel } from "./PreferencesPanel.js";
import styles from "./NotificationsPage.module.css";

/**
 * "Mis notificaciones" — preferencias de aviso PROPIAS, accesible a todo usuario
 * autenticado (dato personal, sin permiso de catálogo). Reusa `PreferencesPanel`.
 */
export function MyNotificationsPage() {
  const { t } = useTranslation();
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
      <div className={styles.panel}>
        <PreferencesPanel />
      </div>
    </div>
  );
}
