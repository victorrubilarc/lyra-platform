import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button, FormField, Input, Modal, Stepper, Textarea, cx, useToast } from "@lyra/ui";
import type { StructureAccent, StructureIcon } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useStructureStore } from "../../shell/structure-store.js";
import { StructureIdentityFields } from "./StructureIdentityFields.js";
import { useProvisionStructure } from "./structure-queries.js";
import styles from "./StructureWizard.module.css";

interface StructureWizardProps {
  open: boolean;
  onClose: () => void;
  /** Se invoca tras crear el área con éxito (p. ej. cerrar el drawer contenedor). */
  onDone?: () => void;
}

/** Deriva un slug válido (minúsculas/números/guiones) a partir del nombre. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Ids de plantillas curadas de niveles. La de niveles se lee de i18n (returnObjects). */
const TEMPLATE_IDS = ["mining", "manufacturing", "it", "blank"] as const;
type TemplateId = (typeof TEMPLATE_IDS)[number];

const STEP_COUNT = 3;

/**
 * Asistente «crear área» (L3b): un wizard de 3 pasos que aprovisiona una estructura
 * organizacional COMPLETA y operativa de una sola vez — identidad (paso 1) → niveles
 * base (paso 2) → primer nodo raíz (paso 3) — orquestado por el endpoint atómico
 * `POST /structure/structures/provision` (transacción: o el área entera queda operable
 * con ≥1 nodo, o no se crea nada). Reutiliza el editor de identidad L3
 * (`StructureIdentityFields`) y el `Stepper` del DS. Solo se ofrece al super-admin; el
 * backend re-autoriza. Al terminar, fija la nueva estructura como activa y lleva a
 * `/estructura` para seguir poblándola.
 */
