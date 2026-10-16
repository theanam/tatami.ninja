import { toast } from '../../components/ui';
import { layoutText, loadSpecFont, textObjectName } from '../../importers/lettering';
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
