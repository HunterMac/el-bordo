import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  FILE_DEFAULTS,
  LINK_DEFAULTS,
  MIN_SIZE,
  RECTANGLE_DEFAULTS,
  STICKY_DEFAULTS,
  boardNodes,
  emptyDoc,
  isBoardEdge,
  isBoardNode,
  newId,
  parse,
  serialize,
  type BoardEdge,
  type BoardNode,
  type CanvasDoc,
  type Side,
} from '../../src/shared/canvasFormat';
import type { BoardSettings, ExtensionMessage, FileStatus, WebviewMessage } from '../../src/shared/protocol';
import { buildFragment, deltaToPlace, instantiate, parseFragment, type Fragment } from './clipboard';
import { facingSide, snap, type Anchor, type Point } from './geometry';
import { DocSync } from './sync';

export type Tool = 'select' | 'sticky' | 'rectangle' | 'file' | 'link';
export type NodeKind = BoardNode['kind'];

export const GRID_STEP = 20;
export const DUPLICATE_OFFSET = 20;

export interface FileState {
  status: FileStatus;
  text?: string;
}

/** Board-side edit of a referenced file, kept while editing and while a conflict is unresolved. */
export interface FileEdit {
  path: string;
  baseText: string;
  draft: string;
  conflict: boolean;
  saving: boolean;
}

export interface EditTarget {
  nodeId: string;
  field: 'body' | 'title';
}

export interface Chooser {
  /** Flow coordinates of the drop point. */
  at: Point;
  /** Screen coordinates, for placing the menu. */
  screen: Point;
  sourceNodeId: string;
  sourceSide: Side;
  sourceOffset: number;
}

export type ContextTarget = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | { kind: 'board' };

export interface ContextMenuState {
  screen: Point;
  flow: Point;
  target: ContextTarget;
}

export interface EndpointDrag {
  edgeId: string;
  end: 'from' | 'to';
  /** Pointer position in flow coordinates. */
  pointer: Point;
  /** Set while the pointer is over an object that may become the new end. */
  hover?: { nodeId: string; anchor: Anchor; point: Point };
}

export interface BoardState {
  ready: boolean;
  doc: CanvasDoc;
  parseError: string | null;
  settings: BoardSettings;
  selNodes: string[];
  selEdges: string[];
  editing: EditTarget | null;
  labelEditing: string | null;
  tool: Tool;
  files: Record<string, FileState>;
  fileEdits: Record<string, FileEdit>;
  chooser: Chooser | null;
  contextMenu: ContextMenuState | null;
  endpointDrag: EndpointDrag | null;
  dropHint: boolean;
  /** Last pointer position on the board in flow coordinates, or null when the pointer is outside. */
  mouseFlow: Point | null;
}

export interface NodeInit {
  kind: NodeKind;
  /** Center in flow coordinates. */
  center: Point;
  file?: string;
  url?: string;
  text?: string;
}

export interface BoardActions {
  init(text: string, settings: BoardSettings): void;
  applyExternal(text: string): void;
  handleMessage(message: ExtensionMessage): void;

  setSelection(nodes: string[], edges: string[]): void;
  setTool(tool: Tool): void;
  setEditing(target: EditTarget | null): void;
  setLabelEditing(edgeId: string | null): void;
  setChooser(chooser: Chooser | null): void;
  setContextMenu(menu: ContextMenuState | null): void;
  setEndpointDrag(drag: EndpointDrag | null): void;
  setDropHint(on: boolean): void;
  setMouseFlow(p: Point | null): void;
  setGrid(enabled: boolean): void;

  /** Send the current document to the extension: one call = one undo step. */
  commit(): void;

  moveNodes(moves: { id: string; x: number; y: number }[]): void;
  resizeNode(id: string, width: number, height: number): void;
  finishResize(id: string): void;
  updateNode(id: string, patch: Record<string, unknown>, commit?: boolean): void;
  updateEdge(id: string, patch: Partial<BoardEdge>, commit?: boolean): void;

  /**
   * Create an object centered on `init.center`. With `from`, a line from that anchor to the new
   * object is created in the same edit. Returns the new id.
   */
  createNode(init: NodeInit, from?: { nodeId: string; side: Side; offset: number }): string;
  createFileNodes(paths: string[], at: Point): void;
  connect(from: { nodeId: string; anchor: Anchor }, to: { nodeId: string; anchor: Anchor }): string | undefined;
  reconnect(edgeId: string, end: 'from' | 'to', nodeId: string, anchor: Anchor): void;

