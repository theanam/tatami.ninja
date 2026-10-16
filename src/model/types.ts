/**
 * tatami.ninja project format: objects, not stitches.
 * All lengths are integers in 0.1 mm units. Origin = hoop center, +y down.
 */

export type Pt = [number, number];

export interface Ring {
  points: Pt[];
  holes?: Pt[][];
}

export type RailGeometry =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'polyline'; points: Pt[] };

export type Geometry =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'polygon'; points: Pt[]; holes?: Pt[][] }
  | { kind: 'polyline'; points: Pt[] }
  | { kind: 'compound'; parts: Ring[] }
  | { kind: 'satin'; railA: RailGeometry; railB: RailGeometry; rungs: 'auto' | [Pt, Pt][] }
  /** Raw stitches from an opened stitch file: flat [x, y, cmd, x, y, cmd, …]. */
  | { kind: 'stitches'; data: number[] };

export type FillPattern = 'rows' | 'radial' | 'spiral' | 'circles' | 'net' | 'zigzag-net' | 'cross' | 'lines' | 'motif' | 'stipple' | 'echo';

export type RunStyle = 'single' | 'triple' | 'stem' | 'chain' | 'candlewick' | 'e' | 'v' | 'motif';

export type StitchType = 'run' | 'satin' | 'tatami' | 'contour' | 'applique' | 'stitches';

export type UnderlayType =
  | 'none'
  | 'center-run'
  | 'edge-run'
  | 'zigzag'
  | 'edge-run+zigzag'
  | 'tatami'
  | 'knock-down';

export interface ObjectParams {
  /** Tatami fill angle in degrees. */
  angleDeg?: number;
  /** Fill pattern for tatami objects (default: rows). */
  fillPattern?: FillPattern;
  /** Line spacing of open patterns (net, zigzag net, cross), or the gap between motif rows (0.1 mm). */
  patternSpacing?: number;
  /** Stipple layout seed (change for a different meander). */
  seed?: number;
  /** Motif id for motif fills and motif runs. */
  motif?: string;
  /** Motif cell width (0.1 mm). */
  motifSize?: number;
  /** Tatami: random stitch offsets per row instead of the regular brick (hides lines). */
  randomShift?: boolean;
  /** Tatami row spacing (0.1 mm). */
  rowSpacing?: number;
  /** Stitch length (0.1 mm) for run and tatami. */
  stitchLength?: number;
  /** Run repeats: 1 = single, 3 = triple/bean. */
  repeats?: number;
  /** Decorative run style (default: single, or triple when repeats = 3). */
  runStyle?: RunStyle;
  /** Width of stem, chain and E/V stitches, and candlewick knot size (0.1 mm). */
  styleWidth?: number;
  /** Candlewick knot spacing (0.1 mm). */
  knotSpacing?: number;
  /** Satin density: spacing between satin stitches (0.1 mm). */
  density?: number;
  /** Satin width (0.1 mm) when the satin follows a single path/outline. */
  width?: number;
  shortStitches?: boolean;
  /** Split satin stitches wider than this (0.1 mm). */
  splitAbove?: number;
  /** Contour fill line spacing (0.1 mm). */
  contourSpacing?: number;
}

export interface AdvancedParams {
  underlay?: 'inherit' | UnderlayType;
  pullComp?: 'inherit' | number;
  tieIn?: boolean;
  tieOff?: boolean;
  trimBefore?: boolean;
  trimAfter?: boolean;
}

export type TextWarp = 'arch' | 'bulge' | 'pinch' | 'wave' | 'rise' | 'peak';

export interface TextSpec {
  content: string;
  /** Built-in font id (e.g. `geist`) or a Google Font as `gf:<fontsource id>`. */
  font: string;
  /** Font weight for Google Fonts (built-ins have one weight). */
  weight?: number;
  /** Cap height in 0.1 mm. */
  height: number;
  /** Extra letter spacing in 0.1 mm. */
  spacing: number;
  /** Arc radius in 0.1 mm; 0 = straight baseline. Negative curves downward. */
  arc: number;
  /** Text around a whole circle (radius fits the text) or on a spiral (starts at |arc|). */
  shape?: 'circle' | 'spiral';
  /** Envelope distortion of the letters. */
  warp?: TextWarp;
  /** Warp strength, 0–100 (%). */
  warpAmount?: number;
  /** Baseline center. */
  x: number;
  y: number;
}

export interface StitchObject {
  id: string;
  name: string;
  type: StitchType;
  thread: string;
  visible: boolean;
  locked: boolean;
  geometry: Geometry;
  params: ObjectParams;
  advanced: AdvancedParams;
  /** Optional entry and exit points (v1 sequencing). */
  entry?: Pt | null;
  exit?: Pt | null;
  /** Present on lettering objects; geometry holds the computed glyph outlines. */
  text?: TextSpec;
  /** Objects sharing a group id select and move together. */
  group?: string;
}

export interface Thread {
  id: string;
  name: string;
  hex: string;
  chartCode: string | null;
}

export interface Backdrop {
  dataUrl: string;
  /** Top-left corner and size, 0.1 mm. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
}

export type MachineBrand = 'brother' | 'janome' | 'bernina' | 'husqvarna' | 'commercial' | 'other';
export type FileFormat = 'PES' | 'DST' | 'JEF' | 'EXP' | 'VP3' | 'XXX' | 'HUS';
export type ThreadChart = 'madeira' | 'isacord' | 'robison-anton';

export interface Project {
  format: 'tatami-project';
  version: 1;
  id?: string;
  name: string;
  units: 'mm' | 'in';
  machine: { brand: MachineBrand; defaultFormat: FileFormat | null };
  hoop: { id: string; width: number; height: number };
  fabricPreset: string;
  threadChart: ThreadChart;
  threads: Thread[];
  objects: StitchObject[];
  backdrop?: Backdrop | null;
  /** Cut fills where later objects sew over them. */
  removeHidden?: boolean;
  /** Machine speed used for sew-time estimates (stitches per minute). */
  spm?: number;
  /** 'stitch-file' projects come from an opened DST/PES: recolor only. */
  source?: 'design' | 'stitch-file';
  sourceFileName?: string;
}

/** Machine command codes in the engine output. */
export const CMD = {
  STITCH: 0,
  JUMP: 1,
  TRIM: 2,
  COLOR_CHANGE: 3,
  STOP: 4,
  END: 5,
} as const;
export type Cmd = (typeof CMD)[keyof typeof CMD];

export interface ObjectStat {
  id: string;
  /** Number of needle penetrations (STITCH commands) belonging to the object. */
  stitches: number;
  /** Command index range [start, end). */
  start: number;
  end: number;
  bounds: Bounds | null;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Engine output: a flat command list in 0.1 mm units. */
export interface StitchPlan {
  /** Objects skipped because they are too large or dense to stitch safely. */
  skipped?: string[];
  /** True when the plan stopped early at the stitch limit. */
  truncated?: boolean;
  xs: Int32Array;
  ys: Int32Array;
  cmds: Uint8Array;
  /** Object index (into project.objects) per command, -1 for connectors. */
  obj: Int32Array;
  /** Thread id of each color block, in sewing order. */
  colorBlocks: string[];
  objectStats: ObjectStat[];
  bounds: Bounds | null;
  stitchCount: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  stops: number;
}

/** What the file writers need. */
export interface StitchPattern {
  name: string;
  xs: Int32Array | number[];
  ys: Int32Array | number[];
  cmds: Uint8Array | number[];
  /** One entry per color block, in order. */
  threads: { hex: string; name: string; chartCode?: string | null; brand?: string }[];
}
