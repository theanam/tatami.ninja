/** Template list for Home (kept separate so Home does not load fonts and importers up front). */
export interface TemplateInfo {
  id: 'round-patch' | 'left-chest' | 'name-tape' | 'shield-crest';
  name: string;
  meta: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'round-patch', name: 'Round patch', meta: '100 × 100 mm · satin edge' },
  { id: 'left-chest', name: 'Left-chest logo', meta: '130 × 180 mm hoop' },
  { id: 'name-tape', name: 'Name tape', meta: 'Lettering · v1' },
  { id: 'shield-crest', name: 'Shield crest', meta: '130 × 180 mm · 2 colors' },
];
