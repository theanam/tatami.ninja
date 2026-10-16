import { useState } from 'react';
import { Dialog, SegmentedControl, toast } from '../../components/ui';
import { importSvg } from '../../importers/svg';
import { LIBRARY, LIBRARY_CATEGORIES, type LibraryCategory, type LibraryItem } from '../../model/library';
import { useEditor } from '../../store/editor';

/** Built-in shapes, frames and motifs to drop into the design. */
export function LibraryDialog({ onClose }: { onClose(): void }) {
  const [cat, setCat] = useState<LibraryCategory>('shapes');
  const insert = (item: LibraryItem) => {
    const s = useEditor.getState();
    const p = s.project!;
    try {
      const res = importSvg(item.svg, { hoop: p.hoop, threads: p.threads });
      s.addObjects(res.objects, res.threads);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  return (
    <Dialog title="Design library" onClose={onClose} maxWidth={640}>
      <div className="lib-body">
        <SegmentedControl<LibraryCategory> label="Category" grid value={cat} onChange={setCat} options={LIBRARY_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
        <div className="lib-grid" role="list" aria-label="Designs">
          {LIBRARY.filter((i) => i.category === cat).map((item) => (
            <button key={item.id} role="listitem" className="lib-tile" aria-label={`Add ${item.name}`} title={item.name} onClick={() => insert(item)}>
              <span className="lib-art" dangerouslySetInnerHTML={{ __html: item.svg }} />
              <span className="lib-name">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
