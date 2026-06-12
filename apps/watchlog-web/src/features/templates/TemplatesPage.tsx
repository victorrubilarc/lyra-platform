import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileStack, Layers, Lock, Network, Plus, Search, TriangleAlert, Users } from "lucide-react";
import { Button, Card, Chip, EmptyState, Input, Select, Skeleton, useToast } from "@lyra/ui";
import type { TemplateListItem, TemplateStatus } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { useTemplates, useDeleteTemplate } from "./templates-queries.js";
import { CreateTemplateModal } from "./CreateTemplateModal.js";
import { TemplateAccessModal } from "./TemplateAccessModal.js";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal.js";
import styles from "./TemplatesPage.module.css";

function statusChip(status: TemplateStatus): { variant: "default" | "success" | "warning"; key: string } {
  if (status === "PUBLISHED") return { variant: "success", key: "templates.status.published" };
  if (status === "ARCHIVED") return { variant: "default", key: "templates.status.archived" };
  return { variant: "warning", key: "templates.status.draft" };
}

export function TemplatesPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TemplateStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<TemplateListItem | null>(null);
  const [access, setAccess] = useState<TemplateListItem | null>(null);

  const query = useMemo(
    () => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) }),
    [search, status],
  );
  const { data: templates = [], isLoading, isError } = useTemplates(query);
  const del = useDeleteTemplate();

  if (!perms.can("module:templates:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("templates.noAccess")} description={t("templates.noAccessDesc")} />
      </div>
    );
  }

  const hasFilters = Boolean(search.trim() || status);

  function confirmDelete() {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success(t("templates.deleted"));
        setToDelete(null);
      },
      onError: () => toast.error(t("common.errorGeneric")),
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {t("templates.title")} <span className={styles.accent}>{t("templates.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("templates.subtitle")}</p>
        </div>
        <Can perform="template:create">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            {t("templates.create")}
          </Button>
        </Can>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("templates.search")}
            aria-label={t("templates.search")}
            rightSlot={<Search size={16} color="var(--color-text-muted)" />}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as TemplateStatus | "")}
          aria-label={t("templates.status.all")}
          className={styles.statusSelect}
        >
          <option value="">{t("templates.status.all")}</option>
          <option value="DRAFT">{t("templates.status.draft")}</option>
          <option value="PUBLISHED">{t("templates.status.published")}</option>
          <option value="ARCHIVED">{t("templates.status.archived")}</option>
        </Select>
      </div>

      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Card key={i} className={styles.card}>
              <Skeleton height={20} width="70%" />
              <Skeleton height={14} width="90%" />
              <Skeleton height={14} width="40%" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={<TriangleAlert size={30} />} title={t("templates.loadError")} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileStack size={36} />}
          title={hasFilters ? t("templates.emptyFiltered") : t("templates.empty")}
          description={hasFilters ? t("templates.emptyFilteredDesc") : t("templates.emptyDesc")}
        />
      ) : (
        <div className={styles.grid}>
          {templates.map((tpl) => {
            const chip = statusChip(tpl.status);
            return (
              <Card key={tpl.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.nodeTag}>
                    <Network size={11} />
                    {tpl.orgNodePath ?? t("templates.globalNode")}
                  </span>
                  <Chip variant={chip.variant} label={t(chip.key)} />
                </div>
                <div className={styles.cardName}>{tpl.name}</div>
                {tpl.description && <div className={styles.cardDesc}>{tpl.description}</div>}
                <div className={styles.cardMeta}>
                  <span><Layers size={12} /> {t("templates.sections", { count: tpl.sectionCount })}</span>
                  <span>{t("templates.fields", { count: tpl.fieldCount })}</span>
                  {tpl.publishedVersionNumber != null && (
                    <span className={styles.versionTag}>{t("templates.versionBadge", { n: tpl.publishedVersionNumber })}</span>
                  )}
                  {tpl.draftVersionNumber != null && tpl.status !== "DRAFT" && (
                    <span className={styles.draftTag}>{t("templates.draftBadge", { n: tpl.draftVersionNumber })}</span>
                  )}
                </div>
                <div className={styles.cardActions}>
                  <Button variant="secondary" onClick={() => navigate(`/plantillas/${tpl.id}`)}>
                    {perms.can("template:edit") ? t("templates.actions.edit") : t("templates.actions.view")}
                  </Button>
                  <Can perform="template:edit">
                    <Button variant="secondary" onClick={() => setAccess(tpl)}>
                      <Users size={15} aria-hidden /> {t("templates.actions.access")}
                    </Button>
                  </Can>
                  <Can perform="template:delete">
                    <Button variant="danger" onClick={() => setToDelete(tpl)}>
                      {t("templates.actions.delete")}
                    </Button>
                  </Can>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTemplateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <TemplateAccessModal
        open={access !== null}
        templateId={access?.id ?? null}
        templateName={access?.name ?? ""}
        onClose={() => setAccess(null)}
      />
      <ConfirmDeleteModal
        open={toDelete !== null}
        title={t("templates.deleteTitle")}
        body={t("templates.deleteConfirm", { name: toDelete?.name ?? "" })}
        loading={del.isPending}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
