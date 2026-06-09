import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { useTemplate } from "./templates-queries.js";
import { TemplateBuilder } from "./TemplateBuilder.js";
import styles from "./TemplateBuilder.module.css";

/** Ruta /plantillas/:id — carga el detalle y monta el builder. */
export function TemplateBuilderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const perms = usePermissions();
  const { id = "" } = useParams();
  const { data: detail, isLoading, isError } = useTemplate(id);

  if (!perms.can("module:templates:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("templates.noAccess")} description={t("templates.noAccessDesc")} />
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
        <Button variant="secondary" onClick={() => navigate("/plantillas")}>
          <ArrowLeft size={16} /> {t("templates.builder.back")}
        </Button>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("templates.loadError")} />
      </div>
    );
  }

  // Remonta el builder al cambiar de versión (p. ej. tras publicar/crear borrador).
  return <TemplateBuilder key={detail.version.id} detail={detail} />;
}
