import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Lock,
  PenLine,
  Send,
  TimerOff,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { DeferralModal } from "./DeferralModal.js";
import { VoidEntryModal } from "./VoidEntryModal.js";
import { useAuth } from "../../auth/use-auth.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { EditWindowOverrideModal, type EditWindowOverrideFields } from "./EditWindowOverrideModal.js";
import { Button, Card, Chip, EmptyState, Spinner, useToast } from "@lyra/ui";
import {
  collectVarRefs,
  evaluateCrossRules,
  evaluateExpression,
  isFieldVisible,
  isPresentationalType,
  recomputeComputedValues,
  validateFieldValue,
  type AvailableTransitionDto,
  type DeferralInput,
  type ExecuteTransitionRequest,
  type FieldForRules,
  type LogEntryDetail,
  type LogEntrySectionStateDto,
  type TemplateFieldDto,
  type TemplateSectionDto,
} from "@lyra/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { formatDateTime } from "../../lib/format.js";
import { FieldControl } from "../templates/FieldControl.js";
import { FieldGrid } from "../templates/FieldGrid.js";
import { createLogEntry, executeTransition as executeTransitionApi, saveLogEntrySection, submitLogEntry } from "./log-entries-api.js";
import {
  LOG_ENTRY_KEYS,
  useExecuteTransition,
  useLogEntry,
  useNewLogEntryPreview,
  useSaveLogEntrySection,
  useSetDeferral,
  useSubmitLogEntry,
  useVoidLogEntry,
} from "./log-entries-queries.js";
import { SectionSignModal } from "./SectionSignModal.js";
import { TransitionModal } from "./TransitionModal.js";
import styles from "./LogEntries.module.css";

type Draft = Record<string, unknown>;

/** Códigos permitidos inline (para validación inmediata; el catálogo de listas lo valida el backend). */
function inlineCodes(config: Record<string, unknown>): string[] | undefined {
  const src = config.optionSource as { kind?: string; items?: { code: string }[] } | undefined;
  if (src?.kind === "inline") return (src.items ?? []).map((i) => i.code);
  return undefined; // referenceList/external → sin restricción en cliente (servidor manda)
}

function fieldForValidation(f: TemplateFieldDto) {
  return { key: f.key, type: f.type, dataType: f.dataType, label: f.label, config: f.config };
}

/** Texto de error a mostrar: prioriza los mensajes detallados del backend (reglas,
 * obligatorios) sobre el mensaje genérico, para que el operador vea QUÉ falló. */
function apiErrorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.details && e.details.length > 0) return e.details.join(" · ");
    return e.message;
  }
  return fallback;
}

