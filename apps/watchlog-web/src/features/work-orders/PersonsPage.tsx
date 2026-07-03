import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Building2, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import {
  ACCREDITATION_STATUS_META,
  PERSON_KIND_META,
  personKindSchema,
  type ContractorCompanyDto,
  type PersonDto,
  type PersonKind,
} from "@lyra/contracts";
import { Button, Input, Modal, Select, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
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

function CompaniesSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { data: companies = [], isLoading } = useContractorCompanies(true);
  const del = useDeleteContractorCompany();
  const [editing, setEditing] = useState<ContractorCompanyDto | null | "new">(null);

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.muted} style={{ flex: 1 }}>La acreditación (grado/vigencia) se controla como gate en una etapa posterior; hoy es informativa.</span>
        {canManage && <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setEditing("new")}>Nueva empresa</Button>}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Empresa</th><th>RUT</th><th>Acreditación</th><th>Personas</th><th>Estado</th>{canManage && <th />}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className={styles.empty}>Cargando…</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>Sin empresas contratistas. Crea la primera con «Nueva empresa».</td></tr>
            ) : companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.taxId ?? <span className={styles.muted}>—</span>}</td>
                <td><span className={styles.chip}>{ACCREDITATION_STATUS_META[c.accreditationStatus].label}{c.accreditationGrade ? ` · ${c.accreditationGrade}` : ""}</span></td>
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
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CompanyModal company={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CompanyModal({ company, onClose }: { company: ContractorCompanyDto | null; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertContractorCompany();
  const [name, setName] = useState(company?.name ?? "");
  const [taxId, setTaxId] = useState(company?.taxId ?? "");
  const [status, setStatus] = useState(company?.accreditationStatus ?? "NONE");
  const [grade, setGrade] = useState(company?.accreditationGrade ?? "");
  const [active, setActive] = useState(company?.active ?? true);

  const submit = () =>
    upsert.mutate(
      {
        dto: {
          ...(company ? { id: company.id } : {}),
          name: name.trim(),
          taxId: taxId.trim() || null,
          accreditationStatus: status,
          accreditationGrade: grade.trim() || null,
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
        <label className={styles.field}><span className={styles.fieldLabel}>RUT de la empresa</span><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} /></label>
        <div className={styles.grid2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Acreditación</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ContractorCompanyDto["accreditationStatus"])}>
              {Object.entries(ACCREDITATION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Grado / score</span><Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Ej. A" /></label>
        </div>
        <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Activa</option><option value="0">Inactiva</option></Select>
        </label>
      </div>
    </Modal>
  );
}
