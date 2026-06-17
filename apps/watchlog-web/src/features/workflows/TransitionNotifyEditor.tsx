import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Copy, Plus, TriangleAlert, X } from "lucide-react";
import { Checkbox, Input, MultiSelect, Select, Toggle } from "@lyra/ui";
import {
  EMPTY_TRANSITION_NOTIFY,
  type NotificationTemplateDto,
  type TransitionNotifyConfig,
} from "@lyra/contracts";
import styles from "./TransitionNotifyEditor.module.css";

export interface NotifyRoleOption {
  id: string;
  name: string;
  key: string;
}
export interface NotifyUserOption {
  id: string;
  name: string;
  email: string;
}
/** Otra transición del MISMO flujo, ofrecida en "Copiar destinatarios de…". */
export interface NotifyCopySource {
  uid: string;
  label: string;
  notify: TransitionNotifyConfig;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ¿La config tiene al menos un destinatario? (para validación/avisos). */
export function notifyRecipientCount(cfg: TransitionNotifyConfig): number {
  return (
    cfg.roleIds.length +
    cfg.userIds.length +
    cfg.externalEmails.length +
    (cfg.includeAuthor ? 1 : 0) +
    (cfg.includeActor ? 1 : 0) +
    (cfg.includeDestinationRoles ? 1 : 0)
  );
}

/**
 * Editor INLINE del aviso de una transición (épico Notificaciones avanzadas, Fase A).
 * Edita `transition.notify` (contrato CONGELADO en la versión del flujo). La autorización
 * vive en el backend; esta UI solo arma la regla de destinatarios.
 */
export function TransitionNotifyEditor({
  value,
  onChange,
  disabled,
  roles,
  users,
  templates,
  copySources,
}: {
  value: TransitionNotifyConfig | null;
  onChange: (next: TransitionNotifyConfig | null) => void;
  disabled?: boolean;
  roles: NotifyRoleOption[];
  users: NotifyUserOption[];
  templates: NotificationTemplateDto[];
  copySources: NotifyCopySource[];
}) {
  const { t } = useTranslation();
  const enabled = value?.enabled ?? false;
  const cfg = value ?? EMPTY_TRANSITION_NOTIFY;
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState(false);

  function setEnabled(on: boolean) {
    if (on) onChange({ ...(value ?? EMPTY_TRANSITION_NOTIFY), enabled: true });
    // Al apagar conservamos la regla (enabled:false) para no perder destinatarios al alternar.
    else onChange(value ? { ...value, enabled: false } : null);
  }
  function patch(p: Partial<TransitionNotifyConfig>) {
    onChange({ ...cfg, ...p, enabled: true });
  }

  function addEmail() {
    const e = emailDraft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      setEmailError(true);
      return;
    }
    if (!cfg.externalEmails.includes(e)) patch({ externalEmails: [...cfg.externalEmails, e] });
    setEmailDraft("");
    setEmailError(false);
  }
  function removeEmail(e: string) {
    patch({ externalEmails: cfg.externalEmails.filter((x) => x !== e) });
  }
  function copyFrom(uid: string) {
    const src = copySources.find((c) => c.uid === uid);
    if (!src) return;
    const n = src.notify;
    patch({
      roleIds: [...n.roleIds],
      userIds: [...n.userIds],
      includeAuthor: n.includeAuthor,
      includeActor: n.includeActor,
      includeDestinationRoles: n.includeDestinationRoles,
      externalEmails: [...n.externalEmails],
    });
  }

