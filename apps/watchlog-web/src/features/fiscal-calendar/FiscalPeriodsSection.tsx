import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Lock, LockOpen, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { Button, Chip, Input, Modal, Skeleton, Textarea, useToast } from "@lyra/ui";
import type { ChipProps } from "@lyra/ui";
import { PERIOD_REASON_MIN, type OperationalPeriodDto, type PeriodStatus } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import {
  useCloseFiscalPeriod,
  useFiscalPeriods,
  useGenerateFiscalPeriods,
  useLockFiscalPeriod,
  useReopenFiscalPeriod,
  useUnlockFiscalPeriod,
} from "./fiscal-calendar-queries.js";
import styles from "../operational-calendar/OperationalCalendarPage.module.css";

const STATUS_VARIANT: Record<PeriodStatus, ChipProps["variant"]> = {
  OPEN: "success",
  CLOSING: "warning",
  CLOSED: "warning",
  LOCKED: "error",
};

type Action = "close" | "reopen" | "lock" | "unlock";

interface DialogState {
  period: OperationalPeriodDto;
  action: Action;
}

export function FiscalPeriodsSection({ fiscalCalendarId }: { fiscalCalendarId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const can = {
    close: perms.can("opsperiod:close"),
    reopen: perms.can("opsperiod:reopen"),
    lock: perms.can("opsperiod:lock"),
    unlock: perms.can("opsperiod:unlock"),
    generate: perms.can("opscalendar:manage"),
  };

  const { data, isLoading } = useFiscalPeriods(fiscalCalendarId);
  const generateMut = useGenerateFiscalPeriods();
  const closeMut = useCloseFiscalPeriod();
  const reopenMut = useReopenFiscalPeriod();
  const lockMut = useLockFiscalPeriod();
  const unlockMut = useUnlockFiscalPeriod();

  const [year, setYear] = useState(new Date().getFullYear());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reason, setReason] = useState("");
  const [ackLaterClosed, setAckLaterClosed] = useState(false);

  // Agrupar por año (desc) preservando el orden del backend.
  const byYear = useMemo(() => {
    const groups = new Map<string, OperationalPeriodDto[]>();
    for (const p of data?.periods ?? []) {
      const y = p.periodStart.slice(0, 4);
      (groups.get(y) ?? groups.set(y, []).get(y)!).push(p);
    }
    return [...groups.entries()];
  }, [data]);

  if (!perms.can("opsperiod:view")) return null;

  const openDialog = (period: OperationalPeriodDto, action: Action) => {
    setDialog({ period, action });
    setReason("");
    setAckLaterClosed(false);
  };

  const pending = closeMut.isPending || reopenMut.isPending || lockMut.isPending || unlockMut.isPending;

  const submit = async () => {
    if (!dialog) return;
    const { period, action } = dialog;
    const base = { fiscalCalendarId, periodKey: period.periodKey };
    try {
      if (action === "close") await closeMut.mutateAsync({ ...base, dto: { reason } });
      else if (action === "reopen") await reopenMut.mutateAsync({ ...base, dto: { reason, acknowledgeLaterClosed: ackLaterClosed } });
      else if (action === "lock") await lockMut.mutateAsync({ ...base, dto: { reason } });
      else await unlockMut.mutateAsync({ ...base, dto: { reason } });
      toast.success(t(`fiscalCal.period.done.${action}`));
      setDialog(null);
    } catch (err) {
      // Secuencialidad inversa: posteriores CLOSED ⇒ el backend exige acuse.
      if (action === "reopen" && err instanceof ApiError && /posteriores ya cerrados|secuencia/i.test(err.message) && !ackLaterClosed) {
        setAckLaterClosed(true);
        toast.error(t("fiscalCal.period.ackNeeded"));
        return;
      }
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const runGenerate = async () => {
    try {
      await generateMut.mutateAsync({ fiscalCalendarId, dto: { year } });
      toast.success(t("fiscalCal.period.generated", { year }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const reasonInvalid = reason.trim().length < PERIOD_REASON_MIN;

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>
        <CalendarDays size={14} /> {t("fiscalCal.period.title")}
      </h3>
      <p className={styles.hint}>{t("fiscalCal.period.hint")}</p>

      {can.generate && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <label className={styles.fieldLabel}>{t("fiscalCal.period.year")}</label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </div>
          <Button variant="secondary" leftIcon={<Sparkles size={14} />} onClick={() => void runGenerate()} loading={generateMut.isPending}>
            {t("fiscalCal.period.generate")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton height={120} width="100%" />
      ) : byYear.length === 0 ? (
        <span className={styles.hint}>{t("fiscalCal.period.empty")}</span>
      ) : (
        byYear.map(([y, periods]) => (
          <div key={y} style={{ marginBottom: 14 }}>
            <div className={styles.fieldLabel} style={{ marginBottom: 4 }}>{y}</div>
            <div className={styles.periodList}>
              {periods.map((p) => (
                <div key={p.periodKey} className={styles.periodRow}>
                  <span className={styles.periodKey} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {p.periodKey}
                    {p.isCurrent && <Chip label={t("fiscalCal.period.current")} variant="info" size="sm" />}
                  </span>
                  <Chip label={t(`fiscalCal.period.status.${p.status}`)} variant={STATUS_VARIANT[p.status]} size="sm" />
                  <span className={styles.periodMeta}>
                    {p.status === "LOCKED" && p.lockedByName ? (
                      <span title={p.lockReason ?? undefined}>{t("fiscalCal.period.lockedBy", { name: p.lockedByName })}</span>
                    ) : (p.status === "CLOSED" || p.status === "CLOSING") && p.closedByName ? (
                      <span title={p.closeReason ?? undefined}>{t("fiscalCal.period.closedBy", { name: p.closedByName })}</span>
                    ) : p.status === "OPEN" && p.reopenedByName ? (
                      <span title={p.reopenReason ?? undefined}>{t("fiscalCal.period.reopenedBy", { name: p.reopenedByName })}</span>
                    ) : null}
                  </span>
                  <span className={styles.periodActions}>
                    {p.status === "OPEN" && can.close && (
                      <Button variant="secondary" leftIcon={<Lock size={14} />} onClick={() => openDialog(p, "close")}>
                        {t("fiscalCal.period.close")}
                      </Button>
                    )}
                    {(p.status === "CLOSED" || p.status === "CLOSING") && (
                      <>
                        {can.reopen && (
                          <Button variant="secondary" leftIcon={<LockOpen size={14} />} onClick={() => openDialog(p, "reopen")}>
                            {t("fiscalCal.period.reopen")}
                          </Button>
                        )}
                        {can.lock && (
                          <Button variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={() => openDialog(p, "lock")}>
                            {t("fiscalCal.period.lock")}
                          </Button>
                        )}
                      </>
                    )}
                    {p.status === "LOCKED" && can.unlock && (
                      <Button variant="secondary" leftIcon={<ShieldOff size={14} />} onClick={() => openDialog(p, "unlock")}>
                        {t("fiscalCal.period.unlock")}
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {dialog && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={t(`fiscalCal.period.dialog.${dialog.action}`, { key: dialog.period.periodKey })}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={dialog.action === "close" || dialog.action === "lock" ? "danger" : "primary"}
                onClick={() => void submit()}
                loading={pending}
                disabled={reasonInvalid}
              >
                {ackLaterClosed && dialog.action === "reopen"
                  ? t("fiscalCal.period.reopenAnyway")
                  : t(`fiscalCal.period.${dialog.action}`)}
              </Button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{t(`fiscalCal.period.desc.${dialog.action}`)}</p>
            {ackLaterClosed && dialog.action === "reopen" && (
              <p style={{ color: "var(--color-warning)", fontSize: 13 }}>{t("fiscalCal.period.ackWarning")}</p>
            )}
            <div>
              <label className={styles.fieldLabel}>{t("fiscalCal.period.reason")}</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t("fiscalCal.period.reasonPlaceholder")} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
