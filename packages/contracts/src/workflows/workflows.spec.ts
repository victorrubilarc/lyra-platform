import { describe, expect, it } from "vitest";
import {
  saveWorkflowDraftRequestSchema,
  validateWorkflowMachine,
  workflowKeySchema,
} from "./workflows.js";

/** Máquina lineal válida: borrador → revisión → cerrado (final). */
const validStates = [
  { key: "draft", isInitial: true, isFinal: false },
  { key: "review", isInitial: false, isFinal: false },
  { key: "closed", isInitial: false, isFinal: true },
];
const validTransitions = [
  { key: "send", fromStateKey: "draft", toStateKey: "review" },
  { key: "approve", fromStateKey: "review", toStateKey: "closed" },
];

describe("validateWorkflowMachine", () => {
  it("acepta una máquina lineal válida", () => {
    expect(validateWorkflowMachine(validStates, validTransitions)).toEqual([]);
  });

  it("exige al menos un estado", () => {
    const issues = validateWorkflowMachine([], []);
    expect(issues.some((i) => /al menos un estado/.test(i.message))).toBe(true);
  });

  it("exige exactamente un estado inicial (cero)", () => {
    const issues = validateWorkflowMachine(
      [{ key: "a", isInitial: false, isFinal: true }],
      [],
    );
    expect(issues.some((i) => /estado inicial/.test(i.message))).toBe(true);
  });

  it("rechaza múltiples estados iniciales", () => {
    const issues = validateWorkflowMachine(
      [
        { key: "a", isInitial: true, isFinal: false },
        { key: "b", isInitial: true, isFinal: true },
      ],
      [{ key: "t", fromStateKey: "a", toStateKey: "b" }],
    );
    expect(issues.some((i) => /un estado inicial/.test(i.message))).toBe(true);
  });

  it("exige al menos un estado final", () => {
    const issues = validateWorkflowMachine(
      [{ key: "a", isInitial: true, isFinal: false }],
      [],
    );
    expect(issues.some((i) => /estado final/.test(i.message))).toBe(true);
  });

  it("detecta claves de estado duplicadas", () => {
    const issues = validateWorkflowMachine(
      [
        { key: "a", isInitial: true, isFinal: false },
        { key: "a", isInitial: false, isFinal: true },
      ],
      [],
    );
    expect(issues.some((i) => /Clave de estado duplicada/.test(i.message))).toBe(true);
  });

  it("detecta transición a estado inexistente", () => {
    const issues = validateWorkflowMachine(validStates, [
      { key: "send", fromStateKey: "draft", toStateKey: "ghost" },
      { key: "approve", fromStateKey: "review", toStateKey: "closed" },
    ]);
    expect(issues.some((i) => /destino inexistente/.test(i.message))).toBe(true);
  });

  it("detecta estado inalcanzable desde el inicial", () => {
    const states = [
      { key: "draft", isInitial: true, isFinal: false },
      { key: "closed", isInitial: false, isFinal: true },
      { key: "orphan", isInitial: false, isFinal: true },
    ];
    const transitions = [{ key: "approve", fromStateKey: "draft", toStateKey: "closed" }];
    const issues = validateWorkflowMachine(states, transitions);
    expect(issues.some((i) => /Inalcanzable|inalcanzable/.test(i.message))).toBe(true);
  });

  it("detecta estado trampa (sin salida hacia un final)", () => {
    const states = [
      { key: "draft", isInitial: true, isFinal: false },
      { key: "stuck", isInitial: false, isFinal: false },
      { key: "closed", isInitial: false, isFinal: true },
    ];
    // draft → closed (ok) y draft → stuck (stuck no llega a ningún final)
    const transitions = [
      { key: "approve", fromStateKey: "draft", toStateKey: "closed" },
      { key: "park", fromStateKey: "draft", toStateKey: "stuck" },
    ];
    const issues = validateWorkflowMachine(states, transitions);
    expect(issues.some((i) => /trampa/.test(i.message))).toBe(true);
  });
});

describe("saveWorkflowDraftRequestSchema", () => {
  it("acepta un borrador con máquina válida", () => {
    const result = saveWorkflowDraftRequestSchema.safeParse({
      name: "Cierre de turno",
      states: [
        { key: "draft", name: "Borrador", isInitial: true },
        { key: "closed", name: "Cerrado", isFinal: true },
      ],
      transitions: [{ key: "close", label: "Cerrar", fromStateKey: "draft", toStateKey: "closed" }],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un borrador con máquina inválida (sin final)", () => {
    const result = saveWorkflowDraftRequestSchema.safeParse({
      states: [{ key: "draft", name: "Borrador", isInitial: true }],
      transitions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("workflowKeySchema", () => {
  it("acepta minúsculas con guiones", () => {
    expect(workflowKeySchema.safeParse("cierre-turno").success).toBe(true);
  });
  it("rechaza mayúsculas o espacios", () => {
    expect(workflowKeySchema.safeParse("Cierre Turno").success).toBe(false);
  });
});
