import { describe, expect, it } from "vitest";
import {
  availableTransitionsFor,
  canonicalSignaturePayload,
  canonicalSignatureValues,
  createLogEntryRequestSchema,
  editWindowDeadline,
  editWindowInfoSchema,
  executeTransitionRequestSchema,
  formatEntryFolio,
  isEditWindowExpired,
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  logEntryListQuerySchema,
  resolveSortKeys,
  sortKeysFromParam,
  sortKeysToParam,
  logEntrySectionStateDtoSchema,
  logEntryTimelineEventSchema,
  resolveEditWindow,
  resolveEffectiveAt,
  saveLogEntrySectionRequestSchema,
  sectionBlockedReasonSchema,
  setDeferralRequestSchema,
  submitLogEntryRequestSchema,
  thresholdBandFor,
  validateFieldValue,
  countCompleteTableRows,
  isEmptyMatrixValue,
  pruneEmptyTableRows,
  requiredFieldError,
  tableRowIsEmpty,
  type FieldForValidation,
  type TransitionForAvailability,
} from "./log-entries.js";
import { deriveToleranceBands, riskLevelFor, fieldConfigSchemaFor } from "../templates/field-types.js";

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

  it("crear DIFERIDA exige fecha ISO con offset y motivo (≥5)", () => {
    const ok = {
      templateId: "t1",
      deferred: { effectiveAt: "2026-06-10T22:30:00-04:00", reason: "Sin señal en terreno" },
    };
    expect(createLogEntryRequestSchema.safeParse(ok).success).toBe(true);
    // Motivo obligatorio y con contenido (práctica GxP de late entry).
    expect(
      createLogEntryRequestSchema.safeParse({ templateId: "t1", deferred: { effectiveAt: "2026-06-10T22:30:00Z", reason: "  x " } })
        .success,
    ).toBe(false);
    // Fecha sin formato ISO datetime.
    expect(
      createLogEntryRequestSchema.safeParse({ templateId: "t1", deferred: { effectiveAt: "2026-06-10", reason: "Motivo válido" } })
        .success,
    ).toBe(false);
  });

  it("setDeferral acepta declarar y quitar (null)", () => {
    expect(
      setDeferralRequestSchema.safeParse({ deferred: { effectiveAt: "2026-06-10T08:00:00Z", reason: "Turno sin acceso" } }).success,
    ).toBe(true);
    expect(setDeferralRequestSchema.safeParse({ deferred: null }).success).toBe(true);
    expect(setDeferralRequestSchema.safeParse({}).success).toBe(false);
  });

  it("listQuery acepta entryOrigin del enum y rechaza otros", () => {
    expect(logEntryListQuerySchema.safeParse({ entryOrigin: "DEFERRED" }).success).toBe(true);
    expect(logEntryListQuerySchema.safeParse({ entryOrigin: "LATE" }).success).toBe(false);
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

  it("RANGE: {from,to} vacío si ambos lo están; 0 cuenta como valor", () => {
    expect(isEmptyValue({ from: null, to: null })).toBe(true);
    expect(isEmptyValue({ from: "", to: "" })).toBe(true);
    expect(isEmptyValue({ from: 0, to: null })).toBe(false);
    expect(isEmptyValue({ from: 1, to: 5 })).toBe(false);
  });
});

