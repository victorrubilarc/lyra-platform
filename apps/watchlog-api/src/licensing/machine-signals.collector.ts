import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus, platform } from "node:os";
import { promisify } from "node:util";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MachineSignals } from "@lyra/licensing";
import type { Env } from "../config/env.schema";

const execFileAsync = promisify(execFile);

/** Dependencias de SO inyectables (solo para tests; en runtime van las reales). */
export interface MachineSignalsDeps {
  readFile: (path: string, encoding: "utf8") => Promise<string>;
  execFile: (cmd: string, args: string[]) => Promise<{ stdout: string }>;
  cpus: typeof cpus;
  platform: typeof platform;
}

const REAL_DEPS: MachineSignalsDeps = {
  readFile: (path, encoding) => readFile(path, encoding),
  execFile: (cmd, args) => execFileAsync(cmd, args),
  cpus,
  platform,
};

/**
 * Recolecta señales del SO en el runtime real (Linux/Docker o Windows dev),
 * la contraparte IMPURA de `deriveFingerprint` (que es pura y solo hashea).
 *
 * Estabilidad bajo Docker — EL punto delicado de L1 (DECISIONS 2026-07-05):
 * dentro de un contenedor casi todas las señales "clásicas" son inestables al
 * recrearlo (`docker compose down/up`): el /etc/machine-id es DEL CONTENEDOR
 * (se regenera), el hostname es el ID del contenedor y las MAC son de
 * interfaces veth virtuales. Una señal inestable rompería la licencia de un
 * cliente LEGÍTIMO en cada recreación — peor que perder su entropía. Por eso:
 *
 *  - `machineId` = el del HOST, visible porque el compose bind-montea
 *    `/etc/machine-id` del host (ro) sobre el del contenedor. No viaja al
 *    copiar la carpeta de despliegue (a diferencia de una semilla en .env,
 *    que el socio avaro copia junto con todo lo demás).
 *  - `cpuModel` y `osPlatform` sí son estables (el contenedor ve la CPU real).
 *  - MACs y hostname se EXCLUYEN a propósito (inestables en contenedor).
 *
 * En Windows (solo dev): MachineGuid del registro, el equivalente estándar.
 * Si el machine-id no está disponible se degrada con WARN a cpu+plataforma
 * (huella débil pero determinista); nunca se lanza desde aquí.
 */
export function collectMachineSignals(
  machineIdFile: string,
  deps: MachineSignalsDeps = REAL_DEPS,
  onWarn: (msg: string) => void = () => undefined,
): Promise<MachineSignals> {
  return (async () => {
    const osPlatform = deps.platform();
    let machineId: string | undefined;

    if (osPlatform === "win32") {
      try {
        const { stdout } = await deps.execFile("reg", [
          "query",
          "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
          "/v",
          "MachineGuid",
        ]);
        machineId = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1];
      } catch (err) {
        onWarn(`No se pudo leer MachineGuid del registro: ${String(err)}`);
      }
    } else {
      try {
        machineId = (await deps.readFile(machineIdFile, "utf8")).trim() || undefined;
      } catch (err) {
        onWarn(
          `No se pudo leer el machine-id en "${machineIdFile}" (¿falta el bind-mount ` +
            `del host en el compose?): ${String(err)}`,
        );
      }
    }
    if (machineId === undefined) {
      onWarn(
        "Huella derivada SIN machine-id (solo CPU + plataforma): es débil y puede " +
          "coincidir entre máquinas similares. Corrige la señal antes de emitir licencia.",
      );
    }

    return {
      machineId,
      cpuModel: deps.cpus()[0]?.model,
      osPlatform,
      // MACs y hostname EXCLUIDOS: inestables al recrear el contenedor (ver arriba).
    } satisfies MachineSignals;
  })();
}

/** Envoltorio inyectable del recolector; cachea las señales (estables por proceso). */
@Injectable()
export class MachineSignalsCollector {
  private readonly logger = new Logger(MachineSignalsCollector.name);
  private cached?: Promise<MachineSignals>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  collect(): Promise<MachineSignals> {
    this.cached ??= collectMachineSignals(
      this.config.get("LICENSE_MACHINE_ID_FILE", { infer: true }),
      undefined,
      (msg) => this.logger.warn(msg),
    );
    return this.cached;
  }
}
