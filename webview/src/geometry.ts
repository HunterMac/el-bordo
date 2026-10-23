import type { Side } from '../../src/shared/canvasFormat';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Anchor {
  side: Side;
  offset: number;
}

/** Share of a side length around the middle where the offset snaps to 0.5. */
export const MIDDLE_SNAP_RATIO = 0.15;
/** Minimum snap distance around the middle, in screen pixels. */
export const MIDDLE_SNAP_MIN_PX = 12;

export function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

export function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Point on the border of `rect` at `side` and `offset` (0 = left/top end, 1 = right/bottom end). */
export function anchorPoint(rect: Rect, side: Side, offset: number): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width * offset, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width * offset, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height * offset };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height * offset };
  }
}

/** Outward unit vector of a side. */
export function sideNormal(side: Side): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Nearest point on the border of `rect` to `p`, as side + offset.
 * Points inside the rectangle use the closest side. The offset snaps to the middle
 * when it is within 15% of the side length (at least 12 screen px, so `zoom` is needed).
 */
export function nearestBorderAnchor(rect: Rect, p: Point, zoom = 1): Anchor {
  const inside = contains(rect, p);
  let side: Side;
  if (inside) {
    const d: [Side, number][] = [
      ['left', p.x - rect.x],
      ['right', rect.x + rect.width - p.x],
      ['top', p.y - rect.y],
      ['bottom', rect.y + rect.height - p.y],
    ];
    side = d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
  } else {
    // Outside: the nearest border point is the clamped point. At corners, the larger overshoot wins.
    const dx = p.x < rect.x ? rect.x - p.x : p.x > rect.x + rect.width ? p.x - (rect.x + rect.width) : 0;
    const dy = p.y < rect.y ? rect.y - p.y : p.y > rect.y + rect.height ? p.y - (rect.y + rect.height) : 0;
    if (dx >= dy && dx > 0) side = p.x < rect.x ? 'left' : 'right';
    else side = p.y < rect.y ? 'top' : 'bottom';
  }
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? rect.width : rect.height;
  const raw = horizontal ? (p.x - rect.x) / rect.width : (p.y - rect.y) / rect.height;
  let offset = clamp(raw, 0, 1);
  const threshold = Math.max(MIDDLE_SNAP_RATIO * length, MIDDLE_SNAP_MIN_PX / zoom);
  if (Math.abs(offset - 0.5) * length <= threshold) offset = 0.5;
  return { side, offset };
}

/** Side of a new object (centered at `newCenter`) that faces `source`, by the dominant axis. */
export function facingSide(source: Rect, newCenter: Point): Side {
  const c = center(source);
  const dx = c.x - newCenter.x;
  const dy = c.y - newCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Topmost rectangle containing `p`. `items` are in z-order, first = bottom. */
export function hitTest<T extends Rect>(items: readonly T[], p: Point): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (contains(items[i], p)) return items[i];
  return undefined;
}

export interface CurveGeometry {
  start: Point;
  end: Point;
  c1: Point;
  c2: Point;
  path: string;
  /** Point at t = 0.5, where the label and the line toolbar go. */
  mid: Point;
}

/** Cubic Bézier between two anchors; control points extend along the side normals. */
export function curveBetween(from: Point, fromSide: Side, to: Point, toSide: Side): CurveGeometry {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const k = Math.max(40, 0.4 * dist);
  const n1 = sideNormal(fromSide);
  const n2 = sideNormal(toSide);
  const c1 = { x: from.x + n1.x * k, y: from.y + n1.y * k };
  const c2 = { x: to.x + n2.x * k, y: to.y + n2.y * k };
  const mid = { x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8, y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8 };
  const f = (n: number) => Math.round(n * 100) / 100;
  const path = `M ${f(from.x)} ${f(from.y)} C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(to.x)} ${f(to.y)}`;
  return { start: from, end: to, c1, c2, path, mid };
}

/** Round to a multiple of `step`. */
export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Smallest rectangle containing all `rects`. */
export function boundsOf(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
