import { useEffect, useMemo, useState } from "react";
import type { AreaDto, SpecialtyDto, UpsertAreaRequest } from "@lyra/contracts";
import { Button, Input, Modal, Textarea, useToast } from "@lyra/ui";
import { useUpsertWorkOrderArea, useUpsertWorkOrderSpecialty } from "./work-orders-queries.js";
import { CATALOG_COLOR_SWATCHES } from "./work-orders-presentation.js";
import styles from "./catalogs.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: "area" | "specialty";
  /** null = crear; objeto = editar. */
  tag: AreaDto | SpecialtyDto | null;
  existingKeys: string[];
}

const KEY_RE = /^[a-z0-9-]+$/;

/**
 * Crear / editar un catálogo ligero de OT: **Área** o **Especialidad** (mismo shape).
 * Un solo componente parametrizado por `kind` (evita duplicar el formulario).
 */
export function WorkOrderTagModal({ open, onClose, kind, tag, existingKeys }: Props) {
  const toast = useToast();
  const upsertArea = useUpsertWorkOrderArea();
  const upsertSpecialty = useUpsertWorkOrderSpecialty();
  const upsert = kind === "area" ? upsertArea : upsertSpecialty;
  const isEdit = tag !== null;
  const noun = kind === "area" ? "área" : "especialidad";
  const nounCap = kind === "area" ? "Área" : "Especialidad";

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>("");
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (tag) {
      setName(tag.name); setKey(tag.key); setDescription(tag.description ?? ""); setColor(tag.color ?? ""); setSortOrder(tag.sortOrder);
    } else {
      setName(""); setKey(""); setDescription(""); setColor(""); setSortOrder(0);
    }
  }, [open, tag]);

  const keyTaken = useMemo(
    () => !isEdit && key.trim().length > 0 && existingKeys.includes(key.trim().toLowerCase()),
    [isEdit, key, existingKeys],
  );
  const keyFormatBad = !isEdit && key.trim().length > 0 && !KEY_RE.test(key.trim());
  const valid = name.trim().length >= 1 && (isEdit || (key.trim().length >= 2 && !keyTaken && !keyFormatBad));

  function submit() {
    if (!valid) return;
    const dto: UpsertAreaRequest = {
      key: isEdit ? tag.key : key.trim(),
      name: name.trim(),
      description: description.trim() || null,
      color: color || null,
      sortOrder,
    };
    upsert.mutate(
      { dto, create: !isEdit },
      {
        onSuccess: () => { toast.success(isEdit ? `${nounCap} actualizada` : `${nounCap} creada`); onClose(); },
        onError: (e) => toast.error((e as Error).message || `No se pudo guardar el/la ${noun}`),
      },
    );
  }

  const titleNew = kind === "area" ? "Nueva área" : "Nueva especialidad";

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar · ${tag.name}` : titleNew} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{isEdit ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.form}>
        <div className={styles.formRow}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "area" ? "Ej. Chancado" : "Ej. Instrumentación"} autoFocus />
          </label>
          <label className={styles.field} style={{ maxWidth: 140 }}><span className={styles.fieldLabel}>Orden</span>
            <Input type="number" min={0} step={1} value={String(sortOrder)} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Clave (key) *</span>
          <Input value={key} mono disabled={isEdit} invalid={keyTaken || keyFormatBad}
            onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder={kind === "area" ? "chancado" : "instrumentacion"} />
          {isEdit
            ? <span className={styles.muted}>La clave es la identidad del catálogo y no se puede cambiar.</span>
            : keyTaken ? <span className={styles.errorText}>Ya existe con esa clave.</span>
            : keyFormatBad ? <span className={styles.errorText}>Usa solo minúsculas, números y guiones.</span>
            : <span className={styles.muted}>Minúsculas, números y guiones. No se podrá cambiar luego.</span>}
        </label>

        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={`Para qué se usa esta ${noun}…`} />
        </label>

        <div className={styles.field}><span className={styles.fieldLabel}>Color del chip</span>
          <div className={styles.swatches}>
            <button type="button" className={color === "" ? styles.swatchNoneActive : styles.swatchNone} onClick={() => setColor("")} title="Sin color">—</button>
            {CATALOG_COLOR_SWATCHES.map((s) => (
              <button key={s.value} type="button" title={s.label} aria-label={s.label}
                className={color === s.value ? styles.swatchActive : styles.swatch}
                style={{ ["--sw" as string]: s.value }} onClick={() => setColor(s.value)} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