export function StructureWizard({ open, onClose, onDone }: StructureWizardProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const provision = useProvisionStructure();
  const setActive = useStructureStore((s) => s.setActiveStructure);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<StructureAccent | null>(null);
  const [icon, setIcon] = useState<StructureIcon | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const [rootName, setRootName] = useState("");
  const [rootCode, setRootCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = (keyTouched ? key : slugify(name)).trim();
  const cleanLevels = levels.map((l) => l.trim()).filter(Boolean);
  const rootLevelName = cleanLevels[0] ?? "";

  function reset() {
    setStep(0);
    setName("");
    setKey("");
    setKeyTouched(false);
    setDescription("");
    setColor(null);
    setIcon(null);
    setLevels([]);
    setTemplateId(null);
    setRootName("");
    setRootCode("");
    setError(null);
  }

  function close() {
    if (provision.isPending) return;
    reset();
    onClose();
  }

  // --- Validación por paso ---
  const step0Valid = name.trim().length > 0 && effectiveKey.length >= 2;
  const step1Valid = cleanLevels.length >= 1;
  const step2Valid = rootName.trim().length > 0;

  function goNext() {
    setError(null);
    if (step === 0) {
      if (!step0Valid) return setError(t("structure.wizard.invalidIdentity"));
      setStep(1);
    } else if (step === 1) {
      if (!step1Valid) return setError(t("structure.wizard.invalidLevels"));
      setStep(2);
    }
  }

  function goBack() {
    setError(null);
    if (step > 0) setStep((s) => s - 1);
  }

  // --- Plantillas de niveles ---
  function applyTemplate(id: TemplateId) {
    setTemplateId(id);
    const tplLevels: unknown = t(`structure.wizard.templates.${id}.levels`, { returnObjects: true });
    setLevels(Array.isArray(tplLevels) ? (tplLevels as string[]) : []);
  }

  function updateLevel(index: number, value: string) {
    setTemplateId(null);
    setLevels((ls) => ls.map((l, i) => (i === index ? value : l)));
  }
  function addLevel() {
    setTemplateId(null);
    setLevels((ls) => [...ls, ""]);
  }
  function removeLevel(index: number) {
    setTemplateId(null);
    setLevels((ls) => ls.filter((_, i) => i !== index));
  }
  function moveLevel(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= levels.length) return;
    setTemplateId(null);
    setLevels((ls) => {
      const next = [...ls];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!step2Valid) return setError(t("structure.wizard.invalidRoot"));
    try {
      const created = await provision.mutateAsync({
        key: effectiveKey,
        name: name.trim(),
        description: description.trim() || undefined,
        color: color ?? undefined,
        icon: icon ?? undefined,
        levels: cleanLevels,
        rootNode: { name: rootName.trim(), code: rootCode.trim() || undefined },
      });
      toast.success(t("structure.wizard.created", { name: created.name }));
      setActive(created.id); // pasa a trabajar de inmediato en la nueva área
      reset();
      onClose();
      onDone?.();
      navigate("/estructura");
    } catch (err) {
      // Endpoint atómico ⇒ si falla, NADA se creó: solo mostramos el error y permitimos
      // reintentar el submit (no hay estado a medias que limpiar).
      setError(err instanceof ApiError ? err.message : t("structure.wizard.errorGeneric"));
    }
  }

  const stepperSteps = [
    { id: "identity", label: t("structure.wizard.steps.identity"), hint: t("structure.wizard.stepIdentityHint") },
    { id: "levels", label: t("structure.wizard.steps.levels"), hint: t("structure.wizard.stepLevelsHint") },
    { id: "root", label: t("structure.wizard.steps.root"), hint: t("structure.wizard.stepRootHint") },
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} />
          {t("structure.wizard.title")}
        </span>
      }
      footer={
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {step > 0 && (
              <Button variant="secondary" onClick={goBack} disabled={provision.isPending}>
                <ArrowLeft size={15} />
                {t("structure.wizard.back")}
              </Button>
            )}
          </div>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={close} disabled={provision.isPending}>
              {t("common.cancel")}
            </Button>
            {step < STEP_COUNT - 1 ? (
              <Button variant="primary" onClick={goNext}>
                {t("structure.wizard.next")}
                <ArrowRight size={15} />
              </Button>
            ) : (
              <Button variant="primary" onClick={submit} loading={provision.isPending}>
                <Check size={15} />
                {t("structure.wizard.create")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className={styles.wizard}>
        <Stepper steps={stepperSteps} current={step} onStepClick={(i) => i < step && setStep(i)} />

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label={t("common.close")}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Paso 1 · Identidad ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className={styles.step}>
            <p className={styles.stepIntro}>{t("structure.wizard.identityIntro")}</p>
            <FormField label={t("structure.wizard.nameLabel")}>
              {(field) => (
                <Input
                  {...field}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("structure.wizard.namePlaceholder")}
                  autoFocus
                />
              )}
            </FormField>
            <FormField label={t("structure.wizard.keyLabel")} hint={t("structure.wizard.keyHint")}>
              {(field) => (
                <Input
                  {...field}
                  value={keyTouched ? key : slugify(name)}
                  onChange={(e) => {
                    setKeyTouched(true);
                    setKey(e.target.value);
                  }}
                  placeholder={t("structure.wizard.keyPlaceholder")}
                />
              )}
            </FormField>
            <FormField label={t("structure.wizard.descriptionLabel")} hint={t("structure.wizard.descriptionHint")}>
              {(field) => (
                <Textarea
                  {...field}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("structure.wizard.descriptionPlaceholder")}
                  rows={2}
                  maxLength={500}
                />
              )}
            </FormField>
            <StructureIdentityFields
              name={name}
              previewKey={effectiveKey}
              color={color}
              icon={icon}
              onColorChange={setColor}
              onIconChange={setIcon}
            />
          </div>
        )}

        {/* ── Paso 2 · Niveles base ──────────────────────────────────────── */}
        {step === 1 && (
          <div className={styles.step}>
            <h4 className={styles.stepTitle}>{t("structure.wizard.levelsTitle")}</h4>
            <p className={styles.stepIntro}>{t("structure.wizard.levelsHint")}</p>

            <div className={styles.templatesLabel}>{t("structure.wizard.templatesLabel")}</div>
            <div className={styles.templateRow}>
              {TEMPLATE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cx(styles.templateChip, templateId === id && styles.templateChipOn)}
                  onClick={() => applyTemplate(id)}
                >
                  {t(`structure.wizard.templates.${id}.name`)}
                </button>
              ))}
            </div>

            <div className={styles.levelList}>
              {levels.length === 0 ? (
                <p className={styles.levelsEmpty}>{t("structure.wizard.levelsEmpty")}</p>
              ) : (
                levels.map((level, i) => (
                  <div key={i} className={styles.levelRow}>
                    <div className={styles.levelArrows}>
                      <button
                        type="button"
                        onClick={() => moveLevel(i, -1)}
                        disabled={i === 0}
                        aria-label={t("structure.wizard.moveLevelUp")}
                        title={t("structure.wizard.moveLevelUp")}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLevel(i, 1)}
                        disabled={i === levels.length - 1}
                        aria-label={t("structure.wizard.moveLevelDown")}
                        title={t("structure.wizard.moveLevelDown")}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <span className={styles.levelDepth}>{t("structure.wizard.levelDepth", { n: i + 1 })}</span>
                    <Input
                      value={level}
                      onChange={(e) => updateLevel(i, e.target.value)}
                      placeholder={t("structure.wizard.levelPlaceholder")}
                    />
                    <Button
                      variant="icon"
                      onClick={() => removeLevel(i)}
                      aria-label={t("structure.wizard.removeLevel")}
                      title={t("structure.wizard.removeLevel")}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Button variant="secondary" onClick={addLevel}>
              <Plus size={15} />
              {t("structure.wizard.addLevel")}
            </Button>
          </div>
        )}

        {/* ── Paso 3 · Nodo raíz + resumen ───────────────────────────────── */}
        {step === 2 && (
          <div className={styles.step}>
            <h4 className={styles.stepTitle}>{t("structure.wizard.rootTitle")}</h4>
            <p className={styles.stepIntro}>{t("structure.wizard.rootHint", { level: rootLevelName })}</p>

            <FormField label={t("structure.wizard.rootNameLabel")}>
              {(field) => (
                <Input
                  {...field}
                  value={rootName}
                  onChange={(e) => setRootName(e.target.value)}
                  placeholder={t("structure.wizard.rootNamePlaceholder")}
                  autoFocus
                />
              )}
            </FormField>
            <FormField label={t("structure.wizard.rootCodeLabel")} hint={t("structure.wizard.rootCodeHint")}>
              {(field) => (
                <Input
                  {...field}
                  value={rootCode}
                  onChange={(e) => setRootCode(e.target.value)}
                  placeholder={t("structure.wizard.rootCodePlaceholder")}
                />
              )}
            </FormField>

            {/* Resumen de lo que se va a crear (transacción atómica). */}
            <div className={styles.review}>
              <div className={styles.reviewTitle}>{t("structure.wizard.reviewTitle")}</div>
              <dl className={styles.reviewGrid}>
                <dt>{t("structure.wizard.nameLabel")}</dt>
                <dd>{name.trim() || "—"}</dd>
                <dt>{t("structure.wizard.keyLabel")}</dt>
                <dd>
                  <code>{effectiveKey}</code>
                </dd>
                <dt>{t("structure.wizard.reviewLevels")}</dt>
                <dd>{cleanLevels.join(" → ") || "—"}</dd>
                <dt>{t("structure.wizard.reviewRoot")}</dt>
                <dd>
                  {rootName.trim() || "—"}
                  {rootCode.trim() && <code style={{ marginLeft: 6 }}>{rootCode.trim()}</code>}
                </dd>
              </dl>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
