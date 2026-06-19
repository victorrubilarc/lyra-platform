import {
  AlertOctagon,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  ListTodo,
  Route,
  type LucideIcon,
} from "lucide-react";
import type { ChipVariant } from "@lyra/ui";
import type { HandoverGeneralStatus, HandoverSectionKey, ShiftHandoverStatus } from "@lyra/contracts";

/** Meta de presentación del estado del ciclo (chip del cockpit / historial). */
export const HANDOVER_STATUS_META: Record<ShiftHandoverStatus, { labelKey: string; variant: ChipVariant }> = {
  COMPILING: { labelKey: "handover.status.compiling", variant: "warning" },
  SIGNED_OUT: { labelKey: "handover.status.signedOut", variant: "info" },
  ACKNOWLEDGED: { labelKey: "handover.status.acknowledged", variant: "success" },
  CANCELED: { labelKey: "handover.status.canceled", variant: "default" },
};

/** Secciones del cockpit (nav izquierda) con su ícono. El orden lo fija el contrato. */
export const SECTION_ICON: Record<HandoverSectionKey, LucideIcon> = {
  ENTRIES: ClipboardList,
  EXCEPTIONS: AlertOctagon,
  INCIDENTS: AlertTriangle,
  FOLLOWUP: ClipboardCheck,
  ROUNDS: Route,
  PENDING: ListTodo,
};

export const SECTION_LABEL_KEY: Record<HandoverSectionKey, string> = {
  ENTRIES: "handover.sections.entries",
  EXCEPTIONS: "handover.sections.exceptions",
  INCIDENTS: "handover.sections.incidents",
  FOLLOWUP: "handover.sections.followup",
  ROUNDS: "handover.sections.rounds",
  PENDING: "handover.sections.pending",
};

export const GENERAL_STATUS_OPTIONS: { value: HandoverGeneralStatus; labelKey: string }[] = [
  { value: "OPERATIONAL", labelKey: "handover.general.operational" },
  { value: "OPERATIONAL_WITH_OBSERVATIONS", labelKey: "handover.general.operationalObs" },
  { value: "STOPPED_MAINTENANCE", labelKey: "handover.general.stoppedMaint" },
  { value: "STOPPED_FAILURE", labelKey: "handover.general.stoppedFailure" },
];
