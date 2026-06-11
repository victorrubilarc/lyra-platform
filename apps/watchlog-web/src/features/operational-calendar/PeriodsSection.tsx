import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Lock, LockOpen } from "lucide-react";
import { Button, Chip, Modal, Select, Skeleton, Textarea, useToast } from "@lyra/ui";
import type { ChipProps } from "@lyra/ui";
import { PERIOD_REASON_MIN, type ClosedPeriodStatus, type OperationalPeriodDto, type PeriodStatus } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { useClosePeriod, useOperationalPeriods, useReopenPeriod } from "./operational-periods-queries.js";
import styles from "./OperationalCalendarPage.module.css";

const STATUS_VARIANT: Record<PeriodStatus, ChipProps["variant"]> = {
  OPEN: "success",
  CLOSING: "warning",
  CLOSED: "error",
};

interface DialogState {
  period: OperationalPeriodDto;
  mode: "close" | "reopen";
}

export function PeriodsSection({ calendarId }: { calendarId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canClose = perms.can("opsperiod:close");
  const canReopen = perms.can("opsperiod:reopen");

  const { data, isLoading } = useOperationalPeriods(calendarId);
  const closeMut = useClosePeriod();
  const reopenMut = useReopenPeriod();

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [targetStatus, setTargetStatus] = useState<ClosedPeriodStatus>("CLOSED");
  const [reason, setReason] = useState("");

  if (!perms.can("opsperiod:view")) return null;

  const openDialog = (period: OperationalPeriodDto, mode: "close" | "reopen") => {
    setDialog({ period, mode });
    setTargetStatus(period.status === "CLOSING" ? "CLOSING" : "CLOSED");
    setReason("");
  };

  const submit = async () => {
    if (!dialog) return;
    const { period, mode } = dialog;
    try {
      if (mode === "close") {
        await closeMut.mutateAsync({ calendarId, periodKey: period.periodKey, dto: { status: targetStatus, reason } });
        toast.success(t("opsPeriod.closed"));
      } else {
        await reopenMut.mutateAsync({ calendarId, periodKey: period.periodKey, dto: { reason } });
        toast.success(t("opsPeriod.reopened"));
      }
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const periods = data?.periods ?? [];
  const reasonInvalid = reason.trim().length < PERIOD_REASON_MIN;

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>
        <CalendarDays size={14} /> {t("opsPeriod.title")}
      </h3>
      <p className={styles.hint}>{t("opsPeriod.hint")}</p>

      {isLoading ? (
        <Skeleton height={120} width="100%" />
      ) : periods.length === 0 ? (
        <span className={styles.hint}>{t("opsPeriod.empty")}</span>
      ) : (
        <div className={styles.periodList}>
          {periods.map((p) => (
            <div key={p.periodKey} className={styles.periodRow}>
              <span className={styles.periodKey}>{p.periodKey}</span>
              <Chip label={t(`opsPeriod.status.${p.status}`)} variant={STATUS_VARIANT[p.status]} size="sm" />
              <span className={styles.periodMeta}>
                {p.status !== "OPEN" && p.closedByName ? (
                  <span title={p.closeReason ?? undefined}>
                    {t("opsPeriod.closedBy", { name: p.closedByName })}
                  </span>
                ) : p.status === "OPEN" && p.reopenedByName ? (
                  <span title={p.reopenReason ?? undefined}>
                    {t("opsPeriod.reopenedBy", { name: p.reopenedByName })}
                  </span>
                ) : null}
              </span>
              <span className={styles.periodActions}>
                {p.status === "OPEN"
                  ? canClose && (
                      <Button variant="secondary" leftIcon={<Lock size={14} />} onClick={() => openDialog(p, "close")}>
                        {t("opsPeriod.close")}
                      </Button>
                    )
                  : canReopen && (
                      <Button variant="secondary" leftIcon={<LockOpen size={14} />} onClick={() => openDialog(p, "reopen")}>
                        {t("opsPeriod.reopen")}
                      </Button>
                    )}
              </span>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={dialog.mode === "close" ? t("opsPeriod.closeTitle", { key: dialog.period.periodKey }) : t("opsPeriod.reopenTitle", { key: dialog.period.periodKey })}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={dialog.mode === "close" ? "danger" : "primary"}
                onClick={() => void submit()}
                loading={closeMut.isPending || reopenMut.isPending}
                disabled={reasonInvalid}
              >
                {dialog.mode === "close" ? t("opsPeriod.close") : t("opsPeriod.reopen")}
              </Button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
              {dialog.mode === "close" ? t("opsPeriod.closeDesc") : t("opsPeriod.reopenDesc")}
            </p>
            {dialog.mode === "close" && (
              <div>
                <label className={styles.fieldLabel}>{t("opsPeriod.targetStatus")}</label>
                <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as ClosedPeriodStatus)}>
                  <option value="CLOSED">{t("opsPeriod.status.CLOSED")}</option>
                  <option value="CLOSING">{t("opsPeriod.status.CLOSING")}</option>
                </Select>
                <p className={styles.hint}>
                  {targetStatus === "CLOSING" ? t("opsPeriod.closingHint") : t("opsPeriod.closedHint")}
                </p>
              </div>
            )}
            <div>
              <label className={styles.fieldLabel}>{t("opsPeriod.reason")}</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t("opsPeriod.reasonPlaceholder")}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
