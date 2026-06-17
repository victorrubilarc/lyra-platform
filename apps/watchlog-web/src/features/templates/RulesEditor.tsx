import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Chip, FormField, Input, Modal, Select, Toggle } from "@lyra/ui";
import { ruleActionKind, type CrossRule, type Expression, type RuleAction, type RuleActionKind, type RuleSeverity } from "@lyra/contracts";
import { useIncidentCategories, useIncidentTypes } from "../incidents/incidents-queries.js";
import { ExpressionEditor } from "./ExpressionEditor.js";
import { expressionToInfix, type RuleFieldRef } from "./expression-meta.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Editor de reglas de validación CRUZADA (Req-7) al estilo enterprise: TABLA de
 * reglas (con activar/desactivar) + MODAL para crear/editar con ayuda y ejemplo.
 * Viven en la versión INMUTABLE; el backend AUTORIZA, esto solo arma la definición.
 */

const DEFAULT_WHEN: Expression = {
  kind: "op",
  op: "gt",
  args: [{ kind: "lit", value: 0 }, { kind: "lit", value: 0 }],
};

function uniqueKey(rules: CrossRule[]): string {
  const used = new Set(rules.map((r) => r.key));
  let i = rules.length + 1;
  let k = `regla_${i}`;
  while (used.has(k)) k = `regla_${++i}`;
  return k;
}

