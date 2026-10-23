import { NodeResizeControl } from '@xyflow/react';
import { MIN_SIZE } from '../../../src/shared/canvasFormat';
import { useBoardStore } from '../useBoard';
import { ResizeIcon } from '../ui/icons';

/** Diagonal-lines resize indicator in the bottom-right corner. */
export function ResizeCorner({ id, square = false }: { id: string; square?: boolean }) {
  const store = useBoardStore();
  return (
    <NodeResizeControl
      position="bottom-right"
      minWidth={MIN_SIZE}
      minHeight={MIN_SIZE}
      keepAspectRatio={square}
      className="eb-resize nodrag"
      style={{ background: 'transparent', border: 'none' }}
      onResize={(_e, p) => store.getState().resizeNode(id, p.width, p.height)}
      onResizeEnd={() => store.getState().finishResize(id)}
    >
      <ResizeIcon />
    </NodeResizeControl>
  );
}
