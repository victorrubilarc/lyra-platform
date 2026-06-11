import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { CalendarRange } from "lucide-react";
import { Button, Drawer, FormField, Input, Select, useToast } from "@lyra/ui";
import { PERIOD_KINDS, type PeriodKind } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { COMMON_TIMEZONES } from "../operational-calendar/timezones.js";
import { useCreateFiscalCalendar } from "./fiscal-calendar-queries.js";

const formSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "La clave es obligatoria")
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. fiscal-mensual)"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  timezone: z.string().trim().min(1),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function FiscalCalendarDrawer({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateFiscalCalendar();

  const [periodKind, setPeriodKind] = useState<PeriodKind>("MONTH");
  const [anchorDay, setAnchorDay] = useState(1);
  const [startWeekday, setStartWeekday] = useState(1);
  const [lengthDays, setLengthDays] = useState(14);
  const [anchorDate, setAnchorDate] = useState("");

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
        periodKind,
        periodAnchorDay: periodKind === "MONTH" ? anchorDay : null,
        periodStartWeekday: periodKind === "WEEK" ? startWeekday : null,
        periodLengthDays: periodKind === "CUSTOM" ? lengthDays : null,
        periodAnchorDate: periodKind === "CUSTOM" ? anchorDate || null : null,
        requirePeriod: false,
      });
      toast.success(t("fiscalCal.created"));
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
          <CalendarRange size={18} />
          {t("fiscalCal.createTitle")}
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
        <FormField label={t("fiscalCal.key")} hint={t("fiscalCal.keyDesc")} error={form.formState.errors.key?.message} required>
          {() => <Input {...form.register("key")} placeholder="fiscal-mensual" mono invalid={!!form.formState.errors.key} autoFocus />}
        </FormField>
        <FormField label={t("fiscalCal.name")} error={form.formState.errors.name?.message} required>
          {() => <Input {...form.register("name")} placeholder={t("fiscalCal.namePlaceholder")} invalid={!!form.formState.errors.name} />}
        </FormField>
        <FormField label={t("fiscalCal.timezone")} hint={t("fiscalCal.timezoneDesc")} required>
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

        <FormField label={t("fiscalCal.periodKind")} required>
          {() => (
            <Select value={periodKind} onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}>
              {PERIOD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`fiscalCal.period.kind.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        {periodKind === "MONTH" && (
          <FormField label={t("fiscalCal.anchorDay")} hint={t("fiscalCal.anchorDayHint")}>
            {() => <Input type="number" min={1} max={28} value={anchorDay} onChange={(e) => setAnchorDay(Number(e.target.value))} />}
          </FormField>
        )}
        {periodKind === "WEEK" && (
          <FormField label={t("fiscalCal.startWeekday")}>
            {() => (
              <Select value={startWeekday} onChange={(e) => setStartWeekday(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {t(`fiscalCal.weekday.${d}`)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        {periodKind === "CUSTOM" && (
          <>
            <FormField label={t("fiscalCal.lengthDays")} hint={t("fiscalCal.lengthDaysHint")}>
              {() => <Input type="number" min={1} max={366} value={lengthDays} onChange={(e) => setLengthDays(Number(e.target.value))} />}
            </FormField>
            <FormField label={t("fiscalCal.anchorDate")}>
              {() => <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />}
            </FormField>
          </>
        )}
      </form>
    </Drawer>
  );
}
