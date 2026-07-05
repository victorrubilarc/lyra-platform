import { describe, expect, it } from "vitest";

import { deriveFingerprint } from "./fingerprint.js";
import type { MachineSignals } from "./types.js";

const señales: MachineSignals = {
  machineId: "a1b2-serverA",
  cpuModel: "Xeon-E5",
  diskSerial: "WD-77Z",
  macAddresses: ["00:1A:2B", "00:3C:4D"],
  hostname: "srv-planta-norte",
  osPlatform: "linux",
  extra: { tpm: "no-presente" },
};

describe("huella de máquina (node-lock, capa 2)", () => {
  it("es estable: mismas señales ⇒ misma huella", () => {
    expect(deriveFingerprint(señales)).toBe(deriveFingerprint({ ...señales }));
  });

  it("tiene formato de 32 hex (sha256 truncado a 128 bits)", () => {
    expect(deriveFingerprint(señales)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("es canónica: el orden de las MAC y de las claves extra no cambia la huella", () => {
    const desordenadas: MachineSignals = {
      ...señales,
      macAddresses: ["00:3C:4D", "00:1A:2B"],
      extra: { tpm: "no-presente" },
    };
    expect(deriveFingerprint(desordenadas)).toBe(deriveFingerprint(señales));
  });

  it("cambiar una señal (otra máquina) ⇒ otra huella (T4 se apoya en esto)", () => {
    const servidorB = { ...señales, machineId: "z9y8-serverB" };
    expect(deriveFingerprint(servidorB)).not.toBe(deriveFingerprint(señales));
  });

  it("ignora señales vacías/undefined sin alterar las demás", () => {
    const conRuido: MachineSignals = { ...señales, diskSerial: undefined, hostname: "  " };
    const sinRuido: MachineSignals = { ...señales };
    delete sinRuido.diskSerial;
    delete sinRuido.hostname;
    expect(deriveFingerprint(conRuido)).toBe(deriveFingerprint(sinRuido));
  });

  it("recorta espacios accidentales de la recolección", () => {
    expect(deriveFingerprint({ machineId: "  abc  " })).toBe(deriveFingerprint({ machineId: "abc" }));
  });

  it("sin ninguna señal útil ⇒ lanza (una huella vacía anularía el node-lock)", () => {
    expect(() => deriveFingerprint({})).toThrow(/señal/);
    expect(() => deriveFingerprint({ machineId: "", macAddresses: [] })).toThrow(/señal/);
  });

  it("una señal no puede disfrazarse de otra (serialización canónica sin ambigüedad)", () => {
    const a = deriveFingerprint({ machineId: "x", cpuModel: "y" });
    const b = deriveFingerprint({ machineId: "x\ncpuModel=y" });
    expect(a).not.toBe(b);
  });
});
