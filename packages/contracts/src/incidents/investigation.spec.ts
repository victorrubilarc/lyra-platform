import { describe, expect, it } from "vitest";
import {
  hasRootCause,
  investigationBlocksClose,
  isInvestigationComplete,
  type IncidentInvestigationStatus,
} from "./investigation.js";

const inv = (status: IncidentInvestigationStatus, ...rootFlags: boolean[]) => ({
  status,
  steps: rootFlags.map((isRootCause) => ({ isRootCause })),
});

describe("incident investigation — 5-Porqués helpers", () => {
  it("hasRootCause: true si algún paso es causa raíz", () => {
    expect(hasRootCause([{ isRootCause: false }, { isRootCause: true }])).toBe(true);
    expect(hasRootCause([{ isRootCause: false }])).toBe(false);
    expect(hasRootCause([])).toBe(false);
  });

  describe("isInvestigationComplete", () => {
    it("COMPLETED con causa raíz = completa", () => {
      expect(isInvestigationComplete(inv("COMPLETED", false, true))).toBe(true);
    });
    it("COMPLETED sin causa raíz = NO completa", () => {
      expect(isInvestigationComplete(inv("COMPLETED", false, false))).toBe(false);
    });
    it("DRAFT (aunque tenga causa raíz) = NO completa", () => {
      expect(isInvestigationComplete(inv("DRAFT", true))).toBe(false);
    });
    it("null/undefined = NO completa", () => {
      expect(isInvestigationComplete(null)).toBe(false);
      expect(isInvestigationComplete(undefined)).toBe(false);
    });
  });

  describe("investigationBlocksClose", () => {
    it("tipo NO la exige: nunca bloquea (ni sin investigación)", () => {
      expect(investigationBlocksClose(false, null)).toBe(false);
      expect(investigationBlocksClose(false, inv("DRAFT"))).toBe(false);
    });
    it("tipo la exige + sin investigación o incompleta: bloquea", () => {
      expect(investigationBlocksClose(true, null)).toBe(true);
      expect(investigationBlocksClose(true, inv("DRAFT", true))).toBe(true);
      expect(investigationBlocksClose(true, inv("COMPLETED", false))).toBe(true);
    });
    it("tipo la exige + completa con causa raíz: NO bloquea", () => {
      expect(investigationBlocksClose(true, inv("COMPLETED", true))).toBe(false);
    });
  });
});
