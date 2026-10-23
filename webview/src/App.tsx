import { useCallback, useEffect, useMemo, useRef, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { boardNodes, drawableEdges, isBoardNode, type Side } from '../../src/shared/canvasFormat';
import { GRID_STEP } from './store';
import { CLIPBOARD_MIME } from './clipboard';
import { hitTest, nearestBorderAnchor, type Point } from './geometry';
import { useBoard, useBoardStore } from './useBoard';
import { loadViewState, saveViewState } from './vscodeApi';
import { StickyNode } from './nodes/StickyNode';
import { RectangleNode } from './nodes/RectangleNode';
import { FileNode } from './nodes/FileNode';
import { LinkNode } from './nodes/LinkNode';
import { CurvedEdge, type CurvedRFEdge } from './edges/CurvedEdge';
import { ConnectionLine } from './edges/ConnectionLine';
import { LeftToolbar } from './ui/LeftToolbar';
import { ZoomControls } from './ui/ZoomControls';
import { NewObjectChooser } from './ui/NewObjectChooser';
import { ContextMenu } from './ui/ContextMenu';

const nodeTypes = { sticky: StickyNode, rectangle: RectangleNode, file: FileNode, link: LinkNode };
const edgeTypes = { curved: CurvedEdge };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

const isTextField = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

export function App() {
  const ready = useBoard((s) => s.ready);
  if (!ready) return <div className="eb-loading" />;
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}

function ArrowMarkers() {
  return (
    <svg className="eb-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <marker id="eb-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1 1.5L10.5 6L1 10.5z" fill="#1A1A1A" stroke="#1A1A1A" strokeWidth="1" strokeLinejoin="round" />
        </marker>
      </defs>
    </svg>
  );
}

function Board() {
  const store = useBoardStore();
  const rf = useReactFlow();
  const rootRef = useRef<HTMLDivElement>(null);
  const savedViewport = useMemo(() => loadViewState().viewport, []);

  const doc = useBoard((s) => s.doc);
  const selNodes = useBoard((s) => s.selNodes);
  const selEdges = useBoard((s) => s.selEdges);
  const editingId = useBoard((s) => s.editing?.nodeId ?? null);
  const gridEnabled = useBoard((s) => s.settings.gridEnabled);
  const tool = useBoard((s) => s.tool);
  const parseError = useBoard((s) => s.parseError);
  const dropHint = useBoard((s) => s.dropHint);

  const viewCenter = useCallback((): Point => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 });
  }, [rf]);

  const origin = () => {
    const r = rootRef.current?.getBoundingClientRect();
    return { left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  // --- Derived React Flow state ------------------------------------------------------------

  const nodes = useMemo<Node[]>(() => {
    const selected = new Set(selNodes);
    return boardNodes(doc).map((n) => ({
      id: n.id,
      type: n.kind,
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      // Without `measured`, React Flow drops the handle bounds on every update and lines flicker.
      measured: { width: n.width, height: n.height },
      data: { model: n },
      selected: selected.has(n.id),
      draggable: editingId !== n.id,
    }));
  }, [doc, selNodes, editingId]);

  const edges = useMemo<CurvedRFEdge[]>(() => {
    const rects = new Map(boardNodes(doc).map((n) => [n.id, n]));
    const selected = new Set(selEdges);
    return drawableEdges(doc).map((e) => ({
      id: e.id,
      type: 'curved',
      source: e.fromNode,
      target: e.toNode,
      sourceHandle: e.fromSide,
      targetHandle: e.toSide,
      selected: selected.has(e.id),
      data: { model: e, fromRect: rects.get(e.fromNode)!, toRect: rects.get(e.toNode)! },
    }));
  }, [doc, selEdges]);

  const watchedPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const n of boardNodes(doc)) if (n.kind === 'file' && n.file !== '') paths.add(n.file);
    return [...paths].sort();
  }, [doc]);
  const watchedKey = watchedPaths.join('\n');
  useEffect(() => {
    store.getState().watchFiles(watchedPaths);
    // `watchedKey` is the identity of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, watchedKey]);

  // --- React Flow change handlers ----------------------------------------------------------

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const api = store.getState();
      const sel = new Set(api.selNodes);
      let selChanged = false;
      const moves: { id: string; x: number; y: number }[] = [];
      for (const c of changes) {
        if (c.type === 'select') {
          if (c.selected) sel.add(c.id);
          else sel.delete(c.id);
          selChanged = true;
        } else if (c.type === 'position' && c.position) {
          moves.push({ id: c.id, x: c.position.x, y: c.position.y });
        }
      }
      if (moves.length > 0) api.moveNodes(moves);
      if (selChanged) api.setSelection([...sel], api.selEdges);
    },
    [store],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const api = store.getState();
      const sel = new Set(api.selEdges);
      let selChanged = false;
      for (const c of changes) {
        if (c.type === 'select') {
          if (c.selected) sel.add(c.id);
          else sel.delete(c.id);
          selChanged = true;
        }
      }
      if (selChanged) api.setSelection(api.selNodes, [...sel]);
    },
    [store],
  );

  const commit = useCallback(() => store.getState().commit(), [store]);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const from = state.fromNode;
      const handle = state.fromHandle;
      if (!from || !handle) return;
      const touch = 'changedTouches' in event ? event.changedTouches[0] : event;
      const screen = { x: touch.clientX, y: touch.clientY };
      const target = (touch === event ? event.target : document.elementFromPoint(screen.x, screen.y)) as Element | null;
      if (target?.closest('.eb-ui')) return;

      const api = store.getState();
      const flow = rf.screenToFlowPosition(screen);
      const side = handle.id as Side;
      const hit = hitTest(boardNodes(api.doc), flow);
      if (hit) {
        if (hit.id === from.id) return;
        api.connect({ nodeId: from.id, anchor: { side, offset: 0.5 } }, { nodeId: hit.id, anchor: nearestBorderAnchor(hit, flow, rf.getZoom()) });
      } else {
        api.setChooser({ at: flow, screen, sourceNodeId: from.id, sourceSide: side, sourceOffset: 0.5 });
      }
    },
    [rf, store],
  );

  // Lines are only created in onConnectEnd: dropping on a ball must not create a second one.
  const onConnect = useCallback((_c: Connection) => {}, []);

  /** With an object tool active, a click anywhere on the board (also on an object) places a new object. */
  const placeWithTool = useCallback(
    (event: React.MouseEvent) => {
      const api = store.getState();
      const kind = api.tool;
      if (kind === 'select') return false;
      const at = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      void (async () => {
        if (kind === 'sticky' || kind === 'rectangle') {
          api.createNode({ kind, center: at });
        } else if (kind === 'file') {
          const file = await api.pickFile();
          if (file) api.createNode({ kind, center: at, file });
          else api.setTool('select');
        } else if (kind === 'link') {
          const url = await api.promptUrl();
          if (url) api.createNode({ kind, center: at, url });
          else api.setTool('select');
        }
      })();
      return true;
    },
    [rf, store],
  );

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const api = store.getState();
      api.setContextMenu(null);
      if (placeWithTool(event)) return;
      api.setEditing(null);
      api.setLabelEditing(null);
    },
    [placeWithTool, store],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const api = store.getState();
      api.setContextMenu(null);
      if (placeWithTool(event)) return;
      if (api.editing && api.editing.nodeId !== node.id) api.setEditing(null);
    },
    [placeWithTool, store],
  );

  const showMenu = (event: React.MouseEvent, target: { kind: 'node' | 'edge'; id: string } | { kind: 'board' }) => {
    event.preventDefault();
    const api = store.getState();
    if (target.kind === 'node' && !api.selNodes.includes(target.id)) api.setSelection([target.id], []);
    if (target.kind === 'edge' && !api.selEdges.includes(target.id)) api.setSelection([], [target.id]);
    api.setContextMenu({
      screen: { x: event.clientX, y: event.clientY },
      flow: rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      target,
    });
  };

  // --- Wheel: mouse wheel zooms, trackpad scroll pans, pinch zooms -------------------------

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let saveTimer: number | undefined;
    const persist = (viewport: Viewport) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveViewState({ viewport }), 200);
    };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element | null)?.closest('.nowheel')) return;
      e.preventDefault();
      e.stopPropagation();
      const vp = rf.getViewport();
      const trackpadScroll = !e.ctrlKey && e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY));
      let next: Viewport;
      if (trackpadScroll) {
        next = { x: vp.x - e.deltaX, y: vp.y - e.deltaY, zoom: vp.zoom };
      } else {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const delta = e.ctrlKey ? Math.max(-50, Math.min(50, e.deltaY)) : e.deltaY * (e.deltaMode === 1 ? 33 : 1);
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015))));
        const k = zoom / vp.zoom;
        next = { x: px - (px - vp.x) * k, y: py - (py - vp.y) * k, zoom };
      }
      void rf.setViewport(next);
      persist(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true });
      window.clearTimeout(saveTimer);
    };
  }, [rf]);

  // --- Keyboard and clipboard --------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const api = store.getState();
      if (e.key === 'Escape') {
        if (api.endpointDrag) api.setEndpointDrag(null);
        else if (api.contextMenu) api.setContextMenu(null);
        else if (api.chooser) api.setChooser(null);
        else if (api.editing) api.setEditing(null);
        else if (api.tool !== 'select') api.setTool('select');
        return;
      }
      if (isTextField(e.target) || api.editing || api.labelEditing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        api.deleteSelection();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        api.duplicateSelection();
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      const api = store.getState();
      if (isTextField(e.target) || api.editing) return;
      const text = api.copyText();
      if (!text || !e.clipboardData) return;
      e.clipboardData.setData(CLIPBOARD_MIME, text);
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      const api = store.getState();
      if (isTextField(e.target) || api.editing || !e.clipboardData) return;
      const text = e.clipboardData.getData(CLIPBOARD_MIME) || e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      api.pasteText(text, viewCenter());
    };
    // A tab switch destroys the webview: finish any text edit first so it is not lost.
    const onVisibility = () => {
      if (document.hidden) {
        const api = store.getState();
        api.setEditing(null);
        api.setLabelEditing(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [store, viewCenter]);

  // --- Mouse position (for paste) and drops from the Explorer ------------------------------

  const onPointerMove = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('.eb-ui')) {
      store.getState().setMouseFlow(null);
      return;
    }
    store.getState().setMouseFlow(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const uriList = (e: DragEvent): string | undefined => {
    const dt = e.dataTransfer;
    return dt.getData('application/vnd.code.uri-list') || dt.getData('text/uri-list') || undefined;
  };
  const hasUris = (e: DragEvent) => Array.from(e.dataTransfer.types).some((t) => t === 'application/vnd.code.uri-list' || t === 'text/uri-list');

  const onDragOver = (e: DragEvent) => {
    if (!hasUris(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    store.getState().setDropHint(true);
  };
  const onDrop = (e: DragEvent) => {
    store.getState().setDropHint(false);
    const list = uriList(e);
    if (!list) return;
    e.preventDefault();
    const uris = list
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    void store
      .getState()
      .resolveDropped(uris)
      .then((paths) => store.getState().createFileNodes(paths, at));
  };

  const persistViewport = useCallback((_e: unknown, viewport: Viewport) => saveViewState({ viewport }), []);

  return (
    <div
      ref={rootRef}
      className={`eb-board${tool !== 'select' ? ' eb-tool-active' : ''}`}
      data-vscode-context='{"preventDefaultContextMenuItems": true}'
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={onPointerMove}
      onPointerLeave={() => store.getState().setMouseFlow(null)}
      onDragOver={onDragOver}
      onDragLeave={() => store.getState().setDropHint(false)}
      onDrop={onDrop}
    >
      <ArrowMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={ConnectionLine}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!savedViewport && doc.nodes.some(isBoardNode)}
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        snapToGrid={gridEnabled}
        snapGrid={[GRID_STEP, GRID_STEP]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode="Shift"
        zoomOnScroll={false}
        panOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        elevateNodesOnSelect={false}
        disableKeyboardA11y
        attributionPosition="bottom-left"
        onNodeDragStop={commit}
        onSelectionDragStop={commit}
        onSelectionStart={() => store.getState().setEditing(null)}
        onMoveEnd={persistViewport}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onEdgeDoubleClick={(_e, edge) => store.getState().setLabelEditing(edge.id)}
        onNodeContextMenu={(e, node) => showMenu(e, { kind: 'node', id: node.id })}
        onEdgeContextMenu={(e, edge) => showMenu(e, { kind: 'edge', id: edge.id })}
        onPaneContextMenu={(e) => showMenu(e as unknown as React.MouseEvent, { kind: 'board' })}
      >
        {gridEnabled && <Background variant={BackgroundVariant.Lines} gap={GRID_STEP} color="#EDEDED" lineWidth={1} />}
        <LeftToolbar />
        <ZoomControls />
      </ReactFlow>
      <NewObjectChooser origin={origin()} />
      <ContextMenu origin={origin()} viewCenter={viewCenter} />
      {dropHint && <div className="eb-drop-hint">Hold Shift to drop files onto the board</div>}
      {parseError !== null && (
        <div className="eb-error">
          <div className="eb-error-card">
            <strong>Cannot read this board: {parseError}</strong>
            <button type="button" onClick={() => store.getState().reopenAsText()}>
              Open as text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
