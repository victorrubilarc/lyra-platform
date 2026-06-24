import {
  Building2,
  Cpu,
  Factory,
  FlaskConical,
  HardHat,
  MapPin,
  Mountain,
  Network,
  Plane,
  RadioTower,
  Server,
  Ship,
  Truck,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  STRUCTURE_ACCENTS,
  STRUCTURE_ICONS,
  resolveStructureAccent,
  resolveStructureIcon,
  type StructureAccent,
  type StructureIcon,
} from "@lyra/contracts";

/**
 * Identidad visual por estructura en el FRONT (L3). Reusa los resolvers del contrato
 * (acento/ícono efectivos con fallback determinístico por `key`) y añade el mapeo del
 * nombre de ícono Lucide → componente React. El color se aplica vía `data-accent` +
 * tokens (`var(--structure-accent)`), nunca con hex en duro (ver tokens/index.css).
 */

/** Forma mínima de una estructura para derivar su identidad. */
export interface StructureIdentityInput {
  key: string;
  color?: string | null;
  icon?: string | null;
}

/** Mapa nombre-de-lista-blanca → componente Lucide. Cubre toda `STRUCTURE_ICONS`. */
export const STRUCTURE_ICON_COMPONENTS: Record<StructureIcon, LucideIcon> = {
  "building-2": Building2,
  factory: Factory,
  cpu: Cpu,
  network: Network,
  truck: Truck,
  wrench: Wrench,
  "flask-conical": FlaskConical,
  zap: Zap,
  mountain: Mountain,
  ship: Ship,
  plane: Plane,
  warehouse: Warehouse,
  "hard-hat": HardHat,
  "radio-tower": RadioTower,
  server: Server,
  "map-pin": MapPin,
};

/** Acento EFECTIVO (clave de paleta) de una estructura — para `data-accent`. */
export function accentOf(s: StructureIdentityInput): StructureAccent {
  return resolveStructureAccent(s);
}

/** Componente de ícono EFECTIVO de una estructura. */
export function iconComponentOf(s: StructureIdentityInput): LucideIcon {
  return STRUCTURE_ICON_COMPONENTS[resolveStructureIcon(s)];
}

/** Opciones de acento e ícono para los selectores del editor de identidad. */
export const ACCENT_OPTIONS: readonly StructureAccent[] = STRUCTURE_ACCENTS;
export const ICON_OPTIONS: readonly StructureIcon[] = STRUCTURE_ICONS;

/**
 * Var CSS nombrada del acento (ej. `var(--accent-indigo)`), para contextos donde no se
 * puede usar `data-accent` + `var(--structure-accent)` por elemento: SVG/Recharts `fill`.
 * La hue vive en los tokens (no hay hex en el componente).
 */
export function accentCssVar(s: StructureIdentityInput): string {
  return `var(--accent-${resolveStructureAccent(s)})`;
}
