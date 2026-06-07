import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Layers, Plus, Pencil, Trash2, Check, X as XIcon } from "lucide-react";
import { Button, Chip, Drawer, EmptyState, Input, Table, useToast } from "@lyra/ui";
import type { OrgLevel } from "@lyra/contracts";
import type { TableColumn } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import {
  useCreateLevel,
  useDeleteLevel,
  useOrgLevels,
  useUpdateLevel,
} from "./structure-queries.js";

const levelFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  order: z
    .number({ invalid_type_error: "Debe ser un número" })
    .int("Debe ser entero")
    .nonnegative("Debe ser ≥ 0"),
});
type LevelFormValues = z.infer<typeof levelFormSchema>;

interface LevelsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function LevelsDrawer({ open, onClose }: LevelsDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: levels = [], isLoading } = useOrgLevels();
  const createLevel = useCreateLevel();
  const updateLevel = useUpdateLevel();
  const deleteLevel = useDeleteLevel();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editForm = useForm<LevelFormValues>({
    resolver: zodResolver(levelFormSchema),
    defaultValues: { name: "", order: 0 },
  });

  const createForm = useForm<LevelFormValues>({
    resolver: zodResolver(levelFormSchema),
    defaultValues: { name: "", order: levels.length },
  });

  function startEdit(level: OrgLevel) {
    setShowCreate(false);
    setEditingId(level.id);
    editForm.reset({ name: level.name, order: level.order });
  }

  function cancelEdit() {
    setEditingId(null);
    editForm.reset();
  }

  const saveEdit = editForm.handleSubmit(async (values) => {
    if (!editingId) return;
    try {
      await updateLevel.mutateAsync({ id: editingId, dto: values });
      toast.success(t("structure.levels.updated"));
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  const saveCreate = createForm.handleSubmit(async (values) => {
    try {
      await createLevel.mutateAsync(values);
      toast.success(t("structure.levels.created"));
      setShowCreate(false);
      createForm.reset({ name: "", order: levels.length + 1 });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteLevel.mutateAsync(id);
      toast.success(t("structure.levels.deleted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setDeletingId(null);
    }
  }

  const columns: TableColumn<OrgLevel>[] = [
    {
      key: "order",
      header: t("structure.levels.order"),
      width: 60,
      align: "center",
      render: (row) =>
        editingId === row.id ? (
          <Input
            type="number"
            {...editForm.register("order", { valueAsNumber: true })}
            invalid={!!editForm.formState.errors.order}
            style={{ width: 60 }}
          />
        ) : (
          <Chip label={String(row.order)} variant="default" />
        ),
    },
    {
      key: "name",
      header: t("structure.levels.name"),
      render: (row) =>
        editingId === row.id ? (
          <Input
            {...editForm.register("name")}
            invalid={!!editForm.formState.errors.name}
            autoFocus
          />
        ) : (
          row.name
        ),
    },
    {
      key: "_actions",
      header: "",
      align: "right",
      width: 100,
      render: (row) => {
        const isBusy = updateLevel.isPending || deletingId === row.id;
        if (editingId === row.id) {
          return (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <Button variant="icon" onClick={saveEdit} loading={updateLevel.isPending} aria-label={t("common.save")}>
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
            <Button
              variant="icon"
              onClick={() => startEdit(row)}
              disabled={isBusy || !!editingId}
              aria-label={t("common.edit")}
            >
              <Pencil size={15} />
            </Button>
            <Button
              variant="icon"
              onClick={() => handleDelete(row.id)}
              loading={deletingId === row.id}
              disabled={isBusy || !!editingId}
              aria-label={t("common.delete")}
            >
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
      width={520}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={18} />
          {t("structure.levels.title")}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          {t("structure.levels.description")}
        </p>

        <Table
          columns={columns}
          data={levels}
          rowKey={(l) => l.id}
          loading={isLoading}
          skeletonRows={3}
          emptyState={
            <EmptyState
              title={t("structure.levels.noLevels")}
              description={t("structure.levels.noLevelsDesc")}
            />
          }
        />

        {/* Fila de creación inline */}
        {showCreate ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <Input
                {...createForm.register("name")}
                placeholder={t("structure.levels.namePlaceholder")}
                invalid={!!createForm.formState.errors.name}
                aria-label={t("structure.levels.name")}
                autoFocus
              />
            </div>
            <div style={{ width: 80 }}>
              <Input
                type="number"
                {...createForm.register("order", { valueAsNumber: true })}
                placeholder="0"
                invalid={!!createForm.formState.errors.order}
                aria-label={t("structure.levels.order")}
              />
            </div>
            <Button variant="primary" onClick={saveCreate} loading={createLevel.isPending}>
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
              createForm.reset({ name: "", order: levels.length });
              setShowCreate(true);
            }}
          >
            <Plus size={15} />
            {t("structure.levels.newLevel")}
          </Button>
        )}
      </div>
    </Drawer>
  );
}
