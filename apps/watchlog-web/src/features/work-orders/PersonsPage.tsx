import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Building2, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import {
  ACCREDITATION_STATUS_META,
  DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS,
  ID_DOCUMENT_TYPE_META,
  ID_DOCUMENT_TYPES,
  isValidRut,
  PERSON_GENDER_META,
  PERSON_GENDERS,
  PERSON_KIND_META,
  personAge,
  personKindSchema,
  type AccreditationStatus,
  type ContractorCompanyDto,
  type IdDocumentType,
  type PersonDto,
  type PersonGender,
  type PersonKind,
} from "@lyra/contracts";
import { Button, Chip, Combobox, EmptyState, GridPager, Input, Modal, Select, Spinner, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatRut, formatRutLive } from "../../lib/format.js";
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
// Estándar de grilla compartido con el mantenedor de catálogos (una sola fuente de verdad).
import grid from "./catalogs.module.css";

/** Tamaño de página por defecto de las grillas de este catálogo (estándar). */
const PAGE_SIZES = [10, 25, 50, 100];

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
          <Link to="/ordenes-trabajo" className={styles.back}><ArrowLeft size={15} /> Órdenes de trabajo</Link>
          <h1 className={styles.h1}><Users size={22} /> Personas y contratistas</h1>
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
  const [companyId, setCompanyId] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const { data: persons = [], isLoading } = usePersons({ search: search.trim() || undefined, kind: kind || undefined, includeInactive: true });
  const { data: companies = [] } = useContractorCompanies(true);
  const del = useDeletePerson();
  const [editing, setEditing] = useState<PersonDto | null | "new">(null);
  const [competencyOf, setCompetencyOf] = useState<PersonDto | null>(null);

  // Filtro por empresa: client-side sobre lo que ya devuelve el backend. Sólo tiene sentido
  // para contratistas; si eliges empresa, se acota a esa empresa (implica contratistas).
  const companyOptions = useMemo(() => companies.map((c) => ({ value: c.id, label: c.name, hint: c.taxId ?? undefined })), [companies]);
  const filtered = useMemo(() => (companyId ? persons.filter((p) => p.contractorCompanyId === companyId) : persons), [persons, companyId]);
  const total = filtered.length;
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const pager = <GridPager page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />;

  return (
    <>
      <div className={grid.toolbar}>
        <div className={grid.filters}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <Input placeholder="Buscar por nombre, RUT o ficha…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); if (e.target.value === "INTERNAL") setCompanyId(""); }} aria-label="Tipo" className={styles.fixedSel}>
            <option value="">Todos los tipos</option>
            <option value="INTERNAL">Propios</option>
            <option value="CONTRACTOR">Contratistas</option>
          </Select>
          <div className={styles.filterCombo}>
            <Combobox
              options={companyOptions}
              value={companyId}
              onChange={(v) => { setCompanyId(v); setPage(0); if (v) setKind("CONTRACTOR"); }}
              placeholder="Toda empresa"
              searchPlaceholder="Buscar empresa…"
              emptyText="Sin empresas"
              clearable
              ariaLabel="Filtrar por empresa contratista"
            />
          </div>
        </div>
        {canManage && <Button variant="primary" leftIcon={<UserPlus size={15} />} onClick={() => setEditing("new")}>Nueva persona</Button>}
      </div>

      {isLoading ? <div className={grid.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<Users size={32} />} title="Sin personas" description={persons.length === 0 ? "Crea la primera con «Nueva persona»." : "No hay personas que coincidan con los filtros."} />
        : (
          <>
            {pager}
            <div className={grid.tableCard}>
              <table className={grid.table}>
                <thead><tr>
                  <th>Nombre</th><th>Tipo</th><th>Empresa</th><th>RUT</th><th>Cargo</th><th>Impedimentos</th><th>Estado</th>{canManage && <th />}
                </tr></thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id} className={p.active ? undefined : grid.inactiveRow}>
                      <td>
                        <span className={grid.nameCell}>{p.fullName}</span>
                        {p.nationality && <div className={grid.cellDesc}>{p.nationality}</div>}
                      </td>
                      <td><Chip label={PERSON_KIND_META[p.kind].label} variant={p.kind === "CONTRACTOR" ? "info" : "default"} /></td>
                      <td>{p.contractorCompanyName ?? <span className={grid.muted}>—</span>}</td>
                      <td>{p.nationalId ? <span className={grid.mono}>{p.nationalIdType === "RUT" ? formatRut(p.nationalId) : p.nationalId}</span> : <span className={grid.muted}>—</span>}</td>
                      <td>{p.jobTitle ?? <span className={grid.muted}>—</span>}</td>
                      <td><PersonImpediments person={p} /></td>
                      <td><span className={grid.muted}>{p.active ? "Activa" : "Inactiva"}</span></td>
                      {canManage && (
                        <td className={grid.actionsCell}>
                          <Button variant="icon" aria-label="Competencias y restricciones" title="Competencias y restricciones" onClick={() => setCompetencyOf(p)}><BadgeCheck size={16} /></Button>
                          <Button variant="icon" aria-label="Editar" onClick={() => setEditing(p)}><Pencil size={16} /></Button>
                          <Button variant="icon" aria-label="Eliminar" onClick={() => { if (!window.confirm(`¿Eliminar a ${p.fullName}?\n\nNo se borra físicamente: queda archivada (soft-delete) y la acción se registra en la auditoría. No se puede si está en la dotación de una OT activa.`)) return; del.mutate(p.id, { onSuccess: () => toast.success("Persona archivada (queda en auditoría)"), onError: (e) => toast.error((e as Error).message) }); }}><Trash2 size={16} /></Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

      {editing && <PersonModal person={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {competencyOf && <PersonCompetenciesModal person={competencyOf} onClose={() => setCompetencyOf(null)} />}
    </>
  );
}

/**
 * "Luces" de impedimentos por persona (Ejes A/B) que de otro modo quedarían ocultos en el
 * catálogo: competencias VENCIDAS (rojo) y restricciones/vetos ACTIVOS (rojo). El detalle
 * completo (qué competencia, qué veto) vive en el modal de competencias/restricciones.
 */
function PersonImpediments({ person }: { person: PersonDto }) {
  const parts: string[] = [];
  if (person.expiredCompetencies > 0) parts.push(`${person.expiredCompetencies} vencida${person.expiredCompetencies > 1 ? "s" : ""}`);
  if (person.activeRestrictions > 0) parts.push(`${person.activeRestrictions} restricción${person.activeRestrictions > 1 ? "es" : ""}`);
  if (parts.length === 0) return <span className={grid.muted}>—</span>;
  return <Chip variant="error" label={parts.join(" · ")} />;
}

function PersonModal({ person, onClose }: { person: PersonDto | null; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertPerson();
  const { data: companies = [] } = useContractorCompanies(false);
  const [kind, setKind] = useState<PersonKind>(person?.kind ?? "INTERNAL");
  const [firstName, setFirstName] = useState(person?.firstName ?? "");
  const [lastName, setLastName] = useState(person?.lastName ?? "");
  const [docType, setDocType] = useState<IdDocumentType>(person?.nationalIdType ?? "RUT");
  // El RUT se muestra formateado; los demás documentos, tal cual.
  const [nationalId, setNationalId] = useState(person?.nationalId ? (person.nationalIdType === "RUT" ? formatRut(person.nationalId) : person.nationalId) : "");
  const [birthDate, setBirthDate] = useState(person?.birthDate ? person.birthDate.slice(0, 10) : "");
  const [gender, setGender] = useState<PersonGender | "">(person?.gender ?? "");
  const [nationality, setNationality] = useState(person?.nationality ?? "");
  const [personnelCode, setPersonnelCode] = useState(person?.personnelCode ?? "");
  const [jobTitle, setJobTitle] = useState(person?.jobTitle ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [companyId, setCompanyId] = useState(person?.contractorCompanyId ?? "");
  const [active, setActive] = useState(person?.active ?? true);

  const rutInvalid = docType === "RUT" && nationalId.trim().length > 0 && !isValidRut(nationalId);
  const age = personAge(birthDate ? `${birthDate}T00:00:00.000Z` : null, Date.now());
  const valid = !!firstName.trim() && !!lastName.trim() && (kind !== "CONTRACTOR" || !!companyId) && !rutInvalid;

  function onDocNumberChange(v: string) {
    setNationalId(docType === "RUT" ? formatRutLive(v) : v);
  }
  function onDocTypeChange(t: IdDocumentType) {
    setDocType(t);
    // Al cambiar a RUT, re-formatea lo tecleado; al salir de RUT, deja el texto limpio.
    setNationalId((prev) => (t === "RUT" ? formatRutLive(prev) : prev));
  }

  const submit = () => {
    const parsed = personKindSchema.safeParse(kind);
    if (!parsed.success) return;
    upsert.mutate(
      {
        ...(person ? { id: person.id } : {}),
        kind,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationalIdType: nationalId.trim() ? docType : null,
        nationalId: nationalId.trim() || null,
        birthDate: birthDate ? `${birthDate}T00:00:00.000Z` : null,
        gender: gender || null,
        nationality: nationality.trim() || null,
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
    <Modal open onClose={onClose} title={person ? "Editar persona" : "Nueva persona"} size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!valid} onClick={submit}>{person ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        {/* Vínculo */}
        <div className={styles.formSection}>
          <span className={styles.formSectionTitle}>Vínculo</span>
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tipo de persona</span>
              <Select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)}>
                <option value="INTERNAL">Propio</option>
                <option value="CONTRACTOR">Contratista</option>
              </Select>
            </label>
            {kind === "CONTRACTOR" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Empresa contratista *</span>
                <Combobox
                  options={companies.map((c) => ({ value: c.id, label: c.name, hint: c.taxId ?? undefined }))}
                  value={companyId}
                  onChange={setCompanyId}
                  placeholder="Selecciona la empresa…"
                  searchPlaceholder="Buscar empresa…"
                  emptyText="No hay empresas: crea una en la pestaña «Empresas contratistas»"
                  ariaLabel="Empresa contratista"
                  invalid={kind === "CONTRACTOR" && !companyId}
                />
              </label>
            )}
          </div>
        </div>

        {/* Identidad */}
        <div className={styles.formSection}>
          <span className={styles.formSectionTitle}>Identidad</span>
          <div className={styles.grid2}>
            <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Apellido *</span><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          </div>
          <div className={styles.grid3}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tipo de documento</span>
              <Select value={docType} onChange={(e) => onDocTypeChange(e.target.value as IdDocumentType)}>
                {ID_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{ID_DOCUMENT_TYPE_META[t].label}</option>)}
              </Select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{docType === "RUT" ? "RUT" : "N.º de documento"}</span>
              <Input value={nationalId} onChange={(e) => onDocNumberChange(e.target.value)} placeholder={docType === "RUT" ? "12.345.678-9" : "N.º de documento"} invalid={rutInvalid} inputMode={docType === "RUT" ? "text" : undefined} />
              {rutInvalid && <span className={`${styles.subline} ${styles.subBad}`}>RUT inválido (dígito verificador)</span>}
            </label>
            <label className={styles.field}><span className={styles.fieldLabel}>Nacionalidad</span><Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Chilena, Peruana…" /></label>
          </div>
        </div>

        {/* Datos personales */}
        <div className={styles.formSection}>
          <span className={styles.formSectionTitle}>Datos personales</span>
          <div className={styles.grid3}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Fecha de nacimiento</span>
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              {age != null && <span className={styles.subline}>{age} años</span>}
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Género</span>
              <Select value={gender} onChange={(e) => setGender((e.target.value || "") as PersonGender | "")}>
                <option value="">Sin especificar</option>
                {PERSON_GENDERS.filter((g) => g !== "UNSPECIFIED").map((g) => <option key={g} value={g}>{PERSON_GENDER_META[g].label}</option>)}
              </Select>
            </label>
            <label className={styles.field}><span className={styles.fieldLabel}>Ficha / código</span><Input value={personnelCode} onChange={(e) => setPersonnelCode(e.target.value)} placeholder="Interno o del contratista" /></label>
          </div>
        </div>

        {/* Contacto y vínculo laboral */}
        <div className={styles.formSection}>
          <span className={styles.formSectionTitle}>Contacto y cargo</span>
          <div className={styles.grid2}>
            <label className={styles.field}><span className={styles.fieldLabel}>Cargo</span><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Ej. Mecánico, Supervisor…" /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Teléfono</span><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Email</span><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional@empresa.cl" /></label>
            <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
              <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Activa</option><option value="0">Inactiva</option></Select>
            </label>
          </div>
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

function CompaniesSection({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { data: companies = [], isLoading } = useContractorCompanies(true);
  const del = useDeleteContractorCompany();
  const [editing, setEditing] = useState<ContractorCompanyDto | null | "new">(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (status && c.accreditationStatus !== status) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.taxId ?? "").toLowerCase().includes(q);
    });
  }, [companies, search, status]);
  const total = filtered.length;
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const pager = <GridPager page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />;

  return (
    <>
      <div className={grid.toolbar}>
        <div className={grid.filters}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <Input placeholder="Buscar por empresa o RUT…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Acreditación" className={styles.fixedSel}>
            <option value="">Toda acreditación</option>
            {Object.entries(ACCREDITATION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {canManage && <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setEditing("new")}>Nueva empresa</Button>}
      </div>

      {isLoading ? <div className={grid.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<Building2 size={32} />} title="Sin empresas contratistas" description={companies.length === 0 ? "Crea la primera con «Nueva empresa»." : "No hay empresas que coincidan con los filtros."} />
        : (
          <>
            {pager}
            <div className={grid.tableCard}>
              <table className={grid.table}>
                <thead><tr>
                  <th>Empresa</th><th>RUT</th><th>Acreditación</th><th className={grid.num}>Personas</th><th>Estado</th>{canManage && <th />}
                </tr></thead>
                <tbody>
                  {pageRows.map((c) => {
                    const acc = accreditationView(c);
                    return (
                      <tr key={c.id} className={c.active ? undefined : grid.inactiveRow}>
                        <td><span className={grid.nameCell}>{c.name}</span></td>
                        <td>{c.taxId ? <span className={grid.mono}>{formatRut(c.taxId)}</span> : <span className={grid.muted}>—</span>}</td>
                        <td>
                          <span className={acc.cls}>{acc.label}</span>
                          {acc.expiry && <span className={`${styles.subline} ${acc.expiry.cls}`}>{acc.expiry.text}</span>}
                          {c.externalProvider && <span className={styles.subline}>vía {c.externalProvider}</span>}
                        </td>
                        <td className={grid.num}>{c.personCount}</td>
                        <td><span className={grid.muted}>{c.active ? "Activa" : "Inactiva"}</span></td>
                        {canManage && (
                          <td className={grid.actionsCell}>
                            <Button variant="icon" aria-label="Editar" onClick={() => setEditing(c)}><Pencil size={16} /></Button>
                            <Button variant="icon" aria-label="Eliminar" onClick={() => { if (!window.confirm(`¿Eliminar la empresa «${c.name}»?\n\nNo se borra físicamente: queda archivada (soft-delete) y la acción se registra en la auditoría. No se puede si tiene personas asociadas.`)) return; del.mutate(c.id, { onSuccess: () => toast.success("Empresa archivada (queda en auditoría)"), onError: (e) => toast.error((e as Error).message) }); }}><Trash2 size={16} /></Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

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
  const [taxId, setTaxId] = useState(company?.taxId ? formatRut(company.taxId) : "");
  const taxIdInvalid = taxId.trim().length > 0 && !isValidRut(taxId);
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
    <Modal open onClose={onClose} title={company ? "Editar empresa contratista" : "Nueva empresa contratista"} size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={upsert.isPending} disabled={!name.trim() || taxIdInvalid} onClick={submit}>{company ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <div className={styles.grid2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Nombre *</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>RUT de la empresa</span>
            <Input value={taxId} onChange={(e) => setTaxId(formatRutLive(e.target.value))} placeholder="76.111.222-3" invalid={taxIdInvalid} />
            {taxIdInvalid && <span className={`${styles.subline} ${styles.subBad}`}>RUT inválido (dígito verificador)</span>}
          </label>
        </div>

        <div className={styles.formSection}>
          <span className={styles.formSectionTitle}>Acreditación (prequalification del contratista)</span>
          <div className={styles.grid2}>
            <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
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
        </div>

        <label className={styles.field}><span className={styles.fieldLabel}>Estado del registro</span>
          <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}><option value="1">Activa</option><option value="0">Inactiva</option></Select>
        </label>
      </div>
    </Modal>
  );
}
