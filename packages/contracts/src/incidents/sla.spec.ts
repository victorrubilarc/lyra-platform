import { describe, expect, it } from "vitest";
import {
  escalationThreshold,
  isResolutionOverdue,
  resolutionDueFromType,
  shouldEscalate,
} from "./incidents.js";
import { isNotificationEventKey, notificationEventDef } from "../notifications/events.js";

const T0 = Date.UTC(2026, 5, 17, 12, 0, 0); // 2026-06-17 12:00 UTC

describe("incidencias 4.4 — SLA light (helpers puros)", () => {
  describe("resolutionDueFromType", () => {
    it("suma los minutos del tipo a la creación", () => {
      const due = resolutionDueFromType(T0, 120);
      expect(due?.getTime()).toBe(T0 + 120 * 60_000);
    });
    it("null/0/negativo ⇒ sin plazo automático", () => {
      expect(resolutionDueFromType(T0, null)).toBeNull();
      expect(resolutionDueFromType(T0, undefined)).toBeNull();
      expect(resolutionDueFromType(T0, 0)).toBeNull();
      expect(resolutionDueFromType(T0, -5)).toBeNull();
    });
  });

  describe("isResolutionOverdue", () => {
    it("vencida solo si OPEN y dueAt en el pasado", () => {
      const past = new Date(T0 - 1000);
      const future = new Date(T0 + 1000);
      expect(isResolutionOverdue(past, "OPEN", T0)).toBe(true);
      expect(isResolutionOverdue(future, "OPEN", T0)).toBe(false);
      expect(isResolutionOverdue(past, "CLOSED", T0)).toBe(false);
      expect(isResolutionOverdue(past, "CANCELED", T0)).toBe(false);
      expect(isResolutionOverdue(null, "OPEN", T0)).toBe(false);
    });
  });

  describe("escalationThreshold / shouldEscalate", () => {
    it("umbral = dueAt + escalationAfterMinutes", () => {
      const due = new Date(T0);
      expect(escalationThreshold(due, 60)?.getTime()).toBe(T0 + 60 * 60_000);
    });
    it("sin dueAt o sin minutos ⇒ null (sin escalamiento)", () => {
      expect(escalationThreshold(null, 60)).toBeNull();
      expect(escalationThreshold(new Date(T0), null)).toBeNull();
      expect(escalationThreshold(new Date(T0), 0)).toBeNull();
    });
    it("shouldEscalate respeta el umbral", () => {
      const due = new Date(T0);
      expect(shouldEscalate(due, 60, T0 + 60 * 60_000)).toBe(true); // justo al umbral
      expect(shouldEscalate(due, 60, T0 + 30 * 60_000)).toBe(false); // antes
      expect(shouldEscalate(due, null, T0 + 999 * 60_000)).toBe(false); // sin config
      expect(shouldEscalate(null, 60, T0 + 999 * 60_000)).toBe(false); // sin dueAt
    });
  });
});

describe("incidencias 4.4 — eventos del catálogo de notificaciones", () => {
  const keys = ["incident.sla.breached", "incident.overdue", "incident.action.overdue", "incident.report.due"];
  it("las 4 claves existen y son del grupo incidents (derived)", () => {
    for (const k of keys) {
      expect(isNotificationEventKey(k)).toBe(true);
      const def = notificationEventDef(k);
      expect(def?.group).toBe("incidents");
      expect(def?.origin).toBe("derived");
    }
  });
  it("incident.overdue expone dueAt/overdueBy; action y report sus propios campos", () => {
    const overdue = notificationEventDef("incident.overdue");
    const names = overdue?.variables.map((v) => v.name) ?? [];
    expect(names).toContain("incident.dueAt");
    expect(names).toContain("incident.overdueBy");
    expect(names).toContain("incident.folio");
    const action = notificationEventDef("incident.action.overdue")?.variables.map((v) => v.name) ?? [];
    expect(action).toContain("action.code");
    const report = notificationEventDef("incident.report.due")?.variables.map((v) => v.name) ?? [];
    expect(report).toContain("report.authority");
  });
});
