import { useMemo, useState } from "react";
import { HardHat, Lock, Plus, ShieldAlert, ShieldCheck, Trash2, UserCheck, Users } from "lucide-react";
import {
  PERSON_KIND_META,
  WORKER_BLOCK_REASON_META,
  type WorkerStatusDetail,
  type WorkerStatusLevel,
  type WorkOrderDetail,
  type WorkOrderRosterDto,
  type WorkOrderWorkerDto,
} from "@lyra/contracts";
import { Button, Combobox, Input, Modal, Select, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import { usePersons, useWorkOrderRoster, useAddWorkOrderWorker, useConfirmWorkOrderRoster, useRemoveWorkOrderWorker } from "./work-orders-queries.js";
import styles from "./work-orders.module.css";

const STATUS_META: Record<WorkerStatusLevel, { color: string; label: string }> = {
  ok: { color: "var(--color-success)", label: "Habilitada" },
  warning: { color: "var(--color-warning)", label: "Con avisos" },
  blocked: { color: "var(--color-error)", label: "Con impedimentos" },
};

/** Redacta en español un detalle del semáforo (§6.2: qué le falta a quién). */
function describeDetail(d: WorkerStatusDetail): string {
  const name = d.competencyTypeName ?? "competencia requerida";
  switch (d.reason) {
    case "COMPETENCY_MISSING":
      return `Falta «${name}»`;
    case "COMPETENCY_EXPIRED":
      return `«${name}» vencida${d.expiresAt ? ` el ${formatDate(d.expiresAt)}` : ""}`;
    case "COMPETENCY_EXPIRING":
      return `«${name}» por vencer${d.expiresAt ? ` el ${formatDate(d.expiresAt)}` : ""}`;
    case "RESTRICTION_ACTIVE":
      return `Restricción activa${d.restrictionReason ? `: ${d.restrictionReason}` : ""}`;
    case "NOT_AUTHORIZED":
      return "Persona no autorizada/designada";
    case "COMPANY_NOT_ACCREDITED": {
      const co = d.companyName ? `Empresa «${d.companyName}»` : "Empresa contratista";
      return d.accreditedUntil ? `${co}: acreditación vencida el ${formatDate(d.accreditedUntil)}` : `${co} no acreditada`;
    }
    case "COMPANY_ACCREDITATION_CONDITIONAL":
      return d.companyName ? `Empresa «${d.companyName}»: acreditación condicional` : "Acreditación de la empresa condicional";
    case "COMPANY_ACCREDITATION_EXPIRING": {
      const co = d.companyName ? `Empresa «${d.companyName}»` : "Empresa contratista";
      return `${co}: acreditación por vencer${d.accreditedUntil ? ` el ${formatDate(d.accreditedUntil)}` : ""}`;
    }
    case "ROLE_MISSING":
      return "Falta un rol requerido en la dotación";
    default:
      return "Impedimento";
  }
}

/**
 * Pestaña DOTACIÓN de una OT. Muestra el ROSTER de personas que ingresarán a ejecutar el
 * permiso, con su ROL y su SEMÁFORO por persona (S2: causas rojas de competencia/veto
 * derivadas en vivo); permite curar (agregar/quitar) y CONFIRMAR (firmar) la dotación =
 * gate para autorizar el permiso (Gobierno 2). Si hay personas en ROJO, la confirmación
 * exige un override firmado POR PERSONA (§6.3). Solo se muestra si el tipo gestiona
 * dotación. Traza OSHA 1910.146(f)(4)-(6) + (e)(2); ISO 45001 §7.2.
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
            <span style={{ flex: 1 }}>
              {roster.hasBlocked
                ? "Hay personas con impedimentos. Resuélvelos o registra una justificación firmada por persona antes de autorizar el permiso."
                : "Revisa y confirma la dotación que ingresará antes de autorizar el permiso."}
            </span>
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
        <div className={styles.rosterEmpty}><Users size={16} /> Sin personas en la dotación. Agrega a quienes ingresarán a ejecutar el permiso.</div>
      ) : (
        <ul className={styles.rosterList}>
          {roster.workers.map((w) => (
            <RosterItem key={w.id} worker={w} canManage={isLive && manage} onRemove={() => remove.mutate({ workerId: w.id, dto: {} }, { onSuccess: () => toast.success("Persona quitada de la dotación"), onError: err })} />
          ))}
        </ul>
      )}

      {confirmOpen && (
        <ConfirmRosterModal workOrderId={workOrderId} roster={roster} onClose={() => setConfirmOpen(false)} />
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
        {worker.status.details.length > 0 && (
          <ul className={styles.rosterReasons}>
            {worker.status.details.map((d, i) => (
              <li key={i} style={{ color: WORKER_BLOCK_REASON_META[d.reason].level === "warning" ? "var(--color-warning)" : undefined }}>{describeDetail(d)}</li>
            ))}
          </ul>
        )}
        {worker.override && (
          <p className={styles.rosterOverride}>
            <ShieldAlert size={12} /> Autorizada con excepción firmada{worker.override.byName ? ` por ${worker.override.byName}` : ""}: {worker.override.reason}
          </p>
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
    <div className={styles.rosterAddCard}>
      <span className={styles.rosterAddLabel}><Plus size={12} /> Agregar a la dotación</span>
      <div className={styles.rosterAddRow}>
        <div className={styles.rosterAddPicker}>
          <Combobox options={personOptions} value={personId} onChange={setPersonId} placeholder="Buscar persona…" searchPlaceholder="Buscar por nombre…" ariaLabel="Persona" clearable emptyText="No hay personas en el catálogo" />
        </div>
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Rol en la dotación" className={styles.rosterRoleSelect}>
          <option value="">Rol en la dotación…</option>
          {roster.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Button variant="primary" leftIcon={<Plus size={15} />} loading={pending} disabled={!personId || !roleId} onClick={submit}>Agregar</Button>
      </div>
    </div>
  );
}

/**
 * Modal de CONFIRMACIÓN con FIRMA Part 11. Si hay personas en ROJO exige un motivo
 * (override) POR PERSONA — una sola firma cubre todo el acto (§6.3, decisión S2-B).
 */
function ConfirmRosterModal({ workOrderId, roster, onClose }: { workOrderId: string; roster: WorkOrderRosterDto; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirmWorkOrderRoster(workOrderId);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const blocked = roster.workers.filter((w) => w.status.level === "blocked");
  const allReasonsFilled = blocked.every((w) => (reasons[w.id] ?? "").trim().length > 0);
  const canSubmit = password.length > 0 && allReasonsFilled;

  const submit = () =>
    confirm.mutate(
      {
        password,
        mfaCode: mfaCode.trim() || undefined,
        overrides: blocked.length > 0 ? blocked.map((w) => ({ workerId: w.id, reason: (reasons[w.id] ?? "").trim() })) : undefined,
      },
      { onSuccess: () => { toast.success(blocked.length > 0 ? "Dotación confirmada con excepción(es) firmada(s)" : "Dotación confirmada y firmada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );

  return (
    <Modal open onClose={onClose} title="Confirmar y firmar la dotación" size={blocked.length > 0 ? "md" : "sm"} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" leftIcon={<ShieldCheck size={15} />} loading={confirm.isPending} disabled={!canSubmit} onClick={submit}>
          {blocked.length > 0 ? "Autorizar con excepción y firmar" : "Confirmar y firmar"}
        </Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>
          Confirmas que las {roster.workers.length} persona(s) listadas están autorizadas a ingresar a ejecutar este permiso. Quien ingresa = quien fue autorizado.
        </p>

        {blocked.length > 0 && (
          <div className={styles.overrideBox}>
            <div className={styles.signTitle}><ShieldAlert size={14} /> {blocked.length} persona(s) con impedimentos: justifica cada excepción</div>
            {blocked.map((w) => (
              <label key={w.id} className={styles.field}>
                <span className={styles.fieldLabel}>
                  {w.personName} — {w.status.details.filter((d) => WORKER_BLOCK_REASON_META[d.reason].level === "blocked").map(describeDetail).join(", ")}
                </span>
                <Input value={reasons[w.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [w.id]: e.target.value }))} placeholder="Motivo del riesgo aceptado / medida compensatoria…" />
              </label>
            ))}
          </div>
        )}

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