  deleteSelection(): void;
  deleteNode(id: string): void;
  deleteEdge(id: string): void;

  copyText(): string | null;
  /** Paste at `at` (or at the mouse when on the board, else +20/+20 from the original). */
  pasteText(text: string, viewCenter: Point, at?: Point): void;
  writeClipboard(text: string): void;
  readClipboard(): Promise<string>;
  duplicateSelection(): void;

  pickFile(): Promise<string | undefined>;
  promptUrl(initial?: string): Promise<string | undefined>;
  resolveDropped(uris: string[]): Promise<string[]>;
  openFile(path: string): void;
  openUrl(url: string): void;
  reopenAsText(): void;
  watchFiles(paths: string[]): void;

  beginFileEdit(nodeId: string): void;
  setFileDraft(nodeId: string, draft: string): void;
  endFileEdit(nodeId: string): void;
  reloadFile(nodeId: string): void;
  overwriteFile(nodeId: string): void;
}

export type BoardStore = StoreApi<BoardState & BoardActions>;

export function defaultSize(kind: NodeKind): { width: number; height: number } {
  switch (kind) {
    case 'sticky':
      return STICKY_DEFAULTS;
    case 'rectangle':
      return RECTANGLE_DEFAULTS;
    case 'file':
      return FILE_DEFAULTS;
    case 'link':
      return LINK_DEFAULTS;
  }
}

