import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Clock, Lock, Plus, Search, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, ResizableSplit, Skeleton, cx } from "@lyra/ui";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { CalendarDrawer } from "./CalendarDrawer.js";
import { CalendarDetailPanel } from "./CalendarDetailPanel.js";
import { useOperationalCalendars } from "./operational-calendar-queries.js";
import styles from "./OperationalCalendarPage.module.css";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function OperationalCalendarPage() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: calendars = [], isLoading, isError } = useOperationalCalendars();

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return calendars;
    return calendars.filter((c) => normalize(`${c.name} ${c.key} ${c.description ?? ""}`).includes(q));
  }, [calendars, search]);

  if (!perms.can("module:opscalendar:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("opsCalendar.noAccess")} description={t("opsCalendar.noAccessDesc")} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {t("opsCalendar.title")} <span className={styles.accent}>{t("opsCalendar.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("opsCalendar.subtitle")}</p>
        </div>
        <Can perform="opscalendar:manage">
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setDrawerOpen(true)}>
            {t("opsCalendar.create")}
          </Button>
        </Can>
      </div>

      <ResizableSplit
        storageKey="wl_ops_calendar_split"
        defaultLeftWidth={340}
        minLeftWidth={280}
        left={
          <div className={styles.listPanel}>
            <div className={styles.searchBar}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("opsCalendar.search")}
                aria-label={t("opsCalendar.search")}
                rightSlot={<Search size={15} color="var(--color-text-muted)" />}
              />
            </div>
            <div className={styles.listScroll}>
              {isLoading ? (
                <>
                  <Skeleton height={48} width="100%" />
                  <Skeleton height={48} width="100%" />
                  <Skeleton height={48} width="100%" />
                </>
              ) : isError ? (
                <EmptyState icon={<TriangleAlert size={28} />} title={t("opsCalendar.loadError")} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock size={32} />}
                  title={search.trim() ? t("opsCalendar.emptyFiltered") : t("opsCalendar.empty")}
                  description={search.trim() ? undefined : t("opsCalendar.emptyDesc")}
                />
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cx(styles.listItem, c.id === selectedId && styles.listItemActive)}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className={styles.listItemTop}>
                      <span className={styles.listItemName}>{c.name}</span>
                      <div className={styles.listItemMeta}>
                        {c.isDefault && <Chip label={t("opsCalendar.default")} variant="info" size="sm" />}
                        {!c.active && <Chip label={t("opsCalendar.inactive")} variant="default" size="sm" />}
                        <span className={styles.countPill}>
                          <Clock size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
                          {c.shiftCount ?? 0}
                        </span>
                      </div>
                    </div>
                    <span className={styles.listItemKey}>{c.key}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        }
        right={<CalendarDetailPanel calendarId={selectedId} onDeleted={() => setSelectedId(null)} />}
      />

      {drawerOpen && (
        <CalendarDrawer
          open
          onClose={() => setDrawerOpen(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setDrawerOpen(false);
          }}
        />
      )}
    </div>
  );
}
