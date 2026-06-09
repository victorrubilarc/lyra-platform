import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Info, ListChecks, PlayCircle, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button, Card, Checkbox, Chip, cx, FormField, Input, Modal, MultiSelect, Select, Textarea, Toggle, useToast } from "@lyra/ui";
import { validateWorkflowMachine, type WorkflowDetail } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { fetchRoles } from "../security/security-api.js";
import {
  collectStateKeys,
  collectTransitionKeys,
  detailToEditWorkflow,
  editWorkflowToDraftRequest,
  nextUid,
  slugifyKey,
  uniqueKey,
  type EditWorkflow,
  type EditWorkflowState,
  type EditWorkflowTransition,
} from "./workflow-builder-model.js";
import { usePublishWorkflow, useSaveWorkflowDraft } from "./workflows-queries.js";
import styles from "./WorkflowBuilder.module.css";

const STATE_COLORS = ["accent", "success", "warning", "error", "info", "muted"] as const;

export function WorkflowBuilder({ detail }: { detail: WorkflowDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const perms = usePermissions();

  const [wf, setWf] = useState<EditWorkflow>(() => detailToEditWorkflow(detail));
  const [dirty, setDirty] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [collapsedTransitions, setCollapsedTransitions] = useState<Set<string>>(new Set());

  function toggleTransitionCollapse(uid: string) {
    setCollapsedTransitions((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const save = useSaveWorkflowDraft();
  const publish = usePublishWorkflow();
  const rolesQuery = useQuery({ queryKey: ["workflows", "roles"], queryFn: fetchRoles, retry: false });
  const roles = rolesQuery.data ?? [];

  const canEdit = perms.can("workflow:manage");
  const isPublishedView = detail.version.status === "PUBLISHED";

  // Validación de la máquina en vivo (misma fuente que el backend).
  const issues = useMemo(
    () =>
      validateWorkflowMachine(
        wf.states.map((s) => ({ key: s.key, isInitial: s.isInitial, isFinal: s.isFinal })),
        wf.transitions.map((tr) => ({ key: tr.key, fromStateKey: tr.fromStateKey, toStateKey: tr.toStateKey })),
      ),
    [wf],
  );
  // Errores de integridad (rojo, bloquean guardar+publicar) vs pendientes de
  // conexión (ámbar, solo bloquean publicar — normal en un borrador a medio hacer).
  const errors = issues.filter((i) => i.severity === "error");
  const pending = issues.filter((i) => i.severity === "pending");
  const valid = issues.length === 0; // habilita Publicar
  const canSaveMachine = errors.length === 0; // habilita Guardar borrador

  function patch(next: EditWorkflow) {
    setWf(next);
    setDirty(true);
  }

  // ── Estados ────────────────────────────────────────────────────────────────
  function addState() {
    const name = t("workflows.builder.stateDefault", { n: wf.states.length + 1 });
    const key = uniqueKey(slugifyKey(name, `estado_${wf.states.length + 1}`), collectStateKeys(wf));
    const isInitial = wf.states.length === 0; // el primero es inicial por defecto
    const state: EditWorkflowState = { uid: nextUid(), key, name, description: null, isInitial, isFinal: false, color: null };
    patch({ ...wf, states: [...wf.states, state] });
  }

  function updateState(uid: string, p: Partial<EditWorkflowState>) {
    const claimsInitial = p.isInitial === true;
    patch({
      ...wf,
      states: wf.states.map((s) => {
        if (s.uid === uid) return { ...s, ...p };
        if (claimsInitial && s.isInitial) return { ...s, isInitial: false }; // único inicial
        return s;
      }),
    });
  }

  function deleteState(uid: string) {
    const state = wf.states.find((s) => s.uid === uid);
    if (!state) return;
    patch({
      ...wf,
      states: wf.states.filter((s) => s.uid !== uid),
      // Quita transiciones que referencian el estado borrado.
      transitions: wf.transitions.filter((tr) => tr.fromStateKey !== state.key && tr.toStateKey !== state.key),
    });
  }

  // ── Transiciones ─────────────────────────────────────────────────────────────
  function addTransition() {
    if (wf.states.length < 1) return;
    const from = wf.states[0]!.key;
    const to = wf.states[wf.states.length - 1]!.key;
    const label = t("workflows.builder.transitionDefault", { n: wf.transitions.length + 1 });
    const key = uniqueKey(slugifyKey(label, `transicion_${wf.transitions.length + 1}`), collectTransitionKeys(wf));
    const tr: EditWorkflowTransition = {
      uid: nextUid(),
      key,
      label,
      fromStateKey: from,
      toStateKey: to,
      requireSignature: false,
      signatureMeaning: null,
      requireMfa: false,
      roleIds: [],
    };
    patch({ ...wf, transitions: [...wf.transitions, tr] });
  }

  function updateTransition(uid: string, p: Partial<EditWorkflowTransition>) {
    patch({ ...wf, transitions: wf.transitions.map((tr) => (tr.uid === uid ? { ...tr, ...p } : tr)) });
  }

  function deleteTransition(uid: string) {
    patch({ ...wf, transitions: wf.transitions.filter((tr) => tr.uid !== uid) });
  }

  // ── Guardar / publicar ───────────────────────────────────────────────────────
  async function handleSave(): Promise<boolean> {
    try {
      await save.mutateAsync({ id: detail.id, dto: editWorkflowToDraftRequest(wf) });
      setDirty(false);
      toast.success(t("workflows.builder.saved"));
      return true;
    } catch {
      toast.error(t("workflows.builder.saveError"));
      return false;
    }
  }

  async function handlePublish() {
    const ok = await handleSave();
    if (!ok) return;
    try {
      await publish.mutateAsync({ id: detail.id });
      setPublishOpen(false);
      toast.success(t("workflows.builder.published"));
    } catch {
      toast.error(t("workflows.builder.publishError"));
    }
  }

  const busy = save.isPending || publish.isPending;
  const stateName = (key: string) => wf.states.find((s) => s.key === key)?.name ?? key;
  const roleNames = (ids: string[]) =>
    ids.map((id) => roles.find((r) => r.id === id)?.name ?? "—").join(", ");

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <Button variant="secondary" onClick={() => navigate("/flujos")}>
            <ArrowLeft size={16} /> {t("workflows.builder.back")}
          </Button>
          <h1 className={styles.title}>
            {t("workflows.builder.editTitle")} <span className={styles.accent}>{wf.name || t("workflows.builder.titleAccent")}</span>
          </h1>
          <Chip variant={isPublishedView ? "success" : "warning"} label={isPublishedView ? t("workflows.status.published") : t("workflows.status.draft")} />
        </div>
        <div className={styles.topActions}>
          {canEdit && (
            <Button variant="secondary" onClick={handleSave} loading={save.isPending} disabled={busy || !dirty || !canSaveMachine}>
              <Save size={15} /> {t("workflows.builder.saveDraft")}
            </Button>
          )}
          {perms.can("workflow:manage") && (
            <Button variant="primary" onClick={() => setPublishOpen(true)} disabled={busy || !valid}>
              {t("workflows.builder.publish")}
            </Button>
          )}
        </div>
      </div>

      {isPublishedView && <div className={styles.readOnlyBanner}>{t("workflows.builder.publishedReadOnly")}</div>}

      {/* Validación de la máquina: rojo = errores de integridad; ámbar = pendiente
          de conectar (normal mientras construyes); verde = lista para publicar. */}
      {errors.length > 0 ? (
        <div className={styles.invalidBanner}>
          <TriangleAlert size={16} />
          <div>
            <strong>{t("workflows.builder.invalidTitle")}</strong>
            <ul className={styles.issueList}>
              {errors.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : pending.length > 0 ? (
        <div className={styles.pendingBanner}>
          <Info size={16} />
          <div>
            <strong>{t("workflows.builder.pendingTitle")}</strong>
            <ul className={styles.issueList}>
              {pending.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className={styles.validBanner}>{t("workflows.builder.validMachine")}</div>
      )}

      <Card className={styles.metaCard}>
        <div className={styles.metaGrid}>
          <FormField label={t("workflows.builder.name")}>
            {({ id }) => <Input id={id} value={wf.name} disabled={!canEdit} onChange={(e) => patch({ ...wf, name: e.target.value })} />}
          </FormField>
        </div>
        <FormField label={t("workflows.builder.description")}>
          {({ id }) => (
            <Textarea id={id} rows={2} value={wf.description} disabled={!canEdit} onChange={(e) => patch({ ...wf, description: e.target.value })} />
          )}
        </FormField>
      </Card>

      {/* Resumen de transiciones (tabla) — colapsable; útil cuando hay muchas. */}
      {wf.transitions.length > 0 && (
        <Card className={styles.summaryCard}>
          <button
            type="button"
            className={styles.summaryHeader}
            onClick={() => setSummaryOpen((o) => !o)}
            aria-expanded={summaryOpen}
          >
            {summaryOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <ListChecks size={15} />
            <span>{t("workflows.builder.summaryTitle")}</span>
            <span className={styles.summaryCount}>{wf.transitions.length}</span>
          </button>
          {summaryOpen && (
          <div className={styles.summaryTableWrap}>
            <table className={styles.summaryTable}>
              <thead>
                <tr>
                  <th>{t("workflows.builder.colTransition")}</th>
                  <th>{t("workflows.builder.colFlow")}</th>
                  <th>{t("workflows.builder.colSignature")}</th>
                  <th>{t("workflows.builder.colMfa")}</th>
                  <th>{t("workflows.builder.colRoles")}</th>
                </tr>
              </thead>
              <tbody>
                {wf.transitions.map((tr) => (
                  <tr key={tr.uid}>
                    <td>{tr.label}</td>
                    <td>
                      <span className={styles.flowCell}>
                        {stateName(tr.fromStateKey)} <ArrowRight size={12} /> {stateName(tr.toStateKey)}
                      </span>
                    </td>
                    <td>{tr.requireSignature ? `✓${tr.signatureMeaning ? ` ${tr.signatureMeaning}` : ""}` : "—"}</td>
                    <td>{tr.requireMfa ? "✓" : "—"}</td>
                    <td>{tr.roleIds.length > 0 ? roleNames(tr.roleIds) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}

      <div className={styles.columns}>
        {/* Estados */}
        <Card className={styles.column}>
          <div className={styles.columnHeader}>
            <span><PlayCircle size={15} /> {t("workflows.builder.statesTitle")}</span>
            <button type="button" className={styles.addBtn} onClick={addState} disabled={!canEdit}>
              <Plus size={14} /> {t("workflows.builder.addState")}
            </button>
          </div>
          {wf.states.length === 0 ? (
            <div className={styles.empty}>{t("workflows.builder.noStates")}</div>
          ) : (
            wf.states.map((s, idx) => (
              <div key={s.uid} className={styles.itemCard}>
                <div className={styles.itemHeader}>
                  <span className={styles.indexBadge}>{idx + 1}</span>
                  <span className={styles.itemHeaderTitle}>{t("workflows.builder.stateN", { n: idx + 1 })}</span>
                </div>
                <div className={styles.itemTop}>
                  <Input
                    value={s.name}
                    disabled={!canEdit}
                    onChange={(e) => updateState(s.uid, { name: e.target.value })}
                    aria-label={t("workflows.builder.stateName")}
                  />
                  <span className={styles.keyBadge}>{s.key}</span>
                  <button type="button" className={styles.iconBtnDanger} onClick={() => deleteState(s.uid)} disabled={!canEdit} aria-label={t("common.delete")}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={styles.itemFlags}>
                  <label className={styles.flag}>
                    <input
                      type="radio"
                      name="initialState"
                      checked={s.isInitial}
                      disabled={!canEdit}
                      onChange={() => updateState(s.uid, { isInitial: true })}
                    />
                    <PlayCircle size={13} /> {t("workflows.builder.isInitial")}
                  </label>
                  <Checkbox
                    checked={s.isFinal}
                    disabled={!canEdit}
                    onChange={(checked) => updateState(s.uid, { isFinal: checked })}
                    label={t("workflows.builder.isFinal")}
                  />
                  <Select
                    value={s.color ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => updateState(s.uid, { color: e.target.value || null })}
                    aria-label={t("workflows.builder.color")}
                    className={styles.colorSelect}
                  >
                    <option value="">{t("workflows.builder.colorNone")}</option>
                    {STATE_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {t(`workflows.builder.colors.${c}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Transiciones */}
        <Card className={styles.column}>
          <div className={styles.columnHeader}>
            <span><ArrowRight size={15} /> {t("workflows.builder.transitionsTitle")}</span>
            <button type="button" className={styles.addBtn} onClick={addTransition} disabled={!canEdit || wf.states.length < 1}>
              <Plus size={14} /> {t("workflows.builder.addTransition")}
            </button>
          </div>
          {wf.transitions.length === 0 ? (
            <div className={styles.empty}>{t("workflows.builder.noTransitions")}</div>
          ) : (
            wf.transitions.map((tr, idx) => {
              const open = !collapsedTransitions.has(tr.uid);
              return (
              <div key={tr.uid} className={styles.itemCard}>
                <div className={cx(styles.collapsibleHeader, open && styles.headerOpen)}>
                  <button
                    type="button"
                    className={styles.headerToggle}
                    onClick={() => toggleTransitionCollapse(tr.uid)}
                    aria-expanded={open}
                    aria-label={t(open ? "workflows.builder.collapse" : "workflows.builder.expand")}
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className={styles.indexBadge}>{idx + 1}</span>
                    {open ? (
                      <span className={styles.itemHeaderTitle}>{t("workflows.builder.transitionN", { n: idx + 1 })}</span>
                    ) : (
                      <span className={styles.collapsedSummary}>
                        <span className={styles.collapsedLabel}>{tr.label || t("workflows.builder.transitionN", { n: idx + 1 })}</span>
                        <span className={styles.collapsedFlow}>
                          {stateName(tr.fromStateKey)} <ArrowRight size={11} /> {stateName(tr.toStateKey)}
                        </span>
                        {tr.requireSignature && <span className={styles.miniTag}>{t("workflows.builder.tagSignature")}</span>}
                        {tr.requireMfa && <span className={styles.miniTag}>MFA</span>}
                        {tr.roleIds.length > 0 && <span className={styles.miniTag}>{t("workflows.builder.tagRoles", { count: tr.roleIds.length })}</span>}
                      </span>
                    )}
                  </button>
                  <button type="button" className={styles.iconBtnDanger} onClick={() => deleteTransition(tr.uid)} disabled={!canEdit} aria-label={t("common.delete")}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {open && (<>
                <div className={styles.itemTop}>
                  <Input
                    value={tr.label}
                    disabled={!canEdit}
                    onChange={(e) => updateTransition(tr.uid, { label: e.target.value })}
                    aria-label={t("workflows.builder.transitionLabel")}
                  />
                </div>
                <div className={styles.transitionFlow}>
                  <Select
                    value={tr.fromStateKey}
                    disabled={!canEdit}
                    onChange={(e) => updateTransition(tr.uid, { fromStateKey: e.target.value })}
                    aria-label={t("workflows.builder.from")}
                  >
                    {wf.states.map((s) => (
                      <option key={s.uid} value={s.key}>{s.name}</option>
                    ))}
                  </Select>
                  <ArrowRight size={16} className={styles.flowArrow} />
                  <Select
                    value={tr.toStateKey}
                    disabled={!canEdit}
                    onChange={(e) => updateTransition(tr.uid, { toStateKey: e.target.value })}
                    aria-label={t("workflows.builder.to")}
                  >
                    {wf.states.map((s) => (
                      <option key={s.uid} value={s.key}>{s.name}</option>
                    ))}
                  </Select>
                </div>

                <div className={styles.itemFlags}>
                  <div className={styles.inlineToggle}>
                    <Toggle
                      checked={tr.requireSignature}
                      disabled={!canEdit}
                      onChange={(checked) => updateTransition(tr.uid, { requireSignature: checked })}
                      aria-label={t("workflows.builder.requireSignature")}
                    />
                    <span>{t("workflows.builder.requireSignature")}</span>
                  </div>
                  <div className={styles.inlineToggle}>
                    <Toggle
                      checked={tr.requireMfa}
                      disabled={!canEdit}
                      onChange={(checked) => updateTransition(tr.uid, { requireMfa: checked })}
                      aria-label={t("workflows.builder.requireMfa")}
                    />
                    <span>{t("workflows.builder.requireMfa")}</span>
                  </div>
                </div>
                {tr.requireSignature && (
                  <FormField label={t("workflows.builder.signatureMeaning")} hint={t("workflows.builder.signatureMeaningHint")}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={tr.signatureMeaning ?? ""}
                        disabled={!canEdit}
                        placeholder={t("workflows.builder.signatureMeaningPlaceholder")}
                        onChange={(e) => updateTransition(tr.uid, { signatureMeaning: e.target.value || null })}
                      />
                    )}
                  </FormField>
                )}

                <div className={styles.rolesBlock}>
                  <div className={styles.rolesLabel}>{t("workflows.builder.allowedRoles")}</div>
                  <p className={styles.hint}>{t("workflows.builder.allowedRolesHint", { from: stateName(tr.fromStateKey), to: stateName(tr.toStateKey) })}</p>
                  {roles.length === 0 ? (
                    <p className={styles.modeledNote}>{t("workflows.builder.noRoles")}</p>
                  ) : (
                    <MultiSelect
                      options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.key }))}
                      value={tr.roleIds}
                      disabled={!canEdit}
                      onChange={(ids) => updateTransition(tr.uid, { roleIds: ids })}
                      ariaLabel={t("workflows.builder.allowedRoles")}
                      placeholder={t("workflows.builder.rolesPlaceholder")}
                      searchPlaceholder={t("common.search")}
                      selectAllLabel={t("common.selectAll")}
                      clearLabel={t("common.clear")}
                      noMatchText={t("common.noResults")}
                      emptyText={t("workflows.builder.noRoles")}
                    />
                  )}
                </div>
                </>)}
              </div>
              );
            })
          )}
        </Card>
      </div>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t("workflows.builder.publishConfirmTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={handlePublish} loading={busy}>
              {t("workflows.builder.publish")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          {t("workflows.builder.publishConfirmBody")}
        </p>
      </Modal>
    </div>
  );
}
