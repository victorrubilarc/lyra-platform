import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button, Card, Chip, FormField, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import type { FieldType, TemplateDetail } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { EditWindowDurationField } from "../settings/EditWindowDurationField.js";
import { fetchRoles } from "../security/security-api.js";
import { useOrgTree } from "../structure/structure-queries.js";
import {
  FIELD_TYPE_META,
  collectFieldKeys,
  collectSectionKeys,
  defaultFieldConfig,
  detailToEditState,
  editStateToDraftRequest,
  fieldTypeMeta,
  flattenNodeOptions,
  nextUid,
  slugifyKey,
  totalFields,
  uniqueKey,
  type EditField,
  type EditSection,
  type EditState,
} from "./builder-model.js";
import { BuilderConfigPanel } from "./BuilderConfigPanel.js";
import { PreviewForm } from "./FieldPreview.js";
import { usePublishTemplate, useSaveTemplateDraft } from "./templates-queries.js";
import { useWorkflow, useWorkflows } from "../workflows/workflows-queries.js";
import styles from "./TemplateBuilder.module.css";

interface Selection {
  s: string;
  f?: string;
}

export function TemplateBuilder({ detail }: { detail: TemplateDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const perms = usePermissions();

  const [state, setState] = useState<EditState>(() => detailToEditState(detail));
  const [selected, setSelected] = useState<Selection | null>(null);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const save = useSaveTemplateDraft();
  const publish = usePublishTemplate();
  const { data: tree = [] } = useOrgTree();
  const rolesQuery = useQuery({ queryKey: ["templates", "roles"], queryFn: fetchRoles, retry: false });
  const roles = rolesQuery.data ?? [];

  // Flujos PUBLICADOS asignables (gateado por workflow:view) y, si hay uno
  // asignado, su detalle para mapear secciones → estados.
  const canViewWorkflows = perms.can("workflow:view");
  const workflowsQuery = useWorkflows(canViewWorkflows ? { status: "PUBLISHED" } : {});
  const publishedWorkflows = canViewWorkflows ? (workflowsQuery.data ?? []).filter((w) => w.status === "PUBLISHED") : [];
  const assignedWorkflow = useWorkflow(state.workflowDefinitionId);
  const workflowStates = assignedWorkflow.data?.version.states ?? [];

  const nodeOptions = useMemo(() => flattenNodeOptions(tree), [tree]);
  const canEdit = perms.can("template:edit");
  const isPublishedView = detail.version.status === "PUBLISHED";

  const selectedSection = selected ? state.sections.find((s) => s.uid === selected.s) ?? null : null;
  const selectedField =
    selected?.f && selectedSection ? selectedSection.fields.find((f) => f.uid === selected.f) ?? null : null;

  const booleanFields = useMemo(
    () =>
      state.sections.flatMap((s) =>
        s.fields.filter((f) => f.type === "BOOLEAN").map((f) => ({ key: f.key, label: f.label })),
      ),
    [state],
  );

  // ── Mutadores del estado editable ──────────────────────────────────────────
  function patchState(next: EditState) {
    setState(next);
    setDirty(true);
  }

  function setWorkflow(wfId: string) {
    // Cambiar (o quitar) el flujo invalida los estados de sección previos.
    const wf = publishedWorkflows.find((w) => w.id === wfId);
    patchState({
      ...state,
      workflowDefinitionId: wfId || null,
      workflowDefinitionVersionId: wf?.currentVersionId ?? null,
      sections: state.sections.map((s) => ({ ...s, editableInStateKey: null })),
    });
  }

  function addSection() {
    const title = t("templates.builder.sectionDefault");
    const key = uniqueKey(slugifyKey(title, `seccion_${state.sections.length + 1}`), collectSectionKeys(state));
    const sec: EditSection = { uid: nextUid(), key, title, description: null, requireSignature: false, editableInStateKey: null, roleIds: [], fields: [] };
    patchState({ ...state, sections: [...state.sections, sec] });
    setSelected({ s: sec.uid });
  }

  function addField(type: FieldType) {
    const label = t(fieldTypeMeta(type).labelKey);
    let sections = state.sections;
    let targetUid = selected?.s ?? sections[sections.length - 1]?.uid ?? null;
    if (!targetUid) {
      const stitle = t("templates.builder.sectionDefault");
      const skey = uniqueKey(slugifyKey(stitle, "seccion_1"), collectSectionKeys(state));
      const sec: EditSection = { uid: nextUid(), key: skey, title: stitle, description: null, requireSignature: false, editableInStateKey: null, roleIds: [], fields: [] };
      sections = [...sections, sec];
      targetUid = sec.uid;
    }
    const fkey = uniqueKey(slugifyKey(label, "campo"), collectFieldKeys({ ...state, sections }));
    const field: EditField = { uid: nextUid(), key: fkey, type, semanticRole: null, label, help: null, required: false, config: defaultFieldConfig(type), visibleWhen: null, roleIds: [] };
    sections = sections.map((s) => (s.uid === targetUid ? { ...s, fields: [...s.fields, field] } : s));
    patchState({ ...state, sections });
    setSelected({ s: targetUid, f: field.uid });
  }

  function updateSection(uid: string, patch: Partial<EditSection>) {
    patchState({ ...state, sections: state.sections.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) });
  }

  function updateField(sUid: string, fUid: string, patch: Partial<EditField>) {
    // "Fecha efectiva" es única por versión: al marcar una, desmarca las demás.
    const claimsEffectiveDate = patch.semanticRole === "EFFECTIVE_DATE";
    patchState({
      ...state,
      sections: state.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) => {
          if (f.uid === fUid) return { ...f, ...patch };
          if (claimsEffectiveDate && f.semanticRole === "EFFECTIVE_DATE") return { ...f, semanticRole: null };
          return f;
        }),
      })),
    });
  }

  function moveSection(uid: string, dir: -1 | 1) {
    const idx = state.sections.findIndex((s) => s.uid === uid);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= state.sections.length) return;
    const next = [...state.sections];
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    patchState({ ...state, sections: next });
  }

  function moveField(sUid: string, fUid: string, dir: -1 | 1) {
    patchState({
      ...state,
      sections: state.sections.map((s) => {
        if (s.uid !== sUid) return s;
        const idx = s.fields.findIndex((f) => f.uid === fUid);
        const j = idx + dir;
        if (j < 0 || j >= s.fields.length) return s;
        if (idx < 0) return s;
        const fields = [...s.fields];
        const tmp = fields[idx]!;
        fields[idx] = fields[j]!;
        fields[j] = tmp;
        return { ...s, fields };
      }),
    });
  }

  function deleteSection(uid: string) {
    patchState({ ...state, sections: state.sections.filter((s) => s.uid !== uid) });
    if (selected?.s === uid) setSelected(null);
  }

  function deleteField(sUid: string, fUid: string) {
    updateSection(sUid, { fields: (state.sections.find((s) => s.uid === sUid)?.fields ?? []).filter((f) => f.uid !== fUid) });
    if (selected?.f === fUid) setSelected({ s: sUid });
  }

  // ── Guardar / publicar ─────────────────────────────────────────────────────
  async function handleSave(): Promise<boolean> {
    try {
      await save.mutateAsync({ id: detail.id, dto: editStateToDraftRequest(state) });
      setDirty(false);
      toast.success(t("templates.builder.saved"));
      return true;
    } catch {
      toast.error(t("common.errorGeneric"));
      return false;
    }
  }

  async function handlePublish() {
    const ok = await handleSave();
    if (!ok) return;
    try {
      await publish.mutateAsync({ id: detail.id });
      setPublishOpen(false);
      toast.success(t("templates.builder.published"));
    } catch {
      toast.error(t("common.errorGeneric"));
    }
  }

  const busy = save.isPending || publish.isPending;

  return (
    <div className={styles.page}>
      {/* Barra superior */}
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <Button variant="secondary" onClick={() => navigate("/plantillas")}>
            <ArrowLeft size={16} /> {t("templates.builder.back")}
          </Button>
          <h1 className={styles.title}>
            {detail.status === "DRAFT" && !isPublishedView ? t("templates.builder.editTitle") : t("templates.builder.editTitle")}{" "}
            <span className={styles.accent}>{state.name || t("templates.builder.titleAccent")}</span>
          </h1>
          {isPublishedView ? (
            <Chip variant="success" label={t("templates.status.published")} />
          ) : (
            <Chip variant="warning" label={t("templates.status.draft")} />
          )}
        </div>
        <div className={styles.topActions}>
          <Button variant="secondary" onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil size={15} /> : <Eye size={15} />}
            {preview ? t("templates.builder.editor") : t("templates.builder.preview")}
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={handleSave} loading={save.isPending} disabled={busy || !dirty}>
              <Save size={15} /> {t("templates.builder.saveDraft")}
            </Button>
          )}
          {perms.can("template:publish") && (
            <Button variant="primary" onClick={() => setPublishOpen(true)} disabled={busy || state.sections.length === 0}>
              {t("templates.builder.publish")}
            </Button>
          )}
        </div>
      </div>

      {isPublishedView && <div className={styles.readOnlyBanner}>{t("templates.builder.publishedReadOnly")}</div>}

      {preview ? (
        <Card className={styles.previewCard}>
          <div className={styles.previewTitle}>{state.name || "—"}</div>
          {state.description && <div className={styles.previewDesc}>{state.description}</div>}
          {totalFields(state) === 0 ? <div className={styles.configEmpty}>{t("templates.builder.emptyCanvas")}</div> : <PreviewForm state={state} />}
        </Card>
      ) : (
        <div className={styles.layout}>
          {/* Paleta */}
          <Card className={styles.palette}>
            <div className={styles.paletteTitle}>{t("templates.builder.paletteTitle")}</div>
            <button type="button" className={styles.addSectionBtn} onClick={addSection} disabled={!canEdit}>
              <FilePlus2 size={15} /> {t("templates.builder.addSection")}
            </button>
            <div className={styles.paletteDivider} />
            {FIELD_TYPE_META.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.type} type="button" className={styles.paletteItem} onClick={() => addField(m.type)} disabled={!canEdit}>
                  <Icon size={15} />
                  <span>{t(m.labelKey)}</span>
                  <Plus size={13} className={styles.paletteAdd} />
                </button>
              );
            })}
          </Card>

          {/* Lienzo */}
          <div className={styles.canvas}>
            <Card className={styles.metaCard}>
              <div className={styles.metaGrid}>
                <FormField label={t("templates.builder.name")}>
                  {({ id }) => <Input id={id} value={state.name} onChange={(e) => patchState({ ...state, name: e.target.value })} />}
                </FormField>
                <FormField label={t("templates.builder.node")}>
                  {({ id }) => (
                    <Select id={id} value={state.orgNodeId ?? ""} onChange={(e) => patchState({ ...state, orgNodeId: e.target.value || null })}>
                      <option value="">{t("templates.globalNode")}</option>
                      {nodeOptions.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
              </div>
              <FormField label={t("templates.builder.description")}>
                {({ id }) => (
                  <Textarea id={id} rows={2} value={state.description} onChange={(e) => patchState({ ...state, description: e.target.value })} />
                )}
              </FormField>
              <FormField label={t("templates.builder.workflow")} hint={t("templates.builder.workflowHint")}>
                {({ id }) => (
                  <Select id={id} value={state.workflowDefinitionId ?? ""} disabled={!canEdit} onChange={(e) => setWorkflow(e.target.value)}>
                    <option value="">{t("templates.builder.workflowNone")}</option>
                    {publishedWorkflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                    {/* Mantiene visible el flujo asignado aunque ya no esté en la lista. */}
                    {state.workflowDefinitionId &&
                      !publishedWorkflows.some((w) => w.id === state.workflowDefinitionId) && (
                        <option value={state.workflowDefinitionId}>
                          {assignedWorkflow.data?.name ?? state.workflowDefinitionId}
                        </option>
                      )}
                  </Select>
                )}
              </FormField>
              {/* Ventana de edición (2.7.2): gobernanza VIVA del contenedor — aplica de
                  inmediato a todas las entradas, sin republicar la versión. */}
              <FormField label={t("templates.builder.editWindow")} hint={t("templates.builder.editWindowHint")}>
                {({ id }) => (
                  <div className={styles.metaGrid}>
                    <Select
                      id={id}
                      value={state.editWindowMinutes === null ? "inherit" : state.editWindowMinutes === 0 ? "none" : "custom"}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const mode = e.target.value;
                        patchState({
                          ...state,
                          editWindowMinutes:
                            mode === "inherit" ? null : mode === "none" ? 0 : (state.editWindowMinutes ?? 0) > 0 ? state.editWindowMinutes : 120,
                          editWindowAnchor: mode === "custom" ? (state.editWindowAnchor ?? "RECORDED") : null,
                        });
                      }}
                    >
                      <option value="inherit">{t("templates.builder.editWindowInherit")}</option>
                      <option value="none">{t("templates.builder.editWindowNone")}</option>
                      <option value="custom">{t("templates.builder.editWindowCustom")}</option>
                    </Select>
                    {(state.editWindowMinutes ?? 0) > 0 && (
                      <>
                        <EditWindowDurationField
                          key={detail.id}
                          minutes={state.editWindowMinutes}
                          disabled={!canEdit}
                          onChange={(min) => patchState({ ...state, editWindowMinutes: min && min > 0 ? min : 1 })}
                        />
                        <Select
                          value={state.editWindowAnchor ?? "RECORDED"}
                          disabled={!canEdit}
                          aria-label={t("templates.builder.editWindowAnchor")}
                          onChange={(e) => patchState({ ...state, editWindowAnchor: e.target.value as "RECORDED" | "EFFECTIVE" })}
                        >
                          <option value="RECORDED">{t("templates.builder.editWindowAnchorRecorded")}</option>
                          <option value="EFFECTIVE">{t("templates.builder.editWindowAnchorEffective")}</option>
                        </Select>
                      </>
                    )}
                  </div>
                )}
              </FormField>
            </Card>

            {state.sections.length === 0 ? (
              <div className={styles.emptyCanvas}>{t("templates.builder.emptyCanvas")}</div>
            ) : (
              state.sections.map((s, si) => (
                <Card
                  key={s.uid}
                  className={selected?.s === s.uid && !selected.f ? styles.sectionCardActive : styles.sectionCard}
                  onClick={() => setSelected({ s: s.uid })}
                >
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>{s.title}</span>
                    <span className={styles.sectionCount}>{t("templates.builder.sectionCount", { count: s.fields.length })}</span>
                    {s.requireSignature && <Chip variant="info" label="Part 11" />}
                    <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={styles.iconBtn} onClick={() => moveSection(s.uid, -1)} disabled={si === 0}><ArrowUp size={13} /></button>
                      <button type="button" className={styles.iconBtn} onClick={() => moveSection(s.uid, 1)} disabled={si === state.sections.length - 1}><ArrowDown size={13} /></button>
                      <button type="button" className={styles.iconBtnDanger} onClick={() => deleteSection(s.uid)}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {s.fields.length === 0 ? (
                    <div className={styles.emptySection}>{t("templates.builder.emptySectionFields")}</div>
                  ) : (
                    s.fields.map((f, fi) => {
                      const meta = fieldTypeMeta(f.type);
                      const Icon = meta.icon;
                      const active = selected?.f === f.uid;
                      const c = f.config as Record<string, unknown>;
                      return (
                        <div
                          key={f.uid}
                          className={active ? styles.fieldRowActive : styles.fieldRow}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected({ s: s.uid, f: f.uid });
                          }}
                        >
                          <Icon size={16} className={styles.fieldIcon} />
                          <div className={styles.fieldInfo}>
                            <div className={styles.fieldLabel}>
                              {f.label}
                              {f.required && <span className={styles.req}> *</span>}
                            </div>
                            <div className={styles.fieldSub}>
                              {t(meta.labelKey)}
                              {c.unit ? ` · ${c.unit as string}` : ""}
                              {c.min !== undefined || c.max !== undefined ? ` · ${c.min ?? "—"}–${c.max ?? "—"}` : ""}
                              {f.visibleWhen ? " · condicional" : ""}
                            </div>
                          </div>
                          <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                            <button type="button" className={styles.iconBtn} onClick={() => moveField(s.uid, f.uid, -1)} disabled={fi === 0}><ArrowUp size={13} /></button>
                            <button type="button" className={styles.iconBtn} onClick={() => moveField(s.uid, f.uid, 1)} disabled={fi === s.fields.length - 1}><ArrowDown size={13} /></button>
                            <button type="button" className={styles.iconBtnDanger} onClick={() => deleteField(s.uid, f.uid)}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </Card>
              ))
            )}
          </div>

          {/* Config */}
          <Card className={styles.configCard}>
            <div className={styles.configHeader}>{t("templates.builder.configTitle")}</div>
            <BuilderConfigPanel
              section={selectedSection}
              field={selectedField}
              roles={roles}
              booleanFields={booleanFields}
              workflowStates={workflowStates}
              hasWorkflow={Boolean(state.workflowDefinitionId)}
              onUpdateSection={(patch) => selectedSection && updateSection(selectedSection.uid, patch)}
              onUpdateField={(patch) => selectedField && selectedSection && updateField(selectedSection.uid, selectedField.uid, patch)}
            />
          </Card>
        </div>
      )}

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t("templates.builder.publishConfirmTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={handlePublish} loading={busy}>
              {t("templates.builder.publish")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{t("templates.builder.publishConfirmBody")}</p>
      </Modal>
    </div>
  );
}
