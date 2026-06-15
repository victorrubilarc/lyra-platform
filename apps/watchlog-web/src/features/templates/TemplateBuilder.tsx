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
  Grid3x3,
  IdCard,
  LayoutPanelLeft,
  Monitor,
  Network,
  Pencil,
  Save,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { Button, Card, Checkbox, Chip, Drawer, FormField, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import { GRID_FIELD_KEYS_MAX } from "@lyra/contracts";
import type { EquipmentMode, FieldType, TemplateDetail } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { EditWindowDurationField } from "../settings/EditWindowDurationField.js";
import { fetchRoles } from "../security/security-api.js";
import { ScopeTreePicker } from "../security/ScopeTreePicker.js";
import { useOrgTree } from "../structure/structure-queries.js";
import {
  collectFieldKeys,
  collectSectionKeys,
  compactFields,
  defaultFieldConfig,
  defaultFieldH,
  detailToEditState,
  editStateToConfigRequest,
  editStateToDraftRequest,
  fieldPresetById,
  nextFreeRow,
  nextUid,
  slugifyKey,
  totalFields,
  uniqueKey,
  type EditField,
  type EditSection,
  type EditState,
} from "./builder-model.js";
import { AddFieldPopover } from "./AddFieldPopover.js";
import { BuilderConfigPanel } from "./BuilderConfigPanel.js";
import { FieldControl } from "./FieldControl.js";
import { FieldGrid } from "./FieldGrid.js";
import { FieldPropertiesPanel } from "./FieldPropertiesPanel.js";
import { SectionCanvas, type CanvasGeometry } from "./SectionCanvas.js";
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

/** Dispositivo del lienzo (Fase 2.1.7): escritorio editable · tablet/móvil = preview. */
type Device = "desktop" | "tablet" | "mobile";
/** Ancho del marco de preview por dispositivo (activa las container-queries de FieldGrid). */
const DEVICE_WIDTH: Record<Device, number | null> = { desktop: null, tablet: 834, mobile: 390 };

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
  // Lienzo de posicionamiento libre (Fase 2.1.7): dispositivo activo (escritorio edita;
  // tablet/móvil = preview responsivo) + cuadrícula visible.
  const [device, setDevice] = useState<Device>("desktop");
  const [showGrid, setShowGrid] = useState(true);
  // Drawer de configuración AVANZADA (umbral/opciones/condicional/fórmula/roles): se abre
  // con "Opciones avanzadas" del panel de propiedades o de la sección.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Una versión PUBLICADA es de solo lectura; "Editar" entra a modo borrador para
  // tocar la definición (al guardar, el backend CLONA un nuevo borrador). Las
  // ediciones de DEFINICIÓN (secciones/campos/flujo/reglas) se habilitan con esto;
  // la GOBERNANZA (Configuración: identidad/alcance/ventana/equipo) se edita en vivo.
  const [draftMode, setDraftMode] = useState(false);

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
  // ¿Se puede editar la DEFINICIÓN ahora? Si la versión está publicada, solo tras
  // pulsar "Editar" (modo borrador). Fuente única para gobernar TODOS los controles
  // de definición (secciones/campos/flujo/reglas) de forma coherente.
  const editable = canEdit && (!isPublishedView || draftMode);

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
  // Las columnas NUMÉRICAS de una TABLA (Ola 4) habilitan los agregados (suma/promedio…).
  const allFields = useMemo<RuleFieldRef[]>(
    () =>
      state.sections.flatMap((s) =>
        s.fields.map((f) => {
          const src = (f.config as { optionSource?: { kind?: string; items?: { code: string; label: string }[] } }).optionSource;
          const options = src?.kind === "inline" && Array.isArray(src.items) ? src.items : undefined;
          const cols =
            f.type === "TABLE"
              ? ((f.config as { columns?: { key: string; label: string; type: string }[] }).columns ?? [])
                  .filter((c) => c.type === "NUMBER")
                  .map((c) => ({ key: c.key, label: c.label }))
              : undefined;
          return { key: f.key, label: f.label, type: f.type, options, columns: cols && cols.length > 0 ? cols : undefined };
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

  /**
   * Agrega un campo a ANCHO COMPLETO en una fila libre al final de la sección
   * (clic en la paleta). Si no hay sección, crea una. Para soltar en una posición
   * concreta del lienzo se usa `addFieldAtGeom`.
   */
  function addFieldAt(presetId: string, targetSUid?: string) {
    const preset = fieldPresetById(presetId);
    const type: FieldType = preset?.type ?? "TEXT";
    const label = t(preset?.labelKey ?? "templates.fieldTypes.text");
    const presetConfig = preset?.config() ?? defaultFieldConfig(type);
    let sections = state.sections;
    let sUid = targetSUid ?? selected?.s ?? sections[sections.length - 1]?.uid ?? null;
    if (!sUid) {
      const stitle = t("templates.builder.sectionDefault");
      const skey = uniqueKey(slugifyKey(stitle, "seccion_1"), collectSectionKeys(state));
      const sec: EditSection = { uid: nextUid(), key: skey, title: stitle, description: null, requireSignature: false, editableInStateKey: null, roleIds: [], fields: [] };
      sections = [...sections, sec];
      sUid = sec.uid;
    }
    const fkey = uniqueKey(slugifyKey(label, "campo"), collectFieldKeys({ ...state, sections }));
    const target = sections.find((s) => s.uid === sUid);
    // Campo nuevo a ANCHO COMPLETO en una FILA LIBRE al final (clic en la paleta).
    const field: EditField = {
      uid: nextUid(),
      key: fkey,
      type,
      semanticRole: null,
      label,
      help: null,
      required: false,
      config: presetConfig,
      visibleWhen: null,
      computed: null,
      colSpan: 12,
      gridX: 0,
      gridY: target ? nextFreeRow(target.fields) : 0,
      gridH: defaultFieldH(type),
      roleIds: [],
    };
    sections = sections.map((s) => (s.uid === sUid ? { ...s, fields: [...s.fields, field] } : s));
    patchState({ ...state, sections });
    setSelected({ s: sUid, f: field.uid });
  }

  /**
   * Inserta un campo NUEVO en una POSICIÓN del lienzo (arrastre desde la paleta).
   * El ancho por defecto es 6 columnas (medio); el operador lo redimensiona luego.
   */
  function addFieldAtGeom(presetId: string, sUid: string, x: number, y: number) {
    const preset = fieldPresetById(presetId);
    const type: FieldType = preset?.type ?? "TEXT";
    const label = t(preset?.labelKey ?? "templates.fieldTypes.text");
    const fkey = uniqueKey(slugifyKey(label, "campo"), collectFieldKeys(state));
    const w = 6;
    const field: EditField = {
      uid: nextUid(),
      key: fkey,
      type,
      semanticRole: null,
      label,
      help: null,
      required: false,
      config: preset?.config() ?? defaultFieldConfig(type),
      visibleWhen: null,
      computed: null,
      colSpan: w,
      gridX: Math.max(0, Math.min(x, 12 - w)),
      gridY: Math.max(0, y),
      gridH: defaultFieldH(type),
      roleIds: [],
    };
    patchState({
      ...state,
      // Compactar tras soltar: el campo nuevo no se encima de los existentes.
      sections: state.sections.map((s) => (s.uid === sUid ? { ...s, fields: compactFields([...s.fields, field]) } : s)),
    });
    setSelected({ s: sUid, f: field.uid });
  }

  /** Commit de geometría {x,y,w,h} desde el lienzo (al soltar/redimensionar). */
  function updateFieldGeometry(sUid: string, geom: CanvasGeometry[]) {
    const byUid = new Map(geom.map((g) => [g.uid, g]));
    patchState({
      ...state,
      sections: state.sections.map((s) => {
        if (s.uid !== sUid) return s;
        return {
          ...s,
          fields: s.fields.map((f) => {
            const g = byUid.get(f.uid);
            return g ? { ...f, gridX: g.x, gridY: g.y, colSpan: g.w, gridH: g.h } : f;
          }),
        };
      }),
    });
  }

  /** Duplica un campo (clon con uid + key únicos), colocado en una fila libre al final. */
  function duplicateField(sUid: string, fUid: string) {
    const section = state.sections.find((s) => s.uid === sUid);
    const src = section?.fields.find((f) => f.uid === fUid);
    if (!src || !section) return;
    const fkey = uniqueKey(`${src.key}_copia`, collectFieldKeys(state));
    const clone: EditField = {
      ...src,
      uid: nextUid(),
      key: fkey,
      config: { ...src.config },
      gridX: 0,
      gridY: nextFreeRow(section.fields),
    };
    patchState({
      ...state,
      sections: state.sections.map((s) => (s.uid === sUid ? { ...s, fields: [...s.fields, clone] } : s)),
    });
    setSelected({ s: sUid, f: clone.uid });
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
                  {canEdit && isPublishedView && !draftMode && (
                    <Button variant="primary" onClick={() => setDraftMode(true)}>
                      <Pencil size={15} /> {t("templates.builder.editDraft")}
                    </Button>
                  )}
                  {editable && (
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

              {isPublishedView && !draftMode && (designTab === "editor" || designTab === "rules") && (
                <div className={styles.readOnlyBanner}>
                  <span>{t("templates.builder.publishedReadOnly")}</span>
                  {canEdit && (
                    <button type="button" className={styles.readOnlyBannerBtn} onClick={() => setDraftMode(true)}>
                      <Pencil size={13} /> {t("templates.builder.editDraft")}
                    </button>
                  )}
                </div>
              )}
              {isPublishedView && draftMode && (designTab === "editor" || designTab === "rules") && (
                <div className={styles.draftEditingBanner}>{t("templates.builder.draftEditingHint")}</div>
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
                  canEdit={editable}
                  onChange={setRules}
                />
              ) : (
                /* DISEÑADOR VISUAL (Fase 2.1.7): LIENZO protagonista a ancho completo.
                   Agregar campo = botón "＋" con buscador (popover). Las propiedades
                   aparecen (panel flotante) solo al seleccionar un campo. */
                <div className={styles.editorWrap}>
                  <div className={styles.designerCenter}>
                    {/* Barra superior del lienzo: flujo + dispositivo + cuadrícula + sección. */}
                    <div className={styles.canvasBar}>
                      <div className={styles.canvasBarFlow}>
                        <FormField label={t("templates.builder.workflow")} hint={t("templates.builder.workflowHint")}>
                          {({ id }) => (
                            <Select id={id} value={state.workflowDefinitionId ?? ""} disabled={!editable} onChange={(e) => setWorkflow(e.target.value)}>
                              <option value="">{t("templates.builder.workflowNone")}</option>
                              {publishedWorkflows.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                              {state.workflowDefinitionId &&
                                !publishedWorkflows.some((w) => w.id === state.workflowDefinitionId) && (
                                  <option value={state.workflowDefinitionId}>
                                    {assignedWorkflow.data?.name ?? state.workflowDefinitionId}
                                  </option>
                                )}
                            </Select>
                          )}
                        </FormField>
                      </div>
                      <div className={styles.canvasTools}>
                        <div className={styles.deviceSwitch} role="group" aria-label={t("templates.builder.deviceDesktop")}>
                          <button type="button" className={device === "desktop" ? styles.deviceOn : styles.deviceBtn} onClick={() => setDevice("desktop")} title={t("templates.builder.deviceDesktop")}><Monitor size={15} /></button>
                          <button type="button" className={device === "tablet" ? styles.deviceOn : styles.deviceBtn} onClick={() => setDevice("tablet")} title={t("templates.builder.deviceTablet")}><Tablet size={15} /></button>
                          <button type="button" className={device === "mobile" ? styles.deviceOn : styles.deviceBtn} onClick={() => setDevice("mobile")} title={t("templates.builder.deviceMobile")}><Smartphone size={15} /></button>
                        </div>
                        <button type="button" className={showGrid ? styles.toolOn : styles.toolBtn} onClick={() => setShowGrid((v) => !v)} title={t("templates.builder.toggleGrid")} aria-pressed={showGrid}><Grid3x3 size={15} /></button>
                        {state.sections.length > 0 && <AddFieldPopover canEdit={editable} variant="bar" onPick={(type) => addFieldAt(type)} />}
                        <button type="button" className={styles.addSectionBtn} onClick={addSection} disabled={!editable}>
                          <FilePlus2 size={15} /> {t("templates.builder.addSection")}
                        </button>
                      </div>
                    </div>

                    {device !== "desktop" && <div className={styles.devicePreviewHint}>{t("templates.builder.devicePreviewHint")}</div>}

                    <div className={styles.canvasScroll} onClick={() => setSelected(null)}>
                      {state.sections.length === 0 ? (
                        <div className={styles.emptyCanvas}>{t("templates.builder.canvasDropHint")}</div>
                      ) : (
                        <div
                          className={styles.deviceFrame}
                          style={device !== "desktop" ? { maxWidth: DEVICE_WIDTH[device]!, marginInline: "auto" } : undefined}
                        >
                          {state.sections.map((s, si) => (
                            <Card
                              key={s.uid}
                              className={selected?.s === s.uid && !selected.f ? styles.sectionCardActive : styles.sectionCard}
                              onClick={(e) => { e.stopPropagation(); setSelected({ s: s.uid }); }}
                            >
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionTitleWrap}>
                                  <input
                                    className={styles.inlineSectionTitle}
                                    value={s.title}
                                    disabled={!editable}
                                    aria-label={t("templates.builder.sectionTitle")}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateSection(s.uid, { title: e.target.value })}
                                  />
                                  <input
                                    className={styles.inlineSectionDesc}
                                    value={s.description ?? ""}
                                    disabled={!editable}
                                    placeholder={t("templates.builder.sectionDescription")}
                                    aria-label={t("templates.builder.sectionDescription")}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateSection(s.uid, { description: e.target.value || null })}
                                  />
                                </div>
                                {s.requireSignature && <Chip variant="info" label="Part 11" />}
                                <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                                  <button type="button" className={styles.iconBtn} onClick={() => { setSelected({ s: s.uid }); setDrawerOpen(true); }} title={t("templates.builder.sectionOptions")}><SlidersHorizontal size={14} /></button>
                                  <button type="button" className={styles.iconBtn} onClick={() => moveSection(s.uid, -1)} disabled={!editable || si === 0} aria-label={t("common.moveUp")}><ArrowUp size={13} /></button>
                                  <button type="button" className={styles.iconBtn} onClick={() => moveSection(s.uid, 1)} disabled={!editable || si === state.sections.length - 1} aria-label={t("common.moveDown")}><ArrowDown size={13} /></button>
                                  <button type="button" className={styles.iconBtnDanger} onClick={() => deleteSection(s.uid)} disabled={!editable} aria-label={t("common.delete")}><Trash2 size={13} /></button>
                                </div>
                              </div>

                              {device === "desktop" ? (
                                /* Lienzo SIEMPRE (también vacío ⇒ zona de drop con altura mínima). */
                                <SectionCanvas
                                  fields={s.fields}
                                  canEdit={editable}
                                  showGrid={showGrid}
                                  selectedFUid={selected?.s === s.uid ? selected.f ?? null : null}
                                  onSelectField={(fUid) => setSelected({ s: s.uid, f: fUid })}
                                  onLabel={(fUid, label) => updateField(s.uid, fUid, { label })}
                                  onGeometryChange={(geom) => updateFieldGeometry(s.uid, geom)}
                                  onDropNew={(type, x, y) => addFieldAtGeom(type, s.uid, x, y)}
                                />
                              ) : s.fields.length === 0 ? (
                                <div className={styles.emptySection}>{t("templates.builder.canvasDropHint")}</div>
                              ) : (
                                /* Preview responsivo (tablet/móvil): MISMO render que el operador. */
                                <FieldGrid
                                  fields={s.fields}
                                  renderCell={(f) => <FieldControl field={f} value={undefined} onChange={() => undefined} readOnly />}
                                />
                              )}

                              {device === "desktop" && (
                                <div className={styles.sectionAddRow} onClick={(e) => e.stopPropagation()}>
                                  <AddFieldPopover canEdit={editable} variant="section" onPick={(type) => addFieldAt(type, s.uid)} />
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Propiedades: panel FLOTANTE, aparece solo al seleccionar un campo. */}
                  {selectedField && selectedSection && (
                    <FieldPropertiesPanel
                      field={selectedField}
                      canEdit={editable}
                      onClose={() => setSelected({ s: selectedSection.uid })}
                      onLabel={(label) => updateField(selectedSection.uid, selectedField.uid, { label })}
                      onRequired={(required) => updateField(selectedSection.uid, selectedField.uid, { required })}
                      onWidth={(w) => {
                        const gridX = Math.max(0, Math.min(selectedField.gridX, 12 - w));
                        updateField(selectedSection.uid, selectedField.uid, { colSpan: w, gridX });
                      }}
                      onHeight={(h) => updateField(selectedSection.uid, selectedField.uid, { gridH: h })}
                      onAdvanced={() => setDrawerOpen(true)}
                      onDuplicate={() => duplicateField(selectedSection.uid, selectedField.uid)}
                      onDelete={() => deleteField(selectedSection.uid, selectedField.uid)}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Configuración AVANZADA del campo/sección seleccionado (lo común se edita en
          el lienzo). Se abre con "Más opciones"; en escritorio convive con el lienzo. */}
      <Drawer
        open={drawerOpen && view === "design" && designTab === "editor" && Boolean(selectedField || selectedSection)}
        onClose={() => setDrawerOpen(false)}
        title={selectedField ? t("templates.builder.fieldOptions") : t("templates.builder.sectionOptions")}
        width={420}
      >
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
      </Drawer>

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
