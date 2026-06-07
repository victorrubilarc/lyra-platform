import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { Button, Drawer, FormField, Input, Select, useToast } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useCreateNode, useUpdateNode } from "./structure-queries.js";

const nodeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  code: z.string().trim().max(40).optional(),
  levelId: z.string().min(1, "Selecciona un nivel"),
});
type NodeFormValues = z.infer<typeof nodeFormSchema>;

export type NodeDrawerMode = "create-root" | "create-child" | "edit";

interface NodeDrawerProps {
  open: boolean;
  mode: NodeDrawerMode;
  /** En modo edit: nodo existente. En create-child: el padre. */
  node?: OrgNodeTree | null;
  levels: OrgLevel[];
  onClose: () => void;
}

/**
 * Drawer para crear (raíz o hijo) y editar un nodo de la estructura.
 * El reparentado ("Mover") se hace desde MoveNodeModal — no desde aquí.
 */
export function NodeDrawer({ open, mode, node, levels, onClose }: NodeDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const createNode = useCreateNode();
  const updateNode = useUpdateNode();

  const isEdit = mode === "edit";
  const title =
    mode === "create-root"
      ? t("structure.node.createRoot")
      : mode === "create-child"
        ? t("structure.node.createChild")
        : t("structure.node.edit");

  const form = useForm<NodeFormValues>({
    resolver: zodResolver(nodeFormSchema),
    defaultValues: { name: "", code: "", levelId: "" },
  });

  // Precarga el formulario al abrir
  useEffect(() => {
    if (!open) return;
    if (isEdit && node) {
      form.reset({ name: node.name, code: node.code ?? "", levelId: node.levelId });
    } else {
      form.reset({ name: "", code: "", levelId: levels[0]?.id ?? "" });
    }
  }, [open, isEdit, node, levels, form]);

  const busy = createNode.isPending || updateNode.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit && node) {
        await updateNode.mutateAsync({
          id: node.id,
          dto: {
            name: values.name,
            code: values.code?.trim() || null,
            levelId: values.levelId,
          },
        });
        toast.success(t("structure.node.updated"));
      } else {
        await createNode.mutateAsync({
          name: values.name,
          code: values.code?.trim() || undefined,
          levelId: values.levelId,
          parentId: mode === "create-child" ? (node?.id ?? null) : null,
        });
        toast.success(t("structure.node.created"));
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={18} />
          {title}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={busy}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {mode === "create-child" && node && (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {t("structure.node.parentLabel")}: <strong style={{ color: "var(--color-text-secondary)" }}>{node.name}</strong>
          </div>
        )}

        <FormField
          label={t("structure.node.name")}
          error={form.formState.errors.name?.message}
          required
        >
          {(field) => (
            <Input
              {...field}
              {...form.register("name")}
              placeholder={t("structure.node.namePlaceholder")}
              invalid={!!form.formState.errors.name}
              autoFocus
            />
          )}
        </FormField>

        <FormField
          label={t("structure.node.code")}
          error={form.formState.errors.code?.message}
          hint={t("structure.node.codeDesc")}
        >
          {(field) => (
            <Input
              {...field}
              {...form.register("code")}
              placeholder={t("structure.node.codePlaceholder")}
              mono
            />
          )}
        </FormField>

        <FormField
          label={t("structure.node.level")}
          error={form.formState.errors.levelId?.message}
          required
        >
          {(field) => (
            <Select
              {...field}
              {...form.register("levelId")}
              invalid={!!form.formState.errors.levelId}
              disabled={levels.length === 0}
            >
              {levels.length === 0 ? (
                <option value="">{t("structure.levels.noLevels")}</option>
              ) : (
                <>
                  <option value="">{t("structure.node.selectLevel")}</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </>
              )}
            </Select>
          )}
        </FormField>
      </form>
    </Drawer>
  );
}
