import { describe, expect, it } from 'vitest';
import { GUIDE_OVERHANG_PX, SNAP_PX, intersects, snapMove, snapResize, type ResizeInput, type SnapInput } from '../../webview/src/snapping';

const target = { x: 100, y: 100, width: 100, height: 50 };

const input = (box: SnapInput['box'], over: Partial<SnapInput> = {}): SnapInput => ({
  box,
  ref: { x: box.x, y: box.y },
  targets: [target],
  zoom: 1,
  objects: true,
  ...over,
});

// Box 40x40, far away on the other axis so only one axis can match unless a test says otherwise.
const farY = 1000;

describe('snapMove edge pairs', () => {
  it('snaps left to left', () => {
    expect(snapMove(input({ x: 103, y: farY, width: 40, height: 40 })).dx).toBe(-3);
  });
  it('snaps left to right', () => {
    expect(snapMove(input({ x: 203, y: farY, width: 40, height: 40 })).dx).toBe(-3);
  });
  it('snaps right to left', () => {
    expect(snapMove(input({ x: 56, y: farY, width: 40, height: 40 })).dx).toBe(4);
  });
  it('snaps right to right', () => {
    expect(snapMove(input({ x: 163, y: farY, width: 40, height: 40 })).dx).toBe(-3);
  });
  it('snaps top to top and bottom to bottom', () => {
    expect(snapMove(input({ x: 1000, y: 102, width: 40, height: 40 })).dy).toBe(-2);
    expect(snapMove(input({ x: 1000, y: 112, width: 40, height: 40 })).dy).toBe(-2);
  });
  it('snaps top to bottom and bottom to top', () => {
    expect(snapMove(input({ x: 1000, y: 148, width: 40, height: 40 })).dy).toBe(2);
    expect(snapMove(input({ x: 1000, y: 63, width: 40, height: 40 })).dy).toBe(-3);
  });
});

describe('snapMove distance', () => {
  it.each([0.5, 1, 2])('uses SNAP_PX screen pixels at zoom %s', (zoom) => {
    const max = SNAP_PX / zoom;
    expect(snapMove(input({ x: 100 + max, y: farY, width: 40, height: 40 }, { zoom })).dx).toBeCloseTo(-max);
    expect(snapMove(input({ x: 100 + max + 0.1, y: farY, width: 40, height: 40 }, { zoom })).dx).toBe(0);
  });

  it('picks the closest pair when two targets are in range', () => {
    const targets = [target, { x: 104, y: 300, width: 10, height: 10 }];
    expect(snapMove(input({ x: 102, y: farY, width: 40, height: 40 }, { targets })).dx).toBe(-2);
    expect(snapMove(input({ x: 103, y: farY, width: 40, height: 40 }, { targets })).dx).toBe(1);
  });
});

