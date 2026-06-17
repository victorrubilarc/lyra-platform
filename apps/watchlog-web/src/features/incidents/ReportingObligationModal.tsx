import { useEffect, useMemo, useState } from "react";
import type { IncidentTypeDto, ReportingObligationDto, UpsertReportingObligationRequest } from "@lyra/contracts";
import { Button, Input, Modal, Select, Textarea, Toggle, useToast } from "@lyra/ui";
import { useUpsertReportingObligation } from "./incidents-queries.js";
import styles from "./catalogs.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = crear; objeto = editar. */
  obligation: ReportingObligationDto | null;
  /** Tipos de incidencia para el selector de aplicabilidad. */
  types: IncidentTypeDto[];
  /** Keys ya usadas (incluye inactivas) para bloquear colisión al crear. */
  existingKeys: string[];
}

const KEY_RE = /^[a-z0-9-]+$/;

/**
 * Crear / editar una OBLIGACIÓN de reporte (catálogo configurable, Fase 4.3). Los
 * marcos regulatorios concretos por vertical se modelan aquí como datos, nunca en
 * la lógica. `appliesToTypeIds` vacío = aplica a TODOS los tipos.
 */
export function ReportingObligationModal({ open, onClose, obligation, types, existingKeys }: Props) {
  const toast = useToast();
  const upsert = useUpsertReportingObligation();
  const isEdit = obligation !== null;

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [authorityName, setAuthorityName] = useState("");
  const [defaultDueMinutes, setDefaultDueMinutes] = useState<string>("");
  const [appliesToTypeIds, setAppliesToTypeIds] = useState<string[]>([]);
  const [minSeverity, setMinSeverity] = useState<string>("");
  const [mandatory, setMandatory] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (obligation) {
      setName(obligation.name); setKey(obligation.key); setDescription(obligation.description ?? "");
      setAuthorityName(obligation.authorityName ?? "");
      setDefaultDueMinutes(obligation.defaultDueMinutes != null ? String(obligation.defaultDueMinutes) : "");
      setAppliesToTypeIds(obligation.appliesToTypeIds);
      setMinSeverity(obligation.minSeverity != null ? String(obligation.minSeverity) : "");
      setMandatory(obligation.mandatory); setSortOrder(obligation.sortOrder);
    } else {
      setName(""); setKey(""); setDescription(""); setAuthorityName(""); setDefaultDueMinutes("");
      setAppliesToTypeIds([]); setMinSeverity(""); setMandatory(false); setSortOrder(0);
    }
  }, [open, obligation]);

  const keyTaken = useMemo(
    () => !isEdit && key.trim().length > 0 && existingKeys.includes(key.trim().toLowerCase()),
    [isEdit, key, existingKeys],
  );
  const keyFormatBad = !isEdit && key.trim().length > 0 && !KEY_RE.test(key.trim());
  const valid = name.trim().length >= 1 && (isEdit || (key.trim().length >= 2 && !keyTaken && !keyFormatBad));

  function toggleType(id: string) {
    setAppliesToTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    if (!valid) return;
    const dto: UpsertReportingObligationRequest = {
      key: isEdit ? obligation.key : key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      authorityName: authorityName.trim() || null,
      defaultDueMinutes: defaultDueMinutes.trim() === "" ? null : Math.max(0, Number(defaultDueMinutes) || 0),
      appliesToTypeIds,
      minSeverity: minSeverity === "" ? null : (Number(minSeverity) as 1 | 2 | 3 | 4 | 5),
      mandatory,
      sortOrder,
    };
    upsert.mutate(
      { dto, create: !isEdit },
      {
        onSuccess: () => { toast.success(isEdit ? "Obligación actualizada" : "Obligación creada"); onClose(); },
        onError: (e) => toast.error((e as Error).message || "No se pudo guardar la obligación"),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar obligación · ${obligation.name}` : "Nueva obligación de reporte"} size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{isEdit ? "Guardar" : "Crear obligación"}</Button>
      </>
    }>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Reporte a la autoridad ambiental" autoFocus />
          </label>
          <label className={styles.field} style={{ maxWidth: 160 }}><span className={styles.fieldLabel}>Orden</span>
            <Input type="number" min={0} step={1} value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Clave (key) *</span>
          <Input value={key} mono disabled={isEdit} invalid={keyTaken || keyFormatBad}
            onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="reporte-autoridad-ambiental" />
          {isEdit
            ? <span className={styles.muted}>La clave es la identidad del catálogo y no se puede cambiar.</span>
            : keyTaken ? <span className={styles.errorText}>Ya existe una obligación con esa clave.</span>
            : keyFormatBad ? <span className={styles.errorText}>Usa solo minúsculas, números y guiones.</span>
            : <span className={styles.muted}>Minúsculas, números y guiones. No se podrá cambiar luego.</span>}
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Autoridad / obligado</span>
          <Input value={authorityName} onChange={(e) => setAuthorityName(e.target.value)} placeholder="A quién se reporta (informativo)" />
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Qué obliga este reporte…" />
        </label>

        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Plazo por defecto (minutos)</span>
            <Input type="number" min={0} step={1} value={defaultDueMinutes} onChange={(e) => setDefaultDueMinutes(e.target.value)} placeholder="Ej. 1440 = 24 h" />
            <span className={styles.muted}>Vacío = sin plazo. Define el vencimiento desde que se materializa el reporte.</span>
          </label>
          <label className={styles.field} style={{ maxWidth: 200 }}><span className={styles.fieldLabel}>Severidad mínima</span>
            <Select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="1">≥ 1 (muy baja)</option>
              <option value="2">≥ 2 (baja)</option>
              <option value="3">≥ 3 (media)</option>
              <option value="4">≥ 4 (alta)</option>
              <option value="5">5 (crítica)</option>
            </Select>
          </label>
        </div>

        <div className={styles.field}><span className={styles.fieldLabel}>Aplica a los tipos</span>
          <div className={styles.typeChecks}>
            {types.length === 0 ? <span className={styles.muted}>No hay tipos.</span> : types.map((t) => (
              <label key={t.id} className={styles.typeCheck}>
                <input type="checkbox" checked={appliesToTypeIds.includes(t.id)} onChange={() => toggleType(t.id)} />
                <span>{t.name}</span>
              </label>
            ))}
          </div>
          <span className={styles.muted}>Sin selección = aplica a TODOS los tipos (transversal).</span>
        </div>

        <div className={styles.flags}>
          <div className={styles.flagRow}>
            <Toggle checked={mandatory} onChange={setMandatory} aria-label="Obligatorio" />
            <div>
              <div className={styles.flagLabel}>Obligatorio</div>
              <div className={styles.muted}>Si el reporte sigue pendiente, BLOQUEA el cierre de la incidencia (hasta enviarlo o marcarlo "no aplica").</div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
