import type { ConnectionLineComponentProps } from '@xyflow/react';
import type { Side } from '../../../src/shared/canvasFormat';
import { curveBetween } from '../geometry';

/** Temporary line while dragging from a ball. Same look as a finished line. */
export function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }: ConnectionLineComponentProps) {
  const curve = curveBetween({ x: fromX, y: fromY }, fromPosition as Side, { x: toX, y: toY }, toPosition as Side);
  return <path d={curve.path} className="eb-connection-line" fill="none" markerEnd="url(#eb-arrow)" />;
}
