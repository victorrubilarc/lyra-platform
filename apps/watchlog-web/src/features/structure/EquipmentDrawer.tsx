import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import { Button, Drawer, FormField, Input, Select, Toggle, useToast } from "@lyra/ui";
import type { Equipment, EquipmentCategory } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useCreateEquipment, useUpdateEquipment } from "./equipment-queries.js";

const equipmentFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  code: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(80).optional(),
  categoryId: z.string().optional(),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  // "" = sin clasificar; en submit se mapea a null.
  criticality: z.string().optional(),
  active: z.boolean(),
  reportOrder: z.coerce.number().int().min(0).max(100000),
  description: z.string().trim().max(500).optional(),
});
type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

export type EquipmentDrawerMode = "create" | "edit";

interface EquipmentDrawerProps {
  open: boolean;
  mode: EquipmentDrawerMode;
  /** En modo edit: el equipo existente. */
  equipment?: Equipment | null;
  /** Nodo destino para crear un equipo nuevo. */
  orgNodeId: string;
  categories: EquipmentCategory[];
  onClose: () => void;
}

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

/** Drawer para crear y editar un equipo anclado a un nodo de la estructura. */
export function EquipmentDrawer({ open, mode, equipment, orgNodeId, categories, onClose }: EquipmentDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment();

  const isEdit = mode === "edit";

  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: "", code: "", tag: "", categoryId: "", manufacturer: "", model: "",
      serialNumber: "", criticality: "", active: true, reportOrder: 0, description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && equipment) {
      form.reset({
        name: equipment.name,
        code: equipment.code ?? "",
        tag: equipment.tag ?? "",
        categoryId: equipment.categoryId ?? "",
        manufacturer: equipment.manufacturer ?? "",
        model: equipment.model ?? "",
        serialNumber: equipment.serialNumber ?? "",
        criticality: equipment.criticality != null ? String(equipment.criticality) : "",
        active: equipment.active,
        reportOrder: equipment.reportOrder ?? 0,
        description: equipment.description ?? "",
      });
    } else {
      form.reset({
        name: "", code: "", tag: "", categoryId: "", manufacturer: "", model: "",
        serialNumber: "", criticality: "", active: true, reportOrder: 0, description: "",
      });
    }
  }, [open, isEdit, equipment, form]);

  const busy = createEquipment.isPending || updateEquipment.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const criticality = values.criticality ? Number(values.criticality) : null;
    try {
      if (isEdit && equipment) {
        await updateEquipment.mutateAsync({
          id: equipment.id,
          dto: {
            name: values.name,
            code: values.code?.trim() || null,
            tag: values.tag?.trim() || null,
            categoryId: values.categoryId || null,
            manufacturer: values.manufacturer?.trim() || null,
            model: values.model?.trim() || null,
            serialNumber: values.serialNumber?.trim() || null,
            criticality,
            active: values.active,
            reportOrder: values.reportOrder,
            description: values.description?.trim() || null,
          },
        });
        toast.success(t("equipment.updated"));
      } else {
        await createEquipment.mutateAsync({
          name: values.name,
          code: values.code?.trim() || undefined,
          tag: values.tag?.trim() || undefined,
          categoryId: values.categoryId || null,
          manufacturer: values.manufacturer?.trim() || undefined,
          model: values.model?.trim() || undefined,
          serialNumber: values.serialNumber?.trim() || undefined,
          criticality,
          active: values.active,
          reportOrder: values.reportOrder,
          description: values.description?.trim() || undefined,
          orgNodeId,
        });
        toast.success(t("equipment.created"));
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
      width={520}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wrench size={18} />
          {isEdit ? t("equipment.editTitle") : t("equipment.createTitle")}
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
        <FormField label={t("equipment.name")} error={form.formState.errors.name?.message} required>
          {(field) => (
            <Input
              {...field}
              {...form.register("name")}
              placeholder={t("equipment.namePlaceholder")}
              invalid={!!form.formState.errors.name}
              autoFocus
            />
          )}
        </FormField>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField label={t("equipment.code")} hint={t("equipment.codeDesc")}>
              {(field) => (
                <Input {...field} {...form.register("code")} placeholder={t("equipment.codePlaceholder")} mono />
              )}
            </FormField>
          </div>
          <div style={{ width: 110 }}>
            <FormField label={t("equipment.reportOrder")}>
              {(field) => (
                <Input {...field} {...form.register("reportOrder")} type="number" min={0} step={10} placeholder="0" />
              )}
            </FormField>
          </div>
        </div>

        <FormField label={t("equipment.tag")} hint={t("equipment.tagDesc")} error={form.formState.errors.tag?.message}>
          {(field) => (
            <Input {...field} {...form.register("tag")} placeholder={t("equipment.tagPlaceholder")} mono />
          )}
        </FormField>

        <FormField label={t("equipment.category")}>
          {(field) => (
            <Select {...field} {...form.register("categoryId")}>
              <option value="">{t("equipment.noCategory")}</option>
              {categories.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </FormField>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField label={t("equipment.manufacturer")}>
              {(field) => (
                <Input {...field} {...form.register("manufacturer")} placeholder={t("equipment.manufacturerPlaceholder")} />
              )}
            </FormField>
          </div>
          <div style={{ flex: 1 }}>
            <FormField label={t("equipment.model")}>
              {(field) => (
                <Input {...field} {...form.register("model")} placeholder={t("equipment.modelPlaceholder")} />
              )}
            </FormField>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField label={t("equipment.serialNumber")}>
              {(field) => (
                <Input {...field} {...form.register("serialNumber")} placeholder={t("equipment.serialNumberPlaceholder")} mono />
              )}
            </FormField>
          </div>
          <div style={{ width: 160 }}>
            <FormField label={t("equipment.criticality")} hint={t("equipment.criticalityDesc")}>
              {(field) => (
                <Select {...field} {...form.register("criticality")}>
                  <option value="">{t("equipment.criticalityNone")}</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
        </div>

        <FormField label={t("equipment.description")}>
          {(field) => (
            <textarea {...field} {...form.register("description")} rows={3} placeholder={t("equipment.descriptionPlaceholder")} style={textareaStyle} />
          )}
        </FormField>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} aria-label={t("equipment.activeToggle")} />
            )}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("equipment.activeToggle")}</span>
        </div>
      </form>
    </Drawer>
  );
}
