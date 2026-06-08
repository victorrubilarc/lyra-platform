import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, KeyRound, Mail, RotateCcw, ShieldAlert, UserCircle2 } from "lucide-react";
import { Button, Checkbox, Chip, FormField, Input, Select, Skeleton, cx, useToast, type ChipVariant } from "@lyra/ui";
import { USER_STATUSES, type ScopeEntry, type UserStatus } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { useOrgTree } from "../structure/structure-queries.js";
import {
  useAssignUserRoles,
  useAssignUserScope,
  useResetUserMfa,
  useResetUserPassword,
  useRoles,
  useUpdateUser,
  useUser,
} from "./security-queries.js";
import { ScopeTreePicker } from "./ScopeTreePicker.js";
import { ResetMfaModal } from "./ResetMfaModal.js";
import { ResetPasswordModal } from "./ResetPasswordModal.js";
import shared from "./security-shared.module.css";
import styles from "./UsersPage.module.css";

const STATUS_VARIANT: Record<UserStatus, ChipVariant> = {
  ACTIVE: "success",
  DISABLED: "default",
  LOCKED: "error",
  INVITED: "info",
};

type DetailTab = "basic" | "roles" | "scope" | "security";

interface UserDetailProps {
  userId: string | null;
}

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function UserDetail({ userId }: UserDetailProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();

  const { data: user, isLoading } = useUser(userId);
  const { data: roles = [] } = useRoles();
  const { data: tree = [] } = useOrgTree();

  const updateUser = useUpdateUser();
  const assignRoles = useAssignUserRoles();
  const assignScope = useAssignUserScope();
  const resetMfa = useResetUserMfa();
  const resetPassword = useResetUserPassword();

  const [tab, setTab] = useState<DetailTab>("basic");

  // Borradores locales por sección.
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<UserStatus>("ACTIVE");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [scope, setScope] = useState<ScopeEntry[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [pwdResetOpen, setPwdResetOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setStatus(user.status);
    setRoleIds(user.roles.map((r) => r.id));
    setScope(user.scopes);
    setTab("basic");
  }, [user]);

  if (!userId) {
    return (
      <div className={styles.detailEmpty}>
        <UserCircle2 size={40} aria-hidden="true" />
        <p>{t("security.users.selectHint")}</p>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className={styles.detail}>
        <Skeleton height={80} />
        <Skeleton height={44} />
        <Skeleton height={200} />
      </div>
    );
  }

  const basicDirty = displayName.trim() !== user.displayName || status !== user.status;
  const rolesDirty = !sameSet(roleIds, user.roles.map((r) => r.id));
  const scopeDirty = !sameScope(scope, user.scopes);

  async function saveBasic() {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ id: user.id, dto: { displayName: displayName.trim(), status } });
      toast.success(t("security.users.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function saveRoles() {
    if (!user) return;
    try {
      await assignRoles.mutateAsync({ id: user.id, dto: { roleIds } });
      toast.success(t("security.users.rolesSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function saveScope() {
    if (!user) return;
    try {
      await assignScope.mutateAsync({ id: user.id, dto: { scopes: scope } });
      toast.success(t("security.users.scopeSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function doResetMfa() {
    if (!user) return;
    try {
      await resetMfa.mutateAsync(user.id);
      toast.success(t("security.users.mfa.resetDone"));
      setResetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  async function doResetPassword(password: string) {
    if (!user) return;
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      toast.success(t("security.users.password.resetDone"));
      setPwdResetOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  function toggleRole(id: string, checked: boolean) {
    setRoleIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "basic", label: t("security.users.tabs.basic") },
    { key: "roles", label: t("security.users.tabs.roles") },
    { key: "scope", label: t("security.users.tabs.scope") },
    { key: "security", label: t("security.users.tabs.security") },
  ];

  return (
    <div className={styles.detail}>
      {/* Cabecera (siempre visible) */}
      <header className={styles.detailHeader}>
        <div className={styles.avatar}>{initials(user.displayName)}</div>
        <div className={styles.detailHeaderInfo}>
          <h2 className={styles.detailName}>{user.displayName}</h2>
          <span className={styles.detailMail}>
            <Mail size={13} aria-hidden="true" /> {user.email}
          </span>
          <div className={styles.badges}>
            <Chip label={t(`security.users.status.${user.status}`)} variant={STATUS_VARIANT[user.status]} />
            {user.mfaEnabled ? (
              <Chip label={t("security.users.mfa.on")} variant="success" />
            ) : user.mfaRequired ? (
              <Chip label={t("security.users.mfa.required")} variant="warning" />
            ) : (
              <Chip label={t("security.users.mfa.off")} variant="default" />
            )}
            {user.forcePasswordChange && (
              <Chip label={t("security.users.forcePassword")} variant="info" />
            )}
          </div>
        </div>
      </header>

      {/* Pestañas del detalle */}
      <nav className={styles.detailTabs} role="tablist" aria-label={user.displayName}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            className={cx(styles.detailTab, tab === tb.key && styles.detailTabActive)}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {/* ── Datos básicos ── */}
      {tab === "basic" && (
        <div className={styles.detailTabPanel}>
          <div className={shared.formGrid}>
            <FormField label={t("security.users.displayName")}>
              {(field) => (
                <Input
                  {...field}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!perms.can("user:edit")}
                />
              )}
            </FormField>
            <FormField label={t("security.users.statusLabel")}>
              {(field) => (
                <Select
                  {...field}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                  disabled={!perms.can("user:edit")}
                >
                  {USER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`security.users.status.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
          <Can perform="user:edit">
            <div className={shared.actionsFooter}>
              <Button variant="primary" onClick={saveBasic} loading={updateUser.isPending} disabled={!basicDirty || !displayName.trim()}>
                {t("common.save")}
              </Button>
            </div>
          </Can>
        </div>
      )}

      {/* ── Roles ── */}
      {tab === "roles" && (
        <div className={styles.detailTabPanel}>
          <p className={shared.panelDesc} style={{ margin: 0 }}>{t("security.users.rolesDesc")}</p>
          {roles.length === 0 ? (
            <p className={shared.muted} style={{ fontSize: 13 }}>{t("security.users.noRoles")}</p>
          ) : (
            <div className={styles.roleList}>
              {roles.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={roleIds.includes(r.id)}
                  onChange={(v) => toggleRole(r.id, v)}
                  label={r.name}
                  aria-label={r.name}
                  disabled={!perms.can("user:assign-roles")}
                />
              ))}
            </div>
          )}
          <Can perform="user:assign-roles">
            <div className={shared.actionsFooter}>
              <Button variant="primary" onClick={saveRoles} loading={assignRoles.isPending} disabled={!rolesDirty}>
                {t("common.save")}
              </Button>
            </div>
          </Can>
        </div>
      )}

      {/* ── Alcance de datos (ABAC) ── */}
      {tab === "scope" && (
        <div className={styles.detailTabPanel}>
          <p className={shared.panelDesc} style={{ margin: 0 }}>
            {scope.length === 0 ? t("security.users.scope.fullAccess") : t("security.users.scope.desc")}
          </p>
          <ScopeTreePicker
            tree={tree}
            value={scope}
            onChange={setScope}
            disabled={!perms.can("user:assign-scope")}
          />
          <Can perform="user:assign-scope">
            <div className={shared.actionsFooter}>
              <Button variant="primary" onClick={saveScope} loading={assignScope.isPending} disabled={!scopeDirty}>
                {t("common.save")}
              </Button>
            </div>
          </Can>
        </div>
      )}

      {/* ── Seguridad (MFA) ── */}
      {tab === "security" && (
        <div className={styles.detailTabPanel}>
          {/* Contraseña (reset por admin) */}
          <Can perform="user:reset-password">
            <div>
              <h3 className={shared.panelTitle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <KeyRound size={15} aria-hidden="true" />
                {t("security.users.password.title")}
              </h3>
              <p className={shared.panelDesc}>{t("security.users.password.desc")}</p>
              <Button
                variant="secondary"
                leftIcon={<RotateCcw size={16} />}
                onClick={() => setPwdResetOpen(true)}
              >
                {t("security.users.password.reset")}
              </Button>
            </div>
          </Can>

          <div className={styles.infoNote}>
            <Info size={16} aria-hidden="true" />
            <span>{t("security.users.mfa.selfServiceNote")}</span>
          </div>

          <div>
            <h3 className={shared.panelTitle} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <KeyRound size={15} aria-hidden="true" />
              {t("security.users.mfa.title")}
            </h3>
            <p className={shared.panelDesc}>
              {user.mfaEnabled ? t("security.users.mfa.enabledDesc") : t("security.users.mfa.disabledDesc")}
            </p>

            <div className={styles.mfaStatusRow}>
              {user.mfaEnabled ? (
                <Chip label={t("security.users.mfa.on")} variant="success" />
              ) : (
                <Chip label={t("security.users.mfa.off")} variant="default" />
              )}
              {user.mfaRequired && (
                <Chip
                  label={user.mfaEnabled ? t("security.users.mfa.requiredOk") : t("security.users.mfa.enrollmentPending")}
                  variant={user.mfaEnabled ? "info" : "warning"}
                />
              )}
            </div>

            {user.mfaRequired && !user.mfaEnabled && (
              <p className={shared.muted} style={{ fontSize: 13, marginTop: 8 }}>
                {t("security.users.mfa.requiredByRole")}
              </p>
            )}

            <Can perform="user:reset-mfa">
              <div style={{ marginTop: 16 }}>
                <Button
                  variant="danger"
                  leftIcon={<ShieldAlert size={16} />}
                  onClick={() => setResetOpen(true)}
                  disabled={!user.mfaEnabled}
                >
                  {t("security.users.mfa.reset")}
                </Button>
              </div>
            </Can>
          </div>
        </div>
      )}

      <ResetMfaModal
        open={resetOpen}
        userName={user.displayName}
        loading={resetMfa.isPending}
        onConfirm={doResetMfa}
        onClose={() => setResetOpen(false)}
      />

      <ResetPasswordModal
        open={pwdResetOpen}
        userName={user.displayName}
        loading={resetPassword.isPending}
        onConfirm={doResetPassword}
        onClose={() => setPwdResetOpen(false)}
      />
    </div>
  );
}
