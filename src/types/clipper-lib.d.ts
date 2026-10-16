declare module 'clipper-lib' {
  export interface IntPoint { X: number; Y: number }
  export type Path = IntPoint[];
  export type Paths = Path[];
  export class PolyNode {
    Contour(): Path;
    Childs(): PolyNode[];
    IsHole(): boolean;
  }
  export class PolyTree extends PolyNode {}
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
  }
  export class Clipper {
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths | PolyTree, subjFill?: number, clipFill?: number): boolean;
    static CleanPolygons(paths: Paths, distance?: number): Paths;
    static SimplifyPolygons(paths: Paths, fillType?: number): Paths;
  }
  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  export const EndType: { etClosedPolygon: number; etClosedLine: number; etOpenButt: number; etOpenSquare: number; etOpenRound: number };
  export const PolyType: { ptSubject: number; ptClip: number };
  export const ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
  export const PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
  const ClipperLib: {
    ClipperOffset: typeof ClipperOffset;
    Clipper: typeof Clipper;
    PolyTree: typeof PolyTree;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
    PolyType: typeof PolyType;
    ClipType: typeof ClipType;
    PolyFillType: typeof PolyFillType;
  };
  export default ClipperLib;
}
