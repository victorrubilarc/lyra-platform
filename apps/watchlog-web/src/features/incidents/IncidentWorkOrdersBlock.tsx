import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Wrench } from "lucide-react";
import { Button, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import { INCIDENT_KEYS, useIncidentWorkOrders } from "./incidents-queries.js";
import { CreateWorkOrderModal, type WorkOrderSeed } from "../work-orders/CreateWorkOrderModal.js";
import {
  LIFECYCLE_META,
  PRIORITY_META,
  SLA_STATUS_META,
  criticalityColor,
  criticalityLabel,
} from "../work-orders/work-orders-presentation.js";
import styles from "./incidents.module.css";

interface Props {
  incidentId: string;
  /** El botón «Crear OT» solo se ofrece con la incidencia abierta. */
  incidentOpen: boolean;
  /** Contexto para pre-sembrar el asistente de OT (título/descr./nodo/criticidad). */
  seed: WorkOrderSeed;
}

/**
 * Órdenes de trabajo relacionadas (vista inversa del enlace Incidencia↔OT, S7b). La
 * incidencia es el ORIGINATOR (patrón SAP PM notification→order / Maximo Related
 * Records); aquí se listan sus OT FOLLOWUP con folio, estado del flujo, criticidad y
 * semáforo de plazo, y se puede crear una OT nueva ya ligada. La lectura la gobierna
 * `workorder:view` (el backend filtra por ABAC de nodo); crear exige `workorder:create`.
 */
export function IncidentWorkOrdersBlock({ incidentId, incidentOpen, seed }: Props) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { data: workOrders = [], isLoading } = useIncidentWorkOrders(incidentId);
  const [creating, setCreating] = useState(false);
  const canCreate = can("workorder:create");

  if (isLoading) {
    return (
      <div className={styles.originBox}>
        <div className={styles.originTitle}><Wrench size={14} /> Órdenes de trabajo</div>
        <div className={styles.center}><Spinner /></div>
      </div>
    );
  }

  return (
    <div className={styles.originBox}>
      <div className={styles.actionsHead}>
        <div className={styles.originTitle}><Wrench size={14} /> Órdenes de trabajo ({workOrders.length})</div>
        {canCreate && incidentOpen && (
          <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>Crear OT</Button>
        )}
      </div>

      {workOrders.length === 0 ? (
        <div className={styles.muted}>
          Esta incidencia no tiene órdenes de trabajo asociadas.
          {canCreate && incidentOpen ? " Crea una para gestionar la reparación o mantención." : ""}
        </div>
      ) : (
        <ul className={styles.woList}>
          {workOrders.map((wo) => (
            <li key={wo.id}>
              <Link to={`/ordenes-trabajo/${wo.id}`} className={styles.woItem}>
                <span
                  className={styles.woCrit}
                  style={{ background: criticalityColor(wo.criticality) }}
                  title={`Criticidad ${wo.criticality} · ${criticalityLabel(wo.criticality)}`}
                />
                <span className={styles.woCode}>{wo.code}</span>
                <span className={styles.woTitle}>{wo.title}</span>
                <span className={styles.woMeta}>
                  <span
                    className={styles.woState}
                    style={{ color: wo.currentStateColor ?? LIFECYCLE_META[wo.lifecycle].color }}
                  >
                    {wo.currentStateName ?? LIFECYCLE_META[wo.lifecycle].label}
                  </span>
                  <span
                    className={styles.woPriority}
                    style={{ color: PRIORITY_META[wo.priority].color, borderColor: PRIORITY_META[wo.priority].color }}
                  >
                    {PRIORITY_META[wo.priority].label}
                  </span>
                  {wo.slaStatus !== "none" && (
                    <span
                      className={styles.woSla}
                      style={{ background: SLA_STATUS_META[wo.slaStatus].color }}
                      title={SLA_STATUS_META[wo.slaStatus].label}
                    />
                  )}
                  {wo.dueAt && <span className={styles.woDue}>{formatDateTime(wo.dueAt)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Montaje CONDICIONAL: el seed se aplica al abrir (initial-state del modal). */}
      {creating && (
        <CreateWorkOrderModal
          open
          seed={seed}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: INCIDENT_KEYS.workOrders(incidentId) });
          }}
        />
      )}
    </div>
  );
}
