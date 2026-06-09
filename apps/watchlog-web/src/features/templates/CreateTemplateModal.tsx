import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, FormField, Input, Modal, Select, useToast } from "@lyra/ui";
import { useOrgTree } from "../structure/structure-queries.js";
import { flattenNodeOptions } from "./builder-model.js";
import { useCreateTemplate } from "./templates-queries.js";

interface CreateTemplateModalProps {
  open: boolean;
  onClose: () => void;
}

/** Alta mínima de una plantilla (nombre + nodo) → abre el builder. */
export function CreateTemplateModal({ open, onClose }: CreateTemplateModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: tree = [] } = useOrgTree();
  const create = useCreateTemplate();

  const [name, setName] = useState("");
  const [orgNodeId, setOrgNodeId] = useState("");

  const nodeOptions = flattenNodeOptions(tree);

  function submit() {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), orgNodeId: orgNodeId || null },
      {
        onSuccess: (detail) => {
          setName("");
          setOrgNodeId("");
          onClose();
          navigate(`/plantillas/${detail.id}`);
        },
        onError: () => toast.error(t("common.errorGeneric")),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("templates.createModal.title")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!name.trim()}>
            {t("templates.createModal.submit")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <FormField label={t("templates.createModal.name")} required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templates.createModal.namePlaceholder")}
              autoFocus
            />
          )}
        </FormField>
        <FormField label={t("templates.createModal.node")} hint={t("templates.createModal.nodeHint")}>
          {({ id }) => (
            <Select id={id} value={orgNodeId} onChange={(e) => setOrgNodeId(e.target.value)}>
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
    </Modal>
  );
}
