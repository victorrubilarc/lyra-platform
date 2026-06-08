import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Button, Drawer, FormField, Input, Skeleton, Toggle, useToast } from "@lyra/ui";
import { roleKeySchema } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { PermissionMatrix } from "./PermissionMatrix.js";
import {
  useCreateRole,
  usePermissionCatalog,
  useRole,
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
}

const EMPTY: FormState = {
  key: "",
  name: "",
  description: "",
  requireMfa: false,
  permissions: new Set(),
};

export function RoleDrawer({ open, roleId, onClose }: RoleDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isEdit = roleId !== null;

  const { data: catalog = [] } = usePermissionCatalog();
  const { data: role, isLoading: roleLoading } = useRole(open && isEdit ? roleId : null);
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const [state, setState] = useState<FormState>(EMPTY);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Sincroniza el formulario al abrir / cuando llega el detalle.
  useEffect(() => {
    if (!open) return;
    if (isEdit && role) {
      setState({
        key: role.key,
        name: role.name,
        description: role.description ?? "",
        requireMfa: role.requireMfa,
        permissions: new Set(role.permissionKeys),
      });
    } else if (!isEdit) {
      setState(EMPTY);
    }
    setKeyError(null);
    setNameError(null);
  }, [open, isEdit, role]);

  const busy = createRole.isPending || updateRole.isPending;
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isSystem && (
            <div className={shared.errorBox} style={{ background: "var(--color-info-bg)", color: "var(--color-info)", borderColor: "rgba(6,182,212,0.22)" }}>
              <ShieldCheck size={16} />
              {t("security.roles.systemHint")}
            </div>
          )}

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

          <div>
            <div style={{ fontSize: "var(--text-label-size)", fontWeight: 600, marginBottom: 8, color: "var(--color-text-primary)" }}>
              {t("security.roles.permissions")} ({state.permissions.size})
            </div>
            <PermissionMatrix
              catalog={catalog}
              selected={state.permissions}
              onChange={(next) => setState((s) => ({ ...s, permissions: next }))}
              disabled={busy}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
