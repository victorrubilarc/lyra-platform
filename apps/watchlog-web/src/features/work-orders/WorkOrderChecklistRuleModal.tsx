import { useEffect, useMemo, useState } from "react";
import type { WorkOrderChecklistRuleDto } from "@lyra/contracts";
import { Button, Combobox, Input, Modal, MultiSelect, Select, Toggle, useToast } from "@lyra/ui";
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
  const [showAllTemplates, setShowAllTemplates] = useState(false);

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

  // Opciones ORDENADAS alfabéticamente para búsqueda rápida (Combobox/MultiSelect filtran
  // al escribir ⇒ funciona igual con pocas o con muchas plantillas/tipos).
  // Por defecto se ofrecen SOLO las plantillas marcadas como «checklist» (fork W5); si no
  // hay ninguna marcada, se muestran todas (para no dejar el picker vacío). Toggle «ver todas».
  const checklistTemplates = useMemo(() => templates.filter((t) => t.purpose === "CHECKLIST"), [templates]);
  const noChecklistTemplates = checklistTemplates.length === 0;
  const templateOptions = useMemo(() => {
    const base = showAllTemplates || noChecklistTemplates ? templates : checklistTemplates;
    // La plantilla ya seleccionada (aunque no sea checklist) SIEMPRE visible (editar reglas viejas).
    const withSelected =
      templateId && !base.some((t) => t.id === templateId) ? [...base, ...templates.filter((t) => t.id === templateId)] : base;
    return [...withSelected].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.id, label: t.name }));
  }, [templates, checklistTemplates, showAllTemplates, noChecklistTemplates, templateId]);
  const typeOptions = useMemo(
    () => [...types].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ value: t.id, label: t.name })),
    [types],
  );

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

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Plantilla de checklist (publicada) *</span>
          <Combobox
            options={templateOptions}
            value={templateId}
            onChange={setTemplateId}
            placeholder="Selecciona…"
            searchPlaceholder="Buscar plantilla…"
          />
          {templates.length === 0 ? (
            <span className={styles.hint}>No hay plantillas publicadas. Publica una plantilla en el Form Builder para usarla como checklist.</span>
          ) : noChecklistTemplates ? (
            <span className={styles.hint}>Aún no hay plantillas marcadas como «checklist». Marca el propósito de una plantilla en el Form Builder para filtrarlas aquí; por ahora se muestran todas.</span>
          ) : (
            <label className={styles.checkboxRow} style={{ marginTop: 2 }}>
              <Toggle checked={showAllTemplates} onChange={(v) => setShowAllTemplates(v)} size="sm" />
              <span>Ver todas las plantillas (no solo las de tipo checklist)</span>
            </label>
          )}
        </div>

        <label className={styles.checkboxRow}>
          <Toggle checked={mandatory} onChange={(v) => setMandatory(v)} size="sm" />
          <span>Obligatorio (impide avanzar hasta ser aprobado; no removible)</span>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Aplica a tipos de OT (vacío = todos)</span>
          {/* MultiSelect buscable + chips: encuentra rápido con muchos tipos y siempre
              muestra lo elegido; un clic no borra la selección (a diferencia del nativo). */}
          <MultiSelect
            options={typeOptions}
            value={appliesToTypeIds}
            onChange={setAppliesToTypeIds}
            placeholder="Todos los tipos"
            searchPlaceholder="Buscar tipo de OT…"
          />
          {appliesToTypeIds.length === 0 && <span className={styles.hint}>Aplica a TODOS los tipos de OT.</span>}
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