describe("validateFieldValue — objetos Ola 1", () => {
  const f = (type: FieldForValidation["type"], config: Record<string, unknown> = {}): FieldForValidation => ({
    key: "x",
    type,
    dataType: "STRING",
    label: "Campo",
    config,
  });

  it("CONFORMITY: acepta el catálogo; N.A. configurable", () => {
    expect(validateFieldValue(f("CONFORMITY"), "CONFORME").errors).toHaveLength(0);
    expect(validateFieldValue(f("CONFORMITY"), "NA").errors).toHaveLength(0);
    expect(validateFieldValue(f("CONFORMITY"), "OTRO").errors).toHaveLength(1);
    expect(validateFieldValue(f("CONFORMITY", { allowNa: false }), "NA").errors).toHaveLength(1);
  });

  it("RATING: entero 1..max (default 5)", () => {
    expect(validateFieldValue(f("RATING"), 3).errors).toHaveLength(0);
    expect(validateFieldValue(f("RATING"), 6).errors).toHaveLength(1);
    expect(validateFieldValue(f("RATING", { max: 10 }), 9).errors).toHaveLength(0);
    expect(validateFieldValue(f("RATING"), 0).errors).toHaveLength(1);
  });

  it("TIME: HH:MM 24h", () => {
    expect(validateFieldValue(f("TIME"), "08:30").errors).toHaveLength(0);
    expect(validateFieldValue(f("TIME"), "23:59").errors).toHaveLength(0);
    expect(validateFieldValue(f("TIME"), "24:00").errors).toHaveLength(1);
    expect(validateFieldValue(f("TIME"), "8:5").errors).toHaveLength(1);
  });

  it("DURATION: entero de minutos no negativo", () => {
    expect(validateFieldValue(f("DURATION"), 90).errors).toHaveLength(0);
    expect(validateFieldValue(f("DURATION"), -5).errors).toHaveLength(1);
    expect(validateFieldValue(f("DURATION"), 1.5).errors).toHaveLength(1);
  });

  it("RANGE: from<=to dentro de cotas", () => {
    expect(validateFieldValue(f("RANGE"), { from: 1, to: 5 }).errors).toHaveLength(0);
    expect(validateFieldValue(f("RANGE"), { from: 5, to: 1 }).errors).toHaveLength(1);
    expect(validateFieldValue(f("RANGE", { min: 0, max: 10 }), { from: -1, to: 12 }).errors.length).toBeGreaterThan(0);
  });

  it("TEXT con format valida RUT/correo/URL", () => {
    expect(validateFieldValue(f("TEXT", { format: "rut" }), "11.111.111-1").errors).toHaveLength(0);
    expect(validateFieldValue(f("TEXT", { format: "rut" }), "11.111.111-2").errors).toHaveLength(1);
    expect(validateFieldValue(f("TEXT", { format: "email" }), "a@b.cl").errors).toHaveLength(0);
    expect(validateFieldValue(f("TEXT", { format: "email" }), "no-mail").errors).toHaveLength(1);
    expect(validateFieldValue(f("TEXT", { format: "url" }), "https://itesic.cl/x").errors).toHaveLength(0);
  });

  it("NUMBER con format percent acota 0..100", () => {
    expect(validateFieldValue(f("NUMBER", { format: "percent" }), 50).errors).toHaveLength(0);
    expect(validateFieldValue(f("NUMBER", { format: "percent" }), 120).errors).toHaveLength(1);
  });

  it("PRESENTACIÓN: nunca produce errores aunque llegue un valor", () => {
    expect(validateFieldValue(f("HEADING"), "loquesea").errors).toHaveLength(0);
    expect(validateFieldValue(f("NOTICE"), null).errors).toHaveLength(0);
    expect(validateFieldValue(f("DIVIDER"), 123).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — objetos Ola 2 (referencia)", () => {
  const f = (type: FieldForValidation["type"], config: Record<string, unknown> = {}): FieldForValidation => ({
    key: "x",
    type,
    dataType: "REFERENCE",
    label: "Campo",
    config,
  });

  it("REFERENCE: exige string; valida pertenencia al set de ids (ABAC server-side)", () => {
    const ref = f("REFERENCE", { entity: "equipment" });
    expect(validateFieldValue(ref, "eq1").errors).toHaveLength(0); // sin set: solo forma
    expect(validateFieldValue(ref, 123).errors).toHaveLength(1); // no string
    expect(validateFieldValue(ref, "eq1", { allowedRefIds: ["eq1", "eq2"] }).errors).toHaveLength(0);
    expect(validateFieldValue(ref, "eq9", { allowedRefIds: ["eq1", "eq2"] }).errors).toHaveLength(1); // fuera de alcance
  });

  it("REFERENCE: vacío es válido (lo gobierna 'obligatorio', no la validación)", () => {
    expect(validateFieldValue(f("REFERENCE", { entity: "user" }), "", { allowedRefIds: ["u1"] }).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — ATTACHMENT (Ola 3)", () => {
  const f = (config: Record<string, unknown> = { kind: "photo" }): FieldForValidation => ({
    key: "a",
    type: "ATTACHMENT",
    dataType: "FILE_ARRAY",
    label: "Evidencia",
    config,
  });
  const desc = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    key: "entries/e1/a/d1-foto.jpg",
    filename: "foto.jpg",
    size: 1024,
    contentType: "image/jpeg",
    uploadedAt: "2026-06-15T00:00:00.000Z",
    uploadedById: "u1",
    ...over,
  });

  it("vacío (array vacío / null) es válido", () => {
    expect(validateFieldValue(f(), []).errors).toHaveLength(0);
    expect(validateFieldValue(f(), null).errors).toHaveLength(0);
  });

  it("acepta un descriptor bien formado de un tipo permitido", () => {
    expect(validateFieldValue(f({ kind: "photo" }), [desc()]).errors).toHaveLength(0);
  });

  it("rechaza un valor que no es arreglo", () => {
    expect(validateFieldValue(f(), { id: "x" }).errors).toHaveLength(1);
  });

  it("rechaza un descriptor malformado", () => {
    expect(validateFieldValue(f(), [{ id: "d1" }]).errors).toHaveLength(1);
  });

  it("rechaza un tipo fuera de accept (foto exige image/*)", () => {
    expect(validateFieldValue(f({ kind: "photo" }), [desc({ contentType: "application/pdf" })]).errors).toHaveLength(1);
  });

  it("rechaza un archivo sobre el tamaño máximo", () => {
    expect(validateFieldValue(f({ kind: "file", maxSizeMb: 1 }), [desc({ size: 5 * 1024 * 1024 })]).errors).toHaveLength(
      1,
    );
  });

  it("multiple=false limita a 1 archivo", () => {
    expect(validateFieldValue(f({ kind: "photo" }), [desc(), desc({ id: "d2" })]).errors).toHaveLength(1);
    expect(
      validateFieldValue(f({ kind: "photo", multiple: true, maxCount: 3 }), [desc(), desc({ id: "d2" })]).errors,
    ).toHaveLength(0);
  });
});

describe("validateFieldValue — RISK_MATRIX", () => {
  // Matriz 3×3: cells[p-1][c-1] = severidad 1..5.
  const matrix = {
    probabilityLabels: ["Baja", "Media", "Alta"],
    consequenceLabels: ["Leve", "Moderada", "Grave"],
    cells: [
      [1, 2, 3],
      [2, 3, 4],
      [3, 4, 5],
    ],
  };
  const f = (config: Record<string, unknown>): FieldForValidation => ({
    key: "r",
    type: "RISK_MATRIX",
    dataType: "RISK",
    label: "Riesgo",
    config,
  });

  it("acepta una combinación dentro de la matriz", () => {
    expect(validateFieldValue(f(matrix), { probability: 3, consequence: 3 }).errors).toHaveLength(0);
  });

  it("rechaza combinación fuera de los ejes", () => {
    expect(validateFieldValue(f(matrix), { probability: 4, consequence: 1 }).errors).toHaveLength(1);
  });

  it("exige ambos ejes", () => {
    expect(validateFieldValue(f(matrix), { probability: 2 }).errors).toHaveLength(1);
  });

  it("riskLevelFor deriva severidad y rótulos", () => {
    expect(riskLevelFor(matrix, { probability: 3, consequence: 3 })).toEqual({
      severity: 5,
      probabilityLabel: "Alta",
      consequenceLabel: "Grave",
    });
    expect(riskLevelFor(matrix, { probability: 9, consequence: 1 })).toBeNull();
  });
});

describe("lectura con tolerancia (NUMBER + expected ± tolerance)", () => {
  const f = (config: Record<string, unknown>): FieldForValidation => ({
    key: "t",
    type: "NUMBER",
    dataType: "NUMBER",
    label: "Presión",
    config,
  });

  it("deriveToleranceBands: warn = ±tolerance, crit = ±critTolerance", () => {
    expect(deriveToleranceBands({ expected: 100, tolerance: 5, critTolerance: 10 })).toEqual({
      warnLow: 95,
      warnHigh: 105,
      critLow: 90,
      critHigh: 110,
    });
    expect(deriveToleranceBands({ tolerance: 5 })).toEqual({}); // sin expected
  });

  it("advertencia/crítico se derivan de la tolerancia", () => {
    const cfg = { expected: 100, tolerance: 5, critTolerance: 10 };
    expect(validateFieldValue(f(cfg), 100).warnings).toHaveLength(0);
    expect(validateFieldValue(f(cfg), 107).warnings).toHaveLength(1); // fuera de ±5 ⇒ WARN
    expect(thresholdBandFor(f(cfg), 107)).toBe("WARN");
    expect(thresholdBandFor(f(cfg), 115)).toBe("CRIT"); // fuera de ±10 ⇒ CRIT
    expect(thresholdBandFor(f(cfg), 100)).toBeNull();
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

  it("cadena 2.7.0: campo → declarada → recordedAt", () => {
    const declared = new Date("2026-06-05T20:00:00Z");
    // Sin campo EFFECTIVE_DATE: la fecha declarada gana a recordedAt.
    const none = [{ fields: [{ key: "x", semanticRole: null } as never] }] as Parameters<typeof resolveEffectiveAt>[0];
    expect(resolveEffectiveAt(none, {}, recordedAt, declared)).toEqual(declared);
    // Con campo vacío: cae a la declarada (no directo a recordedAt).
    expect(resolveEffectiveAt(sections, { fecha: "" }, recordedAt, declared)).toEqual(declared);
    // El campo con valor SIEMPRE manda sobre la declarada.
    const r = resolveEffectiveAt(sections, { fecha: "2026-06-01T08:00:00Z" }, recordedAt, declared);
    expect(r.toISOString()).toBe("2026-06-01T08:00:00.000Z");
    // declarada null se comporta como antes.
    expect(resolveEffectiveAt(sections, {}, recordedAt, null)).toEqual(recordedAt);
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

  it("parsea multi-sort desde CSV `campo:dir` ignorando campos inválidos/duplicados", () => {
    const parsed = logEntryListQuerySchema.parse({ sorts: "effectiveAt:asc,entryNumber:desc,effectiveAt:desc,foo:asc" });
    // dedup por campo (la 1.ª gana) + descarta `foo` (fuera de whitelist).
    expect(parsed.sorts).toEqual([
      { field: "effectiveAt", dir: "asc" },
      { field: "entryNumber", dir: "desc" },
    ]);
  });

  it("resolveSortKeys prioriza multi → legacy single → default", () => {
    expect(resolveSortKeys({ sorts: [{ field: "entryNumber", dir: "asc" }], sort: "recordedAt", dir: "desc" })).toEqual([
      { field: "entryNumber", dir: "asc" },
    ]);
    expect(resolveSortKeys({ sort: "effectiveAt", dir: "asc" })).toEqual([{ field: "effectiveAt", dir: "asc" }]);
    expect(resolveSortKeys({})).toEqual([{ field: "recordedAt", dir: "desc" }]);
  });

  it("sortKeysToParam round-trip", () => {
    const keys = [
      { field: "recordedAt", dir: "desc" },
      { field: "entryNumber", dir: "asc" },
    ] as const;
    expect(sortKeysFromParam(sortKeysToParam([...keys]))).toEqual(keys);
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

  it("acepta el evento DEFERRED_DECLARED (2.7.0)", () => {
    expect(
      logEntryTimelineEventSchema.safeParse({
        kind: "DEFERRED_DECLARED",
        id: "deferred:e1",
        at: "2026-06-11T10:00:00.000Z",
        actorName: "Demo",
        declaredEffectiveAt: "2026-06-10T22:30:00.000Z",
        reason: "Sin señal en terreno",
      }).success,
    ).toBe(true);
  });
});

describe("ventana de edición (2.7.2)", () => {
  const recordedAt = new Date("2026-06-10T12:00:00.000Z");
  const effectiveAt = new Date("2026-06-08T20:00:00.000Z");
  const global48 = { editWindowAnchor: "RECORDED" as const, editWindowMinutes: 2880 }; // 48 h

  it("resuelve la herencia plantilla → global (null hereda; 0 apaga)", () => {
    expect(resolveEditWindow({ editWindowAnchor: null, editWindowMinutes: null }, global48)).toEqual({
      anchor: "RECORDED",
      windowMinutes: 2880,
    });
    expect(resolveEditWindow({ editWindowAnchor: "EFFECTIVE", editWindowMinutes: 30 }, global48)).toEqual({
      anchor: "EFFECTIVE",
      windowMinutes: 30,
    });
    // 0 explícito en la plantilla = SIN ventana aunque el global tenga una.
    expect(resolveEditWindow({ editWindowAnchor: null, editWindowMinutes: 0 }, global48)).toBeNull();
    expect(
      resolveEditWindow(
        { editWindowAnchor: null, editWindowMinutes: null },
        { editWindowAnchor: "RECORDED", editWindowMinutes: null },
      ),
    ).toBeNull();
  });

  it("calcula el vencimiento según el ancla (minutos)", () => {
    expect(
      editWindowDeadline({ anchor: "RECORDED", windowMinutes: 2880 }, recordedAt, effectiveAt).toISOString(),
    ).toBe("2026-06-12T12:00:00.000Z");
    expect(
      editWindowDeadline({ anchor: "EFFECTIVE", windowMinutes: 2880 }, recordedAt, effectiveAt).toISOString(),
    ).toBe("2026-06-10T20:00:00.000Z");
    // 90 minutos desde la captura.
    expect(
      editWindowDeadline({ anchor: "RECORDED", windowMinutes: 90 }, recordedAt, effectiveAt).toISOString(),
    ).toBe("2026-06-10T13:30:00.000Z");
  });

  it("decide expiración con borde no-inclusivo (en el límite aún se edita)", () => {
    const deadline = new Date("2026-06-12T12:00:00.000Z");
    expect(isEditWindowExpired(deadline, new Date("2026-06-12T11:59:59.999Z"))).toBe(false);
    expect(isEditWindowExpired(deadline, deadline)).toBe(false);
    expect(isEditWindowExpired(deadline, new Date("2026-06-12T12:00:00.001Z"))).toBe(true);
  });

  it("EDIT_WINDOW_EXPIRED es un blockedReason válido y el DTO de detalle acepta editWindow", () => {
    expect(sectionBlockedReasonSchema.safeParse("EDIT_WINDOW_EXPIRED").success).toBe(true);
    expect(
      editWindowInfoSchema.safeParse({
        anchor: "RECORDED",
        windowMinutes: 2880,
        expiresAt: "2026-06-12T12:00:00.000Z",
        expired: true,
        canOverride: false,
        overrideRequiresMfa: false,
      }).success,
    ).toBe(true);
  });

  it("los requests de escritura aceptan overrideReason ≥5 y lo rechazan corto", () => {
    const save = { expectedVersion: 0, values: [] };
    expect(
      saveLogEntrySectionRequestSchema.safeParse({ ...save, overrideReason: "Corrección autorizada" }).success,
    ).toBe(true);
    expect(saveLogEntrySectionRequestSchema.safeParse({ ...save, overrideReason: "ok" }).success).toBe(false);
    expect(setDeferralRequestSchema.safeParse({ deferred: null, overrideReason: "Ajuste tardío" }).success).toBe(true);
    expect(submitLogEntryRequestSchema.safeParse({ overrideReason: "Cierre tardío del turno" }).success).toBe(true);
    expect(submitLogEntryRequestSchema.safeParse({ overrideReason: "no" }).success).toBe(false);
  });
});

describe("validateFieldValue — objetos Ola 4 (estructurados)", () => {
  const tableField = (config: Record<string, unknown>, value: unknown) =>
    validateFieldValue({ key: "t", type: "TABLE", dataType: "TABLE", label: "Lecturas", config }, value);

  const tableConfig = {
    columns: [
      { key: "hora", label: "Hora", type: "TIME", required: true },
      { key: "temp", label: "Temp", type: "NUMBER", required: true, config: { min: 0, max: 100, warnHigh: 80 } },
      {
        key: "estado",
        label: "Estado",
        type: "SELECT",
        config: { optionSource: { kind: "inline", items: [{ code: "OK", label: "OK" }, { code: "MAL", label: "Mal" }] } },
      },
    ],
    maxRows: 3,
  };

  it("acepta la config de TABLE/MATRIX en fieldConfigSchemaFor", () => {
    expect(fieldConfigSchemaFor("TABLE").safeParse(tableConfig).success).toBe(true);
    expect(fieldConfigSchemaFor("TABLE").safeParse({ columns: [] }).success).toBe(false); // ≥1 columna
    expect(
      fieldConfigSchemaFor("TABLE").safeParse({ columns: [{ key: "a", label: "A", type: "ATTACHMENT" }] }).success,
    ).toBe(false); // tipo de celda no escalar
    expect(
      fieldConfigSchemaFor("TABLE").safeParse({
        columns: [{ key: "n", label: "N", type: "NUMBER", config: { min: 5, max: 1 } }],
      }).success,
    ).toBe(false); // config de columna inválida (min>max)
  });

  it("TABLE: valida por celda y rechaza tipo/rango/catálogo", () => {
    expect(tableField(tableConfig, [{ hora: "08:00", temp: 50, estado: "OK" }]).errors).toHaveLength(0);
    expect(tableField(tableConfig, "no-array").errors).toHaveLength(1);
    expect(tableField(tableConfig, [{ hora: "25:00", temp: 50 }]).errors.length).toBeGreaterThan(0); // hora inválida
    expect(tableField(tableConfig, [{ hora: "08:00", temp: 250 }]).errors.length).toBeGreaterThan(0); // fuera de rango
    expect(tableField(tableConfig, [{ hora: "08:00", temp: 50, estado: "XX" }]).errors.length).toBeGreaterThan(0); // fuera de catálogo
  });

  it("TABLE: fila vacía se ignora; advertencia de umbral por celda; maxRows", () => {
    expect(tableField(tableConfig, [{ hora: "", temp: "", estado: "" }]).errors).toHaveLength(0); // placeholder
    expect(tableField(tableConfig, [{ hora: "08:00", temp: 90 }]).warnings.length).toBeGreaterThan(0); // 90 > warnHigh 80
    expect(tableField(tableConfig, [{ hora: "1:00" }, {}, {}, {}]).errors.some((e) => e.includes("máximo"))).toBe(true);
  });

  it("TABLE: columna required vacía en fila NO vacía es error", () => {
    expect(tableField(tableConfig, [{ temp: 50 }]).errors.some((e) => e.includes("Hora"))).toBe(true);
  });

  it("countCompleteTableRows + requiredFieldError(TABLE)", () => {
    const f: FieldForValidation = { key: "t", type: "TABLE", dataType: "TABLE", label: "Lecturas", config: tableConfig };
    expect(countCompleteTableRows(tableConfig, [{ hora: "08:00", temp: 50 }, {}])).toBe(1);
    expect(countCompleteTableRows(tableConfig, [{ temp: 50 }])).toBe(0); // falta hora (required)
    expect(requiredFieldError(f, [])).not.toBeNull();
    expect(requiredFieldError(f, [{ hora: "08:00", temp: 50 }])).toBeNull();
    const f2: FieldForValidation = { ...f, config: { ...tableConfig, minRows: 2 } };
    expect(requiredFieldError(f2, [{ hora: "08:00", temp: 50 }])).not.toBeNull(); // exige 2
  });

  it("tableRowIsEmpty", () => {
    const cols = [{ key: "a" }, { key: "b" }];
    expect(tableRowIsEmpty({ a: "", b: null }, cols)).toBe(true);
    expect(tableRowIsEmpty({ a: 0, b: null }, cols)).toBe(false); // 0 cuenta
  });

  it("pruneEmptyTableRows quita placeholders y conserva filas con contenido", () => {
    const cfg = { columns: [{ key: "hora", type: "TIME" }, { key: "temp", type: "NUMBER" }] };
    const pruned = pruneEmptyTableRows(cfg, [{ hora: "08:00", temp: 5 }, { hora: "", temp: "" }, { temp: 9 }, {}]);
    expect(pruned).toEqual([{ hora: "08:00", temp: 5 }, { temp: 9 }]);
    expect(pruneEmptyTableRows(cfg, "no-array")).toBe("no-array");
  });

  it("una columna/celda SELECT por lista de referencia se RECHAZA en el diseño (solo inline)", () => {
    const refCol = {
      columns: [{ key: "modo", label: "Modo", type: "SELECT", config: { optionSource: { kind: "referenceList", listKey: "failure-modes" } } }],
    };
    expect(fieldConfigSchemaFor("TABLE").safeParse(refCol).success).toBe(false);
    const inlineCol = {
      columns: [{ key: "modo", label: "Modo", type: "SELECT", config: { optionSource: { kind: "inline", items: [{ code: "a", label: "A" }] } } }],
    };
    expect(fieldConfigSchemaFor("TABLE").safeParse(inlineCol).success).toBe(true);
    const refCell = {
      rows: [{ key: "r1", label: "R1" }], columns: [{ key: "c1", label: "C1" }],
      cell: { type: "SELECT", config: { optionSource: { kind: "referenceList", listKey: "x" } } },
    };
    expect(fieldConfigSchemaFor("MATRIX").safeParse(refCell).success).toBe(false);
  });

  const matrixConfig = {
    rows: [{ key: "p1", label: "Presión" }, { key: "p2", label: "Caudal" }],
    columns: [{ key: "t1", label: "Turno A" }, { key: "t2", label: "Turno B" }],
    cell: { type: "NUMBER", config: { min: 0, max: 10 } },
  };
  const matrixField = (value: unknown) =>
    validateFieldValue({ key: "m", type: "MATRIX", dataType: "MATRIX", label: "Lecturas", config: matrixConfig }, value);

  it("MATRIX: valida por celda; celda vacía permitida; fuera de rango falla", () => {
    expect(fieldConfigSchemaFor("MATRIX").safeParse(matrixConfig).success).toBe(true);
    expect(matrixField({ p1: { t1: 5, t2: 6 }, p2: { t1: 1 } }).errors).toHaveLength(0);
    expect(matrixField({ p1: { t1: 99 } }).errors.length).toBeGreaterThan(0); // > max
    expect(matrixField("no-obj").errors).toHaveLength(1);
    expect(matrixField({ p1: {} }).errors).toHaveLength(0); // parcial
  });

  it("thresholdBandFor: peor banda de las celdas (TABLE/MATRIX) → excepción", () => {
    const tcfg = {
      columns: [
        { key: "hora", label: "Hora", type: "TIME" },
        { key: "temp", label: "Temp", type: "NUMBER", config: { warnHigh: 80, critHigh: 90 } },
      ],
    };
    const tf: FieldForValidation = { key: "t", type: "TABLE", dataType: "TABLE", label: "Lecturas", config: tcfg };
    expect(thresholdBandFor(tf, [{ hora: "08:00", temp: 50 }])).toBeNull();
    expect(thresholdBandFor(tf, [{ temp: 85 }, { temp: 50 }])).toBe("WARN");
    expect(thresholdBandFor(tf, [{ temp: 85 }, { temp: 95 }])).toBe("CRIT"); // crítico domina
    expect(thresholdBandFor(tf, [])).toBeNull();

    const mcfg = {
      rows: [{ key: "p1", label: "P1" }],
      columns: [{ key: "c1", label: "C1" }, { key: "c2", label: "C2" }],
      cell: { type: "NUMBER", config: { warnHigh: 10, critHigh: 20 } },
    };
    const mf: FieldForValidation = { key: "m", type: "MATRIX", dataType: "MATRIX", label: "Matriz", config: mcfg };
    expect(thresholdBandFor(mf, { p1: { c1: 5, c2: 12 } })).toBe("WARN");
    expect(thresholdBandFor(mf, { p1: { c1: 25 } })).toBe("CRIT");
    expect(thresholdBandFor(mf, { p1: { c1: 5 } })).toBeNull();
  });

  it("isEmptyMatrixValue + requiredFieldError(MATRIX)", () => {
    const f: FieldForValidation = { key: "m", type: "MATRIX", dataType: "MATRIX", label: "Lecturas", config: matrixConfig };
    expect(isEmptyMatrixValue({})).toBe(true);
    expect(isEmptyMatrixValue({ p1: { t1: null } })).toBe(true);
    expect(isEmptyMatrixValue({ p1: { t1: 5 } })).toBe(false);
    expect(requiredFieldError(f, {})).not.toBeNull();
    expect(requiredFieldError(f, { p1: { t1: 5 } })).toBeNull();
  });
});
