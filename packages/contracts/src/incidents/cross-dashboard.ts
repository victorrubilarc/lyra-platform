import { z } from "zod";

/**
 * Vista ejecutiva CROSS-ESTRUCTURA (L3 — UX premium, 2026-06-24). Consolida KPIs de
 * incidencias de TODAS las estructuras accesibles del usuario a la vez (no solo la
 * activa) para un rol gerencial. Es la EXCEPCIÓN EXPLÍCITA al aislamiento por
 * estructura activa (L1): cruza la estructura, pero NO la frontera de datos, que
 * sigue siendo el ABAC por nodo (un gerente sin alcance ve todas; uno acotado, solo
 * sus nodos → solo aparecen las estructuras donde tiene nodos accesibles).
 *
 * Primer corte ACOTADO a INCIDENCIAS (reusa el mismo cálculo del dashboard 4.5). El
 * panorama multi-módulo (bitácoras/rondas/turnos) queda como deuda.
 */

/** KPIs vivos de incidencias por estructura (estado actual, no acotado a un rango). */
export const crossStructureKpisSchema = z.object({
  /** Incidencias abiertas (lifecycle OPEN). */
  open: z.number().int(),
  /** Abiertas con severidad máxima (S5). */
  critical: z.number().int(),
  /** Abiertas con plazo (`dueAt`) vencido. */
  overdue: z.number().int(),
  /** Abiertas que excedieron su permanencia máxima por estado (SLA de permanencia). */
  slaBreached: z.number().int(),
});
export type CrossStructureKpis = z.infer<typeof crossStructureKpisSchema>;

/** Tarjeta por estructura: identidad (para color/ícono en el front) + KPIs + alcance. */
export const crossStructureCardSchema = z.object({
  structureId: z.string(),
  key: z.string(),
  name: z.string(),
  /** Identidad visual cruda; el front la resuelve a token/ícono (con fallback por key). */
  color: z.string().nullable(),
  icon: z.string().nullable(),
  /** Nº de nodos de la estructura DENTRO del alcance del usuario (frontera ABAC). */
  accessibleNodeCount: z.number().int(),
  kpis: crossStructureKpisSchema,
});
export type CrossStructureCard = z.infer<typeof crossStructureCardSchema>;

export const crossDashboardSchema = z.object({
  /** Tarjetas por estructura accesible, ordenadas como el selector (default primero). */
  cards: z.array(crossStructureCardSchema),
  /** Totales consolidados (suma de las tarjetas visibles). */
  totals: crossStructureKpisSchema,
});
export type CrossDashboard = z.infer<typeof crossDashboardSchema>;

/** Suma KPIs de varias tarjetas en un total consolidado (helper puro, reusable cliente/servidor). */
export function sumCrossKpis(cards: readonly CrossStructureCard[]): CrossStructureKpis {
  return cards.reduce<CrossStructureKpis>(
    (acc, c) => ({
      open: acc.open + c.kpis.open,
      critical: acc.critical + c.kpis.critical,
      overdue: acc.overdue + c.kpis.overdue,
      slaBreached: acc.slaBreached + c.kpis.slaBreached,
    }),
    { open: 0, critical: 0, overdue: 0, slaBreached: 0 },
  );
}
