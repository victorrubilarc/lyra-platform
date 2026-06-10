import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ClipboardList, FileStack, Layers, Lock, Network, TriangleAlert } from "lucide-react";
import { Card, EmptyState, Skeleton, useToast } from "@lyra/ui";
import type { TemplateListItem } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { useTemplates } from "../templates/templates-queries.js";
import { useCreateLogEntry } from "./log-entries-queries.js";
import styles from "./LogEntries.module.css";

/** Selección de plantilla para una nueva entrada (anclada al prototipo: PickTpl). */
export function NewEntryPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: templates = [], isLoading, isError } = useTemplates({ status: "PUBLISHED" });
  const create = useCreateLogEntry();

  if (!perms.can("module:logbook:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("logbook.noAccess")} description={t("logbook.noAccessDesc")} />
      </div>
    );
  }

  function start(tpl: TemplateListItem) {
    if (create.isPending) return;
    create.mutate(
      { templateId: tpl.id, ...(tpl.orgNodeId ? { orgNodeId: tpl.orgNodeId } : {}) },
      {
        onSuccess: (entry) => navigate(`/nueva-entrada/${entry.id}`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : t("common.errorGeneric")),
      },
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {t("logbook.new.title")} <span className={styles.accent}>{t("logbook.new.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("logbook.new.subtitle")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Card key={i} className={styles.card}>
              <Skeleton height={18} width="70%" />
              <Skeleton height={14} width="90%" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.new.loadError")} />
      ) : templates.length === 0 ? (
        <EmptyState icon={<FileStack size={36} />} title={t("logbook.new.empty")} description={t("logbook.new.emptyDesc")} />
      ) : (
        <div className={styles.grid}>
          {templates.map((tpl) => (
            <Card
              key={tpl.id}
              className={styles.card}
              hoverable
              style={{ cursor: create.isPending ? "wait" : "pointer" }}
              onClick={() => start(tpl)}
            >
              <div className={styles.cardTop}>
                <ClipboardList size={22} color="var(--color-accent-primary, #6366f1)" />
                <span className={styles.nodeTag}>
                  <Network size={11} />
                  {tpl.orgNodePath ?? t("logbook.new.globalNode")}
                </span>
              </div>
              <div className={styles.cardName}>{tpl.name}</div>
              {tpl.description && <div className={styles.cardDesc}>{tpl.description}</div>}
              <div className={styles.cardTop}>
                <span className={styles.cardMeta}>
                  <Layers size={12} /> {t("templates.sections", { count: tpl.sectionCount })} · {t("templates.fields", { count: tpl.fieldCount })}
                </span>
                <ChevronRight size={16} color="var(--color-text-muted)" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
