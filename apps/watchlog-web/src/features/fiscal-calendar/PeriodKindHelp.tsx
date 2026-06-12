import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { PeriodKind } from "@lyra/contracts";
import fx from "./FiscalCalendar.module.css";

/**
 * Ayuda informativa del tipo de período seleccionado: explica qué significa y da un
 * ejemplo práctico de caso de uso, para configurar con claridad. Reutilizable en el
 * panel de detalle y en el drawer de creación.
 */
export function PeriodKindHelp({ kind }: { kind: PeriodKind }) {
  const { t } = useTranslation();
  return (
    <div className={fx.help} role="note">
      <p className={fx.helpTitle}>
        <Info size={15} /> {t(`fiscalCal.period.help.${kind}.title`)}
      </p>
      <p className={fx.helpBody}>{t(`fiscalCal.period.help.${kind}.body`)}</p>
      <p className={fx.helpExample}>
        <b>{t("fiscalCal.period.help.exampleLabel")}:</b> {t(`fiscalCal.period.help.${kind}.example`)}
      </p>
    </div>
  );
}