  return (
    <div className={styles.block}>
      <div className={styles.toggleRow}>
        <Toggle
          checked={enabled}
          disabled={disabled}
          onChange={setEnabled}
          aria-label={t("workflows.builder.notify.enable")}
        />
        <Bell size={14} />
        <span>{t("workflows.builder.notify.enable")}</span>
      </div>

      {enabled && (
        <div className={styles.body}>
          <p className={styles.hint}>{t("workflows.builder.notify.intro")}</p>

          {/* Roles */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("workflows.builder.notify.roles")}</span>
            <MultiSelect
              options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.key }))}
              value={cfg.roleIds}
              disabled={disabled || roles.length === 0}
              onChange={(ids) => patch({ roleIds: ids })}
              ariaLabel={t("workflows.builder.notify.roles")}
              placeholder={t("workflows.builder.notify.rolesPlaceholder")}
              searchPlaceholder={t("common.search")}
              selectAllLabel={t("common.selectAll")}
              clearLabel={t("common.clear")}
              noMatchText={t("common.noResults")}
              emptyText={t("workflows.builder.noRoles")}
            />
          </div>

          {/* Usuarios explícitos */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("workflows.builder.notify.users")}</span>
            <MultiSelect
              options={users.map((u) => ({ value: u.id, label: u.name, hint: u.email }))}
              value={cfg.userIds}
              disabled={disabled || users.length === 0}
              onChange={(ids) => patch({ userIds: ids })}
              ariaLabel={t("workflows.builder.notify.users")}
              placeholder={t("workflows.builder.notify.usersPlaceholder")}
              searchPlaceholder={t("common.search")}
              selectAllLabel={t("common.selectAll")}
              clearLabel={t("common.clear")}
              noMatchText={t("common.noResults")}
              emptyText={t("workflows.builder.notify.noUsers")}
            />
          </div>

          {/* Destinatarios derivados de la entrada */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("workflows.builder.notify.derived")}</span>
            <div className={styles.checks}>
              <Checkbox
                checked={cfg.includeAuthor}
                disabled={disabled}
                onChange={(c) => patch({ includeAuthor: c })}
                label={t("workflows.builder.notify.includeAuthor")}
              />
              <Checkbox
                checked={cfg.includeActor}
                disabled={disabled}
                onChange={(c) => patch({ includeActor: c })}
                label={t("workflows.builder.notify.includeActor")}
              />
              <Checkbox
                checked={cfg.includeDestinationRoles}
                disabled={disabled}
                onChange={(c) => patch({ includeDestinationRoles: c })}
                label={t("workflows.builder.notify.includeDestinationRoles")}
              />
            </div>
          </div>

          {/* Correos externos (saltan permisos, se auditan) */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("workflows.builder.notify.external")}</span>
            <div className={styles.externalWarn}>
              <TriangleAlert size={13} />
              <span>{t("workflows.builder.notify.externalWarn")}</span>
            </div>
            {cfg.externalEmails.length > 0 && (
              <div className={styles.chips}>
                {cfg.externalEmails.map((e) => (
                  <span key={e} className={styles.chip}>
                    {e}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      disabled={disabled}
                      onClick={() => removeEmail(e)}
                      aria-label={t("common.delete")}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.emailEntry}>
              <Input
                value={emailDraft}
                disabled={disabled}
                placeholder={t("workflows.builder.notify.externalPlaceholder")}
                onChange={(e) => {
                  setEmailDraft(e.target.value);
                  setEmailError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                aria-label={t("workflows.builder.notify.external")}
              />
              <button
                type="button"
                className={styles.addEmailBtn}
                disabled={disabled || emailDraft.trim().length === 0}
                onClick={addEmail}
              >
                <Plus size={14} /> {t("common.add")}
              </button>
            </div>
            {emailError && <span className={styles.emailError}>{t("workflows.builder.notify.externalInvalid")}</span>}
          </div>

          {/* Plantilla */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("workflows.builder.notify.template")}</span>
            <Select
              value={cfg.templateId ?? ""}
              disabled={disabled}
              onChange={(e) => patch({ templateId: e.target.value || null })}
              aria-label={t("workflows.builder.notify.template")}
            >
              <option value="">{t("workflows.builder.notify.templateAuto")}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.templateId == null
                    ? t("workflows.builder.notify.templateGeneric")
                    : (tpl.templateName ?? tpl.templateId)}
                  {` · ${tpl.locale}`}
                </option>
              ))}
            </Select>
            <p className={styles.hint}>{t("workflows.builder.notify.templateHint")}</p>
          </div>

          {/* Atajo: copiar destinatarios de otra transición */}
          {copySources.length > 0 && (
            <div className={styles.copyRow}>
              <span className={styles.copyLabel}>
                <Copy size={13} /> {t("workflows.builder.notify.copyFrom")}
              </span>
              <Select
                value=""
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.value) copyFrom(e.target.value);
                }}
                aria-label={t("workflows.builder.notify.copyFrom")}
              >
                <option value="">{t("workflows.builder.notify.copyFromPlaceholder")}</option>
                {copySources.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
