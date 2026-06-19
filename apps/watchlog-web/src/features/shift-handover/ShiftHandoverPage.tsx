import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  History,
  PenLine,
  Plus,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  Chip,
  Combobox,
  EmptyState,
  GridPager,
  Input,
  Select,
  Spinner,
  Textarea,
  Toggle,
  useToast,
} from "@lyra/ui";
import {
  HANDOVER_SECTIONS,
  type HandoverCockpit,
  type HandoverGeneralStatus,
  type HandoverSectionKey,
  type OrgNodeTree,
  type ShiftHandoverDetail,
  type ShiftHandoverStatus,
} from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { useOrgTree } from "../structure/structure-queries.js";
import { formatDateTime, formatLocalDate } from "../../lib/format.js";
import {
  useAcknowledgeHandover,
  useAddHandoverItem,
  useCompileHandover,
  useHandoverDetail,
  useHandovers,
  useSignOutHandover,
  useUpdateHandoverItem,
  useUpdateHandoverSummary,
} from "./shift-handover-queries.js";
import { HandoverReauthModal } from "./HandoverReauthModal.js";
import { GENERAL_STATUS_OPTIONS, HANDOVER_STATUS_META, SECTION_ICON } from "./shift-handover-presentation.js";
import styles from "./shift-handover.module.css";