export function createBoardStore(post: (message: WebviewMessage) => void): BoardStore {
  const sync = new DocSync(post);
  let nextRequestId = 1;
  const requests = new Map<number, (value: unknown) => void>();

  const request = <T>(build: (requestId: number) => WebviewMessage): Promise<T> =>
    new Promise<T>((resolve) => {
      const id = nextRequestId++;
      requests.set(id, resolve as (v: unknown) => void);
      post(build(id));
    });

  const resolveRequest = (id: number, value: unknown) => {
    const resolve = requests.get(id);
    requests.delete(id);
    resolve?.(value);
  };

  return createStore<BoardState & BoardActions>()((set, get) => {
    /** Replace the doc, then send it. The board never writes a file it could not parse. */
    const apply = (next: CanvasDoc, commit = true) => {
      set({ doc: next });
      if (commit) get().commit();
    };

    const mapNode = (id: string, fn: (n: BoardNode) => BoardNode, commit: boolean) => {
      const doc = get().doc;
      let changed = false;
      const nodes = doc.nodes.map((n) => {
        if (!isBoardNode(n) || n.id !== id) return n;
        changed = true;
        return fn(n);
      });
      if (changed) apply({ ...doc, nodes }, commit);
    };

    const gridStep = () => (get().settings.gridEnabled ? GRID_STEP : undefined);

    const buildNode = (init: NodeInit): BoardNode => {
      const size = defaultSize(init.kind);
      const step = gridStep();
      let x = init.center.x - size.width / 2;
      let y = init.center.y - size.height / 2;
      if (step) {
        x = snap(x, step);
        y = snap(y, step);
      }
      const geometry = { id: newId(), x, y, width: size.width, height: size.height, extra: {}, elExtra: {} };
      switch (init.kind) {
        case 'sticky':
          return { kind: 'sticky', ...geometry, color: STICKY_DEFAULTS.color, text: init.text ?? '', fontSize: STICKY_DEFAULTS.fontSize, align: STICKY_DEFAULTS.align, bold: STICKY_DEFAULTS.bold };
        case 'rectangle':
          return { kind: 'rectangle', ...geometry, color: RECTANGLE_DEFAULTS.color, title: '', text: init.text ?? '', fontSize: RECTANGLE_DEFAULTS.fontSize, align: RECTANGLE_DEFAULTS.align, bold: RECTANGLE_DEFAULTS.bold };
        case 'file':
          return { kind: 'file', ...geometry, file: init.file ?? '', fontSize: FILE_DEFAULTS.fontSize, align: FILE_DEFAULTS.align, bold: FILE_DEFAULTS.bold };
        case 'link':
          return { kind: 'link', ...geometry, url: init.url ?? '' };
      }
    };

    const addFragment = (fragment: Fragment, select = true) => {
      const doc = get().doc;
      apply({ ...doc, nodes: [...doc.nodes, ...fragment.nodes], edges: [...doc.edges, ...fragment.edges] });
      if (select) set({ selNodes: fragment.nodes.map((n) => n.id), selEdges: [], editing: null });
    };

    const fileEditsForPath = (path: string) => Object.entries(get().fileEdits).filter(([, e]) => e.path === path);

    return {
      ready: false,
      doc: emptyDoc(),
      parseError: null,
      settings: { gridEnabled: false },
      selNodes: [],
      selEdges: [],
      editing: null,
      labelEditing: null,
      tool: 'select',
      files: {},
      fileEdits: {},
      chooser: null,
      contextMenu: null,
      endpointDrag: null,
      dropHint: false,
      mouseFlow: null,

      init(text, settings) {
        sync.reset(text);
        const r = parse(text);
        set({
          ready: true,
          settings,
          doc: r.ok ? r.doc : emptyDoc(),
          parseError: r.ok ? null : r.error,
        });
      },

      applyExternal(text) {
        if (sync.receive(text) === 'echo') return;
        const r = parse(text);
        if (!r.ok) {
          set({ parseError: r.error });
          return;
        }
        const state = get();
        const nodeIds = new Set(boardNodes(r.doc).map((n) => n.id));
        const edgeIds = new Set(r.doc.edges.filter(isBoardEdge).map((e) => e.id));
        set({
          doc: r.doc,
          parseError: null,
          selNodes: state.selNodes.filter((id) => nodeIds.has(id)),
          selEdges: state.selEdges.filter((id) => edgeIds.has(id)),
          editing: state.editing && nodeIds.has(state.editing.nodeId) ? state.editing : null,
          labelEditing: state.labelEditing && edgeIds.has(state.labelEditing) ? state.labelEditing : null,
          endpointDrag: null,
          contextMenu: null,
        });
      },

      handleMessage(message) {
        switch (message.type) {
          case 'init':
            get().init(message.text, message.settings);
            return;
          case 'docChanged':
            get().applyExternal(message.text);
            return;
          case 'settings':
            set({ settings: { gridEnabled: message.gridEnabled } });
            return;
          case 'fileContent': {
            const files = { ...get().files, [message.path]: { status: message.status, text: message.text } };
            const fileEdits = { ...get().fileEdits };
            for (const [nodeId, edit] of fileEditsForPath(message.path)) {
              if (edit.saving) continue;
              const current = message.status === 'ok' ? message.text : undefined;
              if (current !== edit.baseText) fileEdits[nodeId] = { ...edit, conflict: true };
            }
            set({ files, fileEdits });
            return;
          }
          case 'fileSaveResult': {
            const fileEdits = { ...get().fileEdits };
            const files = { ...get().files };
            for (const [nodeId, edit] of fileEditsForPath(message.path)) {
              if (message.ok) {
                files[message.path] = { status: 'ok', text: edit.draft };
                delete fileEdits[nodeId];
              } else {
                fileEdits[nodeId] = { ...edit, saving: false, conflict: message.conflict === true || edit.conflict };
              }
            }
            set({ fileEdits, files });
            return;
          }
          case 'pickFileResult':
            resolveRequest(message.requestId, message.path);
            return;
          case 'promptUrlResult':
            resolveRequest(message.requestId, message.url);
            return;
          case 'droppedFilesResult':
            resolveRequest(message.requestId, message.paths);
            return;
          case 'clipboardReadResult':
            resolveRequest(message.requestId, message.text);
            return;
        }
      },

      setSelection(nodes, edges) {
        const s = get();
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
        if (same(nodes, s.selNodes) && same(edges, s.selEdges)) return;
        set({ selNodes: nodes, selEdges: edges });
      },
      setTool: (tool) => set({ tool }),
      setEditing(editing) {
        const prev = get().editing;
        // Leaving a file node commits (saves) its edit.
        if (prev && prev.nodeId !== editing?.nodeId && get().fileEdits[prev.nodeId]) get().endFileEdit(prev.nodeId);
        set({ editing });
      },
      setLabelEditing: (labelEditing) => set({ labelEditing }),
      setChooser: (chooser) => set({ chooser }),
      setContextMenu: (contextMenu) => set({ contextMenu }),
      setEndpointDrag: (endpointDrag) => set({ endpointDrag }),
      setDropHint: (dropHint) => set({ dropHint }),
      setMouseFlow: (mouseFlow) => set({ mouseFlow }),
      setGrid(enabled) {
        set({ settings: { gridEnabled: enabled } });
        post({ type: 'setGrid', enabled });
      },

      commit() {
        const s = get();
        if (s.parseError !== null) return;
        sync.send(serialize(s.doc));
      },

      moveNodes(moves) {
        const byId = new Map(moves.map((m) => [m.id, m]));
        const doc = get().doc;
        set({
          doc: {
            ...doc,
            nodes: doc.nodes.map((n) => {
              const m = isBoardNode(n) ? byId.get(n.id) : undefined;
              return m ? { ...n, x: m.x, y: m.y } : n;
            }),
          },
        });
      },

      resizeNode(id, width, height) {
        mapNode(
          id,
          (n) => {
            const w = Math.max(MIN_SIZE, width);
            const h = Math.max(MIN_SIZE, height);
            if (n.kind === 'sticky') {
              const side = Math.max(w, h);
              return { ...n, width: side, height: side };
            }
            return { ...n, width: w, height: h };
          },
          false,
        );
      },

      finishResize(id) {
        const step = gridStep();
        if (step) {
          mapNode(
            id,
            (n) => {
              const w = Math.max(MIN_SIZE, snap(n.width, step));
              const h = Math.max(MIN_SIZE, snap(n.height, step));
              return n.kind === 'sticky' ? { ...n, width: Math.max(w, h), height: Math.max(w, h) } : { ...n, width: w, height: h };
            },
            false,
          );
        }
        get().commit();
      },

      updateNode(id, patch, commit = true) {
        mapNode(id, (n) => ({ ...n, ...patch }) as BoardNode, commit);
      },

      updateEdge(id, patch, commit = true) {
        const doc = get().doc;
        apply({ ...doc, edges: doc.edges.map((e) => (isBoardEdge(e) && e.id === id ? { ...e, ...patch } : e)) }, commit);
      },

      createNode(init, from) {
        const node = buildNode(init);
        const doc = get().doc;
        const source = from ? boardNodes(doc).find((n) => n.id === from.nodeId) : undefined;
        const edges = [...doc.edges];
        if (from && source) {
          edges.push({
            id: newId(),
            fromNode: from.nodeId,
            fromSide: from.side,
            fromEnd: 'none',
            fromOffset: from.offset,
            toNode: node.id,
            toSide: facingSide(source, { x: node.x + node.width / 2, y: node.y + node.height / 2 }),
            toEnd: 'arrow',
            toOffset: 0.5,
            label: '',
            extra: {},
            elExtra: {},
          });
        }
        apply({ ...doc, nodes: [...doc.nodes, node], edges });
        const editing: EditTarget | null =
          init.kind === 'sticky' ? { nodeId: node.id, field: 'body' } : init.kind === 'rectangle' ? { nodeId: node.id, field: 'title' } : null;
        set({ selNodes: [node.id], selEdges: [], editing, tool: 'select' });
        return node.id;
      },

      createFileNodes(paths, at) {
        if (paths.length === 0) return;
        const nodes = paths.map((file, i) => buildNode({ kind: 'file', center: { x: at.x + i * 20, y: at.y + i * 20 }, file }));
        addFragment({ nodes, edges: [] });
      },

      connect(from, to) {
        if (from.nodeId === to.nodeId) return undefined;
        const edge: BoardEdge = {
          id: newId(),
          fromNode: from.nodeId,
          fromSide: from.anchor.side,
          fromEnd: 'none',
          fromOffset: from.anchor.offset,
          toNode: to.nodeId,
          toSide: to.anchor.side,
          toEnd: 'arrow',
          toOffset: to.anchor.offset,
          label: '',
          extra: {},
          elExtra: {},
        };
        const doc = get().doc;
        apply({ ...doc, edges: [...doc.edges, edge] });
        set({ selNodes: [], selEdges: [edge.id] });
        return edge.id;
      },

      reconnect(edgeId, end, nodeId, anchor) {
        const patch: Partial<BoardEdge> =
          end === 'from' ? { fromNode: nodeId, fromSide: anchor.side, fromOffset: anchor.offset } : { toNode: nodeId, toSide: anchor.side, toOffset: anchor.offset };
        get().updateEdge(edgeId, patch);
      },

      deleteSelection() {
        const { doc, selNodes, selEdges } = get();
        if (selNodes.length === 0 && selEdges.length === 0) return;
        const nodeIds = new Set(selNodes);
        const edgeIds = new Set(selEdges);
        const next: CanvasDoc = {
          ...doc,
          nodes: doc.nodes.filter((n) => !(isBoardNode(n) && nodeIds.has(n.id))),
          edges: doc.edges.filter((e) => !(isBoardEdge(e) && (edgeIds.has(e.id) || nodeIds.has(e.fromNode) || nodeIds.has(e.toNode)))),
        };
        set({ selNodes: [], selEdges: [], editing: null, labelEditing: null });
        apply(next);
      },

      deleteNode(id) {
        set({ selNodes: [id], selEdges: [] });
        get().deleteSelection();
      },

      deleteEdge(id) {
        set({ selNodes: [], selEdges: [id] });
        get().deleteSelection();
      },

      copyText() {
        const { doc, selNodes } = get();
        return buildFragment(doc, selNodes);
      },

      pasteText(text, viewCenter, at) {
        const mouseFlow = at ?? get().mouseFlow;
        const step = gridStep();
        const fragment = parseFragment(text);
        if (fragment) {
          const delta = mouseFlow
            ? deltaToPlace(fragment, mouseFlow, step)
            : { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET };
          addFragment(instantiate(fragment, delta));
          return;
        }
        if (text.trim() === '') return;
        const node = buildNode({ kind: 'sticky', center: mouseFlow ?? viewCenter, text });
        addFragment({ nodes: [node], edges: [] });
      },

      duplicateSelection() {
        const { doc, selNodes } = get();
        const text = buildFragment(doc, selNodes);
        const fragment = text ? parseFragment(text) : null;
        if (fragment) addFragment(instantiate(fragment, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }));
      },

      writeClipboard: (text) => post({ type: 'clipboardWrite', text }),
      readClipboard: () => request<string>((requestId) => ({ type: 'clipboardRead', requestId })),
      pickFile: () => request<string | undefined>((requestId) => ({ type: 'pickFile', requestId })),
      promptUrl: (initial) => request<string | undefined>((requestId) => ({ type: 'promptUrl', requestId, initial })),
      resolveDropped: (uris) => request<string[]>((requestId) => ({ type: 'resolveDroppedFiles', requestId, uris })),
      openFile: (path) => post({ type: 'openFile', path }),
      openUrl: (url) => post({ type: 'openUrl', url }),
      reopenAsText: () => post({ type: 'reopenAsText' }),
      watchFiles: (paths) => post({ type: 'watchFiles', paths }),

      beginFileEdit(nodeId) {
        const node = get().doc.nodes.find((n) => isBoardNode(n) && n.id === nodeId);
        if (!node || node.kind !== 'file') return;
        const existing = get().fileEdits[nodeId];
        if (existing) {
          set({ editing: { nodeId, field: 'body' } });
          return;
        }
        const file = get().files[node.file];
        if (!file || file.status !== 'ok') return;
        const text = file.text ?? '';
        set({
          editing: { nodeId, field: 'body' },
          fileEdits: { ...get().fileEdits, [nodeId]: { path: node.file, baseText: text, draft: text.replace(/\r\n/g, '\n'), conflict: false, saving: false } },
        });
      },

      setFileDraft(nodeId, draft) {
        const edit = get().fileEdits[nodeId];
        if (edit) set({ fileEdits: { ...get().fileEdits, [nodeId]: { ...edit, draft } } });
      },

      endFileEdit(nodeId) {
        const edit = get().fileEdits[nodeId];
        const editing = get().editing?.nodeId === nodeId ? null : get().editing;
        if (!edit) {
          set({ editing });
          return;
        }
        const fileEdits = { ...get().fileEdits };
        const unchanged = edit.draft === edit.baseText.replace(/\r\n/g, '\n');
        if (unchanged && !edit.conflict) {
          delete fileEdits[nodeId];
        } else if (!edit.conflict) {
          fileEdits[nodeId] = { ...edit, saving: true };
          post({ type: 'saveFile', path: edit.path, text: edit.draft, baseText: edit.baseText });
        }
        set({ editing, fileEdits });
      },

      reloadFile(nodeId) {
        const fileEdits = { ...get().fileEdits };
        delete fileEdits[nodeId];
        set({ fileEdits, editing: get().editing?.nodeId === nodeId ? null : get().editing });
      },

      overwriteFile(nodeId) {
        const edit = get().fileEdits[nodeId];
        if (!edit) return;
        set({
          fileEdits: { ...get().fileEdits, [nodeId]: { ...edit, saving: true, conflict: false } },
          editing: get().editing?.nodeId === nodeId ? null : get().editing,
        });
        post({ type: 'saveFile', path: edit.path, text: edit.draft, baseText: edit.baseText, force: true });
      },
    };
  });
}
