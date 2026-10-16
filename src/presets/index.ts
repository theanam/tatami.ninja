import type { FileFormat, MachineBrand, ThreadChart, UnderlayType } from '../model/types';

export interface MachinePreset {
  id: MachineBrand;
  name: string;
  format: FileFormat | null;
  /** Label for the wizard card, e.g. "Saves as PES". */
  hint: string;
}

export const MACHINES: MachinePreset[] = [
  { id: 'brother', name: 'Brother', format: 'PES', hint: 'Saves as PES' },
  { id: 'janome', name: 'Janome', format: 'JEF', hint: 'Saves as JEF' },
  { id: 'bernina', name: 'Bernina', format: 'EXP', hint: 'Saves as EXP' },
  { id: 'husqvarna', name: 'Husqvarna Viking', format: 'VP3', hint: 'Saves as VP3' },
  { id: 'commercial', name: 'Commercial single-head', format: 'DST', hint: 'Saves as DST' },
  { id: 'other', name: 'Something else', format: null, hint: 'Choose the format at export' },
];

export interface HoopPreset {
  id: string;
  /** 0.1 mm */
  width: number;
  height: number;
  label: string;
  inches: string;
  /** Cap frames (sewn on a curved cap front). */
  cap?: boolean;
}

export const HOOPS: HoopPreset[] = [
  { id: '100x100', width: 1000, height: 1000, label: 'Small', inches: '4 × 4 in' },
  { id: '130x180', width: 1300, height: 1800, label: 'Medium', inches: '5 × 7 in' },
  { id: '160x260', width: 1600, height: 2600, label: 'Large', inches: '6 × 10 in' },
  { id: '200x300', width: 2000, height: 3000, label: 'Extra large', inches: '8 × 12 in' },
  { id: 'cap-130x60', width: 1300, height: 600, label: 'Cap frame', inches: '5 × 2.4 in', cap: true },
  { id: 'cap-360x70', width: 3600, height: 700, label: 'Wide cap 270°', inches: '14 × 2.75 in', cap: true },
];

/** Flat hoops only (cap frames are chosen deliberately, never automatically). */
export const FLAT_HOOPS = HOOPS.filter((h) => !h.cap);

export function isCapHoop(id: string): boolean {
  return !!HOOPS.find((h) => h.id === id)?.cap;
}

export interface FabricPreset {
  id: string;
  name: string;
  /** Short card hint. */
  hint: string;
  /** Sidebar note. */
  note: string;
  /** Tatami row spacing, 0.1 mm. */
  rowSpacing: number;
  /** Satin stitch spacing, 0.1 mm. */
  satinDensity: number;
  fillUnderlay: UnderlayType;
  satinUnderlay: UnderlayType;
  /** Pull compensation, 0.1 mm. */
  pullComp: number;
  /** Swatch / realistic background colors. */
  color: string;
  weave: string;
  texture: 'plain' | 'twill' | 'denim' | 'knit' | 'fleece' | 'terry' | 'felt' | 'canvas';
  /** Cap fabrics: sew center-out and bottom-up. */
  cap?: boolean;
}

