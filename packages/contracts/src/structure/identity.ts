import { z } from "zod";

/**
 * Identidad visual por estructura (L3 — UX premium cross-estructura, 2026-06-24).
 *
 * Cada estructura puede tener un ACENTO de color y un ÍCONO propios para que el
 * contexto sea inconfundible (badge "Estás en: X", switcher, vista ejecutiva) y
 * nadie registre datos en la estructura equivocada. Dos reglas de marca Lyra:
 *
 *  1. El color NO es hex libre: es una CLAVE de una paleta curada y coherente con
 *     la identidad (índigo/cian de marca + hermanos). El front la mapea a TOKENS
 *     (claro/oscuro), nunca a valores en duro. Así un administrador no puede elegir
 *     un color que rompa el contraste o la marca.
 *  2. El ícono es de una LISTA BLANCA de Lucide (la librería estándar del ecosistema).
 *
 * Ambos son OPCIONALES en la BD: cuando faltan, se DERIVAN determinísticamente de la
 * `key` (mismo color/ícono estable entre sesiones y recargas, sin migrar datos).
 */

/** Paleta curada de acentos (claves estables; el front las resuelve a tokens). */
export const STRUCTURE_ACCENTS = [
  "indigo",
  "cyan",
  "violet",
  "emerald",
  "amber",
  "rose",
  "teal",
  "slate",
] as const;
export type StructureAccent = (typeof STRUCTURE_ACCENTS)[number];

/** Acento por defecto (marca primaria) cuando no hay `key` para derivar. */
export const DEFAULT_STRUCTURE_ACCENT: StructureAccent = "indigo";

/** Lista blanca de íconos Lucide admitidos para identificar una estructura. */
export const STRUCTURE_ICONS = [
  "building-2",
  "factory",
  "cpu",
  "network",
  "truck",
  "wrench",
  "flask-conical",
  "zap",
  "mountain",
  "ship",
  "plane",
  "warehouse",
  "hard-hat",
  "radio-tower",
  "server",
  "map-pin",
] as const;
export type StructureIcon = (typeof STRUCTURE_ICONS)[number];

/** Ícono por defecto (genérico de "organización"). */
export const DEFAULT_STRUCTURE_ICON: StructureIcon = "building-2";

export const structureAccentSchema = z.enum(STRUCTURE_ACCENTS);
export const structureIconSchema = z.enum(STRUCTURE_ICONS);

/**
 * Hash determinístico y estable (FNV-1a de 32 bits) de la `key`. Estable entre
 * procesos y sesiones (a diferencia de un hash dependiente del runtime), para que
 * el color/ícono derivado de una estructura NO cambie de una recarga a otra.
 */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ¿La cadena es un acento válido de la paleta? */
export function isStructureAccent(value: string | null | undefined): value is StructureAccent {
  return !!value && (STRUCTURE_ACCENTS as readonly string[]).includes(value);
}

/** ¿La cadena es un ícono válido de la lista blanca? */
export function isStructureIcon(value: string | null | undefined): value is StructureIcon {
  return !!value && (STRUCTURE_ICONS as readonly string[]).includes(value);
}

/**
 * Acento EFECTIVO de una estructura: el configurado (si es válido) o, en su defecto,
 * uno DERIVADO determinísticamente de la `key`. Nunca devuelve algo fuera de la paleta.
 */
export function resolveStructureAccent(s: { key: string; color?: string | null }): StructureAccent {
  if (isStructureAccent(s.color)) return s.color;
  return STRUCTURE_ACCENTS[fnv1a(s.key) % STRUCTURE_ACCENTS.length] ?? DEFAULT_STRUCTURE_ACCENT;
}

/** Ícono EFECTIVO de una estructura: el configurado (si es válido) o el por defecto. */
export function resolveStructureIcon(s: { icon?: string | null }): StructureIcon {
  return isStructureIcon(s.icon) ? s.icon : DEFAULT_STRUCTURE_ICON;
}
