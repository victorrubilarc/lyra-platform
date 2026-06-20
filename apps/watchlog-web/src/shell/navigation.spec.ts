import { describe, expect, it } from "vitest";
import { buildNavGroups, NAV_GROUPS, ROUTES, SIDEBAR_ROUTES } from "./navigation.js";

/**
 * Guarda contra una regresión real (2026-06-20): la ruta `/flujos` quedó SIN `group`
 * tras el refactor del menú a grupos colapsables, así que `buildNavGroups` la dejaba
 * fuera del sidebar — desaparecía para TODOS los usuarios, aunque tuvieran el permiso.
 * Una ruta de sidebar sin grupo es un fallo silencioso; estos tests lo vuelven ruidoso.
 */
describe("navegación del sidebar — integridad de grupos", () => {
  it("toda ruta inSidebar tiene un group válido (si no, buildNavGroups la descarta)", () => {
    const groupIds = new Set(NAV_GROUPS.map((g) => g.id));
    const huerfanas = SIDEBAR_ROUTES.filter((r) => !r.group || !groupIds.has(r.group));
    expect(huerfanas.map((r) => r.path)).toEqual([]);
  });

  it("buildNavGroups NO pierde ninguna ruta visible del sidebar", () => {
    const visibles = SIDEBAR_ROUTES; // sin filtro de permiso = todas las de sidebar
    const enGrupos = buildNavGroups(visibles).flatMap((g) => g.routes);
    expect(enGrupos.length).toBe(visibles.length);
  });

  it("el módulo de Flujos está en el sidebar (regresión 2026-06-20)", () => {
    const flujos = ROUTES.find((r) => r.path === "/flujos");
    expect(flujos?.inSidebar).toBe(true);
    expect(flujos?.group).toBe("design");
  });
});
