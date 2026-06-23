import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, LogIn, Network, Pencil, Plus, Trash2, X as XIcon } from "lucide-react";
import { Button, Chip, Drawer, EmptyState, Input, Table, useToast } from "@lyra/ui";
import type { TableColumn } from "@lyra/ui";
import type { OrgStructure } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useStructureStore } from "../../shell/structure-store.js";
import {
  useCreateStructure,
  useDeleteStructure,
  useOrgStructures,
  useUpdateStructure,
} from "./structure-queries.js";

interface StructuresDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Deriva un slug válido (minúsculas/números/guiones) a partir del nombre. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Mantenedor de ESTRUCTURAS organizacionales (multi-estructura). Crear, renombrar,
 * (des)activar y eliminar estructuras. La estructura por defecto no se puede eliminar
 * (la bloquea el backend); tampoco las que tengan nodos o niveles vivos.
 */
export function StructuresDrawer({ open, onClose }: StructuresDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: structures = [], isLoading } = useOrgStructures();
  const createStructure = useCreateStructure();
  const updateStructure = useUpdateStructure();
  const deleteStructure = useDeleteStructure();
  const setActive = useStructureStore((s) => s.setActiveStructure);
  const activeId = useStructureStore((s) => s.activeStructureId);

  // Una fila es la estructura ACTIVA (la que se está configurando): la por defecto
  // cuando no hay selección, o la que coincide con el id activo.
  const isActiveRow = (row: OrgStructure): boolean =>
    activeId === row.id || (activeId === null && row.isDefault);

  /** Pasa a TRABAJAR en esa estructura (la activa para configurar) y cierra el panel. */
  function selectStructure(row: OrgStructure) {
    setActive(row.isDefault ? null : row.id);
    toast.success(t("structure.structures.nowEditing", { name: row.name }));
    onClose();
  }

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetCreate() {
    setShowCreate(false);
    setNewName("");
    setNewKey("");
    setKeyTouched(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    const key = (keyTouched ? newKey : slugify(newName)).trim();
    if (!name || key.length < 2) {
      toast.error(t("structure.structures.invalid"));
      return;
    }
    try {
      const created = await createStructure.mutateAsync({ name, key });
      toast.success(t("structure.structures.created"));
      setActive(created.id); // pasa a trabajar de inmediato en la nueva estructura
      resetCreate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  function startEdit(s: OrgStructure) {
    setEditingId(s.id);
    setEditName(s.name);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await updateStructure.mutateAsync({ id: editingId, dto: { name } });
      toast.success(t("structure.structures.updated"));
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function handleDelete(s: OrgStructure) {
    setDeletingId(s.id);
    try {
      await deleteStructure.mutateAsync(s.id);
      toast.success(t("structure.structures.deleted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setDeletingId(null);
    }
  }

  const columns: TableColumn<OrgStructure>[] = [
    {
      key: "name",
      header: t("structure.structures.name"),
      render: (row) =>
        editingId === row.id ? (
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label={t("structure.structures.name")} />
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {row.name}
            {isActiveRow(row) && <Chip label={t("structure.structures.activeTag")} variant="primary" />}
            {row.isDefault && <Chip label={t("structure.structures.defaultTag")} variant="info" />}
            {!row.active && <Chip label={t("structure.structures.inactiveTag")} variant="default" />}
          </span>
        ),
    },
    {
      key: "key",
      header: t("structure.structures.key"),
      width: 140,
      render: (row) => <code style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.key}</code>,
    },
    {
      key: "_actions",
      header: "",
      align: "right",
      width: 132,
      render: (row) => {
        if (editingId === row.id) {
          return (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <Button variant="icon" onClick={saveEdit} loading={updateStructure.isPending} aria-label={t("common.save")}>
                <Check size={15} />
              </Button>
              <Button variant="icon" onClick={() => setEditingId(null)} aria-label={t("common.cancel")}>
                <XIcon size={15} />
              </Button>
            </span>
          );
        }
        const isBusy = !!editingId || deletingId === row.id;
        return (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <Button
              variant="icon"
              onClick={() => selectStructure(row)}
              disabled={isBusy || isActiveRow(row)}
              aria-label={t("structure.structures.workHere")}
              title={t("structure.structures.workHere")}
            >
              <LogIn size={15} />
            </Button>
            <Button variant="icon" onClick={() => startEdit(row)} disabled={isBusy} aria-label={t("common.edit")}>
              <Pencil size={15} />
            </Button>
            <Button
              variant="icon"
              onClick={() => handleDelete(row)}
              loading={deletingId === row.id}
              disabled={isBusy || row.isDefault}
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
      width={560}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Network size={18} />
          {t("structure.structures.title")}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          {t("structure.structures.description")}
        </p>

        <Table
          columns={columns}
          data={structures}
          rowKey={(s) => s.id}
          loading={isLoading}
          skeletonRows={2}
          emptyState={<EmptyState title={t("structure.structures.empty")} />}
        />

        {showCreate ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("structure.structures.namePlaceholder")}
              aria-label={t("structure.structures.name")}
              autoFocus
            />
            <Input
              value={keyTouched ? newKey : slugify(newName)}
              onChange={(e) => {
                setKeyTouched(true);
                setNewKey(e.target.value);
              }}
              placeholder={t("structure.structures.keyPlaceholder")}
              aria-label={t("structure.structures.key")}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={handleCreate} loading={createStructure.isPending}>
                <Check size={15} />
                {t("common.create")}
              </Button>
              <Button variant="secondary" onClick={resetCreate}>
                <XIcon size={15} />
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowCreate(true)}>
            <Plus size={15} />
            {t("structure.structures.newStructure")}
          </Button>
        )}
      </div>
    </Drawer>
  );
}
