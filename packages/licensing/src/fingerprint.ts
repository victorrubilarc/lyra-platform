import { createHash } from "node:crypto";

import type { MachineSignals } from "./types.js";

/**
 * Deriva la huella de máquina (node-lock, capa 2 de LICENSING_STRATEGY §6)
 * a partir de señales del host. PURA: recibe las señales ya recolectadas —
 * la recolección real desde el SO es responsabilidad de L1. Mismas señales ⇒
 * misma huella, sin importar el orden de las MAC ni de las claves `extra`
 * (se canonicaliza antes de hashear). Señales vacías/undefined se ignoran.
 *
 * HONESTIDAD (LICENSING_STRATEGY §4): un clon PERFECTO de la VM replica estas
 * señales y produce la MISMA huella — el clon no se PREVIENE aquí, se DETECTA
 * por linaje rotatorio (`renewalCounter` + `nonce`) en la renovación
 * challenge-response (flujo L4).
 *
 * @returns hash sha256 truncado a 32 hex (128 bits): corto para el flujo por
 * USB (`solicitud.lreq` legible/dictable por humanos) y de sobra como espacio
 * de colisión para docenas de instalaciones.
 * @throws si no llega ninguna señal no vacía (una huella "de nada" sería la
 * misma en todas las máquinas y anularía el node-lock).
 */
export function deriveFingerprint(signals: MachineSignals): string {
  const entries: Array<[string, string]> = [];
  const push = (key: string, value: string | undefined): void => {
    const text = value?.trim();
    if (text !== undefined && text.length > 0) entries.push([key, text]);
  };

  push("machineId", signals.machineId);
  push("cpuModel", signals.cpuModel);
  push("diskSerial", signals.diskSerial);
  push("hostname", signals.hostname);
  push("osPlatform", signals.osPlatform);
  for (const mac of [...(signals.macAddresses ?? [])].sort()) {
    push("mac", mac);
  }
  const extra = signals.extra ?? {};
  for (const key of Object.keys(extra).sort()) {
    push(`extra.${key}`, extra[key]);
  }

  if (entries.length === 0) {
    throw new Error("deriveFingerprint: se requiere al menos una señal de máquina no vacía");
  }
  // JSON.stringify de la lista ordenada = serialización canónica sin
  // ambigüedad de separadores (una señal no puede "disfrazarse" de otra).
  return createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex").slice(0, 32);
}
