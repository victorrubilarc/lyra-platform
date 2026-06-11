import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarRange, Lock, Plus, Search, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, ResizableSplit, Skeleton, cx } from "@lyra/ui";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { FiscalCalendarDrawer } from "./FiscalCalendarDrawer.js";
import { FiscalCalendarDetailPanel } from "./FiscalCalendarDetailPanel.js";
import { useFiscalCalendars } from "./fiscal-calendar-queries.js";
import styles from "../operational-calendar/OperationalCalendarPage.module.css";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function FiscalCalendarPage() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: calendars = [], isLoading, isError } = useFiscalCalendars();

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return calendars;
    return calendars.filter((c) => normalize(`${c.name} ${c.key} ${c.description ?? ""}`).includes(q));
  }, [calendars, search]);

  if (!perms.can("module:opscalendar:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("fiscalCal.noAccess")} description={t("fiscalCal.noAccessDesc")} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {t("fiscalCal.title")} <span className={styles.accent}>{t("fiscalCal.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("fiscalCal.subtitle")}</p>
        </div>
        <Can perform="opscalendar:manage">
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setDrawerOpen(true)}>
            {t("fiscalCal.create")}
          </Button>
        </Can>
      </div>

      <div className={styles.splitWrap}>
        <ResizableSplit
          storageKey="wl_fiscal_calendar_split"
          defaultLeftWidth={340}
          minLeftWidth={280}
          left={
            <div className={styles.listPanel}>
              <div className={styles.searchBar}>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("fiscalCal.search")}
                  aria-label={t("fiscalCal.search")}
                  rightSlot={<Search size={15} color="var(--color-text-muted)" />}
                />
              </div>
              <div className={styles.listScroll}>
                {isLoading ? (
                  <>
                    <Skeleton height={48} width="100%" />
                    <Skeleton height={48} width="100%" />
                  </>
                ) : isError ? (
                  <EmptyState icon={<TriangleAlert size={28} />} title={t("fiscalCal.loadError")} />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={<CalendarRange size={32} />}
                    title={search.trim() ? t("fiscalCal.emptyFiltered") : t("fiscalCal.empty")}
                    description={search.trim() ? undefined : t("fiscalCal.emptyDesc")}
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
                          {c.isDefault && <Chip label={t("fiscalCal.default")} variant="info" size="sm" />}
                          {!c.active && <Chip label={t("fiscalCal.inactive")} variant="default" size="sm" />}
                          <Chip label={t(`fiscalCal.period.kind.${c.periodKind}`)} variant="default" size="sm" />
                        </div>
                      </div>
                      <span className={styles.listItemKey}>{c.key}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          }
          right={<FiscalCalendarDetailPanel calendarId={selectedId} onDeleted={() => setSelectedId(null)} />}
        />
      </div>

      {drawerOpen && (
        <FiscalCalendarDrawer
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
