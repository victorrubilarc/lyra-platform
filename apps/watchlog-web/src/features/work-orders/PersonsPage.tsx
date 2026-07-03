import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Building2, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import {
  ACCREDITATION_STATUS_META,
  DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS,
  PERSON_KIND_META,
  personKindSchema,
  type AccreditationStatus,
  type ContractorCompanyDto,
  type PersonDto,
  type PersonKind,
} from "@lyra/contracts";
import { Button, Input, Modal, Select, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import {
  useContractorCompanies,
  useDeleteContractorCompany,
  useDeletePerson,
  usePersons,
  useUpsertContractorCompany,
  useUpsertPerson,
} from "./work-orders-queries.js";
import { PersonCompetenciesModal } from "./PersonCompetenciesModal.js";
import styles from "./persons.module.css";

/**
 * Catálogo de DOTACIÓN (S1): Personas (propias y de contratistas) y Empresas
 * contratistas. Una Persona es distinta de un usuario del sistema (los contratistas no
 * tienen acceso). Gobernado por `worker:manage`.
 */
export function PersonsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<"personas" | "empresas">("personas");
  const manage = can("worker:manage");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/ordenes-trabajo" className={styles.muted} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={14} /> Órdenes de trabajo
          </Link>
          <h1 className={styles.h1}>Personas y contratistas</h1>
          <p className={styles.sub}>Catálogo de personas (propias y de contratistas) que conforman la dotación de los permisos de trabajo. Una persona no es un usuario del sistema.</p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "personas"} className={tab === "personas" ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab("personas")}>
          <Users size={14} /> Personas
        </button>
        <button role="tab" aria-selected={tab === "empresas"} className={tab === "empresas" ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab("empresas")}>
          <Building2 size={14} /> Empresas contratistas
        </button>
      </div>

      {tab === "personas" ? <PersonsSection canManage={manage} /> : <CompaniesSection canManage={manage} />}
    </div>
  );
}

function PersonsSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const { data: persons = [], isLoading } = usePersons({ search: search.trim() || undefined, kind: kind || undefined, includeInactive: true });
  const del = useDeletePerson();
  const [editing, setEditing] = useState<PersonDto | null | "new">(null);
  const [competencyOf, setCompetencyOf] = useState<PersonDto | null>(null);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <Input placeholder="Buscar por nombre, RUT o ficha…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos</option>
          <option value="INTERNAL">Propios</option>
          <option value="CONTRACTOR">Contratistas</option>
        </Select>
        {canManage && <Button variant="primary" leftIcon={<UserPlus size={15} />} onClick={() => setEditing("new")}>Nueva persona</Button>}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Nombre</th><th>Tipo</th><th>Empresa</th><th>RUT</th><th>Cargo</th><th>Estado</th>{canManage && <th />}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className={styles.empty}>Cargando…</td></tr>
            ) : persons.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>Sin personas. Crea la primera con «Nueva persona».</td></tr>
            ) : persons.map((p) => (
              <tr key={p.id}>
                <td>{p.fullName}</td>
                <td><span className={styles.chip}>{PERSON_KIND_META[p.kind].label}</span></td>
                <td>{p.contractorCompanyName ?? <span className={styles.muted}>—</span>}</td>
                <td>{p.nationalId ?? <span className={styles.muted}>—</span>}</td>
                <td>{p.jobTitle ?? <span className={styles.muted}>—</span>}</td>
                <td>{p.active ? "Activa" : <span className={styles.muted}>Inactiva</span>}</td>
                {canManage && (
                  <td>
                    <div className={styles.rowActions}>
                      <Button variant="secondary" leftIcon={<BadgeCheck size={13} />} onClick={() => setCompetencyOf(p)}>Competencias</Button>
                      <Button variant="secondary" leftIcon={<Pencil size={13} />} onClick={() => setEditing(p)}>Editar</Button>
                      <Button variant="secondary" leftIcon={<Trash2 size={13} />} onClick={() => del.mutate(p.id, { onSuccess: () => toast.success("Persona eliminada"), onError: (e) => toast.error((e as Error).message) })}>Eliminar</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <PersonModal person={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {competencyOf && <PersonCompetenciesModal person={competencyOf} onClose={() => setCompetencyOf(null)} />}
    </>
  );
}

function PersonModal({ person, onClose }: { person: PersonDto | null; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertPerson();
  const { data: companies = [] } = useContractorCompanies(false);
  const [kind, setKind] = useState<PersonKind>(person?.kind ?? "INTERNAL");
  const [firstName, setFirstName] = useState(person?.firstName ?? "");
  const [lastName, setLastName] = useState(person?.lastName ?? "");
  const [nationalId, setNationalId] = useState(person?.nationalId ?? "");
  const [personnelCode, setPersonnelCode] = useState(person?.personnelCode ?? "");
  const [jobTitle, setJobTitle] = useState(person?.jobTitle ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [companyId, setCompanyId] = useState(person?.contractorCompanyId ?? "");
  const [active, setActive] = useState(person?.active ?? true);

  const valid = firstName.trim() && lastName.trim() && (kind !== "CONTRACTOR" || companyId);

  const submit = () => {
    const parsed = personKindSchema.safeParse(kind);
    if (!parsed.success) return;
    upsert.mutate(
      {
        ...(person ? { id: person.id } : {}),
        kind,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationalId: nationalId.trim() || null,
        personnelCode: personnelCode.trim() || null,
        jobTitle: jobTitle.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        contractorCompanyId: kind === "CONTRACTOR" ? companyId : null,
        active,
      },
      { onSuccess: () => { toast.success(person ? "Persona actualizada" : "Persona creada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  };

  return (
    <Modal open onClose={onClose} title={person ? "Editar persona" : "Nueva persona"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{person ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Tipo de persona</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)}>
            <option value="INTERNAL">Propio</option>
            <option value="CONTRACTOR">Contratista</option>
          </Select>
        </label>
        {kind === "CONTRACTOR" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Empresa contratista</span>
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Selecciona…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
        )}
        <div className={styles.grid2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre</span><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Apellido</span><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>RUT / DNI</span><Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ficha / código</span><Input value={personnelCode} onChange={(e) => setPersonnelCode(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Cargo</span><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Teléfono</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Email</span><Input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
            <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Activa</option><option value="0">Inactiva</option></Select>
          </label>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Vista derivada de la acreditación de una empresa para el badge (nivel semántico) y la
 * vigencia legible. Espeja la lógica del gate del backend (`deriveWorkerReasons`, eje empresa):
 * NONE/SUSPENDED/EXPIRED o vencida ⇒ rojo; CONDITIONAL o por vencer (≤90d) ⇒ ámbar; si no ⇒ verde.
 */
function accreditationView(c: ContractorCompanyDto): { cls: string; label: string; expiry: { text: string; cls: string } | null } {
  const statusLabel = ACCREDITATION_STATUS_META[c.accreditationStatus].label + (c.accreditationGrade ? ` · ${c.accreditationGrade}` : "");
  const untilMs = c.accreditedUntil ? new Date(c.accreditedUntil).getTime() : null;
  const now = Date.now();
  const expired = untilMs != null && untilMs <= now;
  const expiringSoon = untilMs != null && !expired && untilMs - now <= DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS * 24 * 60 * 60 * 1000;
  let cls = styles.badgeNeutral;
  if (c.accreditationStatus === "ACCREDITED" || c.accreditationStatus === "CONDITIONAL") {
    if (expired) cls = styles.badgeBad;
    else if (c.accreditationStatus === "CONDITIONAL" || expiringSoon) cls = styles.badgeWarn;
    else cls = styles.badgeOk;
  } else {
    cls = styles.badgeBad; // NONE / SUSPENDED / EXPIRED
  }
  const expiry = c.accreditedUntil
    ? { text: `${expired ? "Venció" : "Vence"} ${formatDate(c.accreditedUntil)}`, cls: (expired ? styles.subBad : expiringSoon ? styles.subWarn : "") ?? "" }
    : null;
  return { cls: `${styles.badge} ${cls}`, label: statusLabel, expiry };
}

const COMPANY_PAGE_SIZE = 10;

function CompaniesSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { data: companies = [], isLoading } = useContractorCompanies(true);
  const del = useDeleteContractorCompany();
  const [editing, setEditing] = useState<ContractorCompanyDto | null | "new">(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (status && c.accreditationStatus !== status) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.taxId ?? "").toLowerCase().includes(q);
    });
  }, [companies, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / COMPANY_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = filtered.slice(current * COMPANY_PAGE_SIZE, current * COMPANY_PAGE_SIZE + COMPANY_PAGE_SIZE);

  const pager = (
    <div className={styles.pageBar}>
      <span>{filtered.length} empresa(s){filtered.length !== companies.length ? ` · ${companies.length} en total` : ""}</span>
      {pageCount > 1 && (
        <span className={styles.pageBtns}>
          <Button variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button>
          <span>Página {current + 1} de {pageCount}</span>
          <Button variant="secondary" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Siguiente</Button>
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <Input placeholder="Buscar por empresa o RUT…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Acreditación">
          <option value="">Toda acreditación</option>
          {Object.entries(ACCREDITATION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        {canManage && <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setEditing("new")}>Nueva empresa</Button>}
      </div>

      {pager}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Empresa</th><th>RUT</th><th>Acreditación</th><th>Personas</th><th>Estado</th>{canManage && <th />}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className={styles.empty}>Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>{companies.length === 0 ? "Sin empresas contratistas. Crea la primera con «Nueva empresa»." : "Sin empresas que coincidan con el filtro."}</td></tr>
            ) : shown.map((c) => {
              const acc = accreditationView(c);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.taxId ?? <span className={styles.muted}>—</span>}</td>
                  <td>
                    <span className={acc.cls}>{acc.label}</span>
                    {acc.expiry && <span className={`${styles.subline} ${acc.expiry.cls}`}>{acc.expiry.text}</span>}
                    {c.externalProvider && <span className={styles.subline}>vía {c.externalProvider}</span>}
                  </td>
                  <td>{c.personCount}</td>
                  <td>{c.active ? "Activa" : <span className={styles.muted}>Inactiva</span>}</td>
                  {canManage && (
                    <td>
                      <div className={styles.rowActions}>
                        <Button variant="secondary" leftIcon={<Pencil size={13} />} onClick={() => setEditing(c)}>Editar</Button>
                        <Button variant="secondary" leftIcon={<Trash2 size={13} />} onClick={() => del.mutate(c.id, { onSuccess: () => toast.success("Empresa eliminada"), onError: (e) => toast.error((e as Error).message) })}>Eliminar</Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pager}

      {editing && <CompanyModal company={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** "YYYY-MM-DD" (input date) ⇒ ISO UTC con sufijo Z (lo exige el DTO `z.string().datetime()`). */
function dateInputToIso(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}T00:00:00.000Z`).toISOString();
}
/** ISO ⇒ "YYYY-MM-DD" para prellenar el input date. */
function isoToDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : "";
}

function CompanyModal({ company, onClose }: { company: ContractorCompanyDto | null; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertContractorCompany();
  const [name, setName] = useState(company?.name ?? "");
  const [taxId, setTaxId] = useState(company?.taxId ?? "");
  const [status, setStatus] = useState<AccreditationStatus>(company?.accreditationStatus ?? "NONE");
  const [grade, setGrade] = useState(company?.accreditationGrade ?? "");
  const [accreditedUntil, setAccreditedUntil] = useState(isoToDateInput(company?.accreditedUntil ?? null));
  const [externalProvider, setExternalProvider] = useState(company?.externalProvider ?? "");
  const [note, setNote] = useState(company?.accreditationNote ?? "");
  const [active, setActive] = useState(company?.active ?? true);

  // El vencimiento sólo aplica a empresas ACREDITADAS/CONDICIONALES.
  const showUntil = status === "ACCREDITED" || status === "CONDITIONAL";

  const submit = () =>
    upsert.mutate(
      {
        dto: {
          ...(company ? { id: company.id } : {}),
          name: name.trim(),
          taxId: taxId.trim() || null,
          accreditationStatus: status,
          accreditationGrade: grade.trim() || null,
          accreditedUntil: showUntil ? dateInputToIso(accreditedUntil) : null,
          externalProvider: externalProvider.trim() || null,
          accreditationNote: note.trim() || null,
          active,
        },
        create: !company,
      },
      { onSuccess: () => { toast.success(company ? "Empresa actualizada" : "Empresa creada"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );

  return (
    <Modal open onClose={onClose} title={company ? "Editar empresa contratista" : "Nueva empresa contratista"} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!name.trim()} onClick={submit}>{company ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <label className={styles.field}><span className={styles.fieldLabel}>Nombre</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>RUT de la empresa</span><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Registro art. 183-C" /></label>
        <div className={styles.grid2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Acreditación</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value as AccreditationStatus)}>
              {Object.entries(ACCREDITATION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Grado / score</span><Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Ej. A (ISN RAVS)" /></label>
        </div>
        {showUntil && (
          <div className={styles.grid2}>
            <label className={styles.field}><span className={styles.fieldLabel}>Vigente hasta</span>
              <Input type="date" value={accreditedUntil} onChange={(e) => setAccreditedUntil(e.target.value)} />
            </label>
            <label className={styles.field}><span className={styles.fieldLabel}>Fuente / plataforma</span>
              <Input value={externalProvider} onChange={(e) => setExternalProvider(e.target.value)} placeholder="ISNetworld, Avetta…" />
            </label>
          </div>
        )}
        <label className={styles.field}><span className={styles.fieldLabel}>Nota de acreditación</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observación (opcional)" />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Activa</option><option value="0">Inactiva</option></Select>
        </label>
      </div>
    </Modal>
  );
}
