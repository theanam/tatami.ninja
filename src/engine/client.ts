import type { Project, StitchPlan } from '../model/types';
import { generatePlan } from './plan';
import { checkWarnings, type Warning } from './warnings';

export interface EngineResult {
  plan: StitchPlan;
  warnings: Warning[];
}

type Pending = { resolve: (r: EngineResult) => void; reject: (e: Error) => void };

/**
 * Runs the stitch engine in a Web Worker so the UI never blocks.
 * Falls back to running inline where workers are unavailable (tests, old browsers).
 */
export class EngineClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(useWorker = typeof Worker !== 'undefined') {
    if (useWorker) {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent) => {
          const { id, plan, warnings, error } = e.data as { id: number; plan?: StitchPlan; warnings?: Warning[]; error?: string };
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          if (error || !plan) p.reject(new Error(error ?? 'Engine failed'));
          else p.resolve({ plan, warnings: warnings ?? [] });
        };
        this.worker.onerror = () => {
          // Worker failed to load (e.g. file:// origin): fall back to inline mode.
          this.worker = null;
          for (const [, p] of this.pending) p.reject(new Error('Engine worker unavailable'));
          this.pending.clear();
        };
      } catch {
        this.worker = null;
      }
    }
  }

  /** Compute stitches for a project. */
  run(project: Project): Promise<EngineResult> {
    if (!this.worker) return Promise.resolve(computeInline(project));
    const id = ++this.seq;
    return new Promise<EngineResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, project });
    }).catch(() => computeInline(project));
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}

export function computeInline(project: Project): EngineResult {
  const plan = generatePlan(project);
  return { plan, warnings: checkWarnings(project, plan) };
}
