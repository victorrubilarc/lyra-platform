import { useEffect, useMemo, useState } from "react";
import type { IncidentTypeDto, UpsertIncidentTypeRequest } from "@lyra/contracts";
import { Button, Input, Modal, Select, Textarea, Toggle, useToast } from "@lyra/ui";
import { useWorkflows } from "../workflows/workflows-queries.js";
import { SlaDurationField } from "../workflows/SlaDurationField.js";
import { useRoles } from "../security/security-queries.js";
import { useUpsertIncidentType } from "./incidents-queries.js";
import { CATALOG_COLOR_SWATCHES } from "./incidents-presentation.js";
import styles from "./catalogs.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = crear; objeto = editar. */
  type: IncidentTypeDto | null;
  /** Keys ya usadas (incluye inactivos) para bloquear colisión al crear. */
  existingKeys: string[];
}

const KEY_RE = /^[a-z0-9-]+$/;

/** Crear / editar un TIPO de incidencia (catálogo configurable). */
export function IncidentTypeModal({ open, onClose, type, existingKeys }: Props) {
  const toast = useToast();
  const upsert = useUpsertIncidentType();
  const { data: workflows = [] } = useWorkflows({ status: "PUBLISHED" });
  // Roles para el escalamiento (gate role:read; degrada a lista vacía sin permiso).
  const { data: roles = [] } = useRoles();
  const isEdit = type !== null;

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>("");
  const [defaultWorkflowId, setDefaultWorkflowId] = useState("");
  const [requiresInvestigation, setRequiresInvestigation] = useState(false);
  const [requiresCapa, setRequiresCapa] = useState(false);
  const [reportableDefault, setReportableDefault] = useState(false);
  const [resolutionDueMinutes, setResolutionDueMinutes] = useState<number | null>(null);
  const [escalationAfterMinutes, setEscalationAfterMinutes] = useState<number | null>(null);
  const [escalationRoleId, setEscalationRoleId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (type) {
      setName(type.name); setKey(type.key); setDescription(type.description ?? ""); setColor(type.color ?? "");
      setDefaultWorkflowId(type.defaultWorkflowId ?? ""); setRequiresInvestigation(type.requiresInvestigation);
      setRequiresCapa(type.requiresCapa); setReportableDefault(type.reportableDefault); setSortOrder(type.sortOrder);
      setResolutionDueMinutes(type.resolutionDueMinutes); setEscalationAfterMinutes(type.escalationAfterMinutes);
      setEscalationRoleId(type.escalationRoleId ?? "");
    } else {
      setName(""); setKey(""); setDescription(""); setColor(""); setDefaultWorkflowId("");
      setRequiresInvestigation(false); setRequiresCapa(false); setReportableDefault(false); setSortOrder(0);
      setResolutionDueMinutes(null); setEscalationAfterMinutes(null); setEscalationRoleId("");
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
    const dto: UpsertIncidentTypeRequest = {
      key: isEdit ? type.key : key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      color: color || null,
      defaultWorkflowId: defaultWorkflowId || null,
      requiresInvestigation,
      requiresCapa,
      reportableDefault,
      resolutionDueMinutes: resolutionDueMinutes ?? null,
      escalationAfterMinutes: escalationAfterMinutes ?? null,
      escalationRoleId: escalationRoleId || null,
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
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar tipo · ${type.name}` : "Nuevo tipo de incidencia"} size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{isEdit ? "Guardar" : "Crear tipo"}</Button>
      </>
    }>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Seguridad" autoFocus />
          </label>
          <label className={styles.field} style={{ maxWidth: 160 }}><span className={styles.fieldLabel}>Orden</span>
            <Input type="number" min={0} step={1} value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Clave (key) *</span>
          <Input value={key} mono disabled={isEdit} invalid={keyTaken || keyFormatBad}
            onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="seguridad" />
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

        <label className={styles.field}><span className={styles.fieldLabel}>Flujo por defecto</span>
          <Select value={defaultWorkflowId} onChange={(e) => setDefaultWorkflowId(e.target.value)}>
            <option value="">(usar flujo global de incidencias)</option>
            {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <span className={styles.muted}>Se congela al crear una incidencia de este tipo. Vacío = flujo global.</span>
        </label>

        <div className={styles.flags}>
          <FlagRow label="Requiere investigación" hint="Las incidencias de este tipo exigen investigación de causa raíz para cerrar." checked={requiresInvestigation} onChange={setRequiresInvestigation} />
          <FlagRow label="Requiere CAPA" hint="Acciones correctivas/preventivas obligatorias para cerrar (verificación de eficacia)." checked={requiresCapa} onChange={setRequiresCapa} />
          <FlagRow label="Reportable por defecto" hint="Al crear la incidencia, materializa los reportes de las obligaciones aplicables (autoridades)." checked={reportableDefault} onChange={setReportableDefault} />
        </div>

        {/* SLA de resolución + escalamiento (Fase 4.4) */}
        <div className={styles.field}><span className={styles.fieldLabel}>Plazo de resolución (SLA)</span>
          <SlaDurationField key={`res-${type?.id ?? "new"}`} minutes={resolutionDueMinutes} onChange={setResolutionDueMinutes} />
          <span className={styles.muted}>Al crear la incidencia se fija su plazo automáticamente (creación + este tiempo). El operador puede sobrescribirlo. Vacío = sin plazo automático.</span>
        </div>

        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Escalar tras el plazo</span>
            <SlaDurationField key={`esc-${type?.id ?? "new"}`} minutes={escalationAfterMinutes} onChange={setEscalationAfterMinutes} />
            <span className={styles.muted}>Tiempo adicional, ya vencido el plazo, antes de avisar también al rol superior.</span>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Rol de escalamiento</span>
            <Select value={escalationRoleId} onChange={(e) => setEscalationRoleId(e.target.value)}>
              <option value="">(sin escalamiento)</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <span className={styles.muted}>Recibe el aviso de plazo cuando se supera el tiempo de escalamiento.</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

function FlagRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.flagRow}>
      <Toggle checked={checked} onChange={onChange} aria-label={label} />
      <div>
        <div className={styles.flagLabel}>{label}</div>
        <div className={styles.muted}>{hint}</div>
      </div>
    </div>
  );
}
