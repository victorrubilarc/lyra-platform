import { describe, expect, it } from "vitest";
import {
  FIELD_VARIABLE_PREFIX,
  allowedVariablesForEvent,
  allowedVariablesForTemplate,
  fieldVariableName,
  isFieldVariable,
} from "./events.js";
import { deepLinkForEntity, pickTemplateForScope } from "./notifications.js";
import { transitionNotifyConfigSchema as wfNotify } from "../workflows/workflows.js";

describe("notificaciones avanzadas — Fase A (contratos)", () => {
  describe("pickTemplateForScope (precedencia bitácora → genérica)", () => {
    const generic = { templateId: null, active: true, tag: "generic" };
    const scoped = { templateId: "tpl-A", active: true, tag: "scoped-A" };
    const scopedInactive = { templateId: "tpl-A", active: false, tag: "scoped-A-off" };

    it("elige la ESPECÍFICA de la bitácora cuando existe (activa)", () => {
      expect(pickTemplateForScope([generic, scoped], "tpl-A")?.tag).toBe("scoped-A");
    });

    it("cae a la GENÉRICA si no hay específica para esa bitácora", () => {
      expect(pickTemplateForScope([generic, scoped], "tpl-B")?.tag).toBe("generic");
    });

    it("ignora la específica INACTIVA y cae a la genérica", () => {
      expect(pickTemplateForScope([generic, scopedInactive], "tpl-A")?.tag).toBe("generic");
    });

    it("sin bitácora (null) usa la genérica", () => {
      expect(pickTemplateForScope([generic, scoped], null)?.tag).toBe("generic");
    });

    it("devuelve null si no hay ninguna aplicable", () => {
      expect(pickTemplateForScope([scoped], "tpl-B")).toBeNull();
      expect(pickTemplateForScope([{ templateId: null, active: false }], null)).toBeNull();
    });
  });

  describe("deepLinkForEntity (campanita in-app, Fase B)", () => {
    it("mapea cada tipo de entidad a su ruta del SPA", () => {
      expect(deepLinkForEntity("LogEntry", "le1")).toBe("/bitacoras/le1");
      expect(deepLinkForEntity("RoundOccurrence", "occ1")).toBe("/mis-rondas");
      expect(deepLinkForEntity("Incident", "inc1")).toBe("/incidencias?incidentId=inc1");
    });

    it("degrada a null sin tipo/id o tipo desconocido", () => {
      expect(deepLinkForEntity(null, "x")).toBeNull();
      expect(deepLinkForEntity("LogEntry", null)).toBeNull();
      expect(deepLinkForEntity("Otra", "x")).toBeNull();
    });
  });

  describe("comodines de campo {{campo.<key>}}", () => {
    it("construye el nombre y lo reconoce", () => {
      expect(fieldVariableName("temp_molino")).toBe("campo.temp_molino");
      expect(FIELD_VARIABLE_PREFIX).toBe("campo.");
      expect(isFieldVariable("campo.temp_molino")).toBe(true);
      expect(isFieldVariable("entry.folio")).toBe(false);
      expect(isFieldVariable("campo.")).toBe(false); // prefijo sin key
    });

    it("allowedVariablesForTemplate suma las del evento + los campos", () => {
      const base = allowedVariablesForEvent("entry.transition");
      const withFields = allowedVariablesForTemplate("entry.transition", ["a", "b"]);
      expect(withFields.has("entry.toState")).toBe(true); // del evento
      expect(withFields.has("campo.a")).toBe(true);
      expect(withFields.has("campo.b")).toBe(true);
      expect(base.has("campo.a")).toBe(false); // no muta el set del evento
    });
  });

  describe("transitionNotifyConfigSchema (config de aviso por transición)", () => {
    const full = {
      enabled: true,
      templateId: null,
      roleIds: ["r1"],
      userIds: [],
      includeAuthor: true,
      includeActor: false,
      includeDestinationRoles: false,
      externalEmails: ["  Contratista@Empresa.CL "],
    };

    it("valida una config COMPLETA y normaliza correos externos (trim + minúsculas)", () => {
      const cfg = wfNotify.parse(full);
      expect(cfg.externalEmails).toEqual(["contratista@empresa.cl"]);
      expect(cfg.includeAuthor).toBe(true);
    });

    it("rechaza una config PARCIAL (todos los campos son requeridos, sin defaults)", () => {
      // Sin defaults: input === output (clave para no romper la re-inferencia en el web).
      expect(wfNotify.safeParse({ enabled: true }).success).toBe(false);
    });

    it("rechaza un correo externo con formato inválido", () => {
      expect(wfNotify.safeParse({ ...full, externalEmails: ["no-es-correo"] }).success).toBe(false);
    });
  });
});
