import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { useWorkflow } from "./workflows-queries.js";
import { WorkflowBuilder } from "./WorkflowBuilder.js";
import styles from "./WorkflowBuilder.module.css";

/** Ruta /flujos/:id — carga el detalle y monta el builder de la máquina de estados. */
export function WorkflowBuilderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const perms = usePermissions();
  const { id = "" } = useParams();
  const { data: detail, isLoading, isError } = useWorkflow(id);

  if (!perms.can("module:workflows:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("workflows.noAccess")} description={t("workflows.noAccessDesc")} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton height={40} width="40%" />
        <Skeleton height={300} />
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className={styles.page}>
        <Button variant="secondary" onClick={() => navigate("/flujos")}>
          <ArrowLeft size={16} /> {t("workflows.builder.back")}
        </Button>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("workflows.loadError")} />
      </div>
    );
  }

  // Remonta el builder al cambiar de versión (tras publicar/crear borrador).
  return <WorkflowBuilder key={detail.version.id} detail={detail} />;
}
