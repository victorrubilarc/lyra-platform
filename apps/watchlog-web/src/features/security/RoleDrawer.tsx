import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, KeySquare, LayoutGrid, ShieldCheck } from "lucide-react";
import { Button, Drawer, FormField, Input, Skeleton, Toggle, cx, useToast } from "@lyra/ui";
import { roleKeySchema, type ScopeEntry } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useOrgTree } from "../structure/structure-queries.js";
import { PermissionMatrix } from "./PermissionMatrix.js";
import { ScopeTreePicker } from "./ScopeTreePicker.js";
import { TemplateScopePicker } from "./TemplateScopePicker.js";
import {
  useAssignRoleScope,
  useAssignRoleTemplateScope,
  useCreateRole,
  usePermissionCatalog,
  useRole,
  useTemplateScopeOptions,
  useUpdateRole,
} from "./security-queries.js";
import shared from "./security-shared.module.css";

interface RoleDrawerProps {
  open: boolean;
  /** `null` = crear; un id = editar (se carga el detalle). */
  roleId: string | null;
  onClose: () => void;
}

interface FormState {
  key: string;
  name: string;
  description: string;
  requireMfa: boolean;
  permissions: Set<string>;
  /** Alcance por NODO del rol (ABAC dim. 4). Vacío = el rol no aporta restricción. */
  nodeScope: ScopeEntry[];
  /** Alcance por plantilla del rol (ids). Vacío = sin restricción. */
  templateScope: string[];
}

const EMPTY: FormState = {
  key: "",
  name: "",
  description: "",
  requireMfa: false,
  permissions: new Set(),
  nodeScope: [],
  templateScope: [],
};

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

function sameScope(a: ScopeEntry[], b: ScopeEntry[]): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(b.map((e) => [e.orgNodeId, e.includeDescendants]));
  return a.every((e) => map.get(e.orgNodeId) === e.includeDescendants);
}