export function EntryFillPage() {
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  // Dos rutas comparten esta pantalla: COMPOSE (`/nueva-entrada/comenzar/:templateId`,
  // entrada NUEVA aún sin crear, 2.8.2) y EDICIÓN (`/nueva-entrada/:id`, entrada real).
  const composeTemplateId = params.templateId ?? null;
  const routeId = params.id ?? "";
  const compose = !!composeTemplateId;

  const navState = (location.state ?? {}) as {
    orgNodeId?: string | null;
    equipmentId?: string | null;
    deferred?: DeferralInput | null;
  };
  const [composeOrgNodeId] = useState<string | null>(navState.orgNodeId ?? null);
  // Equipo OPCIONAL elegido en el picker (2.8.0.1): viaja por el state y se aplica al materializar.
  const [composeEquipmentId] = useState<string | null>(navState.equipmentId ?? null);
  // Diferido declarado en compose (en memoria hasta materializar). Se aplica al crear.
  const [composeDeferred, setComposeDeferred] = useState<DeferralInput | null>(navState.deferred ?? null);
  const [creating, setCreating] = useState(false);
  // Id de la entrada YA materializada (tras el primer guardado en compose). Cambia
  // la pantalla a modo edición SIN remontar (preserva el borrador local). El ref
  // garantiza creación ÚNICA aunque la acción posterior falle y se reintente.
  const [materializedId, setMaterializedId] = useState<string | null>(null);
  const createdIdRef = useRef<string | null>(null);

  const composeActive = compose && !materializedId;
  const activeId = materializedId ?? routeId;

  const existing = useLogEntry(composeActive ? null : activeId);
  const preview = useNewLogEntryPreview(composeTemplateId, composeOrgNodeId, composeEquipmentId, composeActive);
  const entry = composeActive ? preview.data : existing.data;
  const isLoading = composeActive ? preview.isLoading : existing.isLoading;
  const isError = composeActive ? preview.isError : existing.isError;

  // Mutaciones de la entrada REAL. En compose-activo se usan llamadas directas
  // tras materializar; una vez materializada, estos hooks operan sobre su id.
  const save = useSaveLogEntrySection(activeId);
  const submit = useSubmitLogEntry(activeId);
  const transition = useExecuteTransition(activeId);
  const setDeferral = useSetDeferral(activeId);
  const voidEntry = useVoidLogEntry(activeId);
  const { user } = useAuth();
  const perms = usePermissions();

  const [draft, setDraft] = useState<Draft>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deferralOpen, setDeferralOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [activeTransition, setActiveTransition] = useState<AvailableTransitionDto | null>(null);
  const [signingSection, setSigningSection] = useState<{ section: TemplateSectionDto; st: LogEntrySectionStateDto } | null>(null);
  // Override de ventana de edición pendiente (2.7.2): el modal recolecta motivo
  // (+ credenciales si corresponde) y reanuda la acción interceptada.
  const [overrideRequest, setOverrideRequest] = useState<{
    requirePassword: boolean;
    run: (fields: EditWindowOverrideFields) => void;
  } | null>(null);

  // Semilla del borrador local desde los valores del servidor (una vez por entrada).
  useEffect(() => {
    if (!entry) return;
    const seed: Draft = {};
    for (const v of entry.values) seed[v.fieldKey] = v.value;
    // Un campo SÍ/NO (toggle) sin valor previo arranca en `false` (apagado = No),
    // no en "vacío": así las reglas que comparan `= No` se evalúan desde el inicio
    // sin tener que "moverlo". Los formulados (read-only) no se siembran.
    for (const s of entry.version.sections) {
      for (const f of s.fields) {
        if (f.type === "BOOLEAN" && !f.computed && seed[f.key] === undefined) seed[f.key] = false;
      }
    }
    setDraft(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const setValue = (key: string, value: unknown) => setDraft((p) => ({ ...p, [key]: value }));

  // Foto con los campos FORMULADOS recomputados EN VIVO (Req-7), con la misma
  // función pura del backend (el servidor manda al guardar; esto da feedback).
  const display = useMemo(() => {
    if (!entry) return draft;
    const fields: FieldForRules[] = entry.version.sections.flatMap((s) =>
      s.fields.map((f) => ({ key: f.key, dataType: f.dataType, computed: f.computed })),
    );
    return recomputeComputedValues(fields, draft);
  }, [entry, draft]);

  // Reglas cruzadas que dispararían con la foto actual (ERROR bloquea / WARN informa).
  const ruleHits = useMemo(
    () => (entry ? evaluateCrossRules(entry.version.rules, display) : { errors: [], warnings: [] }),
    [entry, display],
  );

  // Campos involucrados en una regla que SE DISPARA ahora (para resaltarlos).
  const ruleProblemFields = useMemo(() => {
    const keys = new Set<string>();
    if (!entry) return keys;
    for (const r of entry.version.rules) {
      if (r.enabled === false) continue;
      if (evaluateExpression(r.when, display) === true) collectVarRefs(r.when, keys);
    }
    return keys;
  }, [entry, display]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Spinner />
      </div>
    );
  }
  if (isError || !entry) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.fill.loadError")} />
      </div>
    );
  }

  const isDraft = entry.status === "DRAFT";
  const stateBySection = new Map(entry.sectionStates.map((s) => [s.sectionKey, s]));

  // Esta pantalla se abre como EDICIÓN de una entrada existente (desde Bitácoras vía
  // /bitacoras/:id/editar) o como creación/compose (/nueva-entrada). El backend
  // decide siempre; aquí solo cambia el rótulo, el "Volver" y la acción de anular.
  const editingExisting = location.pathname.endsWith("/editar");
  // Anular borrador (2.8.2): solo un DRAFT ya materializado; el AUTOR puede el
  // propio (ownership) o quien tenga `logentry:void` puede el ajeno. El backend
  // re-autoriza; esto solo oculta el control cuando no aplica.
  const canVoid =
    isDraft && !composeActive && (entry.createdById === user?.id || perms.can("logentry:void"));

  function handleVoid(reason: string) {
    voidEntry.mutate(
      { reason },
      {
        onSuccess: () => {
          setVoidOpen(false);
          toast.success(t("logbook.void.done"));
          navigate("/bitacoras");
        },
        onError: (e) => toast.error(apiErrorText(e, t("logbook.void.error"))),
      },
    );
  }

  // Ventana de edición (2.7.2): vencida + permiso de override ⇒ toda escritura
  // pasa por el modal de motivo (el backend exige el motivo igual; la UI anticipa).
  const editWindow = entry.editWindow;
  const needsOverride = isDraft && Boolean(editWindow?.expired && editWindow.canOverride);

  /** Intercepta una escritura: dentro de ventana corre directo; vencida, pide motivo. */
  function withOverride(run: (fields?: EditWindowOverrideFields) => void, opts?: { requirePassword?: boolean }) {
    if (!needsOverride) return run();
    setOverrideRequest({
      requirePassword: Boolean(opts?.requirePassword),
      run: (fields) => {
        setOverrideRequest(null);
        run(fields);
      },
    });
  }

  // Progreso y completitud (espejo del guard del backend: secciones CON campos).
  const sectionsWithFields = entry.version.sections.filter((s) => s.fields.length > 0);
  const completedCount = sectionsWithFields.filter((s) => stateBySection.get(s.key)?.state === "COMPLETED").length;
  // Secciones que el backend exigirá COMPLETED para enviar (sin flujo) o avanzar
  // (con flujo): las editables en el estado actual. El servidor re-valida siempre.
  const missingSections = sectionsWithFields.filter(
    (s) =>
      (s.editableInStateKey === null || s.editableInStateKey === entry.currentStateKey) &&
      stateBySection.get(s.key)?.state !== "COMPLETED",
  );
  const missingTitles = missingSections.map((s) => `«${s.title}»`).join(", ");

  // Huella del diferido, compatible con compose (declarado en memoria) y edición.
  const showDeferred = composeActive ? !!composeDeferred : entry.entryOrigin === "DEFERRED";
  const declaredAtDisplay = composeActive ? (composeDeferred?.effectiveAt ?? null) : entry.declaredEffectiveAt;
  const deferredReasonDisplay = composeActive ? (composeDeferred?.reason ?? null) : entry.deferredReason;
  const canDeclareDeferral = isDraft && !entry.sealedAt;

  /** Motivo de bloqueo de la sección, tal como lo decidió el backend. */
  function blockedMessage(section: TemplateSectionDto, st: LogEntrySectionStateDto): string {
    switch (st.blockedReason) {
      case "MISSING_ROLE":
        return t("logbook.fill.blockedMissingRole", { roles: st.assignedRoleNames.join(", ") });
      case "WRONG_STATE": {
        const stateName =
          entry?.workflowVersion?.states.find((s) => s.key === section.editableInStateKey)?.name ??
          section.editableInStateKey ??
          "";
        return t("logbook.fill.blockedWrongState", { state: stateName });
      }
      case "PERIOD_CLOSED":
        return t("logbook.fill.blockedPeriodClosed", { period: entry?.periodKey ?? "" });
      case "EDIT_WINDOW_EXPIRED":
        return t("logbook.fill.blockedWindowExpired", {
          until: editWindow ? formatDateTime(editWindow.expiresAt) : "—",
        });
      default:
        return t("logbook.fill.blockedEntryClosed");
    }
  }

  /** Valores a enviar de una sección (sin los reservados a otro rol ni los FORMULADOS:
   * el valor de un campo formulado lo deriva el servidor y RECHAZA que el cliente lo envíe). */
  function valuesFor(section: TemplateSectionDto, st: LogEntrySectionStateDto) {
    const restricted = new Set(st.readOnlyFieldKeys);
    const visible = section.fields.filter(
      (f) =>
        isFieldVisible(f.visibleWhen, display) &&
        !restricted.has(f.key) &&
        !f.computed &&
        !isPresentationalType(f.type), // objetos de presentación: no producen valor
    );
    return visible.map((f) => ({ fieldKey: f.key, value: draft[f.key] ?? null }));
  }

  /**
   * COMPOSE (2.8.2): MATERIALIZA la entrada (crea el LogEntry con el diferido
   * declarado, si lo hay) recién en el primer guardado real, y devuelve su id.
   * Antes de esto, elegir plantilla y entrar/salir NO deja ningún registro. El ref
   * asegura que un reintento tras un fallo NO cree una segunda entrada. Actualiza
   * la URL a la entrada real (sin remontar) para que un reload cargue lo correcto.
   */
  async function materialize(): Promise<string> {
    if (createdIdRef.current) return createdIdRef.current;
    const created = await createLogEntry({
      templateId: composeTemplateId!,
      ...(composeOrgNodeId ? { orgNodeId: composeOrgNodeId } : {}),
      ...(composeEquipmentId ? { equipmentId: composeEquipmentId } : {}),
      ...(composeDeferred ? { deferred: composeDeferred } : {}),
    });
    createdIdRef.current = created.id;
    window.history.replaceState(null, "", `/nueva-entrada/${created.id}`);
    return created.id;
  }

  /** Compose: crea la entrada + guarda la 1ª sección en un gesto; queda en modo edición. */
  async function composeSaveSection(
    section: TemplateSectionDto,
    st: LogEntrySectionStateDto,
    markComplete: boolean,
    password?: string,
  ) {
    setSavingKey(section.key + (markComplete ? ":complete" : ""));
    setCreating(true);
    try {
      const newId = await materialize();
      const detail = await saveLogEntrySection(newId, section.key, {
        expectedVersion: 0,
        values: valuesFor(section, st),
        markComplete,
        password,
      });
      qc.setQueryData(LOG_ENTRY_KEYS.detail(newId), detail);
      toast.success(markComplete ? t("logbook.fill.sectionCompleted") : t("logbook.fill.sectionSaved"));
      setSigningSection(null);
      setMaterializedId(newId); // pasa a modo edición (sin remontar; preserva el borrador)
    } catch (e) {
      // Si la entrada llegó a crearse, cambia a ella para que el reintento no duplique.
      if (createdIdRef.current) setMaterializedId(createdIdRef.current);
      toast.error(apiErrorText(e, t("common.errorGeneric")));
    } finally {
      setCreating(false);
      setSavingKey(null);
    }
  }

  function saveSection(
    section: TemplateSectionDto,
    st: LogEntrySectionStateDto,
    markComplete: boolean,
    password?: string,
    override?: EditWindowOverrideFields,
  ) {
    if (composeActive) {
      void composeSaveSection(section, st, markComplete, password);
      return;
    }
    setSavingKey(section.key + (markComplete ? ":complete" : ""));
    save.mutate(
      {
        sectionKey: section.key,
        dto: {
          expectedVersion: st.version,
          values: valuesFor(section, st),
          markComplete,
          password: password ?? override?.password,
          mfaCode: override?.mfaCode,
          overrideReason: override?.overrideReason,
        },
      },
      {
        onSuccess: () => {
          toast.success(markComplete ? t("logbook.fill.sectionCompleted") : t("logbook.fill.sectionSaved"));
          setSigningSection(null);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) {
            toast.error(t("logbook.fill.conflict"));
            void qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.detail(routeId) });
          } else toast.error(apiErrorText(e, t("common.errorGeneric")));
        },
        onSettled: () => setSavingKey(null),
      },
    );
  }

  /** Guardar avance: fuera de ventana pasa por el modal de motivo (2.7.2). */
  function saveProgress(section: TemplateSectionDto, st: LogEntrySectionStateDto) {
    withOverride((ov) => saveSection(section, st, false, undefined, ov));
  }

  /**
   * Completar: si la sección exige firma (Part 11), pide contraseña. Fuera de
   * ventana, el modal de override recolecta motivo + contraseña en UN paso (la
   * misma contraseña re-autentica la firma y el override).
   */
  function completeSection(section: TemplateSectionDto, st: LogEntrySectionStateDto) {
    if (needsOverride) {
      withOverride((ov) => saveSection(section, st, true, undefined, ov), { requirePassword: section.requireSignature });
    } else if (section.requireSignature) {
      setSigningSection({ section, st });
    } else {
      saveSection(section, st, true);
    }
  }

  function doSubmit() {
    if (composeActive) {
      void composeFinalize((newId) => submitLogEntry(newId, {}), () => toast.success(t("logbook.fill.submitted")));
      return;
    }
    withOverride((ov) =>
      submit.mutate(
        { overrideReason: ov?.overrideReason, password: ov?.password, mfaCode: ov?.mfaCode },
        {
          onSuccess: () => toast.success(t("logbook.fill.submitted")),
          onError: (e) => toast.error(apiErrorText(e, t("common.errorGeneric"))),
        },
      ),
    );
  }

  function runTransition(dto: Omit<ExecuteTransitionRequest, "transitionKey">) {
    if (!activeTransition) return;
    const tr = activeTransition;
    if (composeActive) {
      void composeFinalize(
        (newId) => executeTransitionApi(newId, { transitionKey: tr.transitionKey, ...dto }),
        () => {
          toast.success(t("logbook.transition.done", { state: tr.toStateName }));
          setActiveTransition(null);
        },
      );
      return;
    }
    transition.mutate(
      { transitionKey: tr.transitionKey, ...dto },
      {
        onSuccess: () => {
          toast.success(t("logbook.transition.done", { state: tr.toStateName }));
          setActiveTransition(null);
        },
        onError: (e) => toast.error(apiErrorText(e, t("common.errorGeneric"))),
      },
    );
  }

  /**
   * Compose: materializa y ejecuta una acción de finalización (enviar/transición),
   * cebando la caché y pasando a modo edición. Creación única (ref); si la acción
   * falla tras crear, igual cambia a la entrada real para no duplicar al reintentar.
   */
  async function composeFinalize(run: (newId: string) => Promise<LogEntryDetail>, onOk: () => void) {
    setCreating(true);
    try {
      const newId = await materialize();
      const detail = await run(newId);
      qc.setQueryData(LOG_ENTRY_KEYS.detail(newId), detail);
      onOk();
      setMaterializedId(newId);
    } catch (e) {
      if (createdIdRef.current) setMaterializedId(createdIdRef.current);
      toast.error(apiErrorText(e, t("common.errorGeneric")));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.page}>
      {/* "Volver": una entrada NUEVA aún sin crear vuelve al picker; editar desde
          Bitácoras vuelve al visor de esa entrada; el resto, a la grilla. */}
      <div className={styles.fillTopBar}>
        <Button
          variant="secondary"
          className={styles.backBtn}
          onClick={() =>
            navigate(composeActive ? "/nueva-entrada" : editingExisting ? `/bitacoras/${routeId}` : "/bitacoras")
          }
        >
          <ArrowLeft size={15} /> {t("logbook.fill.back")}
        </Button>
        {canVoid && (
          <Button variant="danger" onClick={() => setVoidOpen(true)}>
            <Ban size={15} /> {t("logbook.void.action")}
          </Button>
        )}
      </div>

      {/* Cabecera: plantilla + nodo + estado + dimensiones estampadas */}
      <Card className={styles.entryHeader}>
        <div className={styles.entryHeadTop}>
          <div>
            <div className={styles.entryEyebrow}>
              {composeActive ? t("logbook.fill.eyebrowNew") : editingExisting ? t("logbook.fill.eyebrowEdit") : t("logbook.fill.eyebrowFill")}
            </div>
            <div className={styles.entryName}>{entry.templateName}</div>
            <div className={styles.entryNode}>{entry.orgNodePath ?? "—"}</div>
            {entry.equipmentName && (
              <div className={styles.entryEquipment}>
                <Wrench size={13} aria-hidden="true" /> {entry.equipmentName}
              </div>
            )}
          </div>
          <div className={styles.entryHeadChips}>
            {showDeferred && <Chip variant="warning" label={t("logbook.deferral.chip")} />}
            {entry.currentStateName && <Chip variant="info" label={entry.currentStateName} />}
            <Chip
              variant={entry.status === "SUBMITTED" ? "success" : entry.status === "VOID" ? "default" : "warning"}
              label={t(`logbook.status.${entry.status}`)}
            />
            {sectionsWithFields.length > 0 && (
              <Chip
                variant={completedCount === sectionsWithFields.length ? "success" : "default"}
                label={t("logbook.fill.progress", { done: completedCount, total: sectionsWithFields.length })}
              />
            )}
          </div>
        </div>
        <div className={styles.dimsRow}>
          <span className={styles.dimChip}>
            <Clock size={13} /> {t("logbook.fill.effectiveAt")}: <b>{formatDateTime(entry.effectiveAt)}</b>
          </span>
          {entry.shiftCode && (
            <span className={styles.dimChip}>
              <CalendarClock size={13} /> {t("logbook.fill.shift")}: <b>{entry.shiftCode}</b>
            </span>
          )}
          {entry.operationalDate && (
            <span className={styles.dimChip}>
              {t("logbook.fill.operationalDate")}: <b>{entry.operationalDate}</b>
            </span>
          )}
          {entry.periodKey && (
            <span className={styles.dimChip}>
              {t("logbook.fill.period")}: <b>{entry.periodKey}</b>
            </span>
          )}
          {showDeferred && !compose && (
            <span className={styles.dimChip}>
              <History size={13} /> {t("logbook.fill.recordedAt")}: <b>{formatDateTime(entry.recordedAt)}</b>
            </span>
          )}
        </div>

        {/* Registro diferido (2.7.0): huella visible + gesto para declarar/corregir. */}
        {showDeferred && (
          <div className={styles.deferredNote}>
            <History size={13} />
            <span>
              {t("logbook.deferral.note", { at: declaredAtDisplay ? formatDateTime(declaredAtDisplay) : "—" })}
              {deferredReasonDisplay ? ` — “${deferredReasonDisplay}”` : ""}
            </span>
            {canDeclareDeferral && (
              <button type="button" className={styles.deferralToggleLabel} onClick={() => setDeferralOpen(true)}>
                {t("logbook.deferral.edit")}
              </button>
            )}
          </div>
        )}
        {!showDeferred && canDeclareDeferral && (
          <div className={styles.deferredNote}>
            <button type="button" className={styles.deferralToggleLabel} onClick={() => setDeferralOpen(true)}>
              <History size={14} /> {t("logbook.deferral.toggleLabel")}
            </button>
          </div>
        )}
      </Card>

      {/* Ventana de edición (2.7.2): banner PROMINENTE en ambos estados — vigente
          (info) con la fecha límite, o vencida (warning) con el efecto para el actor. */}
      {isDraft &&
        editWindow &&
        (editWindow.expired ? (
          <div className={`${styles.editWindowBanner} ${styles.editWindowExpired}`}>
            <TimerOff size={18} />
            <span>
              {editWindow.canOverride
                ? t("logbook.fill.windowExpiredOverrideBanner", { until: formatDateTime(editWindow.expiresAt) })
                : t("logbook.fill.windowExpiredReadonlyBanner", { until: formatDateTime(editWindow.expiresAt) })}
            </span>
          </div>
        ) : (
          <div className={`${styles.editWindowBanner} ${styles.editWindowOk}`}>
            <Clock size={18} />
            <span>{t("logbook.fill.windowOpenBanner", { until: formatDateTime(editWindow.expiresAt) })}</span>
          </div>
        ))}

      {entry.status === "SUBMITTED" && (
        <div className={styles.sealedBanner}>
          <CheckCircle2 size={16} /> {t("logbook.fill.sealedBanner", { at: entry.sealedAt ? formatDateTime(entry.sealedAt) : "" })}
        </div>
      )}

      {/* Borrador ANULADO (2.8.2): la edición es terminal; queda solo la huella. */}
      {entry.status === "VOID" && (
        <div className={`${styles.editWindowBanner} ${styles.editWindowExpired}`}>
          <Ban size={18} />
          <span>
            {t("logbook.void.banner", {
              who: entry.voidedByName ?? "—",
              at: entry.voidedAt ? formatDateTime(entry.voidedAt) : "—",
            })}
            {entry.voidReason ? ` — “${entry.voidReason}”` : ""}
          </span>
        </div>
      )}

      {/* Reglas de negocio (Req-7): disparos cruzados con la foto actual. */}
      {(ruleHits.errors.length > 0 || ruleHits.warnings.length > 0) && (
        <div className={styles.ruleHits}>
          {ruleHits.errors.map((e) => (
            <div key={`e-${e.ruleKey}`} className={styles.ruleHitError}>
              <TriangleAlert size={14} /> {e.message}
            </div>
          ))}
          {ruleHits.warnings.map((w) => (
            <div key={`w-${w.ruleKey}`} className={styles.ruleHitWarn}>
              <AlertTriangle size={14} /> {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Secciones */}
      {entry.version.sections.map((section) => {
        const st = stateBySection.get(section.key);
        const editable = Boolean(st?.editable) && isDraft;
        const visible = section.fields.filter((f) => isFieldVisible(f.visibleWhen, display));
        const restrictedKeys = new Set(st?.readOnlyFieldKeys ?? []);
        return (
          <Card key={section.key} className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <div className={styles.sectionTitle}>{section.title}</div>
                {section.description && <div className={styles.sectionDesc}>{section.description}</div>}
              </div>
              <div className={styles.sectionMeta}>
                {st && st.assignedRoleNames.length > 0 && (
                  <Chip variant="info" label={t("logbook.fill.assignedTo", { roles: st.assignedRoleNames.join(", ") })} />
                )}
                {st && <Chip variant={st.state === "COMPLETED" ? "success" : st.state === "LOCKED" ? "default" : "warning"} label={t(`logbook.sectionState.${st.state}`)} />}
                {st?.signature && (
                  <Chip variant="success" label={t("logbook.fill.signedBy", { name: st.signature.signerName })} />
                )}
                {st?.filledByName && <span className={styles.filledBy}>{t("logbook.fill.filledBy", { name: st.filledByName })}</span>}
              </div>
            </div>

            {!editable && st && (
              <div className={styles.lockedNote}>
                <Lock size={13} /> {blockedMessage(section, st)}
              </div>
            )}

            {visible.length === 0 ? (
              <div className={styles.filledBy}>—</div>
            ) : (
              <FieldGrid
                fields={visible}
                renderCell={(f) => {
                  const restricted = restrictedKeys.has(f.key);
                  // Un campo formulado es read-only SIEMPRE (valor derivado por el servidor).
                  const fieldEditable = editable && !restricted && !f.computed;
                  const errs =
                    fieldEditable && !f.computed
                      ? validateFieldValue(fieldForValidation(f), draft[f.key], { allowedCodes: inlineCodes(f.config) }).errors
                      : [];
                  return (
                    <>
                      <FieldControl field={f} value={display[f.key]} onChange={(v) => setValue(f.key, v)} readOnly={!fieldEditable} invalid={errs.length > 0 || ruleProblemFields.has(f.key)} />
                      {restricted && editable && (
                        <div className={styles.lockedNote}>
                          <Lock size={12} /> {t("logbook.fill.fieldRestricted")}
                        </div>
                      )}
                      {errs.map((msg, i) => (
                        <div key={i} className={styles.fieldError}>
                          <AlertTriangle size={12} /> {msg}
                        </div>
                      ))}
                    </>
                  );
                }}
              />
            )}

            {editable && st && (
              <div className={styles.sectionFooter}>
                <Button variant="secondary" loading={savingKey === section.key} onClick={() => saveProgress(section, st)}>
                  {t("logbook.fill.saveSection")}
                </Button>
                <Button variant="primary" loading={savingKey === section.key + ":complete"} onClick={() => completeSection(section, st)}>
                  {section.requireSignature ? <PenLine size={15} /> : <CheckCircle2 size={15} />}{" "}
                  {section.requireSignature ? t("logbook.fill.completeAndSign") : t("logbook.fill.completeSection")}
                </Button>
                <span className={styles.submitHint}>{t("logbook.fill.completeHint")}</span>
              </div>
            )}
          </Card>
        );
      })}

      {/* Acciones: con flujo → transiciones (gateadas por el backend); sin flujo → enviar.
          La completitud requerida se refleja aquí (deshabilita + dice QUÉ falta);
          el backend re-valida siempre. */}
      {isDraft && entry.workflowVersion ? (
        <div className={styles.transitionBar}>
          {entry.availableTransitions.length === 0 ? (
            <span className={styles.submitHint}>{t("logbook.transition.none")}</span>
          ) : (
            <>
              {entry.availableTransitions.map((tr, i) => (
                <Button
                  key={tr.transitionKey}
                  variant={i === 0 ? "primary" : "secondary"}
                  disabled={missingSections.length > 0}
                  onClick={() => setActiveTransition(tr)}
                >
                  {tr.requireSignature ? <PenLine size={15} /> : <ChevronRight size={15} />} {tr.label}
                </Button>
              ))}
              <span className={styles.submitHint}>
                {missingSections.length > 0
                  ? t("logbook.fill.advanceMissing", { sections: missingTitles })
                  : t("logbook.fill.submitHint")}
              </span>
            </>
          )}
        </div>
      ) : isDraft ? (
        <div className={styles.submitBar}>
          <Button variant="primary" loading={submit.isPending || creating} disabled={missingSections.length > 0} onClick={doSubmit}>
            <Send size={15} /> {t("logbook.fill.submit")}
          </Button>
          <span className={styles.submitHint}>
            {missingSections.length > 0
              ? t("logbook.fill.submitMissing", { sections: missingTitles })
              : t("logbook.fill.submitHint")}
          </span>
        </div>
      ) : null}

      {/* Historial de transiciones (trazabilidad ALCOA+) */}
      {entry.transitions.length > 0 && (
        <Card className={styles.section}>
          <div className={styles.sectionTitle}>
            <History size={16} /> {t("logbook.transition.historyTitle")}
          </div>
          <ul className={styles.timeline}>
            {entry.transitions.map((tr) => (
              <li key={tr.id} className={styles.timelineItem}>
                <div className={styles.timelineHead}>
                  <span className={styles.timelineLabel}>{tr.label ?? tr.transitionKey}</span>
                  {tr.signature && (
                    <Chip variant="success" label={t("logbook.transition.signedChip", { meaning: tr.signature.meaning })} />
                  )}
                </div>
                <div className={styles.timelineMeta}>
                  {tr.actorName ?? "—"} · {formatDateTime(tr.occurredAt)}
                </div>
                {tr.reason && <div className={styles.timelineReason}>“{tr.reason}”</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTransition && (
        <TransitionModal
          transition={activeTransition}
          loading={transition.isPending || creating}
          onConfirm={runTransition}
          onClose={() => setActiveTransition(null)}
        />
      )}

      {signingSection && (
        <SectionSignModal
          sectionTitle={signingSection.section.title}
          loading={savingKey === signingSection.section.key + ":complete"}
          onConfirm={(password) => saveSection(signingSection.section, signingSection.st, true, password)}
          onClose={() => setSigningSection(null)}
        />
      )}

      {deferralOpen && (
        <DeferralModal
          initial={showDeferred && declaredAtDisplay ? { effectiveAt: declaredAtDisplay, reason: deferredReasonDisplay ?? "" } : null}
          loading={setDeferral.isPending}
          onConfirm={(deferred) => {
            // Compose: la declaración vive en memoria hasta materializar (sin API).
            if (composeActive) {
              setComposeDeferred(deferred);
              toast.success(t("logbook.deferral.declared"));
              setDeferralOpen(false);
              return;
            }
            withOverride((ov) =>
              setDeferral.mutate(
                { deferred, overrideReason: ov?.overrideReason, password: ov?.password, mfaCode: ov?.mfaCode },
                {
                  onSuccess: () => {
                    toast.success(t("logbook.deferral.declared"));
                    setDeferralOpen(false);
                  },
                  onError: (e) => toast.error(apiErrorText(e, t("common.errorGeneric"))),
                },
              ),
            );
          }}
          onRemove={() => {
            if (composeActive) {
              setComposeDeferred(null);
              toast.success(t("logbook.deferral.removed"));
              setDeferralOpen(false);
              return;
            }
            withOverride((ov) =>
              setDeferral.mutate(
                { deferred: null, overrideReason: ov?.overrideReason, password: ov?.password, mfaCode: ov?.mfaCode },
                {
                  onSuccess: () => {
                    toast.success(t("logbook.deferral.removed"));
                    setDeferralOpen(false);
                  },
                  onError: (e) => toast.error(apiErrorText(e, t("common.errorGeneric"))),
                },
              ),
            );
          }}
          onClose={() => setDeferralOpen(false)}
        />
      )}

      {/* Edición fuera de ventana (2.7.2): motivo obligatorio + credenciales si aplica. */}
      {overrideRequest && editWindow && (
        <EditWindowOverrideModal
          requirePassword={overrideRequest.requirePassword}
          requireMfa={editWindow.overrideRequiresMfa}
          loading={save.isPending || submit.isPending || setDeferral.isPending}
          onConfirm={overrideRequest.run}
          onClose={() => setOverrideRequest(null)}
        />
      )}

      {/* Anular (descartar) el borrador (2.8.2): motivo obligatorio, auditado. */}
      {voidOpen && <VoidEntryModal loading={voidEntry.isPending} onConfirm={handleVoid} onClose={() => setVoidOpen(false)} />}
    </div>
  );
}
