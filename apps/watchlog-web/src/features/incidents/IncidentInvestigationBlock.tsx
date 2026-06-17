import { useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, Plus, RotateCcw, Save, Target, Trash2 } from "lucide-react";
import type { InvestigationStepInput } from "@lyra/contracts";
import { isInvestigationComplete } from "@lyra/contracts";
import { Button, Input, Spinner, Textarea, useToast } from "@lyra/ui";
import {
  useCompleteIncidentInvestigation,
  useIncidentInvestigation,
  useReopenIncidentInvestigation,
  useUpsertIncidentInvestigation,
} from "./incidents-queries.js";
import styles from "./incidents.module.css";

interface Props {
  incidentId: string;
  /** ¿El tipo de incidencia EXIGE investigación para cerrar? (aviso). */
  requiresInvestigation: boolean;
  /** Las mutaciones solo se ofrecen mientras la incidencia está abierta + con permiso. */
  incidentOpen: boolean;
  canEdit: boolean;
}

type EditStep = InvestigationStepInput & { statement: string; answer: string; isRootCause: boolean };

/**
 * Investigación de causa raíz por el método 5 Porqués (Fase 4.2b). En DRAFT (con
 * permiso `incident:edit` y la incidencia abierta) se edita la cadena de "porqués"
 * y se marcan causas raíz; al completar se exige ≥1 causa raíz. Una investigación
 * COMPLETED con causa raíz es la que libera el cierre cuando el tipo lo exige (el
 * servidor es autoritativo; aquí avisamos).
 */