export function RoleDrawer({ open, roleId, onClose }: RoleDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isEdit = roleId !== null;

  const { data: catalog = [] } = usePermissionCatalog();
  const { data: role, isLoading: roleLoading } = useRole(open && isEdit ? roleId : null);
  const { data: templateOptions = [] } = useTemplateScopeOptions(open && isEdit);
  const { data: tree = [] } = useOrgTree();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const assignScope = useAssignRoleScope();
  const assignTemplateScope = useAssignRoleTemplateScope();

  const [state, setState] = useState<FormState>(EMPTY);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [tab, setTab] = useState<"datos" | "permisos" | "alcance">("datos");

  // Sincroniza el formulario al abrir / cuando llega el detalle.
  useEffect(() => {
    if (!open) return;
    setTab("datos");
    if (isEdit && role) {
      setState({
        key: role.key,
        name: role.name,
        description: role.description ?? "",
        requireMfa: role.requireMfa,
        permissions: new Set(role.permissionKeys),
        nodeScope: role.scopes,
        templateScope: role.templateScopes,
      });
    } else if (!isEdit) {
      setState(EMPTY);
    }
    setKeyError(null);
    setNameError(null);
  }, [open, isEdit, role]);

  const busy =
    createRole.isPending || updateRole.isPending || assignScope.isPending || assignTemplateScope.isPending;
  const isSystem = role?.isSystem ?? false;

  function validate(): boolean {
    let ok = true;
    if (!state.name.trim()) {
      setNameError(t("security.roles.nameRequired"));
      ok = false;
    } else setNameError(null);

    if (!isEdit) {
      const parsed = roleKeySchema.safeParse(state.key);
      if (!parsed.success) {
        setKeyError(parsed.error.issues[0]?.message ?? t("security.roles.keyInvalid"));
        ok = false;
      } else setKeyError(null);
    }
    return ok;
  }

  async function onSubmit() {
    if (!validate()) return;
    try {
      if (isEdit && role) {
        await updateRole.mutateAsync({
          id: role.id,
          dto: {
            name: state.name.trim(),
            description: state.description.trim() || null,
            requireMfa: state.requireMfa,
            permissionKeys: [...state.permissions],
          },
        });
        // Alcance por NODO: endpoint propio, solo si cambió (eje ABAC aparte).
        if (!sameScope(state.nodeScope, role.scopes)) {
          await assignScope.mutateAsync({ id: role.id, dto: { scopes: state.nodeScope } });
        }
        // Alcance por plantilla: endpoint propio, solo si cambió (eje aparte).
        if (!sameSet(state.templateScope, role.templateScopes)) {
          await assignTemplateScope.mutateAsync({ id: role.id, dto: { templateIds: state.templateScope } });
        }
        toast.success(t("security.roles.updated"));
      } else {
        await createRole.mutateAsync({
          key: state.key.trim(),
          name: state.name.trim(),
          description: state.description.trim() || undefined,
          requireMfa: state.requireMfa,
          permissionKeys: [...state.permissions],
        });
        toast.success(t("security.roles.created"));
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  const tabs = [
    { key: "datos" as const, label: t("security.roles.tabs.data"), icon: FileText },
    { key: "permisos" as const, label: t("security.roles.tabs.permissions"), icon: KeySquare, count: state.permissions.size },
    { key: "alcance" as const, label: t("security.roles.tabs.scope"), icon: LayoutGrid, count: isEdit ? state.nodeScope.length + state.templateScope.length || undefined : undefined },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} />
          {isEdit ? t("security.roles.editTitle") : t("security.roles.createTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={busy}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      {isEdit && roleLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={200} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isSystem && (
            <div className={shared.errorBox} style={{ background: "var(--color-info-bg)", color: "var(--color-info)", borderColor: "rgba(6,182,212,0.22)", marginBottom: 12 }}>
              <ShieldCheck size={16} />
              {t("security.roles.systemHint")}
            </div>
          )}

          <div className={shared.tabs} role="tablist">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={tab === tb.key}
                className={cx(shared.tab, tab === tb.key && shared.tabActive)}
                onClick={() => setTab(tb.key)}
              >
                <tb.icon size={15} aria-hidden />
                {tb.label}
                {tb.count != null && <span className={shared.tabCount}>{tb.count}</span>}
              </button>
            ))}
          </div>

          {/* ── Datos ── */}
          {tab === "datos" && (
            <div className={shared.tabPanel}>
              <FormField label={t("security.roles.key")} error={keyError ?? undefined} required hint={isEdit ? t("security.roles.keyLocked") : t("security.roles.keyHint")}>
                {(field) => (
                  <Input
                    {...field}
                    value={state.key}
                    onChange={(e) => setState((s) => ({ ...s, key: e.target.value }))}
                    placeholder="supervisor-turno"
                    mono
                    disabled={isEdit}
                    invalid={!!keyError}
                  />
                )}
              </FormField>

              <FormField label={t("security.roles.name")} error={nameError ?? undefined} required>
                {(field) => (
                  <Input
                    {...field}
                    value={state.name}
                    onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                    placeholder={t("security.roles.namePlaceholder")}
                    invalid={!!nameError}
                  />
                )}
              </FormField>

              <FormField label={t("security.roles.description")}>
                {(field) => (
                  <Input
                    {...field}
                    value={state.description}
                    onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                    placeholder={t("security.roles.descriptionPlaceholder")}
                  />
                )}
              </FormField>

              <div className={shared.controlRow} style={{ borderTop: "none", padding: 0 }}>
                <div className={shared.controlLabel}>
                  <span className={shared.controlName}>{t("security.roles.requireMfa")}</span>
                  <span className={shared.controlHint}>{t("security.roles.requireMfaHint")}</span>
                </div>
                <Toggle
                  checked={state.requireMfa}
                  onChange={(v) => setState((s) => ({ ...s, requireMfa: v }))}
                  aria-label={t("security.roles.requireMfa")}
                />
              </div>
            </div>
          )}

          {/* ── Permisos ── */}
          {tab === "permisos" && (
            <div className={shared.tabPanel}>
              <PermissionMatrix
                catalog={catalog}
                selected={state.permissions}
                onChange={(next) => setState((s) => ({ ...s, permissions: next }))}
                disabled={busy}
              />
            </div>
          )}

          {/* ── Alcance del rol: dos ejes ABAC ortogonales (nodo + plantilla) ── */}
          {tab === "alcance" && (
            <div className={shared.tabPanel}>
              {isEdit ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Por NODO (ABAC dim. 4) — se UNE al alcance de cada usuario del rol */}
                  <section>
                    <h4 className={shared.panelTitle}>{t("security.roles.nodeScope.title")}</h4>
                    <p className={shared.controlHint} style={{ margin: "0 0 12px" }}>
                      {state.nodeScope.length === 0
                        ? t("security.roles.nodeScope.all")
                        : t("security.roles.nodeScope.desc")}
                    </p>
                    <ScopeTreePicker
                      tree={tree}
                      value={state.nodeScope}
                      onChange={(next) => setState((s) => ({ ...s, nodeScope: next }))}
                      disabled={busy}
                    />
                  </section>

                  {/* Por PLANTILLA (2.º eje ABAC, Fase 2.8) */}
                  <section>
                    <h4 className={shared.panelTitle}>{t("security.roles.templateScope.title")}</h4>
                    <p className={shared.controlHint} style={{ margin: "0 0 12px" }}>
                      {state.templateScope.length === 0
                        ? t("security.roles.templateScopeAll")
                        : t("security.users.templateScope.desc")}
                    </p>
                    <TemplateScopePicker
                      options={templateOptions}
                      value={state.templateScope}
                      onChange={(next) => setState((s) => ({ ...s, templateScope: next }))}
                      disabled={busy}
                    />
                  </section>
                </div>
              ) : (
                <p className={shared.controlHint} style={{ margin: 0 }}>
                  {t("security.roles.templateScopeCreateHint")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