export const FABRICS: FabricPreset[] = [
  {
    id: 'cotton', name: 'Cotton (woven)', hint: 'Standard density',
    note: 'Standard tatami density and a center-run underlay.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'center-run', satinUnderlay: 'center-run', pullComp: 2,
    color: '#E6E2D8', weave: '#D4CFC2', texture: 'plain',
  },
  {
    id: 'cotton-twill', name: 'Cotton twill', hint: 'Caps, bags, workwear',
    note: 'Medium density with edge-run underlay. A good default for caps, bags and workwear.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'edge-run', satinUnderlay: 'edge-run+zigzag', pullComp: 3,
    color: '#D9D2C3', weave: '#C7BFAC', texture: 'twill',
  },
  {
    id: 'denim', name: 'Denim', hint: 'More pull compensation',
    note: 'Slightly denser fills and more pull compensation to hold the heavier weave.',
    rowSpacing: 3, satinDensity: 3, fillUnderlay: 'edge-run', satinUnderlay: 'edge-run+zigzag', pullComp: 4,
    color: '#3F5B8F', weave: '#2E4673', texture: 'denim',
  },
  {
    id: 'knit', name: 'Knit / T-shirt', hint: 'Lighter fill, extra underlay',
    note: 'Lighter fills and zigzag underlay so the knit does not stretch. Use a cut-away stabilizer.',
    rowSpacing: 5, satinDensity: 4, fillUnderlay: 'zigzag', satinUnderlay: 'edge-run+zigzag', pullComp: 4,
    color: '#8E99A6', weave: '#7B8694', texture: 'knit',
  },
  {
    id: 'fleece', name: 'Fleece', hint: 'Tack-down underlay for pile',
    note: 'Tack-down underlay keeps stitches on top of the pile.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'tatami', satinUnderlay: 'edge-run+zigzag', pullComp: 3,
    color: '#B24A5B', weave: '#9C3D4D', texture: 'fleece',
  },
  {
    id: 'towel', name: 'Towel / terry', hint: 'Knock-down layer first',
    note: 'Sews a light knock-down layer first so loops do not poke through.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'knock-down', satinUnderlay: 'knock-down', pullComp: 3,
    color: '#EEEAE1', weave: '#DCD7CB', texture: 'terry',
  },
  {
    id: 'felt', name: 'Felt', hint: 'Stable, light underlay',
    note: 'Stable fabric: light underlay and standard density.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'center-run', satinUnderlay: 'center-run', pullComp: 2,
    color: '#5B8662', weave: '#527A58', texture: 'felt',
  },
  {
    id: 'canvas', name: 'Canvas', hint: 'Totes, heavy fabric',
    note: 'Heavy fabric: standard density with extra pull compensation.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'edge-run', satinUnderlay: 'edge-run+zigzag', pullComp: 5,
    color: '#C8B48F', weave: '#B39E78', texture: 'canvas',
  },
  {
    id: 'cap-structured', name: 'Cap · structured', hint: 'Stiff front, buckram backing', cap: true,
    note: 'Structured caps: edge-run and zigzag underlay hold the stiff front, with extra pull compensation. Sew from the center out and bottom up, and keep lettering at least 6 mm tall.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'edge-run+zigzag', satinUnderlay: 'edge-run+zigzag', pullComp: 5,
    color: '#2F3B52', weave: '#27324A', texture: 'twill',
  },
  {
    id: 'cap-unstructured', name: 'Cap · unstructured', hint: 'Soft "dad" caps', cap: true,
    note: 'Soft caps flex while sewing: tatami underlay, more pull compensation and a firm tear-away backing. Sew from the center out and bottom up.',
    rowSpacing: 4, satinDensity: 4, fillUnderlay: 'tatami', satinUnderlay: 'edge-run+zigzag', pullComp: 6,
    color: '#8A7A62', weave: '#7A6B54', texture: 'twill',
  },
];

export const THREAD_CHARTS: { id: ThreadChart; name: string }[] = [
  { id: 'madeira', name: 'Madeira' },
  { id: 'isacord', name: 'Isacord' },
  { id: 'robison-anton', name: 'Robison-Anton' },
];

export const UNDERLAY_OPTIONS: { id: UnderlayType; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'center-run', name: 'Center run' },
  { id: 'edge-run', name: 'Edge run' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'edge-run+zigzag', name: 'Edge run + zigzag' },
  { id: 'tatami', name: 'Tatami' },
  { id: 'knock-down', name: 'Knock-down' },
];

export const DEFAULT_SPM = 800;

export function getFabric(id: string): FabricPreset {
  return FABRICS.find((f) => f.id === id) ?? FABRICS[1];
}

export function getMachine(id: string): MachinePreset {
  return MACHINES.find((m) => m.id === id) ?? MACHINES[5];
}

export function hoopLabel(h: { width: number; height: number }): string {
  return `${fmtMm(h.width)} × ${fmtMm(h.height)}`;
}

function fmtMm(units: number): string {
  const mm = units / 10;
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}
