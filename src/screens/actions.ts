import { computeInline } from '../engine/client';
import { importSvg } from '../importers/svg';
import { ARTWORK_ACCEPT, artworkKind, loadImage, pickFile, projectFromStitchFile, readAsBytes, readAsDataUrl, readAsText, STITCH_FILE_ACCEPT } from '../importers/files';
import { createProject, newId, parseProjectJson } from '../model/project';
import type { Backdrop, Project } from '../model/types';
import { HOOPS } from '../presets';
import { renderThumbnail } from '../render/stitchRender';
import { saveProject } from '../storage/db';

/** Save a project with a fresh thumbnail. */
export async function persistNew(project: Project): Promise<string> {
  const p = { ...project, id: project.id ?? newId('p') };
  let thumbnail: string | undefined;
  let stitchCount = 0;
  try {
    const { plan } = computeInline(p);
    stitchCount = plan.stitchCount;
    if (plan.stitchCount) thumbnail = renderThumbnail(p, plan);
  } catch {
    /* thumbnail is best effort */
  }
  await saveProject(p, { thumbnail, stitchCount });
  return p.id!;
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled design';

/** Fit an image into the hoop (80% of the hoop), centered. */
export async function backdropFromImage(dataUrl: string, hoop: { width: number; height: number }): Promise<Backdrop> {
  let w = 4;
  let h = 3;
  try {
    const img = await loadImage(dataUrl);
    w = img.naturalWidth || 4;
    h = img.naturalHeight || 3;
  } catch {
    /* keep aspect fallback */
  }
  const s = Math.min((hoop.width * 0.8) / w, (hoop.height * 0.8) / h);
  const width = Math.round(w * s);
  const height = Math.round(h * s);
  return { dataUrl, x: -Math.round(width / 2), y: -Math.round(height / 2), width, height, opacity: 0.4, locked: true, visible: true };
}

export async function projectFromFile(file: File): Promise<{ project: Project; note?: string }> {
  const kind = artworkKind(file.name, file.type);
  const base = () => createProject({ name: baseName(file.name), machine: 'brother', hoop: HOOPS[1], fabric: 'cotton-twill' });
  switch (kind) {
    case 'project': {
      const p = parseProjectJson(await readAsText(file));
      return { project: { ...p, id: newId('p') } };
    }
    case 'stitch':
      return { project: projectFromStitchFile(file.name, await readAsBytes(file)) };
    case 'svg': {
      const p = base();
      const res = importSvg(await readAsText(file), { hoop: p.hoop, threads: p.threads });
      return { project: { ...p, threads: res.threads, objects: res.objects } };
    }
    case 'raster': {
      const p = base();
      const backdrop = await backdropFromImage(await readAsDataUrl(file), p.hoop);
      return {
        project: { ...p, backdrop },
        note: 'Image added as a tracing backdrop. Trace it with the drawing tools, or use Auto-digitize.',
      };
    }
    default:
      throw new Error('Unsupported file. Use an SVG, PNG, JPG, a stitch file (DST, PES, JEF, EXP) or a .tatami.json project.');
  }
}

export async function pickArtwork(): Promise<File | null> {
  return pickFile(ARTWORK_ACCEPT);
}

export async function pickStitchFile(): Promise<File | null> {
  return pickFile(STITCH_FILE_ACCEPT);
}
