import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";
import { Button, Drawer, FormField, Input, Toggle, useToast } from "@lyra/ui";
import type { ReferenceList } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useCreateReferenceList, useUpdateReferenceList } from "./reference-data-queries.js";

const listFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "La clave es obligatoria")
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. modos-falla)"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});
type ListFormValues = z.infer<typeof listFormSchema>;

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--color-bg-surface-2)",
  border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: "13px",
  lineHeight: "1.5",
  resize: "vertical",
  minHeight: "64px",
  outline: "none",
  boxSizing: "border-box",
};

interface ListDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  list?: ReferenceList | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

/** Drawer para crear y editar una Lista de Referencia (sin sus ítems). */
export function ListDrawer({ open, mode, list, onClose, onCreated }: ListDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateReferenceList();
  const update = useUpdateReferenceList();
  const isEdit = mode === "edit";

  const form = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { key: "", name: "", description: "", active: true, sortOrder: 0 },
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && list) {
      form.reset({
        key: list.key,
        name: list.name,
        description: list.description ?? "",
        active: list.active,
        sortOrder: list.sortOrder ?? 0,
      });
    } else {
      form.reset({ key: "", name: "", description: "", active: true, sortOrder: 0 });
    }
  }, [open, isEdit, list, form]);

  const busy = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit && list) {
        await update.mutateAsync({
          id: list.id,
          dto: {
            name: values.name,
            description: values.description?.trim() || null,
            active: values.active,
            sortOrder: values.sortOrder,
          },
        });
        toast.success(t("referenceData.list.updated"));
      } else {
        const created = await create.mutateAsync({
          key: values.key,
          name: values.name,
          description: values.description?.trim() || undefined,
          active: values.active,
          sortOrder: values.sortOrder,
        });
        toast.success(t("referenceData.list.created"));
        onCreated?.(created.id);
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
      width={500}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ListChecks size={18} />
          {isEdit ? t("referenceData.list.editTitle") : t("referenceData.list.createTitle")}
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
        <FormField
          label={t("referenceData.list.key")}
          hint={t("referenceData.list.keyDesc")}
          error={form.formState.errors.key?.message}
          required
        >
          {(field) => (
            <Input
              {...field}
              {...form.register("key")}
              placeholder="modos-falla"
              mono
              invalid={!!form.formState.errors.key}
              disabled={isEdit}
              autoFocus={!isEdit}
            />
          )}
        </FormField>

        <FormField label={t("referenceData.list.name")} error={form.formState.errors.name?.message} required>
          {(field) => (
            <Input
              {...field}
              {...form.register("name")}
              placeholder={t("referenceData.list.namePlaceholder")}
              invalid={!!form.formState.errors.name}
              autoFocus={isEdit}
            />
          )}
        </FormField>

        <FormField label={t("referenceData.list.description")}>
          {(field) => (
            <textarea
              {...field}
              {...form.register("description")}
              rows={3}
              placeholder={t("referenceData.list.descriptionPlaceholder")}
              style={textareaStyle}
            />
          )}
        </FormField>

        <div style={{ width: 120 }}>
          <FormField label={t("referenceData.sortOrder")}>
            {(field) => <Input {...field} {...form.register("sortOrder")} type="number" min={0} step={10} placeholder="0" />}
          </FormField>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} aria-label={t("referenceData.activeToggle")} />
            )}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("referenceData.activeToggle")}</span>
        </div>
      </form>
    </Drawer>
  );
}
