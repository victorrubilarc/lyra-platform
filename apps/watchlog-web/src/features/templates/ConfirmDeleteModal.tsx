import { useTranslation } from "react-i18next";
import { Button, Modal } from "@lyra/ui";

interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  body: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmación genérica de borrado para el módulo de plantillas. */
export function ConfirmDeleteModal({ open, title, body, loading, onConfirm, onClose }: ConfirmDeleteModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {t("common.delete")}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{body}</p>
    </Modal>
  );
}
