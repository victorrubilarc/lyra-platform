import { useEffect, useMemo, useState } from "react";
import type { WorkOrderCompetencyRuleDto } from "@lyra/contracts";
import { Button, Combobox, Input, Modal, MultiSelect, Select, Toggle, useToast } from "@lyra/ui";
import {
  useCompetencyTypes,
  useRosterRoles,
  useUpsertCompetencyRule,
  useWorkOrderSpecialtiesAdmin,
  useWorkOrderTypesAdmin,
} from "./work-orders-queries.js";
import styles from "./catalogs.module.css";

/**
 * Alta/edición de una REGLA de requisito de competencia (S2). Espejo de la regla de
 * checklist: exige una competencia (vigente) a la dotación de una OT según su
 * aplicabilidad (tipo/criticidad/especialidad/PTW) y opcionalmente a un ROL concreto
 * (ej. solo al ejecutante). Una regla `mandatory` pone ROJO y bloquea confirmar la
 * dotación si falta o está vencida. Gobernada por `workordercatalog:manage`.
 */
export function WorkOrderCompetencyRuleModal({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: WorkOrderCompetencyRuleDto | null }) {
  const toast = useToast();
  const upsert = useUpsertCompetencyRule();
  const { data: competencyTypes = [] } = useCompetencyTypes(false);
  const { data: types = [] } = useWorkOrderTypesAdmin();
  const { data: specialties = [] } = useWorkOrderSpecialtiesAdmin();
  const { data: roles = [] } = useRosterRoles();

  const [name, setName] = useState("");
  const [competencyTypeId, setCompetencyTypeId] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [appliesToTypeIds, setAppliesToTypeIds] = useState<string[]>([]);
  const [minCriticality, setMinCriticality] = useState<string>("");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [requiresPtw, setRequiresPtw] = useState<string>("");
  const [appliesToRosterRoleId, setAppliesToRosterRoleId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setCompetencyTypeId(rule?.competencyTypeId ?? "");
    setMandatory(rule?.mandatory ?? true);
    setAppliesToTypeIds(rule?.appliesToTypeIds ?? []);
    setMinCriticality(rule?.minCriticality != null ? String(rule.minCriticality) : "");
    setSpecialtyId(rule?.specialtyId ?? "");
    setRequiresPtw(rule?.requiresPtw == null ? "" : String(rule.requiresPtw));
    setAppliesToRosterRoleId(rule?.appliesToRosterRoleId ?? "");
    setActive(rule?.active ?? true);
    setSortOrder(rule?.sortOrder ?? 0);
  }, [open, rule]);

  const canSave = name.trim().length > 0 && competencyTypeId.length > 0;

  const competencyOptions = useMemo(
    () => [...competencyTypes].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
    [competencyTypes],
  );
  const typeOptions = useMemo(
    () => [...types].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.id, label: t.name })),
    [types],
  );

  function save() {
    upsert.mutate(
      {
        id: rule?.id,
        name: name.trim(),
        competencyTypeId,
        mandatory,
        appliesToTypeIds,
        minCriticality: minCriticality ? Number(minCriticality) : null,
        specialtyId: specialtyId || null,
        requiresPtw: requiresPtw === "" ? null : requiresPtw === "true",
        appliesToRosterRoleId: appliesToRosterRoleId || null,
        active,
        sortOrder,
      },
      { onSuccess: () => { toast.success(rule ? "Regla actualizada" : "Regla creada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={rule ? "Editar regla de competencia" : "Nueva regla de competencia"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!canSave} onClick={save}>Guardar</Button>
      </>
    }>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nombre *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Trabajo en altura obligatorio (alto riesgo)" />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Competencia exigida *</span>
          <Combobox options={competencyOptions} value={competencyTypeId} onChange={setCompetencyTypeId} placeholder="Selecciona…" searchPlaceholder="Buscar competencia…" />
          {competencyTypes.length === 0 && <span className={styles.hint}>No hay tipos de competencia. Crea uno en la pestaña «Competencias».</span>}
        </div>

        <label className={styles.checkboxRow}>
          <Toggle checked={mandatory} onChange={(v) => setMandatory(v)} size="sm" />
          <span>Obligatoria (su ausencia/vencimiento pone ROJO y bloquea confirmar la dotación)</span>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Aplica a tipos de OT (vacío = todos)</span>
          <MultiSelect options={typeOptions} value={appliesToTypeIds} onChange={setAppliesToTypeIds} placeholder="Todos los tipos" searchPlaceholder="Buscar tipo de OT…" />
          {appliesToTypeIds.length === 0 && <span className={styles.hint}>Aplica a TODOS los tipos de OT.</span>}
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Exigir sólo a un rol de la dotación</span>
          <Select value={appliesToRosterRoleId} onChange={(e) => setAppliesToRosterRoleId(e.target.value)}>
            <option value="">Toda la dotación</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          {!appliesToRosterRoleId && <span className={styles.hint}>Se exige a todas las personas de la dotación.</span>}
        </div>

        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Criticidad mínima</span>
            <Select value={minCriticality} onChange={(e) => setMinCriticality(e.target.value)}>
              <option value="">Cualquiera</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Especialidad</span>
            <Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
              <option value="">Cualquiera</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
        </div>

        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Permiso de trabajo (PTW)</span>
            <Select value={requiresPtw} onChange={(e) => setRequiresPtw(e.target.value)}>
              <option value="">No discrimina</option>
              <option value="true">Solo si la OT exige PTW</option>
              <option value="false">Solo si la OT NO exige PTW</option>
            </Select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Orden</span>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.checkboxRow}>
          <Toggle checked={active} onChange={(v) => setActive(v)} size="sm" />
          <span>Activa</span>
        </label>
      </div>
    </Modal>
  );
}
