import { useTranslation } from "react-i18next";
import type { SetNotificationPreferenceRequest } from "@lyra/contracts";
import { Toggle, useToast } from "@lyra/ui";
import { useMyNotificationPreferences, useNotificationEvents, useSetMyNotificationPreference } from "./notifications-queries.js";
import styles from "./NotificationsPage.module.css";

/**
 * Preferencias de notificación PROPIAS (opt-in/out por evento, canal correo). El
 * digest está diseñado pero diferido: el control es un interruptor IMMEDIATE↔OFF.
 * Dato personal (ownership): cualquier usuario gestiona las suyas.
 */
export function PreferencesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const events = useNotificationEvents();
  const prefs = useMyNotificationPreferences();
  const setPref = useSetMyNotificationPreference();

  const modeByEvent = new Map((prefs.data ?? []).map((p) => [p.eventKey, p.mode]));

  function toggle(eventKey: string, on: boolean) {
    setPref.mutate(
      { eventKey, channel: "EMAIL", mode: on ? "IMMEDIATE" : "OFF" } as SetNotificationPreferenceRequest,
      {
        onSuccess: () => toast.success(t("notifications.prefs.saved")),
        onError: () => toast.error(t("common.error")),
      },
    );
  }

  if (events.isLoading || prefs.isLoading) return <div className={styles.empty}>{t("common.loading")}</div>;

  return (
    <div className={styles.prefList}>
      {(events.data ?? []).map((ev) => {
        const on = (modeByEvent.get(ev.key) ?? "IMMEDIATE") !== "OFF";
        return (
          <div key={ev.key} className={styles.prefRow}>
            <div className={styles.prefInfo}>
              <span className={styles.prefName}>{t(ev.labelKey, ev.key)}</span>
              <span className={styles.prefDesc}>{ev.description}</span>
            </div>
            <Toggle checked={on} onChange={(v) => toggle(ev.key, v)} aria-label={t(ev.labelKey, ev.key)} />
          </div>
        );
      })}
    </div>
  );
}
