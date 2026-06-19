import { describe, expect, it } from "vitest";
import { buildSummaryUserPrompt, createLlmProvider, NoneLlmProvider, SUMMARY_PROMPT_VERSION } from "./index.js";
import type { SummaryGrounding } from "./index.js";

const grounding: SummaryGrounding = {
  nodeName: "Molienda Línea 1",
  shiftLabel: "Turno A (08:00–20:00)",
  operationalDay: "2026-06-18",
  generalStatusLabel: "Operativo con observaciones",
  entriesCount: 14,
  incidents: [
    { folio: "INC-0007", title: "Vibración alta molino SAG", severity: 4, critical: true, overdue: false, stateName: "En análisis" },
  ],
  exceptions: [{ kind: "critical", detail: "Temperatura descanso 92°C (umbral 85)", fieldLabel: "Temp. descanso" }],
  followups: [{ kind: "ACTION", code: "ACT-0003", title: "Inspección rodamiento", overdue: true }],
  rounds: { done: 3, overdue: 1, total: 4 },
  openItems: ["Coordinar parada con mantención", "Pendiente repuesto sello"],
};

describe("createLlmProvider", () => {
  it("instancia el proveedor none por defecto y ante provider desconocido", () => {
    expect(createLlmProvider({ provider: "none", model: "", baseUrl: "", apiKey: "" })).toBeInstanceOf(NoneLlmProvider);
    // @ts-expect-error provider inválido a propósito (defensa)
    expect(createLlmProvider({ provider: "x", model: "", baseUrl: "", apiKey: "" })).toBeInstanceOf(NoneLlmProvider);
  });

  it("instancia anthropic / openai-compatible sin lanzar (no hace red al construir)", () => {
    const a = createLlmProvider({ provider: "anthropic", model: "claude-opus-4-8", baseUrl: "", apiKey: "sk-test" });
    expect(a.id).toBe("anthropic");
    expect(a.model).toBe("claude-opus-4-8");
    const o = createLlmProvider({ provider: "openai-compatible", model: "qwen2.5:7b-instruct", baseUrl: "http://localhost:11434/v1", apiKey: "" });
    expect(o.id).toBe("openai-compatible");
  });
});

describe("NoneLlmProvider", () => {
  it("generateSummary devuelve el fallbackText verbatim (offline, costo cero)", async () => {
    const p = new NoneLlmProvider();
    const res = await p.generateSummary({ fallbackText: "RESUMEN DETERMINISTA", grounding });
    expect(res.text).toBe("RESUMEN DETERMINISTA");
    expect(res.provider).toBe("none");
    expect(res.latencyMs).toBe(0);
    expect(res.inputTokens).toBeNull();
  });
});

describe("buildSummaryUserPrompt (grounding)", () => {
  it("enumera SOLO los datos provistos y los rotula", () => {
    const prompt = buildSummaryUserPrompt(grounding);
    expect(prompt).toContain("Molienda Línea 1");
    expect(prompt).toContain("INC-0007");
    expect(prompt).toContain("crítica");
    expect(prompt).toContain("ACT-0003");
    expect(prompt).toContain("Coordinar parada con mantención");
    expect(prompt).toContain("3 cumplidas, 1 vencidas de 4");
  });

  it("es determinista (mismo input ⇒ mismo prompt)", () => {
    expect(buildSummaryUserPrompt(grounding)).toBe(buildSummaryUserPrompt(grounding));
  });

  it("expone una versión de prompt estable", () => {
    expect(SUMMARY_PROMPT_VERSION).toBe("v1");
  });
});
