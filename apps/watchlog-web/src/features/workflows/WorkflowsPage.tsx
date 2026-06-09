import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, Circle, GitBranch, Lock, Plus, Search, TriangleAlert } from "lucide-react";
import { Button, Card, Chip, EmptyState, Input, Select, Skeleton, useToast } from "@lyra/ui";
import type { WorkflowListItem, WorkflowStatus } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ConfirmDeleteModal } from "../templates/ConfirmDeleteModal.js";
import { CreateWorkflowModal } from "./CreateWorkflowModal.js";
import { useDeleteWorkflow, useWorkflows } from "./workflows-queries.js";
import styles from "./WorkflowsPage.module.css";

function statusChip(status: WorkflowStatus): { variant: "default" | "success" | "warning"; key: string } {
  if (status === "PUBLISHED") return { variant: "success", key: "workflows.status.published" };
  if (status === "ARCHIVED") return { variant: "default", key: "workflows.status.archived" };
  return { variant: "warning", key: "workflows.status.draft" };
}

export function WorkflowsPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorkflowStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<WorkflowListItem | null>(null);

  const query = useMemo(
    () => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) }),
    [search, status],
  );
  const { data: workflows = [], isLoading, isError } = useWorkflows(query);
  const del = useDeleteWorkflow();

  if (!perms.can("module:workflows:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("workflows.noAccess")} description={t("workflows.noAccessDesc")} />
      </div>
    );
  }

  const hasFilters = Boolean(search.trim() || status);

  function confirmDelete() {
    if (!toDelete) return;
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success(t("workflows.deleted"));
        setToDelete(null);
      },
      onError: () => toast.error(t("workflows.deleteError")),
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>
            {t("workflows.title")} <span className={styles.accent}>{t("workflows.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("workflows.subtitle")}</p>
        </div>
        <Can perform="workflow:manage">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            {t("workflows.create")}
          </Button>
        </Can>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("workflows.search")}
            aria-label={t("workflows.search")}
            rightSlot={<Search size={16} color="var(--color-text-muted)" />}
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowStatus | "")}
          aria-label={t("workflows.status.all")}
          className={styles.statusSelect}
        >
          <option value="">{t("workflows.status.all")}</option>
          <option value="DRAFT">{t("workflows.status.draft")}</option>
          <option value="PUBLISHED">{t("workflows.status.published")}</option>
          <option value="ARCHIVED">{t("workflows.status.archived")}</option>
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
        <EmptyState icon={<TriangleAlert size={30} />} title={t("workflows.loadError")} />
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={<GitBranch size={36} />}
          title={hasFilters ? t("workflows.emptyFiltered") : t("workflows.empty")}
          description={hasFilters ? t("workflows.emptyFilteredDesc") : t("workflows.emptyDesc")}
        />
      ) : (
        <div className={styles.grid}>
          {workflows.map((wf) => {
            const chip = statusChip(wf.status);
            return (
              <Card key={wf.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.keyTag}>{wf.key}</span>
                  <Chip variant={chip.variant} label={t(chip.key)} />
                </div>
                <div className={styles.cardName}>{wf.name}</div>
                {wf.description && <div className={styles.cardDesc}>{wf.description}</div>}
                <div className={styles.cardMeta}>
                  <span><Circle size={12} /> {t("workflows.states", { count: wf.stateCount })}</span>
                  <span><ArrowRightLeft size={12} /> {t("workflows.transitions", { count: wf.transitionCount })}</span>
                  {wf.publishedVersionNumber != null && (
                    <span className={styles.versionTag}>{t("workflows.versionBadge", { n: wf.publishedVersionNumber })}</span>
                  )}
                  {wf.draftVersionNumber != null && wf.status !== "DRAFT" && (
                    <span className={styles.draftTag}>{t("workflows.draftBadge", { n: wf.draftVersionNumber })}</span>
                  )}
                  {wf.usedByTemplateCount > 0 && (
                    <span className={styles.usedTag}>{t("workflows.usedBy", { count: wf.usedByTemplateCount })}</span>
                  )}
                </div>
                <div className={styles.cardActions}>
                  <Button variant="secondary" onClick={() => navigate(`/flujos/${wf.id}`)}>
                    {perms.can("workflow:manage") ? t("workflows.actions.edit") : t("workflows.actions.view")}
                  </Button>
                  <Can perform="workflow:manage">
                    <Button variant="danger" onClick={() => setToDelete(wf)} disabled={wf.usedByTemplateCount > 0}>
                      {t("workflows.actions.delete")}
                    </Button>
                  </Can>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateWorkflowModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmDeleteModal
        open={toDelete !== null}
        title={t("workflows.deleteTitle")}
        body={t("workflows.deleteConfirm", { name: toDelete?.name ?? "" })}
        loading={del.isPending}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
