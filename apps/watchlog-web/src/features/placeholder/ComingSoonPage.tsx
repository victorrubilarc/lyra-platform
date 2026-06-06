import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Hammer } from "lucide-react";
import { EmptyState } from "@lyra/ui";
import { routeByPath } from "../../shell/navigation.js";

/** Placeholder para módulos aún no construidos (Estructura, Seguridad…). */
export function ComingSoonPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const route = routeByPath(pathname);
  return (
    <EmptyState
      icon={<Hammer size={26} aria-hidden="true" />}
      title={route ? t(route.labelKey) : t("common.comingSoon")}
      description={t("common.underConstruction")}
    />
  );
}
