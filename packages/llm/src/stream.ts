import type { LlmResult, LlmStream } from "./types.js";

/**
 * Implementación reutilizable de `LlmStream`. Envuelve un async generator de deltas de texto
 * (el adapter lo produce desde el SDK del proveedor) y resuelve `finalResult()` cuando el
 * stream terminó. El adapter pasa un `finalize(fullText)` que construye el `LlmResult` leyendo
 * la metadata de costo que capturó durante la generación (tokens/latencia, en su closure).
 *
 * Garantías: el texto se acumula una sola vez; si el generador lanza (red caída, abort, error
 * del proveedor), `finalResult()` REJECTa con el mismo error — el gateway lo traduce a
 * degradación elegante (AC-IA-5).
 */
export class CollectingLlmStream implements LlmStream {
  private fullText = "";
  private settled = false;
  private resolveDone!: (r: LlmResult) => void;
  private rejectDone!: (e: unknown) => void;
  private readonly done: Promise<LlmResult>;

  constructor(
    private readonly deltas: AsyncGenerator<string>,
    private readonly finalize: (fullText: string) => LlmResult,
  ) {
    this.done = new Promise<LlmResult>((res, rej) => {
      this.resolveDone = res;
      this.rejectDone = rej;
    });
    // Evita un unhandledRejection si nadie llegó a llamar finalResult() todavía.
    this.done.catch(() => undefined);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    try {
      for await (const delta of this.deltas) {
        if (delta) this.fullText += delta;
        yield delta;
      }
      if (!this.settled) {
        this.settled = true;
        this.resolveDone(this.finalize(this.fullText));
      }
    } catch (err) {
      if (!this.settled) {
        this.settled = true;
        this.rejectDone(err);
      }
      throw err;
    }
  }

  finalResult(): Promise<LlmResult> {
    return this.done;
  }
}
