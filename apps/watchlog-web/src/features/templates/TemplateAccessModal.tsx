import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Button, Modal, MultiSelect, Skeleton, useToast, type MultiSelectOption } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { useAssignTemplateRoleScope, useTemplateRoleScope } from "./templates-queries.js";

interface TemplateAccessModalProps {
  open: boolean;
  templateId: string | null;
  templateName: string;
  onClose: () => void;
}

/**
 * Acceso por ROL de una plantilla (Fase 2.8, vista recíproca del alcance por
 * plantilla): elige qué roles tienen ESTA plantilla en su alcance, directamente
 * desde la pantalla de Plantillas. Editar aquí solo afecta esta plantilla — no
 * altera el resto del alcance de cada rol ni las asignaciones por usuario. Lista
 * vacía = sin restricción por rol (todos los roles la ven, según su nodo).
 */
export function TemplateAccessModal({ open, templateId, templateName, onClose }: TemplateAccessModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, isLoading } = useTemplateRoleScope(open ? templateId : null);
  const assign = useAssignTemplateRoleScope();

  const [roleIds, setRoleIds] = useState<string[]>([]);

  useEffect(() => {
    if (data) setRoleIds(data.assignedRoleIds);
  }, [data]);

  const options: MultiSelectOption[] = (data?.roles ?? []).map((r) => ({
    value: r.id,
    label: r.name,
    hint: r.key,
  }));

  async function save() {
    if (!templateId) return;
    try {
      await assign.mutateAsync({ id: templateId, roleIds });
      toast.success(t("templates.access.saved"));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} />
          {t("templates.access.title")}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={assign.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save} loading={assign.isPending}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-body-sm-size)", color: "var(--color-text-secondary)" }}>
          {t("templates.access.desc", { name: templateName })}
        </p>
        {isLoading ? (
          <Skeleton height={44} />
        ) : (
          <MultiSelect
            options={options}
            value={roleIds}
            onChange={setRoleIds}
            placeholder={t("templates.access.placeholder")}
            ariaLabel={t("templates.access.title")}
          />
        )}
        <p style={{ margin: 0, fontSize: "var(--text-body-sm-size)", color: "var(--color-text-muted)" }}>
          {roleIds.length === 0 ? t("templates.access.allHint") : t("templates.access.scopedHint")}
        </p>
      </div>
    </Modal>
  );
}
