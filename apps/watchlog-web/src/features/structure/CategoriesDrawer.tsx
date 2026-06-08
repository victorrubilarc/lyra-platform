import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Tags, Trash2, X as XIcon } from "lucide-react";
import { Button, Drawer, EmptyState, Input, Table, Toggle, useToast } from "@lyra/ui";
import type { EquipmentCategory } from "@lyra/contracts";
import type { TableColumn } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import {
  useCreateCategory,
  useDeleteCategory,
  useEquipmentCategories,
  useUpdateCategory,
} from "./equipment-queries.js";

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  code: z.string().trim().max(40).optional(),
  isoRef: z.string().trim().max(40).optional(),
});
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

interface CategoriesDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CategoriesDrawer({ open, onClose }: CategoriesDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: categories = [], isLoading } = useEquipmentCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", code: "", isoRef: "" },
  });
  const createForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", code: "", isoRef: "" },
  });

  function startEdit(cat: EquipmentCategory) {
    setShowCreate(false);
    setEditingId(cat.id);
    editForm.reset({ name: cat.name, code: cat.code ?? "", isoRef: cat.isoRef ?? "" });
  }
  function cancelEdit() {
    setEditingId(null);
    editForm.reset();
  }

  const saveEdit = editForm.handleSubmit(async (values) => {
    if (!editingId) return;
    try {
      await updateCategory.mutateAsync({
        id: editingId,
        dto: { name: values.name, code: values.code?.trim() || null, isoRef: values.isoRef?.trim() || null },
      });
      toast.success(t("equipment.categories.updated"));
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  const saveCreate = createForm.handleSubmit(async (values) => {
    try {
      await createCategory.mutateAsync({
        name: values.name,
        code: values.code?.trim() || undefined,
        isoRef: values.isoRef?.trim() || undefined,
      });
      toast.success(t("equipment.categories.created"));
      setShowCreate(false);
      createForm.reset({ name: "", code: "", isoRef: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteCategory.mutateAsync(id);
      toast.success(t("equipment.categories.deleted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(cat: EquipmentCategory) {
    try {
      await updateCategory.mutateAsync({ id: cat.id, dto: { active: !cat.active } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  const columns: TableColumn<EquipmentCategory>[] = [
    {
      key: "name",
      header: t("equipment.categories.name"),
      render: (row) =>
        editingId === row.id ? (
          <Input {...editForm.register("name")} invalid={!!editForm.formState.errors.name} autoFocus />
        ) : (
          row.name
        ),
    },
    {
      key: "code",
      header: t("equipment.categories.code"),
      width: 110,
      render: (row) =>
        editingId === row.id ? (
          <Input {...editForm.register("code")} mono />
        ) : row.code ? (
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.code}</code>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
    {
      key: "isoRef",
      header: t("equipment.categories.isoRef"),
      width: 90,
      render: (row) =>
        editingId === row.id ? (
          <Input {...editForm.register("isoRef")} mono />
        ) : row.isoRef ? (
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.isoRef}</code>
        ) : (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ),
    },
    {
      key: "active",
      header: t("equipment.status"),
      width: 70,
      align: "center",
      render: (row) =>
        editingId === row.id ? (
          <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
        ) : (
          <Toggle checked={row.active} onChange={() => toggleActive(row)} size="sm" aria-label={t("equipment.status")} />
        ),
    },
    {
      key: "_actions",
      header: "",
      align: "right",
      width: 96,
      render: (row) => {
        const isBusy = updateCategory.isPending || deletingId === row.id;
        if (editingId === row.id) {
          return (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <Button variant="icon" onClick={saveEdit} loading={updateCategory.isPending} aria-label={t("common.save")}>
                <Check size={15} />
              </Button>
              <Button variant="icon" onClick={cancelEdit} aria-label={t("common.cancel")}>
                <XIcon size={15} />
              </Button>
            </span>
          );
        }
        return (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <Button variant="icon" onClick={() => startEdit(row)} disabled={isBusy || !!editingId} aria-label={t("common.edit")}>
              <Pencil size={15} />
            </Button>
            <Button variant="icon" onClick={() => handleDelete(row.id)} loading={deletingId === row.id} disabled={isBusy || !!editingId} aria-label={t("common.delete")}>
              <Trash2 size={15} />
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tags size={18} />
          {t("equipment.categories.title")}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          {t("equipment.categories.description")}
        </p>

        <Table
          columns={columns}
          data={categories}
          rowKey={(c) => c.id}
          loading={isLoading}
          skeletonRows={4}
          emptyState={
            <EmptyState
              title={t("equipment.categories.noCategories")}
              description={t("equipment.categories.noCategoriesDesc")}
            />
          }
        />

        {showCreate ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <Input {...createForm.register("name")} placeholder={t("equipment.categories.namePlaceholder")} invalid={!!createForm.formState.errors.name} aria-label={t("equipment.categories.name")} autoFocus />
            </div>
            <div style={{ width: 110 }}>
              <Input {...createForm.register("code")} placeholder={t("equipment.categories.codePlaceholder")} aria-label={t("equipment.categories.code")} mono />
            </div>
            <div style={{ width: 80 }}>
              <Input {...createForm.register("isoRef")} placeholder={t("equipment.categories.isoRefPlaceholder")} aria-label={t("equipment.categories.isoRef")} mono />
            </div>
            <Button variant="primary" onClick={saveCreate} loading={createCategory.isPending}>
              <Check size={15} />
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              <XIcon size={15} />
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setEditingId(null);
              createForm.reset({ name: "", code: "", isoRef: "" });
              setShowCreate(true);
            }}
          >
            <Plus size={15} />
            {t("equipment.categories.newCategory")}
          </Button>
        )}
      </div>
    </Drawer>
  );
}
