import { useEffect, useMemo, useState } from "react";
import type { IncidentCategoryDto, IncidentTypeDto, UpsertIncidentCategoryRequest } from "@lyra/contracts";
import { Button, Input, Modal, Select, Textarea, useToast } from "@lyra/ui";
import { useUpsertIncidentCategory } from "./incidents-queries.js";
import styles from "./catalogs.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  category: IncidentCategoryDto | null;
  /** Tipos (activos+inactivos) para asociar la categoría a uno o dejarla transversal. */
  types: IncidentTypeDto[];
  existingKeys: string[];
}

const KEY_RE = /^[a-z0-9-]+$/;

/** Crear / editar una CATEGORÍA de incidencia (de un tipo o transversal). */
export function IncidentCategoryModal({ open, onClose, category, types, existingKeys }: Props) {
  const toast = useToast();
  const upsert = useUpsertIncidentCategory();
  const isEdit = category !== null;

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name); setKey(category.key); setDescription(category.description ?? "");
      setTypeId(category.typeId ?? ""); setSortOrder(category.sortOrder);
    } else {
      setName(""); setKey(""); setDescription(""); setTypeId(""); setSortOrder(0);
    }
  }, [open, category]);

  const keyTaken = useMemo(
    () => !isEdit && key.trim().length > 0 && existingKeys.includes(key.trim().toLowerCase()),
    [isEdit, key, existingKeys],
  );
  const keyFormatBad = !isEdit && key.trim().length > 0 && !KEY_RE.test(key.trim());
  const valid = name.trim().length >= 1 && (isEdit || (key.trim().length >= 2 && !keyTaken && !keyFormatBad));

  function submit() {
    if (!valid) return;
    const dto: UpsertIncidentCategoryRequest = {
      key: isEdit ? category.key : key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      typeId: typeId || null,
      sortOrder,
    };
    upsert.mutate(
      { dto, create: !isEdit },
      {
        onSuccess: () => { toast.success(isEdit ? "Categoría actualizada" : "Categoría creada"); onClose(); },
        onError: (e) => toast.error((e as Error).message || "No se pudo guardar la categoría"),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar categoría · ${category.name}` : "Nueva categoría de incidencia"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{isEdit ? "Guardar" : "Crear categoría"}</Button>
      </>
    }>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cuasi-accidente" autoFocus />
          </label>
          <label className={styles.field} style={{ maxWidth: 160 }}><span className={styles.fieldLabel}>Orden</span>
            <Input type="number" min={0} step={1} value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Clave (key) *</span>
          <Input value={key} mono disabled={isEdit} invalid={keyTaken || keyFormatBad}
            onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="cuasi-accidente" />
          {isEdit
            ? <span className={styles.muted}>La clave es la identidad del catálogo y no se puede cambiar.</span>
            : keyTaken ? <span className={styles.errorText}>Ya existe una categoría con esa clave.</span>
            : keyFormatBad ? <span className={styles.errorText}>Usa solo minúsculas, números y guiones.</span>
            : <span className={styles.muted}>Minúsculas, números y guiones. No se podrá cambiar luego.</span>}
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Tipo</span>
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Transversal (todos los tipos)</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (inactivo)"}</option>)}
          </Select>
          <span className={styles.muted}>Si la asocias a un tipo, solo aparece al reportar incidencias de ese tipo.</span>
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Para qué se usa esta categoría…" />
        </label>
      </div>
    </Modal>
  );
}
