import { useTranslation } from "react-i18next";
import type { NotificationChannel, SetNotificationPreferenceRequest } from "@lyra/contracts";
import { Toggle, useToast } from "@lyra/ui";
import { useMyNotificationPreferences, useNotificationEvents, useSetMyNotificationPreference } from "./notifications-queries.js";
import styles from "./NotificationsPage.module.css";

/** Canales que el usuario puede silenciar por evento (correo + campanita in-app). */
const CHANNELS: { channel: NotificationChannel; labelKey: string }[] = [
  { channel: "EMAIL", labelKey: "notifications.prefs.channelEmail" },
  { channel: "INAPP", labelKey: "notifications.prefs.channelInApp" },
];

/**
 * Preferencias de notificación PROPIAS (opt-out por evento × CANAL). El digest está
 * diseñado pero diferido: el control es un interruptor IMMEDIATE↔OFF por canal. Ambos
 * canales vienen ON por defecto. Dato personal (ownership): cada quien gestiona los suyos.
 */
export function PreferencesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const events = useNotificationEvents();
  const prefs = useMyNotificationPreferences();
  const setPref = useSetMyNotificationPreference();

  const modeByKey = new Map((prefs.data ?? []).map((p) => [`${p.eventKey}|${p.channel}`, p.mode]));

  function toggle(eventKey: string, channel: NotificationChannel, on: boolean) {
    setPref.mutate(
      { eventKey, channel, mode: on ? "IMMEDIATE" : "OFF" } as SetNotificationPreferenceRequest,
      {
        onSuccess: () => toast.success(t("notifications.prefs.saved")),
        onError: () => toast.error(t("common.error")),
      },
    );
  }

  if (events.isLoading || prefs.isLoading) return <div className={styles.empty}>{t("common.loading")}</div>;

  return (
    <div className={styles.prefList}>
      <div className={styles.prefHeadRow}>
        <span />
        {CHANNELS.map((c) => (
          <span key={c.channel} className={styles.prefChannelHead}>{t(c.labelKey)}</span>
        ))}
      </div>
      {(events.data ?? []).map((ev) => (
        <div key={ev.key} className={styles.prefRow}>
          <div className={styles.prefInfo}>
            <span className={styles.prefName}>{t(ev.labelKey, ev.key)}</span>
            <span className={styles.prefDesc}>{ev.description}</span>
          </div>
          {CHANNELS.map((c) => {
            const on = (modeByKey.get(`${ev.key}|${c.channel}`) ?? "IMMEDIATE") !== "OFF";
            return (
              <div key={c.channel} className={styles.prefToggle}>
                <Toggle
                  checked={on}
                  onChange={(v) => toggle(ev.key, c.channel, v)}
                  aria-label={`${t(ev.labelKey, ev.key)} · ${t(c.labelKey)}`}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
