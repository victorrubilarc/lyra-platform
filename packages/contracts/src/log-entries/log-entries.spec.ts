import { describe, expect, it } from "vitest";
import {
  availableTransitionsFor,
  canonicalSignaturePayload,
  canonicalSignatureValues,
  createLogEntryRequestSchema,
  executeTransitionRequestSchema,
  formatEntryFolio,
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  logEntryListQuerySchema,
  logEntrySectionStateDtoSchema,
  logEntryTimelineEventSchema,
  resolveEffectiveAt,
  saveLogEntrySectionRequestSchema,
  thresholdBandFor,
  validateFieldValue,
  type FieldForValidation,
  type TransitionForAvailability,
} from "./log-entries.js";

const numberField = (config: Record<string, unknown> = {}): FieldForValidation => ({
  key: "temp",
  type: "NUMBER",
  dataType: "NUMBER",
  label: "Temperatura",
  config,
});

describe("log-entries — requests", () => {
  it("acepta crear con templateId y rechaza sin él", () => {
    expect(createLogEntryRequestSchema.safeParse({ templateId: "t1" }).success).toBe(true);
    expect(createLogEntryRequestSchema.safeParse({}).success).toBe(false);
  });

  it("saveSection exige expectedVersion >= 0", () => {
    expect(
      saveLogEntrySectionRequestSchema.safeParse({ expectedVersion: 0, values: [] }).success,
    ).toBe(true);
    expect(
      saveLogEntrySectionRequestSchema.safeParse({ expectedVersion: -1, values: [] }).success,
    ).toBe(false);
  });
});

describe("logEntrySectionStateDto — motivo de bloqueo (#4)", () => {
  const base = {
    sectionKey: "s1",
    state: "PENDING",
    filledById: null,
    filledByName: null,
    filledAt: null,
    version: 0,
    signature: null,
    assignedRoleNames: [],
    readOnlyFieldKeys: [],
  };

  it("editable sin motivo, y bloqueada con motivo del enum", () => {
    expect(
      logEntrySectionStateDtoSchema.safeParse({ ...base, editable: true, blockedReason: null }).success,
    ).toBe(true);
    expect(
      logEntrySectionStateDtoSchema.safeParse({
        ...base,
        editable: false,
        blockedReason: "MISSING_ROLE",
        assignedRoleNames: ["Supervisor"],
      }).success,
    ).toBe(true);
  });

  it("rechaza un motivo fuera del enum", () => {
    expect(
      logEntrySectionStateDtoSchema.safeParse({ ...base, editable: false, blockedReason: "OTRA_COSA" }).success,
    ).toBe(false);
  });
});

describe("isEmptyValue", () => {
  it("trata null/vacío/[] como vacío y 0/false como NO vacío", () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(["a"])).toBe(false);
  });
});

