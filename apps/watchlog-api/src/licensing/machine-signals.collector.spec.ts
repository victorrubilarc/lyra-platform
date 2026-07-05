import { describe, expect, it, vi } from "vitest";
import { deriveFingerprint } from "@lyra/licensing";
import { collectMachineSignals, type MachineSignalsDeps } from "./machine-signals.collector";

function deps(over: Partial<MachineSignalsDeps>): MachineSignalsDeps {
  return {
    readFile: vi.fn(async () => "machine-id-del-host\n"),
    execFile: vi.fn(async () => ({ stdout: "" })),
    cpus: vi.fn(() => [{ model: "AMD EPYC 7543" }] as never) as never,
    platform: vi.fn(() => "linux") as never,
    ...over,
  };
}

describe("collectMachineSignals", () => {
  it("linux: lee el machine-id del archivo (host) y lo recorta", async () => {
    const signals = await collectMachineSignals("/etc/machine-id", deps({}));
    expect(signals.machineId).toBe("machine-id-del-host");
    expect(signals.cpuModel).toBe("AMD EPYC 7543");
    expect(signals.osPlatform).toBe("linux");
  });

  it("EXCLUYE MACs y hostname (inestables al recrear el contenedor)", async () => {
    const signals = await collectMachineSignals("/etc/machine-id", deps({}));
    expect(signals.macAddresses).toBeUndefined();
    expect(signals.hostname).toBeUndefined();
  });

  it("es ESTABLE: mismas señales ⇒ misma huella en llamadas repetidas", async () => {
    const d = deps({});
    const a = deriveFingerprint(await collectMachineSignals("/etc/machine-id", d));
    const b = deriveFingerprint(await collectMachineSignals("/etc/machine-id", d));
    expect(a).toBe(b);
  });

  it("windows: parsea MachineGuid de la salida de reg query", async () => {
    const signals = await collectMachineSignals(
      "/etc/machine-id",
      deps({
        platform: vi.fn(() => "win32") as never,
        execFile: vi.fn(async () => ({
          stdout:
            "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n" +
            "    MachineGuid    REG_SZ    9f3f0a1e-1111-2222-3333-444455556666\r\n",
        })),
      }),
    );
    expect(signals.machineId).toBe("9f3f0a1e-1111-2222-3333-444455556666");
    expect(signals.osPlatform).toBe("win32");
  });

  it("machine-id ilegible: degrada con WARN a cpu+plataforma, sin lanzar", async () => {
    const warn = vi.fn();
    const signals = await collectMachineSignals(
      "/etc/machine-id",
      deps({ readFile: vi.fn(async () => Promise.reject(new Error("ENOENT"))) }),
      warn,
    );
    expect(signals.machineId).toBeUndefined();
    expect(signals.cpuModel).toBe("AMD EPYC 7543");
    // Un warn por la lectura + otro por la huella débil.
    expect(warn).toHaveBeenCalledTimes(2);
    // La huella sigue siendo derivable (≥1 señal no vacía).
    expect(deriveFingerprint(signals)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("archivo vacío cuenta como machine-id ausente (huella débil avisada)", async () => {
    const warn = vi.fn();
    const signals = await collectMachineSignals(
      "/etc/machine-id",
      deps({ readFile: vi.fn(async () => "   \n") }),
      warn,
    );
    expect(signals.machineId).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
