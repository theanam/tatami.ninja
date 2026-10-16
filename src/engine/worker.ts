/// <reference lib="webworker" />
import type { Project } from '../model/types';
import { renderThumbnail } from '../render/stitchRender';
import { generatePlan } from './plan';
import { checkWarnings } from './warnings';

export interface EngineRequest {
  id: number;
  project: Project;
  /** Also render a realistic thumbnail (PNG data URL) of this size. */
  thumbnail?: { width: number; height: number };
}

self.onmessage = async (e: MessageEvent<EngineRequest>) => {
  const { id, project, thumbnail } = e.data;
  try {
    const plan = generatePlan(project);
    const warnings = checkWarnings(project, plan);
    const thumb = thumbnail && plan.stitchCount ? await renderThumbnail(project, plan, thumbnail.width, thumbnail.height) : undefined;
    (self as unknown as Worker).postMessage({ id, plan, warnings, thumbnail: thumb }, [
      plan.xs.buffer,
      plan.ys.buffer,
      plan.cmds.buffer,
      plan.obj.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
