import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button, Modal, useToast } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useDeleteNode } from "./structure-queries.js";

interface DeleteNodeModalProps {
  open: boolean;
  node: OrgNodeTree | null;
  onClose: () => void;
}

export function DeleteNodeModal({ open, node, onClose }: DeleteNodeModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const deleteNode = useDeleteNode();

  async function handleDelete() {
    if (!node) return;
    try {
      await deleteNode.mutateAsync(node.id);
      toast.success(t("structure.node.deleted"));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-error)" }}>
          <AlertTriangle size={18} />
          {t("structure.node.deleteTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={deleteNode.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteNode.isPending}>
            {t("structure.node.deleteConfirm")}
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        {t("structure.node.deleteWarning", { name: node?.name ?? "" })}
      </p>
      {node && node.children.length > 0 && (
        <p
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-error-bg)",
            color: "var(--color-error)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {t("structure.node.hasChildrenWarning")}
        </p>
      )}
    </Modal>
  );
}
