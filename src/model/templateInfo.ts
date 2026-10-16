/** Template list for Home (kept separate so Home does not load fonts and importers up front). */
export interface TemplateInfo {
  id:
    | 'round-patch'
    | 'left-chest'
    | 'name-tape'
    | 'shield-crest'
    | 'club-badge'
    | 'monogram'
    | 'heart'
    | 'mountain-patch'
    | 'leaf'
    | 'rose-line'
    | 'paw-print'
    | 'hex-patch';
  name: string;
  meta: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'round-patch', name: 'Round patch', meta: '100 × 100 mm · satin edge' },
  { id: 'left-chest', name: 'Left-chest logo', meta: '130 × 180 mm hoop' },
  { id: 'name-tape', name: 'Name tape', meta: 'Lettering · v1' },
  { id: 'shield-crest', name: 'Shield crest', meta: '130 × 180 mm · 2 colors' },
  { id: 'club-badge', name: 'Club badge', meta: '100 × 100 mm · arched text' },
  { id: 'monogram', name: 'Monogram', meta: '100 × 100 mm · satin ring' },
  { id: 'heart', name: 'Heart', meta: '100 × 100 mm · fill + satin edge' },
  { id: 'mountain-patch', name: 'Mountain patch', meta: '100 × 100 mm · 4 colors' },
  { id: 'leaf', name: 'Leaf', meta: '100 × 100 mm · fill + vein' },
  { id: 'rose-line', name: 'Rose line art', meta: '100 × 100 mm · run stitch' },
  { id: 'paw-print', name: 'Paw print', meta: '100 × 100 mm · 1 color' },
  { id: 'hex-patch', name: 'Hexagon patch', meta: '130 × 180 mm · lettering' },
];
