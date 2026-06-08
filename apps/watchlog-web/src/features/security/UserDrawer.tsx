import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, RefreshCw, UserPlus } from "lucide-react";
import { Button, Checkbox, Drawer, FormField, Input, useToast } from "@lyra/ui";
import { emailSchema } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useCreateUser, useRoles } from "./security-queries.js";
import shared from "./security-shared.module.css";

const userFormSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(1),
});
type UserFormValues = z.infer<typeof userFormSchema>;

/** Genera una contraseña temporal robusta (el usuario la cambiará al primer ingreso). */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*?";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(chars, 12)}${pick(symbols, 2)}`;
}

interface UserDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Drawer de alta de usuario. La contraseña es temporal → fuerza cambio al primer login. */
export function UserDrawer({ open, onClose }: UserDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const createUser = useCreateUser();
  const { data: roles = [] } = useRoles();

  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { email: "", displayName: "", password: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ email: "", displayName: "", password: "" });
      setRoleIds(new Set());
      setShowPassword(false);
    }
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await createUser.mutateAsync({
        email: v.email,
        displayName: v.displayName.trim(),
        password: v.password,
        roleIds: [...roleIds],
      });
      toast.success(t("security.users.created"));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  function toggleRole(id: string, checked: boolean) {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <UserPlus size={18} />
          {t("security.users.createTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={createUser.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={createUser.isPending}>
            {t("security.users.create")}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label={t("security.users.email")} error={form.formState.errors.email?.message} required>
          {(field) => (
            <Input
              {...field}
              {...form.register("email")}
              type="email"
              placeholder="operador@empresa.cl"
              invalid={!!form.formState.errors.email}
              autoFocus
            />
          )}
        </FormField>

        <FormField label={t("security.users.displayName")} error={form.formState.errors.displayName?.message} required>
          {(field) => (
            <Input
              {...field}
              {...form.register("displayName")}
              placeholder={t("security.users.displayNamePlaceholder")}
              invalid={!!form.formState.errors.displayName}
            />
          )}
        </FormField>

        <FormField
          label={t("security.users.tempPassword")}
          error={form.formState.errors.password?.message}
          hint={t("security.users.tempPasswordHint")}
          required
        >
          {(field) => (
            <Input
              {...field}
              {...form.register("password")}
              type={showPassword ? "text" : "password"}
              mono
              invalid={!!form.formState.errors.password}
              rightSlot={
                <span style={{ display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    className={shared.iconGhost}
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t("security.users.hidePassword") : t("security.users.showPassword")}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className={shared.iconGhost}
                    onClick={() => {
                      const pwd = generatePassword();
                      form.setValue("password", pwd, { shouldValidate: true });
                      setShowPassword(true);
                    }}
                    aria-label={t("security.users.generate")}
                  >
                    <RefreshCw size={16} />
                  </button>
                </span>
              }
            />
          )}
        </FormField>

        <div>
          <div style={{ fontSize: "var(--text-label-size)", fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary)" }}>
            {t("security.users.roles")}
          </div>
          {roles.length === 0 ? (
            <p className={shared.muted} style={{ fontSize: 13, margin: 0 }}>{t("security.users.noRoles")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {roles.map((r) => (
                <Checkbox
                  key={r.id}
                  checked={roleIds.has(r.id)}
                  onChange={(v) => toggleRole(r.id, v)}
                  label={r.name}
                  aria-label={r.name}
                />
              ))}
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}
