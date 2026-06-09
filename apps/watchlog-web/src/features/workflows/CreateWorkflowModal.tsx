import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, FormField, Input, Modal, useToast } from "@lyra/ui";
import { useCreateWorkflow } from "./workflows-queries.js";

interface CreateWorkflowModalProps {
  open: boolean;
  onClose: () => void;
}

/** Convierte un nombre en una clave de flujo válida `^[a-z0-9-]+$`. */
function toWorkflowKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Alta mínima de un flujo (nombre + clave) → abre el builder. */
export function CreateWorkflowModal({ open, onClose }: CreateWorkflowModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateWorkflow();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  const effectiveKey = keyTouched ? key : toWorkflowKey(name);

  function submit() {
    if (!name.trim() || effectiveKey.length < 2) return;
    create.mutate(
      { name: name.trim(), key: effectiveKey },
      {
        onSuccess: (detail) => {
          setName("");
          setKey("");
          setKeyTouched(false);
          onClose();
          navigate(`/flujos/${detail.id}`);
        },
        onError: () => toast.error(t("workflows.createError")),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("workflows.createModal.title")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={create.isPending}
            disabled={!name.trim() || effectiveKey.length < 2}
          >
            {t("workflows.createModal.submit")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <FormField label={t("workflows.createModal.name")} required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("workflows.createModal.namePlaceholder")}
              autoFocus
            />
          )}
        </FormField>
        <FormField label={t("workflows.createModal.key")} hint={t("workflows.createModal.keyHint")}>
          {({ id }) => (
            <Input
              id={id}
              value={effectiveKey}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              placeholder="cierre-turno"
              mono
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}