describe('snapMove axes', () => {
  it('snaps X only', () => {
    const r = snapMove(input({ x: 102, y: 500, width: 40, height: 40 }));
    expect([r.dx, r.dy]).toEqual([-2, 0]);
  });
  it('snaps Y only', () => {
    const r = snapMove(input({ x: 500, y: 103, width: 40, height: 40 }));
    expect([r.dx, r.dy]).toEqual([0, -3]);
  });
  it('snaps both', () => {
    const r = snapMove(input({ x: 102, y: 103, width: 40, height: 40 }));
    expect([r.dx, r.dy]).toEqual([-2, -3]);
    expect(r.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
  });
});

describe('snapMove override and grid', () => {
  const box = { x: 103, y: 500, width: 40, height: 40 };

  it('does not snap to objects or draw guides when objects is false', () => {
    const r = snapMove(input(box, { objects: false }));
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('still snaps to the grid when objects is false', () => {
    const r = snapMove(input(box, { objects: false, gridStep: 20 }));
    expect([r.dx, r.dy]).toEqual([-3, 0]);
    expect(r.guides).toEqual([]);
  });
  it('object match wins on its axis, grid is used on the other', () => {
    const r = snapMove(input({ x: 102, y: 507, width: 40, height: 40 }, { gridStep: 20 }));
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(-7);
  });
  it('object edge beats the grid even when they disagree', () => {
    const t = { x: 104, y: 0, width: 10, height: 10 };
    const r = snapMove(input({ x: 102, y: 500, width: 40, height: 40 }, { targets: [t], gridStep: 20 }));
    expect(r.dx).toBe(2);
  });
  it('is a no-op with grid off and no match', () => {
    const r = snapMove(input({ x: 500, y: 500, width: 40, height: 40 }));
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });
  it('uses ref, not the box, for the grid', () => {
    const r = snapMove(input({ x: 500, y: 500, width: 40, height: 40 }, { ref: { x: 513, y: 527 }, gridStep: 20 }));
    expect([r.dx, r.dy]).toEqual([7, -7]);
  });
});

describe('snapMove guides', () => {
  it('draws one guide through the box and every target on the line, with overhang', () => {
    const targets = [
      { x: 100, y: 0, width: 50, height: 20 },
      { x: 100, y: 300, width: 80, height: 40 },
      { x: 40, y: 150, width: 60, height: 30 }, // right edge at 100
    ];
    const r = snapMove(input({ x: 102, y: 100, width: 40, height: 20 }, { targets, zoom: 2 }));
    expect(r.dx).toBe(-2);
    const x = r.guides.filter((g) => g.axis === 'x');
    expect(x).toEqual([{ axis: 'x', at: 100, from: 0 - GUIDE_OVERHANG_PX / 2, to: 340 + GUIDE_OVERHANG_PX / 2 }]);
  });

  it('draws two guides when both edges of an axis match', () => {
    const r = snapMove(input({ x: 101, y: 600, width: 100, height: 20 }));
    const x = r.guides.filter((g) => g.axis === 'x').map((g) => g.at);
    expect(x).toEqual([100, 200]);
  });

  it('draws no guide for a box edge without targets on it', () => {
    const r = snapMove(input({ x: 102, y: 600, width: 40, height: 20 }));
    expect(r.guides.map((g) => g.at)).toEqual([100]);
  });
});

describe('snapMove multi-selection', () => {
  it('snaps the bounding box and shifts by the same amount', () => {
    const box = { x: 98, y: 500, width: 80, height: 40 };
    const r = snapMove(input(box, { ref: { x: 98, y: 500 } }));
    expect(r.dx).toBe(2);
  });
});

describe('intersects', () => {
  it('detects overlap and touching, not separation', () => {
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('snapResize', () => {
  // Fixed top-left at 0,0. Target spans x 100..200, y 100..150.
  const resize = (width: number, height: number, over: Partial<ResizeInput> = {}) =>
    snapResize({ box: { x: 0, y: 0, width, height }, targets: [target], zoom: 1, objects: true, min: 20, ...over });

  it('snaps the right edge to a target left or right edge', () => {
    expect(resize(95, 500).width).toBe(100);
    expect(resize(205, 500).width).toBe(200);
  });
  it('snaps the bottom edge to a target top or bottom edge', () => {
    expect(resize(500, 97).height).toBe(100);
    expect(resize(500, 146).height).toBe(150);
  });
  it('snaps both axes independently', () => {
    const r = resize(95, 500);
    expect([r.width, r.height]).toEqual([100, 500]);
    const both = resize(95, 97);
    expect([both.width, both.height]).toEqual([100, 100]);
    expect(both.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
  });
  it.each([0.5, 1, 2])('uses SNAP_PX screen pixels at zoom %s', (zoom) => {
    const max = SNAP_PX / zoom;
    expect(resize(100 - max, 500, { zoom }).width).toBe(100);
    expect(resize(100 - max - 0.1, 500, { zoom }).width).toBeCloseTo(100 - max - 0.1);
  });
  it('only draws a guide for the moving edge', () => {
    // Left edge at x 0 never gets a guide, even if a target sits on it.
    const r = resize(95, 500, { targets: [target, { x: 0, y: 300, width: 10, height: 10 }] });
    expect(r.guides.map((g) => g.at)).toEqual([100]);
    expect(r.guides[0]).toMatchObject({ axis: 'x', from: -GUIDE_OVERHANG_PX, to: 500 + GUIDE_OVERHANG_PX });
  });
  it('falls back to the grid per axis, and object wins on its axis', () => {
    const r = resize(95, 513, { gridStep: 20 });
    expect([r.width, r.height]).toEqual([100, 520]);
    const grid = resize(113, 513, { gridStep: 20 });
    expect([grid.width, grid.height]).toEqual([120, 520]);
  });
  it('ignores objects but keeps the grid when objects is false', () => {
    const r = resize(95, 97, { objects: false, gridStep: 20 });
    expect([r.width, r.height]).toEqual([100, 100]);
    expect(r.guides).toEqual([]);
    expect(resize(95, 97, { objects: false }).width).toBe(95);
  });
  it('does not snap below min', () => {
    const r = resize(35, 500, { targets: [{ x: 20, y: 0, width: 5, height: 5 }], min: 30 });
    expect(r.width).toBe(35);
  });
  it('keeps squares square, following the closer match', () => {
    const r = resize(97, 97, { square: true });
    expect([r.width, r.height]).toEqual([100, 100]);
    const farX = resize(180, 180, { square: true, targets: [{ x: 190, y: 0, width: 5, height: 5 }, { x: 0, y: 183, width: 5, height: 5 }] });
    expect([farX.width, farX.height]).toEqual([183, 183]);
    expect(farX.guides.map((g) => g.axis)).toEqual(['y']);
  });
  it('rounds squares to the grid when nothing matches', () => {
    const r = resize(213, 213, { square: true, gridStep: 20 });
    expect([r.width, r.height]).toEqual([220, 220]);
  });
});
