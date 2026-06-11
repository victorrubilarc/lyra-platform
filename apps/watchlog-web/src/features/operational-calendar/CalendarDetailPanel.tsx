import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, FlaskConical, Plus, Star, Trash2, X } from "lucide-react";
import { Button, Chip, Input, Modal, Select, Skeleton, Toggle, useToast } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import {
  resolveShift,
  validateOperationalCalendar,
  type OperationalShiftInput,
  type ShiftResolution,
} from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { AssignNodesModal } from "./AssignNodesModal.js";
import { useOrgTree } from "../structure/structure-queries.js";
import {
  useAssignCalendarNodes,
  useDeleteCalendar,
  useOperationalCalendar,
  useSetDefaultCalendar,
  useUpdateCalendar,
} from "./operational-calendar-queries.js";
import styles from "./OperationalCalendarPage.module.css";

const SHIFT_COLORS = ["#6366F1", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444", "#84CC16", "#A855F7", "#EC4899"];

interface EditableState {
  name: string;
  description: string;
  timezone: string;
  active: boolean;
  shifts: OperationalShiftInput[];
  dayStartShiftCode: string;
  assignedNodeIds: string[];
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHHMM(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Hora de fin de pared a partir de inicio + duración (con cruce de medianoche). */
function endTimeOf(startTime: string, durationMinutes: number): string {
  return toHHMM(minutesOfDay(startTime) + durationMinutes);
}

/** Duración (min) a partir de inicio→fin; fin ≤ inicio cruza medianoche; igual = 24 h. */
function durationFromTimes(startTime: string, endTime: string): number {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  const diff = end - start;
  return diff <= 0 ? diff + 1440 : diff;
}

/** Lectura amigable de una duración en minutos: "8 h" / "7 h 30 min" / "45 min". */
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Hora de pared ACTUAL de una TZ como "YYYY-MM-DDTHH:MM" (para el botón "Ahora"). */
function nowInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")}T${hour}:${g("minute")}`;
}

/** Offset (ms) de una TZ IANA en un instante dado. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value])) as Record<string, string>;
  let hour = Number(p.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return asUtc - instant.getTime();
}

/** Convierte una hora de pared del SITIO ("YYYY-MM-DDTHH:MM") a un instante UTC. */
function siteWallClockToUtc(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, min] = m.map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, min!);
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

interface NodeInfo {
  name: string;
  path: string;
}

/** Aplana el árbol a id → {nombre, ruta de ancestros} para etiquetar los nodos asignados. */
function flattenNodeInfo(nodes: OrgNodeTree[], ancestors: string[], map: Map<string, NodeInfo>): void {
  for (const n of nodes) {
    map.set(n.id, { name: n.name, path: ancestors.join(" / ") });
    flattenNodeInfo(n.children, [...ancestors, n.name], map);
  }
}

interface CalendarDetailPanelProps {
  calendarId: string | null;
  onDeleted: () => void;
}

export function CalendarDetailPanel({ calendarId, onDeleted }: CalendarDetailPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("opscalendar:manage");

  const { data: cal, isLoading } = useOperationalCalendar(calendarId);
  const { data: tree = [] } = useOrgTree();
  const update = useUpdateCalendar();
  const setDefault = useSetDefaultCalendar();
  const remove = useDeleteCalendar();
  const assignNodes = useAssignCalendarNodes();

  const nodeInfo = useMemo(() => {
    const map = new Map<string, NodeInfo>();
    flattenNodeInfo(tree, [], map);
    return map;
  }, [tree]);

  const [state, setState] = useState<EditableState | null>(null);
  const [loaded, setLoaded] = useState<EditableState | null>(null);
  const [testAt, setTestAt] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

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
      shifts: cal.shifts.map((s) => ({ code: s.code, label: s.label, startTime: s.startTime, durationMinutes: s.durationMinutes })),
      dayStartShiftCode: cal.dayStartShiftCode ?? "",
      assignedNodeIds: [...(cal.assignedNodeIds ?? [])].sort(),
    };
    setState(next);
    setLoaded(next);
  }, [cal]);

  const errors = useMemo(() => (state ? validateOperationalCalendar(state) : []), [state]);
  // Dos "dirty" separados: el calendario (PATCH) y los nodos asignados (endpoint propio).
  // El botón Guardar se habilita con cualquiera de los dos; onSave llama solo lo que cambió.
  const calendarDirty = !!state && !!loaded && JSON.stringify({ ...state, assignedNodeIds: [] }) !== JSON.stringify({ ...loaded, assignedNodeIds: [] });
  const nodesDirty = !!state && !!loaded && state.assignedNodeIds.join("|") !== loaded.assignedNodeIds.join("|");
  const dirty = calendarDirty || nodesDirty;

  const preview: ShiftResolution | null = useMemo(() => {
    if (!state || errors.length > 0 || !testAt) return null;
    const at = siteWallClockToUtc(testAt, state.timezone);
    if (!at || Number.isNaN(at.getTime())) return null;
    return resolveShift(at, {
      timezone: state.timezone,
      shifts: state.shifts,
      dayStartShiftCode: state.dayStartShiftCode || null,
    });
  }, [state, errors, testAt]);

  if (!calendarId) {
    return (
      <div className={styles.detailEmpty}>
        <CalendarClock size={40} />
        <p>{t("opsCalendar.selectPrompt")}</p>
      </div>
    );
  }
  if (isLoading || !state || !cal) {
    return (
      <div className={styles.detail}>
        <Skeleton height={32} width="40%" />
        <Skeleton height={120} width="100%" />
        <Skeleton height={120} width="100%" />
      </div>
    );
  }

  const set = <K extends keyof EditableState>(key: K, value: EditableState[K]) => setState((s) => (s ? { ...s, [key]: value } : s));

  const setShift = (i: number, patch: Partial<OperationalShiftInput>) =>
    setState((s) => (s ? { ...s, shifts: s.shifts.map((sh, idx) => (idx === i ? { ...sh, ...patch } : sh)) } : s));

  const addShift = () =>
    setState((s) => (s ? { ...s, shifts: [...s.shifts, { code: "", label: "", startTime: "08:00", durationMinutes: 480 }] } : s));

  const removeShift = (i: number) =>
    setState((s) => {
      if (!s) return s;
      const removed = s.shifts[i];
      const shifts = s.shifts.filter((_, idx) => idx !== i);
      const dayStartShiftCode = removed?.code === s.dayStartShiftCode ? "" : s.dayStartShiftCode;
      return { ...s, shifts, dayStartShiftCode };
    });

  const onSave = async () => {
    if (errors.length > 0) {
      toast.error(t("opsCalendar.fixErrors"));
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
            dayStartShiftCode: state.dayStartShiftCode || null,
            shifts: state.shifts,
          },
        });
      }
      if (nodesDirty) {
        await assignNodes.mutateAsync({ id: cal.id, dto: { orgNodeIds: state.assignedNodeIds } });
      }
      toast.success(t("opsCalendar.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(cal.id);
      toast.success(t("opsCalendar.deleted"));
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  // Quita un nodo de la selección LOCAL (se persiste al Guardar, junto al resto).
  const onRemoveNode = (nodeId: string) =>
    set("assignedNodeIds", state.assignedNodeIds.filter((x) => x !== nodeId));

  return (
    <div className={styles.detail}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderInfo}>
          <h2 className={styles.detailName}>
            {cal.name}
            {cal.isDefault && <Chip label={t("opsCalendar.default")} variant="info" size="sm" />}
          </h2>
          <span className={styles.detailKey}>{cal.key}</span>
        </div>
        {canManage && (
          <div className={styles.detailActions}>
            {!cal.isDefault && (
              <Button variant="secondary" leftIcon={<Star size={15} />} onClick={() => void setDefault.mutate(cal.id)} loading={setDefault.isPending}>
                {t("opsCalendar.makeDefault")}
              </Button>
            )}
            <Button variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)} disabled={cal.isDefault}>
              {t("common.delete")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void onSave()}
              loading={update.isPending || assignNodes.isPending}
              disabled={!dirty || errors.length > 0}
            >
              {t("common.save")}
            </Button>
          </div>
        )}
      </div>

      <div className={styles.detailBody}>
      {/* General */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("opsCalendar.general")}</h3>
        <div className={styles.fieldGrid}>
          <div>
            <label className={styles.fieldLabel}>{t("opsCalendar.name")}</label>
            <Input value={state.name} onChange={(e) => set("name", e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <label className={styles.fieldLabel}>{t("opsCalendar.timezone")}</label>
            <Input value={state.timezone} onChange={(e) => set("timezone", e.target.value)} mono disabled={!canManage} invalid={errors.some((x) => x.includes("Zona"))} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "end", minHeight: 38 }}>
            <Toggle checked={state.active} onChange={(v) => set("active", v)} disabled={!canManage} aria-label={t("opsCalendar.activeToggle")} />
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("opsCalendar.activeToggle")}</span>
          </div>
        </div>
        <div>
          <label className={styles.fieldLabel}>{t("opsCalendar.description")}</label>
          <Input value={state.description} onChange={(e) => set("description", e.target.value)} disabled={!canManage} placeholder={t("opsCalendar.descriptionPlaceholder")} />
        </div>
      </div>

      {/* Turnos */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("opsCalendar.shifts")}</h3>
        <p className={styles.hint}>{t("opsCalendar.shiftsHint")}</p>

        {state.shifts.length > 0 && <ShiftTimeline shifts={state.shifts} dayStartShiftCode={state.dayStartShiftCode} />}

        {state.shifts.map((sh, i) => (
          <div className={styles.shiftRow} key={i}>
            <div>
              {i === 0 && <label className={styles.fieldLabel}>{t("opsCalendar.shiftCode")}</label>}
              <Input value={sh.code} onChange={(e) => setShift(i, { code: e.target.value })} placeholder="A" mono disabled={!canManage} />
            </div>
            <div>
              {i === 0 && <label className={styles.fieldLabel}>{t("opsCalendar.shiftLabel")}</label>}
              <Input value={sh.label} onChange={(e) => setShift(i, { label: e.target.value })} placeholder={t("opsCalendar.shiftLabelPlaceholder")} disabled={!canManage} />
            </div>
            <div>
              {i === 0 && <label className={styles.fieldLabel}>{t("opsCalendar.shiftStart")}</label>}
              <Input type="time" value={sh.startTime} onChange={(e) => setShift(i, { startTime: e.target.value })} disabled={!canManage} />
            </div>
            <div>
              {i === 0 && <label className={styles.fieldLabel}>{t("opsCalendar.shiftEnd")}</label>}
              <Input
                type="time"
                value={endTimeOf(sh.startTime, sh.durationMinutes)}
                onChange={(e) => e.target.value && setShift(i, { durationMinutes: durationFromTimes(sh.startTime, e.target.value) })}
                disabled={!canManage}
              />
            </div>
            <div className={styles.durReadout}>{formatDuration(sh.durationMinutes)}</div>
            <div style={{ alignSelf: i === 0 ? "end" : "center" }}>
              {canManage && (
                <Button variant="icon" aria-label={t("common.delete")} onClick={() => removeShift(i)}>
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          </div>
        ))}

        {canManage && (
          <div>
            <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={addShift}>
              {t("opsCalendar.addShift")}
            </Button>
          </div>
        )}

        {errors.length > 0 ? (
          <div className={`${styles.validation} ${styles.validationErr}`}>
            {errors.map((e, i) => (
              <span key={i}>• {e}</span>
            ))}
          </div>
        ) : state.shifts.length > 0 ? (
          <div className={`${styles.validation} ${styles.validationOk}`}>{t("opsCalendar.valid")}</div>
        ) : null}
      </div>

      {/* Día operacional */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("opsCalendar.dayAnchorTitle")}</h3>
        <div className={styles.fieldGrid}>
          <div>
            <label className={styles.fieldLabel}>{t("opsCalendar.dayAnchor")}</label>
            <Select value={state.dayStartShiftCode} onChange={(e) => set("dayStartShiftCode", e.target.value)} disabled={!canManage}>
              <option value="">{t("opsCalendar.civilDay")}</option>
              {state.shifts.filter((s) => s.code).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.label || s.startTime}
                </option>
              ))}
            </Select>
            <p className={styles.hint}>{t("opsCalendar.dayAnchorHint")}</p>
          </div>
        </div>
        <p className={styles.hint}>{t("opsCalendar.periodMovedHint")}</p>
      </div>

      {/* Probador */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FlaskConical size={14} /> {t("opsCalendar.tester")}
        </h3>
        <div className={styles.tester}>
          <p className={styles.hint}>{t("opsCalendar.testerHint", { tz: state.timezone })}</p>
          <div className={styles.testerRow}>
            <input type="datetime-local" className={styles.dtInput} value={testAt} onChange={(e) => setTestAt(e.target.value)} aria-label={t("opsCalendar.tester")} />
            <Button variant="secondary" onClick={() => setTestAt(nowInTz(state.timezone))}>
              {t("opsCalendar.testerNow")}
            </Button>
          </div>
          {testAt && (
            <div className={styles.testerResult}>
              <div className={styles.testerCard}>
                <span className={styles.testerLabel}>{t("opsCalendar.resOperationalDate")}</span>
                <span className={styles.testerValue}>{preview ? preview.operationalDate : "—"}</span>
              </div>
              <div className={styles.testerCard}>
                <span className={styles.testerLabel}>{t("opsCalendar.resShift")}</span>
                <span className={preview?.shiftCode ? styles.testerValue : styles.testerValueMuted}>
                  {preview ? (preview.shiftCode ? `${preview.shiftCode} · ${preview.shiftLabel ?? ""}` : t("opsCalendar.noShift")) : "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nodos asignados */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("opsCalendar.assignedNodes")}</h3>
        <p className={styles.hint}>{t("opsCalendar.assignedNodesHint")}</p>
        <div className={styles.nodeChips}>
          {state.assignedNodeIds.length === 0 ? (
            <span className={styles.hint}>{t("opsCalendar.noNodes")}</span>
          ) : (
            state.assignedNodeIds.map((id) => {
              const info = nodeInfo.get(id);
              return (
                <span key={id} className={styles.nodeToken}>
                  {info?.path && <span className={styles.nodeTokenPath}>{info.path} /</span>}
                  <span>{info?.name ?? id}</span>
                  {canManage && (
                    <button
                      type="button"
                      className={styles.nodeTokenRemove}
                      onClick={() => onRemoveNode(id)}
                      aria-label={t("opsCalendar.removeNode", { name: info?.name ?? id })}
                    >
                      <X size={13} />
                    </button>
                  )}
                </span>
              );
            })
          )}
        </div>
        <Can perform="opscalendar:manage">
          <div>
            <Button variant="secondary" onClick={() => setAssignOpen(true)}>
              {t("opsCalendar.manageNodes")}
            </Button>
          </div>
        </Can>
      </div>
      </div>

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(false)}
          title={t("opsCalendar.deleteTitle")}
          footer={
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => void onDelete()} loading={remove.isPending} leftIcon={<Trash2 size={15} />}>
                {t("common.delete")}
              </Button>
            </div>
          }
        >
          <p style={{ color: "var(--color-text-secondary)" }}>{t("opsCalendar.deleteConfirm", { name: cal.name })}</p>
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

/** Visualización de la cobertura de turnos en 24 h (con marcador del ancla). */
function ShiftTimeline({ shifts, dayStartShiftCode }: { shifts: OperationalShiftInput[]; dayStartShiftCode: string }) {
  const { t } = useTranslation();
  const segments = shifts.flatMap((s, i) => {
    if (!s.startTime || !s.durationMinutes) return [];
    const start = minutesOfDay(s.startTime);
    const end = start + s.durationMinutes;
    const color = SHIFT_COLORS[i % SHIFT_COLORS.length]!;
    const parts: { left: number; width: number; code: string; color: string }[] = [];
    parts.push({ left: (start / 1440) * 100, width: (Math.min(s.durationMinutes, 1440 - start) / 1440) * 100, code: s.code, color });
    if (end > 1440) parts.push({ left: 0, width: ((end - 1440) / 1440) * 100, code: s.code, color });
    return parts;
  });
  const anchor = shifts.find((s) => s.code === dayStartShiftCode);
  const anchorLeft = anchor ? (minutesOfDay(anchor.startTime) / 1440) * 100 : null;

  return (
    <div>
      <div className={styles.timeline} role="img" aria-label={t("opsCalendar.timelineAria")}>
        {segments.map((seg, i) => (
          <div key={i} className={styles.timelineSeg} style={{ left: `${seg.left}%`, width: `${seg.width}%`, background: seg.color }}>
            {seg.width > 6 ? seg.code : ""}
          </div>
        ))}
        {anchorLeft !== null && <div className={styles.timelineAnchor} style={{ left: `${anchorLeft}%` }} title={t("opsCalendar.dayAnchor")} />}
      </div>
      <div className={styles.timelineAxis}>
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}
