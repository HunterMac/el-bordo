import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boardNodes,
  darken,
  drawableEdges,
  emptyDoc,
  isBoardEdge,
  newId,
  parse,
  resolveColor,
  serialize,
  type CanvasDoc,
  type RectangleNode,
} from '../../src/shared/canvasFormat';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

function parseOk(text: string): CanvasDoc {
  const r = parse(text);
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}

describe('canvasFormat', () => {
  it('round-trips our own file to identical text', () => {
    const text = fixture('sample.canvas');
    expect(serialize(parseOk(text))).toBe(text);
  });

  it('parses all four node kinds', () => {
    const doc = parseOk(fixture('sample.canvas'));
    expect(boardNodes(doc).map((n) => n.kind)).toEqual(['sticky', 'rectangle', 'file', 'link', 'file', 'file']);
  });

  it('keeps groups, unknown fields and edges to groups (Obsidian file)', () => {
    const doc = parseOk(fixture('obsidian.canvas'));
    expect(doc.nodes[0].kind).toBe('unsupported');
    expect(boardNodes(doc)).toHaveLength(3);
    // The edge to the group is kept but not drawable.
    expect(doc.edges).toHaveLength(2);
    expect(drawableEdges(doc).map((e) => e.id)).toEqual(['e1']);

    const out = JSON.parse(serialize(doc));
    expect(out.nodes.map((n: { id: string }) => n.id)).toEqual(['g1', 'n1', 'n2', 'n3']);
    expect(out.nodes[0]).toEqual({ id: 'g1', type: 'group', x: -40, y: -40, width: 600, height: 400, label: 'Cluster', color: '4' });
    expect(out.nodes[1].customKey).toEqual({ a: 1 });
    expect(out.nodes[2].subpath).toBe('#heading');
    expect(out.edges[1].color).toBe('2');
    expect(out.metadata).toEqual({ version: '1.0-1.0' });
  });

  it('loads a text node without konekton.kind as a rectangle with empty title', () => {
    const doc = parseOk(fixture('obsidian.canvas'));
    const n1 = doc.nodes[1] as RectangleNode;
    expect(n1.kind).toBe('rectangle');
    expect(n1.title).toBe('');
    expect(n1.fontSize).toBe(14);
    expect(n1.align).toBe('left');
    expect(n1.color).toBe('#FFFFFF');
  });

  it('applies defaults for missing konekton fields on edges', () => {
    const doc = parseOk(fixture('obsidian.canvas'));
    const e1 = doc.edges[0];
    if (!isBoardEdge(e1)) throw new Error('expected board edge');
    expect(e1.fromEnd).toBe('none');
    expect(e1.toEnd).toBe('arrow');
    expect(e1.fromOffset).toBe(0.5);
    expect(e1.toOffset).toBe(0.5);
    const e2 = doc.edges[1];
    if (!isBoardEdge(e2)) throw new Error('expected board edge');
    expect(e2.toEnd).toBe('none');
  });

  it('rounds geometry to integers on save', () => {
    const doc = parseOk(fixture('sample.canvas'));
    const n = doc.nodes[0];
    if (n.kind === 'unsupported') throw new Error();
    n.x = 10.4;
    n.y = -3.5;
    n.width = 199.6;
    const out = JSON.parse(serialize(doc));
    expect(out.nodes[0]).toMatchObject({ x: 10, y: -3, width: 200 });
  });

  it('writes node keys in the documented order', () => {
    const doc = parseOk(fixture('sample.canvas'));
    const out = JSON.parse(serialize(doc));
    expect(Object.keys(out.nodes[0])).toEqual(['id', 'type', 'x', 'y', 'width', 'height', 'color', 'text', 'konekton']);
    expect(Object.keys(out.edges[0])).toEqual(['id', 'fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd', 'label', 'konekton']);
  });

  it('omits an empty label', () => {
    const doc = parseOk(fixture('sample.canvas'));
    const e = doc.edges[0];
    if (!isBoardEdge(e)) throw new Error();
    e.label = '';
    expect(JSON.parse(serialize(doc)).edges[0]).not.toHaveProperty('label');
  });

  it('loads an empty or whitespace file as an empty board', () => {
    for (const text of ['', '  \n\t']) {
      const r = parse(text);
      expect(r).toMatchObject({ ok: true, empty: true });
    }
    expect(serialize(emptyDoc())).toBe('{\n  "nodes": [],\n  "edges": []\n}\n');
  });

  it('reports invalid JSON instead of throwing it away', () => {
    const r = parse('{ "nodes": [');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    expect(parse('[1,2]').ok).toBe(false);
  });

  it('keeps malformed edges verbatim', () => {
    const doc = parseOk('{"nodes":[],"edges":[{"id":"x"},42]}');
    expect(doc.edges).toHaveLength(2);
    expect(JSON.parse(serialize(doc)).edges).toEqual([{ id: 'x' }, { value: 42 }]);
  });

  it('generates 16 lowercase hex ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('resolves palette and foreign colors', () => {
    expect(resolveColor('3')).toEqual({ fill: '#FFF9B1', border: '#E6C700' });
    expect(resolveColor('#ffffff')).toEqual({ fill: '#FFFFFF', border: '#C4C4C4' });
    expect(resolveColor('#808080')).toEqual({ fill: '#808080', border: darken('#808080', 0.25) });
    expect(darken('#808080', 0.25)).toBe('#606060');
    expect(resolveColor(undefined)).toBeUndefined();
  });
});
