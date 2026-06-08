import { describe, expect, it } from "vitest";
import { auditLogEntrySchema, auditQuerySchema } from "./audit.js";

describe("contrato de auditoría", () => {
  it("acepta una entrada completa con before/after JSON", () => {
    const entry = {
      id: "ckxyz",
      occurredAt: "2026-06-08T12:00:00.000Z",
      actorId: "u1",
      actorEmail: "admin@watchlog.local",
      action: "role.updated",
      entityType: "Role",
      entityId: "r1",
      before: { name: "Operador" },
      after: { name: "Operador de turno" },
      ip: "127.0.0.1",
      userAgent: "vitest",
      metadata: null,
    };
    expect(auditLogEntrySchema.parse(entry)).toMatchObject({ action: "role.updated" });
  });

  it("acepta campos nulos (evento de sistema sin actor)", () => {
    const entry = {
      id: "ck0",
      occurredAt: "2026-06-08T12:00:00.000Z",
      actorId: null,
      actorEmail: null,
      action: "auth.login.success",
      entityType: null,
      entityId: null,
      before: null,
      after: null,
      ip: null,
      userAgent: null,
      metadata: null,
    };
    expect(() => auditLogEntrySchema.parse(entry)).not.toThrow();
  });

  it("valida los límites de paginación", () => {
    expect(auditQuerySchema.parse({ take: 50 }).take).toBe(50);
    expect(() => auditQuerySchema.parse({ take: 0 })).toThrow();
    expect(() => auditQuerySchema.parse({ take: 500 })).toThrow();
  });
});
