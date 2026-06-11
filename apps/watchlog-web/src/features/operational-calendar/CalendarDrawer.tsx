import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { Button, Drawer, FormField, Input, Select, useToast } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { COMMON_TIMEZONES } from "./timezones.js";
import { useCreateCalendar } from "./operational-calendar-queries.js";

const formSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "La clave es obligatoria")
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. mina-rajo)"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  timezone: z.string().trim().min(1),
});
type FormValues = z.infer<typeof formSchema>;

interface CalendarDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** Drawer para crear un calendario operacional (los turnos se editan en el panel). */
export function CalendarDrawer({ open, onClose, onCreated }: CalendarDrawerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateCalendar();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { key: "", name: "", timezone: "America/Santiago" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync({
        key: values.key,
        name: values.name,
        timezone: values.timezone,
        shifts: [],
      });
      toast.success(t("opsCalendar.created"));
      onCreated(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={500}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarClock size={18} />
          {t("opsCalendar.createTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={create.isPending}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label={t("opsCalendar.key")} hint={t("opsCalendar.keyDesc")} error={form.formState.errors.key?.message} required>
          {() => <Input {...form.register("key")} placeholder="mina-rajo" mono invalid={!!form.formState.errors.key} autoFocus />}
        </FormField>

        <FormField label={t("opsCalendar.name")} error={form.formState.errors.name?.message} required>
          {() => <Input {...form.register("name")} placeholder={t("opsCalendar.namePlaceholder")} invalid={!!form.formState.errors.name} />}
        </FormField>

        <FormField label={t("opsCalendar.timezone")} hint={t("opsCalendar.timezoneDesc")} required>
          {() => (
            <Select {...form.register("timezone")}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </form>
    </Drawer>
  );
}
