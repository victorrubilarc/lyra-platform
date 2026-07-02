import { useMemo, useState } from "react";
import type { CreateWorkOrderRequest, OrgNodeTree, WorkOrderPriority } from "@lyra/contracts";
import { Button, Combobox, Input, Modal, Select, Stepper, Textarea, useToast } from "@lyra/ui";
import { useAccessibleOrgTree } from "../structure/structure-queries.js";
import {
  useCreateWorkOrder,
  useWorkOrderEquipmentOptions,
  useWorkOrderSpecialties,
  useWorkOrderTypes,
} from "./work-orders-queries.js";
import { PRIORITY_META, criticalityLabel } from "./work-orders-presentation.js";
import styles from "./work-orders.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  presetNodeId?: string;
}

/** Aplana el árbol de nodos: label = nombre; hint = ruta de ancestros. */
function flatten(nodes: OrgNodeTree[], prefix = ""): { value: string; label: string; hint?: string }[] {
  const out: { value: string; label: string; hint?: string }[] = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: n.name, hint: prefix || undefined });
    const childPrefix = prefix ? `${prefix} › ${n.name}` : n.name;
    if (n.children?.length) out.push(...flatten(n.children, childPrefix));
  }
  return out;
}

const STEPS = [
  { id: "que", label: "Trabajo", hint: "Qué y de qué tipo" },
  { id: "donde", label: "Ubicación", hint: "Dónde y clasificación" },
];

/**
 * Asistente de nueva SOLICITUD de OT (S1). Dos pasos: (1) el trabajo (título,
 * descripción, tipo, criticidad, prioridad, PTW); (2) la ubicación + clasificación
 * (nodo/equipo, áreas, especialidades, responsable). El backend valida todo (nodo
 * ABAC, tipo activo, equipo del nodo, catálogos activos).
 */
export function CreateWorkOrderModal({ open, onClose, onCreated, presetNodeId }: Props) {
  const toast = useToast();
  const { data: types = [] } = useWorkOrderTypes();
  const { data: specialties = [] } = useWorkOrderSpecialties();
  const { data: tree = [] } = useAccessibleOrgTree();
  const create = useCreateWorkOrder();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [criticality, setCriticality] = useState(3);
  const [priority, setPriority] = useState<WorkOrderPriority>("MEDIUM");
  const [requiresPtw, setRequiresPtw] = useState(false);
  const [orgNodeId, setOrgNodeId] = useState(presetNodeId ?? "");
  const [equipmentId, setEquipmentId] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");

  const nodeOptions = useMemo(() => flatten(tree), [tree]);
  const { data: equipment = [] } = useWorkOrderEquipmentOptions(orgNodeId || undefined);
  const equipmentOptions = useMemo(
    () => [
      { value: "", label: "(sin equipo)" },
      ...equipment.map((e) => ({ value: e.id, label: e.tag ? `${e.name} · ${e.tag}` : e.name })),
    ],
    [equipment],
  );

  const step1Valid = title.trim().length >= 3 && !!typeId;
  const valid = step1Valid && !!orgNodeId;

  function changeType(id: string) {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) {
      if (t.criticalityDefault) setCriticality(t.criticalityDefault);
      setRequiresPtw(t.requiresPtwDefault);
    }
  }

  function changeNode(id: string) {
    setOrgNodeId(id);
    setEquipmentId("");
  }

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function reset() {
    setStep(0); setTitle(""); setDescription(""); setTypeId(""); setCriticality(3); setPriority("MEDIUM");
    setRequiresPtw(false); setOrgNodeId(presetNodeId ?? ""); setEquipmentId(""); setLocationDetail("");
    setSpecialtyIds([]); setDueAt("");
  }

  function submit() {
    if (!valid) return;
    const dto: CreateWorkOrderRequest = {
      title: title.trim(),
      description: description.trim() || undefined,
      typeId,
      criticality,
      priority,
      requiresPtw,
      orgNodeId,
      equipmentId: equipmentId || undefined,
      locationDetail: locationDetail.trim() || undefined,
      specialtyIds: specialtyIds.length ? specialtyIds : undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    };
    create.mutate(dto, {
      onSuccess: (wo) => { toast.success(`Solicitud ${wo.code} creada`); reset(); onCreated(wo.id); },
      onError: (e) => toast.error((e as Error).message || "No se pudo crear la solicitud"),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva solicitud de trabajo"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Atrás</Button>}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!step1Valid} onClick={() => setStep(step + 1)}>Siguiente</Button>
          ) : (
            <Button variant="primary" loading={create.isPending} disabled={!valid} onClick={submit}>Crear solicitud</Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        <Stepper steps={STEPS} current={step} onStepClick={(i) => i < step && setStep(i)} />

        {step === 0 ? (
          <>
            <label className={styles.field}><span className={styles.fieldLabel}>Título *</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumen breve del trabajo" autoFocus />
            </label>
            <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué hay que hacer, alcance, condiciones…" />
            </label>
            <div className={styles.formRow}>
              <label className={styles.field}><span className={styles.fieldLabel}>Tipo *</span>
                <Select value={typeId} onChange={(e) => changeType(e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </label>
              <label className={styles.field}><span className={styles.fieldLabel}>Criticidad *</span>
                <Select value={String(criticality)} onChange={(e) => setCriticality(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>{c} · {criticalityLabel(c)}</option>)}
                </Select>
              </label>
              <label className={styles.field}><span className={styles.fieldLabel}>Prioridad</span>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}>
                  {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </Select>
              </label>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={requiresPtw} onChange={(e) => setRequiresPtw(e.target.checked)} />
              Requiere Permiso de Trabajo (PTW) — trabajo de alto riesgo
            </label>
          </>
        ) : (
          <>
            <div className={styles.formRow}>
              <label className={styles.field}><span className={styles.fieldLabel}>Nodo / ubicación *</span>
                <Combobox options={nodeOptions} value={orgNodeId} onChange={changeNode} placeholder="Buscar nodo…" />
              </label>
              <label className={styles.field}><span className={styles.fieldLabel}>Equipo / activo</span>
                <Combobox
                  options={equipmentOptions}
                  value={equipmentId}
                  onChange={setEquipmentId}
                  placeholder={orgNodeId ? "Buscar equipo…" : "Elige un nodo primero"}
                  disabled={!orgNodeId}
                />
              </label>
            </div>
            <label className={styles.field}><span className={styles.fieldLabel}>Detalle de ubicación</span>
              <Input value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} placeholder="Ej. Chancador primario, nivel 3" />
            </label>
            <div className={styles.field}><span className={styles.fieldLabel}>Especialidades</span>
              <div className={styles.chips}>
                {specialties.length === 0 && <span className={styles.muted}>Sin especialidades en el catálogo</span>}
                {specialties.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={specialtyIds.includes(s.id) ? `${styles.chipToggle} ${styles.chipToggleOn}` : styles.chipToggle}
                    onClick={() => toggle(specialtyIds, s.id, setSpecialtyIds)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.field}><span className={styles.fieldLabel}>Fecha límite (SLA)</span>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
