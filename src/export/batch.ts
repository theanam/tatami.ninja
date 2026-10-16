import { generatePlan } from '../engine/plan';
import { layoutText, loadSpecFont, textObjectName } from '../importers/lettering';
import { slugify } from '../model/project';
import type { FileFormat, Project } from '../model/types';
import { FORMATS } from '../formats';
import { encodeFormat } from './export';

/** Names from a pasted list: one per line, blanks and duplicates dropped. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s) && (seen.add(s), true));
}

/** One stitch file per name, with the chosen lettering object's text replaced. */
export async function batchFiles(
  project: Project,
  textId: string,
  names: string[],
  format: FileFormat,
  base: string,
  fetcher?: (url: string) => Promise<ArrayBuffer>,
): Promise<{ name: string; data: Uint8Array }[]> {
  const obj = project.objects.find((o) => o.id === textId);
  if (!obj?.text) return [];
  const font = await loadSpecFont(obj.text, fetcher);
  const used = new Map<string, number>();
  return names.map((n) => {
    const spec = { ...obj.text!, content: n };
    const p: Project = {
      ...project,
      objects: project.objects.map((o) => (o.id === textId ? { ...o, text: spec, name: textObjectName(n), geometry: layoutText(font, spec) } : o)),
    };
    let slug = slugify(n) || 'name';
    const k = (used.get(slug) ?? 0) + 1;
    used.set(slug, k);
    if (k > 1) slug += `-${k}`;
    return { name: `${base}-${slug}.${FORMATS[format].ext}`, data: encodeFormat(format, p, generatePlan(p)) };
  });
}
