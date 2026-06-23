import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeft, Check, LogIn, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Chip, Drawer, EmptyState, FormField, Input, Modal, Table, Textarea, Toggle, useToast } from "@lyra/ui";
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

type Editor = { mode: "create" } | { mode: "edit"; structure: OrgStructure } | null;

interface FormValues {
  name: string;
  key: string;
  description: string;
  active: boolean;
  reportOrder: number;
}

const EMPTY_FORM: FormValues = { name: "", key: "", description: "", active: true, reportOrder: 0 };

/**
 * Mantenedor de ESTRUCTURAS organizacionales (multi-estructura). Lista, crea, edita
 * (nombre, descripción, estado activo, orden), elige cuál configurar («Trabajar aquí»)
 * y elimina (con confirmación). La estructura por defecto no se puede eliminar; tampoco
 * las que tengan nodos/datos (lo bloquea el backend).
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

  const [editor, setEditor] = useState<Editor>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [keyTouched, setKeyTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OrgStructure | null>(null);

  const isActiveRow = (row: OrgStructure): boolean =>
    activeId === row.id || (activeId === null && row.isDefault);

  const saving = createStructure.isPending || updateStructure.isPending;

  function openCreate() {
    setForm(EMPTY_FORM);
    setKeyTouched(false);
    setEditor({ mode: "create" });
  }

  function openEdit(s: OrgStructure) {
    setForm({
      name: s.name,
      key: s.key,
      description: s.description ?? "",
      active: s.active,
      reportOrder: s.reportOrder,
    });
    setEditor({ mode: "edit", structure: s });
  }

  function closeEditor() {
    setEditor(null);
    setForm(EMPTY_FORM);
    setKeyTouched(false);
  }

  /** Pasa a TRABAJAR en esa estructura (la activa para configurar) y cierra el panel. */
  function selectStructure(row: OrgStructure) {
    setActive(row.isDefault ? null : row.id);
    toast.success(t("structure.structures.nowEditing", { name: row.name }));
    onClose();
  }

  async function submit() {
    const name = form.name.trim();
    if (!editor) return;
    try {
      if (editor.mode === "create") {
        const key = (keyTouched ? form.key : slugify(form.name)).trim();
        if (!name || key.length < 2) {
          toast.error(t("structure.structures.invalid"));
          return;
        }
        const created = await createStructure.mutateAsync({
          name,
          key,
          description: form.description.trim() || undefined,
          reportOrder: form.reportOrder,
        });
        toast.success(t("structure.structures.created"));
        setActive(created.id); // pasa a trabajar de inmediato en la nueva estructura
        closeEditor();
      } else {
        if (!name) {
          toast.error(t("structure.structures.invalid"));
          return;
        }
        await updateStructure.mutateAsync({
          id: editor.structure.id,
          dto: {
            name,
            description: form.description.trim() || null,
            active: form.active,
            reportOrder: form.reportOrder,
          },
        });
        toast.success(t("structure.structures.updated"));
        closeEditor();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function confirmDeleteNow() {
    if (!confirmDelete) return;
    try {
      await deleteStructure.mutateAsync(confirmDelete.id);
      toast.success(t("structure.structures.deleted"));
      setConfirmDelete(null);
    } catch (err) {
      // El backend bloquea estructura por defecto / con nodos: muestra su mensaje.
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  const columns: TableColumn<OrgStructure>[] = [
    {
      key: "name",
      header: t("structure.structures.name"),
      render: (row) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
      width: 130,
      render: (row) => <code style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.key}</code>,
    },
    {
      key: "_actions",
      header: "",
      align: "right",
      width: 132,
      render: (row) => {
        const busy = saving || deleteStructure.isPending;
        return (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <Button
              variant="icon"
              onClick={() => selectStructure(row)}
              disabled={busy || isActiveRow(row)}
              aria-label={t("structure.structures.workHere")}
              title={t("structure.structures.workHere")}
            >
              <LogIn size={15} />
            </Button>
            <Button
              variant="icon"
              onClick={() => openEdit(row)}
              disabled={busy}
              aria-label={t("common.edit")}
              title={t("common.edit")}
            >
              <Pencil size={15} />
            </Button>
            <Button
              variant="icon"
              onClick={() => setConfirmDelete(row)}
              disabled={busy || row.isDefault}
              aria-label={t("common.delete")}
              title={row.isDefault ? t("structure.structures.defaultUndeletable") : t("common.delete")}
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
      width={760}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Network size={18} />
          {t("structure.structures.title")}
        </span>
      }
    >
      {editor ? (
        // ── Editor (crear / editar) ───────────────────────────────────────────
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button
            type="button"
            onClick={closeEditor}
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              padding: 0,
            }}
          >
            <ArrowLeft size={15} />
            {t("structure.structures.backToList")}
          </button>

          <h3 style={{ margin: 0, fontSize: 16 }}>
            {editor.mode === "create" ? t("structure.structures.createTitle") : t("structure.structures.editTitle")}
          </h3>

          <FormField label={t("structure.structures.name")}>
            {(field) => (
              <Input
                {...field}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("structure.structures.namePlaceholder")}
                autoFocus
              />
            )}
          </FormField>

          <FormField
            label={t("structure.structures.key")}
            hint={editor.mode === "edit" ? t("structure.structures.keyImmutable") : t("structure.structures.keyHint")}
          >
            {(field) => (
              <Input
                {...field}
                value={editor.mode === "edit" ? form.key : keyTouched ? form.key : slugify(form.name)}
                onChange={(e) => {
                  setKeyTouched(true);
                  setForm((f) => ({ ...f, key: e.target.value }));
                }}
                placeholder={t("structure.structures.keyPlaceholder")}
                disabled={editor.mode === "edit"}
              />
            )}
          </FormField>

          <FormField label={t("structure.structures.descriptionLabel")} hint={t("structure.structures.descriptionHint")}>
            {(field) => (
              <Textarea
                {...field}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("structure.structures.descriptionPlaceholder")}
                rows={3}
                maxLength={500}
              />
            )}
          </FormField>

          <FormField label={t("structure.structures.orderLabel")} hint={t("structure.structures.orderHint")}>
            {(field) => (
              <Input
                {...field}
                type="number"
                value={String(form.reportOrder)}
                onChange={(e) => setForm((f) => ({ ...f, reportOrder: Number(e.target.value) || 0 }))}
                style={{ width: 120 }}
              />
            )}
          </FormField>

          {editor.mode === "edit" && (
            <FormField
              label={t("structure.structures.statusLabel")}
              hint={
                editor.structure.isDefault
                  ? t("structure.structures.statusDefaultHint")
                  : t("structure.structures.statusHint")
              }
            >
              {(field) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <Toggle
                    id={field.id}
                    checked={form.active}
                    onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                    disabled={editor.structure.isDefault}
                    aria-label={t("structure.structures.statusLabel")}
                  />
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    {form.active ? t("structure.structures.activeState") : t("structure.structures.inactiveTag")}
                  </span>
                </span>
              )}
            </FormField>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button variant="primary" onClick={submit} loading={saving}>
              <Check size={15} />
              {editor.mode === "create" ? t("common.create") : t("common.save")}
            </Button>
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        // ── Lista ─────────────────────────────────────────────────────────────
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

          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} />
            {t("structure.structures.newStructure")}
          </Button>
        </div>
      )}

      {/* Confirmación de borrado */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-error)" }}>
            <AlertTriangle size={18} />
            {t("structure.structures.deleteTitle")}
          </span>
        }
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleteStructure.isPending}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDeleteNow} loading={deleteStructure.isPending}>
              {t("structure.structures.deleteConfirm")}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
          {t("structure.structures.deleteWarning", { name: confirmDelete?.name ?? "" })}
        </p>
        <p
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-warning-bg)",
            color: "var(--color-warning)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {t("structure.structures.deleteBlockedHint")}
        </p>
      </Modal>
    </Drawer>
  );
}
