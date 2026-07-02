import { useEffect, useState } from "react";
import type { WorkOrderChecklistRuleDto } from "@lyra/contracts";
import { Button, Input, Modal, Select, Toggle, useToast } from "@lyra/ui";
import {
  usePublishedTemplateOptions,
  useUpsertWorkOrderChecklistRule,
  useWorkOrderSpecialtiesAdmin,
  useWorkOrderTypesAdmin,
} from "./work-orders-queries.js";
import styles from "./catalogs.module.css";

/**
 * Alta/edición de una REGLA de checklist (Capa A). Vincula una plantilla del Form
 * Builder (publicada) con las condiciones de aplicabilidad a una OT (tipo/criticidad/
 * especialidad/PTW). Una regla `mandatory` bloquea la Puerta 2 hasta ser aprobada.
 */
export function WorkOrderChecklistRuleModal({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: WorkOrderChecklistRuleDto | null }) {
  const toast = useToast();
  const upsert = useUpsertWorkOrderChecklistRule();
  const { data: templates = [] } = usePublishedTemplateOptions();
  const { data: types = [] } = useWorkOrderTypesAdmin();
  const { data: specialties = [] } = useWorkOrderSpecialtiesAdmin();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [appliesToTypeIds, setAppliesToTypeIds] = useState<string[]>([]);
  const [minCriticality, setMinCriticality] = useState<string>("");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [requiresPtw, setRequiresPtw] = useState<string>(""); // "" | "true" | "false"
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setTemplateId(rule?.templateId ?? "");
    setMandatory(rule?.mandatory ?? false);
    setAppliesToTypeIds(rule?.appliesToTypeIds ?? []);
    setMinCriticality(rule?.minCriticality != null ? String(rule.minCriticality) : "");
    setSpecialtyId(rule?.specialtyId ?? "");
    setRequiresPtw(rule?.requiresPtw == null ? "" : String(rule.requiresPtw));
    setActive(rule?.active ?? true);
    setSortOrder(rule?.sortOrder ?? 0);
  }, [open, rule]);

  const canSave = name.trim().length > 0 && templateId.length > 0;

  function save() {
    upsert.mutate(
      {
        id: rule?.id,
        name: name.trim(),
        templateId,
        mandatory,
        appliesToTypeIds,
        minCriticality: minCriticality ? Number(minCriticality) : null,
        specialtyId: specialtyId || null,
        requiresPtw: requiresPtw === "" ? null : requiresPtw === "true",
        active,
        sortOrder,
      },
      { onSuccess: () => { toast.success(rule ? "Regla actualizada" : "Regla creada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={rule ? "Editar regla de checklist" : "Nueva regla de checklist"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!canSave} onClick={save}>Guardar</Button>
      </>
    }>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nombre *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. PTW obligatorio — Bloqueo de energías (LOTO)" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Plantilla de checklist (publicada) *</span>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Selecciona…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          {templates.length === 0 && <span className={styles.hint}>No hay plantillas publicadas. Publica una plantilla en el Form Builder para usarla como checklist.</span>}
        </label>

        <label className={styles.checkboxRow}>
          <Toggle checked={mandatory} onChange={(v) => setMandatory(v)} size="sm" />
          <span>Obligatorio (bloquea la Puerta 2 hasta ser aprobado; no removible)</span>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Aplica a tipos de OT (vacío = todos)</span>
          {/* Lista de checkboxes: clic = alterna; nunca se pierde la selección (a diferencia
              del multi-select nativo, donde un clic al vacío borraba todo). */}
          <div className={styles.typePicker}>
            {types.map((t) => {
              const checked = appliesToTypeIds.includes(t.id);
              return (
                <label key={t.id} className={checked ? `${styles.typeOption} ${styles.typeOptionOn}` : styles.typeOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setAppliesToTypeIds((prev) => (checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
                    }
                  />
                  <span>{t.name}</span>
                </label>
              );
            })}
          </div>
          <span className={styles.hint}>
            {appliesToTypeIds.length === 0
              ? "Aplica a TODOS los tipos de OT."
              : `${appliesToTypeIds.length} tipo(s) seleccionado(s).`}
          </span>
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
