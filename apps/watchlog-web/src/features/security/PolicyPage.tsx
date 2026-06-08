import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button, FormField, Input, Select, Skeleton, Toggle, useToast } from "@lyra/ui";
import { MFA_MODES } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import type { PasswordPolicy } from "@lyra/contracts";
import { usePasswordPolicy, useUpdatePasswordPolicy } from "./security-queries.js";
import shared from "./security-shared.module.css";

const policyFormSchema = z.object({
  minLength: z.coerce.number().int().min(8).max(128),
  requireUppercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
  expiryEnabled: z.boolean(),
  expiryDays: z.coerce.number().int().min(1).max(3650),
  historyCount: z.coerce.number().int().min(0).max(24),
  maxFailedAttempts: z.coerce.number().int().min(1).max(20),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440),
  mfaMode: z.enum(MFA_MODES),
});
type PolicyFormValues = z.infer<typeof policyFormSchema>;

/** Deriva los valores del formulario desde la política cargada. */
function toFormValues(policy: PasswordPolicy): PolicyFormValues {
  return {
    minLength: policy.minLength,
    requireUppercase: policy.requireUppercase,
    requireNumber: policy.requireNumber,
    requireSymbol: policy.requireSymbol,
    expiryEnabled: policy.expiryDays != null,
    expiryDays: policy.expiryDays ?? 90,
    historyCount: policy.historyCount,
    maxFailedAttempts: policy.maxFailedAttempts,
    lockoutMinutes: policy.lockoutMinutes,
    mfaMode: policy.mfaMode,
  };
}

export function PolicyPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: policy, isLoading, isError } = usePasswordPolicy();
  const updatePolicy = useUpdatePasswordPolicy();

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      minLength: 12,
      requireUppercase: true,
      requireNumber: true,
      requireSymbol: false,
      expiryEnabled: false,
      expiryDays: 90,
      historyCount: 5,
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      mfaMode: "OPTIONAL",
    },
  });

  useEffect(() => {
    if (policy) form.reset(toFormValues(policy));
  }, [policy, form]);

  const expiryEnabled = form.watch("expiryEnabled");
  const mfaMode = form.watch("mfaMode");

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await updatePolicy.mutateAsync({
        minLength: v.minLength,
        requireUppercase: v.requireUppercase,
        requireNumber: v.requireNumber,
        requireSymbol: v.requireSymbol,
        expiryDays: v.expiryEnabled ? v.expiryDays : null,
        historyCount: v.historyCount,
        maxFailedAttempts: v.maxFailedAttempts,
        lockoutMinutes: v.lockoutMinutes,
        mfaMode: v.mfaMode,
      });
      toast.success(t("security.policy.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  if (isError) {
    return (
      <div className={shared.errorBox}>
        <TriangleAlert size={16} />
        {t("security.policy.loadError")}
      </div>
    );
  }

  if (isLoading || !policy) {
    return (
      <div className={shared.subpage}>
        <Skeleton height={180} />
        <Skeleton height={220} />
      </div>
    );
  }

  return (
    <form className={shared.subpage} onSubmit={onSubmit}>
      {/* Contraseñas */}
      <section className={shared.panel}>
        <h2 className={shared.panelTitle}>{t("security.policy.passwordsTitle")}</h2>
        <p className={shared.panelDesc}>{t("security.policy.passwordsDesc")}</p>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.minLength")}</span>
            <span className={shared.controlHint}>{t("security.policy.minLengthHint")}</span>
          </div>
          <div className={shared.controlInput}>
            <Input type="number" min={8} max={128} {...form.register("minLength")} />
          </div>
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.requireUppercase")}</span>
          </div>
          <Toggle
            checked={form.watch("requireUppercase")}
            onChange={(val) => form.setValue("requireUppercase", val, { shouldDirty: true })}
            aria-label={t("security.policy.requireUppercase")}
          />
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.requireNumber")}</span>
          </div>
          <Toggle
            checked={form.watch("requireNumber")}
            onChange={(val) => form.setValue("requireNumber", val, { shouldDirty: true })}
            aria-label={t("security.policy.requireNumber")}
          />
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.requireSymbol")}</span>
          </div>
          <Toggle
            checked={form.watch("requireSymbol")}
            onChange={(val) => form.setValue("requireSymbol", val, { shouldDirty: true })}
            aria-label={t("security.policy.requireSymbol")}
          />
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.historyCount")}</span>
            <span className={shared.controlHint}>{t("security.policy.historyCountHint")}</span>
          </div>
          <div className={shared.controlInput}>
            <Input type="number" min={0} max={24} {...form.register("historyCount")} />
          </div>
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.expiry")}</span>
            <span className={shared.controlHint}>{t("security.policy.expiryHint")}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <Toggle
              checked={expiryEnabled}
              onChange={(val) => form.setValue("expiryEnabled", val, { shouldDirty: true })}
              aria-label={t("security.policy.expiry")}
            />
            <div className={shared.controlInput} style={{ width: 110 }}>
              <Input
                type="number"
                min={1}
                max={3650}
                disabled={!expiryEnabled}
                {...form.register("expiryDays")}
                rightSlot={<span className={shared.muted}>{t("security.policy.days")}</span>}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Bloqueo por fuerza bruta */}
      <section className={shared.panel}>
        <h2 className={shared.panelTitle}>{t("security.policy.lockoutTitle")}</h2>
        <p className={shared.panelDesc}>{t("security.policy.lockoutDesc")}</p>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.maxFailedAttempts")}</span>
            <span className={shared.controlHint}>{t("security.policy.maxFailedAttemptsHint")}</span>
          </div>
          <div className={shared.controlInput}>
            <Input type="number" min={1} max={20} {...form.register("maxFailedAttempts")} />
          </div>
        </div>

        <div className={shared.controlRow}>
          <div className={shared.controlLabel}>
            <span className={shared.controlName}>{t("security.policy.lockoutMinutes")}</span>
            <span className={shared.controlHint}>{t("security.policy.lockoutMinutesHint")}</span>
          </div>
          <div className={shared.controlInput}>
            <Input type="number" min={1} max={1440} {...form.register("lockoutMinutes")} />
          </div>
        </div>
      </section>

      {/* MFA global */}
      <section className={shared.panel}>
        <h2 className={shared.panelTitle}>{t("security.policy.mfaTitle")}</h2>
        <p className={shared.panelDesc}>{t("security.policy.mfaDesc")}</p>

        <FormField label={t("security.policy.mfaMode")} hint={t(`security.policy.mfaModeHint.${mfaMode}`)}>
          {(field) => (
            <Select {...field} {...form.register("mfaMode")}>
              {MFA_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`security.policy.mfaModeLabel.${m}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </section>

      <div className={shared.actionsFooter}>
        <Button
          variant="secondary"
          onClick={() => form.reset(toFormValues(policy))}
          disabled={updatePolicy.isPending || !form.formState.isDirty}
        >
          {t("security.policy.discard")}
        </Button>
        <Button type="submit" variant="primary" loading={updatePolicy.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
