import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks, Lock, Plus, Search, TriangleAlert } from "lucide-react";
import { Button, Chip, EmptyState, Input, ResizableSplit, Skeleton, cx } from "@lyra/ui";
import type { ReferenceList } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ListDrawer } from "./ListDrawer.js";
import { ReferenceListDetailPanel } from "./ReferenceListDetailPanel.js";
import { useReferenceLists } from "./reference-data-queries.js";
import styles from "./ReferenceDataPage.module.css";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ReferenceDataPage() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ mode: "create" | "edit"; list: ReferenceList | null } | null>(null);

  const { data: lists = [], isLoading, isError } = useReferenceLists();

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return lists;
    return lists.filter((l) => normalize(`${l.name} ${l.key} ${l.description ?? ""}`).includes(q));
  }, [lists, search]);

  if (!perms.can("module:referencedata:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("referenceData.noAccess")} description={t("referenceData.noAccessDesc")} />
      </div>
    );
  }

  const selected = lists.find((l) => l.id === selectedId) ?? null;

  return (
    <div className={styles.page} data-fill-height="pad">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {t("referenceData.title")} <span className={styles.accent}>{t("referenceData.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("referenceData.subtitle")}</p>
        </div>
        <Can perform="referencelist:manage">
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setDrawer({ mode: "create", list: null })}>
            {t("referenceData.list.create")}
          </Button>
        </Can>
      </div>

      <ResizableSplit
        storageKey="wl_reference_data_split"
        defaultLeftWidth={340}
        minLeftWidth={280}
        left={
          <div className={styles.listPanel}>
            <div className={styles.searchBar}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("referenceData.search")}
                aria-label={t("referenceData.search")}
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
                <EmptyState icon={<TriangleAlert size={28} />} title={t("referenceData.loadError")} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<ListChecks size={32} />}
                  title={search.trim() ? t("referenceData.emptyFiltered") : t("referenceData.empty")}
                  description={search.trim() ? undefined : t("referenceData.emptyDesc")}
                />
              ) : (
                filtered.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={cx(styles.listItem, l.id === selectedId && styles.listItemActive)}
                    onClick={() => setSelectedId(l.id)}
                  >
                    <div className={styles.listItemTop}>
                      <span className={styles.listItemName}>{l.name}</span>
                      <div className={styles.listItemMeta}>
                        {!l.active && <Chip label={t("referenceData.inactive")} variant="default" size="sm" />}
                        <span className={styles.countPill}>{l.itemCount ?? 0}</span>
                      </div>
                    </div>
                    <span className={styles.listItemKey}>{l.key}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        }
        right={
          <ReferenceListDetailPanel
            listId={selectedId}
            onEditList={() => selected && setDrawer({ mode: "edit", list: selected })}
            onDeleted={() => setSelectedId(null)}
          />
        }
      />

      {drawer && (
        <ListDrawer
          open
          mode={drawer.mode}
          list={drawer.list}
          onClose={() => setDrawer(null)}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}
