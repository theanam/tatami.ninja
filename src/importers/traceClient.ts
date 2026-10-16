import { autoDigitize, type AutoDigitizeOptions, type AutoDigitizeResult, type RasterImage } from './autoDigitize';

/** Runs tracing in a Web Worker (it is heavy at high resolution); inline where workers are unavailable. */
export class TraceClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve(r: AutoDigitizeResult): void; reject(e: Error): void }>();

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, result, error } = e.data as { id: number; result?: AutoDigitizeResult; error?: string };
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (error || !result) p.reject(new Error(error ?? 'Trace failed'));
        else p.resolve(result);
      };
    } catch {
      this.worker = null;
    }
  }

  /** Trace; only the latest request's result is kept (older ones are superseded). */
  trace(image: RasterImage, opts: AutoDigitizeOptions): Promise<AutoDigitizeResult> {
    if (!this.worker) return Promise.resolve().then(() => autoDigitize(image, opts));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Copy the pixels: the same image is traced again when options change.
      this.worker!.postMessage({ id, image: { width: image.width, height: image.height, data: image.data }, opts });
    });
  }

  get latest() {
    return this.seq;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
