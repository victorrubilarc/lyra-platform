import { useEffect, useMemo, useState } from "react";
import type { UpsertWorkOrderTypeRequest, WorkOrderTypeDto } from "@lyra/contracts";
import { Button, Input, Modal, Select, Textarea, Toggle, useToast } from "@lyra/ui";
import { useWorkflows } from "../workflows/workflows-queries.js";
import { useUpsertWorkOrderType } from "./work-orders-queries.js";
import { CATALOG_COLOR_SWATCHES, criticalityLabel } from "./work-orders-presentation.js";
import styles from "./catalogs.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = crear; objeto = editar. */
  type: WorkOrderTypeDto | null;
  /** Keys ya usadas (incluye inactivos) para bloquear colisión al crear. */
  existingKeys: string[];
}

const KEY_RE = /^[a-z0-9-]+$/;

/** Crear / editar un TIPO de orden de trabajo (catálogo configurable). */
export function WorkOrderTypeModal({ open, onClose, type, existingKeys }: Props) {
  const toast = useToast();
  const upsert = useUpsertWorkOrderType();
  const { data: workflows = [] } = useWorkflows({ status: "PUBLISHED" });
  const isEdit = type !== null;

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>("");
  const [defaultWorkflowId, setDefaultWorkflowId] = useState("");
  const [requiresPtwDefault, setRequiresPtwDefault] = useState(false);
  const [criticalityDefault, setCriticalityDefault] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (type) {
      setName(type.name); setKey(type.key); setDescription(type.description ?? ""); setColor(type.color ?? "");
      setDefaultWorkflowId(type.defaultWorkflowId ?? ""); setRequiresPtwDefault(type.requiresPtwDefault);
      setCriticalityDefault(type.criticalityDefault != null ? String(type.criticalityDefault) : ""); setSortOrder(type.sortOrder);
    } else {
      setName(""); setKey(""); setDescription(""); setColor(""); setDefaultWorkflowId("");
      setRequiresPtwDefault(false); setCriticalityDefault(""); setSortOrder(0);
    }
  }, [open, type]);

  const keyTaken = useMemo(
    () => !isEdit && key.trim().length > 0 && existingKeys.includes(key.trim().toLowerCase()),
    [isEdit, key, existingKeys],
  );
  const keyFormatBad = !isEdit && key.trim().length > 0 && !KEY_RE.test(key.trim());
  const valid = name.trim().length >= 1 && (isEdit || (key.trim().length >= 2 && !keyTaken && !keyFormatBad));

  function submit() {
    if (!valid) return;
    const dto: UpsertWorkOrderTypeRequest = {
      key: isEdit ? type.key : key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      color: color || null,
      defaultWorkflowId: defaultWorkflowId || null,
      requiresPtwDefault,
      criticalityDefault: criticalityDefault ? Number(criticalityDefault) : null,
      sortOrder,
    };
    upsert.mutate(
      { dto, create: !isEdit },
      {
        onSuccess: () => { toast.success(isEdit ? "Tipo actualizado" : "Tipo creado"); onClose(); },
        onError: (e) => toast.error((e as Error).message || "No se pudo guardar el tipo"),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar tipo · ${type.name}` : "Nuevo tipo de OT"} size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{isEdit ? "Guardar" : "Crear tipo"}</Button>
      </>
    }>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Correctiva" autoFocus />
          </label>
          <label className={styles.field} style={{ maxWidth: 160 }}><span className={styles.fieldLabel}>Orden</span>
            <Input type="number" min={0} step={1} value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Clave (key) *</span>
          <Input value={key} mono disabled={isEdit} invalid={keyTaken || keyFormatBad}
            onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="correctiva" />
          {isEdit
            ? <span className={styles.muted}>La clave es la identidad del catálogo y no se puede cambiar.</span>
            : keyTaken ? <span className={styles.errorText}>Ya existe un tipo con esa clave.</span>
            : keyFormatBad ? <span className={styles.errorText}>Usa solo minúsculas, números y guiones.</span>
            : <span className={styles.muted}>Minúsculas, números y guiones. No se podrá cambiar luego.</span>}
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Para qué se usa este tipo…" />
        </label>

        <div className={styles.field}><span className={styles.fieldLabel}>Color del chip</span>
          <div className={styles.swatches}>
            <button type="button" className={color === "" ? styles.swatchNoneActive : styles.swatchNone} onClick={() => setColor("")} title="Sin color">—</button>
            {CATALOG_COLOR_SWATCHES.map((s) => (
              <button key={s.value} type="button" title={s.label} aria-label={s.label}
                className={color === s.value ? styles.swatchActive : styles.swatch}
                style={{ ["--sw" as string]: s.value }} onClick={() => setColor(s.value)} />
            ))}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Flujo por defecto</span>
            <Select value={defaultWorkflowId} onChange={(e) => setDefaultWorkflowId(e.target.value)}>
              <option value="">(usar flujo global de OT)</option>
              {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
            <span className={styles.muted}>Se congela al crear una OT de este tipo (S2). Vacío = flujo global.</span>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Criticidad sugerida</span>
            <Select value={criticalityDefault} onChange={(e) => setCriticalityDefault(e.target.value)}>
              <option value="">(sin sugerencia)</option>
              {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>{c} · {criticalityLabel(c)}</option>)}
            </Select>
            <span className={styles.muted}>Prellena la criticidad al crear una OT de este tipo.</span>
          </label>
        </div>

        <div className={styles.flags}>
          <div className={styles.flagRow}>
            <Toggle checked={requiresPtwDefault} onChange={setRequiresPtwDefault} aria-label="Requiere PTW por defecto" />
            <div>
              <div className={styles.flagLabel}>Requiere permiso de trabajo (PTW) por defecto</div>
              <div className={styles.muted}>Las OT de este tipo prellenan "Requiere PTW" (trabajo de alto riesgo: LOTO, altura, espacio confinado…).</div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
