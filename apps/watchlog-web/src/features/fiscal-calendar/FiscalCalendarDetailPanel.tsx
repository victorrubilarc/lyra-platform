import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, CalendarRange, Network, Settings2, SlidersHorizontal, Star, Trash2 } from "lucide-react";
import { Button, Chip, Input, Modal, Select, Skeleton, Textarea, Toggle, cx, useToast } from "@lyra/ui";
import { PERIOD_KINDS, validateFiscalCalendar, type PeriodKind } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { AssignNodesModal } from "../operational-calendar/AssignNodesModal.js";
import { COMMON_TIMEZONES } from "../operational-calendar/timezones.js";
import { FiscalPeriodsSection } from "./FiscalPeriodsSection.js";
import { PeriodKindHelp } from "./PeriodKindHelp.js";
import {
  useAssignFiscalNodes,
  useDeleteFiscalCalendar,
  useFiscalCalendar,
  useSetDefaultFiscalCalendar,
  useUpdateFiscalCalendar,
} from "./fiscal-calendar-queries.js";
import styles from "../operational-calendar/OperationalCalendarPage.module.css";
import fx from "./FiscalCalendar.module.css";

type FiscalTab = "general" | "period" | "nodes" | "periods";

interface EditableState {
  name: string;
  description: string;
  timezone: string;
  active: boolean;
  periodKind: PeriodKind;
  periodAnchorDay: number;
  periodStartWeekday: number;
  periodLengthDays: number;
  periodAnchorDate: string;
  requirePeriod: boolean;
  assignedNodeIds: string[];
}

