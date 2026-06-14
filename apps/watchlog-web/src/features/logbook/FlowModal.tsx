import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { Button, Modal, Spinner } from "@lyra/ui";
import { formatEntryFolio } from "@lyra/contracts";
import { useLogEntry } from "../log-entries/log-entries-queries.js";
import { WorkflowDiagram } from "./WorkflowDiagram.js";
import styles from "./Logbook.module.css";

interface Props {
  entryId: string | null;
  onClose: () => void;
  onOpenFull: (id: string) => void;
}

/**
 * Visor LIGERO del flujo (Fase 2.8.1c-UX): abre SOLO el recorrido del flujo de un
 * registro desde la grilla, sin ir a la ficha completa. Carga el detalle bajo demanda
 * (mismo endpoint/autorización del visor) y muestra el `WorkflowDiagram`.
 */
export function FlowModal({ entryId, onClose, onOpenFull }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detail = useLogEntry(entryId);
  const entry = detail.data;

  return (
    <Modal
      open={entryId !== null}
      onClose={onClose}
      size={expanded ? "xl" : "lg"}
      title={entry ? `${t("logbook.diagram.title")} · ${formatEntryFolio(entry.entryNumber)}` : t("logbook.diagram.title")}
      footer={
        <div className={styles.flowModalFooter}>
          <Button
            variant="secondary"
            leftIcon={expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? t("logbook.diagram.collapse") : t("logbook.diagram.expand")}
          </Button>
          {entry && (
            <Button variant="primary" leftIcon={<ExternalLink size={14} />} onClick={() => onOpenFull(entry.id)}>
              {t("logbook.peek.openFull")}
            </Button>
          )}
        </div>
      }
    >
      {detail.isLoading && (
        <div className={styles.flowModalLoading}>
          <Spinner />
        </div>
      )}
      {detail.isError && <p className={styles.cellSub}>{t("logbook.list.loadError")}</p>}
      {entry &&
        (entry.workflowVersion ? (
          <WorkflowDiagram entry={entry} />
        ) : (
          <p className={styles.cellSub}>{t("logbook.diagram.noFlow")}</p>
        ))}
    </Modal>
  );
}
