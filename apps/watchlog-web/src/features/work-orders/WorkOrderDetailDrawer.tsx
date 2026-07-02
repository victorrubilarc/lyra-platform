import { useEffect, useState } from "react";
import type { WorkOrderPriority } from "@lyra/contracts";
import { Button, Drawer, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import {
  useAssignWorkOrder,
  useCancelWorkOrder,
  useUpdateWorkOrder,
  useWorkOrderAssignableUsers,
  useWorkOrderDetail,
} from "./work-orders-queries.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, criticalityColor, criticalityLabel } from "./work-orders-presentation.js";
import styles from "./work-orders.module.css";

interface Props {
  workOrderId: string | null;
  onClose: () => void;
}

/**
 * Detalle (peek) de una solicitud de OT (S1). Read-mostly con acciones básicas de
 * gestión: reasignar responsable, cambiar prioridad y anular con motivo. El WORKFLOW
 * (puertas/aprobación/folio) y los checklists/actividades llegan en S2–S5.
 */
export function WorkOrderDetailDrawer({ workOrderId, onClose }: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: wo, isLoading } = useWorkOrderDetail(workOrderId);
  const { data: users = [] } = useWorkOrderAssignableUsers();
  const assign = useAssignWorkOrder();
  const update = useUpdateWorkOrder();
  const cancel = useCancelWorkOrder();

  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    setCancelReason("");
    setShowCancel(false);
  }, [workOrderId]);

  const canManage = wo && wo.lifecycle !== "CLOSED" && wo.lifecycle !== "CANCELED";

  return (
    <Drawer open={!!workOrderId} onClose={onClose} title={wo ? wo.code : "Solicitud"} width={640}>
      {isLoading || !wo ? (
        <div className={styles.center}><Spinner /></div>
      ) : (
        <div className={styles.detail}>
          <div className={styles.drawerHead}>
            <span className={styles.code}>{wo.code}</span>
            <span className={styles.lifeChip} style={{ color: LIFECYCLE_META[wo.lifecycle].color }}>
              {LIFECYCLE_META[wo.lifecycle].label}
            </span>
            {wo.requiresPtw && <span className={styles.ptwTag}>PTW</span>}
          </div>
          <h2 className={styles.detailTitle}>{wo.title}</h2>
          {wo.description && <p className={styles.desc}>{wo.description}</p>}

          <dl className={styles.kv}>
            <dt>Tipo</dt><dd>{wo.typeName ?? "—"}</dd>
            <dt>Criticidad</dt>
            <dd><span className={styles.sevDot} style={{ background: criticalityColor(wo.criticality) }} /> {wo.criticality} · {criticalityLabel(wo.criticality)}</dd>
            <dt>Prioridad</dt><dd style={{ color: PRIORITY_META[wo.priority].color, fontWeight: 600 }}>{PRIORITY_META[wo.priority].label}</dd>
            <dt>Origen</dt><dd>{ORIGIN_META[wo.originType].label}</dd>
            <dt>Nodo</dt><dd>{wo.orgNodeName ?? "—"}</dd>
            {wo.equipmentTag && (<><dt>Equipo</dt><dd>{wo.equipmentTag}</dd></>)}
            {wo.locationDetail && (<><dt>Ubicación</dt><dd>{wo.locationDetail}</dd></>)}
            {wo.areas.length > 0 && (<><dt>Áreas</dt><dd>{wo.areas.map((a) => a.name).join(", ")}</dd></>)}
            {wo.specialties.length > 0 && (<><dt>Especialidades</dt><dd>{wo.specialties.map((s) => s.name).join(", ")}</dd></>)}
            <dt>Solicitante</dt><dd>{wo.requesterName ?? "—"}</dd>
            {wo.dueAt && (<><dt>Fecha límite</dt><dd>{formatDate(wo.dueAt)}</dd></>)}
            <dt>Creada</dt><dd>{formatDate(wo.createdAt)}</dd>
          </dl>

          {canManage && can("workorder:assign") && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Responsable</span>
              <Select
                value={wo.ownerId ?? ""}
                onChange={(e) =>
                  assign.mutate(
                    { id: wo.id, dto: { ownerId: e.target.value || null } },
                    { onError: (err) => toast.error((err as Error).message) },
                  )
                }
              >
                <option value="">(sin responsable)</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </label>
          )}

          {canManage && can("workorder:edit") && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Prioridad</span>
              <Select
                value={wo.priority}
                onChange={(e) =>
                  update.mutate(
                    { id: wo.id, dto: { priority: e.target.value as WorkOrderPriority } },
                    { onError: (err) => toast.error((err as Error).message) },
                  )
                }
              >
                {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </Select>
            </label>
          )}

          {canManage && can("workorder:cancel") && (
            <div className={styles.dangerZone}>
              {!showCancel ? (
                <Button variant="danger" onClick={() => setShowCancel(true)}>Anular solicitud</Button>
              ) : (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Motivo de anulación *</span>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="Explica por qué se anula (mín. 5 caracteres)" />
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => setShowCancel(false)}>Cancelar</Button>
                    <Button
                      variant="danger"
                      loading={cancel.isPending}
                      disabled={cancelReason.trim().length < 5}
                      onClick={() =>
                        cancel.mutate(
                          { id: wo.id, dto: { reason: cancelReason.trim() } },
                          {
                            onSuccess: () => { toast.success("Solicitud anulada"); setShowCancel(false); },
                            onError: (err) => toast.error((err as Error).message),
                          },
                        )
                      }
                    >
                      Confirmar anulación
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
