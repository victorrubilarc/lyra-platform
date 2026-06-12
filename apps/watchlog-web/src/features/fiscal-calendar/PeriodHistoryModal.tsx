import { useTranslation } from "react-i18next";
import { History, Lock, LockOpen, ShieldCheck, ShieldOff } from "lucide-react";
import { Button, Chip, Modal, Skeleton } from "@lyra/ui";
import type { PeriodHistoryEntry } from "@lyra/contracts";
import { formatDateTime } from "../../lib/format.js";
import { usePeriodHistory } from "./fiscal-calendar-queries.js";
import fx from "./FiscalCalendar.module.css";

const ACTION_ICON: Record<string, React.ReactNode> = {
  "opsperiod.closed": <Lock size={15} />,
  "opsperiod.reopened": <LockOpen size={15} />,
  "opsperiod.locked": <ShieldCheck size={15} />,
  "opsperiod.unlocked": <ShieldOff size={15} />,
};

export function PeriodHistoryModal({
  fiscalCalendarId,
  periodKey,
  onClose,
}: {
  fiscalCalendarId: string;
  periodKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = usePeriodHistory(fiscalCalendarId, periodKey);
  const entries: PeriodHistoryEntry[] = data?.entries ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <History size={17} /> {t("fiscalCal.period.historyTitle", { key: periodKey })}
        </span>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>{t("common.close")}</Button>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton height={120} width="100%" />
      ) : entries.length === 0 ? (
        <p className={fx.helpBody}>{t("fiscalCal.period.historyEmpty")}</p>
      ) : (
        <ol className={fx.timeline}>
          {entries.map((e, i) => (
            <li key={i} className={fx.timelineItem}>
              <span className={fx.timelineIcon}>{ACTION_ICON[e.action] ?? <History size={15} />}</span>
              <div className={fx.timelineBody}>
                <div className={fx.timelineHead}>
                  <b>{t(`fiscalCal.period.historyAction.${e.action}`, { defaultValue: e.action })}</b>
                  {e.fromStatus && e.toStatus && (
                    <span className={fx.timelineStatus}>
                      {t(`fiscalCal.period.status.${e.fromStatus}`, { defaultValue: e.fromStatus })} →{" "}
                      {t(`fiscalCal.period.status.${e.toStatus}`, { defaultValue: e.toStatus })}
                    </span>
                  )}
                  {e.mfaVerified === true && (
                    <Chip label={t("fiscalCal.period.historyMfa")} variant="success" size="sm" />
                  )}
                  {e.mfaVerified === false && (
                    <Chip label={t("fiscalCal.period.historyNoMfa")} variant="default" size="sm" />
                  )}
                </div>
                <div className={fx.timelineMeta}>
                  {e.actorName ?? "—"} · {formatDateTime(e.occurredAt)}
                </div>
                {e.reason && <div className={fx.timelineReason}>“{e.reason}”</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
