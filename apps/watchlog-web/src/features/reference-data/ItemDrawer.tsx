import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button, Drawer, FormField, Input, Toggle, useToast } from "@lyra/ui";
import type { ReferenceItem, ReferenceMetadata } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useCreateReferenceItem, useUpdateReferenceItem } from "./reference-data-queries.js";
import styles from "./ReferenceDataPage.module.css";

const itemFormSchema = z.object({
  code: z.string().trim().min(1, "El código es obligatorio").max(120),
  label: z.string().trim().min(1, "La etiqueta es obligatoria").max(200),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
});
type ItemFormValues = z.infer<typeof itemFormSchema>;

interface MetaPair {
  k: string;
  v: string;
}

function metadataToPairs(meta: ReferenceMetadata | null | undefined): MetaPair[] {
  if (!meta) return [];
  return Object.entries(meta).map(([k, v]) => ({
    k,
    v: typeof v === "string" ? v : JSON.stringify(v),
  }));
}

/** Convierte filas key-value a un objeto metadata; intenta parsear números/bool/json. */
function pairsToMetadata(pairs: MetaPair[]): ReferenceMetadata | null {
  const entries = pairs.filter((p) => p.k.trim());
  if (entries.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const { k, v } of entries) {
    const key = k.trim();
    const raw = v.trim();
    if (raw === "") {
      out[key] = "";
      continue;
    }
    if (raw === "true") out[key] = true;
    else if (raw === "false") out[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) out[key] = Number(raw);
    else out[key] = raw;
  }
  return out;
}

interface ItemDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  listId: string;
  item?: ReferenceItem | null;
  onClose: () => void;
}

/** Drawer para crear y editar un ítem (code/label/activo/orden + metadata jsonb). */
export function ItemDrawer({ open, mode, listId, item, onClose }: ItemDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateReferenceItem();
  const update = useUpdateReferenceItem();
  const isEdit = mode === "edit";

  const [pairs, setPairs] = useState<MetaPair[]>([]);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { code: "", label: "", active: true, sortOrder: 0 },
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && item) {
      form.reset({ code: item.code, label: item.label, active: item.active, sortOrder: item.sortOrder ?? 0 });
      setPairs(metadataToPairs(item.metadata));
    } else {
      form.reset({ code: "", label: "", active: true, sortOrder: 0 });
      setPairs([]);
    }
  }, [open, isEdit, item, form]);

  const busy = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const metadata = pairsToMetadata(pairs);
    try {
      if (isEdit && item) {
        await update.mutateAsync({
          listId,
          itemId: item.id,
          dto: { code: values.code, label: values.label, active: values.active, sortOrder: values.sortOrder, metadata },
        });
        toast.success(t("referenceData.item.updated"));
      } else {
        await create.mutateAsync({
          listId,
          dto: {
            code: values.code,
            label: values.label,
            active: values.active,
            sortOrder: values.sortOrder,
            metadata: metadata ?? undefined,
          },
        });
        toast.success(t("referenceData.item.created"));
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
          <Tag size={18} />
          {isEdit ? t("referenceData.item.editTitle") : t("referenceData.item.createTitle")}
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
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField
              label={t("referenceData.item.code")}
              hint={t("referenceData.item.codeDesc")}
              error={form.formState.errors.code?.message}
              required
            >
              {(field) => (
                <Input {...field} {...form.register("code")} placeholder="VIB" mono invalid={!!form.formState.errors.code} autoFocus />
              )}
            </FormField>
          </div>
          <div style={{ width: 110 }}>
            <FormField label={t("referenceData.sortOrder")}>
              {(field) => <Input {...field} {...form.register("sortOrder")} type="number" min={0} step={10} placeholder="0" />}
            </FormField>
          </div>
        </div>

        <FormField label={t("referenceData.item.label")} error={form.formState.errors.label?.message} required>
          {(field) => (
            <Input
              {...field}
              {...form.register("label")}
              placeholder={t("referenceData.item.labelPlaceholder")}
              invalid={!!form.formState.errors.label}
            />
          )}
        </FormField>

        {/* Editor de metadata enriquecida (key-value). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className={styles.itemsTitle}>{t("referenceData.item.metadata")}</span>
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>{t("referenceData.item.metadataDesc")}</p>
          {pairs.map((p, i) => (
            <div key={i} className={styles.metaRow}>
              <Input
                value={p.k}
                onChange={(e) => setPairs((prev) => prev.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
                placeholder={t("referenceData.item.metaKey")}
                mono
              />
              <Input
                value={p.v}
                onChange={(e) => setPairs((prev) => prev.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
                placeholder={t("referenceData.item.metaValue")}
              />
              <Button
                variant="icon"
                aria-label={t("common.delete")}
                onClick={() => setPairs((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="secondary" onClick={() => setPairs((prev) => [...prev, { k: "", v: "" }])}>
              <Plus size={14} />
              {t("referenceData.item.addMeta")}
            </Button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <Toggle checked={field.value} onChange={field.onChange} aria-label={t("referenceData.activeToggle")} />
            )}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("referenceData.item.activeToggle")}</span>
        </div>
      </form>
    </Drawer>
  );
}
