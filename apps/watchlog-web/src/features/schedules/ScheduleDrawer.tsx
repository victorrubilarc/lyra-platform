import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Combobox, Drawer, FormField, Input, Select, Toggle, useToast } from "@lyra/ui";
import type {
  CreateLogScheduleRequest,
  LogScheduleDto,
  RecurrenceKind,
  UpdateLogScheduleRequest,
} from "@lyra/contracts";
import { SCHEDULABLE_RECURRENCE_KINDS } from "@lyra/contracts";
import { useAvailableTemplates } from "../log-entries/log-entries-queries.js";
import { fetchTemplateEligibleNodes } from "../log-entries/log-entries-api.js";
import { useCreateSchedule, useUpdateSchedule } from "./schedules-queries.js";

const WEEKDAYS = [
  { v: 1, l: "Lun" },
  { v: 2, l: "Mar" },
  { v: 3, l: "Mié" },
  { v: 4, l: "Jue" },
  { v: 5, l: "Vie" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

const KIND_LABEL: Record<Exclude<RecurrenceKind, "NONE">, string> = {
  SHIFT: "Por turno",
  INTERVAL: "Cada cierto tiempo",
  CALENDAR: "Días y horas fijas",
};

interface Props {
  open: boolean;
  schedule: LogScheduleDto | null; // null = crear
  onClose: () => void;
}

/** Crea o edita un horario de ronda (plantilla + nodo + recurrencia). */
export function ScheduleDrawer({ open, schedule, onClose }: Props) {
  const editing = !!schedule;
  const toast = useToast();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const templates = useAvailableTemplates();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [orgNodeId, setOrgNodeId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [kind, setKind] = useState<Exclude<RecurrenceKind, "NONE">>("SHIFT");
  const [shiftCodes, setShiftCodes] = useState("");
  const [everyMinutes, setEveryMinutes] = useState(360);
  const [anchorTime, setAnchorTime] = useState("");
  const [times, setTimes] = useState("08:00");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dueWindowMinutes, setDueWindowMinutes] = useState(720);
  const [horizonDays, setHorizonDays] = useState(2);
  const [active, setActive] = useState(true);

  // Nodos elegibles de la plantilla (asignaciones ∩ alcance). Equipo solo si el nodo tiene.
  const eligible = useQuery({
    queryKey: ["schedule-eligible", templateId],
    queryFn: () => fetchTemplateEligibleNodes(templateId!),
    enabled: !!templateId,
  });
  const node = eligible.data?.nodes.find((n) => n.id === orgNodeId);

  useEffect(() => {
    if (!open) return;
    if (schedule) {
      const c = (schedule.recurrenceConfig ?? {}) as Record<string, unknown>;
      setName(schedule.name ?? "");
      setTemplateId(schedule.templateId);
      setOrgNodeId(schedule.orgNodeId);
      setEquipmentId(schedule.equipmentId);
      setKind((schedule.recurrenceKind === "NONE" ? "SHIFT" : schedule.recurrenceKind) as Exclude<RecurrenceKind, "NONE">);
      setShiftCodes(Array.isArray(c.shiftCodes) ? (c.shiftCodes as string[]).join(", ") : "");
      setEveryMinutes(typeof c.everyMinutes === "number" ? c.everyMinutes : 360);
      setAnchorTime(typeof c.anchorTime === "string" ? c.anchorTime : "");
      setTimes(Array.isArray(c.times) ? (c.times as string[]).join(", ") : "08:00");
      setWeekdays(Array.isArray(c.weekdays) ? (c.weekdays as number[]) : []);
      setDueWindowMinutes(schedule.dueWindowMinutes);
      setHorizonDays(schedule.horizonDays);
      setActive(schedule.active);
    } else {
      setName(""); setTemplateId(null); setOrgNodeId(null); setEquipmentId(null);
      setKind("SHIFT"); setShiftCodes(""); setEveryMinutes(360); setAnchorTime("");
      setTimes("08:00"); setWeekdays([]); setDueWindowMinutes(720); setHorizonDays(2); setActive(true);
    }
  }, [open, schedule]);

  const recurrenceConfig = useMemo((): Record<string, unknown> => {
    if (kind === "SHIFT") {
      const codes = shiftCodes.split(",").map((s) => s.trim()).filter(Boolean);
      return codes.length > 0 ? { shiftCodes: codes } : {};
    }
    if (kind === "INTERVAL") {
      return { everyMinutes, ...(anchorTime ? { anchorTime } : {}) };
    }
    return {
      times: times.split(",").map((s) => s.trim()).filter(Boolean),
      ...(weekdays.length > 0 ? { weekdays: [...weekdays].sort((a, b) => a - b) } : {}),
    };
  }, [kind, shiftCodes, everyMinutes, anchorTime, times, weekdays]);

  const valid = templateId && orgNodeId && dueWindowMinutes >= 5 &&
    (kind !== "INTERVAL" || everyMinutes >= 5) &&
    (kind !== "CALENDAR" || times.split(",").some((s) => s.trim()));

  async function submit() {
    try {
      if (editing && schedule) {
        const dto: UpdateLogScheduleRequest = {
          name: name.trim() || null,
          equipmentId,
          recurrenceKind: kind,
          recurrenceConfig,
          dueWindowMinutes,
          horizonDays,
          active,
        };
        await update.mutateAsync({ id: schedule.id, dto });
        toast.success("Horario actualizado");
      } else {
        const dto: CreateLogScheduleRequest = {
          name: name.trim() || null,
          templateId: templateId!,
          orgNodeId: orgNodeId!,
          equipmentId,
          recurrenceKind: kind,
          recurrenceConfig,
          dueWindowMinutes,
          horizonDays,
          active,
        };
        await create.mutateAsync(dto);
        toast.success("Horario creado");
      }
      onClose();
    } catch (e) {
      toast.error(`No se pudo guardar: ${(e as Error).message}`);
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Editar horario de ronda" : "Nuevo horario de ronda"}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <FormField label="Nombre (opcional)">
          {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ronda de inspección…" />}
        </FormField>

        <FormField label="Plantilla" required>
          {() => (
            <Combobox
              options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
              value={templateId}
              onChange={(v) => { setTemplateId(v); setOrgNodeId(null); setEquipmentId(null); }}
              placeholder="Elegir plantilla…"
              disabled={editing}
            />
          )}
        </FormField>

        <FormField label="Nodo de la estructura" required>
          {() => (
            <Combobox
              options={(eligible.data?.nodes ?? []).map((n) => ({ value: n.id, label: n.path || n.name }))}
              value={orgNodeId}
              onChange={(v) => { setOrgNodeId(v); setEquipmentId(null); }}
              placeholder={templateId ? "Elegir nodo…" : "Elija una plantilla primero"}
              disabled={editing || !templateId}
            />
          )}
        </FormField>

        {node && node.equipment.length > 0 && (
          <FormField label="Equipo (opcional)">
            {() => (
              <Combobox
                options={node.equipment.map((eq) => ({ value: eq.id, label: eq.tag ? `${eq.tag} · ${eq.name}` : eq.name }))}
                value={equipmentId}
                onChange={setEquipmentId}
                placeholder="Sin equipo"
              />
            )}
          </FormField>
        )}

        <FormField label="Recurrencia" required>
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Exclude<RecurrenceKind, "NONE">)}>
              {SCHEDULABLE_RECURRENCE_KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k as Exclude<RecurrenceKind, "NONE">]}</option>
              ))}
            </Select>
          )}
        </FormField>

        {kind === "SHIFT" && (
          <FormField label="Turnos (opcional, separados por coma)" hint="Vacío = todos los turnos del calendario del nodo (ej. A, B).">
            {({ id }) => <Input id={id} value={shiftCodes} onChange={(e) => setShiftCodes(e.target.value)} placeholder="A, B" />}
          </FormField>
        )}

        {kind === "INTERVAL" && (
          <>
            <FormField label="Cada (minutos)" required>
              {({ id }) => <Input id={id} type="number" min={5} value={everyMinutes} onChange={(e) => setEveryMinutes(Number(e.target.value))} />}
            </FormField>
            <FormField label="Hora de anclaje (opcional, HH:MM)" hint="Define la fase del intervalo. Vacío = 00:00.">
              {({ id }) => <Input id={id} value={anchorTime} onChange={(e) => setAnchorTime(e.target.value)} placeholder="00:00" />}
            </FormField>
          </>
        )}

        {kind === "CALENDAR" && (
          <>
            <FormField label="Horas (separadas por coma)" required>
              {({ id }) => <Input id={id} value={times} onChange={(e) => setTimes(e.target.value)} placeholder="08:00, 20:00" />}
            </FormField>
            <FormField label="Días de la semana (vacío = todos)">
              {() => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAYS.map((d) => (
                    <Button
                      key={d.v}
                      type="button"
                      variant={weekdays.includes(d.v) ? "primary" : "secondary"}
                      onClick={() => setWeekdays((w) => (w.includes(d.v) ? w.filter((x) => x !== d.v) : [...w, d.v]))}
                    >
                      {d.l}
                    </Button>
                  ))}
                </div>
              )}
            </FormField>
          </>
        )}

        <FormField label="Plazo para cumplir (minutos)" required hint="Tras la hora programada, la ronda vence si no se completa.">
          {({ id }) => <Input id={id} type="number" min={5} value={dueWindowMinutes} onChange={(e) => setDueWindowMinutes(Number(e.target.value))} />}
        </FormField>

        <FormField label="Horizonte de generación (días)" hint="Cuántos días hacia adelante se materializan las rondas.">
          {({ id }) => <Input id={id} type="number" min={1} max={31} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))} />}
        </FormField>

        <FormField label="Activo">
          {() => <Toggle checked={active} onChange={setActive} />}
        </FormField>
      </div>
    </Drawer>
  );
}
