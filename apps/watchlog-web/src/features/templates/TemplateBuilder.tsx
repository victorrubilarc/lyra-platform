import { useMemo, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  FilePlus2,
  FunctionSquare,
  IdCard,
  LayoutPanelLeft,
  Network,
  Pencil,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button, Card, Checkbox, Chip, FormField, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import { GRID_FIELD_KEYS_MAX } from "@lyra/contracts";
import type { EquipmentMode, FieldType, TemplateDetail } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { EditWindowDurationField } from "../settings/EditWindowDurationField.js";
import { fetchRoles } from "../security/security-api.js";
import { ScopeTreePicker } from "../security/ScopeTreePicker.js";
import { useOrgTree } from "../structure/structure-queries.js";
import {
  FIELD_TYPE_META,
  collectFieldKeys,
  collectSectionKeys,
  defaultFieldConfig,
  detailToEditState,
  editStateToConfigRequest,
  editStateToDraftRequest,
  fieldTypeMeta,
  nextUid,
  slugifyKey,
  totalFields,
  uniqueKey,
  type EditField,
  type EditSection,
  type EditState,
} from "./builder-model.js";
import { BuilderConfigPanel } from "./BuilderConfigPanel.js";
import { BuilderFieldCard } from "./BuilderFieldCard.js";
import { FieldGrid, FieldGridCell } from "./FieldGrid.js";
import { RulesEditor } from "./RulesEditor.js";
import type { RuleFieldRef } from "./expression-meta.js";
import { PreviewForm } from "./FieldPreview.js";
import { usePublishTemplate, useSaveTemplateDraft, useUpdateTemplate } from "./templates-queries.js";
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
  // Secciones principales (riel vertical): Configuración (gobernanza viva, por defecto) ·
  // Diseño (definición versionada). La Vista previa vive DENTRO de Diseño.
  const [view, setView] = useState<"config" | "design">("config");
  // Sub-pestaña de Diseño: Editor (lienzo) · Reglas (motor de reglas) · Vista previa.
  const [designTab, setDesignTab] = useState<"editor" | "rules" | "preview">("editor");
  const [dirty, setDirty] = useState(false); // cambios de DEFINICIÓN (borrador)
  const [configDirty, setConfigDirty] = useState(false); // cambios de CONFIGURACIÓN (PATCH en vivo)
  const [publishOpen, setPublishOpen] = useState(false);
  // Arrastre de campos en el lienzo (DnD nativo, patrón ColumnsDrawer): origen + destino-hint.
  const [dragField, setDragField] = useState<{ sUid: string; fUid: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ sUid: string; beforeFUid: string | null } | null>(null);

  const save = useSaveTemplateDraft();
  const publish = usePublishTemplate();
  const updateConfig = useUpdateTemplate();
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

  // Todos los campos (key + label + tipo + opciones) para fórmulas y reglas del
  // motor (Req-7). Las opciones inline alimentan el selector de valores del editor.
  const allFields = useMemo<RuleFieldRef[]>(
    () =>
      state.sections.flatMap((s) =>
        s.fields.map((f) => {
          const src = (f.config as { optionSource?: { kind?: string; items?: { code: string; label: string }[] } }).optionSource;
          const options = src?.kind === "inline" && Array.isArray(src.items) ? src.items : undefined;
          return { key: f.key, label: f.label, type: f.type, options };
        }),
      ),
    [state],
  );

  // Mutador de las reglas cruzadas (DEFINICIÓN versionada → "Guardar borrador").
  function setRules(rules: EditState["rules"]) {
    patchState({ ...state, rules });
  }

  // ── Mutadores del estado editable ──────────────────────────────────────────
  // patchState = cambios de DEFINICIÓN (secciones/campos/flujo) → "Guardar borrador".
  function patchState(next: EditState) {
    setState(next);
    setDirty(true);
  }

  // patchConfig = cambios de CONFIGURACIÓN/gobernanza (identidad, alcance de nodos,
  // ventana de edición, modo de equipo) → "Guardar configuración" (PATCH en vivo, sin
  // publicar). NO marca el borrador como sucio: las dos semánticas no se mezclan.
  function patchConfig(next: EditState) {
    setState(next);
    setConfigDirty(true);
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
    const field: EditField = { uid: nextUid(), key: fkey, type, semanticRole: null, label, help: null, required: false, config: defaultFieldConfig(type), visibleWhen: null, computed: null, colSpan: 12, roleIds: [] };
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

  /**
   * Mueve un campo (reordenar dentro de la sección O mover entre secciones) por
   * arrastre. Inserta ANTES de `beforeFUid` (o al final si es null). El índice se
   * calcula DESPUÉS de quitar el campo, así no se desfasa al arrastrar en la misma
   * sección. Solo presentación/orden; no toca el resto del campo.
   */
  function moveFieldBefore(srcSUid: string, fUid: string, dstSUid: string, beforeFUid: string | null) {
    if (srcSUid === dstSUid && fUid === beforeFUid) return;
    let moved: EditField | undefined;
    let sections = state.sections.map((s) => {
      if (s.uid !== srcSUid) return s;
      moved = s.fields.find((f) => f.uid === fUid);
      return { ...s, fields: s.fields.filter((f) => f.uid !== fUid) };
    });
    if (!moved) return;
    sections = sections.map((s) => {
      if (s.uid !== dstSUid) return s;
      const fields = [...s.fields];
      const idx = beforeFUid ? fields.findIndex((f) => f.uid === beforeFUid) : -1;
      fields.splice(idx < 0 ? fields.length : idx, 0, moved!);
      return { ...s, fields };
    });
    patchState({ ...state, sections });
  }

  function endDrag() {
    setDragField(null);
    setDropHint(null);
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

  // Guarda la CONFIGURACIÓN/gobernanza vía PATCH: se aplica de inmediato a las entradas
  // nuevas, SIN crear borrador ni publicar (gobernanza viva en el contenedor mutable).
  async function handleSaveConfig() {
    try {
      await updateConfig.mutateAsync({ id: detail.id, dto: editStateToConfigRequest(state) });
      setConfigDirty(false);
      toast.success(t("templates.builder.configSaved"));
    } catch {
      toast.error(t("common.errorGeneric"));
    }
  }

  const busy = save.isPending || publish.isPending;

  return (
    <div className={styles.page}>
      {/* Barra superior (header del builder, en flujo normal — no sticky). */}
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
          {/* Acciones contextuales a la sección activa. */}
          {view === "config"
            ? canEdit && (
                <Button variant="primary" onClick={handleSaveConfig} loading={updateConfig.isPending} disabled={updateConfig.isPending || !configDirty}>
                  <Save size={15} /> {t("templates.builder.saveConfig")}
                </Button>
              )
            : (designTab === "editor" || designTab === "rules") && (
                <>
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
                </>
              )}
        </div>
      </div>

      {/* Cuerpo: riel vertical premium (Configuración / Diseño) + contenido de la sección. */}
      <div className={styles.builderShell}>
        <nav className={styles.rail} aria-label={t("templates.builder.viewSwitch")}>
          <button
            type="button"
            className={view === "config" ? styles.railItemActive : styles.railItem}
            aria-current={view === "config"}
            onClick={() => setView("config")}
          >
            <span className={styles.railIcon}><SlidersHorizontal size={18} /></span>
            <span className={styles.railText}>
              <span className={styles.railTitle}>{t("templates.builder.viewConfig")}</span>
              <span className={styles.railDesc}>{t("templates.builder.viewConfigDesc")}</span>
            </span>
          </button>
          <button
            type="button"
            className={view === "design" ? styles.railItemActive : styles.railItem}
            aria-current={view === "design"}
            onClick={() => setView("design")}
          >
            <span className={styles.railIcon}><LayoutPanelLeft size={18} /></span>
            <span className={styles.railText}>
              <span className={styles.railTitle}>{t("templates.builder.viewDesign")}</span>
              <span className={styles.railDesc}>{t("templates.builder.viewDesignDesc")}</span>
            </span>
          </button>
        </nav>

        <div className={styles.builderContent}>
          {view === "config" ? (
            <ConfigView state={state} canEdit={canEdit} tree={tree} templateId={detail.id} patchConfig={patchConfig} />
          ) : (
            <>
              {/* Sub-pestañas de Diseño: Editor (lienzo) · Vista previa. */}
              <div className={styles.subTabs} role="tablist" aria-label={t("templates.builder.viewDesign")}>
                <button type="button" role="tab" aria-selected={designTab === "editor"} className={designTab === "editor" ? styles.subTabActive : styles.subTab} onClick={() => setDesignTab("editor")}>
                  <Pencil size={14} /> {t("templates.builder.designEditor")}
                </button>
                <button type="button" role="tab" aria-selected={designTab === "rules"} className={designTab === "rules" ? styles.subTabActive : styles.subTab} onClick={() => setDesignTab("rules")}>
                  <FunctionSquare size={14} /> {t("templates.builder.designRules")}
                </button>
                <button type="button" role="tab" aria-selected={designTab === "preview"} className={designTab === "preview" ? styles.subTabActive : styles.subTab} onClick={() => setDesignTab("preview")}>
                  <Eye size={14} /> {t("templates.builder.viewPreview")}
                </button>
              </div>

              {isPublishedView && (designTab === "editor" || designTab === "rules") && (
                <div className={styles.readOnlyBanner}>{t("templates.builder.publishedReadOnly")}</div>
              )}

              {designTab === "preview" ? (
                <Card className={styles.previewCard}>
                  <div className={styles.previewTitle}>{state.name || "—"}</div>
                  {state.description && <div className={styles.previewDesc}>{state.description}</div>}
                  {totalFields(state) === 0 ? <div className={styles.configEmpty}>{t("templates.builder.emptyCanvas")}</div> : <PreviewForm state={state} />}
                </Card>
              ) : designTab === "rules" ? (
                <RulesEditor
                  rules={state.rules}
                  fields={allFields}
                  canEdit={canEdit}
                  onChange={setRules}
                />
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
            {/* Flujo del proceso: es DEFINICIÓN versionada (gobierna estados/transiciones
                y el mapeo sección→estado), por eso vive en Diseño y se guarda con el
                borrador — NO en Configuración (que es gobernanza viva sin publicar). */}
            <Card className={styles.flowCard}>
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
                    <div
                      className={dropHint?.sUid === s.uid && !dropHint.beforeFUid ? styles.emptySectionDrop : styles.emptySection}
                      onDragOver={(e) => {
                        if (dragField) {
                          e.preventDefault();
                          setDropHint({ sUid: s.uid, beforeFUid: null });
                        }
                      }}
                      onDrop={() => {
                        if (dragField) moveFieldBefore(dragField.sUid, dragField.fUid, s.uid, null);
                        endDrag();
                      }}
                    >
                      {t("templates.builder.emptySectionFields")}
                    </div>
                  ) : (
                    <div
                      data-field-grid
                      // Soltar al final de la sección (área de la grilla fuera de una card).
                      onDragOver={(e) => {
                        if (dragField) {
                          e.preventDefault();
                          setDropHint({ sUid: s.uid, beforeFUid: null });
                        }
                      }}
                      onDrop={() => {
                        if (dragField) moveFieldBefore(dragField.sUid, dragField.fUid, s.uid, dropHint?.beforeFUid ?? null);
                        endDrag();
                      }}
                    >
                      <FieldGrid>
                        {s.fields.map((f, fi) => (
                          <FieldGridCell key={f.uid} span={f.colSpan}>
                            <BuilderFieldCard
                              field={f}
                              index={fi}
                              count={s.fields.length}
                              active={selected?.f === f.uid}
                              canEdit={canEdit}
                              dragging={dragField?.fUid === f.uid}
                              dropTarget={dropHint?.sUid === s.uid && dropHint.beforeFUid === f.uid}
                              onSelect={() => setSelected({ s: s.uid, f: f.uid })}
                              onDelete={() => deleteField(s.uid, f.uid)}
                              onMove={(dir) => moveField(s.uid, f.uid, dir)}
                              onResize={(span) => updateField(s.uid, f.uid, { colSpan: span })}
                              onDragStart={() => setDragField({ sUid: s.uid, fUid: f.uid })}
                              onDragEnd={endDrag}
                              onDragOver={() => dragField && setDropHint({ sUid: s.uid, beforeFUid: f.uid })}
                              onDrop={() => {
                                if (dragField) moveFieldBefore(dragField.sUid, dragField.fUid, s.uid, f.uid);
                                endDrag();
                              }}
                            />
                          </FieldGridCell>
                        ))}
                      </FieldGrid>
                    </div>
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
              allFields={allFields}
              workflowStates={workflowStates}
              hasWorkflow={Boolean(state.workflowDefinitionId)}
              onUpdateSection={(patch) => selectedSection && updateSection(selectedSection.uid, patch)}
              onUpdateField={(patch) => selectedField && selectedSection && updateField(selectedSection.uid, selectedField.uid, patch)}
            />
          </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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

// ── Vista CONFIGURACIÓN ───────────────────────────────────────────────────────
// Gobernanza VIVA del contenedor (identidad, alcance de nodos, ventana de edición,
// modo de equipo). Se guarda con "Guardar configuración" (PATCH), sin publicar. NO
// incluye el flujo: ese es definición versionada y vive en Diseño.
function ConfigView({
  state,
  canEdit,
  tree,
  templateId,
  patchConfig,
}: {
  state: EditState;
  canEdit: boolean;
  tree: ComponentProps<typeof ScopeTreePicker>["tree"];
  templateId: string;
  patchConfig: (next: EditState) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"general" | "scope">("general");
  return (
    <div className={styles.configView}>
      {/* Sub-pestañas: (Identidad + Gobernanza) · (Alcance y acceso). */}
      <div className={styles.subTabs} role="tablist" aria-label={t("templates.builder.viewConfig")}>
        <button type="button" role="tab" aria-selected={tab === "general"} className={tab === "general" ? styles.subTabActive : styles.subTab} onClick={() => setTab("general")}>
          <IdCard size={14} /> {t("templates.builder.tabIdentityGov")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "scope"} className={tab === "scope" ? styles.subTabActive : styles.subTab} onClick={() => setTab("scope")}>
          <Network size={14} /> {t("templates.builder.groupScope")}
        </button>
      </div>

      <p className={styles.configLiveHint}>{t("templates.builder.configLiveHint")}</p>

      {tab === "general" ? (
        <div className={styles.configGeneralGrid}>
          {/* Identidad */}
          <Card className={styles.configGroup}>
            <div className={styles.configGroupTitle}>{t("templates.builder.groupIdentity")}</div>
            <FormField label={t("templates.builder.name")}>
              {({ id }) => <Input id={id} value={state.name} disabled={!canEdit} onChange={(e) => patchConfig({ ...state, name: e.target.value })} />}
            </FormField>
            <FormField label={t("templates.builder.description")}>
              {({ id }) => (
                <Textarea id={id} rows={3} value={state.description} disabled={!canEdit} onChange={(e) => patchConfig({ ...state, description: e.target.value })} />
              )}
            </FormField>
          </Card>

          {/* Gobernanza (ventana de edición + modo de equipo) */}
          <Card className={styles.configGroup}>
            <div className={styles.configGroupTitle}>{t("templates.builder.groupGovernance")}</div>
            <FormField label={t("templates.builder.editWindow")} hint={t("templates.builder.editWindowHint")}>
              {({ id }) => (
                <div className={styles.metaGrid}>
                  <Select
                    id={id}
                    value={state.editWindowMinutes === null ? "inherit" : state.editWindowMinutes === 0 ? "none" : "custom"}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const mode = e.target.value;
                      patchConfig({
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
                        key={templateId}
                        minutes={state.editWindowMinutes}
                        disabled={!canEdit}
                        onChange={(min) => patchConfig({ ...state, editWindowMinutes: min && min > 0 ? min : 1 })}
                      />
                      <Select
                        value={state.editWindowAnchor ?? "RECORDED"}
                        disabled={!canEdit}
                        aria-label={t("templates.builder.editWindowAnchor")}
                        onChange={(e) => patchConfig({ ...state, editWindowAnchor: e.target.value as "RECORDED" | "EFFECTIVE" })}
                      >
                        <option value="RECORDED">{t("templates.builder.editWindowAnchorRecorded")}</option>
                        <option value="EFFECTIVE">{t("templates.builder.editWindowAnchorEffective")}</option>
                      </Select>
                    </>
                  )}
                </div>
              )}
            </FormField>
            <FormField label={t("templates.builder.equipmentMode")} hint={t("templates.builder.equipmentModeHint")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={state.equipmentMode}
                  disabled={!canEdit}
                  onChange={(e) => patchConfig({ ...state, equipmentMode: e.target.value as EquipmentMode })}
                >
                  <option value="NONE">{t("templates.builder.equipmentModeNone")}</option>
                  <option value="OPTIONAL">{t("templates.builder.equipmentModeOptional")}</option>
                  <option value="SUGGESTED">{t("templates.builder.equipmentModeSuggested")}</option>
                  <option value="REQUIRED">{t("templates.builder.equipmentModeRequired")}</option>
                </Select>
              )}
            </FormField>
          </Card>

          {/* Resumen en la grilla de Bitácoras (2.8.1a): pool de campos candidatos
              que el USUARIO podrá elegir para la línea "Resumen". Gobernanza viva. */}
          <GridSummaryFields state={state} canEdit={canEdit} patchConfig={patchConfig} />
        </div>
      ) : (
        /* Alcance y acceso (nodos de la estructura) */
        <Card className={styles.configGroup}>
          <div className={styles.configGroupTitle}>{t("templates.builder.groupScope")}</div>
          <FormField label={t("templates.builder.nodeScope")} hint={t("templates.builder.nodeScopeHint")}>
            {() => (
              <>
                {state.nodeAssignments.length === 0 && <p className={styles.nodeScopeGlobal}>{t("templates.builder.nodeScopeGlobal")}</p>}
                <ScopeTreePicker
                  tree={tree}
                  value={state.nodeAssignments}
                  onChange={(next) => patchConfig({ ...state, nodeAssignments: next })}
                  disabled={!canEdit}
                  defaultIncludeDescendants={false}
                />
              </>
            )}
          </FormField>
        </Card>
      )}
    </div>
  );
}

// ── Campos de resumen en la grilla (2.8.1a) ───────────────────────────────────
// "El diseñador ofrece, el usuario dispone": aquí la plantilla marca el POOL de
// campos candidatos (gobernanza viva del contenedor, se guarda con "Guardar
// configuración"). En 2.8.1b el usuario elegirá cuáles ver y en qué orden.
function GridSummaryFields({
  state,
  canEdit,
  patchConfig,
}: {
  state: EditState;
  canEdit: boolean;
  patchConfig: (next: EditState) => void;
}) {
  const { t } = useTranslation();
  // Campos elegibles: todos menos los de firma (no tienen un valor legible de negocio).
  const candidates = state.sections.flatMap((s) =>
    s.fields.filter((f) => f.type !== "SIGNATURE").map((f) => ({ key: f.key, label: f.label, section: s.title })),
  );
  const selected = state.gridFieldKeys;
  const atCap = selected.length >= GRID_FIELD_KEYS_MAX;

  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    patchConfig({ ...state, gridFieldKeys: next });
  };

  return (
    <Card className={styles.configGroup}>
      <div className={styles.configGroupTitle}>{t("templates.builder.gridSummary")}</div>
      <p className={styles.configLiveHint}>{t("templates.builder.gridSummaryHint")}</p>
      {candidates.length === 0 ? (
        <p className={styles.nodeScopeGlobal}>{t("templates.builder.gridSummaryEmpty")}</p>
      ) : (
        <>
          <div className={styles.gridSummaryCount}>
            {t("templates.builder.gridSummaryCount", { count: selected.length, max: GRID_FIELD_KEYS_MAX })}
          </div>
          <ul className={styles.gridSummaryList}>
            {candidates.map((c) => {
              const checked = selected.includes(c.key);
              const blocked = !canEdit || (!checked && atCap);
              return (
                <li key={c.key} className={styles.gridSummaryItem}>
                  <Checkbox
                    checked={checked}
                    disabled={blocked}
                    onChange={() => toggle(c.key)}
                    aria-label={c.label || c.key}
                  />
                  <button
                    type="button"
                    className={styles.gridSummaryLabel}
                    disabled={blocked}
                    onClick={() => !blocked && toggle(c.key)}
                  >
                    <span>{c.label || c.key}</span>
                    <span className={styles.gridSummarySection}>{c.section}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
