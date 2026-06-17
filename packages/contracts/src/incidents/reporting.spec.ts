import { describe, expect, it } from "vitest";
import {
  applicableObligationsFor,
  incidentReportCode,
  isReportOverdue,
  reportsBlockingClose,
  type IncidentReportStatus,
} from "./reporting.js";

const ob = (
  id: string,
  opts: { appliesToTypeIds?: string[]; minSeverity?: number | null; active?: boolean } = {},
) => ({
  id,
  appliesToTypeIds: opts.appliesToTypeIds ?? [],
  minSeverity: opts.minSeverity ?? null,
  active: opts.active ?? true,
});

const rep = (mandatory: boolean, status: IncidentReportStatus) => ({ mandatory, status });

describe("incident reporting — helpers (Fase 4.3)", () => {
  it("incidentReportCode: folio REP-#### con padding", () => {
    expect(incidentReportCode(1)).toBe("REP-0001");
    expect(incidentReportCode(1234)).toBe("REP-1234");
    expect(incidentReportCode(99999)).toBe("REP-99999");
  });

  describe("applicableObligationsFor", () => {
    const obligations = [
      ob("all"), // todos los tipos, cualquier severidad
      ob("falla-only", { appliesToTypeIds: ["falla-equipo"] }),
      ob("sev4", { minSeverity: 4 }),
      ob("inactiva", { active: false }),
    ];

    it("incluye la transversal (sin tipos) para cualquier incidencia", () => {
      const r = applicableObligationsFor({ typeId: "x", severity: 1 }, obligations);
      expect(r.map((o) => o.id)).toContain("all");
    });
    it("filtra por tipo cuando appliesToTypeIds no está vacío", () => {
      const r = applicableObligationsFor({ typeId: "falla-equipo", severity: 1 }, obligations);
      expect(r.map((o) => o.id)).toEqual(expect.arrayContaining(["all", "falla-only"]));
      const r2 = applicableObligationsFor({ typeId: "otro", severity: 1 }, obligations);
      expect(r2.map((o) => o.id)).not.toContain("falla-only");
    });
    it("respeta la severidad mínima", () => {
      expect(applicableObligationsFor({ typeId: "x", severity: 3 }, obligations).map((o) => o.id)).not.toContain("sev4");
      expect(applicableObligationsFor({ typeId: "x", severity: 4 }, obligations).map((o) => o.id)).toContain("sev4");
      expect(applicableObligationsFor({ typeId: "x", severity: 5 }, obligations).map((o) => o.id)).toContain("sev4");
    });
    it("nunca incluye obligaciones inactivas", () => {
      expect(applicableObligationsFor({ typeId: "x", severity: 5 }, obligations).map((o) => o.id)).not.toContain("inactiva");
    });
  });

  describe("isReportOverdue", () => {
    const now = new Date("2026-06-17T12:00:00.000Z").getTime();
    it("PENDING con plazo pasado = vencido", () => {
      expect(isReportOverdue({ status: "PENDING", dueAt: "2026-06-17T11:00:00.000Z" }, now)).toBe(true);
    });
    it("PENDING con plazo futuro = no vencido", () => {
      expect(isReportOverdue({ status: "PENDING", dueAt: "2026-06-17T13:00:00.000Z" }, now)).toBe(false);
    });
    it("PENDING sin plazo = no vencido", () => {
      expect(isReportOverdue({ status: "PENDING", dueAt: null }, now)).toBe(false);
    });
    it("SUBMITTED/NOT_APPLICABLE/CANCELED nunca vencen aunque el plazo haya pasado", () => {
      expect(isReportOverdue({ status: "SUBMITTED", dueAt: "2026-06-17T11:00:00.000Z" }, now)).toBe(false);
      expect(isReportOverdue({ status: "NOT_APPLICABLE", dueAt: "2026-06-17T11:00:00.000Z" }, now)).toBe(false);
      expect(isReportOverdue({ status: "CANCELED", dueAt: "2026-06-17T11:00:00.000Z" }, now)).toBe(false);
    });
    it("acepta Date además de string ISO", () => {
      expect(isReportOverdue({ status: "PENDING", dueAt: new Date("2026-06-17T11:00:00.000Z") }, now)).toBe(true);
    });
  });

  describe("reportsBlockingClose", () => {
    it("solo bloquean los obligatorios aún PENDIENTES", () => {
      const reports = [
        rep(true, "PENDING"), // bloquea
        rep(true, "SUBMITTED"), // resuelto
        rep(true, "NOT_APPLICABLE"), // descartado
        rep(true, "CANCELED"), // anulado
        rep(false, "PENDING"), // no obligatorio: solo alerta
      ];
      const blocking = reportsBlockingClose(reports);
      expect(blocking).toHaveLength(1);
      expect(blocking[0]).toEqual(rep(true, "PENDING"));
    });
    it("sin reportes obligatorios pendientes = no bloquea", () => {
      expect(reportsBlockingClose([rep(false, "PENDING"), rep(true, "SUBMITTED")])).toHaveLength(0);
      expect(reportsBlockingClose([])).toHaveLength(0);
    });
  });
});