export function IncidentInvestigationBlock({ incidentId, requiresInvestigation, incidentOpen, canEdit }: Props) {
  const toast = useToast();
  const { data: investigation, isLoading } = useIncidentInvestigation(incidentId);
  const upsert = useUpsertIncidentInvestigation(incidentId);
  const complete = useCompleteIncidentInvestigation(incidentId);
  const reopen = useReopenIncidentInvestigation(incidentId);

  const isDraft = !investigation || investigation.status === "DRAFT";
  const editable = canEdit && incidentOpen && isDraft;

  // Estado de edición (inicializado del servidor; solo relevante en modo editable).
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState("");
  const [steps, setSteps] = useState<EditStep[]>([]);

  function startEdit() {
    setProblem(investigation?.problemStatement ?? "");
    setSteps(
      (investigation?.steps ?? []).map((s) => ({ statement: s.statement, answer: s.answer ?? "", isRootCause: s.isRootCause })),
    );
    if (!investigation || investigation.steps.length === 0) {
      setSteps([{ statement: "", answer: "", isRootCause: false }]);
    }
    setEditing(true);
  }

  function save() {
    const cleaned = steps
      .map((s) => ({ statement: s.statement.trim(), answer: s.answer.trim() || null, isRootCause: s.isRootCause }))
      .filter((s) => s.statement.length >= 3);
    upsert.mutate(
      { problemStatement: problem.trim(), steps: cleaned },
      {
        onSuccess: () => { setEditing(false); toast.success("Investigación guardada"); },
        onError: (e) => toast.error((e as Error).message || "No se pudo guardar"),
      },
    );
  }

  function doComplete() {
    complete.mutate({}, {
      onSuccess: () => toast.success("Investigación completada"),
      onError: (e) => toast.error((e as Error).message || "No se pudo completar"),
    });
  }

  if (isLoading) {
    return (
      <div className={styles.originBox}>
        <div className={styles.originTitle}><GitBranch size={14} /> Investigación de causa raíz</div>
        <div className={styles.center}><Spinner /></div>
      </div>
    );
  }

  const complete5 = isInvestigationComplete(investigation);
  const blocks = requiresInvestigation && !complete5;
  const rootCauses = (investigation?.steps ?? []).filter((s) => s.isRootCause);
  const canSaveEdit = problem.trim().length >= 3;
  const editHasRoot = steps.some((s) => s.isRootCause && s.statement.trim().length >= 3);

  return (
    <div className={styles.originBox}>
      <div className={styles.invHead}>
        <div className={styles.originTitle}><GitBranch size={14} /> Investigación de causa raíz · 5 Porqués</div>
        {investigation && !editing && (
          <span
            className={styles.invStatusChip}
            style={investigation.status === "COMPLETED"
              ? { color: "var(--color-success)", borderColor: "var(--color-success)" }
              : { color: "var(--color-warning)", borderColor: "var(--color-warning)" }}
          >
            {investigation.status === "COMPLETED" ? "Completada" : "Borrador"}
          </span>
        )}
      </div>

      {blocks && (
        <div className={styles.actionWarn}>
          <AlertTriangle size={14} /> Este tipo de incidencia exige una investigación de causa raíz completada (con al menos una causa raíz) para cerrar.
        </div>
      )}

      {/* --- Modo edición --- */}
      {editing ? (
        <div className={styles.whyStepBody}>
          <label className={styles.field}><span className={styles.fieldLabel}>Problema a investigar</span>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="Enunciado del problema (el evento a explicar)" />
          </label>
          <ol className={styles.whyChain}>
            {steps.map((s, i) => (
              <li key={i} className={s.isRootCause ? `${styles.whyStep} ${styles.whyStepRoot}` : styles.whyStep}>
                <div className={styles.whyStepHead}>
                  <span className={styles.whyNum}>¿Por qué? {i + 1}</span>
                  <button type="button" className={styles.iconBtn} onClick={() => setSteps(steps.filter((_, j) => j !== i))} title="Quitar" aria-label="Quitar paso">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={styles.whyStepBody}>
                  <Input
                    value={s.statement}
                    onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)))}
                    placeholder={i === 0 ? "¿Por qué ocurrió el problema?" : "¿Por qué ocurrió lo anterior?"}
                  />
                  <Input
                    value={s.answer}
                    onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                    placeholder="Respuesta / causa (opcional)"
                  />
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={s.isRootCause}
                      onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, isRootCause: e.target.checked } : x)))}
                    />
                    <span>Es una causa raíz</span>
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.whyRowBtns}>
            {steps.length < 20 && (
              <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setSteps([...steps, { statement: "", answer: "", isRootCause: false }])}>
                Agregar porqué
              </Button>
            )}
          </div>
          {!editHasRoot && <div className={styles.muted}>Marca al menos una causa raíz para poder completar la investigación.</div>}
          <div className={styles.whyRowBtns}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" leftIcon={<Save size={14} />} loading={upsert.isPending} disabled={!canSaveEdit} onClick={save}>Guardar</Button>
          </div>
        </div>
      ) : (
        /* --- Modo lectura --- */
        <>
          {!investigation ? (
            <div className={styles.muted}>Sin investigación registrada.</div>
          ) : (
            <>
              <div className={styles.invProblem}>Problema: {investigation.problemStatement}</div>
              {investigation.steps.length > 0 && (
                <ol className={styles.whyChain}>
                  {investigation.steps.map((s) => (
                    <li key={s.id} className={s.isRootCause ? `${styles.whyStep} ${styles.whyStepRoot}` : styles.whyStep}>
                      <div className={styles.whyStepHead}>
                        <span className={styles.whyNum}>¿Por qué? {s.order}</span>
                        {s.isRootCause && <span className={styles.whyRootTag}><Target size={12} /> Causa raíz</span>}
                      </div>
                      <div>{s.statement}</div>
                      {s.answer && <div className={styles.actionDesc}>→ {s.answer}</div>}
                    </li>
                  ))}
                </ol>
              )}
              {investigation.rootCauseSummary && (
                <div className={styles.actionNote}>Síntesis de causa raíz: {investigation.rootCauseSummary}</div>
              )}
              {investigation.status === "COMPLETED" && rootCauses.length > 0 && (
                <div className={styles.actionNote}><CheckCircle2 size={12} /> {rootCauses.length} causa(s) raíz identificada(s){investigation.completedByName ? ` · ${investigation.completedByName}` : ""}</div>
              )}
            </>
          )}

          {canEdit && incidentOpen && (
            <div className={styles.whyRowBtns}>
              {editable && (
                <Button variant="secondary" leftIcon={<GitBranch size={14} />} onClick={startEdit}>
                  {investigation ? "Editar cadena" : "Iniciar investigación"}
                </Button>
              )}
              {isDraft && investigation && (
                <Button variant="primary" leftIcon={<CheckCircle2 size={14} />} loading={complete.isPending} onClick={doComplete}>
                  Completar
                </Button>
              )}
              {investigation?.status === "COMPLETED" && (
                <Button variant="secondary" leftIcon={<RotateCcw size={14} />} loading={reopen.isPending} onClick={() =>
                  reopen.mutate(undefined, { onError: (e) => toast.error((e as Error).message) })
                }>
                  Reabrir
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