export function FiscalCalendarDetailPanel({ calendarId, onDeleted }: { calendarId: string | null; onDeleted: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("opscalendar:manage");

  const { data: cal, isLoading } = useFiscalCalendar(calendarId);
  const update = useUpdateFiscalCalendar();
  const assignNodes = useAssignFiscalNodes();
  const setDefault = useSetDefaultFiscalCalendar();
  const remove = useDeleteFiscalCalendar();

  const [state, setState] = useState<EditableState | null>(null);
  const [loaded, setLoaded] = useState<EditableState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tab, setTab] = useState<FiscalTab>("general");

  useEffect(() => {
    if (!cal) {
      setState(null);
      setLoaded(null);
      return;
    }
    const next: EditableState = {
      name: cal.name,
      description: cal.description ?? "",
      timezone: cal.timezone,
      active: cal.active,
      periodKind: cal.periodKind,
      periodAnchorDay: cal.periodAnchorDay ?? 1,
      periodStartWeekday: cal.periodStartWeekday ?? 1,
      periodLengthDays: cal.periodLengthDays ?? 14,
      periodAnchorDate: cal.periodAnchorDate ?? "",
      requirePeriod: cal.requirePeriod,
      assignedNodeIds: [...(cal.assignedNodeIds ?? [])].sort(),
    };
    setState(next);
    setLoaded(next);
  }, [cal]);

  const errors = useMemo(() => (state ? validateFiscalCalendar(state) : []), [state]);
  const calendarDirty = !!state && !!loaded && JSON.stringify({ ...state, assignedNodeIds: [] }) !== JSON.stringify({ ...loaded, assignedNodeIds: [] });
  const nodesDirty = !!state && !!loaded && state.assignedNodeIds.join("|") !== loaded.assignedNodeIds.join("|");
  const dirty = calendarDirty || nodesDirty;

  if (!calendarId) {
    return (
      <div className={styles.detailEmpty}>
        <CalendarRange size={40} />
        <p>{t("fiscalCal.selectPrompt")}</p>
      </div>
    );
  }
  if (isLoading || !state || !cal) {
    return (
      <div className={styles.detail}>
        <Skeleton height={32} width="40%" />
        <Skeleton height={120} width="100%" />
      </div>
    );
  }

  const set = <K extends keyof EditableState>(key: K, value: EditableState[K]) => setState((s) => (s ? { ...s, [key]: value } : s));

  const onSave = async () => {
    if (errors.length > 0) {
      toast.error(t("fiscalCal.fixErrors"));
      return;
    }
    try {
      if (calendarDirty) {
        await update.mutateAsync({
          id: cal.id,
          dto: {
            name: state.name,
            description: state.description.trim() || null,
            timezone: state.timezone,
            active: state.active,
            periodKind: state.periodKind,
            periodAnchorDay: state.periodKind === "MONTH" ? state.periodAnchorDay : null,
            periodStartWeekday: state.periodKind === "WEEK" ? state.periodStartWeekday : null,
            periodLengthDays: state.periodKind === "CUSTOM" ? state.periodLengthDays : null,
            periodAnchorDate: state.periodKind === "CUSTOM" ? state.periodAnchorDate : null,
            requirePeriod: state.requirePeriod,
          },
        });
      }
      if (nodesDirty) {
        await assignNodes.mutateAsync({ id: cal.id, dto: { orgNodeIds: state.assignedNodeIds } });
      }
      toast.success(t("fiscalCal.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(cal.id);
      toast.success(t("fiscalCal.deleted"));
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div>
          <h2 className={styles.detailTitle}>
            <CalendarRange size={20} /> {cal.name}
            {cal.isDefault && <Chip label={t("fiscalCal.default")} variant="info" size="sm" />}
            {!cal.active && <Chip label={t("fiscalCal.inactive")} variant="default" size="sm" />}
          </h2>
          <span className={styles.detailKey}>{cal.key}</span>
        </div>
        <Can perform="opscalendar:manage">
          <div style={{ display: "flex", gap: 8 }}>
            {!cal.isDefault && (
              <Button variant="secondary" leftIcon={<Star size={15} />} onClick={() => void setDefault.mutateAsync(cal.id)} loading={setDefault.isPending}>
                {t("fiscalCal.makeDefault")}
              </Button>
            )}
            <Button variant="primary" onClick={() => void onSave()} loading={update.isPending || assignNodes.isPending} disabled={!dirty}>
              {t("common.save")}
            </Button>
            {!cal.isDefault && (
              <Button variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
                {t("common.delete")}
              </Button>
            )}
          </div>
        </Can>
      </div>

      <div className={fx.tabLayout}>
        <nav className={fx.tabNav} aria-label={t("fiscalCal.tabs.aria")}>
          {([
            { id: "general", label: t("fiscalCal.tabs.general"), icon: <SlidersHorizontal size={16} /> },
            { id: "period", label: t("fiscalCal.tabs.period"), icon: <Settings2 size={16} /> },
            { id: "nodes", label: t("fiscalCal.tabs.nodes"), icon: <Network size={16} /> },
            { id: "periods", label: t("fiscalCal.tabs.periods"), icon: <CalendarDays size={16} /> },
          ] as const).map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={cx(fx.tabBtn, tab === tb.id && fx.tabBtnActive)}
              onClick={() => setTab(tb.id)}
              aria-current={tab === tb.id}
            >
              {tb.icon} {tb.label}
            </button>
          ))}
        </nav>

        <div className={fx.tabContent}>
          {tab === "general" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("fiscalCal.basics")}</h3>
              <div className={styles.fieldGrid}>
                <div className={fx.nameField}>
                  <label className={styles.fieldLabel}>{t("fiscalCal.name")}</label>
                  <Input value={state.name} onChange={(e) => set("name", e.target.value)} disabled={!canManage} />
                </div>
                <div>
                  <label className={styles.fieldLabel}>{t("fiscalCal.timezone")}</label>
                  <Select value={state.timezone} onChange={(e) => set("timezone", e.target.value)} disabled={!canManage}>
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </Select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.fieldLabel}>{t("fiscalCal.description")}</label>
                  <Textarea value={state.description} onChange={(e) => set("description", e.target.value)} rows={2} disabled={!canManage} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle checked={state.active} onChange={(v) => set("active", v)} disabled={!canManage} />
                  <span className={styles.fieldLabel} style={{ margin: 0 }}>{t("fiscalCal.active")}</span>
                </div>
              </div>
            </div>
          )}

          {tab === "period" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("fiscalCal.periodConfig")}</h3>
              <div className={styles.fieldGrid}>
                <div>
                  <label className={styles.fieldLabel}>{t("fiscalCal.periodKind")}</label>
                  <Select value={state.periodKind} onChange={(e) => set("periodKind", e.target.value as PeriodKind)} disabled={!canManage}>
                    {PERIOD_KINDS.map((k) => (
                      <option key={k} value={k}>{t(`fiscalCal.period.kind.${k}`)}</option>
                    ))}
                  </Select>
                </div>
                {state.periodKind === "MONTH" && (
                  <div>
                    <label className={styles.fieldLabel}>{t("fiscalCal.anchorDay")}</label>
                    <Input type="number" min={1} max={28} value={state.periodAnchorDay} onChange={(e) => set("periodAnchorDay", Number(e.target.value))} disabled={!canManage} />
                    <p className={styles.hint}>{t("fiscalCal.anchorDayHint")}</p>
                  </div>
                )}
                {state.periodKind === "WEEK" && (
                  <div>
                    <label className={styles.fieldLabel}>{t("fiscalCal.startWeekday")}</label>
                    <Select value={state.periodStartWeekday} onChange={(e) => set("periodStartWeekday", Number(e.target.value))} disabled={!canManage}>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>{t(`fiscalCal.weekday.${d}`)}</option>
                      ))}
                    </Select>
                  </div>
                )}
                {state.periodKind === "CUSTOM" && (
                  <>
                    <div>
                      <label className={styles.fieldLabel}>{t("fiscalCal.lengthDays")}</label>
                      <Input type="number" min={1} max={366} value={state.periodLengthDays} onChange={(e) => set("periodLengthDays", Number(e.target.value))} disabled={!canManage} />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>{t("fiscalCal.anchorDate")}</label>
                      <Input type="date" value={state.periodAnchorDate} onChange={(e) => set("periodAnchorDate", e.target.value)} disabled={!canManage} invalid={errors.some((x) => x.includes("ciclo"))} />
                    </div>
                  </>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle checked={state.requirePeriod} onChange={(v) => set("requirePeriod", v)} disabled={!canManage} />
                  <div>
                    <span className={styles.fieldLabel} style={{ margin: 0 }}>{t("fiscalCal.requirePeriod")}</span>
                    <p className={styles.hint}>{t("fiscalCal.requirePeriodHint")}</p>
                  </div>
                </div>
              </div>
              <PeriodKindHelp kind={state.periodKind} />
              {errors.length > 0 && <div className={styles.validation}>{errors.join(" ")}</div>}
            </div>
          )}

          {tab === "nodes" && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("fiscalCal.nodes")}</h3>
              <p className={styles.hint}>{t("fiscalCal.nodesHint")}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <Chip label={t("fiscalCal.nodeCount", { count: state.assignedNodeIds.length })} variant="default" size="sm" />
                {canManage && (
                  <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                    {t("fiscalCal.manageNodes")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {tab === "periods" && <FiscalPeriodsSection cal={cal} />}
        </div>
      </div>

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(false)}
          title={t("fiscalCal.deleteTitle")}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => void onDelete()} loading={remove.isPending}>
                {t("common.delete")}
              </Button>
            </div>
          }
        >
          <p>{t("fiscalCal.deleteConfirm", { name: cal.name })}</p>
        </Modal>
      )}

      {assignOpen && (
        <AssignNodesModal
          currentNodeIds={state.assignedNodeIds}
          onConfirm={(ids) => {
            set("assignedNodeIds", [...ids].sort());
            setAssignOpen(false);
          }}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
