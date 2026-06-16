import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Inbox, FileText, SlidersHorizontal, RefreshCw, Search, Send, Eye } from "lucide-react";
import { Button, Card, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import type { NotificationOutboxStatus, NotificationTemplateDto } from "@lyra/contracts";
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
  const list = useNotificationOutbox({ ...(status ? { status } : {}), ...(debounced ? { q: debounced } : {}) });
  const retry = useRetryNotificationOutbox();
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
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("notifications.outbox.search")} rightSlot={<Search size={16} />} />
        </form>
        <Select value={status} onChange={(e) => setStatus(e.target.value as NotificationOutboxStatus | "")}>
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

      <Card>
        {list.isLoading ? (
          <div className={styles.empty}>{t("common.loading")}</div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
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
              {list.data!.items.map((m) => (
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

function TemplatesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const templates = useNotificationTemplates();
  const events = useNotificationEvents();
  const update = useUpdateNotificationTemplate();
  const [selId, setSelId] = useState<string | null>(null);

  const selected = useMemo<NotificationTemplateDto | null>(
    () => templates.data?.find((x) => x.id === selId) ?? templates.data?.[0] ?? null,
    [templates.data, selId],
  );
  const eventDef = events.data?.find((e) => e.key === selected?.eventKey);

  const [draft, setDraft] = useState<{ subject: string; bodyText: string; bodyHtml: string } | null>(null);
  const current = draft ?? (selected ? { subject: selected.subject, bodyText: selected.bodyText, bodyHtml: selected.bodyHtml } : null);

  function save() {
    if (!selected || !current) return;
    update.mutate(
      { id: selected.id, dto: { ...current } },
      {
        onSuccess: () => {
          toast.success(t("notifications.templates.saved"));
          setDraft(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
      },
    );
  }

  if (templates.isLoading) return <div className={styles.empty}>{t("common.loading")}</div>;

  return (
    <div className={`${styles.panel} ${styles.templateGrid}`}>
      <div className={styles.tplList}>
        {(templates.data ?? []).map((tpl) => {
          const ev = events.data?.find((e) => e.key === tpl.eventKey);
          const active = (selected?.id ?? null) === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              className={active ? `${styles.tplItem} ${styles.tplItemActive}` : styles.tplItem}
              onClick={() => {
                setSelId(tpl.id);
                setDraft(null);
              }}
            >
              <span className={styles.tplName}>{ev ? t(ev.labelKey, ev.key) : tpl.eventKey}</span>
              <span className={styles.tplMeta}>
                {tpl.eventKey} · {tpl.locale} · {tpl.active ? t("notifications.templates.active") : t("notifications.templates.inactive")}
              </span>
            </button>
          );
        })}
      </div>

      {selected && current && (
        <Card className={styles.editor}>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.variables")}</span>
            <div className={styles.varChips}>
              {(eventDef?.variables ?? []).map((v) => (
                <button
                  key={v.name}
                  type="button"
                  className={styles.varChip}
                  title={v.description}
                  onClick={() => setDraft({ ...current, subject: `${current.subject}{{${v.name}}}` })}
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.subject")}</span>
            <Input className={styles.mono} value={current.subject} onChange={(e) => setDraft({ ...current, subject: e.target.value })} />
          </div>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.bodyText")}</span>
            <Textarea className={styles.mono} rows={5} value={current.bodyText} onChange={(e) => setDraft({ ...current, bodyText: e.target.value })} />
          </div>
          <div className={styles.editorRow}>
            <span className={styles.label}>{t("notifications.templates.bodyHtml")}</span>
            <Textarea className={styles.mono} rows={7} value={current.bodyHtml} onChange={(e) => setDraft({ ...current, bodyHtml: e.target.value })} />
          </div>
          <div className={styles.editorActions}>
            <Button variant="primary" onClick={save} loading={update.isPending} disabled={!draft}>
              {t("common.save")}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={!draft}>
              {t("common.cancel")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
