import { useEffect, useState } from "react";
import type { RosterRoleDto } from "@lyra/contracts";
import { Button, Input, Modal, Toggle, useToast } from "@lyra/ui";
import { useUpsertRosterRole } from "./work-orders-queries.js";
import styles from "./catalogs.module.css";

/**
 * Alta/edición de un ROL de la dotación (catálogo configurable). Traza OSHA 1910.146: los 3
 * estándar (ejecutante / vigía / supervisor de entrada) son editables y el cliente puede
 * agregar los suyos. `isSupervisorRole` = quien autoriza/firma la entrada [(f)(6)/(e)(2)];
 * `mustRemainOutside` = semántica de vigía [(i)(4)]. Gobernado por `workordercatalog:manage`.
 */
export function RosterRoleModal({ open, onClose, role }: { open: boolean; onClose: () => void; role: RosterRoleDto | null }) {
  const toast = useToast();
  const upsert = useUpsertRosterRole();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSupervisorRole, setIsSupervisorRole] = useState(false);
  const [mustRemainOutside, setMustRemainOutside] = useState(false);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setIsSupervisorRole(role?.isSupervisorRole ?? false);
    setMustRemainOutside(role?.mustRemainOutside ?? false);
    setActive(role?.active ?? true);
    setSortOrder(role?.sortOrder ?? 0);
  }, [open, role]);

  const canSave = name.trim().length > 0;

  function save() {
    upsert.mutate(
      {
        dto: {
          ...(role ? { id: role.id } : {}),
          name: name.trim(),
          description: description.trim() || null,
          isSupervisorRole,
          mustRemainOutside,
          active,
          sortOrder,
        },
        create: !role,
      },
      { onSuccess: () => { toast.success(role ? "Rol actualizado" : "Rol creado"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={role ? "Editar rol de dotación" : "Nuevo rol de dotación"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!canSave} onClick={save}>Guardar</Button>
      </>
    }>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nombre *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ejecutante, Vigía, Supervisor de entrada" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Descripción</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </label>

        <label className={styles.checkboxRow}>
          <Toggle checked={isSupervisorRole} onChange={(v) => setIsSupervisorRole(v)} size="sm" />
          <span>Autoriza y firma la entrada (supervisor de entrada — OSHA 1910.146(e)(2))</span>
        </label>

        <label className={styles.checkboxRow}>
          <Toggle checked={mustRemainOutside} onChange={(v) => setMustRemainOutside(v)} size="sm" />
          <span>Permanece afuera durante la ejecución (vigía / attendant — OSHA 1910.146(i)(4))</span>
        </label>

        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Orden</span>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
          <label className={styles.checkboxRow} style={{ alignSelf: "end", paddingBottom: 8 }}>
            <Toggle checked={active} onChange={(v) => setActive(v)} size="sm" />
            <span>Activo</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