describe("validateFieldValue — NUMBER", () => {
  it("vacío es válido (lo obligatorio lo decide el llamador)", () => {
    expect(validateFieldValue(numberField(), null).errors).toHaveLength(0);
  });

  it("rechaza fuera de min/max y no-número", () => {
    expect(validateFieldValue(numberField({ min: 0, max: 100 }), 150).errors).toHaveLength(1);
    expect(validateFieldValue(numberField({ min: 0 }), -5).errors).toHaveLength(1);
    expect(validateFieldValue(numberField(), "abc").errors).toHaveLength(1);
  });

  it("bandas de umbral son ADVERTENCIA, no error", () => {
    const r = validateFieldValue(numberField({ max: 100, warnHigh: 80, critHigh: 95 }), 97);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("valida decimales", () => {
    expect(validateFieldValue(numberField({ decimals: 1 }), 3.14).errors).toHaveLength(1);
    expect(validateFieldValue(numberField({ decimals: 2 }), 3.14).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — SELECT/MULTISELECT contra catálogo", () => {
  const select: FieldForValidation = { key: "f", type: "SELECT", dataType: "CODE", label: "Modo", config: {} };
  const multi: FieldForValidation = { key: "g", type: "MULTISELECT", dataType: "CODE_ARRAY", label: "Causas", config: {} };

  it("rechaza un code fuera del catálogo", () => {
    expect(validateFieldValue(select, "X", { allowedCodes: ["A", "B"] }).errors).toHaveLength(1);
    expect(validateFieldValue(select, "A", { allowedCodes: ["A", "B"] }).errors).toHaveLength(0);
  });

  it("multiselect: rechaza repetidos y codes inválidos", () => {
    expect(validateFieldValue(multi, ["A", "A"], { allowedCodes: ["A", "B"] }).errors.length).toBeGreaterThan(0);
    expect(validateFieldValue(multi, ["A", "Z"], { allowedCodes: ["A", "B"] }).errors).toHaveLength(1);
    expect(validateFieldValue(multi, ["A", "B"], { allowedCodes: ["A", "B"] }).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — tipos varios", () => {
  it("DATE exige YYYY-MM-DD válido", () => {
    const f: FieldForValidation = { key: "d", type: "DATE", dataType: "DATE", label: "Fecha", config: {} };
    expect(validateFieldValue(f, "2026-06-09").errors).toHaveLength(0);
    expect(validateFieldValue(f, "09/06/2026").errors).toHaveLength(1);
    expect(validateFieldValue(f, "2026-13-40").errors).toHaveLength(1);
  });

  it("SEVERITY exige 1–5", () => {
    const f: FieldForValidation = { key: "s", type: "SEVERITY", dataType: "CODE", label: "Sev", config: {} };
    expect(validateFieldValue(f, 3).errors).toHaveLength(0);
    expect(validateFieldValue(f, 6).errors).toHaveLength(1);
  });

  it("SIGNATURE no es llenable en 2.4", () => {
    const f: FieldForValidation = { key: "sig", type: "SIGNATURE", dataType: "REFERENCE", label: "Firma", config: {} };
    expect(validateFieldValue(f, "x").errors).toHaveLength(1);
  });
});

describe("isFieldVisible", () => {
  const vw = { fieldKey: "tieneFalla", equals: true };
  it("muestra solo cuando la condición se cumple", () => {
    expect(isFieldVisible(null, {})).toBe(true);
    expect(isFieldVisible(vw, { tieneFalla: true })).toBe(true);
    expect(isFieldVisible(vw, { tieneFalla: false })).toBe(false);
    expect(isFieldVisible(vw, {})).toBe(false);
  });
});

describe("resolveEffectiveAt", () => {
  const recordedAt = new Date("2026-06-09T12:00:00Z");
  const sections = [
    { fields: [{ key: "fecha", semanticRole: "EFFECTIVE_DATE" } as never] },
  ] as Parameters<typeof resolveEffectiveAt>[0];

  it("usa el valor del campo EFFECTIVE_DATE cuando existe", () => {
    const r = resolveEffectiveAt(sections, { fecha: "2026-06-01T08:00:00Z" }, recordedAt);
    expect(r.toISOString()).toBe("2026-06-01T08:00:00.000Z");
  });

  it("cae a recordedAt si el campo está vacío o inválido", () => {
    expect(resolveEffectiveAt(sections, { fecha: "" }, recordedAt)).toEqual(recordedAt);
    expect(resolveEffectiveAt(sections, {}, recordedAt)).toEqual(recordedAt);
  });

  it("cae a recordedAt si no hay campo EFFECTIVE_DATE", () => {
    const none = [{ fields: [{ key: "x", semanticRole: null } as never] }] as Parameters<typeof resolveEffectiveAt>[0];
    expect(resolveEffectiveAt(none, { x: "2026-01-01" }, recordedAt)).toEqual(recordedAt);
  });
});

describe("isSectionEditableInState", () => {
  it("null = editable siempre; con flujo, solo en su estado", () => {
    expect(isSectionEditableInState(null, "open")).toBe(true);
    expect(isSectionEditableInState(null, null)).toBe(true);
    expect(isSectionEditableInState("open", "open")).toBe(true);
    expect(isSectionEditableInState("open", "review")).toBe(false);
    expect(isSectionEditableInState("open", null)).toBe(false);
  });
});

describe("availableTransitionsFor", () => {
  const states = [
    { key: "open", name: "Abierto" },
    { key: "review", name: "En revisión" },
    { key: "closed", name: "Cerrado" },
  ];
  const tx = (over: Partial<TransitionForAvailability>): TransitionForAvailability => ({
    key: "send",
    label: "Enviar a revisión",
    fromStateKey: "open",
    toStateKey: "review",
    requireSignature: false,
    signatureMeaning: null,
    requireMfa: false,
    roleIds: [],
    ...over,
  });

  it("solo devuelve transiciones que salen del estado actual", () => {
    const res = availableTransitionsFor(
      [tx({}), tx({ key: "close", fromStateKey: "review", toStateKey: "closed" })],
      states,
      "open",
      [],
    );
    expect(res.map((r) => r.transitionKey)).toEqual(["send"]);
    expect(res[0]!.toStateName).toBe("En revisión");
  });

  it("sin estado actual (sin flujo) no hay transiciones", () => {
    expect(availableTransitionsFor([tx({})], states, null, ["r1"])).toEqual([]);
  });

  it("filtra por rol cuando la transición declara roles (autorización = dato)", () => {
    const t = [tx({ roleIds: ["supervisor"] })];
    expect(availableTransitionsFor(t, states, "open", ["operador"])).toHaveLength(0);
    expect(availableTransitionsFor(t, states, "open", ["supervisor"])).toHaveLength(1);
  });

  it("transición sin roles está abierta a cualquiera con el permiso base", () => {
    expect(availableTransitionsFor([tx({ roleIds: [] })], states, "open", [])).toHaveLength(1);
  });
});

describe("canonicalSignaturePayload", () => {
  it("es determinista ante distinto orden de claves (mismo hash de contenido)", () => {
    const a = canonicalSignaturePayload({
      entryId: "e1",
      templateVersionId: "tv1",
      context: "TRANSITION",
      transitionKey: "approve",
      fromStateKey: "review",
      toStateKey: "closed",
      signerId: "u1",
      meaning: "Aprobado",
      signedAt: "2026-06-09T12:00:00.000Z",
      values: { b: 2, a: 1, nested: { y: 1, x: 2 } },
    });
    const b = canonicalSignaturePayload({
      signedAt: "2026-06-09T12:00:00.000Z",
      meaning: "Aprobado",
      values: { nested: { x: 2, y: 1 }, a: 1, b: 2 },
      signerId: "u1",
      toStateKey: "closed",
      fromStateKey: "review",
      transitionKey: "approve",
      context: "TRANSITION",
      templateVersionId: "tv1",
      entryId: "e1",
    });
    expect(a).toBe(b);
  });

  it("distinto contenido ⇒ distinta serialización", () => {
    const base = {
      entryId: "e1",
      templateVersionId: "tv1",
      context: "TRANSITION" as const,
      signerId: "u1",
      meaning: "Aprobado",
      signedAt: "2026-06-09T12:00:00.000Z",
      values: {},
    };
    expect(canonicalSignaturePayload({ ...base, meaning: "Revisado" })).not.toBe(
      canonicalSignaturePayload(base),
    );
  });
});

describe("executeTransitionRequestSchema", () => {
  it("exige transitionKey y acepta credenciales opcionales", () => {
    expect(executeTransitionRequestSchema.safeParse({ transitionKey: "approve" }).success).toBe(true);
    expect(
      executeTransitionRequestSchema.safeParse({ transitionKey: "approve", password: "x", mfaCode: "123456" }).success,
    ).toBe(true);
    expect(executeTransitionRequestSchema.safeParse({}).success).toBe(false);
  });
});

// === Fase 2.6 — Bitácoras ====================================================

describe("thresholdBandFor", () => {
  it("CRIT domina a WARN y coincide con las advertencias de validateFieldValue", () => {
    const f = numberField({ warnLow: 10, warnHigh: 80, critLow: 5, critHigh: 95 });
    expect(thresholdBandFor(f, 50)).toBeNull();
    expect(thresholdBandFor(f, 8)).toBe("WARN");
    expect(thresholdBandFor(f, 90)).toBe("WARN");
    expect(thresholdBandFor(f, 2)).toBe("CRIT");
    expect(thresholdBandFor(f, 99)).toBe("CRIT");
    // Consistencia con la fuente de advertencias: hay banda ⇔ hay warning.
    for (const v of [50, 8, 90, 2, 99]) {
      const hasWarning = validateFieldValue(f, v).warnings.length > 0;
      expect(thresholdBandFor(f, v) !== null).toBe(hasWarning);
    }
  });

  it("null para vacío, no-número y tipos no NUMBER", () => {
    expect(thresholdBandFor(numberField({ critHigh: 10 }), null)).toBeNull();
    expect(thresholdBandFor(numberField({ critHigh: 10 }), "abc")).toBeNull();
    expect(
      thresholdBandFor({ key: "t", type: "TEXT", dataType: "STRING", label: "T", config: { critHigh: 1 } }, 5),
    ).toBeNull();
  });
});

describe("canonicalSignatureValues / canonicalSignaturePayload", () => {
  it("descarta entradas null/undefined (clave-con-null ≡ clave-ausente)", () => {
    expect(canonicalSignatureValues({ a: 1, b: null, c: undefined, d: 0, e: false })).toEqual({
      a: 1,
      d: 0,
      e: false,
    });
  });

  it("el payload con valores null es idéntico al payload sin esas claves", () => {
    const base = {
      entryId: "e1",
      templateVersionId: "tv1",
      context: "SECTION_COMPLETION" as const,
      sectionKey: "s1",
      signerId: "u1",
      meaning: "Sección completada",
      signedAt: "2026-06-10T12:00:00.000Z",
    };
    expect(canonicalSignaturePayload({ ...base, values: { temp: 42, obs: null } })).toBe(
      canonicalSignaturePayload({ ...base, values: { temp: 42 } }),
    );
  });
});

describe("formatEntryFolio", () => {
  it("rellena a 6 dígitos con prefijo", () => {
    expect(formatEntryFolio(7)).toBe("BIT-000007");
    expect(formatEntryFolio(123456)).toBe("BIT-123456");
    expect(formatEntryFolio(1234567)).toBe("BIT-1234567");
  });
});

describe("logEntryListQuerySchema (v2 — Bitácoras)", () => {
  it("coerciona take y booleanos de query string", () => {
    const parsed = logEntryListQuerySchema.parse({
      take: "25",
      includeDescendants: "true",
      pendingSignature: "false",
    });
    expect(parsed.take).toBe(25);
    expect(parsed.includeDescendants).toBe(true);
    expect(parsed.pendingSignature).toBe(false);
  });

  it("rechaza sort fuera de la whitelist, take > 100 y fechas inválidas", () => {
    expect(logEntryListQuerySchema.safeParse({ sort: "templateName" }).success).toBe(false);
    expect(logEntryListQuerySchema.safeParse({ take: "500" }).success).toBe(false);
    expect(logEntryListQuerySchema.safeParse({ effectiveFrom: "ayer" }).success).toBe(false);
    expect(logEntryListQuerySchema.safeParse({ operationalDate: "10-06-2026" }).success).toBe(false);
  });

  it("acepta una query completa típica de la grilla", () => {
    expect(
      logEntryListQuerySchema.safeParse({
        q: "BIT",
        templateId: "t1",
        orgNodeId: "n1",
        includeDescendants: "true",
        status: "SUBMITTED",
        stateKey: "review",
        shiftCode: "A",
        operationalDate: "2026-06-10",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveTo: "2026-06-10T23:59:59.000Z",
        thresholdBand: "ANY",
        sort: "effectiveAt",
        dir: "asc",
      }).success,
    ).toBe(true);
  });
});

describe("logEntryTimelineEventSchema", () => {
  it("discrimina por kind y rechaza kinds desconocidos", () => {
    expect(
      logEntryTimelineEventSchema.safeParse({
        kind: "TRANSITION",
        id: "t1",
        at: "2026-06-10T12:00:00.000Z",
        actorName: "Demo",
        transitionKey: "approve",
        label: "Aprobar",
        fromStateKey: "draft",
        toStateKey: "approved",
        fromStateName: "Borrador",
        toStateName: "Aprobado",
        reason: null,
        signature: { signerName: "Demo", meaning: "Aprobado", signedAt: "2026-06-10T12:00:00.000Z" },
      }).success,
    ).toBe(true);
    expect(
      logEntryTimelineEventSchema.safeParse({ kind: "OTRO", id: "x", at: "2026-06-10T12:00:00.000Z" }).success,
    ).toBe(false);
  });
});
