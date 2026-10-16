import { toast } from '../../components/ui';
import { defaultTextSpec, layoutText, loadSpecFont, makeTextObject, textObjectName } from '../../importers/lettering';
import { geometryBounds } from '../../engine/geom';
import { newId } from '../../model/project';
import type { TextSpec } from '../../model/types';
import { useEditor } from '../../store/editor';

const pending = new Map<string, number>();

/**
 * Change a lettering object's text settings and re-lay its outlines.
 * Font loading is async; a newer edit to the same object wins over an older one.
 */
export async function applyTextSpec(id: string, patch: Partial<TextSpec>, key?: string): Promise<void> {
  const cur = useEditor.getState().project?.objects.find((o) => o.id === id);
  if (!cur?.text) return;
  const next: TextSpec = { ...cur.text, ...patch };
  const my = (pending.get(id) ?? 0) + 1;
  pending.set(id, my);
  try {
    const font = await loadSpecFont(next);
    if (pending.get(id) !== my) return;
    const latest = useEditor.getState().project?.objects.find((o) => o.id === id);
    if (!latest?.text) return;
    useEditor.getState().replaceObject(
      {
        ...latest,
        text: next,
        name: patch.content !== undefined ? textObjectName(next.content) : latest.name,
        geometry: layoutText(font, next),
      },
      key,
    );
  } catch {
    if (pending.get(id) === my) toast('Could not load that font. Check your connection and try again.', 'error');
    throw new Error('font');
  }
}

export type MonogramStyle = 'classic' | 'block';

/**
 * Three-letter monogram at the hoop center, grouped. Classic: the middle letter (the family
 * initial) is larger; block: all letters the same size.
 */
export async function addMonogram(initials: string, style: MonogramStyle, height: number, font = 'roboto-slab'): Promise<void> {
  const letters = Array.from(initials.trim()).slice(0, 3);
  if (!letters.length) return;
  const s = useEditor.getState();
  const thread = s.ensureActiveThread();
  const sizes = letters.map((_, i) => (style === 'classic' && letters.length === 3 ? (i === 1 ? height : Math.round(height * 0.62)) : height));
  const f = await loadSpecFont({ font });
  const gap = Math.round(height * 0.12);
  // Lay out each letter, then place them side by side, centered on the hoop, sharing a middle line.
  const laid = letters.map((ch, i) => {
    const spec = { ...defaultTextSpec(0, 0, ch), font, height: sizes[i] };
    const b = geometryBounds(layoutText(f, spec)) ?? { minX: 0, maxX: sizes[i] * 0.7, minY: -sizes[i], maxY: 0 };
    return { spec, w: b.maxX - b.minX, cx: (b.minX + b.maxX) / 2 };
  });
  const total = laid.reduce((t, l) => t + l.w, 0) + gap * (laid.length - 1);
  let x = -total / 2;
  const group = newId('g');
  const objs = laid.map((l) => {
    const spec = { ...l.spec, x: Math.round(x + l.w / 2 - l.cx), y: Math.round(l.spec.height / 2) };
    x += l.w + gap;
    return { ...makeTextObject(spec, layoutText(f, spec), thread), group };
  });
  s.addObjects(objs);
}
