import { snap, type Rect } from './geometry';

export const SNAP_PX = 12;
export const GUIDE_OVERHANG_PX = 8;
export const GUIDE_COLOR = '#FF00FF';

/** Edges closer than this (board units) count as lying on the same line. */
const EPS = 0.01;

/** A guide line in board coordinates. `axis: 'x'` is a vertical line at x = `at`. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface SnapInput {
  /** Bounding box of the dragged objects at the raw position. */
  box: Rect;
  /** Raw position of the first dragged node (grid reference). */
  ref: { x: number; y: number };
  targets: Rect[];
  zoom: number;
  /** False while Ctrl/Cmd is held. */
  objects: boolean;
  /** Set when the grid is on. */
  gridStep?: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

type Axis = 'x' | 'y';

const start = (r: Rect, axis: Axis) => (axis === 'x' ? r.x : r.y);
const size = (r: Rect, axis: Axis) => (axis === 'x' ? r.width : r.height);
const edges = (r: Rect, axis: Axis): [number, number] => [start(r, axis), start(r, axis) + size(r, axis)];

/** Smallest shift on `axis` that puts one of the `moving` edges onto a target edge, or undefined when none is in range. */
function objectShift(moving: readonly number[], targets: readonly Rect[], axis: Axis, maxDistance: number): number | undefined {
  let best: number | undefined;
  for (const t of targets) {
    for (const te of edges(t, axis)) {
      for (const me of moving) {
        const d = te - me;
        if (Math.abs(d) <= maxDistance && (best === undefined || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
  }
  return best;
}

/** One guide per box edge in `ats` that has targets on it, running through the box and all of them. */
function guidesFor(box: Rect, targets: readonly Rect[], axis: Axis, overhang: number, ats: readonly number[] = edges(box, axis)): SnapGuide[] {
  const other: Axis = axis === 'x' ? 'y' : 'x';
  const guides: SnapGuide[] = [];
  for (const at of ats) {
    const onLine = targets.filter((t) => edges(t, axis).some((e) => Math.abs(e - at) <= EPS));
    if (onLine.length === 0) continue;
    const rects = [box, ...onLine];
    const from = Math.min(...rects.map((r) => start(r, other))) - overhang;
    const to = Math.max(...rects.map((r) => start(r, other) + size(r, other))) + overhang;
    guides.push({ axis, at, from, to });
  }
  return guides;
}

/**
 * Shift that snaps a dragged box to other objects' edges (left/right on X, top/bottom on Y), with the
 * guides to draw. Axes are independent. An axis without an object match falls back to the grid.
 */
export function snapMove(input: SnapInput): SnapResult {
  const { box, ref, targets, zoom, objects, gridStep } = input;
  const maxDistance = SNAP_PX / zoom;
  const overhang = GUIDE_OVERHANG_PX / zoom;

  const objectDx = objects ? objectShift(edges(box, 'x'), targets, 'x', maxDistance) : undefined;
  const objectDy = objects ? objectShift(edges(box, 'y'), targets, 'y', maxDistance) : undefined;
  const dx = objectDx ?? (gridStep ? snap(ref.x, gridStep) - ref.x : 0);
  const dy = objectDy ?? (gridStep ? snap(ref.y, gridStep) - ref.y : 0);

  const guides: SnapGuide[] = [];
  if (objectDx !== undefined || objectDy !== undefined) {
    const shifted = { ...box, x: box.x + dx, y: box.y + dy };
    if (objectDx !== undefined) guides.push(...guidesFor(shifted, targets, 'x', overhang));
    if (objectDy !== undefined) guides.push(...guidesFor(shifted, targets, 'y', overhang));
  }
  return { dx, dy, guides };
}

export interface ResizeInput {
  /** The object at its raw (unsnapped) size. Its top-left corner stays fixed. */
  box: Rect;
  targets: Rect[];
  zoom: number;
  /** False while Ctrl/Cmd is held. */
  objects: boolean;
  /** Set when the grid is on. */
  gridStep?: number;
  /** Width and height stay equal (stickies). */
  square?: boolean;
  /** Smallest allowed width and height. */
  min: number;
}

export interface ResizeResult {
  width: number;
  height: number;
  guides: SnapGuide[];
}

/**
 * Size that puts the right edge on a target's left/right edge and the bottom edge on a target's
 * top/bottom edge. An axis without an object match falls back to the grid (size rounded to a step).
 * Square objects follow the closer of the two matches.
 */
export function snapResize(input: ResizeInput): ResizeResult {
  const { targets, zoom, objects, gridStep, square, min } = input;
  const maxDistance = SNAP_PX / zoom;
  const overhang = GUIDE_OVERHANG_PX / zoom;
  const gridded = (v: number) => Math.max(min, gridStep ? snap(v, gridStep) : v);
  const side = Math.max(input.box.width, input.box.height);
  const box = square ? { ...input.box, width: side, height: side } : input.box;

  const match = (axis: Axis): number | undefined => {
    if (!objects) return undefined;
    const d = objectShift([edges(box, axis)[1]], targets, axis, maxDistance);
    return d !== undefined && size(box, axis) + d >= min ? d : undefined;
  };
  let dx = match('x');
  let dy = match('y');
  if (square && dx !== undefined && dy !== undefined) {
    if (Math.abs(dy) < Math.abs(dx)) dx = undefined;
    else dy = undefined;
  }

  let width: number;
  let height: number;
  if (square) {
    width = height = dx !== undefined ? side + dx : dy !== undefined ? side + dy : gridded(side);
  } else {
    width = dx !== undefined ? box.width + dx : gridded(box.width);
    height = dy !== undefined ? box.height + dy : gridded(box.height);
  }

  const resized = { ...box, width, height };
  const guides: SnapGuide[] = [];
  if (dx !== undefined) guides.push(...guidesFor(resized, targets, 'x', overhang, [resized.x + width]));
  if (dy !== undefined) guides.push(...guidesFor(resized, targets, 'y', overhang, [resized.y + height]));
  return { width, height, guides };
}
