import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBoardStore } from '../../webview/src/store';
import { DocSync } from '../../webview/src/sync';
import { buildFragment, deltaToPlace, instantiate, parseFragment } from '../../webview/src/clipboard';
import { parse, serialize, type CanvasDoc } from '../../src/shared/canvasFormat';
import type { WebviewMessage } from '../../src/shared/protocol';

const sample = readFileSync(join(__dirname, '..', 'fixtures', 'sample.canvas'), 'utf8');
const STICKY = 'a1b2c3d4e5f60718';
const RECT = 'b2c3d4e5f6071829';

function setup(text = sample) {
  const posted: WebviewMessage[] = [];
  const store = createBoardStore((m) => posted.push(m));
  store.getState().init(text, { gridEnabled: false });
  const edits = () => posted.filter((m) => m.type === 'edit');
  return { store, posted, edits, s: () => store.getState() };
}

describe('DocSync', () => {
  it('suppresses the echo of our own edit', () => {
    const posted: WebviewMessage[] = [];
    const sync = new DocSync((m) => posted.push(m));
    sync.reset('a');
    expect(sync.send('b')).toBe(true);
    expect(sync.receive('b')).toBe('echo');
    expect(sync.receive('c')).toBe('external');
  });

  it('does not send an unchanged text', () => {
    const posted: WebviewMessage[] = [];
    const sync = new DocSync((m) => posted.push(m));
    sync.reset('a');
    expect(sync.send('a')).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it('handles several edits in flight', () => {
    const sync = new DocSync(() => {});
    sync.reset('a');
    sync.send('b');
    sync.send('c');
    expect(sync.receive('b')).toBe('echo');
    expect(sync.receive('c')).toBe('echo');
    expect(sync.receive('b')).toBe('external'); // undo back to b
  });
});

describe('board store', () => {
  it('ignores the echo of its own edit but applies external changes', () => {
    const { s, edits } = setup();
    s().updateNode(STICKY, { text: 'Changed' });
    expect(edits()).toHaveLength(1);
    const sent = (edits()[0] as { text: string }).text;

    const before = s().doc;
    s().handleMessage({ type: 'docChanged', text: sent, version: 2 });
    expect(s().doc).toBe(before);

    // Undo: the host sends the old text back.
    s().handleMessage({ type: 'docChanged', text: sample, version: 3 });
    const sticky = s().doc.nodes[0];
    expect(sticky.kind === 'sticky' && sticky.text).toBe('Idea');
    expect(edits()).toHaveLength(1);
  });

  it('keeps the selection for ids that still exist after an external change', () => {
    const { s } = setup();
    s().setSelection([STICKY, RECT], []);
    const doc = parse(sample);
    if (!doc.ok) throw new Error();
    const without: CanvasDoc = { ...doc.doc, nodes: doc.doc.nodes.filter((n) => n.id !== RECT) };
    s().handleMessage({ type: 'docChanged', text: serialize(without), version: 2 });
    expect(s().selNodes).toEqual([STICKY]);
  });

  it('keeps edit mode when the edited node still exists', () => {
    const { s } = setup();
    s().setEditing({ nodeId: STICKY, field: 'body' });
    const parsed = parse(sample);
    if (!parsed.ok) throw new Error();
    const moved = { ...parsed.doc, nodes: parsed.doc.nodes.map((n) => (n.id === STICKY && n.kind === 'sticky' ? { ...n, x: 50 } : n)) };
    s().handleMessage({ type: 'docChanged', text: serialize(moved), version: 2 });
    expect(s().editing).toEqual({ nodeId: STICKY, field: 'body' });
  });

  it('sends one edit per action', () => {
    const { s, edits } = setup();
    // Dragging only updates the store.
    s().moveNodes([{ id: STICKY, x: 10, y: 10 }]);
    s().moveNodes([{ id: STICKY, x: 20, y: 30 }]);
    expect(edits()).toHaveLength(0);
    s().commit();
    expect(edits()).toHaveLength(1);
    s().commit(); // nothing changed
    expect(edits()).toHaveLength(1);

    s().resizeNode(RECT, 300, 200);
    expect(edits()).toHaveLength(1);
    s().finishResize(RECT);
    expect(edits()).toHaveLength(2);

    s().updateNode(RECT, { color: '4' });
    expect(edits()).toHaveLength(3);

    const id = s().createNode({ kind: 'sticky', center: { x: 500, y: 500 } });
    expect(edits()).toHaveLength(4);
    expect(s().editing).toEqual({ nodeId: id, field: 'body' });

    s().setSelection([id], []);
    s().deleteSelection();
    expect(edits()).toHaveLength(5);
  });

  it('creates a node and its line in one edit', () => {
    const { s, edits } = setup();
    const id = s().createNode({ kind: 'sticky', center: { x: 900, y: 100 } }, { nodeId: RECT, side: 'right', offset: 0.5 });
    expect(edits()).toHaveLength(1);
    const parsed = parse((edits()[0] as { text: string }).text);
    if (!parsed.ok) throw new Error();
    const edge = parsed.doc.edges.at(-1);
    expect(edge && 'fromNode' in edge && edge.fromNode === RECT && edge.toNode === id && edge.toSide === 'left').toBe(true);
  });

  it('deleting an object deletes its lines', () => {
    const { s } = setup();
    s().setSelection([RECT], []);
    s().deleteSelection();
    expect(s().doc.edges).toHaveLength(0);
  });

  it('never writes a board it could not parse', () => {
    const { s, edits } = setup('{ broken');
    expect(s().parseError).not.toBeNull();
    s().createNode({ kind: 'sticky', center: { x: 0, y: 0 } });
    s().commit();
    expect(edits()).toHaveLength(0);
  });

  it('writes an empty board with the first edit', () => {
    const { s, edits } = setup('');
    expect(s().parseError).toBeNull();
    s().createNode({ kind: 'sticky', center: { x: 0, y: 0 } });
    const text = (edits()[0] as { text: string }).text;
    expect(JSON.parse(text).nodes).toHaveLength(1);
    expect(JSON.parse(text).edges).toEqual([]);
  });

  it('snaps new objects to the grid when it is on', () => {
    const { s } = setup('');
    s().handleMessage({ type: 'settings', gridEnabled: true });
    const id = s().createNode({ kind: 'sticky', center: { x: 133, y: 77 } });
    const node = s().doc.nodes.find((n) => n.kind !== 'unsupported' && n.id === id);
    expect(node && node.kind !== 'unsupported' && node.x % 20 === 0 && node.y % 20 === 0).toBe(true);
  });

  it('copy, paste and duplicate create new ids and remap lines', () => {
    const { s, edits } = setup();
    s().setSelection([STICKY, RECT], []);
    const text = s().copyText();
    expect(text).not.toBeNull();
    s().pasteText(text as string, { x: 0, y: 0 }, { x: 1000, y: 1000 });
    expect(edits()).toHaveLength(1);
    expect(s().doc.nodes).toHaveLength(8);
    expect(s().doc.edges).toHaveLength(3);
    expect(s().selNodes).toHaveLength(2);
    const ids = new Set(s().doc.nodes.map((n) => (n.kind === 'unsupported' ? n.id : n.id)));
    expect(ids.size).toBe(8);

    s().duplicateSelection();
    expect(s().doc.nodes).toHaveLength(10);
    expect(edits()).toHaveLength(2);
  });

  it('pastes plain text as a sticky', () => {
    const { s } = setup('');
    s().pasteText('hello there', { x: 100, y: 100 });
    const node = s().doc.nodes[0];
    expect(node.kind === 'sticky' && node.text).toBe('hello there');
  });

  it('keeps file edits as conflicts when the file changes under them', () => {
    const { s, posted } = setup();
    s().handleMessage({ type: 'fileContent', path: 'docs/notes.md', status: 'ok', text: 'one\n' });
    s().beginFileEdit('c3d4e5f60718293a');
    s().setFileDraft('c3d4e5f60718293a', 'one\ntwo\n');
    s().handleMessage({ type: 'fileContent', path: 'docs/notes.md', status: 'ok', text: 'changed\n' });
    expect(s().fileEdits['c3d4e5f60718293a'].conflict).toBe(true);
    s().endFileEdit('c3d4e5f60718293a');
    expect(posted.some((m) => m.type === 'saveFile')).toBe(false);
    s().overwriteFile('c3d4e5f60718293a');
    expect(posted.find((m) => m.type === 'saveFile')).toMatchObject({ force: true, text: 'one\ntwo\n' });
  });
});

describe('clipboard fragments', () => {
  it('copies only lines with both ends selected', () => {
    const parsed = parse(sample);
    if (!parsed.ok) throw new Error();
    const one = buildFragment(parsed.doc, [STICKY]);
    expect(parseFragment(one as string)?.edges).toHaveLength(0);
    const two = buildFragment(parsed.doc, [STICKY, RECT]);
    expect(parseFragment(two as string)?.edges).toHaveLength(1);
    expect(buildFragment(parsed.doc, [])).toBeNull();
  });

  it('rejects non-fragments', () => {
    expect(parseFragment('just some text')).toBeNull();
    expect(parseFragment('{"nodes":[],"edges":[]}')).toBeNull();
  });

  it('places the top-left of a fragment at a point', () => {
    const parsed = parse(sample);
    if (!parsed.ok) throw new Error();
    const frag = parseFragment(buildFragment(parsed.doc, [STICKY, RECT]) as string);
    if (!frag) throw new Error();
    const moved = instantiate(frag, deltaToPlace(frag, { x: 1000, y: 500 }));
    expect(Math.min(...moved.nodes.map((n) => n.x))).toBe(1000);
    expect(Math.min(...moved.nodes.map((n) => n.y))).toBe(500);
    expect(deltaToPlace(frag, { x: 1013, y: 507 }, 20)).toEqual({ x: 1020, y: 500 });
  });
});
