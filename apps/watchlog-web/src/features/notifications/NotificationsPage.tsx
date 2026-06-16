import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Inbox, FileText, SlidersHorizontal, RefreshCw, Search, Send, Eye, ArrowLeft, Monitor, Smartphone, Pencil } from "lucide-react";
import { Button, Card, GridPager, Input, Modal, Select, Textarea, Toggle, useToast } from "@lyra/ui";
import { renderTemplate, sampleContextForEvent, type NotificationOutboxStatus, type NotificationTemplateDto } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import {
  useNotificationEvents,
  useNotificationOutbox,
  useNotificationTemplates,
  useRetryNotificationOutbox,
  useUpdateNotificationTemplate,
} from "./notifications-queries.js";
import { fetchNotificationOutboxDetail } from "./notifications-api.js";
import { PreferencesPanel } from "./PreferencesPanel.js";
import styles from "./NotificationsPage.module.css";

type Tab = "outbox" | "templates" | "prefs";

export function NotificationsPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canOutbox = perms.can("notification:view-outbox");
  const canTemplates = perms.can("notiftemplate:manage");
  const [tab, setTab] = useState<Tab>(canOutbox ? "outbox" : canTemplates ? "templates" : "prefs");

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <Bell size={22} /> {t("notifications.title")}
          </h1>
          <p className={styles.subtitle}>{t("notifications.subtitle")}</p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        <Can perform="notification:view-outbox">
          <TabButton active={tab === "outbox"} onClick={() => setTab("outbox")} icon={<Inbox size={16} />}>
            {t("notifications.tabs.outbox")}
          </TabButton>
        </Can>
        <Can perform="notiftemplate:manage">
          <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<FileText size={16} />}>
            {t("notifications.tabs.templates")}
          </TabButton>
        </Can>
        <TabButton active={tab === "prefs"} onClick={() => setTab("prefs")} icon={<SlidersHorizontal size={16} />}>
          {t("notifications.tabs.prefs")}
        </TabButton>
      </div>

      {tab === "outbox" && canOutbox && <OutboxPanel />}
      {tab === "templates" && canTemplates && <TemplatesPanel />}
      {tab === "prefs" && (
        <div className={styles.panel}>
          <PreferencesPanel />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

// --- Bandeja de salida -------------------------------------------------------

const STATUSES: NotificationOutboxStatus[] = ["PENDING", "SENT", "FAILED", "SUPPRESSED"];

function statusBadge(status: NotificationOutboxStatus, label: string) {
  const cls =
    status === "SENT" ? styles.badgeSent : status === "FAILED" ? styles.badgeFailed : status === "PENDING" ? styles.badgePending : styles.badgeSuppressed;
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
}

function OutboxPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const [status, setStatus] = useState<NotificationOutboxStatus | "">("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const list = useNotificationOutbox({ ...(status ? { status } : {}), ...(debounced ? { q: debounced } : {}), limit: 100 });
  const retry = useRetryNotificationOutbox();

  const items = list.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageSafe = Math.min(page, pages - 1);
  const pageItems = items.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);
  const pager = (
    <GridPager
      page={pageSafe}
      pages={pages}
      total={items.length}
      pageSize={pageSize}
      unit={t("notifications.outbox.unit")}
      onPage={setPage}
      onPageSize={(n) => { setPageSize(n); setPage(0); }}
    />
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailHtml, setDetailHtml] = useState<{ subject: string; html: string } | null>(null);

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailHtml(null);
    const d = await fetchNotificationOutboxDetail(id);
    setDetailHtml({ subject: d.subject, html: d.bodyHtml });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.filters}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDebounced(q.trim());
            setPage(0);
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("notifications.outbox.search")} rightSlot={<Search size={16} />} />
        </form>
        <Select value={status} onChange={(e) => { setStatus(e.target.value as NotificationOutboxStatus | ""); setPage(0); }}>
          <option value="">{t("notifications.outbox.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`notifications.status.${s}`)}
            </option>
          ))}
        </Select>
        <div className={styles.spacer} />
        <Button variant="secondary" onClick={() => list.refetch()} leftIcon={<RefreshCw size={16} />}>
          {t("common.refresh")}
        </Button>
      </div>

      {pager}

      <Card>
        {list.isLoading ? (
          <div className={styles.empty}>{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>{t("notifications.outbox.empty")}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                <th style={{ padding: "8px 10px" }}>{t("notifications.outbox.status")}</th>
                <th style={{ padding: "8px 10px" }}>{t("notifications.outbox.event")}</th>
                <th style={{ padding: "8px 10px" }}>{t("notifications.outbox.recipient")}</th>
                <th style={{ padding: "8px 10px" }}>{t("notifications.outbox.subject")}</th>
                <th style={{ padding: "8px 10px" }}>{t("notifications.outbox.date")}</th>
                <th style={{ padding: "8px 10px" }} />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                  <td style={{ padding: "10px" }}>{statusBadge(m.status, t(`notifications.status.${m.status}`))}</td>
                  <td style={{ padding: "10px" }}>
                    <span className={styles.eventKey}>{m.eventKey}</span>
                  </td>
                  <td style={{ padding: "10px" }}>
                    {m.recipientName ?? "—"}
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.78rem" }}>{m.recipientEmail}</div>
                  </td>
                  <td style={{ padding: "10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</td>
                  <td style={{ padding: "10px", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>{formatDateTime(m.createdAt)}</td>
                  <td style={{ padding: "10px", whiteSpace: "nowrap" }}>
                    <Button variant="secondary" onClick={() => openDetail(m.id)} leftIcon={<Eye size={15} />}>
                      {t("notifications.outbox.view")}
                    </Button>
                    {m.status === "FAILED" && (
                      <Button
                        variant="secondary"
                        leftIcon={<Send size={15} />}
                        onClick={() =>
                          retry.mutate(m.id, {
                            onSuccess: () => toast.success(t("notifications.outbox.retried")),
                            onError: () => toast.error(t("common.error")),
                          })
                        }
                      >
                        {t("notifications.outbox.retry")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {items.length > 0 && pager}

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title={detailHtml?.subject ?? t("common.loading")} size="lg">
        {detailHtml ? (
          <iframe title="preview" srcDoc={detailHtml.html} className={styles.preview} style={{ width: "100%", height: 420, border: "none" }} />
        ) : (
          <div className={styles.empty}>{t("common.loading")}</div>
        )}
      </Modal>
    </div>
  );
}

// --- Plantillas --------------------------------------------------------------

type TplField = "subject" | "bodyText" | "bodyHtml";
type TplDraft = { subject: string; bodyText: string; bodyHtml: string; active: boolean };

const GROUP_LABEL: Record<string, string> = { schedules: "Rondas", logbook: "Bitácoras" };

function TemplatesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const templates = useNotificationTemplates();
  const events = useNotificationEvents();
  const update = useUpdateNotificationTemplate();

  const [selId, setSelId] = useState<string | null>(null); // null = lista (master)
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const selected = useMemo<NotificationTemplateDto | null>(
    () => templates.data?.find((x) => x.id === selId) ?? null,
    [templates.data, selId],
  );

  if (templates.isLoading) return <div className={styles.empty}>{t("common.loading")}</div>;

  // === Detalle: editor a pantalla completa ===
  if (selected) {
    return <TemplateEditor template={selected} events={events.data ?? []} onBack={() => setSelId(null)} update={update} toast={toast} t={t} />;
  }

  // === Master: lista administrable ===
  const eventByKey = new Map((events.data ?? []).map((e) => [e.key, e]));
  const groups = [...new Set((events.data ?? []).map((e) => e.group))];
  const rows = (templates.data ?? []).filter((tpl) => {
    const ev = eventByKey.get(tpl.eventKey);
    const name = ev ? t(ev.labelKey, ev.key) : tpl.eventKey;
    if (q && !`${name} ${tpl.eventKey}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (group && ev?.group !== group) return false;
    if (status === "active" && !tpl.active) return false;
    if (status === "inactive" && tpl.active) return false;
    return true;
  });

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, pages - 1);
  const pageRows = rows.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);
  const pager = (
    <GridPager
      page={pageSafe}
      pages={pages}
      total={rows.length}
      pageSize={pageSize}
      unit={t("notifications.templates.unit")}
      onPage={setPage}
      onPageSize={(n) => { setPageSize(n); setPage(0); }}
    />
  );

  return (
    <div className={styles.panel}>
      <div className={styles.tplToolbar}>
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("notifications.templates.search")} rightSlot={<Search size={16} />} />
        <Select value={group} onChange={(e) => { setGroup(e.target.value); setPage(0); }}>
          <option value="">{t("notifications.templates.allGroups")}</option>
          {groups.map((g) => <option key={g} value={g}>{GROUP_LABEL[g] ?? g}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">{t("notifications.templates.allStatuses")}</option>
          <option value="active">{t("notifications.templates.active")}</option>
          <option value="inactive">{t("notifications.templates.inactive")}</option>
        </Select>
        <span className={styles.tplCount}>{t("notifications.templates.count", { count: rows.length })}</span>
      </div>

      {pager}

      <div className={styles.tplTable}>
        <div className={styles.tplTableHead}>
          <span>{t("notifications.templates.colName")}</span>
          <span className={styles.tplColHide}>{t("notifications.templates.colEvent")}</span>
          <span className={styles.tplColHide}>{t("notifications.templates.colChannel")}</span>
          <span className={styles.tplColHide}>{t("notifications.templates.colLocale")}</span>
          <span className={styles.tplColHide}>{t("notifications.outbox.status")}</span>
          <span />
        </div>
        {pageRows.length === 0 ? (
          <div className={styles.empty}>{t("notifications.templates.empty")}</div>
        ) : (
          pageRows.map((tpl) => {
            const ev = eventByKey.get(tpl.eventKey);
            return (
              <div key={tpl.id} className={styles.tplTableRow} onClick={() => setSelId(tpl.id)} role="button" tabIndex={0}>
                <div className={styles.tplRowName}>
                  <span className={styles.tplRowTitle}>{ev ? t(ev.labelKey, ev.key) : tpl.eventKey}</span>
                  <span className={styles.tplRowSub}>{ev ? GROUP_LABEL[ev.group] ?? ev.group : "—"}</span>
                </div>
                <span className={`${styles.eventKey} ${styles.tplColHide}`}>{tpl.eventKey}</span>
                <span className={`${styles.tplRowSub} ${styles.tplColHide}`}>{tpl.channel}</span>
                <span className={`${styles.tplRowSub} ${styles.tplColHide}`}>{tpl.locale}</span>
                <span className={styles.tplColHide}>
                  <span className={`${styles.statusPill} ${tpl.active ? styles.statusActive : styles.statusInactive}`}>
                    {tpl.active ? t("notifications.templates.active") : t("notifications.templates.inactive")}
                  </span>
                </span>
                <Button variant="secondary" leftIcon={<Pencil size={15} />} onClick={(e) => { e.stopPropagation(); setSelId(tpl.id); }}>
                  {t("common.edit")}
                </Button>
              </div>
            );
          })
        )}
      </div>

      {pager}
    </div>
  );
}

function TemplateEditor({
  template, events, onBack, update, toast, t,
}: {
  template: NotificationTemplateDto;
  events: { key: string; labelKey: string; variables: { name: string; description: string; sample: string }[] }[];
  onBack: () => void;
  update: ReturnType<typeof useUpdateNotificationTemplate>;
  toast: ReturnType<typeof useToast>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const eventDef = events.find((e) => e.key === template.eventKey);
  const [draft, setDraft] = useState<TplDraft | null>(null);
  const current: TplDraft = draft ?? { subject: template.subject, bodyText: template.bodyText, bodyHtml: template.bodyHtml, active: template.active };
  const [previewOpen, setPreviewOpen] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const focus = useRef<{ field: TplField; start: number; end: number }>({ field: "subject", start: 0, end: 0 });
  const refs = {
    subject: useRef<HTMLInputElement>(null),
    bodyText: useRef<HTMLTextAreaElement>(null),
    bodyHtml: useRef<HTMLTextAreaElement>(null),
  };
  function trackSel(field: TplField, el: HTMLInputElement | HTMLTextAreaElement) {
    focus.current = { field, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
  }
  function insertVariable(name: string) {
    const { field, start, end } = focus.current;
    const token = `{{${name}}}`;
    const val = current[field];
    setDraft({ ...current, [field]: val.slice(0, start) + token + val.slice(end) });
    requestAnimationFrame(() => {
      const el = refs[field].current;
      if (el) {
        const pos = start + token.length;
        el.focus();
        el.setSelectionRange(pos, pos);
        focus.current = { field, start: pos, end: pos };
      }
    });
  }
  function save() {
    update.mutate(
      { id: template.id, dto: { subject: current.subject, bodyText: current.bodyText, bodyHtml: current.bodyHtml, active: current.active } },
      {
        onSuccess: () => { toast.success(t("notifications.templates.saved")); setDraft(null); },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("common.error")),
      },
    );
  }

  const sample = sampleContextForEvent(template.eventKey);
  const previewSubject = renderTemplate(current.subject, sample);
  const previewHtml = renderTemplate(current.bodyHtml, sample);

  return (
    <div className={styles.panel}>
      <div className={styles.editorHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack}><ArrowLeft size={16} /> {t("notifications.templates.back")}</button>
        <div className={styles.editorTitleWrap}>
          <span className={styles.editorTitle}>{eventDef ? t(eventDef.labelKey, eventDef.key) : template.eventKey}</span>
          <span className={styles.editorSubtitle}>{template.eventKey} · {template.locale} · {template.channel}</span>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.activeToggle}>
            {current.active ? t("notifications.templates.active") : t("notifications.templates.inactive")}
            <Toggle checked={current.active} onChange={(v) => setDraft({ ...current, active: v })} aria-label={t("notifications.templates.activeToggle")} />
          </label>
          <Button variant="secondary" leftIcon={<Eye size={16} />} onClick={() => setPreviewOpen(true)}>{t("notifications.templates.previewBtn")}</Button>
        </div>
      </div>

      <div className={styles.editorLayout}>
        <Card className={styles.editorMain}>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.subject")}</span>
            <Input ref={refs.subject} className={styles.mono} value={current.subject}
              onChange={(e) => setDraft({ ...current, subject: e.target.value })}
              onSelect={(e) => trackSel("subject", e.currentTarget)} onFocus={(e) => trackSel("subject", e.currentTarget)} />
          </div>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.bodyText")}</span>
            <Textarea ref={refs.bodyText} className={styles.mono} rows={6} value={current.bodyText}
              onChange={(e) => setDraft({ ...current, bodyText: e.target.value })}
              onSelect={(e) => trackSel("bodyText", e.currentTarget)} onFocus={(e) => trackSel("bodyText", e.currentTarget)} />
          </div>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.bodyHtml")}</span>
            <Textarea ref={refs.bodyHtml} className={styles.mono} rows={12} value={current.bodyHtml}
              onChange={(e) => setDraft({ ...current, bodyHtml: e.target.value })}
              onSelect={(e) => trackSel("bodyHtml", e.currentTarget)} onFocus={(e) => trackSel("bodyHtml", e.currentTarget)} />
          </div>
          <div className={styles.editorActions}>
            <Button variant="primary" onClick={save} loading={update.isPending} disabled={!draft}>{t("common.save")}</Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={!draft}>{t("common.cancel")}</Button>
            <div className={styles.spacer} />
            <Button variant="secondary" leftIcon={<Eye size={16} />} onClick={() => setPreviewOpen(true)}>{t("notifications.templates.previewBtn")}</Button>
          </div>
        </Card>

        <aside className={styles.editorAside}>
          <span className={styles.asideTitle}><SlidersHorizontal size={14} /> {t("notifications.templates.variables")}</span>
          <span className={styles.insertHint}>{t("notifications.templates.insertHint")}</span>
          <div className={`${styles.dict} ${styles.dictFull}`}>
            {(eventDef?.variables ?? []).map((v) => (
              <button key={v.name} type="button" className={styles.dictItem} onClick={() => insertVariable(v.name)}>
                <span className={styles.dictName}>{`{{${v.name}}}`}</span>
                <span className={styles.dictDesc}>{v.description}</span>
                <span className={styles.dictSample}>{t("notifications.templates.egLabel")}: {v.sample}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t("notifications.templates.preview")} size="xl">
        <div className={styles.deviceBar}>
          <button type="button" className={device === "desktop" ? `${styles.deviceBtn} ${styles.deviceBtnActive}` : styles.deviceBtn} onClick={() => setDevice("desktop")}>
            <Monitor size={15} /> {t("notifications.templates.desktop")}
          </button>
          <button type="button" className={device === "mobile" ? `${styles.deviceBtn} ${styles.deviceBtnActive}` : styles.deviceBtn} onClick={() => setDevice("mobile")}>
            <Smartphone size={15} /> {t("notifications.templates.mobile")}
          </button>
        </div>
        <div className={styles.previewSubjLine}>
          <span className={styles.previewSubjLabel}>{t("notifications.templates.subject")}</span>{previewSubject || "—"}
        </div>
        <div className={styles.previewStage}>
          <iframe title="preview" srcDoc={previewHtml} className={styles.previewFrameModal} style={{ width: device === "mobile" ? 380 : 640 }} />
        </div>
      </Modal>
    </div>
  );
}
