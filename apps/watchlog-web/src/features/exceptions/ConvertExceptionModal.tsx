import { useMemo, useState } from "react";
import { Link2, Sparkles } from "lucide-react";
import type { ConvertExceptionRequest, IncidentPriority } from "@lyra/contracts";
import { Button, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import { useIncidentCategories, useIncidents, useIncidentTypes } from "../incidents/incidents-queries.js";
import { PRIORITY_META, severityLabel } from "../incidents/incidents-presentation.js";
import { useDedupeSuggestions } from "./exceptions-queries.js";
import { associateException, convertException } from "./exceptions-api.js";
import styles from "./exceptions.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Excepciones a agrupar (incluye la actual). */
  exceptionIds: string[];
  /** Excepción ancla para la sugerencia de dedup (la primera, normalmente). */
  anchorExceptionId: string | null;
  /** Título sugerido (campo · valor) cuando se convierte una sola. */
  suggestedTitle?: string;
  onDone: (incidentId: string) => void;
}

type Mode = "new" | "existing";

/** Convertir una o varias excepciones en incidencia nueva, o asociarlas a una
 *  existente. Muestra la sugerencia de deduplicación (mismo equipo/nodo/24 h). */
export function ConvertExceptionModal({ open, onClose, exceptionIds, anchorExceptionId, suggestedTitle, onDone }: Props) {
  const toast = useToast();
  const { can } = usePermissions();
  const canCreate = can("exception:triage") && can("incident:create");

  const { data: types = [] } = useIncidentTypes();
  const { data: categories = [] } = useIncidentCategories();
  const { data: dedupe = [], isLoading: dedupeLoading } = useDedupeSuggestions(open ? anchorExceptionId : null);

  const [mode, setMode] = useState<Mode>("new");
  const [busy, setBusy] = useState(false);

  // --- Form de incidencia nueva ---
  const [title, setTitle] = useState(suggestedTitle ?? "");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [severity, setSeverity] = useState(3);
  const [priority, setPriority] = useState<IncidentPriority>("MEDIUM");
  const catOptions = useMemo(() => categories.filter((c) => !c.typeId || c.typeId === typeId), [categories, typeId]);

  // --- Asociar a existente ---
  const [incSearch, setIncSearch] = useState("");
  const [selInc, setSelInc] = useState<string>("");
  const { data: incData } = useIncidents({ lifecycle: "OPEN", search: incSearch.trim() || undefined, pageSize: 25, page: 1 });
  const openIncidents = incData?.items ?? [];

  const n = exceptionIds.length;
  const newValid = title.trim().length >= 3 && !!typeId;

  function close() {
    setMode("new"); setTitle(suggestedTitle ?? ""); setDescription(""); setTypeId(""); setCategoryId(""); setSeverity(3); setPriority("MEDIUM"); setIncSearch(""); setSelInc("");
    onClose();
  }

  async function doAssociate(incidentId: string) {
    setBusy(true);
    try {
      const res = await associateException({ exceptionIds, incidentId });
      toast.success(n > 1 ? `${n} excepciones asociadas` : "Excepción asociada");
      onDone(res.incidentId);
      close();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo asociar");
    } finally {
      setBusy(false);
    }
  }

  async function doConvert() {
    if (!newValid) return;
    const dto: ConvertExceptionRequest = {
      exceptionIds,
      title: title.trim(),
      description: description.trim() || undefined,
      typeId,
      categoryId: categoryId || undefined,
      severity,
      priority,
    };
    setBusy(true);
    try {
      const res = await convertException(dto);
      toast.success(`Incidencia creada desde ${n > 1 ? `${n} excepciones` : "la excepción"}`);
      onDone(res.incidentId);
      close();
    } catch (e) {
      toast.error((e as Error).message || "No se pudo crear la incidencia");
    } finally {
      setBusy(false);
    }
  }

  const footer = mode === "new" ? (
    <>
      <Button variant="secondary" onClick={close}>Cancelar</Button>
      <Button variant="primary" loading={busy} disabled={!newValid || !canCreate} onClick={doConvert}>
        Crear incidencia
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={close}>Cancelar</Button>
      <Button variant="primary" loading={busy} disabled={!selInc} onClick={() => selInc && doAssociate(selInc)}>
        Asociar a la seleccionada
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title={n > 1 ? `Gestionar ${n} excepciones` : "Convertir en incidencia"} size="lg" footer={footer}>
      <div className={styles.form}>
        {/* Sugerencia de deduplicación */}
        {dedupeLoading ? (
          <div className={styles.center}><Spinner size={18} /></div>
        ) : dedupe.length > 0 ? (
          <div className={styles.dedupeBox}>
            <div className={styles.dedupeTitle}><Sparkles size={14} /> Ya existe una incidencia abierta para este equipo (últimas 24 h)</div>
            {dedupe.map((d) => (
              <div key={d.incidentId} className={styles.dedupeItem}>
                <span><span className={styles.code}>{d.code}</span> · {d.title}{d.currentStateName ? ` · ${d.currentStateName}` : ""}</span>
                <Button variant="secondary" leftIcon={<Link2 size={14} />} loading={busy} onClick={() => doAssociate(d.incidentId)}>
                  Asociar
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Selector de modo */}
        <div className={styles.modeToggle} role="tablist">
          <button role="tab" aria-selected={mode === "new"} className={mode === "new" ? styles.modeBtnActive : styles.modeBtn} onClick={() => setMode("new")}>Incidencia nueva</button>
          <button role="tab" aria-selected={mode === "existing"} className={mode === "existing" ? styles.modeBtnActive : styles.modeBtn} onClick={() => setMode("existing")}>Asociar a existente</button>
        </div>

        {mode === "new" ? (
          <>
            {!canCreate && <p className={styles.warn}>No tienes permiso para crear incidencias (requiere triage + crear incidencias).</p>}
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
              <label className={styles.field}><span className={styles.fieldLabel}>Severidad *</span>
                <Select value={String(severity)} onChange={(e) => setSeverity(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s} · {severityLabel(s)}</option>)}
                </Select>
              </label>
              <label className={styles.field}><span className={styles.fieldLabel}>Prioridad</span>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as IncidentPriority)}>
                  {(Object.keys(PRIORITY_META) as IncidentPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </Select>
              </label>
            </div>
            <p className={styles.muted}>El nodo, equipo y turno se toman del contexto de la excepción. Se vinculará{n > 1 ? `n las ${n} excepciones` : " la excepción"} a la incidencia.</p>
          </>
        ) : (
          <>
            <Input value={incSearch} onChange={(e) => setIncSearch(e.target.value)} placeholder="Buscar incidencia abierta por folio o título…" />
            <div className={styles.incPick}>
              {openIncidents.length === 0 ? (
                <p className={styles.muted}>No hay incidencias abiertas que coincidan.</p>
              ) : openIncidents.map((i) => (
                <button
                  key={i.id}
                  className={selInc === i.id ? styles.incOptionActive : styles.incOption}
                  onClick={() => setSelInc(i.id)}
                >
                  <span className={styles.code}>{i.code}</span>
                  <span style={{ flex: 1 }}>{i.title}</span>
                  <span className={styles.muted}>{i.currentStateName ?? ""}{i.dueAt ? ` · ${formatDate(i.dueAt)}` : ""}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
