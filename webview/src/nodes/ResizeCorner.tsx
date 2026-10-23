import { NodeResizeControl, useStoreApi } from '@xyflow/react';
import { MIN_SIZE, boardNodes } from '../../../src/shared/canvasFormat';
import { GRID_STEP } from '../store';
import { snapResize, intersects } from '../snapping';
import { useBoardStore } from '../useBoard';
import { ResizeIcon } from '../ui/icons';

/** Diagonal-lines resize indicator in the bottom-right corner. */
export function ResizeCorner({ id, square = false }: { id: string; square?: boolean }) {
  const store = useBoardStore();
  const flow = useStoreApi();

  /** Snap the raw size from React Flow to other objects' edges (or the grid) and apply it. */
  const resize = (event: { sourceEvent?: Event }, width: number, height: number) => {
    const api = store.getState();
    const node = boardNodes(api.doc).find((n) => n.id === id);
    if (!node) return;
    const { width: viewWidth, height: viewHeight, transform } = flow.getState();
    const zoom = transform[2];
    const visible = { x: -transform[0] / zoom, y: -transform[1] / zoom, width: viewWidth / zoom, height: viewHeight / zoom };
    const targets = boardNodes(api.doc).filter((n) => n.id !== id && intersects(visible, n));
    const key = event.sourceEvent as MouseEvent | undefined;
    const result = snapResize({
      box: { x: node.x, y: node.y, width, height },
      targets,
      zoom,
      objects: !(key?.ctrlKey || key?.metaKey),
      gridStep: api.settings.gridEnabled ? GRID_STEP : undefined,
      square,
      min: MIN_SIZE,
    });
    api.resizeNode(id, result.width, result.height);
    api.setSnapGuides(result.guides);
  };

  return (
    <NodeResizeControl
      position="bottom-right"
      minWidth={MIN_SIZE}
      minHeight={MIN_SIZE}
      keepAspectRatio={square}
      className="eb-resize nodrag"
      style={{ background: 'transparent', border: 'none' }}
      onResize={(e, p) => resize(e, p.width, p.height)}
      onResizeEnd={() => store.getState().finishResize()}
    >
      <ResizeIcon />
    </NodeResizeControl>
  );
}
