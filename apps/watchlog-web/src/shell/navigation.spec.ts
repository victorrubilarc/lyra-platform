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

/**
 * Inicio enterprise (feat/inicio-enterprise): la sección «Operación» y sus
 * descripciones derivan del MISMO registro que el sidebar, así el Inicio nunca se
 * desincroniza de los módulos reales.
 */
describe("Inicio — accesos derivados del registro", () => {
  it("toda ruta de módulo del sidebar (salvo la Home) tiene descripción (descKey)", () => {
    // El Inicio muestra la descripción de cada acceso; sin descKey la tarjeta
    // quedaría muda. Este test vuelve ruidoso el olvido al añadir un módulo.
    const conModulo = SIDEBAR_ROUTES.filter((r) => r.path !== "/");
    const sinDesc = conModulo.filter((r) => !r.descKey);
    expect(sinDesc.map((r) => r.path)).toEqual([]);
  });

  it("el grupo operativo del registro define los accesos del Inicio (existe y no incluye la Home)", () => {
    const operativos = SIDEBAR_ROUTES.filter((r) => r.group === "operation" && r.path !== "/");
    expect(operativos.length).toBeGreaterThan(0);
    expect(operativos.some((r) => r.path === "/")).toBe(false);
  });
});