function flatten(nodes: OrgNodeTree[], prefix = ""): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} › ${n.name}` : n.name;
    out.push({ value: n.id, label });
    if (n.children?.length) out.push(...flatten(n.children, label));
  }
  return out;
}

export function ShiftHandoverPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"cockpit" | "history">("cockpit");
  const [nodeId, setNodeId] = useState("");
  const [activeId, setActiveId] = useState<string | null>(params.get("handoverId"));

  const { data: tree = [] } = useOrgTree();
  const nodeOptions = useMemo(() => flatten(tree), [tree]);
  const compile = useCompileHandover();
  const toast = useToast();

  // Deep link desde la campanita / correo.
  useEffect(() => {
    const hid = params.get("handoverId");
    if (hid) {
      setActiveId(hid);
      setView("cockpit");
    }
  }, [params]);

  function doCompile(node: string) {
    setNodeId(node);
    if (!node) return;
    compile.mutate(
      { orgNodeId: node },
      {
        onSuccess: (d) => {
          setActiveId(d.id);
          setParams((p) => {
            p.set("handoverId", d.id);
            return p;
          });
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : t("handover.compileError")),
      },
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>
            {t("handover.title")} <span className={styles.gradient}>{t("handover.titleAccent")}</span>
          </h1>
          <p className={styles.pageSubtitle}>{t("handover.subtitle")}</p>
        </div>
        <div className={styles.viewToggle}>
          <button className={view === "cockpit" ? styles.toggleActive : styles.toggleBtn} onClick={() => setView("cockpit")}>
            <ArrowLeftRight size={15} /> {t("handover.tabCockpit")}
          </button>
          <button className={view === "history" ? styles.toggleActive : styles.toggleBtn} onClick={() => setView("history")}>
            <History size={15} /> {t("handover.tabHistory")}
          </button>
        </div>
      </header>

      {view === "cockpit" ? (
        <>
          <Card className={styles.scopeBar}>
            <div className={styles.scopePicker}>
              <ClipboardList size={16} className={styles.scopeIcon} />
              <Combobox
                options={nodeOptions}
                value={nodeId}
                onChange={doCompile}
                placeholder={t("handover.pickNode")}
              />
            </div>
            {compile.isPending && <Spinner />}
          </Card>
          {activeId ? (
            <CockpitView id={activeId} canCompile={can("shifthandover:compile")} canSign={can("shifthandover:sign")} canAck={can("shifthandover:acknowledge")} />
          ) : (
            <EmptyState
              icon={<ArrowLeftRight size={40} />}
              title={t("handover.emptyTitle")}
              description={t("handover.emptyDesc")}
            />
          )}
        </>
      ) : (
        <HistoryView
          onOpen={(id) => {
            setActiveId(id);
            setView("cockpit");
          }}
        />
      )}
    </div>
  );
}

// === Cockpit (maestro-detalle de 3 zonas) =====================================

function CockpitView({ id, canCompile, canSign, canAck }: { id: string; canCompile: boolean; canSign: boolean; canAck: boolean }) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useHandoverDetail(id);
  const [section, setSection] = useState<HandoverSectionKey>("INCIDENTS");

  if (isLoading || !detail) return <Spinner />;
  const c = detail.cockpit;

  return (
    <div className={styles.cockpit}>
      {/* IZQUIERDA: navegación por secciones */}
      <nav className={styles.sectionNav}>
        {HANDOVER_SECTIONS.map((s) => {
          const Icon = SECTION_ICON[s.key];
          const count = s.key === "PENDING" ? detail.items.filter((i) => i.status !== "CLOSED").length : c.counts[s.key] ?? 0;
          return (
            <button
              key={s.key}
              className={section === s.key ? styles.sectionItemActive : styles.sectionItem}
              onClick={() => setSection(s.key)}
            >
              <Icon size={17} />
              <span className={styles.sectionLabel}>{t(`handover.sections.${s.key.toLowerCase()}`)}</span>
              <span className={styles.sectionCount}>{count}</span>
            </button>
          );
        })}
      </nav>

      {/* CENTRO: contenido de la sección */}
      <div className={styles.sectionContent}>
        <SectionContent section={section} detail={detail} canEdit={canCompile && detail.status === "COMPILING"} />
      </div>

      {/* DERECHA: resumen + sign-off + baton compacta */}
      <SignOffPanel detail={detail} canCompile={canCompile} canSign={canSign} canAck={canAck} />
    </div>
  );
}

function StatusChip({ status }: { status: ShiftHandoverStatus }) {
  const { t } = useTranslation();
  const meta = HANDOVER_STATUS_META[status];
  return <Chip variant={meta.variant} label={t(meta.labelKey)} />;
}

function SectionContent({ section, detail, canEdit }: { section: HandoverSectionKey; detail: ShiftHandoverDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const c = detail.cockpit;

  if (section === "PENDING") return <BatonSection detail={detail} canEdit={canEdit} />;

  const rows = sectionRows(section, c);
  if (rows.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={32} />} title={t(`handover.sections.${section.toLowerCase()}`)} description={t("handover.sectionEmpty")} />;
  }
  return (
    <div className={styles.list}>
      <h2 className={styles.sectionHeading}>{t(`handover.sections.${section.toLowerCase()}`)} <span className={styles.headingCount}>{rows.length}</span></h2>
      {rows.map((r) => (
        <div key={r.key} className={styles.row}>
          <div className={styles.rowMain}>
            <div className={styles.rowTitle}>
              {r.flag && <span className={r.flag === "critical" ? styles.dotCrit : styles.dotWarn} />}
              {r.title}
            </div>
            {r.detail && <div className={styles.rowDetail}>{r.detail}</div>}
          </div>
          <div className={styles.rowMeta}>
            {r.badge && <Chip variant={r.badgeVariant ?? "default"} label={r.badge} />}
            {r.at && <span className={styles.rowAt}>{formatDateTime(r.at)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface RowVM {
  key: string;
  title: string;
  detail?: string | null;
  at?: string | null;
  badge?: string;
  badgeVariant?: "default" | "warning" | "error" | "success" | "info";
  flag?: "critical" | "warning";
}

function sectionRows(section: HandoverSectionKey, c: HandoverCockpit): RowVM[] {
  switch (section) {
    case "ENTRIES":
      return c.entries.map((e) => ({ key: e.id, title: `${e.folio} · ${e.templateName}`, detail: e.byName, at: e.at, badge: e.status }));
    case "EXCEPTIONS":
      return c.exceptions.map((e) => ({
        key: e.id,
        title: e.detail,
        detail: e.fieldLabel,
        at: e.at,
        badge: e.kind,
        badgeVariant: e.kind === "critical" ? "error" : e.kind === "warning" ? "warning" : "info",
        flag: e.kind === "critical" ? "critical" : undefined,
      }));
    case "INCIDENTS":
      return c.incidents.map((i) => ({
        key: i.id,
        title: `${i.folio} · ${i.title}`,
        detail: [i.typeName, i.stateName].filter(Boolean).join(" · "),
        badge: i.overdue ? "vencida" : i.critical ? "crítica" : `sev ${i.severity}`,
        badgeVariant: i.overdue ? "error" : i.critical ? "error" : "default",
        flag: i.critical ? "critical" : undefined,
      }));
    case "FOLLOWUP":
      return c.followups.map((f) => ({
        key: f.id,
        title: `${f.code} · ${f.title}`,
        detail: f.incidentFolio,
        at: f.dueAt,
        badge: f.overdue ? "vencido" : f.status,
        badgeVariant: f.overdue ? "error" : "warning",
        flag: f.overdue ? "warning" : undefined,
      }));
    case "ROUNDS":
      return c.rounds.map((r) => ({
        key: r.id,
        title: r.name,
        detail: r.templateName,
        at: r.scheduledFor,
        badge: r.status === "OVERDUE" ? "vencida" : r.status === "COMPLETED" ? "cumplida" : r.status,
        badgeVariant: r.status === "OVERDUE" ? "error" : r.status === "COMPLETED" ? "success" : "default",
      }));
    default:
      return [];
  }
}

// === Baton ====================================================================

function BatonSection({ detail, canEdit }: { detail: ShiftHandoverDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddHandoverItem(detail.id);
  const update = useUpdateHandoverItem(detail.id);
  const [title, setTitle] = useState("");
  const open = detail.items.filter((i) => i.status !== "CLOSED");
  const closed = detail.items.filter((i) => i.status === "CLOSED");

  function addItem() {
    if (title.trim().length < 3) return;
    add.mutate({ title: title.trim() }, { onSuccess: () => setTitle(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Error") });
  }

  return (
    <div className={styles.list}>
      <h2 className={styles.sectionHeading}>
        {t("handover.sections.pending")} <span className={styles.headingCount}>{open.length}</span>
      </h2>
      <p className={styles.batonHint}>{t("handover.batonHint")}</p>

      {canEdit && (
        <div className={styles.addItemRow}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("handover.addItemPlaceholder")} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <Button variant="secondary" onClick={addItem} disabled={title.trim().length < 3} loading={add.isPending}>
            <Plus size={15} /> {t("handover.addItem")}
          </Button>
        </div>
      )}

      {open.length === 0 && <EmptyState icon={<CheckCircle2 size={32} />} title={t("handover.noPending")} description={t("handover.noPendingDesc")} />}
      {open.map((i) => (
        <div key={i.id} className={styles.row}>
          <div className={styles.rowMain}>
            <div className={styles.rowTitle}>
              {i.status === "CARRIED" && <Chip variant="warning" label={t("handover.carried")} />}
              {i.title}
            </div>
            {i.detail && <div className={styles.rowDetail}>{i.detail}</div>}
          </div>
          <div className={styles.rowMeta}>
            <Chip variant="default" label={t(`handover.itemSource.${i.source.toLowerCase()}`)} />
            {canEdit && (
              <Button variant="icon" onClick={() => update.mutate({ itemId: i.id, dto: { status: "CLOSED" } })} title={t("handover.closeItem")}>
                <X size={14} />
              </Button>
            )}
          </div>
        </div>
      ))}

      {closed.length > 0 && <div className={styles.closedNote}>{t("handover.closedCount", { count: closed.length })}</div>}
    </div>
  );
}

// === Panel derecho: resumen + sign-off ========================================

function SignOffPanel({ detail, canCompile, canSign, canAck }: { detail: ShiftHandoverDetail; canCompile: boolean; canSign: boolean; canAck: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const updateSummary = useUpdateHandoverSummary(detail.id);
  const signOut = useSignOutHandover(detail.id);
  const acknowledge = useAcknowledgeHandover(detail.id);

  const [summary, setSummary] = useState(detail.summaryText ?? "");
  const [generalStatus, setGeneralStatus] = useState<HandoverGeneralStatus>(detail.generalStatus ?? "OPERATIONAL");
  const [signModal, setSignModal] = useState(false);
  const [ackModal, setAckModal] = useState(false);
  // Acuse del entrante
  const [readSummary, setReadSummary] = useState(false);
  const [reviewedItems, setReviewedItems] = useState(false);
  const [noObservations, setNoObservations] = useState(true);
  const [observations, setObservations] = useState("");

  useEffect(() => {
    setSummary(detail.summaryText ?? "");
    setGeneralStatus((detail.generalStatus as HandoverGeneralStatus | null) ?? "OPERATIONAL");
  }, [detail.id, detail.summaryText, detail.generalStatus]);

  const editable = detail.status === "COMPILING" && canCompile;
  const scope = detail.cockpit.scope;

  function persistSummary() {
    if (!editable) return;
    updateSummary.mutate({ summaryText: summary, generalStatus });
  }
  function regenerate() {
    updateSummary.mutate(
      { regenerate: true, generalStatus },
      { onSuccess: (d) => setSummary(d.summaryText ?? "") },
    );
  }
  function confirmSign(creds: { password: string; mfaCode?: string }) {
    signOut.mutate(
      { ...creds, generalStatus },
      {
        onSuccess: () => {
          setSignModal(false);
          toast.success(t("handover.signedOk"));
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : t("handover.signError")),
      },
    );
  }
  function confirmAck(creds: { password: string; mfaCode?: string }) {
    acknowledge.mutate(
      { password: creds.password, mfaCode: creds.mfaCode, readSummary: true, reviewedItems: true, noObservations, observations: observations.trim() || undefined },
      {
        onSuccess: () => {
          setAckModal(false);
          toast.success(t("handover.ackOk"));
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : t("handover.ackError")),
      },
    );
  }

  return (
    <aside className={styles.signoff}>
      {/* Encabezado del turno */}
      <div className={styles.turnCard}>
        <div className={styles.turnTop}>
          <span className={styles.handoverCode}>{detail.code}</span>
          <StatusChip status={detail.status} />
        </div>
        <div className={styles.turnFlow}>
          <span className={styles.shiftPill}>{scope.shiftLabel ?? scope.shiftCode ?? "—"}</span>
          <ArrowRight size={15} className={styles.flowArrow} />
          <span className={styles.shiftPill}>{scope.incomingShiftLabel ?? scope.incomingShiftCode ?? "—"}</span>
        </div>
        <div className={styles.turnMeta}>
          {scope.nodeName} · {formatLocalDate(scope.operationalDay)}
        </div>
        {detail.frozen && <div className={styles.frozenNote}>{t("handover.frozenNote")}</div>}
      </div>

      {/* Resumen (determinista, modo none) */}
      <div className={styles.summaryBlock}>
        <div className={styles.summaryHead}>
          <Sparkles size={14} /> {t("handover.summaryTitle")}
          <span className={styles.providerTag}>{t("handover.summaryNone")}</span>
        </div>
        {editable ? (
          <>
            <Select value={generalStatus} onChange={(e) => setGeneralStatus(e.target.value as HandoverGeneralStatus)} className={styles.statusSelect}>
              {GENERAL_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </Select>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={persistSummary} rows={7} placeholder={t("handover.summaryPlaceholder")} />
            <Button variant="secondary" onClick={regenerate} loading={updateSummary.isPending}>
              <Sparkles size={14} /> {t("handover.regenerate")}
            </Button>
          </>
        ) : (
          <p className={styles.summaryText}>{detail.summaryText || t("handover.noSummary")}</p>
        )}
      </div>

      {/* Sign-off saliente */}
      {detail.status === "COMPILING" && canSign && (
        <Button variant="primary" className={styles.signBtn} onClick={() => setSignModal(true)}>
          <PenLine size={16} /> {t("handover.signOut")}
        </Button>
      )}

      {detail.signOut.byName && (
        <div className={styles.signedCard}>
          <div className={styles.signedRow}>
            <PenLine size={14} /> {t("handover.deliveredBy")} <b>{detail.signOut.byName}</b>
          </div>
          {detail.signOut.at && <div className={styles.signedAt}>{formatDateTime(detail.signOut.at)}</div>}
          {detail.signOut.meaning && <div className={styles.signedMeaning}>{detail.signOut.meaning}</div>}
        </div>
      )}

      {/* Acuse entrante (sub-modo Recibo) */}
      {detail.status === "SIGNED_OUT" && detail.canAcknowledge && canAck && (
        <div className={styles.ackBlock}>
          <div className={styles.ackTitle}>
            <UserCheck size={15} /> {t("handover.receiveTitle")}
          </div>
          <label className={styles.ackCheck}>
            <Toggle checked={readSummary} onChange={setReadSummary} /> {t("handover.ackReadSummary")}
          </label>
          <label className={styles.ackCheck}>
            <Toggle checked={reviewedItems} onChange={setReviewedItems} /> {t("handover.ackReviewedItems")}
          </label>
          <label className={styles.ackCheck}>
            <Toggle checked={noObservations} onChange={setNoObservations} /> {t("handover.ackNoObservations")}
          </label>
          {!noObservations && (
            <Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} placeholder={t("handover.observationsPlaceholder")} />
          )}
          <Button variant="primary" className={styles.signBtn} disabled={!readSummary || !reviewedItems} onClick={() => setAckModal(true)}>
            <UserCheck size={16} /> {t("handover.acknowledge")}
          </Button>
        </div>
      )}

      {detail.acknowledgement.byName && (
        <div className={styles.signedCard}>
          <div className={styles.signedRow}>
            <UserCheck size={14} /> {t("handover.receivedBy")} <b>{detail.acknowledgement.byName}</b>
          </div>
          {detail.acknowledgement.at && <div className={styles.signedAt}>{formatDateTime(detail.acknowledgement.at)}</div>}
          {detail.ackState.observations && <div className={styles.signedMeaning}>“{detail.ackState.observations}”</div>}
        </div>
      )}

      {signModal && (
        <HandoverReauthModal
          title={t("handover.signOut")}
          meaning={t("handover.signMeaning")}
          confirmLabel={t("handover.signAndDeliver")}
          loading={signOut.isPending}
          onConfirm={confirmSign}
          onClose={() => setSignModal(false)}
        />
      )}
      {ackModal && (
        <HandoverReauthModal
          title={t("handover.acknowledge")}
          meaning={t("handover.ackMeaning")}
          confirmLabel={t("handover.confirmReceipt")}
          loading={acknowledge.isPending}
          onConfirm={confirmAck}
          onClose={() => setAckModal(false)}
        />
      )}
    </aside>
  );
}

// === Historial ================================================================

function HistoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, isLoading } = useHandovers({
    page,
    pageSize,
    search: search || undefined,
    status: (status || undefined) as never,
  });

  const pager = data ? (
    <GridPager
      page={page}
      pages={Math.max(1, Math.ceil(data.total / pageSize))}
      total={data.total}
      pageSize={pageSize}
      onPage={setPage}
      onPageSize={() => undefined}
    />
  ) : null;

  return (
    <Card className={styles.historyCard}>
      <div className={styles.filters}>
        <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder={t("handover.searchPlaceholder")} className={styles.searchInput} />
        <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">{t("handover.allStatuses")}</option>
          {(["COMPILING", "SIGNED_OUT", "ACKNOWLEDGED", "CANCELED"] as ShiftHandoverStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(HANDOVER_STATUS_META[s].labelKey)}
            </option>
          ))}
        </Select>
      </div>
      {pager}
      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<History size={36} />} title={t("handover.historyEmpty")} description={t("handover.historyEmptyDesc")} />
      ) : (
        <div className={styles.historyList}>
          {data.items.map((h) => (
            <button key={h.id} className={styles.historyRow} onClick={() => onOpen(h.id)}>
              <span className={styles.histCode}>{h.code}</span>
              <span className={styles.histNode}>{h.nodeName}</span>
              <span className={styles.histShift}>{h.shiftLabel ?? h.shiftCode ?? "—"}</span>
              <span className={styles.histDay}>{formatLocalDate(h.operationalDay)}</span>
              <span className={styles.histFlow}>
                {h.outgoingByName ?? "—"} <ArrowRight size={13} /> {h.incomingByName ?? "—"}
              </span>
              {h.openItemCount > 0 && <Chip variant="warning" label={t("handover.openItems", { count: h.openItemCount })} />}
              <StatusChip status={h.status} />
            </button>
          ))}
        </div>
      )}
      {pager}
    </Card>
  );
}
