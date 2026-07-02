import { describe, expect, it } from "vitest";
import {
  AT_RISK_WINDOW_MINUTES,
  workOrderEscalationThreshold,
  isActivityOverdue,
  isWorkOrderOverdue,
  workOrderDueFromType,
  workOrderShouldEscalate,
  workOrderTrafficLight,
} from "./sla.js";

const T0 = Date.UTC(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00Z

describe("OT · helpers de SLA", () => {
  describe("resolutionDueFromType (ancla = aprobación)", () => {
    it("suma los minutos al ancla", () => {
      const due = workOrderDueFromType(T0, 120);
      expect(due?.getTime()).toBe(T0 + 120 * 60_000);
    });
    it("null si no hay SLA", () => {
      expect(workOrderDueFromType(T0, null)).toBeNull();
      expect(workOrderDueFromType(T0, undefined)).toBeNull();
      expect(workOrderDueFromType(T0, 0)).toBeNull();
      expect(workOrderDueFromType(T0, -5)).toBeNull();
    });
  });

  describe("isResolutionOverdue", () => {
    it("solo vencida si OPEN + dueAt pasado", () => {
      const past = new Date(T0 - 60_000);
      const future = new Date(T0 + 60_000);
      expect(isWorkOrderOverdue(past, "OPEN", T0)).toBe(true);
      expect(isWorkOrderOverdue(future, "OPEN", T0)).toBe(false);
      expect(isWorkOrderOverdue(past, "CLOSED", T0)).toBe(false);
      expect(isWorkOrderOverdue(past, "CANCELED", T0)).toBe(false);
      expect(isWorkOrderOverdue(null, "OPEN", T0)).toBe(false);
    });
  });

  describe("escalationThreshold / shouldEscalate", () => {
    it("umbral = dueAt + escalationAfterMinutes", () => {
      const due = new Date(T0);
      expect(workOrderEscalationThreshold(due, 60)?.getTime()).toBe(T0 + 60 * 60_000);
      expect(workOrderEscalationThreshold(due, null)).toBeNull();
      expect(workOrderEscalationThreshold(null, 60)).toBeNull();
    });
    it("escala al alcanzar el umbral", () => {
      const due = new Date(T0);
      expect(workOrderShouldEscalate(due, 60, T0 + 60 * 60_000)).toBe(true);
      expect(workOrderShouldEscalate(due, 60, T0 + 30 * 60_000)).toBe(false);
      expect(workOrderShouldEscalate(due, null, T0 + 999 * 60_000)).toBe(false);
      expect(workOrderShouldEscalate(null, 60, T0 + 999 * 60_000)).toBe(false);
    });
  });

  describe("workOrderTrafficLight", () => {
    it("cerrada/anulada = none", () => {
      expect(workOrderTrafficLight({ dueAt: new Date(T0 - 1), lifecycle: "CLOSED" }, T0)).toBe("none");
      expect(workOrderTrafficLight({ dueAt: new Date(T0 - 1), lifecycle: "CANCELED" }, T0)).toBe("none");
    });
    it("vencida = red", () => {
      expect(workOrderTrafficLight({ dueAt: new Date(T0 - 60_000), lifecycle: "OPEN" }, T0)).toBe("red");
    });
    it("actividad vencida fuerza red aun sin dueAt", () => {
      expect(workOrderTrafficLight({ dueAt: null, lifecycle: "OPEN", hasOverdueActivity: true }, T0)).toBe("red");
    });
    it("dentro de la ventana = amber", () => {
      const due = new Date(T0 + (AT_RISK_WINDOW_MINUTES - 60) * 60_000);
      expect(workOrderTrafficLight({ dueAt: due, lifecycle: "OPEN" }, T0)).toBe("amber");
    });
    it("lejos del plazo = green", () => {
      const due = new Date(T0 + (AT_RISK_WINDOW_MINUTES + 60) * 60_000);
      expect(workOrderTrafficLight({ dueAt: due, lifecycle: "OPEN" }, T0)).toBe("green");
    });
    it("abierta sin plazo ni actividad vencida = none", () => {
      expect(workOrderTrafficLight({ dueAt: null, lifecycle: "OPEN" }, T0)).toBe("none");
    });
  });

  describe("isActivityOverdue", () => {
    it("prioriza baseline sobre planned", () => {
      expect(isActivityOverdue({ baselineEnd: new Date(T0 - 1), plannedEnd: new Date(T0 + 10 ** 9), status: "IN_PROGRESS" }, T0)).toBe(true);
    });
    it("usa planned si no hay baseline", () => {
      expect(isActivityOverdue({ baselineEnd: null, plannedEnd: new Date(T0 - 1), status: "PENDING" }, T0)).toBe(true);
    });
    it("cerrada/cancelada nunca vencida", () => {
      expect(isActivityOverdue({ baselineEnd: new Date(T0 - 1), status: "DONE" }, T0)).toBe(false);
      expect(isActivityOverdue({ baselineEnd: new Date(T0 - 1), status: "CANCELED" }, T0)).toBe(false);
    });
    it("sin fecha de fin = no vencida", () => {
      expect(isActivityOverdue({ baselineEnd: null, plannedEnd: null, status: "PENDING" }, T0)).toBe(false);
    });
  });
});
