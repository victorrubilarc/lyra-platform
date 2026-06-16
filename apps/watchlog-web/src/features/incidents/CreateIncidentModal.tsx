import { useMemo, useState } from "react";
import type { CreateIncidentRequest, IncidentPriority } from "@lyra/contracts";
import { Button, Combobox, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { useOrgTree } from "../structure/structure-queries.js";
import { useCreateIncident, useIncidentCategories, useIncidentTypes } from "./incidents-queries.js";
import { PRIORITY_META, severityLabel } from "./incidents-presentation.js";
import styles from "./incidents.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Preselección al crear desde una bitácora. */
  originLogEntryId?: string;
  presetNodeId?: string;
}

function flatten(nodes: OrgNodeTree[], prefix = ""): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} › ${n.name}` : n.name;
    out.push({ value: n.id, label });
    if (n.children?.length) out.push(...flatten(n.children, label));
  }
  return out;
}

export function CreateIncidentModal({ open, onClose, onCreated, originLogEntryId, presetNodeId }: Props) {
  const toast = useToast();
  const { data: types = [] } = useIncidentTypes();
  const { data: categories = [] } = useIncidentCategories();
  const { data: tree = [] } = useOrgTree();
  const create = useCreateIncident();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [severity, setSeverity] = useState(3);
  const [potentialSeverity, setPotentialSeverity] = useState("");
  const [priority, setPriority] = useState<IncidentPriority>("MEDIUM");
  const [orgNodeId, setOrgNodeId] = useState(presetNodeId ?? "");

  const nodeOptions = useMemo(() => flatten(tree), [tree]);
  const catOptions = useMemo(() => categories.filter((c) => !c.typeId || c.typeId === typeId), [categories, typeId]);

  const valid = title.trim().length >= 3 && typeId && orgNodeId;

  function reset() {
    setTitle(""); setDescription(""); setTypeId(""); setCategoryId(""); setSeverity(3); setPotentialSeverity(""); setPriority("MEDIUM"); setOrgNodeId(presetNodeId ?? "");
  }

  function submit() {
    if (!valid) return;
    const dto: CreateIncidentRequest = {
      title: title.trim(),
      description: description.trim() || undefined,
      typeId,
      categoryId: categoryId || undefined,
      severity,
      potentialSeverity: potentialSeverity ? Number(potentialSeverity) : undefined,
      priority,
      orgNodeId,
      originLogEntryId: originLogEntryId ?? undefined,
    };
    create.mutate(dto, {
      onSuccess: (inc) => { toast.success(`Incidencia ${inc.code} creada`); reset(); onCreated(inc.id); },
      onError: (e) => toast.error((e as Error).message || "No se pudo crear la incidencia"),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Reportar incidencia" size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={create.isPending} disabled={!valid} onClick={submit}>Crear incidencia</Button>
      </>
    }>
      <div className={styles.form}>
        <label className={styles.field}><span className={styles.fieldLabel}>Título *</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumen breve del evento" autoFocus />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué pasó, dónde, condiciones…" />
        </label>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Tipo *</span>
            <Select value={typeId} onChange={(e) => { setTypeId(e.target.value); setCategoryId(""); }}>
              <option value="">Seleccionar…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Categoría</span>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!typeId}>
              <option value="">(sin categoría)</option>
              {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
        </div>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Severidad real *</span>
            <Select value={String(severity)} onChange={(e) => setSeverity(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s} · {severityLabel(s)}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Potencial de gravedad</span>
            <Select value={potentialSeverity} onChange={(e) => setPotentialSeverity(e.target.value)}>
              <option value="">(no evaluado)</option>
              {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s} · {severityLabel(s)}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Prioridad</span>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as IncidentPriority)}>
              {(Object.keys(PRIORITY_META) as IncidentPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </Select>
          </label>
        </div>
        <label className={styles.field}><span className={styles.fieldLabel}>Nodo / ubicación *</span>
          <Combobox options={nodeOptions} value={orgNodeId} onChange={setOrgNodeId} placeholder="Buscar nodo…" />
        </label>
        {originLogEntryId && <p className={styles.muted}>Se vinculará a la entrada de bitácora de origen.</p>}
      </div>
    </Modal>
  );
}
