import { describe, expect, it } from "vitest";
import {
  buildSummaryUserPrompt,
  createLlmProvider,
  egressesPlant,
  NoneLlmProvider,
  scrubGrounding,
  scrubText,
  SUMMARY_PROMPT_VERSION,
} from "./index.js";
import type { LlmStream, SummaryGrounding } from "./index.js";

async function drain(stream: LlmStream): Promise<string[]> {
  const deltas: string[] = [];
  for await (const d of stream) deltas.push(d);
  return deltas;
}

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

  it("generateSummaryStream emite el determinista en un bloque y cierra con LlmResult", async () => {
    const p = new NoneLlmProvider();
    const stream = p.generateSummaryStream({ fallbackText: "RESUMEN DETERMINISTA", grounding });
    const deltas = await drain(stream);
    expect(deltas).toEqual(["RESUMEN DETERMINISTA"]);
    const res = await stream.finalResult();
    expect(res.text).toBe("RESUMEN DETERMINISTA");
    expect(res.provider).toBe("none");
    expect(res.outputTokens).toBeNull();
  });
});

describe("scrubText / scrubGrounding (AC-IA-7)", () => {
  it("redacta correo, RUT y teléfono; deja intactas las cifras operacionales", () => {
    expect(scrubText("avisar a juan@planta.cl")).toBe("avisar a [correo]");
    expect(scrubText("operador 12.345.678-9 reportó")).toBe("operador [rut] reportó");
    expect(scrubText("llamar al +56 9 8765 4321")).toBe("llamar al [teléfono]");
    // No toca temperaturas/umbrales/severidad/folios.
    expect(scrubText("Temp. 92°C (umbral 85), sev 4, INC-0007")).toBe("Temp. 92°C (umbral 85), sev 4, INC-0007");
  });

  it("redacta los textos LIBRES del grounding sin mutar el original", () => {
    const dirty: SummaryGrounding = {
      ...grounding,
      openItems: ["Contactar a maria@planta.cl", "Pendiente repuesto"],
    };
    const clean = scrubGrounding(dirty);
    expect(clean.openItems[0]).toBe("Contactar a [correo]");
    expect(clean.openItems[1]).toBe("Pendiente repuesto");
    expect(dirty.openItems[0]).toBe("Contactar a maria@planta.cl"); // inmutable
  });
});

describe("egressesPlant (política de scrub)", () => {
  it("none nunca egresa; anthropic siempre", () => {
    expect(egressesPlant({ provider: "none" })).toBe(false);
    expect(egressesPlant({ provider: "anthropic" })).toBe(true);
  });
  it("openai-compatible: local on-prem NO egresa; nube SÍ", () => {
    expect(egressesPlant({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1" })).toBe(false);
    expect(egressesPlant({ provider: "openai-compatible", baseUrl: "http://192.168.1.20:8000/v1" })).toBe(false);
    expect(egressesPlant({ provider: "openai-compatible", baseUrl: "https://api.openai.com/v1" })).toBe(true);
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
    expect(SUMMARY_PROMPT_VERSION).toBe("v2");
  });
});
