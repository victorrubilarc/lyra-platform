import { useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Plus, ShieldBan, Trash2 } from "lucide-react";
import {
  COMPETENCY_CATEGORY_META,
  COMPETENCY_VALIDITY_META,
  RESTRICTION_TYPE_META,
  RESTRICTION_TYPES,
  type CompetencyValidityState,
  type PersonDto,
  type RestrictionType,
} from "@lyra/contracts";
import { Button, Combobox, Input, Modal, Select, useToast } from "@lyra/ui";
import { formatDate } from "../../lib/format.js";
import {
  useCompetencyTypes,
  useDeletePersonCompetency,
  useDeletePersonRestriction,
  usePersonCompetencies,
  usePersonRestrictions,
  useUpsertPersonCompetency,
  useUpsertPersonRestriction,
} from "./work-orders-queries.js";
import styles from "./persons.module.css";

const VALIDITY_COLOR: Record<CompetencyValidityState, string> = {
  valid: "var(--color-success)",
  expiring: "var(--color-warning)",
  expired: "var(--color-error)",
  no_expiry: "var(--color-text-secondary)",
};

/**
 * Competencias (con vigencia + evidencia) y restricciones (veto) de una persona (S2).
 * RENOVAR una competencia = agregar un registro NUEVO (el anterior queda de historial,
 * traza Maximo LABORCERTHIST). El estado de vigencia es derivado (badge). Traza ISO 45001
 * §7.2 (evidencia documentada de competencia) + OSHA authorized (restricción = Eje B).
 */
export function PersonCompetenciesModal({ person, onClose }: { person: PersonDto; onClose: () => void }) {
  const [tab, setTab] = useState<"competencias" | "restricciones">("competencias");
  return (
    <Modal open onClose={onClose} title={`Competencias y restricciones — ${person.fullName}`} size="lg" footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div className={styles.tabs} role="tablist" style={{ marginTop: 0 }}>
        <button role="tab" aria-selected={tab === "competencias"} className={tab === "competencias" ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab("competencias")}>
          <BadgeCheck size={14} /> Competencias
        </button>
        <button role="tab" aria-selected={tab === "restricciones"} className={tab === "restricciones" ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab("restricciones")}>
          <ShieldBan size={14} /> Restricciones
        </button>
      </div>
      {tab === "competencias" ? <CompetenciesSection personId={person.id} /> : <RestrictionsSection personId={person.id} />}
    </Modal>
  );
}

