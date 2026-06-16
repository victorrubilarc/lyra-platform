import { describe, expect, it } from "vitest";
import { extractPlaceholders, renderTemplate, unknownPlaceholders } from "./render.js";
import { allowedVariablesForEvent, isNotificationEventKey } from "./events.js";

describe("render de plantillas de notificación", () => {
  it("extrae placeholders únicos (con o sin espacios)", () => {
    const found = extractPlaceholders("Hola {{recipient.name}}, folio {{entry.folio}} y de nuevo {{ entry.folio }}");
    expect(found.sort()).toEqual(["entry.folio", "recipient.name"]);
  });

  it("sustituye los conocidos y vacía los ausentes (sin filtrar crudo)", () => {
    const out = renderTemplate("Hola {{recipient.name}}: {{entry.folio}} / {{no.existe}}", {
      "recipient.name": "Ana",
      "entry.folio": "OT-123",
    });
    expect(out).toBe("Hola Ana: OT-123 / ");
  });

  it("no ejecuta lógica: claves inválidas no se tocan", () => {
    // `{{a+b}}` no es un nombre plano permitido ⇒ no es placeholder, se deja literal.
    expect(renderTemplate("x {{a+b}} y", { a: "1" })).toBe("x {{a+b}} y");
  });

  it("detecta placeholders fuera de la whitelist del evento", () => {
    const allowed = allowedVariablesForEvent("round.overdue");
    const bad = unknownPlaceholders(
      ["{{schedule.name}} venció", "culpa de {{entry.folio}}"],
      allowed,
    );
    expect(bad).toEqual(["entry.folio"]); // entry.* no aplica a round.overdue
  });

  it("acepta una plantilla que solo usa variables permitidas", () => {
    const allowed = allowedVariablesForEvent("entry.transition");
    expect(unknownPlaceholders(["{{entry.folio}} → {{entry.toState}} ({{app.name}})"], allowed)).toEqual([]);
  });

  it("conoce las 4 claves de evento del MVP", () => {
    expect(isNotificationEventKey("round.overdue")).toBe(true);
    expect(isNotificationEventKey("entry.sla.breached")).toBe(true);
    expect(isNotificationEventKey("entry.transition")).toBe(true);
    expect(isNotificationEventKey("entry.signature.pending")).toBe(true);
    expect(isNotificationEventKey("entry.explode")).toBe(false);
  });
});
