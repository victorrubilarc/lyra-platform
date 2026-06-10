import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, PenLine, ShieldCheck } from "lucide-react";
import { Button, FormField, Input, Modal, Textarea } from "@lyra/ui";
import type { AvailableTransitionDto, ExecuteTransitionRequest } from "@lyra/contracts";
import { useAuth } from "../../auth/use-auth.js";
import styles from "./LogEntries.module.css";

interface TransitionModalProps {
  transition: AvailableTransitionDto;
  loading: boolean;
  onConfirm: (dto: Omit<ExecuteTransitionRequest, "transitionKey">) => void;
  onClose: () => void;
}

/**
 * Confirma una transición de flujo. Si la transición exige firma (Part 11) pide
 * re-autenticación (contraseña + MFA step-up si corresponde) y muestra el
 * SIGNIFICADO de la firma. Sin firma, solo confirma con un motivo opcional. El
 * backend re-verifica todo: aquí solo se capturan las credenciales.
 */
export function TransitionModal({ transition, loading, onConfirm, onClose }: TransitionModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const needsSignature = transition.requireSignature;
  const needsMfa = transition.requireMfa;
  const signerName = user?.displayName ?? user?.email ?? "—";

  const canConfirm = (!needsSignature || password.trim().length > 0) && (!needsMfa || mfaCode.trim().length > 0);

  function confirm() {
    if (!canConfirm) return;
    onConfirm({
      reason: reason.trim() || undefined,
      ...(needsSignature ? { password } : {}),
      ...(needsMfa ? { mfaCode: mfaCode.trim() } : {}),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          {needsSignature ? <PenLine size={17} /> : <ShieldCheck size={17} />} {transition.label}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={confirm} loading={loading} disabled={!canConfirm}>
            {needsSignature ? t("logbook.transition.signAndConfirm") : t("logbook.transition.confirm")}
          </Button>
        </>
      }
    >
      <p className={styles.transitionTo}>{t("logbook.transition.movesTo", { state: transition.toStateName })}</p>

      {needsSignature && (
        <div className={styles.signatureNotice}>
          <div className={styles.signatureMeaning}>
            <PenLine size={14} /> {t("logbook.transition.meaning")}:{" "}
            <b>{transition.signatureMeaning ?? transition.label}</b>
          </div>
          <div className={styles.signatureSigner}>{t("logbook.transition.signingAs", { name: signerName })}</div>
        </div>
      )}

      <FormField label={t("logbook.transition.reason")}>
        {(field) => (
          <Textarea
            {...field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t("logbook.transition.reasonPlaceholder")}
          />
        )}
      </FormField>

      {needsSignature && (
        <FormField label={t("logbook.transition.password")}>
          {(field) => (
            <Input
              {...field}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              rightSlot={<KeyRound size={15} />}
              onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
            />
          )}
        </FormField>
      )}

      {needsMfa && (
        <FormField label={t("logbook.transition.mfaCode")} hint={t("logbook.transition.mfaHint")}>
          {(field) => (
            <Input
              {...field}
              mono
              inputMode="numeric"
              value={mfaCode}
              autoComplete="one-time-code"
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
            />
          )}
        </FormField>
      )}
    </Modal>
  );
}
