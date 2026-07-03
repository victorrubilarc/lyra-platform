import { useEffect, useState } from "react";
import {
  COMPETENCY_CATEGORIES,
  COMPETENCY_CATEGORY_META,
  DEFAULT_COMPETENCY_WARNING_LEAD_DAYS,
  type CompetencyCategory,
  type CompetencyTypeDto,
} from "@lyra/contracts";
import { Button, Input, Modal, Select, Toggle, useToast } from "@lyra/ui";
import { useUpsertCompetencyType } from "./work-orders-queries.js";
import styles from "./catalogs.module.css";

/**
 * Alta/edición de un TIPO de competencia (S2): qué certificación/formación existe, su
 * categoría, si vence, y la ventana de aviso previo. Traza ISO 45001 §7.2 (competencia
 * necesaria) + Maximo/SAP validity. Gobernado por `workordercatalog:manage`.
 */
export function CompetencyTypeModal({ open, onClose, type }: { open: boolean; onClose: () => void; type: CompetencyTypeDto | null }) {
  const toast = useToast();
  const upsert = useUpsertCompetencyType();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<CompetencyCategory>("CERTIFICATION");
  const [description, setDescription] = useState("");
  const [requiresExpiry, setRequiresExpiry] = useState(true);
  const [defaultValidityDays, setDefaultValidityDays] = useState<string>("");
  const [warningLeadDays, setWarningLeadDays] = useState<string>("");
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(type?.name ?? "");
    setCategory(type?.category ?? "CERTIFICATION");
    setDescription(type?.description ?? "");
    setRequiresExpiry(type?.requiresExpiry ?? true);
    setDefaultValidityDays(type?.defaultValidityDays != null ? String(type.defaultValidityDays) : "");
    setWarningLeadDays(type?.warningLeadDays != null ? String(type.warningLeadDays) : "");
    setActive(type?.active ?? true);
    setSortOrder(type?.sortOrder ?? 0);
  }, [open, type]);

  const canSave = name.trim().length > 0;

  function save() {
    upsert.mutate(
      {
        id: type?.id,
        name: name.trim(),
        category,
        description: description.trim() || null,
        requiresExpiry,
        defaultValidityDays: defaultValidityDays ? Number(defaultValidityDays) : null,
        warningLeadDays: warningLeadDays ? Number(warningLeadDays) : null,
        active,
        sortOrder,
      },
      { onSuccess: () => { toast.success(type ? "Competencia actualizada" : "Competencia creada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={type ? "Editar tipo de competencia" : "Nuevo tipo de competencia"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!canSave} onClick={save}>Guardar</Button>
      </>
    }>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nombre *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Trabajo en altura" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Categoría *</span>
          <Select value={category} onChange={(e) => setCategory(e.target.value as CompetencyCategory)}>
            {COMPETENCY_CATEGORIES.map((c) => <option key={c} value={c}>{COMPETENCY_CATEGORY_META[c].label}</option>)}
          </Select>
          <span className={styles.hint}>{COMPETENCY_CATEGORY_META[category].hint}</span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Descripción</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </label>

        <label className={styles.checkboxRow}>
          <Toggle checked={requiresExpiry} onChange={(v) => setRequiresExpiry(v)} size="sm" />
          <span>Tiene vencimiento (exige fecha al registrarla)</span>
        </label>

        {requiresExpiry && (
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Vigencia típica (días)</span>
              <Input type="number" value={defaultValidityDays} onChange={(e) => setDefaultValidityDays(e.target.value)} placeholder="Ej. 365" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Aviso previo (días)</span>
              <Input type="number" value={warningLeadDays} onChange={(e) => setWarningLeadDays(e.target.value)} placeholder={`Por defecto ${DEFAULT_COMPETENCY_WARNING_LEAD_DAYS}`} />
            </label>
          </div>
        )}

        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Orden</span>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
          <label className={styles.checkboxRow} style={{ alignSelf: "end", paddingBottom: 8 }}>
            <Toggle checked={active} onChange={(v) => setActive(v)} size="sm" />
            <span>Activa</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
