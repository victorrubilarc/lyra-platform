import { useMemo, useState } from "react";
import { HardHat, Lock, Plus, ShieldAlert, ShieldCheck, Trash2, UserCheck, Users } from "lucide-react";
import {
  PERSON_KIND_META,
  WORKER_BLOCK_REASON_META,
  type WorkerStatusLevel,
  type WorkOrderDetail,
  type WorkOrderWorkerDto,
} from "@lyra/contracts";
import { Button, Combobox, Input, Modal, Select, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import { usePersons, useWorkOrderRoster, useAddWorkOrderWorker, useConfirmWorkOrderRoster, useRemoveWorkOrderWorker } from "./work-orders-queries.js";
import styles from "./work-orders.module.css";

const STATUS_META: Record<WorkerStatusLevel, { color: string; label: string }> = {
  ok: { color: "var(--color-success)", label: "Habilitada" },
  warning: { color: "var(--color-warning)", label: "Con avisos" },
  blocked: { color: "var(--color-error)", label: "Con impedimentos" },
};

/**
 * Pestaña DOTACIÓN de una OT (S1). Muestra el ROSTER de personas que ingresarán a
 * ejecutar el permiso, con su ROL y su SEMÁFORO por persona; permite curar (agregar/
 * quitar) y CONFIRMAR (firmar) la dotación = gate para autorizar el permiso (Gobierno 2).
 * Solo se muestra si el tipo de la OT gestiona dotación (`roster.enabled`). Traza OSHA
 * 1910.146(f)(4)-(6) + (e)(2). En S1 el semáforo siempre es "Habilitada" (competencias/
 * veto/acreditación = S2/S3).
 */
export function WorkOrderRosterBlock({ wo, isLive }: { wo: WorkOrderDetail; isLive: boolean }) {
  const workOrderId = wo.id;
  const { can } = usePermissions();
  const toast = useToast();
  const manage = can("workorder:roster:manage");
  const { data: roster, isLoading } = useWorkOrderRoster(workOrderId);
  const add = useAddWorkOrderWorker(workOrderId);
  const remove = useRemoveWorkOrderWorker(workOrderId);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const err = (e: unknown) => toast.error((e as Error).message);

  if (isLoading || !roster) return <p className={styles.muted}>Cargando…</p>;

  const confirmed = !!roster.confirmedAt;

  return (
    <>
      <div className={styles.sectionTitle}>
        <Users size={15} /> Dotación que ingresa a ejecutar el permiso
      </div>

      {isLive && manage && (
        confirmed ? (
          <p className={styles.planBannerOk}>
            <ShieldCheck size={15} />
            Dotación confirmada y firmada{roster.confirmedByName ? ` por ${roster.confirmedByName}` : ""}
            {roster.confirmedAt ? ` · ${formatDateTime(roster.confirmedAt)}` : ""}. Quien ingresa = quien fue autorizado.
          </p>
        ) : (
          <div className={styles.planBannerWarn}>
            <ShieldAlert size={15} />
            <span style={{ flex: 1 }}>Revisa y confirma la dotación que ingresará antes de autorizar el permiso.</span>
            <Button variant="primary" leftIcon={<Lock size={14} />} disabled={roster.workers.length === 0}
              title={roster.workers.length === 0 ? "Agrega al menos una persona" : undefined}
              onClick={() => setConfirmOpen(true)}>
              Confirmar dotación
            </Button>
          </div>
        )
      )}

      {isLive && manage && <AddWorkerRow roster={roster} onAdd={(dto) => add.mutate(dto, { onSuccess: () => toast.success("Persona agregada a la dotación"), onError: err })} pending={add.isPending} />}

      {roster.workers.length === 0 ? (
        <p className={styles.muted}>Sin personas en la dotación. Agrega a quienes ingresarán a ejecutar el permiso.</p>
      ) : (
        <ul className={styles.rosterList}>
          {roster.workers.map((w) => (
            <RosterItem key={w.id} worker={w} canManage={isLive && manage} onRemove={() => remove.mutate({ workerId: w.id, dto: {} }, { onSuccess: () => toast.success("Persona quitada de la dotación"), onError: err })} />
          ))}
        </ul>
      )}

      {confirmOpen && (
        <ConfirmRosterModal workOrderId={workOrderId} count={roster.workers.length} onClose={() => setConfirmOpen(false)} />
      )}
    </>
  );
}

function RosterItem({ worker, canManage, onRemove }: { worker: WorkOrderWorkerDto; canManage: boolean; onRemove: () => void }) {
  const status = STATUS_META[worker.status.level];
  return (
    <li className={styles.rosterItem}>
      <span className={styles.rosterDot} style={{ background: status.color }} aria-hidden />
      <div className={styles.rosterBody}>
        <div className={styles.rosterHead}>
          <span className={styles.rosterName}>{worker.personName}</span>
          <span className={styles.rosterRoleChip}>
            {worker.isSupervisorRole ? <UserCheck size={12} /> : <HardHat size={12} />} {worker.rosterRoleName}
          </span>
          <span className={styles.rosterKind}>{PERSON_KIND_META[worker.personKind].label}{worker.contractorCompanyName ? ` · ${worker.contractorCompanyName}` : ""}</span>
          <span className={styles.rosterStatus} style={{ color: status.color, marginLeft: "auto" }}>{status.label}</span>
        </div>
        {worker.status.reasons.length > 0 && (
          <ul className={styles.rosterReasons}>
            {worker.status.reasons.map((r) => <li key={r}>{WORKER_BLOCK_REASON_META[r].label}</li>)}
          </ul>
        )}
        {worker.note && <p className={styles.rosterNote}>{worker.note}</p>}
      </div>
      {canManage && (
        <Button variant="secondary" leftIcon={<Trash2 size={14} />} onClick={onRemove}>Quitar</Button>
      )}
    </li>
  );
}

/** Fila inline para agregar una persona: Combobox buscable de personas + rol. */
function AddWorkerRow({ roster, onAdd, pending }: { roster: { workers: WorkOrderWorkerDto[]; roles: { id: string; name: string }[] }; onAdd: (dto: { personId: string; rosterRoleId: string; note?: string }) => void; pending: boolean }) {
  const { data: persons = [] } = usePersons();
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState("");

  const personOptions = useMemo(
    () => persons.filter((p) => p.active).map((p) => ({ value: p.id, label: p.fullName, hint: p.contractorCompanyName ?? PERSON_KIND_META[p.kind].label })),
    [persons],
  );

  const submit = () => {
    if (!personId || !roleId) return;
    onAdd({ personId, rosterRoleId: roleId });
    setPersonId("");
    setRoleId("");
  };

  return (
    <div className={styles.rosterAddRow}>
      <div className={styles.rosterAddPicker}>
        <Combobox options={personOptions} value={personId} onChange={setPersonId} placeholder="Buscar persona…" searchPlaceholder="Buscar por nombre…" ariaLabel="Persona" clearable emptyText="No hay personas en el catálogo" />
      </div>
      <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Rol en la dotación">
        <option value="">Rol…</option>
        {roster.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      <Button variant="secondary" leftIcon={<Plus size={15} />} loading={pending} disabled={!personId || !roleId} onClick={submit}>Agregar</Button>
    </div>
  );
}

/** Modal de CONFIRMACIÓN con FIRMA Part 11 (re-autenticación del aprobador). */
function ConfirmRosterModal({ workOrderId, count, onClose }: { workOrderId: string; count: number; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirmWorkOrderRoster(workOrderId);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const submit = () =>
    confirm.mutate(
      { password, mfaCode: mfaCode.trim() || undefined },
      { onSuccess: () => { toast.success("Dotación confirmada y firmada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  return (
    <Modal open onClose={onClose} title="Confirmar y firmar la dotación" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" leftIcon={<ShieldCheck size={15} />} loading={confirm.isPending} disabled={password.length === 0} onClick={submit}>Confirmar y firmar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>Confirmas que las {count} persona(s) listadas están autorizadas a ingresar a ejecutar este permiso. Quien ingresa = quien fue autorizado.</p>
        <div className={styles.signBox}>
          <div className={styles.signTitle}><ShieldCheck size={14} /> Firma electrónica requerida: autorización de la dotación</div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Contraseña</span>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Código MFA (si está habilitado)</span>
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} inputMode="numeric" />
          </label>
        </div>
      </div>
    </Modal>
  );
}
