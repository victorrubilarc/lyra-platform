import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Lock, LockOpen, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { Button, Chip, Modal, Select, Table, Textarea, useToast } from "@lyra/ui";
import type { ChipProps, TableColumn } from "@lyra/ui";
import {
  PERIOD_REASON_MIN,
  addDaysToIso,
  enumeratePeriods,
  yearRange,
  type FiscalCalendarDto,
  type OperationalPeriodDto,
  type PeriodStatus,
} from "@lyra/contracts";
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
import fx from "./FiscalCalendar.module.css";

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

export function FiscalPeriodsSection({ cal }: { cal: FiscalCalendarDto }) {
  const fiscalCalendarId = cal.id;
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

  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [confirmGen, setConfirmGen] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reason, setReason] = useState("");
  const [ackLaterClosed, setAckLaterClosed] = useState(false);

  const periods = useMemo(() => data?.periods ?? [], [data]);

  // Años presentes (desc) para el filtro de la grilla.
  const years = useMemo(() => {
    const set = new Set(periods.map((p) => p.periodStart.slice(0, 4)));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [periods]);

  const [filterYear, setFilterYear] = useState<string | null>(null);
  // Año visible: el filtro elegido, o el del período Actual, o el más reciente.
  const activeYear = filterYear ?? periods.find((p) => p.isCurrent)?.periodStart.slice(0, 4) ?? years[0] ?? null;
  const visible = useMemo(
    () => (activeYear ? periods.filter((p) => p.periodStart.slice(0, 4) === activeYear) : periods),
    [periods, activeYear],
  );

  // Cuántos períodos materializaría la generación del año (para la confirmación).
  const genCount = useMemo(() => {
    const { fromDate, toDate } = yearRange(genYear);
    return enumeratePeriods(
      {
        periodKind: cal.periodKind,
        periodAnchorDay: cal.periodAnchorDay,
        periodStartWeekday: cal.periodStartWeekday,
        periodLengthDays: cal.periodLengthDays,
        periodAnchorDate: cal.periodAnchorDate,
      },
      fromDate,
      toDate,
    ).length;
  }, [cal, genYear]);

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
      await generateMut.mutateAsync({ fiscalCalendarId, dto: { year: genYear } });
      toast.success(t("fiscalCal.period.generated", { year: genYear }));
      setConfirmGen(false);
      setFilterYear(String(genYear));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const reasonInvalid = reason.trim().length < PERIOD_REASON_MIN;

  const actionsFor = (p: OperationalPeriodDto) => {
    if (p.status === "OPEN") return can.close ? [{ a: "close" as const, icon: <Lock size={14} />, label: t("fiscalCal.period.close") }] : [];
    if (p.status === "LOCKED") return can.unlock ? [{ a: "unlock" as const, icon: <ShieldOff size={14} />, label: t("fiscalCal.period.unlock") }] : [];
    // CLOSED / CLOSING
    const out: { a: Action; icon: React.ReactNode; label: string }[] = [];
    if (can.reopen) out.push({ a: "reopen", icon: <LockOpen size={14} />, label: t("fiscalCal.period.reopen") });
    if (can.lock) out.push({ a: "lock", icon: <ShieldCheck size={14} />, label: t("fiscalCal.period.lock") });
    return out;
  };

  const responsible = (p: OperationalPeriodDto) =>
    p.status === "LOCKED" && p.lockedByName
      ? { name: t("fiscalCal.period.lockedBy", { name: p.lockedByName }), reason: p.lockReason }
      : (p.status === "CLOSED" || p.status === "CLOSING") && p.closedByName
        ? { name: t("fiscalCal.period.closedBy", { name: p.closedByName }), reason: p.closeReason }
        : p.status === "OPEN" && p.reopenedByName
          ? { name: t("fiscalCal.period.reopenedBy", { name: p.reopenedByName }), reason: p.reopenReason }
          : null;

  const columns: TableColumn<OperationalPeriodDto>[] = [
    {
      key: "periodKey",
      header: t("fiscalCal.period.col.period"),
      render: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>
          {p.periodKey}
          {p.isCurrent && <Chip label={t("fiscalCal.period.current")} variant="info" size="sm" />}
        </span>
      ),
    },
    {
      key: "range",
      header: t("fiscalCal.period.col.range"),
      render: (p) => (
        <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          {p.periodStart} → {addDaysToIso(p.periodEnd, -1)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("fiscalCal.period.col.status"),
      render: (p) => <Chip label={t(`fiscalCal.period.status.${p.status}`)} variant={STATUS_VARIANT[p.status]} size="sm" />,
    },
    {
      key: "responsible",
      header: t("fiscalCal.period.col.responsible"),
      render: (p) => {
        const r = responsible(p);
        return r ? <span style={{ fontSize: 12, color: "var(--color-text-muted)" }} title={r.reason ?? undefined}>{r.name}</span> : <span style={{ color: "var(--color-text-muted)" }}>—</span>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          {actionsFor(p).map((act) => (
            <Button key={act.a} variant="secondary" leftIcon={act.icon} onClick={() => openDialog(p, act.a)}>
              {act.label}
            </Button>
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>
        <CalendarDays size={14} /> {t("fiscalCal.period.title")}
      </h3>
      <p className={styles.hint}>{t("fiscalCal.period.hint")}</p>

      <div className={fx.periodToolbar}>
        <div className={fx.periodToolbarGroup}>
          <div>
            <label className={styles.fieldLabel}>{t("fiscalCal.period.filterYear")}</label>
            <Select
              value={activeYear ?? ""}
              onChange={(e) => setFilterYear(e.target.value || null)}
              disabled={years.length === 0}
              style={{ width: 130 }}
            >
              {years.length === 0 && <option value="">—</option>}
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>
        </div>
        {can.generate && (
          <div className={fx.periodToolbarGroup}>
            <div>
              <label className={styles.fieldLabel}>{t("fiscalCal.period.year")}</label>
              <Select value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} style={{ width: 110 }}>
                {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" leftIcon={<Sparkles size={14} />} onClick={() => setConfirmGen(true)} loading={generateMut.isPending}>
              {t("fiscalCal.period.generate")}
            </Button>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        data={visible}
        rowKey={(p) => p.periodKey}
        loading={isLoading}
        emptyState={<span className={styles.hint}>{t("fiscalCal.period.empty")}</span>}
        paginated
        defaultPageSize={13}
        pageSizeOptions={[13, 26, 53]}
      />

      {/* Confirmación de generación */}
      {confirmGen && (
        <Modal
          open
          onClose={() => setConfirmGen(false)}
          title={t("fiscalCal.period.genTitle", { year: genYear })}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setConfirmGen(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" onClick={() => void runGenerate()} loading={generateMut.isPending}>
                {t("fiscalCal.period.generate")}
              </Button>
            </div>
          }
        >
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            {t("fiscalCal.period.genConfirm", { count: genCount, year: genYear })}
          </p>
          <p className={styles.hint}>{t("fiscalCal.period.genIdempotent")}</p>
        </Modal>
      )}

      {/* Acción sobre un período */}
      {dialog && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={t(`fiscalCal.period.dialog.${dialog.action}`, { key: dialog.period.periodKey })}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
              <Button
                variant={dialog.action === "close" || dialog.action === "lock" ? "danger" : "primary"}
                onClick={() => void submit()}
                loading={pending}
                disabled={reasonInvalid}
              >
                {ackLaterClosed && dialog.action === "reopen" ? t("fiscalCal.period.reopenAnyway") : t(`fiscalCal.period.${dialog.action}`)}
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