export function RulesEditor({
  rules,
  fields,
  canEdit,
  onChange,
}: {
  rules: CrossRule[];
  fields: RuleFieldRef[];
  canEdit: boolean;
  onChange: (rules: CrossRule[]) => void;
}) {
  const { t } = useTranslation();
  // index del que se edita (-1 = nuevo, null = modal cerrado) + borrador en edición.
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<CrossRule | null>(null);
  // Catálogos para la acción "abrir incidencia" (degradan a vacío sin permiso).
  const { data: incidentTypes = [] } = useIncidentTypes();
  const { data: incidentCategories = [] } = useIncidentCategories();
  const activeTypes = incidentTypes.filter((tp) => tp.active);

  /** Cambia la ACCIÓN del borrador; fija severidad WARN cuando hay acción. */
  function changeAction(kind: RuleActionKind) {
    if (!draft) return;
    if (kind === "none") {
      setDraft({ ...draft, action: { kind: "none" } });
      return;
    }
    if (kind === "raiseException") {
      setDraft({ ...draft, severity: "WARN", action: { kind: "raiseException" } });
      return;
    }
    // openIncident: prellena con el primer tipo disponible y severidad media.
    const prev = draft.action?.kind === "openIncident" ? draft.action : null;
    setDraft({
      ...draft,
      severity: "WARN",
      action: {
        kind: "openIncident",
        incidentTypeId: prev?.incidentTypeId || activeTypes[0]?.id || "",
        incidentCategoryId: prev?.incidentCategoryId ?? null,
        severity: prev?.severity ?? 3,
      },
    });
  }

  function patchIncidentAction(patch: Partial<Extract<RuleAction, { kind: "openIncident" }>>) {
    if (!draft || draft.action?.kind !== "openIncident") return;
    setDraft({ ...draft, action: { ...draft.action, ...patch } });
  }

  function openNew() {
    setDraft({ key: uniqueKey(rules), name: "", when: DEFAULT_WHEN, severity: "ERROR", message: "", enabled: true });
    setEditIdx(-1);
  }
  function openEdit(i: number) {
    setDraft({ ...rules[i]! });
    setEditIdx(i);
  }
  function closeModal() {
    setEditIdx(null);
    setDraft(null);
  }
  function saveRule() {
    if (!draft) return;
    // `none` no se persiste (ausente = none en el contrato): mantiene la versión limpia.
    const action = draft.action && draft.action.kind !== "none" ? draft.action : undefined;
    const clean: CrossRule = { ...draft, name: draft.name?.trim() || undefined, message: draft.message.trim(), action };
    onChange(editIdx === -1 ? [...rules, clean] : rules.map((r, j) => (j === editIdx ? clean : r)));
    closeModal();
  }
  function toggleEnabled(i: number) {
    onChange(rules.map((r, j) => (j === i ? { ...r, enabled: r.enabled === false } : r)));
  }
  function removeRule(i: number) {
    onChange(rules.filter((_, j) => j !== i));
  }

  const draftAction: RuleActionKind = draft ? ruleActionKind(draft) : "none";
  const actionValid =
    !draft ||
    draft.action?.kind !== "openIncident" ||
    (!!draft.action.incidentTypeId && draft.action.incidentTypeId.length > 0);
  const valid = draft && draft.message.trim().length > 0 && actionValid;

  return (
    <div className={styles.rulesPanel}>
      <Card className={styles.rulesIntro}>
        <div className={styles.rulesIntroHead}>
          <div>
            <div className={styles.rulesIntroTitle}>{t("templates.rules.title")}</div>
            <p className={styles.thresholdHint}>{t("templates.rules.intro")}</p>
          </div>
          {canEdit && (
            <Button variant="primary" onClick={openNew}>
              <Plus size={15} /> {t("templates.rules.add")}
            </Button>
          )}
        </div>
        <p className={styles.rulesSaveHint}>{t("templates.rules.saveHint")}</p>
      </Card>

      {rules.length === 0 ? (
        <Card className={styles.rulesEmpty}>{t("templates.rules.empty")}</Card>
      ) : (
        <Card className={styles.rulesTableCard}>
          <table className={styles.rulesTable}>
            <thead>
              <tr>
                <th className={styles.rulesThState}>{t("templates.rules.colActive")}</th>
                <th className={styles.rulesThSev}>{t("templates.rules.severity")}</th>
                <th>{t("templates.rules.colRule")}</th>
                <th className={styles.rulesThActions} aria-label={t("templates.rules.colActions")}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => {
                const off = r.enabled === false;
                return (
                  <tr key={i} className={off ? styles.ruleRowOff : undefined}>
                    <td>
                      <Toggle checked={!off} onChange={() => canEdit && toggleEnabled(i)} aria-label={t("templates.rules.colActive")} />
                    </td>
                    <td>
                      <Chip
                        variant={r.severity === "ERROR" ? "error" : "warning"}
                        label={r.severity === "ERROR" ? t("templates.rules.severityErrorShort") : t("templates.rules.severityWarnShort")}
                      />
                    </td>
                    <td>
                      <div className={styles.ruleMsg}>{r.message || <span className={styles.ruleNoMsg}>{t("templates.rules.noMessage")}</span>}</div>
                      <div className={styles.ruleCond}>{expressionToInfix(r.when, fields)}</div>
                      {ruleActionKind(r) === "raiseException" && (
                        <Chip variant="warning" label={`→ ${t("templates.rules.actionChipException")}`} />
                      )}
                      {ruleActionKind(r) === "openIncident" && (
                        <Chip variant="error" label={`→ ${t("templates.rules.actionChipIncident")}`} />
                      )}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.iconBtn} aria-label={t("common.edit")} onClick={() => openEdit(i)}>
                          <Pencil size={14} />
                        </button>
                        {canEdit && (
                          <button type="button" className={styles.iconBtnDanger} aria-label={t("common.delete")} onClick={() => removeRule(i)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={editIdx !== null}
        onClose={closeModal}
        size="lg"
        title={editIdx === -1 ? t("templates.rules.modalNew") : t("templates.rules.modalEdit")}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={saveRule} disabled={!valid || !canEdit}>
              {t("templates.rules.saveRule")}
            </Button>
          </>
        }
      >
        {draft && (
          <div className={styles.ruleForm}>
            {/* Ayuda con ejemplo de contexto */}
            <div className={styles.ruleHelp}>
              <div className={styles.ruleHelpTitle}>
                <Info size={15} /> {t("templates.rules.helpTitle")}
              </div>
              <p>{t("templates.rules.helpBlocks")}</p>
              <p className={styles.ruleHelpExample}>{t("templates.rules.helpExample")}</p>
            </div>

            <div className={styles.ruleFormRow}>
              <FormField label={t("templates.rules.name")}>
                {({ id }) => (
                  <Input id={id} value={draft.name ?? ""} disabled={!canEdit} placeholder={t("templates.rules.namePlaceholder")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                )}
              </FormField>
              <FormField
                label={t("templates.rules.severity")}
                hint={draftAction !== "none" ? t("templates.rules.actionForcesWarn") : undefined}
              >
                {({ id }) => (
                  <Select
                    id={id}
                    value={draft.severity}
                    disabled={!canEdit || draftAction !== "none"}
                    onChange={(e) => setDraft({ ...draft, severity: e.target.value as RuleSeverity })}
                  >
                    <option value="ERROR">{t("templates.rules.severityError")}</option>
                    <option value="WARN">{t("templates.rules.severityWarn")}</option>
                  </Select>
                )}
              </FormField>
            </div>

            {/* Acción al dispararse (Fase 4.1.2) */}
            <FormField label={t("templates.rules.action")} hint={t("templates.rules.actionHint")}>
              {({ id }) => (
                <Select id={id} value={draftAction} disabled={!canEdit} onChange={(e) => changeAction(e.target.value as RuleActionKind)}>
                  <option value="none">{t("templates.rules.actionNone")}</option>
                  <option value="raiseException">{t("templates.rules.actionRaiseException")}</option>
                  <option value="openIncident">{t("templates.rules.actionOpenIncident")}</option>
                </Select>
              )}
            </FormField>

            {draft.action?.kind === "openIncident" && (
              <div className={styles.ruleFormRow}>
                <FormField label={t("templates.rules.incidentType")}>
                  {({ id }) =>
                    activeTypes.length === 0 ? (
                      <p className={styles.thresholdHint}>{t("templates.rules.incidentTypesEmpty")}</p>
                    ) : (
                      <Select
                        id={id}
                        value={draft.action?.kind === "openIncident" ? draft.action.incidentTypeId : ""}
                        disabled={!canEdit}
                        onChange={(e) => patchIncidentAction({ incidentTypeId: e.target.value })}
                      >
                        {activeTypes.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.name}
                          </option>
                        ))}
                      </Select>
                    )
                  }
                </FormField>
                <FormField label={t("templates.rules.incidentSeverity")}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={String(draft.action?.kind === "openIncident" ? draft.action.severity : 3)}
                      disabled={!canEdit}
                      onChange={(e) => patchIncidentAction({ severity: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
                <FormField label={t("templates.rules.incidentCategory")}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={(draft.action?.kind === "openIncident" ? draft.action.incidentCategoryId : null) ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => patchIncidentAction({ incidentCategoryId: e.target.value || null })}
                    >
                      <option value="">{t("templates.rules.incidentCategoryNone")}</option>
                      {incidentCategories
                        .filter((c) => c.active && (!c.typeId || (draft.action?.kind === "openIncident" && c.typeId === draft.action.incidentTypeId)))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </FormField>
              </div>
            )}

            <FormField label={t("templates.rules.message")} hint={t("templates.rules.messageHint")}>
              {({ id }) => (
                <Input id={id} value={draft.message} disabled={!canEdit} placeholder={t("templates.rules.messagePlaceholder")} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
              )}
            </FormField>

            <FormField label={t("templates.rules.when")} hint={t("templates.rules.whenHint")}>
              {() => <ExpressionEditor value={draft.when} fields={fields} onChange={(when) => setDraft({ ...draft, when })} />}
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