function CompetenciesSection({ personId }: { personId: string }) {
  const toast = useToast();
  const { data: rows = [], isLoading } = usePersonCompetencies(personId);
  const { data: types = [] } = useCompetencyTypes(false);
  const upsert = useUpsertPersonCompetency(personId);
  const del = useDeletePersonCompetency(personId);

  const [typeId, setTypeId] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [certificateNumber, setCert] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [markVerified, setMarkVerified] = useState(true);

  const selectedType = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);
  const typeOptions = useMemo(() => types.map((t) => ({ value: t.id, label: t.name, hint: COMPETENCY_CATEGORY_META[t.category].label })), [types]);

  const reset = () => { setTypeId(""); setIssuedAt(""); setExpiresAt(""); setCert(""); setIssuedBy(""); setMarkVerified(true); };
  const valid = typeId && issuedAt && (!selectedType?.requiresExpiry || expiresAt);

  const submit = () => {
    if (!valid) return;
    upsert.mutate(
      {
        competencyTypeId: typeId,
        issuedAt: new Date(issuedAt).toISOString(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        certificateNumber: certificateNumber.trim() || null,
        issuedBy: issuedBy.trim() || null,
        markVerified,
      },
      { onSuccess: () => { toast.success("Competencia registrada"); reset(); }, onError: (e) => toast.error((e as Error).message) },
    );
  };

  return (
    <>
      <div className={styles.addCard}>
        <div className={styles.addGrid}>
          <label className={styles.field} style={{ gridColumn: "span 2" }}>
            <span className={styles.fieldLabel}>Competencia</span>
            <Combobox options={typeOptions} value={typeId} onChange={setTypeId} placeholder="Buscar competencia…" searchPlaceholder="Buscar…" ariaLabel="Competencia" clearable emptyText="No hay tipos de competencia" />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Emitida</span><Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Vence{selectedType && !selectedType.requiresExpiry ? " (opcional)" : ""}</span>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>N.º de certificado</span><Input value={certificateNumber} onChange={(e) => setCert(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Emisor</span><Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Organismo/instructor" /></label>
          <label className={styles.checkField}>
            <input type="checkbox" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} />
            <span>Verifico la evidencia</span>
          </label>
        </div>
        <Button variant="primary" leftIcon={<Plus size={15} />} loading={upsert.isPending} disabled={!valid} onClick={submit}>Agregar / renovar</Button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Competencia</th><th>Categoría</th><th>Emitida</th><th>Vence</th><th>Estado</th><th>Verificación</th><th /></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className={styles.empty}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>Sin competencias registradas.</td></tr>
            ) : rows.map((c) => (
              <tr key={c.id}>
                <td>{c.competencyTypeName}</td>
                <td><span className={styles.chip}>{COMPETENCY_CATEGORY_META[c.category].label}</span></td>
                <td>{formatDate(c.issuedAt)}</td>
                <td>{c.expiresAt ? formatDate(c.expiresAt) : <span className={styles.muted}>—</span>}</td>
                <td><span style={{ color: VALIDITY_COLOR[c.validity], fontWeight: 600 }}>{COMPETENCY_VALIDITY_META[c.validity].label}</span></td>
                <td>{c.verifiedByName ? <span className={styles.chip}><BadgeCheck size={12} /> {c.verifiedByName}</span> : <span className={styles.muted}>Sin verificar</span>}</td>
                <td><Button variant="secondary" leftIcon={<Trash2 size={13} />} onClick={() => del.mutate(c.id, { onSuccess: () => toast.success("Competencia eliminada"), onError: (e) => toast.error((e as Error).message) })}>Quitar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RestrictionsSection({ personId }: { personId: string }) {
  const toast = useToast();
  const { data: rows = [], isLoading } = usePersonRestrictions(personId);
  const upsert = useUpsertPersonRestriction(personId);
  const del = useDeletePersonRestriction(personId);

  const [type, setType] = useState<RestrictionType>("MEDICAL");
  const [reason, setReason] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const reset = () => { setType("MEDICAL"); setReason(""); setStartsAt(""); setEndsAt(""); };
  const submit = () => {
    if (!reason.trim()) return;
    upsert.mutate(
      { type, reason: reason.trim(), startsAt: startsAt ? new Date(startsAt).toISOString() : undefined, endsAt: endsAt ? new Date(endsAt).toISOString() : null },
      { onSuccess: () => { toast.success("Restricción registrada"); reset(); }, onError: (e) => toast.error((e as Error).message) },
    );
  };

  return (
    <>
      <div className={styles.addCard}>
        <div className={styles.addGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tipo</span>
            <Select value={type} onChange={(e) => setType(e.target.value as RestrictionType)}>
              {RESTRICTION_TYPES.map((t) => <option key={t} value={t}>{RESTRICTION_TYPE_META[t].label}</option>)}
            </Select>
          </label>
          <label className={styles.field} style={{ gridColumn: "span 3" }}><span className={styles.fieldLabel}>Motivo</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del veto/restricción" /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Desde</span><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Hasta (opcional)</span><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
        </div>
        <Button variant="primary" leftIcon={<Plus size={15} />} loading={upsert.isPending} disabled={!reason.trim()} onClick={submit}>Agregar restricción</Button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Tipo</th><th>Motivo</th><th>Desde</th><th>Hasta</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className={styles.empty}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>Sin restricciones.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td><span className={styles.chip}>{RESTRICTION_TYPE_META[r.type].label}</span></td>
                <td>{r.reason}</td>
                <td>{formatDate(r.startsAt)}</td>
                <td>{r.endsAt ? formatDate(r.endsAt) : <span className={styles.muted}>Indefinida</span>}</td>
                <td>{r.effective ? <span style={{ color: "var(--color-error)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarClock size={12} /> Vigente</span> : <span className={styles.muted}>Inactiva</span>}</td>
                <td><Button variant="secondary" leftIcon={<Trash2 size={13} />} onClick={() => del.mutate(r.id, { onSuccess: () => toast.success("Restricción eliminada"), onError: (e) => toast.error((e as Error).message) })}>Quitar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
