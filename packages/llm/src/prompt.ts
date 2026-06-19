import type { SummaryGrounding } from "./types.js";

/**
 * Prompt VERSIONADO del resumen de turno (AC-IA-7). Cambiarlo = subir la versión, para
 * que el registro de generaciones sea auditable y reproducible. El sistema fuerza
 * GROUNDING ESTRICTO: el modelo solo puede usar el bloque DATOS, sin inventar nada.
 */
export const SUMMARY_PROMPT_VERSION = "v1";

export const SUMMARY_SYSTEM_PROMPT = [
  "Eres el asistente de operaciones de Lyra WatchLog, una plataforma de bitácoras industriales.",
  "Tu tarea es redactar el RESUMEN DE ENTREGA DE TURNO para que el turno entrante entienda el estado al cierre.",
  "",
  "Reglas ESTRICTAS (no negociables):",
  "- Usa ÚNICAMENTE los datos del bloque DATOS. NO inventes cifras, equipos, nombres, causas ni eventos.",
  "- Si un dato no está en DATOS, NO lo menciones. Toda cifra debe poder rastrearse a DATOS.",
  "- No diagnostiques ni recomiendes acciones: solo resume el estado del turno para la entrega.",
  "- Español de Chile, tono profesional y conciso. Máximo ~180 palabras.",
  "- Redacta en prosa breve, cubriendo en este orden cuando aplique: estado general, incidencias,",
  "  excepciones (lecturas fuera de umbral), acciones/reportes pendientes, rondas, registros del turno y pendientes.",
  "- No uses tablas markdown ni emojis.",
  "- Responde SOLO con el resumen final, sin explicar tu proceso ni tu razonamiento.",
].join("\n");

/**
 * Serializa el grounding a un bloque DATOS enumerado y legible. Determinista (mismo
 * input ⇒ mismo bloque) para que el prompt cachee y el resultado sea auditable.
 */
export function buildSummaryUserPrompt(g: SummaryGrounding): string {
  const lines: string[] = [];
  lines.push("DATOS DEL TURNO (única fuente permitida):");
  lines.push(`- Nodo: ${g.nodeName}`);
  lines.push(`- Turno: ${g.shiftLabel}`);
  lines.push(`- Día operacional: ${g.operationalDay}`);
  lines.push(`- Estado general al cierre: ${g.generalStatusLabel}`);
  lines.push(`- Registros sellados en el turno: ${g.entriesCount}`);

  lines.push(`- Rondas: ${g.rounds.done} cumplidas, ${g.rounds.overdue} vencidas de ${g.rounds.total}.`);

  if (g.incidents.length > 0) {
    lines.push(`- Incidencias activas en el alcance (${g.incidents.length}):`);
    for (const i of g.incidents) {
      const flags: string[] = [];
      if (i.critical) flags.push("crítica");
      if (i.overdue) flags.push("plazo vencido");
      if (i.stateName) flags.push(`estado: ${i.stateName}`);
      flags.push(`severidad ${i.severity}`);
      lines.push(`  • ${i.folio} — ${i.title} (${flags.join(", ")})`);
    }
  } else {
    lines.push("- Incidencias activas en el alcance: ninguna.");
  }

  if (g.exceptions.length > 0) {
    lines.push(`- Excepciones del turno (${g.exceptions.length}):`);
    for (const e of g.exceptions) {
      const label = e.fieldLabel ? `${e.fieldLabel}: ` : "";
      lines.push(`  • [${e.kind}] ${label}${e.detail}`);
    }
  }

  if (g.followups.length > 0) {
    lines.push(`- Acciones/Reportes pendientes (${g.followups.length}):`);
    for (const f of g.followups) {
      lines.push(`  • [${f.kind}] ${f.code} — ${f.title}${f.overdue ? " (vencido)" : ""}`);
    }
  }

  if (g.openItems.length > 0) {
    lines.push(`- Pendientes que ruedan al turno entrante (${g.openItems.length}):`);
    for (const t of g.openItems) lines.push(`  • ${t}`);
  } else {
    lines.push("- Pendientes para el turno entrante: ninguno adicional.");
  }

  lines.push("");
  lines.push("Redacta el resumen de entrega de turno usando solo los DATOS anteriores.");
  return lines.join("\n");
}
