import { describe, expect, it } from 'vitest';
import { anchorPoint, boundsOf, curveBetween, facingSide, hitTest, nearestBorderAnchor, snap } from '../../webview/src/geometry';

const rect = { x: 100, y: 100, width: 200, height: 100 };

describe('geometry', () => {
  it('finds the anchor point from side + offset', () => {
    expect(anchorPoint(rect, 'top', 0.5)).toEqual({ x: 200, y: 100 });
    expect(anchorPoint(rect, 'right', 0.25)).toEqual({ x: 300, y: 125 });
    expect(anchorPoint(rect, 'bottom', 1)).toEqual({ x: 300, y: 200 });
    expect(anchorPoint(rect, 'left', 0)).toEqual({ x: 100, y: 100 });
  });

  it('finds the nearest side + offset for points around the rectangle', () => {
    expect(nearestBorderAnchor(rect, { x: 120, y: 50 })).toEqual({ side: 'top', offset: expect.closeTo(0.1, 5) });
    expect(nearestBorderAnchor(rect, { x: 350, y: 120 })).toEqual({ side: 'right', offset: expect.closeTo(0.2, 5) });
    expect(nearestBorderAnchor(rect, { x: 290, y: 250 })).toEqual({ side: 'bottom', offset: expect.closeTo(0.95, 5) });
    expect(nearestBorderAnchor(rect, { x: 40, y: 190 })).toEqual({ side: 'left', offset: expect.closeTo(0.9, 5) });
  });

  it('uses the closest side for points inside', () => {
    expect(nearestBorderAnchor(rect, { x: 105, y: 150 }, 1).side).toBe('left');
    expect(nearestBorderAnchor(rect, { x: 295, y: 150 }, 1).side).toBe('right');
    expect(nearestBorderAnchor(rect, { x: 160, y: 190 }, 1).side).toBe('bottom');
  });

  it('snaps to the middle within 15% of the side length', () => {
    // top side is 200 long: |dx| <= 30 snaps
    expect(nearestBorderAnchor(rect, { x: 225, y: 90 })).toEqual({ side: 'top', offset: 0.5 });
    expect(nearestBorderAnchor(rect, { x: 235, y: 90 }).offset).not.toBe(0.5);
  });

  it('snaps with at least 12 screen px on short sides, scaled by zoom', () => {
    const small = { x: 0, y: 0, width: 40, height: 40 }; // 15% = 6 flow px
    expect(nearestBorderAnchor(small, { x: 30, y: -5 }, 1).offset).toBe(0.5); // 10 px from middle
    expect(nearestBorderAnchor(small, { x: 30, y: -5 }, 4).offset).not.toBe(0.5); // 12 px = 3 flow px
  });

  it('switches sides at corners', () => {
    expect(nearestBorderAnchor(rect, { x: 90, y: 150 }).side).toBe('left');
    expect(nearestBorderAnchor(rect, { x: 310, y: 150 }).side).toBe('right');
    // Past the top-right corner: larger overshoot decides.
    expect(nearestBorderAnchor(rect, { x: 330, y: 90 }).side).toBe('right');
    expect(nearestBorderAnchor(rect, { x: 305, y: 60 }).side).toBe('top');
    // Offsets stay in range.
    expect(nearestBorderAnchor(rect, { x: 330, y: 90 }).offset).toBe(0);
  });

  it('chooses the facing side of a new object', () => {
    const src = { x: 0, y: 0, width: 100, height: 100 };
    expect(facingSide(src, { x: 400, y: 50 })).toBe('left'); // new object to the right of the source
    expect(facingSide(src, { x: -300, y: 50 })).toBe('right');
    expect(facingSide(src, { x: 50, y: 400 })).toBe('top');
    expect(facingSide(src, { x: 50, y: -400 })).toBe('bottom');
  });

  it('hit-tests the topmost object', () => {
    const items = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 50, y: 50, width: 100, height: 100 },
    ];
    expect(hitTest(items, { x: 75, y: 75 })?.id).toBe('b');
    expect(hitTest(items, { x: 10, y: 10 })?.id).toBe('a');
    expect(hitTest(items, { x: 500, y: 10 })).toBeUndefined();
  });

  it('builds a curve with a midpoint on the line', () => {
    const c = curveBetween({ x: 0, y: 0 }, 'right', { x: 200, y: 0 }, 'left');
    expect(c.path.startsWith('M 0 0 C 80 0 120 0 200 0')).toBe(true);
    expect(c.mid).toEqual({ x: 100, y: 0 });
    // Short distances still extend at least 40.
    expect(curveBetween({ x: 0, y: 0 }, 'bottom', { x: 0, y: 10 }, 'top').c1.y).toBe(40);
  });

  it('snaps and bounds', () => {
    expect(snap(29, 20)).toBe(20);
    expect(snap(31, 20)).toBe(40);
    expect(boundsOf([])).toBeUndefined();
    expect(boundsOf([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });
});
